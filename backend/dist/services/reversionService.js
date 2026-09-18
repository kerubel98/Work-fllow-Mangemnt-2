/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { getPostgresPool } from '../config/postgres.js';
import { repo } from '../store/repository.js';
import { eventService } from './events.js';
export const reversionService = {
    /**
     * Captures an immutable pre-change snapshot of internal extracted records for a task
     * before any solution script or staged fix modifies them.
     */
    async createSnapshot(taskId, processType, createdBy, reason, transactionId) {
        const pool = getPostgresPool();
        const snapId = `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        // Extract current internal task records
        const datasetRes = await pool.query(`SELECT row_number, batch_id, canonical_data, raw_data, created_at
       FROM task_dataset_transactions
       WHERE task_id = $1
       ORDER BY row_number ASC;`, [taskId]);
        let rowsToSave = [];
        if (datasetRes.rows.length > 0) {
            rowsToSave = datasetRes.rows.map(r => ({
                row_number: r.row_number,
                batch_id: r.batch_id,
                canonical_data: typeof r.canonical_data === 'string' ? JSON.parse(r.canonical_data) : r.canonical_data,
                raw_data: typeof r.raw_data === 'string' ? JSON.parse(r.raw_data) : r.raw_data
            }));
        }
        else {
            // Fallback to issue.firstLevelMappedData
            const issue = await repo.getIssueById(taskId);
            if (issue?.firstLevelMappedData && Array.isArray(issue.firstLevelMappedData)) {
                rowsToSave = issue.firstLevelMappedData;
            }
        }
        if (transactionId) {
            // Single transaction snapshot
            const targetRow = rowsToSave.find(r => {
                const c = r.canonical_data || r;
                return c.transaction_id === transactionId || c.id === transactionId;
            });
            rowsToSave = targetRow ? [targetRow] : [];
        }
        await pool.query(`INSERT INTO transaction_reversion_snapshots 
       (id, task_id, transaction_id, process_type, before_state, reason, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP);`, [
            snapId,
            taskId,
            transactionId || null,
            processType,
            JSON.stringify(rowsToSave),
            reason || `Pre-change snapshot for ${processType}`,
            createdBy
        ]);
        const snapshot = {
            id: snapId,
            taskId,
            transactionId,
            processType,
            beforeState: rowsToSave,
            reason,
            createdBy,
            createdAt: new Date().toISOString()
        };
        eventService.broadcastEvent('reversion:snapshot_created', snapshot);
        return snapshot;
    },
    /**
     * Reverts all internal extracted records of a task back to its most recent pre-change snapshot.
     */
    async revertTask(taskId, userId) {
        const pool = getPostgresPool();
        // Fetch latest active snapshot
        const snapRes = await pool.query(`SELECT id, before_state, process_type
       FROM transaction_reversion_snapshots
       WHERE task_id = $1 AND reverted_at IS NULL AND (transaction_id IS NULL OR transaction_id = '')
       ORDER BY created_at DESC
       LIMIT 1;`, [taskId]);
        if (snapRes.rows.length === 0) {
            throw new Error(`No pre-change snapshot found for task ${taskId} to revert.`);
        }
        const { id: snapId, before_state } = snapRes.rows[0];
        const originalRows = typeof before_state === 'string' ? JSON.parse(before_state) : before_state;
        if (!Array.isArray(originalRows) || originalRows.length === 0) {
            throw new Error(`Snapshot ${snapId} has empty state.`);
        }
        // Restore task_dataset_transactions
        await pool.query('BEGIN;');
        try {
            // Scope 64-bit advisory lock exclusively to this task (non-blocking for concurrent tasks)
            await pool.query(`SELECT pg_advisory_xact_lock(('x' || substr(md5('task_revert_' || $1), 1, 16))::bit(64)::bigint)`, [taskId]);
            await pool.query('DELETE FROM task_dataset_transactions WHERE task_id = $1;', [taskId]);
            for (let i = 0; i < originalRows.length; i++) {
                const row = originalRows[i];
                const rowNum = row.row_number || (i + 1);
                const batchId = row.batch_id || 'DEFAULT_RESTORE';
                const canonical = row.canonical_data || row;
                const raw = row.raw_data || row;
                await pool.query(`INSERT INTO task_dataset_transactions (task_id, batch_id, row_number, canonical_data, raw_data, created_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP);`, [taskId, batchId, rowNum, JSON.stringify(canonical), JSON.stringify(raw)]);
            }
            // Also restore in issues table
            const canonicalRows = originalRows.map(r => r.canonical_data || r);
            await pool.query(`UPDATE issues
         SET first_level_mapped_data = $1,
             solution_executed = FALSE,
             solution_executed_at = NULL,
             status = 'Investigating'
         WHERE id = $2;`, [JSON.stringify(canonicalRows), taskId]);
            // Mark snapshot as reverted
            await pool.query(`UPDATE transaction_reversion_snapshots
         SET reverted_at = CURRENT_TIMESTAMP, reverted_by = $1
         WHERE id = $2;`, [userId, snapId]);
            await pool.query('COMMIT;');
            const result = {
                success: true,
                revertedCount: originalRows.length,
                restoredRows: canonicalRows
            };
            eventService.broadcastEvent('reversion:task_reverted', { taskId, snapshotId: snapId, revertedBy: userId });
            return result;
        }
        catch (err) {
            await pool.query('ROLLBACK;');
            throw err;
        }
    },
    /**
     * Reverts a single transaction within a task dataset back to its pre-change state.
     */
    async revertTransaction(taskId, transactionId, userId) {
        const pool = getPostgresPool();
        // Find latest snapshot containing this transaction
        const snapRes = await pool.query(`SELECT id, before_state
       FROM transaction_reversion_snapshots
       WHERE task_id = $1 AND reverted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1;`, [taskId]);
        if (snapRes.rows.length === 0) {
            throw new Error(`No pre-change snapshot found for task ${taskId}.`);
        }
        const { id: snapId, before_state } = snapRes.rows[0];
        const originalRows = typeof before_state === 'string' ? JSON.parse(before_state) : before_state;
        const matchedRow = originalRows.find(r => {
            const c = r.canonical_data || r;
            return (c.transaction_id === transactionId ||
                c.transactionId === transactionId ||
                c.id === transactionId ||
                c.Ref_Number === transactionId);
        });
        if (!matchedRow) {
            throw new Error(`Transaction ${transactionId} was not found in snapshot ${snapId}.`);
        }
        const canonical = matchedRow.canonical_data || matchedRow;
        const raw = matchedRow.raw_data || matchedRow;
        // Update in task_dataset_transactions atomically
        await pool.query('BEGIN;');
        try {
            await pool.query(`SELECT pg_advisory_xact_lock(('x' || substr(md5('task_revert_' || $1), 1, 16))::bit(64)::bigint)`, [taskId]);
            await pool.query(`UPDATE task_dataset_transactions
         SET canonical_data = $1, raw_data = $2
         WHERE task_id = $3 AND (
           canonical_data->>'transaction_id' = $4 OR
           canonical_data->>'transactionId' = $4 OR
           canonical_data->>'id' = $4
         );`, [JSON.stringify(canonical), JSON.stringify(raw), taskId, transactionId]);
            // Update in issues table
            const issue = await repo.getIssueById(taskId);
            if (issue && Array.isArray(issue.firstLevelMappedData)) {
                const updatedList = issue.firstLevelMappedData.map(item => {
                    if (item.transaction_id === transactionId || item.transactionId === transactionId || item.id === transactionId) {
                        return canonical;
                    }
                    return item;
                });
                await repo.updateIssue(taskId, { firstLevelMappedData: updatedList });
            }
            // Log specific transaction reversion in snapshots
            const rowSnapId = `snap-tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            await pool.query(`INSERT INTO transaction_reversion_snapshots 
         (id, task_id, transaction_id, process_type, before_state, reason, created_by, created_at, reverted_at, reverted_by)
         VALUES ($1, $2, $3, 'INTERNAL_STAGED_FIX', $4, 'Single-transaction granular rollback', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $5);`, [rowSnapId, taskId, transactionId, JSON.stringify([matchedRow]), userId]);
            await pool.query('COMMIT;');
        }
        catch (revertErr) {
            await pool.query('ROLLBACK;');
            throw revertErr;
        }
        const result = {
            success: true,
            transactionId,
            restoredRow: canonical
        };
        eventService.broadcastEvent('reversion:transaction_reverted', { taskId, transactionId, revertedBy: userId });
        return result;
    },
    /**
     * Retrieves full reversion history for a task
     */
    async getReversionHistory(taskId) {
        const pool = getPostgresPool();
        const res = await pool.query(`SELECT id, task_id, transaction_id, process_type, before_state, after_state, reason, created_by, created_at, reverted_at, reverted_by
       FROM transaction_reversion_snapshots
       WHERE task_id = $1
       ORDER BY created_at DESC;`, [taskId]);
        return res.rows.map(r => ({
            id: r.id,
            taskId: r.task_id,
            transactionId: r.transaction_id || undefined,
            processType: r.process_type,
            beforeState: typeof r.before_state === 'string' ? JSON.parse(r.before_state) : r.before_state,
            afterState: r.after_state ? (typeof r.after_state === 'string' ? JSON.parse(r.after_state) : r.after_state) : undefined,
            reason: r.reason || undefined,
            createdBy: r.created_by,
            createdAt: r.created_at?.toISOString ? r.created_at.toISOString() : String(r.created_at),
            revertedAt: r.reverted_at ? (r.reverted_at?.toISOString ? r.reverted_at.toISOString() : String(r.reverted_at)) : undefined,
            revertedBy: r.reverted_by || undefined
        }));
    }
};
