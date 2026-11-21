import { postgresRepo as repo } from '../store/postgresRepo.js';
import { ftpFileStagingService } from '../services/ftpFileStagingService.js';
import { discoverFtpFilesRecursive } from '../services/ftpConnectionService.js';

async function main() {
  const dbs = await repo.getDatabases();
  const ftpDb = dbs.find(d => d.name === 'LocalFTP' || d.type === 'SFTP' || d.type === 'FTP');
  if (!ftpDb) throw new Error('FTP DB not found');

  const files = await discoverFtpFilesRecursive(ftpDb, '/', 10);
  console.log(`Discovered ${files.length} files.`);

  const groups = await ftpFileStagingService.detectSemanticPatternsAcrossFolders(ftpDb, files, '/');
  for (const g of groups) {
    console.log(`\n======================================================`);
    console.log(`PATTERN: ${g.pattern} (${g.fileType}) -> Target Table: ${g.suggestedTableName}`);
    const sample = g.sampleFile;
    if (sample) {
      console.log(`Sample File: ${sample.fullPath}`);
      const preview = await ftpFileStagingService.testPreviewParse(ftpDb, {
        sampleFilePath: sample.fullPath,
        fileFormat: g.fileType as any,
        headerRowIndex: 1,
        dataStartRow: 2
      } as any, 3);
      console.log(`Headers Detected (${preview.headersDetected?.length || 0}):`);
      console.log(preview.headersDetected);
      if (preview.parsedRowsSample && preview.parsedRowsSample.length > 0) {
        console.log('Sample Row 1 keys:', Object.keys(preview.parsedRowsSample[0]));
      }
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
