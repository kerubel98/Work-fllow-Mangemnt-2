/**
 * CoordinateInjector — §8.2 VALUES Ingress Join Pattern
 *
 * Builds parameterized `SELECT q.row_num, e.* FROM (VALUES ...) AS q JOIN table e`
 * queries that preserve per-row `_row_number` coordinates.
 *
 * This is the mandatory replacement for naive `WHERE key IN (...)` queries
 * when two input rows share the same business key values (twin transactions).
 * Without row_num injection, both twins would receive the SAME mirror entry
 * and cannot be individually reconciled.
 *
 * §9.4: The row_num injected here must propagate through:
 *   task_dataset_transactions.row_number
 *   → VALUES ingress q.row_num
 *   → mirror._row_number
 *   → reconciliation JOIN ON (_task_id, _row_number)
 *
 * @see RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md §8.2, §9.4
 */
import { queryPg } from '../../config/postgres.js';
import { executeLiveQueryOnDb } from '../dbConnectionManager.js';
import { mirrorTableManager } from '../mirrorTableManager.js';
import { chunkRowsForValuesIngress, buildValuesIngressQuery } from '../externalDataQueryService.js';
export const coordinateInjector = {
    /**
     * Executes VALUES-ingress queries for an entire stage batch and streams
     * results into the typed UNLOGGED mirror table.
     *
     * Algorithm (§8.2 + §9.4):
     * 1. Chunk input rows respecting the 30,000-parameter ceiling (§Rule 11).
     * 2. For each chunk, build VALUES-ingress SQL injecting q.row_num.
     * 3. Execute against the external DB via dbConnectionManager.
     * 4. Attach `_row_number = row.row_num`, `_task_id`, `_batch_id`.
     * 5. Bulk-insert into `mirror_{db}_{table}` via mirrorTableManager.
     *
     * @param taskId        Identifies all rows in task_dataset_transactions.
     * @param batchId       Envelope tag for the current execution run.
     * @param ruleBlockId   The active validation rule block ID.
     * @param inputRows     Ordered input rows with `_row_number` and key fields.
     * @param keyMappings   How input fields map to external table columns.
     * @param db            External database connection.
     * @param targetTable   Physical table name in the external database.
     * @param selectedCols  Explicit columns to project (empty = all columns).
     */
    async ingestAndMirror(taskId, batchId, ruleBlockId, inputRows, keyMappings, db, targetTable, selectedCols = []) {
        const t0 = Date.now();
        if (inputRows.length === 0) {
            return { stagedCount: 0, mirrorTable: '', elapsedMs: 0 };
        }
        // Validate all rows carry _row_number
        const missing = inputRows.filter(r => r._row_number === undefined || r._row_number === null);
        if (missing.length > 0) {
            throw new Error(`[CoordinateInjector] §9.1 Violation: ${missing.length} input rows are missing ` +
                `_row_number. All rows MUST carry an immutable row coordinate.`);
        }
        // Provision the mirror table (CREATE UNLOGGED IF NOT EXISTS)
        const mirrorTable = await mirrorTableManager.ensureMirrorTableExists(db, targetTable);
        const dialect = db.type === 'MySQL' ? 'MySQL' : 'PostgreSQL';
        // Chunk rows to stay under 30,000-parameter ceiling (§Rule 11)
        const chunks = chunkRowsForValuesIngress(inputRows, keyMappings.length);
        let totalStaged = 0;
        for (const chunk of chunks) {
            const { sql, parameters } = buildValuesIngressQuery(chunk, keyMappings, targetTable, selectedCols, dialect);
            if (!sql)
                continue;
            // Execute against the external database
            let externalRows;
            try {
                const result = await executeLiveQueryOnDb(db, sql, parameters);
                externalRows = result.rows ?? [];
            }
            catch (err) {
                if (err.message && (err.message.includes('No local staged data found') || err.message.includes('does not exist'))) {
                    externalRows = [];
                }
                else {
                    throw new Error(`[CoordinateInjector] External query failed on ${db.name}.${targetTable}: ${err.message}`);
                }
            }
            if (externalRows.length === 0)
                continue;
            // Attach operational envelope: _row_number from q.row_num, _task_id, _batch_id
            const enrichedRows = externalRows.map(row => ({
                ...row,
                _row_number: Number(row.row_num ?? row._row_number),
                _task_id: taskId,
                _batch_id: batchId,
            }));
            // Bulk-insert into the UNLOGGED mirror (§2.6 mirror boundary)
            const inserted = await mirrorTableManager.bulkInsertToMirror(mirrorTable, batchId, ruleBlockId, enrichedRows);
            totalStaged += inserted;
        }
        return {
            stagedCount: totalStaged,
            mirrorTable,
            elapsedMs: Date.now() - t0,
        };
    },
    /**
     * Fetches the keys needed for the next downstream stage directly from
     * the mirror table — avoiding pulling thousands of rows into Node.js memory.
     *
     * §7.6 Step 3: Instead of passing JS objects between stages, the resolver
     * queries the mirror for rows where _validation_action = 'CONTINUE' and
     * returns their key tuples for the next stage's ingress query.
     *
     * @param mirrorTable   Mirror table from which to extract keys.
     * @param batchId       Current batch scope.
     * @param ruleBlockId   Current rule block scope.
     * @param keyColumns    Column names to extract for downstream use.
     */
    async extractDownstreamKeys(mirrorTable, batchId, ruleBlockId, keyColumns) {
        if (keyColumns.length === 0)
            return [];
        const safeColumns = keyColumns
            .map(c => c.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
            .map(c => `"${c}"`);
        const sql = `
      SELECT ${safeColumns.join(', ')}, "_row_number", "_task_id"
      FROM ${mirrorTable}
      WHERE _batch_id = $1
        AND _rule_block_id = $2
        AND _validation_action = 'CONTINUE'
      ORDER BY _row_number;
    `;
        try {
            const res = await queryPg(sql, [batchId, ruleBlockId]);
            return res.rows ?? [];
        }
        catch (err) {
            console.warn(`[CoordinateInjector] extractDownstreamKeys failed: ${err.message}`);
            return [];
        }
    },
};
