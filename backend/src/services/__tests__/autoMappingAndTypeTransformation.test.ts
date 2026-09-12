import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dataSanitizerService, cleanAmount, cleanDate, cleanBoolean, cleanPan, cleanInteger } from '../dataSanitizerService.js';
import { getPostgresPool, connectPostgres } from '../../config/postgres.js';
import { repo } from '../../store/repository.js';

describe('Auto-Mapping & Data Type Transformation Pipeline', () => {
  const pool = getPostgresPool();
  const testTaskId = 'TASK-AUTO-MAP-TEST-777';

  beforeAll(async () => {
    await connectPostgres();
    await pool.query("DELETE FROM central_transaction_repository WHERE task_id = $1", [testTaskId]);
    await pool.query("DELETE FROM task_dataset_transactions WHERE task_id = $1", [testTaskId]);
    await pool.query("DELETE FROM issues WHERE id = $1", [testTaskId]);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM central_transaction_repository WHERE task_id = $1", [testTaskId]);
    await pool.query("DELETE FROM task_dataset_transactions WHERE task_id = $1", [testTaskId]);
    await pool.query("DELETE FROM issues WHERE id = $1", [testTaskId]);
  });

  describe('Data Type Converters', () => {
    it('standardizes numeric amounts with currencies, commas, and negative notations', () => {
      expect(cleanAmount('$1,234.50')).toBe(1234.5);
      expect(cleanAmount('€ 500,000.75')).toBe(500000.75);
      expect(cleanAmount('(250.00)')).toBe(-250);
      expect(cleanAmount('125.50-')).toBe(-125.5);
      expect(cleanAmount('1.5e3')).toBe(1500);
      expect(cleanAmount(42.8)).toBe(42.8);
      expect(cleanAmount('')).toBeNull();
      expect(cleanAmount('invalid_amt')).toBeNull();
    });

    it('standardizes integers', () => {
      expect(cleanInteger('100.4')).toBe(100);
      expect(cleanInteger('$55.8')).toBe(56);
      expect(cleanInteger(null)).toBeNull();
    });

    it('standardizes various date formats, timestamps, and compact strings', () => {
      expect(cleanDate('2026-09-10T23:12:14.000Z')).toBe('2026-09-10T23:12:14.000Z');
      expect(cleanDate('2026-09-10')).toBe('2026-09-10');
      expect(cleanDate('20260910')).toBe('2026-09-10');
      expect(cleanDate('14:30:00')).toBe('14:30:00');
      expect(cleanDate(1789070488000)).toBeDefined();
      expect(cleanDate('')).toBeNull();
      expect(cleanDate('not_a_date')).toBeNull();
    });

    it('standardizes boolean flags', () => {
      expect(cleanBoolean('true')).toBe(true);
      expect(cleanBoolean('Y')).toBe(true);
      expect(cleanBoolean('yes')).toBe(true);
      expect(cleanBoolean(1)).toBe(true);
      expect(cleanBoolean('false')).toBe(false);
      expect(cleanBoolean('N')).toBe(false);
      expect(cleanBoolean('no')).toBe(false);
      expect(cleanBoolean(0)).toBe(false);
      expect(cleanBoolean('other')).toBeNull();
    });

    it('normalizes card PANs by stripping spaces and hyphens', () => {
      expect(cleanPan('4111 2222 3333 4444')).toBe('4111222233334444');
      expect(cleanPan('4111-2222-3333-4444')).toBe('4111222233334444');
      expect(cleanPan('123')).toBeNull(); // too short
    });
  });

  describe('Intelligent Auto-Mapping', () => {
    it('automatically maps diverse banking synonyms to standard schema keys', async () => {
      const rawHeaders = [
        'Card Number',
        'TxnAmount',
        'Reference_No',
        'Tran_Date',
        'TerminalID',
        'ProcessingCode',
        'Unmapped_Random_Col'
      ];

      const mapping = await dataSanitizerService.autoMapHeaders(rawHeaders);
      expect(mapping['Card Number']).toBe('hpan');
      expect(mapping['TxnAmount']).toBe('reqamt');
      expect(mapping['Reference_No']).toBe('refnum');
      expect(mapping['Tran_Date']).toBe('ttime');
      expect(mapping['TerminalID']).toBe('terminal_id');
      expect(mapping['ProcessingCode']).toBe('prcode');
      expect(mapping['Unmapped_Random_Col']).toBeUndefined();
    });

    it('validates mapping and auto-resolves missing mappings from sample row', async () => {
      const sampleRow = {
        'Card Number': '4111-2222-3333-4444',
        'ReqAmount': '$99.50',
        'RefNo': 'REF-10029',
        'Terminal': 'TERM-01'
      };

      // Even with an empty fileMapping, validateMapping should auto-map from the sample row
      const result = await dataSanitizerService.validateMapping({}, sampleRow);
      expect(result.valid).toBe(true);
      expect(result.autoMapping).toBeDefined();
      expect(result.autoMapping?.['ReqAmount']).toBe('reqamt');
      expect(result.autoMapping?.['RefNo']).toBe('refnum');
      expect(result.autoMapping?.['Terminal']).toBe('terminal_id');
    });
  });

  describe('Full Dataset Sanitization and Type Transformation', () => {
    it('sanitizes rows, converts types, and drops unmapped/null values', async () => {
      const rawRows = [
        {
          'Card Number': '4111 2222 3333 4444',
          'TxnAmount': ' $ 1,500.25 ',
          'Reference_No': ' REF-8888 ',
          'Tran_Date': '2026-09-10',
          'TerminalID': 'TERM-99',
          'Empty_Field': '',
          'Null_Field': null,
          'Unmapped_Header': 'discard_me'
        }
      ];

      const result = await dataSanitizerService.sanitizeRows(rawRows);
      expect(result.sanitizedRows).toHaveLength(1);
      const clean = result.sanitizedRows[0];

      expect(clean.hpan).toBe('4111222233334444');
      expect(clean.reqamt).toBe(1500.25);
      expect(clean.refnum).toBe('REF-8888');
      expect(clean.ttime).toBe('2026-09-10');
      expect(clean.terminal_id).toBe('TERM-99');

      // Unmapped and empty values must be pruned
      expect(clean.Empty_Field).toBeUndefined();
      expect(clean.Null_Field).toBeUndefined();
      expect(clean.Unmapped_Header).toBeUndefined();
      expect(result.droppedKeysCount).toBeGreaterThan(0);
    });

    it('automatically maps, transforms, and ingests transactions on task creation', async () => {
      const { datasetIngestionService } = await import('../datasetIngestionService.js');

      const rawRows = [
        {
          'Card Number': '4111-2222-3333-4444',
          'TxnAmount': '$ 2,450.00',
          'Reference_No': 'REF-AUTOTASK-001',
          'Tran_Date': '2026-09-10',
          'TerminalID': 'TERM-AUTO-77'
        }
      ];

      // 1. Pre-flight validation with automatic header mapping resolution
      const validation = await dataSanitizerService.validateMapping({}, rawRows[0]);
      expect(validation.valid).toBe(true);

      // 2. Strict Data Type Transformation & Auto-Mapping Execution
      const sanitization = await dataSanitizerService.sanitizeRows(rawRows, validation.autoMapping);
      expect(sanitization.sanitizedRows).toHaveLength(1);

      // 3. Create Issue
      await repo.createIssue({
        id: testTaskId,
        title: 'Auto-Mapping Ingestion Test Task',
        description: 'Testing automated mapping and type conversion upon task creation',
        status: 'Open',
        priority: 'Medium',
        creatorId: 'test-admin',
        creatorName: 'Test Admin',
        createdAt: new Date().toISOString(),
        type: 'file',
        fileMapping: sanitization.effectiveMapping,
        firstLevelMappedData: sanitization.sanitizedRows,
        chat: []
      });

      // 4. Ingest into Central Repository and Task Dataset
      const ingestResult = await datasetIngestionService.ingestDatasetRows(
        testTaskId,
        sanitization.sanitizedRows,
        Object.keys(rawRows[0]),
        sanitization.effectiveMapping
      );

      expect(ingestResult.insertedCount).toBe(1);

      // 5. Verify Central Transaction Repository (Sheet 1 Master Record)
      const centralRes = await pool.query(
        "SELECT task_id, reqamt, hpan, refnum, canonical_data FROM central_transaction_repository WHERE task_id = $1",
        [testTaskId]
      );
      expect(centralRes.rows).toHaveLength(1);
      const centralRow = centralRes.rows[0];
      expect(centralRow.task_id).toBe(testTaskId);
      expect(Number(centralRow.reqamt)).toBe(2450); // stored as numeric/float in database
      expect(centralRow.hpan).toBe('4111222233334444');
      expect(centralRow.refnum).toBe('REF-AUTOTASK-001');

      // 6. Verify Task Dataset Transactions (Sheet 2 Operational Matrix)
      const taskDatasetRes = await pool.query(
        "SELECT task_id, canonical_data FROM task_dataset_transactions WHERE task_id = $1",
        [testTaskId]
      );
            expect(taskDatasetRes.rows).toHaveLength(1);
      expect(taskDatasetRes.rows[0].canonical_data.reqamt).toBe(2450);
      expect(taskDatasetRes.rows[0].canonical_data.hpan).toBe('4111222233334444');
    });
  });
});
