import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'operational_workflow_db',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '123456',
});

async function main() {
  try {
    const wfRes = await pool.query("SELECT * FROM database_validation_workflows WHERE id = 'wf-1791494381096'");
    const workflow = wfRes.rows[0];

    const rowRes = await pool.query("SELECT row_number, canonical_data FROM task_dataset_transactions WHERE task_id = 'ISS-6362' ORDER BY row_number LIMIT 5");

    for (const r of rowRes.rows) {
      console.log(`\nRow ${r.row_number}:`);
      console.log('val_status:', r.canonical_data._validation_status);
      console.log('val_action:', r.canonical_data._validation_action);
      console.log('val_details:', r.canonical_data._validation_details);
      console.log('has_target_record:', Boolean(r.canonical_data._target_record));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
