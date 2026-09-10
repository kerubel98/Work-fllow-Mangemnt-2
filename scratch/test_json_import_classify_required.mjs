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
  console.log('=== Starting Test: JSON Import, Auto-Classification, and Required Constraint Persistence ===\n');

  // Test 1: Batch import raw fields via POST /api/transactions/directory/batch-import
  const testFields = [
    {
      key: 'test_tx_ref_num',
      label: 'Transaction Reference Number',
      description: 'Unique reference number for transaction',
      dataType: 'string',
      required: true
    },
    {
      key: 'test_auth_amount',
      label: 'Authorized Settlement Amount',
      dataType: 'number',
      is_required: true
    },
    {
      key: 'test_card_pan',
      label: 'Primary Account Number',
      dataType: 'string',
      isRequired: false
    },
    {
      key: 'test_txn_status',
      label: 'Transaction Lifecycle State',
      dataType: 'string'
    },
    {
      key: 'test_settle_timestamp',
      label: 'Settlement Processed At',
      dataType: 'date',
      required: true
    }
  ];

  console.log('1. Testing POST /api/transactions/directory/batch-import ...');
  const importRes = await request({
    hostname: 'localhost',
    port: 5002,
    path: '/api/transactions/directory/batch-import',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    fields: testFields,
    autoClassify: true,
    userId: 'test-agent'
  });

  console.log(`   Import Response Status: ${importRes.status}`);
  console.log(`   Imported Count: ${importRes.data.importedCount}`);
  if (![200, 201].includes(importRes.status) || !importRes.data.importedCount) {
    console.error('FAILED batch import:', importRes);
    process.exit(1);
  }

  // Verify fields from DB
  console.log('\n2. Verifying saved fields & auto-classification from PostgreSQL ...');
  const getRes = await request({
    hostname: 'localhost',
    port: 5002,
    path: '/api/transactions/directory',
    method: 'GET'
  });

  const allFields = getRes.data;
  console.log(`   Total fields in DB directory: ${allFields.length}`);

  const txRef = allFields.find(f => f.key === 'test_tx_ref_num');
  const authAmt = allFields.find(f => f.key === 'test_auth_amount');
  const cardPan = allFields.find(f => f.key === 'test_card_pan');
  const txnStatus = allFields.find(f => f.key === 'test_txn_status');
  const settleTs = allFields.find(f => f.key === 'test_settle_timestamp');

  console.log(`   test_tx_ref_num: category='${txRef?.category}', required=${txRef?.required}`);
  console.log(`   test_auth_amount: category='${authAmt?.category}', required=${authAmt?.required}`);
  console.log(`   test_card_pan: category='${cardPan?.category}', required=${cardPan?.required}`);
  console.log(`   test_txn_status: category='${txnStatus?.category}', required=${txnStatus?.required}`);
  console.log(`   test_settle_timestamp: category='${settleTs?.category}', required=${settleTs?.required}`);

  if (!txRef || txRef.category !== 'Identity & Reference' || txRef.required !== true) {
    console.error('FAILED: test_tx_ref_num classification or required flag mismatch');
    process.exit(1);
  }
  if (!authAmt || authAmt.category !== 'Financial & Amounts' || authAmt.required !== true) {
    console.error('FAILED: test_auth_amount classification or required flag mismatch');
    process.exit(1);
  }
  if (!cardPan || cardPan.category !== 'Card & Account' || cardPan.required !== false) {
    console.error('FAILED: test_card_pan classification or required flag mismatch');
    process.exit(1);
  }
  if (!txnStatus || txnStatus.category !== 'Lifecycle & Status') {
    console.error('FAILED: test_txn_status classification mismatch');
    process.exit(1);
  }
  if (!settleTs || settleTs.category !== 'Audit & Timestamps' || settleTs.required !== true) {
    console.error('FAILED: test_settle_timestamp classification or required flag mismatch');
    process.exit(1);
  }
  console.log('   ✓ Auto-classification and initial required flags VERIFIED in PostgreSQL!');

  // Test 3: Toggle required constraint on test_card_pan from false -> true
  console.log('\n3. Testing PUT /api/transactions/directory/:id toggling required from false -> true ...');
  const updateRes1 = await request({
    hostname: 'localhost',
    port: 5002,
    path: `/api/transactions/directory/${cardPan.id || 'test_card_pan'}`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, {
    ...cardPan,
    required: true,
    is_required: true,
    isRequired: true
  });

  console.log(`   Update Status: ${updateRes1.status}`);
  if (updateRes1.status !== 200) {
    console.error('FAILED toggle required:', updateRes1);
    process.exit(1);
  }

  // Re-fetch to confirm persistence in PostgreSQL
  const getRes2 = await request({
    hostname: 'localhost',
    port: 5002,
    path: '/api/transactions/directory',
    method: 'GET'
  });
  const updatedCardPan = getRes2.data.find(f => f.key === 'test_card_pan');
  console.log(`   Updated test_card_pan required=${updatedCardPan?.required}`);
  if (updatedCardPan?.required !== true) {
    console.error('FAILED: test_card_pan required was not updated to true');
    process.exit(1);
  }
  console.log('   ✓ Required constraint toggle to TRUE persisted in PostgreSQL!');

  // Test 4: Toggle required constraint back from true -> false
  console.log('\n4. Testing PUT /api/transactions/directory/:id toggling required from true -> false ...');
  const updateRes2 = await request({
    hostname: 'localhost',
    port: 5002,
    path: `/api/transactions/directory/${cardPan.id || 'test_card_pan'}`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, {
    ...updatedCardPan,
    required: false,
    is_required: false,
    isRequired: false
  });

  const getRes3 = await request({
    hostname: 'localhost',
    port: 5002,
    path: '/api/transactions/directory',
    method: 'GET'
  });
  const revertedCardPan = getRes3.data.find(f => f.key === 'test_card_pan');
  console.log(`   Reverted test_card_pan required=${revertedCardPan?.required}`);
  if (revertedCardPan?.required !== false) {
    console.error('FAILED: test_card_pan required was not reverted to false');
    process.exit(1);
  }
  console.log('   ✓ Required constraint toggle to FALSE persisted in PostgreSQL!');

  // Test 5: Set test_auth_amount category to 'CustomUnclassified' and test auto-classify
  console.log('\n5. Testing POST /api/transactions/directory/auto-classify ...');
  // Set category to 'CustomUnclassified'
  await request({
    hostname: 'localhost',
    port: 5002,
    path: `/api/transactions/directory/${authAmt.id || 'test_auth_amount'}`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  }, {
    ...authAmt,
    category: 'CustomUnclassified'
  });

  const classifyRes = await request({
    hostname: 'localhost',
    port: 5002,
    path: '/api/transactions/directory/auto-classify',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {});
  console.log(`   Auto-Classify Status: ${classifyRes.status}, Message: "${classifyRes.data?.message}"`);
  console.log(`   Classified Count: ${classifyRes.data?.classifiedCount}`);
  if (classifyRes.status !== 200 || !classifyRes.data.success || classifyRes.data.classifiedCount < 1) {
    console.error('FAILED auto-classify all:', classifyRes);
    process.exit(1);
  }

  // Verify test_auth_amount was reclassified back to Financial & Amounts
  const getRes4 = await request({
    hostname: 'localhost',
    port: 5002,
    path: '/api/transactions/directory',
    method: 'GET'
  });
  const reclassifiedAuthAmt = getRes4.data.find(f => f.key === 'test_auth_amount');
  console.log(`   Reclassified test_auth_amount category: '${reclassifiedAuthAmt?.category}'`);
  if (reclassifiedAuthAmt?.category !== 'Financial & Amounts') {
    console.error('FAILED: test_auth_amount was not reclassified to Financial & Amounts');
    process.exit(1);
  }
  console.log('   ✓ Bulk auto-classify successfully re-categorized fields in PostgreSQL!');

  // Cleanup test fields
  console.log('\n6. Cleaning up test fields ...');
  for (const f of [txRef, authAmt, cardPan, txnStatus, settleTs]) {
    if (f?.id || f?.key) {
      await request({
        hostname: 'localhost',
        port: 5002,
        path: `/api/transactions/directory/${f.id || f.key}`,
        method: 'DELETE'
      });
    }
  }
  console.log('   ✓ Test fields cleaned up.');
  console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
