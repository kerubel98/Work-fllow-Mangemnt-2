-- Migration 046: FTP Ingested File Name Storage & Ingestion Ledger
-- Persists every ingested remote file per FTP connection to prevent duplicate record insertion across schedules.
-- Links each ingested file to its File Pattern, File Type, and dedicated Staging Table.

CREATE TABLE IF NOT EXISTS ftp_ingested_files (
    id VARCHAR(64) PRIMARY KEY,
    ftp_connection_id VARCHAR(64) NOT NULL REFERENCES database_connections(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    relative_folder VARCHAR(500) NOT NULL DEFAULT '/',
    file_size BIGINT DEFAULT 0,
    file_modified_at TIMESTAMPTZ,
    file_format VARCHAR(32) NOT NULL DEFAULT 'CSV',
    file_pattern VARCHAR(255) NOT NULL,
    staging_config_id VARCHAR(64),
    target_table_name VARCHAR(128) NOT NULL,
    records_staged INT NOT NULL DEFAULT 0,
    ingestion_status VARCHAR(32) NOT NULL DEFAULT 'INGESTED',
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ftp_file_path UNIQUE (ftp_connection_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_ftp_ingested_conn ON ftp_ingested_files(ftp_connection_id);
CREATE INDEX IF NOT EXISTS idx_ftp_ingested_pattern ON ftp_ingested_files(ftp_connection_id, file_pattern);
CREATE INDEX IF NOT EXISTS idx_ftp_ingested_table ON ftp_ingested_files(target_table_name);

