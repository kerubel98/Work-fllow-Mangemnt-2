-- 018_workflow_bundles_and_governance_segregation.sql
-- Introduces composite workflow bundles and segregates operational governance from loose settings

CREATE TABLE IF NOT EXISTS workflow_bundles (
    id VARCHAR(64) PRIMARY KEY,
    bundle_code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    scope VARCHAR(32) NOT NULL DEFAULT 'TEAM', -- 'PERSONAL', 'TEAM', 'GLOBAL_ENTERPRISE'
    workflow_id VARCHAR(64) NOT NULL REFERENCES database_validation_workflows(id) ON DELETE CASCADE,
    validation_box_ids JSONB NOT NULL DEFAULT '[]',
    db_check_ids JSONB NOT NULL DEFAULT '[]',
    source_team_id VARCHAR(64) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'PENDING_CHECKER_REVIEW', 'APPROVED', 'REJECTED'
    maker_id VARCHAR(64) NOT NULL,
    maker_name VARCHAR(255) NOT NULL,
    checker_id VARCHAR(64),
    checker_name VARCHAR(255),
    checker_feedback TEXT,
    evidence_snapshot JSONB DEFAULT '{}',
    hashtag_bindings JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_bundle_status CHECK (
        status IN ('DRAFT', 'PENDING_CHECKER_REVIEW', 'APPROVED', 'REJECTED')
    ),
    CONSTRAINT chk_bundle_scope CHECK (
        scope IN ('PERSONAL', 'TEAM', 'GLOBAL_ENTERPRISE')
    ),
    CONSTRAINT chk_bundle_anti_self_approval CHECK (
        checker_id IS NULL OR maker_id != checker_id
    )
);

CREATE INDEX IF NOT EXISTS idx_workflow_bundles_team ON workflow_bundles(source_team_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_bundles_scope ON workflow_bundles(scope, status);
CREATE INDEX IF NOT EXISTS idx_workflow_bundles_wf ON workflow_bundles(workflow_id);
