-- Migration 006: Column Value Labeling and Interpretation
-- Supports defining custom business labels and descriptions when a column value equals a constant.
-- Allows classifying and saying something about the row based on column values.

ALTER TABLE database_column_configurations
  ADD COLUMN IF NOT EXISTS value_labels JSONB DEFAULT '[]'::jsonb;

ALTER TABLE database_column_configurations
  ADD COLUMN IF NOT EXISTS unmapped_value_action VARCHAR(50) DEFAULT 'FLAG';
