-- Migration 028: Persistent File Ingestion & Column Mapping Templates
-- Enables PostgreSQL relational persistence for reusable file ingestion recipes,
-- header row configurations, headerless column definitions, deleted columns registries,
-- and template-scoped required column integrity enforcements.
-- Governance: Complies with AGENTS.md Rules 1, 4, 11, 17, 19, 20.

CREATE TABLE IF NOT EXISTS file_ingestion_mapping_templates (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    source_type VARCHAR(32) NOT NULL DEFAULT 'csv',
    header_mode VARCHAR(32) NOT NULL DEFAULT 'ROW_INDEX',
    header_row_index INT NOT NULL DEFAULT 1,
    manual_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
    deleted_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    required_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    column_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
    cleaning_recipe JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by VARCHAR(64),
    team_id VARCHAR(64),
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_ingest_tpl_team ON file_ingestion_mapping_templates(team_id);
CREATE INDEX IF NOT EXISTS idx_file_ingest_tpl_name ON file_ingestion_mapping_templates(name);

-- Extend hashtag_presets with optional direct binding to a saved file mapping template
ALTER TABLE hashtag_presets
    ADD COLUMN IF NOT EXISTS mapping_template_id VARCHAR(64);
