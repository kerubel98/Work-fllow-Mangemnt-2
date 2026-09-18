import { queryPg } from '../backend/dist/config/postgres.js';

async function main() {
  const executions = await queryPg(`
    SELECT task_id, workflow_id, workflow_name, status, total_records, passed_count, failed_count, executed_at, executed_by 
    FROM task_workflow_executions 
    ORDER BY executed_at DESC 
    LIMIT 10
  `);
  console.log('EXECUTIONS:');
  console.table(executions.rows);

  const columns = await queryPg(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'task_dataset_transactions'
  `);
  console.log('task_dataset_transactions columns:');
  console.table(columns.rows);

  const datasetSamples = await queryPg(`
    SELECT task_id, transaction_key, validation_status, validation_workflow_name, target_db
    FROM task_dataset_transactions 
    LIMIT 10
  `);
  console.log('DATASET SAMPLES:');
  console.table(datasetSamples.rows);

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
