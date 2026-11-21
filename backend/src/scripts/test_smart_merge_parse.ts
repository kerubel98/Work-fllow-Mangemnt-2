import { postgresRepo as repo } from '../store/postgresRepo.js';
import { fetchRemoteFileBuffer, discoverFtpFilesRecursive } from '../services/ftpConnectionService.js';
import { ftpFileStagingService } from '../services/ftpFileStagingService.js';
import * as XLSX from 'xlsx';

async function main() {
  const dbs = await repo.getDatabases();
  const ftpDb = dbs.find(d => d.name === 'LocalFTP' || d.type === 'SFTP' || d.type === 'FTP');
  if (!ftpDb) throw new Error('LocalFTP DB not found');

  const files = await discoverFtpFilesRecursive(ftpDb, '/', 10);
  const groups = await ftpFileStagingService.detectSemanticPatternsAcrossFolders(ftpDb, files, '/');
  for (const g of groups) {
    console.log(`\n======================================================`);
    console.log(`Testing Pattern: ${g.pattern} (${g.sampleFile?.name})`);
    const buffer = await fetchRemoteFileBuffer(ftpDb, g.sampleFile.fullPath);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const matrix: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    const merges = ws['!merges'] || [];

    let effectiveHeaderIndex = 1;
    let bestHeaderIdx = 0;
    let maxColsFound = 0;
    for (let r = 0; r < Math.min(matrix.length, 15); r++) {
      const row = matrix[r];
      if (!Array.isArray(row)) continue;
      const nonNullCount = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '').length;
      if (nonNullCount > maxColsFound) {
        maxColsFound = nonNullCount;
        bestHeaderIdx = r;
      }
    }
    if (bestHeaderIdx > 0 && maxColsFound >= 3) {
      effectiveHeaderIndex = bestHeaderIdx + 1;
    }

    const headerStartIdx = effectiveHeaderIndex - 1;
    const headerEndIdx = headerStartIdx + 1;
    const dataStartIndex = headerEndIdx + 1;
    const activeDataRows = matrix.slice(dataStartIndex - 1);
    const colCount = Math.max(...matrix.map(row => row.length), 0);

    const allColumns: any[] = [];
    for (let c = 0; c < colCount; c++) {
      let nonEmptyCount = 0;
      const sampleValues: string[] = [];
      for (let r = 0; r < activeDataRows.length; r++) {
        const val = activeDataRows[r]?.[c];
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          nonEmptyCount++;
          if (sampleValues.length < 2) sampleValues.push(String(val).trim());
        }
      }

      const merge = merges.find(m => m.s.r <= headerEndIdx - 1 && m.e.r >= headerStartIdx && c >= m.s.c && c <= m.e.c && m.s.c < m.e.c);
      let headerText = String(matrix[headerStartIdx]?.[c] || '').trim();
      let isMergedSpan = false;
      let isPrimaryDataColumn = true;
      let isExcludedEmpty = false;

      if (merge) {
        isMergedSpan = true;
        const topVal = String(matrix[merge.s.r]?.[merge.s.c] || '').trim();
        let bestDataCol = merge.s.c;
        let maxDataInSpan = -1;
        for (let sc = merge.s.c; sc <= merge.e.c; sc++) {
          let scCount = 0;
          for (let r = 0; r < activeDataRows.length; r++) {
            const scCell = activeDataRows[r]?.[sc];
            if (scCell !== null && scCell !== undefined && String(scCell).trim() !== '') scCount++;
          }
          if (scCount > maxDataInSpan) {
            maxDataInSpan = scCount;
            bestDataCol = sc;
          }
        }

        if (c === bestDataCol) {
          headerText = topVal || `Col_${c + 1}`;
          isPrimaryDataColumn = true;
          isExcludedEmpty = false;
        } else {
          headerText = topVal ? `${topVal}_span_${c}` : `Col_${c + 1}`;
          isPrimaryDataColumn = false;
          isExcludedEmpty = nonEmptyCount === 0;
        }
      } else {
        if (!headerText) {
          headerText = `Col_${c + 1}`;
          if (nonEmptyCount === 0) isExcludedEmpty = true;
        }
      }

      allColumns.push({
        colIndex: c,
        headerText,
        nonEmptyCount,
        isExcludedEmpty,
        sampleValues
      });
    }

    const pruned = allColumns.filter(ac => !ac.isExcludedEmpty);
    console.log(`Pruned to ${pruned.length} columns (from ${colCount} raw columns):`);
    console.log(pruned.map(p => `${p.headerText} (${p.nonEmptyCount} rows)`).join(', '));
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
