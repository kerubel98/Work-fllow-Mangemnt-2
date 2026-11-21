-- Migration 044: Harmonize Task Identity & Investigation Tasks
-- Ensure index on investigation_tasks(issue_id) and link any matching issues
CREATE INDEX IF NOT EXISTS idx_inv_tasks_issue_id ON investigation_tasks(issue_id);

-- Backfill issue_id where investigation_tasks.id matches an issues.id
UPDATE investigation_tasks
SET issue_id = id
WHERE issue_id IS NULL AND id IN (SELECT id FROM issues);

