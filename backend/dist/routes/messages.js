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
