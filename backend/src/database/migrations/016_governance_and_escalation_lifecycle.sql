-- 016_governance_and_escalation_lifecycle.sql
-- Hardens formal escalation lifecycle, command auditing, idempotency deduplication,
-- and unified evidence snapshots for Maker-Checker dual authorization.

-- 1. Create escalation_events table
CREATE TABLE IF NOT EXISTS escalation_events (
    id VARCHAR(64) PRIMARY KEY,
    issue_id VARCHAR(64) REFERENCES issues(id) ON DELETE CASCADE,
    team_id VARCHAR(64),
    action_type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'NEW',
    idempotency_key VARCHAR(128) UNIQUE,
    actor_id VARCHAR(64),
    actor_name VARCHAR(128),
    reason TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- 2. Indexes for fast operational querying
CREATE INDEX IF NOT EXISTS idx_escalation_issue_id ON escalation_events(issue_id);
CREATE INDEX IF NOT EXISTS idx_escalation_team_status ON escalation_events(team_id, status);
CREATE INDEX IF NOT EXISTS idx_escalation_idempotency ON escalation_events(idempotency_key);

-- 3. Ensure evidence_snapshot exists on workspace_setting_proposals
ALTER TABLE workspace_setting_proposals
    ADD COLUMN IF NOT EXISTS evidence_snapshot JSONB DEFAULT '{}'::jsonb;

-- 4. Ensure escalation tracking columns exist on issues table
ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS escalated_to_team_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS escalation_reason TEXT,
    ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

