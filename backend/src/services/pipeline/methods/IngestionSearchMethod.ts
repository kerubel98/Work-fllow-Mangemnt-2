/**
 * IngestionSearchMethod — §6.3 INGESTION_SEARCH Validation Method
 *
 * Operational Goal: External query execution and UNLOGGED mirror staging.
 * Conforms strictly to §2.1 & §2.7:
 *   - Only acquires external data and mirrors it.
 *   - Does NOT decide PASS, FAIL, CONTINUE, STOP, or CLOSE.
 *
 * @see RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md §2.7, §6.3, §8.2
 */

import type { ProcessingStage, ValidationCheckStep } from '../../../types.js';
import type { ValidationMethod, ValidationExecutionContext, ValidationDataResult } from '../types.js';
import { queryPg } from '../../../config/postgres.js';
import { mirrorTableManager } from '../../mirrorTableManager.js';

export class IngestionSearchMethod implements ValidationMethod {
  readonly id: string;
  readonly targetDbId: string;
  readonly targetTable: string;
  readonly requiredInputKeys: string[];

  constructor(step: ValidationCheckStep, stage: ProcessingStage) {
    this.id = step.id;
    this.targetDbId = step.targetDbId || stage.targetDbId || '';
    this.targetTable = step.targetTable || stage.targetDataSource || '';
    
    // Derive required keys from step searchParameters or keyMappings
    const stepParams = (step.searchParameters ?? []).map(p => p.inputField);
    const keyMaps = ((step as any).keyMappings ?? []).map((m: any) => m.inputField);
    const req = step.requiredParams ?? [];
    const direct = [(step as any).inputField, step.sourceField, step.targetField].filter(Boolean) as string[];
    this.requiredInputKeys = Array.from(new Set([...stepParams, ...keyMaps, ...req, ...direct])).filter(Boolean);
  }

  async execute(
    context: ValidationExecutionContext,
    inputs: Record<string, any>
  ): Promise<ValidationDataResult> {
    const mirrorTable = mirrorTableManager.getMirrorTableName(
      this.targetDbId || 'local',
      this.targetTable || 'transactions'
    );

    // In single-row interactive mode:
    // First, check if rows were already staged in the mirror for this coordinate
    let rawRows: any[] = [];
    if (context.taskId && context.rowNumber !== undefined) {
      try {
        const mirrorRes = await queryPg(
          `SELECT * FROM ${mirrorTable}
           WHERE _task_id = $1 AND _row_number = $2
           ORDER BY _mirrored_at DESC`,
          [context.taskId, context.rowNumber]
        );
        if (mirrorRes.rows && mirrorRes.rows.length > 0) {
          rawRows = mirrorRes.rows;
        }
      } catch {
        // Table may not exist yet or offline in test environment
      }
    }

    if (rawRows.length === 0 && Array.isArray((context as any)._stagedRows)) {
      rawRows = (context as any)._stagedRows;
    }

    // When external mirror has no records for this coordinate, rawRows must remain empty.
    // The reconciliation engine evaluates whether NO_MATCH constitutes FAIL.
    return {
      context,
      mirrorTable,
      fetchedRowCount: rawRows.length,
      rawRows,
    };
  }
}
