import { ftpFileStagingService } from '../backend/src/services/ftpFileStagingService.js';

async function testService() {
  console.log('Testing ftpFileStagingService parsing & trailer exclusion...\n');

  const mockDb = {
    id: 'test-ftp-db',
    name: 'Visa Clearing Gateway',
    type: 'FTP' as const,
    host: '127.0.0.1',
    port: 21,
    databaseName: '/clearing',
    username: 'visa_ops',
    status: 'online' as const,
    allowedTables: ['sample_settlement.csv']
  };

  // Test 1: Test parse preview with mock CSV clearing data
  const preview = await ftpFileStagingService.testPreviewParse(mockDb, {
    fileNamePattern: 'sample_settlement.csv',
    fileFormat: 'CSV',
    customDelimiter: ',',
    headerRowIndex: 1, // row 1 is header
    dataStartRow: 2,   // row 2 starts data
    skipFooterLines: 2, // 2 trailer lines
    hasHeader: true,
    quoteChar: '"',
    fieldMappings: [
      { rawColumnName: 'TRANS_ID', canonicalField: 'transaction_id', dataType: 'string', transformation: 'TRIM', isRequired: true },
      { rawColumnName: 'AMOUNT', canonicalField: 'amount', dataType: 'number', transformation: 'NUMERIC_CLEAN', isRequired: true },
      { rawColumnName: 'STATUS', canonicalField: 'status', dataType: 'string', transformation: 'UPPERCASE', isRequired: true }
    ]
  });

  console.log(`Success: ${preview.success}`);
  console.log(`Detected headers (${preview.headersDetected.length}):`, preview.headersDetected);
  console.log(`Total lines read: ${preview.totalLinesRead}, parsed rows sample: ${preview.parsedRowsSample.length}, footer lines skipped: ${preview.footerSkippedLines.length}`);
  console.log(`Sample mapped rows count: ${preview.mappedRowsSample.length}`);
  console.log('First mapped row preview:', preview.mappedRowsSample[0]);
  console.log('Footer skipped lines:', preview.footerSkippedLines);

  if (preview.footerSkippedLines.length !== 2) {
    throw new Error(`Expected 2 trailer lines skipped, got ${preview.footerSkippedLines.length}`);
  }

  if (preview.parsedRowsSample.length === 0) {
    throw new Error('Expected parsed sample rows');
  }

  console.log('\n=== ftpFileStagingService Unit Test PASSED! ===');
  process.exit(0);
}

testService().catch(err => {
  console.error('Service test failed:', err);
  process.exit(1);
});
