/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DatabaseValidationWorkflow,
  QueryExtraction,
  BatchPolicy,
  InvestigationExecutionPlan,
  InvestigationStagePlan
} from '../types';
import { createBatchPlan, DEFAULT_BATCH_POLICY } from './batchPlanner';
import { resolveRequiredColumnsForWorkflow } from './requiredFieldResolver';
import { resolveCanonicalKey, validateDatasetKeys } from './canonicalKeyResolver';

export interface PlanInvestigationOptions {
  transactionKeyField?: string;
  batchPolicy?: Partial<BatchPolicy>;
  planId?: string;
  dbTableMappings?: Record<string, any>;
  strictFailFast?: boolean;
}

export interface InvestigationPlanValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  plan?: InvestigationExecutionPlan;
}

/**
 * Validates and converts a workflow, dataset, and extractions into a concrete, executable InvestigationExecutionPlan.
 */
export function planInvestigation(
  transactions: Record<string, any>[],
  workflow: DatabaseValidationWorkflow,
  queryExtractions: QueryExtraction[] = [],
  options: PlanInvestigationOptions = {}
): InvestigationPlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!workflow || !workflow.id) {
    errors.push('A valid workflow must be provided.');
  }

  const enabledStages = (workflow.stages || []).filter(s => s.enabled);
  if (enabledStages.length === 0) {
    errors.push(`Workflow '${workflow.name || 'Unnamed'}' has no enabled processing stages.`);
  }

  if (!Array.isArray(transactions) || transactions.length === 0) {
    errors.push('Transaction dataset is empty or invalid.');
  }

  // Determine transaction key field using metadata-driven canonical resolution (Rule 9)
  const keyResolution = resolveCanonicalKey({
    explicitKey: options.transactionKeyField,
    workflow,
    stage: enabledStages[0],
    queryExtraction: queryExtractions[0],
    transactions,
    dbTableMappings: options.dbTableMappings,
    strictFailFast: options.strictFailFast
  });

  const keyField = keyResolution.primaryKey;
  if (keyResolution.warning) {
    warnings.push(keyResolution.warning);
  }

  const keyValidation = validateDatasetKeys(transactions, keyField);
  if (!keyValidation.isValid && keyValidation.warning) {
    warnings.push(keyValidation.warning);
  }

  // Extract transaction IDs with resolved canonical key
  const transactionIds = (transactions || []).map((t, idx) => {
    return String(t[keyField] ?? t.id ?? t.tx_id ?? `TX-${idx + 1}`);
  });

  // Resolve required columns per stage
  const stageFieldReqs = resolveRequiredColumnsForWorkflow(workflow, queryExtractions);

  // Check for configuration warnings
  for (const [_, req] of Object.entries(stageFieldReqs)) {
    if (req.warnings.length > 0) {
      warnings.push(...req.warnings);
    }
  }

  if (errors.length > 0) {
    return {
      isValid: false,
      errors,
      warnings
    };
  }

  // Build stage plans
  const stages: InvestigationStagePlan[] = enabledStages.map(stage => {
    const req = stageFieldReqs[stage.id];
    const extraction = queryExtractions.find(e => e.stageId === stage.id || e.workflowId === workflow.id);
    return {
      stageId: stage.id,
      stageName: stage.name,
      targetDbId: stage.targetDbId,
      targetDataSource: stage.targetDataSource,
      requiredColumns: req ? req.requiredColumns.map(c => c.sourceColumn) : [],
      extractionId: extraction?.id
    };
  });

  // Batch & Query Chunk partitioning
  const activeBatchPolicy: BatchPolicy = {
    ...DEFAULT_BATCH_POLICY,
    ...(options.batchPolicy || {})
  };

  const batches = createBatchPlan(transactionIds, activeBatchPolicy);

  const planId = options.planId || `plan-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const plan: InvestigationExecutionPlan = {
    id: planId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    transactionCount: transactions.length,
    stages,
    batches,
    batchPolicy: activeBatchPolicy,
    createdAt: new Date().toISOString()
  };

  return {
    isValid: true,
    errors: [],
    warnings,
    plan
  };
}
