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
    ALTER TABLE global_transaction_schema_configs 
      ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255) DEFAULT 'system',
      ADD COLUMN IF NOT EXISTS table_mappings JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS version_history JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS strict_mapping_enforced BOOLEAN DEFAULT true;
  `);
  console.log('✅ Updated global_transaction_schema_configs in PostgreSQL.');
  const { rows } = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'global_transaction_schema_configs';
  `);
  console.log('Columns now:', rows.map(r => r.column_name));
  await pool.end();
}

run().catch(console.error);
