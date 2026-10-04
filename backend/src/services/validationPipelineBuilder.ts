/**
 * Validation Pipeline Builder & Compiler Engine
 *
 * Implements the Gang of Four Builder Pattern as mandated by:
 * PIPELINE_ENGINE_MASTER_ARCHITECTURE.md §7, §8, §9
 * 
 * 1. Validates workflow DAG acyclicity via Kahn's algorithm (topological sorting).
 * 2. Enforces explicit multi-row cardinality policies & decoupled aggregation strategies.
 * 3. Enforces mandatory orderByColumn on EXPLICIT_LATEST / EXPLICIT_FIRST.
 * 4. Enforces explicit attachedDbConfigIds binding per stage (anti-contamination).
 * 5. Provides fluent construction API (PipelineBuilder & StageBuilder).
 * 6. Produces an immutable, pre-indexed CompiledValidationPlan.
 */

import {
  DatabaseValidationWorkflow,
  ProcessingStage,
  ValidationCheckStep,
  MultiRowCardinalityPolicy,
  AggregationStrategy
} from '../types.js';

export interface CompiledStagePlan {
  stageId: string;
  stageName: string;
  order: number;
  targetDbId?: string;
  targetTable?: string;
  cardinalityPolicy: MultiRowCardinalityPolicy;
  aggregationStrategy: AggregationStrategy;
  orderByColumn?: string;
  attachedDbConfigIds: string[];
  requiredInputKeys: string[];
  steps: ValidationCheckStep[];
  isIngestionSearch: boolean;
}

export interface CompiledValidationPlan {
  workflowId: string;
  workflowName: string;
  version: string;
  compiledAt: string;
  stages: CompiledStagePlan[];
  topologicalOrder: string[];
  isAcyclic: boolean;
}

export interface PipelineCompilationOptions {
  strictCardinality?: boolean;
}

export class StageBuilder {
  private plan: Partial<CompiledStagePlan>;
  private parentBuilder: PipelineBuilder;

  constructor(parent: PipelineBuilder, stageId: string, stageName: string) {
    this.parentBuilder = parent;
    this.plan = {
      stageId,
      stageName,
      order: 1,
      cardinalityPolicy: 'STRICT_SINGLE',
      aggregationStrategy: 'NONE',
      attachedDbConfigIds: [],
      requiredInputKeys: [],
      steps: [],
      isIngestionSearch: false
    };
  }

  public withTarget(targetDbId: string, targetTable: string): this {
    this.plan.targetDbId = targetDbId;
    this.plan.targetTable = targetTable;
    return this;
  }

  public withCardinality(policy: MultiRowCardinalityPolicy, orderByColumn?: string): this {
    this.plan.cardinalityPolicy = policy;
    if (orderByColumn) this.plan.orderByColumn = orderByColumn;
    return this;
  }

  public withAggregation(strategy: AggregationStrategy): this {
    this.plan.aggregationStrategy = strategy;
    return this;
  }

  public bindDatabaseConfigurations(configIds: string[]): this {
    this.plan.attachedDbConfigIds = Array.from(new Set([...(this.plan.attachedDbConfigIds || []), ...configIds]));
    return this;
  }

  public requireInputKeys(keys: string[]): this {
    this.plan.requiredInputKeys = Array.from(new Set([...(this.plan.requiredInputKeys || []), ...keys]));
    return this;
  }

  public asIngestionSearch(isIngestion = true): this {
    this.plan.isIngestionSearch = isIngestion;
    return this;
  }

  public addStep(step: ValidationCheckStep): this {
    this.plan.steps = [...(this.plan.steps || []), step];
    return this;
  }

  public done(): PipelineBuilder {
    return this.parentBuilder.registerStage(this.plan as CompiledStagePlan);
  }
}

export class PipelineBuilder {
  private workflowId: string;
  private workflowName: string;
  private version: string;
  private stages: CompiledStagePlan[] = [];
  private connections: Array<{ fromNodeId: string; toNodeId: string }> = [];

  constructor(workflowId: string, workflowName: string, version = '1.0.0') {
    this.workflowId = workflowId;
    this.workflowName = workflowName;
    this.version = version;
  }

  public static create(workflowId: string, workflowName: string, version?: string): PipelineBuilder {
    return new PipelineBuilder(workflowId, workflowName, version);
  }

  public addStage(stageId: string, stageName: string): StageBuilder {
    return new StageBuilder(this, stageId, stageName);
  }

  public registerStage(stage: CompiledStagePlan): this {
    stage.order = this.stages.length + 1;
    this.stages.push(stage);
    return this;
  }

  public connect(fromStageId: string, toStageId: string): this {
    this.connections.push({ fromNodeId: fromStageId, toNodeId: toStageId });
    return this;
  }

  public build(): CompiledValidationPlan {
    const dummyWf: DatabaseValidationWorkflow = {
      id: this.workflowId,
      name: this.workflowName,
      version: this.version,
      targetDbId: this.stages[0]?.targetDbId || '',
      targetTable: this.stages[0]?.targetTable || '',
      stages: this.stages.map((s, idx) => ({
        id: s.stageId,
        name: s.stageName,
        order: idx + 1,
        enabled: true,
        targetDbId: s.targetDbId || '',
        targetDataSource: s.targetTable || '',
        cardinalityPolicy: s.cardinalityPolicy,
        aggregationStrategy: s.aggregationStrategy,
        orderByColumn: s.orderByColumn,
        attachedDbConfigIds: s.attachedDbConfigIds
      })),
      steps: this.stages.flatMap(s => s.steps),
      connections: this.connections.map((c, idx) => ({
        id: `conn-${idx}`,
        fromNodeId: c.fromNodeId,
        toNodeId: c.toNodeId,
        fromPort: 'pass' as const,
        action: 'CONTINUE' as const
      }))
    };

    return validationPipelineBuilder.compile(dummyWf, { strictCardinality: true });
  }
}

export class ValidationPipelineBuilder {
  private static instance: ValidationPipelineBuilder;

  public static getInstance(): ValidationPipelineBuilder {
    if (!ValidationPipelineBuilder.instance) {
      ValidationPipelineBuilder.instance = new ValidationPipelineBuilder();
    }
    return ValidationPipelineBuilder.instance;
  }

  /**
   * Compiles and validates a DatabaseValidationWorkflow into an immutable execution plan.
   * Throws a fatal COMPILATION_ERROR if the DAG is cyclic, cardinality is omitted under strict mode,
   * or if explicit ordering columns are missing.
   */
  public compile(
    workflow: DatabaseValidationWorkflow,
    options: PipelineCompilationOptions = {}
  ): CompiledValidationPlan {
    if (!workflow) {
      throw new Error('[ValidationPipelineBuilder] Cannot compile undefined workflow.');
    }

    const steps = workflow.steps || [];
    const connections = workflow.connections || [];

    const rawStages = workflow.stages && workflow.stages.length > 0
      ? workflow.stages.filter(s => s.enabled !== false)
      : [];

    const stages: ProcessingStage[] = rawStages.length > 0
      ? rawStages
      : [
          {
            id: `stage-default-${workflow.id || '1'}`,
            name: workflow.name || 'Validation Stage',
            order: 1,
            enabled: true,
            targetDbId: workflow.targetDbId || steps[0]?.targetDbId || '',
            targetDataSource: workflow.targetTable || steps[0]?.targetTable || '',
            cardinalityPolicy: 'STRICT_SINGLE',
            aggregationStrategy: 'NONE'
          }
        ];

    // 1. Validate DAG Acyclicity & Topological Sort via Kahn's Algorithm
    const { isAcyclic, topologicalOrder } = this.validateDagAcyclicity(stages, connections);
    if (!isAcyclic) {
      throw new Error(
        `[ValidationPipelineBuilder] COMPILATION_ERROR: Cycle detected in workflow graph '${workflow.name}' (${workflow.id}). Workflows must form a strict Directed Acyclic Graph (DAG).`
      );
    }

    // Sort stages according to topological order or configured order
    const orderedStages = [...stages].sort((a, b) => {
      const idxA = topologicalOrder.indexOf(a.id);
      const idxB = topologicalOrder.indexOf(b.id);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      return (a.order ?? 0) - (b.order ?? 0);
    });

    // 2. Compile each stage
    const compiledStages: CompiledStagePlan[] = orderedStages.map((stage, idx) => {
      const stageSteps = steps.filter(
        s => s.stageId === stage.id || (!s.stageId && idx === 0)
      );

      // Cardinality Policy Enforcement (PIPELINE_ENGINE_MASTER_ARCHITECTURE.md §7)
      const explicitCardinality =
        stage.cardinalityPolicy ||
        stageSteps.find(s => s.cardinalityPolicy)?.cardinalityPolicy ||
        (stage as any).multiRowPolicy;

      if (!explicitCardinality && options.strictCardinality) {
        throw new Error(
          `[ValidationPipelineBuilder] COMPILATION_ERROR: Stage '${stage.name}' (${stage.id}) does not define an explicit cardinalityPolicy. Silent resolution defaults are forbidden by Operational Governance.`
        );
      }

      const cardinalityPolicy: MultiRowCardinalityPolicy = explicitCardinality || 'STRICT_SINGLE';

      // Mandatory orderByColumn verification for EXPLICIT_LATEST and EXPLICIT_FIRST
      const explicitOrderBy =
        stage.orderByColumn ||
        stageSteps.find(s => s.orderByColumn)?.orderByColumn;

      if ((cardinalityPolicy === 'EXPLICIT_LATEST' || cardinalityPolicy === 'EXPLICIT_FIRST') && !explicitOrderBy) {
        throw new Error(
          `[ValidationPipelineBuilder] COMPILATION_ERROR: Stage '${stage.name}' (${stage.id}) specifies ${cardinalityPolicy} but is missing mandatory orderByColumn.`
        );
      }

      // Aggregation Strategy Decoupling (PIPELINE_ENGINE_MASTER_ARCHITECTURE.md §7.2)
      const aggregationStrategy: AggregationStrategy =
        stage.aggregationStrategy ||
        stageSteps.find(s => s.aggregationStrategy)?.aggregationStrategy ||
        (cardinalityPolicy === 'SUM_AND_COLLAPSE' || (cardinalityPolicy as string) === 'AGGREGATE_SUM' ? 'SUM' : 'NONE');

      // Anti-Contamination Attached DB Configs (PIPELINE_ENGINE_MASTER_ARCHITECTURE.md §10)
      const explicitStageConfigIds = [
        ...(stage.attachedDbConfigIds || []),
        ...stageSteps.flatMap(s => s.attachedDbConfigIds || s.columnConfigurationIds || [])
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

      // Required Input Keys Discovery
      const requiredInputKeys = Array.from(
        new Set([
          ...stageSteps.flatMap(s => s.requiredParams || []),
          ...stageSteps.flatMap(s => (s.searchParameters || []).filter(p => p.required !== false).map(p => p.inputField || p.targetColumn))
        ])
      ).filter(Boolean);

      const targetTable = stage.targetDataSource || workflow.targetTable;
      const isIngestionSearch = idx === 0 || stageSteps.some(s => s.checkType === 'EXISTENCE_CHECK' || (s as any).boxType === 'INGESTION_SEARCH');

      return {
        stageId: stage.id,
        stageName: stage.name,
        order: idx + 1,
        targetDbId: stage.targetDbId || workflow.targetDbId,
        targetTable,
        cardinalityPolicy,
        aggregationStrategy,
        orderByColumn: explicitOrderBy,
        attachedDbConfigIds,
        requiredInputKeys,
        steps: stageSteps,
        isIngestionSearch
      };
    });

    return {
      workflowId: workflow.id,
      workflowName: workflow.name,
      version: workflow.version || '1.0.0',
      compiledAt: new Date().toISOString(),
      stages: compiledStages,
      topologicalOrder,
      isAcyclic: true
    };
  }

  /**
   * Validates that the stages and connections form an acyclic graph (DAG) using Kahn's algorithm.
   */
  private validateDagAcyclicity(
    stages: ProcessingStage[],
    connections: Array<{ fromNodeId: string; toNodeId: string }>
  ): { isAcyclic: boolean; topologicalOrder: string[] } {
    const stageIds = stages.map(s => s.id);
    if (stageIds.length <= 1) {
      return { isAcyclic: true, topologicalOrder: stageIds };
    }

    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    stageIds.forEach(id => {
      adj.set(id, []);
      inDegree.set(id, 0);
    });

    // Populate adjacency list
    for (const conn of connections) {
      if (adj.has(conn.fromNodeId) && adj.has(conn.toNodeId)) {
        adj.get(conn.fromNodeId)!.push(conn.toNodeId);
        inDegree.set(conn.toNodeId, (inDegree.get(conn.toNodeId) || 0) + 1);
      }
    }

    // Kahn's Algorithm for Topological Sort
    const queue: string[] = [];
    inDegree.forEach((deg, id) => {
      if (deg === 0) queue.push(id);
    });

    const topologicalOrder: string[] = [];
    while (queue.length > 0) {
      const u = queue.shift()!;
      topologicalOrder.push(u);

      for (const v of adj.get(u) || []) {
        inDegree.set(v, (inDegree.get(v) || 0) - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      }
    }

    const isAcyclic = topologicalOrder.length === stageIds.length;
    return {
      isAcyclic,
      topologicalOrder: isAcyclic ? topologicalOrder : stageIds
    };
  }
}

export const validationPipelineBuilder = ValidationPipelineBuilder.getInstance();
