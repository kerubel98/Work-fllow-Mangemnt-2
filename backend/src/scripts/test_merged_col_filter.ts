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

  const buffer = await fetchRemoteFileBuffer(ftpDb, unsettledFile.fullPath);
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

  // Effective header row index
  const headerIdx = 4; // Row 4
  const headerRow = matrix[headerIdx];
  const dataRows = matrix.slice(headerIdx + 1);

  console.log('Original Header Row 4:', headerRow);
  console.log(`Data rows count: ${dataRows.length}`);

  // Calculate non-empty data count per column
  const colAnalysis = headerRow.map((h, c) => {
    let nonEmptyCount = 0;
    const sampleValues: string[] = [];
    for (const row of dataRows) {
      const val = row[c];
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        nonEmptyCount++;
        if (sampleValues.length < 2) sampleValues.push(String(val).trim());
      }
    }
    return {
      colIndex: c,
      header: String(h || '').trim(),
      nonEmptyCount,
      percent: Math.round((nonEmptyCount / dataRows.length) * 100),
      hasData: nonEmptyCount > 0,
      sampleValues
    };
  });

  console.log('\n--- COLUMN ANALYSIS ---');
  colAnalysis.forEach(ca => {
    console.log(`Col ${ca.colIndex}: header="${ca.header}" | count=${ca.nonEmptyCount}/${dataRows.length} (${ca.percent}%) | sample=[${ca.sampleValues.join(', ')}]`);
  });

  // Filter to columns with data
  const validColumns = colAnalysis.filter(ca => ca.hasData);
  console.log(`\nValid columns with data (${validColumns.length}):`);
  validColumns.forEach(ca => {
    console.log(`  - Col ${ca.colIndex}: "${ca.header}" (Sample: "${ca.sampleValues[0]}")`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
