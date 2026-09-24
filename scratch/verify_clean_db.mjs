import pg from 'pg';

async function main() {
  const pool = new pg.Pool({ connectionString: 'postgresql://postgres:123456@localhost:5432/operational_workflow_db' });
  const wf = await pool.query('SELECT count(*) FROM database_validation_workflows');
  const tbls = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name");
  const mirrors = tbls.rows.filter(r => r.table_name.startsWith('mirror_'));
  console.log('Workflows count:', wf.rows[0].count);
  console.log('Total tables count:', tbls.rows.length);
  console.log('Mirror tables count:', mirrors.length);
  await pool.end();
}

main().catch(console.error);
