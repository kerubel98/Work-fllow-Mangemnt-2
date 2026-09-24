import { getPostgresPool, isPostgresConnected } from '../config/postgres.js';
import { repo } from '../store/repository.js';
import { resolveCanonicalKey } from './canonicalKeyResolver.js';
export const reconciliationService = {
    /**
     * Persists external batch results into the transient investigation mirror in PostgreSQL.
     */
    async persistExternalMirrorBatch(investigationId, dataSourceId, externalSystemId, records) {
        if (!records.length || !isPostgresConnected)
            return records.length;
        const pool = getPostgresPool();
        const CHUNK_SIZE = 500;
        let persisted = 0;
        for (let i = 0; i < records.length; i += CHUNK_SIZE) {
            const chunk = records.slice(i, i + CHUNK_SIZE);
            const values = [];
            const placeholders = [];
            chunk.forEach((rec, idx) => {
                const offset = idx * 6;
                const id = `${investigationId}:${dataSourceId}:${rec.recordKey}`;
                placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
                values.push(id, investigationId, dataSourceId, externalSystemId, rec.recordKey, JSON.stringify(rec.canonicalPayload || {}));
            });
            const sql = `
        INSERT INTO investigation_external_mirror (id, investigation_id, data_source_id, external_system_id, record_key, canonical_payload)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (id) DO UPDATE SET
          canonical_payload = EXCLUDED.canonical_payload,
          retrieved_at = NOW();
      `;
            await pool.query(sql, values);
            persisted += chunk.length;
        }
        return persisted;
    },
    /**
     * Executes set-based relational reconciliation in PostgreSQL.
     * Compares task transactions against mirrored external records using indexed SQL joins.
     */
    async reconcileBatchInDatabase(investigationId, batchId, dataSourceId, lookupKeyField, conditionCheck, dualSourceCondition, actionConfig) {
        const startTime = Date.now();
        if (isPostgresConnected) {
            const pool = getPostgresPool();
            const keys = Array.isArray(lookupKeyField)
                ? lookupKeyField.filter(Boolean)
                : String(lookupKeyField || '').split(',').map(s => s.trim()).filter(Boolean);
            const resolved = resolveCanonicalKey({ explicitKey: keys[0] });
            const primaryKey = resolved.primaryKey;
            const keyJoinSql = keys.length > 1
                ? `m.record_key = (${keys.map(k => `COALESCE(t.canonical_data->>'${k.replace(/'/g, "''")}', '')`).join(" || '::' || ")})`
                : `m.record_key = (t.canonical_data->>$3)`;
            // PostgreSQL Set-based UPDATE ... FROM Join
            let conditionSql = 'm.record_key IS NOT NULL';
            const queryParams = [investigationId, dataSourceId, primaryKey, batchId];
            if (dualSourceCondition) {
                const dsc = dualSourceCondition;
                const comp = dsc.comparator || 'EQUALS';
                const margin = Number.isFinite(Number(dsc.toleranceMargin)) ? Number(dsc.toleranceMargin) : 0.00;
                const getOperandSql = (op) => {
                    const col = op.field.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                    if (op.origin === 'INPUT') {
                        return `COALESCE((t.canonical_data->>'${col}'), (t.raw_data->>'${col}'))`;
                    }
                    if (op.origin === 'LEG' && op.legKey) {
                        const parts = op.legKey.split('.').map(p => `'${p.trim().replace(/'/g, "''")}'`);
                        return `(m.canonical_payload #>> ARRAY[${parts.join(', ')}, '${col}'])`;
                    }
                    return `(m.canonical_payload->>'${col}')`;
                };
                const operandASql = getOperandSql(dsc.sourceA);
                const operandBSql = getOperandSql(dsc.sourceB);
                if (comp === 'EQUALS' || comp === '==' || comp === '=') {
                    conditionSql = `m.record_key IS NOT NULL AND LOWER(COALESCE(${operandASql}, '')) = LOWER(COALESCE(${operandBSql}, ''))`;
                }
                else if (comp === 'NOT_EQUALS' || comp === '!=' || comp === '<>') {
                    conditionSql = `m.record_key IS NOT NULL AND LOWER(COALESCE(${operandASql}, '')) != LOWER(COALESCE(${operandBSql}, ''))`;
                }
                else if (comp === 'NUMERIC_TOLERANCE') {
                    conditionSql = `m.record_key IS NOT NULL AND ABS(COALESCE((${operandASql})::numeric, 0) - COALESCE((${operandBSql})::numeric, 0)) <= ${margin}`;
                }
            }
            else if (conditionCheck) {
                queryParams.push(conditionCheck.expectedValue);
                conditionSql = `m.record_key IS NOT NULL AND (m.canonical_payload->>'${conditionCheck.field}') = $5`;
            }
            const passAction = actionConfig?.onPassAction || 'CONTINUE';
            const failAction = actionConfig?.onFailAction || 'STOP';
            const updateSql = `
        WITH unique_task_source AS (
          SELECT DISTINCT ON (row_number) row_number, canonical_data, raw_data
          FROM task_dataset_transactions
          WHERE task_id = $1
          ORDER BY row_number
        )
        UPDATE investigation_transactions it
        SET 
          final_result = CASE 
            WHEN ${conditionSql} THEN 'PASS'
            ELSE 'FAIL'
          END,
          final_action = CASE 
            WHEN ${conditionSql} THEN '${passAction}'
            ELSE '${failAction}'
          END,
          investigation_status = CASE 
            WHEN ${conditionSql} THEN 'VERIFIED_MATCH'
            ELSE 'FLAGGED_DISCREPANCY'
          END,
          status_flag_text = CASE 
            WHEN ${conditionSql} THEN 'Verified Match'
            ELSE 'External Discrepancy'
          END,
          status_flag_color = CASE 
            WHEN ${conditionSql} THEN 'emerald'
            ELSE 'rose'
          END,
          updated_at = NOW()
        FROM unique_task_source t
        LEFT JOIN investigation_external_mirror m 
          ON m.investigation_id = $1 
         AND m.data_source_id = $2 
         AND ${keyJoinSql}
        WHERE it.task_id = $1 
          AND it.batch_id = $4 
          AND (
            it.transaction_id = t.row_number::text 
            OR it.transaction_id = (t.canonical_data->>'transaction_id')
            OR it.transaction_id = (t.canonical_data->>$3)
            ${keys.length > 1 ? `OR it.transaction_id = (${keys.map(k => `COALESCE(t.canonical_data->>'${k.replace(/'/g, "''")}', '')`).join(" || '::' || ")})` : ''}
          );
      `;
            await pool.query(updateSql, queryParams);
            // Aggregate outcome counts
            const countRes = await pool.query(`SELECT 
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE final_result = 'PASS')::int as passes,
           COUNT(*) FILTER (WHERE final_result = 'FAIL')::int as fails,
           COUNT(*) FILTER (WHERE final_result = 'ERROR')::int as errors
         FROM investigation_transactions
         WHERE task_id = $1 AND batch_id = $2;`, [investigationId, batchId]);
            const counts = countRes.rows[0] || { total: 0, passes: 0, fails: 0, errors: 0 };
            const durationMs = Date.now() - startTime;
            return {
                investigationId,
                batchId,
                totalTransactions: counts.total,
                passCount: counts.passes,
                failCount: counts.fails,
                errorCount: counts.errors,
                durationMs
            };
        }
        // Fallback: In-memory reconciliation
        const txs = await repo.getInvestigationTransactionsByTaskId(investigationId);
        const batchTxs = txs.filter(t => t.batchId === batchId);
        let passes = 0;
        let fails = 0;
        for (const tx of batchTxs) {
            tx.finalResult = tx.finalResult || 'PASS';
            tx.finalAction = tx.finalResult === 'PASS'
                ? (actionConfig?.onPassAction || 'CONTINUE')
                : (actionConfig?.onFailAction || 'STOP');
            tx.investigationStatus = tx.finalResult === 'PASS' ? 'VERIFIED_MATCH' : 'FLAGGED_DISCREPANCY';
            await repo.createInvestigationTransaction(tx);
            if (tx.finalResult === 'PASS')
                passes++;
            else
                fails++;
        }
        return {
            investigationId,
            batchId,
            totalTransactions: batchTxs.length,
            passCount: passes,
            failCount: fails,
            errorCount: 0,
            durationMs: Date.now() - startTime
        };
    }
};
