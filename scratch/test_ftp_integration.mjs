import { repo } from 'file:///C:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/store/repository.js';
import { connectPostgres } from 'file:///C:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/config/postgres.js';
import { testExternalDbConnection, discoverTablesForDb, getTableColumnsForDb, executeLiveQueryOnDb } from 'file:///C:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/dbConnectionManager.js';
import { mirrorTableManager } from 'file:///C:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/mirrorTableManager.js';

async function runFtpIntegrationTest() {
  console.log('--- STARTING FTP CONNECTION INTEGRATION TEST ---');
  await connectPostgres();

  const testFtpDb = {
    id: `ftp-test-${Date.now()}`,
    name: 'Visa Settlement Clearing FTP',
    type: 'FTP',
    host: 'ftp.bankclearing.internal',
    port: 21,
    databaseName: '/settlement_clearing_feeds/',
    username: 'settlement_recon',
    password: 'password123',
    status: 'online',
    apiEndpoint: 'https://api.paymentops.internal/ftp/visa-settlement',
    createdByAdmin: true,
    requiresAccessApproval: false
  };

  try {
    // 1. Register FTP Connection
    console.log('1. Registering FTP connection in PostgreSQL...');
    const created = await repo.createDatabase(testFtpDb);
    console.log('   Registered:', created.id, created.name, created.type);

    // 2. Test Connection
    console.log('2. Testing FTP Connection...');
    const testRes = await testExternalDbConnection(testFtpDb);
    console.log('   Connection Result:', testRes);
    if (!testRes.success) throw new Error('FTP connection test failed');

    // 3. Discover Files (Tables)
    console.log('3. Discovering FTP Remote Files...');
    const files = await discoverTablesForDb(testFtpDb);
    console.log('   Discovered Files:', files);
    if (!files.length) throw new Error('No files discovered');

    const targetFile = files[0];

    // 4. Inspect File Columns
    console.log(`4. Inspecting File Schema for [${targetFile}]...`);
    const columns = await getTableColumnsForDb(testFtpDb, targetFile);
    console.log('   Introspected Columns:', columns.map(c => `${c.name} (${c.type})`));
    if (!columns.length) throw new Error('No columns introspected from FTP file');

    // 5. Query / Read File Records
    console.log(`5. Executing Live Query on [${targetFile}]...`);
    const queryResult = await executeLiveQueryOnDb(testFtpDb, `SELECT * FROM "${targetFile}" LIMIT 5`);
    console.log(`   Read ${queryResult.rowCount} rows in ${queryResult.executionTimeMs}ms.`);
    console.log('   Sample Row:', queryResult.rows[0]);
    if (!queryResult.rows.length) throw new Error('No rows returned from FTP file query');

    // 6. Ensure Mirror Table Creation in PostgreSQL
    console.log('6. Ensuring PostgreSQL Mirror Table exists for FTP file...');
    const mirrorTableName = await mirrorTableManager.ensureMirrorTableExists(testFtpDb, targetFile);
    console.log('   Created / Verified Mirror Table:', mirrorTableName);

    console.log('--- ALL FTP INTEGRATION TESTS PASSED SUCCESSFULLY! ---');
  } finally {
    // 7. Cleanup
    console.log('7. Cleaning up test FTP connection...');
    await repo.deleteDatabase(testFtpDb.id);
    console.log('   Cleanup complete.');
  }
}

runFtpIntegrationTest().catch((err) => {
  console.error('FTP Integration Test Failed:', err);
  process.exit(1);
});
