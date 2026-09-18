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
  console.log('Connected to PG. Running migrations...');
  const migrationsDir = path.resolve('backend/src/database/migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    console.log(`Running migration ${file}...`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await client.query(sql);
    console.log(`Finished ${file}.`);
  }
  console.log('All migrations applied successfully!');
  client.release();
  await pool.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
