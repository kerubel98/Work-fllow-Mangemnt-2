-- Migration 019: Operational Asset Sharing, Hands-On Checker Testing & Post-Approval Lock Governance
-- Provides Maker scoping, team/individual sharing, 1-click adoption, and lock control.

-- 1. Scoping, Status, and Locking on validation_boxes
ALTER TABLE validation_boxes 
  ADD COLUMN IF NOT EXISTS maker_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS maker_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approved_by_user_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS approved_by_user_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checker_feedback TEXT,
  ADD COLUMN IF NOT EXISTS shared_source_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_validation_boxes_maker ON validation_boxes(maker_id);
CREATE INDEX IF NOT EXISTS idx_validation_boxes_team_status ON validation_boxes(team_id, status);

-- 2. Scoping, Status, and Locking on database_validation_workflows
ALTER TABLE database_validation_workflows 
  ADD COLUMN IF NOT EXISTS maker_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS maker_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approved_by_user_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS approved_by_user_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checker_feedback TEXT,
  ADD COLUMN IF NOT EXISTS shared_source_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_workflows_maker ON database_validation_workflows(maker_id);
CREATE INDEX IF NOT EXISTS idx_workflows_team_status ON database_validation_workflows(team_id, status);

-- 3. Scoping, Status, and Locking on database_table_mappings
ALTER TABLE database_table_mappings 
  ADD COLUMN IF NOT EXISTS maker_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS maker_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approved_by_user_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS approved_by_user_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checker_feedback TEXT,
  ADD COLUMN IF NOT EXISTS shared_source_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_table_mappings_maker ON database_table_mappings(maker_id);
CREATE INDEX IF NOT EXISTS idx_table_mappings_team_status ON database_table_mappings(team_id, status);

-- 4. Audit Table for Peer-to-Peer & Team Asset Shares
CREATE TABLE IF NOT EXISTS asset_shares (
  id VARCHAR(64) PRIMARY KEY,
  asset_type VARCHAR(32) NOT NULL, -- 'WORKFLOW', 'VALIDATION_BOX', 'DB_CONFIG'
  asset_id VARCHAR(64) NOT NULL,
  sender_id VARCHAR(64) NOT NULL,
  sender_name VARCHAR(255) NOT NULL,
  target_type VARCHAR(32) NOT NULL, -- 'INDIVIDUAL', 'TEAM', 'CHAT_ROOM'
  target_id VARCHAR(64) NOT NULL,   -- recipient_user_id, team_id, or chat_room_id
  target_name VARCHAR(255),
  message TEXT,
  visual_payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_shares_target ON asset_shares(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_asset_shares_sender ON asset_shares(sender_id);
CREATE INDEX IF NOT EXISTS idx_asset_shares_asset ON asset_shares(asset_type, asset_id);
