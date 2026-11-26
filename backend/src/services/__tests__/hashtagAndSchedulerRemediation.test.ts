import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import express from 'express';
import { miscRouter } from '../../routes/misc.js';
import { validateReadOnlySelectQuery } from '../hashtagService.js';
import { isFtpScheduleDue } from '../ftpSchedulerService.js';
import { generateToken } from '../../utils/auth.js';
import { repo } from '../../store/repository.js';
import { HashtagPreset, FtpStagingScheduleConfig } from '../../types.js';

describe('Universal Hashtag Engine & Background Schedulers Remediation (AUD-TAG-001..003)', () => {
  let server: http.Server;
  let baseUrl: string;

  const adminToken = generateToken({
    id: 'usr-admin-tag',
    username: 'admin_tag',
    email: 'admin@tag.test',
    role: 'admin',
    isApproved: true
  });

  const operatorToken = generateToken({
    id: 'usr-op-tag',
    username: 'op_tag',
    email: 'operator@tag.test',
    role: 'operational',
    isApproved: true
  });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', miscRouter);

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

  // ==========================================
  // AUD-TAG-001: SQL Injection Sanitization & Validation
  // ==========================================
  describe('AUD-TAG-001: SQL Injection Sanitization & Read-Only Query Enforcement', () => {
    it('accepts valid read-only SELECT queries', () => {
      const q1 = 'SELECT id, amount, status FROM settlements WHERE status = \'UNMATCHED\'';
      expect(validateReadOnlySelectQuery(q1)).toBe(q1);

      const q2 = 'WITH cte AS (SELECT id, amount FROM tx) SELECT * FROM cte;';
      expect(validateReadOnlySelectQuery(q2)).toBe('WITH cte AS (SELECT id, amount FROM tx) SELECT * FROM cte');
    });

    it('rejects stacked statements with semicolons', () => {
      expect(() => {
        validateReadOnlySelectQuery('SELECT * FROM users; DROP TABLE audits;');
      }).toThrow(/Security Violation: Semicolons and stacked statements are strictly prohibited/i);
    });

    it('rejects SQL comments (-- and /* */)', () => {
      expect(() => {
        validateReadOnlySelectQuery('SELECT * FROM users -- comment out');
      }).toThrow(/Security Violation: SQL comments are strictly prohibited/i);

      expect(() => {
        validateReadOnlySelectQuery('SELECT * FROM users /* inline comment */ WHERE 1=1');
      }).toThrow(/Security Violation: SQL comments are strictly prohibited/i);
    });

    it('rejects mutating SQL (INSERT, UPDATE, DELETE, DROP, TRUNCATE)', () => {
      expect(() => {
        validateReadOnlySelectQuery('UPDATE users SET role = \'admin\' WHERE id = 1');
      }).toThrow(/Security Violation: Only read-only SELECT queries are permitted/i);

      expect(() => {
        validateReadOnlySelectQuery('SELECT * FROM users WHERE id IN (SELECT id FROM accounts); DROP TABLE users');
      }).toThrow(/Security Violation/i);
    });

    it('rejects access to PostgreSQL system catalogs', () => {
      expect(() => {
        validateReadOnlySelectQuery('SELECT usename, passwd FROM pg_shadow');
      }).toThrow(/Security Violation: Unsafe SQL pattern detected/i);

      expect(() => {
        validateReadOnlySelectQuery('SELECT * FROM pg_catalog.pg_tables');
      }).toThrow(/Security Violation: Unsafe SQL pattern detected/i);
    });

    it('rejects POST /api/hashtags with SQL injection in criteria (400)', async () => {
      const res = await fetch(`${baseUrl}/api/hashtags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          tag: '#MALICIOUS_TAG_1',
          criteria: "SELECT * FROM users; DROP TABLE transactions; --",
          solutionTemplate: "SELECT 1"
        })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Security Violation/i);
    });

    it('rejects POST /api/hashtags with SQL injection in WHERE predicate (400)', async () => {
      const res = await fetch(`${baseUrl}/api/hashtags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          tag: '#MALICIOUS_TAG_2',
          criteria: "status = 'FAILED'; DROP TABLE issues; --",
          solutionTemplate: "SELECT 1"
        })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Security Violation/i);
    });
  });

  // ==========================================
  // AUD-TAG-002: Hashtag Preset Mutations & Role Escalation
  // ==========================================
  describe('AUD-TAG-002: Authorization & SCHEDULED_CRON Privilege Escalation Guards', () => {
    it('rejects unauthenticated POST /api/hashtags with 401', async () => {
      const res = await fetch(`${baseUrl}/api/hashtags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: '#UNAUTH_TAG' })
      });
      expect(res.status).toBe(401);
    });

    it('rejects non-admin/lead POST /api/hashtags configuring SCHEDULED_CRON with 403', async () => {
      const res = await fetch(`${baseUrl}/api/hashtags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${operatorToken}`
        },
        body: JSON.stringify({
          tag: '#OP_CRON_TAG',
          executionTrigger: 'SCHEDULED_CRON',
          solutionTemplate: 'SELECT 1'
        })
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Forbidden: Creating automated cron schedules/i);
    });

    it('rejects non-admin/lead POST /api/hashtags configuring DATABASE_DIRECT_SCANNER with 403', async () => {
      const res = await fetch(`${baseUrl}/api/hashtags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${operatorToken}`
        },
        body: JSON.stringify({
          tag: '#OP_SCAN_TAG',
          hashtagType: 'DATABASE_DIRECT_SCANNER',
          criteria: 'amount > 1000'
        })
      });

      expect(res.status).toBe(403);
    });

    it('allows admin to create valid SCHEDULED_CRON hashtag preset', async () => {
      const newTag: HashtagPreset = {
        tag: '#ADMIN_CRON_AUDIT',
        description: 'Automated settlement sweep',
        hashtagType: 'DATABASE_DIRECT_SCANNER',
        executionTrigger: 'SCHEDULED_CRON',
        criteria: 'status = \'UNMATCHED\'',
        solutionTemplate: 'SELECT * FROM settlements WHERE status = \'UNMATCHED\'',
        author: 'admin_tag',
        createdAt: new Date().toISOString()
      };

      vi.spyOn(repo, 'createHashtag').mockResolvedValueOnce(newTag);

      const res = await fetch(`${baseUrl}/api/hashtags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify(newTag)
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.tag).toBe('#ADMIN_CRON_AUDIT');
    });

    it('rejects PUT /api/hashtags/:tag from non-author / non-privileged user with 403', async () => {
      vi.spyOn(repo, 'getHashtagByTag').mockResolvedValueOnce({
        tag: '#PROTECTED_TAG',
        author: 'admin_tag',
        createdAt: new Date().toISOString()
      } as any);

      const res = await fetch(`${baseUrl}/api/hashtags/%23PROTECTED_TAG`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${operatorToken}`
        },
        body: JSON.stringify({ description: 'Tampered description' })
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Forbidden: You do not have permission to modify/i);
    });

    it('rejects DELETE /api/hashtags/:tag from non-author / non-privileged user with 403', async () => {
      vi.spyOn(repo, 'getHashtagByTag').mockResolvedValueOnce({
        tag: '#PROTECTED_TAG_2',
        author: 'admin_tag',
        createdAt: new Date().toISOString()
      } as any);

      const res = await fetch(`${baseUrl}/api/hashtags/%23PROTECTED_TAG_2`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${operatorToken}` }
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Forbidden: You do not have permission to delete/i);
    });
  });

  // ==========================================
  // AUD-TAG-003: Schedulers Cadence & Dynamic Team Routing
  // ==========================================
  describe('AUD-TAG-003: Schedulers Cadence & Dynamic Team Scoping', () => {
    it('isFtpScheduleDue returns false if schedule is disabled or MANUAL', () => {
      expect(isFtpScheduleDue(undefined)).toBe(false);
      expect(isFtpScheduleDue({ enabled: false, frequency: 'HOURLY', targetType: 'ALL' })).toBe(false);
      expect(isFtpScheduleDue({ enabled: true, frequency: 'MANUAL', targetType: 'ALL' })).toBe(false);
    });

    it('isFtpScheduleDue returns true if schedule enabled and has never run', () => {
      const config: FtpStagingScheduleConfig = {
        enabled: true,
        frequency: 'HOURLY',
        targetType: 'ALL'
      };
      expect(isFtpScheduleDue(config)).toBe(true);
    });

    it('isFtpScheduleDue respects interval elapsed time for HOURLY frequency', () => {
      const now = Date.now();
      const recentlyRun: FtpStagingScheduleConfig = {
        enabled: true,
        frequency: 'HOURLY',
        targetType: 'ALL',
        lastRunAt: new Date(now - 10 * 60 * 1000).toISOString() // 10 minutes ago
      };
      expect(isFtpScheduleDue(recentlyRun)).toBe(false);

      const dueRun: FtpStagingScheduleConfig = {
        enabled: true,
        frequency: 'HOURLY',
        targetType: 'ALL',
        lastRunAt: new Date(now - 65 * 60 * 1000).toISOString() // 65 minutes ago
      };
      expect(isFtpScheduleDue(dueRun)).toBe(true);
    });

    it('isFtpScheduleDue respects interval elapsed time for EVERY_15_MIN frequency', () => {
      const now = Date.now();
      const recent: FtpStagingScheduleConfig = {
        enabled: true,
        frequency: 'EVERY_15_MIN',
        targetType: 'ALL',
        lastRunAt: new Date(now - 5 * 60 * 1000).toISOString()
      };
      expect(isFtpScheduleDue(recent)).toBe(false);

      const due: FtpStagingScheduleConfig = {
        enabled: true,
        frequency: 'EVERY_15_MIN',
        targetType: 'ALL',
        lastRunAt: new Date(now - 16 * 60 * 1000).toISOString()
      };
      expect(isFtpScheduleDue(due)).toBe(true);
    });
  });
});
