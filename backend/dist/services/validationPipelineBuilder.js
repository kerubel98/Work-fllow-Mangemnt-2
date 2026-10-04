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
export class StageBuilder {
    plan;
    parentBuilder;
    constructor(parent, stageId, stageName) {
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
    withTarget(targetDbId, targetTable) {
        this.plan.targetDbId = targetDbId;
        this.plan.targetTable = targetTable;
        return this;
    }
    withCardinality(policy, orderByColumn) {
        this.plan.cardinalityPolicy = policy;
        if (orderByColumn)
            this.plan.orderByColumn = orderByColumn;
        return this;
    }
    withAggregation(strategy) {
        this.plan.aggregationStrategy = strategy;
        return this;
    }
    bindDatabaseConfigurations(configIds) {
        this.plan.attachedDbConfigIds = Array.from(new Set([...(this.plan.attachedDbConfigIds || []), ...configIds]));
        return this;
    }
    requireInputKeys(keys) {
        this.plan.requiredInputKeys = Array.from(new Set([...(this.plan.requiredInputKeys || []), ...keys]));
        return this;
    }
    asIngestionSearch(isIngestion = true) {
        this.plan.isIngestionSearch = isIngestion;
        return this;
    }
    addStep(step) {
        this.plan.steps = [...(this.plan.steps || []), step];
        return this;
    }
    done() {
        return this.parentBuilder.registerStage(this.plan);
    }
}
export class PipelineBuilder {
    workflowId;
    workflowName;
    version;
    stages = [];
    connections = [];
    constructor(workflowId, workflowName, version = '1.0.0') {
        this.workflowId = workflowId;
        this.workflowName = workflowName;
        this.version = version;
    }
    static create(workflowId, workflowName, version) {
        return new PipelineBuilder(workflowId, workflowName, version);
    }
    addStage(stageId, stageName) {
        return new StageBuilder(this, stageId, stageName);
    }
    registerStage(stage) {
        stage.order = this.stages.length + 1;
        this.stages.push(stage);
        return this;
    }
    connect(fromStageId, toStageId) {
        this.connections.push({ fromNodeId: fromStageId, toNodeId: toStageId });
        return this;
    }
    build() {
        const dummyWf = {
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
                fromPort: 'pass',
                action: 'CONTINUE'
            }))
        };
        return validationPipelineBuilder.compile(dummyWf, { strictCardinality: true });
    }
}
export class ValidationPipelineBuilder {
    static instance;
    static getInstance() {
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
    compile(workflow, options = {}) {
        if (!workflow) {
            throw new Error('[ValidationPipelineBuilder] Cannot compile undefined workflow.');
        }
        const steps = workflow.steps || [];
        const connections = workflow.connections || [];
        const rawStages = workflow.stages && workflow.stages.length > 0
            ? workflow.stages.filter(s => s.enabled !== false)
            : [];
        const stages = rawStages.length > 0
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
            throw new Error(`[ValidationPipelineBuilder] COMPILATION_ERROR: Cycle detected in workflow graph '${workflow.name}' (${workflow.id}). Workflows must form a strict Directed Acyclic Graph (DAG).`);
        }
        // Sort stages according to topological order or configured order
        const orderedStages = [...stages].sort((a, b) => {
            const idxA = topologicalOrder.indexOf(a.id);
            const idxB = topologicalOrder.indexOf(b.id);
            if (idxA !== -1 && idxB !== -1)
                return idxA - idxB;
            return (a.order ?? 0) - (b.order ?? 0);
        });
        // 2. Compile each stage
        const compiledStages = orderedStages.map((stage, idx) => {
            const stageSteps = steps.filter(s => s.stageId === stage.id || (!s.stageId && idx === 0));
            // Cardinality Policy Enforcement (PIPELINE_ENGINE_MASTER_ARCHITECTURE.md §7)
            const explicitCardinality = stage.cardinalityPolicy ||
                stageSteps.find(s => s.cardinalityPolicy)?.cardinalityPolicy ||
                stage.multiRowPolicy;
            if (!explicitCardinality && options.strictCardinality) {
                throw new Error(`[ValidationPipelineBuilder] COMPILATION_ERROR: Stage '${stage.name}' (${stage.id}) does not define an explicit cardinalityPolicy. Silent resolution defaults are forbidden by Operational Governance.`);
            }
            const cardinalityPolicy = explicitCardinality || 'STRICT_SINGLE';
            // Mandatory orderByColumn verification for EXPLICIT_LATEST and EXPLICIT_FIRST
            const explicitOrderBy = stage.orderByColumn ||
                stageSteps.find(s => s.orderByColumn)?.orderByColumn;
            if ((cardinalityPolicy === 'EXPLICIT_LATEST' || cardinalityPolicy === 'EXPLICIT_FIRST') && !explicitOrderBy) {
                throw new Error(`[ValidationPipelineBuilder] COMPILATION_ERROR: Stage '${stage.name}' (${stage.id}) specifies ${cardinalityPolicy} but is missing mandatory orderByColumn.`);
            }
            // Aggregation Strategy Decoupling (PIPELINE_ENGINE_MASTER_ARCHITECTURE.md §7.2)
            const aggregationStrategy = stage.aggregationStrategy ||
                stageSteps.find(s => s.aggregationStrategy)?.aggregationStrategy ||
                (cardinalityPolicy === 'SUM_AND_COLLAPSE' || cardinalityPolicy === 'AGGREGATE_SUM' ? 'SUM' : 'NONE');
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
            const requiredInputKeys = Array.from(new Set([
                ...stageSteps.flatMap(s => s.requiredParams || []),
                ...stageSteps.flatMap(s => (s.searchParameters || []).filter(p => p.required !== false).map(p => p.inputField || p.targetColumn))
            ])).filter(Boolean);
            const targetTable = stage.targetDataSource || workflow.targetTable;
            const isIngestionSearch = idx === 0 || stageSteps.some(s => s.checkType === 'EXISTENCE_CHECK' || s.boxType === 'INGESTION_SEARCH');
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
    validateDagAcyclicity(stages, connections) {
        const stageIds = stages.map(s => s.id);
        if (stageIds.length <= 1) {
            return { isAcyclic: true, topologicalOrder: stageIds };
        }
        const adj = new Map();
        const inDegree = new Map();
        stageIds.forEach(id => {
            adj.set(id, []);
            inDegree.set(id, 0);
        });
        // Populate adjacency list
        for (const conn of connections) {
            if (adj.has(conn.fromNodeId) && adj.has(conn.toNodeId)) {
                adj.get(conn.fromNodeId).push(conn.toNodeId);
                inDegree.set(conn.toNodeId, (inDegree.get(conn.toNodeId) || 0) + 1);
            }
        }
        // Kahn's Algorithm for Topological Sort
        const queue = [];
        inDegree.forEach((deg, id) => {
            if (deg === 0)
                queue.push(id);
        });
        const topologicalOrder = [];
        while (queue.length > 0) {
            const u = queue.shift();
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
