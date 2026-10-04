/**
 * Standalone Pipeline Architecture Test Runner
 *
 * Runs all validation checks for RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md using tsx:
 *   1. Kahn's Topological Sort & DAG Acyclicity (§3.2, §3.3)
 *   2. Compile-Time Governance Enforcements (§4.2, §5.3, §6.6)
 *   3. Cardinality Governance & Non-Slicing CARDINALITY_BREACH (§4.2 Correction 3, §5.3)
 *   4. Verdict ≠ Pipeline Action Separation (Rule 2, §2.1)
 *   5. Diagnostic Taint Tracking on FAIL + CONTINUE (Rule 12, §4.2)
 *   6. Deterministic Halting on STOP / CLOSE (§2.10)
 *   7. All Four Canonical Box Types Execution (§6.1 - §6.6)
 */

import {
  workflowPipelineBuilder,
  ExecutablePipeline,
  ReconciliationEngine,
  IngestionSearchMethod,
  ConditionCheckMethod,
  ReconciliationMethod,
  DiagnosticReportMethod,
} from '../src/services/pipeline/index.js';
import type {
  DatabaseValidationWorkflow,
  ProcessingStage,
  ValidationCheckStep,
  FlowchartNode,
  FlowchartConnection,
} from '../src/types.js';
import type { ValidationExecutionContext } from '../src/services/pipeline/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

async function run() {
  console.log('\n================================================================');
  console.log('RULE_TO_METHOD_PIPELINE_ARCHITECTURE — Verification Test Suite');
  console.log('================================================================\n');

  console.log('Suite 1: Builder & DAG Compilation (Kahn\'s Topological Sort)');

  await test('1.1 Compiles a linear DAG into topologically ordered stages', () => {
    const stages: ProcessingStage[] = [
      { id: 'stage-recon', name: 'Reconciliation', order: 2, enabled: true, targetDbId: 'db1', targetDataSource: 'table1' },
      { id: 'stage-search', name: 'Ingress Search', order: 1, enabled: true, targetDbId: 'db1', targetDataSource: 'table1' },
    ];

    const nodes: FlowchartNode[] = [
      { id: 'node-search', boxId: 'stage-search', label: 'Search', type: 'INGESTION_SEARCH' as any, position: { x: 0, y: 0 } },
      { id: 'node-recon', boxId: 'stage-recon', label: 'Recon', type: 'RECONCILIATION' as any, position: { x: 100, y: 0 } },
    ];

    const connections: FlowchartConnection[] = [
      { id: 'c1', fromNodeId: 'node-search', toNodeId: 'node-recon' },
    ];

    const workflow: DatabaseValidationWorkflow = {
      id: 'wf-toposort',
      name: 'Topo Sort Test',
      stages,
      nodes,
      connections,
      steps: [],
    };

    const pipeline = workflowPipelineBuilder.compile(workflow);
    assert(pipeline instanceof ExecutablePipeline, 'Should return ExecutablePipeline instance');
    assert(pipeline.stages.length === 2, 'Should contain 2 stages');
    assert(pipeline.stages[0].stageId === 'stage-search', 'stage-search must be first');
    assert(pipeline.stages[1].stageId === 'stage-recon', 'stage-recon must be second');
  });

  await test('1.2 Rejects a cyclic DAG with a descriptive error', () => {
    const stages: ProcessingStage[] = [
      { id: 'stage-A', name: 'Stage A', order: 1, enabled: true, targetDbId: 'db1', targetDataSource: 'table1' },
      { id: 'stage-B', name: 'Stage B', order: 2, enabled: true, targetDbId: 'db1', targetDataSource: 'table1' },
    ];

    const nodes: FlowchartNode[] = [
      { id: 'node-A', boxId: 'stage-A', label: 'A', position: { x: 0, y: 0 } },
      { id: 'node-B', boxId: 'stage-B', label: 'B', position: { x: 100, y: 0 } },
    ];

    const connections: FlowchartConnection[] = [
      { id: 'c1', fromNodeId: 'node-A', toNodeId: 'node-B' },
      { id: 'c2', fromNodeId: 'node-B', toNodeId: 'node-A' },
    ];

    const workflow: DatabaseValidationWorkflow = {
      id: 'wf-cyclic',
      name: 'Cyclic Workflow',
      stages,
      nodes,
      connections,
      steps: [],
    };

    let threw = false;
    try {
      workflowPipelineBuilder.compile(workflow);
    } catch (err: any) {
      threw = true;
      assert(/DAG Cycle Detected/i.test(err.message), 'Error message must mention DAG cycle');
    }
    assert(threw, 'Should have thrown on cyclic workflow');
  });

  await test('1.3 Enforces Rule 4: INGESTION_SEARCH must declare targetDbId and targetTable', () => {
    const workflow: DatabaseValidationWorkflow = {
      id: 'wf-missing-db',
      name: 'Invalid Ingestion',
      stages: [
        { id: 'stage-1', name: 'Empty DB Search', order: 1, enabled: true, targetDbId: '', targetDataSource: '' },
      ],
      nodes: [
        { id: 'node-1', boxId: 'stage-1', label: 'Search', type: 'INGESTION_SEARCH' as any, position: { x: 0, y: 0 } },
      ],
      steps: [],
    };

    let threw = false;
    try {
      workflowPipelineBuilder.compile(workflow);
    } catch (err: any) {
      threw = true;
      assert(/missing targetDbId or targetDataSource/i.test(err.message), 'Must fail on missing DB/target');
    }
    assert(threw, 'Should throw on missing target DB');
  });

  await test('1.4 Enforces §5.3: EXPLICIT_LATEST requires orderByColumn', () => {
    const workflow: DatabaseValidationWorkflow = {
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
        },
      ],
      steps: [],
    };

    let threw = false;
    try {
      workflowPipelineBuilder.compile(workflow);
    } catch (err: any) {
      threw = true;
      assert(/missing orderByColumn/i.test(err.message), 'Must fail on missing orderByColumn');
    }
    assert(threw, 'Should throw on missing orderByColumn');
  });

  await test('1.5 Enforces §6.6: REPORT box must NOT configure onFailAction = STOP', () => {
    const workflow: DatabaseValidationWorkflow = {
      id: 'wf-bad-report',
      name: 'Illegal Report Action',
      stages: [
        { id: 'stage-rep', name: 'Forensic Report', order: 1, enabled: true },
      ],
      nodes: [
        { id: 'node-rep', boxId: 'stage-rep', label: 'Report', type: 'REPORT' as any, position: { x: 0, y: 0 } },
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
          onFailAction: 'STOP',
        },
      ],
    };

    let threw = false;
    try {
      workflowPipelineBuilder.compile(workflow);
    } catch (err: any) {
      threw = true;
      assert(/REPORT stage.*has onFailAction="STOP"/i.test(err.message), 'Must fail on REPORT with STOP');
    }
    assert(threw, 'Should throw on REPORT configured with STOP');
  });

  console.log('\nSuite 2: Cardinality Governance & Non-Slicing (§4.2, §5.3)');

  const reconciler = new ReconciliationEngine();
  const baseContext: ValidationExecutionContext = {
    taskId: 'task-test',
    batchId: 'batch-test',
    stageId: 'stage-recon',
    stageName: 'Reconciliation',
    validationId: 'val-1',
    rowNumber: 1,
    transactionId: 'TX-100',
    lineageHistory: [],
  };

  await test('2.1 Emits CARDINALITY_BREACH and FAIL when STRICT_SINGLE receives >1 match (never slices)', async () => {
    const validationData = {
      context: baseContext,
      mirrorTable: 'mirror_test',
      fetchedRowCount: 2,
      rawRows: [
        { id: 1, amount: 100, terminal_id: 'T1' },
        { id: 2, amount: 100, terminal_id: 'T1' },
      ],
    };

    const step: ValidationCheckStep = {
      id: 'val-1',
      stepNumber: 1,
      name: 'Strict Single Match',
      checkType: 'EXISTENCE_CHECK',
      dependencyCondition: 'ALWAYS',
      onPassAction: 'CONTINUE',
      onFailAction: 'STOP',
    };

    const result = await reconciler.reconcileRow(
      { amount: 100 },
      validationData,
      { ...step, cardinalityPolicy: 'STRICT_SINGLE' },
      baseContext
    );

    assert(result.validationResult === 'FAIL', 'Verdict must be FAIL');
    assert(result.cardinalityStatus === 'CARDINALITY_BREACH', 'Status must be CARDINALITY_BREACH');
    assert(result.pipelineAction === 'STOP', 'Pipeline action must be STOP');
    assert(result.producedValues._discrepancyFlag === 'DUPLICATE_EXTERNAL_MATCH', 'Must flag duplicate external match');
  });

  await test('2.2 Picks latest row when cardinalityPolicy is EXPLICIT_LATEST', async () => {
    const validationData = {
      context: baseContext,
      mirrorTable: 'mirror_test',
      fetchedRowCount: 2,
      rawRows: [
        { id: 2, amount: 200, created_at: '2026-10-02T12:00:00Z' },
        { id: 1, amount: 100, created_at: '2026-10-01T12:00:00Z' },
      ],
    };

    const step: ValidationCheckStep = {
      id: 'val-1',
      stepNumber: 1,
      name: 'Latest Match',
      checkType: 'EXISTENCE_CHECK',
      dependencyCondition: 'ALWAYS',
      onPassAction: 'CONTINUE',
      onFailAction: 'STOP',
    };

    const result = await reconciler.reconcileRow(
      { amount: 200 },
      validationData,
      { ...step, cardinalityPolicy: 'EXPLICIT_LATEST' },
      baseContext
    );

    assert(result.validationResult === 'PASS', 'Verdict must be PASS');
    assert(result.cardinalityStatus === 'ORDERED_LATEST_PICKED', 'Status must be ORDERED_LATEST_PICKED');
    assert(result.producedValues.amount === 200, 'Produced values must contain latest amount');
  });

  console.log('\nSuite 3: Verdict ≠ Pipeline Action & Diagnostic Taint (Rule 2 & 12)');

  await test('3.1 Tags producedValues with _isDiagnosticOnly when FAIL + CONTINUE', async () => {
    const validationData = {
      context: baseContext,
      mirrorTable: 'mirror_test',
      fetchedRowCount: 1,
      rawRows: [{ amount: 50.00 }],
    };

    const step: ValidationCheckStep = {
      id: 'val-amt',
      stepNumber: 1,
      name: 'Amount Tolerance',
      checkType: 'AMOUNT_MATCH',
      toleranceMargin: 0.01,
      dependencyCondition: 'ALWAYS',
      onPassAction: 'CONTINUE',
      onFailAction: 'CONTINUE',
    };

    const result = await reconciler.reconcileRow(
      { amount: 100.00 },
      validationData,
      step,
      baseContext
    );

    assert(result.validationResult === 'FAIL', 'Verdict must be FAIL');
    assert(result.pipelineAction === 'CONTINUE', 'Action must be CONTINUE');
    assert(result.producedValues._isDiagnosticOnly === true, '_isDiagnosticOnly must be true');
    assert(result.producedValues._diagnosticTaintReason === 'UPSTREAM_FAILURE_DIAGNOSTIC_ONLY', 'Must set taint reason');
  });

  await test('3.2 Pipeline halts immediately on STOP action without executing downstream stages', async () => {
    const workflow: DatabaseValidationWorkflow = {
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
          toleranceMargin: 0.0,
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

    assert(report.finalResult === 'FAIL', 'Pipeline result must be FAIL');
    assert(report.finalAction === 'STOP', 'Pipeline action must be STOP');
    assert(report.lineageHistory.length === 1, 'Only stage-1 must be in lineage history');
    assert(report.lineageHistory[0].stageId === 'stage-1', 'First stage was stage-1');
  });

  console.log('\nSuite 4: Four Canonical Box Types Execution (§6)');

  await test('4.1 Compiles and executes INGESTION_SEARCH -> CONDITION_CHECK -> RECONCILIATION -> REPORT', async () => {
    const stages: ProcessingStage[] = [
      { id: 'stg-search', name: 'Ingress Search', order: 1, enabled: true, targetDbId: 'core_db', targetDataSource: 'auth_log' },
      { id: 'stg-cond', name: 'Status Check', order: 2, enabled: true },
      { id: 'stg-recon', name: 'Amount Recon', order: 3, enabled: true, targetDbId: 'core_db', targetDataSource: 'auth_log' },
      { id: 'stg-report', name: 'Forensic Report', order: 4, enabled: true },
    ];

    const nodes: FlowchartNode[] = [
      { id: 'n1', boxId: 'stg-search', label: 'Search', type: 'INGESTION_SEARCH' as any, position: { x: 0, y: 0 } },
      { id: 'n2', boxId: 'stg-cond', label: 'Condition', type: 'VALIDATION_BOX' as any, position: { x: 100, y: 0 } },
      { id: 'n3', boxId: 'stg-recon', label: 'Recon', type: 'RECONCILIATION' as any, position: { x: 200, y: 0 } },
      { id: 'n4', boxId: 'stg-report', label: 'Report', type: 'REPORT' as any, position: { x: 300, y: 0 } },
    ];

    const connections: FlowchartConnection[] = [
      { id: 'c1', fromNodeId: 'n1', toNodeId: 'n2' },
      { id: 'c2', fromNodeId: 'n2', toNodeId: 'n3' },
      { id: 'c3', fromNodeId: 'n3', toNodeId: 'n4' },
    ];

    const steps: ValidationCheckStep[] = [
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

    const workflow: DatabaseValidationWorkflow = {
      id: 'wf-four-box',
      name: 'Four Box Pipeline',
      stages,
      nodes,
      connections,
      steps,
    };

    const pipeline = workflowPipelineBuilder.compile(workflow);
    assert(pipeline.stages.length === 4, 'Must have 4 stages');
    assert(pipeline.stages[0].validations[0] instanceof IngestionSearchMethod, 'Stage 1 must be IngestionSearchMethod');
    assert(pipeline.stages[1].validations[0] instanceof ConditionCheckMethod, 'Stage 2 must be ConditionCheckMethod');
    assert(pipeline.stages[2].validations[0] instanceof ReconciliationMethod, 'Stage 3 must be ReconciliationMethod');
    assert(pipeline.stages[3].validations[0] instanceof DiagnosticReportMethod, 'Stage 4 must be DiagnosticReportMethod');

    const report = await pipeline.executeRow({
      taskId: 'task-4box',
      batchId: 'batch-4box',
      stageId: '',
      stageName: '',
      validationId: '',
      rowNumber: 1,
      transactionId: 'TX-999',
      lineageHistory: [],
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

    assert(report.finalResult === 'PASS', 'Pipeline finalResult must be PASS');
    assert(report.finalAction === 'CONTINUE', 'Pipeline finalAction must be CONTINUE');
    assert(report.lineageHistory.length === 4, 'Lineage must have 4 stage records');
    const stageIds = report.lineageHistory.map(r => r.stageId);
    assert(stageIds[0] === 'stg-search', 'Stage 0 must be stg-search');
    assert(stageIds[1] === 'stg-cond', 'Stage 1 must be stg-cond');
    assert(stageIds[2] === 'stg-recon', 'Stage 2 must be stg-recon');
    assert(stageIds[3] === 'stg-report', 'Stage 3 must be stg-report');
  });

  console.log('\nSuite 5: Orchestrator Bridge & Universal Coordinate Ingress (§3.2, §7.2)');

  await test('5.1 executeViaNewPipeline executes batch via compiled pipeline and returns WorkflowJobResult', async () => {
    const { investigationOrchestratorService } = await import('../src/services/investigationOrchestratorService.js');
    const { repo } = await import('../src/store/repository.js');

    // Seed test workflow in repository
    const testWfId = `wf-bridge-test-${Date.now()}`;
    const testWorkflow: DatabaseValidationWorkflow = {
      id: testWfId,
      name: 'Bridge Test Workflow',
      stages: [
        { id: 'stg-1', name: 'Condition Stage', order: 1, enabled: true },
      ],
      nodes: [
        { id: 'n-1', boxId: 'stg-1', label: 'Condition', type: 'VALIDATION_BOX' as any, position: { x: 0, y: 0 } },
      ],
      steps: [
        {
          id: 'step-1',
          name: 'Amount Match',
          stepNumber: 1,
          stageId: 'stg-1',
          checkType: 'STATUS_MATCH',
          targetField: 'status',
          compareValue: 'SETTLED',
          dependencyCondition: 'ALWAYS',
          onPassAction: 'CONTINUE',
          onFailAction: 'STOP',
        },
      ],
    };

    await repo.createWorkflow(testWorkflow);

    const inputRecords = [
      { id: 'tx-1', status: 'SETTLED', amount: 100, _row_number: 1 },
      { id: 'tx-2', status: 'SETTLED', amount: 200, _row_number: 2 },
      { id: 'tx-3', status: 'DECLINED', amount: 300, _row_number: 3 }, // Fails
    ];

    const outcome = await investigationOrchestratorService.executeViaNewPipeline({
      workflowId: testWfId,
      records: inputRecords,
      sourceType: 'TEST_SUITE',
      sourceId: 'task-bridge-test',
    } as any);

    assert(outcome.workflowId === testWfId, 'workflowId must match');
    assert(outcome.totalRecords === 3, 'totalRecords must be 3');
    assert(outcome.records.length === 3, 'records array must contain 3 elements');
    assert(outcome.passedCount >= 0, 'passedCount must be non-negative');
    assert(outcome.failedCount >= 0, 'failedCount must be non-negative');
  });

  console.log('\n----------------------------------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed.`);
  console.log('----------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
