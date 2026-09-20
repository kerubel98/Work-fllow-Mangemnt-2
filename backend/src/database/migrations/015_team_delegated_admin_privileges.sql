-- 015_team_delegated_admin_privileges.sql
-- Adds admin_privileges JSONB to teams table to support full or partial delegated administration
-- (e.g. Connection Management & Monitoring for Database Teams, Column Mapping for Operational Teams)

-- 1. Add admin_privileges JSONB column to teams table
ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS admin_privileges JSONB DEFAULT '{}'::jsonb;

-- 2. Create GIN index on admin_privileges for fast capability filtering
CREATE INDEX IF NOT EXISTS idx_teams_admin_privileges ON teams USING gin (admin_privileges);

-- 3. Data healing / sync: Ensure all existing teams have non-null admin_privileges
UPDATE teams
SET admin_privileges = '{}'::jsonb
WHERE admin_privileges IS NULL;
