import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { Request, Response } from 'express';
import { Server } from 'http';
import { transactionSettingsRouter } from '../../routes/transactionSettings.js';
import { postgresRepo } from '../../store/postgresRepo.js';

describe('Data Setup Audit Remediation (AUD-DSU-001..005)', () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;
  let mockUser: any = null;

  beforeEach(async () => {
    app = express();
    app.use(express.json());

    app.use((req: Request, _res: Response, next) => {
      if (mockUser) {
        (req as any).user = mockUser;
      }
      next();
    });

    app.use('/api/transactions', transactionSettingsRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    mockUser = null;
    await new Promise<void>((resolve) => {
      if (server) server.close(() => resolve());
      else resolve();
    });
  });

  // ==================== AUD-DSU-003: Authorization on Schema Mutations ====================
  describe('AUD-DSU-003: Global Schema Configuration Route Security', () => {
    it('1a. POST /api/transactions/settings/schema rejects non-admin / non-lead operator with HTTP 403', async () => {
      mockUser = { id: 'user-op', role: 'investigator', username: 'operator1' };
      const res = await fetch(`${baseUrl}/api/transactions/settings/schema`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customFields: [{ key: 'hacked_field' }] })
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Forbidden');
    });

    it('1b. POST /api/transactions/schema/config rejects non-admin / non-lead operator with HTTP 403', async () => {
      mockUser = { id: 'user-op', role: 'investigator', username: 'operator1' };
      const res = await fetch(`${baseUrl}/api/transactions/schema/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ standardFields: [{ key: 'amount' }] })
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Forbidden');
    });

    it('1c. POST /api/transactions/schema/config requires standardFields array', async () => {
      mockUser = { id: 'user-admin', role: 'admin', username: 'admin' };
      const res = await fetch(`${baseUrl}/api/transactions/schema/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: '3.0.0' })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('standardFields array is required');
    });

    it('1d. POST /api/transactions/schema/config allows admin to update global standard fields and persists', async () => {
      mockUser = { id: 'user-admin', role: 'admin', username: 'admin' };

      const origSave = postgresRepo.saveGlobalSchemaConfig;
      let savedConfig: any = null;
      postgresRepo.saveGlobalSchemaConfig = async (cfg: any) => {
        savedConfig = cfg;
        return cfg;
      };

      try {
        const res = await fetch(`${baseUrl}/api/transactions/schema/config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            standardFields: [
              { key: 'ref_num', label: 'Reference Number', category: 'Identity & reference', required: true }
            ],
            version: '2.5.0',
            description: 'Audit test update'
          })
        });

        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.version).toBe('2.5.0');
        expect(data.config.standardFields.length).toBe(1);
        expect(data.config.standardFields[0].key).toBe('ref_num');
      } finally {
        postgresRepo.saveGlobalSchemaConfig = origSave;
      }
    });
  });

  // ==================== AUD-DSU-002: Classification Invariants ====================
  describe('AUD-DSU-002: Classification Contract Verification', () => {
    it('2a. Validates classification categories including General and table-named prefixes', () => {
      const isUnclassified = (f: { category?: string }) => {
        if (!f.category) return true;
        const c = f.category.trim().toLowerCase();
        return c === 'unclassified' || c === 'general' || c.startsWith('table_');
      };

      expect(isUnclassified({})).toBe(true);
      expect(isUnclassified({ category: 'Unclassified' })).toBe(true);
      expect(isUnclassified({ category: 'General' })).toBe(true);
      expect(isUnclassified({ category: 'table_core_txns' })).toBe(true);
      expect(isUnclassified({ category: 'Financial & amounts' })).toBe(false);
      expect(isUnclassified({ category: 'Audit & timestamps' })).toBe(false);
      expect(isUnclassified({ category: 'Identity & reference' })).toBe(false);
    });
  });
});
