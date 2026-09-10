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
    CREATE TABLE IF NOT EXISTS database_table_mappings (
        id VARCHAR(128) PRIMARY KEY,
        db_id VARCHAR(64) NOT NULL,
        db_name VARCHAR(255),
        table_name VARCHAR(255) NOT NULL,
        columns JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_custom BOOLEAN DEFAULT false,
        updated_by VARCHAR(255) DEFAULT 'admin',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_db_table_mappings_db_tbl ON database_table_mappings(db_id, table_name);
  `);
  console.log('✅ Created database_table_mappings in PostgreSQL.');

  const { rows } = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'database_table_mappings';
  `);
  console.log('Columns of database_table_mappings:', rows.map(r => `${r.column_name} (${r.data_type})`));
  await pool.end();
}

run().catch(console.error);
