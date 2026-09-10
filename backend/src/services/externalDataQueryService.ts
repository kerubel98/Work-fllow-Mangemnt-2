/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  QueryExtraction,
  QueryChunkPlan,
  QueryColumn,
  DatabaseConnection,
  GroupedTransactionConfig
} from '../types.js';

export type MultiRowResolutionPolicy = 'LATEST' | 'EARLIEST' | 'AGGREGATE_SUM' | 'COMPOSITE_BUNDLE' | 'STRICT_SINGLE';

export interface DbTableMappingConfig {
  id: string;
  name?: string;
  targetTable?: string;
}

export interface ExternalQueryExecutionResult {
  success: boolean;
  correlatedRecords: Record<string, Record<string, any>>; // Resolved row or composite bundle
  allRecordsByKey?: Record<string, Record<string, any>[]>; // Full array of matched rows
  recordsCount: number;
  durationMs: number;
  errorDetail?: string;
  isTechnicalError?: boolean;
}

export interface ExternalDataQueryOptions {
  connection?: DatabaseConnection;
  mappingConfig?: DbTableMappingConfig;
  simulateFailure?: 'TIMEOUT' | 'CONNECTION_REFUSED' | 'NONE';
  multiRowPolicy?: MultiRowResolutionPolicy;
  groupConfig?: GroupedTransactionConfig;
  aggregateSumColumns?: string[];
  sortColumn?: string;
}

/**
 * Builds a parameterized SQL query from a QueryExtraction and a QueryChunkPlan.
 * Supports PostgreSQL ($1, $2) and MySQL/Generic (?) parameter binding syntax.
 */
export function buildQueryFromExtraction(
  extraction: QueryExtraction,
  chunk: QueryChunkPlan,
  tableName?: string,
  dialect: 'PostgreSQL' | 'MySQL' | 'Generic' = 'Generic'
): { sql: string; parameters: any[] } {
  const targetTable = tableName || extraction.targetDataSource || 'target_data';
  
  // Resolve select columns: only the ones in selectedColumns (Minimal Projection)
  const columns = extraction.selectedColumns && extraction.selectedColumns.length > 0
    ? extraction.selectedColumns.map((c: QueryColumn) => c.alias ? `${c.sourceColumn} AS ${c.alias}` : c.sourceColumn).join(', ')
    : '*';

  // Primary key mapping for the WHERE IN chunk
  const primaryKey = extraction.keyMappings && extraction.keyMappings.length > 0
    ? extraction.keyMappings[0].sourceField
    : 'transaction_id';

  const parameters: any[] = [];
  let placeholders = '';

  if (dialect === 'PostgreSQL') {
    // In PostgreSQL: column = ANY($1::text[]) or ($1, $2, ...)
    placeholders = chunk.transactionIds.map((id, idx) => {
      parameters.push(id);
      return `$${idx + 1}`;
    }).join(', ');
  } else {
    placeholders = chunk.transactionIds.map(id => {
      parameters.push(id);
      return '?';
    }).join(', ');
  }

  let sql = `SELECT ${columns} FROM ${targetTable} WHERE ${primaryKey} IN (${placeholders})`;

  // Add custom filters if defined
  if (extraction.filters && extraction.filters.length > 0) {
    for (const f of extraction.filters) {
      if (f.operator === 'EQ') {
        const pIdx = parameters.length + 1;
        sql += dialect === 'PostgreSQL' ? ` AND ${f.field} = $${pIdx}` : ` AND ${f.field} = ?`;
        parameters.push(f.value);
      } else if (f.operator === 'NE') {
        const pIdx = parameters.length + 1;
        sql += dialect === 'PostgreSQL' ? ` AND ${f.field} != $${pIdx}` : ` AND ${f.field} != ?`;
        parameters.push(f.value);
      } else if (f.operator === 'IS_NULL') {
        sql += ` AND ${f.field} IS NULL`;
      } else if (f.operator === 'IS_NOT_NULL') {
        sql += ` AND ${f.field} IS NOT NULL`;
      }
    }
  }

  return { sql, parameters };
}

/**
 * Resolves an array of rows per key into a single record, aggregate summary, or composite leg bundle.
 */
export function resolveGroupedRows(
  groupedRows: Record<string, any[]>,
  policy: MultiRowResolutionPolicy = 'COMPOSITE_BUNDLE',
  groupConfig?: GroupedTransactionConfig,
  aggregateSumColumns?: string[],
  sortColumn?: string
): Record<string, any> {
  const resolved: Record<string, any> = {};

  for (const [key, rows] of Object.entries(groupedRows)) {
    if (!rows || rows.length === 0) continue;

    if (policy === 'STRICT_SINGLE') {
      resolved[key] = rows[0];
    } else if (policy === 'EARLIEST') {
      const sorted = [...rows].sort((a, b) => {
        const valA = sortColumn ? a[sortColumn] : (a.created_at || a.timestamp || a.id);
        const valB = sortColumn ? b[sortColumn] : (b.created_at || b.timestamp || b.id);
        return String(valA ?? '').localeCompare(String(valB ?? ''));
      });
      resolved[key] = sorted[0];
    } else if (policy === 'LATEST') {
      const sorted = [...rows].sort((a, b) => {
        const valA = sortColumn ? a[sortColumn] : (a.created_at || a.timestamp || a.id);
        const valB = sortColumn ? b[sortColumn] : (b.created_at || b.timestamp || b.id);
        return String(valB ?? '').localeCompare(String(valA ?? ''));
      });
      resolved[key] = sorted[0];
    } else if (policy === 'AGGREGATE_SUM') {
      const baseRow = { ...rows[0] };
      const sumCols = aggregateSumColumns || ['amount', 'amt', 'fee', 'balance'];
      for (const col of sumCols) {
        let total = 0;
        let hasCol = false;
        for (const r of rows) {
          if (r[col] !== undefined) {
            hasCol = true;
            total += Number(r[col]) || 0;
          }
        }
        if (hasCol) baseRow[col] = total;
      }
      baseRow._rowCount = rows.length;
      baseRow._rawRows = rows;
      resolved[key] = baseRow;
    } else {
      // COMPOSITE_BUNDLE: classify by event phase and leg indicator
      const envelope: Record<string, any> = {
        _rawRows: rows,
        _rowCount: rows.length,
        ORIGINAL: {},
        REVERSAL: {},
        REFUND: {}
      };

      if (groupConfig) {
        const phaseField = groupConfig.eventPhaseField;
        const legField = groupConfig.legIndicatorField;

        for (const r of rows) {
          const rawPhase = String(r[phaseField] ?? '').trim().toUpperCase();
          const rawLeg = String(r[legField] ?? '').trim().toUpperCase();

          let phase = 'ORIGINAL';
          if (groupConfig.eventPhaseMap) {
            if (rawPhase === String(groupConfig.eventPhaseMap.reversalValue).toUpperCase()) {
              phase = 'REVERSAL';
            } else if (groupConfig.eventPhaseMap.refundValue && rawPhase === String(groupConfig.eventPhaseMap.refundValue).toUpperCase()) {
              phase = 'REFUND';
            }
          }

          let leg = 'DEBIT';
          if (groupConfig.legIndicatorMap) {
            if (rawLeg === String(groupConfig.legIndicatorMap.creditValue).toUpperCase()) {
              leg = 'CREDIT';
            } else if (rawLeg === String(groupConfig.legIndicatorMap.feeValue).toUpperCase()) {
              leg = 'FEE';
            }
          }

          if (!envelope[phase]) envelope[phase] = {};
          envelope[phase][leg] = r;
        }
      }

      // Merge first row attributes into top level for convenient fallback
      Object.assign(envelope, rows[0], {
        _groupComposite: envelope,
        _groupedData: envelope
      });

      resolved[key] = envelope;
    }
  }

  return resolved;
}

/**
 * Executes query chunk retrieval against a real live database connection or falls back to in-memory datasets.
 * Strictly separates technical connectivity exceptions (ERROR) from record absence.
 */
export async function executeExternalChunkQuery(
  extraction: QueryExtraction,
  chunk: QueryChunkPlan,
  inMemoryRecords?: Record<string, any>[],
  options: ExternalDataQueryOptions = {}
): Promise<ExternalQueryExecutionResult> {
  const startTime = Date.now();

  // Check for simulated network / DB failure
  if (options.simulateFailure && options.simulateFailure !== 'NONE') {
    return {
      success: false,
      correlatedRecords: {},
      recordsCount: 0,
      durationMs: Date.now() - startTime,
      errorDetail: `External DB Exception: ${options.simulateFailure} on connector '${extraction.targetDbId}'`,
      isTechnicalError: true
    };
  }

  try {
    const keyMapping = extraction.keyMappings && extraction.keyMappings.length > 0
      ? extraction.keyMappings[0]
      : { inputField: 'transaction_id', sourceField: 'transaction_id', required: true };

    const inputKeyField = keyMapping.inputField;
    const sourceKeyField = keyMapping.sourceField;
    const groupedRows: Record<string, any[]> = {};

    // 1. Attempt live query if a DB connection is provided or retrievable
    let targetDb = options.connection;
    if (!targetDb && extraction.targetDbId) {
      const { repo } = await import('../store/repository.js');
      targetDb = (await repo.getDatabaseById(extraction.targetDbId)) || undefined;
    }

    if (targetDb && targetDb.status === 'online') {
      const { executeLiveQueryOnDb } = await import('./dbConnectionManager.js');
      const dialect = targetDb.type === 'PostgreSQL' ? 'PostgreSQL' : (targetDb.type === 'MySQL' ? 'MySQL' : 'Generic');
      const targetTable = options.mappingConfig?.targetTable || extraction.targetDataSource;
      const { sql, parameters } = buildQueryFromExtraction(extraction, chunk, targetTable, dialect);

      console.log(`📡 Dispatching batch query (${chunk.transactionIds.length} keys) to [${targetDb.name}]: ${sql.slice(0, 120)}...`);
      const liveResult = await executeLiveQueryOnDb(targetDb, sql, parameters);

      for (const row of liveResult.rows) {
        const key = String(row[sourceKeyField] ?? row[inputKeyField] ?? '');
        if (key) {
          if (!groupedRows[key]) groupedRows[key] = [];
          groupedRows[key].push(row);
        }
      }

      const correlated = resolveGroupedRows(
        groupedRows,
        options.multiRowPolicy,
        options.groupConfig,
        options.aggregateSumColumns,
        options.sortColumn
      );

      return {
        success: true,
        correlatedRecords: correlated,
        allRecordsByKey: groupedRows,
        recordsCount: Object.keys(correlated).length,
        durationMs: Date.now() - startTime
      };
    }

    // 2. Fallback: Search in-memory records (for local testing/simulation without live external database)
    const records = inMemoryRecords || [];
    const requestedColNames = new Set(
      (extraction.selectedColumns || []).map((c: QueryColumn) => c.sourceColumn.toLowerCase())
    );

    for (const rawRow of records) {
      const matchKey = String(rawRow[sourceKeyField] ?? rawRow[inputKeyField] ?? rawRow.transaction_id ?? rawRow.id ?? '');
      if (chunk.transactionIds.includes(matchKey)) {
        // Filter row to only requested columns if selectedColumns is specified
        const filteredRow: Record<string, any> = {};
        if (requestedColNames.size > 0) {
          for (const [k, v] of Object.entries(rawRow)) {
            if (requestedColNames.has(k.toLowerCase()) || k === sourceKeyField || k === inputKeyField) {
              filteredRow[k] = v;
            }
          }
        } else {
          Object.assign(filteredRow, rawRow);
        }
        if (!groupedRows[matchKey]) groupedRows[matchKey] = [];
        groupedRows[matchKey].push(filteredRow);
      }
    }

    const correlated = resolveGroupedRows(
      groupedRows,
      options.multiRowPolicy,
      options.groupConfig,
      options.aggregateSumColumns,
      options.sortColumn
    );

    return {
      success: true,
      correlatedRecords: correlated,
      allRecordsByKey: groupedRows,
      recordsCount: Object.keys(correlated).length,
      durationMs: Date.now() - startTime
    };
  } catch (err: any) {
    return {
      success: false,
      correlatedRecords: {},
      recordsCount: 0,
      durationMs: Date.now() - startTime,
      errorDetail: `External query execution failed: ${err.message || String(err)}`,
      isTechnicalError: true
    };
  }
}
