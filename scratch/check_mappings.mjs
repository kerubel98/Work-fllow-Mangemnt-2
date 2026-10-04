import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgres://postgres:123456@localhost:5432/operational_workflow_db',
});

async function main() {
  const mappings = await pool.query('SELECT * FROM database_table_mappings');
  console.log('database_table_mappings:', mappings.rows);

  const colConfigs = await pool.query('SELECT id, connection_id, table_name FROM database_column_configurations');
  console.log('database_column_configurations:', colConfigs.rows);

  const connLogs = await pool.query('SELECT count(*) FROM connection_usage_logs');
  console.log('connection_usage_logs count:', connLogs.rows[0].count);

  const accessReqs = await pool.query('SELECT count(*) FROM db_access_requests');
  console.log('db_access_requests count:', accessReqs.rows[0].count);

  const queryApprovals = await pool.query('SELECT count(*) FROM query_approval_requests');
  console.log('query_approval_requests count:', queryApprovals.rows[0].count);

  await pool.end();
}

main().catch(console.error);
