/**
 * ReconciliationMethod — §6.5 RECONCILIATION Validation Method
 *
 * Operational Goal: Reads from the upstream mirror (staged by INGESTION_SEARCH)
 * or local records, and prepares data for multi-source balancing.
 * Conforms strictly to §2.1 & §2.7:
 *   - Focuses on acquiring and aligning data records.
 *   - Does NOT decide PASS/FAIL; tolerance arithmetic evaluated by ReconciliationEngine.
 *
 * @see RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md §2.7, §6.5
 */
import { queryPg } from '../../../config/postgres.js';
import { mirrorTableManager } from '../../mirrorTableManager.js';
export class ReconciliationMethod {
    id;
    targetDbId;
    targetTable;
    requiredInputKeys;
    constructor(step, stage) {
        this.id = step.id;
        this.targetDbId = step.targetDbId || stage.targetDbId;
        this.targetTable = step.targetTable || stage.targetDataSource;
        const candidateKeys = [
            step.canonicalField,
            step.sourceField,
            step.targetField,
            ...(step.requiredParams ?? []),
            ...(step.searchParameters ?? []).map(p => p.inputField),
        ].filter(Boolean);
        this.requiredInputKeys = Array.from(new Set(candidateKeys));
    }
    async execute(context, inputs) {
        const mirrorTable = this.targetDbId && this.targetTable
            ? mirrorTableManager.getMirrorTableName(this.targetDbId, this.targetTable)
            : '';
        let rawRows = [];
        // Prioritize returned_data persisted in task_dataset_transactions (Two-Level Reconciliation Mandate)
        const workflowId = context.workflowId || 'default';
        const targetTable = this.targetTable || '';
        const returnedData = context.initialRecord?.returned_data || context.initialRecord?.canonical_data?.returned_data;
        if (returnedData && targetTable) {
            const wfData = returnedData[workflowId] || returnedData;
            const legs = wfData[targetTable];
            if (legs) {
                rawRows = Array.isArray(legs) ? legs : [legs];
            }
        }
        // If not found in returned_data, attempt to read staged records from mirror table
        if (rawRows.length === 0 && mirrorTable && context.taskId && context.rowNumber !== undefined) {
            try {
                const mirrorRes = await queryPg(`SELECT * FROM ${mirrorTable}
           WHERE _task_id = $1 AND _row_number = $2
           ORDER BY _mirrored_at DESC`, [context.taskId, context.rowNumber]);
                if (mirrorRes.rows && mirrorRes.rows.length > 0) {
                    rawRows = mirrorRes.rows;
                }
            }
            catch {
                // Non-fatal if offline or table unprovisioned in test
            }
        }
        if (rawRows.length === 0 && Array.isArray(context._stagedRows)) {
            rawRows = context._stagedRows;
        }
        // If a mirror table was configured but yielded no rows, rawRows must remain empty.
        // Only local in-memory reconciliation (no mirrorTable configured) uses local inputs.
        if (!mirrorTable && rawRows.length === 0) {
            const mergedRow = { ...inputs, ...(context.initialRecord?.canonical_data ?? context.initialRecord ?? {}) };
            if (Object.keys(mergedRow).length > 0) {
                rawRows = [mergedRow];
            }
        }
        return {
            context,
            mirrorTable,
            fetchedRowCount: rawRows.length,
            rawRows,
        };
    }
}
