import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { investigationOrchestratorService } from '../investigationOrchestratorService.js';
import { repo } from '../../store/repository.js';
import { queryPg } from '../../config/postgres.js';
describe('External Database Existence Check Governance', () => {
    const testWorkflowId = `wf-test-notfound-${Date.now()}`;
    beforeAll(async () => {
        await repo.createWorkflow({
            id: testWorkflowId,
            name: 'Test Existence Check Workflow',
            category: 'Reconciliation',
            targetDbId: 'db-1789318844365',
            targetTable: 'transactions',
            stages: [],
            steps: [
                {
                    id: 'step-ex-1',
                    name: 'Existence Check',
                    checkType: 'EXISTENCE_CHECK',
                    sourceField: 'terminal_id',
                    targetField: 'terminal_id',
                    stepNumber: 1,
                    targetDbId: 'db-1789318844365',
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
        try {
            await queryPg(`DELETE FROM task_workflow_executions WHERE workflow_id = $1;`, [testWorkflowId]);
            await queryPg(`DELETE FROM database_validation_workflows WHERE id = $1;`, [testWorkflowId]);
        }
        catch (e) {
            // ignore
        }
    });
    it('strictly flags records as FAIL when not found in external target database', async () => {
        const testRecords = [
            {
                terminal_id: 'NON_EXISTENT_TERM_9999',
                refnum: '999999999999',
                reqamt: 999.99,
                fe_utrnno: 9999999999,
                task_id: 'TASK-TEST-NOTFOUND-01',
                _rowNumber: 1
            }
        ];
        const result = await investigationOrchestratorService.executeUniversalWorkflow({
            workflowId: testWorkflowId,
            records: testRecords,
            sourceType: 'INVESTIGATION_PANEL',
            sourceId: 'TASK-TEST-NOTFOUND-01',
            keyField: 'terminal_id',
            keyFields: ['terminal_id', 'refnum', 'reqamt', 'fe_utrnno'],
            forceRerun: true
        });
        expect(result.totalRecords).toBe(1);
        expect(result.passedCount).toBe(0);
        expect(result.failedCount).toBe(1);
        expect(result.records).toHaveLength(1);
        const evaluated = result.records[0];
        expect(evaluated._validation_status).toBe('FAIL');
        expect(evaluated._target_record).toBeNull();
        expect(evaluated._validation_details?.existence).toBe('NOT_FOUND_IN_TARGET_DB');
    });
});
