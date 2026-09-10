-- Migration 003: Advanced FTP Parsing, Multi-Row Headers, Important Columns, and Multi-Folder Looping Traversal

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
