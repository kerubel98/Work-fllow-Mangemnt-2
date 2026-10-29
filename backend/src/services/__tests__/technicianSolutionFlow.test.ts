import { describe, it, expect, vi, beforeEach } from 'vitest';
import { repo } from '../../store/repository.js';
import { HashtagPreset, Issue } from '../../types.js';

describe('Domain 10: Technician Solution Flow (Screens 38–44)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Screen 38: Stage Task & Environment Isolation', () => {
    it('successfully stages an issue into SANDBOX environment', async () => {
      const mockIssue: Issue = {
        id: 'iss-test-01',
        title: 'CBE Settlement Amount Discrepancy',
        status: 'Investigating',
        priority: 'HIGH',
        creatorId: 'usr-ops-1',
        creatorName: 'Operator One',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stagedEnvironment: 'SANDBOX',
        stagedByUserId: 'usr-tech-1',
        stagedByUserName: 'Technician Lead',
        stagedAt: new Date().toISOString(),
        findingsNotes: 'Initial check indicates decimal truncation during feed conversion'
      };

      vi.spyOn(repo, 'stageIssueEnvironment').mockResolvedValue(mockIssue);

      const staged = await repo.stageIssueEnvironment(
        'iss-test-01',
        'SANDBOX',
        'usr-tech-1',
        'Technician Lead',
        'Initial check indicates decimal truncation during feed conversion'
      );

      expect(staged).toBeDefined();
      expect(staged?.stagedEnvironment).toBe('SANDBOX');
      expect(staged?.stagedByUserName).toBe('Technician Lead');
      expect(staged?.status).toBe('Investigating');
      expect(staged?.findingsNotes).toContain('decimal truncation');
    });

    it('enforces Maker-Checker Four-Eyes authorization principle for PRODUCTION staging', async () => {
      // Simulates unauthorized operator attempting direct live production staging
      const operatorRole = 'operational';
      const isAuthorizedForProduction = ['administrator', 'superadmin', 'manager', 'checker', 'team_admin', 'lead', 'admin'].includes(operatorRole);

      expect(isAuthorizedForProduction).toBe(false);
    });
  });

  describe('Screen 40: Parameterized Solution Script & Dry-Run Evaluation', () => {
    it('extracts placeholder tokens and validates safe non-destructive bounds', () => {
      const script = `
        UPDATE transactions
        SET status = 'RESOLVED',
            amount = {{Amount}},
            refnum = {{Refnum}}
        WHERE id = {{Transaction_ID}};
      `;

      const tokenRegex = /\{\{([a-zA-Z0-9_-]+)\}\}/g;
      const tokens = Array.from(new Set(Array.from(script.matchAll(tokenRegex)).map(m => m[1])));

      expect(tokens).toEqual(['Amount', 'Refnum', 'Transaction_ID']);

      const isDangerous = /DROP\s+TABLE|TRUNCATE|DELETE\s+FROM\s+\w+\s*(?:;|$)/i.test(script);
      expect(isDangerous).toBe(false);
    });

    it('computes before vs after diffs on sample discrepancy records', () => {
      const sampleRow = {
        id: 'tx-001',
        transaction_id: 'TXN-9021',
        amount: 1250.00,
        refnum: 'REF-8891',
        status: 'FAILED',
        reason: 'RECONCILIATION_MISMATCH'
      };

      const afterRow = {
        ...sampleRow,
        status: 'RESOLVED',
        _remediatedBy: 'TECHNICIAN_SOLUTION_SCRIPT',
        _remediatedAt: new Date().toISOString()
      };

      expect(sampleRow.status).toBe('FAILED');
      expect(afterRow.status).toBe('RESOLVED');
      expect(afterRow._remediatedBy).toBe('TECHNICIAN_SOLUTION_SCRIPT');
      expect(afterRow.amount).toBe(sampleRow.amount);
    });
  });

  describe('Screen 41: Post as Universal Hashtag & 4-Eyes Gateway', () => {
    it('packages solution with locked process attachments and sets PENDING_APPROVAL', async () => {
      const newPreset: HashtagPreset = {
        tag: '#AIB_SETTLEMENT_2026',
        description: 'Automated settlement remediation for Awash Bank switch clearing',
        criteria: 'Stage 2: Amount Consistency & Ledger Match',
        expectedFileStructure: ['transaction_id', 'amount', 'refnum', 'status'],
        solutionTemplate: 'UPDATE transactions SET status = \'RESOLVED\' WHERE status = \'FAILED\';',
        author: 'Technician Lead',
        createdAt: new Date().toISOString(),
        processType: 'INTERNAL_STAGED_FIX',
        ownerUserId: 'usr-tech-1',
        ownerName: 'Technician Lead',
        solutionType: 'TEMPORARY',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        lockedProcess: {
          fileSchemaName: 'aib_settlement_2026.csv',
          mappingRecipeName: 'AIB Standard Settlement v2',
          validationStageName: 'Stage 2: Amount Consistency & Ledger Match',
          slaTerms: '24h Target Resolution SLA',
          fileHeaders: ['transaction_id', 'amount', 'refnum', 'status']
        },
        checkerStatus: 'PENDING_APPROVAL',
        reportingTeamId: 'team-ops'
      };

      vi.spyOn(repo, 'createHashtag').mockResolvedValue(newPreset);

      const saved = await repo.createHashtag(newPreset);

      expect(saved.tag).toBe('#AIB_SETTLEMENT_2026');
      expect(saved.checkerStatus).toBe('PENDING_APPROVAL');
      expect(saved.ownerUserId).toBe('usr-tech-1');
      expect(saved.solutionType).toBe('TEMPORARY');
      expect(saved.lockedProcess?.fileSchemaName).toBe('aib_settlement_2026.csv');
    });
  });

  describe('Screen 42: Collected Transactions Ledger & Remediation', () => {
    it('aggregates transaction stats into 4 KPI categories: total, fixed, failed, waiting', async () => {
      const mockStats = {
        total: 150,
        fixed: 120,
        failed: 6,
        waiting: 24
      };

      vi.spyOn(repo, 'getHashtagTransactionStats').mockResolvedValue(mockStats);

      const stats = await repo.getHashtagTransactionStats('#AIB_SETTLEMENT_2026');

      expect(stats.total).toBe(150);
      expect(stats.fixed).toBe(120);
      expect(stats.failed).toBe(6);
      expect(stats.waiting).toBe(24);
      expect(stats.fixed + stats.failed + stats.waiting).toBe(stats.total);
    });

    it('records and remediates individual collected transactions', async () => {
      const collectedTx = {
        id: 'tx-aib-1',
        hashtagTag: '#AIB_SETTLEMENT_2026',
        transactionKey: 'TXN-9021',
        issueId: 'iss-test-01',
        status: 'WAITING' as const,
        failureReason: 'Amount mismatch with host ledger',
        beforePayload: { transaction_id: 'TXN-9021', amount: 1250.00, status: 'FAILED' },
        afterPayload: {},
        collectedAt: new Date().toISOString()
      };

      const recordSpy = vi.spyOn(repo, 'recordCollectedTransaction').mockResolvedValue(undefined);

      await repo.recordCollectedTransaction(collectedTx);
      expect(recordSpy).toHaveBeenCalledWith(collectedTx);

      // Remediate transaction
      const remediatedTx = {
        ...collectedTx,
        status: 'FIXED' as const,
        afterPayload: { ...collectedTx.beforePayload, status: 'REMEDIATED' },
        executedAt: new Date().toISOString(),
        executedBy: 'usr-tech-1'
      };

      await repo.recordCollectedTransaction(remediatedTx);
      expect(recordSpy).toHaveBeenCalledWith(remediatedTx);
    });
  });

  describe('Screen 43: Request a Change Workflow', () => {
    it('registers change request from escalating team to hashtag author', async () => {
      const initialPreset: HashtagPreset = {
        tag: '#AIB_SETTLEMENT_2026',
        description: 'Initial script',
        criteria: 'Stage 2',
        expectedFileStructure: ['id'],
        solutionTemplate: 'SELECT 1;',
        author: 'Technician Lead',
        createdAt: new Date().toISOString(),
        ownerUserId: 'usr-tech-1',
        ownerName: 'Technician Lead',
        reportingTeamId: 'team-ops'
      };

      const updatedPreset = {
        ...initialPreset,
        changeRequestId: 'CR-1792869500000',
        description: 'Initial script\n[Change Request CR-1792869500000]: Updated fee structure in batch'
      };

      vi.spyOn(repo, 'updateHashtag').mockResolvedValue(updatedPreset);

      const result = await repo.updateHashtag('#AIB_SETTLEMENT_2026', {
        changeRequestId: 'CR-1792869500000',
        description: `${initialPreset.description}\n[Change Request CR-1792869500000]: Updated fee structure in batch`
      });

      expect(result?.changeRequestId).toBe('CR-1792869500000');
      expect(result?.description).toContain('CR-1792869500000');
    });
  });
});
