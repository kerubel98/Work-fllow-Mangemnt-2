import { store } from './store/dataStore.js';
import { repo } from './store/repository.js';
import { DatabaseConnection, DatabaseValidationWorkflow } from './types.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
    throw new Error(`Test failed: ${testName}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('DATABASE TABLE DISCOVERY & ADMIN ALLOWLIST VERIFICATION TESTS');
  console.log('================================================================\n');

  console.log('--- SUITE 1: Database Connection Tables Model & Store Seed ---');
  const dbs = await repo.getDatabases();
  assert(dbs.length >= 4, 'At least 4 database connections configured');

  const cbsDb = dbs.find(d => d.id === 'db-1');
  assert(!!cbsDb, 'db-1 (Core Payment Auth DB) exists in store');
  assert(Array.isArray(cbsDb?.availableTables), 'db-1 has availableTables array');
  assert(Array.isArray(cbsDb?.allowedTables), 'db-1 has allowedTables array');
  assert(cbsDb!.availableTables!.includes('cur_trax'), 'db-1 availableTables contains cur_trax');
  assert(cbsDb!.availableTables!.includes('transactions_master'), 'db-1 availableTables contains transactions_master');
  assert(cbsDb!.allowedTables!.includes('cur_trax'), 'db-1 allowedTables contains approved cur_trax');
  assert(!cbsDb!.allowedTables!.includes('merchants'), 'db-1 merchants table is detected but not allowlisted for workspace use');

  const settleDb = dbs.find(d => d.id === 'db-2');
  assert(!!settleDb, 'db-2 (Merchant Settlement Warehouse) exists in store');
  assert(settleDb!.availableTables!.includes('sv_fin_tab'), 'db-2 availableTables contains sv_fin_tab');
  assert(settleDb!.allowedTables!.includes('sv_fin_tab'), 'db-2 allowedTables contains sv_fin_tab');

  console.log('\n--- SUITE 2: Dynamic Table Discovery & Update ---');
  // Simulate discovering new tables from connected database
  const newDiscovered = ['auth_records', 'cur_trax', 'transactions_master', 'auth_log_tab', 'pos_bacth', 'tran_log_tab', 'customers', 'merchants', 'chargebacks_v2'];
  const updatedDb = await repo.updateDatabase('db-1', {
    availableTables: newDiscovered
  });
  assert(updatedDb !== null, 'Successfully updated db-1 availableTables');
  assert(updatedDb!.availableTables!.includes('chargebacks_v2'), 'Newly discovered table chargebacks_v2 is stored in availableTables');

  console.log('\n--- SUITE 3: Admin Workspace Table Allowlisting ---');
  // Admin approves chargebacks_v2 for workspace use
  const newApproved = [...(updatedDb?.allowedTables || []), 'chargebacks_v2'];
  const allowlistedDb = await repo.updateDatabase('db-1', {
    allowedTables: newApproved
  });
  assert(allowlistedDb !== null, 'Successfully updated db-1 allowedTables');
  assert(allowlistedDb!.allowedTables!.includes('chargebacks_v2'), 'Admin successfully allowed chargebacks_v2 for workspace use');
  assert(allowlistedDb!.allowedTables!.length === 6, 'db-1 now has 6 allowed workspace tables');

  console.log('\n--- SUITE 4: Non-Hardcoded Workflow Scope Table Resolution ---');
  // Create workflow dynamically using allowed table from chosen DB
  const chosenTable = allowlistedDb!.allowedTables![0]; // 'auth_records'
  assert(chosenTable !== 'transactions', `Scope table is actual table from DB ('${chosenTable}'), not hardcoded 'transactions'`);

  const dynamicWorkflow: DatabaseValidationWorkflow = {
    id: `wf-test-${Date.now()}`,
    name: 'Dynamic Settled Transactions Verifier',
    description: 'Workflow configured using real discovered database tables',
    targetDbId: 'db-1',
    targetTable: chosenTable,
    category: 'Settlement',
    version: '2.0.0',
    globalSuccessMessage: 'Passed',
    globalFailureMessage: 'Failed',
    createdBy: 'Admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stages: [
      {
        id: 'stage-dyn-1',
        name: 'Authorization Stage',
        order: 1,
        enabled: true,
        targetDbId: 'db-1',
        targetDataSource: chosenTable,
        businessMeaning: 'Ingress Auth'
      }
    ],
    steps: [
      {
        id: 'step-dyn-1',
        stepNumber: 1,
        name: 'Check Auth Record',
        stageId: 'stage-dyn-1',
        checkType: 'EXISTENCE_CHECK',
        targetDbId: 'db-1',
        targetTable: chosenTable,
        sourceField: 'transaction_id',
        targetField: 'auth_txn_id',
        requiredParams: ['transaction_id'],
        dependencyCondition: 'ALWAYS',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        onErrorAction: 'STOP'
      }
    ]
  };

  const savedWf = await repo.createWorkflow(dynamicWorkflow);
  assert(!!savedWf, 'Dynamic workflow saved successfully');
  assert(savedWf.targetTable === 'auth_records', 'Workflow scope table persists actual table name');
  assert(savedWf.stages[0].targetDataSource === 'auth_records', 'Stage data source persists actual table name');
  assert(savedWf.steps[0].targetTable === 'auth_records', 'Rule target table persists actual table name');

  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (100%)`);
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
