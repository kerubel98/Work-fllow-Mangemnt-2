import { postgresRepo as repo } from '../store/postgresRepo.js';
import { fetchRemoteFileBuffer, discoverFtpFilesRecursive } from '../services/ftpConnectionService.js';
import * as XLSX from 'xlsx';

async function main() {
  const dbs = await repo.getDatabases();
  const ftpDb = dbs.find(d => d.name === 'LocalFTP' || d.type === 'SFTP' || d.type === 'FTP');
  if (!ftpDb) throw new Error('LocalFTP DB not found');

  const files = await discoverFtpFilesRecursive(ftpDb, '/', 10);
  const unsettledFile = files.find(f => f.name.includes('Unsettled'));
  if (!unsettledFile) throw new Error('Unsettled file not found');

  console.log('Found Unsettled File:', unsettledFile.fullPath);
  const buffer = await fetchRemoteFileBuffer(ftpDb, unsettledFile.fullPath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  console.log('\n--- SHEET INFO ---');
  console.log('Sheet name:', sheetName);
  console.log('Merges (!merges):', sheet['!merges']);

  const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
  console.log(`Total rows in matrix: ${matrix.length}`);

  console.log('\n--- FIRST 8 ROWS OF MATRIX ---');
  for (let r = 0; r < Math.min(matrix.length, 8); r++) {
    console.log(`Row ${r}:`, JSON.stringify(matrix[r]));
  }

  // Count non-empty values per column index in data rows (rows 1..N)
  const maxCols = Math.max(...matrix.map(row => row.length));
  console.log(`\nMax Columns across rows: ${maxCols}`);
  console.log('\n--- COLUMN DATA PRESENCE ANALYSIS ---');
  for (let c = 0; c < maxCols; c++) {
    const headerVal = matrix[0]?.[c];
    let dataCount = 0;
    const sampleValues: any[] = [];
    for (let r = 1; r < matrix.length; r++) {
      const val = matrix[r]?.[c];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        dataCount++;
        if (sampleValues.length < 3) sampleValues.push(val);
      }
    }
    console.log(`Col ${c}: Header = [${headerVal || '(EMPTY)'}] | Non-empty Data Rows: ${dataCount}/${matrix.length - 1} | Sample: [${sampleValues.join(', ')}]`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
