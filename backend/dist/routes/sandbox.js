/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Router } from 'express';
import { sandboxExecutionService } from '../services/sandboxExecutionService.js';
export const sandboxRouter = Router();
// POST /api/sandbox/simulate - Execute workflow in isolated sandbox context
sandboxRouter.post('/simulate', async (req, res) => {
    try {
        const { workflowId, records, keyField, keyFields, executedBy, options } = req.body;
        if (!workflowId) {
            return res.status(400).json({ error: 'workflowId is required.' });
        }
        const result = await sandboxExecutionService.simulateWorkflow({
            workflowId,
            records: records || [],
            keyField,
            keyFields,
            executedBy,
            options
        });
        return res.json(result);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/sandbox/history/:workflowId - Get historical sandbox execution evidence
sandboxRouter.get('/history/:workflowId', async (req, res) => {
    try {
        const { workflowId } = req.params;
        const history = sandboxExecutionService.getSandboxHistory(workflowId);
        return res.json(history);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
