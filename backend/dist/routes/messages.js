/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Router } from 'express';
import { getChannelAdapter } from '../services/messaging/channelAdapters.js';
import { messageIntakeService } from '../services/messaging/messageIntakeService.js';
import { outboundDispatchService } from '../services/messaging/outboundDispatchService.js';
export const messagesRouter = Router();
/**
 * Inbound webhook for external channel events (Email, Teams, WhatsApp, Telegram).
 */
messagesRouter.post('/webhook/:channel', async (req, res) => {
    try {
        const channel = req.params.channel;
        const adapter = getChannelAdapter(channel);
        const signature = (req.headers['x-hub-signature-256'] || req.headers['authorization'] || req.headers['x-telegram-bot-api-secret-token']);
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
    }
    catch (err) {
        console.error('[messagesRouter] Webhook intake failure:', err);
        return res.status(500).json({ error: err.message });
    }
});
/**
 * Simulator endpoint for local testing of external channel interactions.
 */
messagesRouter.post('/simulator/send', async (req, res) => {
    try {
        const { channel, senderAddress, senderName, text, linkedIssueId, attachments } = req.body;
        if (!channel || !senderAddress || !text) {
            return res.status(400).json({ error: 'channel, senderAddress, and text are required.' });
        }
        const adapter = getChannelAdapter(channel);
        const mockPayload = {
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
    }
    catch (err) {
        console.error('[messagesRouter] Simulator failure:', err);
        return res.status(500).json({ error: err.message });
    }
});
/**
 * Inbox message log.
 */
messagesRouter.get('/inbox', async (req, res) => {
    try {
        const teamId = req.query.teamId;
        const issueId = req.query.issueId;
        const limit = parseInt(req.query.limit || '50', 10);
        const messages = await messageIntakeService.getRecentIncomingMessages(limit, teamId, issueId);
        return res.json(messages);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
/**
 * Outbox delivery log.
 */
messagesRouter.get('/outbox', async (req, res) => {
    try {
        const issueId = req.query.issueId;
        const limit = parseInt(req.query.limit || '50', 10);
        const messages = await outboundDispatchService.getOutboxMessages(limit, issueId);
        return res.json(messages);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
/**
 * Team Channel Configurations.
 */
messagesRouter.get('/configs/team/:teamId', async (req, res) => {
    try {
        const configs = await messageIntakeService.getTeamConfigurations(req.params.teamId);
        return res.json(configs);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
messagesRouter.post('/configs/team', async (req, res) => {
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
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
/**
 * Personal Channel Configurations.
 */
messagesRouter.get('/configs/personal/:userId', async (req, res) => {
    try {
        const configs = await messageIntakeService.getPersonalConfigurations(req.params.userId);
        return res.json(configs);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
messagesRouter.post('/configs/personal', async (req, res) => {
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
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
/**
 * ========================================================
 * Provider Connection & Active Fetch Management Endpoints
 * ========================================================
 */
// GET /api/messages/providers - List configured providers
messagesRouter.get('/providers', async (req, res) => {
    try {
        const { stagingService } = await import('../services/messaging/stagingService.js');
        const teamId = req.query.teamId;
        const userId = req.query.userId;
        const providers = await stagingService.getProviderConnections(teamId, userId);
        return res.json(providers);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/messages/providers - Create or update provider connection
messagesRouter.post('/providers', async (req, res) => {
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
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/messages/providers/:id/test - Test provider connection credentials
messagesRouter.post('/providers/:id/test', async (req, res) => {
    try {
        const { stagingService } = await import('../services/messaging/stagingService.js');
        const result = await stagingService.testProviderConnection(req.params.id);
        return res.json(result);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/messages/providers/:id/fetch - Trigger on-demand message fetch
messagesRouter.post('/providers/:id/fetch', async (req, res) => {
    try {
        const { stagingService } = await import('../services/messaging/stagingService.js');
        const result = await stagingService.fetchProviderMessages(req.params.id);
        return res.json({ success: true, ...result });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/messages/oauth2/test - Direct test of OAuth2 credentials & token acquisition
messagesRouter.post('/oauth2/test', async (req, res) => {
    try {
        const { oauth2Service } = await import('../services/messaging/oauth2Service.js');
        const { config, channel } = req.body;
        if (!config) {
            return res.status(400).json({ error: 'config is required.' });
        }
        const result = await oauth2Service.testOAuth2Credentials(config, channel || 'email');
        return res.json(result);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
/**
 * ========================================================
 * External Requests Staging Queue & Maker-Checker Endpoints
 * ========================================================
 */
// GET /api/messages/staging - List staged external requests with filters
messagesRouter.get('/staging', async (req, res) => {
    try {
        const { stagingService } = await import('../services/messaging/stagingService.js');
        const teamId = req.query.teamId;
        const assignedUserId = req.query.assignedUserId;
        const status = req.query.status;
        const urgency = req.query.urgency;
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
        const staged = await stagingService.getStagedMessages({
            teamId,
            assignedUserId,
            status,
            urgency,
            limit
        });
        return res.json(staged);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/messages/staging/:id - Single staged item inspection
messagesRouter.get('/staging/:id', async (req, res) => {
    try {
        const { stagingService } = await import('../services/messaging/stagingService.js');
        const item = await stagingService.getStagedMessageById(req.params.id);
        if (!item) {
            return res.status(404).json({ error: 'Staged message not found.' });
        }
        return res.json(item);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/messages/staging/:id/propose - Maker proposes task conversion
messagesRouter.post('/staging/:id/propose', async (req, res) => {
    try {
        const { stagingService } = await import('../services/messaging/stagingService.js');
        const { makerId, makerName, title, teamId, priority, notes } = req.body;
        if (!makerId) {
            return res.status(400).json({ error: 'makerId is required to propose task conversion.' });
        }
        const updated = await stagingService.proposeTaskConversion(req.params.id, { id: makerId, name: makerName || 'Operational Maker' }, { title, teamId, priority, notes });
        return res.json({ success: true, staged: updated });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/messages/staging/:id/approve - Checker approves task conversion (Anti-Self-Approval enforced)
messagesRouter.post('/staging/:id/approve', async (req, res) => {
    try {
        const { stagingService } = await import('../services/messaging/stagingService.js');
        const { checkerId, checkerName, reviewNotes } = req.body;
        if (!checkerId) {
            return res.status(400).json({ error: 'checkerId is required.' });
        }
        const result = await stagingService.approveAndConvertTask(req.params.id, { id: checkerId, name: checkerName || 'Operational Supervisor' }, reviewNotes);
        return res.json({ success: true, ...result });
    }
    catch (err) {
        if (err.message.includes('Anti-Self-Approval')) {
            return res.status(403).json({ error: err.message });
        }
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/messages/staging/:id/reject - Reject staged request
messagesRouter.post('/staging/:id/reject', async (req, res) => {
    try {
        const { stagingService } = await import('../services/messaging/stagingService.js');
        const { actorId, actorName, reason } = req.body;
        const updated = await stagingService.rejectStagedMessage(req.params.id, { id: actorId || 'sys', name: actorName || 'Reviewer' }, reason || 'Rejected during triage');
        return res.json({ success: true, staged: updated });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/messages/staging/:id/create-task - Direct conversion or approval
messagesRouter.post('/staging/:id/create-task', async (req, res) => {
    try {
        const { stagingService } = await import('../services/messaging/stagingService.js');
        const { actorId, actorName, notes } = req.body;
        const result = await stagingService.approveAndConvertTask(req.params.id, { id: actorId || 'usr-supervisor', name: actorName || 'Lead Operator' }, notes);
        return res.json({ success: true, ...result });
    }
    catch (err) {
        if (err.message.includes('Anti-Self-Approval')) {
            return res.status(403).json({ error: err.message });
        }
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/messages/staging/:id/escalate - Escalate to another team
messagesRouter.post('/staging/:id/escalate', async (req, res) => {
    try {
        const { stagingService } = await import('../services/messaging/stagingService.js');
        const { targetTeamId, actorId, actorName, reason } = req.body;
        if (!targetTeamId) {
            return res.status(400).json({ error: 'targetTeamId is required.' });
        }
        const updated = await stagingService.escalateStagedMessage(req.params.id, targetTeamId, { id: actorId || 'operator', name: actorName || 'Lead' }, reason || 'Escalated from triage queue');
        return res.json({ success: true, staged: updated });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/messages/summary or /api/external-requests/summary - Summary dashboard metrics
messagesRouter.get('/summary', async (req, res) => {
    try {
        const { stagingService } = await import('../services/messaging/stagingService.js');
        const teamId = req.query.teamId;
        const summary = await stagingService.getExternalRequestSummary(teamId);
        return res.json(summary);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
