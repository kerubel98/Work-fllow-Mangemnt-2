/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Router } from 'express';
import { escalationService } from '../services/escalationService.js';
export const escalationsRouter = Router();
// GET /api/escalations/issue/:issueId - List escalation history for an issue room
escalationsRouter.get('/issue/:issueId', async (req, res) => {
    try {
        const { issueId } = req.params;
        const events = await escalationService.getEscalationsForIssue(issueId);
        return res.json(events);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/escalations/command - Execute structured operational command
escalationsRouter.post('/command', async (req, res) => {
    try {
        const { issueId, actionType, targetTeamId, reason, actorId, actorName, idempotencyKey, payload } = req.body;
        if (!issueId || !actionType || !actorId) {
            return res.status(400).json({ error: 'issueId, actionType, and actorId are required.' });
        }
        const result = await escalationService.executeActionCommand({
            issueId,
            actionType,
            targetTeamId,
            reason,
            actorId,
            actorName: actorName || 'Operator',
            idempotencyKey,
            payload
        });
        if (result.duplicateSuppressed) {
            return res.status(409).json(result);
        }
        return res.status(201).json(result);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PATCH /api/escalations/:id/status - Transition escalation lifecycle state
escalationsRouter.patch('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ error: 'status is required.' });
        }
        const updated = await escalationService.transitionStatus(id, status);
        return res.json(updated);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
