import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgres://postgres:123456@localhost:5432/operational_workflow_db',
});

async function main() {
  const mirrors = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'mirror_%'"
  );
  console.log('Mirror tables count:', mirrors.rowCount);
  console.log('Mirror tables:', mirrors.rows.map(r => r.table_name));

  const workflows = await pool.query("SELECT count(*) FROM database_validation_workflows");
  console.log('Workflows count in DB:', workflows.rows[0].count);

  const executions = await pool.query("SELECT count(*) FROM task_workflow_executions");
  console.log('Workflow executions count in DB:', executions.rows[0].count);

  const nonMirrors = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT LIKE 'mirror_%' ORDER BY table_name"
  );
  console.log('Non-mirror tables count:', nonMirrors.rowCount);
  console.log('Non-mirror tables:', nonMirrors.rows.map(r => r.table_name));

  await pool.end();
}

main().catch(console.error);
