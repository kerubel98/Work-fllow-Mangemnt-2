/**
 * Dedicated Typed Mirror Table Manager
 * Provisions schema-aligned UNLOGGED mirror tables in PostgreSQL per external database table.
 * Standardizes operational envelope columns and enables ultra-fast set-based relational joins.
 */
import { getTableColumns, discoverTablesForDb } from './dbConnectionManager.js';
import { queryPg } from '../config/postgres.js';
import { repo } from '../store/repository.js';
const tableCache = new Set();
/**
 * Maps database-specific types to standard PostgreSQL types.
 */
function mapToPgType(externalType) {
    const t = externalType.toUpperCase().trim();
    if (t.includes('INT'))
        return 'BIGINT';
    if (t.includes('DECIMAL') || t.includes('NUMERIC') || t.includes('MONEY') || t.includes('FLOAT') || t.includes('DOUBLE'))
        return 'NUMERIC(18, 4)';
    if (t.includes('BOOL'))
        return 'BOOLEAN';
    if (t.includes('DATE') || t.includes('TIME'))
        return 'TIMESTAMPTZ';
    if (t.includes('JSON'))
        return 'JSONB';
    if (t.includes('TEXT') || t.includes('CLOB'))
        return 'TEXT';
    // Default to VARCHAR(255) for general string types
    return 'VARCHAR(255)';
}
function sanitizeIdentifier(name) {
    return name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 50);
}
export const mirrorTableManager = {
    /**
     * Generates a deterministic, standard mirror table name.
     */
    getMirrorTableName(dbName, tableName) {
        const safeDb = sanitizeIdentifier(dbName);
        const safeTable = sanitizeIdentifier(tableName);
        return `mirror_${safeDb}_${safeTable}`;
    },
    /**
     * Automatically inspects the external table schema and creates an UNLOGGED
     * typed mirror table in PostgreSQL if it doesn't already exist.
     */
    async ensureMirrorTableExists(db, tableName = 'transactions') {
        const dbName = db ? (db.name || db.id) : 'local';
        const mirrorName = this.getMirrorTableName(dbName, tableName);
        if (tableCache.has(mirrorName)) {
            return mirrorName;
        }
        // Fast-path: Check if mirror table already exists in PostgreSQL
        try {
            const checkRes = await queryPg(`SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public'`, [mirrorName]);
            if (checkRes.rows && checkRes.rows.length > 0) {
                tableCache.add(mirrorName);
                return mirrorName;
            }
        }
        catch { }
        // Inspect columns from external target database
        let columns = [];
        if (db) {
            try {
                columns = await getTableColumns(db, tableName);
            }
            catch (err) {
                console.warn(`[MirrorManager] Could not inspect external columns for ${tableName}: ${err.message}. Using flexible JSONB envelope.`);
            }
        }
        // Build column definitions
        const colDefs = [
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
            if (safeCol.startsWith('_') || safeCol === 'payload')
                continue;
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
            await queryPg(`ALTER TABLE ${mirrorName} ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb;`);
        }
        catch { }
        tableCache.add(mirrorName);
        console.log(`[MirrorManager] Mirror table verified: ${mirrorName} with ${columns.length} columns.`);
        return mirrorName;
    },
    /**
     * Bulk streams external query results directly into the typed mirror table.
     */
    async bulkInsertToMirror(mirrorName, batchId, ruleBlockId, records) {
        if (!records || records.length === 0)
            return 0;
        // Discover target mirror table physical columns
        const colQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1 AND table_schema = 'public'
    `;
        const colRes = await queryPg(colQuery, [mirrorName]);
        const validColumns = new Set(colRes.rows.map((r) => r.column_name));
        // Normalize keys across record rows
        const sample = records[0];
        const insertCols = ['_batch_id', '_rule_block_id', '_validation_status'];
        const recordFieldMap = {};
        for (const rawKey of Object.keys(sample)) {
            const sanitized = sanitizeIdentifier(rawKey);
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
            const valuePlaceholders = [];
            const values = [];
            let pIdx = 1;
            for (const rec of chunk) {
                const rowPlaceholders = [];
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
                    }
                    else {
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
      `;
            await queryPg(sql, values);
            totalInserted += chunk.length;
        }
        return totalInserted;
    },
    /**
     * Retrieves column names for a mirror table.
     */
    async getMirrorColumns(mirrorName) {
        const sql = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 AND table_schema = 'public'
    `;
        const res = await queryPg(sql, [mirrorName]);
        return res.rows.map((r) => r.column_name);
    },
    /**
     * Automatically provisions schema-aligned mirror tables for all available or discovered tables in a database connection.
     */
    async provisionMirrorTablesForConnection(db) {
        const createdMirrors = [];
        let tableNames = [];
        if (db.availableTables && db.availableTables.length > 0) {
            tableNames = [...db.availableTables];
        }
        else if (db.allowedTables && db.allowedTables.length > 0) {
            tableNames = [...db.allowedTables];
        }
        else {
            try {
                tableNames = await discoverTablesForDb(db);
            }
            catch (err) {
                console.warn(`[MirrorManager] Could not discover tables automatically for ${db.name}: ${err.message}`);
            }
        }
        if (tableNames.length === 0) {
            // Fallback: ensure default transactions mirror table for this db
            tableNames = ['transactions'];
        }
        for (const tbl of tableNames) {
            try {
                const mirrorName = await this.ensureMirrorTableExists(db, tbl);
                createdMirrors.push(mirrorName);
            }
            catch (err) {
                console.warn(`[MirrorManager] Failed to provision mirror table for ${db.name}.${tbl}: ${err.message}`);
            }
        }
        console.log(`[MirrorManager] Successfully provisioned ${createdMirrors.length} mirror tables for database [${db.name}]: ${createdMirrors.join(', ')}`);
        return createdMirrors;
    },
    /**
     * Provisions mirror tables for all active database connections in the repository.
     */
    async provisionAllConnectedDbMirrors() {
        const results = {};
        try {
            const dbs = await repo.getDatabases();
            for (const db of dbs) {
                const mirrors = await this.provisionMirrorTablesForConnection(db);
                results[db.id] = mirrors;
            }
        }
        catch (err) {
            console.warn(`[MirrorManager] Error in provisionAllConnectedDbMirrors: ${err.message}`);
        }
        return results;
    },
    /**
     * Cleans up mirror table rows for a completed batch.
     * Should be called after investigation job/task completion to prevent unbounded growth.
     */
    async cleanupMirrorBatch(mirrorName, batchId) {
        try {
            const result = await queryPg(`DELETE FROM ${mirrorName} WHERE _batch_id = $1`, [batchId]);
            const deletedCount = result.rowCount || 0;
            console.log(`[MirrorManager] Cleaned up ${deletedCount} rows from ${mirrorName} for batch ${batchId}.`);
            return deletedCount;
        }
        catch (err) {
            console.warn(`[MirrorManager] Cleanup failed for ${mirrorName} batch ${batchId}: ${err.message}`);
            return 0;
        }
    },
    /**
     * Removes stale mirror rows older than a specified age.
     * Prevents indefinite accumulation of transient reconciliation data.
     */
    async cleanupOldMirrorRows(mirrorName, maxAgeHours = 24) {
        try {
            const result = await queryPg(`DELETE FROM ${mirrorName} WHERE _mirrored_at < NOW() - INTERVAL '${maxAgeHours} hours'`);
            const deletedCount = result.rowCount || 0;
            if (deletedCount > 0) {
                console.log(`[MirrorManager] Trimmed ${deletedCount} stale rows (>${maxAgeHours}h) from ${mirrorName}.`);
            }
            return deletedCount;
        }
        catch (err) {
            console.warn(`[MirrorManager] Age-based cleanup failed for ${mirrorName}: ${err.message}`);
            return 0;
        }
    },
    /**
     * Clears the in-memory table existence cache.
     * Useful when mirror tables are dropped externally or during maintenance.
     */
    clearTableCache() {
        const size = tableCache.size;
        tableCache.clear();
        console.log(`[MirrorManager] Table cache cleared (${size} entries evicted).`);
    }
};
