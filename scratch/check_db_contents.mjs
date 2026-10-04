import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgres://postgres:123456@localhost:5432/operational_workflow_db',
});

async function main() {
  const qeCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'query_extractions'");
  console.log('query_extractions columns:', qeCols.rows.map(r => r.column_name));
  
  const qe = await pool.query('SELECT * FROM query_extractions');
  console.log('query_extractions rows count:', qe.rows.length);
  if (qe.rows.length > 0) {
    console.log('query_extractions sample:', qe.rows.map(r => ({ id: r.id, title: r.title, table: r.table_name || r.extraction_name })));
  }

  const ftpCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'ftp_file_staging_configs'");
  console.log('ftp_file_staging_configs columns:', ftpCols.rows.map(r => r.column_name));

  const ftp = await pool.query('SELECT * FROM ftp_file_staging_configs');
  console.log('ftp configs count:', ftp.rows.length);
  if (ftp.rows.length > 0) {
    console.log('ftp configs:', ftp.rows.map(r => ({ id: r.id, name: r.name, folder: r.folder_path, table: r.table_name })));
  }

  const conns = await pool.query('SELECT id, name, type, host, database_name FROM database_connections');
  console.log('database_connections count:', conns.rows.length);
  console.log('database_connections:', conns.rows);

  const envs = await pool.query('SELECT id, name, system_type FROM environment_systems');
  console.log('environment_systems:', envs.rows);

  await pool.end();
}

main().catch(console.error);
