import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgres://postgres:123456@localhost:5432/operational_workflow_db' });
async function run() {
  const wfs = await pool.query('SELECT id, name FROM database_validation_workflows');
  console.log('Workflows in database_validation_workflows:', wfs.rows.length);
  for (const w of wfs.rows) {
    console.log('  -', w.id, w.name);
  }
  const mirrors = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'mirror_%'");
  console.log('Mirror tables in DB:', mirrors.rows.length);
  for (const m of mirrors.rows) {
    console.log('  *', m.table_name);
  }
  await pool.end();
}
run();
