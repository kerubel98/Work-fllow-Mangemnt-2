/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
export const DEFAULT_BATCH_POLICY = {
    maxRowsPerBatch: 5000,
    maxQueryKeys: 1000,
    maxPayloadSizeMb: 10,
    maxExecutionTimeMs: 30000
};
/**
 * Validates batch policy invariants and ensures compliance with AGENTS.md Rule 11 (< 30,000 query parameters).
 */
export function validateBatchPolicy(policy = {}) {
    const merged = {
        ...DEFAULT_BATCH_POLICY,
        ...policy
    };
    if (merged.maxRowsPerBatch <= 0) {
        throw new Error(`[BatchPolicyError] maxRowsPerBatch must be positive. Received: ${merged.maxRowsPerBatch}`);
    }
    if (merged.maxQueryKeys <= 0) {
        throw new Error(`[BatchPolicyError] maxQueryKeys must be positive. Received: ${merged.maxQueryKeys}`);
    }
    if (merged.maxQueryKeys > 15000) {
        throw new Error(`[BatchPolicyError] maxQueryKeys (${merged.maxQueryKeys}) exceeds safe PostgreSQL query parameter limit (< 15,000 for tuple matching).`);
    }
    if (merged.maxQueryKeys > merged.maxRowsPerBatch) {
        merged.maxQueryKeys = merged.maxRowsPerBatch;
    }
    return merged;
}
/**
 * Creates a deterministic, configurable partition of transactions into:
 * 1. Sequential InvestigationBatchPlan units (Input Batches)
 * 2. Parameterized QueryChunkPlan units (Query Chunks) within each batch
 *
 * Enforces the strict rule that Input Batch Size != Query Chunk Size.
 */
export function createBatchPlan(transactionIds, policy = {}) {
    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
        return [];
    }
    const activePolicy = validateBatchPolicy(policy);
    const maxRowsPerBatch = activePolicy.maxRowsPerBatch;
    const maxQueryKeys = activePolicy.maxQueryKeys;
    const batches = [];
    const totalRows = transactionIds.length;
    let batchSequence = 1;
    for (let bStart = 0; bStart < totalRows; bStart += maxRowsPerBatch) {
        const bEnd = Math.min(bStart + maxRowsPerBatch, totalRows);
        const batchTransactionIds = transactionIds.slice(bStart, bEnd);
        const batchId = `batch-${String(batchSequence).padStart(3, '0')}`;
        // Divide this batch's transaction IDs into query chunks
        const queryChunks = [];
        let chunkSequence = 1;
        for (let cStart = 0; cStart < batchTransactionIds.length; cStart += maxQueryKeys) {
            const cEnd = Math.min(cStart + maxQueryKeys, batchTransactionIds.length);
            const chunkTransactionIds = batchTransactionIds.slice(cStart, cEnd);
            const chunkId = `chunk-${String(batchSequence).padStart(3, '0')}-${String(chunkSequence).padStart(2, '0')}`;
            queryChunks.push({
                chunkId,
                sequence: chunkSequence,
                transactionIds: chunkTransactionIds
            });
            chunkSequence++;
        }
        batches.push({
            batchId,
            sequence: batchSequence,
            rowCount: batchTransactionIds.length,
            transactionIds: batchTransactionIds,
            queryChunks
        });
        batchSequence++;
    }
    return batches;
}
