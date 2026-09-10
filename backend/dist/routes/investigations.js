/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Router } from 'express';
import { repo } from '../store/repository.js';
import { planInvestigation } from '../services/investigationPlanner.js';
import { aggregateParentIssueStatus } from '../services/statusAggregator.js';
export const investigationsRouter = Router();
// POST /api/investigations/plan - Validate and generate execution plan
investigationsRouter.post('/plan', async (req, res) => {
    try {
        const { transactions, workflowId, batchPolicy, keyField } = req.body;
        const workflow = await repo.getWorkflowById(workflowId);
        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found' });
        }
        const extractions = await repo.getQueryExtractionsByWorkflowId(workflowId);
        const planResult = planInvestigation(transactions || [], workflow, extractions, {
            transactionKeyField: keyField,
            batchPolicy
        });
        return res.json(planResult);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/investigations/start - Initiate a persisted investigation task and execute
investigationsRouter.post('/start', async (req, res) => {
    try {
        const { transactions, workflowId, issueId, teamTaskId, batchPolicy, keyField } = req.body;
        const workflow = await repo.getWorkflowById(workflowId);
        if (!workflow) {
            return res.status(404).json({ error: 'Workflow not found' });
        }
        const extractions = await repo.getQueryExtractionsByWorkflowId(workflowId);
        const planResult = planInvestigation(transactions || [], workflow, extractions, {
            transactionKeyField: keyField,
            batchPolicy
        });
        if (!planResult.isValid || !planResult.plan) {
            return res.status(400).json({ error: 'Investigation plan invalid', details: planResult.errors });
        }
        const plan = planResult.plan;
        const taskId = `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        // Create InvestigationTask record
        const task = {
            id: taskId,
            workflowId,
            workflowName: workflow.name,
            issueId,
            teamTaskId,
            totalTransactions: plan.transactionCount,
            processedTransactions: 0,
            reconciledTransactions: 0,
            flaggedTransactions: 0,
            closedTransactions: 0,
            failedTransactions: 0,
            status: 'RUNNING',
            executionPlan: plan,
            createdAt: new Date().toISOString(),
            startedAt: new Date().toISOString()
        };
        await repo.createInvestigationTask(task);
        // Group transactions by key
        const txnKeyField = keyField || 'transaction_id';
        const txnMap = new Map();
        (transactions || []).forEach((t, idx) => {
            const k = String(t[txnKeyField] ?? t.id ?? t.tx_id ?? `TX-${idx + 1}`);
            txnMap.set(k, t);
        });
        // Initialize batch records
        for (const batchPlan of plan.batches) {
            const batchRecord = {
                id: batchPlan.batchId,
                taskId,
                sequence: batchPlan.sequence,
                transactionCount: batchPlan.transactionIds.length,
                processedCount: 0,
                status: 'PENDING'
            };
            await repo.createInvestigationBatch(batchRecord);
        }
        const { investigationOrchestratorService } = await import('../services/investigationOrchestratorService.js');
        // Execute with batching, PostgreSQL mirror persistence and set reconciliation
        const executedTask = await investigationOrchestratorService.executeInvestigationTask(taskId, workflow, extractions, transactions || [], txnKeyField);
        const createdTxns = await repo.getInvestigationTransactionsByTaskId(taskId);
        const parentAggregation = aggregateParentIssueStatus(createdTxns);
        return res.status(201).json({
            task: executedTask,
            parentAggregation,
            transactions: createdTxns
        });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/investigations/:id - Get task details
investigationsRouter.get('/:id', async (req, res) => {
    try {
        const task = await repo.getInvestigationTaskById(req.params.id);
        if (!task)
            return res.status(404).json({ error: 'Investigation task not found' });
        const batches = await repo.getInvestigationBatchesByTaskId(req.params.id);
        return res.json({ task, batches });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/investigations/:id/batches
investigationsRouter.get('/:id/batches', async (req, res) => {
    try {
        const batches = await repo.getInvestigationBatchesByTaskId(req.params.id);
        return res.json(batches);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/investigations/:id/transactions
investigationsRouter.get('/:id/transactions', async (req, res) => {
    try {
        const txns = await repo.getInvestigationTransactionsByTaskId(req.params.id);
        return res.json(txns);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/investigations/:id/transactions/:transactionId
investigationsRouter.get('/:id/transactions/:transactionId', async (req, res) => {
    try {
        const tx = await repo.getInvestigationTransaction(req.params.id, req.params.transactionId);
        if (!tx)
            return res.status(404).json({ error: 'Transaction record not found' });
        return res.json(tx);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/investigations/:id/audit - Aggregated audit trail for task
investigationsRouter.get('/:id/audit', async (req, res) => {
    try {
        const txns = await repo.getInvestigationTransactionsByTaskId(req.params.id);
        const auditEntries = [];
        txns.forEach(t => {
            if (t.auditTrail)
                auditEntries.push(...t.auditTrail);
        });
        return res.json(auditEntries);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// POST /api/investigations/execute-universal - Universal workflow runner for Sandbox, Panel, or API
investigationsRouter.post('/execute-universal', async (req, res) => {
    try {
        const { workflowId, records, sourceType, sourceId, keyField, priority, options } = req.body;
        if (!workflowId) {
            return res.status(400).json({ error: 'workflowId is required' });
        }
        if (!records || !Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ error: 'records array is required and must not be empty' });
        }
        const { investigationOrchestratorService } = await import('../services/investigationOrchestratorService.js');
        const result = await investigationOrchestratorService.executeUniversalWorkflow({
            workflowId,
            records,
            sourceType: sourceType || 'QUERY_SANDBOX',
            sourceId,
            keyField: keyField || 'retrieval_ref_num',
            priority: priority || 'HIGH',
            options
        });
        return res.json(result);
    }
    catch (err) {
        console.error('Error in execute-universal:', err);
        return res.status(500).json({ error: err.message || 'Internal workflow execution error' });
    }
});
