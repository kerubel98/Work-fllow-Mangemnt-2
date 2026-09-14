import { discoverFtpFiles, discoverFtpFilesRecursive, testFtpConnection } from '../services/ftpConnectionService.js';
import pg from 'pg';
const { Pool } = pg;

async function testDiscovery() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:123456@localhost:5432/operational_workflow_db'
  });

  try {
    const res = await pool.query("SELECT * FROM database_connections WHERE type IN ('FTP', 'SFTP')");
    for (const db of res.rows) {
      console.log(`\n========================================`);
      console.log(`Testing DB: ${db.name} (${db.type} ${db.host}:${db.port})`);
      const testResult = await testFtpConnection(db);
      console.log('testFtpConnection result:', testResult);

      const files = await discoverFtpFiles(db);
      console.log('discoverFtpFiles result:', files);

      const recFiles = await discoverFtpFilesRecursive(db);
      console.log('discoverFtpFilesRecursive result count:', recFiles.length);
      console.log('recFiles:', recFiles);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

testDiscovery();
