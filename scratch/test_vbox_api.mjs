async function testValidationBoxes() {
  try {
    const listRes = await fetch('http://localhost:5002/api/validation-boxes');
    const initialBoxes = await listRes.json();
    console.log('1. Initial validation boxes count:', initialBoxes.length);

    // Create a Type 1: Ingestion & Search block
    const searchBox = {
      name: 'Auth Log Retrieval Box',
      description: 'Searches auth_log for settlement authorization',
      boxType: 'INGESTION_SEARCH',
      category: 'Settlement Verification',
      targetDbId: 'db-1788626602330', // settlement db
      targetTable: 'auth_log_tab',
      searchParameters: [
        { inputField: 'transactionId', targetColumn: 'tran_id', required: true },
        { inputField: 'terminalId', targetColumn: 'terminal_id', required: false }
      ]
    };

    const createRes1 = await fetch('http://localhost:5002/api/validation-boxes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchBox)
    });
    const created1 = await createRes1.json();
    console.log('2. Created Search Box:', created1.id, 'Mirror Table:', created1.mirrorTableName);

    // Create a Type 2: Condition Check block
    const conditionBox = {
      name: 'Amount Tolerance Check Box',
      description: 'Ensures transaction amount does not exceed 1000 and matches expected',
      boxType: 'CONDITION_CHECK',
      category: 'Financial Rule',
      checkStep: {
        id: 'chk-1',
        name: 'Check amount',
        canonicalField: 'amount',
        operator: 'NUMERIC_TOLERANCE',
        expectedValue: '150.00',
        tolerance: 0.50,
        actionOnSuccess: 'CONTINUE',
        actionOnFailure: 'FLAG'
      }
    };

    const createRes2 = await fetch('http://localhost:5002/api/validation-boxes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conditionBox)
    });
    const created2 = await createRes2.json();
    console.log('3. Created Condition Box:', created2.id, created2.name);

    // Test run Condition Box
    const testRes = await fetch('http://localhost:5002/api/validation-boxes/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        box: created2,
        sampleRecord: { amount: 149.99, transactionId: 'TXN-9021' }
      })
    });
    const testResult = await testRes.json();
    console.log('4. Condition Box Test Run Result:', testResult);
  } catch (err) {
    console.error('Test error:', err);
  }
}

testValidationBoxes();
