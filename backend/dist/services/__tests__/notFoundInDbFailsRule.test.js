import { describe, it, expect } from 'vitest';
import { investigationOrchestratorService } from '../investigationOrchestratorService.js';
describe('External Database Existence Check Governance', () => {
    it('strictly flags records as FAIL when not found in external target database', async () => {
        // Custom Workflow 5 targets LocalFTP.transactions with parameters terminal_id, refnum, reqamt, fe_utrnno
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
            workflowId: 'wf-1789852589770',
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
