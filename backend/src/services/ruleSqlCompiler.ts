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

/**
 * Validates and sanitizes custom SQL condition predicates against SQL injection,
 * malicious subqueries, statement stacking, and destructive operations.
 */
export function sanitizeSqlConditionPredicate(sql: string, tablePrefix = 'm'): string {
  if (!sql || !sql.trim()) return 'TRUE';

  const trimmed = sql.trim();

  // Disallow statement terminators or null bytes
  if (/[;\0]/.test(trimmed)) {
    throw new Error('Security Violation: Semicolons or null characters are strictly forbidden in SQL conditions.');
  }

  // Disallow line or block comments
  if (/(--|\/\*|\*\/)/.test(trimmed)) {
    throw new Error('Security Violation: SQL comments are strictly forbidden in SQL conditions.');
  }

  // Disallow DDL/DML, system commands, transaction controls, subqueries, and harmful functions
  const dangerousPatterns = [
    /\b(ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE)\b/i,
    /\b(INSERT|UPDATE|DELETE)\b/i,
    /\b(COMMIT|ROLLBACK|BEGIN)\b/i,
    /\b(UNION|INTERSECT|EXCEPT)\b/i,
    /\b(SELECT)\b/i, // Subquery injection prevention
    /\b(EXEC|EXECUTE)\b/i,
    /\b(PG_SLEEP|PG_TERMINATE_BACKEND|PG_CANCEL_BACKEND|CURRENT_SETTING|SET_CONFIG)\b/i,
    /\b(INTO|COPY|LOAD)\b/i
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(trimmed)) {
      throw new Error(`Security Violation: Unsafe SQL pattern detected in condition predicate: ${pattern.source}`);
    }
  }

  return `(${trimmed.replace(/\{table\}/gi, tablePrefix)})`;
}

function sanitizeCol(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function resolveColExpr(targetCol: string, mirrorColPrefix = 'm', validColumns?: string[]): string {
  if (validColumns && validColumns.length > 0) {
    if (validColumns.includes(targetCol)) {
      return `${mirrorColPrefix}."${targetCol}"`;
    }
    if (validColumns.includes('payload')) {
      return `(${mirrorColPrefix}."payload"->>'${targetCol}')`;
    }
  }
  return `${mirrorColPrefix}."${targetCol}"`;
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
    inputColPrefix = 't',
    mirrorTableName?: string
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
      const targetCol = sanitizeCol(rule.targetField || rule.sourceField || (rule as any).inputField || '');
      if (!targetCol && checkType !== 'SQL_CONDITION' && checkType !== 'EXISTENCE_CHECK') {
        baseSql = 'TRUE';
      } else {
        const colExpr = resolveColExpr(targetCol, mirrorColPrefix, validColumns);

        switch (checkType as string) {
          case 'EXISTENCE_CHECK':
            baseSql = `${mirrorColPrefix}._mirror_id IS NOT NULL`;
            break;

          case 'VALUE_MATCH': {
            const expected = String(rule.compareValue ?? rule.expectedValue ?? '').replace(/'/g, "''");
            baseSql = `LOWER(COALESCE(${colExpr}::text, '')) = LOWER('${expected}')`;
            break;
          }

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
              const validOps = ['=', '!=', '<>', '>', '<', '>=', '<='];
              const safeOp = validOps.includes(sqlComp) ? sqlComp : '=';
              baseSql = `COALESCE(${colExpr}::text, '') ${safeOp} '${expected}'`;
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
              baseSql = sanitizeSqlConditionPredicate(rule.sqlCondition, mirrorColPrefix);
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
        } else if (cfg.ruleType === 'PATTERN_CHECK' && Array.isArray(cfg.columns)) {
          for (const col of cfg.columns) {
            if (col.pattern) {
              const colExp = resolveColExpr(sanitizeCol(col.columnName), mirrorColPrefix, validColumns);
              const cleanPattern = col.pattern.replace(/'/g, "''");
              colConfigConditions.push(`COALESCE(${colExp}::text, '') ~ '${cleanPattern}'`);
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
        } else if ((cfg.ruleType === 'DUPLICATE_CHECK' || cfg.ruleType === 'UNIQUE_CONSTRAINT') && Array.isArray(cfg.columns)) {
          if (mirrorTableName) {
            // Build filter condition clauses for both outer row and subquery
            const outerFilters: string[] = [];
            const innerFilters: string[] = [];
            if (Array.isArray(cfg.filterConditions) && cfg.filterConditions.length > 0) {
              for (const fc of cfg.filterConditions) {
                if (!fc.columnName) continue;
                const colName = sanitizeCol(fc.columnName);
                const outerColExp = resolveColExpr(colName, mirrorColPrefix, validColumns);
                const innerColExp = `_dup."${colName.toLowerCase()}"`;
                const op = String(fc.operator || '=');
                const val = String(fc.value ?? '').replace(/'/g, "''");
                if (op === '=' || op === '==') {
                  outerFilters.push(`LOWER(COALESCE(${outerColExp}::text, '')) = LOWER('${val}')`);
                  innerFilters.push(`LOWER(COALESCE(${innerColExp}::text, '')) = LOWER('${val}')`);
                } else if (op === '!=' || op === '<>') {
                  outerFilters.push(`COALESCE(${outerColExp}::text, '') != '${val}'`);
                  innerFilters.push(`COALESCE(${innerColExp}::text, '') != '${val}'`);
                } else if (op === 'LIKE' || op === 'CONTAINS') {
                  outerFilters.push(`LOWER(COALESCE(${outerColExp}::text, '')) LIKE '%' || LOWER('${val}') || '%'`);
                  innerFilters.push(`LOWER(COALESCE(${innerColExp}::text, '')) LIKE '%' || LOWER('${val}') || '%'`);
                } else if (op === '>' || op === '>=' || op === '<' || op === '<=') {
                  outerFilters.push(`COALESCE((${outerColExp})::numeric, 0) ${op} ${Number(val) || 0}`);
                  innerFilters.push(`COALESCE((${innerColExp})::numeric, 0) ${op} ${Number(val) || 0}`);
                }
              }
            }

            // Identify matching grouping columns
            const matchColNames: string[] = [];
            if (Array.isArray(cfg.groupByColumns) && cfg.groupByColumns.length > 0) {
              matchColNames.push(...cfg.groupByColumns);
            } else {
              const filterColSet = new Set((cfg.filterConditions || []).map((f: any) => (f.columnName || '').toLowerCase()));
              for (const col of cfg.columns) {
                const cName = (col.columnName || '').toLowerCase();
                if (filterColSet.has(cName)) continue;
                if ((col as any).isPrimary || col.role === 'PRIMARY_KEY' || col.role === 'MATCH_KEY' || col.role === 'DISCRIMINATOR') {
                  matchColNames.push(col.columnName);
                }
              }
              if (matchColNames.length === 0 && cfg.primaryKeyColumn && !filterColSet.has(cfg.primaryKeyColumn.toLowerCase())) {
                matchColNames.push(cfg.primaryKeyColumn);
              }
            }

            const joinEqs: string[] = [];
            for (const colName of matchColNames) {
              const sCol = sanitizeCol(colName);
              const outerExp = resolveColExpr(sCol, mirrorColPrefix, validColumns);
              joinEqs.push(`_dup."${sCol.toLowerCase()}" = ${outerExp}`);
            }

            const countRule = (Array.isArray(cfg.aggregationRules) && cfg.aggregationRules.find((a: any) => a.function === 'COUNT'))
              || { function: 'COUNT', operator: '>', value: 1 };
            const threshold = Number(countRule.value ?? 1);

            const whereClauses = [
              `_dup._batch_id = ${mirrorColPrefix}._batch_id`,
              `_dup._task_id = ${mirrorColPrefix}._task_id`,
              ...joinEqs,
              ...innerFilters
            ];

            const subquery = `(SELECT COUNT(*) FROM ${mirrorTableName} _dup WHERE ${whereClauses.join(' AND ')})`;
            if (outerFilters.length > 0) {
              colConfigConditions.push(`CASE WHEN (${outerFilters.join(' AND ')}) THEN (${subquery} <= ${threshold}) ELSE TRUE END`);
            } else {
              colConfigConditions.push(`(${subquery} <= ${threshold})`);
            }
          } else {
            for (const col of cfg.columns) {
              // Discriminator or payload columns are nullable and must never be enforced as non-empty in duplicate checks
              if (col.role === 'DISCRIMINATOR' || col.role === 'PAYLOAD') continue;
              if ((col as any).isPrimary || col.role === 'PRIMARY_KEY' || col.role === 'MATCH_KEY') {
                const colExp = resolveColExpr(sanitizeCol(col.columnName), mirrorColPrefix, validColumns);
                colConfigConditions.push(`COALESCE(${colExp}::text, '') != ''`);
              }
            }
            if (cfg.primaryKeyColumn) {
              const pkExp = resolveColExpr(sanitizeCol(cfg.primaryKeyColumn), mirrorColPrefix, validColumns);
              colConfigConditions.push(`COALESCE(${pkExp}::text, '') != ''`);
            }
          }
        } else if (cfg.ruleType === 'GROUPING_CHECK') {
          const matchCols: string[] = [];
          if (Array.isArray(cfg.groupByColumns) && cfg.groupByColumns.length > 0) {
            matchCols.push(...cfg.groupByColumns);
          } else if (Array.isArray(cfg.columns)) {
            const keyCols = cfg.columns
              .filter(c => c.role === 'MATCH_KEY' || c.role === 'PRIMARY_KEY' || (c as any).isPrimary)
              .map(c => c.columnName);
            if (keyCols.length > 0) {
              matchCols.push(...keyCols);
            } else if (cfg.primaryKeyColumn) {
              matchCols.push(cfg.primaryKeyColumn);
            }
          }
          for (const colName of matchCols) {
            const colExp = resolveColExpr(sanitizeCol(colName), mirrorColPrefix, validColumns);
            colConfigConditions.push(`COALESCE(${colExp}::text, '') != ''`);
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
    ruleBlockId: string,
    rules: ValidationCheckStep[],
    validColumns?: string[],
    options?: {
      cardinalityPolicy?: string;
      aggregationStrategy?: string;
      orderByColumn?: string;
    }
  ): CompiledBlockSql {
    // Build WHEN branches for failure checks
    const statusWhenBranches: string[] = [];
    const actionWhenBranches: string[] = [];
    const detailFields: string[] = [];

    // Phase 8: Set-Based Cardinality Breach Check
    if (options?.cardinalityPolicy === 'STRICT_SINGLE') {
      const countSubquery = `(SELECT COUNT(*) FROM ${mirrorTableName} _cnt WHERE _cnt._batch_id = m._batch_id AND _cnt._task_id = m._task_id AND _cnt._row_number = m._row_number)`;
      statusWhenBranches.push(`WHEN ${countSubquery} > 1 THEN 'FAIL'`);
      actionWhenBranches.push(`WHEN ${countSubquery} > 1 THEN '${rules[0]?.onFailAction || 'STOP'}'`);
      detailFields.push(`'cardinality', jsonb_build_object('status', CASE WHEN ${countSubquery} > 1 THEN 'CARDINALITY_BREACH' ELSE 'EXACT_MATCH' END, 'breach', (${countSubquery} > 1), 'policy', 'STRICT_SINGLE')`);
    }

    if (!rules || rules.length === 0) {
      statusWhenBranches.push(`WHEN m._mirror_id IS NOT NULL THEN 'PASS'`);
      actionWhenBranches.push(`WHEN m._mirror_id IS NOT NULL THEN 'CONTINUE'`);
      detailFields.push(`'matched', true`);
    } else {
      for (const rule of rules) {
        const condition = this.compileStepCondition(rule, 'm', validColumns, 't', mirrorTableName);
        const failLabel = rule.name ? rule.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_') : 'CRITERIA_FAILED';

        statusWhenBranches.push(`WHEN NOT (${condition}) THEN 'FAIL'`);
        actionWhenBranches.push(`WHEN NOT (${condition}) THEN '${rule.onFailAction || 'STOP'}'`);
        detailFields.push(`'${rule.id || failLabel}', jsonb_build_object('rule', '${rule.name ? rule.name.replace(/'/g, "''") : failLabel}', 'passed', (${condition}), 'action', '${rule.onFailAction || 'STOP'}')`);
      }

      // Default pass fallback preserving configured onPassAction
      const defaultPassAction = rules[0]?.onPassAction || 'CONTINUE';
      statusWhenBranches.push(`ELSE 'PASS'`);
      actionWhenBranches.push(`ELSE '${defaultPassAction}'`);
    }

    const statusCaseSql = `CASE\n          ${statusWhenBranches.join('\n          ')}\n        END`;
    const actionCaseSql = `CASE\n          ${actionWhenBranches.join('\n          ')}\n        END`;
    const detailsJsonSql = `jsonb_build_object(${detailFields.join(', ')})`;

    // Generate self-contained set-based batch update query.
    // §Rule 13 / §7.3: Scope by BOTH _batch_id AND _rule_block_id to prevent
    // cross-task contamination when multiple tasks share the same _batch_id string.
    // $1 = batchId, $2 = ruleBlockId
    const fullUpdateSql = `
      UPDATE ${mirrorTableName} m
      SET 
        _validation_status = ${statusCaseSql},
        _validation_action = ${actionCaseSql},
        _validation_details = ${detailsJsonSql},
        _mirrored_at = NOW()
      WHERE m._batch_id = $1
        AND m._rule_block_id = $2;
    `;

    return {
      statusCaseSql,
      actionCaseSql,
      detailsJsonSql,
      fullUpdateSql
    };
  }
};
