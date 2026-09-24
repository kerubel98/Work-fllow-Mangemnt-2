/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { getPostgresPool } from '../../config/postgres.js';
import { attachmentParserService } from './attachmentParserService.js';
import { getProviderConnector } from './providerConnectors.js';
import { outboundDispatchService } from './outboundDispatchService.js';
import { repo } from '../../store/repository.js';
import { eventService } from '../events.js';
export class StagingService {
    /**
     * Stages an incoming normalized MessageEnvelope into the operational staging queue.
     * Derives a 64-bit cryptographic advisory lock from the dedupeKey to prevent concurrent duplication.
     */
    async stageInboundEnvelope(envelope) {
        const pool = getPostgresPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN;');
            // 1. 64-Bit Cryptographic Advisory Lock derived from dedupeKey
            const lockKey = envelope.dedupeKey;
            await client.query(`SELECT pg_advisory_xact_lock(('x' || substr(md5($1), 1, 16))::bit(64)::bigint);`, [lockKey]);
            // 2. Check existing staged messages
            const existingRes = await client.query(`SELECT id, status, channel, created_issue_id FROM staged_messages WHERE dedupe_key = $1 LIMIT 1;`, [envelope.dedupeKey]);
            if (existingRes.rows.length > 0) {
                await client.query('COMMIT;');
                const row = existingRes.rows[0];
                console.log(`[StagingService] Message already staged: ${row.id} (Status: ${row.status})`);
                return this.getStagedMessageById(row.id);
            }
            // 3. Run Structured Attachment & Content Parsing Pipeline
            const subject = envelope.metadata?.subject || '';
            const textBody = envelope.textBody || '';
            const parsedEnrichment = await attachmentParserService.parseAttachments(envelope.attachments || [], textBody, subject);
            // 4. Resolve routing and initial status
            const stagedId = `stg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const effectiveTeam = envelope.teamId || parsedEnrichment.parsedFields.suggestedTeamId || 'team-settlement-01';
            const initialStatus = parsedEnrichment.confidenceScore >= 0.7 ? 'READY_FOR_TASK_CREATION' : 'NEW';
            const slaHours = parsedEnrichment.parsedFields.slaHours || 24;
            const slaDueAt = new Date(Date.now() + slaHours * 3600 * 1000).toISOString();
            // 5. Insert into staged_messages
            const insertSql = `
        INSERT INTO staged_messages (
          id, channel, source_message_id, conversation_id, thread_id,
          sender_address, sender_name, team_id, assigned_user_id,
          subject, text_body, raw_payload, dedupe_key,
          status, urgency, category, confidence_score, parsed_fields,
          sla_due_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15, $16, $17, $18,
          $19, NOW(), NOW()
        ) RETURNING *;
      `;
            await client.query(insertSql, [
                stagedId,
                envelope.sourceChannel,
                envelope.sourceMessageId,
                envelope.conversationId || null,
                envelope.threadId || null,
                envelope.senderAddress,
                envelope.senderName || envelope.senderAddress.split('@')[0],
                effectiveTeam,
                envelope.personId || null,
                subject || parsedEnrichment.parsedFields.suggestedTaskTitle || 'External Service Request',
                textBody,
                JSON.stringify(envelope.rawPayload || {}),
                envelope.dedupeKey,
                initialStatus,
                parsedEnrichment.urgency,
                parsedEnrichment.category,
                parsedEnrichment.confidenceScore,
                JSON.stringify(parsedEnrichment.parsedFields),
                slaDueAt
            ]);
            // 6. Insert staged attachments
            for (const att of parsedEnrichment.attachments) {
                await client.query(`INSERT INTO staged_message_attachments (
            id, staged_message_id, filename, mime_type, size_bytes,
            content_type, storage_path, parsed_text, parsed_data,
            parsing_status, parsing_error, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW());`, [
                    att.attachmentId,
                    stagedId,
                    att.filename,
                    att.mimeType,
                    0,
                    att.contentType,
                    att.storagePath || null,
                    att.parsedText || null,
                    JSON.stringify(att.parsedData || {}),
                    att.parsingStatus,
                    att.parsingError || null
                ]);
            }
            await client.query('COMMIT;');
            // Broadcast real-time intake event
            eventService.broadcastEvent('message:staged', { stagedId, channel: envelope.sourceChannel, teamId: effectiveTeam });
            return (await this.getStagedMessageById(stagedId));
        }
        catch (err) {
            await client.query('ROLLBACK;');
            console.error('[StagingService] Failed to stage message:', err);
            throw err;
        }
        finally {
            client.release();
        }
    }
    /**
     * Retrieves staged external requests with attachments and filters.
     */
    async getStagedMessages(params = {}) {
        const pool = getPostgresPool();
        const conditions = [];
        const values = [];
        let idx = 1;
        if (params.teamId) {
            conditions.push(`team_id = $${idx++}`);
            values.push(params.teamId);
        }
        if (params.assignedUserId) {
            conditions.push(`assigned_user_id = $${idx++}`);
            values.push(params.assignedUserId);
        }
        if (params.status) {
            conditions.push(`status = $${idx++}`);
            values.push(params.status);
        }
        if (params.urgency) {
            conditions.push(`urgency = $${idx++}`);
            values.push(params.urgency);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limitClause = `LIMIT ${params.limit || 100}`;
        const sql = `
      SELECT * FROM staged_messages
      ${whereClause}
      ORDER BY created_at DESC
      ${limitClause};
    `;
        const res = await pool.query(sql, values);
        const messages = [];
        for (const r of res.rows) {
            const attRes = await pool.query(`SELECT * FROM staged_message_attachments WHERE staged_message_id = $1 ORDER BY created_at ASC;`, [r.id]);
            messages.push(this.mapStagedRow(r, attRes.rows));
        }
        return messages;
    }
    /**
     * Get single staged message by ID.
     */
    async getStagedMessageById(id) {
        const pool = getPostgresPool();
        const res = await pool.query(`SELECT * FROM staged_messages WHERE id = $1;`, [id]);
        if (res.rows.length === 0)
            return null;
        const attRes = await pool.query(`SELECT * FROM staged_message_attachments WHERE staged_message_id = $1 ORDER BY created_at ASC;`, [id]);
        return this.mapStagedRow(res.rows[0], attRes.rows);
    }
    /**
     * Propose conversion of staged request into an operational task (Maker step).
     */
    async proposeTaskConversion(id, maker, payload = {}) {
        const pool = getPostgresPool();
        const staged = await this.getStagedMessageById(id);
        if (!staged)
            throw new Error(`Staged message ${id} not found.`);
        if (staged.status === 'CONVERTED_TO_TASK') {
            throw new Error(`Staged message ${id} has already been converted to task #${staged.createdIssueId}.`);
        }
        const updated = await pool.query(`UPDATE staged_messages
       SET status = 'READY_FOR_TASK_CREATION',
           maker_id = $1,
           review_notes = $2,
           team_id = COALESCE($3, team_id),
           urgency = COALESCE($4, urgency),
           subject = COALESCE($5, subject),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *;`, [maker.id, payload.notes || `Proposed by ${maker.name}`, payload.teamId || null, payload.priority || null, payload.title || null, id]);
        eventService.broadcastEvent('message:conversion_proposed', { stagedId: id, makerId: maker.id });
        return (await this.getStagedMessageById(id));
    }
    /**
     * Approves and converts a staged request into an operational Issue/Task.
     * Strict Maker-Checker Dual Control & Anti-Self-Approval Enforcement:
     * Checker must be distinct from Maker (HTTP 403 / Four-Eyes Principle).
     */
    async approveAndConvertTask(id, checker, reviewNotes) {
        const pool = getPostgresPool();
        const staged = await this.getStagedMessageById(id);
        if (!staged)
            throw new Error(`Staged message ${id} not found.`);
        if (staged.status === 'CONVERTED_TO_TASK') {
            throw new Error(`Staged message ${id} has already been converted to task #${staged.createdIssueId}.`);
        }
        // Anti-Self-Approval Check (Rule 7)
        const effectiveMakerId = staged.makerId || staged.maker_id;
        if (effectiveMakerId && effectiveMakerId === checker.id) {
            throw new Error(`Anti-Self-Approval violation: Checker '${checker.name}' cannot approve their own submission (Maker: '${effectiveMakerId}'). Four-Eyes principle required.`);
        }
        // 1. Create the operational Issue
        const issueId = `ISS-${Date.now().toString().slice(-6)}`;
        const effectiveTitle = staged.subject || `External ${staged.category.replace(/_/g, ' ')}`;
        const effectiveTeam = staged.teamId || 'team-settlement-01';
        const newIssue = {
            id: issueId,
            title: effectiveTitle,
            description: `Origin: ${staged.channel.toUpperCase()} from ${staged.senderName || staged.senderAddress} (${staged.senderAddress}).\n\nOriginal Request Body:\n${staged.textBody}\n\nReview Notes:\n${reviewNotes || staged.reviewNotes || 'Approved for operational handling.'}`,
            status: 'Open',
            priority: staged.urgency === 'critical' ? 'Critical' : (staged.urgency === 'high' ? 'High' : 'Medium'),
            creatorId: staged.makerId || checker.id,
            creatorName: checker.name,
            createdAt: new Date().toISOString(),
            type: staged.attachments && staged.attachments.length > 0 ? 'file' : 'single',
            teamId: effectiveTeam,
            visibility: 'TEAM_PUBLIC',
            uploadedFileName: staged.attachments?.[0]?.filename,
            datasetStatus: staged.attachments && staged.attachments.length > 0 ? 'PENDING_MAPPING' : 'NONE',
            transactionCount: 0,
            chat: [
                {
                    id: `msg-${Date.now()}`,
                    senderId: checker.id,
                    senderName: `${checker.name} (Checker Approval)`,
                    senderRole: 'managerial',
                    text: `Task converted from ${staged.channel.toUpperCase()} request #${staged.id}. Approved with notes: "${reviewNotes || 'Verified'}"`,
                    timestamp: new Date().toISOString()
                }
            ]
        };
        const createdIssue = await repo.createIssue(newIssue);
        // 2. Update staged message
        await pool.query(`UPDATE staged_messages
       SET status = 'CONVERTED_TO_TASK',
           created_issue_id = $1,
           checker_id = $2,
           review_notes = $3,
           updated_at = NOW()
       WHERE id = $4;`, [createdIssue.id, checker.id, reviewNotes || `Approved by ${checker.name}`, id]);
        // 3. Dispatch confirmation outbound message to requester
        try {
            await outboundDispatchService.enqueueMessage({
                to: staged.senderAddress,
                channel: staged.channel,
                subject: `Re: ${staged.subject || 'Back-Office Request'} - Task #${createdIssue.id} Created`,
                body: `Hello ${staged.senderName || 'Valued Customer'},\n\nYour request has been accepted and logged into our operations queue as Task #${createdIssue.id} ("${createdIssue.title}"). Our team is currently investigating it.\n\nThank you,\nOperations Workflow Support`,
                linkedIssueId: createdIssue.id
            });
        }
        catch (dispatchErr) {
            console.warn(`[StagingService] Could not send outbound confirmation: ${dispatchErr.message}`);
        }
        eventService.broadcastEvent('message:task_converted', { stagedId: id, issueId: createdIssue.id });
        const updatedStaged = (await this.getStagedMessageById(id));
        return { staged: updatedStaged, issue: createdIssue };
    }
    /**
     * Reject a staged message with justification.
     */
    async rejectStagedMessage(id, actor, reason) {
        const pool = getPostgresPool();
        await pool.query(`UPDATE staged_messages
       SET status = 'REJECTED',
           review_notes = $1,
           checker_id = $2,
           updated_at = NOW()
       WHERE id = $3;`, [reason || 'Rejected by operator', actor.id, id]);
        eventService.broadcastEvent('message:rejected', { stagedId: id, actorId: actor.id });
        return (await this.getStagedMessageById(id));
    }
    /**
     * Escalate staged message to another team or manager.
     */
    async escalateStagedMessage(id, targetTeamId, actor, reason) {
        const pool = getPostgresPool();
        await pool.query(`UPDATE staged_messages
       SET team_id = $1,
           status = 'ESCALATED',
           urgency = 'high',
           review_notes = $2,
           updated_at = NOW()
       WHERE id = $3;`, [targetTeamId, `Escalated to ${targetTeamId} by ${actor.name}: ${reason}`, id]);
        eventService.broadcastEvent('message:escalated', { stagedId: id, targetTeamId });
        return (await this.getStagedMessageById(id));
    }
    /**
     * Aggregated metrics summary for managerial and personal dashboards.
     */
    async getExternalRequestSummary(teamId) {
        const pool = getPostgresPool();
        const teamFilter = teamId ? `WHERE team_id = $1` : '';
        const params = teamId ? [teamId] : [];
        const statsRes = await pool.query(`SELECT 
        COUNT(*) as total_inbound,
        COUNT(*) FILTER (WHERE status IN ('NEW', 'STAGED', 'ATTACHMENT_PENDING')) as pending_triage,
        COUNT(*) FILTER (WHERE status = 'READY_FOR_TASK_CREATION') as ready_for_task,
        COUNT(*) FILTER (WHERE status = 'CONVERTED_TO_TASK') as converted,
        COUNT(*) FILTER (WHERE status = 'ESCALATED') as escalated,
        COUNT(*) FILTER (WHERE sla_due_at < NOW() AND status NOT IN ('CONVERTED_TO_TASK', 'REJECTED')) as sla_breached
       FROM staged_messages
       ${teamFilter};`, params);
        const channelRes = await pool.query(`SELECT channel, COUNT(*) as count FROM staged_messages ${teamFilter} GROUP BY channel;`, params);
        const providersRes = await pool.query(`SELECT COUNT(*) as count FROM provider_connections WHERE status = 'ACTIVE' ${teamId ? 'AND team_id = $1' : ''};`, params);
        const row = statsRes.rows[0] || {};
        const channelBreakdown = {
            email: 0,
            teams: 0,
            whatsapp: 0,
            telegram: 0
        };
        for (const ch of channelRes.rows) {
            if (channelBreakdown[ch.channel] !== undefined) {
                channelBreakdown[ch.channel] = parseInt(ch.count, 10);
            }
        }
        return {
            totalInbound: parseInt(row.total_inbound || '0', 10),
            pendingTriage: parseInt(row.pending_triage || '0', 10),
            readyForTaskCreation: parseInt(row.ready_for_task || '0', 10),
            convertedToTask: parseInt(row.converted || '0', 10),
            escalatedCount: parseInt(row.escalated || '0', 10),
            slaBreachCount: parseInt(row.sla_breached || '0', 10),
            activeProviders: parseInt(providersRes.rows[0]?.count || '0', 10),
            channelBreakdown
        };
    }
    /**
     * Provider Connection Management
     */
    async getProviderConnections(teamId, userId) {
        const pool = getPostgresPool();
        const conditions = [];
        const values = [];
        let idx = 1;
        if (teamId) {
            conditions.push(`team_id = $${idx++}`);
            values.push(teamId);
        }
        if (userId) {
            conditions.push(`user_id = $${idx++}`);
            values.push(userId);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const res = await pool.query(`SELECT * FROM provider_connections ${whereClause} ORDER BY created_at DESC;`, values);
        return res.rows.map(r => ({
            id: r.id,
            teamId: r.team_id,
            userId: r.user_id,
            channel: r.channel,
            displayName: r.display_name,
            status: r.status,
            config: r.config || {},
            lastFetchAt: r.last_fetch_at,
            lastError: r.last_error,
            createdBy: r.created_by,
            createdAt: r.created_at,
            updatedAt: r.updated_at
        }));
    }
    async saveProviderConnection(data) {
        const pool = getPostgresPool();
        const id = data.id || `prov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const upsertSql = `
      INSERT INTO provider_connections (
        id, team_id, user_id, channel, display_name, status, config, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        team_id = EXCLUDED.team_id,
        user_id = EXCLUDED.user_id,
        channel = EXCLUDED.channel,
        display_name = EXCLUDED.display_name,
        status = EXCLUDED.status,
        config = EXCLUDED.config,
        updated_at = NOW()
      RETURNING *;
    `;
        const res = await pool.query(upsertSql, [
            id,
            data.teamId || null,
            data.userId || null,
            data.channel,
            data.displayName || `${data.channel?.toUpperCase()} Provider`,
            data.status || 'ACTIVE',
            JSON.stringify(data.config || {}),
            data.createdBy || 'system'
        ]);
        const r = res.rows[0];
        return {
            id: r.id,
            teamId: r.team_id,
            userId: r.user_id,
            channel: r.channel,
            displayName: r.display_name,
            status: r.status,
            config: r.config || {},
            lastFetchAt: r.last_fetch_at,
            lastError: r.last_error,
            createdBy: r.created_by,
            createdAt: r.created_at,
            updatedAt: r.updated_at
        };
    }
    async testProviderConnection(id) {
        const pool = getPostgresPool();
        const res = await pool.query(`SELECT * FROM provider_connections WHERE id = $1;`, [id]);
        if (res.rows.length === 0)
            throw new Error(`Provider connection ${id} not found.`);
        const provider = res.rows[0];
        const connector = getProviderConnector(provider.channel);
        const testResult = await connector.testConnection(provider.config || {});
        await pool.query(`UPDATE provider_connections
       SET status = $1, last_error = $2, updated_at = NOW()
       WHERE id = $3;`, [testResult.success ? 'ACTIVE' : 'ERROR', testResult.success ? null : testResult.message, id]);
        return testResult;
    }
    async fetchProviderMessages(id) {
        const pool = getPostgresPool();
        const res = await pool.query(`SELECT * FROM provider_connections WHERE id = $1;`, [id]);
        if (res.rows.length === 0)
            throw new Error(`Provider connection ${id} not found.`);
        const provider = res.rows[0];
        const connector = getProviderConnector(provider.channel);
        const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        await pool.query(`INSERT INTO provider_fetch_jobs (id, provider_id, channel, status, started_at)
       VALUES ($1, $2, $3, 'RUNNING', NOW());`, [jobId, id, provider.channel]);
        let messagesFound = 0;
        let messagesStaged = 0;
        let errorTrace;
        try {
            const rawMessages = await connector.fetchNewMessages(provider.config || {}, provider.last_fetch_at, id);
            messagesFound = rawMessages.length;
            for (const raw of rawMessages) {
                const envelope = connector.normalize(raw);
                if (provider.team_id)
                    envelope.teamId = provider.team_id;
                if (provider.user_id)
                    envelope.personId = provider.user_id;
                await this.stageInboundEnvelope(envelope);
                messagesStaged++;
            }
            await pool.query(`UPDATE provider_connections
         SET last_fetch_at = NOW(), last_error = NULL, updated_at = NOW()
         WHERE id = $1;`, [id]);
            await pool.query(`UPDATE provider_fetch_jobs
         SET status = 'COMPLETED', messages_found = $1, messages_staged = $2, completed_at = NOW()
         WHERE id = $3;`, [messagesFound, messagesStaged, jobId]);
        }
        catch (err) {
            errorTrace = err.message;
            await pool.query(`UPDATE provider_connections
         SET last_error = $1, status = 'ERROR', updated_at = NOW()
         WHERE id = $2;`, [err.message, id]);
            await pool.query(`UPDATE provider_fetch_jobs
         SET status = 'FAILED', error_trace = $1, completed_at = NOW()
         WHERE id = $2;`, [err.message, jobId]);
            throw err;
        }
        return {
            stagedCount: messagesStaged,
            job: {
                id: jobId,
                providerId: id,
                channel: provider.channel,
                status: errorTrace ? 'FAILED' : 'COMPLETED',
                messagesFound,
                messagesStaged,
                errorTrace,
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString()
            }
        };
    }
    mapStagedRow(r, attachments = []) {
        return {
            id: r.id,
            channel: r.channel,
            sourceMessageId: r.source_message_id,
            conversationId: r.conversation_id,
            threadId: r.thread_id,
            senderAddress: r.sender_address,
            senderName: r.sender_name,
            teamId: r.team_id,
            assignedUserId: r.assigned_user_id,
            subject: r.subject,
            textBody: r.text_body,
            rawPayload: r.raw_payload || {},
            dedupeKey: r.dedupe_key,
            status: r.status,
            urgency: r.urgency,
            category: r.category,
            confidenceScore: parseFloat(r.confidence_score || '1.0'),
            parsedFields: r.parsed_fields || {},
            linkedIssueId: r.linked_issue_id,
            createdIssueId: r.created_issue_id,
            makerId: r.maker_id,
            checkerId: r.checker_id,
            reviewNotes: r.review_notes,
            slaDueAt: r.sla_due_at,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            attachments: attachments.map(a => ({
                id: a.id,
                stagedMessageId: a.staged_message_id,
                filename: a.filename,
                mimeType: a.mime_type,
                sizeBytes: parseInt(a.size_bytes || '0', 10),
                contentType: a.content_type,
                storagePath: a.storage_path,
                parsedText: a.parsed_text,
                parsedData: a.parsed_data || {},
                parsingStatus: a.parsing_status,
                parsingError: a.parsing_error,
                createdAt: a.created_at
            }))
        };
    }
}
export const stagingService = new StagingService();
