/**
 * Dynamic Rule-to-SQL Predicate Compiler
 * Compiles declarative ValidationCheckStep rules into native set-based PostgreSQL expressions.
 * Ensures rule configuration updates made in the UI take effect immediately in database execution.
 */

import { ValidationCheckStep } from '../types.js';

export interface CompiledBlockSql {
  statusCaseSql: string;
  actionCaseSql: string;
  detailsJsonSql: string;
  fullUpdateSql: string;
}

function sanitizeCol(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function resolveColExpr(targetCol: string, mirrorColPrefix = 'm', validColumns?: string[]): string {
  if (validColumns && validColumns.length > 0) {
    if (validColumns.includes(targetCol)) {
      return `${mirrorColPrefix}.${targetCol}`;
    }
    if (validColumns.includes('payload')) {
      return `(${mirrorColPrefix}.payload->>'${targetCol}')`;
    }
  }
  return `${mirrorColPrefix}.${targetCol}`;
}

export function resolveOperandSqlExpr(
  operand: { origin: string; field: string; legKey?: string },
  mirrorColPrefix = 'm',
  inputColPrefix = 't',
  validColumns?: string[]
): string {
  const col = sanitizeCol(operand.field);
  if (operand.origin === 'INPUT') {
    return `COALESCE((${inputColPrefix}.canonical_data->>'${col}'), (${inputColPrefix}.raw_data->>'${col}'), (${mirrorColPrefix}.payload->>'${col}'))`;
  }
  if (operand.origin === 'LEG' && operand.legKey) {
    const parts = operand.legKey.split('.').map(p => `'${p.trim().replace(/'/g, "''")}'`);
    return `(${mirrorColPrefix}.payload #>> ARRAY[${parts.join(', ')}, '${col}'])`;
  }
  return resolveColExpr(col, mirrorColPrefix, validColumns);
}

export const ruleSqlCompiler = {
  /**
   * Compiles an individual rule step into a SQL boolean condition expression.
   */
  compileStepCondition(
    rule: ValidationCheckStep,
    mirrorColPrefix = 'm',
    validColumns?: string[],
    inputColPrefix = 't'
  ): string {
    const checkType = rule.checkType;

    let baseSql = 'TRUE';
    if (checkType === 'DUAL_SOURCE_COMPARISON' && rule.dualSourceCondition) {
      const dsc = rule.dualSourceCondition;
      const exprA = resolveOperandSqlExpr(dsc.sourceA, mirrorColPrefix, inputColPrefix, validColumns);
      const exprB = resolveOperandSqlExpr(dsc.sourceB, mirrorColPrefix, inputColPrefix, validColumns);
      const comp = dsc.comparator || 'EQUALS';
      const margin = Number(dsc.toleranceMargin ?? rule.toleranceMargin ?? 0.00);

      if (comp === 'EQUALS' || comp === '==' || comp === '=') {
        baseSql = `LOWER(COALESCE(${exprA}::text, '')) = LOWER(COALESCE(${exprB}::text, ''))`;
      } else if (comp === 'NOT_EQUALS' || comp === '!=' || comp === '<>') {
        baseSql = `LOWER(COALESCE(${exprA}::text, '')) != LOWER(COALESCE(${exprB}::text, ''))`;
      } else if (comp === 'CONTAINS' || comp === 'LIKE' || comp === 'INCLUDES') {
        baseSql = `LOWER(COALESCE(${exprA}::text, '')) LIKE '%' || LOWER(COALESCE(${exprB}::text, '')) || '%'`;
      } else if (comp === 'NOT_CONTAINS' || comp === 'NOT_LIKE') {
        baseSql = `LOWER(COALESCE(${exprA}::text, '')) NOT LIKE '%' || LOWER(COALESCE(${exprB}::text, '')) || '%'`;
      } else if (comp === 'NUMERIC_TOLERANCE') {
        baseSql = `ABS(COALESCE((${exprA})::numeric, 0) - COALESCE((${exprB})::numeric, 0)) <= ${margin}`;
      } else if (comp === 'GREATER_THAN' || comp === '>') {
        baseSql = `COALESCE((${exprA})::numeric, 0) > COALESCE((${exprB})::numeric, 0)`;
      } else if (comp === 'LESS_THAN' || comp === '<') {
        baseSql = `COALESCE((${exprA})::numeric, 0) < COALESCE((${exprB})::numeric, 0)`;
      } else if (comp === 'IN') {
        baseSql = `LOWER(COALESCE(${exprA}::text, '')) = ANY(string_to_array(LOWER(COALESCE(${exprB}::text, '')), ','))`;
      } else if (comp === 'LOOKUP_MAP' && dsc.lookupDictionary) {
        const whenClauses = Object.entries(dsc.lookupDictionary)
          .map(([k, v]) => `WHEN '${k.replace(/'/g, "''")}' THEN '${v.replace(/'/g, "''")}'`)
          .join(' ');
        const caseExpr = `CASE ${exprA}::text ${whenClauses} ELSE ${exprA}::text END`;
        baseSql = `LOWER(${caseExpr}) = LOWER(COALESCE(${exprB}::text, ''))`;
      } else {
        baseSql = `LOWER(COALESCE(${exprA}::text, '')) = LOWER(COALESCE(${exprB}::text, ''))`;
      }
    } else {
      const targetCol = sanitizeCol(rule.targetField || rule.sourceField || '');
      if (!targetCol && checkType !== 'SQL_CONDITION' && checkType !== 'EXISTENCE_CHECK') {
        baseSql = 'TRUE';
      } else {
        const colExpr = resolveColExpr(targetCol, mirrorColPrefix, validColumns);

        switch (checkType) {
          case 'EXISTENCE_CHECK':
            baseSql = `${mirrorColPrefix}._mirror_id IS NOT NULL`;
            break;

          case 'AMOUNT_MATCH': {
            const margin = Number(rule.toleranceMargin ?? rule.tolerance ?? 0.00);
            if (rule.targetField && rule.sourceField && rule.targetField !== rule.sourceField) {
              const sourceColExpr = resolveColExpr(sanitizeCol(rule.sourceField), mirrorColPrefix, validColumns);
              const targetColExpr = resolveColExpr(sanitizeCol(rule.targetField), mirrorColPrefix, validColumns);
              baseSql = `ABS(COALESCE((${sourceColExpr})::numeric, 0) - COALESCE((${targetColExpr})::numeric, 0)) <= ${margin}`;
            } else {
              const compareVal = rule.compareValue ?? rule.expectedValue;
              if (compareVal !== undefined && String(compareVal).trim() !== '') {
                const expected = Number(compareVal);
                if (!isNaN(expected)) {
                  baseSql = `ABS(COALESCE((${colExpr})::numeric, 0) - ${expected}) <= ${margin}`;
                } else {
                  baseSql = `COALESCE((${colExpr})::numeric, 0) > 0`;
                }
              } else {
                baseSql = `COALESCE((${colExpr})::numeric, 0) > 0`;
              }
            }
            break;
          }

          case 'FIELD_COMPARATOR': {
            const rawComp = String(rule.comparator || rule.operator || '=').trim().toUpperCase();
            const expected = String(rule.compareValue ?? rule.expectedValue ?? '').replace(/'/g, "''");
            if (rawComp === 'IN') {
              const list = expected.split(',').map(s => `'${s.trim()}'`).join(', ');
              baseSql = `LOWER(COALESCE(${colExpr}::text, '')) IN (${list.toLowerCase()})`;
            } else if (rawComp === 'NOT_IN') {
              const list = expected.split(',').map(s => `'${s.trim()}'`).join(', ');
              baseSql = `LOWER(COALESCE(${colExpr}::text, '')) NOT IN (${list.toLowerCase()})`;
            } else if (rawComp === 'LIKE' || rawComp === 'CONTAINS' || rawComp === 'INCLUDES') {
              const clean = expected.replace(/^%+|%+$/g, '');
              baseSql = `LOWER(COALESCE(${colExpr}::text, '')) LIKE '%${clean.toLowerCase()}%'`;
            } else if (rawComp === 'NOT_LIKE' || rawComp === 'NOT_CONTAINS') {
              const clean = expected.replace(/^%+|%+$/g, '');
              baseSql = `LOWER(COALESCE(${colExpr}::text, '')) NOT LIKE '%${clean.toLowerCase()}%'`;
            } else if (rawComp === 'STARTS_WITH') {
              const clean = expected.replace(/^%+|%+$/g, '');
              baseSql = `LOWER(COALESCE(${colExpr}::text, '')) LIKE '${clean.toLowerCase()}%'`;
            } else if (rawComp === 'ENDS_WITH') {
              const clean = expected.replace(/^%+|%+$/g, '');
              baseSql = `LOWER(COALESCE(${colExpr}::text, '')) LIKE '%${clean.toLowerCase()}'`;
            } else if (rawComp === 'NOT_NULL' || rawComp === 'EXISTS' || rawComp === 'PRESENT') {
              baseSql = `COALESCE(${colExpr}::text, '') != ''`;
            } else if (rawComp === 'IS_NULL' || rawComp === 'EMPTY') {
              baseSql = `COALESCE(${colExpr}::text, '') = ''`;
            } else {
              const sqlComp = (rawComp === 'EQUALS' || rawComp === '==') ? '=' : ((rawComp === 'NOT_EQUALS' || rawComp === '<>') ? '!=' : rawComp);
              baseSql = `COALESCE(${colExpr}::text, '') ${sqlComp} '${expected}'`;
            }
            break;
          }

          case 'STATUS_MATCH': {
            const expected = String(rule.compareValue ?? rule.expectedValue ?? '').toUpperCase().replace(/'/g, "''");
            baseSql = `UPPER(COALESCE(${colExpr}::text, '')) = '${expected}'`;
            break;
          }

          case 'ISO_DECLINE_CODE': {
            const expected = String(rule.compareValue ?? rule.expectedValue ?? '').trim().replace(/'/g, "''");
            baseSql = `COALESCE(${colExpr}::text, '') = '${expected}'`;
            break;
          }

          case 'NUMERIC_THRESHOLD': {
            const comp = rule.comparator || rule.operator || '>';
            const val = Number(rule.compareValue ?? rule.expectedValue ?? 0);
            baseSql = `COALESCE((${colExpr})::numeric, 0) ${comp} ${val}`;
            break;
          }

          case 'REGEX_MATCH': {
            const pattern = (rule.regexPattern || rule.compareValue || '').replace(/'/g, "''");
            baseSql = `COALESCE(${colExpr}::text, '') ~* '${pattern}'`;
            break;
          }

          case 'SQL_CONDITION': {
            if (rule.sqlCondition && rule.sqlCondition.trim()) {
              baseSql = `(${rule.sqlCondition.replace(/\{table\}/gi, mirrorColPrefix)})`;
            } else {
              baseSql = 'TRUE';
            }
            break;
          }

          default:
            baseSql = 'TRUE';
            break;
        }
      }
    }

    // Append complete checks for attached Database Table Column Configurations
    const colConfigConditions: string[] = [];
    if (Array.isArray(rule.columnConfigurations) && rule.columnConfigurations.length > 0) {
      for (const cfg of rule.columnConfigurations) {
        if (!cfg || cfg.isActive === false) continue;
        if (cfg.ruleType === 'COMPLETENESS_CHECK' && Array.isArray(cfg.columns)) {
          for (const col of cfg.columns) {
            const colExp = resolveColExpr(sanitizeCol(col.columnName), mirrorColPrefix, validColumns);
            colConfigConditions.push(`COALESCE(${colExp}::text, '') != ''`);
          }
        } else if (cfg.ruleType === 'VALUE_RANGE_CHECK' && Array.isArray(cfg.columns)) {
          for (const col of cfg.columns) {
            const colExp = resolveColExpr(sanitizeCol(col.columnName), mirrorColPrefix, validColumns);
            if (col.minValue !== undefined) {
              colConfigConditions.push(`COALESCE((${colExp})::numeric, 0) >= ${Number(col.minValue)}`);
            }
            if (col.maxValue !== undefined) {
              colConfigConditions.push(`COALESCE((${colExp})::numeric, 0) <= ${Number(col.maxValue)}`);
            }
          }
        } else if (cfg.ruleType === 'VALUE_LABEL_CHECK' && Array.isArray(cfg.valueLabels)) {
          for (const vl of cfg.valueLabels) {
            if (vl.category === 'ERROR' || vl.severity === 'CRITICAL') {
              const colExp = resolveColExpr(sanitizeCol(vl.columnName || ''), mirrorColPrefix, validColumns);
              const disVal = String(vl.constantValue ?? vl.value ?? '').replace(/'/g, "''");
              colConfigConditions.push(`LOWER(COALESCE(${colExp}::text, '')) != LOWER('${disVal}')`);
            }
          }
        }
      }
    }

    if (colConfigConditions.length > 0) {
      return baseSql === 'TRUE' ? colConfigConditions.join(' AND ') : `(${baseSql}) AND ${colConfigConditions.join(' AND ')}`;
    }
    return baseSql;
  },

  /**
   * Compiles an entire Rule Block's steps into a complete set-based PostgreSQL UPDATE statement.
   */
  compileBlockUpdateSql(
    mirrorTableName: string,
    keyField: string,
    rules: ValidationCheckStep[],
    validColumns?: string[]
  ): CompiledBlockSql {
    // Build WHEN branches for failure checks
    const statusWhenBranches: string[] = [];
    const actionWhenBranches: string[] = [];
    const detailFields: string[] = [];

    if (!rules || rules.length === 0) {
      statusWhenBranches.push(`WHEN m._mirror_id IS NOT NULL THEN 'PASS'`);
      actionWhenBranches.push(`WHEN m._mirror_id IS NOT NULL THEN 'CONTINUE'`);
      detailFields.push(`'matched', true`);
    } else {
      for (const rule of rules) {
        const condition = this.compileStepCondition(rule, 'm', validColumns);
        const failLabel = rule.name ? rule.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_') : 'CRITERIA_FAILED';

        statusWhenBranches.push(`WHEN NOT (${condition}) THEN 'FAIL'`);
        actionWhenBranches.push(`WHEN NOT (${condition}) THEN '${rule.onFailAction || 'STOP'}'`);
        detailFields.push(`'${rule.id || failLabel}', jsonb_build_object('rule', '${rule.name ? rule.name.replace(/'/g, "''") : failLabel}', 'passed', (${condition}), 'action', '${rule.onFailAction || 'STOP'}')`);
      }

      // Default pass fallback
      statusWhenBranches.push(`ELSE 'PASS'`);
      actionWhenBranches.push(`ELSE 'CONTINUE'`);
    }

    const statusCaseSql = `CASE\n          ${statusWhenBranches.join('\n          ')}\n        END`;
    const actionCaseSql = `CASE\n          ${actionWhenBranches.join('\n          ')}\n        END`;
    const detailsJsonSql = `jsonb_build_object(${detailFields.join(', ')})`;

    // Generate self-contained set-based batch update query
    const fullUpdateSql = `
      UPDATE ${mirrorTableName} m
      SET 
        _validation_status = ${statusCaseSql},
        _validation_action = ${actionCaseSql},
        _validation_details = ${detailsJsonSql},
        _mirrored_at = NOW()
      WHERE m._batch_id = $1;
    `;

    return {
      statusCaseSql,
      actionCaseSql,
      detailsJsonSql,
      fullUpdateSql
    };
  }
};
