-- Migration 005: Type Groups and Leg Relationships for Column Configurations
-- Supports classifying transactions into Type Groups using one or multiple columns
-- and enforcing type-group-specific leg relationships and grouping rules.

ALTER TABLE database_column_configurations
  ADD COLUMN IF NOT EXISTS type_groups JSONB DEFAULT '[]'::jsonb;

ALTER TABLE database_column_configurations
  ADD COLUMN IF NOT EXISTS type_group_columns JSONB DEFAULT '[]'::jsonb;
