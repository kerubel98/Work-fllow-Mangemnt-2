-- =============================================================================
-- Migration 014: Validation Box Persistence & Workflow Canvas Layout
-- Persists missing reconciliation keys, policies, conditions, reports, and canvas DAG
-- =============================================================================

ALTER TABLE validation_boxes
    ADD COLUMN IF NOT EXISTS match_key_input VARCHAR(128),
    ADD COLUMN IF NOT EXISTS match_key_external VARCHAR(128),
    ADD COLUMN IF NOT EXISTS multi_row_policy VARCHAR(32) DEFAULT 'COMPOSITE_BUNDLE',
    ADD COLUMN IF NOT EXISTS group_config JSONB DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS dual_source_condition JSONB DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS output_columns JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS status_binding JSONB DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS message_template TEXT DEFAULT NULL;

ALTER TABLE database_validation_workflows
    ADD COLUMN IF NOT EXISTS nodes JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS connections JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_vbox_match_keys ON validation_boxes(match_key_input, match_key_external);
