-- 012_team_member_privileges_and_team_resources.sql
-- Adds member_privileges to teams table
-- Adds scope, team_id, and promotion lifecycle columns to database_connections table

-- 1. Add member_privileges JSONB to teams
ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS member_privileges JSONB DEFAULT '{}'::jsonb;

-- 2. Add team-scoping and promotion columns to database_connections
ALTER TABLE database_connections
    ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'global',
    ADD COLUMN IF NOT EXISTS team_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS promotion_status VARCHAR(32) NOT NULL DEFAULT 'NONE',
    ADD COLUMN IF NOT EXISTS promotion_requested_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS promotion_requested_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS promotion_reviewed_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS promotion_reviewed_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS promotion_notes TEXT;

-- 3. Create indexes for efficient team resource querying and admin monitoring
CREATE INDEX IF NOT EXISTS idx_db_connections_scope_team ON database_connections(scope, team_id);
CREATE INDEX IF NOT EXISTS idx_db_connections_promotion_status ON database_connections(promotion_status);

-- 4. Data healing / sync: Ensure all existing connections have scope = 'global' and promotion_status = 'NONE'
UPDATE database_connections
SET scope = 'global'
WHERE scope IS NULL OR scope = '';

UPDATE database_connections
SET promotion_status = 'NONE'
WHERE promotion_status IS NULL OR promotion_status = '';
