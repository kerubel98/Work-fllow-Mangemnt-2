-- 022_issue_attachments_and_workspace_oauth.sql
-- Add attachments JSONB column to issues table for multi-file pass-through from messaging/staging
ALTER TABLE issues ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Add workspace_oauth_config JSONB column to users table for workspace-level email & ingestion settings
ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace_oauth_config JSONB DEFAULT '{}'::jsonb;
