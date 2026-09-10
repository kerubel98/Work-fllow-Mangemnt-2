/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BatchPolicy, InvestigationBatchPlan, QueryChunkPlan } from '../types';

export const DEFAULT_BATCH_POLICY: BatchPolicy = {
  maxRowsPerBatch: 5000,
  maxQueryKeys: 1000,
  maxPayloadSizeMb: 10,
  maxExecutionTimeMs: 30000
};

/**
 * Creates a deterministic, configurable partition of transactions into:
 * 1. Sequential InvestigationBatchPlan units (Input Batches)
 * 2. Parameterized QueryChunkPlan units (Query Chunks) within each batch
 *
 * Enforces the strict rule that Input Batch Size != Query Chunk Size.
 */
export function createBatchPlan(
  transactionIds: string[],
  policy: Partial<BatchPolicy> = {}
): InvestigationBatchPlan[] {
  const activePolicy: BatchPolicy = {
    ...DEFAULT_BATCH_POLICY,
    ...policy
  };

  const maxRowsPerBatch = Math.max(1, activePolicy.maxRowsPerBatch);
  const maxQueryKeys = Math.max(1, activePolicy.maxQueryKeys);

  const batches: InvestigationBatchPlan[] = [];
  const totalRows = transactionIds.length;
  let batchSequence = 1;

  for (let bStart = 0; bStart < totalRows; bStart += maxRowsPerBatch) {
    const bEnd = Math.min(bStart + maxRowsPerBatch, totalRows);
    const batchTransactionIds = transactionIds.slice(bStart, bEnd);
    const batchId = `batch-${String(batchSequence).padStart(3, '0')}`;

    // Divide this batch's transaction IDs into query chunks
    const queryChunks: QueryChunkPlan[] = [];
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
      transactionIds: batchTransactionIds,
      queryChunks
    });

    batchSequence++;
  }

  return batches;
}
