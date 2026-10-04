/**
 * Pipeline Architecture Contracts
 *
 * TypeScript interfaces for the Rule-to-Method Pipeline Architecture.
 * These types are the canonical source of truth for all four layers:
 *   L1: Configuration (Workflow JSON)
 *   L2: Compiler / Builder (WorkflowPipelineBuilder)
 *   L3: Execution / I/O (ValidationMethod instances)
 *   L4: Common Reconciliation (ReconciliationEngine + NextStageInputResolver)
 *
 * @see RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md §5.2 and §7.7
 */

import type { ValidationBoxType, PipelineAction } from '../../types.js';

// ---------------------------------------------------------------------------
// §5.2 — Single-Row (Interactive) Execution Contracts
// ---------------------------------------------------------------------------

/**
 * Immutable execution coordinates for a single input row passing through
 * the pipeline. Carries the complete forensic lineage across all stages.
 *
 * §9.1: rowNumber is the universal coordinate — it MUST match
 *        task_dataset_transactions.row_number exactly.
 */
export interface ValidationExecutionContext {
  /** PostgreSQL task ID (investigation_tasks.id). */
  taskId: string;
  /** Batch execution segment identifier. */
  batchId: string;
  /** Current stage being evaluated. */
  stageId: string;
  /** Human-readable stage name for audit records. */
  stageName: string;
  /** Current validation method / step ID. */
  validationId: string;
  /**
   * Immutable row coordinate from task_dataset_transactions.row_number.
   * §9.1: Every stage and mirror entry MUST preserve this value unchanged.
   */
  rowNumber: number;
  /** Business transaction identifier (may differ from row_number). */
  transactionId: string;
  /** ISO-8601 timestamp at pipeline entry. Set automatically if omitted. */
  executionTimestamp?: string;
  /** Complete, ordered audit trail of all prior stage evaluations. */
  lineageHistory: StageExecutionRecord[];
  /** The original unmodified input record at pipeline ingress. */
  initialRecord?: Record<string, any>;
  /** Rule block identifier for mirror table scoping (§9.1). */
  ruleBlockId?: string;
  /** The workflow ID being executed. */
  workflowId?: string;
  /** Primary external DB target for this pipeline run. */
  targetDbId?: string;
  /** Primary external table target for this pipeline run. */
  targetTable?: string;
  /** True if this row is tainted with a diagnostic-only flag (Rule 12). */
  isDiagnosticOnly?: boolean;
}

/**
 * Immutable record of a single stage evaluation, appended to
 * context.lineageHistory. Never replaced or overwritten (§2.12).
 */
export interface StageExecutionRecord {
  stageId: string;
  stageName: string;
  validationId: string;
  /** Validation verdict — strictly separated from pipelineAction. */
  validationResult: 'PASS' | 'FAIL' | 'ERROR' | 'PAUSED_DB_OFFLINE';
  /** What the pipeline does next — strictly separated from validationResult. */
  pipelineAction: PipelineAction;
  /** Row count resolution status from cardinality policy. */
  cardinalityStatus: 'EXACT_MATCH' | 'CARDINALITY_BREACH' | 'ORDERED_LATEST_PICKED' | 'FANOUT' | 'NO_MATCH';
  /**
   * Strongly-keyed dictionary of values extracted from the external result.
   * Downstream stages resolve their requiredInputKeys from this dict.
   */
  producedValues: Record<string, any>;
  /** ISO-8601 timestamp of this evaluation. Primary field. */
  evaluatedAt: string;
  /** Alias for evaluatedAt used by bridging helpers. */
  executedAt?: string;
  /** Human-readable verdict message (surfaces in audit trail). */
  message?: string;
  /** Technical error detail string (for ERROR/PAUSED_DB_OFFLINE verdicts). */
  errorDetail?: string;
  /** Stage box type for audit serialization. */
  stageType?: string;
  /** Elapsed execution time in milliseconds for this stage record. */
  durationMs?: number;
  /** Optional detailed comparison evidence for Maker-Checker review. */
  details?: Record<string, any>;
}

/**
 * Contract returned by a ValidationMethod after data acquisition.
 * Contains ONLY the staging result — no verdicts, no pipeline actions.
 * Verdicts are the exclusive domain of ReconciliationEngine.
 *
 * §2.7: The validation method does NOT decide PASS, FAIL, CONTINUE, or STOP.
 */
export interface ValidationDataResult {
  context: ValidationExecutionContext;
  /** Physical name of the UNLOGGED mirror table used to stage rows. */
  mirrorTable: string;
  /** Total rows fetched from external source and staged to mirror. */
  fetchedRowCount: number;
  /** Raw rows returned from external database. */
  rawRows: any[];
}

/**
 * Core interface for all validation methods (Layers 3 I/O).
 * Each implementation covers exactly one ValidationBoxType.
 */
export interface ValidationMethod {
  readonly id: string;
  readonly targetDbId?: string;
  readonly targetTable?: string;
  /** Fields this method requires from the previous stage's producedValues. */
  readonly requiredInputKeys: string[];

  /**
   * Executes data acquisition and stages results to mirror.
   * Must NOT determine verdicts or pipeline actions.
   */
  execute(
    context: ValidationExecutionContext,
    inputs: Record<string, any>
  ): Promise<ValidationDataResult>;
}

/**
 * Output of the ReconciliationEngine for a single-row evaluation.
 * Contains verdict, action, produced values, and the immutable lineage record.
 */
export interface ReconciliationResult {
  /** PASS / FAIL / ERROR / PAUSED_DB_OFFLINE */
  validationResult: 'PASS' | 'FAIL' | 'ERROR' | 'PAUSED_DB_OFFLINE';
  /** CONTINUE / STOP / CLOSE / FLAG / REPORT */
  pipelineAction: PipelineAction;
  cardinalityStatus: 'EXACT_MATCH' | 'CARDINALITY_BREACH' | 'ORDERED_LATEST_PICKED' | 'FANOUT' | 'NO_MATCH';
  /** Values to be made available to downstream stages. */
  producedValues: Record<string, any>;
  /** Convenience list of keys in producedValues. */
  availableKeys: string[];
  /** Raw comparison details for audit / Maker-Checker evidence. */
  comparison: Record<string, any>;
  /** The immutable lineage record appended to context.lineageHistory. */
  executionRecord: StageExecutionRecord;
}

// ---------------------------------------------------------------------------
// §7.7 — Set-Based (Batch) Execution Contracts
// ---------------------------------------------------------------------------

/**
 * Execution coordinates for a batch of records processed set-based in SQL.
 * §7.7: Used by executeSet() / reconcileSet() instead of looping over rows.
 */
export interface BatchExecutionContext {
  taskId: string;
  batchId: string;
  stageId: string;
  stageName: string;
  ruleBlockId: string;
  totalRecords: number;
  /** 64-bit advisory lock key derived via derive64BitAdvisoryLockSql(). */
  advisoryLockKey?: string;
  executionTimestamp: string;
}

/**
 * Contract returned by executeSet(): describes the mirror table populated
 * after a batch external query, without pulling rows into Node.js memory.
 */
export interface BatchValidationDataResult {
  context: BatchExecutionContext;
  mirrorTable: string;
  /** Total rows staged to the mirror. */
  stagedRowCount: number;
  executionTimeMs: number;
}

/**
 * Aggregate reconciliation outcomes for an entire batch (set-based mode).
 * Produced by reconcileSet() from a lightweight PostgreSQL COUNT() query.
 */
export interface BatchReconciliationResult {
  batchId: string;
  stageId: string;
  totalEvaluated: number;
  passedCount: number;
  failedCount: number;
  forwardedCount: number;
  stoppedCount: number;
  executionTimeMs: number;
  errorDetail?: string;
}

// ---------------------------------------------------------------------------
// §3.2 — Builder / Compiler Contracts
// ---------------------------------------------------------------------------

/**
 * A compiled, executable stage produced by WorkflowPipelineBuilder.
 * Wraps one or more ValidationMethod instances for a single box in the DAG.
 */
export interface ExecutableStageContract {
  stageId: string;
  stageName: string;
  stageType: ValidationBoxType;
  cardinalityPolicy?: string;
  orderByColumn?: string;
  validations: ValidationMethod[];
}

/**
 * A compiled pipeline ready for execution against a dataset.
 * Produced by WorkflowPipelineBuilder.compile().
 */
export interface ExecutablePipelineContract {
  workflowId: string;
  workflowName: string;
  stages: ExecutableStageContract[];
  /** Execute the full pipeline on a single transaction context. */
  executeRow(context: ValidationExecutionContext): Promise<PipelineExecutionReport>;
  /**
   * Execute the full pipeline in set-based SQL mode for a batch.
   * @param batchCtx   Batch execution coordinates.
   * @param inputRows  Ordered input rows from task_dataset_transactions.
   * @param dbLookup   Resolves a dbId to a live DatabaseConnection.
   */
  executeBatch(
    batchCtx: BatchExecutionContext,
    inputRows: Array<Record<string, any> & { _row_number: number; _task_id: string }>,
    dbLookup: (dbId: string) => Promise<any>
  ): Promise<BatchPipelineExecutionReport>;
}

/**
 * Final report produced after executing the pipeline over a single row.
 */
export interface PipelineExecutionReport {
  taskId: string;
  rowNumber: number;
  transactionId: string;
  finalResult: 'PASS' | 'FAIL' | 'ERROR' | 'PAUSED_DB_OFFLINE';
  finalAction: PipelineAction;
  lineageHistory: StageExecutionRecord[];
  durationMs: number;
}

/**
 * Final report produced after executing the pipeline over a batch in set-based mode.
 */
export interface BatchPipelineExecutionReport {
  taskId: string;
  batchId: string;
  stageResults: BatchReconciliationResult[];
  totalEvaluated: number;
  passedCount: number;
  failedCount: number;
  durationMs: number;
  rowOutcomes?: Array<{
    rowNumber: number;
    validationStatus: 'PASS' | 'FAIL' | 'ERROR' | 'PAUSED_DB_OFFLINE';
    validationAction: PipelineAction;
    details?: any;
    targetRecord?: any;
  }>;
}

// ---------------------------------------------------------------------------
// §2.13 — Compiled Rule Definition
// ---------------------------------------------------------------------------

/**
 * A rule step compiled by the builder from workflow JSON.
 * Static configuration only — no runtime state.
 */
export interface CompiledRuleDefinition {
  id: string;
  checkType: string;
  targetDbId?: string;
  targetTable?: string;
  /** Key-value mappings from input fields to external table columns. */
  parameters: Array<{ inputField: string; targetColumn: string }>;
  /** Column names to extract from external result for downstream use. */
  outputKeys: string[];
  onPassAction: PipelineAction;
  onFailAction: PipelineAction;
  onErrorAction: PipelineAction;
  toleranceMargin?: number;
  cardinalityPolicy?: string;
  orderByColumn?: string;
  rawStep?: Record<string, any>;
}
