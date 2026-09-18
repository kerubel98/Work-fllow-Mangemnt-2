-- 010_team_governance_and_setting_proposals.sql
-- Adds team scoping to workflows, boxes, and tasks, plus workspace setting approval proposals

-- 1. Scoping Database Validation Workflows to Teams
ALTER TABLE database_validation_workflows
    ADD COLUMN IF NOT EXISTS team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS visibility VARCHAR(32) NOT NULL DEFAULT 'team';

CREATE INDEX IF NOT EXISTS idx_workflows_team ON database_validation_workflows(team_id);
CREATE INDEX IF NOT EXISTS idx_workflows_visibility ON database_validation_workflows(visibility);

-- 2. Scoping Validation Boxes to Teams
ALTER TABLE validation_boxes
    ADD COLUMN IF NOT EXISTS team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS visibility VARCHAR(32) NOT NULL DEFAULT 'team';

CREATE INDEX IF NOT EXISTS idx_vbox_team ON validation_boxes(team_id);

-- 3. Scoping Team Tasks Visibility in Permanent Units
ALTER TABLE team_tasks
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS visibility VARCHAR(32) NOT NULL DEFAULT 'team',
    ADD COLUMN IF NOT EXISTS escalated_to_team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS escalation_reason TEXT,
    ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_visibility ON team_tasks(team_id, is_public);
CREATE INDEX IF NOT EXISTS idx_tasks_escalated_team ON team_tasks(escalated_to_team_id);

-- 4. Workspace Setting Change Proposals Table (Maker-Checker & Escalation)
CREATE TABLE IF NOT EXISTS workspace_setting_proposals (
    id VARCHAR(64) PRIMARY KEY,
    setting_type VARCHAR(64) NOT NULL, -- 'WORKSPACE_CONFIG', 'TABLE_MAPPING', 'COLUMN_CONFIG', 'VALIDATION_BOX', 'WORKFLOW'
    setting_key VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    proposed_changes JSONB NOT NULL,
    current_snapshot JSONB,
    justification TEXT NOT NULL,
    maker_id VARCHAR(64) NOT NULL,
    maker_name VARCHAR(255) NOT NULL,
    team_id VARCHAR(64) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    status VARCHAR(64) NOT NULL DEFAULT 'PENDING_TEAM_APPROVAL', -- 'PENDING_TEAM_APPROVAL', 'ESCALATED_TO_TARGET_TEAM', 'APPROVED', 'REJECTED'
    checker_id VARCHAR(64),
    checker_name VARCHAR(255),
    checker_feedback TEXT,
    escalated_team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
    escalation_reason TEXT,
    escalated_by_id VARCHAR(64),
    escalated_by_name VARCHAR(255),
    escalated_at TIMESTAMPTZ,
    applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_setting_proposal_status CHECK (
        status IN ('PENDING_TEAM_APPROVAL', 'ESCALATED_TO_TARGET_TEAM', 'APPROVED', 'REJECTED')
    )
);

CREATE INDEX IF NOT EXISTS idx_setting_prop_team ON workspace_setting_proposals(team_id);
CREATE INDEX IF NOT EXISTS idx_setting_prop_status ON workspace_setting_proposals(status);
CREATE INDEX IF NOT EXISTS idx_setting_prop_escalated ON workspace_setting_proposals(escalated_team_id);
