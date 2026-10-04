/**
 * Pipeline Architecture Comprehensive Test Suite
 *
 * Validates the core guarantees of RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md:
 *   1. Kahn's Topological Sort & DAG Acyclicity (§3.2, §3.3)
 *   2. Compile-Time Governance Enforcements (§4.2, §5.3, §6.6)
 *   3. Cardinality Governance & Non-Slicing CARDINALITY_BREACH (§4.2 Correction 3, §5.3)
 *   4. Verdict ≠ Pipeline Action Separation (Rule 2, §2.1)
 *   5. Diagnostic Taint Tracking on FAIL + CONTINUE (Rule 12, §4.2)
 *   6. Deterministic Halting on STOP / CLOSE (§2.10)
 *   7. All Four Canonical Box Types Execution (§6.1 - §6.6)
 */
import { describe, it, expect } from 'vitest';
import { workflowPipelineBuilder, ExecutablePipeline, ReconciliationEngine, IngestionSearchMethod, ConditionCheckMethod, ReconciliationMethod, DiagnosticReportMethod, } from '../pipeline/index.js';
describe('RULE_TO_METHOD_PIPELINE_ARCHITECTURE — Core Directives', () => {
    // =========================================================================
    // 1. Kahn's Topological Sort & Cycle Detection (§3.2, §3.3)
    // =========================================================================
    describe('1. Builder & DAG Compilation', () => {
        it('compiles a linear DAG into topologically ordered stages', () => {
            const stages = [
                { id: 'stage-recon', name: 'Reconciliation', order: 2, enabled: true, targetDbId: 'db1', targetDataSource: 'table1' },
                { id: 'stage-search', name: 'Ingress Search', order: 1, enabled: true, targetDbId: 'db1', targetDataSource: 'table1' },
            ];
            const nodes = [
                { id: 'node-search', boxId: 'stage-search', label: 'Search', type: 'INGESTION_SEARCH', position: { x: 0, y: 0 } },
                { id: 'node-recon', boxId: 'stage-recon', label: 'Recon', type: 'RECONCILIATION', position: { x: 100, y: 0 } },
            ];
            const connections = [
                { id: 'c1', fromNodeId: 'node-search', toNodeId: 'node-recon' },
            ];
            const workflow = {
                id: 'wf-toposort',
                name: 'Topo Sort Test',
                stages,
                nodes,
                connections,
                steps: [],
            };
            const pipeline = workflowPipelineBuilder.compile(workflow);
            expect(pipeline).toBeInstanceOf(ExecutablePipeline);
            expect(pipeline.stages.length).toBe(2);
            expect(pipeline.stages[0].stageId).toBe('stage-search');
            expect(pipeline.stages[1].stageId).toBe('stage-recon');
        });
        it('rejects a cyclic DAG with a descriptive error', () => {
            const stages = [
                { id: 'stage-A', name: 'Stage A', order: 1, enabled: true, targetDbId: 'db1', targetDataSource: 'table1' },
                { id: 'stage-B', name: 'Stage B', order: 2, enabled: true, targetDbId: 'db1', targetDataSource: 'table1' },
            ];
            const nodes = [
                { id: 'node-A', boxId: 'stage-A', label: 'A', position: { x: 0, y: 0 } },
                { id: 'node-B', boxId: 'stage-B', label: 'B', position: { x: 100, y: 0 } },
            ];
            // Cycle: A -> B and B -> A
            const connections = [
                { id: 'c1', fromNodeId: 'node-A', toNodeId: 'node-B' },
                { id: 'c2', fromNodeId: 'node-B', toNodeId: 'node-A' },
            ];
            const workflow = {
                id: 'wf-cyclic',
                name: 'Cyclic Workflow',
                stages,
                nodes,
                connections,
                steps: [],
            };
            expect(() => workflowPipelineBuilder.compile(workflow)).toThrowError(/DAG Cycle Detected/i);
        });
        it('enforces Rule 4: INGESTION_SEARCH must declare targetDbId and targetTable', () => {
            const workflow = {
                id: 'wf-missing-db',
                name: 'Invalid Ingestion',
                stages: [
                    { id: 'stage-1', name: 'Empty DB Search', order: 1, enabled: true, targetDbId: '', targetDataSource: '' },
                ],
                nodes: [
                    { id: 'node-1', boxId: 'stage-1', label: 'Search', type: 'INGESTION_SEARCH', position: { x: 0, y: 0 } },
                ],
                steps: [],
            };
            expect(() => workflowPipelineBuilder.compile(workflow)).toThrowError(/missing targetDbId or targetDataSource/i);
        });
        it('enforces §5.3: EXPLICIT_LATEST requires orderByColumn', () => {
            const workflow = {
                id: 'wf-missing-order',
                name: 'Missing Order Col',
                stages: [
                    {
                        id: 'stage-1',
                        name: 'Ordered Search',
                        order: 1,
                        enabled: true,
                        targetDbId: 'db1',
                        targetDataSource: 'table1',
                        cardinalityPolicy: 'EXPLICIT_LATEST',
                        // Missing orderByColumn
                    },
                ],
                steps: [],
            };
            expect(() => workflowPipelineBuilder.compile(workflow)).toThrowError(/missing orderByColumn/i);
        });
        it('enforces §6.6: REPORT box must NOT configure onFailAction = STOP', () => {
            const workflow = {
                id: 'wf-bad-report',
                name: 'Illegal Report Action',
                stages: [
                    { id: 'stage-rep', name: 'Forensic Report', order: 1, enabled: true },
                ],
                nodes: [
                    { id: 'node-rep', boxId: 'stage-rep', label: 'Report', type: 'REPORT', position: { x: 0, y: 0 } },
                ],
                steps: [
                    {
                        id: 'step-rep',
                        name: 'Report Check',
                        stepNumber: 1,
                        stageId: 'stage-rep',
                        checkType: 'EXISTENCE_CHECK',
                        dependencyCondition: 'ALWAYS',
                        onPassAction: 'CONTINUE',
                        onFailAction: 'STOP', // FORBIDDEN for REPORT
                    },
                ],
            };
            expect(() => workflowPipelineBuilder.compile(workflow)).toThrowError(/REPORT stage.*has onFailAction="STOP"/i);
        });
    });
    // =========================================================================
    // 2. Cardinality Governance & Non-Slicing (§4.2 Correction 3, §5.3)
    // =========================================================================
    describe('2. Cardinality Governance & Non-Slicing', () => {
        const reconciler = new ReconciliationEngine();
        const baseContext = {
            taskId: 'task-test',
            batchId: 'batch-test',
            stageId: 'stage-recon',
            stageName: 'Reconciliation',
            validationId: 'val-1',
            rowNumber: 1,
            transactionId: 'TX-100',
            lineageHistory: [],
        };
        it('emits CARDINALITY_BREACH and FAIL when STRICT_SINGLE receives >1 match (never slices)', async () => {
            const validationData = {
                context: baseContext,
                mirrorTable: 'mirror_test',
                fetchedRowCount: 2,
                rawRows: [
                    { id: 1, amount: 100, terminal_id: 'T1' },
                    { id: 2, amount: 100, terminal_id: 'T1' }, // Duplicate external match
                ],
            };
            const step = {
                id: 'val-1',
                stepNumber: 1,
                name: 'Strict Single Match',
                checkType: 'EXISTENCE_CHECK',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
            };
            const result = await reconciler.reconcileRow({ amount: 100 }, validationData, { ...step, cardinalityPolicy: 'STRICT_SINGLE' }, baseContext);
            expect(result.validationResult).toBe('FAIL');
            expect(result.cardinalityStatus).toBe('CARDINALITY_BREACH');
            expect(result.pipelineAction).toBe('STOP');
            expect(result.executionRecord.cardinalityStatus).toBe('CARDINALITY_BREACH');
            expect(result.producedValues._discrepancyFlag).toBe('DUPLICATE_EXTERNAL_MATCH');
        });
        it('picks latest row when cardinalityPolicy is EXPLICIT_LATEST', async () => {
            const validationData = {
                context: baseContext,
                mirrorTable: 'mirror_test',
                fetchedRowCount: 2,
                rawRows: [
                    { id: 2, amount: 200, created_at: '2026-10-02T12:00:00Z' },
                    { id: 1, amount: 100, created_at: '2026-10-01T12:00:00Z' },
                ],
            };
            const step = {
                id: 'val-1',
                stepNumber: 1,
                name: 'Latest Match',
                checkType: 'EXISTENCE_CHECK',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
            };
            const result = await reconciler.reconcileRow({ amount: 200 }, validationData, { ...step, cardinalityPolicy: 'EXPLICIT_LATEST' }, baseContext);
            expect(result.validationResult).toBe('PASS');
            expect(result.cardinalityStatus).toBe('ORDERED_LATEST_PICKED');
            expect(result.producedValues.amount).toBe(200);
        });
    });
    // =========================================================================
    // 3. Verdict ≠ Pipeline Action & Diagnostic Taint (Rule 2 & 12, §2.1)
    // =========================================================================
    describe('3. Verdict ≠ Action Separation & Diagnostic Taint', () => {
        const reconciler = new ReconciliationEngine();
        const baseContext = {
            taskId: 'task-test',
            batchId: 'batch-test',
            stageId: 'stage-check',
            stageName: 'Amount Match',
            validationId: 'val-amt',
            rowNumber: 1,
            transactionId: 'TX-100',
            lineageHistory: [],
        };
        it('tags producedValues with _isDiagnosticOnly when FAIL + CONTINUE', async () => {
            const validationData = {
                context: baseContext,
                mirrorTable: 'mirror_test',
                fetchedRowCount: 1,
                rawRows: [{ amount: 50.00 }], // Discrepancy: input is 100.00
            };
            const step = {
                id: 'val-amt',
                stepNumber: 1,
                name: 'Amount Tolerance',
                checkType: 'AMOUNT_MATCH',
                toleranceMargin: 0.01,
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'CONTINUE', // Pipeline continues despite failure!
            };
            const result = await reconciler.reconcileRow({ amount: 100.00 }, validationData, step, baseContext);
            expect(result.validationResult).toBe('FAIL');
            expect(result.pipelineAction).toBe('CONTINUE');
            expect(result.producedValues._isDiagnosticOnly).toBe(true);
            expect(result.producedValues._diagnosticTaintReason).toBe('UPSTREAM_FAILURE_DIAGNOSTIC_ONLY');
        });
        it('pipeline halts immediately on STOP action without executing downstream stages', async () => {
            const workflow = {
                id: 'wf-halting',
                name: 'Halting Workflow',
                stages: [
                    { id: 'stage-1', name: 'Strict Gate', order: 1, enabled: true, targetDbId: 'db1', targetDataSource: 'tab1' },
                    { id: 'stage-2', name: 'Downstream Stage', order: 2, enabled: true, targetDbId: 'db1', targetDataSource: 'tab1' },
                ],
                steps: [
                    {
                        id: 'step-1',
                        name: 'Always Fail & Stop',
                        stepNumber: 1,
                        stageId: 'stage-1',
                        checkType: 'AMOUNT_MATCH',
                        dependencyCondition: 'ALWAYS',
                        onPassAction: 'CONTINUE',
                        onFailAction: 'STOP',
                    },
                    {
                        id: 'step-2',
                        name: 'Should Never Run',
                        stepNumber: 1,
                        stageId: 'stage-2',
                        checkType: 'EXISTENCE_CHECK',
                        dependencyCondition: 'ALWAYS',
                        onPassAction: 'CONTINUE',
                        onFailAction: 'STOP',
                    },
                ],
            };
            const pipeline = workflowPipelineBuilder.compile(workflow);
            const report = await pipeline.executeRow({
                taskId: 'task-halt',
                batchId: 'batch-halt',
                stageId: '',
                stageName: '',
                validationId: '',
                rowNumber: 1,
                transactionId: 'TX-HALT',
                lineageHistory: [],
                initialRecord: { amount: 100, canonical_data: { amount: 100 } },
            });
            expect(report.finalResult).toBe('FAIL');
            expect(report.finalAction).toBe('STOP');
            expect(report.lineageHistory.length).toBe(1); // Stage 2 was NOT executed
            expect(report.lineageHistory[0].stageId).toBe('stage-1');
        });
    });
    // =========================================================================
    // 4. End-to-End Four Canonical Box Types (§6)
    // =========================================================================
    describe('4. Four Canonical Box Types Execution', () => {
        it('executes INGESTION_SEARCH -> CONDITION_CHECK -> RECONCILIATION -> REPORT pipeline', async () => {
            const stages = [
                { id: 'stg-search', name: 'Ingress Search', order: 1, enabled: true, targetDbId: 'core_db', targetDataSource: 'auth_log' },
                { id: 'stg-cond', name: 'Status Check', order: 2, enabled: true },
                { id: 'stg-recon', name: 'Amount Recon', order: 3, enabled: true, targetDbId: 'core_db', targetDataSource: 'auth_log' },
                { id: 'stg-report', name: 'Forensic Report', order: 4, enabled: true },
            ];
            const nodes = [
                { id: 'n1', boxId: 'stg-search', label: 'Search', type: 'INGESTION_SEARCH', position: { x: 0, y: 0 } },
                { id: 'n2', boxId: 'stg-cond', label: 'Condition', type: 'VALIDATION_BOX', position: { x: 100, y: 0 } },
                { id: 'n3', boxId: 'stg-recon', label: 'Recon', type: 'RECONCILIATION', position: { x: 200, y: 0 } },
                { id: 'n4', boxId: 'stg-report', label: 'Report', type: 'REPORT', position: { x: 300, y: 0 } },
            ];
            const connections = [
                { id: 'c1', fromNodeId: 'n1', toNodeId: 'n2' },
                { id: 'c2', fromNodeId: 'n2', toNodeId: 'n3' },
                { id: 'c3', fromNodeId: 'n3', toNodeId: 'n4' },
            ];
            const steps = [
                {
                    id: 'step-search',
                    name: 'Search Step',
                    stepNumber: 1,
                    stageId: 'stg-search',
                    checkType: 'EXISTENCE_CHECK',
                    dependencyCondition: 'ALWAYS',
                    onPassAction: 'CONTINUE',
                    onFailAction: 'STOP',
                },
                {
                    id: 'step-cond',
                    name: 'Status Active',
                    stepNumber: 1,
                    stageId: 'stg-cond',
                    checkType: 'STATUS_MATCH',
                    targetField: 'status',
                    compareValue: 'COMPLETED',
                    dependencyCondition: 'ALWAYS',
                    onPassAction: 'CONTINUE',
                    onFailAction: 'CONTINUE',
                },
                {
                    id: 'step-recon',
                    name: 'Amount Match',
                    stepNumber: 1,
                    stageId: 'stg-recon',
                    checkType: 'AMOUNT_MATCH',
                    toleranceMargin: 0.05,
                    dependencyCondition: 'ALWAYS',
                    onPassAction: 'CONTINUE',
                    onFailAction: 'STOP',
                },
                {
                    id: 'step-report',
                    name: 'Summary Report',
                    stepNumber: 1,
                    stageId: 'stg-report',
                    checkType: 'EXISTENCE_CHECK',
                    dependencyCondition: 'ALWAYS',
                    onPassAction: 'CONTINUE',
                    onFailAction: 'CONTINUE',
                },
            ];
            const workflow = {
                id: 'wf-four-box',
                name: 'Four Box Pipeline',
                stages,
                nodes,
                connections,
                steps,
            };
            const pipeline = workflowPipelineBuilder.compile(workflow);
            expect(pipeline.stages.length).toBe(4);
            // Verify each stage got the correct method implementation
            expect(pipeline.stages[0].validations[0]).toBeInstanceOf(IngestionSearchMethod);
            expect(pipeline.stages[1].validations[0]).toBeInstanceOf(ConditionCheckMethod);
            expect(pipeline.stages[2].validations[0]).toBeInstanceOf(ReconciliationMethod);
            expect(pipeline.stages[3].validations[0]).toBeInstanceOf(DiagnosticReportMethod);
            // Execute row through all 4 stages
            const report = await pipeline.executeRow({
                taskId: 'task-4box',
                batchId: 'batch-4box',
                stageId: '',
                stageName: '',
                validationId: '',
                rowNumber: 1,
                transactionId: 'TX-999',
                lineageHistory: [],
                _stagedRows: [{ transaction_id: 'TX-999', amount: 500.00, status: 'COMPLETED' }],
                initialRecord: {
                    transaction_id: 'TX-999',
                    amount: 500.00,
                    status: 'COMPLETED',
                    canonical_data: {
                        transaction_id: 'TX-999',
                        amount: 500.00,
                        status: 'COMPLETED',
                    },
                },
            });
            expect(report.finalResult).toBe('PASS');
            expect(report.finalAction).toBe('CONTINUE');
            expect(report.lineageHistory.length).toBe(4);
            expect(report.lineageHistory.map((r) => r.stageId)).toEqual([
                'stg-search',
                'stg-cond',
                'stg-recon',
                'stg-report',
            ]);
        });
    });
});
