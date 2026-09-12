import { repo } from '../store/repository.js';
import { CentralTransactionRecord } from '../types.js';

export interface IngestionResult {
  taskId: string;
  totalRows: number;
  insertedCount: number;
  batchesCreated: number;
  batchList: string[];
  duplicateCount: number;
  duplicatesFlagged: { transactionKey: string; duplicateFromTaskId: string }[];
  sampleStandardizedDate?: string;
  durationMs: number;
}

/**
 * Normalizes and standardizes transaction amounts by stripping currency symbols and formatting.
 */
function standardizeAmount(val: any): number | any {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[\$,\s]/g, '').trim();
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed)) return parsed;
  }
  return val;
}

/**
 * Standardizes dates to clean ISO-8601 strings (YYYY-MM-DD or ISO timestamp).
 */
function standardizeDate(val: any): string | any {
  if (!val) return val;
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      // If original had no time portion, return YYYY-MM-DD
      if (!val.includes(':')) {
        return d.toISOString().split('T')[0];
      }
      return d.toISOString();
    }
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString();
  }
  return val;
}

export const datasetIngestionService = {
  /**
   * Ingest an array of parsed transaction records into the standalone
   * task_dataset_transactions relational table with pre-flight field validation,
   * date/amount standardization, upfront batch assignment, and Central Transaction Repository
   * cross-task duplicate detection.
   */
  async ingestDatasetRows(
    taskId: string,
    rows: Record<string, any>[],
    headers?: string[],
    fileMapping?: Record<string, string>
  ): Promise<IngestionResult> {
    const startTime = Date.now();
    const BATCH_SIZE = 500;
    const batchSet = new Set<string>();
    const duplicatesFlagged: { transactionKey: string; duplicateFromTaskId: string }[] = [];
    let sampleStandardizedDate: string | undefined = undefined;

    // 1. Pre-Flight Mapping & Data Transformation via Data Sanitizer Pipeline
    const { dataSanitizerService } = await import('./dataSanitizerService.js');
    const { sanitizedRows, droppedKeysCount, droppedNullsCount } = await dataSanitizerService.sanitizeRows(rows, fileMapping);
    console.log(`[DatasetIngestion] Sanitized ${sanitizedRows.length} rows for task ${taskId}: pruned ${droppedKeysCount} unmapped keys, ${droppedNullsCount} nulls/empty values.`);

    const normalizedRows: Record<string, any>[] = [];
    const centralRecords: CentralTransactionRecord[] = [];

    for (let i = 0; i < sanitizedRows.length; i++) {
      const rawRow = rows[i] || {};
      const rowNum = i + 1;
      // Start directly with the clean, mapped, non-null standardized row
      const merged: Record<string, any> = {
        task_id: taskId,
        ...sanitizedRows[i]
      };

      // Check sample date for telemetry
      for (const [key, val] of Object.entries(merged)) {
        const lowerKey = key.toLowerCase();
        if ((lowerKey.includes('date') || lowerKey.includes('time')) && !sampleStandardizedDate && val) {
          sampleStandardizedDate = String(val);
        }
      }

      // Assign Upfront Batch (500 records per batch)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const cleanTaskSuffix = (taskId || '000000').replace(/[^a-zA-Z0-9]/g, '').slice(-6);
      const batchId = `BATCH-${cleanTaskSuffix}-${String(batchNum).padStart(3, '0')}`;
      batchSet.add(batchId);
      merged._batchId = batchId;
      merged.batch_id = batchId;
      merged._rowNumber = rowNum;

      // Extract unique transaction key for Central Transaction Repository
      const transactionKey = String(
        merged.tran_ref ||
        merged.transaction_id ||
        merged.tran_id ||
        merged.transactionId ||
        merged.id ||
        merged.ref ||
        merged.reference ||
        `TASK_${taskId}_ROW_${rowNum}`
      ).trim();

      // Check Cross-Task Duplicates against Central Repository
      let isDuplicate = false;
      let duplicateFromTaskId: string | null = null;
      let wasPreviouslyClosed = false;
      let allTaskIds: string[] = [taskId];

      try {
        const existingCentral = await repo.getCentralTransaction(transactionKey);
        if (existingCentral && existingCentral.originalTaskId !== taskId) {
          allTaskIds = Array.from(new Set([...(existingCentral.allTaskIds || [existingCentral.originalTaskId]), taskId]));

          // Check if previous task or record was CLOSED
          let prevIsClosed = existingCentral.status === 'COMPLETED';
          if (!prevIsClosed && (existingCentral.currentTaskId || existingCentral.originalTaskId)) {
            try {
              const prevTaskId = existingCentral.currentTaskId || existingCentral.originalTaskId;
              const prevIssue = await repo.getIssueById(prevTaskId);
              if (prevIssue && (prevIssue.status === 'Closed' || prevIssue.status === 'Resolved')) {
                prevIsClosed = true;
              }
            } catch {
              // Ignore issue lookup error
            }
          }

          if (prevIsClosed) {
            // Cross-Task Ingestion Rule: Never drop or avoid closed records in new tasks
            wasPreviouslyClosed = true;
            duplicateFromTaskId = existingCentral.currentTaskId || existingCentral.originalTaskId;
          } else {
            isDuplicate = true;
            duplicateFromTaskId = existingCentral.originalTaskId;
            duplicatesFlagged.push({ transactionKey, duplicateFromTaskId });
          }
        }
      } catch (err) {
        // Fallback gracefully if central check encounters an issue
        console.warn('Central repository lookup warning:', err);
      }

      merged._isDuplicate = isDuplicate;
      merged.is_duplicate = isDuplicate;
      merged._wasPreviouslyClosed = wasPreviouslyClosed;
      merged.was_previously_closed = wasPreviouslyClosed;
      merged._duplicateFromTaskId = duplicateFromTaskId;
      merged.duplicate_from_task_id = duplicateFromTaskId;
      merged._allTaskIds = allTaskIds;

      normalizedRows.push(merged);

      // Prepare Central Transaction Record for master ledger upsert
      centralRecords.push({
        transactionKey,
        originalTaskId: isDuplicate ? (duplicateFromTaskId || taskId) : taskId,
        currentTaskId: taskId,
        allTaskIds,
        batchId,
        rowNumber: rowNum,
        status: isDuplicate ? 'DUPLICATE' : 'INGESTED',
        isDuplicate,
        duplicateFromTaskId: duplicateFromTaskId || undefined,
        workflowIds: [],
        canonicalData: merged,
        rawData: rawRow,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    // 2. Stream to task_dataset_transactions table
    const insertedCount = await repo.createTaskDatasetTransactions(taskId, normalizedRows);

    // 3. Upsert into Central Transaction Repository
    try {
      await repo.upsertCentralTransactions(centralRecords);
    } catch (err) {
      console.warn('Central repository batch upsert notice:', err);
    }

    // 4. Update Issue metadata
    await repo.updateIssue(taskId, {
      transactionCount: insertedCount,
      datasetStatus: 'INGESTED',
      uploadedFileHeaders: headers || (rows.length > 0 ? Object.keys(rows[0]) : []),
      fileMapping: fileMapping || {}
    });

    const durationMs = Date.now() - startTime;
    const batchList = Array.from(batchSet);
    console.log(`⚡ Ingested ${insertedCount} transactions (${batchList.length} batches, ${duplicatesFlagged.length} duplicates) for task ${taskId} in ${durationMs}ms`);

    return {
      taskId,
      totalRows: rows.length,
      insertedCount,
      batchesCreated: batchList.length,
      batchList,
      duplicateCount: duplicatesFlagged.length,
      duplicatesFlagged,
      sampleStandardizedDate,
      durationMs
    };
  },

  /**
   * Retrieve paginated slice of dataset transactions with batch filtering
   */
  async getDatasetSlice(taskId: string, page = 1, limit = 50, batchId?: string) {
    return await repo.getTaskDatasetTransactions(taskId, page, limit, batchId);
  }
};
