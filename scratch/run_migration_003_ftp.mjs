import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'operational_workflow_db',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '123456'
});

async function runMigration() {
  console.log('Running migration 003_ftp_advanced_staging on operational_workflow_db...');
  await pool.query(`
    ALTER TABLE ftp_file_staging_configs
      ADD COLUMN IF NOT EXISTS excel_sheet_name VARCHAR(128),
      ADD COLUMN IF NOT EXISTS header_row_count INT DEFAULT 1,
      ADD COLUMN IF NOT EXISTS handle_merged_cells BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS merged_header_separator VARCHAR(10) DEFAULT '_',
      ADD COLUMN IF NOT EXISTS folder_traversal_mode VARCHAR(32) DEFAULT 'SINGLE_FILE',
      ADD COLUMN IF NOT EXISTS source_directory_path VARCHAR(255),
      ADD COLUMN IF NOT EXISTS selected_important_columns JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS xml_root_element VARCHAR(128),
      ADD COLUMN IF NOT EXISTS xml_record_element VARCHAR(128);
  `);

  const colsRes = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'ftp_file_staging_configs'
    ORDER BY ordinal_position;
  `);

  console.log('Columns in ftp_file_staging_configs:');
  console.table(colsRes.rows);
  await pool.end();
  console.log('Migration 003 completed successfully!');
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
