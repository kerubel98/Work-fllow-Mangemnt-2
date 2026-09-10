import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'operational_workflow_db',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '123456'
});

async function run() {
  await pool.query(`
    ALTER TABLE global_standard_directory
      ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'General',
      ADD COLUMN IF NOT EXISTS example_value TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) DEFAULT 'admin',
      ADD COLUMN IF NOT EXISTS is_standard BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `);
  console.log('✅ Altered global_standard_directory in PostgreSQL.');

  const { rows } = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'global_standard_directory';
  `);
  console.log('Columns of global_standard_directory now:', rows.map(r => r.column_name));
  await pool.end();
}

run().catch(console.error);
