/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  resolveCanonicalKey,
  validateDatasetKeys,
  STANDARD_CANDIDATE_KEYS
} from '../canonicalKeyResolver.js';
import {
  aggregateExecutionVerdicts,
  aggregateParentIssueStatus
} from '../statusAggregator.js';
import { validateBatchPolicy, createBatchPlan } from '../batchPlanner.js';
import { workflowBundleService } from '../workflowBundleService.js';

describe('Service Layer Hard-Coded Logic Refactor Suite', () => {

  describe('1. Canonical Key Resolution & Precedence (Rule 9)', () => {
    it('prefers explicit key override over all other options', () => {
      const res = resolveCanonicalKey({
        explicitKey: 'custom_external_ref',
        transactions: [{ transaction_id: 'TX-1', custom_external_ref: 'EXT-1' }]
      });
      expect(res.isResolved).toBe(true);
      expect(res.primaryKey).toBe('custom_external_ref');
      expect(res.sourcePrecedence).toBe('EXPLICIT_OVERRIDE');
    });

    it('prefers table configuration override when stage and db mappings exist', () => {
      const res = resolveCanonicalKey({
        stage: { id: 's-1', name: 'Stage 1', order: 1, enabled: true, targetDbId: 'db-1', targetDataSource: 'settlement_feed' },
        dbTableMappings: {
          settlement_feed: { primaryKey: 'fe_utrnno' }
        },
        transactions: [{ transaction_id: 'TX-1', fe_utrnno: '998811' }]
      });
      expect(res.isResolved).toBe(true);
      expect(res.primaryKey).toBe('fe_utrnno');
      expect(res.sourcePrecedence).toBe('TABLE_CONFIG_OVERRIDE');
    });

    it('prefers validation box key mapping when no table override is present', () => {
      const res = resolveCanonicalKey({
        queryExtraction: {
          id: 'ext-1',
          workflowId: 'wf-1',
          stageId: 's-1',
          dataSourceId: 'ds-1',
          externalDbId: 'db-1',
          targetTable: 'tbl',
          selectedColumns: [],
          keyMappings: [{ sourceField: 'refnum', targetColumn: 'REF', required: true }]
        },
        transactions: [{ transaction_id: 'TX-1', refnum: 'REF-001' }]
      });
      expect(res.isResolved).toBe(true);
      expect(res.primaryKey).toBe('refnum');
      expect(res.sourcePrecedence).toBe('VALIDATION_BOX_MAPPING');
    });

    it('resolves standard keys from active transaction dataset', () => {
      const res = resolveCanonicalKey({
        transactions: [{ rrn: 'RRN-9921', amount: 150 }]
      });
      expect(res.isResolved).toBe(true);
      expect(res.primaryKey).toBe('rrn');
      expect(res.sourcePrecedence).toBe('DATASET_MATCH');
    });

    it('throws ConfigurationError on strictFailFast when no key can be determined', () => {
      expect(() => {
        resolveCanonicalKey({
          workflow: { id: 'wf-empty', name: 'Empty WF', stages: [], rules: [], createdAt: '', updatedAt: '' },
          transactions: [{ foo: 'bar', baz: 123 }],
          strictFailFast: true
        });
      }).toThrow(/Unable to determine primary correlation key/);
    });

    it('validates dataset keys and reports missing count', () => {
      const txns = [
        { transaction_id: 'TX-1' },
        { transaction_id: null },
        { transaction_id: '' },
        { other_id: '123' }
      ];
      const validation = validateDatasetKeys(txns, 'transaction_id');
      expect(validation.isValid).toBe(false);
      expect(validation.missingCount).toBe(3);
      expect(validation.warning).toContain('3 transactions lack the designated primary key');
    });
  });

  describe('2. Strict Status Domain Separation (Rule 2 & Rule 3)', () => {
    it('aggregates rule execution verdicts independently from case lifecycle', () => {
      const records = [
        { _validation_status: 'PASS' },
        { _validation_status: 'PASS' },
        { _validation_status: 'FAIL' },
        { _validation_status: 'PAUSED_DB_OFFLINE' }
      ];
      const verdicts = aggregateExecutionVerdicts(records);
      expect(verdicts.totalEvaluated).toBe(4);
      expect(verdicts.passCount).toBe(2);
      expect(verdicts.failCount).toBe(1);
      expect(verdicts.pausedCount).toBe(1);
      expect(verdicts.overallVerdict).toBe('PAUSED_DB_OFFLINE'); // Offline pause takes precedence
    });

    it('evaluates case lifecycle strictly from investigationStatus', () => {
      const txns = [
        { transactionId: 'TX-1', investigationStatus: 'VERIFIED_MATCH' },
        { transactionId: 'TX-2', investigationStatus: 'VERIFIED_MATCH' }
      ];
      const res = aggregateParentIssueStatus(txns);
      expect(res.issueStatus).toBe('RESOLVED');
      expect(res.reconciledCount).toBe(2);
      expect(res.flaggedCount).toBe(0);
    });

    it('marks parent as ACTION_REQUIRED when PENDING_CHECKER_REVIEW or FLAGGED_DISCREPANCY exists', () => {
      const txns = [
        { transactionId: 'TX-1', investigationStatus: 'VERIFIED_MATCH' },
        { transactionId: 'TX-2', investigationStatus: 'PENDING_CHECKER_REVIEW' }
      ];
      const res = aggregateParentIssueStatus(txns);
      expect(res.issueStatus).toBe('ACTION_REQUIRED');
      expect(res.flaggedCount).toBe(1);
    });

    it('does not allow rule PASS to close parent case if investigationStatus is IN_PROGRESS', () => {
      const txns = [
        { transactionId: 'TX-1', investigationStatus: 'IN_PROGRESS', _validation_status: 'PASS' }
      ];
      const res = aggregateParentIssueStatus(txns);
      expect(res.issueStatus).toBe('IN_PROGRESS');
      expect(res.reconciledCount).toBe(0);
    });
  });

  describe('3. Batch Policy Invariant Guarding (Rule 11)', () => {
    it('rejects non-positive maxRowsPerBatch', () => {
      expect(() => {
        validateBatchPolicy({ maxRowsPerBatch: 0 });
      }).toThrow(/maxRowsPerBatch must be positive/);
    });

    it('rejects non-positive maxQueryKeys', () => {
      expect(() => {
        validateBatchPolicy({ maxQueryKeys: -5 });
      }).toThrow(/maxQueryKeys must be positive/);
    });

    it('rejects query keys exceeding parameter limit (> 15,000)', () => {
      expect(() => {
        validateBatchPolicy({ maxQueryKeys: 20000 });
      }).toThrow(/exceeds safe PostgreSQL query parameter limit/);
    });

    it('clamps maxQueryKeys if it exceeds maxRowsPerBatch', () => {
      const policy = validateBatchPolicy({ maxRowsPerBatch: 200, maxQueryKeys: 500 });
      expect(policy.maxQueryKeys).toBe(200);
    });

    it('creates correct query chunks with valid batch policy', () => {
      const ids = Array.from({ length: 25 }, (_, i) => `TXN-${i + 1}`);
      const plans = createBatchPlan(ids, { maxRowsPerBatch: 10, maxQueryKeys: 5 });
      expect(plans.length).toBe(3);
      expect(plans[0].queryChunks.length).toBe(2);
      expect(plans[0].queryChunks[0].transactionIds.length).toBe(5);
    });
  });

  describe('4. Fail-Fast Configuration & Eliminating Silent Fallbacks', () => {
    it('validates semantic version format in workflow bundle creation', async () => {
      await expect(
        workflowBundleService.createBundle({
          name: 'Invalid Bundle',
          version: 'invalid_version_str',
          scope: 'TEAM',
          workflowId: 'wf-1',
          sourceTeamId: 'team-1',
          makerId: 'usr-1',
          makerName: 'Maker One'
        })
      ).rejects.toThrow(/Invalid semantic version format/);
    });

    it('validates scope in workflow bundle creation', async () => {
      await expect(
        workflowBundleService.createBundle({
          name: 'Invalid Bundle Scope',
          version: '1.0.0',
          scope: 'UNAUTHORIZED_SCOPE' as any,
          workflowId: 'wf-1',
          sourceTeamId: 'team-1',
          makerId: 'usr-1',
          makerName: 'Maker One'
        })
      ).rejects.toThrow(/Invalid bundle scope/);
    });
  });
});
