import { describe, it, expect } from 'vitest';
import { nextStageInputResolver } from '../nextStageInputResolver.js';
describe('NextStageInputResolver Service', () => {
    const workflowExecutionId = 'wf_exec_test_001';
    it('1. Resolves clean PASS upstream mirror when immediate predecessor produced required keys', () => {
        const stage1Contract = {
            stageExecutionId: 'stg_exec_01',
            workflowExecutionId,
            stageId: 'stage-1-auth',
            stageName: 'Auth Ingress Verification',
            validationResult: 'PASS',
            pipelineAction: 'CONTINUE',
            outputTarget: {
                type: 'MIRROR_TABLE',
                tableName: 'mirror_core_auth_log_tab'
            },
            producedKeys: ['refnum', 'auth_id', 'card_no', 'respcode'],
            totalRows: 100,
            passedRows: 100,
            failedRows: 0
        };
        const request = {
            targetStageId: 'stage-2-settlement',
            targetStageName: 'Settlement Verification',
            workflowExecutionId,
            requiredKeys: ['auth_id'],
            upstreamContracts: [stage1Contract]
        };
        const resolution = nextStageInputResolver.resolveStageInput(request);
        expect(resolution.status).toBe('RESOLVED');
        expect(resolution.resolvedSource.sourceType).toBe('MIRROR_TABLE');
        expect(resolution.resolvedSource.tableName).toBe('mirror_core_auth_log_tab');
        expect(resolution.inputQuality).toBe('VERIFIED_CLEAN');
        expect(resolution.resolvedSource.joinKeys).toEqual([
            { sourceKey: 'auth_id', targetKey: 'auth_id' }
        ]);
    });
    it('2. Resolves mirror data on FAIL + CONTINUE, preserving enriched external row and tagging UPSTREAM_FAILED_BUT_HYDRATED', () => {
        // Stage 1 authorization lookup found the row, but amount variance check failed
        const stage1FailContinueContract = {
            stageExecutionId: 'stg_exec_01_fail',
            workflowExecutionId,
            stageId: 'stage-1-auth',
            stageName: 'Auth Ingress Verification',
            validationResult: 'FAIL',
            pipelineAction: 'CONTINUE',
            outputTarget: {
                type: 'MIRROR_TABLE',
                tableName: 'mirror_core_auth_log_tab'
            },
            producedKeys: ['refnum', 'auth_id', 'card_no', 'auth_amount'],
            totalRows: 100,
            passedRows: 80,
            failedRows: 20
        };
        const request = {
            targetStageId: 'stage-2-settlement',
            targetStageName: 'Settlement Verification',
            workflowExecutionId,
            requiredKeys: ['auth_id'],
            upstreamContracts: [stage1FailContinueContract]
        };
        const resolution = nextStageInputResolver.resolveStageInput(request);
        // Architectural Mandate: Stage 2 still gets the mirror table with auth_id!
        expect(resolution.status).toBe('RESOLVED');
        expect(resolution.resolvedSource.sourceType).toBe('MIRROR_TABLE');
        expect(resolution.resolvedSource.tableName).toBe('mirror_core_auth_log_tab');
        expect(resolution.inputQuality).toBe('UPSTREAM_FAILED_BUT_HYDRATED');
        expect(resolution.resolvedSource.stageExecutionId).toBe('stg_exec_01_fail');
    });
    it('3. Resolves closest valid upstream ancestor when immediate predecessor did not produce the required key', () => {
        // Stage 1 produced auth_id
        const stage1Contract = {
            stageExecutionId: 'stg_exec_01',
            workflowExecutionId,
            stageId: 'stage-1-auth',
            validationResult: 'PASS',
            pipelineAction: 'CONTINUE',
            outputTarget: {
                type: 'MIRROR_TABLE',
                tableName: 'mirror_core_auth_log_tab'
            },
            producedKeys: ['refnum', 'auth_id', 'card_no'],
            totalRows: 100,
            passedRows: 100,
            failedRows: 0
        };
        // Stage 2 (Fee check) evaluated internal rates and produced only fee_status, missing auth_id
        const stage2Contract = {
            stageExecutionId: 'stg_exec_02',
            workflowExecutionId,
            stageId: 'stage-2-fee-rule',
            validationResult: 'PASS',
            pipelineAction: 'CONTINUE',
            outputTarget: {
                type: 'MIRROR_TABLE',
                tableName: 'mirror_fee_tab'
            },
            producedKeys: ['fee_status', 'fee_amount'],
            totalRows: 100,
            passedRows: 100,
            failedRows: 0
        };
        // Stage 3 needs auth_id to query settlement
        const request = {
            targetStageId: 'stage-3-settlement',
            workflowExecutionId,
            requiredKeys: ['auth_id'],
            upstreamContracts: [stage1Contract, stage2Contract]
        };
        const resolution = nextStageInputResolver.resolveStageInput(request);
        expect(resolution.status).toBe('RESOLVED');
        expect(resolution.resolvedSource.sourceType).toBe('UPSTREAM_PREDECESSOR');
        expect(resolution.resolvedSource.tableName).toBe('mirror_core_auth_log_tab');
        expect(resolution.resolvedSource.stageExecutionId).toBe('stg_exec_01');
        expect(resolution.inputQuality).toBe('VERIFIED_CLEAN');
    });
    it('4. Falls back to initial task dataset when upstream stages do not produce the key but raw input does', () => {
        const stage1Contract = {
            stageExecutionId: 'stg_exec_01',
            workflowExecutionId,
            stageId: 'stage-1-auth',
            validationResult: 'FAIL',
            pipelineAction: 'CONTINUE',
            outputTarget: {
                type: 'MIRROR_TABLE',
                tableName: 'mirror_empty_tab'
            },
            producedKeys: ['irrelevant_key'],
            totalRows: 0,
            passedRows: 0,
            failedRows: 0
        };
        const request = {
            targetStageId: 'stage-2-audit',
            workflowExecutionId,
            requiredKeys: ['original_rrn'],
            upstreamContracts: [stage1Contract],
            initialTaskDatasetTable: 'task_dataset_transactions',
            initialKeys: ['original_rrn', 'account_no']
        };
        const resolution = nextStageInputResolver.resolveStageInput(request);
        expect(resolution.status).toBe('RESOLVED');
        expect(resolution.resolvedSource.sourceType).toBe('TASK_DATASET');
        expect(resolution.resolvedSource.tableName).toBe('task_dataset_transactions');
        expect(resolution.inputQuality).toBe('SYNTHETIC_FALLBACK');
    });
    it('5. Raises controlled CONFIGURATION_ERROR when required keys cannot be resolved anywhere', () => {
        const stage1Contract = {
            stageExecutionId: 'stg_exec_01',
            workflowExecutionId,
            stageId: 'stage-1-auth',
            validationResult: 'PASS',
            pipelineAction: 'CONTINUE',
            outputTarget: {
                type: 'MIRROR_TABLE',
                tableName: 'mirror_core_auth_log_tab'
            },
            producedKeys: ['refnum', 'auth_id'],
            totalRows: 100,
            passedRows: 100,
            failedRows: 0
        };
        const request = {
            targetStageId: 'stage-2-settlement',
            targetStageName: 'Settlement Verification',
            workflowExecutionId,
            requiredKeys: ['unmapped_custom_terminal_uuid'],
            upstreamContracts: [stage1Contract],
            initialTaskDatasetTable: 'task_dataset_transactions',
            initialKeys: ['refnum', 'amount']
        };
        const resolution = nextStageInputResolver.resolveStageInput(request);
        expect(resolution.status).toBe('CONFIGURATION_ERROR');
        expect(resolution.errorMessage).toContain('Configuration Error: Unable to resolve required input keys [unmapped_custom_terminal_uuid]');
    });
});
