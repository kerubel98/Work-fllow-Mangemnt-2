// scratch/test_report_column_engine.mjs
import { executeWorkflowForTransaction } from '../frontend/src/services/investigationEngine.ts';

const mockWorkflow = {
  id: 'wf-test-report',
  name: 'Test Flowchart Report Workflow',
  targetDbId: 'settlemnt',
  targetTable: 'auth_log_tab',
  stages: [
    {
      id: 'stage-1',
      name: 'Auth Log Ingestion',
      order: 1,
      enabled: true,
      targetDbId: 'settlemnt',
      targetDataSource: 'auth_log_tab'
    },
    {
      id: 'stage-2',
      name: 'Settlement Clearance',
      order: 2,
      enabled: true,
      targetDbId: 'settlemnt',
      targetDataSource: 'fin_tab'
    }
  ],
  steps: [
    {
      id: 'step-auth-1',
      stepNumber: 1,
      name: 'Auth Verification',
      stageId: 'stage-1',
      checkType: 'EXISTENCE_CHECK',
      targetDbId: 'settlemnt',
      targetTable: 'auth_log_tab',
      sourceField: 'tran_ref',
      onPassAction: 'REPORT', // INTERMEDIATE FUNCTION: REPORT
      onFailAction: 'STOP',
      reportColumnName: 'Gateway Auth Outcome',
      reportField: 'response_code',
      successMessage: 'Auth confirmed in mirror db.'
    },
    {
      id: 'step-fin-2',
      stepNumber: 2,
      name: 'Financial Amount Verification',
      stageId: 'stage-2',
      checkType: 'FIELD_COMPARATOR',
      targetDbId: 'settlemnt',
      targetTable: 'fin_tab',
      sourceField: 'amount',
      comparator: '>',
      compareValue: '0',
      onPassAction: 'CONTINUE',
      onFailAction: 'STOP'
    }
  ]
};

const mockTransaction = {
  transaction_id: 'TXN-REPORT-9901',
  tran_ref: 'TXN-REPORT-9901',
  amount: 3200.50,
  response_code: '00_APPROVED',
  status: 'INGESTED'
};

const summary = executeWorkflowForTransaction(mockTransaction, mockWorkflow);

console.log('--- Investigation Execution with Intermediate REPORT Function ---');
console.log('Transaction ID:', summary.transactionId);
console.log('Investigation Status:', summary.investigationStatus);
console.log('Intermediate Reports:', summary.intermediateReports);
console.log('Row Injected Report Field:', mockTransaction['_report_Gateway Auth Outcome']);

if (summary.intermediateReports?.['Gateway Auth Outcome'] === '00_APPROVED' &&
    mockTransaction['_report_Gateway Auth Outcome'] === '00_APPROVED') {
  console.log('SUCCESS: Intermediate report function accurately projected column value to investigation view!');
} else {
  console.error('FAILED: Report value not captured properly.');
  process.exit(1);
}
