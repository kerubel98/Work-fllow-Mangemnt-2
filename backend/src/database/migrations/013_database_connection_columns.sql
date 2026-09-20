-- 013_database_connection_columns.sql
-- Adds allowed_tables, available_tables, last_tested_at, and last_error to database_connections

ALTER TABLE database_connections
    ADD COLUMN IF NOT EXISTS allowed_tables JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS available_tables JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS last_error TEXT;
