import pg from 'pg';
const { Pool } = pg;

async function checkFtp() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:123456@localhost:5432/operational_workflow_db'
  });

  try {
    const res = await pool.query("SELECT id, name, type, host, port, username, password, database_name, connection_string FROM database_connections WHERE type IN ('FTP', 'SFTP')");
    console.log(`Found ${res.rows.length} FTP/SFTP connections:`);
    for (const row of res.rows) {
      console.log(`\nID: ${row.id} | Name: ${row.name} | Type: ${row.type} | Host: ${row.host} | Port: ${row.port} | User: ${row.username} | BaseDir: ${row.database_name}`);
      console.log('ConnStr:', row.connection_string);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkFtp();
