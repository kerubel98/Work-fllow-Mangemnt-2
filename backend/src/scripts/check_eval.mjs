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
    const wfRes = await pool.query(
      "SELECT * FROM database_validation_workflows WHERE id = 'wf-1791494381096'"
    );
    const workflow = wfRes.rows[0];

    const rowRes = await pool.query(
      "SELECT row_number, canonical_data FROM task_dataset_transactions WHERE task_id = 'ISS-6362' AND row_number IN (1, 2)"
    );

    for (const r of rowRes.rows) {
      const rec = r.canonical_data;
      console.log(`\n=== ROW ${r.row_number} ===`);
      console.log('TR_GROUP_ID in target_rec:', rec._target_record?.TR_GROUP_ID, rec._target_record?.tr_group_id);
      console.log('BO_TYPE in target_rec:', rec._target_record?.BO_TYPE, rec._target_record?.bo_type);
      console.log('PROC_NAME in target_rec:', rec._target_record?.PROC_NAME, rec._target_record?.proc_name);
      console.log('INSTITUTION1 in target_rec:', rec._target_record?.INSTITUTION1, rec._target_record?.institution1);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();
