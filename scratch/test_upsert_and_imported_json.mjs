import http from 'http';

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  console.log('=== Testing PUT Upsert & JSON Import Resiliency ===\n');

  // Test 1: PUT on a non-existent ID (e.g. gsd-11 or gsd-custom_col)
  // Previously this threw: 404 "Directory record with ID 'gsd-11' not found"
  console.log('1. Testing PUT /api/transactions/directory/gsd-11 on previously unseen record ...');
  const putRes = await request({
    hostname: 'localhost',
    port: 5002,
    path: '/api/transactions/directory/gsd-11',
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, {
    key: 'auth_response_code',
    label: 'Authorization Response Code',
    dataType: 'string',
    required: true,
    category: 'General'
  });

  console.log(`   PUT Response Status: ${putRes.status}`);
  console.log(`   PUT Response Message: ${putRes.data?.message}`);
  if (putRes.status !== 200) {
    console.error('FAILED: PUT returned non-200:', putRes);
    process.exit(1);
  }

  // Verify in PostgreSQL
  const getRes = await request({
    hostname: 'localhost',
    port: 5002,
    path: '/api/transactions/directory',
    method: 'GET'
  });

  const authCodeField = getRes.data.find(f => f.key === 'auth_response_code');
  console.log(`   Found in PostgreSQL: key='${authCodeField?.key}', category='${authCodeField?.category}', required=${authCodeField?.required}`);
  if (!authCodeField || authCodeField.category !== 'Lifecycle & Status' || authCodeField.required !== true) {
    console.error('FAILED: auth_response_code was not upserted or auto-classified properly:', authCodeField);
    process.exit(1);
  }
  console.log('   ✓ PUT gracefully UPSERTED and auto-classified without 404!\n');

  // Test 2: Batch import of exported JSON shape
  console.log('2. Testing batch-import of JSON array ...');
  const importRes = await request({
    hostname: 'localhost',
    port: 5002,
    path: '/api/transactions/directory/batch-import',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    fields: [
      {
        id: "gsd-1",
        key: "transaction_id",
        label: "Transaction ID / Reference",
        description: "Primary unique transaction or authorization identifier",
        dataType: "string",
        required: true,
        category: "Identity"
      },
      {
        id: "gsd-3",
        key: "amount_usd",
        label: "Amount ($ USD)",
        description: "Total numeric transaction charge or authorization amount",
        dataType: "number",
        required: true,
        category: "Financial"
      }
    ],
    autoClassify: true
  });

  console.log(`   Import Status: ${importRes.status}, Imported Count: ${importRes.data?.importedCount}`);
  if (![200, 201].includes(importRes.status) || importRes.data?.importedCount < 2) {
    console.error('FAILED batch import:', importRes);
    process.exit(1);
  }

  // Test 3: Toggle required constraint on imported field
  console.log('\n3. Testing required constraint toggle on imported field amount_usd ...');
  const toggleRes = await request({
    hostname: 'localhost',
    port: 5002,
    path: '/api/transactions/directory/amount_usd',
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, {
    key: 'amount_usd',
    required: false
  });

  console.log(`   Toggle Status: ${toggleRes.status}`);
  if (toggleRes.status !== 200) {
    console.error('FAILED toggle:', toggleRes);
    process.exit(1);
  }

  const getRes2 = await request({
    hostname: 'localhost',
    port: 5002,
    path: '/api/transactions/directory',
    method: 'GET'
  });
  const amtField = getRes2.data.find(f => f.key === 'amount_usd');
  console.log(`   amount_usd required=${amtField?.required}`);
  if (amtField?.required !== false) {
    console.error('FAILED: amount_usd required was not updated to false');
    process.exit(1);
  }
  console.log('   ✓ Toggle required succeeded and persisted in PostgreSQL!');

  // Cleanup test fields
  console.log('\n4. Cleaning up test fields ...');
  await request({
    hostname: 'localhost',
    port: 5002,
    path: '/api/transactions/directory/auth_response_code',
    method: 'DELETE'
  });
  console.log('   ✓ Test fields cleaned up.');
  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
