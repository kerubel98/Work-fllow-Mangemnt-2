import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgres://postgres:123456@localhost:5432/operational_workflow_db',
});

async function main() {
  const conns = await pool.query('SELECT id, name, type, host, database_name, team_id FROM database_connections');
  console.log('Database connections:', conns.rows);

  const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'database_column_configurations'");
  console.log('database_column_configurations columns:', cols.rows.map(c => c.column_name));

  const colConfigs = await pool.query('SELECT * FROM database_column_configurations LIMIT 5');
  console.log('database_column_configurations sample:', colConfigs.rows);

  await pool.end();
}

main().catch(console.error);
