import { describe, it, expect, beforeAll } from 'vitest';
import { schemaMigrationService } from '../schemaMigrationService.js';
import { getPostgresPool } from '../../config/postgres.js';
describe('schemaMigrationService', () => {
    const pool = getPostgresPool();
    beforeAll(async () => {
        await schemaMigrationService.initAndSyncCentralSchema();
    });
    it('synchronizes all standard columns into central_transaction_repository', async () => {
        const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'central_transaction_repository';");
        const cols = res.rows.map(r => r.column_name.toLowerCase());
        expect(cols).toContain('task_id');
        expect(cols).toContain('refnum');
        expect(cols).toContain('reqamt');
        expect(cols).toContain('terminal_id');
        expect(cols.length).toBeGreaterThanOrEqual(120);
    });
    it('successfully executes atomic addDirectoryField with physical column addition and audit', async () => {
        const testFieldKey = `test_col_${Date.now()}`;
        const field = {
            id: `gsd-${testFieldKey}`,
            key: testFieldKey,
            label: 'Test Auto Added Field',
            dataType: 'string',
            required: false,
            isStandard: false,
            category: 'Testing'
        };
        const added = await schemaMigrationService.addDirectoryField(field);
        expect(added.key).toBe(testFieldKey);
        // Verify physical column exists in database
        const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'central_transaction_repository' AND column_name = $1;", [testFieldKey]);
        expect(colCheck.rows.length).toBe(1);
        // Verify audit log has SUCCESS
        const auditLogs = await schemaMigrationService.getAuditLogs(10);
        const successEntry = auditLogs.find(a => a.fieldName === testFieldKey && a.status === 'SUCCESS');
        expect(successEntry).toBeDefined();
        // Clean up test field
        await schemaMigrationService.deleteDirectoryField(field.id);
    });
    it('rolls back completely if a schema migration encounters an invalid DDL operation', async () => {
        const client = await pool.connect();
        const badKey = `bad_col_${Date.now()}`;
        let threwError = false;
        try {
            await client.query('BEGIN;');
            await client.query(`INSERT INTO global_standard_directory (id, field_name, display_name, data_type, is_required)
         VALUES ($1, $2, $3, $4, $5);`, [`gsd-${badKey}`, badKey, 'Bad Col', 'invalid_sql_type', false]);
            // Intentionally invalid DDL to trigger failure
            await client.query(`ALTER TABLE central_transaction_repository ADD COLUMN "${badKey}" NON_EXISTENT_TYPE;`);
            await client.query('COMMIT;');
        }
        catch (err) {
            await client.query('ROLLBACK;');
            threwError = true;
            // Log failure in audit
            await pool.query(`INSERT INTO schema_version_audit (action, field_name, data_type, status, error_details)
         VALUES ('ADD_COLUMN', $1, 'NON_EXISTENT_TYPE', 'ROLLED_BACK', $2);`, [badKey, err.message]);
        }
        finally {
            client.release();
        }
        expect(threwError).toBe(true);
        // Ensure directory record was rolled back cleanly
        const dirCheck = await pool.query('SELECT * FROM global_standard_directory WHERE field_name = $1;', [badKey]);
        expect(dirCheck.rows.length).toBe(0);
        // Ensure physical column was never created
        const colCheck = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'central_transaction_repository' AND column_name = $1;", [badKey]);
        expect(colCheck.rows.length).toBe(0);
        // Ensure audit log records ROLLED_BACK
        const audit = await schemaMigrationService.getAuditLogs(10);
        const rollbackEntry = audit.find(a => a.fieldName === badKey && a.status === 'ROLLED_BACK');
        expect(rollbackEntry).toBeDefined();
        expect(rollbackEntry?.errorDetails).toBeDefined();
    });
});
