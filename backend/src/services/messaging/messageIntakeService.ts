/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPostgresPool } from '../../config/postgres.js';
import { 
  MessageEnvelope, 
  MessageIntent, 
  SupportedMessageChannel, 
  TeamChannelConfiguration, 
  PersonalChannelConfiguration 
} from '../../models/messageTypes.js';
import { repo } from '../../store/repository.js';
import { postgresRepo } from '../../store/postgresRepo.js';
import { escalationService } from '../escalationService.js';
import { approvalService } from '../approvalService.js';
import { outboundDispatchService } from './outboundDispatchService.js';
import { stagingService } from './stagingService.js';
import { eventService } from '../events.js';
import { Issue, ChatMessage } from '../../types.js';

export interface ProcessMessageResult {
  messageId: string;
  dedupeKey: string;
  status: 'PROCESSED' | 'DUPLICATE_IGNORED' | 'FAILED';
  intent: MessageIntent;
  resolvedUserId?: string;
  resolvedTeamId?: string;
  createdIssueId?: string;
  linkedIssueId?: string;
  commandExecuted?: boolean;
  replyMessageId?: string;
  replyText?: string;
  error?: string;
}

export class MessageIntakeService {
  /**
   * Main entrypoint for processing any canonical MessageEnvelope.
   * Enforces 64-bit cryptographic advisory locking to prevent race conditions.
   */
  async processEnvelope(envelope: MessageEnvelope): Promise<ProcessMessageResult> {
    const pool = getPostgresPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN;');

      // 1. 64-Bit Cryptographic Advisory Lock derived from dedupeKey
      const lockKey = envelope.dedupeKey;
      await client.query(
        `SELECT pg_advisory_xact_lock(('x' || substr(md5($1), 1, 16))::bit(64)::bigint);`,
        [lockKey]
      );

      // 2. Check if dedupeKey already exists
      const existingRes = await client.query(
        `SELECT id, status, intent, linked_issue_id FROM incoming_messages WHERE dedupe_key = $1;`,
        [envelope.dedupeKey]
      );

      if (existingRes.rows.length > 0) {
        await client.query('COMMIT;');
        const row = existingRes.rows[0];
        console.log(`[MessageIntakeService] Duplicate message suppressed for key: ${envelope.dedupeKey}`);
        return {
          messageId: row.id,
          dedupeKey: envelope.dedupeKey,
          status: 'DUPLICATE_IGNORED',
          intent: row.intent,
          linkedIssueId: row.linked_issue_id
        };
      }

      // 3. Resolve Channel Identities (Personal vs Team)
      const { resolvedUserId, resolvedTeamId } = await this.resolveIdentities(
        client,
        envelope.sourceChannel,
        envelope.senderAddress
      );

      envelope.personId = resolvedUserId || envelope.personId;
      envelope.teamId = resolvedTeamId || envelope.teamId;

      // 4. Classify Intent
      const intent = this.classifyIntent(envelope);
      envelope.intent = intent;

      // 5. Detect linked issue (if mentioned in text or conversationId)
      let linkedIssueId = await this.resolveLinkedIssue(client, envelope);

      // 6. Insert into incoming_messages log
      const insertSql = `
        INSERT INTO incoming_messages (
          id, channel, source_message_id, conversation_id, thread_id,
          sender_address, sender_name, sender_type, resolved_user_id,
          resolved_team_id, intent, priority, text_body, html_body,
          raw_payload, status, dedupe_key, linked_issue_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'PROCESSED', $16, $17, NOW())
        RETURNING *;
      `;

      await client.query(insertSql, [
        envelope.messageId,
        envelope.sourceChannel,
        envelope.sourceMessageId,
        envelope.conversationId || null,
        envelope.threadId || null,
        envelope.senderAddress,
        envelope.senderName || 'External Operator',
        envelope.senderType,
        envelope.personId || resolvedUserId || null,
        envelope.teamId || resolvedTeamId || null,
        intent,
        envelope.priority || 'normal',
        envelope.textBody || '',
        envelope.htmlBody || null,
        JSON.stringify(envelope.rawPayload || {}),
        envelope.dedupeKey,
        linkedIssueId || null
      ]);

      // 7. Store attachments if any
      if (envelope.attachments && envelope.attachments.length > 0) {
        for (const att of envelope.attachments) {
          await client.query(
            `INSERT INTO message_attachments (
              id, message_id, filename, mime_type, size_bytes, storage_path, checksum, content_type, ingestion_status, parsed_data, raw_base64, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW());`,
            [
              att.id,
              envelope.messageId,
              att.filename,
              att.mimeType,
              att.sizeBytes || 0,
              att.storagePath || null,
              att.checksum || null,
              att.contentType,
              att.ingestionStatus || 'NONE',
              att.parsedData ? JSON.stringify(att.parsedData) : null,
              att.rawBase64 || null
            ]
          );
        }
      }

      await client.query('COMMIT;');

      // 8. Execute Business Logic based on Intent
      const result = await this.executeIntentAction(envelope, intent, linkedIssueId, resolvedUserId, resolvedTeamId);
      return result;

    } catch (err: any) {
      await client.query('ROLLBACK;');
      console.error('[MessageIntakeService] Error processing envelope:', err);
      return {
        messageId: envelope.messageId,
        dedupeKey: envelope.dedupeKey,
        status: 'FAILED',
        intent: 'FOLLOW_UP',
        error: err.message
      };
    } finally {
      client.release();
    }
  }

  /**
   * Resolves whether sender matches personal or team configurations.
   */
  private async resolveIdentities(
    client: any,
    channel: SupportedMessageChannel,
    address: string
  ): Promise<{ resolvedUserId?: string; resolvedTeamId?: string }> {
    const cleanAddr = address.trim().toLowerCase();

    // Check personal identities
    const personalRes = await client.query(
      `SELECT user_id FROM personal_channel_configurations 
       WHERE channel = $1 AND LOWER(address) = $2 AND is_active = true 
       LIMIT 1;`,
      [channel, cleanAddr]
    );

    let resolvedUserId: string | undefined = personalRes.rows[0]?.user_id;

    // Check team identities
    const teamRes = await client.query(
      `SELECT team_id FROM team_channel_configurations 
       WHERE channel = $1 AND LOWER(address) = $2 AND is_active = true 
       LIMIT 1;`,
      [channel, cleanAddr]
    );

    let resolvedTeamId: string | undefined = teamRes.rows[0]?.team_id;

    // If user resolved but no team, infer user's permanent team
    if (resolvedUserId && !resolvedTeamId) {
      const user = await repo.getUserById(resolvedUserId);
      if (user?.permanentTeamId) {
        resolvedTeamId = user.permanentTeamId;
      }
    }

    return { resolvedUserId, resolvedTeamId };
  }

  /**
   * Classifies message into actionable operational intents.
   */
  classifyIntent(envelope: MessageEnvelope): MessageIntent {
    const text = (envelope.textBody || '').toLowerCase();
    const hasAttachments = envelope.attachments && envelope.attachments.length > 0;

    // 1. Structured action commands
    if (text.includes('@approve') || text.includes('approval') || text.includes('approve proposal') || text.includes('@request_approval')) {
      return 'APPROVAL_REQUEST';
    }
    if (text.includes('@escalate') || text.includes('escalate to') || text.includes('escalate issue')) {
      return 'TEAM_ESCALATION';
    }
    if (text.includes('status of') || text.includes('check status') || text.includes('what is the status')) {
      return 'REQUEST_STATUS_UPDATE';
    }

    // 2. Attachment-driven requests
    if (hasAttachments) {
      const hasSpreadsheet = envelope.attachments!.some(a => a.contentType === 'spreadsheet');
      if (hasSpreadsheet || text.includes('import') || text.includes('reconcile') || text.includes('dataset')) {
        return 'ATTACHMENT_TASK';
      }
      return 'REQUEST_CREATE_TASK';
    }

    // 3. Task creation keywords
    if (text.includes('create task') || text.includes('new issue') || text.includes('file discrepancy') || text.includes('investigate')) {
      return 'REQUEST_CREATE_TASK';
    }

    return 'FOLLOW_UP';
  }

  /**
   * Resolves linked issue ID from message text (#ISS-105, #105, iss-105) or metadata.
   */
  private async resolveLinkedIssue(client: any, envelope: MessageEnvelope): Promise<string | undefined> {
    const text = envelope.textBody || '';
    const match = text.match(/#(ISS[-_]?[0-9a-zA-Z]+|[0-9a-zA-Z_-]{5,32})/i) || text.match(/\b(ISS[-_]?[0-9]+)\b/i);
    
    if (match) {
      const potentialId = match[1].toUpperCase();
      const res = await client.query(`SELECT id FROM issues WHERE id ILIKE $1 OR id ILIKE $2 LIMIT 1;`, [
        potentialId,
        `%${potentialId}%`
      ]);
      if (res.rows.length > 0) {
        return res.rows[0].id;
      }
    }

    if (envelope.metadata?.linkedIssueId) {
      return envelope.metadata.linkedIssueId;
    }

    return undefined;
  }

  /**
   * Executes business actions based on intent.
   */
  private async executeIntentAction(
    envelope: MessageEnvelope,
    intent: MessageIntent,
    linkedIssueId?: string,
    resolvedUserId?: string,
    resolvedTeamId?: string
  ): Promise<ProcessMessageResult> {
    let createdIssueId: string | undefined;
    let replyText = '';
    let commandExecuted = false;

    // A. APPROVAL REQUEST / APPROVE INSTRUCTION
    if (intent === 'APPROVAL_REQUEST') {
      const text = envelope.textBody || '';
      const match = text.match(/(prop-[a-zA-Z0-9_-]+|res-req-[a-zA-Z0-9_-]+)/i);

      if (match) {
        const proposalId = match[1];
        try {
          if (!resolvedUserId) {
            throw new Error(`Unauthenticated external sender. Please register your ${envelope.sourceChannel} address in personal channel settings.`);
          }

          const action = text.toLowerCase().includes('reject') ? 'REJECT' : 'APPROVE';
          const reviewed = await approvalService.reviewProposal({
            id: proposalId,
            checkerId: resolvedUserId,
            checkerName: envelope.senderName || 'External Supervisor',
            action,
            reason: `Reviewed via ${envelope.sourceChannel.toUpperCase()}: ${envelope.textBody}`
          });

          replyText = `Proposal ${proposalId} has been successfully ${reviewed.status} by ${reviewed.checkerName}.`;
          commandExecuted = true;
        } catch (err: any) {
          replyText = `Approval action rejected: ${err.message}`;
          console.warn(`[MessageIntakeService] Approval rejected for ${proposalId}:`, err.message);
        }
      } else {
        replyText = `Please provide a valid proposal ID (e.g. prop-... or res-req-...) to execute approval.`;
      }
    }

    // B. TEAM ESCALATION
    else if (intent === 'TEAM_ESCALATION') {
      if (linkedIssueId) {
        const issue = await repo.getIssueById(linkedIssueId);
        if (issue) {
          // Parse target team if specified (e.g., "@escalate_issue team-cards urgent settlement")
          const parts = (envelope.textBody || '').split(/\s+/);
          const targetTeamId = parts.find(p => p.startsWith('team-')) || resolvedTeamId || 'team-settlement-01';
          const reason = envelope.textBody || 'Escalated via external communication channel';

          const res = await escalationService.executeActionCommand({
            actionType: 'ESCALATE_ISSUE',
            issueId: issue.id,
            targetTeamId,
            actorId: resolvedUserId || 'channel-bot',
            actorName: envelope.senderName || 'External Requester',
            reason,
            idempotencyKey: `esc_${envelope.dedupeKey}`
          });

          replyText = `Issue ${issue.id} escalated to team '${targetTeamId}'. Event registered: ${res.event.id}`;
          commandExecuted = true;
        }

      } else {
        replyText = `Team escalation noted, but no issue reference was detected. Please include #ISSUE_ID.`;
      }
    }

    // C. STATUS UPDATE REQUEST
    else if (intent === 'REQUEST_STATUS_UPDATE') {
      if (linkedIssueId) {
        const issue = await repo.getIssueById(linkedIssueId);
        if (issue) {
          replyText = `Status for Issue ${issue.id} ("${issue.title}"): ${issue.status} [Priority: ${issue.priority}]. Assigned to: ${issue.assignedTechUserName || 'Unassigned'}.`;
        } else {
          replyText = `Issue ${linkedIssueId} was not found in the system.`;
        }
      } else {
        replyText = `Please specify the issue ID (e.g., #ISS-105) to check status.`;
      }
    }

    // D. TASK CREATION / ATTACHMENT INGESTION
    else if (intent === 'REQUEST_CREATE_TASK' || intent === 'ATTACHMENT_TASK') {
      const issueTitle = (envelope.textBody || 'External Ingestion Task').substring(0, 100);
      const effectiveTeam = resolvedTeamId || 'team-settlement-01';
      const effectiveCreator = resolvedUserId || 'usr-external-channel';

      // Extract tabular records from attachments if present
      let extractedRows: Record<string, any>[] = [];
      let detectedHeaders: string[] = [];

      if (envelope.attachments && envelope.attachments.length > 0) {
        for (const att of envelope.attachments) {
          const rows = att.parsedData?.tabularRows || att.parsedData?.sampleRows;
          if (Array.isArray(rows) && rows.length > 0) {
            extractedRows = extractedRows.concat(rows);
          }
          const headers = att.parsedData?.sampleHeaders || att.parsedData?.tabularHeaders;
          if (Array.isArray(headers) && headers.length > 0) {
            detectedHeaders = Array.from(new Set([...detectedHeaders, ...headers]));
          }
        }
      }

      const newIssue: Issue = {
        id: `ISS-${Date.now().toString().slice(-6)}`,
        title: issueTitle,
        description: `Ingested via ${envelope.sourceChannel.toUpperCase()} from ${envelope.senderName || envelope.senderAddress}.\n\nContent:\n${envelope.textBody}`,
        status: 'Open',
        priority: envelope.priority === 'critical' ? 'Critical' : 'Medium',
        creatorId: effectiveCreator,
        creatorName: envelope.senderName || 'External Sender',
        createdAt: new Date().toISOString(),
        type: envelope.attachments && envelope.attachments.length > 0 ? 'file' : 'single',
        teamId: effectiveTeam,
        visibility: 'TEAM_PUBLIC',
        uploadedFileName: envelope.attachments?.[0]?.filename,
        uploadedFileHeaders: detectedHeaders.length > 0 ? detectedHeaders : undefined,
        firstLevelMappedData: extractedRows.length > 0 ? extractedRows : undefined,
        datasetStatus: extractedRows.length > 0 ? 'READY' : (envelope.attachments && envelope.attachments.length > 0 ? 'PENDING_MAPPING' : 'NONE'),
        transactionCount: extractedRows.length,
        attachments: envelope.attachments || [],
        chat: []
      };

      const saved = await repo.createIssue(newIssue);
      createdIssueId = saved.id;
      linkedIssueId = saved.id;
      replyText = `Task created successfully: #${saved.id} ("${saved.title}"). Status: ${saved.status}. View in workspace.`;
    }

    // E. GENERAL FOLLOW-UP / SYNC TO CHAT
    if (linkedIssueId) {
      try {
        const chatMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          senderId: resolvedUserId || 'channel-sender',
          senderName: `${envelope.senderName || envelope.senderAddress} (${envelope.sourceChannel.toUpperCase()})`,
          senderRole: 'operational',
          text: envelope.textBody || '',
          timestamp: new Date().toISOString()
        };
        await repo.addIssueChat(linkedIssueId, chatMsg);
        eventService.broadcastEvent('issue:chat_updated', { issueId: linkedIssueId, message: chatMsg });
      } catch (err: any) {
        console.warn(`[MessageIntakeService] Could not append to chat for issue ${linkedIssueId}:`, err.message);
      }
    }

    // 9. Send Outbound Channel Reply
    let replyMessageId: string | undefined;
    if (replyText) {
      replyMessageId = await outboundDispatchService.enqueueMessage({
        to: envelope.senderAddress,
        channel: envelope.sourceChannel,
        subject: `Re: ${envelope.metadata?.subject || 'Back-Office Workflow Notification'}`,
        body: replyText,
        linkedIssueId,
        linkedMessageId: envelope.messageId
      });
    }

    // 10. Automatically stage inbound customer requests in external request queue
    try {
      const staged = await stagingService.stageInboundEnvelope(envelope);
      if (createdIssueId && staged) {
        const pool = getPostgresPool();
        await pool.query(
          `UPDATE staged_messages 
           SET status = 'CONVERTED_TO_TASK', created_issue_id = $1, updated_at = NOW() 
           WHERE id = $2;`,
          [createdIssueId, staged.id]
        );
      }
    } catch (stagingErr: any) {
      console.warn(`[MessageIntakeService] Warning: Failed to stage message in external queue: ${stagingErr.message}`);
    }

    return {
      messageId: envelope.messageId,
      dedupeKey: envelope.dedupeKey,
      status: 'PROCESSED',
      intent,
      resolvedUserId,
      resolvedTeamId,
      createdIssueId,
      linkedIssueId,
      commandExecuted,
      replyMessageId,
      replyText
    };
  }

  /**
   * Channel Configuration Management
   */
  async getTeamConfigurations(teamId: string): Promise<TeamChannelConfiguration[]> {
    const pool = getPostgresPool();
    const res = await pool.query(
      `SELECT * FROM team_channel_configurations WHERE team_id = $1 ORDER BY created_at DESC;`,
      [teamId]
    );
    return res.rows.map(r => ({
      id: r.id,
      teamId: r.team_id,
      channel: r.channel,
      displayName: r.display_name,
      address: r.address,
      isPrimary: r.is_primary,
      isActive: r.is_active,
      webhookSecret: r.webhook_secret,
      permissions: r.permissions || ['read', 'reply', 'create_task', 'escalate'],
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  async saveTeamConfiguration(config: Partial<TeamChannelConfiguration>): Promise<TeamChannelConfiguration> {
    const pool = getPostgresPool();
    const id = config.id || `tcfg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const sql = `
      INSERT INTO team_channel_configurations (
        id, team_id, channel, display_name, address, is_primary, is_active,
        webhook_secret, permissions, created_by, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        address = EXCLUDED.address,
        is_primary = EXCLUDED.is_primary,
        is_active = EXCLUDED.is_active,
        webhook_secret = EXCLUDED.webhook_secret,
        permissions = EXCLUDED.permissions,
        updated_at = NOW()
      RETURNING *;
    `;

    const res = await pool.query(sql, [
      id,
      config.teamId,
      config.channel,
      config.displayName || `${config.channel} Identity`,
      config.address,
      config.isPrimary || false,
      config.isActive !== false,
      config.webhookSecret || null,
      JSON.stringify(config.permissions || ['read', 'reply', 'create_task', 'escalate']),
      config.createdBy || 'admin'
    ]);

    const r = res.rows[0];
    return {
      id: r.id,
      teamId: r.team_id,
      channel: r.channel,
      displayName: r.display_name,
      address: r.address,
      isPrimary: r.is_primary,
      isActive: r.is_active,
      webhookSecret: r.webhook_secret,
      permissions: r.permissions,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  async getPersonalConfigurations(userId: string): Promise<PersonalChannelConfiguration[]> {
    const pool = getPostgresPool();
    const res = await pool.query(
      `SELECT * FROM personal_channel_configurations WHERE user_id = $1 ORDER BY created_at DESC;`,
      [userId]
    );
    return res.rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      channel: r.channel,
      displayName: r.display_name,
      address: r.address,
      isDefault: r.is_default,
      isActive: r.is_active,
      notificationMode: r.notification_mode,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  async savePersonalConfiguration(config: Partial<PersonalChannelConfiguration>): Promise<PersonalChannelConfiguration> {
    const pool = getPostgresPool();
    const id = config.id || `pcfg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const sql = `
      INSERT INTO personal_channel_configurations (
        id, user_id, channel, display_name, address, is_default, is_active,
        notification_mode, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        address = EXCLUDED.address,
        is_default = EXCLUDED.is_default,
        is_active = EXCLUDED.is_active,
        notification_mode = EXCLUDED.notification_mode,
        updated_at = NOW()
      RETURNING *;
    `;

    const res = await pool.query(sql, [
      id,
      config.userId,
      config.channel,
      config.displayName || `${config.channel} Account`,
      config.address,
      config.isDefault || false,
      config.isActive !== false,
      config.notificationMode || 'all'
    ]);

    const r = res.rows[0];
    return {
      id: r.id,
      userId: r.user_id,
      channel: r.channel,
      displayName: r.display_name,
      address: r.address,
      isDefault: r.is_default,
      isActive: r.is_active,
      notificationMode: r.notification_mode,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  async getRecentIncomingMessages(limit = 50, teamId?: string, issueId?: string): Promise<any[]> {
    const pool = getPostgresPool();
    let sql = `SELECT * FROM incoming_messages`;
    const params: any[] = [];
    const wheres: string[] = [];

    if (teamId) {
      wheres.push(`resolved_team_id = $${params.length + 1}`);
      params.push(teamId);
    }
    if (issueId) {
      wheres.push(`linked_issue_id = $${params.length + 1}`);
      params.push(issueId);
    }

    if (wheres.length > 0) {
      sql += ` WHERE ` + wheres.join(' AND ');
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const res = await pool.query(sql, params);
    return res.rows;
  }

  /**
   * Aggregated Team Mailbox with Thread Awareness, Inbound & Outbound collation,
   * Attachments, and Task Creation Status.
   */
  async getTeamMailbox(
    teamId: string,
    filter: 'all' | 'inbound' | 'outbound' | 'unassigned' = 'all',
    search?: string
  ): Promise<{
    threads: any[];
    totalThreads: number;
    unreadCount: number;
    unassignedCount: number;
  }> {
    const pool = getPostgresPool();

    // 1. Fetch incoming messages for this team
    const inRes = await pool.query(
      `SELECT 
        id, channel, source_message_id, conversation_id, thread_id,
        sender_address, sender_name, sender_type, resolved_user_id,
        resolved_team_id, intent, priority, text_body, html_body,
        raw_payload, status, dedupe_key, linked_issue_id, created_at,
        'inbound' AS direction
       FROM incoming_messages
       WHERE resolved_team_id = $1
       ORDER BY created_at ASC;`,
      [teamId]
    );

    const incomingMessages = inRes.rows;
    const incomingIds = incomingMessages.map(m => m.id);

    // 2. Fetch attachments for incoming messages
    const attachmentsMap: Record<string, any[]> = {};
    if (incomingIds.length > 0) {
      const attRes = await pool.query(
        `SELECT 
          id, message_id, filename, mime_type, size_bytes,
          storage_path, checksum, content_type, ingestion_status,
          parsed_data, raw_base64, created_at
         FROM message_attachments
         WHERE message_id = ANY($1::text[])
         ORDER BY created_at ASC;`,
        [incomingIds]
      );
      for (const a of attRes.rows) {
        if (!attachmentsMap[a.message_id]) {
          attachmentsMap[a.message_id] = [];
        }
        attachmentsMap[a.message_id].push({
          id: a.id,
          messageId: a.message_id,
          filename: a.filename,
          mimeType: a.mime_type,
          sizeBytes: Number(a.size_bytes) || 0,
          storagePath: a.storage_path,
          checksum: a.checksum,
          contentType: a.content_type,
          ingestionStatus: a.ingestion_status,
          parsedData: a.parsed_data,
          rawBase64: a.raw_base64,
          createdAt: a.created_at
        });
      }
    }

    // Attach to incoming messages
    for (const m of incomingMessages) {
      m.attachments = attachmentsMap[m.id] || [];
    }

    // 3. Fetch outgoing messages for this team
    const outRes = await pool.query(
      `SELECT
        id, channel, recipient_address, subject, text_body,
        linked_issue_id, linked_message_id, status, retry_count,
        sent_at, created_at, team_id, conversation_id, sender_address,
        'outbound' AS direction
       FROM outgoing_messages
       WHERE team_id = $1
       ORDER BY created_at ASC;`,
      [teamId]
    );

    const outgoingMessages = outRes.rows.map(m => ({
      ...m,
      attachments: []
    }));

    // 4. Combine all messages and group into threads
    const allMessages = [...incomingMessages, ...outgoingMessages];

    const extractCleanSubject = (msg: any): string => {
      if (msg.raw_payload?.subject) return msg.raw_payload.subject;
      if (msg.raw_payload?.metadata?.subject) return msg.raw_payload.metadata.subject;
      if (msg.subject) return msg.subject;
      const text = msg.text_body || '';
      const firstLine = text.split('\n')[0].trim();
      if (firstLine.length > 5 && firstLine.length < 80) return firstLine;
      return `${(msg.channel || 'message').toUpperCase()} Message - ${new Date(msg.created_at).toLocaleDateString()}`;
    };

    const normalizeSubject = (subj: string): string => {
      return subj.replace(/^(re|fwd|fw):\s*/i, '').trim();
    };

    const threadMap: Record<string, {
      threadId: string;
      subject: string;
      normalizedSubject: string;
      channel: SupportedMessageChannel;
      messages: any[];
      latestMessageAt: string;
      linkedIssueId: string | null;
      taskCreated: boolean;
      participants: Array<{ name: string; address: string; direction: 'inbound' | 'outbound' }>;
      attachments: any[];
      hasAttachments: boolean;
      snippet: string;
      unread: boolean;
    }> = {};

    for (const msg of allMessages) {
      const subj = extractCleanSubject(msg);
      const normSubj = normalizeSubject(subj);
      const threadKey = msg.conversation_id || msg.thread_id || msg.linked_message_id || `thread-${normSubj.toLowerCase()}`;

      if (!threadMap[threadKey]) {
        threadMap[threadKey] = {
          threadId: threadKey,
          subject: subj,
          normalizedSubject: normSubj,
          channel: msg.channel,
          messages: [],
          latestMessageAt: msg.created_at,
          linkedIssueId: msg.linked_issue_id || null,
          taskCreated: Boolean(msg.linked_issue_id),
          participants: [],
          attachments: [],
          hasAttachments: false,
          snippet: '',
          unread: false
        };
      }

      const thread = threadMap[threadKey];
      thread.messages.push(msg);

      if (msg.linked_issue_id) {
        thread.linkedIssueId = msg.linked_issue_id;
        thread.taskCreated = true;
      }
      if (new Date(msg.created_at) > new Date(thread.latestMessageAt)) {
        thread.latestMessageAt = msg.created_at;
        thread.snippet = (msg.text_body || '').slice(0, 140);
        thread.channel = msg.channel;
      }
      if (msg.attachments && msg.attachments.length > 0) {
        thread.hasAttachments = true;
        thread.attachments.push(...msg.attachments);
      }
      if (msg.direction === 'inbound' && msg.status === 'RECEIVED') {
        thread.unread = true;
      }

      const addr = msg.direction === 'inbound' ? msg.sender_address : msg.recipient_address;
      const name = msg.direction === 'inbound' ? (msg.sender_name || addr) : addr;
      if (!thread.participants.some(p => p.address === addr)) {
        thread.participants.push({ name, address: addr, direction: msg.direction });
      }
    }

    let threadList = Object.values(threadMap).map(t => {
      t.messages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      if (!t.snippet && t.messages.length > 0) {
        const lastMsg = t.messages[t.messages.length - 1];
        t.snippet = (lastMsg.text_body || '').slice(0, 140);
      }
      return t;
    });

    // 5. Apply Filter
    if (filter === 'inbound') {
      threadList = threadList.filter(t => t.messages.some(m => m.direction === 'inbound'));
    } else if (filter === 'outbound') {
      threadList = threadList.filter(t => t.messages.some(m => m.direction === 'outbound'));
    } else if (filter === 'unassigned') {
      threadList = threadList.filter(t => !t.linkedIssueId);
    }

    // 6. Apply Search
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      threadList = threadList.filter(t => 
        t.subject.toLowerCase().includes(q) ||
        t.participants.some(p => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q)) ||
        t.messages.some(m => (m.text_body || '').toLowerCase().includes(q))
      );
    }

    threadList.sort((a, b) => new Date(b.latestMessageAt).getTime() - new Date(a.latestMessageAt).getTime());

    const unreadCount = threadList.filter(t => t.unread).length;
    const unassignedCount = threadList.filter(t => !t.linkedIssueId).length;

    return {
      threads: threadList,
      totalThreads: threadList.length,
      unreadCount,
      unassignedCount
    };
  }

  /**
   * Links a message and its entire thread to a created Issue/Task, preventing
   * duplicate task creation by other team members.
   */
  async linkMessageToIssue(messageId: string, issueId: string): Promise<boolean> {
    const pool = getPostgresPool();

    const msgRes = await pool.query(
      `SELECT conversation_id, thread_id FROM incoming_messages WHERE id = $1;`,
      [messageId]
    );

    const convId = msgRes.rows[0]?.conversation_id || msgRes.rows[0]?.thread_id;

    if (convId) {
      await pool.query(
        `UPDATE incoming_messages 
         SET linked_issue_id = $1 
         WHERE conversation_id = $2 OR thread_id = $2 OR id = $3;`,
        [issueId, convId, messageId]
      );
      await pool.query(
        `UPDATE outgoing_messages
         SET linked_issue_id = $1
         WHERE conversation_id = $2;`,
        [issueId, convId]
      );
    } else {
      await pool.query(
        `UPDATE incoming_messages 
         SET linked_issue_id = $1 
         WHERE id = $2;`,
        [issueId, messageId]
      );
    }

    await pool.query(
      `UPDATE staged_messages 
       SET status = 'CONVERTED_TO_TASK', created_issue_id = $1, linked_issue_id = $1, updated_at = NOW() 
       WHERE conversation_id = $2 OR thread_id = $2 OR source_message_id = $2;`,
      [issueId, convId || messageId]
    );

    return true;
  }

  /**
   * Dispatches a reply in the context of an existing thread or inbound message.
   */
  async replyToMessage(teamId: string, payload: {
    channel: SupportedMessageChannel;
    to: string;
    subject: string;
    textBody: string;
    htmlBody?: string;
    conversationId?: string;
    threadId?: string;
    inReplyToMessageId?: string;
    senderAddress?: string;
  }): Promise<any> {
    const pool = getPostgresPool();

    let sender = payload.senderAddress;
    if (!sender) {
      const cfgRes = await pool.query(
        `SELECT address FROM team_channel_configurations 
         WHERE team_id = $1 AND channel = $2 AND is_active = true 
         ORDER BY is_primary DESC LIMIT 1;`,
        [teamId, payload.channel]
      );
      sender = cfgRes.rows[0]?.address || 'team-operations@bank.com';
    }

    const outboxId = await outboundDispatchService.enqueueMessage({
      channel: payload.channel,
      to: payload.to,
      subject: payload.subject.startsWith('Re: ') ? payload.subject : `Re: ${payload.subject}`,
      body: payload.textBody,
      teamId,
      conversationId: payload.conversationId || payload.threadId,
      linkedMessageId: payload.inReplyToMessageId,
      senderAddress: sender
    });

    return {
      success: true,
      id: outboxId,
      outboxId,
      status: 'QUEUED',
      sentAt: new Date().toISOString()
    };
  }
}

export const messageIntakeService = new MessageIntakeService();
