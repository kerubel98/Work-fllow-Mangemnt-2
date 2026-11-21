-- Migration 047: Executable Mapping & Recipe Engine Persistence
-- Links Tasks (issues) and FTP Staging Configs to File Ingestion Mapping Templates.
-- Stores full ordered recipe steps, split/merge/transformation operations, and execution logs.
-- Governance: Complies with AGENTS.md Rules 1, 4, 11, 14, 19, 20, 23.

-- 1. Extend issues table with mapping template binding and recipe snapshot
ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS mapping_template_id VARCHAR(64) REFERENCES file_ingestion_mapping_templates(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS recipe_snapshot JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS recipe_execution_log JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_issues_mapping_template ON issues(mapping_template_id);

-- 2. Extend ftp_file_staging_configs with mapping template binding for automated intake
ALTER TABLE ftp_file_staging_configs
    ADD COLUMN IF NOT EXISTS mapping_template_id VARCHAR(64) REFERENCES file_ingestion_mapping_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ftp_staging_mapping_template ON ftp_file_staging_configs(mapping_template_id);

-- 3. Extend file_ingestion_mapping_templates with rich recipe arrays & versioning
ALTER TABLE file_ingestion_mapping_templates
    ADD COLUMN IF NOT EXISTS ordered_recipe_steps JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS split_operations JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS merge_operations JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS transform_operations JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS cleaning_actions JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
