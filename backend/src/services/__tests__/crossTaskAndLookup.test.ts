import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getPostgresPool } from '../../config/postgres.js';
import { repo } from '../../store/repository.js';
import { investigationOrchestratorService } from '../investigationOrchestratorService.js';

describe('Task Workflow Executions Lookup & Cross-Task Duplicates', () => {
  const pool = getPostgresPool();
  const testTaskId = 'TASK-TEST-LOOKUP-101';
  const testWorkflowId = 'wf-1789049056364';

  beforeAll(async () => {
    // Clean up test data
    await pool.query("DELETE FROM task_workflow_executions WHERE task_id LIKE 'TASK-TEST-%'");
    await pool.query("DELETE FROM central_transaction_repository WHERE task_id LIKE 'TASK-TEST-%'");

    // Ensure test workflow exists
    await repo.createWorkflow({
      id: testWorkflowId,
      name: 'Test Lookup Workflow',
      category: 'Reconciliation',
      targetDbId: 'db-1',
      targetTable: 'transactions',
      stages: [],
      steps: [
        {
          id: 'step-1',
          name: 'Amount Check',
          checkType: 'AMOUNT_MATCH',
          sourceField: 'amount',
          targetField: 'amount',
          stepNumber: 1,
          targetDbId: 'db-1',
          targetTable: 'transactions',
          dependencyCondition: 'ALWAYS',
          onErrorAction: 'STOP',
          onPassAction: 'CONTINUE',
          onFailAction: 'STOP'
        }
      ],
      createdAt: new Date().toISOString()
    });
  });

  afterAll(async () => {
    await pool.query("DELETE FROM task_workflow_executions WHERE task_id LIKE 'TASK-TEST-%'");
    await pool.query("DELETE FROM central_transaction_repository WHERE task_id LIKE 'TASK-TEST-%'");
    try {
      await repo.deleteWorkflow(testWorkflowId);
    } catch {}
  });

  describe('Task-Workflow Execution Lookup Table', () => {
    it('returns null if workflow has not yet been executed on task', async () => {
      const exec = await repo.getTaskWorkflowExecution(testTaskId, testWorkflowId);
      expect(exec).toBeNull();
    });

    it('records and retrieves execution details in task_workflow_executions', async () => {
      const saved = await repo.recordTaskWorkflowExecution({
        taskId: testTaskId,
        workflowId: testWorkflowId,
        workflowName: 'Test Workflow',
        status: 'COMPLETED',
        totalRecords: 50,
        passedCount: 45,
        failedCount: 5,
        durationMs: 120,
        executionSummary: { sample: 'result_meta' },
        executedBy: 'test_runner'
      });

      expect(saved).toBeDefined();
      expect(saved.taskId).toBe(testTaskId);
      expect(saved.workflowId).toBe(testWorkflowId);
      expect(saved.passedCount).toBe(45);
      expect(saved.failedCount).toBe(5);

      // Verify retrieval
      const retrieved = await repo.getTaskWorkflowExecution(testTaskId, testWorkflowId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.taskId).toBe(testTaskId);
      expect(retrieved?.workflowId).toBe(testWorkflowId);
      expect(retrieved?.passedCount).toBe(45);
    });

    it('bypasses duplicate rerun and serves cached evaluation when already run', async () => {
      const records = [
        { transaction_id: 'TX-LOOKUP-01', amount: 100, currency: 'USD' },
        { transaction_id: 'TX-LOOKUP-02', amount: 200, currency: 'USD' }
      ];

      // First run: executes and records into lookup
      const res1 = await investigationOrchestratorService.executeUniversalWorkflow({
        workflowId: testWorkflowId,
        records,
        sourceType: 'INVESTIGATION_PANEL',
        sourceId: testTaskId,
        keyField: 'transaction_id',
        forceRerun: true
      });

      expect(res1).toBeDefined();
      expect(res1.passedCount).toBeGreaterThanOrEqual(0);

      // Second run: lookup table detects (testTaskId, testWorkflowId) and returns cached evaluation without repeat
      const res2 = await investigationOrchestratorService.executeUniversalWorkflow({
        workflowId: testWorkflowId,
        records,
        sourceType: 'INVESTIGATION_PANEL',
        sourceId: testTaskId,
        keyField: 'transaction_id'
      });

      expect((res2 as any).cached).toBe(true);
      expect(res2.passedCount).toBe(res1.passedCount);

      // Third run with forceRerun: true bypasses cached lookup and evaluates fresh
      const res3 = await investigationOrchestratorService.executeUniversalWorkflow({
        workflowId: testWorkflowId,
        records,
        sourceType: 'INVESTIGATION_PANEL',
        sourceId: testTaskId,
        keyField: 'transaction_id',
        forceRerun: true
      });

      expect((res3 as any).cached).toBeFalsy();
    });
  });

  describe('PostgreSQL Cross-Task Duplicate Detection & Resolution Stored Procedures', () => {
    const dupTxnId = 'TXN-DUP-SHARED-999';
    const taskA = 'TASK-TEST-A';
    const taskB = 'TASK-TEST-B';

    it('detects cross-task duplicate transactions via sp_detect_and_flag_cross_task_duplicates', async () => {
      // Ingest duplicate record under Task A
      await pool.query(
        "INSERT INTO central_transaction_repository (" +
        "transaction_key, task_id, original_task_id, current_task_id, batch_id, all_task_ids, is_duplicate, duplicate_count, canonical_data, raw_data" +
        ") VALUES ($1, $2, $2, $2, $3, $4, false, 1, $5, $5) " +
        "ON CONFLICT (transaction_key) DO UPDATE SET canonical_data = EXCLUDED.canonical_data",
        [taskA + '_' + dupTxnId, taskA, 'BATCH-001', JSON.stringify([taskA]), JSON.stringify({ transaction_id: dupTxnId, amount: 500 })]
      );

      // Ingest same transaction_id under Task B
      await pool.query(
        "INSERT INTO central_transaction_repository (" +
        "transaction_key, task_id, original_task_id, current_task_id, batch_id, all_task_ids, is_duplicate, duplicate_count, canonical_data, raw_data" +
        ") VALUES ($1, $2, $2, $2, $3, $4, false, 1, $5, $5) " +
        "ON CONFLICT (transaction_key) DO UPDATE SET canonical_data = EXCLUDED.canonical_data",
        [taskB + '_' + dupTxnId, taskB, 'BATCH-001', JSON.stringify([taskB]), JSON.stringify({ transaction_id: dupTxnId, amount: 500 })]
      );

      // Run stored procedure via repository
      const flaggedCount = await repo.runCrossTaskDuplicateScan();
      expect(flaggedCount).toBeGreaterThanOrEqual(2);

      // Verify records are flagged as duplicates
      const checkA = await pool.query(
        'SELECT is_duplicate, duplicate_count, all_task_ids FROM central_transaction_repository WHERE transaction_key = $1',
        [taskA + '_' + dupTxnId]
      );
      expect(checkA.rows[0].is_duplicate).toBe(true);
      expect(checkA.rows[0].duplicate_count).toBe(2);
      expect(checkA.rows[0].all_task_ids).toContain(taskA);
      expect(checkA.rows[0].all_task_ids).toContain(taskB);
    });

    it('moves transaction exclusively to target task via sp_move_transaction_to_task', async () => {
      const keyA = taskA + '_' + dupTxnId;
      await repo.moveTransactionToTask(keyA, taskA);

      // Verify that after move, record is marked exclusive to Task A
      const checkAfter = await pool.query(
        'SELECT task_id, is_duplicate, duplicate_count, all_task_ids, duplicate_status FROM central_transaction_repository WHERE transaction_key = $1',
        [keyA]
      );
      expect(checkAfter.rows[0].task_id).toBe(taskA);
      expect(checkAfter.rows[0].is_duplicate).toBe(false);
      expect(checkAfter.rows[0].duplicate_count).toBe(1);
      expect(checkAfter.rows[0].duplicate_status).toBe('REASSIGNED');
      expect(checkAfter.rows[0].all_task_ids).toEqual([taskA]);
    });

    it('removes transaction from task via sp_remove_transaction_from_task', async () => {
      const keyB = taskB + '_' + dupTxnId;
      await repo.removeTransactionFromTask(keyB, taskB);

      const checkAfter = await pool.query(
        'SELECT all_task_ids, duplicate_status FROM central_transaction_repository WHERE transaction_key = $1',
        [keyB]
      );
      expect(checkAfter.rows[0].all_task_ids).not.toContain(taskB);
      expect(checkAfter.rows[0].duplicate_status).toBe('DETACHED');
    });
  });
});
