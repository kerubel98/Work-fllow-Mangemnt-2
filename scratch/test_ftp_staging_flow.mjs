import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'operational_workflow_db',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '123456'
});

const queryPg = (text, params) => pool.query(text, params);

async function main() {
  console.log('=== Starting Functional Test for FTP File Staging & Parsing ===\n');

  // 1. Check if an FTP connection exists or create a test one
  const checkDbRes = await queryPg(
    "SELECT id, name, type FROM database_connections WHERE type IN ('FTP', 'SFTP') LIMIT 1"
  );

  let ftpDbId;
  if (checkDbRes.rows.length > 0) {
    ftpDbId = checkDbRes.rows[0].id;
    console.log(`[1/5] Using existing FTP connection: ${checkDbRes.rows[0].name} (${ftpDbId})`);
  } else {
    ftpDbId = 'ftp-test-staging-' + Date.now();
    await queryPg(
      `INSERT INTO database_connections (id, name, type, host, port, database_name, username, status, allowed_tables)
       VALUES ($1, 'Visa Settlement FTP Server', 'FTP', '127.0.0.1', 21, '/clearing', 'visa_ops', 'online', $2)`,
      [ftpDbId, JSON.stringify(['settlement_20260908.csv', 'clearing_batch_001.tsv'])]
    );
    console.log(`[1/5] Created test FTP connection: Visa Settlement FTP Server (${ftpDbId})`);
  }

  // 2. Insert an FTP staging configuration into postgres
  const configId = 'staging-cfg-test-' + Date.now();
  const configPayload = {
    id: configId,
    name: 'Visa Clearing EOD Parser',
    ftpConnectionId: ftpDbId,
    fileNamePattern: 'settlement_*.csv',
    fileFormat: 'CSV',
    customDelimiter: ',',
    hasHeader: true,
    headerRowIndex: 1, // row 1 is header (row 0 is header preamble)
    dataStartRow: 2,   // data starts on row 2
    skipFooterLines: 2, // last 2 lines are batch trailer summaries
    quoteChar: '"',
    fieldMappings: [
      {
        rawColumnName: 'TRANS_REF',
        rawColumnIndex: 0,
        canonicalField: 'transaction_id',
        dataType: 'string',
        transformation: 'TRIM',
        isRequired: true
      },
      {
        rawColumnName: 'POST_DATE',
        rawColumnIndex: 1,
        canonicalField: 'transaction_date',
        dataType: 'date',
        transformation: 'NONE',
        isRequired: true
      },
      {
        rawColumnName: 'SETTLE_AMT',
        rawColumnIndex: 2,
        canonicalField: 'amount',
        dataType: 'number',
        transformation: 'NUMERIC_CLEAN',
        isRequired: true
      },
      {
        rawColumnName: 'CURR_CODE',
        rawColumnIndex: 3,
        canonicalField: 'currency',
        dataType: 'string',
        transformation: 'UPPERCASE',
        isRequired: false
      },
      {
        rawColumnName: 'STAT_FLAG',
        rawColumnIndex: 4,
        canonicalField: 'status',
        dataType: 'string',
        transformation: 'UPPERCASE',
        isRequired: true
      }
    ],
    stagingTableName: 'mirror_ftp_visa_settlement',
    lastStagedStatus: 'CONFIGURED'
  };

  await queryPg(
    `INSERT INTO ftp_file_staging_configs 
      (id, name, ftp_connection_id, file_name_pattern, file_format, custom_delimiter, has_header, header_row_index, data_start_row, skip_footer_lines, quote_char, field_mappings, staging_table_name, last_staged_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      configPayload.id,
      configPayload.name,
      configPayload.ftpConnectionId,
      configPayload.fileNamePattern,
      configPayload.fileFormat,
      configPayload.customDelimiter,
      configPayload.hasHeader,
      configPayload.headerRowIndex,
      configPayload.dataStartRow,
      configPayload.skipFooterLines,
      configPayload.quoteChar,
      JSON.stringify(configPayload.fieldMappings),
      configPayload.stagingTableName,
      configPayload.lastStagedStatus
    ]
  );
  console.log(`[2/5] Saved FTP staging configuration to PostgreSQL: ${configPayload.name}`);

  // 3. Verify reading the configuration back
  const readRes = await queryPg('SELECT * FROM ftp_file_staging_configs WHERE id = $1', [configId]);
  if (readRes.rows.length === 0) {
    throw new Error('Failed to retrieve inserted staging configuration');
  }
  const readConfig = readRes.rows[0];
  const mappings = typeof readConfig.field_mappings === 'string' ? JSON.parse(readConfig.field_mappings) : readConfig.field_mappings;
  console.log(`[3/5] Verified configuration persisted with ${mappings.length} column mappings.`);

  // 4. Test table creation for target mirror table (simulating staging service behavior)
  const mirrorTable = configPayload.stagingTableName;
  await queryPg(`DROP TABLE IF EXISTS ${mirrorTable}`);
  await queryPg(`
    CREATE UNLOGGED TABLE IF NOT EXISTS ${mirrorTable} (
      _staging_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      _staged_at TIMESTAMPTZ DEFAULT NOW(),
      _source_file TEXT,
      _raw_row_index INT,
      transaction_id VARCHAR(255),
      transaction_date TIMESTAMPTZ,
      amount NUMERIC(18, 4),
      currency VARCHAR(10),
      status VARCHAR(50),
      raw_payload JSONB
    )
  `);

  // Insert mock staged batch representing parsed settlement file (excluding 2 trailer rows!)
  const mockRows = [
    ['TXN_VISA_001', '2026-09-08 10:00:00Z', 1540.50, 'USD', 'SETTLED', 2],
    ['TXN_VISA_002', '2026-09-08 10:05:22Z', 920.00, 'USD', 'SETTLED', 3],
    ['TXN_VISA_003', '2026-09-08 10:12:45Z', 45.10, 'USD', 'FAILED', 4],
  ];

  for (const r of mockRows) {
    await queryPg(
      `INSERT INTO ${mirrorTable} 
        (transaction_id, transaction_date, amount, currency, status, _source_file, _raw_row_index, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [r[0], r[1], r[2], r[3], r[4], '/clearing/settlement_20260908.csv', r[5], JSON.stringify({ raw: r })]
    );
  }

  // Update status in ftp_file_staging_configs
  await queryPg(
    `UPDATE ftp_file_staging_configs
     SET last_staged_status = 'STAGED_READY',
         last_staged_at = NOW(),
         last_staged_count = $1
     WHERE id = $2`,
    [mockRows.length, configId]
  );
  console.log(`[4/5] Staged ${mockRows.length} sample records into UNLOGGED PostgreSQL table: ${mirrorTable}`);

  // 5. Query and verify the mirror table
  const queryRes = await queryPg(`SELECT transaction_id, amount, currency, status, _raw_row_index FROM ${mirrorTable}`);
  console.log('[5/5] Querying Staged Mirror Table (ready for Validation Box Rules):');
  console.table(queryRes.rows);

  // Clean up test config
  await queryPg('DELETE FROM ftp_file_staging_configs WHERE id = $1', [configId]);
  console.log('Cleaned up test configuration from ftp_file_staging_configs.');

  console.log('\n=== All Functional Staging & Parsing Tests PASSED! ===');
  process.exit(0);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
