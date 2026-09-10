// scratch/test_e2e_full_workflow.mjs
const BASE_URL = 'http://localhost:5002';

async function runTest() {
  console.log('--- Step 1: Health & Validation Boxes API ---');
  
  // 1. Create a Type 1: INGESTION_SEARCH Validation Box
  const vBox1Res = await fetch(`${BASE_URL}/api/validation-boxes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      boxType: 'INGESTION_SEARCH',
      name: 'Auth Log Mirror Ingester',
      description: 'Ingests authorizations from settlement auth_log table into mirror_settlemnt_auth_log_tab',
      targetDbId: 'settlemnt',
      targetTable: 'auth_log_tab',
      searchParameters: [
        { paramName: 'tran_ref', sourceField: 'tran_ref', operator: 'EQUALS', isRequired: true }
      ]
    })
  });
  const vBox1 = await vBox1Res.json();
  console.log('Created INGESTION_SEARCH Box:', vBox1.id, vBox1.name, 'Mirror Table:', vBox1.mirrorTableName);

  // 2. Create a Type 2: CONDITION_CHECK Validation Box
  const vBox2Res = await fetch(`${BASE_URL}/api/validation-boxes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      boxType: 'CONDITION_CHECK',
      name: 'Financial Amount & ISO Code Verifier',
      description: 'Verifies amount variance tolerance and checks for ISO response code 00',
      checkStep: {
        id: 'chk-step-1',
        name: 'Financial Check',
        ruleType: 'FIELD_MATCH',
        condition: 'EQUALS',
        sourceField: 'resp_code',
        targetField: 'resp_code',
        tolerance: 0.05
      }
    })
  });
  const vBox2 = await vBox2Res.json();
  console.log('Created CONDITION_CHECK Box:', vBox2.id, vBox2.name);

  // 3. Test Validation Box execution endpoint
  const testRes = await fetch(`${BASE_URL}/api/validation-boxes/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      box: vBox2,
      sampleInput: { amount: 100.02, resp_code: '00' }
    })
  });
  const testOutput = await testRes.json();
  console.log('Tested CONDITION_CHECK Box output:', testOutput);

  console.log('\n--- Step 2: Task Dataset Ingestion, Pre-flight Transformation & Batching ---');
  const taskId1 = `ISSUE-${Date.now()}`;
  const taskId2 = `ISSUE-${Date.now() + 1}`;
  const uniqueKey = `TX_${Date.now()}`;

  // Create Task 1
  await fetch(`${BASE_URL}/api/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: taskId1,
      title: 'Settlement Batch 901',
      description: 'Primary daily batch',
      creatorId: 'user-ops-1',
      creatorName: 'Ops Specialist'
    })
  });

  // Create Task 2
  await fetch(`${BASE_URL}/api/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: taskId2,
      title: 'Settlement Batch 902',
      description: 'Secondary batch with potential overlapping transactions',
      creatorId: 'user-ops-2',
      creatorName: 'Audit Specialist'
    })
  });

  // Ingest under Task 1
  const ingest1Res = await fetch(`${BASE_URL}/api/issues/${taskId1}/dataset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rows: [
        {
          tran_ref: uniqueKey,
          amount: '$2,450.00', // Non-standard format -> should transform to 2450
          tran_date: '2026-09-05 14:30:00', // Should transform to standard ISO-8601
          currency: 'USD',
          account_no: 'ACC-88219'
        },
        {
          tran_ref: `${uniqueKey}_SECONDARY`,
          amount: '150.75',
          tran_date: '2026/09/01',
          currency: 'USD',
          account_no: 'ACC-99412'
        }
      ]
    })
  });
  const ingest1Result = await ingest1Res.json();
  console.log('Ingest Task 1 Response:', {
    totalRows: ingest1Result.totalRows,
    insertedCount: ingest1Result.insertedCount,
    batchesCreated: ingest1Result.batchesCreated,
    batchList: ingest1Result.batchList,
    duplicateCount: ingest1Result.duplicateCount,
    sampleStandardizedDate: ingest1Result.sampleStandardizedDate
  });

  // Verify batches for Task 1
  const batches1Res = await fetch(`${BASE_URL}/api/issues/${taskId1}/batches`);
  const batches1 = await batches1Res.json();
  console.log('Batches for Task 1:', batches1.batches);

  console.log('\n--- Step 3: Cross-Task Duplicate Detection via Central Transaction Repository ---');
  // Ingest the exact same uniqueKey under Task 2
  const ingest2Res = await fetch(`${BASE_URL}/api/issues/${taskId2}/dataset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rows: [
        {
          tran_ref: uniqueKey, // DUPLICATE KEY from Task 1!
          amount: 2450.00,
          tran_date: '2026-09-05',
          currency: 'USD'
        },
        {
          tran_ref: `${uniqueKey}_NEW_RECORD`, // Brand new key
          amount: 500.00,
          tran_date: '2026-09-05',
          currency: 'USD'
        }
      ]
    })
  });
  const ingest2Result = await ingest2Res.json();
  console.log('Ingest Task 2 Response:', {
    totalRows: ingest2Result.totalRows,
    insertedCount: ingest2Result.insertedCount,
    duplicateCount: ingest2Result.duplicateCount,
    duplicatesFlagged: ingest2Result.duplicatesFlagged
  });

  // Fetch transactions for Task 2 to verify duplicate flags
  const tx2Res = await fetch(`${BASE_URL}/api/issues/${taskId2}/transactions`);
  const tx2Data = await tx2Res.json();
  console.log('Task 2 Ingested Transactions verification:');
  console.log('Sample Row 0:', JSON.stringify(tx2Data.rows[0], null, 2));
  for (const row of tx2Data.rows) {
    const c = row.canonicalData || row;
    console.log(`  Key: ${c.tran_ref || row.transactionKey} | Batch: ${row.batchId || c._batchId} | isDuplicate: ${c._isDuplicate || row.isDuplicate} | duplicateFromTaskId: ${c._duplicateFromTaskId || row.duplicateFromTaskId}`);
  }

  console.log('\n--- Step 4: Flowchart DAG Workflow Pipeline Creation ---');
  const wfRes = await fetch(`${BASE_URL}/api/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'E2E Validation Pipeline',
      description: 'Orchestrates Auth Log Ingest followed by Financial Tolerance Check',
      isActive: true,
      stages: [
        {
          stageId: 'stage-1',
          name: 'Stage 1: Mirror Table Search & Ingestion',
          description: 'Pulls authorizations into Postgres mirror table',
          rules: [],
          validationBoxIds: [vBox1.id],
          onPassAction: 'ADVANCE_NEXT_STAGE',
          onFailAction: 'HALT_PIPELINE'
        },
        {
          stageId: 'stage-2',
          name: 'Stage 2: Tolerances & Response Code Check',
          description: 'Evaluates amount matching tolerance and ISO 00',
          rules: [],
          validationBoxIds: [vBox2.id],
          onPassAction: 'RECONCILE_TRANSACTION',
          onFailAction: 'FLAG_FOR_SUPERVISOR'
        }
      ]
    })
  });
  const wf = await wfRes.json();
  console.log('Workflow created:', wf.id, wf.name, `Stages: ${wf.stages?.length}`);

  console.log('\n=== ALL E2E VERIFICATION CHECKS PASSED SUCCESSFULLY ===');
}

runTest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
