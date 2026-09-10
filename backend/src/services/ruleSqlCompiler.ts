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
    return `(${mirrorColPrefix}.payload->>'${targetCol}')`;
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

    if (checkType === 'DUAL_SOURCE_COMPARISON' && rule.dualSourceCondition) {
      const dsc = rule.dualSourceCondition;
      const exprA = resolveOperandSqlExpr(dsc.sourceA, mirrorColPrefix, inputColPrefix, validColumns);
      const exprB = resolveOperandSqlExpr(dsc.sourceB, mirrorColPrefix, inputColPrefix, validColumns);
      const comp = dsc.comparator || 'EQUALS';
      const margin = Number(dsc.toleranceMargin ?? rule.toleranceMargin ?? 0.00);

      if (comp === 'EQUALS' || comp === '==' || comp === '=') {
        return `LOWER(COALESCE(${exprA}::text, '')) = LOWER(COALESCE(${exprB}::text, ''))`;
      }
      if (comp === 'NOT_EQUALS' || comp === '!=' || comp === '<>') {
        return `LOWER(COALESCE(${exprA}::text, '')) != LOWER(COALESCE(${exprB}::text, ''))`;
      }
      if (comp === 'CONTAINS' || comp === 'LIKE' || comp === 'INCLUDES') {
        return `LOWER(COALESCE(${exprA}::text, '')) LIKE '%' || LOWER(COALESCE(${exprB}::text, '')) || '%'`;
      }
      if (comp === 'NOT_CONTAINS' || comp === 'NOT_LIKE') {
        return `LOWER(COALESCE(${exprA}::text, '')) NOT LIKE '%' || LOWER(COALESCE(${exprB}::text, '')) || '%'`;
      }
      if (comp === 'NUMERIC_TOLERANCE') {
        return `ABS(COALESCE((${exprA})::numeric, 0) - COALESCE((${exprB})::numeric, 0)) <= ${margin}`;
      }
      if (comp === 'GREATER_THAN' || comp === '>') {
        return `COALESCE((${exprA})::numeric, 0) > COALESCE((${exprB})::numeric, 0)`;
      }
      if (comp === 'LESS_THAN' || comp === '<') {
        return `COALESCE((${exprA})::numeric, 0) < COALESCE((${exprB})::numeric, 0)`;
      }
      if (comp === 'IN') {
        return `LOWER(COALESCE(${exprA}::text, '')) = ANY(string_to_array(LOWER(COALESCE(${exprB}::text, '')), ','))`;
      }
      if (comp === 'LOOKUP_MAP' && dsc.lookupDictionary) {
        const whenClauses = Object.entries(dsc.lookupDictionary)
          .map(([k, v]) => `WHEN '${k.replace(/'/g, "''")}' THEN '${v.replace(/'/g, "''")}'`)
          .join(' ');
        const caseExpr = `CASE ${exprA}::text ${whenClauses} ELSE ${exprA}::text END`;
        return `LOWER(${caseExpr}) = LOWER(COALESCE(${exprB}::text, ''))`;
      }
      return `LOWER(COALESCE(${exprA}::text, '')) = LOWER(COALESCE(${exprB}::text, ''))`;
    }

    const targetCol = sanitizeCol(rule.targetField || rule.sourceField || '');
    if (!targetCol && checkType !== 'SQL_CONDITION' && checkType !== 'EXISTENCE_CHECK') {
      return 'TRUE';
    }
    const colExpr = resolveColExpr(targetCol, mirrorColPrefix, validColumns);

    switch (checkType) {
      case 'EXISTENCE_CHECK':
        return `${mirrorColPrefix}._mirror_id IS NOT NULL`;

      case 'AMOUNT_MATCH': {
        const margin = Number(rule.toleranceMargin ?? rule.tolerance ?? 0.00);
        if (rule.targetField && rule.sourceField && rule.targetField !== rule.sourceField) {
          const sourceColExpr = resolveColExpr(sanitizeCol(rule.sourceField), mirrorColPrefix, validColumns);
          const targetColExpr = resolveColExpr(sanitizeCol(rule.targetField), mirrorColPrefix, validColumns);
          return `ABS(COALESCE((${sourceColExpr})::numeric, 0) - COALESCE((${targetColExpr})::numeric, 0)) <= ${margin}`;
        }
        const compareVal = rule.compareValue ?? rule.expectedValue;
        if (compareVal !== undefined && String(compareVal).trim() !== '') {
          const expected = Number(compareVal);
          if (!isNaN(expected)) {
            return `ABS(COALESCE((${colExpr})::numeric, 0) - ${expected}) <= ${margin}`;
          }
        }
        return `COALESCE((${colExpr})::numeric, 0) > 0`;
      }

      case 'FIELD_COMPARATOR': {
        const rawComp = String(rule.comparator || rule.operator || '=').trim().toUpperCase();
        const expected = String(rule.compareValue ?? rule.expectedValue ?? '').replace(/'/g, "''");
        if (rawComp === 'IN') {
          const list = expected.split(',').map(s => `'${s.trim()}'`).join(', ');
          return `LOWER(COALESCE(${colExpr}::text, '')) IN (${list.toLowerCase()})`;
        }
        if (rawComp === 'NOT_IN') {
          const list = expected.split(',').map(s => `'${s.trim()}'`).join(', ');
          return `LOWER(COALESCE(${colExpr}::text, '')) NOT IN (${list.toLowerCase()})`;
        }
        if (rawComp === 'LIKE' || rawComp === 'CONTAINS' || rawComp === 'INCLUDES') {
          const clean = expected.replace(/^%+|%+$/g, '');
          return `LOWER(COALESCE(${colExpr}::text, '')) LIKE '%${clean.toLowerCase()}%'`;
        }
        if (rawComp === 'NOT_LIKE' || rawComp === 'NOT_CONTAINS') {
          const clean = expected.replace(/^%+|%+$/g, '');
          return `LOWER(COALESCE(${colExpr}::text, '')) NOT LIKE '%${clean.toLowerCase()}%'`;
        }
        if (rawComp === 'STARTS_WITH') {
          const clean = expected.replace(/^%+|%+$/g, '');
          return `LOWER(COALESCE(${colExpr}::text, '')) LIKE '${clean.toLowerCase()}%'`;
        }
        if (rawComp === 'ENDS_WITH') {
          const clean = expected.replace(/^%+|%+$/g, '');
          return `LOWER(COALESCE(${colExpr}::text, '')) LIKE '%${clean.toLowerCase()}'`;
        }
        if (rawComp === 'NOT_NULL' || rawComp === 'EXISTS' || rawComp === 'PRESENT') {
          return `COALESCE(${colExpr}::text, '') != ''`;
        }
        if (rawComp === 'IS_NULL' || rawComp === 'EMPTY') {
          return `COALESCE(${colExpr}::text, '') = ''`;
        }
        const sqlComp = (rawComp === 'EQUALS' || rawComp === '==') ? '=' : ((rawComp === 'NOT_EQUALS' || rawComp === '<>') ? '!=' : rawComp);
        return `COALESCE(${colExpr}::text, '') ${sqlComp} '${expected}'`;
      }

      case 'STATUS_MATCH': {
        const expected = String(rule.compareValue ?? rule.expectedValue ?? '').toUpperCase().replace(/'/g, "''");
        return `UPPER(COALESCE(${colExpr}::text, '')) = '${expected}'`;
      }

      case 'ISO_DECLINE_CODE': {
        const expected = String(rule.compareValue ?? rule.expectedValue ?? '').trim().replace(/'/g, "''");
        return `COALESCE(${colExpr}::text, '') = '${expected}'`;
      }

      case 'NUMERIC_THRESHOLD': {
        const comp = rule.comparator || rule.operator || '>';
        const val = Number(rule.compareValue ?? rule.expectedValue ?? 0);
        return `COALESCE((${colExpr})::numeric, 0) ${comp} ${val}`;
      }

      case 'REGEX_MATCH': {
        const pattern = (rule.regexPattern || rule.compareValue || '').replace(/'/g, "''");
        return `COALESCE(${colExpr}::text, '') ~* '${pattern}'`;
      }

      case 'SQL_CONDITION': {
        if (rule.sqlCondition && rule.sqlCondition.trim()) {
          return `(${rule.sqlCondition.replace(/\{table\}/gi, mirrorColPrefix)})`;
        }
        return 'TRUE';
      }

      default:
        return 'TRUE';
    }
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

        statusWhenBranches.push(`WHEN NOT (${condition}) THEN '${failLabel}'`);
        actionWhenBranches.push(`WHEN NOT (${condition}) THEN '${rule.onFailAction || 'STOP'}'`);
        detailFields.push(`'${rule.id || failLabel}', ${condition}`);
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
