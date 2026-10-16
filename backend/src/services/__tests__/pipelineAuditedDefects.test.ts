import { describe, it, expect } from 'vitest';
import { ruleSqlCompiler } from '../ruleSqlCompiler.js';
import { buildQueryFromExtraction } from '../externalDataQueryService.js';
import { validationPipelineBuilder } from '../validationPipelineBuilder.js';
import { ReconciliationEngine } from '../pipeline/ReconciliationEngine.js';
import { ValidationCheckStep, ProcessingStage, DatabaseValidationWorkflow } from '../../types.js';

describe('Pipeline Audited Defects Regression Suite', () => {
  describe('AUD-001 & AUD-002: Fail-Closed Rule SQL Compilation', () => {
    it('throws error when checkType is unknown instead of compiling to TRUE', () => {
      const step: ValidationCheckStep = {
        id: 'bad-step-1',
        stepNumber: 1,
        name: 'Invalid Check',
        checkType: 'UNSUPPORTED_TYPE' as any,
        targetField: 'id',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        requiredParams: [],
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP',
        severityOnFailure: 'CRITICAL',
      };

      expect(() => {
        ruleSqlCompiler.compileStepCondition(step, 'm', ['id']);
      }).toThrow(/Unsupported checkType 'UNSUPPORTED_TYPE'/);
    });

    it('throws error when required fields are missing on non-existence checks', () => {
      const step: ValidationCheckStep = {
        id: 'bad-step-2',
        stepNumber: 1,
        name: 'Missing Field Check',
        checkType: 'VALUE_MATCH',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        requiredParams: [],
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP',
        severityOnFailure: 'CRITICAL',
      };

      expect(() => {
        ruleSqlCompiler.compileStepCondition(step, 'm', ['id']);
      }).toThrow(/Missing targetField\/sourceField for checkType 'VALUE_MATCH'/);
    });

    it('validates numeric thresholds and rejects invalid numbers', () => {
      const step: ValidationCheckStep = {
        id: 'threshold-step-1',
        stepNumber: 1,
        name: 'Threshold Check',
        checkType: 'NUMERIC_THRESHOLD',
        targetField: 'amount',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        comparator: '>',
        compareValue: 'INVALID_NUMBER' as any,
        requiredParams: [],
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP',
        severityOnFailure: 'CRITICAL',
      };

      expect(() => {
        ruleSqlCompiler.compileStepCondition(step, 'm', ['amount']);
      }).toThrow(/Invalid numeric threshold value/);
    });

    it('AUD-002 / SC-005: dynamically joins task_dataset_transactions when dual-source rules reference INPUT fields', () => {
      const dualSourceStep: ValidationCheckStep = {
        id: 'dual-1',
        stepNumber: 1,
        name: 'Match Input Reqamt with Mirror Reqamt',
        checkType: 'DUAL_SOURCE_COMPARISON',
        dualSourceCondition: {
          sourceA: { origin: 'INPUT', field: 'reqamt' },
          sourceB: { origin: 'MIRROR', field: 'reqamt' },
          comparator: 'EQUALS',
        },
        targetDbId: 'db-1',
        targetTable: 'mirror_tx',
        requiredParams: [],
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP',
        severityOnFailure: 'CRITICAL',
      };

      const compiled = ruleSqlCompiler.compileBlockUpdateSql('mirror_cbs_tx', 'blk-1', [dualSourceStep], ['reqamt']);
      expect(compiled.fullUpdateSql).toContain('FROM task_dataset_transactions t');
      expect(compiled.fullUpdateSql).toContain('m._task_id = t.task_id');
      expect(compiled.fullUpdateSql).toContain('m._row_number = t.row_number');
    });
  });

  describe('AUD-003: Unrestricted External Queries When Extraction Keys Are Missing', () => {
    it('throws security violation error when transaction IDs / primary IDs are empty', () => {
      expect(() => {
        buildQueryFromExtraction(
          {
            targetDbId: 'cbs_db',
            targetTable: 'transactions',
            requiredColumns: ['ref_num'],
            sourceFieldMappings: [{ inputField: 'ref', sourceField: 'ref_num' }],
          } as any,
          {
            chunkId: 'chk-0',
            transactionIds: [],
          } as any,
          'PostgreSQL'
        );
      }).toThrow(/Refusing to execute unrestricted table scan \(WHERE 1=1\)/);
    });
  });

  describe('PB-001 & PB-002: DAG Validation and Connection Preservation', () => {
    it('PB-002: rejects single-stage self-referential cycle', () => {
      const singleStage: ProcessingStage = {
        id: 'stage-1',
        name: 'Solo Stage',
        order: 1,
        enabled: true,
        targetDbId: 'db-1',
        targetDataSource: 'tx',
      };

      const workflow: DatabaseValidationWorkflow = {
        id: 'wf-self-loop',
        name: 'Self Loop Workflow',
        stages: [singleStage],
        connections: [{ fromNodeId: 'stage-1', toNodeId: 'stage-1' }],
        steps: [],
      } as any;

      expect(() => {
        validationPipelineBuilder.compile(workflow);
      }).toThrow(/Cycle detected in workflow graph/);
    });

    it('PB-001: preserves connections in CompiledValidationPlan', () => {
      const stageA: ProcessingStage = {
        id: 'stage-a',
        name: 'Stage A',
        order: 1,
        enabled: true,
        targetDbId: 'db-1',
        targetDataSource: 'tx',
      };
      const stageB: ProcessingStage = {
        id: 'stage-b',
        name: 'Stage B',
        order: 2,
        enabled: true,
        targetDbId: 'db-1',
        targetDataSource: 'tx',
      };

      const workflow: DatabaseValidationWorkflow = {
        id: 'wf-ab',
        name: 'AB Workflow',
        stages: [stageA, stageB],
        connections: [{ fromNodeId: 'stage-a', toNodeId: 'stage-b', action: 'CONTINUE' }],
        steps: [],
      } as any;

      const compiled = validationPipelineBuilder.compile(workflow);

      expect(compiled.connections).toBeDefined();
      expect(compiled.connections?.length).toBe(1);
      expect(compiled.connections?.[0].fromNodeId).toBe('stage-a');
    });
  });

  describe('RE-001 & RE-003: ReconciliationEngine Cardinality & Fail-Closed Verdicts', () => {
    const engine = new ReconciliationEngine();

    it('RE-003: emits ORDERED_FIRST_PICKED for EXPLICIT_FIRST policy', async () => {
      const result = await engine.reconcileRow(
        { canonical_data: { tx_id: '101' } },
        {
          rawRows: [{ tx_id: '101', amt: 50 }, { tx_id: '101', amt: 50 }],
          context: {} as any,
          mirrorTable: 'mirror_tx',
          fetchedRowCount: 2,
        },
        {
          id: 'step-first',
          stepNumber: 1,
          name: 'First Pick Check',
          checkType: 'EXISTENCE_CHECK',
          targetDbId: 'db-1',
          targetTable: 'tx',
          cardinalityPolicy: 'EXPLICIT_FIRST',
          requiredParams: [],
          dependencyCondition: 'ALWAYS',
          onPassAction: 'CONTINUE',
          onFailAction: 'STOP',
          onErrorAction: 'STOP',
          severityOnFailure: 'INFO',
        },
        {
          taskId: 'task-1',
          batchId: 'batch-1',
          stageId: 'stage-1',
          stageName: 'Stage 1',
          validationId: 'val-1',
          ruleBlockId: 'blk-1',
          rowNumber: 1,
          transactionId: '101',
          lineageHistory: [],
        }
      );

      expect(result.cardinalityStatus).toBe('ORDERED_FIRST_PICKED');
      expect(result.validationResult).toBe('PASS');
    });

    it('RE-001: fails closed on unknown checkType during single-row reconciliation', async () => {
      const result = await engine.reconcileRow(
        { canonical_data: { tx_id: '101' } },
        {
          rawRows: [{ tx_id: '101' }],
          context: {} as any,
          mirrorTable: 'mirror_tx',
          fetchedRowCount: 1,
        },
        {
          id: 'step-unknown',
          stepNumber: 1,
          name: 'Unknown Check',
          checkType: 'NON_EXISTENT_RULE_TYPE' as any,
          targetDbId: 'db-1',
          targetTable: 'tx',
          requiredParams: [],
          dependencyCondition: 'ALWAYS',
          onPassAction: 'CONTINUE',
          onFailAction: 'STOP',
          onErrorAction: 'STOP',
          severityOnFailure: 'CRITICAL',
        },
        {
          taskId: 'task-1',
          batchId: 'batch-1',
          stageId: 'stage-1',
          stageName: 'Stage 1',
          validationId: 'val-1',
          ruleBlockId: 'blk-1',
          rowNumber: 1,
          transactionId: '101',
          lineageHistory: [],
        }
      );

      expect(result.validationResult).toBe('FAIL');
      expect(result.executionRecord.details?.error).toContain('Unsupported checkType');
    });
  });
});
