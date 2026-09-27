-- =============================================================================
-- Migration 021: Column Configuration Filter Conditions for Duplicate Check
-- =============================================================================

ALTER TABLE database_column_configurations 
ADD COLUMN IF NOT EXISTS filter_conditions JSONB DEFAULT '[]'::jsonb;
