import { describe, it, expect } from 'vitest';
import { DbConfigValidationMethod } from '../pipeline/methods/DbConfigValidationMethod.js';
import { ReconciliationMethod } from '../pipeline/methods/ReconciliationMethod.js';
import { ExecutableStage } from '../pipeline/ExecutablePipeline.js';
import { ReconciliationEngine } from '../pipeline/ReconciliationEngine.js';
import type { DatabaseColumnConfiguration, ValidationCheckStep, ProcessingStage } from '../../types.js';

describe('Two-Level Reconciliation & Multi-Leg Duplicate Detection (Physical Code Verification)', () => {
  it('detects duplicate legs across returned multi-leg data with identifier attribution', () => {
    const dupConfig: DatabaseColumnConfiguration = {
      id: 'cfg-dup-01',
      name: 'Duplicate RRN Check',
      dbId: 'db-core',
      tableName: 'tran_log',
      ruleType: 'DUPLICATE_CHECK',
      columns: [{ columnName: 'rrn', priority: 1, role: 'MATCH_KEY' }],
      aggregationRules: [{ function: 'COUNT', operator: '=', value: 1 }],
      violationAction: 'FLAG',
      severity: 'CRITICAL',
      statusBehavior: 'MUTATE_STATUS',
      affectsReconciliationStatus: true,
      isActive: true,
    };

    const method = new DbConfigValidationMethod(dupConfig, 1, 'db-core', 'tran_log');

    // Case A: 1 leg returned -> PASS
    const singleLeg = [{ rrn: 'RRN-999', amount: '100' }];
    const evalPass = method.evaluateConfig(singleLeg, { rrn: 'RRN-999' });
    expect(evalPass.status).toBe('PASS');

    // Case B: 2 duplicate legs returned -> FAIL with identifier attribution
    const multiLegs = [
      { rrn: 'RRN-999', leg_id: 'L1', amount: '100' },
      { rrn: 'RRN-999', leg_id: 'L2', amount: '100' }
    ];
    const evalFail = method.evaluateConfig(multiLegs, { rrn: 'RRN-999' });
    expect(evalFail.status).toBe('FAIL');
    expect(evalFail.details.duplicateCount).toBe(2);
    expect(evalFail.details.identifierColumn).toBe('rrn');
    expect(evalFail.details.identifierValue).toBe('RRN-999');
    expect(evalFail.action).toBe('FLAG');
  });

  it('supports REPORT_ONLY mode without changing status or blocking pipeline', () => {
    const reportOnlyConfig: DatabaseColumnConfiguration = {
      id: 'cfg-dup-report',
      name: 'Observational Duplicate Audit',
      dbId: 'db-core',
      tableName: 'tran_log',
      ruleType: 'DUPLICATE_CHECK',
      columns: [{ columnName: 'rrn', priority: 1, role: 'MATCH_KEY' }],
      aggregationRules: [{ function: 'COUNT', operator: '>', value: 1 }],
      violationAction: 'REPORT',
      severity: 'INFO',
      statusBehavior: 'REPORT_ONLY',
      affectsReconciliationStatus: false,
      isActive: true,
    };

    const method = new DbConfigValidationMethod(reportOnlyConfig, 1, 'db-core', 'tran_log');
    expect(method.statusBehavior).toBe('REPORT_ONLY');
    expect(method.affectsReconciliationStatus).toBe(false);

    const multiLegs = [
      { rrn: 'RRN-111', leg_id: 'L1' },
      { rrn: 'RRN-111', leg_id: 'L2' },
      { rrn: 'RRN-111', leg_id: 'L3' }
    ];
    const evalRes = method.evaluateConfig(multiLegs, { rrn: 'RRN-111' });
    expect(evalRes.status).toBe('FAIL'); // Rule breach identified
    expect(evalRes.details.duplicateCount).toBe(3);
  });

  it('filters candidate legs with conditional filtering (e.g. BO_TYPE = CMTP254)', () => {
    const filterConfig: DatabaseColumnConfiguration = {
      id: 'cfg-dup-filter',
      name: 'Filtered Transaction Type Check',
      dbId: 'db-core',
      tableName: 'tran_log',
      ruleType: 'DUPLICATE_CHECK',
      columns: [{ columnName: 'TR_GROUP_ID', priority: 1, role: 'MATCH_KEY' }],
      filterConditions: [{ columnName: 'BO_TYPE', operator: '=', value: 'CMTP254' }],
      aggregationRules: [{ function: 'COUNT', operator: '=', value: 1 }],
      violationAction: 'FLAG',
      severity: 'WARNING',
      isActive: true,
    };

    const method = new DbConfigValidationMethod(filterConfig, 1, 'db-core', 'tran_log');

    // 2 rows, but only 1 matches BO_TYPE = CMTP254 -> PASS
    const candidateRows = [
      { TR_GROUP_ID: 'G-100', BO_TYPE: 'CMTP254' },
      { TR_GROUP_ID: 'G-100', BO_TYPE: 'FEE_REVERSAL' }
    ];
    const resPass = method.evaluateConfig(candidateRows, { TR_GROUP_ID: 'G-100' });
    expect(resPass.status).toBe('PASS');

    // 2 rows both matching BO_TYPE = CMTP254 -> Duplicate violation
    const dupRows = [
      { TR_GROUP_ID: 'G-100', BO_TYPE: 'CMTP254' },
      { TR_GROUP_ID: 'G-100', BO_TYPE: 'CMTP254' }
    ];
    const resFail = method.evaluateConfig(dupRows, { TR_GROUP_ID: 'G-100' });
    expect(resFail.status).toBe('FAIL');
    expect(resFail.details.duplicateCount).toBe(2);
  });

  it('runs DbConfigValidationMethod strictly on passed rows in ExecutableStage', async () => {
    const dupConfig: DatabaseColumnConfiguration = {
      id: 'cfg-dup-exec',
      name: 'Duplicate Check',
      dbId: 'db-1',
      tableName: 'transactions',
      ruleType: 'DUPLICATE_CHECK',
      columns: [{ columnName: 'id', priority: 1 }],
      violationAction: 'FLAG',
      severity: 'CRITICAL',
      statusBehavior: 'MUTATE_STATUS',
      isActive: true,
    };

    const dbConfigMethod = new DbConfigValidationMethod(dupConfig, 1, 'db-1', 'transactions');

    const mockPassingMethod = {
      id: 'method-pass',
      requiredInputKeys: ['id'],
      execute: async () => ({
        context: {} as any,
        mirrorTable: '',
        fetchedRowCount: 1,
        rawRows: [{ id: 'TX-100' }],
      })
    };

    const step: ValidationCheckStep = {
      id: 'method-pass',
      name: 'Existence Check',
      stepNumber: 1,
      checkType: 'EXISTENCE_CHECK',
      targetDbId: 'db-1',
      targetTable: 'transactions',
      dependencyCondition: 'ALWAYS',
      onPassAction: 'CONTINUE',
      onFailAction: 'STOP',
      onErrorAction: 'STOP',
    };

    const stage = new ExecutableStage(
      'stage-1',
      'Test Stage',
      'INGESTION_SEARCH',
      undefined,
      undefined,
      [mockPassingMethod as any],
      [step],
      undefined,
      ['cfg-dup-exec'],
      [dbConfigMethod]
    );

    const reconciler = new ReconciliationEngine();
    const context = {
      workflowId: 'wf-test',
      stageId: 'stage-1',
      stageName: 'Test Stage',
      validationId: 'v-1',
      lineageHistory: [],
      initialRecord: {
        id: 'TX-100',
        returned_data: {
          'wf-test': {
            transactions: [
              { id: 'TX-100', leg: 1 },
              { id: 'TX-100', leg: 2 }
            ]
          }
        }
      }
    };

    const records = await stage.executeRow(context as any, { id: 'TX-100' }, reconciler);
    expect(records.length).toBe(2);
    // First record: existence check PASS
    expect(records[0].validationResult).toBe('PASS');
    // Second record: DbConfigValidationMethod flagged duplicate multi-leg
    expect(records[1].stepId).toBe(dbConfigMethod.id);
    expect(records[1].validationResult).toBe('FAIL');
    expect(records[1].pipelineAction).toBe('FLAG');
    expect((records[1].evaluationDetails as any)?.duplicateCount).toBe(2);
  });
});
