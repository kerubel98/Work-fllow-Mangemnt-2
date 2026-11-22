-- 048_staged_attachment_task_tracking_and_intake_lifecycle.sql
-- Enables permanent per-attachment task tracking, email quick-replies, and triage lifecycle (close/archive)

-- 1. Extend staged_message_attachments with per-attachment task tracking
ALTER TABLE staged_message_attachments 
  ADD COLUMN IF NOT EXISTS created_issue_id VARCHAR(64) REFERENCES issues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS task_created_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_staged_attachments_issue ON staged_message_attachments(created_issue_id);

-- 2. Extend staged_messages with lifecycle audit fields (close / archive)
ALTER TABLE staged_messages
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS close_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_staged_messages_closed ON staged_messages(closed_at);
CREATE INDEX IF NOT EXISTS idx_staged_messages_archived ON staged_messages(archived_at);
