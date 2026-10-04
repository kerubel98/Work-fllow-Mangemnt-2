import { describe, it, expect } from 'vitest';
import { validationPipelineBuilder, PipelineBuilder } from '../validationPipelineBuilder.js';
import { DatabaseValidationWorkflow, ProcessingStage, ValidationCheckStep } from '../../types.js';

describe('ValidationPipelineBuilder Service', () => {
  const baseStage1: ProcessingStage = {
    id: 'stage-1',
    name: 'Auth Ingress',
    order: 1,
    enabled: true,
    targetDbId: 'db-core',
    targetDataSource: 'auth_log_tab',
    cardinalityPolicy: 'STRICT_SINGLE',
    attachedDbConfigIds: ['cfg-01', 'cfg-02']
  };

  const baseStage2: ProcessingStage = {
    id: 'stage-2',
    name: 'Settlement Verification',
    order: 2,
    enabled: true,
    targetDbId: 'db-fin',
    targetDataSource: 'sv_fin_tab',
    cardinalityPolicy: 'ONE_TO_MANY',
    attachedDbConfigIds: ['cfg-03']
  };

  const baseStep1: ValidationCheckStep = {
    id: 'step-1',
    stepNumber: 1,
    name: 'Auth Existence Check',
    stageId: 'stage-1',
    checkType: 'EXISTENCE_CHECK',
    targetDbId: 'db-core',
    targetTable: 'auth_log_tab',
    dependencyCondition: 'ALWAYS',
    onPassAction: 'CONTINUE',
    onFailAction: 'CONTINUE',
    onErrorAction: 'STOP',
    requiredParams: ['refnum']
  };

  const baseStep2: ValidationCheckStep = {
    id: 'step-2',
    stepNumber: 2,
    name: 'Settlement Amount Match',
    stageId: 'stage-2',
    checkType: 'AMOUNT_MATCH',
    targetDbId: 'db-fin',
    targetTable: 'sv_fin_tab',
    dependencyCondition: 'ALWAYS',
    onPassAction: 'CONTINUE',
    onFailAction: 'CLOSE',
    onErrorAction: 'STOP',
    requiredParams: ['auth_id']
  };

  it('1. Compiles a valid 2-stage workflow into an immutable CompiledValidationPlan', () => {
    const workflow: DatabaseValidationWorkflow = {
      id: 'wf-test-101',
      name: 'Credit Card Settlement Reconciliation',
      targetDbId: 'db-core',
      targetTable: 'auth_log_tab',
      stages: [baseStage1, baseStage2],
      steps: [baseStep1, baseStep2],
      connections: [
        {
          id: 'conn-1-2',
          fromNodeId: 'stage-1',
          toNodeId: 'stage-2',
          fromPort: 'pass',
          action: 'CONTINUE'
        }
      ]
    };

    const plan = validationPipelineBuilder.compile(workflow);

    expect(plan.workflowId).toBe('wf-test-101');
    expect(plan.isAcyclic).toBe(true);
    expect(plan.stages.length).toBe(2);
    expect(plan.stages[0].stageId).toBe('stage-1');
    expect(plan.stages[0].cardinalityPolicy).toBe('STRICT_SINGLE');
    expect(plan.stages[0].attachedDbConfigIds).toEqual(['cfg-01', 'cfg-02']);
    expect(plan.stages[0].requiredInputKeys).toEqual(['refnum']);
    expect(plan.stages[1].stageId).toBe('stage-2');
    expect(plan.stages[1].cardinalityPolicy).toBe('ONE_TO_MANY');
    expect(plan.stages[1].requiredInputKeys).toEqual(['auth_id']);
  });

  it('2. Throws COMPILATION_ERROR when cyclic dependency is detected in the DAG', () => {
    const cyclicWorkflow: DatabaseValidationWorkflow = {
      id: 'wf-cyclic',
      name: 'Cyclic Workflow',
      targetDbId: 'db-core',
      targetTable: 'auth_log_tab',
      stages: [baseStage1, baseStage2],
      steps: [baseStep1, baseStep2],
      connections: [
        {
          id: 'conn-1',
          fromNodeId: 'stage-1',
          toNodeId: 'stage-2',
          fromPort: 'pass',
          action: 'CONTINUE'
        },
        {
          id: 'conn-2',
          fromNodeId: 'stage-2',
          toNodeId: 'stage-1',
          fromPort: 'pass',
          action: 'CONTINUE'
        }
      ]
    };

    expect(() => validationPipelineBuilder.compile(cyclicWorkflow)).toThrow(
      /COMPILATION_ERROR: Cycle detected/
    );
  });

  it('3. Throws COMPILATION_ERROR when strictCardinality is enabled and a stage lacks explicit policy', () => {
    const unconfiguredStage: ProcessingStage = {
      id: 'stage-unconfigured',
      name: 'Unconfigured Stage',
      order: 1,
      enabled: true,
      targetDbId: 'db-core',
      targetDataSource: 'auth_log_tab'
      // No cardinalityPolicy
    };

    const workflow: DatabaseValidationWorkflow = {
      id: 'wf-missing-cardinality',
      name: 'Missing Cardinality Workflow',
      targetDbId: 'db-core',
      targetTable: 'auth_log_tab',
      stages: [unconfiguredStage],
      steps: [baseStep1]
    };

    expect(() =>
      validationPipelineBuilder.compile(workflow, { strictCardinality: true })
    ).toThrow(/COMPILATION_ERROR: Stage 'Unconfigured Stage' .* does not define an explicit cardinalityPolicy/);
  });

  it('4. Throws COMPILATION_ERROR when EXPLICIT_LATEST is configured without an orderByColumn', () => {
    const latestStageWithoutOrder: ProcessingStage = {
      id: 'stage-latest-no-order',
      name: 'Latest Stage No Order',
      order: 1,
      enabled: true,
      targetDbId: 'db-core',
      targetDataSource: 'auth_log_tab',
      cardinalityPolicy: 'EXPLICIT_LATEST'
      // Missing orderByColumn
    };

    const workflow: DatabaseValidationWorkflow = {
      id: 'wf-missing-orderby',
      name: 'Missing OrderBy Workflow',
      targetDbId: 'db-core',
      targetTable: 'auth_log_tab',
      stages: [latestStageWithoutOrder],
      steps: [baseStep1]
    };

    expect(() =>
      validationPipelineBuilder.compile(workflow)
    ).toThrow(/specifies EXPLICIT_LATEST but is missing mandatory orderByColumn/);
  });

  it('5. Successfully compiles with decoupled aggregationStrategy: SUM', () => {
    const sumStage: ProcessingStage = {
      id: 'stage-sum',
      name: 'Fee Consolidation',
      order: 1,
      enabled: true,
      targetDbId: 'db-fin',
      targetDataSource: 'sv_fee_tab',
      cardinalityPolicy: 'ONE_TO_MANY',
      aggregationStrategy: 'SUM'
    };

    const workflow: DatabaseValidationWorkflow = {
      id: 'wf-sum',
      name: 'Sum Aggregation Workflow',
      targetDbId: 'db-fin',
      targetTable: 'sv_fee_tab',
      stages: [sumStage],
      steps: [baseStep2]
    };

    const plan = validationPipelineBuilder.compile(workflow);
    expect(plan.stages[0].cardinalityPolicy).toBe('ONE_TO_MANY');
    expect(plan.stages[0].aggregationStrategy).toBe('SUM');
  });

  it('6. Assembles and compiles an immutable plan using the fluent PipelineBuilder API', () => {
    const plan = PipelineBuilder.create('wf-fluent-99', 'Fluent Assembled Pipeline')
      .addStage('stg-1', 'Auth Ingress')
        .withTarget('db-core', 'auth_log_tab')
        .withCardinality('STRICT_SINGLE')
        .withAggregation('NONE')
        .bindDatabaseConfigurations(['cfg-10', 'cfg-20'])
        .requireInputKeys(['refnum'])
        .asIngestionSearch(true)
        .addStep(baseStep1)
        .done()
      .addStage('stg-2', 'Settlement Verification')
        .withTarget('db-fin', 'sv_fin_tab')
        .withCardinality('EXPLICIT_LATEST', 'auth_timestamp')
        .withAggregation('NONE')
        .bindDatabaseConfigurations(['cfg-30'])
        .requireInputKeys(['auth_id'])
        .addStep(baseStep2)
        .done()
      .connect('stg-1', 'stg-2')
      .build();

    expect(plan.workflowId).toBe('wf-fluent-99');
    expect(plan.stages.length).toBe(2);
    expect(plan.stages[0].stageId).toBe('stg-1');
    expect(plan.stages[0].attachedDbConfigIds).toEqual(['cfg-10', 'cfg-20']);
    expect(plan.stages[1].stageId).toBe('stg-2');
    expect(plan.stages[1].cardinalityPolicy).toBe('EXPLICIT_LATEST');
    expect(plan.stages[1].orderByColumn).toBe('auth_timestamp');
  });
});
