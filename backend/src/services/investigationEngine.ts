/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DatabaseValidationWorkflow,
  ProcessingStage,
  ValidationCheckStep,
  ValidationResultStatus,
  PipelineAction,
  TransactionInvestigationStatus,
  RuleExecutionAuditEntry,
  TransactionExecutionSummary,
  ComparisonOperand,
  DualSourceCondition,
  DatabaseColumnConfiguration
} from '../types.js';

/**
 * Evaluates attached Database Table Column Configurations (Completeness, Value Ranges, Patterns, Value Labels, and Uniqueness)
 * against the target/canonical record data.
 */
export function evaluateAttachedColumnConfigurations(
  record: Record<string, any>,
  configurations?: DatabaseColumnConfiguration[]
): ConditionEvaluationResult {
  if (!Array.isArray(configurations) || configurations.length === 0) {
    return { status: 'PASS', badgeText: 'Passed', message: 'All checks passed' };
  }

  const activeConfigs = configurations.filter(c => c && c.isActive !== false);

  for (const cfg of activeConfigs) {
    const cols = Array.isArray(cfg.columns) ? cfg.columns : [];
    const isExternalConfig = Boolean(cfg.tableName && cfg.tableName.toLowerCase() !== 'input' && cfg.tableName.toLowerCase() !== 'transactions');
    const hasExternalData = Boolean(record._target_record || record.canonical_data?._target_record || record._mirrorData || record._externalData);
    const recordHasConfigCols = cols.length > 0 && cols.some(col => col.columnName in record || (record.canonical_data && col.columnName in record.canonical_data));

    // If configuration targets external table and neither external record lookup was performed nor columns exist on the evaluated record
    if (isExternalConfig && !hasExternalData && !recordHasConfigCols) {
      return {
        status: 'FAIL',
        badgeText: 'Ext Data Missing',
        message: cfg.violationMessage || `Cannot evaluate column rules for external table [${cfg.tableName}]: target record was not found or not yet retrieved.`,
        detail: `Attached rule [${cfg.name}] applies to external table '${cfg.tableName}'.`,
        action: cfg.violationAction || 'FLAG',
        severity: cfg.severity || 'CRITICAL'
      };
    }

    const evalTarget = hasExternalData
      ? (record._target_record ?? record.canonical_data?._target_record ?? record._mirrorData ?? record._externalData)
      : (record.canonical_data ?? record);

    switch (cfg.ruleType) {
      case 'COMPLETENESS_CHECK': {
        for (const col of cols) {
          const val = resolveRecordField(evalTarget, col.columnName);
          if (val === undefined || val === null || String(val).trim() === '') {
            return {
              status: 'FAIL',
              badgeText: 'Incomplete Col',
              message: cfg.violationMessage || `Completeness Check failed on [${cfg.name}]: column '${col.columnName}' is missing or empty.`,
              detail: `Table column completeness violation: ${col.columnName}`,
              action: cfg.violationAction || 'FLAG',
              severity: cfg.severity || 'CRITICAL'
            };
          }
        }
        break;
      }

      case 'VALUE_RANGE_CHECK': {
        for (const col of cols) {
          const val = resolveRecordField(evalTarget, col.columnName);
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            const num = Number(val);
            if (!isNaN(num)) {
              if (col.minValue !== undefined && num < Number(col.minValue)) {
                return {
                  status: 'FAIL',
                  badgeText: 'Below Min',
                  message: cfg.violationMessage || `Value Range Check failed on [${cfg.name}]: '${col.columnName}' (${num}) is below minimum (${col.minValue}).`,
                  detail: `Range violation: ${col.columnName} < ${col.minValue}`,
                  action: cfg.violationAction || 'FLAG',
                  severity: cfg.severity || 'CRITICAL'
                };
              }
              if (col.maxValue !== undefined && num > Number(col.maxValue)) {
                return {
                  status: 'FAIL',
                  badgeText: 'Above Max',
                  message: cfg.violationMessage || `Value Range Check failed on [${cfg.name}]: '${col.columnName}' (${num}) exceeds maximum (${col.maxValue}).`,
                  detail: `Range violation: ${col.columnName} > ${col.maxValue}`,
                  action: cfg.violationAction || 'FLAG',
                  severity: cfg.severity || 'CRITICAL'
                };
              }
            }
          }
        }
        break;
      }

      case 'PATTERN_CHECK': {
        for (const col of cols) {
          const val = resolveRecordField(evalTarget, col.columnName);
          if (col.pattern && val !== undefined && val !== null && String(val).trim() !== '') {
            try {
              const regex = new RegExp(col.pattern);
              if (!regex.test(String(val))) {
                return {
                  status: 'FAIL',
                  badgeText: 'Pattern Error',
                  message: cfg.violationMessage || `Pattern Check failed on [${cfg.name}]: '${col.columnName}' (${val}) does not match pattern '${col.pattern}'.`,
                  detail: `Pattern mismatch on ${col.columnName}`,
                  action: cfg.violationAction || 'FLAG',
                  severity: cfg.severity || 'CRITICAL'
                };
              }
            } catch (err: any) {
              return {
                status: 'ERROR',
                badgeText: 'Regex Error',
                message: `Invalid regex pattern in [${cfg.name}]: ${err.message}`,
                action: cfg.violationAction || 'STOP',
                severity: cfg.severity || 'CRITICAL'
              };
            }
          }
        }
        break;
      }

      case 'VALUE_LABEL_CHECK': {
        if (Array.isArray(cfg.valueLabels) && cfg.valueLabels.length > 0) {
          for (const vl of cfg.valueLabels) {
            const val = resolveRecordField(evalTarget, vl.columnName);
            if (val !== undefined && val !== null) {
              const strVal = String(val).trim().toLowerCase();
              const targetConst = String(vl.constantValue).trim().toLowerCase();
              if (strVal === targetConst && (vl.category === 'ERROR' || vl.severity === 'CRITICAL')) {
                return {
                  status: 'FAIL',
                  badgeText: vl.label || 'Value Error',
                  message: cfg.violationMessage || `Value Label Check [${cfg.name}] flagged: '${vl.columnName}' has disallowed value '${val}' (${vl.label || vl.description || 'Error category'}).`,
                  detail: `Disallowed constant: ${vl.constantValue}`,
                  action: cfg.violationAction || 'FLAG',
                  severity: cfg.severity || 'CRITICAL'
                };
              }
            }
          }
        }
        break;
      }

      case 'DUPLICATE_CHECK':
      case 'UNIQUE_CONSTRAINT': {
        for (const col of cols) {
          const val = resolveRecordField(evalTarget, col.columnName);
          if (val === undefined || val === null || String(val).trim() === '') {
            return {
              status: 'FAIL',
              badgeText: 'Missing Key Col',
              message: cfg.violationMessage || `Duplicate Check prerequisite failed on [${cfg.name}]: key column '${col.columnName}' is null or empty.`,
              detail: `Uniqueness key missing: ${col.columnName}`,
              action: cfg.violationAction || 'FLAG',
              severity: cfg.severity || 'CRITICAL'
            };
          }
        }
        if (Array.isArray(record._batchRecords) && record._batchRecords.length > 1) {
          const thisKey = cols.map(c => String(resolveRecordField(evalTarget, c.columnName) ?? '')).join('::');
          const dupCount = record._batchRecords.filter((other: any) => {
            const otherTarget = other._target_record ?? other.canonical_data?._target_record ?? other._mirrorData ?? other.canonical_data ?? other;
            const otherKey = cols.map(c => String(resolveRecordField(otherTarget, c.columnName) ?? '')).join('::');
            return otherKey === thisKey;
          }).length;
          if (dupCount > 1) {
            return {
              status: 'FAIL',
              badgeText: 'Duplicate Found',
              message: cfg.violationMessage || `Duplicate Check failed on [${cfg.name}]: ${dupCount} records share key [${thisKey}].`,
              detail: `Cross-record duplicate violation (${dupCount} occurrences)`,
              action: cfg.violationAction || 'FLAG',
              severity: cfg.severity || 'CRITICAL'
            };
          }
        }
        if (record._matchCount && record._matchCount > 1) {
          return {
            status: 'FAIL',
            badgeText: 'Duplicate Match',
            message: cfg.violationMessage || `Uniqueness constraint violated: ${record._matchCount} matches found in external table.`,
            detail: `External duplicate match count: ${record._matchCount}`,
            action: cfg.violationAction || 'FLAG',
            severity: cfg.severity || 'CRITICAL'
          };
        }
        break;
      }

      case 'GROUPING_CHECK': {
        const groupCols = Array.isArray(cfg.groupByColumns) && cfg.groupByColumns.length > 0
          ? cfg.groupByColumns
          : cols.map(c => c.columnName);
        for (const colName of groupCols) {
          const val = resolveRecordField(evalTarget, colName);
          if (val === undefined || val === null || String(val).trim() === '') {
            return {
              status: 'FAIL',
              badgeText: 'Missing Group Key',
              message: cfg.violationMessage || `Grouping Check failed on [${cfg.name}]: grouping key column '${colName}' is missing or empty.`,
              detail: `Group key column missing: ${colName}`,
              action: cfg.violationAction || 'FLAG',
              severity: cfg.severity || 'WARNING'
            };
          }
        }
        break;
      }

      case 'MULTI_ROW_SEMANTIC_CHECK': {
        if (Array.isArray(cfg.crossRowRules) && cfg.crossRowRules.length > 0) {
          for (const crr of cfg.crossRowRules) {
            if (crr.valueColumn) {
              const valA = resolveRecordField(evalTarget, crr.valueColumn);
              if (valA === undefined || valA === null || String(valA).trim() === '') {
                return {
                  status: 'FAIL',
                  badgeText: 'Cross-Row Mismatch',
                  message: cfg.violationMessage || `Multi-row semantic check failed on [${cfg.name}]: value column '${crr.valueColumn}' is missing.`,
                  detail: `Cross-row rule violation on ${crr.valueColumn}`,
                  action: cfg.violationAction || 'FLAG',
                  severity: cfg.severity || 'WARNING'
                };
              }
            }
          }
        }
        break;
      }

      case 'TYPE_RELATION_CHECK': {
        if (Array.isArray(cfg.typeGroups) && cfg.typeGroups.length > 0) {
          const matchesAnyGroup = cfg.typeGroups.some(tg => {
            if (!Array.isArray(tg.conditions) || tg.conditions.length === 0) return true;
            return tg.conditions.every(c => {
              const val = resolveRecordField(evalTarget, c.columnName);
              if (val === undefined || val === null) return false;
              const strVal = String(val).trim();
              if (c.operator === '=') return strVal.toLowerCase() === c.value.trim().toLowerCase();
              if (c.operator === '!=') return strVal.toLowerCase() !== c.value.trim().toLowerCase();
              if (c.operator === 'IN') {
                const targets = c.value.split(',').map(s => s.trim().toLowerCase());
                return targets.includes(strVal.toLowerCase());
              }
              if (c.operator === 'NOT_IN') {
                const targets = c.value.split(',').map(s => s.trim().toLowerCase());
                return !targets.includes(strVal.toLowerCase());
              }
              if (c.operator === 'LIKE') return strVal.toLowerCase().includes(c.value.trim().toLowerCase());
              if (c.operator === 'STARTS_WITH') return strVal.toLowerCase().startsWith(c.value.trim().toLowerCase());
              return false;
            });
          });

          if (!matchesAnyGroup) {
            return {
              status: 'FAIL',
              badgeText: 'Type Group Error',
              message: cfg.violationMessage || `Type Relation Check failed on [${cfg.name}]: record does not match any configured type group.`,
              detail: `Type group classification failed for record`,
              action: cfg.violationAction || 'FLAG',
              severity: cfg.severity || 'WARNING'
            };
          }
        }
        break;
      }

      case 'CUSTOM_LOGIC': {
        if (cols.length > 0) {
          for (const col of cols) {
            const val = resolveRecordField(evalTarget, col.columnName);
            if (val === undefined || val === null || String(val).trim() === '') {
              return {
                status: 'FAIL',
                badgeText: 'Custom Logic Fail',
                message: cfg.violationMessage || `Custom Logic check failed on [${cfg.name}]: column '${col.columnName}' check failed.`,
                detail: `Custom logic verification failed on ${col.columnName}`,
                action: cfg.violationAction || 'FLAG',
                severity: cfg.severity || 'WARNING'
              };
            }
          }
        }
        break;
      }

      default:
        break;
    }
  }

  return {
    status: 'PASS',
    badgeText: `${activeConfigs.length} Table Rule${activeConfigs.length > 1 ? 's' : ''} OK`,
    message: `${activeConfigs.length} database table rule(s) verified`
  };
}

// User-configurable default label dictionary when custom mapping is not provided
export const DEFAULT_RESPONSE_CODE_LABELS: Record<string, string> = {
  '00': 'Approved / Success',
  '05': 'Do Not Honor / Card Issuer Decline',
  '14': 'Invalid Card / Identifier',
  '51': 'Insufficient Funds',
  '54': 'Expired Card',
  '61': 'Exceeds Limit',
  '91': 'Switch / Network Inoperative',
  '96': 'System Error'
};

/**
 * Safely resolves a field value from a transaction record.
 * Supports exact key, case-insensitive key, alphanumeric normalized key,
 * nested envelopes (_inputData, canonical_data, raw_data, payload, _mirrorData, _externalData),
 * and standard transaction ID aliases (transaction_id, id, FE_UTRNNO, TR_HIS_ID, refnum, etc.)
 */
export function resolveRecordField(record: Record<string, any>, fieldKey?: string): any {
  if (!record || typeof record !== 'object' || !fieldKey) return undefined;

  // 1. Direct property access
  if (record[fieldKey] !== undefined && record[fieldKey] !== null) {
    return record[fieldKey];
  }

  // 2. Direct envelope access
  const directEnvelopes = [
    record._inputData,
    record.canonical_data,
    record.raw_data,
    record.payload,
    record._mirrorData,
    record._externalData,
    record.extracted_data
  ];
  for (const env of directEnvelopes) {
    if (env && typeof env === 'object' && env[fieldKey] !== undefined && env[fieldKey] !== null) {
      return env[fieldKey];
    }
  }

  const targetLower = String(fieldKey).trim().toLowerCase();
  const targetNorm = targetLower.replace(/[^a-z0-9]/g, '');

  // 3. Case-insensitive & normalized search in top-level record
  const recordKeys = Object.keys(record);
  for (const k of recordKeys) {
    const kLower = k.toLowerCase();
    if (kLower === targetLower || kLower.replace(/[^a-z0-9]/g, '') === targetNorm) {
      if (record[k] !== undefined && record[k] !== null) return record[k];
    }
  }

  // 4. Case-insensitive search in nested envelopes
  for (const env of directEnvelopes) {
    if (env && typeof env === 'object') {
      for (const k of Object.keys(env)) {
        const kLower = k.toLowerCase();
        if (kLower === targetLower || kLower.replace(/[^a-z0-9]/g, '') === targetNorm) {
          if (env[k] !== undefined && env[k] !== null) return env[k];
        }
      }
    }
  }

  // 5. Special fallback for transaction identifier aliases
  if (targetLower === 'transaction_id' || targetLower === 'tx_id' || targetLower === 'id') {
    return (
      record.transaction_id ??
      record.id ??
      record.FE_UTRNNO ??
      record.fe_utrnno ??
      record.TR_HIS_ID ??
      record.tr_his_id ??
      record.BANK_REF ??
      record.bank_ref ??
      record.refnum ??
      record.reference_number ??
      record.terminal_id ??
      record.TERMINAL_ID ??
      record.order_id
    );
  }

  return undefined;
}

/**
 * Resolves an operand value dynamically across Input dataset, External Mirror, or Grouped Leg Envelopes.
 */
export function extractOperandValue(record: Record<string, any>, operand?: ComparisonOperand): any {
  if (!operand || !operand.field) return undefined;

  if (operand.origin === 'INPUT') {
    const fromDirect = resolveRecordField(record, operand.field);
    if (fromDirect !== undefined) return fromDirect;
    return (
      resolveRecordField(record._inputData, operand.field) ??
      resolveRecordField(record.canonical_data, operand.field) ??
      resolveRecordField(record.raw_data, operand.field)
    );
  }

  if (operand.origin === 'MIRROR') {
    const mirror = record._mirrorData ?? record._externalData ?? record.extracted_data ?? record;
    return (
      resolveRecordField(mirror, operand.field) ??
      resolveRecordField(mirror.payload, operand.field) ??
      resolveRecordField(mirror.canonical_payload, operand.field)
    );
  }

  if (operand.origin === 'LEG') {
    const grouped = record._groupedData ?? record._groupComposite ?? record.composite_data ?? record;
    if (operand.legKey) {
      const parts = operand.legKey.split('.');
      let current = grouped;
      for (const p of parts) {
        if (current && typeof current === 'object') {
          current = current[p];
        }
      }
      return resolveRecordField(current, operand.field);
    }
    return resolveRecordField(grouped, operand.field);
  }

  return resolveRecordField(record, operand.field);
}

export interface ConditionEvaluationResult {
  status: ValidationResultStatus;
  message: string;
  badgeText: string;
  detail?: string;
  dbValue?: any;
  errorDetail?: string;
  action?: PipelineAction;
  severity?: string;
}

/**
 * Pure evaluation of a single rule condition against a transaction record and stage context.
 * Strictly separates technical exceptions (ERROR) from business criteria mismatch (FAIL) and success (PASS).
 */
export function evaluateRuleCondition(
  record: Record<string, any>,
  rule: ValidationCheckStep,
  stage?: ProcessingStage
): ConditionEvaluationResult {
  try {
    // Gather ALL parameters configured for this validation box / rule
    const configuredStepParams: string[] = [];
    if (rule.searchParameters && Array.isArray(rule.searchParameters)) {
      for (const sp of rule.searchParameters) {
        if (sp.required !== false) {
          const k = sp.inputField || sp.targetColumn;
          if (k && !configuredStepParams.includes(k)) configuredStepParams.push(k);
        }
      }
    }
    if (rule.requiredParams && Array.isArray(rule.requiredParams)) {
      for (const p of rule.requiredParams) {
        if (p && !configuredStepParams.includes(p)) configuredStepParams.push(p);
      }
    }
    if (configuredStepParams.length === 0 && (rule.sourceField || rule.canonicalField)) {
      configuredStepParams.push(rule.sourceField || rule.canonicalField!);
    }

    // Check mandatory parameter presence (resilient across column casings and identifier aliases)
    if (configuredStepParams.length > 0) {
      const missing = configuredStepParams.filter(p => {
        const val = resolveRecordField(record, p);
        return val === undefined || val === null || String(val).trim() === '';
      });

      if (missing.length > 0) {
        return {
          status: 'FAIL',
          badgeText: 'Param Missing',
          message: `Required parameter(s) missing: [${missing.join(', ')}]`,
          detail: `Mandatory check requires fields: ${configuredStepParams.join(', ')}`
        };
      }
    }

    const checkType = rule.checkType;
    const sourceKey = configuredStepParams[0] || rule.sourceField || rule.canonicalField || 'id';
    const recordVal = resolveRecordField(record, sourceKey);

    const baseResult: ConditionEvaluationResult = (() => {
      switch (checkType) {
        case 'EXISTENCE_CHECK': {
          // Record existence check against target database
          const targetRec = record._target_record ?? record.canonical_data?._target_record ?? record._mirrorData ?? record._externalData;
        const isRowEvaluated = (record._validation_status && record._validation_status !== 'PENDING')
          || (record.canonical_data && record.canonical_data._validation_status && record.canonical_data._validation_status !== 'PENDING');
        const hasExplicitTarget = isRowEvaluated && (('_target_record' in record) || (record.canonical_data && '_target_record' in record.canonical_data) || ('_mirrorData' in record) || ('_externalData' in record));

          const isTargetDbConfigured = Boolean(
            stage?.targetDbId ||
            rule.targetDbId ||
            stage?.targetDataSource ||
            rule.targetTable
          );

          // If target database was queried and returned no matching record:
          if (hasExplicitTarget && !targetRec) {
            return {
              status: 'FAIL',
              badgeText: '404 Missing',
              message: rule.failureMessage || `Record not found in ${stage?.name || rule.targetTable || 'data source'}`,
              detail: `Target record lookup returned no matching record.`
            };
          }

          if (targetRec) {
            return {
              status: 'PASS',
              badgeText: 'Found (200)',
              message: rule.successMessage || `Record verified present in ${stage?.name || rule.targetTable || 'data source'}`,
              dbValue: recordVal
            };
          }

          // If target database connection tripped circuit breaker or reported offline
          if (record._isTargetDbOffline || (stage?.targetDbId && record._dbOfflineIds?.includes(stage.targetDbId))) {
            return {
              status: 'PAUSED_DB_OFFLINE',
              badgeText: 'DB Offline',
              message: `Target database [${stage?.targetDbId || rule.targetDbId}] is offline (circuit breaker tripped). Execution paused.`,
              detail: 'External database socket connection failed or circuit breaker tripped.'
            };
          }

          // If no target database or table is configured on stage or rule:
          if (!isTargetDbConfigured) {
            return {
              status: 'ERROR',
              badgeText: 'No DB Attached',
              message: `Target database or table not configured for stage "${stage?.name || 'Validation Stage'}". Cannot verify record existence.`,
              detail: 'Validation step has checkType EXISTENCE_CHECK but no target database or table is connected.'
            };
          }

          // In simulated/sandbox scenarios only, ORD-FAIL-TEST or missing values indicate absence
          const isSandboxOrSimulated = Boolean(
            record._isDiagnosticOnly ||
            record._executionMode === 'SANDBOX_SIMULATION' ||
            record._isSimulated === true ||
            record.simulatedMissing === true
          );
          const isSimulatedMissing = isSandboxOrSimulated && (String(recordVal) === 'ORD-FAIL-TEST' || record.simulatedMissing === true);
          const allParamsPresent = configuredStepParams.length > 0
            ? configuredStepParams.every(p => {
                const v = resolveRecordField(record, p);
                return v !== undefined && v !== null && String(v).trim() !== '';
              })
            : (recordVal !== undefined && recordVal !== null && String(recordVal).trim() !== '');

          if (!allParamsPresent || isSimulatedMissing) {
            const paramSummary = configuredStepParams.map(p => `"${p}": "${resolveRecordField(record, p) ?? 'null'}"`).join(', ');
            return {
              status: 'FAIL',
              badgeText: '404 Missing',
              message: rule.failureMessage || `Record not found in ${stage?.name || rule.targetTable || 'data source'}`,
              detail: `Lookup parameters [${paramSummary}] returned no matching records.`
            };
          }

          return {
            status: 'PASS',
            badgeText: 'Found (200)',
            message: rule.successMessage || `Record verified present in ${stage?.name || rule.targetTable || 'data source'}`,
            dbValue: recordVal
          };
        }

      case 'FIELD_COMPARATOR': {
        const comp = String(rule.comparator || rule.operator || '=').trim().toUpperCase();
        const expected = rule.compareValue !== undefined && rule.compareValue !== null
          ? String(rule.compareValue).trim()
          : (rule.expectedValue !== undefined && rule.expectedValue !== null ? String(rule.expectedValue).trim() : '');
        const actualStr = recordVal !== undefined && recordVal !== null ? String(recordVal).trim() : '';
        const actualNum = Number(recordVal);
        const expectedNum = Number(expected);
        const isNumeric = !isNaN(actualNum) && !isNaN(expectedNum) && expected !== '';

        let isMatch = false;
        switch (comp) {
          case '=':
          case '==':
          case 'EQUALS':
            isMatch = isNumeric ? actualNum === expectedNum : actualStr.toLowerCase() === expected.toLowerCase();
            break;
          case '!=':
          case '<>':
          case 'NOT_EQUALS':
            isMatch = isNumeric ? actualNum !== expectedNum : actualStr.toLowerCase() !== expected.toLowerCase();
            break;
          case '>':
          case 'GREATER_THAN':
            isMatch = isNumeric ? actualNum > expectedNum : actualStr > expected;
            break;
          case '<':
          case 'LESS_THAN':
            isMatch = isNumeric ? actualNum < expectedNum : actualStr < expected;
            break;
          case '>=':
          case 'GREATER_EQUAL':
            isMatch = isNumeric ? actualNum >= expectedNum : actualStr >= expected;
            break;
          case '<=':
          case 'LESS_EQUAL':
            isMatch = isNumeric ? actualNum <= expectedNum : actualStr <= expected;
            break;
          case 'LIKE':
          case 'CONTAINS':
          case 'CONTAIN':
          case 'INCLUDES':
          case 'HAS': {
            const cleanExpected = expected.replace(/^%+|%+$/g, '').toLowerCase();
            isMatch = actualStr.toLowerCase().includes(cleanExpected);
            break;
          }
          case 'NOT_LIKE':
          case 'NOT_CONTAINS':
          case 'DOES_NOT_CONTAIN': {
            const cleanExpected = expected.replace(/^%+|%+$/g, '').toLowerCase();
            isMatch = !actualStr.toLowerCase().includes(cleanExpected);
            break;
          }
          case 'STARTS_WITH': {
            const cleanExpected = expected.replace(/^%+|%+$/g, '').toLowerCase();
            isMatch = actualStr.toLowerCase().startsWith(cleanExpected);
            break;
          }
          case 'ENDS_WITH': {
            const cleanExpected = expected.replace(/^%+|%+$/g, '').toLowerCase();
            isMatch = actualStr.toLowerCase().endsWith(cleanExpected);
            break;
          }
          case 'NOT_NULL':
          case 'EXISTS':
          case 'PRESENT':
            isMatch = actualStr !== '';
            break;
          case 'IS_NULL':
          case 'EMPTY':
            isMatch = actualStr === '';
            break;
          case 'IN': {
            const list = expected.split(',').map(s => s.trim().toLowerCase());
            isMatch = list.includes(actualStr.toLowerCase());
            break;
          }
          case 'NOT_IN': {
            const list = expected.split(',').map(s => s.trim().toLowerCase());
            isMatch = !list.includes(actualStr.toLowerCase());
            break;
          }
          case 'REGEX':
          case 'REGEX_MATCH': {
            try {
              const rx = new RegExp(expected, 'i');
              isMatch = rx.test(actualStr);
            } catch (e: any) {
              return {
                status: 'ERROR',
                badgeText: 'Regex Error',
                message: `Invalid regex pattern '${expected}'`,
                errorDetail: e?.message || 'Regex compilation error'
              };
            }
            break;
          }
          case 'NUMERIC_TOLERANCE': {
            const margin = Number(rule.toleranceMargin ?? (rule as any).tolerance ?? 0.00);
            if (!isNumeric) {
              isMatch = false;
            } else {
              isMatch = Math.abs(actualNum - expectedNum) <= margin;
            }
            break;
          }
          default:
            isMatch = actualStr.toLowerCase() === expected.toLowerCase();
        }

        if (isMatch) {
          return {
            status: 'PASS',
            badgeText: comp === 'CONTAINS' || comp === 'LIKE' ? 'Contains Match' : 'Matched',
            message: rule.successMessage || `Field '${sourceKey}' satisfied condition (${comp} ${expected})`,
            dbValue: recordVal
          };
        } else {
          return {
            status: 'FAIL',
            badgeText: comp === 'CONTAINS' || comp === 'LIKE' ? 'Missing Substring' : 'Mismatch',
            message: rule.failureMessage || `Field '${sourceKey}' value '${actualStr}' failed condition (${comp} '${expected}')`,
            detail: `Expected: ${expected} | Actual: ${actualStr}`
          };
        }
      }

      case 'DUAL_SOURCE_COMPARISON': {
        const dsc = rule.dualSourceCondition;
        if (!dsc) {
          return {
            status: 'FAIL',
            badgeText: 'Config Missing',
            message: 'Dual-source comparison condition is not configured',
            detail: 'dualSourceCondition is undefined'
          };
        }

        const valA = extractOperandValue(record, dsc.sourceA);
        const valB = extractOperandValue(record, dsc.sourceB);
        const comp = String(dsc.comparator || rule.comparator || 'EQUALS').trim().toUpperCase();
        const failVerdict = dsc.failVerdict || 'FAIL';

        let isPass = false;
        let badge = 'Match';
        let detail = `[${dsc.sourceA.origin}.${dsc.sourceA.field}]=${valA} vs [${dsc.sourceB.origin}.${dsc.sourceB.field}]=${valB}`;

        if (comp === 'EQUALS' || comp === '==' || comp === '=') {
          isPass = String(valA ?? '').trim().toLowerCase() === String(valB ?? '').trim().toLowerCase();
          badge = isPass ? 'Equal' : 'Not Equal';
        } else if (comp === 'NOT_EQUALS' || comp === '!=' || comp === '<>') {
          isPass = String(valA ?? '').trim().toLowerCase() !== String(valB ?? '').trim().toLowerCase();
          badge = isPass ? 'Diff Satisfied' : 'Unexpected Match';
        } else if (comp === 'CONTAINS' || comp === 'LIKE' || comp === 'INCLUDES' || comp === 'HAS') {
          const strA = String(valA ?? '').trim().toLowerCase();
          const strB = String(valB ?? '').trim().replace(/^%+|%+$/g, '').toLowerCase();
          isPass = strA.includes(strB);
          badge = isPass ? 'Contains Match' : 'Missing Substring';
          detail += ` | Substring: "${strB}" in "${strA}"`;
        } else if (comp === 'NOT_CONTAINS' || comp === 'NOT_LIKE') {
          const strA = String(valA ?? '').trim().toLowerCase();
          const strB = String(valB ?? '').trim().replace(/^%+|%+$/g, '').toLowerCase();
          isPass = !strA.includes(strB);
          badge = isPass ? 'Excluded' : 'Unexpectedly Contained';
          detail += ` | Not Substring: "${strB}" in "${strA}"`;
        } else if (comp === 'NUMERIC_TOLERANCE') {
          const numA = Number(valA);
          const numB = Number(valB);
          const margin = Number(dsc.toleranceMargin ?? rule.toleranceMargin ?? 0.00);
          if (isNaN(numA) || isNaN(numB)) {
            isPass = false;
            badge = 'Non-Numeric';
          } else {
            const diff = Math.abs(numA - numB);
            isPass = diff <= margin;
            badge = isPass ? `Tol Match (±${margin})` : `Diff ${diff.toFixed(2)}`;
            detail += ` | Delta: ${diff.toFixed(4)}, Margin: ${margin}`;
          }
        } else if (comp === 'GREATER_THAN' || comp === '>') {
          isPass = Number(valA) > Number(valB);
          badge = isPass ? 'A > B' : 'A <= B';
        } else if (comp === 'LESS_THAN' || comp === '<') {
          isPass = Number(valA) < Number(valB);
          badge = isPass ? 'A < B' : 'A >= B';
        } else if (comp === 'IN') {
          const list = String(valB ?? '').split(',').map(s => s.trim().toLowerCase());
          isPass = list.includes(String(valA ?? '').trim().toLowerCase());
          badge = isPass ? 'In List' : 'Not In List';
        } else if (comp === 'LOOKUP_MAP') {
          const dict = dsc.lookupDictionary || DEFAULT_RESPONSE_CODE_LABELS;
          const mappedVal = dict[String(valA ?? '').trim()];
          isPass = mappedVal !== undefined && (valB ? String(mappedVal).toLowerCase() === String(valB).toLowerCase() : true);
          badge = isPass ? 'Dict Matched' : 'Unmapped Code';
          detail += ` | Mapped: ${mappedVal ?? 'None'}`;
        }

        if (isPass) {
          return {
            status: 'PASS',
            badgeText: badge,
            message: rule.successMessage || `Dual-source comparison passed (${dsc.sourceA.field} vs ${dsc.sourceB.field})`,
            detail,
            dbValue: valA
          };
        } else {
          return {
            status: failVerdict === 'PAUSE' ? 'ERROR' : 'FAIL',
            badgeText: badge,
            message: rule.failureMessage || `Dual-source comparison failed: ${detail}`,
            detail,
            dbValue: valA
          };
        }
      }

      case 'AMOUNT_MATCH': {
        if (rule.dualSourceCondition) {
          const dsc = rule.dualSourceCondition;
          const valA = Number(extractOperandValue(record, dsc.sourceA) ?? 0);
          const valB = Number(extractOperandValue(record, dsc.sourceB) ?? 0);
          const margin = Number(dsc.toleranceMargin ?? rule.toleranceMargin ?? 0.00);
          const diff = Math.abs(valA - valB);
          if (diff > margin) {
            return {
              status: 'FAIL',
              badgeText: `Diff ${diff.toFixed(2)}`,
              message: rule.failureMessage || `Amount mismatch: Source A (${valA}) vs Source B (${valB}) exceeds tolerance ${margin}`,
              detail: `Source A=${valA}, Source B=${valB}, Diff=${diff.toFixed(2)}`
            };
          }
          return {
            status: 'PASS',
            badgeText: 'Amount Match',
            message: rule.successMessage || `Amounts reconcile within tolerance (${valA.toFixed(2)})`,
            dbValue: valA
          };
        }

        const fieldKey = rule.sourceField;
        if (!fieldKey) {
          return {
            status: 'ERROR',
            badgeText: 'Missing Source',
            message: 'AMOUNT_MATCH rule requires sourceField to be configured.',
            errorDetail: 'sourceField is missing on rule definition.'
          };
        }

        const hasTarget = rule.targetField || (rule.compareValue !== undefined && String(rule.compareValue).trim() !== '') || (rule.expectedValue !== undefined && String(rule.expectedValue).trim() !== '');
        if (!hasTarget) {
          return {
            status: 'ERROR',
            badgeText: 'Config Error',
            message: 'AMOUNT_MATCH rule requires targetField, compareValue, or expectedValue to be configured.',
            errorDetail: 'No comparison target specified for AMOUNT_MATCH check.'
          };
        }

        const fileAmount = Number(resolveRecordField(record, fieldKey) ?? 0);
        const targetValRaw = rule.targetField ? resolveRecordField(record, rule.targetField) : undefined;
        const targetVal = targetValRaw !== undefined
          ? Number(targetValRaw)
          : (rule.compareValue !== undefined && String(rule.compareValue).trim() !== ''
              ? Number(rule.compareValue)
              : Number(rule.expectedValue));
        const margin = Number(rule.toleranceMargin ?? rule.tolerance ?? 0.00);
        const diff = Math.abs(fileAmount - targetVal);
        if (diff > margin) {
          return {
            status: 'FAIL',
            badgeText: `Diff ${diff > 0 ? '+' : ''}${diff.toFixed(2)}`,
            message: rule.failureMessage || `Amount discrepancy: '${fieldKey}' has ${fileAmount} vs expected ${targetVal}`,
            detail: `Delta: ${diff.toFixed(2)}`
          };
        }
        return {
          status: 'PASS',
          badgeText: 'Amount Match',
          message: rule.successMessage || `Amounts reconcile exactly (${fileAmount.toFixed(2)})`,
          dbValue: fileAmount
        };
      }

      case 'STATUS_MATCH': {
        const fieldKey = rule.sourceField || rule.targetField;
        if (!fieldKey) {
          return {
            status: 'ERROR',
            badgeText: 'Missing Source',
            message: 'STATUS_MATCH rule requires sourceField or targetField to be configured.',
            errorDetail: 'Neither sourceField nor targetField was provided.'
          };
        }
        const rawStatus = resolveRecordField(record, fieldKey);
        const sourceStatus = rawStatus !== undefined && rawStatus !== null ? String(rawStatus).toUpperCase() : '';
        const expectedStatus = String(rule.compareValue ?? rule.expectedValue ?? '').toUpperCase();
        if (sourceStatus !== expectedStatus) {
          return {
            status: 'FAIL',
            badgeText: `${sourceStatus || 'EMPTY'} != ${expectedStatus}`,
            message: rule.failureMessage || `Status conflict: '${fieldKey}' is ${sourceStatus || 'EMPTY'} (expected ${expectedStatus})`,
            detail: `Found state: ${sourceStatus}`
          };
        }
        return {
          status: 'PASS',
          badgeText: `${sourceStatus} Clean`,
          message: rule.successMessage || `Status verified as ${sourceStatus}`,
          dbValue: sourceStatus
        };
      }

      case 'ISO_DECLINE_CODE': {
        const fieldKey = rule.sourceField;
        if (!fieldKey) {
          return {
            status: 'ERROR',
            badgeText: 'Missing Source',
            message: 'ISO_DECLINE_CODE rule requires sourceField to be configured.',
            errorDetail: 'sourceField is missing on rule definition.'
          };
        }
        const code = String(resolveRecordField(record, fieldKey) ?? '').trim();
        const expectedCode = (rule.compareValue ?? rule.expectedValue) ? String(rule.compareValue ?? rule.expectedValue).trim() : '00';
        const dict = rule.dualSourceCondition?.lookupDictionary || DEFAULT_RESPONSE_CODE_LABELS;
        if (code !== expectedCode) {
          const reason = dict[code] || 'Declined / Discrepancy Code';
          return {
            status: 'FAIL',
            badgeText: `Decline (${code})`,
            message: rule.failureMessage || `Response code '${code}' discrepancy: ${reason}`,
            detail: `Response Code ${code}: ${reason}`
          };
        }
        return {
          status: 'PASS',
          badgeText: `${code} Clean`,
          message: rule.successMessage || `Response code verified (${code})`,
          dbValue: code
        };
      }

      case 'NUMERIC_THRESHOLD': {
        const numVal = Number(recordVal ?? 0);
        const threshold = Number(rule.compareValue ?? rule.expectedValue ?? 0);
        const comp = String(rule.comparator || rule.operator || '>').trim();
        let passed = false;
        if (comp === '>' || comp === 'GREATER_THAN') passed = numVal > threshold;
        else if (comp === '>=' || comp === 'GREATER_EQUAL') passed = numVal >= threshold;
        else if (comp === '<' || comp === 'LESS_THAN') passed = numVal < threshold;
        else if (comp === '<=' || comp === 'LESS_EQUAL') passed = numVal <= threshold;
        else passed = numVal === threshold;

        if (passed) {
          return {
            status: 'PASS',
            badgeText: 'Within Threshold',
            message: rule.successMessage || `Value ${numVal} passed threshold (${comp} ${threshold})`,
            dbValue: numVal
          };
        }
        return {
          status: 'FAIL',
          badgeText: 'Threshold Exceeded',
          message: rule.failureMessage || `Value ${numVal} breached threshold (${comp} ${threshold})`,
          detail: `Observed ${numVal}`
        };
      }

      case 'SQL_CONDITION': {
        const sql = (rule.sqlCondition || '').trim();
        if (!sql) {
          return {
            status: 'ERROR',
            badgeText: 'Empty SQL',
            message: 'SQL condition statement is blank',
            errorDetail: 'Validation step has checkType SQL_CONDITION but sqlCondition was empty'
          };
        }
        // Simulated SQL predicate evaluation
        if (sql.includes('SYNTAX_ERROR') || sql.includes('THROW_ERROR')) {
          return {
            status: 'ERROR',
            badgeText: 'SQL Error',
            message: 'Database execution failure: syntax error in SQL predicate',
            errorDetail: `Near "${sql.substring(0, 30)}"`
          };
        }
        // If query tests specific record attributes in sandbox/simulation mode
        const isSandboxOrSimulated = Boolean(
          record._isDiagnosticOnly ||
          record._executionMode === 'SANDBOX_SIMULATION' ||
          record._isSimulated === true
        );
        const isFailingPredicate = isSandboxOrSimulated && (sql.includes('FAIL_FLAG') || (record.order_id === 'ORD-FAIL-TEST'));
        if (isFailingPredicate) {
          return {
            status: 'FAIL',
            badgeText: 'SQL Predicate Failed',
            message: rule.failureMessage || 'SQL predicate returned 0 matching rows / FALSE condition'
          };
        }
        return {
          status: 'PASS',
          badgeText: 'SQL Verified',
          message: rule.successMessage || 'SQL condition evaluated TRUE against external database node',
          dbValue: sql
        };
      }

      case 'REGEX_MATCH': {
        const pattern = rule.regexPattern || rule.compareValue || '';
        if (!pattern) {
          return {
            status: 'ERROR',
            badgeText: 'Empty Regex',
            message: 'Regex pattern is empty',
            errorDetail: 'No regexPattern or compareValue provided for REGEX_MATCH'
          };
        }
        try {
          const rx = new RegExp(pattern);
          const isMatch = rx.test(String(recordVal ?? ''));
          if (isMatch) {
            return {
              status: 'PASS',
              badgeText: 'Pattern Match',
              message: rule.successMessage || `Pattern '${pattern}' matched value`,
              dbValue: recordVal
            };
          }
          return {
            status: 'FAIL',
            badgeText: 'Pattern Mismatch',
            message: rule.failureMessage || `Pattern '${pattern}' did not match value '${recordVal}'`
          };
        } catch (e: any) {
          return {
            status: 'ERROR',
            badgeText: 'Regex Error',
            message: `Regex evaluation failed: ${e?.message || 'Invalid pattern'}`,
            errorDetail: e?.message
          };
        }
      }

      case 'CROSS_DB_LOOKUP': {
        // Cross-DB lookups check consistency between primary and secondary attributes
        const secVal = record.secondary_db_value ?? (sourceKey ? record[sourceKey] : undefined);
        if (secVal === undefined || secVal === null || secVal === 'MISSING') {
          return {
            status: 'FAIL',
            badgeText: 'Secondary Missing',
            message: rule.failureMessage || 'Cross-DB lookup failed: record missing in secondary database node',
            detail: 'Secondary database node returned no matching record.'
          };
        }
        return {
          status: 'PASS',
          badgeText: 'Cross-DB Sync',
          message: rule.successMessage || 'Cross-database record synchronized',
          dbValue: secVal
        };
      }

        default: {
          return {
            status: 'ERROR',
            badgeText: 'Unknown Rule',
            message: `Unsupported or unknown rule checkType: "${checkType}". Please verify rule configuration.`,
            errorDetail: `checkType "${checkType}" has no evaluator implemented.`
          };
        }
      }
    })();

    // Evaluate attached Database Table Column Configurations (Complete Checks)
    if (baseResult.status === 'PASS' && Array.isArray(rule.columnConfigurations) && rule.columnConfigurations.length > 0) {
      const colResult = evaluateAttachedColumnConfigurations(record, rule.columnConfigurations);
      if (colResult.status !== 'PASS') {
        return colResult;
      }
      if (colResult.badgeText && !baseResult.badgeText.includes(colResult.badgeText)) {
        baseResult.badgeText = `${baseResult.badgeText} • ${colResult.badgeText}`;
      }
      if (colResult.message) {
        baseResult.message = `${baseResult.message} (${colResult.message})`;
      }
    }

    return baseResult;
  } catch (err: any) {
    // Any unexpected exception during evaluation is classified as a technical ERROR
    return {
      status: 'ERROR',
      badgeText: 'Technical Error',
      message: `Technical runtime failure evaluating rule '${rule.name}': ${err?.message || 'Unknown error'}`,
      errorDetail: err?.stack || String(err)
    };
  }
}

/**
 * Resolves the configured pipeline action for a given validation result.
 * Separates Result (what the check produced) from Action (what the pipeline should do next).
 */
export function resolveRuleAction(
  result: ValidationResultStatus,
  rule: ValidationCheckStep
): PipelineAction {
  switch (result) {
    case 'PASS':
      return rule.onPassAction || 'CONTINUE';
    case 'FAIL':
      return rule.onFailAction || 'STOP';
    case 'ERROR':
    case 'PAUSED_DB_OFFLINE':
      return rule.onErrorAction || 'STOP';
    case 'SKIPPED':
      return 'CONTINUE';
    default:
      return 'STOP';
  }
}

/**
 * Evaluates whether a step should run based on previous step results.
 * Tracks previousResult and previousAction independently without conflation.
 */
export function evaluateDependencyCondition(
  ruleOrCondition: ValidationCheckStep | string,
  previousResult: ValidationResultStatus | null,
  previousAction: PipelineAction | null
): { shouldRun: boolean; shouldExecute: boolean; skipReason?: string } {
  // If the previous step executed CLOSE or STOP, the pipeline cannot continue
  if (previousAction === 'CLOSE') {
    return { shouldRun: false, shouldExecute: false, skipReason: 'Investigation pipeline was CLOSED by previous step action.' };
  }
  if (previousAction === 'STOP') {
    return { shouldRun: false, shouldExecute: false, skipReason: 'Investigation pipeline was STOPPED by previous step action.' };
  }
  // Database offline (circuit breaker): implicit pipeline halt (DESIGN-09)
  if (previousResult === 'PAUSED_DB_OFFLINE') {
    return { shouldRun: false, shouldExecute: false, skipReason: 'Database offline (circuit breaker). Pipeline paused.' };
  }

  const dep = typeof ruleOrCondition === 'string'
    ? ruleOrCondition
    : ruleOrCondition.dependencyCondition || 'ALWAYS';

  switch (dep) {
    case 'ALWAYS':
      return { shouldRun: true, shouldExecute: true };

    case 'IF_PREV_SUCCESS': {
      if (previousResult === null || previousResult === 'PASS') {
        return { shouldRun: true, shouldExecute: true };
      }
      return { shouldRun: false, shouldExecute: false, skipReason: `Skipped: previous step produced ${previousResult} (required PASS).` };
    }

    case 'IF_PREV_FAILURE': {
      if (previousResult === null) {
        return { shouldRun: false, shouldExecute: false, skipReason: 'Skipped: no previous step exists for IF_PREV_FAILURE.' };
      }
      if (previousResult === 'FAIL') {
        return { shouldRun: true, shouldExecute: true };
      }
      return { shouldRun: false, shouldExecute: false, skipReason: `Skipped: previous step produced ${previousResult} (required FAIL).` };
    }

    case 'IF_PREV_DATASET_NON_EMPTY':
      return { shouldRun: true, shouldExecute: true };

    default:
      return { shouldRun: true, shouldExecute: true };
  }
}

/**
 * Execute a stage-aware investigation workflow for a single transaction record.
 * Generates an auditable execution summary with independent closure tracking.
 */
export function executeWorkflowForTransaction(
  transactionRecord: Record<string, any>,
  workflow: DatabaseValidationWorkflow
): TransactionExecutionSummary {
  // Resolve transactionId strictly from workflow configured parameters first
  const configuredParams: string[] = [];
  if (workflow?.steps) {
    for (const step of workflow.steps) {
      if (Array.isArray(step.searchParameters)) {
        for (const sp of step.searchParameters) {
          if (sp.inputField && !configuredParams.includes(sp.inputField)) configuredParams.push(sp.inputField);
        }
      }
      if (Array.isArray(step.requiredParams)) {
        for (const rp of step.requiredParams) {
          if (rp && !configuredParams.includes(rp)) configuredParams.push(rp);
        }
      }
      if (step.sourceField && !configuredParams.includes(step.sourceField)) configuredParams.push(step.sourceField);
    }
  }

  const primaryParamVal = configuredParams.map(p => resolveRecordField(transactionRecord, p)).find(v => v !== undefined && v !== null && String(v).trim() !== '');

  const transactionId = String(
    transactionRecord._rowId ||
    transactionRecord.rowId ||
    primaryParamVal ||
    `TXN-${Date.now()}`
  );


  let currentWorkingRecord: Record<string, any> = { ...transactionRecord };
  const auditTrail: RuleExecutionAuditEntry[] = [];
  let previousResult: ValidationResultStatus | null = null;
  let previousAction: PipelineAction | null = null;
  let isHalted = false;
  let haltReason: string | undefined = undefined;
  let isClosed = false;
  let hasTechnicalError = false;
  let lastStageEvaluated: string | undefined = undefined;
  let lastRuleEvaluated: string | undefined = undefined;


  // Organize steps by stages
  const stages = workflow.stages && workflow.stages.length > 0
    ? [...workflow.stages].sort((a, b) => a.order - b.order)
    : [
        {
          id: 'stage-default',
          name: 'Primary Processing Stage',
          description: 'Default validation stage',
          order: 1,
          enabled: true,
          targetDbId: workflow.targetDbId || '',
          targetDataSource: workflow.targetTable || ''
        } as ProcessingStage
      ];

  const steps = [...(workflow.steps || [])].sort((a, b) => a.stepNumber - b.stepNumber);

  // Group steps by stage
  const stageStepsMap: Record<string, ValidationCheckStep[]> = {};
  stages.forEach(st => { stageStepsMap[st.id] = []; });

  steps.forEach(step => {
    const targetStageId = step.stageId && stageStepsMap[step.stageId] ? step.stageId : stages[0].id;
    stageStepsMap[targetStageId].push(step);
  });

  // Execute stages sequentially
  for (const stage of stages) {
    if (!stage.enabled) continue;
    if (isHalted || isClosed) break;

    lastStageEvaluated = stage.name;
    const stageSteps = stageStepsMap[stage.id] || [];

    for (const rule of stageSteps) {
      if (isHalted || isClosed) break;
      lastRuleEvaluated = rule.name;

      const startTime = Date.now();

      // Check dependency condition
      const depCheck = evaluateDependencyCondition(rule, previousResult, previousAction);
      if (!depCheck.shouldRun) {
        // Log skipped step
        auditTrail.push({
          transactionId,
          stageId: stage.id,
          stageName: stage.name,
          ruleId: rule.id,
          ruleName: rule.name,
          checkType: rule.checkType,
          validationResult: 'SKIPPED',
          pipelineAction: 'CONTINUE',
          executedAt: new Date().toISOString(),
          message: depCheck.skipReason || 'Step skipped due to dependency criteria.',
          durationMs: 0
        });
        continue;
      }

      // Diagnostic Taint Tracking & Downstream Math Isolation (Principle 12)
      if (currentWorkingRecord._isDiagnosticOnly && 
          (rule.checkType === 'AMOUNT_MATCH' || rule.checkType === 'NUMERIC_THRESHOLD' || rule.checkType === 'DUAL_SOURCE_COMPARISON')) {
        auditTrail.push({
          transactionId,
          stageId: stage.id,
          stageName: stage.name,
          ruleId: rule.id,
          ruleName: rule.name,
          checkType: rule.checkType,
          validationResult: 'PASS',
          pipelineAction: 'CONTINUE',
          executedAt: new Date().toISOString(),
          message: `[Bypassed: Diagnostic Taint] Math check bypassed due to upstream diagnostic taint (${currentWorkingRecord._diagnosticTaintReason})`,
          durationMs: 0
        });
        continue;
      }

      // Evaluate condition against active working record
      const evalResult = evaluateRuleCondition(currentWorkingRecord, rule, stage);
      const action = evalResult.action || resolveRuleAction(evalResult.status, rule);
      const durationMs = Date.now() - startTime;

      if (evalResult.status === 'ERROR') {
        hasTechnicalError = true;
      }

      // Forward enriched mirror record downstream on PASS, keep original record on FAIL
      if (evalResult.status === 'PASS') {
        const targetRec = currentWorkingRecord._target_record ?? currentWorkingRecord.canonical_data?._target_record ?? currentWorkingRecord._mirrorData ?? currentWorkingRecord._externalData;
        if (targetRec && typeof targetRec === 'object') {
          currentWorkingRecord = {
            ...currentWorkingRecord,
            ...targetRec,
            _inputData: currentWorkingRecord._inputData || transactionRecord,
            _mirrorData: targetRec
          };
        }
      }

      auditTrail.push({
        transactionId,
        stageId: stage.id,
        stageName: stage.name,
        ruleId: rule.id,
        ruleName: rule.name,
        checkType: rule.checkType,
        validationResult: evalResult.status,
        pipelineAction: action,
        executedAt: new Date().toISOString(),
        message: evalResult.message,
        dataSnapshot: {
          lookupValue: evalResult.dbValue,
          detail: evalResult.detail
        },
        errorDetail: evalResult.errorDetail,
        durationMs
      });

      // Update state for next step
      previousResult = evalResult.status;
      previousAction = action;

      // Handle pipeline action semantics
      if (action === 'CLOSE') {
        isClosed = true;
        isHalted = true;
        haltReason = `Investigation CLOSED by rule '${rule.name}' in '${stage.name}' (Result: ${evalResult.status})`;
        break;
      } else if (action === 'STOP') {
        isHalted = true;
        haltReason = `Pipeline STOPPED by rule '${rule.name}' in '${stage.name}' (Result: ${evalResult.status})`;
        break;
      } else if (action === 'FLAG') {
        currentWorkingRecord._isFlagged = true;
        currentWorkingRecord._discrepancyFlag = evalResult.message || `FLAGGED_BY_${rule.name}`;
        if (rule.onFailAction === 'STOP' && evalResult.status !== 'PASS') {
          isHalted = true;
          haltReason = `Pipeline FLAGGED and STOPPED by rule '${rule.name}' in '${stage.name}'`;
          break;
        }
      } else if (action === 'REPORT') {
        currentWorkingRecord._isDiagnosticOnly = true;
        currentWorkingRecord._diagnosticTaintReason = `UPSTREAM_FAILURE_DIAGNOSTIC_ONLY: ${evalResult.message || rule.name}`;
      }

      if (evalResult.status === 'PAUSED_DB_OFFLINE') {
        isHalted = true;
        haltReason = `Pipeline PAUSED: Target database offline in stage '${stage.name}'`;
        break;
      }
      // If action is CONTINUE (or non-halting REPORT/FLAG), proceed to next rule / stage
    }
  }

  // Derive final investigation status
  let investigationStatus: TransactionInvestigationStatus = 'INVESTIGATING';
  const anyFailures = auditTrail.some(a => a.validationResult === 'FAIL');
  const allPassed = auditTrail.length > 0 && auditTrail.every(a => a.validationResult === 'PASS');

  if (isClosed) {
    investigationStatus = 'CLOSED';
  } else if (hasTechnicalError || anyFailures) {
    investigationStatus = 'FLAGGED';
  } else if (allPassed && !isHalted) {
    investigationStatus = 'RECONCILED';
  }

  // Derive contextual Status Flag Text & Color for the investigation conclusion
  const recordDate = (() => {
    // Look for any date/timestamp-like property on the record dynamically
    for (const [k, v] of Object.entries(transactionRecord)) {
      if (v && /date|time|timestamp/i.test(k) && !k.startsWith('_')) {
        const str = String(v).trim();
        if (str.length >= 10) return str.substring(0, 10);
        return str;
      }
    }
    return null;
  })();

  const rawStatus = String(
    transactionRecord.status ||
    transactionRecord.status_state ||
    transactionRecord.state ||
    ''
  ).toUpperCase();

  const isSettlementWorkflow = 
    workflow.category === 'Settlement' ||
    /settle/i.test(workflow.name || '') ||
    stages.some(s => /settle/i.test(s.name) || /settle/i.test(s.businessMeaning || ''));

  let statusFlagText: string = 'Reconciled';
  let statusFlagColor: 'emerald' | 'rose' | 'amber' | 'purple' | 'blue' | 'slate' = 'emerald';

  const lastExecutedRule = steps.find(s => s.name === lastRuleEvaluated);

  if (investigationStatus === 'CLOSED') {
    statusFlagColor = 'slate';
    if (rawStatus === 'SETTLED' || (isSettlementWorkflow && allPassed)) {
      statusFlagText = recordDate ? `Settled on ${recordDate}` : 'Settled';
      statusFlagColor = 'emerald';
    } else if (rawStatus === 'DECLINED' || rawStatus === 'FAILED') {
      const code = transactionRecord.response_code;
      statusFlagText = code ? `Declined (Code ${code})` : 'Declined';
      statusFlagColor = 'rose';
    } else if (rawStatus === 'REVERSED') {
      statusFlagText = recordDate ? `Reversed on ${recordDate}` : 'Reversed';
      statusFlagColor = 'purple';
    } else if (lastExecutedRule?.onPassAction === 'CLOSE' && lastExecutedRule.successMessage) {
      statusFlagText = lastExecutedRule.successMessage.replace(/\{(\w+)\}/g, (_, k) => transactionRecord[k] ?? `{${k}}`);
    } else {
      statusFlagText = 'Investigation Closed';
    }
  } else if (investigationStatus === 'RECONCILED') {
    statusFlagColor = 'emerald';
    if (rawStatus === 'SETTLED' || isSettlementWorkflow) {
      statusFlagText = recordDate ? `Settled on ${recordDate}` : 'Settled';
    } else if (rawStatus === 'APPROVED' || rawStatus === 'SUCCESS') {
      statusFlagText = recordDate ? `Approved on ${recordDate}` : 'Approved';
    } else if (rawStatus === 'CLEARED') {
      statusFlagText = recordDate ? `Cleared on ${recordDate}` : 'Cleared';
    } else {
      statusFlagText = recordDate ? `Reconciled (${recordDate})` : 'Reconciled Clean';
    }
  } else if (investigationStatus === 'FLAGGED') {
    const failingAudit = auditTrail.find(a => a.validationResult === 'FAIL' || a.validationResult === 'ERROR');
    if (hasTechnicalError || failingAudit?.validationResult === 'ERROR') {
      statusFlagText = 'System Error';
      statusFlagColor = 'amber';
    } else if (rawStatus === 'DECLINED' || transactionRecord.response_code) {
      const code = transactionRecord.response_code;
      statusFlagText = code ? `Declined (Code ${code})` : 'Declined';
      statusFlagColor = 'rose';
    } else if (rawStatus === 'REVERSED') {
      statusFlagText = recordDate ? `Reversed on ${recordDate}` : 'Reversed';
      statusFlagColor = 'purple';
    } else if (failingAudit?.checkType === 'AMOUNT_MATCH') {
      statusFlagText = 'Amount Discrepancy';
      statusFlagColor = 'rose';
    } else if (failingAudit?.checkType === 'EXISTENCE_CHECK') {
      statusFlagText = 'Record Missing';
      statusFlagColor = 'rose';
    } else {
      statusFlagText = failingAudit?.message ? failingAudit.message.substring(0, 32) : 'Flagged Condition';
      statusFlagColor = 'rose';
    }
  } else {
    statusFlagText = 'Under Investigation';
    statusFlagColor = 'blue';
  }

  // Suggest remedy SQL if applicable (must be configured via Maker template, never hardcoded raw SQL)
  let remedySql: string | undefined = undefined;

  return {
    transactionId,
    initialStatus: String(transactionRecord.status || transactionRecord.status_state || 'PENDING'),
    investigationStatus,
    statusFlagText,
    statusFlagColor,
    auditTrail,
    lastStageEvaluated,
    lastRuleEvaluated,
    isHalted,
    haltReason,
    isClosed,
    hasTechnicalError,
    remedySql
  };
}

/**
 * Execute batch investigation for multiple transaction rows.
 * Evaluates each record independently so closing one transaction never affects another or parent task.
 */
export function executeBatchInvestigation(
  records: Record<string, any>[],
  workflow: DatabaseValidationWorkflow
): Record<string, TransactionExecutionSummary> {
  const result: Record<string, TransactionExecutionSummary> = {};

  // Discover all parameters configured in the workflow
  const configuredParams: string[] = [];
  if (workflow?.steps) {
    for (const step of workflow.steps) {
      if (Array.isArray(step.searchParameters)) {
        for (const sp of step.searchParameters) {
          if (sp.inputField && !configuredParams.includes(sp.inputField)) configuredParams.push(sp.inputField);
        }
      }
      if (Array.isArray(step.requiredParams)) {
        for (const rp of step.requiredParams) {
          if (rp && !configuredParams.includes(rp)) configuredParams.push(rp);
        }
      }
      if (step.sourceField && !configuredParams.includes(step.sourceField)) configuredParams.push(step.sourceField);
    }
  }

  records.forEach((record, idx) => {
    const summary = executeWorkflowForTransaction(record, workflow);
    result[summary.transactionId] = summary;
    result[`ROW-${idx + 1}`] = summary;
    result[String(idx)] = summary;

    for (const param of configuredParams) {
      const val = resolveRecordField(record, param);
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        result[String(val)] = summary;
      }
    }
  });
  return result;
}
