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
  const sql = fs.readFileSync('backend/src/database/migrations/016_governance_and_escalation_lifecycle.sql', 'utf-8');
  await pool.query(sql);
  const res = await pool.query('SELECT count(*) FROM escalation_events;');
  console.log('SUCCESS: migration 016 applied, escalation_events row count:', res.rows[0].count);
} catch (err) {
  console.error('Migration failed:', err);
} finally {
  await pool.end();
}
