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

export function getRowValueCaseInsensitive(row?: Record<string, any>, colName?: string): any {
  if (!row || !colName) return undefined;
  if (row[colName] !== undefined) return row[colName];
  const targetLower = colName.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const k of Object.keys(row)) {
    if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === targetLower) return row[k];
  }
  return undefined;
}

/**
 * Builds a parameterized SQL query from a QueryExtraction and a QueryChunkPlan.
 * Supports PostgreSQL ($1, $2) and MySQL/Generic (?) parameter binding syntax.
 * ALL keyMappings are used: the primary key is the first required mapping (batched via WHERE IN),
 * and every additional mapping is added as an AND condition using values from the input records.
 */
function quoteIdentifier(col: string, dialect: string = 'PostgreSQL'): string {
  const clean = col.replace(/[`"]/g, '');
  return dialect === 'MySQL' ? `\`${clean}\`` : `"${clean}"`;
}

export function buildQueryFromExtraction(
  extraction: QueryExtraction,
  chunk: QueryChunkPlan,
  targetTable: string = extraction.targetDataSource || 'target_data',
  dialect: 'PostgreSQL' | 'MySQL' | 'Generic' = 'PostgreSQL',
  inMemoryRecords?: Record<string, any>[]
): { sql: string; parameters: any[] } {
  const parameters: any[] = [];
  let pIndex = 1;

  const nextPlaceholder = (val: any) => {
    parameters.push(val);
    return dialect === 'PostgreSQL' ? `$${pIndex++}` : '?';
  };

  // Determine which columns to project (defaults to * if none specified)
  const columns = extraction.selectedColumns && extraction.selectedColumns.length > 0
    ? extraction.selectedColumns.map((c: QueryColumn) => quoteIdentifier(c.sourceColumn, dialect)).join(', ')
    : '*';

  const allMappings = extraction.keyMappings && extraction.keyMappings.length > 0
    ? extraction.keyMappings
    : [{ inputField: 'transaction_id', sourceField: 'transaction_id', required: true }];

  // Extract composite candidate tuples from incoming inMemoryRecords
  const compositeTuples: Record<string, any>[] = [];
  if (inMemoryRecords && inMemoryRecords.length > 0) {
    const seen = new Set<string>();
    for (const rec of inMemoryRecords) {
      const tupleObj: Record<string, any> = {};
      let hasAnyMappedField = false;
      for (const m of allMappings) {
        const v = getRowValueCaseInsensitive(rec, m.inputField);
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          tupleObj[m.sourceField] = v;
          hasAnyMappedField = true;
        }
      }
      if (hasAnyMappedField) {
        const signature = allMappings.map(m => String(tupleObj[m.sourceField] ?? '').trim().toLowerCase()).join(':::');
        if (!seen.has(signature)) {
          seen.add(signature);
          compositeTuples.push(tupleObj);
        }
      }
    }
  }

  let whereClause = '';

  // CASE 1: Multiple configured parameters (e.g. terminal_id, reqamt, fe_utrnno)
  // Matches records on their exact composite tuples. Uses ANSI SQL vector IN ((v1, v2), ...) syntax for PG/MySQL.
  if (allMappings.length > 1 && compositeTuples.length > 0) {
    if (compositeTuples.length === 1) {
      // Single record: WHERE "terminal_id" = ? AND "reqamt" = ? AND "fe_utrnno" = ?
      const single = compositeTuples[0];
      const andClauses = allMappings
        .filter(m => single[m.sourceField] !== undefined)
        .map(m => `${quoteIdentifier(m.sourceField, dialect)} = ${nextPlaceholder(single[m.sourceField])}`);
      whereClause = andClauses.length > 0 ? andClauses.join(' AND ') : '1=1';
    } else if (dialect === 'PostgreSQL' || dialect === 'MySQL') {
      // Vector IN compilation: WHERE ("col1", "col2", "col3") IN (($1, $2, $3), ($4, $5, $6), ...)
      const compositeCols = allMappings.map(m => m.sourceField);
      const safeCols = compositeCols.map(c => quoteIdentifier(c, dialect));
      const tuplePlaceholders = compositeTuples.map(t => {
        const placeholders = compositeCols.map(col => nextPlaceholder(t[col] ?? null));
        return `(${placeholders.join(', ')})`;
      });
      whereClause = `(${safeCols.join(', ')}) IN (${tuplePlaceholders.join(', ')})`;
    } else {
      // Fallback for Generic dialects: WHERE ("col1" = ? AND "col2" = ?) OR ("col1" = ? AND "col2" = ?)
      const rowClauses = compositeTuples.map(t => {
        const conditions = allMappings
          .filter(m => t[m.sourceField] !== undefined)
          .map(m => `${quoteIdentifier(m.sourceField, dialect)} = ${nextPlaceholder(t[m.sourceField])}`);
        return conditions.length > 0 ? `(${conditions.join(' AND ')})` : '(1=1)';
      });
      whereClause = rowClauses.join(' OR ');
    }
  } else {

    // CASE 2: Single parameter configured (or fallback when compositeTuples is empty)
    const primaryMapping = allMappings.find(m => m.required !== false) || allMappings[0];
    const primaryTargetCol = primaryMapping.sourceField;
    const safePrimaryTargetCol = quoteIdentifier(primaryTargetCol, dialect);

    const primaryValsFromRecords = compositeTuples
      .map(t => t[primaryTargetCol])
      .filter(v => v !== undefined && v !== null);

    const cleanTransactionIds = chunk.transactionIds
      .map(id => typeof id === 'string' ? id.trim() : id)
      .filter(id => id !== undefined && id !== null && String(id).trim() !== '');

    const effectivePrimaryIds = primaryValsFromRecords.length > 0
      ? Array.from(new Set(primaryValsFromRecords))
      : cleanTransactionIds;

    if (effectivePrimaryIds.length === 1) {
      whereClause = `${safePrimaryTargetCol} = ${nextPlaceholder(effectivePrimaryIds[0])}`;
    } else if (effectivePrimaryIds.length > 1) {
      const inPlaceholders = effectivePrimaryIds.map(id => nextPlaceholder(id)).join(', ');
      whereClause = `${safePrimaryTargetCol} IN (${inPlaceholders})`;
    } else {
      whereClause = '1=1';
    }
  }

  let sql = `SELECT ${columns} FROM ${targetTable} WHERE ${whereClause}`;

  // Add custom filters if defined
  if (extraction.filters && extraction.filters.length > 0) {
    for (const f of extraction.filters) {
      const cleanVal = typeof f.value === 'string' ? f.value.trim() : f.value;
      const safeField = quoteIdentifier(f.field, dialect);
      if (f.operator === 'EQ') {
        const pIdx = parameters.length + 1;
        sql += dialect === 'PostgreSQL' ? ` AND ${safeField} = $${pIdx}` : ` AND ${safeField} = ?`;
        parameters.push(cleanVal);
      } else if (f.operator === 'NE') {
        const pIdx = parameters.length + 1;
        sql += dialect === 'PostgreSQL' ? ` AND ${safeField} != $${pIdx}` : ` AND ${safeField} != ?`;
        parameters.push(cleanVal);
      } else if (f.operator === 'IS_NULL') {
        sql += ` AND ${safeField} IS NULL`;
      } else if (f.operator === 'IS_NOT_NULL') {
        sql += ` AND ${safeField} IS NOT NULL`;
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

    const hasDuplicates = rows.length > 1;

    const safeRawRows = rows.length > 5 ? rows.slice(0, 5) : rows;

    if (policy === 'STRICT_SINGLE') {
      resolved[key] = hasDuplicates
        ? {
            ...rows[0],
            _discrepancyFlag: 'DUPLICATE_EXTERNAL_MATCH',
            _matchCount: rows.length,
            _rawRows: safeRawRows
          }
        : rows[0];
    } else if (policy === 'EARLIEST') {
      const sorted = [...rows].sort((a, b) => {
        const valA = sortColumn ? a[sortColumn] : (a.created_at || a.timestamp || a.id);
        const valB = sortColumn ? b[sortColumn] : (b.created_at || b.timestamp || b.id);
        return String(valA ?? '').localeCompare(String(valB ?? ''));
      });
      resolved[key] = hasDuplicates
        ? {
            ...sorted[0],
            _discrepancyFlag: 'DUPLICATE_EXTERNAL_MATCH',
            _matchCount: rows.length,
            _rawRows: safeRawRows
          }
        : sorted[0];
    } else if (policy === 'LATEST') {
      const sorted = [...rows].sort((a, b) => {
        const valA = sortColumn ? a[sortColumn] : (a.created_at || a.timestamp || a.id);
        const valB = sortColumn ? b[sortColumn] : (b.created_at || b.timestamp || b.id);
        return String(valB ?? '').localeCompare(String(valA ?? ''));
      });
      resolved[key] = hasDuplicates
        ? {
            ...sorted[0],
            _discrepancyFlag: 'DUPLICATE_EXTERNAL_MATCH',
            _matchCount: rows.length,
            _rawRows: safeRawRows
          }
        : sorted[0];
    } else if (policy === 'AGGREGATE_SUM') {
      if (!aggregateSumColumns || aggregateSumColumns.length === 0) {
        throw new Error(`[ExternalDataQuery] Configuration Error: 'aggregateSumColumns' must be explicitly configured when using duplicate resolution policy 'AGGREGATE_SUM'.`);
      }
      const baseRow = { ...rows[0] };
      const sumCols = aggregateSumColumns;
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
      baseRow._rawRows = safeRawRows;
      resolved[key] = baseRow;
    } else {
      // COMPOSITE_BUNDLE: classify by event phase and leg indicator
      const envelope: Record<string, any> = {
        _rawRows: safeRawRows,
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

      // Merge first row attributes into top level for convenient fallback without circular reference or nested duplication
      const { _rawRows: _discard, ...groupDataSnapshot } = envelope;
      Object.assign(envelope, rows[0], {
        _groupComposite: groupDataSnapshot,
        _groupedData: groupDataSnapshot
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
    // Extract keyMappings with support for DB / Box configuration override key field
    const overrideKeyField = (options.mappingConfig as any)?.reconciliationKeyField || (extraction as any).reconciliationKeyField;
    const allMappings = extraction.keyMappings && extraction.keyMappings.length > 0
      ? extraction.keyMappings
      : [{ inputField: 'transaction_id', sourceField: 'transaction_id', required: true }];
    const primaryMapping = overrideKeyField 
      ? (allMappings.find(m => m.sourceField === overrideKeyField || m.inputField === overrideKeyField) || { inputField: overrideKeyField, sourceField: overrideKeyField, required: true })
      : (allMappings.find(m => m.required !== false) || allMappings[0]);
    const inputKeyField = primaryMapping.inputField;
    const sourceKeyField = primaryMapping.sourceField;
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

      // Dynamic sub-chunking safeguard: cap query parameters below 30,000 (well below UINT16_MAX 65,535)
      const fieldCount = Math.max(1, allMappings.length);
      const maxKeysPerChunk = Math.min(1000, Math.floor(30000 / fieldCount));

      let allRows: any[] = [];
      if (chunk.transactionIds.length > maxKeysPerChunk) {
        for (let i = 0; i < chunk.transactionIds.length; i += maxKeysPerChunk) {
          const subTxIds = chunk.transactionIds.slice(i, i + maxKeysPerChunk);
          const subChunk = { ...chunk, transactionIds: subTxIds };
          const subInMemory = inMemoryRecords ? inMemoryRecords.slice(i, i + maxKeysPerChunk) : inMemoryRecords;
          const { sql, parameters } = buildQueryFromExtraction(extraction, subChunk, targetTable, dialect, subInMemory);
          const subRes = await executeLiveQueryOnDb(targetDb, sql, parameters);
          if (subRes.rows) allRows.push(...subRes.rows);
        }
      } else {
        const { sql, parameters } = buildQueryFromExtraction(extraction, chunk, targetTable, dialect, inMemoryRecords);
        console.log(`📡 Dispatching batch query (${chunk.transactionIds.length} keys) to [${targetDb.name}]: ${sql.slice(0, 120)}...`);
        const liveResult = await executeLiveQueryOnDb(targetDb, sql, parameters);
        allRows = liveResult.rows || [];
      }

      for (const row of allRows) {
        // Correlate the returned external row back to an input record by matching ALL mapped parameters
        const matchingInputRecord = (inMemoryRecords || []).find(inputRec => {
          return allMappings.every(m => {
            const inputVal = getRowValueCaseInsensitive(inputRec, m.inputField);
            const targetVal = getRowValueCaseInsensitive(row, m.sourceField) ?? getRowValueCaseInsensitive(row, m.inputField);
            if (inputVal === undefined || inputVal === null || targetVal === undefined || targetVal === null) {
              return true;
            }
            return String(inputVal).trim().toLowerCase() === String(targetVal).trim().toLowerCase();
          });
        });

        const candidateKeys: string[] = [];
        if (matchingInputRecord) {
          for (const m of allMappings) {
            const v = getRowValueCaseInsensitive(matchingInputRecord, m.inputField);
            if (v !== undefined && v !== null && String(v).trim() !== '') {
              candidateKeys.push(String(v).trim());
            }
          }
          if (matchingInputRecord._rowNumber) candidateKeys.push(`ROW-${matchingInputRecord._rowNumber}`);
          if (matchingInputRecord.row_number) candidateKeys.push(`ROW-${matchingInputRecord.row_number}`);
          const tuple = allMappings
            .map(m => String(getRowValueCaseInsensitive(matchingInputRecord, m.inputField) ?? '').trim())
            .filter(Boolean)
            .join(':::');
          if (tuple) candidateKeys.push(tuple);
        }
        for (const m of allMappings) {
          const v = getRowValueCaseInsensitive(row, m.sourceField) ?? getRowValueCaseInsensitive(row, m.inputField);
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            candidateKeys.push(String(v).trim());
          }
        }

        const uniqueKeys = Array.from(new Set(candidateKeys));
        if (uniqueKeys.length === 0) uniqueKeys.push('UNKNOWN_KEY');

        for (const k of uniqueKeys) {
          if (!groupedRows[k]) groupedRows[k] = [];
          groupedRows[k].push(row);
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
      const primaryVal = String(getRowValueCaseInsensitive(rawRow, sourceKeyField) ?? getRowValueCaseInsensitive(rawRow, inputKeyField) ?? '');
      if (chunk.transactionIds && chunk.transactionIds.length > 0) {
        const matchesChunk = chunk.transactionIds.some(tid => String(tid).trim().toLowerCase() === primaryVal.trim().toLowerCase());
        if (!matchesChunk) continue;
      }

      const matchingInputRecord = (inMemoryRecords || []).find(inputRec => {
        return allMappings.every(m => {
          const inputVal = getRowValueCaseInsensitive(inputRec, m.inputField);
          const targetVal = getRowValueCaseInsensitive(rawRow, m.sourceField) ?? getRowValueCaseInsensitive(rawRow, m.inputField);
          if (inputVal === undefined || inputVal === null || targetVal === undefined || targetVal === null) {
            return true;
          }
          return String(inputVal).trim().toLowerCase() === String(targetVal).trim().toLowerCase();
        });
      });

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

      const candidateKeys: string[] = [];
      if (matchingInputRecord) {
        for (const m of allMappings) {
          const v = getRowValueCaseInsensitive(matchingInputRecord, m.inputField);
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            candidateKeys.push(String(v).trim());
          }
        }
        if (matchingInputRecord._rowNumber) candidateKeys.push(`ROW-${matchingInputRecord._rowNumber}`);
        if (matchingInputRecord.row_number) candidateKeys.push(`ROW-${matchingInputRecord.row_number}`);
        const tuple = allMappings
          .map(m => String(getRowValueCaseInsensitive(matchingInputRecord, m.inputField) ?? '').trim())
          .filter(Boolean)
          .join(':::');
        if (tuple) candidateKeys.push(tuple);
      }
      for (const m of allMappings) {
        const v = getRowValueCaseInsensitive(rawRow, m.sourceField) ?? getRowValueCaseInsensitive(rawRow, m.inputField);
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          candidateKeys.push(String(v).trim());
        }
      }

      const uniqueKeys = Array.from(new Set(candidateKeys));
      if (uniqueKeys.length === 0) uniqueKeys.push('UNKNOWN_KEY');

      for (const k of uniqueKeys) {
        if (!groupedRows[k]) groupedRows[k] = [];
        groupedRows[k].push(filteredRow);
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
