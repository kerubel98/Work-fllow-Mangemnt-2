/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { getChannelAdapter } from '../services/messaging/channelAdapters.js';
import { messageIntakeService } from '../services/messaging/messageIntakeService.js';
import { outboundDispatchService } from '../services/messaging/outboundDispatchService.js';
import { SupportedMessageChannel } from '../models/messageTypes.js';

export const messagesRouter = Router();

/**
 * Inbound webhook for external channel events (Email, Teams, WhatsApp, Telegram).
 */
messagesRouter.post('/webhook/:channel', async (req: Request, res: Response) => {
  try {
    const channel = req.params.channel as SupportedMessageChannel;
    const adapter = getChannelAdapter(channel);

    const signature = (req.headers['x-hub-signature-256'] || req.headers['authorization'] || req.headers['x-telegram-bot-api-secret-token']) as string | undefined;

    if (!adapter.verifySignature(req.body, signature)) {
      return res.status(401).json({ error: 'Invalid webhook signature.' });
    }

    const envelope = adapter.normalize(req.body);
    const result = await messageIntakeService.processEnvelope(envelope);

    return res.status(200).json({
      success: true,
      messageId: result.messageId,
      status: result.status,
      intent: result.intent,
      linkedIssueId: result.linkedIssueId,
      createdIssueId: result.createdIssueId,
      replyMessageId: result.replyMessageId
    });
  } catch (err: any) {
    console.error('[messagesRouter] Webhook intake failure:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Simulator endpoint for local testing of external channel interactions.
 */
messagesRouter.post('/simulator/send', async (req: Request, res: Response) => {
  try {
    const { channel, senderAddress, senderName, text, linkedIssueId, attachments } = req.body;

    if (!channel || !senderAddress || !text) {
      return res.status(400).json({ error: 'channel, senderAddress, and text are required.' });
    }

    const adapter = getChannelAdapter(channel as SupportedMessageChannel);
    const mockPayload: any = {
      from: senderAddress,
      fromName: senderName || 'Simulator User',
      sender: senderAddress,
      text,
      body: text,
      content: text,
      timestamp: new Date().toISOString(),
      metadata: { linkedIssueId }
    };

    if (attachments && Array.isArray(attachments)) {
      mockPayload.attachments = attachments;
    }

    const envelope = adapter.normalize(mockPayload);
    if (linkedIssueId) {
      envelope.metadata = { ...envelope.metadata, linkedIssueId };
    }

    const result = await messageIntakeService.processEnvelope(envelope);
    return res.status(200).json({ success: true, result });
  } catch (err: any) {
    console.error('[messagesRouter] Simulator failure:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Inbox message log.
 */
messagesRouter.get('/inbox', async (req: Request, res: Response) => {
  try {
    const teamId = req.query.teamId as string | undefined;
    const issueId = req.query.issueId as string | undefined;
    const limit = parseInt(req.query.limit as string || '50', 10);

    const messages = await messageIntakeService.getRecentIncomingMessages(limit, teamId, issueId);
    return res.json(messages);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Outbox delivery log.
 */
messagesRouter.get('/outbox', async (req: Request, res: Response) => {
  try {
    const issueId = req.query.issueId as string | undefined;
    const limit = parseInt(req.query.limit as string || '50', 10);

    const messages = await outboundDispatchService.getOutboxMessages(limit, issueId);
    return res.json(messages);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Team Channel Configurations.
 */
messagesRouter.get('/configs/team/:teamId', async (req: Request, res: Response) => {
  try {
    const configs = await messageIntakeService.getTeamConfigurations(req.params.teamId);
    return res.json(configs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

messagesRouter.post('/configs/team', async (req: Request, res: Response) => {
  try {
    const { teamId, channel, displayName, address, isPrimary, isActive, webhookSecret, permissions, createdBy } = req.body;
    if (!teamId || !channel || !address) {
      return res.status(400).json({ error: 'teamId, channel, and address are required.' });
    }

    const saved = await messageIntakeService.saveTeamConfiguration({
      teamId,
      channel,
      displayName: displayName || `${channel} Channel`,
      address,
      isPrimary: isPrimary || false,
      isActive: isActive !== false,
      webhookSecret,
      permissions: permissions || ['read', 'reply', 'create_task', 'escalate'],
      createdBy
    });

    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Personal Channel Configurations.
 */
messagesRouter.get('/configs/personal/:userId', async (req: Request, res: Response) => {
  try {
    const configs = await messageIntakeService.getPersonalConfigurations(req.params.userId);
    return res.json(configs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

messagesRouter.post('/configs/personal', async (req: Request, res: Response) => {
  try {
    const { userId, channel, displayName, address, isDefault, isActive, notificationMode } = req.body;
    if (!userId || !channel || !address) {
      return res.status(400).json({ error: 'userId, channel, and address are required.' });
    }

    const saved = await messageIntakeService.savePersonalConfiguration({
      userId,
      channel,
      displayName: displayName || `${channel} Account`,
      address,
      isDefault: isDefault || false,
      isActive: isActive !== false,
      notificationMode: notificationMode || 'all'
    });

    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * ========================================================
 * Provider Connection & Active Fetch Management Endpoints
 * ========================================================
 */

// GET /api/messages/providers - List configured providers
messagesRouter.get('/providers', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const teamId = req.query.teamId as string | undefined;
    const userId = req.query.userId as string | undefined;
    const providers = await stagingService.getProviderConnections(teamId, userId);
    return res.json(providers);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/providers - Create or update provider connection
messagesRouter.post('/providers', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const { channel, displayName, teamId, userId, config, status, createdBy } = req.body;
    if (!channel) {
      return res.status(400).json({ error: 'channel is required.' });
    }

    const saved = await stagingService.saveProviderConnection({
      channel,
      displayName,
      teamId,
      userId,
      config,
      status,
      createdBy
    });
    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/providers/:id/test - Test provider connection credentials
messagesRouter.post('/providers/:id/test', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const result = await stagingService.testProviderConnection(req.params.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/providers/:id/fetch - Trigger on-demand message fetch
messagesRouter.post('/providers/:id/fetch', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const result = await stagingService.fetchProviderMessages(req.params.id);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/oauth2/test - Direct test of OAuth2 credentials & token acquisition
messagesRouter.post('/oauth2/test', async (req: Request, res: Response) => {
  try {
    const { oauth2Service } = await import('../services/messaging/oauth2Service.js');
    const { config, channel } = req.body;
    const effectiveConfig = config || (req.body.adminOAuth2ConnectionId || req.body.clientId || req.body.authType ? req.body : null);
    if (!effectiveConfig) {
      return res.status(400).json({ error: 'config is required.' });
    }
    const result = await oauth2Service.testOAuth2Credentials(effectiveConfig, channel || effectiveConfig.channel || 'email');
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * ========================================================
 * Admin Global OAuth 2.0 Connection Management Endpoints
 * ========================================================
 */

// GET /api/messages/admin/oauth2 - List Admin-configured OAuth2 Connections
messagesRouter.get('/admin/oauth2', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const connections = await stagingService.getAdminOAuth2Connections();
    const masked = connections.map(conn => ({
      ...conn,
      config: {
        ...conn.config,
        clientSecret: conn.config?.clientSecret ? '••••••••' : '',
        hasSecret: !!conn.config?.clientSecret
      }
    }));
    return res.json(masked);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/admin/oauth2/available - Public catalog for teams to pick from
messagesRouter.get('/admin/oauth2/available', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const connections = await stagingService.getAdminOAuth2Connections();
    const available = connections
      .filter(c => c.status === 'ACTIVE')
      .map(c => ({
        id: c.id,
        displayName: c.displayName,
        channel: c.channel,
        providerPreset: c.config?.providerPreset || c.config?.preset || 'CUSTOM',
        tenantId: c.config?.tenantId || '',
        scope: c.config?.scope || '',
        grantType: c.config?.grantType || 'client_credentials',
        userEmail: c.config?.userEmail || ''
      }));
    return res.json(available);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/admin/oauth2 - Create or update Admin OAuth2 Connection
messagesRouter.post('/admin/oauth2', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const { id, displayName, channel, config, status, createdBy } = req.body;
    if (!displayName) {
      return res.status(400).json({ error: 'displayName is required for Admin OAuth2 connection.' });
    }

    let mergedConfig = { ...(config || {}) };
    mergedConfig.authType = 'OAUTH2';
    mergedConfig.isGlobal = true;

    // If editing existing connection and clientSecret is masked, preserve existing secret
    if (id && (!mergedConfig.clientSecret || mergedConfig.clientSecret === '••••••••')) {
      const existing = await stagingService.getProviderConnectionById(id);
      if (existing?.config?.clientSecret) {
        mergedConfig.clientSecret = existing.config.clientSecret;
      }
    }

    if (!mergedConfig.clientId) {
      return res.status(400).json({ error: 'Client ID (App ID) is required.' });
    }
    if (!mergedConfig.clientSecret) {
      return res.status(400).json({ error: 'Client Secret is required.' });
    }

    const saved = await stagingService.saveProviderConnection({
      id,
      teamId: null, // Admin-level connection
      userId: null,
      channel: channel || 'email',
      displayName,
      status: status || 'ACTIVE',
      config: mergedConfig,
      createdBy: createdBy || 'admin'
    });

    return res.status(201).json({
      ...saved,
      config: {
        ...saved.config,
        clientSecret: '••••••••',
        hasSecret: true
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/messages/admin/oauth2/:id - Delete an Admin OAuth2 Connection
messagesRouter.delete('/admin/oauth2/:id', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const deleted = await stagingService.deleteProviderConnection(req.params.id);
    return res.json({ success: deleted });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * ========================================================
 * External Requests Staging Queue & Maker-Checker Endpoints
 * ========================================================
 */

// GET /api/messages/staging - List staged external requests with filters
messagesRouter.get('/staging', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const teamId = req.query.teamId as string | undefined;
    const assignedUserId = req.query.assignedUserId as string | undefined;
    const status = req.query.status as string | undefined;
    const urgency = req.query.urgency as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const staged = await stagingService.getStagedMessages({
      teamId,
      assignedUserId,
      status,
      urgency,
      limit
    });
    return res.json(staged);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/staging/:id - Single staged item inspection
messagesRouter.get('/staging/:id', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const item = await stagingService.getStagedMessageById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Staged message not found.' });
    }
    return res.json(item);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/staging/:id/propose - Maker proposes task conversion
messagesRouter.post('/staging/:id/propose', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const { makerId, makerName, title, teamId, priority, notes } = req.body;
    if (!makerId) {
      return res.status(400).json({ error: 'makerId is required to propose task conversion.' });
    }

    const updated = await stagingService.proposeTaskConversion(
      req.params.id,
      { id: makerId, name: makerName || 'Operational Maker' },
      { title, teamId, priority, notes }
    );
    return res.json({ success: true, staged: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/staging/:id/approve - Checker approves task conversion (Anti-Self-Approval enforced)
messagesRouter.post('/staging/:id/approve', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const { checkerId, checkerName, reviewNotes } = req.body;
    if (!checkerId) {
      return res.status(400).json({ error: 'checkerId is required.' });
    }

    const result = await stagingService.approveAndConvertTask(
      req.params.id,
      { id: checkerId, name: checkerName || 'Operational Supervisor' },
      reviewNotes
    );
    return res.json({ success: true, ...result });
  } catch (err: any) {
    if (err.message.includes('Anti-Self-Approval')) {
      return res.status(403).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/staging/:id/reject - Reject staged request
messagesRouter.post('/staging/:id/reject', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const { actorId, actorName, reason } = req.body;
    const updated = await stagingService.rejectStagedMessage(
      req.params.id,
      { id: actorId || 'sys', name: actorName || 'Reviewer' },
      reason || 'Rejected during triage'
    );
    return res.json({ success: true, staged: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/staging/:id/create-task - Direct conversion or approval
messagesRouter.post('/staging/:id/create-task', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const { actorId, actorName, notes } = req.body;
    const result = await stagingService.approveAndConvertTask(
      req.params.id,
      { id: actorId || 'usr-supervisor', name: actorName || 'Lead Operator' },
      notes
    );
    return res.json({ success: true, ...result });
  } catch (err: any) {
    if (err.message.includes('Anti-Self-Approval')) {
      return res.status(403).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/staging/:id/escalate - Escalate to another team
messagesRouter.post('/staging/:id/escalate', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const { targetTeamId, actorId, actorName, reason } = req.body;
    if (!targetTeamId) {
      return res.status(400).json({ error: 'targetTeamId is required.' });
    }

    const updated = await stagingService.escalateStagedMessage(
      req.params.id,
      targetTeamId,
      { id: actorId || 'operator', name: actorName || 'Lead' },
      reason || 'Escalated from triage queue'
    );
    return res.json({ success: true, staged: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/summary or /api/external-requests/summary - Summary dashboard metrics
messagesRouter.get('/summary', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const teamId = req.query.teamId as string | undefined;
    const summary = await stagingService.getExternalRequestSummary(teamId);
    return res.json(summary);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * ========================================================
 * Team Mailbox, Threading & Task Linking Endpoints
 * ========================================================
 */

// GET /api/messages/mailbox - Consolidated thread-aware team mailbox
messagesRouter.get('/mailbox', async (req: Request, res: Response) => {
  try {
    const teamId = req.query.teamId as string | undefined;
    const filter = (req.query.filter as any) || 'all';
    const search = req.query.search as string | undefined;

    const threads = await messageIntakeService.getTeamMailbox(teamId || '', filter, search);
    return res.json(threads);
  } catch (err: any) {
    console.error('[messagesRouter] Error fetching team mailbox:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/messages/:messageId/link-issue - Link message and its thread to a newly created/existing issue
messagesRouter.put('/:messageId/link-issue', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const { issueId } = req.body;
    if (!issueId) {
      return res.status(400).json({ error: 'issueId is required.' });
    }

    const linked = await messageIntakeService.linkMessageToIssue(messageId, issueId);
    return res.json({ success: linked, messageId, issueId });
  } catch (err: any) {
    console.error('[messagesRouter] Error linking message to issue:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/reply - Reply directly within a mailbox thread
messagesRouter.post('/reply', async (req: Request, res: Response) => {
  try {
    const { teamId, channel, to, subject, textBody, htmlBody, conversationId, threadId, inReplyToMessageId } = req.body;
    if (!to || !textBody) {
      return res.status(400).json({ error: 'Recipient "to" and "textBody" are required.' });
    }

    const result = await messageIntakeService.replyToMessage(teamId || '', {
      channel: channel || 'email',
      to,
      subject: subject || 'Re: Message',
      textBody,
      htmlBody,
      conversationId,
      threadId,
      inReplyToMessageId
    });

    return res.status(201).json({ success: true, ...result });
  } catch (err: any) {
    console.error('[messagesRouter] Error sending reply:', err);
    return res.status(500).json({ error: err.message });
  }
});

