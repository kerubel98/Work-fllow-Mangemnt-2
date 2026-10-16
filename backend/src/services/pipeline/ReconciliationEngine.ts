/**
 * ReconciliationEngine — §2.8 Common Reconciliation Engine
 *
 * The single shared engine that:
 *   1. Resolves cardinality (STRICT_SINGLE, EXPLICIT_LATEST, ONE_TO_MANY, ALL_ROWS).
 *   2. Compares input data against mirrored external rows.
 *   3. Assigns ValidationResult (PASS / FAIL / ERROR / PAUSED_DB_OFFLINE).
 *   4. Determines PipelineAction (CONTINUE / STOP / CLOSE / FLAG / REPORT).
 *   5. Extracts produced values for downstream stages.
 *   6. Builds an immutable StageExecutionRecord appended to lineageHistory.
 *
 * This engine is shared across ALL four ValidationBoxTypes (§6.1):
 *   INGESTION_SEARCH, CONDITION_CHECK, RECONCILIATION, REPORT.
 *
 * §4.2 Corrections enforced here:
 *   - STRICT_SINGLE with >1 rows emits CARDINALITY_BREACH — no silent row slicing.
 *   - Verdict (PASS/FAIL) is strictly separated from Action (CONTINUE/STOP).
 *   - Diagnostic taint (_isDiagnosticOnly) applied when FAIL + action = CONTINUE/REPORT.
 *
 * §7.2: Provides both reconcileRow() (interactive) and reconcileSet() (batch SQL).
 *
 * @see RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md §2.8, §4.2, §5.2, §5.3, §7.2
 */

import { queryPg } from '../../config/postgres.js';
import { ruleSqlCompiler } from '../ruleSqlCompiler.js';
import { reconciliationService } from '../reconciliationService.js';
import type {
  ValidationExecutionContext,
  ValidationDataResult,
  ReconciliationResult,
  StageExecutionRecord,
  BatchExecutionContext,
  BatchReconciliationResult,
} from './types.js';
import type { ValidationCheckStep, PipelineAction } from '../../types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveCardinalityStatus(
  rows: any[],
  policy: string | undefined
): { rows: any[]; status: StageExecutionRecord['cardinalityStatus']; breach: boolean } {
  if (!rows || rows.length === 0) {
    return { rows: [], status: 'NO_MATCH', breach: false };
  }

  if (!policy || policy === 'STRICT_SINGLE') {
    if (rows.length === 1) return { rows, status: 'EXACT_MATCH', breach: false };
    // §4.2 Correction 3: Never slice rows — emit CARDINALITY_BREACH instead
    return { rows, status: 'CARDINALITY_BREACH', breach: true };
  }

  if (policy === 'EXPLICIT_LATEST') {
    // Assume rows are already sorted descending by the caller (mirror ORDER BY)
    return { rows: [rows[0]], status: 'ORDERED_LATEST_PICKED', breach: false };
  }

  if (policy === 'EXPLICIT_FIRST') {
    return { rows: [rows[0]], status: 'ORDERED_FIRST_PICKED', breach: false };
  }

  if (policy === 'ONE_TO_MANY' || policy === 'ALL_ROWS') {
    return { rows, status: 'FANOUT', breach: false };
  }

  // Fail-closed for unrecognized policies
  return { rows, status: 'CARDINALITY_BREACH', breach: true };
}

function extractProducedValues(
  rows: any[],
  rule: ValidationCheckStep & { outputKeys?: string[] }
): Record<string, any> {
  if (!rows || rows.length === 0) return {};
  const row = rows[0];
  const produced: Record<string, any> = {};

  // Emit all non-operational mirror columns as produced values
  for (const [k, v] of Object.entries(row)) {
    if (!k.startsWith('_') && k !== 'payload' && k !== 'row_num') {
      produced[k] = v;
    }
  }

  // Also include explicitly declared output keys
  if (Array.isArray(rule.outputKeys)) {
    for (const key of rule.outputKeys) {
      if (produced[key] === undefined && row[key] !== undefined) {
        produced[key] = row[key];
      }
    }
  }

  return produced;
}

function determinePipelineAction(
  validationResult: string,
  rule: ValidationCheckStep
): PipelineAction {
  if (validationResult === 'PASS') {
    return (rule.onPassAction as PipelineAction) || 'CONTINUE';
  }
  if (validationResult === 'FAIL') {
    return (rule.onFailAction as PipelineAction) || 'STOP';
  }
  return (rule.onErrorAction as PipelineAction) || 'STOP';
}

// ---------------------------------------------------------------------------
// ReconciliationEngine class
// ---------------------------------------------------------------------------

export class ReconciliationEngine {
  /**
   * Mode B: Interactive single-row reconciliation.
   *
   * Called from the pipeline loop inside ExecutablePipeline.executeRow().
   * Evaluates rows in memory using the rule definition, produces verdict
   * and pipeline action, and returns an immutable StageExecutionRecord.
   *
   * §3.1 Validation Result ≠ Pipeline Action is strictly enforced here.
   */
  async reconcileRow(
    input: Record<string, any>,
    validationData: ValidationDataResult,
    rule: ValidationCheckStep & { cardinalityPolicy?: string; aggregationStrategy?: string; outputKeys?: string[] },
    context: ValidationExecutionContext
  ): Promise<ReconciliationResult> {
    const { rows, status: cardinalityStatus, breach } = resolveCardinalityStatus(
      validationData.rawRows,
      rule.cardinalityPolicy
    );

    // §5.3: CARDINALITY_BREACH halts evaluation — emits FAIL + configured action
    if (breach) {
      const pipelineAction = (rule.onFailAction as PipelineAction) || 'STOP';
      const producedValues: Record<string, any> = {
        _matchCount: validationData.rawRows.length,
        _rawRows: validationData.rawRows.slice(0, 5),
        _discrepancyFlag: 'DUPLICATE_EXTERNAL_MATCH',
      };
      if (pipelineAction === 'CONTINUE' || pipelineAction === 'REPORT') {
        producedValues._isDiagnosticOnly = true;
        producedValues._diagnosticTaintReason = 'CARDINALITY_BREACH_DIAGNOSTIC_ONLY';
      }
      const executionRecord: StageExecutionRecord = {
        stageId: context.stageId,
        stageName: context.stageName,
        validationId: context.validationId,
        validationResult: 'FAIL',
        pipelineAction,
        cardinalityStatus: 'CARDINALITY_BREACH',
        producedValues,
        evaluatedAt: new Date().toISOString(),
        details: { matchCount: validationData.rawRows.length },
      };
      return {
        validationResult: 'FAIL',
        pipelineAction,
        cardinalityStatus: 'CARDINALITY_BREACH',
        producedValues,
        availableKeys: Object.keys(producedValues),
        comparison: { matchCount: validationData.rawRows.length },
        executionRecord,
      };
    }

    // No match → FAIL
    if (rows.length === 0) {
      const pipelineAction = determinePipelineAction('FAIL', rule);
      const producedValues: Record<string, any> = {};
      if (pipelineAction === 'CONTINUE' || pipelineAction === 'REPORT') {
        producedValues._isDiagnosticOnly = true;
        producedValues._diagnosticTaintReason = 'NO_MATCH_DIAGNOSTIC_ONLY';
      }
      const executionRecord: StageExecutionRecord = {
        stageId: context.stageId,
        stageName: context.stageName,
        validationId: context.validationId,
        validationResult: 'FAIL',
        pipelineAction,
        cardinalityStatus: 'NO_MATCH',
        producedValues,
        evaluatedAt: new Date().toISOString(),
        details: { reason: 'No external records matched the search keys.' },
      };
      return {
        validationResult: 'FAIL',
        pipelineAction,
        cardinalityStatus: 'NO_MATCH',
        producedValues,
        availableKeys: Object.keys(producedValues),
        comparison: {},
        executionRecord,
      };
    }

    // Evaluate the primary condition in memory
    const matchedRow = rows[0];
    let passed = true;
    const comparison: Record<string, any> = {};

    if (rule.checkType === 'EXISTENCE_CHECK') {
      passed = rows.length > 0;
      comparison.existence = passed;
    } else if (rule.checkType === 'AMOUNT_MATCH') {
      const inputAmt = parseFloat(
        String(input.canonical_data?.amount ?? input.canonical_data?.reqamt ?? input.amount ?? 0)
      );
      // Phase 10: Runtime Aggregation Implementation
      let mirrorAmt = 0;
      if (rule.aggregationStrategy === 'SUM') {
        mirrorAmt = rows.reduce((sum, r) => sum + parseFloat(String(r.amount ?? r.reqamt ?? r.amt ?? 0)), 0);
      } else if (rule.aggregationStrategy === 'COUNT') {
        mirrorAmt = rows.length;
      } else if (rule.aggregationStrategy === 'MIN') {
        mirrorAmt = Math.min(...rows.map(r => parseFloat(String(r.amount ?? r.reqamt ?? r.amt ?? 0))));
      } else if (rule.aggregationStrategy === 'MAX') {
        mirrorAmt = Math.max(...rows.map(r => parseFloat(String(r.amount ?? r.reqamt ?? r.amt ?? 0))));
      } else {
        mirrorAmt = parseFloat(
          String(matchedRow.amount ?? matchedRow.reqamt ?? matchedRow.amt ?? 0)
        );
      }
      const margin = Number(rule.toleranceMargin ?? rule.tolerance ?? 0);
      passed = Math.abs(inputAmt - mirrorAmt) <= margin;
      comparison.inputAmount = inputAmt;
      comparison.mirrorAmount = mirrorAmt;
      comparison.delta = Math.abs(inputAmt - mirrorAmt);
      comparison.tolerance = margin;
      if (rule.aggregationStrategy && rule.aggregationStrategy !== 'NONE') {
        comparison.aggregationStrategy = rule.aggregationStrategy;
        comparison.aggregatedValue = mirrorAmt;
      }
    } else if (rule.checkType === 'FIELD_COMPARATOR' || rule.checkType === 'STATUS_MATCH') {
      const targetCol = rule.targetField || rule.sourceField || '';
      const inputVal = String(
        input.canonical_data?.[targetCol] ?? input.raw_data?.[targetCol] ?? input[targetCol] ?? ''
      ).toLowerCase().trim();
      const mirrorVal = String(matchedRow[targetCol] ?? '').toLowerCase().trim();
      const expectedVal = String(rule.compareValue ?? rule.expectedValue ?? '').toLowerCase().trim();
      if (expectedVal) {
        passed = inputVal ? (inputVal === expectedVal && mirrorVal === expectedVal) : mirrorVal === expectedVal;
      } else {
        passed = inputVal === mirrorVal;
      }
      comparison[targetCol] = { input: inputVal, mirror: mirrorVal, expected: expectedVal, match: passed };
    } else if (rule.checkType === 'VALUE_MATCH') {
      const targetCol = rule.targetField || rule.sourceField || '';
      const mirrorVal = String(matchedRow[targetCol] ?? '').toLowerCase().trim();
      const expectedVal = String(rule.compareValue ?? rule.expectedValue ?? '').toLowerCase().trim();
      passed = mirrorVal === expectedVal;
      comparison[targetCol] = { mirror: mirrorVal, expected: expectedVal, match: passed };
    } else if (rule.checkType === 'SQL_CONDITION' || rule.checkType === 'DATABASE_CONFIG_RULES') {
      passed = true;
    } else {
      // RE-001: Unknown check types fail closed
      passed = false;
      comparison.error = `Unsupported checkType '${rule.checkType}'. Fail-closed enforcement rejects unknown check types.`;
    }

    const validationResult = passed ? 'PASS' : 'FAIL';
    const pipelineAction = determinePipelineAction(validationResult, rule);
    const producedValues = extractProducedValues(rows, rule);
    if (rule.aggregationStrategy && rule.aggregationStrategy !== 'NONE') {
      producedValues.aggregatedValue = comparison.mirrorAmount;
    }

    // §3.1 / §4.2: Diagnostic taint when FAIL but pipeline continues
    if (!passed && (pipelineAction === 'CONTINUE' || pipelineAction === 'REPORT')) {
      producedValues._isDiagnosticOnly = true;
      producedValues._diagnosticTaintReason = 'UPSTREAM_FAILURE_DIAGNOSTIC_ONLY';
    }

    const executionRecord: StageExecutionRecord = {
      stageId: context.stageId,
      stageName: context.stageName,
      validationId: context.validationId,
      validationResult,
      pipelineAction,
      cardinalityStatus,
      producedValues,
      evaluatedAt: new Date().toISOString(),
      details: comparison,
    };

    return {
      validationResult,
      pipelineAction,
      cardinalityStatus,
      producedValues,
      availableKeys: Object.keys(producedValues),
      comparison,
      executionRecord,
    };
  }

  /**
   * Mode A: Set-based batch SQL reconciliation.
   *
   * Delegates to `ruleSqlCompiler.compileBlockUpdateSql()` and executes
   * the resulting single `UPDATE mirror SET _validation_status = CASE WHEN ...`
   * atomically in PostgreSQL. Then issues a lightweight COUNT query to
   * gather aggregate metrics without pulling rows into Node.js.
   *
   * §7.3: The UPDATE joins on (_task_id, _row_number) using a
   * DISTINCT ON CTE from task_dataset_transactions to prevent row explosion.
   *
   * @param context       Batch execution coordinates.
   * @param mirrorTable   UNLOGGED mirror table populated by IngestionSearchMethod.
   * @param rules         Array of ValidationCheckSteps compiled into CASE branches.
   * @param mirrorCols    Available physical columns in the mirror table.
   * @param options       Optional cardinality policy, aggregation strategy, and ordering.
   */
  async reconcileSet(
    context: BatchExecutionContext,
    mirrorTable: string,
    rules: ValidationCheckStep[],
    mirrorCols?: string[],
    options?: {
      cardinalityPolicy?: string;
      aggregationStrategy?: string;
      orderByColumn?: string;
    }
  ): Promise<BatchReconciliationResult> {
    const t0 = Date.now();

    // Compile the rule block into a parameterized UPDATE statement
    const compiled = ruleSqlCompiler.compileBlockUpdateSql(
      mirrorTable,
      context.ruleBlockId,
      rules,
      mirrorCols,
      options
    );

    // Execute the set-based UPDATE (§7.3)
    // $1 = batchId, $2 = ruleBlockId (per compileBlockUpdateSql §Gap4 fix)
    await queryPg(compiled.fullUpdateSql, [context.batchId, context.ruleBlockId]);

    // §9.5 Propagate verdict to task_dataset_transactions via deterministic (_task_id, _row_number) join
    if (context.taskId) {
      try {
        await reconciliationService.reconcileByRowNumber(
          context.taskId,
          context.batchId,
          context.ruleBlockId,
          mirrorTable,
          context.stageId,
          context.workflowId || 'default',
          context.targetTable || ''
        );
      } catch (err: any) {
        console.warn(`[ReconciliationEngine] task_dataset_transactions reconciliation notice: ${err.message}`);
      }
    }

    // Issue a single lightweight aggregate COUNT query (§7.6 Step 2)
    const countRes = await queryPg(
      `SELECT
         COUNT(*)::int                                              AS total,
         COUNT(*) FILTER (WHERE _validation_status = 'PASS')::int  AS passed,
         COUNT(*) FILTER (WHERE _validation_status = 'FAIL')::int  AS failed,
         COUNT(*) FILTER (WHERE _validation_action = 'CONTINUE')::int AS forwarded,
         COUNT(*) FILTER (WHERE _validation_action = 'STOP')::int  AS stopped
       FROM ${mirrorTable}
       WHERE _batch_id = $1
         AND _rule_block_id = $2`,
      [context.batchId, context.ruleBlockId]
    );

    const row = countRes.rows?.[0] ?? {};

    return {
      batchId: context.batchId,
      stageId: context.stageId,
      totalEvaluated: Number(row.total ?? 0),
      passedCount: Number(row.passed ?? 0),
      failedCount: Number(row.failed ?? 0),
      forwardedCount: Number(row.forwarded ?? 0),
      stoppedCount: Number(row.stopped ?? 0),
      executionTimeMs: Date.now() - t0,
    };
  }
}
