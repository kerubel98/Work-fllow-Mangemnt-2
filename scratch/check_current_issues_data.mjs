import { queryPg } from '../backend/dist/config/postgres.js';

async function main() {
  const issues = await queryPg('SELECT * FROM issues ORDER BY id LIMIT 5');
  console.log('ISSUES:', JSON.stringify(issues.rows.map(r => ({ id: r.id, title: r.title, status: r.status, hashtag: r.hashtag })), null, 2));

  const executions = await queryPg('SELECT * FROM task_workflow_executions ORDER BY executed_at DESC LIMIT 5');
  console.log('EXECUTIONS:', JSON.stringify(executions.rows, null, 2));

  const sampleDatasets = await queryPg('SELECT task_id, key, status, details FROM task_dataset_transactions LIMIT 10');
  console.log('TASK DATASET TRANSACTIONS:', JSON.stringify(sampleDatasets.rows, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
