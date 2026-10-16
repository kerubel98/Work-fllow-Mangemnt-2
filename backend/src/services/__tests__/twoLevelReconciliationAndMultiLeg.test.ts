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

  it('rejects unsupported duplicate check operators with configuration error (Section 6.1)', () => {
    const invalidConfig: DatabaseColumnConfiguration = {
      id: 'cfg-dup-invalid-op',
      name: 'Invalid Operator Check',
      dbId: 'db-core',
      tableName: 'tran_log',
      ruleType: 'DUPLICATE_CHECK',
      columns: [{ columnName: 'rrn', priority: 1, role: 'MATCH_KEY' }],
      aggregationRules: [{ function: 'COUNT', operator: '%' as any, value: 1 }],
      violationAction: 'STOP',
      severity: 'CRITICAL',
      isActive: true,
    };

    const method = new DbConfigValidationMethod(invalidConfig, 1, 'db-core', 'tran_log');
    const multiLegs = [
      { rrn: 'RRN-999', id: '1' },
      { rrn: 'RRN-999', id: '2' }
    ];
    const res = method.evaluateConfig(multiLegs, { rrn: 'RRN-999' });
    expect(res.status).toBe('ERROR');
    expect(res.action).toBe('STOP');
    expect(res.message).toContain('unsupported duplicate rule operator "%"');
  });

  it('honors configured operators (>=, <=, !=) and changes runtime behavior accordingly (Section 6.1)', () => {
    // Test operator '>=': threshold 2 with 2 legs -> FAIL
    const gteConfig: DatabaseColumnConfiguration = {
      id: 'cfg-dup-gte',
      name: 'GTE Operator Check',
      dbId: 'db-core',
      tableName: 'tran_log',
      ruleType: 'DUPLICATE_CHECK',
      columns: [{ columnName: 'rrn', priority: 1, role: 'MATCH_KEY' }],
      aggregationRules: [{ function: 'COUNT', operator: '>=', value: 2 }],
      violationAction: 'FLAG',
      severity: 'CRITICAL',
      isActive: true,
    };
    const methodGte = new DbConfigValidationMethod(gteConfig, 1, 'db-core', 'tran_log');
    const twoLegs = [{ rrn: 'RRN-1', id: 'L1' }, { rrn: 'RRN-1', id: 'L2' }];
    expect(methodGte.evaluateConfig(twoLegs, { rrn: 'RRN-1' }).status).toBe('FAIL');

    // Test operator '<=': threshold 1 with 2 legs -> PASS (not <= 1)
    const lteConfig: DatabaseColumnConfiguration = {
      id: 'cfg-dup-lte',
      name: 'LTE Operator Check',
      dbId: 'db-core',
      tableName: 'tran_log',
      ruleType: 'DUPLICATE_CHECK',
      columns: [{ columnName: 'rrn', priority: 1, role: 'MATCH_KEY' }],
      aggregationRules: [{ function: 'COUNT', operator: '<=', value: 1 }],
      violationAction: 'FLAG',
      severity: 'CRITICAL',
      isActive: true,
    };
    const methodLte = new DbConfigValidationMethod(lteConfig, 1, 'db-core', 'tran_log');
    expect(methodLte.evaluateConfig(twoLegs, { rrn: 'RRN-1' }).status).toBe('PASS');
  });

  it('preserves diagnostics and identifiers for all violating legs (Section 6.2)', () => {
    const dupConfig: DatabaseColumnConfiguration = {
      id: 'cfg-dup-diag',
      name: 'Multi-Leg Diagnostic Check',
      dbId: 'db-core',
      tableName: 'tran_log',
      ruleType: 'DUPLICATE_CHECK',
      columns: [{ columnName: 'rrn', priority: 1, role: 'MATCH_KEY' }],
      aggregationRules: [{ function: 'COUNT', operator: '>', value: 1 }],
      violationAction: 'FLAG',
      severity: 'CRITICAL',
      isActive: true,
    };
    const method = new DbConfigValidationMethod(dupConfig, 1, 'db-core', 'tran_log');
    const threeLegs = [
      { rrn: 'RRN-1', TR_HIS_ID: 'HIS-001', amount: '100' },
      { rrn: 'RRN-1', TR_HIS_ID: 'HIS-002', amount: '200' },
      { rrn: 'RRN-1', TR_HIS_ID: 'HIS-003', amount: '300' }
    ];
    const res = method.evaluateConfig(threeLegs, { rrn: 'RRN-1' });
    expect(res.status).toBe('FAIL');
    expect(res.details.duplicateCount).toBe(3);
    expect(res.details.violatingLegIdentifiers).toEqual(['HIS-001', 'HIS-002', 'HIS-003']);
    expect(res.details.matchingLegs?.length).toBe(3);
  });

  it('enforces strict null/missing semantics in filter conditions (Section 6.3)', () => {
    const nullFilterConfig: DatabaseColumnConfiguration = {
      id: 'cfg-dup-null',
      name: 'Null Semantics Check',
      dbId: 'db-core',
      tableName: 'tran_log',
      ruleType: 'DUPLICATE_CHECK',
      columns: [{ columnName: 'rrn', priority: 1, role: 'MATCH_KEY' }],
      filterConditions: [{ columnName: 'PROC_NAME', operator: '!=', value: 'RVS' }],
      aggregationRules: [{ function: 'COUNT', operator: '>', value: 1 }],
      violationAction: 'FLAG',
      severity: 'CRITICAL',
      isActive: true,
    };
    const method = new DbConfigValidationMethod(nullFilterConfig, 1, 'db-core', 'tran_log');

    // Row where PROC_NAME is missing (undefined/null) must NOT be counted as != RVS
    const rowsWithMissing = [
      { rrn: 'RRN-1', PROC_NAME: 'SETT' }, // Qualifies
      { rrn: 'RRN-1' },                     // Missing PROC_NAME -> MUST NOT qualify
      { rrn: 'RRN-1', PROC_NAME: null }     // Null PROC_NAME -> MUST NOT qualify
    ];
    const res = method.evaluateConfig(rowsWithMissing, { rrn: 'RRN-1' });
    // Only 1 qualifying leg -> not > 1 -> PASS
    expect(res.status).toBe('PASS');
    expect(res.details.duplicateCount).toBe(1);
  });
});
