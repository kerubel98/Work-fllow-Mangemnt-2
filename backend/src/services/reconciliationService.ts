import { getPostgresPool, isPostgresConnected } from '../config/postgres.js';
import { repo } from '../store/repository.js';
import { InvestigationTransaction, DualSourceCondition, PipelineAction } from '../types.js';
import { resolveCanonicalKey } from './canonicalKeyResolver.js';
import { STATUS_FLAG_COLORS, DEFAULT_PIPELINE_ACTIONS } from '../constants/statusColors.js';

export interface MirrorRecord {
  recordKey: string;
  canonicalPayload: Record<string, any>;
  rawPayload?: Record<string, any>;
}

export interface BatchReconciliationResult {
  investigationId: string;
  batchId: string;
  totalTransactions: number;
  passCount: number;
  failCount: number;
  errorCount: number;
  durationMs: number;
}

export const reconciliationService = {
  /**
   * Persists external batch results into the transient investigation mirror in PostgreSQL.
   */
  async persistExternalMirrorBatch(
    investigationId: string,
    dataSourceId: string,
    externalSystemId: string,
    records: MirrorRecord[]
  ): Promise<number> {
    if (!records.length || !isPostgresConnected) return records.length;
    const pool = getPostgresPool();

    const CHUNK_SIZE = 500;
    let persisted = 0;

    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const values: any[] = [];
      const placeholders: string[] = [];

      chunk.forEach((rec, idx) => {
        const offset = idx * 6;
        const id = `${investigationId}:${dataSourceId}:${rec.recordKey}`;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
        values.push(
          id,
          investigationId,
          dataSourceId,
          externalSystemId,
          rec.recordKey,
          JSON.stringify(rec.canonicalPayload || {})
        );
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
  async reconcileBatchInDatabase(
    investigationId: string,
    batchId: string,
    dataSourceId: string,
    lookupKeyField: string | string[],
    conditionCheck?: { field: string; expectedValue: any },
    dualSourceCondition?: DualSourceCondition,
    actionConfig?: {
      onPassAction?: PipelineAction;
      onFailAction?: PipelineAction;
      onErrorAction?: PipelineAction;
    }
  ): Promise<BatchReconciliationResult> {
    const startTime = Date.now();

    if (isPostgresConnected) {
      const pool = getPostgresPool();

      const rawKeys = Array.isArray(lookupKeyField)
        ? lookupKeyField.filter(Boolean)
        : String(lookupKeyField || '').split(',').map(s => s.trim()).filter(Boolean);

      // Sanitize keys strictly to prevent JSON path and SQL injection (BUG-04)
      const keys = rawKeys.map(k => {
        const clean = String(k).trim().replace(/[^a-zA-Z0-9_]/g, '');
        if (!clean) {
          throw new Error(`[ReconciliationService] Invalid field name in lookupKeyField: "${k}"`);
        }
        return clean;
      });

      const resolved = resolveCanonicalKey({ explicitKey: keys[0] });
      const primaryKey = resolved.primaryKey;
      const keyJoinSql = keys.length > 1
        ? `m.record_key = (${keys.map(k => `COALESCE(t.canonical_data->>'${k}', '')`).join(" || '::' || ")})`
        : `m.record_key = (t.canonical_data->>$3)`;

      // PostgreSQL Set-based UPDATE ... FROM Join
      let conditionSql = 'm.record_key IS NOT NULL';
      const queryParams: any[] = [investigationId, dataSourceId, primaryKey, batchId];

      if (dualSourceCondition) {
        const dsc = dualSourceCondition;
        const comp = dsc.comparator || 'EQUALS';
        const margin = Number.isFinite(Number(dsc.toleranceMargin)) ? Number(dsc.toleranceMargin) : 0.00;

        const getOperandSql = (op: typeof dsc.sourceA) => {
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
        } else if (comp === 'NOT_EQUALS' || comp === '!=' || comp === '<>') {
          conditionSql = `m.record_key IS NOT NULL AND LOWER(COALESCE(${operandASql}, '')) != LOWER(COALESCE(${operandBSql}, ''))`;
        } else if (comp === 'NUMERIC_TOLERANCE') {
          conditionSql = `m.record_key IS NOT NULL AND ABS(COALESCE((${operandASql})::numeric, 0) - COALESCE((${operandBSql})::numeric, 0)) <= ${margin}`;
        }
      } else if (conditionCheck) {
        queryParams.push(conditionCheck.expectedValue);
        conditionSql = `m.record_key IS NOT NULL AND (m.canonical_payload->>'${conditionCheck.field}') = $5`;
      }

      const passAction = actionConfig?.onPassAction || DEFAULT_PIPELINE_ACTIONS.ON_PASS;
      const failAction = actionConfig?.onFailAction || DEFAULT_PIPELINE_ACTIONS.ON_FAIL;

      // Diagnostic Taint Protection: do not mutate records carrying _isDiagnosticOnly (BUG-01)
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
            WHEN COALESCE((t.canonical_data->>'_isDiagnosticOnly')::boolean, (t.raw_data->>'_isDiagnosticOnly')::boolean, false) = true THEN 'PASS'
            WHEN ${conditionSql} THEN 'PASS'
            ELSE 'FAIL'
          END,
          final_action = CASE 
            WHEN COALESCE((t.canonical_data->>'_isDiagnosticOnly')::boolean, (t.raw_data->>'_isDiagnosticOnly')::boolean, false) = true THEN 'CONTINUE'
            WHEN ${conditionSql} THEN '${passAction}'
            ELSE '${failAction}'
          END,
          investigation_status = CASE 
            WHEN COALESCE((t.canonical_data->>'_isDiagnosticOnly')::boolean, (t.raw_data->>'_isDiagnosticOnly')::boolean, false) = true THEN 'DIAGNOSTIC_BYPASSED'
            WHEN ${conditionSql} THEN 'VERIFIED_MATCH'
            ELSE 'FLAGGED_DISCREPANCY'
          END,
          status_flag_text = CASE 
            WHEN COALESCE((t.canonical_data->>'_isDiagnosticOnly')::boolean, (t.raw_data->>'_isDiagnosticOnly')::boolean, false) = true THEN 'Diagnostic Bypass'
            WHEN ${conditionSql} THEN 'Verified Match'
            ELSE 'External Discrepancy'
          END,
          status_flag_color = CASE 
            WHEN COALESCE((t.canonical_data->>'_isDiagnosticOnly')::boolean, (t.raw_data->>'_isDiagnosticOnly')::boolean, false) = true THEN '${STATUS_FLAG_COLORS.DIAGNOSTIC}'
            WHEN ${conditionSql} THEN '${STATUS_FLAG_COLORS.PASS}'
            ELSE '${STATUS_FLAG_COLORS.FAIL}'
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
            ${keys.length > 1 ? `OR it.transaction_id = (${keys.map(k => `COALESCE(t.canonical_data->>'${k}', '')`).join(" || '::' || ")})` : ''}
          );
      `;

      await pool.query(updateSql, queryParams);

      // Aggregate outcome counts
      const countRes = await pool.query(
        `SELECT 
           COUNT(*)::int as total,
           COUNT(*) FILTER (WHERE final_result = 'PASS')::int as passes,
           COUNT(*) FILTER (WHERE final_result = 'FAIL')::int as fails,
           COUNT(*) FILTER (WHERE final_result = 'ERROR')::int as errors
         FROM investigation_transactions
         WHERE task_id = $1 AND batch_id = $2;`,
        [investigationId, batchId]
      );

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

    // Fallback: In-memory circuit breaker when PostgreSQL is disconnected (BUG-03)
    // Strictly adheres to Rule: Never silently mark un-reconciled transactions as PASS
    const txs = await repo.getInvestigationTransactionsByTaskId(investigationId);
    const batchTxs = txs.filter(t => t.batchId === batchId);
    const errorAction = actionConfig?.onErrorAction || DEFAULT_PIPELINE_ACTIONS.ON_ERROR;

    for (const tx of batchTxs) {
      tx.finalResult = 'PAUSED_DB_OFFLINE';
      tx.finalAction = errorAction as PipelineAction;
      tx.investigationStatus = 'CIRCUIT_BREAKER_PAUSED';
      tx.statusFlagText = 'PostgreSQL Offline (Circuit Breaker)';
      tx.statusFlagColor = STATUS_FLAG_COLORS.WARNING;
      await repo.createInvestigationTransaction(tx);
    }

    return {
      investigationId,
      batchId,
      totalTransactions: batchTxs.length,
      passCount: 0,
      failCount: 0,
      errorCount: batchTxs.length,
      durationMs: Date.now() - startTime
    };
  },

  /**
   * §9.5 Set-Based Reconciliation Joins on Universal Coordinates (_task_id, _row_number)
   *
   * Reconciles task_dataset_transactions directly against a typed UNLOGGED mirror table
   * using the immutable coordinate join:
   *   ON tdt.task_id = m._task_id AND tdt.row_number = m._row_number
   *
   * Uses DISTINCT ON (m._task_id, m._row_number) to enforce join determinism (Rule 13).
   *
   * @param taskId        PostgreSQL task ID
   * @param batchId       Envelope batch ID
   * @param ruleBlockId   Validation rule block ID
   * @param mirrorTable   Physical mirror table name (e.g. mirror_core_auth)
   * @param stageId       Current stage identifier
   */
  async reconcileByRowNumber(
    taskId: string,
    batchId: string,
    ruleBlockId: string,
    mirrorTable: string,
    stageId: string = '',
    workflowId: string = 'default',
    targetTable: string = ''
  ): Promise<{
    taskId: string;
    batchId: string;
    totalUpdated: number;
    passCount: number;
    failCount: number;
    durationMs: number;
  }> {
    const startTime = Date.now();
    if (!isPostgresConnected) {
      return { taskId, batchId, totalUpdated: 0, passCount: 0, failCount: 0, durationMs: 0 };
    }

    const pool = getPostgresPool();
    const safeMirror = mirrorTable.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const effectiveTable = targetTable || safeMirror.replace(/^mirror_/, '');

    try {
      // Deterministic join using GROUP BY to aggregate multi-leg mirror rows and avoid multiplication (Rule 13)
      const updateSql = `
        WITH grouped_mirror AS (
          SELECT
            _task_id,
            _row_number,
            (CASE WHEN bool_or(_validation_status = 'FAIL') THEN 'FAIL' ELSE 'PASS' END) AS _validation_status,
            (CASE WHEN bool_or(_validation_status = 'FAIL') THEN 'STOP' ELSE 'CONTINUE' END) AS _validation_action,
            jsonb_agg(
              to_jsonb(m) - '_batch_id' - '_rule_block_id' - '_task_id' - '_mirrored_at' - '_validation_status' - '_validation_action' - '_validation_details'
            ) AS mirror_legs
          FROM ${safeMirror} m
          WHERE _batch_id = $1
            AND _rule_block_id = $2
            AND _task_id = $3
          GROUP BY _task_id, _row_number
        )
        UPDATE task_dataset_transactions tdt
        SET
          returned_data = jsonb_set(
            COALESCE(tdt.returned_data, '{}'::jsonb) || jsonb_build_object(
              $6::text,
              COALESCE(tdt.returned_data->$6::text, '{}'::jsonb)
            ),
            ARRAY[$6::text, $7::text],
            gm.mirror_legs,
            true
          ),
          canonical_data = (tdt.canonical_data - 'auditTrail' - 'stageResults') || jsonb_build_object(
            '_validation_status', gm._validation_status,
            'reconciliation_status', gm._validation_status,
            '_validation_action', gm._validation_action,
            '_validation_details', jsonb_build_object(
              'stage_id', $4::text,
              'rule_block_id', $2::text,
              'mirror_table', $5::text,
              'legs_count', jsonb_array_length(gm.mirror_legs),
              'reconciled_at', NOW()
            )
          )
        FROM grouped_mirror gm
        WHERE tdt.task_id = gm._task_id
          AND tdt.row_number = gm._row_number;
      `;

      const res = await pool.query(updateSql, [batchId, ruleBlockId, taskId, stageId, safeMirror, workflowId || 'default', effectiveTable]);
      const totalUpdated = res.rowCount || 0;

      const countSql = `
        SELECT
          COUNT(*) FILTER (WHERE canonical_data->>'_validation_status' = 'PASS')::int AS pass_count,
          COUNT(*) FILTER (WHERE canonical_data->>'_validation_status' = 'FAIL')::int AS fail_count
        FROM task_dataset_transactions
        WHERE task_id = $1;
      `;
      const countRes = await pool.query(countSql, [taskId]);
      const passCount = countRes.rows[0]?.pass_count || 0;
      const failCount = countRes.rows[0]?.fail_count || 0;

      return {
        taskId,
        batchId,
        totalUpdated,
        passCount,
        failCount,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      console.warn(`[ReconciliationService] reconcileByRowNumber notice: ${err.message}`);
      return { taskId, batchId, totalUpdated: 0, passCount: 0, failCount: 0, durationMs: Date.now() - startTime };
    }
  }
};
