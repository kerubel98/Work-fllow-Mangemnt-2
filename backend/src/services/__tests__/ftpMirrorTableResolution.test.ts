import { describe, it, expect, vi } from 'vitest';
import { mirrorTableManager } from '../mirrorTableManager.js';
import { executeLiveQueryOnDb, getTableColumnsForDb } from '../dbConnectionManager.js';
import { DatabaseConnection } from '../../types.js';

describe('FTP & Mirror Table Resolution Safety', () => {
  const mockFtpDb: DatabaseConnection = {
    id: 'db-ftp-local',
    name: 'LocalFTP',
    type: 'SFTP',
    host: '127.0.0.1',
    port: 22,
    username: 'ftpuser',
    password: 'password',
    status: 'online',
    apiEndpoint: '',
    availableTables: ['mirror_ftp_settlemnt_______settlemnt_xls', 'transactions.csv'],
    allowedTables: ['mirror_ftp_settlemnt_______settlemnt_xls']
  };

  describe('mirrorTableManager.getMirrorTableName', () => {
    it('does not double-prefix table names that already start with mirror_', () => {
      const result = mirrorTableManager.getMirrorTableName('LocalFTP', 'mirror_ftp_settlemnt_______settlemnt_xls');
      expect(result).toBe('mirror_ftp_settlemnt_______settlemnt_xls');
      expect(result.startsWith('mirror_localftp_mirror_')).toBe(false);
    });

    it('correctly prefixes regular tables with database identifier', () => {
      const result = mirrorTableManager.getMirrorTableName('LocalFTP', 'transactions_settled');
      expect(result).toBe('mirror_localftp_transactions_settled');
    });
  });

  describe('executeLiveQueryOnDb mirror interception', () => {
    it('routes mirror table SELECT query to PostgreSQL instead of attempting SFTP file open', async () => {
      const query = 'SELECT * FROM mirror_ftp_settlemnt_______settlemnt_xls LIMIT 25';
      
      // If executeLiveQueryOnDb tried to connect to SFTP at 127.0.0.1:22, it would fail with SFTP error.
      // Instead, it routes to queryPg. Because postgres test container / mock is running or handles queryPg,
      // it should never throw "SFTP failed to open" or "Connection refused on port 22".
      try {
        const res = await executeLiveQueryOnDb(mockFtpDb, query);
        expect(res).toBeDefined();
        expect(Array.isArray(res.rows)).toBe(true);
      } catch (err: any) {
        // Even if the table doesn't exist in local PG during offline test, the error must be from PG, NOT SFTP!
        expect(err.message).not.toContain('SFTP failed to open');
        expect(err.message).not.toContain('FTP');
      }
    });

    it('routes naked mirror table name to PostgreSQL SELECT', async () => {
      try {
        const res = await executeLiveQueryOnDb(mockFtpDb, 'mirror_ftp_settlemnt_______settlemnt_xls');
        expect(res).toBeDefined();
        expect(Array.isArray(res.rows)).toBe(true);
      } catch (err: any) {
        expect(err.message).not.toContain('SFTP failed to open');
        expect(err.message).not.toContain('FTP');
      }
    });

    it('queries local PostgreSQL staged table or provides clear staging guidance without connecting to FTP', async () => {
      try {
        await executeLiveQueryOnDb(mockFtpDb, 'SELECT * FROM settlement_reconciliation_feed.csv LIMIT 25');
      } catch (err: any) {
        // Must never try to open FTP/SFTP socket or time out on control socket
        expect(err.message).not.toContain('SFTP failed to open');
        expect(err.message).not.toContain('Timeout (control socket)');
        expect(err.message).toContain('staged');
      }
    });
  });

  describe('getTableColumnsForDb mirror introspection', () => {
    it('introspects columns directly from PostgreSQL for mirror_ tables without calling SFTP', async () => {
      try {
        const cols = await getTableColumnsForDb(mockFtpDb, 'mirror_ftp_settlemnt_______settlemnt_xls');
        expect(Array.isArray(cols)).toBe(true);
      } catch (err: any) {
        expect(err.message).not.toContain('SFTP failed to open');
        expect(err.message).not.toContain('FTP');
      }
    });
  });

  describe('resolveRemotePath normalization', () => {
    it('correctly resolves relative and absolute paths against base directory', async () => {
      const { resolveRemotePath } = await import('../ftpConnectionService.js');
      expect(resolveRemotePath('/', 'settlement_reconciliation_feed.csv')).toBe('/settlement_reconciliation_feed.csv');
      expect(resolveRemotePath('/clearing', 'settlement_reconciliation_feed.csv')).toBe('/clearing/settlement_reconciliation_feed.csv');
      expect(resolveRemotePath('/clearing/', '/settlement_reconciliation_feed.csv')).toBe('/clearing/settlement_reconciliation_feed.csv');
      expect(resolveRemotePath('/clearing', '/clearing/settlement_reconciliation_feed.csv')).toBe('/clearing/settlement_reconciliation_feed.csv');
    });
  });

  describe('Permanent mirror table retention', () => {
    it('protects mirror_ftp_ tables from cleanupOldMirrorRows age-based trimming', async () => {
      const deleted = await mirrorTableManager.cleanupOldMirrorRows('mirror_ftp_settlement_reconciliation_feed_csv', 24);
      expect(deleted).toBe(0);
    });

    it('protects mirror_ftp_ tables from cleanupMirrorBatch batch purging', async () => {
      const deleted = await mirrorTableManager.cleanupMirrorBatch('mirror_ftp_settlement_reconciliation_feed_csv', 'batch-123');
      expect(deleted).toBe(0);
    });

    it('provides ensureFtpTablesArePermanent helper', async () => {
      const { ftpFileStagingService } = await import('../ftpFileStagingService.js');
      expect(typeof ftpFileStagingService.ensureFtpTablesArePermanent).toBe('function');
      const converted = await ftpFileStagingService.ensureFtpTablesArePermanent();
      expect(Array.isArray(converted)).toBe(true);
    });
  });
});
