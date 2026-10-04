-- =============================================================================
-- Migration 025: Workflow-Level Database Column Configuration Acceptance
-- Adds explicit workflow-level attached_db_config_ids to prevent blind auto-loading
-- of all table column configurations (Anti-Contamination Mandate & Rule 21)
-- =============================================================================

ALTER TABLE database_validation_workflows
    ADD COLUMN IF NOT EXISTS attached_db_config_ids JSONB DEFAULT '[]'::jsonb;
