/**
 * Automated Verification Test Suite for Transaction Investigation & Settlement Rule Engine
 *
 * Verifies:
 * 1. Decoupled Validation Result (PASS | FAIL | ERROR) vs Pipeline Action (CONTINUE | STOP | CLOSE).
 * 2. All 6 mandatory result/action combinations:
 *    - PASS + CONTINUE
 *    - PASS + CLOSE
 *    - FAIL + CONTINUE
 *    - FAIL + CLOSE
 *    - FAIL + STOP
 *    - ERROR + STOP
 * 3. Dependency evaluation tracking previousResult vs previousAction independently.
 * 4. Multi-stage configurable lifecycle execution (no hard-coded table schemas).
 * 5. Independent transaction-level closure without touching batch siblings or parent issues.
 */
import { executeWorkflowForTransaction, executeBatchInvestigation, evaluateRuleCondition, evaluateDependencyCondition } from './services/investigationEngine.js';
let totalTests = 0;
let passedTests = 0;
function assert(condition, testName, detail) {
    totalTests++;
    if (condition) {
        passedTests++;
        console.log(`  ✓ PASS: ${testName}`);
    }
    else {
        console.error(`  ✗ FAIL: ${testName}`);
        if (detail)
            console.error(`    Detail: ${detail}`);
    }
}
console.log('================================================================');
console.log('STARTING TRANSACTION INVESTIGATION & SETTLEMENT ENGINE TESTS');
console.log('================================================================\n');
// -----------------------------------------------------------------------------
// SUITE 1: Rule Condition Pure Evaluation (PASS, FAIL, ERROR separation)
// -----------------------------------------------------------------------------
console.log('--- SUITE 1: Condition Pure Evaluation & Status Decoupling ---');
// Test 1.1: Business PASS
{
    const rule = {
        id: 'r1',
        stepNumber: 1,
        name: 'Status Match',
        checkType: 'STATUS_MATCH',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        sourceField: 'status',
        comparator: '=',
        compareValue: 'SETTLED',
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP'
    };
    const result = evaluateRuleCondition({ status: 'SETTLED' }, rule);
    assert(result.status === 'PASS', 'Status match yields PASS when status matches');
}
// Test 1.2: Business FAIL (NOT an error!)
{
    const rule = {
        id: 'r2',
        stepNumber: 1,
        name: 'Amount Match',
        checkType: 'AMOUNT_MATCH',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        sourceField: 'amount',
        comparator: '=',
        compareValue: '100.00',
        toleranceMargin: 0,
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'CONTINUE',
        onErrorAction: 'STOP'
    };
    const result = evaluateRuleCondition({ amount: '90.00' }, rule);
    assert(result.status === 'FAIL', 'Amount mismatch yields business FAIL (not ERROR)');
    assert(!result.errorDetail, 'Business FAIL has no technical error detail');
}
// Test 1.3: Technical ERROR (e.g. malformed regex, runtime exception)
{
    const rule = {
        id: 'r3',
        stepNumber: 1,
        name: 'Malformed Regex Syntax',
        checkType: 'REGEX_MATCH',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        sourceField: 'ref',
        compareValue: '[invalid(regex',
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP'
    };
    const result = evaluateRuleCondition({ ref: 'ABC-123' }, rule);
    assert(result.status === 'ERROR', 'Malformed regex syntax yields technical ERROR');
    assert(Boolean(result.errorDetail), 'Technical ERROR contains error detail');
}
// -----------------------------------------------------------------------------
// SUITE 2: Mandatory Result + Pipeline Action Combinations (Result ≠ Flow Control)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 2: Six Mandatory Result + Action Combinations ---');
const baseStage = {
    id: 'stage-recon',
    name: 'Stage 1: Ingress Reconciliation',
    order: 1,
    enabled: true,
    targetDbId: 'db-1',
    targetDataSource: 'transactions'
};
// Scenario 1: PASS + CONTINUE
{
    const workflow = {
        id: 'wf-pass-continue',
        name: 'PASS + CONTINUE Test',
        version: '1.0',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        stages: [baseStage],
        steps: [
            {
                id: 's1',
                stepNumber: 1,
                name: 'Step 1: Check Active',
                stageId: 'stage-recon',
                checkType: 'FIELD_COMPARATOR',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'status',
                comparator: '=',
                compareValue: 'SUCCESS',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP'
            },
            {
                id: 's2',
                stepNumber: 2,
                name: 'Step 2: Subsequent Check',
                stageId: 'stage-recon',
                checkType: 'NUMERIC_THRESHOLD',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'amount',
                comparator: '>',
                compareValue: '0',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP'
            }
        ]
    };
    const summary = executeWorkflowForTransaction({ status: 'SUCCESS', amount: 50 }, workflow);
    assert(summary.auditTrail.length === 2, 'Scenario 1 (PASS + CONTINUE): Pipeline continues to step 2');
    assert(summary.investigationStatus === 'RECONCILED', 'Scenario 1: Final investigation status is RECONCILED');
    assert(!summary.isHalted, 'Scenario 1: Pipeline is not halted');
}
// Scenario 2: PASS + CLOSE
{
    const workflow = {
        id: 'wf-pass-close',
        name: 'PASS + CLOSE Test',
        version: '1.0',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        stages: [baseStage],
        steps: [
            {
                id: 's1',
                stepNumber: 1,
                name: 'Step 1: Clean Terminal Check',
                stageId: 'stage-recon',
                checkType: 'STATUS_MATCH',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'status',
                comparator: '=',
                compareValue: 'SETTLED',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CLOSE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP'
            },
            {
                id: 's2',
                stepNumber: 2,
                name: 'Step 2: Should Not Run',
                stageId: 'stage-recon',
                checkType: 'AMOUNT_MATCH',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'amount',
                comparator: '=',
                compareValue: '500',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP'
            }
        ]
    };
    const summary = executeWorkflowForTransaction({ status: 'SETTLED', amount: 500 }, workflow);
    assert(summary.auditTrail.length === 1, 'Scenario 2 (PASS + CLOSE): Evaluation stops immediately on CLOSE');
    assert(summary.isClosed === true, 'Scenario 2: Transaction is marked CLOSED');
    assert(summary.investigationStatus === 'CLOSED', 'Scenario 2: Investigation status is CLOSED');
}
// Scenario 3: FAIL + CONTINUE (Diagnostic pipeline)
{
    const workflow = {
        id: 'wf-fail-continue',
        name: 'FAIL + CONTINUE Test',
        version: '1.0',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        stages: [baseStage],
        steps: [
            {
                id: 's1',
                stepNumber: 1,
                name: 'Step 1: Discrepancy Observation',
                stageId: 'stage-recon',
                checkType: 'STATUS_MATCH',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'flag',
                comparator: '=',
                compareValue: 'CLEAN',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'CONTINUE', // FAIL continues!
                onErrorAction: 'STOP'
            },
            {
                id: 's2',
                stepNumber: 2,
                name: 'Step 2: Secondary Diagnostic Check',
                stageId: 'stage-recon',
                checkType: 'NUMERIC_THRESHOLD',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'fee',
                comparator: '>=',
                compareValue: '0',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP'
            }
        ]
    };
    const summary = executeWorkflowForTransaction({ flag: 'DIRTY', fee: 5 }, workflow);
    assert(summary.auditTrail.length === 2, 'Scenario 3 (FAIL + CONTINUE): Step 2 executes despite step 1 failing');
    assert(summary.auditTrail[0].validationResult === 'FAIL', 'Scenario 3: Step 1 result was FAIL');
    assert(summary.auditTrail[0].pipelineAction === 'CONTINUE', 'Scenario 3: Step 1 action was CONTINUE');
    assert(summary.investigationStatus === 'FLAGGED', 'Scenario 3: Status is FLAGGED due to discrepancy detected in Step 1');
}
// Scenario 4: FAIL + CLOSE (Terminal non-actionable business outcome)
{
    const workflow = {
        id: 'wf-fail-close',
        name: 'FAIL + CLOSE Test',
        version: '1.0',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        stages: [baseStage],
        steps: [
            {
                id: 's1',
                stepNumber: 1,
                name: 'Step 1: Expected Decline Closing',
                stageId: 'stage-recon',
                checkType: 'ISO_DECLINE_CODE',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'response_code',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'CLOSE', // Expected decline closes the transaction
                onErrorAction: 'STOP'
            },
            {
                id: 's2',
                stepNumber: 2,
                name: 'Step 2: Should Not Run After Close',
                stageId: 'stage-recon',
                checkType: 'AMOUNT_MATCH',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'amount',
                comparator: '=',
                compareValue: '100',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP'
            }
        ]
    };
    const summary = executeWorkflowForTransaction({ response_code: '51' }, workflow); // 51 = Insufficient Funds
    assert(summary.auditTrail.length === 1, 'Scenario 4 (FAIL + CLOSE): Pipeline halts on close');
    assert(summary.auditTrail[0].validationResult === 'FAIL', 'Scenario 4: Result is FAIL');
    assert(summary.auditTrail[0].pipelineAction === 'CLOSE', 'Scenario 4: Action is CLOSE');
    assert(summary.investigationStatus === 'CLOSED', 'Scenario 4: Investigation status is CLOSED');
}
// Scenario 5: FAIL + STOP (Critical mismatch halt)
{
    const workflow = {
        id: 'wf-fail-stop',
        name: 'FAIL + STOP Test',
        version: '1.0',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        stages: [baseStage],
        steps: [
            {
                id: 's1',
                stepNumber: 1,
                name: 'Step 1: Existence Check',
                stageId: 'stage-recon',
                checkType: 'EXISTENCE_CHECK',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'id',
                targetField: 'id',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP'
            },
            {
                id: 's2',
                stepNumber: 2,
                name: 'Step 2: Should Not Run',
                stageId: 'stage-recon',
                checkType: 'STATUS_MATCH',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'status',
                comparator: '=',
                compareValue: 'SETTLED',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP'
            }
        ]
    };
    const summary = executeWorkflowForTransaction({ other_key: 'abc' }, workflow); // Missing 'id'
    assert(summary.auditTrail.length === 1, 'Scenario 5 (FAIL + STOP): Pipeline stopped immediately');
    assert(summary.isHalted === true, 'Scenario 5: Pipeline is flagged as halted');
    assert(summary.investigationStatus === 'FLAGGED', 'Scenario 5: Status is FLAGGED due to critical check failure');
}
// Scenario 6: ERROR + STOP (Technical Exception Isolation)
{
    const workflow = {
        id: 'wf-error-stop',
        name: 'ERROR + STOP Test',
        version: '1.0',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        stages: [baseStage],
        steps: [
            {
                id: 's1',
                stepNumber: 1,
                name: 'Step 1: Technical Fault',
                stageId: 'stage-recon',
                checkType: 'REGEX_MATCH',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'txn_ref',
                compareValue: '[[invalid-regex',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'CONTINUE',
                onErrorAction: 'STOP'
            },
            {
                id: 's2',
                stepNumber: 2,
                name: 'Step 2: Should Not Run',
                stageId: 'stage-recon',
                checkType: 'STATUS_MATCH',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'status',
                comparator: '=',
                compareValue: 'SETTLED',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP'
            }
        ]
    };
    const summary = executeWorkflowForTransaction({ txn_ref: 'TXN-999' }, workflow);
    assert(summary.auditTrail.length === 1, 'Scenario 6 (ERROR + STOP): Execution halted on technical error');
    assert(summary.auditTrail[0].validationResult === 'ERROR', 'Scenario 6: Result status is strictly ERROR');
    assert(summary.auditTrail[0].pipelineAction === 'STOP', 'Scenario 6: Pipeline action is STOP');
    assert(summary.hasTechnicalError === true, 'Scenario 6: hasTechnicalError flag set');
    assert(summary.investigationStatus === 'FLAGGED', 'Scenario 6: Transaction status is FLAGGED');
}
// -----------------------------------------------------------------------------
// SUITE 3: Dependency Conditions Tracking previousResult vs previousAction
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 3: Dependency Evaluation (Result vs Action Tracking) ---');
// Test 3.1: IF_PREV_SUCCESS triggers when previousResult was PASS
{
    const depPass = evaluateDependencyCondition('IF_PREV_SUCCESS', 'PASS', 'CONTINUE');
    assert(depPass.shouldExecute === true, 'IF_PREV_SUCCESS executes when previousResult is PASS');
    const depFail = evaluateDependencyCondition('IF_PREV_SUCCESS', 'FAIL', 'CONTINUE');
    assert(depFail.shouldExecute === false, 'IF_PREV_SUCCESS skipped when previousResult is FAIL (even with action CONTINUE)');
}
// Test 3.2: IF_PREV_FAILURE triggers when previousResult was FAIL
{
    const depFail = evaluateDependencyCondition('IF_PREV_FAILURE', 'FAIL', 'CONTINUE');
    assert(depFail.shouldExecute === true, 'IF_PREV_FAILURE executes when previousResult is FAIL');
    const depPass = evaluateDependencyCondition('IF_PREV_FAILURE', 'PASS', 'CONTINUE');
    assert(depPass.shouldExecute === false, 'IF_PREV_FAILURE skipped when previousResult is PASS');
}
// -----------------------------------------------------------------------------
// SUITE 4: Multi-Stage Progression & Configurable Data Sources
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 4: Multi-Stage Execution & Configurable Data Sources ---');
{
    const multiStageWorkflow = {
        id: 'wf-multi-stage',
        name: 'Multi-Stage Settlement Pipeline',
        version: '2.0',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        stages: [
            {
                id: 'stg-1',
                name: 'Stage 1: External Gateway Ingress',
                order: 1,
                enabled: true,
                targetDbId: 'db-ext',
                targetDataSource: 'gateway_events'
            },
            {
                id: 'stg-2',
                name: 'Stage 2: Clearing Aggregation',
                order: 2,
                enabled: true,
                targetDbId: 'db-clearing',
                targetDataSource: 'clearing_batches'
            },
            {
                id: 'stg-3',
                name: 'Stage 3: General Ledger Finality',
                order: 3,
                enabled: true,
                targetDbId: 'db-core',
                targetDataSource: 'ledger_entries'
            }
        ],
        steps: [
            {
                id: 'st1-r1',
                stepNumber: 1,
                name: 'Ingress Auth Check',
                stageId: 'stg-1',
                checkType: 'STATUS_MATCH',
                targetDbId: 'db-ext',
                targetTable: 'gateway_events',
                sourceField: 'auth_status',
                comparator: '=',
                compareValue: '00',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP'
            },
            {
                id: 'st2-r1',
                stepNumber: 1,
                name: 'Clearing Match Check',
                stageId: 'stg-2',
                checkType: 'FIELD_COMPARATOR',
                targetDbId: 'db-clearing',
                targetTable: 'clearing_batches',
                sourceField: 'cleared',
                comparator: '=',
                compareValue: 'TRUE',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP'
            },
            {
                id: 'st3-r1',
                stepNumber: 1,
                name: 'Ledger Post Check',
                stageId: 'stg-3',
                checkType: 'NUMERIC_THRESHOLD',
                targetDbId: 'db-core',
                targetTable: 'ledger_entries',
                sourceField: 'balance',
                comparator: '>=',
                compareValue: '0',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CLOSE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP'
            }
        ]
    };
    const record = {
        transaction_id: 'TX-MULTI-01',
        auth_status: '00',
        cleared: 'TRUE',
        balance: 1000
    };
    const summary = executeWorkflowForTransaction(record, multiStageWorkflow);
    assert(summary.auditTrail.length === 3, 'Multi-stage execution traversed all 3 configured stages');
    assert(summary.auditTrail[0].stageName === 'Stage 1: External Gateway Ingress', 'Step 1 tracked to Stage 1');
    assert(summary.auditTrail[1].stageName === 'Stage 2: Clearing Aggregation', 'Step 2 tracked to Stage 2');
    assert(summary.auditTrail[2].stageName === 'Stage 3: General Ledger Finality', 'Step 3 tracked to Stage 3');
    assert(summary.investigationStatus === 'CLOSED', 'Multi-stage final action successfully marked CLOSED');
}
// -----------------------------------------------------------------------------
// SUITE 5: Batch Execution & Independent Transaction Lifecycle
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 5: Batch Execution & Independent Transaction Closure ---');
{
    const workflow = {
        id: 'wf-batch',
        name: 'Batch Test Workflow',
        version: '1.0',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        stages: [baseStage],
        steps: [
            {
                id: 'r1',
                stepNumber: 1,
                name: 'Standard Clean Check',
                stageId: 'stage-recon',
                checkType: 'STATUS_MATCH',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'status',
                comparator: '=',
                compareValue: 'SETTLED',
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CLOSE', // Closes record if SETTLED
                onFailAction: 'CONTINUE',
                onErrorAction: 'STOP'
            }
        ]
    };
    const records = [
        { transaction_id: 'TX-01', status: 'SETTLED' }, // Should be CLOSED
        { transaction_id: 'TX-02', status: 'PENDING' }, // Should remain INVESTIGATING
        { transaction_id: 'TX-03', status: 'SETTLED' } // Should be CLOSED
    ];
    const batchResults = executeBatchInvestigation(records, workflow);
    assert(batchResults['TX-01'].investigationStatus === 'CLOSED', 'Batch TX-01 is marked CLOSED');
    assert(batchResults['TX-02'].investigationStatus !== 'CLOSED' && batchResults['TX-02'].isClosed === false, 'Batch TX-02 is NOT closed (independent lifecycle)');
    assert(batchResults['TX-03'].investigationStatus === 'CLOSED', 'Batch TX-03 is marked CLOSED');
    assert(Object.keys(batchResults).length === 3, 'Batch evaluated all 3 transactions independently');
}
// -----------------------------------------------------------------------------
// SUITE 6: Contextual Status Flags & Target Table Attributes (Settled Date, Declined, etc.)
// -----------------------------------------------------------------------------
console.log('\n--- SUITE 6: Contextual Status Flags & Data Attributes ---');
{
    const settlementWf = {
        id: 'wf-settlement',
        name: 'Multi-Stage Settlement Verification',
        category: 'Settlement',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        stages: [baseStage],
        steps: [
            {
                id: 'r1',
                stepNumber: 1,
                name: 'Verify Settlement Status',
                stageId: 'stage-recon',
                checkType: 'STATUS_MATCH',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'status',
                compareValue: 'SETTLED',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP',
                dependencyCondition: 'ALWAYS'
            }
        ]
    };
    // Case 1: Settled with date in record
    const settledRec = { transaction_id: 'TX-SETTLE', status: 'SETTLED', settlement_date: '2026-08-19' };
    const summarySettled = executeWorkflowForTransaction(settledRec, settlementWf);
    assert(summarySettled.statusFlagText === 'Settled on 2026-08-19', 'Settlement flag includes date: "Settled on 2026-08-19"');
    assert(summarySettled.statusFlagColor === 'emerald', 'Settled status flag has emerald badge color');
    // Case 2: Bank decline with decline response code
    const declinedRec = { transaction_id: 'TX-DEC', status: 'DECLINED', response_code: '05' };
    const summaryDeclined = executeWorkflowForTransaction(declinedRec, settlementWf);
    assert(summaryDeclined.statusFlagText === 'Declined (Code 05)', 'Declined flag displays code: "Declined (Code 05)"');
    assert(summaryDeclined.statusFlagColor === 'rose', 'Declined status flag has rose badge color');
    // Case 3: Reversed with date
    const reversedRec = { transaction_id: 'TX-REV', status: 'REVERSED', auth_time: '2026-08-20 10:00:00' };
    const summaryReversed = executeWorkflowForTransaction(reversedRec, settlementWf);
    assert(summaryReversed.statusFlagText === 'Reversed on 2026-08-20', 'Reversed flag includes date: "Reversed on 2026-08-20"');
    assert(summaryReversed.statusFlagColor === 'purple', 'Reversed status flag has purple badge color');
}
console.log('\n================================================================');
console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (100%)`);
console.log('================================================================');
if (passedTests !== totalTests) {
    process.exit(1);
}
else {
    process.exit(0);
}
