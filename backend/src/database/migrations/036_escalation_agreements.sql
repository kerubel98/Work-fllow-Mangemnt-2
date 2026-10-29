-- 036_escalation_agreements.sql
-- Inter-Team Escalation Agreements & Bilateral KPI Contracts (Screens 27-32)
-- Enforces PostgreSQL persistence (Governance Rule 23), Maker-Checker roles,
-- digital signatures, live KPI tracking, and immutable audit ledgers.

CREATE TABLE IF NOT EXISTS escalation_agreements (
    id VARCHAR(64) PRIMARY KEY,
    issue_id VARCHAR(64) REFERENCES issues(id) ON DELETE CASCADE,
    escalating_team_id VARCHAR(64) REFERENCES teams(id),
    receiving_team_id VARCHAR(64) REFERENCES teams(id),
    status VARCHAR(32) NOT NULL DEFAULT 'AWAITING_ESCALATING_SIGNATURE',
    -- 'AWAITING_ESCALATING_SIGNATURE' | 'AWAITING_RECEIVING_ACCEPTANCE' | 'ACTIVE' | 'RESOLVED' | 'CLOSED' | 'DECLINED'
    priority VARCHAR(16) NOT NULL DEFAULT 'High',
    reason TEXT NOT NULL,
    workflow_id VARCHAR(64),
    workflow_name VARCHAR(255),
    flagged_count INT DEFAULT 0,
    total_count INT DEFAULT 0,
    raised_by_user_id VARCHAR(64),
    raised_by_username VARCHAR(128),
    escalating_lead_id VARCHAR(64),
    escalating_lead_signature VARCHAR(128),
    escalating_signed_at TIMESTAMP WITH TIME ZONE,
    assigned_checker_id VARCHAR(64),
    assigned_checker_name VARCHAR(128),
    receiving_lead_id VARCHAR(64),
    receiving_lead_signature VARCHAR(128),
    receiving_accepted_at TIMESTAMP WITH TIME ZONE,
    assigned_technician_id VARCHAR(64),
    assigned_technician_name VARCHAR(128),
    kpis JSONB DEFAULT '[]'::jsonb,
    payload_options JSONB DEFAULT '{}'::jsonb,
    ledger JSONB DEFAULT '[]'::jsonb,
    clock_started_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esc_agreements_issue ON escalation_agreements(issue_id);
CREATE INDEX IF NOT EXISTS idx_esc_agreements_teams ON escalation_agreements(escalating_team_id, receiving_team_id);
CREATE INDEX IF NOT EXISTS idx_esc_agreements_status ON escalation_agreements(status);
