/**
 * DbConfigValidationMethod — §6.7 DB Column Configuration Validation Method
 *
 * Operational Goal: Evaluates table-level rules (Completeness, Value Range, Pattern,
 * Duplicates, Grouping) directly on returned external data (multi-leg array in returned_data)
 * or local canonical data.
 *
 * Conforms strictly to Architecture Specification:
 *   - Runs LAST in the stage after mirror reconciliation is completed.
 *   - Operates strictly on passed rows.
 *   - Supports MUTATE_STATUS (fails record on breach) and REPORT_ONLY (records diagnostic details without changing PASS).
 *   - Attaches dataKeys list to the evaluation detail for forensic audit.
 */

import type { DatabaseColumnConfiguration } from '../../../types.js';
import type { ValidationMethod, ValidationExecutionContext, ValidationDataResult } from '../types.js';

function resolveField(obj: any, key: string): any {
  if (!obj || typeof obj !== 'object' || !key) return undefined;
  if (obj[key] !== undefined) return obj[key];
  const lower = key.toLowerCase();
  if (obj[lower] !== undefined) return obj[lower];
  const upper = key.toUpperCase();
  if (obj[upper] !== undefined) return obj[upper];
  if (obj.payload && typeof obj.payload === 'object') {
    if (obj.payload[key] !== undefined) return obj.payload[key];
    if (obj.payload[lower] !== undefined) return obj.payload[lower];
    if (obj.payload[upper] !== undefined) return obj.payload[upper];
  }
  return undefined;
}

export interface DbConfigMethodResult {
  status: 'PASS' | 'FAIL' | 'ERROR';
  isBreached?: boolean;
  statusBehavior?: 'MUTATE_STATUS' | 'REPORT_ONLY';
  message?: string;
  details: {
    rule?: string;
    ruleName?: string;
    ruleType?: string;
    operator?: string;
    threshold?: number;
    duplicateCount?: number;
    identifierColumn?: string;
    identifierValue?: any;
    violatingLegIdentifiers?: any[];
    matchingLegs?: any[];
    [key: string]: any;
  };
  dataKeys: string[];
  action: string;
  affectsReconciliationStatus?: boolean;
}

export class DbConfigValidationMethod implements ValidationMethod {
  readonly id: string;
  readonly name: string;
  readonly config: DatabaseColumnConfiguration;
  readonly stageNumber: number;
  readonly targetDbId?: string;
  readonly targetTable?: string;
  readonly statusBehavior: 'MUTATE_STATUS' | 'REPORT_ONLY';
  readonly affectsReconciliationStatus: boolean;
  readonly requiredInputKeys: string[];

  constructor(
    config: DatabaseColumnConfiguration,
    stageNumber: number,
    targetDbId?: string,
    targetTable?: string
  ) {
    this.id = `colcfg-method-${config.id}`;
    this.name = config.name;
    this.config = config;
    this.stageNumber = stageNumber;
    this.targetDbId = targetDbId || config.dbId;
    this.targetTable = targetTable || config.tableName;
    this.statusBehavior = config.statusBehavior || 'MUTATE_STATUS';
    this.affectsReconciliationStatus = config.affectsReconciliationStatus !== false;

    const candidateKeys: string[] = [];
    if (Array.isArray(config.columns)) {
      for (const col of config.columns) {
        if (col.columnName) candidateKeys.push(col.columnName);
      }
    }
    if (config.primaryKeyColumn) candidateKeys.push(config.primaryKeyColumn);
    if (config.roleColumn) candidateKeys.push(config.roleColumn);
    if (Array.isArray(config.groupByColumns)) candidateKeys.push(...config.groupByColumns);

    this.requiredInputKeys = Array.from(new Set(candidateKeys));
  }

  async execute(
    context: ValidationExecutionContext,
    inputs: Record<string, any>
  ): Promise<ValidationDataResult> {
    const workflowId = context.workflowId || 'default';
    const targetTable = this.targetTable || '';

    // Downstream validators and DB configs pull directly from returned_data in task_dataset_transactions
    const returnedData = context.initialRecord?.returned_data || context.initialRecord?.canonical_data?.returned_data || {};
    const workflowData = returnedData[workflowId] || returnedData;
    const stageData = returnedData.stages?.[context.stageId] || (targetTable ? returnedData.stages?.[targetTable] : null);
    const rawLegs = stageData?.legs || workflowData[targetTable] || returnedData[targetTable];
    const returnedLegs: any[] = Array.isArray(rawLegs) ? rawLegs : (rawLegs ? [rawLegs] : []);

    const effectiveRows = returnedLegs.length > 0
      ? returnedLegs
      : (Array.isArray((context as any)._stagedRows) ? (context as any)._stagedRows : (targetTable ? [] : [inputs]));

    return {
      context,
      mirrorTable: '',
      fetchedRowCount: effectiveRows.length,
      rawRows: effectiveRows,
    };
  }

  /**
   * Forensic rule evaluation logic for DatabaseColumnConfiguration
   */
  evaluateConfig(
    candidateRows: any[],
    canonicalRow: Record<string, any>
  ): DbConfigMethodResult {
    const cfg = this.config;
    const dataKeys = this.requiredInputKeys;

    if (candidateRows.length === 0 && cfg.tableName) {
      return {
        status: 'FAIL',
        isBreached: true,
        statusBehavior: this.statusBehavior,
        message: `No records returned from target table '${cfg.tableName}' for rule '${cfg.name}'`,
        details: {
          ruleName: cfg.name,
          tableName: cfg.tableName,
          recordsFound: 0,
          reason: 'NOT_FOUND_IN_TARGET_DB',
        },
        dataKeys,
        action: cfg.violationAction || 'FLAG',
        affectsReconciliationStatus: this.affectsReconciliationStatus,
      };
    }

    const targetRows = candidateRows.length > 0 ? candidateRows : [canonicalRow];

    // Evaluate Multi-Leg Duplicate Check / Uniqueness constraints across returned rows
    if (cfg.ruleType === 'DUPLICATE_CHECK' || cfg.ruleType === 'UNIQUE_CONSTRAINT') {
      let matchingRows = targetRows;
      if (Array.isArray(cfg.filterConditions) && cfg.filterConditions.length > 0) {
        matchingRows = targetRows.filter(row => {
          return cfg.filterConditions!.every(fc => {
            const rawVal = resolveField(row, fc.columnName);
            // Section 6.3: Strict null / missing-value semantics.
            // Do NOT silently coerce null/undefined to empty string.
            if (rawVal === undefined || rawVal === null) {
              if (fc.value === null || fc.value === undefined || fc.value === '') {
                return fc.operator === '=';
              }
              // Missing value cannot safely evaluate inequality (e.g. PROC_NAME != 'RVS')
              return false;
            }
            const rowVal = String(rawVal).trim().toLowerCase();
            const condVal = String(fc.value ?? '').trim().toLowerCase();
            switch (fc.operator) {
              case '=': return rowVal === condVal;
              case '!=': return rowVal !== condVal;
              case 'LIKE': return rowVal.includes(condVal);
              case 'STARTS_WITH': return rowVal.startsWith(condVal);
              case '>': return Number(rowVal) > Number(condVal);
              case '>=': return Number(rowVal) >= Number(condVal);
              case '<': return Number(rowVal) < Number(condVal);
              case '<=': return Number(rowVal) <= Number(condVal);
              case 'IN': return condVal.split(',').map(s => s.trim()).includes(rowVal);
              case 'NOT_IN': return !condVal.split(',').map(s => s.trim()).includes(rowVal);
              default: return rowVal === condVal;
            }
          });
        });
      }

      const rawOp = cfg.aggregationRules?.[0]?.operator ?? '>';
      const op = String(rawOp).trim();
      const threshold = Number(cfg.aggregationRules?.[0]?.value ?? 1);

      // Section 6.1: Allowlisted operator evaluation (reject unsupported operators)
      const ALLOWED_OPERATORS = ['>', '>=', '=', '==', '<', '<=', '!=', '<>'];
      if (!ALLOWED_OPERATORS.includes(op)) {
        return {
          status: 'ERROR',
          isBreached: true,
          statusBehavior: this.statusBehavior,
          message: `Configuration Error on [${cfg.name}]: unsupported duplicate rule operator "${op}". Supported operators: >, >=, =, <=, <, !=`,
          details: {
            rule: cfg.name,
            ruleType: cfg.ruleType,
            unsupportedOperator: op,
            allowedOperators: ALLOWED_OPERATORS,
          },
          dataKeys,
          action: 'STOP',
          affectsReconciliationStatus: this.affectsReconciliationStatus,
        };
      }

      const count = matchingRows.length;
      let isViolation = false;
      switch (op) {
        case '>':
          isViolation = (count > threshold);
          break;
        case '>=':
          isViolation = (count >= threshold);
          break;
        case '=':
        case '==':
          isViolation = (count !== threshold);
          break;
        case '<':
          isViolation = (count < threshold);
          break;
        case '<=':
          isViolation = (count <= threshold);
          break;
        case '!=':
        case '<>':
          isViolation = (count === threshold);
          break;
      }

      const idCol = cfg.columns?.[0]?.columnName || cfg.primaryKeyColumn || cfg.groupByColumns?.[0] || 'id';
      const idVal = resolveField(matchingRows[0], idCol) ?? resolveField(canonicalRow, idCol) ?? 'UNKNOWN';

      // Section 6.2: Preserve diagnostics for ALL violating legs
      const violatingLegIdentifiers = matchingRows.map((r, idx) => {
        return resolveField(r, 'TR_HIS_ID')
          ?? resolveField(r, 'leg_id')
          ?? resolveField(r, 'id')
          ?? resolveField(r, idCol)
          ?? `leg_${idx + 1}`;
      });

      if (isViolation) {
        return {
          status: 'FAIL',
          isBreached: true,
          statusBehavior: this.statusBehavior,
          message: cfg.violationMessage || `Duplicate Check failed on [${cfg.name}]: detected ${count} matching legs (operator "${op}" threshold ${threshold}) for identifier [${idCol}=${idVal}].`,
          details: {
            rule: cfg.name,
            ruleType: cfg.ruleType,
            operator: op,
            threshold,
            duplicateCount: count,
            identifierColumn: idCol,
            identifierValue: idVal,
            violatingLegIdentifiers,
            matchingLegs: matchingRows
          },
          dataKeys,
          action: cfg.violationAction || 'FLAG',
          affectsReconciliationStatus: this.affectsReconciliationStatus
        };
      }

      return {
        status: 'PASS',
        isBreached: false,
        statusBehavior: this.statusBehavior,
        message: `Duplicate Check passed on [${cfg.name}]: ${count} matching legs satisfy operator "${op}" threshold ${threshold}.`,
        details: {
          rule: cfg.name,
          ruleType: cfg.ruleType,
          operator: op,
          threshold,
          duplicateCount: count,
          identifierColumn: idCol,
          identifierValue: idVal,
          matchingLegs: matchingRows
        },
        dataKeys,
        action: 'CONTINUE',
        affectsReconciliationStatus: this.affectsReconciliationStatus
      };
    }

    for (const row of targetRows) {
      if (cfg.ruleType === 'COMPLETENESS_CHECK') {
        const missing: string[] = [];
        for (const col of (cfg.columns || [])) {
          const v = resolveField(row, col.columnName) ?? resolveField(canonicalRow, col.columnName);
          if (v === undefined || v === null || String(v).trim() === '') {
            missing.push(col.columnName);
          }
        }
        if (missing.length > 0) {
          return {
            status: 'FAIL',
            message: cfg.violationMessage || `Completeness Check failed on [${cfg.name}]: columns [${missing.join(', ')}] missing.`,
            details: { missingColumns: missing, rule: cfg.name, ruleType: cfg.ruleType },
            dataKeys,
            action: cfg.violationAction || 'FLAG'
          };
        }
      } else if (cfg.ruleType === 'VALUE_RANGE_CHECK') {
        for (const col of (cfg.columns || [])) {
          const v = resolveField(row, col.columnName) ?? resolveField(canonicalRow, col.columnName);
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            const num = Number(v);
            if (!isNaN(num)) {
              if (col.minValue !== undefined && num < Number(col.minValue)) {
                return {
                  status: 'FAIL',
                  message: cfg.violationMessage || `Value Range Check failed on [${cfg.name}]: '${col.columnName}' (${num}) < ${col.minValue}.`,
                  details: { column: col.columnName, value: num, minValue: col.minValue, rule: cfg.name },
                  dataKeys,
                  action: cfg.violationAction || 'FLAG'
                };
              }
              if (col.maxValue !== undefined && num > Number(col.maxValue)) {
                return {
                  status: 'FAIL',
                  message: cfg.violationMessage || `Value Range Check failed on [${cfg.name}]: '${col.columnName}' (${num}) > ${col.maxValue}.`,
                  details: { column: col.columnName, value: num, maxValue: col.maxValue, rule: cfg.name },
                  dataKeys,
                  action: cfg.violationAction || 'FLAG'
                };
              }
            }
          }
        }
      } else if (cfg.ruleType === 'PATTERN_CHECK') {
        for (const col of (cfg.columns || [])) {
          const v = resolveField(row, col.columnName) ?? resolveField(canonicalRow, col.columnName);
          if (col.pattern && v !== undefined && v !== null && String(v).trim() !== '') {
            try {
              const regex = new RegExp(col.pattern);
              if (!regex.test(String(v))) {
                return {
                  status: 'FAIL',
                  message: cfg.violationMessage || `Pattern Check failed on [${cfg.name}]: '${col.columnName}' does not match pattern ${col.pattern}.`,
                  details: { column: col.columnName, value: v, pattern: col.pattern, rule: cfg.name },
                  dataKeys,
                  action: cfg.violationAction || 'FLAG'
                };
              }
            } catch {
              // Ignore invalid regex
            }
          }
        }
      }
    }

    return {
      status: 'PASS',
      message: `Table rule [${cfg.name}] satisfied.`,
      details: { rule: cfg.name, ruleType: cfg.ruleType },
      dataKeys,
      action: 'CONTINUE'
    };
  }
}
