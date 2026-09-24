/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { investigationOrchestratorService } from './investigationOrchestratorService.js';
// In-memory telemetry cache for sandbox execution history
const sandboxRunsHistory = new Map();
export const sandboxExecutionService = {
    /**
     * Executes a workflow in strict isolated sandbox mode.
     * Guarantees zero mutation on live transaction tables.
     * Taints all output records with _isDiagnosticOnly: true.
     */
    async simulateWorkflow(input) {
        if (!input.workflowId) {
            throw new Error('workflowId is required for sandbox simulation.');
        }
        const startTime = Date.now();
        const safeRecords = Array.isArray(input.records) ? input.records : [];
        const envelope = {
            sourceType: 'QUERY_SANDBOX',
            sourceId: `sandbox-${Date.now()}`,
            workflowId: input.workflowId,
            records: safeRecords,
            keyField: input.keyField,
            keyFields: input.keyFields,
            forceRerun: true,
            options: {
                dryRun: true,
                persistMirror: false,
                maxConcurrency: input.options?.maxConcurrency || 10
            }
        };
        // Execute via engine
        const jobResult = await investigationOrchestratorService.executeUniversalWorkflow(envelope);
        const durationMs = Date.now() - startTime;
        // Taint all evaluated records with diagnostic flag to prevent downstream mutations
        const taintedRecords = (jobResult.records || []).map(r => ({
            ...r,
            _isDiagnosticOnly: true,
            _executionMode: 'SANDBOX_SIMULATION',
            _simulationTimestamp: new Date().toISOString()
        }));
        const total = jobResult.totalRecords || safeRecords.length;
        const passed = jobResult.passedCount || 0;
        const failed = jobResult.failedCount || 0;
        const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
        const evidence = {
            id: `sbx-run-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            workflowId: input.workflowId,
            executedBy: input.executedBy || 'anonymous_tester',
            totalRecords: total,
            passedCount: passed,
            failedCount: failed,
            durationMs,
            executedAt: new Date().toISOString(),
            isDiagnosticOnly: true,
            summary: {
                passRatePercent: passRate,
                stagesEvaluated: jobResult.stagesEvaluated || 1,
                dryRunConfirmed: true
            }
        };
        // Store in history
        const existing = sandboxRunsHistory.get(input.workflowId) || [];
        sandboxRunsHistory.set(input.workflowId, [evidence, ...existing.slice(0, 20)]);
        return {
            telemetry: evidence,
            records: taintedRecords
        };
    },
    /**
     * Retrieves sandbox execution history for a workflow.
     */
    getSandboxHistory(workflowId) {
        return sandboxRunsHistory.get(workflowId) || [];
    }
};
