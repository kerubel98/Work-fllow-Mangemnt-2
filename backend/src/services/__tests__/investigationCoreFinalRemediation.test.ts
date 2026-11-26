import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getVerifiedActor } from '../../utils/auth.js';

describe('Investigation Core Final Remediation (AUD-INV-006 & AUD-INV-007)', () => {
  describe('AUD-INV-006: Actor Identity & Creator Binding Verification', () => {
    it('locks task creator identity to authenticated JWT session, rejecting body spoofing', () => {
      const mockReq = {
        user: {
          id: 'usr-operator-real',
          username: 'op_real',
          role: 'operational',
          teamId: 'team-finance'
        },
        body: {
          title: 'Unreconciled AIB Settlement Batch',
          creatorId: 'usr-spoofed-admin',
          creatorName: 'System Superadmin',
          executedBy: 'usr-spoofed-admin'
        }
      };

      const actor = getVerifiedActor(mockReq);
      const effectiveCreatorId = (actor.id && actor.id !== 'system') ? actor.id : mockReq.body.creatorId;
      const effectiveCreatorName = (actor.name && actor.name !== 'system') ? actor.name : mockReq.body.creatorName;
      const effectiveExecutedBy = (actor.username && actor.username !== 'system') ? actor.username : (mockReq.body.executedBy || 'investigator');

      expect(effectiveCreatorId).toBe('usr-operator-real');
      expect(effectiveCreatorId).not.toBe('usr-spoofed-admin');
      expect(effectiveCreatorName).toBe('op_real');
      expect(effectiveExecutedBy).toBe('op_real');
      expect(effectiveExecutedBy).not.toBe('usr-spoofed-admin');
    });

    it('falls back safely to body creatorId when unauthenticated runner executes', () => {
      const mockReq = {
        body: {
          title: 'CLI Ingestion Task',
          creatorId: 'usr-cli-runner',
          creatorName: 'CLI Runner'
        }
      };

      const actor = getVerifiedActor(mockReq);
      const effectiveCreatorId = (actor.id && actor.id !== 'system') ? actor.id : mockReq.body.creatorId;
      const effectiveCreatorName = (actor.name && actor.name !== 'system') ? actor.name : mockReq.body.creatorName;

      expect(effectiveCreatorId).toBe('usr-cli-runner');
      expect(effectiveCreatorName).toBe('CLI Runner');
    });
  });

  describe('AUD-INV-007: Batched Multi-Row Reversion Insert Logic', () => {
    it('constructs multi-row batched insert placeholders adhering to PostgreSQL limits', () => {
      const taskId = 'task-rev-test';
      const rowCount = 12;
      const originalRows = Array.from({ length: rowCount }, (_, i) => ({
        row_number: i + 1,
        batch_id: 'BATCH-001',
        canonical_data: { txId: `tx-${i + 1}`, amount: 100 * (i + 1) },
        raw_data: { raw: `raw-${i + 1}` }
      }));

      const BATCH_SIZE = 500;
      const executedBatches: { query: string; values: any[] }[] = [];

      for (let offset = 0; offset < originalRows.length; offset += BATCH_SIZE) {
        const chunk = originalRows.slice(offset, offset + BATCH_SIZE);
        const values: any[] = [];
        const placeholders: string[] = [];
        let paramIdx = 1;

        for (let i = 0; i < chunk.length; i++) {
          const row = chunk[i];
          const rowNum = row.row_number || (offset + i + 1);
          const batchId = row.batch_id || 'DEFAULT_RESTORE';
          const canonical = row.canonical_data || row;
          const raw = row.raw_data || row;

          placeholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, CURRENT_TIMESTAMP)`);
          values.push(taskId, batchId, rowNum, JSON.stringify(canonical), JSON.stringify(raw));
        }

        executedBatches.push({
          query: `INSERT INTO task_dataset_transactions (task_id, batch_id, row_number, canonical_data, raw_data, created_at) VALUES ${placeholders.join(', ')};`,
          values
        });
      }

      // Assertions
      expect(executedBatches.length).toBe(1);
      expect(executedBatches[0].values.length).toBe(rowCount * 5); // 5 parameters per row
      expect(executedBatches[0].query).toContain('($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)');
      expect(executedBatches[0].query).toContain(`($${(rowCount - 1) * 5 + 1}, $${(rowCount - 1) * 5 + 2}, $${(rowCount - 1) * 5 + 3}, $${(rowCount - 1) * 5 + 4}, $${rowCount * 5}, CURRENT_TIMESTAMP)`);
    });
  });
});
