import http from 'http';

const BASE_URL = 'http://localhost:5002';

async function fetchJson(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(u, {
      method: options.method || 'GET',
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting Strict Global Mapping & Schema Verification ---');

  // Test 1: GET Schema Config
  console.log('1. Fetching Global Schema Config...');
  const schemaRes = await fetchJson('/api/transactions/schema/config');
  console.log('Schema Config Status:', schemaRes.status);
  console.log('Version:', schemaRes.body.version);
  console.log('Fields count:', schemaRes.body.standardFields?.length);
  const requiredFields = (schemaRes.body.standardFields || []).filter(f => f.required);
  console.log('Required standard fields count:', requiredFields.length, requiredFields.map(f => f.key));

  if (schemaRes.status !== 200 || !schemaRes.body.version) {
    throw new Error('Failed to fetch valid schema config');
  }

  // Test 2: Table Mapping Validation - Unmapped Table
  console.log('\n2. Validating Unmapped Table...');
  const unmappedRes = await fetchJson('/api/transactions/table-mappings/validate/db-fake/test_nonexistent_table');
  console.log('Unmapped Table Status:', unmappedRes.body.status, 'Missing:', unmappedRes.body.missingRequiredColumns);
  if (unmappedRes.body.status !== 'UNMAPPED') {
    throw new Error(`Expected UNMAPPED but got ${unmappedRes.body.status}`);
  }

  // Test 3: Save Incomplete Table Mapping
  console.log('\n3. Saving Incomplete Table Mapping...');
  const incompleteSaveRes = await fetchJson('/api/transactions/table-mappings', {
    method: 'POST',
    body: {
      dbId: 'db-test-cbs',
      tableName: 't_cbs_transactions',
      dbName: 'Core Banking CBS Test',
      columns: [
        { globalKey: 'transaction_id', physicalColumn: 'cbs_tran_id' }
        // missing card_number, amount_usd, status_state, created_at
      ],
      updatedBy: 'test_admin'
    }
  });
  console.log('Save Incomplete Response Status:', incompleteSaveRes.status);
  console.log('Validation Status:', incompleteSaveRes.body.validation?.status);
  console.log('Missing Required Columns:', incompleteSaveRes.body.validation?.missingRequiredColumns);
  if (incompleteSaveRes.body.validation?.status !== 'INCOMPLETE') {
    throw new Error(`Expected INCOMPLETE but got ${incompleteSaveRes.body.validation?.status}`);
  }

  // Test 4: Save Complete Table Mapping
  console.log('\n4. Saving Complete Table Mapping...');
  const completeSaveRes = await fetchJson('/api/transactions/table-mappings', {
    method: 'POST',
    body: {
      dbId: 'db-test-cbs',
      tableName: 't_cbs_transactions',
      dbName: 'Core Banking CBS Test',
      columns: [
        { globalKey: 'transaction_id', physicalColumn: 'cbs_tran_id' },
        { globalKey: 'card_number', physicalColumn: 'cbs_pan' },
        { globalKey: 'amount_usd', physicalColumn: 'cbs_amount' },
        { globalKey: 'status_state', physicalColumn: 'cbs_status' },
        { globalKey: 'created_at', physicalColumn: 'cbs_timestamp' },
        { globalKey: 'currency', physicalColumn: 'cbs_curr' }
      ],
      updatedBy: 'test_admin'
    }
  });
  console.log('Save Complete Response Status:', completeSaveRes.status);
  console.log('Validation Status:', completeSaveRes.body.validation?.status);
  console.log('Missing Required Columns:', completeSaveRes.body.validation?.missingRequiredColumns);
  if (completeSaveRes.body.validation?.status !== 'COMPLETE') {
    throw new Error(`Expected COMPLETE but got ${completeSaveRes.body.validation?.status}`);
  }

  // Test 5: Verify Validate endpoint reflects COMPLETE
  console.log('\n5. Re-validating Table via GET Endpoint...');
  const revalRes = await fetchJson('/api/transactions/table-mappings/validate/db-test-cbs/t_cbs_transactions');
  console.log('Revalidation Status:', revalRes.body.status);
  if (revalRes.body.status !== 'COMPLETE') {
    throw new Error(`Expected COMPLETE from validate endpoint but got ${revalRes.body.status}`);
  }

  // Test 6: Update Schema Config (Version Increment)
  console.log('\n6. Updating Schema Config with new Custom Field...');
  const updateSchemaRes = await fetchJson('/api/transactions/schema/config', {
    method: 'POST',
    body: {
      username: 'test_admin',
      reason: 'Added custom test column for automated verification',
      standardFields: [
        ...schemaRes.body.standardFields,
        {
          id: 'gsd-test-col',
          key: 'test_custom_col',
          label: 'Test Custom Column',
          description: 'Automated test column',
          dataType: 'string',
          required: false,
          isStandard: false,
          category: 'Test'
        }
      ]
    }
  });
  console.log('Updated Schema Status:', updateSchemaRes.status);
  console.log('New Version:', updateSchemaRes.body.version);
  console.log('Version History count:', updateSchemaRes.body.versionHistory?.length);
  if (updateSchemaRes.status !== 200 || !updateSchemaRes.body.version) {
    throw new Error('Failed to update schema config');
  }

  console.log('\n✅ ALL STRICT GLOBAL MAPPING BACKEND & SCHEMA TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
