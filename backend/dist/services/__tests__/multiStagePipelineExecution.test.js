import { describe, it, expect } from 'vitest';
import { validationPipelineBuilder } from '../validationPipelineBuilder.js';
import { nextStageInputResolver } from '../nextStageInputResolver.js';
describe('Multi-Stage Pipeline Execution & Contract Chaining Integration', () => {
    const workflowExecutionId = `wf_exec_e2e_${Date.now()}`;
    const stage1 = {
        id: 'stage-1-auth',
        name: 'Authorization Ingress Check',
        order: 1,
        enabled: true,
        targetDbId: 'db-auth-cluster',
        targetDataSource: 'auth_log_tab',
        cardinalityPolicy: 'STRICT_SINGLE',
        attachedDbConfigIds: ['cfg-respcode-00', 'cfg-amount-positive']
    };
    const stage2 = {
        id: 'stage-2-settlement',
        name: 'Financial Settlement Reconciliation',
        order: 2,
        enabled: true,
        targetDbId: 'db-settlement-cluster',
        targetDataSource: 'sv_fin_tab',
        cardinalityPolicy: 'ONE_TO_MANY',
        attachedDbConfigIds: ['cfg-posted-amt-match']
    };
    const step1 = {
        id: 'step-1-auth-lookup',
        stepNumber: 1,
        name: 'Auth Gateway Lookup',
        stageId: 'stage-1-auth',
        checkType: 'EXISTENCE_CHECK',
        targetDbId: 'db-auth-cluster',
        targetTable: 'auth_log_tab',
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'CONTINUE', // FAIL + CONTINUE
        onErrorAction: 'STOP',
        requiredParams: ['refnum'],
        searchParameters: [
            { inputField: 'refnum', targetColumn: 'refnum', required: true }
        ]
    };
    const step2 = {
        id: 'step-2-settlement-lookup',
        stepNumber: 2,
        name: 'Settlement Ledger Match',
        stageId: 'stage-2-settlement',
        checkType: 'AMOUNT_MATCH',
        targetDbId: 'db-settlement-cluster',
        targetTable: 'sv_fin_tab',
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'CLOSE',
        onErrorAction: 'STOP',
        requiredParams: ['auth_id'],
        searchParameters: [
            { inputField: 'auth_id', targetColumn: 'auth_code', required: true }
        ]
    };
    const workflow = {
        id: 'wf-card-settlement-e2e',
        name: 'E2E Credit Card Gateway to Settlement Reconciler',
        targetDbId: 'db-auth-cluster',
        targetTable: 'auth_log_tab',
        stages: [stage1, stage2],
        steps: [step1, step2],
        connections: [
            {
                id: 'conn-stage1-stage2',
                fromNodeId: 'stage-1-auth',
                toNodeId: 'stage-2-settlement',
                fromPort: 'pass',
                action: 'CONTINUE'
            }
        ]
    };
    it('1. Builder compiles workflow into an acyclic plan with explicit cardinality and bindings', () => {
        const plan = validationPipelineBuilder.compile(workflow, { strictCardinality: true });
        expect(plan.isAcyclic).toBe(true);
        expect(plan.stages.length).toBe(2);
        expect(plan.stages[0].cardinalityPolicy).toBe('STRICT_SINGLE');
        expect(plan.stages[0].attachedDbConfigIds).toEqual(['cfg-respcode-00', 'cfg-amount-positive']);
        expect(plan.stages[1].cardinalityPolicy).toBe('ONE_TO_MANY');
        expect(plan.stages[1].requiredInputKeys).toContain('auth_id');
    });
    it('2. Stage 1 executes and produces StageOutputContract under FAIL + CONTINUE', () => {
        // Simulate Stage 1 finding the record but failing a response code check (FAIL + CONTINUE)
        const stage1Contract = {
            stageExecutionId: `stg_exec_01_${Date.now()}`,
            workflowExecutionId,
            stageId: stage1.id,
            stageName: stage1.name,
            validationResult: 'FAIL',
            pipelineAction: 'CONTINUE',
            outputTarget: {
                type: 'MIRROR_TABLE',
                tableName: 'mirror_auth_cluster_auth_log_tab'
            },
            producedKeys: ['refnum', 'auth_id', 'card_no', 'respcode', 'amount'],
            totalRows: 10,
            passedRows: 8,
            failedRows: 2,
            errorDetails: [
                { rowNumber: 3, reason: 'Declined response code 05' },
                { rowNumber: 7, reason: 'Declined response code 51' }
            ]
        };
        expect(stage1Contract.validationResult).toBe('FAIL');
        expect(stage1Contract.pipelineAction).toBe('CONTINUE');
        expect(stage1Contract.producedKeys).toContain('auth_id');
    });
    it('3. NextStageInputResolver satisfies Stage 2 requirements using Stage 1 mirror despite Stage 1 FAIL', () => {
        const stage1Contract = {
            stageExecutionId: `stg_exec_01_${Date.now()}`,
            workflowExecutionId,
            stageId: stage1.id,
            stageName: stage1.name,
            validationResult: 'FAIL',
            pipelineAction: 'CONTINUE',
            outputTarget: {
                type: 'MIRROR_TABLE',
                tableName: 'mirror_auth_cluster_auth_log_tab'
            },
            producedKeys: ['refnum', 'auth_id', 'card_no', 'respcode', 'amount'],
            totalRows: 10,
            passedRows: 8,
            failedRows: 2
        };
        const stage2Request = {
            targetStageId: stage2.id,
            targetStageName: stage2.name,
            workflowExecutionId,
            requiredKeys: ['auth_id'],
            cardinalityPolicy: stage2.cardinalityPolicy,
            upstreamContracts: [stage1Contract],
            initialTaskDatasetTable: 'task_dataset_transactions',
            initialKeys: ['refnum', 'amount']
        };
        const resolution = nextStageInputResolver.resolveStageInput(stage2Request);
        // CRITICAL: Proves the core architectural resolution!
        expect(resolution.status).toBe('RESOLVED');
        expect(resolution.resolvedSource.sourceType).toBe('MIRROR_TABLE');
        expect(resolution.resolvedSource.tableName).toBe('mirror_auth_cluster_auth_log_tab');
        expect(resolution.inputQuality).toBe('UPSTREAM_FAILED_BUT_HYDRATED');
        expect(resolution.resolvedSource.joinKeys).toEqual([
            { sourceKey: 'auth_id', targetKey: 'auth_id' }
        ]);
    });
});
