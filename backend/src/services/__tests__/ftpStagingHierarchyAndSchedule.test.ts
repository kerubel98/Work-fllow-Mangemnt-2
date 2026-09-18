import { describe, it, expect } from 'vitest';
import { ftpFileStagingService } from '../ftpFileStagingService.js';
import { ftpSchedulerService } from '../ftpSchedulerService.js';
import { FtpFileStagingConfig, FolderStructureException } from '../../types.js';

describe('FTP File Staging Hierarchy, Exception Overrides & Scheduler', () => {
  const baseConfig: FtpFileStagingConfig = {
    id: 'cfg-root-test',
    name: 'Root Clearing Feed',
    ftpConnectionId: 'ftp-test-conn',
    sourceDirectoryPath: '/clearing',
    rootDirectoryPath: '/clearing',
    fileNamePattern: '*/*.csv',
    sampleFileName: 'clearing_01.csv',
    fileFormat: 'CSV',
    customDelimiter: ',',
    hasHeader: true,
    headerRowIndex: 1,
    headerRowCount: 1,
    dataStartRow: 2,
    skipFooterLines: 0,
    quoteChar: '"',
    dateFormat: 'YYYY-MM-DD',
    folderTraversalMode: 'RECURSIVE_SCAN',
    mismatchHandling: 'SKIP_AND_NOTIFY',
    folderExceptions: [
      {
        id: 'exc-legacy',
        folderPattern: '/clearing/legacy/*',
        fileFormat: 'CSV',
        customDelimiter: ';',
        hasHeader: true,
        headerRowIndex: 2,
        dataStartRow: 3,
        note: 'Legacy subfolder uses semicolon delimiter and 2-row header'
      },
      {
        id: 'exc-reports',
        folderPattern: '*reports*',
        fileFormat: 'TXT',
        customDelimiter: '|',
        note: 'Reports directory uses pipe delimiter'
      }
    ],
    scheduleConfig: {
      enabled: true,
      frequency: 'HOURLY',
      targetType: 'CSV'
    },
    fieldMappings: [
      {
        sourceColumn: 'txn_id',
        canonicalField: 'refnum',
        dataType: 'string',
        isImportant: true
      }
    ]
  };

  describe('resolveEffectiveConfigForFile', () => {
    it('inherits root config when no folder exception matches', () => {
      const effective = ftpFileStagingService.resolveEffectiveConfigForFile(
        baseConfig,
        'batch_01.csv',
        '/clearing/daily'
      );

      expect(effective.customDelimiter).toBe(',');
      expect(effective.fileFormat).toBe('CSV');
      expect(effective.headerRowIndex).toBe(1);
      expect(effective.dataStartRow).toBe(2);
    });

    it('applies exact subfolder exception override when path matches pattern', () => {
      const effective = ftpFileStagingService.resolveEffectiveConfigForFile(
        baseConfig,
        'old_feed.csv',
        '/clearing/legacy/sub'
      );

      expect(effective.customDelimiter).toBe(';');
      expect(effective.fileFormat).toBe('CSV');
      expect(effective.headerRowIndex).toBe(2);
      expect(effective.dataStartRow).toBe(3);
    });

    it('applies wildcard exception override when pattern matches segment', () => {
      const effective = ftpFileStagingService.resolveEffectiveConfigForFile(
        baseConfig,
        'audit_report.txt',
        '/clearing/reports/2026'
      );

      expect(effective.customDelimiter).toBe('|');
      expect(effective.fileFormat).toBe('TXT');
    });

    it('preserves field mappings and metadata during exception resolution', () => {
      const effective = ftpFileStagingService.resolveEffectiveConfigForFile(
        baseConfig,
        'data.csv',
        '/clearing/legacy'
      );

      expect(effective.fieldMappings).toHaveLength(1);
      expect(effective.fieldMappings[0].canonicalField).toBe('refnum');
      expect(effective.mismatchHandling).toBe('SKIP_AND_NOTIFY');
    });
  });

  describe('ftpSchedulerService target type filtering', () => {
    it('correctly reports execution metrics structure', async () => {
      // Test running scheduled staging with a non-existent connection to verify graceful handling
      const result = await ftpSchedulerService.runScheduledFtpStaging({
        targetType: 'EXCEL',
        connectionId: 'non-existent-server',
        forceAll: false
      });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.results)).toBe(true);
      expect(typeof result.executionTimeMs).toBe('number');
    });
  });
});
