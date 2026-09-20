import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'operational_workflow_db',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '123456',
});

async function main() {
  const client = await pool.connect();
  console.log('Connected to PG. Applying migration 015...');
  const sql = fs.readFileSync(path.resolve('backend/src/database/migrations/015_team_delegated_admin_privileges.sql'), 'utf-8');
  await client.query(sql);
  console.log('Migration 015 applied successfully!');
  client.release();
  await pool.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
