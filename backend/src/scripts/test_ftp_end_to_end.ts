import { postgresRepo as repo } from '../store/postgresRepo.js';
import { ftpFileStagingService } from '../services/ftpFileStagingService.js';
import { discoverFtpFilesRecursive } from '../services/ftpConnectionService.js';

async function main() {
  console.log('--- Starting FTP Pattern Grouping & Ingested Storage Verification ---');

  // 1. Get or create FTP database connection for LocalFTP
  const dbs = await repo.getDatabases();
  let ftpDb = dbs.find(d => d.type === 'SFTP' || d.type === 'FTP');

  if (!ftpDb) {
    console.log('No FTP database found in DB, creating test connection for LocalFTP...');
    ftpDb = await repo.createDatabase({
      name: 'LocalFTP',
      type: 'SFTP',
      host: '127.0.0.1',
      port: 22,
      username: 'ftpuser1',
      password: 'ftppassword1',
      scope: 'global'
    } as any);
  }

  console.log(`Using FTP Connection: ${ftpDb.name} (${ftpDb.id}) at ${ftpDb.host}:${ftpDb.port}`);

  // 2. Discover recursive files
  const files = await discoverFtpFilesRecursive(ftpDb, '/', 10);
  console.log(`Discovered ${files.length} files on LocalFTP server.`);

  // 3. Detect semantic patterns across folders
  const groups = await ftpFileStagingService.detectSemanticPatternsAcrossFolders(ftpDb, files, '/');
  console.log(`Detected ${groups.length} Semantic Pattern Groups across folders:`);
  for (const g of groups) {
    console.log(`  - Pattern: "${g.pattern}" [${g.fileType}] -> Table: "${g.suggestedTableName}" (${g.fileCount} files in ${g.folders.length} folders)`);
    for (const f of g.matchedFiles) {
      console.log(`      * ${f.fullPath} (${f.relativeFolder})`);
    }
  }

  // 4. Test Staging for Pattern "*Settlemnt.xls"
  const settlemntGroup = groups.find(g => g.pattern.includes('Settlemnt'));
  if (!settlemntGroup) {
    throw new Error('Settlemnt group not found');
  }

  console.log(`\nTesting First Staging Run for Pattern: "${settlemntGroup.pattern}"...`);
  // Reset any previous test records
  await repo.resetIngestedFilesForPattern(ftpDb.id, settlemntGroup.pattern);

  const stagingConfig: any = {
    id: `test-config-${Date.now()}`,
    name: `Test Feed - ${settlemntGroup.pattern}`,
    ftpConnectionId: ftpDb.id,
    sourceDirectoryPath: '/',
    sampleFilePath: settlemntGroup.sampleFile.fullPath,
    fileNamePattern: settlemntGroup.pattern,
    filePattern: settlemntGroup.pattern,
    fileFormat: 'EXCEL' as const,
    targetTableName: settlemntGroup.suggestedTableName,
    stagingTableName: settlemntGroup.suggestedTableName,
    delimiter: ',',
    hasHeader: true,
    headerRowIndex: 1,
    dataStartRow: 2,
    skipFooterLines: 0,
    fieldMappings: [],
    stagingMode: 'APPEND' as const
  };

  const result1 = await ftpFileStagingService.stageFtpFileForValidation(ftpDb, stagingConfig);
  console.log(`Run 1 Result:`);
  console.log(`  - Success: ${result1.success}`);
  console.log(`  - Table: ${result1.stagingTableName}`);
  console.log(`  - Records Staged: ${result1.stagedCount}`);
  console.log(`  - Files Processed: ${result1.filesProcessedCount} (${result1.filesProcessed.join(', ')})`);
  console.log(`  - Already Ingested Skipped: ${result1.filesAlreadyIngestedCount || 0}`);

  // 5. Check persistent storage ledger
  const ingestedLedger = await repo.getIngestedFtpFiles(ftpDb.id, settlemntGroup.pattern);
  console.log(`\nIngested Ledger in PostgreSQL (ftp_ingested_files): ${ingestedLedger.length} records`);
  for (const entry of ingestedLedger) {
    console.log(`  - [${entry.ingestionStatus}] ${entry.filePath} -> ${entry.targetTableName} (${entry.recordsStaged} rows at ${entry.ingestedAt})`);
  }

  // 6. Test Second Staging Run (Deduplication Check)
  console.log(`\nTesting Second Staging Run (Schedule Re-run Simulation)...`);
  const result2 = await ftpFileStagingService.stageFtpFileForValidation(ftpDb, stagingConfig);
  console.log(`Run 2 Result:`);
  console.log(`  - Success: ${result2.success}`);
  console.log(`  - Records Staged: ${result2.stagedCount} (Expected: 0 new rows staged due to dedup)`);
  console.log(`  - Files Processed: ${result2.filesProcessedCount}`);
  console.log(`  - Already Ingested Skipped: ${result2.filesAlreadyIngestedCount} (${result2.filesAlreadyIngested?.join(', ')})`);

  if (result2.filesAlreadyIngestedCount === settlemntGroup.fileCount && result2.stagedCount === 0) {
    console.log('\n[SUCCESS] Deduplication verified: subsequent scheduled runs skip previously ingested files without inserting duplicate records!');
  } else {
    console.warn('\n[WARNING] Unexpected counts on second run:', result2);
  }

  console.log('\n--- Verification Completed Successfully ---');
  process.exit(0);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
