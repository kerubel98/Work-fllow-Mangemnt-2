import { postgresRepo as repo } from '../store/postgresRepo.js';
import { ftpFileStagingService } from '../services/ftpFileStagingService.js';
import { discoverFtpFilesRecursive } from '../services/ftpConnectionService.js';
import { queryPg } from '../config/postgres.js';

async function main() {
  console.log('--- TESTING UNSETTLED FILE STAGING WITH SMART MERGED COLUMN PRUNING ---');
  const dbs = await repo.getDatabases();
  const ftpDb = dbs.find(d => d.name === 'LocalFTP' || d.type === 'SFTP' || d.type === 'FTP');
  if (!ftpDb) throw new Error('LocalFTP DB not found');

  const files = await discoverFtpFilesRecursive(ftpDb, '/', 10);
  const groups = await ftpFileStagingService.detectSemanticPatternsAcrossFolders(ftpDb, files, '/');
  const unsettledGroup = groups.find(g => g.pattern.includes('Unsettled'));
  if (!unsettledGroup) throw new Error('Unsettled pattern group not found');

  console.log(`Found pattern: "${unsettledGroup.pattern}" (${unsettledGroup.fileCount} files in ${unsettledGroup.folders.length} folders)`);
  console.log(`Target Table: ${unsettledGroup.suggestedTableName}`);
  console.log(`Sample File: ${unsettledGroup.sampleFile.fullPath}`);

  // 1. Test preview parse with smart merged column pruning
  const preview = await ftpFileStagingService.testPreviewParse(ftpDb, {
    sampleFilePath: unsettledGroup.sampleFile.fullPath,
    fileFormat: 'EXCEL',
    pruneEmptyMergedColumns: true,
    onlyColumnsWithData: true
  } as any, 5);

  console.log('\n--- PREVIEW PARSE RESULTS ---');
  console.log(`Headers Detected count: ${preview.headersDetected.length}`);
  console.log('Headers Detected:', preview.headersDetected);
  console.log(`All Columns Analysis count: ${preview.allColumnsAnalysis?.length || 0}`);
  if (preview.allColumnsAnalysis) {
    for (const c of preview.allColumnsAnalysis) {
      console.log(`  Col ${c.colIndex}: [${c.header}] -> hasData=${c.hasData} (${c.nonEmptyCount}/${c.totalRows} rows, ${c.dataPercentage}%) | excluded=${c.isExcludedEmpty} | sample="${c.sampleValues[0] || ''}"`);
    }
  }

  // 2. Reset ingested ledger for this pattern
  await repo.resetIngestedFilesForPattern(ftpDb.id, unsettledGroup.pattern);

  // 3. Stage the files into PostgreSQL table mirror_ftp_unsettled
  const stagingConfig: any = {
    id: `unsettled-config-${Date.now()}`,
    name: `Test Feed - ${unsettledGroup.pattern}`,
    ftpConnectionId: ftpDb.id,
    sourceDirectoryPath: '/',
    sampleFilePath: unsettledGroup.sampleFile.fullPath,
    fileNamePattern: unsettledGroup.pattern,
    filePattern: unsettledGroup.pattern,
    fileFormat: 'EXCEL',
    targetTableName: unsettledGroup.suggestedTableName,
    stagingTableName: unsettledGroup.suggestedTableName,
    hasHeader: true,
    headerRowIndex: preview.headerRowIndex,
    dataStartRow: preview.dataStartRow,
    skipFooterLines: 0,
    pruneEmptyMergedColumns: true,
    onlyColumnsWithData: true,
    stagingMode: 'REPLACE'
  };

  const stageResult = await ftpFileStagingService.stageFtpFileForValidation(ftpDb, stagingConfig);
  console.log('\n--- STAGING RESULT ---');
  console.log(`Success: ${stageResult.success}`);
  console.log(`Table: ${stageResult.stagingTableName}`);
  console.log(`Records Staged: ${stageResult.stagedCount}`);
  console.log(`Files Processed: ${stageResult.filesProcessedCount} (${stageResult.filesProcessed.join(', ')})`);

  // 4. Inspect columns and rows of mirror_ftp_unsettled
  const colRes = await queryPg(`
    SELECT column_name, data_type, ordinal_position
    FROM information_schema.columns
    WHERE table_name = '${unsettledGroup.suggestedTableName}'
    ORDER BY ordinal_position;
  `);

  console.log(`\n--- PHYSICAL POSTGRESQL COLUMNS IN ${unsettledGroup.suggestedTableName} ---`);
  for (const c of colRes.rows) {
    console.log(`  ${c.ordinal_position}. ${c.column_name} (${c.data_type})`);
  }

  const sampleRes = await queryPg(`SELECT * FROM "${unsettledGroup.suggestedTableName}" LIMIT 2;`);
  console.log('\n--- SAMPLE ROW 1 FROM POSTGRESQL ---');
  if (sampleRes.rows.length > 0) {
    const row = sampleRes.rows[0];
    console.log('Sample Row 1 Business Fields:');
    console.log('  issuer:', row.issuer);
    console.log('  acquirer:', row.acquirer);
    console.log('  pan:', row.pan);
    console.log('  tran_date:', row.tran_date);
    console.log('  ref_num:', row.ref_num);
    console.log('  fe_utrnno:', row.fe_utrnno);
    console.log('  term_id:', row.term_id);
    console.log('  record_state:', row.record_state);
    console.log('  reversal:', row.reversal);
    console.log('  req_amnt:', row.req_amnt);
    console.log('  atm_resp:', row.atm_resp);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
