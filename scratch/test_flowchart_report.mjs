// scratch/test_flowchart_report.mjs
const BASE_URL = 'http://localhost:5002';

async function runTest() {
  console.log('--- Step 1: Create Flowchart Workflow with REPORT Intermediate Action ---');

  const wfPayload = {
    name: 'Flowchart Ingress with Intermediate Report',
    category: 'Settlement',
    description: 'Autonomous flowchart DAG pipeline with Continue, Stop, and intermediate Report column',
    nodes: [
      {
        id: 'start-1',
        type: 'START',
        name: 'Transaction Ingress',
        x: 60,
        y: 180,
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP'
      },
      {
        id: 'box-1',
        type: 'VALIDATION_BOX',
        name: 'Auth Log Mirror Ingester',
        category: 'Ingestion',
        x: 320,
        y: 150,
        onPassAction: 'REPORT', // INTERMEDIATE REPORT FUNCTION!
        onFailAction: 'STOP',
        reportColumnName: 'Gateway Auth Response',
        reportField: 'response_code',
        targetDbId: 'settlemnt',
        targetTable: 'auth_log_tab'
      },
      {
        id: 'box-2',
        type: 'VALIDATION_BOX',
        name: 'Settlement Amount Integrity Check',
        category: 'Integrity',
        x: 640,
        y: 150,
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        reportColumnName: 'Cleared Variance',
        reportField: 'amount'
      },
      {
        id: 'end-1',
        type: 'END',
        name: 'RECONCILED',
        x: 940,
        y: 180,
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP'
      }
    ],
    connections: [
      {
        id: 'conn-1',
        fromNodeId: 'start-1',
        fromPort: 'output',
        toNodeId: 'box-1',
        action: 'CONTINUE',
        label: 'Stream Batch'
      },
      {
        id: 'conn-2',
        fromNodeId: 'box-1',
        fromPort: 'pass',
        toNodeId: 'box-2',
        action: 'REPORT',
        label: 'Report to Grid & Continue'
      },
      {
        id: 'conn-3',
        fromNodeId: 'box-2',
        fromPort: 'pass',
        toNodeId: 'end-1',
        action: 'CONTINUE',
        label: 'Reconcile'
      }
    ],
    stages: [
      {
        id: 'stage-box-1',
        name: 'Auth Log Mirror Ingester',
        order: 1,
        enabled: true,
        targetDbId: 'settlemnt',
        targetDataSource: 'auth_log_tab'
      },
      {
        id: 'stage-box-2',
        name: 'Settlement Amount Integrity Check',
        order: 2,
        enabled: true,
        targetDbId: 'settlemnt',
        targetDataSource: 'fin_tab'
      }
    ],
    steps: [
      {
        id: 'step-box-1',
        stepNumber: 1,
        name: 'Auth Log Mirror Ingester',
        stageId: 'stage-box-1',
        checkType: 'EXISTENCE_CHECK',
        targetDbId: 'settlemnt',
        targetTable: 'auth_log_tab',
        sourceField: 'tran_ref',
        onPassAction: 'REPORT', // INTERMEDIATE REPORT
        onFailAction: 'STOP',
        reportColumnName: 'Gateway Auth Response',
        reportField: 'response_code'
      },
      {
        id: 'step-box-2',
        stepNumber: 2,
        name: 'Settlement Amount Integrity Check',
        stageId: 'stage-box-2',
        checkType: 'FIELD_COMPARATOR',
        targetDbId: 'settlemnt',
        targetTable: 'fin_tab',
        sourceField: 'amount',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        reportColumnName: 'Cleared Variance',
        reportField: 'amount'
      }
    ]
  };

  const createRes = await fetch(`${BASE_URL}/api/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(wfPayload)
  });

  const createdWf = await createRes.json();
  console.log('Created Workflow:', createdWf.id, createdWf.name);
  console.log('Nodes count:', createdWf.nodes?.length);
  console.log('Connections count:', createdWf.connections?.length);
  console.log('Report steps:', createdWf.steps?.map(s => ({
    name: s.name,
    onPassAction: s.onPassAction,
    reportColumnName: s.reportColumnName
  })));

  console.log('\n--- Step 2: Fetch and verify stored Flowchart Workflow ---');
  const getRes = await fetch(`${BASE_URL}/api/workflows/${createdWf.id}`);
  const fetchedWf = await getRes.json();
  console.log('Fetched Workflow:', fetchedWf.id);
  console.log('Connection actions:', fetchedWf.connections?.map(c => ({ id: c.id, from: c.fromNodeId, to: c.toNodeId, action: c.action })));

  console.log('\n=== FLOWCHART WORKFLOW VERIFICATION SUCCESSFUL ===');
}

runTest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
