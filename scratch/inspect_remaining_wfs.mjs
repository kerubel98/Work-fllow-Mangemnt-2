import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgres://postgres:123456@localhost:5432/operational_workflow_db' });
async function run() {
  const res = await pool.query("SELECT id, name, target_db_id, target_table, created_by, is_system_default FROM database_validation_workflows WHERE id NOT LIKE 'wf-gov-%' AND id NOT LIKE 'wf-share-%'");
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
}
run();
