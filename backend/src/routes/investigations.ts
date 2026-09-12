/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { repo } from '../store/repository.js';
import { planInvestigation } from '../services/investigationPlanner.js';
import { executeWorkflowForTransaction } from '../services/investigationEngine.js';
import { executeExternalChunkQuery } from '../services/externalDataQueryService.js';
import { aggregateParentIssueStatus } from '../services/statusAggregator.js';
import { investigationOrchestratorService } from '../services/investigationOrchestratorService.js';
import {
  InvestigationTask,
  InvestigationBatch,
  InvestigationTransaction,
  RuleExecutionAuditEntry
} from '../types.js';

export const investigationsRouter = Router();

// POST /api/investigations/plan - Validate and generate execution plan
investigationsRouter.post('/plan', async (req: Request, res: Response) => {
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
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/investigations/start - Initiate a persisted investigation task and execute
investigationsRouter.post('/start', async (req: Request, res: Response) => {
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
    const task: InvestigationTask = {
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
    const txnMap = new Map<string, Record<string, any>>();
    (transactions || []).forEach((t: any, idx: number) => {
      const k = String(t[txnKeyField] ?? t.id ?? t.tx_id ?? `TX-${idx + 1}`);
      txnMap.set(k, t);
    });

    // Initialize batch records
    for (const batchPlan of plan.batches) {
      const batchRecord: InvestigationBatch = {
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
    const executedTask = await investigationOrchestratorService.executeInvestigationTask(
      taskId,
      workflow,
      extractions,
      transactions || [],
      txnKeyField
    );

    const createdTxns = await repo.getInvestigationTransactionsByTaskId(taskId);
    const parentAggregation = aggregateParentIssueStatus(createdTxns);

    return res.status(201).json({
      task: executedTask,
      parentAggregation,
      transactions: createdTxns
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/investigations/:id - Get task details
investigationsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const task = await repo.getInvestigationTaskById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Investigation task not found' });
    const batches = await repo.getInvestigationBatchesByTaskId(req.params.id);
    return res.json({ task, batches });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/investigations/:id/batches
investigationsRouter.get('/:id/batches', async (req: Request, res: Response) => {
  try {
    const batches = await repo.getInvestigationBatchesByTaskId(req.params.id);
    return res.json(batches);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/investigations/:id/transactions
investigationsRouter.get('/:id/transactions', async (req: Request, res: Response) => {
  try {
    const txns = await repo.getInvestigationTransactionsByTaskId(req.params.id);
    return res.json(txns);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/investigations/:id/transactions/:transactionId
investigationsRouter.get('/:id/transactions/:transactionId', async (req: Request, res: Response) => {
  try {
    const tx = await repo.getInvestigationTransaction(req.params.id, req.params.transactionId);
    if (!tx) return res.status(404).json({ error: 'Transaction record not found' });
    return res.json(tx);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/investigations/:id/audit - Aggregated audit trail for task
investigationsRouter.get('/:id/audit', async (req: Request, res: Response) => {
  try {
    const txns = await repo.getInvestigationTransactionsByTaskId(req.params.id);
    const auditEntries: RuleExecutionAuditEntry[] = [];
    txns.forEach(t => {
      if (t.auditTrail) auditEntries.push(...t.auditTrail);
    });
    return res.json(auditEntries);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/investigations/resume-paused - Resumes execution for paused transactions
investigationsRouter.post('/resume-paused', async (req: Request, res: Response) => {
  try {
    const { workflowId, records, keyField } = req.body;
    if (!workflowId || !records || !Array.isArray(records)) {
      return res.status(400).json({ error: 'workflowId and records array are required' });
    }
    const result = await investigationOrchestratorService.resumePausedTransactions(
      workflowId,
      records,
      keyField || 'retrieval_ref_num'
    );
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Error resuming paused transactions' });
  }
});

// POST /api/investigations/execute-universal - Universal workflow runner for Sandbox, Panel, or API
investigationsRouter.post('/execute-universal', async (req: Request, res: Response) => {
  try {
    const { workflowId, records, sourceType, sourceId, keyField, keyFields, priority, options, forceRerun, executedBy } = req.body;
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
      keyField,
      keyFields: Array.isArray(keyFields) ? keyFields : undefined,
      priority: priority || 'HIGH',
      options,
      forceRerun: !!forceRerun,
      executedBy: executedBy || (req as any).user?.name || (req as any).user?.username || 'investigator'
    } as any);

    return res.json(result);
  } catch (err: any) {
    console.error('Error in execute-universal:', err);
    return res.status(500).json({ error: err.message || 'Internal workflow execution error' });
  }
});


// GET /api/investigations/:taskId/central-records - Dedicated Sheet 1 Master Ledger ingress
investigationsRouter.get('/:taskId/central-records', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const records = await repo.getCentralTransactionsByTaskId(taskId);
    return res.json({
      taskId,
      totalCount: records.length,
      records: records.map(r => ({
        ...r.canonicalData,
        _transactionKey: r.transactionKey,
        _originalTaskId: r.originalTaskId,
        _currentTaskId: r.currentTaskId,
        _batchId: r.batchId,
        _rowNumber: r.rowNumber,
        _status: r.status,
        _isDuplicate: !!r.isDuplicate,
        _duplicateFromTaskId: r.duplicateFromTaskId,
        _duplicateCount: r.duplicateCount || 1,
        _duplicateStatus: r.duplicateStatus || 'ORIGINAL',
        _allTaskIds: r.allTaskIds || [],
        _createdAt: r.createdAt
      }))
    });
  } catch (err: any) {
    console.error('Error fetching central records for task:', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/investigations/:taskId/workflow-executions - List completed/cached workflows for a task
investigationsRouter.get('/:taskId/workflow-executions', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const executions = await repo.getTaskWorkflowExecutionsByTaskId(taskId);
    return res.json({ taskId, count: executions.length, executions });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/investigations/duplicates/scan - Run stored procedure to detect cross-task collisions
investigationsRouter.post('/duplicates/scan', async (_req: Request, res: Response) => {
  try {
    const flaggedCount = await repo.runCrossTaskDuplicateScan();
    const { eventService } = await import('../services/events.js');
    eventService.broadcastEvent('central:duplicates_scanned', { flaggedCount, timestamp: new Date().toISOString() });
    return res.json({ success: true, flaggedCount, message: `Scanned and flagged ${flaggedCount} cross-task duplicates.` });
  } catch (err: any) {
    console.error('Error running duplicate scan procedure:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/investigations/transactions/:key/move-to-task - Reassign ownership to a single task exclusively
investigationsRouter.post('/transactions/:key/move-to-task', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { targetTaskId } = req.body;
    if (!targetTaskId) {
      return res.status(400).json({ error: 'targetTaskId is required' });
    }
    await repo.moveTransactionToTask(key, targetTaskId);
    const { eventService } = await import('../services/events.js');
    eventService.broadcastEvent('central:transaction_moved', { transactionKey: key, targetTaskId });
    return res.json({ success: true, message: `Transaction '${key}' moved exclusively to task '${targetTaskId}'` });
  } catch (err: any) {
    console.error('Error moving transaction to task:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/investigations/transactions/:key/remove-from-task - Detach transaction from a task
investigationsRouter.post('/transactions/:key/remove-from-task', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { taskId } = req.body;
    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }
    await repo.removeTransactionFromTask(key, taskId);
    const { eventService } = await import('../services/events.js');
    eventService.broadcastEvent('central:transaction_removed', { transactionKey: key, taskId });
    return res.json({ success: true, message: `Transaction '${key}' removed from task '${taskId}'` });
  } catch (err: any) {
    console.error('Error removing transaction from task:', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/investigations/:taskId/workflow-executions - Clear all validation run history for a specific task
investigationsRouter.delete('/:taskId/workflow-executions', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const deleted = await repo.clearTaskWorkflowExecutions(taskId);
    const { eventService } = await import('../services/events.js');
    eventService.broadcastEvent('investigation:executions_cleared', { taskId, deleted });
    return res.json({
      success: true,
      taskId,
      deleted,
      message: `Cleared ${deleted} validation execution record(s) for task '${taskId}'.`
    });
  } catch (err: any) {
    console.error('Error clearing task workflow executions:', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/investigations/executions/clear-all - Wipe ALL validation run data (global reset)
investigationsRouter.delete('/executions/clear-all', async (_req: Request, res: Response) => {
  try {
    const result = await repo.clearAllValidationExecutions();
    const { eventService } = await import('../services/events.js');
    eventService.broadcastEvent('investigation:all_cleared', result);
    return res.json({
      success: true,
      message: `All validation check history cleared. Removed: ${result.executions} executions, ${result.tasks} tasks, ${result.batches} batches, ${result.transactions} transactions.`,
      ...result
    });
  } catch (err: any) {
    console.error('Error clearing all validation executions:', err);
    return res.status(500).json({ error: err.message });
  }
});

