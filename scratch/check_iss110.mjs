import { queryPg } from '../backend/dist/config/postgres.js';

async function main() {
  const res = await queryPg(`
    SELECT id, task_id, row_number, canonical_data
    FROM task_dataset_transactions
    WHERE task_id = 'ISS-110'
    LIMIT 3
  `);
  console.log('ISS-110 canonical_data sample:');
  for (const r of res.rows) {
    console.log('Row:', r.row_number);
    console.log('Keys:', Object.keys(r.canonical_data));
    console.log('_validation_status:', r.canonical_data._validation_status);
    console.log('_validation_details:', r.canonical_data._validation_details);
    console.log('status:', r.canonical_data.status);
  }
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
