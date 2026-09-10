/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Automated Verification Suite for Extension:
 * Query Extraction, Investigation Planning & Scalable Batch Execution (Phases 7–15)
 */

import {
  DatabaseValidationWorkflow,
  ProcessingStage,
  ValidationCheckStep,
  QueryExtraction,
  QueryColumn,
  BatchPolicy
} from './types.js';

import { resolveRequiredColumnsForStage, resolveRequiredColumnsForWorkflow } from './services/requiredFieldResolver.js';
import { createBatchPlan } from './services/batchPlanner.js';
import { planInvestigation } from './services/investigationPlanner.js';
import { buildQueryFromExtraction, executeExternalChunkQuery } from './services/externalDataQueryService.js';
import { aggregateParentIssueStatus } from './services/statusAggregator.js';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    if (detail) console.error(`    Detail: ${detail}`);
  }
}

console.log('================================================================');
console.log('STARTING QUERY EXTRACTION, BATCH PLANNING & STATUS AGGREGATION TESTS');
console.log('================================================================');

// -----------------------------------------------------------------------------
// SUITE 1: Automatic Required-Column Resolution (Section 8)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 1: Automatic Required-Column Resolution ---');

const mockStageAuth: ProcessingStage = {
  id: 'stage-auth',
  name: 'Authorization Ingress',
  order: 1,
  enabled: true,
  targetDbId: 'db-1',
  targetDataSource: 'auth_records'
};

const mockStageSettle: ProcessingStage = {
  id: 'stage-settle',
  name: 'Clearing & Settlement',
  order: 2,
  enabled: true,
  targetDbId: 'db-1',
  targetDataSource: 'settlement_ledger'
};

const mockRules: ValidationCheckStep[] = [
  {
    id: 'rule-auth-1',
    stepNumber: 1,
    name: 'Check Response Code',
    stageId: 'stage-auth',
    checkType: 'STATUS_MATCH',
    targetDbId: 'db-1',
    targetTable: 'auth_records',
    sourceField: 'response_code',
    compareValue: '00',
    dependencyCondition: 'ALWAYS',
    onPassAction: 'CONTINUE',
    onFailAction: 'STOP',
    onErrorAction: 'STOP'
  },
  {
    id: 'rule-auth-2',
    stepNumber: 2,
    name: 'Check Auth Timestamp Presence',
    stageId: 'stage-auth',
    checkType: 'EXISTENCE_CHECK',
    targetDbId: 'db-1',
    targetTable: 'auth_records',
    requiredParams: ['auth_timestamp', 'card_number'],
    dependencyCondition: 'ALWAYS',
    onPassAction: 'CONTINUE',
    onFailAction: 'STOP',
    onErrorAction: 'STOP'
  },
  {
    id: 'rule-settle-1',
    stepNumber: 3,
    name: 'Verify Settlement Status',
    stageId: 'stage-settle',
    checkType: 'STATUS_MATCH',
    targetDbId: 'db-1',
    targetTable: 'settlement_ledger',
    sourceField: 'settlement_status',
    compareValue: 'SETTLED',
    dependencyCondition: 'ALWAYS',
    onPassAction: 'CONTINUE',
    onFailAction: 'STOP',
    onErrorAction: 'STOP'
  },
  {
    id: 'rule-settle-2',
    stepNumber: 4,
    name: 'Verify Settlement Amount',
    stageId: 'stage-settle',
    checkType: 'AMOUNT_MATCH',
    targetDbId: 'db-1',
    targetTable: 'settlement_ledger',
    sourceField: 'settlement_amount',
    compareValue: '100.00',
    dependencyCondition: 'ALWAYS',
    onPassAction: 'CLOSE',
    onFailAction: 'STOP',
    onErrorAction: 'STOP'
  }
];

{
  // Test Stage 1 extraction resolution
  const stage1Req = resolveRequiredColumnsForStage(mockStageAuth, mockRules);
  const stage1ColNames = stage1Req.requiredColumns.map((c: QueryColumn) => c.sourceColumn);

  assert(stage1ColNames.includes('response_code'), 'Stage 1 includes response_code');
  assert(stage1ColNames.includes('auth_timestamp'), 'Stage 1 includes auth_timestamp');
  assert(stage1ColNames.includes('card_number'), 'Stage 1 includes card_number');
  assert(!stage1ColNames.includes('settlement_amount'), 'Stage 1 excludes Stage 2 settlement_amount (no column bleed)');
  assert(stage1Req.requiredColumns.length === 3, 'Stage 1 only extracts the 3 columns needed by its rules');

  // Test Stage 2 extraction resolution
  const stage2Req = resolveRequiredColumnsForStage(mockStageSettle, mockRules);
  const stage2ColNames = stage2Req.requiredColumns.map((c: QueryColumn) => c.sourceColumn);

  assert(stage2ColNames.includes('settlement_status'), 'Stage 2 includes settlement_status');
  assert(stage2ColNames.includes('settlement_amount'), 'Stage 2 includes settlement_amount');
  assert(!stage2ColNames.includes('response_code'), 'Stage 2 excludes Stage 1 response_code');

  // Test warning generation if QueryExtraction is missing a required column
  const incompleteExtraction: QueryExtraction = {
    id: 'qe-test-1',
    workflowId: 'wf-test',
    stageId: 'stage-auth',
    targetDbId: 'db-1',
    targetDataSource: 'auth_records',
    selectedColumns: [
      { sourceColumn: 'response_code', required: true, usedByRuleIds: ['rule-auth-1'] }
      // Missing auth_timestamp and card_number
    ],
    keyMappings: [{ inputField: 'transaction_id', sourceField: 'transaction_id', required: true }],
    enabled: true
  };

  const stageWithWarning = resolveRequiredColumnsForStage(mockStageAuth, mockRules, incompleteExtraction);
  assert(stageWithWarning.missingFromExtraction !== undefined, 'Missing columns detected');
  assert(stageWithWarning.missingFromExtraction?.includes('auth_timestamp') === true, 'Flagged missing auth_timestamp');
  assert(stageWithWarning.warnings.length >= 2, 'Generated configuration warnings for missing columns');
}

// -----------------------------------------------------------------------------
// SUITE 2: Decoupled Input Batching & Query Chunking (Sections 12 & 13)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: Input Batching vs Query Chunking ---');

{
  // 25 transactions
  const txIds = Array.from({ length: 25 }, (_, i) => `TX-${String(i + 1).padStart(3, '0')}`);

  // Policy: 10 transactions per input batch, max 4 keys per query chunk
  const policy: BatchPolicy = {
    maxRowsPerBatch: 10,
    maxQueryKeys: 4,
    maxPayloadSizeMb: 5,
    maxExecutionTimeMs: 10000
  };

  const batches = createBatchPlan(txIds, policy);

  // 25 txns with 10 per batch -> 3 batches (10, 10, 5)
  assert(batches.length === 3, '25 transactions divided into 3 input batches (10, 10, 5)');
  assert(batches[0].transactionIds.length === 10, 'Batch 1 has 10 transactions');
  assert(batches[1].transactionIds.length === 10, 'Batch 2 has 10 transactions');
  assert(batches[2].transactionIds.length === 5, 'Batch 3 has 5 transactions');

  // Chunks within Batch 1 (10 txns / 4 per chunk -> 3 chunks: 4, 4, 2)
  assert(batches[0].queryChunks.length === 3, 'Batch 1 has 3 query chunks');
  assert(batches[0].queryChunks[0].transactionIds.length === 4, 'Chunk 1 has 4 transaction keys');
  assert(batches[0].queryChunks[1].transactionIds.length === 4, 'Chunk 2 has 4 transaction keys');
  assert(batches[0].queryChunks[2].transactionIds.length === 2, 'Chunk 3 has 2 transaction keys');

  // Deterministic IDs
  assert(batches[0].batchId === 'batch-001', 'Batch ID follows deterministic format: batch-001');
  assert(batches[0].queryChunks[0].chunkId === 'chunk-001-01', 'Chunk ID follows deterministic format: chunk-001-01');
  assert(batches[0].queryChunks[1].chunkId === 'chunk-001-02', 'Chunk ID follows deterministic format: chunk-001-02');
}

// -----------------------------------------------------------------------------
// SUITE 3: Investigation Planner (Section 11)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: Investigation Planning Layer ---');

{
  const workflow: DatabaseValidationWorkflow = {
    id: 'wf-full-test',
    name: 'End-to-End Investigation',
    category: 'Settlement',
    targetDbId: 'db-1',
    targetTable: 'transactions',
    stages: [mockStageAuth, mockStageSettle],
    steps: mockRules
  };

  const dataset = [
    { transaction_id: 'TX-01', amount: 100 },
    { transaction_id: 'TX-02', amount: 200 },
    { transaction_id: 'TX-03', amount: 300 }
  ];

  const planResult = planInvestigation(dataset, workflow, [], {
    transactionKeyField: 'transaction_id',
    batchPolicy: { maxRowsPerBatch: 2, maxQueryKeys: 2 }
  });

  assert(planResult.isValid === true, 'Investigation plan generated successfully');
  assert(planResult.plan !== undefined, 'Plan object exists');
  assert(planResult.plan?.stages.length === 2, 'Plan includes both enabled stages');
  assert(planResult.plan?.batches.length === 2, '3 transactions with maxRowsPerBatch=2 yields 2 batches');
  assert(planResult.plan?.transactionCount === 3, 'Plan tracks exact transaction count');
}

// -----------------------------------------------------------------------------
// SUITE 4: External Data Retrieval Service & Correlation (Sections 15 & 16)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: External Data Retrieval & Correlation ---');

{
  const extraction: QueryExtraction = {
    id: 'qe-sample',
    workflowId: 'wf-1',
    stageId: 'stage-auth',
    targetDbId: 'db-1',
    targetDataSource: 'dynamic_auth_feed',
    selectedColumns: [
      { sourceColumn: 'response_code', required: true, usedByRuleIds: [] },
      { sourceColumn: 'auth_time', required: true, usedByRuleIds: [] }
    ],
    keyMappings: [
      { inputField: 'transaction_id', sourceField: 'auth_txn_id', required: true }
    ],
    filters: [
      { field: 'is_active', operator: 'EQ', value: 1 }
    ],
    enabled: true
  };

  const chunk = {
    chunkId: 'chunk-001-01',
    sequence: 1,
    transactionIds: ['TX-101', 'TX-102']
  };

  // Verify SQL query builder
  const queryInfo = buildQueryFromExtraction(extraction, chunk);
  assert(
    queryInfo.sql.includes('SELECT response_code, auth_time FROM dynamic_auth_feed WHERE auth_txn_id IN (?, ?) AND is_active = ?'),
    'buildQueryFromExtraction builds parameterized query with selected columns, target table, and key mapping'
  );
  assert(queryInfo.parameters.length === 3, 'Parameters contain chunk IDs plus filter value');

  // Verify Correlation back to input transaction ID
  const externalFeed = [
    { auth_txn_id: 'TX-101', response_code: '00', auth_time: '2026-08-19 12:00:00', extra_unused_col: 'IGNORE_ME' },
    { auth_txn_id: 'TX-102', response_code: '05', auth_time: '2026-08-19 12:05:00', extra_unused_col: 'IGNORE_ME' },
    { auth_txn_id: 'TX-999', response_code: '00', auth_time: '2026-08-19 12:10:00' } // Not in chunk
  ];

  async function testCorrelation() {
    const result = await executeExternalChunkQuery(extraction, chunk, externalFeed);
    assert(result.success === true, 'Query chunk executed successfully');
    assert(result.recordsCount === 2, 'Correlated exactly 2 records matching chunk keys');
    assert(result.correlatedRecords['TX-101'] !== undefined, 'Correlated TX-101 by configured auth_txn_id');
    assert(result.correlatedRecords['TX-101'].response_code === '00', 'Extracted response_code for TX-101');
    assert(result.correlatedRecords['TX-101'].extra_unused_col === undefined, 'Unrequested 200+ column fields are stripped');

    // Test simulated technical database failure
    const failedResult = await executeExternalChunkQuery(extraction, chunk, externalFeed, {
      simulateFailure: 'TIMEOUT'
    });
    assert(failedResult.success === false, 'Timeout failure correctly fails query');
    assert(failedResult.isTechnicalError === true, 'Database timeout is marked isTechnicalError = true (not business FAIL)');
  }

  await testCorrelation();
}

// -----------------------------------------------------------------------------
// SUITE 5: Parent Issue Status Aggregation (Sections 21 & 22)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 5: Parent Issue Status Aggregation ---');

{
  // Test 1: All RECONCILED -> Parent is RESOLVED
  const allReconciled = [
    { transactionId: 'TX-1', investigationStatus: 'RECONCILED' },
    { transactionId: 'TX-2', investigationStatus: 'RECONCILED' }
  ];
  const aggClean = aggregateParentIssueStatus(allReconciled);
  assert(aggClean.issueStatus === 'RESOLVED', 'All clean transactions yield parent status RESOLVED');

  // Test 2: All CLOSED -> Parent is CLOSED
  const allClosed = [
    { transactionId: 'TX-1', investigationStatus: 'CLOSED' },
    { transactionId: 'TX-2', investigationStatus: 'CLOSED' }
  ];
  const aggClosed = aggregateParentIssueStatus(allClosed);
  assert(aggClosed.issueStatus === 'CLOSED', 'All closed transactions yield parent status CLOSED');

  // Test 3: 99 CLOSED + 1 FLAGGED -> Parent MUST BE ACTION_REQUIRED (NEVER CLOSED)
  const mixedTransactions = [
    ...Array.from({ length: 99 }, (_, i) => ({ transactionId: `TX-${i + 1}`, investigationStatus: 'CLOSED' })),
    { transactionId: 'TX-FLAGGED', investigationStatus: 'FLAGGED' }
  ];
  const aggMixed = aggregateParentIssueStatus(mixedTransactions);
  assert(
    aggMixed.issueStatus === 'ACTION_REQUIRED',
    '99 CLOSED + 1 FLAGGED yields ACTION_REQUIRED (Child closure cannot close parent issue)'
  );
  assert(aggMixed.flaggedCount === 1, 'Correctly counted 1 flagged transaction');
  assert(aggMixed.closedCount === 99, 'Correctly counted 99 closed transactions');

  // Test 4: Any INVESTIGATING -> Parent is IN_PROGRESS
  const inProgressList = [
    { transactionId: 'TX-1', investigationStatus: 'CLOSED' },
    { transactionId: 'TX-2', investigationStatus: 'INVESTIGATING' }
  ];
  const aggProgress = aggregateParentIssueStatus(inProgressList);
  assert(aggProgress.issueStatus === 'IN_PROGRESS', 'Active investigation yields parent status IN_PROGRESS');

  // Test 5: All PENDING -> Parent is OPEN
  const pendingList = [
    { transactionId: 'TX-1', investigationStatus: 'PENDING' },
    { transactionId: 'TX-2', investigationStatus: 'PENDING' }
  ];
  const aggPending = aggregateParentIssueStatus(pendingList);
  assert(aggPending.issueStatus === 'OPEN', 'Pending transactions yield parent status OPEN');
}

console.log('\n================================================================');
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================');
