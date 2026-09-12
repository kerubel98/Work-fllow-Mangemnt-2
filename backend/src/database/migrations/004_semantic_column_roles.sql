-- Migration 004: Semantic Column Roles, Multi-Row Transaction Groups, and Cross-Row Business Rules

ALTER TABLE database_column_configurations
  ADD COLUMN IF NOT EXISTS primary_key_column VARCHAR(255),
  ADD COLUMN IF NOT EXISTS role_column VARCHAR(255),
  ADD COLUMN IF NOT EXISTS semantic_roles JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cross_row_rules JSONB DEFAULT '[]'::jsonb;
