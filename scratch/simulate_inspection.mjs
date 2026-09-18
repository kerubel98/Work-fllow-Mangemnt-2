import { queryPg } from '../backend/dist/config/postgres.js';
import fs from 'fs';

async function main() {
  const rowRes = await queryPg(`
    SELECT canonical_data
    FROM task_dataset_transactions
    WHERE task_id = 'ISS-110'
    LIMIT 5
  `);
  
  const wfRes = await queryPg(`
    SELECT * FROM database_validation_workflows WHERE id = 'wf-1789231562126'
  `);
  const wf = wfRes.rows[0];
  console.log('Workflow:');
  console.log('id:', wf.id);
  console.log('name:', wf.name);
  console.log('targetDbId:', wf.targetDbId || wf.target_db_id);
  console.log('targetTable:', wf.targetTable || wf.target_table);
  console.log('steps:', JSON.stringify(wf.steps, null, 2));
  console.log('stages:', JSON.stringify(wf.stages, null, 2));
  console.log('messageAggregations:', JSON.stringify(wf.message_aggregations || wf.messageAggregations, null, 2));

  console.log('\nSample Row canonical_data:');
  console.log(JSON.stringify(rowRes.rows[0].canonical_data, null, 2));

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
