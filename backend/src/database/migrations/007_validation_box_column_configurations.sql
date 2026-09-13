-- =============================================================================
-- Migration 007: Add column_configuration_ids to validation_boxes
-- =============================================================================

ALTER TABLE validation_boxes 
ADD COLUMN IF NOT EXISTS column_configuration_ids JSONB DEFAULT '[]'::jsonb;
