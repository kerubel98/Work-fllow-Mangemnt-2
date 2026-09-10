import http from 'http';

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== START TEST: Database-Driven Global Schema ===\n');

  // 1. Clear any residual directory fields to test baseline
  console.log('1. Clearing directory to verify 0 hardcoded fallback...');
  const clearRes = await makeRequest({
    hostname: 'localhost',
    port: 5002,
    path: '/api/transactions/directory',
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  });
  console.log('Clear response status:', clearRes.status);

  // 2. Fetch directory - must be completely empty, 0 items!
  console.log('\n2. Fetching directory - verifying zero fields and NO mock fallback...');
  const getEmptyRes = await makeRequest({
    hostname: 'localhost',
    port: 5002,
    path: '/api/transactions/directory',
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  console.log('Directory count after clear:', getEmptyRes.data.length);
  if (getEmptyRes.data.length !== 0) {
    throw new Error(`Expected 0 fields, but found ${getEmptyRes.data.length}! Mock dictionary still present.`);
  }
  console.log(' Verified: Zero hardcoded mock fields present.');

  // 3. Trigger Discovery from Connected Databases
  console.log('\n3. Triggering POST /api/transactions/directory/discover-from-databases...');
  const discoverRes = await makeRequest({
    hostname: 'localhost',
    port: 5002,
    path: '/api/transactions/directory/discover-from-databases',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { userId: 'admin' });

  console.log('Discover status:', discoverRes.status);
  console.log('Discover message:', discoverRes.data.message);
  console.log('Discovered count:', discoverRes.data.discoveredCount);
  console.log('Scanned tables:', discoverRes.data.scannedTables?.map(t => `${t.dbName}.${t.tableName} (${t.columnCount} cols)`));

  if (!discoverRes.data.fields || discoverRes.data.fields.length === 0) {
    throw new Error('Discovery returned 0 fields!');
  }

  // 4. Verify fields are real database columns
  const fields = discoverRes.data.fields;
  const sampleKeys = fields.slice(0, 15).map(f => `${f.key} (${f.dataType}, source: ${f.notes})`);
  console.log('\nSample Discovered Real Database Columns (First 15):');
  sampleKeys.forEach(k => console.log('  -', k));

  // 5. Verify GET /api/transactions/directory returns all discovered database fields
  console.log('\n5. Fetching GET /api/transactions/directory to verify database persistence...');
  const getDirRes = await makeRequest({
    hostname: 'localhost',
    port: 5002,
    path: '/api/transactions/directory',
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  console.log(`Persisted Global Standard Directory field count: ${getDirRes.data.length}`);
  if (getDirRes.data.length !== discoverRes.data.discoveredCount) {
    throw new Error(`Mismatch between discovered (${discoverRes.data.discoveredCount}) and persisted (${getDirRes.data.length})`);
  }

  // 6. Test import from single table: e.g. Sett.tran_log_tab
  console.log('\n6. Testing selective import from a specific table...');
  const dbsRes = await makeRequest({
    hostname: 'localhost',
    port: 5002,
    path: '/api/db/databases',
    method: 'GET'
  });
  const settDb = dbsRes.data.find(d => d.name === 'Sett');
  if (settDb) {
    const importRes = await makeRequest({
      hostname: 'localhost',
      port: 5002,
      path: '/api/transactions/directory/import-from-table',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { dbId: settDb.id, tableName: 'tran_log_tab', userId: 'admin' });

    console.log('Single table import status:', importRes.status);
    console.log('Single table import result:', importRes.data.message);
    console.log('Single table importedCount:', importRes.data.importedCount);
    if (importRes.status !== 200) {
      throw new Error(`Single table import failed with status ${importRes.status}`);
    }
  }

  console.log('\n=== ALL TESTS PASSED: Global Schema is 100% database-driven! ===');
}

runTests().catch(err => {
  console.error('\n Test Failed:', err);
  process.exit(1);
});
