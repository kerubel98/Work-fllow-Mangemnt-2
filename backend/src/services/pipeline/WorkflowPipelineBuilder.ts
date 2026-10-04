/**
 * WorkflowPipelineBuilder — §3.2 Builder / Compiler
 *
 * Compiles a `DatabaseValidationWorkflow` JSON object into an `ExecutablePipeline`
 * ready for immediate row-by-row (Mode B) or set-based batch (Mode A) execution.
 *
 * Compilation steps (§3.3):
 *   1. Validate acyclicity of the DAG using Kahn's topological sort algorithm.
 *   2. Resolve topological stage order from FlowchartNode/FlowchartConnection graph.
 *   3. Bind ValidationSteps (ValidationCheckStep) to their owning ProcessingStage.
 *   4. For each stage, dispatch the correct ValidationMethod implementation based on
 *      the `stageType` (boxType):
 *        - INGESTION_SEARCH → IngestionSearchMethod (external query + mirror staging)
 *        - CONDITION_CHECK  → ConditionCheckMethod (local in-memory predicate)
 *        - RECONCILIATION   → ReconciliationMethod (mirror read + tolerance math)
 *        - REPORT           → ReportMethod (non-mutating lineage synthesis)
 *   5. Validate that requiredInputKeys declared by each method are satisfiable from
 *      upstream producedKeys at compile time.
 *   6. Return a compiled ExecutablePipeline instance.
 *
 * §4.2 Corrections:
 *   - STRICT_SINGLE cardinalityPolicy requires orderByColumn to be non-empty for
 *     EXPLICIT_LATEST / EXPLICIT_FIRST (compile-time error if missing).
 *   - REPORT boxes may NOT configure onFailAction = 'STOP' (§6.6 §1).
 *   - All targetDbId and targetTable references must be non-empty for INGESTION_SEARCH
 *     (§Rule 4 — External System Agnosticism).
 *
 * @see RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md §3.2, §3.3, §3.4, §4.2
 */

import type {
  DatabaseValidationWorkflow,
  ProcessingStage,
  ValidationCheckStep,
  FlowchartNode,
  FlowchartConnection,
  ValidationBoxType,
} from '../../types.js';
import type { ValidationMethod, ValidationExecutionContext, ValidationDataResult } from './types.js';
import { ExecutablePipeline, ExecutableStage } from './ExecutablePipeline.js';
import {
  IngestionSearchMethod,
  ConditionCheckMethod,
  ReconciliationMethod,
  DiagnosticReportMethod,
} from './methods/index.js';

// ---------------------------------------------------------------------------
// WorkflowPipelineBuilder
// ---------------------------------------------------------------------------

export class WorkflowPipelineBuilder {
  /**
   * Compiles a DatabaseValidationWorkflow JSON into an ExecutablePipeline.
   *
   * @throws Error if DAG is cyclic, required config is missing, or a REPORT
   *         box is mis-configured with STOP action.
   */
  compile(workflow: DatabaseValidationWorkflow): ExecutablePipeline {
    const rawStages = (workflow.stages || []).filter(s => s.enabled !== false);
    const effectiveStages: ProcessingStage[] = rawStages.length > 0 ? rawStages : [
      {
        id: `stage-default-${workflow.id}`,
        name: 'Validation Stage',
        order: 1,
        targetDbId: workflow.targetDbId || '',
        targetDataSource: workflow.targetTable || '',
        enabled: true
      }
    ];

    // Step 1: Topological sort of the flowchart DAG (Kahn's algorithm)
    const topologicalStageIds = this._topoSort(
      effectiveStages,
      workflow.nodes ?? [],
      workflow.connections ?? []
    );

    // Validate acyclicity — if topoSort length < stages length, there is a cycle
    if (topologicalStageIds.length < effectiveStages.length) {
      const missing = effectiveStages
        .map(s => s.id)
        .filter(id => !topologicalStageIds.includes(id));
      throw new Error(
        `[WorkflowPipelineBuilder] DAG Cycle Detected in workflow "${workflow.name}". ` +
        `Unreachable stages: ${missing.join(', ')}`
      );
    }

    // Step 2: Build ExecutableStage objects in topological order
    const executableStages: ExecutableStage[] = [];

    // Track all producedKeys accumulated up to each stage for compile-time validation
    const cumulativeProducedKeys = new Set<string>(
      // Seed with standard initial record keys
      ['transaction_id', 'amount', 'status', 'canonical_data', 'raw_data']
    );

    for (const stageId of topologicalStageIds) {
      const stage = effectiveStages.find(s => s.id === stageId);
      if (!stage || stage.enabled === false) continue;

      // Determine box type for this stage by inspecting attached flowchart node
      const node = (workflow.nodes ?? []).find(n => n.boxId === stageId || n.id === stageId);
      const boxType = this._resolveBoxType(stage, node);

      // Gather all steps bound to this stage
      let stageSteps = (workflow.steps ?? []).filter(
        s => s.stageId === stageId
      );
      if (rawStages.length === 0 && stageSteps.length === 0) {
        stageSteps = workflow.steps ?? [];
      }

      // If no steps, create a synthetic existence-check step
      const effectiveSteps: ValidationCheckStep[] = stageSteps.length > 0
        ? stageSteps
        : [{
            id: `${stageId}-auto`,
            name: stage.name,
            stepNumber: 1,
            checkType: 'EXISTENCE_CHECK',
            targetDbId: stage.targetDbId,
            targetTable: stage.targetDataSource,
            dependencyCondition: 'ALWAYS',
            onPassAction: 'CONTINUE',
            onFailAction: 'STOP',
            onErrorAction: 'STOP',
          }];

      // Step 3: Validate configurations
      this._validateStageConfig(stage, boxType, effectiveSteps, node);

      // Step 4: Create ValidationMethod instances
      const validationMethods: ValidationMethod[] = effectiveSteps.map(step =>
        this._createValidationMethod(step, stage, boxType)
      );

      // Step 5: Compile-time input dependency check
      for (const method of validationMethods) {
        const unresolvable = method.requiredInputKeys.filter(
          k => !cumulativeProducedKeys.has(k)
        );
        if (unresolvable.length > 0) {
          // Warn but do not throw — keys may come from the initial record at runtime
          console.warn(
            `[WorkflowPipelineBuilder] Stage "${stage.name}" declares requiredInputKeys ` +
            `[${unresolvable.join(', ')}] that are not produced by any upstream stage. ` +
            `They must be present in the initial input record.`
          );
        }
      }

      // Add expected produced keys for downstream stages
      for (const step of effectiveSteps) {
        if (step.targetField) cumulativeProducedKeys.add(step.targetField);
        if (step.reportField) cumulativeProducedKeys.add(step.reportField);
      }

      // Phase 12: Preserve attached database column configuration IDs (inheriting workflow-level acceptance if stage has no explicit override)
      const explicitStageConfigIds = [
        ...(stage.attachedDbConfigIds || []),
        ...effectiveSteps.flatMap(s => s.attachedDbConfigIds || s.columnConfigurationIds || [])
      ];

      const inheritedWfConfigIds = (explicitStageConfigIds.length === 0 && Array.isArray(workflow.attachedDbConfigIds))
        ? workflow.attachedDbConfigIds.filter(() => {
            const matchesDb = !stage.targetDbId || stage.targetDbId === workflow.targetDbId;
            const matchesTable = !stage.targetDataSource || stage.targetDataSource === workflow.targetTable;
            return matchesDb && matchesTable;
          })
        : [];

      const attachedDbConfigIds = Array.from(new Set([
        ...explicitStageConfigIds,
        ...inheritedWfConfigIds
      ]));

      executableStages.push(new ExecutableStage(
        stage.id,
        stage.name,
        boxType,
        stage.cardinalityPolicy,
        stage.orderByColumn,
        validationMethods,
        effectiveSteps,
        stage.aggregationStrategy,
        attachedDbConfigIds
      ));
    }

    return new ExecutablePipeline(workflow.id, workflow.name, executableStages);
  }

  // ---------------------------------------------------------------------------
  // Private: Kahn's topological sort
  // ---------------------------------------------------------------------------

  private _topoSort(
    stages: ProcessingStage[],
    nodes: FlowchartNode[],
    connections: FlowchartConnection[]
  ): string[] {
    // Build a map of stageId → stageId edges from flowchart connections
    // A connection from node A to node B means A must execute before B
    const nodeToStage = new Map<string, string>();
    for (const node of nodes) {
      if (node.boxId) {
        nodeToStage.set(node.id, node.boxId);
      } else {
        nodeToStage.set(node.id, node.id);
      }
    }

    // Build adjacency list (stageId → downstream stageIds)
    const adj = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    const enabledStageIds = new Set(
      stages.filter(s => s.enabled !== false).map(s => s.id)
    );

    for (const id of enabledStageIds) {
      adj.set(id, new Set());
      inDegree.set(id, 0);
    }

    for (const conn of connections) {
      const fromStage = nodeToStage.get(conn.fromNodeId) ?? conn.fromNodeId;
      const toStage = nodeToStage.get(conn.toNodeId) ?? conn.toNodeId;

      if (
        enabledStageIds.has(fromStage) &&
        enabledStageIds.has(toStage) &&
        fromStage !== toStage
      ) {
        if (!adj.get(fromStage)!.has(toStage)) {
          adj.get(fromStage)!.add(toStage);
          inDegree.set(toStage, (inDegree.get(toStage) ?? 0) + 1);
        }
      }
    }

    // Kahn's BFS
    const queue: string[] = [];
    for (const [id, degree] of inDegree.entries()) {
      if (degree === 0) queue.push(id);
    }

    // Sort queue for deterministic ordering within the same in-degree level
    queue.sort((a, b) => {
      const sa = stages.find(s => s.id === a);
      const sb = stages.find(s => s.id === b);
      return (sa?.order ?? 0) - (sb?.order ?? 0);
    });

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);
      for (const neighbor of (adj.get(current) ?? [])) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
          queue.sort((a, b) => {
            const sa = stages.find(s => s.id === a);
            const sb = stages.find(s => s.id === b);
            return (sa?.order ?? 0) - (sb?.order ?? 0);
          });
        }
      }
    }

    // If no connections at all, fall back to stage.order for determinism
    if (connections.length === 0 && sorted.length === 0) {
      return [...enabledStageIds].sort((a, b) => {
        const sa = stages.find(s => s.id === a);
        const sb = stages.find(s => s.id === b);
        return (sa?.order ?? 0) - (sb?.order ?? 0);
      });
    }

    return sorted;
  }

  // ---------------------------------------------------------------------------
  // Private: BoxType resolution
  // ---------------------------------------------------------------------------

  private _resolveBoxType(stage: ProcessingStage, node?: FlowchartNode): ValidationBoxType {
    // Prefer explicit node type if present
    if (node?.type) {
      if ((node.type as any) === 'INGESTION_SEARCH') return 'INGESTION_SEARCH';
      if (node.type === 'RECONCILIATION') return 'RECONCILIATION';
      if (node.type === 'REPORT') return 'REPORT';
      if (node.type === 'VALIDATION_BOX' || (node.type as any) === 'CONDITION_CHECK') return 'CONDITION_CHECK';
      if (node.type === 'START' || node.type === 'END' || node.type === 'DECISION') return 'CONDITION_CHECK';
      // Unknown explicit type must fail fast (Phase 14)
      return node.type as any;
    }

    // Fallback: infer from stage characteristics
    const hasExternalDb = !!stage.targetDbId && !!stage.targetDataSource;
    if (!hasExternalDb) return 'CONDITION_CHECK';

    // Default external stages to INGESTION_SEARCH
    return 'INGESTION_SEARCH';
  }

  // ---------------------------------------------------------------------------
  // Private: Per-BoxType validation
  // ---------------------------------------------------------------------------

  private _validateStageConfig(
    stage: ProcessingStage,
    boxType: ValidationBoxType,
    steps: ValidationCheckStep[],
    node?: FlowchartNode
  ): void {
    // §Rule 4: INGESTION_SEARCH must have non-empty targetDbId and targetTable
    if (boxType === 'INGESTION_SEARCH') {
      if (!stage.targetDbId || !stage.targetDataSource) {
        throw new Error(
          `[WorkflowPipelineBuilder] §Rule 4 Violation: INGESTION_SEARCH stage ` +
          `"${stage.name}" (${stage.id}) is missing targetDbId or targetDataSource. ` +
          `External DB references must never be hardcoded or empty.`
        );
      }
    }

    // §5.3: EXPLICIT_LATEST and EXPLICIT_FIRST require orderByColumn
    if (
      (stage.cardinalityPolicy === 'EXPLICIT_LATEST' || stage.cardinalityPolicy === 'EXPLICIT_FIRST') &&
      !stage.orderByColumn
    ) {
      throw new Error(
        `[WorkflowPipelineBuilder] §5.3 Violation: Stage "${stage.name}" declares ` +
        `cardinalityPolicy="${stage.cardinalityPolicy}" but is missing orderByColumn. ` +
        `This field is mandatory for ordered cardinality resolution.`
      );
    }

    // §6.6: REPORT boxes must not configure onFailAction = 'STOP'
    if (boxType === 'REPORT') {
      for (const step of steps) {
        if (step.onFailAction === 'STOP') {
          throw new Error(
            `[WorkflowPipelineBuilder] §6.6 Violation: REPORT stage "${stage.name}" ` +
            `step "${step.name}" has onFailAction="STOP". REPORT boxes must use ` +
            `"CONTINUE", "REPORT", or "CLOSE" — never STOP on business logic.`
          );
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Factory — creates the correct ValidationMethod per BoxType
  // ---------------------------------------------------------------------------

  private _createValidationMethod(
    step: ValidationCheckStep,
    stage: ProcessingStage,
    boxType: ValidationBoxType
  ): ValidationMethod {
    switch (boxType) {
      case 'INGESTION_SEARCH':
        return new IngestionSearchMethod(step, stage);
      case 'CONDITION_CHECK':
        return new ConditionCheckMethod(step);
      case 'RECONCILIATION':
        return new ReconciliationMethod(step, stage);
      case 'REPORT':
        return new DiagnosticReportMethod(step);
      default:
        throw new Error(
          `[WorkflowPipelineBuilder] Configuration Error: Unknown boxType "${boxType}" for stage "${stage.name}". ` +
          `Valid canonical types are INGESTION_SEARCH, CONDITION_CHECK, RECONCILIATION, or REPORT.`
        );
    }
  }
}

// Singleton builder instance — stateless, safe for concurrent use
export const workflowPipelineBuilder = new WorkflowPipelineBuilder();
