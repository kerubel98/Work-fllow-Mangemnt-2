/**
 * Dedicated Typed Mirror Table Manager
 * Provisions schema-aligned UNLOGGED mirror tables in PostgreSQL per external database table.
 * Standardizes operational envelope columns and enables ultra-fast set-based relational joins.
 */

import { DatabaseConnection } from '../types.js';
import { getTableColumns, ColumnMetadata, discoverTablesForDb } from './dbConnectionManager.js';
import { queryPg } from '../config/postgres.js';
import { repo } from '../store/repository.js';

export interface MirrorTableDefinition {
  mirrorTableName: string;
  externalDbId: string;
  externalTableName: string;
  columns: ColumnMetadata[];
  createdAt: string;
}

const TABLE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes TTL
const tableCache = new Map<string, number>(); // tableName -> expiryTimestamp

function isTableCached(name: string): boolean {
  const expiry = tableCache.get(name);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    tableCache.delete(name);
    return false;
  }
  return true;
}

function setTableCached(name: string): void {
  tableCache.set(name, Date.now() + TABLE_CACHE_TTL_MS);
}

export function isPermanentMirrorTable(mirrorName: string): boolean {
  return mirrorName.startsWith('mirror_ftp_') || mirrorName.startsWith('mirror_permanent_') || mirrorName.includes('_staging_');
}

/**
 * Maps database-specific types to standard PostgreSQL types.
 */
function mapToPgType(externalType: string): string {
  const t = externalType.toUpperCase().trim();

  if (t.includes('INT')) return 'BIGINT';
  if (t.includes('DECIMAL') || t.includes('NUMERIC') || t.includes('MONEY') || t.includes('FLOAT') || t.includes('DOUBLE')) return 'NUMERIC(18, 4)';
  if (t.includes('BOOL')) return 'BOOLEAN';
  if (t.includes('DATE') || t.includes('TIME')) return 'TIMESTAMPTZ';
  if (t.includes('JSON')) return 'JSONB';
  if (t.includes('TEXT') || t.includes('CLOB')) return 'TEXT';
  
  // Default to VARCHAR(255) for general string types
  return 'VARCHAR(255)';
}

export function derive64BitAdvisoryLockSql(paramIndex: number = 1): string {
  return `('x' || substr(md5($${paramIndex}), 1, 16))::bit(64)::bigint`;
}

function sanitizeIdentifier(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 50);
}

export const mirrorTableManager = {
  /**
   * Generates a deterministic, standard mirror table name.
   */
  getMirrorTableName(dbName: string, tableName: string): string {
    if (tableName.startsWith('mirror_')) {
      return tableName.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 63);
    }
    const safeDb = sanitizeIdentifier(dbName);
    const safeTable = sanitizeIdentifier(tableName);
    return `mirror_${safeDb}_${safeTable}`;
  },

  /**
   * Automatically inspects the external table schema and creates an UNLOGGED
   * typed mirror table in PostgreSQL if it doesn't already exist.
   */
  async ensureMirrorTableExists(db?: DatabaseConnection | null, tableName = 'transactions'): Promise<string> {
    const dbName = db ? (db.name || db.id) : 'local';
    const mirrorName = this.getMirrorTableName(dbName, tableName);

    if (isTableCached(mirrorName)) {
      return mirrorName;
    }

    // Acquire 64-bit transaction-scoped advisory lock to prevent concurrent DDL catalog race conditions
    try {
      await queryPg(
        `SELECT pg_advisory_xact_lock(('x' || substr(md5($1), 1, 16))::bit(64)::bigint)`,
        [`mirror_ddl_${mirrorName}`]
      );
    } catch (lockErr: any) {
      console.warn(`[MirrorManager] Advisory lock warning for ${mirrorName}:`, lockErr.message);
    }

    // Fast-path: Check if mirror table already exists in PostgreSQL
    try {
      const checkRes = await queryPg(
        `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public'`,
        [mirrorName]
      );
      if (checkRes.rows && checkRes.rows.length > 0) {
        setTableCached(mirrorName);
        return mirrorName;
      }
    } catch {}

    // Inspect columns from external target database
    let columns: ColumnMetadata[] = [];
    if (db) {
      try {
        columns = await getTableColumns(db, tableName);
      } catch (err: any) {
        console.warn(`[MirrorManager] Could not inspect external columns for ${tableName}: ${err.message}. Using flexible JSONB envelope.`);
      }
    }

    // Build column definitions
    const colDefs: string[] = [
      `_mirror_id UUID DEFAULT gen_random_uuid() PRIMARY KEY`,
      `_batch_id VARCHAR(64) NOT NULL`,
      `_rule_block_id VARCHAR(64) NOT NULL`,
      `_validation_status VARCHAR(32) NOT NULL DEFAULT 'PENDING'`,
      `_validation_action VARCHAR(32) DEFAULT 'CONTINUE'`,
      `_validation_details JSONB DEFAULT '{}'::jsonb`,
      `_mirrored_at TIMESTAMPTZ DEFAULT NOW()`
    ];

    for (const col of columns) {
      const safeCol = sanitizeIdentifier(col.name);
      if (safeCol.startsWith('_') || safeCol === 'payload') continue;
      const pgType = mapToPgType(col.type);
      colDefs.push(`${safeCol} ${pgType}`);
    }
    // Always include dynamic payload column for unstructured and custom rule fields
    colDefs.push(`payload JSONB DEFAULT '{}'::jsonb`);

    // Create high-throughput UNLOGGED table in PostgreSQL
    const ddl = `
      CREATE UNLOGGED TABLE IF NOT EXISTS ${mirrorName} (
        ${colDefs.join(',\n        ')}
      );
      CREATE INDEX IF NOT EXISTS idx_${mirrorName}_batch ON ${mirrorName}(_batch_id);
      CREATE INDEX IF NOT EXISTS idx_${mirrorName}_status ON ${mirrorName}(_rule_block_id, _validation_status);
    `;

    await queryPg(ddl);
    try {
      await queryPg(`ALTER TABLE ${mirrorName} ADD COLUMN IF NOT EXISTS _mirror_id UUID DEFAULT gen_random_uuid();`);
      await queryPg(`ALTER TABLE ${mirrorName} ADD COLUMN IF NOT EXISTS _batch_id VARCHAR(64);`);
      await queryPg(`ALTER TABLE ${mirrorName} ADD COLUMN IF NOT EXISTS _rule_block_id VARCHAR(64);`);
      await queryPg(`ALTER TABLE ${mirrorName} ADD COLUMN IF NOT EXISTS _validation_status VARCHAR(32) DEFAULT 'PENDING';`);
      await queryPg(`ALTER TABLE ${mirrorName} ADD COLUMN IF NOT EXISTS _validation_action VARCHAR(32) DEFAULT 'CONTINUE';`);
      await queryPg(`ALTER TABLE ${mirrorName} ADD COLUMN IF NOT EXISTS _validation_details JSONB DEFAULT '{}'::jsonb;`);
      await queryPg(`ALTER TABLE ${mirrorName} ADD COLUMN IF NOT EXISTS _mirrored_at TIMESTAMPTZ DEFAULT NOW();`);
      await queryPg(`ALTER TABLE ${mirrorName} ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;`);
    } catch {}
    setTableCached(mirrorName);
    console.log(`[MirrorManager] Mirror table verified: ${mirrorName} with ${columns.length} columns.`);
    return mirrorName;
  },

  /**
   * Bulk streams external query results directly into the typed mirror table.
   */
  async bulkInsertToMirror(
    mirrorName: string,
    batchId: string,
    ruleBlockId: string,
    records: Record<string, any>[]
  ): Promise<number> {
    if (!records || records.length === 0) return 0;

    // Discover target mirror table physical columns
    const colQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1 AND table_schema = 'public'
    `;
    const colRes = await queryPg(colQuery, [mirrorName]);
    const validColumns = new Set(colRes.rows.map((r: any) => r.column_name));

    // Normalize keys across record rows
    const sample = records[0];
    const insertCols: string[] = ['_batch_id', '_rule_block_id', '_validation_status'];
    const recordFieldMap: Record<string, string> = {};

    for (const rawKey of Object.keys(sample)) {
      const sanitized = sanitizeIdentifier(rawKey);
      if (sanitized === '_staging_id' || sanitized === '_mirror_id') continue;
      if (validColumns.has(sanitized) && !insertCols.includes(sanitized)) {
        insertCols.push(sanitized);
        recordFieldMap[sanitized] = rawKey;
      }
    }

    const hasPayloadFallback = validColumns.has('payload');
    if (hasPayloadFallback && !insertCols.includes('payload')) {
      insertCols.push('payload');
    }

    // Insert in chunks of 500 rows
    const CHUNK_SIZE = 500;
    let totalInserted = 0;

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const valuePlaceholders: string[] = [];
      const values: any[] = [];
      let pIdx = 1;

      for (const rec of chunk) {
        const rowPlaceholders: string[] = [];

        // Operational envelope
        rowPlaceholders.push(`$${pIdx++}`);
        values.push(batchId);

        rowPlaceholders.push(`$${pIdx++}`);
        values.push(ruleBlockId);

        rowPlaceholders.push(`$${pIdx++}`);
        values.push('PENDING');

        // Dynamic fields
        for (let c = 3; c < insertCols.length; c++) {
          const colName = insertCols[c];
          if (colName === 'payload') {
            rowPlaceholders.push(`$${pIdx++}`);
            values.push(JSON.stringify(rec));
          } else {
            const rawKey = recordFieldMap[colName] || colName;
            const val = rec[rawKey] !== undefined ? rec[rawKey] : null;
            rowPlaceholders.push(`$${pIdx++}`);
            values.push(val);
          }
        }

        valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
      }

      const sql = `
        INSERT INTO ${mirrorName} (${insertCols.join(', ')})
        VALUES ${valuePlaceholders.join(',\n')}
        ON CONFLICT DO NOTHING
      `;

      await queryPg(sql, values);
      totalInserted += chunk.length;
    }

    return totalInserted;
  },

  /**
   * Retrieves column names for a mirror table.
   */
  async getMirrorColumns(mirrorName: string): Promise<string[]> {
    const sql = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 AND table_schema = 'public'
    `;
    const res = await queryPg(sql, [mirrorName]);
    return res.rows.map((r: any) => r.column_name);
  },

  /**
   * Automatically provisions schema-aligned mirror tables for all available or discovered tables in a database connection.
   */
  async provisionMirrorTablesForConnection(db: DatabaseConnection): Promise<string[]> {
    const createdMirrors: string[] = [];
    let tableNames: string[] = [];

    if (db.availableTables && db.availableTables.length > 0) {
      tableNames = [...db.availableTables];
    } else if (db.allowedTables && db.allowedTables.length > 0) {
      tableNames = [...db.allowedTables];
    } else {
      try {
        tableNames = await discoverTablesForDb(db);
      } catch (err: any) {
        console.warn(`[MirrorManager] Could not discover tables automatically for ${db.name}: ${err.message}`);
      }
    }

    if (tableNames.length === 0) {
      console.warn(`[MirrorManager] No tables specified or discovered for connection [${db.name}] (${db.id}). Skipping mirror provisioning.`);
      return [];
    }

    for (const tbl of tableNames) {
      try {
        const mirrorName = await this.ensureMirrorTableExists(db, tbl);
        createdMirrors.push(mirrorName);
      } catch (err: any) {
        console.warn(`[MirrorManager] Failed to provision mirror table for ${db.name}.${tbl}: ${err.message}`);
      }
    }

    console.log(`[MirrorManager] Successfully provisioned ${createdMirrors.length} mirror tables for database [${db.name}]: ${createdMirrors.join(', ')}`);
    return createdMirrors;
  },

  /**
   * Provisions mirror tables for all active database connections in the repository.
   */
  async provisionAllConnectedDbMirrors(): Promise<Record<string, string[]>> {
    const results: Record<string, string[]> = {};
    try {
      const dbs = await repo.getDatabases();
      for (const db of dbs) {
        const mirrors = await this.provisionMirrorTablesForConnection(db);
        results[db.id] = mirrors;
      }
    } catch (err: any) {
      console.warn(`[MirrorManager] Error in provisionAllConnectedDbMirrors: ${err.message}`);
    }
    return results;
  },

  /**
   * Cleans up mirror table rows for a completed batch.
   * Should be called after investigation job/task completion to prevent unbounded growth.
   */
  async cleanupMirrorBatch(mirrorName: string, batchId: string): Promise<number> {
    // Permanent FTP staged and long-term staging tables must never be purged
    if (isPermanentMirrorTable(mirrorName)) {
      return 0;
    }
    try {
      const result = await queryPg(
        `DELETE FROM ${mirrorName} WHERE _batch_id = $1`,
        [batchId]
      );
      const deletedCount = result.rowCount || 0;
      console.log(`[MirrorManager] Cleaned up ${deletedCount} rows from ${mirrorName} for batch ${batchId}.`);
      return deletedCount;
    } catch (err: any) {
      console.warn(`[MirrorManager] Cleanup failed for ${mirrorName} batch ${batchId}: ${err.message}`);
      return 0;
    }
  },

  /**
   * Removes stale mirror rows older than a specified age.
   * Prevents indefinite accumulation of transient reconciliation data.
   */
  async cleanupOldMirrorRows(mirrorName: string, maxAgeHours = 24): Promise<number> {
    // Permanent FTP staged and long-term staging tables must never be purged
    if (isPermanentMirrorTable(mirrorName)) {
      return 0;
    }
    try {
      const result = await queryPg(
        `DELETE FROM ${mirrorName} WHERE _mirrored_at < NOW() - INTERVAL '${maxAgeHours} hours'`
      );
      const deletedCount = result.rowCount || 0;
      if (deletedCount > 0) {
        console.log(`[MirrorManager] Trimmed ${deletedCount} stale rows (>${maxAgeHours}h) from ${mirrorName}.`);
      }
      return deletedCount;
    } catch (err: any) {
      console.warn(`[MirrorManager] Age-based cleanup failed for ${mirrorName}: ${err.message}`);
      return 0;
    }
  },

  /**
   * Clears the in-memory table existence cache.
   * Useful when mirror tables are dropped externally or during maintenance.
   */
  clearTableCache(): void {
    const size = tableCache.size;
    tableCache.clear();
    console.log(`[MirrorManager] Table cache cleared (${size} entries evicted).`);
  }
};
