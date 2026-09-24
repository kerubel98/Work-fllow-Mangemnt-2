import pg from 'pg';
import fs from 'fs';

const pool = new pg.Pool({
  host: 'localhost',
  port: 5432,
  database: 'operational_workflow_db',
  user: 'postgres',
  password: '123456'
});

try {
  const sql = fs.readFileSync('backend/src/database/migrations/018_workflow_bundles_and_governance_segregation.sql', 'utf-8');
  await pool.query(sql);
  const res = await pool.query("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'workflow_bundles';");
  console.log('SUCCESS: migration 018 applied, workflow_bundles table exists count:', res.rows[0].count);
} catch (err) {
  console.error('Migration failed:', err);
} finally {
  await pool.end();
}
