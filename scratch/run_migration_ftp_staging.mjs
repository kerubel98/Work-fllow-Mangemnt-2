import { connectPostgres, queryPg } from 'file:///C:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/config/postgres.js';

async function runMigration() {
  await connectPostgres();
  console.log('Creating ftp_file_staging_configs table in PostgreSQL...');
  await queryPg(`
    CREATE TABLE IF NOT EXISTS ftp_file_staging_configs (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      ftp_connection_id VARCHAR(64) NOT NULL REFERENCES database_connections(id) ON DELETE CASCADE,
      file_name_pattern VARCHAR(255) NOT NULL,
      file_format VARCHAR(32) NOT NULL DEFAULT 'CSV',
      custom_delimiter VARCHAR(10) DEFAULT ',',
      has_header BOOLEAN DEFAULT true,
      header_row_index INT DEFAULT 1,
      data_start_row INT DEFAULT 2,
      skip_footer_lines INT DEFAULT 0,
      quote_char VARCHAR(4) DEFAULT '"',
      encoding VARCHAR(32) DEFAULT 'utf-8',
      date_format VARCHAR(64) DEFAULT 'YYYY-MM-DD',
      field_mappings JSONB DEFAULT '[]'::jsonb,
      staging_table_name VARCHAR(128),
      last_staged_at TIMESTAMPTZ,
      last_staged_status VARCHAR(32) DEFAULT 'IDLE',
      last_staged_count INT DEFAULT 0,
      last_error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ftp_staging_conn ON ftp_file_staging_configs(ftp_connection_id);
  `);
  console.log('✅ Table ftp_file_staging_configs created successfully in PostgreSQL.');
  process.exit(0);
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
