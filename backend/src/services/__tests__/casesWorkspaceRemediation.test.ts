import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { issuesRouter } from '../../routes/issues.js';
import { investigationsRouter } from '../../routes/investigations.js';
import { postgresRepo as repo } from '../../store/postgresRepo.js';

describe('Cases Page & Investigation Workspace Remediation (AUD-CAS-001..004)', () => {
  let server: Server;
  let baseUrl: string;
  let mockUser: any;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
    app.use('/api/issues', issuesRouter);
    app.use('/api/investigations', investigationsRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('AUD-CAS-001: Pagination Limit Expansion to 5,000 in issues.ts', () => {
    it('accepts limit up to 5,000 without artificially clamping to 500', async () => {
      mockUser = { id: 'usr-1', role: 'admin' };

      const getSpy = vi.spyOn(repo, 'getTaskDatasetTransactions').mockResolvedValueOnce({
        totalCount: 1500,
        rows: Array(1500).fill({ id: 'row-1', amount: 100 })
      } as any);

      const res = await fetch(`${baseUrl}/api/issues/task-123/transactions?page=1&limit=5000`);
      expect(res.status).toBe(200);

      const data = await res.json() as any;
      expect(data.limit).toBe(5000);
      expect(data.totalCount).toBe(1500);
      expect(data.totalPages).toBe(1);
      expect(getSpy).toHaveBeenCalledWith('task-123', 1, 5000, undefined);
    });

    it('clamps limit exceeding 5,000 to the maximum 5,000 bound', async () => {
      mockUser = { id: 'usr-1', role: 'admin' };

      const getSpy = vi.spyOn(repo, 'getTaskDatasetTransactions').mockResolvedValueOnce({
        totalCount: 50,
        rows: []
      } as any);

      const res = await fetch(`${baseUrl}/api/issues/task-123/transactions?page=1&limit=99999`);
      expect(res.status).toBe(200);

      const data = await res.json() as any;
      expect(data.limit).toBe(5000);
      expect(getSpy).toHaveBeenCalledWith('task-123', 1, 5000, undefined);
    });
  });

  describe('AUD-CAS-004: Team Ownership & Authorization on Central Records & Executions', () => {
    it('GET /api/investigations/:taskId/central-records returns 404 for nonexistent task', async () => {
      mockUser = { id: 'usr-1', role: 'admin' };
      vi.spyOn(repo, 'getIssueById').mockResolvedValueOnce(null);

      const res = await fetch(`${baseUrl}/api/investigations/nonexistent-task/central-records`);
      expect(res.status).toBe(404);
      const data = await res.json() as any;
      expect(data.error).toMatch(/Task not found/i);
    });

    it('GET /api/investigations/:taskId/central-records rejects cross-team access with 403', async () => {
      mockUser = { id: 'usr-2', role: 'operator', teamId: 'team-alpha' };
      vi.spyOn(repo, 'getIssueById').mockResolvedValueOnce({
        id: 'task-private-beta',
        teamId: 'team-beta',
        visibility: 'TEAM_PUBLIC'
      } as any);

      const res = await fetch(`${baseUrl}/api/investigations/task-private-beta/central-records`);
      expect(res.status).toBe(403);
      const data = await res.json() as any;
      expect(data.error).toMatch(/Access denied/i);
    });

    it('GET /api/investigations/:taskId/central-records allows member of owning team', async () => {
      mockUser = { id: 'usr-3', role: 'analyst', teamId: 'team-beta' };
      vi.spyOn(repo, 'getIssueById').mockResolvedValueOnce({
        id: 'task-private-beta',
        teamId: 'team-beta',
        visibility: 'TEAM_PUBLIC'
      } as any);
      vi.spyOn(repo, 'getCentralTransactionsByTaskId').mockResolvedValueOnce([
        {
          canonicalData: { refnum: 'TXN-999', reqamt: 450 },
          transactionKey: 'key-999',
          originalTaskId: 'task-private-beta',
          currentTaskId: 'task-private-beta',
          batchId: 'batch-1',
          rowNumber: 1,
          status: 'MATCHED',
          isDuplicate: false,
          duplicateCount: 1,
          createdAt: new Date().toISOString()
        } as any
      ]);

      const res = await fetch(`${baseUrl}/api/investigations/task-private-beta/central-records`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.totalCount).toBe(1);
      expect(data.records[0]._transactionKey).toBe('key-999');
    });

    it('GET /api/investigations/:taskId/workflow-executions returns 403 for unauthorized cross-team access', async () => {
      mockUser = { id: 'usr-4', role: 'operator', teamId: 'team-gamma' };
      vi.spyOn(repo, 'getIssueById').mockResolvedValueOnce({
        id: 'task-private-delta',
        teamId: 'team-delta',
        visibility: 'TEAM_PUBLIC'
      } as any);

      const res = await fetch(`${baseUrl}/api/investigations/task-private-delta/workflow-executions`);
      expect(res.status).toBe(403);
      const data = await res.json() as any;
      expect(data.error).toMatch(/Access denied/i);
    });

    it('GET /api/investigations/:taskId/workflow-executions allows admin to view executions', async () => {
      mockUser = { id: 'admin-1', role: 'admin', teamId: 'team-admin' };
      vi.spyOn(repo, 'getIssueById').mockResolvedValueOnce({
        id: 'task-private-delta',
        teamId: 'team-delta',
        visibility: 'TEAM_PUBLIC'
      } as any);
      vi.spyOn(repo, 'getTaskWorkflowExecutionsByTaskId').mockResolvedValueOnce([
        { id: 'exec-1', workflowId: 'wf-1' } as any
      ]);

      const res = await fetch(`${baseUrl}/api/investigations/task-private-delta/workflow-executions`);
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.count).toBe(1);
    });
  });
});
