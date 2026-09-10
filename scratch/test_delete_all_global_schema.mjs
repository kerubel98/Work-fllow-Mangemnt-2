import { getPostgresPool } from '../backend/dist/config/postgres.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const API_BASE = 'http://localhost:5002/api';

async function run() {
  console.log('=== Test Suite: Complete Deletion & Lifecycle of Global Schema ===\n');

  // 1. Check current directory count
  const res1 = await fetch(`${API_BASE}/transactions/directory`);
  const initialFields = await res1.json();
  console.log(`[1] Initial fields count: ${initialFields.length}`);

  // 2. Test individual deletion of transaction_id (which was previously locked/blocked)
  console.log('[2] Testing deletion of "transaction_id"...');
  const delPkRes = await fetch(`${API_BASE}/transactions/directory/transaction_id`, {
    method: 'DELETE'
  });
  const delPkData = await delPkRes.json();
  console.log('    Delete response:', delPkData.message);

  const res2 = await fetch(`${API_BASE}/transactions/directory`);
  const afterPkFields = await res2.json();
  const hasTxnId = afterPkFields.some(f => f.key === 'transaction_id');
  if (hasTxnId) {
    throw new Error('FAIL: transaction_id was not deleted!');
  }
  console.log('    [PASS] "transaction_id" successfully deleted from directory!');

  // 3. Test bulk deletion of all remaining fields (Clear Directory)
  console.log('[3] Testing bulk deletion of ALL global schema fields via DELETE /api/transactions/directory...');
  const clearRes = await fetch(`${API_BASE}/transactions/directory`, {
    method: 'DELETE'
  });
  const clearData = await clearRes.json();
  console.log('    Clear response:', clearData.message);

  // 4. Verify directory is empty and DOES NOT auto-reseed on GET
  const res3 = await fetch(`${API_BASE}/transactions/directory`);
  const emptyFields = await res3.json();
  console.log(`[4] Directory count after clear: ${emptyFields.length}`);
  if (emptyFields.length !== 0) {
    throw new Error(`FAIL: Expected 0 fields after clear, got ${emptyFields.length} (auto-reseed regression detected!)`);
  }
  console.log('    [PASS] Directory is completely empty and honors user deletion!');

  // 5. Verify /schema/config also returns empty standardFields without re-seeding
  const res4 = await fetch(`${API_BASE}/transactions/schema/config`);
  const emptyConfig = await res4.json();
  const standardCount = emptyConfig.standardFields ? emptyConfig.standardFields.length : 0;
  console.log(`[5] Schema config standardFields count: ${standardCount}`);
  if (standardCount !== 0) {
    throw new Error(`FAIL: /schema/config auto-reseeded standardFields! Count is ${standardCount}`);
  }
  console.log('    [PASS] /schema/config correctly returns empty schema!');

  // 6. Test restoring defaults (using official default banking fields)
  console.log('[6] Testing restore of default fields...');
  const defaultFields = [
    { key: 'transaction_id', label: 'Transaction ID', dataType: 'string', required: true, isStandard: true, category: 'Identification' },
    { key: 'card_number', label: 'Card / PAN Masked', dataType: 'string', required: true, isStandard: true, category: 'Identification' },
    { key: 'amount_usd', label: 'Settlement Amount', dataType: 'number', required: true, isStandard: true, category: 'Financial' },
    { key: 'status_state', label: 'Transaction Status', dataType: 'string', required: true, isStandard: true, category: 'Status' },
    { key: 'created_at', label: 'Created Timestamp', dataType: 'date', required: true, isStandard: true, category: 'Audit' }
  ];

  for (const f of defaultFields) {
    await fetch(`${API_BASE}/transactions/directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(f)
    });
  }

  const res5 = await fetch(`${API_BASE}/transactions/directory`);
  const restoredFields = await res5.json();
  console.log(`[6] Restored fields count: ${restoredFields.length}`);
  if (restoredFields.length !== defaultFields.length) {
    throw new Error(`FAIL: Expected ${defaultFields.length} restored fields, got ${restoredFields.length}`);
  }
  console.log('    [PASS] Restored fields verified!');

  console.log('\n======================================================');
  console.log('🎉 ALL GLOBAL SCHEMA DELETION TESTS PASSED 100%!');
  console.log('======================================================\n');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
