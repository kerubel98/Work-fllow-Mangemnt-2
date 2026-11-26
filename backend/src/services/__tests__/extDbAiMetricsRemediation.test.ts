import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateAndSanitizeMirrorQuery, buildPoolKey, stopPoolCleanupTask } from '../dbConnectionManager.js';
import { redactTransactionData } from '../../routes/ai.js';
import express from 'express';
import { metricsRouter } from '../../routes/metrics.js';
import { Server } from 'http';

describe('AUD-EXT-001: Mirror Fast-Path Query Validation & Isolation', () => {
  it('allows valid SELECT queries targeting mirror_* tables', () => {
    const query = 'SELECT id, amount, status FROM mirror_core_transactions WHERE amount > 100 LIMIT 50';
    const result = validateAndSanitizeMirrorQuery(query);
    expect(result.cleanSql).toContain('FROM mirror_core_transactions');
    expect(result.targetTable).toBe('mirror_core_transactions');
  });

  it('normalizes naked mirror table names to safe SELECT queries', () => {
    const nakedTable = 'mirror_ftp_settlemnt_______settlemnt_xls';
    const result = validateAndSanitizeMirrorQuery(nakedTable);
    expect(result.cleanSql).toBe('SELECT * FROM "mirror_ftp_settlemnt_______settlemnt_xls" LIMIT 50');
    expect(result.targetTable).toBe(nakedTable);
  });

  it('safely handles trailing semicolons without error', () => {
    const query = 'SELECT * FROM mirror_orders WHERE status = \'COMPLETED\';';
    const result = validateAndSanitizeMirrorQuery(query);
    expect(result.cleanSql).toBe('SELECT * FROM mirror_orders WHERE status = \'COMPLETED\'');
  });

  it('rejects stacked SQL statements with semicolons', () => {
    const malicious = 'SELECT * FROM mirror_orders; DELETE FROM users;';
    expect(() => validateAndSanitizeMirrorQuery(malicious)).toThrow(/Semicolons and stacked SQL statements are forbidden/);
  });

  it('rejects SQL comments (-- and /* */)', () => {
    const comment1 = 'SELECT * FROM mirror_orders -- comment\nWHERE 1=1';
    expect(() => validateAndSanitizeMirrorQuery(comment1)).toThrow(/SQL comments are forbidden/);

    const comment2 = 'SELECT * FROM mirror_orders /* comment */ WHERE 1=1';
    expect(() => validateAndSanitizeMirrorQuery(comment2)).toThrow(/SQL comments are forbidden/);
  });

  it('rejects mutating DDL and DML keywords', () => {
    expect(() => validateAndSanitizeMirrorQuery('DROP TABLE mirror_orders')).toThrow(/Mutating operations against PostgreSQL pool are restricted/);
    expect(() => validateAndSanitizeMirrorQuery('DELETE FROM mirror_orders WHERE id = 1')).toThrow(/Mutating operations against PostgreSQL pool are restricted/);
    expect(() => validateAndSanitizeMirrorQuery('UPDATE mirror_orders SET status = 1')).toThrow(/Mutating operations against PostgreSQL pool are restricted/);
    expect(() => validateAndSanitizeMirrorQuery('INSERT INTO mirror_orders VALUES (1)')).toThrow(/Mutating operations against PostgreSQL pool are restricted/);
    expect(() => validateAndSanitizeMirrorQuery('TRUNCATE TABLE mirror_orders')).toThrow(/Mutating operations against PostgreSQL pool are restricted/);
  });

  it('rejects UNION and UNION ALL attacks exfiltrating internal data', () => {
    const unionQuery = 'SELECT id, title FROM mirror_orders UNION ALL SELECT id, password_hash FROM users';
    expect(() => validateAndSanitizeMirrorQuery(unionQuery)).toThrow(/UNION queries are forbidden/);
  });

  it('rejects SELECT INTO clauses', () => {
    const intoQuery = 'SELECT * INTO exfil_table FROM mirror_orders';
    expect(() => validateAndSanitizeMirrorQuery(intoQuery)).toThrow(/INTO clauses are forbidden/);
  });

  it('rejects access to PostgreSQL system catalogs', () => {
    const pgCatalog = 'SELECT * FROM mirror_x WHERE id IN (SELECT tablename FROM pg_tables)';
    expect(() => validateAndSanitizeMirrorQuery(pgCatalog)).toThrow(/Access to internal PostgreSQL system catalog tables is forbidden/);

    const infoSchema = 'SELECT * FROM mirror_x WHERE col IN (SELECT column_name FROM information_schema.columns)';
    expect(() => validateAndSanitizeMirrorQuery(infoSchema)).toThrow(/Access to internal PostgreSQL system catalog tables is forbidden/);
  });

  it('rejects JOINs to internal non-mirror tables', () => {
    const joinUsers = 'SELECT * FROM mirror_orders m JOIN users u ON m.user_id = u.id';
    expect(() => validateAndSanitizeMirrorQuery(joinUsers)).toThrow(/Mirror fast-path queries may only access mirror_\* tables. Unauthorized table access attempt: "users"/);
  });

  it('rejects subqueries in FROM clause referencing internal non-mirror tables', () => {
    const subquery = 'SELECT * FROM (SELECT id, email FROM users) AS u JOIN mirror_orders ON 1=1';
    expect(() => validateAndSanitizeMirrorQuery(subquery)).toThrow(/Mirror fast-path queries may only access mirror_\* tables. Unauthorized table access attempt: "users"/);
  });
});

describe('AUD-EXT-004: External Database Pool Key & TLS Configuration', () => {
  it('generates deterministic pool keys including host, port, database, and credential hash', () => {
    const mockDb: any = { id: 'db-1', name: 'External DB', type: 'PostgreSQL' };
    const config1 = { host: 'db.example.com', port: 5432, database: 'finance', user: 'admin', password: 'secret1', ssl: false };
    const key1 = buildPoolKey(mockDb, config1);

    expect(key1).toContain('db-1:db.example.com:5432:finance:');

    // Same credentials produce the same pool key
    const key1Repeat = buildPoolKey(mockDb, { ...config1 });
    expect(key1Repeat).toBe(key1);
  });

  it('generates different pool keys when credentials change to prevent stale connection reuse', () => {
    const mockDb: any = { id: 'db-1', name: 'External DB', type: 'PostgreSQL' };
    const config1 = { host: 'db.example.com', port: 5432, database: 'finance', user: 'admin', password: 'secret1', ssl: false };
    const config2 = { host: 'db.example.com', port: 5432, database: 'finance', user: 'admin', password: 'new_password', ssl: false };

    const key1 = buildPoolKey(mockDb, config1);
    const key2 = buildPoolKey(mockDb, config2);
    expect(key1).not.toBe(key2);
  });

  it('generates different pool keys when SSL configuration changes', () => {
    const mockDb: any = { id: 'db-1', name: 'External DB', type: 'PostgreSQL' };
    const configPlain = { host: 'db.example.com', port: 5432, database: 'finance', user: 'admin', password: 'secret', ssl: false };
    const configSsl = { host: 'db.example.com', port: 5432, database: 'finance', user: 'admin', password: 'secret', ssl: { rejectUnauthorized: false } };

    const keyPlain = buildPoolKey(mockDb, configPlain);
    const keySsl = buildPoolKey(mockDb, configSsl);
    expect(keyPlain).not.toBe(keySsl);
  });
});

describe('AUD-EXT-002: Financial Transaction Data Redaction (PII/PAN)', () => {
  it('redacts 16-digit credit card numbers leaving only the last 4 digits', () => {
    const payload = {
      card_number: '4532015092834192',
      amount: 1450.00,
      currency: 'USD'
    };
    const redacted = redactTransactionData(payload);
    expect(redacted.card_number).toBe('•••• •••• •••• 4192');
    expect(redacted.amount).toBe(1450.00);
  });

  it('redacts security codes, PINs, and passwords completely', () => {
    const payload = {
      cvv: '982',
      pin: '1234',
      token: 'jwt.secret.token'
    };
    const redacted = redactTransactionData(payload);
    expect(redacted.cvv).toBe('••••••••');
    expect(redacted.pin).toBe('••••••••');
    expect(redacted.token).toBe('••••••••');
  });

  it('redacts bank account numbers and IBAN', () => {
    const payload = {
      account_number: '98765432101234',
      iban: 'GB29NWBK60161331926819'
    };
    const redacted = redactTransactionData(payload);
    expect(redacted.account_number).toBe('••••1234');
    expect(redacted.iban).toBe('••••6819');
  });

  it('masks personal names, email addresses, and phone numbers', () => {
    const payload = {
      customer_name: 'John Doe',
      email: 'john.doe@example.com',
      phone: '+1-555-432-8765'
    };
    const redacted = redactTransactionData(payload);
    expect(redacted.customer_name).toBe('J*** D***');
    expect(redacted.email).toBe('j***@example.com');
    expect(redacted.phone).toBe('***-***-8765');
  });

  it('redacts government IDs and SSNs', () => {
    const payload = {
      ssn: '123-45-6789',
      tax_id: '99-8877665'
    };
    const redacted = redactTransactionData(payload);
    expect(redacted.ssn).toBe('[REDACTED_SSN]');
    expect(redacted.tax_id).toBe('[REDACTED_SSN]');
  });

  it('recursively redacts arrays of transactions and nested metadata', () => {
    const nested = {
      batchId: 'BATCH-001',
      transactions: [
        {
          id: 'TXN-1',
          pan: '5425233490123456',
          cvv: '123',
          customer_name: 'Alice Smith',
          meta: {
            contact_email: 'alice@bank.org'
          }
        }
      ]
    };
    const redacted = redactTransactionData(nested);
    expect(redacted.transactions[0].pan).toBe('•••• •••• •••• 3456');
    expect(redacted.transactions[0].cvv).toBe('••••••••');
    expect(redacted.transactions[0].customer_name).toBe('A*** S***');
    expect(redacted.transactions[0].meta.contact_email).toBe('a***@bank.org');
  });
});

describe('AUD-EXT-003: Team Metrics Authorization (GET /api/metrics/team/:teamId)', () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;
  let mockUser: any;

  beforeEach(async () => {
    app = express();
    app.use(express.json());

    // Middleware injecting mock authenticated user
    app.use((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });

    app.use('/api/metrics', metricsRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as any;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  it('rejects non-admin caller accessing a team they do not belong to with HTTP 403', async () => {
    mockUser = { id: 'usr-1', username: 'analyst1', role: 'operational', teamId: 'team-finance' };

    const res = await fetch(`${baseUrl}/api/metrics/team/team-cards`);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Forbidden: You do not have permission to view KPIs for team "team-cards"');
  });

  it('allows user who belongs to the requested team', async () => {
    mockUser = { id: 'usr-1', username: 'analyst1', role: 'operational', teamId: 'team-cards' };

    const res = await fetch(`${baseUrl}/api/metrics/team/team-cards`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });

  it('allows system administrator to access KPIs for any team', async () => {
    mockUser = { id: 'admin-1', username: 'sysadmin', role: 'admin', teamId: 'team-core' };

    const res = await fetch(`${baseUrl}/api/metrics/team/team-cards`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeDefined();
  });
});
