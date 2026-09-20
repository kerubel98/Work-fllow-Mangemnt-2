import { postgresRepo } from './backend/src/store/postgresRepo.js';

async function main() {
  const execs = await postgresRepo.getTaskWorkflowExecutionsByTaskId('ISS-103');
  console.log('Total workflow executions for ISS-103:', execs.length);
  for (const row of execs) {
    console.log('Exec:', row.id, row.workflowName, 'passed:', row.passedCount, 'failed:', row.failedCount);
    if (row.executionSummary && row.executionSummary.results) {
      const keys = Object.keys(row.executionSummary.results);
      console.log('Result sample keys (first 5):', keys.slice(0, 5));
      console.log('Sample result for key:', keys[0], JSON.stringify(row.executionSummary.results[keys[0]], null, 2));
    }
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
