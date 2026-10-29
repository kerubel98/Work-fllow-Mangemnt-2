-- Migration 038: Technician Solution Flow & Hashtag Remediation Lifecycle
-- Supports screens 38-44: Stage task environment isolation, solution script sandbox diffs,
-- immutable locked process attachments, owner-checker governance, and collected transactions ledger.
-- Governance: Complies with AGENTS.md Rules 1, 3, 7, 8, 11, 16, 17, 20, 23.

-- 1. Extend issues table with Stage Task Environment and Technician Findings
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS staged_environment VARCHAR(32) DEFAULT 'SANDBOX',
  ADD COLUMN IF NOT EXISTS staged_by_user_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS staged_by_user_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS staged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS findings_notes TEXT;

-- 2. Extend hashtag_presets with technician ownership, locked process attachments, and checker gateway
ALTER TABLE hashtag_presets
  ADD COLUMN IF NOT EXISTS owner_user_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS solution_type VARCHAR(32) DEFAULT 'TEMPORARY',
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS change_request_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS locked_process JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS checker_status VARCHAR(32) DEFAULT 'PENDING_APPROVAL',
  ADD COLUMN IF NOT EXISTS checker_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS checker_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS checker_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reporting_team_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS dry_run_results JSONB DEFAULT '{}'::jsonb;

-- 3. Create hashtag_collected_transactions ledger table
CREATE TABLE IF NOT EXISTS hashtag_collected_transactions (
  id              VARCHAR(64) PRIMARY KEY,
  hashtag_tag     VARCHAR(128) NOT NULL REFERENCES hashtag_presets(tag) ON DELETE CASCADE,
  transaction_key VARCHAR(150) NOT NULL,
  issue_id        VARCHAR(100) REFERENCES issues(id) ON DELETE SET NULL,
  status          VARCHAR(32) NOT NULL DEFAULT 'WAITING' CHECK (status IN ('COLLECTED', 'FIXED', 'FAILED', 'WAITING')),
  failure_reason  TEXT,
  before_payload  JSONB DEFAULT '{}'::jsonb,
  after_payload   JSONB DEFAULT '{}'::jsonb,
  collected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at     TIMESTAMPTZ,
  executed_by     VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_hashtag_collected_tag ON hashtag_collected_transactions(hashtag_tag, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_hashtag_collected_status ON hashtag_collected_transactions(status);
CREATE INDEX IF NOT EXISTS idx_hashtag_collected_issue ON hashtag_collected_transactions(issue_id);
