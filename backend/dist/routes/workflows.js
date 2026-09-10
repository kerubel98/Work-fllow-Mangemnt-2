import { Router } from 'express';
import { repo } from '../store/repository.js';
export const workflowsRouter = Router();
// GET /api/workflows - List all workflows
workflowsRouter.get('/', async (_req, res) => {
    try {
        const workflows = await repo.getWorkflows();
        return res.json(workflows);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/workflows/:id - Get workflow by ID
workflowsRouter.get('/:id', async (req, res) => {
    try {
        const wf = await repo.getWorkflowById(req.params.id);
        if (!wf)
            return res.status(404).json({ error: 'Workflow not found' });
        return res.json(wf);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/workflows - Create a new stage-aware workflow
workflowsRouter.post('/', async (req, res) => {
    try {
        const data = req.body;
        if (!data.name) {
            return res.status(400).json({ error: 'Workflow name is required' });
        }
        const workflowId = data.id || `wf-${Date.now()}`;
        const stages = (data.stages && data.stages.length > 0)
            ? data.stages.map((st, idx) => ({
                id: st.id || `stage-${Date.now()}-${idx + 1}`,
                name: st.name || `Stage ${idx + 1}`,
                description: st.description || '',
                order: st.order !== undefined ? st.order : idx + 1,
                enabled: st.enabled !== undefined ? st.enabled : true,
                targetDbId: st.targetDbId || data.targetDbId || 'db-1',
                targetDataSource: st.targetDataSource || data.targetTable || 'transactions',
                businessMeaning: st.businessMeaning,
                createdAt: new Date().toISOString()
            }))
            : [
                {
                    id: `stage-${workflowId}-1`,
                    name: 'Primary Processing Stage',
                    description: 'Default business stage',
                    order: 1,
                    enabled: true,
                    targetDbId: data.targetDbId || 'db-1',
                    targetDataSource: data.targetTable || 'transactions',
                    businessMeaning: 'Primary Ingress'
                }
            ];
        const steps = (data.steps && data.steps.length > 0)
            ? data.steps.map((s, idx) => ({
                id: s.id || `step-${Date.now()}-${idx + 1}`,
                stepNumber: s.stepNumber || idx + 1,
                name: s.name || `Step ${idx + 1}`,
                description: s.description || '',
                stageId: s.stageId || stages[0].id,
                checkType: s.checkType || 'EXISTENCE_CHECK',
                targetDbId: s.targetDbId || stages[0].targetDbId || 'db-1',
                targetTable: s.targetTable || stages[0].targetDataSource || 'transactions',
                sqlCondition: s.sqlCondition,
                sourceField: s.sourceField || 'transaction_id',
                comparator: s.comparator || '=',
                targetField: s.targetField,
                compareValue: s.compareValue,
                toleranceMargin: s.toleranceMargin,
                dualSourceCondition: s.dualSourceCondition,
                regexPattern: s.regexPattern,
                requiredParams: s.requiredParams || ['transaction_id'],
                optionalParams: s.optionalParams || [],
                dependencyCondition: s.dependencyCondition || (idx === 0 ? 'ALWAYS' : 'IF_PREV_SUCCESS'),
                onPassAction: s.onPassAction || 'CONTINUE',
                onFailAction: s.onFailAction || 'STOP',
                onErrorAction: s.onErrorAction || 'STOP',
                reportColumnName: s.reportColumnName,
                reportField: s.reportField,
                successMessage: s.successMessage || 'Check passed successfully.',
                failureMessage: s.failureMessage || 'Check failed criteria.',
                severityOnFailure: s.severityOnFailure || 'WARNING'
            }))
            : [];
        const newWorkflow = {
            id: workflowId,
            name: data.name,
            description: data.description || '',
            targetDbId: data.targetDbId || (stages[0]?.targetDbId) || 'db-1',
            targetTable: data.targetTable || (stages[0]?.targetDataSource) || 'transactions',
            category: data.category || 'Reconciliation',
            stages,
            steps,
            nodes: data.nodes || [],
            connections: data.connections || [],
            globalSuccessMessage: data.globalSuccessMessage || 'All stages reconciled successfully.',
            globalFailureMessage: data.globalFailureMessage || 'Investigation identified stage discrepancy.',
            createdBy: data.createdBy || 'operator',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isSystemDefault: false,
            version: data.version || '2.0.0'
        };
        const saved = await repo.createWorkflow(newWorkflow);
        return res.status(201).json(saved);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PUT /api/workflows/:id - Update workflow
workflowsRouter.put('/:id', async (req, res) => {
    try {
        const updated = await repo.updateWorkflow(req.params.id, req.body);
        if (!updated)
            return res.status(404).json({ error: 'Workflow not found' });
        return res.json(updated);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// DELETE /api/workflows/:id - Delete workflow
workflowsRouter.delete('/:id', async (req, res) => {
    try {
        const success = await repo.deleteWorkflow(req.params.id);
        if (!success)
            return res.status(404).json({ error: 'Workflow not found' });
        return res.json({ success: true, message: 'Workflow deleted successfully' });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// ================= QUERY EXTRACTIONS =================
// GET /api/workflows/:id/query-extractions
workflowsRouter.get('/:id/query-extractions', async (req, res) => {
    try {
        const extractions = await repo.getQueryExtractionsByWorkflowId(req.params.id);
        return res.json(extractions);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/workflows/:id/query-extractions
workflowsRouter.post('/:id/query-extractions', async (req, res) => {
    try {
        const extractionData = req.body;
        const extraction = {
            id: extractionData.id || `qe-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            workflowId: req.params.id,
            stageId: extractionData.stageId || '',
            targetDbId: extractionData.targetDbId || 'db-1',
            targetDataSource: extractionData.targetDataSource || 'transactions',
            selectedColumns: extractionData.selectedColumns || [],
            keyMappings: extractionData.keyMappings || [{ inputField: 'transaction_id', sourceField: 'transaction_id', required: true }],
            filters: extractionData.filters || [],
            batchPolicy: extractionData.batchPolicy,
            enabled: extractionData.enabled !== undefined ? extractionData.enabled : true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        const saved = await repo.createQueryExtraction(extraction);
        return res.status(201).json(saved);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// PUT /api/workflows/query-extractions/:id
workflowsRouter.put('/query-extractions/:id', async (req, res) => {
    try {
        const updated = await repo.updateQueryExtraction(req.params.id, req.body);
        if (!updated)
            return res.status(404).json({ error: 'QueryExtraction not found' });
        return res.json(updated);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// DELETE /api/workflows/query-extractions/:id
workflowsRouter.delete('/query-extractions/:id', async (req, res) => {
    try {
        const success = await repo.deleteQueryExtraction(req.params.id);
        if (!success)
            return res.status(404).json({ error: 'QueryExtraction not found' });
        return res.json({ success: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/workflows/query-sandbox/preview
workflowsRouter.post('/query-sandbox/preview', async (req, res) => {
    try {
        const { extraction, sampleKeys } = req.body;
        if (!extraction) {
            return res.status(400).json({ error: 'extraction configuration required' });
        }
        const chunk = {
            chunkId: 'sample-preview',
            sequence: 1,
            transactionIds: sampleKeys && sampleKeys.length > 0 ? sampleKeys.slice(0, 5) : ['TX-001', 'TX-002']
        };
        const primaryKey = extraction.keyMappings && extraction.keyMappings.length > 0
            ? extraction.keyMappings[0].sourceField
            : 'transaction_id';
        const columns = extraction.selectedColumns && extraction.selectedColumns.length > 0
            ? extraction.selectedColumns.map((c) => c.alias ? `${c.sourceColumn} AS ${c.alias}` : c.sourceColumn).join(', ')
            : '*';
        const placeholders = chunk.transactionIds.map(() => '?').join(', ');
        const sql = `SELECT ${columns} FROM ${extraction.targetDataSource || 'transactions'} WHERE ${primaryKey} IN (${placeholders});`;
        return res.json({
            sql,
            parameters: chunk.transactionIds,
            chunk
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
