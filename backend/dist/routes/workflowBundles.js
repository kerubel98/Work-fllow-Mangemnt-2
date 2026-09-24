/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Router } from 'express';
import { workflowBundleService } from '../services/workflowBundleService.js';
export const workflowBundlesRouter = Router();
// GET /api/workflow-bundles - List bundles
workflowBundlesRouter.get('/', async (req, res) => {
    try {
        const { teamId, scope, status, makerId } = req.query;
        const bundles = await workflowBundleService.getBundles({
            teamId: teamId,
            scope: scope,
            status: status,
            makerId: makerId
        });
        return res.json(bundles);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/workflow-bundles/:id - Get single bundle with evidence snapshot
workflowBundlesRouter.get('/:id', async (req, res) => {
    try {
        const bundle = await workflowBundleService.getBundleById(req.params.id);
        if (!bundle) {
            return res.status(404).json({ error: `Workflow bundle '${req.params.id}' not found.` });
        }
        return res.json(bundle);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/workflow-bundles - Create composite workflow bundle (Maker)
workflowBundlesRouter.post('/', async (req, res) => {
    try {
        const { name, description, version, scope, workflowId, validationBoxIds, dbCheckIds, sourceTeamId, makerId, makerName, hashtagBindings } = req.body;
        if (!name || !workflowId || !sourceTeamId || !makerId) {
            return res.status(400).json({
                error: 'name, workflowId, sourceTeamId, and makerId are required.'
            });
        }
        const created = await workflowBundleService.createBundle({
            name,
            description,
            version,
            scope,
            workflowId,
            validationBoxIds,
            dbCheckIds,
            sourceTeamId,
            makerId,
            makerName: makerName || makerId,
            hashtagBindings
        });
        return res.status(201).json(created);
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// POST /api/workflow-bundles/:id/propose - Propose bundle promotion
workflowBundlesRouter.post('/:id/propose', async (req, res) => {
    try {
        const { id } = req.params;
        const { targetScope, makerId, makerName } = req.body;
        if (!targetScope || !makerId) {
            return res.status(400).json({ error: 'targetScope and makerId are required.' });
        }
        const proposed = await workflowBundleService.proposePromotion(id, targetScope, makerId, makerName || makerId);
        return res.json(proposed);
    }
    catch (err) {
        return res.status(400).json({ error: err.message });
    }
});
// POST /api/workflow-bundles/:id/review - Review promotion (Checker Dual Authorization)
workflowBundlesRouter.post('/:id/review', async (req, res) => {
    try {
        const { id } = req.params;
        const { checkerId, checkerName, action, feedback } = req.body;
        if (!checkerId || !action) {
            return res.status(400).json({ error: 'checkerId and action (APPROVE/REJECT) are required.' });
        }
        const reviewed = await workflowBundleService.reviewPromotion(id, checkerId, checkerName || 'Checker Supervisor', action, feedback);
        return res.json(reviewed);
    }
    catch (err) {
        if (err.message && err.message.includes('Anti-Self-Approval')) {
            return res.status(403).json({ error: err.message });
        }
        return res.status(400).json({ error: err.message });
    }
});
