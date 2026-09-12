import { getPostgresPool } from '../config/postgres.js';
import { eventService } from './events.js';
function mapTypeToPostgres(dataType) {
    switch ((dataType || '').toLowerCase()) {
        case 'number':
        case 'numeric':
        case 'decimal':
        case 'float':
        case 'integer':
        case 'int':
            return 'NUMERIC';
        case 'date':
        case 'timestamp':
        case 'datetime':
            return 'TIMESTAMPTZ';
        case 'boolean':
        case 'bool':
            return 'BOOLEAN';
        case 'json':
        case 'object':
        case 'array':
            return 'JSONB';
        default:
            return 'TEXT';
    }
}
function sanitizeColumnName(name) {
    return name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}
export const schemaMigrationService = {
    /**
     * Initializes audit tables and syncs central_transaction_repository with all global directory columns.
     */
    async initAndSyncCentralSchema() {
        const pool = getPostgresPool();
        const client = await pool.connect();
        let addedCount = 0;
        try {
            await client.query('BEGIN;');
            // 1. Create audit table
            await client.query(`
        CREATE TABLE IF NOT EXISTS schema_version_audit (
          id SERIAL PRIMARY KEY,
          version VARCHAR(50),
          action VARCHAR(50) NOT NULL,
          field_name VARCHAR(255) NOT NULL,
          data_type VARCHAR(100) NOT NULL,
          status VARCHAR(50) NOT NULL,
          error_details TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
            // 2. Ensure task_id column exists
            await client.query(`ALTER TABLE central_transaction_repository ADD COLUMN IF NOT EXISTS task_id VARCHAR(255);`);
            // 3. Query existing columns in central_transaction_repository
            const existingColsRes = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'central_transaction_repository';
      `);
            const existingCols = new Set(existingColsRes.rows.map(r => r.column_name.toLowerCase()));
            // 4. Query all standard directory records
            const dirRes = await client.query(`SELECT id, field_name, data_type FROM global_standard_directory;`);
            for (const row of dirRes.rows) {
                const colName = sanitizeColumnName(row.field_name);
                if (!existingCols.has(colName)) {
                    const pgType = mapTypeToPostgres(row.data_type);
                    await client.query(`ALTER TABLE central_transaction_repository ADD COLUMN IF NOT EXISTS "${colName}" ${pgType};`);
                    addedCount++;
                }
            }
            await client.query('COMMIT;');
            const countRes = await client.query(`
        SELECT count(*) as total
        FROM information_schema.columns 
        WHERE table_name = 'central_transaction_repository';
      `);
            const totalColumns = parseInt(countRes.rows[0].total, 10);
            console.log(`[SchemaMigration] Initialized central repository schema: ${addedCount} columns added, ${totalColumns} total columns.`);
            return { addedCount, totalColumns };
        }
        catch (err) {
            await client.query('ROLLBACK;');
            console.error('[SchemaMigration] Error syncing central schema:', err);
            throw err;
        }
        finally {
            client.release();
        }
    },
    /**
     * Adds a new field to global_standard_directory and executes ALTER TABLE on central_transaction_repository
     * inside an atomic PostgreSQL transaction. Automatically rolls back if DDL fails and alerts admins via SSE.
     */
    async addDirectoryField(field) {
        const pool = getPostgresPool();
        const client = await pool.connect();
        const colName = sanitizeColumnName(field.key);
        const pgType = mapTypeToPostgres(field.dataType);
        try {
            await client.query('BEGIN;');
            // 1. Insert into global_standard_directory
            const now = new Date();
            await client.query(`INSERT INTO global_standard_directory (
          id, field_name, display_name, description, data_type, is_required,
          is_standard, example_value, category, notes, user_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          field_name = EXCLUDED.field_name,
          display_name = EXCLUDED.display_name,
          description = EXCLUDED.description,
          data_type = EXCLUDED.data_type,
          is_required = EXCLUDED.is_required,
          is_standard = EXCLUDED.is_standard,
          example_value = EXCLUDED.example_value,
          category = EXCLUDED.category,
          notes = EXCLUDED.notes,
          updated_at = NOW();`, [
                field.id,
                field.key,
                field.label || field.key,
                field.description || '',
                field.dataType || 'string',
                !!field.required,
                field.isStandard !== undefined ? !!field.isStandard : true,
                field.exampleValue || '',
                field.category || 'General',
                field.notes || '',
                field.user_id || 'system',
                now,
                now
            ]);
            // 2. Perform transactional DDL on central_transaction_repository
            await client.query(`ALTER TABLE central_transaction_repository ADD COLUMN IF NOT EXISTS "${colName}" ${pgType};`);
            // 3. Record successful migration audit
            await client.query(`INSERT INTO schema_version_audit (action, field_name, data_type, status)
         VALUES ('ADD_COLUMN', $1, $2, 'SUCCESS');`, [colName, pgType]);
            await client.query('COMMIT;');
            eventService.broadcastEvent('schema:field_added', {
                id: field.id,
                key: field.key,
                pgType
            });
            return field;
        }
        catch (err) {
            await client.query('ROLLBACK;');
            // Record rollback in audit log using pool outside failed transaction
            try {
                await pool.query(`INSERT INTO schema_version_audit (action, field_name, data_type, status, error_details)
           VALUES ('ADD_COLUMN', $1, $2, 'ROLLED_BACK', $3);`, [colName, pgType, err.message]);
            }
            catch (auditErr) {
                console.error('[SchemaMigration] Could not log audit failure:', auditErr);
            }
            // Broadcast error alert to admin portal
            eventService.broadcastEvent('admin:schema_migration_failed', {
                action: 'ADD_COLUMN',
                fieldName: colName,
                dataType: pgType,
                error: err.message,
                timestamp: new Date().toISOString()
            });
            console.error(`[SchemaMigration] Transaction failed for ADD_COLUMN '${colName}'. Rolled back cleanly:`, err.message);
            throw new Error(`Schema migration failed for field '${field.key}': ${err.message}. Changes rolled back.`);
        }
        finally {
            client.release();
        }
    },
    /**
     * Updates an existing field in global_standard_directory and applies corresponding DDL migrations
     * (column rename or type cast) inside an atomic transaction. Rolls back on error.
     */
    async updateDirectoryField(id, updates) {
        const pool = getPostgresPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN;');
            // Fetch existing record
            const existingRes = await client.query('SELECT * FROM global_standard_directory WHERE id = $1 OR field_name = $1 LIMIT 1;', [id]);
            if (existingRes.rows.length === 0) {
                throw new Error(`Directory field '${id}' not found`);
            }
            const existing = existingRes.rows[0];
            const oldColName = sanitizeColumnName(existing.field_name);
            const newKey = updates.key || existing.field_name;
            const newColName = sanitizeColumnName(newKey);
            const newDataType = updates.dataType || existing.data_type;
            const newPgType = mapTypeToPostgres(newDataType);
            // Handle Column Rename if key changed
            if (oldColName !== newColName) {
                await client.query(`ALTER TABLE central_transaction_repository RENAME COLUMN "${oldColName}" TO "${newColName}";`);
            }
            // Handle Type Alteration if data type changed
            if (updates.dataType && updates.dataType !== existing.data_type) {
                await client.query(`ALTER TABLE central_transaction_repository ALTER COLUMN "${newColName}" TYPE ${newPgType} USING "${newColName}"::${newPgType};`);
            }
            // Update global_standard_directory table
            const updatedField = {
                id: existing.id,
                key: newKey,
                label: updates.label !== undefined ? updates.label : existing.display_name,
                description: updates.description !== undefined ? updates.description : existing.description,
                dataType: newDataType,
                required: updates.required !== undefined ? !!updates.required : !!existing.is_required,
                isStandard: updates.isStandard !== undefined ? !!updates.isStandard : !!existing.is_standard,
                exampleValue: updates.exampleValue !== undefined ? updates.exampleValue : existing.example_value,
                category: updates.category !== undefined ? updates.category : existing.category,
                notes: updates.notes !== undefined ? updates.notes : existing.notes,
                user_id: existing.user_id || 'system',
                created_at: existing.created_at?.toISOString() || new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            await client.query(`UPDATE global_standard_directory SET
          field_name = $1, display_name = $2, description = $3, data_type = $4,
          is_required = $5, is_standard = $6, example_value = $7, category = $8,
          notes = $9, updated_at = NOW()
        WHERE id = $10;`, [
                updatedField.key,
                updatedField.label,
                updatedField.description,
                updatedField.dataType,
                updatedField.required,
                updatedField.isStandard,
                updatedField.exampleValue,
                updatedField.category,
                updatedField.notes,
                existing.id
            ]);
            // Record successful migration audit
            await client.query(`INSERT INTO schema_version_audit (action, field_name, data_type, status)
         VALUES ('ALTER_COLUMN', $1, $2, 'SUCCESS');`, [newColName, newPgType]);
            await client.query('COMMIT;');
            eventService.broadcastEvent('schema:field_updated', updatedField);
            return updatedField;
        }
        catch (err) {
            await client.query('ROLLBACK;');
            try {
                await pool.query(`INSERT INTO schema_version_audit (action, field_name, data_type, status, error_details)
           VALUES ('ALTER_COLUMN', $1, 'UNKNOWN', 'ROLLED_BACK', $2);`, [id, err.message]);
            }
            catch (auditErr) {
                console.error('[SchemaMigration] Could not log audit failure:', auditErr);
            }
            eventService.broadcastEvent('admin:schema_migration_failed', {
                action: 'ALTER_COLUMN',
                fieldId: id,
                error: err.message,
                timestamp: new Date().toISOString()
            });
            console.error(`[SchemaMigration] Update failed for field '${id}'. Rolled back cleanly:`, err.message);
            throw new Error(`Schema update failed for field '${id}': ${err.message}. Rolled back to previous version.`);
        }
        finally {
            client.release();
        }
    },
    /**
     * Deletes a directory field and records migration audit
     */
    async deleteDirectoryField(id) {
        const pool = getPostgresPool();
        const client = await pool.connect();
        try {
            await client.query('BEGIN;');
            const existingRes = await client.query('SELECT * FROM global_standard_directory WHERE id = $1 OR field_name = $1 LIMIT 1;', [id]);
            if (existingRes.rows.length === 0) {
                await client.query('COMMIT;');
                return false;
            }
            const existing = existingRes.rows[0];
            const colName = sanitizeColumnName(existing.field_name);
            await client.query('DELETE FROM global_standard_directory WHERE id = $1;', [existing.id]);
            await client.query(`INSERT INTO schema_version_audit (action, field_name, data_type, status)
         VALUES ('DELETE_FIELD', $1, $2, 'SUCCESS');`, [colName, existing.data_type || 'TEXT']);
            await client.query('COMMIT;');
            eventService.broadcastEvent('schema:field_deleted', { id, fieldName: colName });
            return true;
        }
        catch (err) {
            await client.query('ROLLBACK;');
            console.error(`[SchemaMigration] Delete failed for field '${id}':`, err);
            throw err;
        }
        finally {
            client.release();
        }
    },
    /**
     * Retrieves schema version audit logs
     */
    async getAuditLogs(limit = 50) {
        const pool = getPostgresPool();
        const { rows } = await pool.query('SELECT * FROM schema_version_audit ORDER BY created_at DESC LIMIT $1;', [limit]);
        return rows.map(r => ({
            id: r.id,
            version: r.version || undefined,
            action: r.action,
            fieldName: r.field_name,
            dataType: r.data_type,
            status: r.status,
            errorDetails: r.error_details || undefined,
            createdAt: r.created_at?.toISOString() || new Date().toISOString()
        }));
    }
};
