-- Migration 031: Universal Hashtag Binding for Database Validation Workflows
-- Enables attaching universal hashtags (#AIB_SETTLEMENT_2026, etc.) directly to database validation workflows.
-- Complies with AGENTS.md Governance Principle 8 (Universal Hashtag Binding & Traceability) and Principle 23 (Mandatory PostgreSQL First).

ALTER TABLE database_validation_workflows
  ADD COLUMN IF NOT EXISTS hashtags JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_database_validation_workflows_hashtags
  ON database_validation_workflows USING GIN (hashtags);
