import { describe, it, expect } from 'vitest';
import { evaluateRuleCondition } from '../investigationEngine.js';
import { ruleSqlCompiler } from '../ruleSqlCompiler.js';
import { ValidationCheckStep, DatabaseColumnConfiguration } from '../../types.js';

describe('Validation Box with Database Column Configurations', () => {
  it('passes base check and evaluates attached completeness configuration', () => {
    const completenessConfig: DatabaseColumnConfiguration = {
      id: 'cfg-comp-1',
      name: 'Auth Log Mandatory Fields',
      dbId: 'db-1',
      tableName: 'auth_log_tab',
      ruleType: 'COMPLETENESS_CHECK',
      columns: [
        { columnName: 'terminal_id', priority: 1 },
        { columnName: 'reqamt', priority: 2 }
      ],
      violationAction: 'FLAG',
      severity: 'CRITICAL',
      violationMessage: 'Mandatory auth field missing',
      isActive: true
    };

    const step: ValidationCheckStep = {
      id: 'step-1',
      stepNumber: 1,
      name: 'Auth Log Check',
      checkType: 'EXISTENCE_CHECK',
      targetDbId: 'db-1',
      targetTable: 'auth_log_tab',
      sourceField: 'terminal_id',
      dependencyCondition: 'ALWAYS',
      onPassAction: 'CONTINUE',
      onFailAction: 'STOP',
      onErrorAction: 'STOP',
      columnConfigurations: [completenessConfig]
    };

    // Case 1: All required fields present
    const validRec = {
      terminal_id: 'TERM-01',
      reqamt: 100.50
    };
    const resPass = evaluateRuleCondition(validRec, step);
    expect(resPass.status).toBe('PASS');
    expect(resPass.badgeText).toContain('Table Rule');

    // Case 2: Missing reqamt
    const invalidRec = {
      terminal_id: 'TERM-01',
      reqamt: null
    };
    const resFail = evaluateRuleCondition(invalidRec, step);
    expect(resFail.status).toBe('FAIL');
    expect(resFail.badgeText).toBe('Incomplete Col');
    expect(resFail.message).toContain('Mandatory auth field missing');
  });

  it('evaluates attached value range check configuration', () => {
    const rangeConfig: DatabaseColumnConfiguration = {
      id: 'cfg-range-1',
      name: 'Transaction Amount Bounds',
      dbId: 'db-1',
      tableName: 'auth_log_tab',
      ruleType: 'VALUE_RANGE_CHECK',
      columns: [
        { columnName: 'reqamt', priority: 1, minValue: 10, maxValue: 10000 }
      ],
      violationAction: 'STOP',
      severity: 'CRITICAL',
      violationMessage: 'Amount outside authorized limits',
      isActive: true
    };

    const step: ValidationCheckStep = {
      id: 'step-2',
      stepNumber: 1,
      name: 'Amount Range Check',
      checkType: 'EXISTENCE_CHECK',
      targetDbId: 'db-1',
      targetTable: 'auth_log_tab',
      sourceField: 'terminal_id',
      dependencyCondition: 'ALWAYS',
      onPassAction: 'CONTINUE',
      onFailAction: 'STOP',
      onErrorAction: 'STOP',
      columnConfigurations: [rangeConfig]
    };

    // Below minimum
    const lowRec = { terminal_id: 'TERM-01', reqamt: 5 };
    const resLow = evaluateRuleCondition(lowRec, step);
    expect(resLow.status).toBe('FAIL');
    expect(resLow.badgeText).toBe('Below Min');

    // Above maximum
    const highRec = { terminal_id: 'TERM-01', reqamt: 15000 };
    const resHigh = evaluateRuleCondition(highRec, step);
    expect(resHigh.status).toBe('FAIL');
    expect(resHigh.badgeText).toBe('Above Max');

    // In bounds
    const normalRec = { terminal_id: 'TERM-01', reqamt: 250 };
    const resNormal = evaluateRuleCondition(normalRec, step);
    expect(resNormal.status).toBe('PASS');
  });

  it('compiles attached column configurations into set-based SQL expressions', () => {
    const completenessConfig: DatabaseColumnConfiguration = {
      id: 'cfg-comp-sql',
      name: 'Mandatory Terminal',
      dbId: 'db-1',
      tableName: 'auth_log_tab',
      ruleType: 'COMPLETENESS_CHECK',
      columns: [{ columnName: 'terminal_id', priority: 1 }],
      violationAction: 'FLAG',
      severity: 'CRITICAL',
      isActive: true
    };

    const rangeConfig: DatabaseColumnConfiguration = {
      id: 'cfg-range-sql',
      name: 'Reqamt Positive',
      dbId: 'db-1',
      tableName: 'auth_log_tab',
      ruleType: 'VALUE_RANGE_CHECK',
      columns: [{ columnName: 'reqamt', priority: 1, minValue: 0.01 }],
      violationAction: 'FLAG',
      severity: 'CRITICAL',
      isActive: true
    };

    const step: ValidationCheckStep = {
      id: 'step-sql',
      stepNumber: 1,
      name: 'Auth Check with SQL Table Rules',
      checkType: 'EXISTENCE_CHECK',
      targetDbId: 'db-1',
      targetTable: 'auth_log_tab',
      sourceField: 'terminal_id',
      dependencyCondition: 'ALWAYS',
      onPassAction: 'CONTINUE',
      onFailAction: 'STOP',
      onErrorAction: 'STOP',
      columnConfigurations: [completenessConfig, rangeConfig]
    };

    const sql = ruleSqlCompiler.compileStepCondition(step, 'm', ['terminal_id', 'reqamt']);
    expect(sql).toContain('m._mirror_id IS NOT NULL');
    expect(sql).toContain("COALESCE(m.\"terminal_id\"::text, '') != ''");
    expect(sql).toContain('COALESCE((m."reqamt")::numeric, 0) >= 0.01');
  });
});
