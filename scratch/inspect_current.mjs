import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgres://postgres:123456@localhost:5432/operational_workflow_db',
});

async function main() {
  const wfs = await pool.query('SELECT id, name, team_id, created_at FROM database_validation_workflows');
  console.log('Workflows:', JSON.stringify(wfs.rows, null, 2));

  const mirrors = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'mirror_%'");
  console.log('Mirrors count:', mirrors.rows.length);
  console.log('Mirrors:', mirrors.rows.map(r => r.table_name));

  const nonCoreTables = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  console.log('Total tables count:', nonCoreTables.rows.length);
  console.log('All tables:', nonCoreTables.rows.map(r => r.table_name));

  await pool.end();
}

main().catch(console.error);
