import { describe, it, expect } from 'vitest';
import { ruleSqlCompiler } from '../ruleSqlCompiler.js';
import { ValidationCheckStep } from '../../types.js';

describe('ruleSqlCompiler', () => {
  describe('compileStepCondition', () => {
    it('compiles EXISTENCE_CHECK to _mirror_id IS NOT NULL', () => {
      const step: ValidationCheckStep = {
        id: 'step-1',
        stepNumber: 1,
        name: 'Check Record Exists',
        checkType: 'EXISTENCE_CHECK',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        requiredParams: [],
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP',
        severityOnFailure: 'CRITICAL'
      };
      const sql = ruleSqlCompiler.compileStepCondition(step, 'm', ['transaction_id']);
      expect(sql).toBe('m._mirror_id IS NOT NULL');
    });

    it('compiles AMOUNT_MATCH with numeric tolerance', () => {
      const step: ValidationCheckStep = {
        id: 'step-2',
        stepNumber: 2,
        name: 'Match Amount',
        checkType: 'AMOUNT_MATCH',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        targetField: 'amount_usd',
        compareValue: '150.50',
        toleranceMargin: 0.05,
        requiredParams: [],
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP',
        severityOnFailure: 'WARNING'
      };
      const sql = ruleSqlCompiler.compileStepCondition(step, 'm', ['amount_usd']);
      expect(sql).toContain('ABS(COALESCE((m."amount_usd")::numeric, 0) - 150.5) <= 0.05');
    });

    it('compiles FIELD_COMPARATOR with IN operator', () => {
      const step: ValidationCheckStep = {
        id: 'step-3',
        stepNumber: 3,
        name: 'Status In Set',
        checkType: 'FIELD_COMPARATOR',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        targetField: 'response_code',
        comparator: 'IN',
        compareValue: '00, 10, 20',
        requiredParams: [],
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP',
        severityOnFailure: 'CRITICAL'
      };
      const sql = ruleSqlCompiler.compileStepCondition(step, 'm', ['response_code']);
      expect(sql).toContain("IN ('00', '10', '20')");
    });

    it('compiles FIELD_COMPARATOR with CONTAINS operator', () => {
      const step: ValidationCheckStep = {
        id: 'step-4',
        stepNumber: 4,
        name: 'Merchant Contains Name',
        checkType: 'FIELD_COMPARATOR',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        targetField: 'merchant_name',
        comparator: 'CONTAINS',
        compareValue: 'Acme',
        requiredParams: [],
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP',
        severityOnFailure: 'WARNING'
      };
      const sql = ruleSqlCompiler.compileStepCondition(step, 'm', ['merchant_name']);
      expect(sql).toContain("LIKE '%acme%'");
    });

    it('compiles STATUS_MATCH with uppercase normalization', () => {
      const step: ValidationCheckStep = {
        id: 'step-5',
        stepNumber: 5,
        name: 'Verify Settled Status',
        checkType: 'STATUS_MATCH',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        targetField: 'status',
        compareValue: 'settled',
        requiredParams: [],
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP',
        severityOnFailure: 'WARNING'
      };
      const sql = ruleSqlCompiler.compileStepCondition(step, 'm', ['status']);
      expect(sql).toBe("UPPER(COALESCE(m.\"status\"::text, '')) = 'SETTLED'");
    });

    it('sanitizes user input against SQL injection attempts', () => {
      const step: ValidationCheckStep = {
        id: 'step-6',
        stepNumber: 6,
        name: 'SQL Injection Test',
        checkType: 'FIELD_COMPARATOR',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        targetField: 'code',
        comparator: '=',
        compareValue: "'; DROP TABLE users; --",
        requiredParams: [],
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP',
        severityOnFailure: 'CRITICAL'
      };
      const sql = ruleSqlCompiler.compileStepCondition(step, 'm', ['code']);
      expect(sql).toBe("COALESCE(m.\"code\"::text, '') = '''; DROP TABLE users; --'");
    });

    it('compiles DUAL_SOURCE_COMPARISON between input and mirror column', () => {
      const step: ValidationCheckStep = {
        id: 'step-7',
        stepNumber: 7,
        name: 'Cross Source Amount Match',
        checkType: 'DUAL_SOURCE_COMPARISON',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        dualSourceCondition: {
          sourceA: { origin: 'INPUT', field: 'amount_usd' },
          sourceB: { origin: 'MIRROR', field: 'amount' },
          comparator: 'NUMERIC_TOLERANCE',
          toleranceMargin: 0.01
        },
        requiredParams: [],
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP',
        severityOnFailure: 'CRITICAL'
      };
      const sql = ruleSqlCompiler.compileStepCondition(step, 'm', ['amount'], 't');
      expect(sql).toContain('ABS(COALESCE(');
      expect(sql).toContain('<= 0.01');
    });
  });

  describe('compileBlockUpdateSql', () => {
    it('generates a complete set-based batch update statement', () => {
      const steps: ValidationCheckStep[] = [
        {
          id: 'step-1',
          stepNumber: 1,
          name: 'Step One Check',
          checkType: 'EXISTENCE_CHECK',
          targetDbId: 'db-1',
          targetTable: 'transactions',
          requiredParams: [],
          dependencyCondition: 'ALWAYS',
          onPassAction: 'CONTINUE',
          onFailAction: 'STOP',
          onErrorAction: 'STOP',
          severityOnFailure: 'CRITICAL'
        }
      ];

      const compiled = ruleSqlCompiler.compileBlockUpdateSql(
        'mirror_db1_transactions',
        'transaction_id',
        steps,
        ['transaction_id', 'amount_usd']
      );

      expect(compiled.fullUpdateSql).toContain('UPDATE mirror_db1_transactions m');
      expect(compiled.fullUpdateSql).toContain('SET');
      expect(compiled.fullUpdateSql).toContain('_validation_status = CASE');
      expect(compiled.fullUpdateSql).toContain('_validation_action = CASE');
      expect(compiled.fullUpdateSql).toContain('WHERE m._batch_id = $1');
    });

    it('compiles DUPLICATE_CHECK with row_number scoping, filter preservation and aggregation threshold', () => {
      const step: ValidationCheckStep = {
        id: 'step-dup-1',
        stepNumber: 1,
        name: 'Settlement Duplicate Check',
        checkType: 'EXISTENCE_CHECK',
        targetDbId: 'db-1',
        targetTable: 'tran_log_tab',
        requiredParams: [],
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP',
        severityOnFailure: 'CRITICAL',
        columnConfigurations: [
          {
            id: 'colcfg-dup',
            name: 'New Column Rule',
            dbId: 'db-1',
            tableName: 'tran_log_tab',
            ruleType: 'DUPLICATE_CHECK',
            columns: [
              { columnName: 'TR_GROUP_ID', role: 'DISCRIMINATOR', priority: 1 },
              { columnName: 'BO_TYPE', role: 'DISCRIMINATOR', priority: 2 },
              { columnName: 'PROC_NAME', role: 'DISCRIMINATOR', priority: 3 }
            ],
            filterConditions: [
              { columnName: 'BO_TYPE', operator: '=', value: 'CMTP254' },
              { columnName: 'PROC_NAME', operator: '!=', value: 'RVS' }
            ],
            aggregationRules: [
              { function: 'COUNT', operator: '>', value: 1 }
            ],
            violationAction: 'FLAG',
            severity: 'CRITICAL',
            isActive: true
          }
        ]
      };

      const compiled = ruleSqlCompiler.compileBlockUpdateSql(
        'mirror_sett_tran_log_tab',
        'fe_utrnno',
        [step],
        ['tr_group_id', 'bo_type', 'proc_name', 'fe_utrnno']
      );

      // Verify the generated SQL contains batch and task scoped subquery
      expect(compiled.fullUpdateSql).toContain('_dup._batch_id = m._batch_id');
      expect(compiled.fullUpdateSql).toContain('_dup._task_id = m._task_id');
      expect(compiled.fullUpdateSql).not.toContain('_dup._row_number = m._row_number');
      expect(compiled.fullUpdateSql).toContain('_dup."tr_group_id" = m."tr_group_id"');
      expect(compiled.fullUpdateSql).toContain("LOWER(COALESCE(m.\"bo_type\"::text, '')) = LOWER('CMTP254')");
      expect(compiled.fullUpdateSql).toContain("COALESCE(m.\"proc_name\"::text, '') != 'RVS'");
      expect(compiled.fullUpdateSql).toContain('<= 1');
    });
  });
});
