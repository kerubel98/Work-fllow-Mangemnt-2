-- Migration 002: Hashtag Governance, Workflow Binding, Cautious Staging, and Point-in-Time Reversion

-- 1. Extend issues table with process_type, workflow_id, and initial_snapshot
ALTER TABLE issues ADD COLUMN IF NOT EXISTS process_type VARCHAR(50) DEFAULT 'INTERNAL_STAGED_FIX';
ALTER TABLE issues ADD COLUMN IF NOT EXISTS workflow_id VARCHAR(100);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS accepted_script_proposal_id VARCHAR(100);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS initial_snapshot JSONB;

-- 2. Extend hashtag_presets table with workflow binding, process_type, and KPIs
ALTER TABLE hashtag_presets ADD COLUMN IF NOT EXISTS workflow_id VARCHAR(100);
ALTER TABLE hashtag_presets ADD COLUMN IF NOT EXISTS workflow_name VARCHAR(255);
ALTER TABLE hashtag_presets ADD COLUMN IF NOT EXISTS process_type VARCHAR(50) DEFAULT 'INTERNAL_STAGED_FIX';
ALTER TABLE hashtag_presets ADD COLUMN IF NOT EXISTS kpis JSONB DEFAULT '[]'::jsonb;

-- 3. Create table for transaction reversion snapshots (supports whole task_id or specific transaction_id rollback)
CREATE TABLE IF NOT EXISTS transaction_reversion_snapshots (
  id VARCHAR(100) PRIMARY KEY,
  task_id VARCHAR(100) NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  transaction_id VARCHAR(150),
  process_type VARCHAR(50) NOT NULL DEFAULT 'INTERNAL_STAGED_FIX',
  before_state JSONB NOT NULL,
  after_state JSONB,
  reason TEXT,
  created_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reverted_at TIMESTAMPTZ,
  reverted_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_reversion_snapshots_task ON transaction_reversion_snapshots(task_id);
CREATE INDEX IF NOT EXISTS idx_reversion_snapshots_tx ON transaction_reversion_snapshots(task_id, transaction_id);
