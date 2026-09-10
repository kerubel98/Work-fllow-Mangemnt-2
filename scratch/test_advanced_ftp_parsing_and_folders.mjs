import { ftpFileStagingService } from '../backend/src/services/ftpFileStagingService.js';
import { discoverFtpFilesRecursive } from '../backend/src/services/ftpConnectionService.js';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'operational_workflow_db',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '123456'
});

async function main() {
  console.log('=== Starting Test: Advanced FTP Parsing, Multi-Row Headers, and Folder Traversal ===\n');

  const mockDb = {
    id: 'db-ftp-test-adv',
    name: 'Core Clearing FTP Gateway',
    type: 'FTP',
    host: '127.0.0.1',
    port: 21,
    databaseName: '/clearing',
    username: 'ops_clearing',
    status: 'online',
    allowedTables: ['settlement_feed.xlsx', 'camt053.xml', 'daily_clearing.csv']
  };

  // ----------------------------------------------------
  // TEST 1: Physical File Structure Inspection
  // ----------------------------------------------------
  console.log('[1/5] Testing Physical File Structure Inspection...');
  const excelStructure = await ftpFileStagingService.inspectFtpFileStructure(mockDb, 'switch_settlement.xlsx');
  console.log('Excel Structure:', {
    fileType: excelStructure.fileType,
    sheetsCount: excelStructure.excelSheets?.length,
    sheets: excelStructure.excelSheets?.map(s => s.name),
    hasMergedCells: excelStructure.excelSheets?.[0]?.hasMergedCells
  });
  if (excelStructure.fileType !== 'EXCEL' || !excelStructure.excelSheets?.length) {
    throw new Error('Excel structure detection failed');
  }

  const xmlStructure = await ftpFileStagingService.inspectFtpFileStructure(mockDb, 'clearing_camt053.xml');
  console.log('XML Structure:', {
    fileType: xmlStructure.fileType,
    rootElement: xmlStructure.xmlRootElement,
    candidateElements: xmlStructure.xmlCandidateElements
  });
  if (xmlStructure.fileType !== 'XML' || !xmlStructure.xmlRootElement) {
    throw new Error('XML structure detection failed');
  }

  // ----------------------------------------------------
  // TEST 2: Excel Multi-Row Headers & Merged Cells
  // ----------------------------------------------------
  console.log('\n[2/5] Testing Excel Multi-Row & Merged Header Extraction...');
  const excelPreview = await ftpFileStagingService.testPreviewParse(mockDb, {
    fileNamePattern: 'switch_settlement.xlsx',
    fileFormat: 'EXCEL',
    excelSheetName: 'Settlement_Batch_01',
    headerRowIndex: 2,    // Row 2 is Category ("Account Details", "Financial Details")
    headerRowCount: 2,    // Span 2 rows down to Row 3 ("Account Number", "Holder Name", etc.)
    handleMergedCells: true,
    mergedHeaderSeparator: '_',
    dataStartRow: 4,      // Data begins row 4
    skipFooterLines: 1    // Skip TOTALS footer
  });

  console.log('Excel Discovered Headers:', excelPreview.headersDetected);
  console.log('Excel Sample Parsed Row:', excelPreview.parsedRowsSample[0]);
  console.log('Excel Skipped Footer:', excelPreview.footerSkippedLines);

  // Expect merged headers like "Account Details_Account Number", "Financial Details_Amount"
  const hasMergedHeader = excelPreview.headersDetected.some(h => h.includes('_'));
  if (!hasMergedHeader) {
    throw new Error('Expected multi-row merged headers to be combined');
  }

  // ----------------------------------------------------
  // TEST 3: XML ISO 20022 Record Extraction
  // ----------------------------------------------------
  console.log('\n[3/5] Testing XML ISO 20022 Record Flattening...');
  const xmlPreview = await ftpFileStagingService.testPreviewParse(mockDb, {
    fileNamePattern: 'clearing_camt053.xml',
    fileFormat: 'XML',
    xmlRecordElement: 'TxDtls'
  });

  console.log('XML Discovered Headers Count:', xmlPreview.headersDetected.length);
  console.log('XML Sample Record:', xmlPreview.parsedRowsSample[0]);
  if (xmlPreview.parsedRowsSample.length === 0) {
    throw new Error('Expected parsed XML transactions');
  }

  // ----------------------------------------------------
  // TEST 4: Column Projection Filtering (Important Columns Only)
  // ----------------------------------------------------
  console.log('\n[4/5] Testing Important Columns Selection (Projection Filtering)...');
  const importantCols = ['Transaction Core Details_Transaction ID', 'Transaction Financials_Settlement Amount'];
  const csvPreview = await ftpFileStagingService.testPreviewParse(mockDb, {
    fileNamePattern: 'daily_feed.csv',
    fileFormat: 'CSV',
    headerRowIndex: 2,
    headerRowCount: 2,
    selectedImportantColumns: importantCols
  });
  console.log('Selected Important Columns:', csvPreview.selectedImportantColumns);
  if (csvPreview.selectedImportantColumns.length !== 2) {
    throw new Error('Important columns projection failed');
  }

  // ----------------------------------------------------
  // TEST 5: Multi-Folder Looping Traversal & Prepared Table Staging
  // ----------------------------------------------------
  console.log('\n[5/5] Testing Multi-Folder Looping Traversal & PostgreSQL Staging...');
  const recursiveTree = await discoverFtpFilesRecursive(mockDb, '/clearing');
  console.log(`Discovered ${recursiveTree.length} files across nested subfolders:`);
  console.table(recursiveTree.map(f => ({ path: f.fullPath, folder: f.relativeFolder, size: f.size })));

  const preparedTableName = 'mirror_ftp_eod_multifolders_test';
  const stageRes = await ftpFileStagingService.stageFtpFileForValidation(mockDb, {
    id: 'cfg-multifolders-test',
    name: 'Multi-Folder Date Staging',
    ftpConnectionId: mockDb.id,
    fileNamePattern: 'settlement_visa.csv',
    fileFormat: 'CSV',
    folderTraversalMode: 'RECURSIVE_SCAN',
    sourceDirectoryPath: '/clearing',
    headerRowIndex: 2,
    dataStartRow: 3,
    skipFooterLines: 1,
    stagingTableName: preparedTableName,
    fieldMappings: [
      { sourceColumn: 'transaction_id', canonicalField: 'transaction_id', dataType: 'string', isImportant: true, transform: 'TRIM' },
      { sourceColumn: 'amount', canonicalField: 'amount', dataType: 'number', isImportant: true, transform: 'NUMERIC_CLEAN' },
      { sourceColumn: 'currency', canonicalField: 'currency', dataType: 'string', isImportant: true, transform: 'UPPERCASE' },
      { sourceColumn: 'status', canonicalField: 'status', dataType: 'string', isImportant: true, transform: 'UPPERCASE' }
    ]
  });

  console.log('Stage Execution Result:', stageRes);
  if (!stageRes.success || stageRes.filesProcessedCount < 2) {
    throw new Error('Multi-folder staging failed to process multiple files');
  }

  // Query PostgreSQL prepared mirror table to verify multi-folder ingestion and projection
  const queryRes = await pool.query(`
    SELECT transaction_id, amount, currency, status, _source_file, _source_folder 
    FROM "${preparedTableName}" 
    LIMIT 6;
  `);

  console.log('\nQuerying Prepared Mirror Table (Lookup Workflow Ready):');
  console.table(queryRes.rows);

  // Clean up test table
  await pool.query(`DROP TABLE IF EXISTS "${preparedTableName}";`);
  console.log('Cleaned up prepared mirror table.');

  await pool.end();
  console.log('\n=== All Tests Passed Successfully! ===');
  process.exit(0);
}

main().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
