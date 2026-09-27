import { describe, it, expect, beforeEach } from 'vitest';
import { postgresRepo } from '../../store/postgresRepo.js';
import { investigationOrchestratorService } from '../investigationOrchestratorService.js';
import { getPostgresPool } from '../../config/postgres.js';
describe('Workflow Display Isolation and Live Execution Persistence', () => {
    const testTaskId = 'TASK-TEST-ISOLATION-01';
    const wfAId = 'wf-test-a-1790440000000';
    const wfBId = 'wf-test-b-1790440000000';
    beforeEach(async () => {
        const pool = getPostgresPool();
        await pool.query('DELETE FROM task_workflow_executions WHERE task_id = $1;', [testTaskId]);
        await pool.query('DELETE FROM task_dataset_transactions WHERE task_id = $1;', [testTaskId]);
        await pool.query('DELETE FROM issues WHERE id = $1;', [testTaskId]);
        await pool.query(`INSERT INTO issues (id, title, description, status, priority, creator_id, creator_name)
       VALUES ($1, 'Test Task', 'Test Description', 'OPEN', 'MEDIUM', 'usr-1', 'Tester')
       ON CONFLICT (id) DO NOTHING;`, [testTaskId]);
        // Seed 2 transactions for testTaskId
        await pool.query(`INSERT INTO task_dataset_transactions (task_id, row_number, canonical_data, raw_data)
       VALUES 
       ($1, 1, '{"terminal_id":"T101","refnum":"R9001","reqamt":"100.00"}'::jsonb, '{"terminal_id":"T101","refnum":"R9001","reqamt":"100.00"}'::jsonb),
       ($1, 2, '{"terminal_id":"T102","refnum":"R9002","reqamt":"200.00"}'::jsonb, '{"terminal_id":"T102","refnum":"R9002","reqamt":"200.00"}'::jsonb);`, [testTaskId]);
        // Seed Workflow A (1 step)
        await pool.query(`INSERT INTO database_validation_workflows (id, name, target_db_id, target_table, steps, status)
       VALUES ($1, 'Workflow A', 'local', 'transactions', $2::jsonb, 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET steps = EXCLUDED.steps;`, [
            wfAId,
            JSON.stringify([
                {
                    id: 'step-a-1',
                    name: 'Step A Rule',
                    checkType: 'EXISTENCE_CHECK',
                    onFailAction: 'STOP',
                    onPassAction: 'CONTINUE',
                    searchParameters: [{ inputField: 'refnum', targetColumn: 'refnum' }]
                }
            ])
        ]);
        // Seed Workflow B (1 step, different rule)
        await pool.query(`INSERT INTO database_validation_workflows (id, name, target_db_id, target_table, steps, status)
       VALUES ($1, 'Workflow B', 'local', 'transactions', $2::jsonb, 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET steps = EXCLUDED.steps;`, [
            wfBId,
            JSON.stringify([
                {
                    id: 'step-b-1',
                    name: 'Step B Rule',
                    checkType: 'EXISTENCE_CHECK',
                    onFailAction: 'STOP',
                    onPassAction: 'CONTINUE',
                    searchParameters: [{ inputField: 'refnum', targetColumn: 'refnum' }]
                }
            ])
        ]);
    });
    it('1. executes Workflow A, attaches workflow attribution and audit trail, and persists to PostgreSQL', async () => {
        const tx = await postgresRepo.getTaskDatasetTransactions(testTaskId, 1, 10);
        expect(tx.rows.length).toBe(2);
        const resA = await investigationOrchestratorService.executeUniversalWorkflow({
            workflowId: wfAId,
            records: tx.rows,
            sourceType: 'INVESTIGATION_PANEL',
            sourceId: testTaskId,
            keyFields: ['refnum'],
            forceRerun: true,
            executedBy: 'tester'
        });
        expect(resA.records.length).toBe(2);
        expect(resA.records[0]._validation_workflow_id).toBe(wfAId);
        expect(resA.records[0]._validation_workflow_name).toBe('Workflow A');
        expect(Array.isArray(resA.records[0].auditTrail)).toBe(true);
        // Verify DB persistence in task_dataset_transactions
        const dbTxAfterA = await postgresRepo.getTaskDatasetTransactions(testTaskId, 1, 10);
        expect(dbTxAfterA.rows[0]._validation_workflow_id).toBe(wfAId);
        expect(dbTxAfterA.rows[0]._validation_workflow_name).toBe('Workflow A');
        expect(Array.isArray(dbTxAfterA.rows[0].auditTrail)).toBe(true);
        expect(dbTxAfterA.rows[0].auditTrail.length).toBeGreaterThan(0);
        expect(dbTxAfterA.rows[0].auditTrail[0].ruleId).toBe('step-a-1');
    });
    it('2. executes Workflow B and verifies that Workflow B does NOT inherit or mix up Workflow A steps', async () => {
        // First run Workflow A
        const tx = await postgresRepo.getTaskDatasetTransactions(testTaskId, 1, 10);
        await investigationOrchestratorService.executeUniversalWorkflow({
            workflowId: wfAId,
            records: tx.rows,
            sourceType: 'INVESTIGATION_PANEL',
            sourceId: testTaskId,
            keyFields: ['refnum'],
            forceRerun: true,
            executedBy: 'tester'
        });
        // Now run Workflow B on the same task dataset
        const txBeforeB = await postgresRepo.getTaskDatasetTransactions(testTaskId, 1, 10);
        const resB = await investigationOrchestratorService.executeUniversalWorkflow({
            workflowId: wfBId,
            records: txBeforeB.rows,
            sourceType: 'INVESTIGATION_PANEL',
            sourceId: testTaskId,
            keyFields: ['refnum'],
            forceRerun: true,
            executedBy: 'tester'
        });
        expect(resB.records[0]._validation_workflow_id).toBe(wfBId);
        expect(resB.records[0]._validation_workflow_name).toBe('Workflow B');
        // Ensure audit trail only contains Workflow B rules (step-b-1), NEVER step-a-1
        const ruleIdsInB = resB.records[0].auditTrail.map((entry) => entry.ruleId);
        expect(ruleIdsInB).toContain('step-b-1');
        expect(ruleIdsInB).not.toContain('step-a-1');
        // Ensure lookup cache serving for Workflow B also includes workflow attribution and auditTrail
        const cachedB = await investigationOrchestratorService.executeUniversalWorkflow({
            workflowId: wfBId,
            records: txBeforeB.rows,
            sourceType: 'INVESTIGATION_PANEL',
            sourceId: testTaskId,
            keyFields: ['refnum'],
            forceRerun: false,
            executedBy: 'tester'
        });
        expect(cachedB.cached).toBe(true);
        expect(cachedB.records[0]._validation_workflow_id).toBe(wfBId);
        expect(Array.isArray(cachedB.records[0].auditTrail)).toBe(true);
        expect(cachedB.records[0].auditTrail[0].ruleId).toBe('step-b-1');
    });
});
