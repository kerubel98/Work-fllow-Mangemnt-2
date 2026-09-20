-- 011_team_database_access_and_membership.sql
-- Adds allowed_db_ids and allowed_query_types to teams table
-- Enforces permanent team membership governance and indexes

-- 1. Add database and query type access controls to teams
ALTER TABLE teams
    ADD COLUMN IF NOT EXISTS allowed_db_ids JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS allowed_query_types JSONB DEFAULT '["SELECT"]'::jsonb;

-- 2. Ensure users table has foreign key index for permanent_team_id
CREATE INDEX IF NOT EXISTS idx_users_permanent_team ON users(permanent_team_id);
CREATE INDEX IF NOT EXISTS idx_teams_team_type ON teams(team_type);

-- 3. Data healing / sync: Populate existing permanent teams with safe default '["SELECT"]' if null
UPDATE teams
SET allowed_query_types = '["SELECT"]'::jsonb
WHERE allowed_query_types IS NULL;

UPDATE teams
SET allowed_db_ids = '[]'::jsonb
WHERE allowed_db_ids IS NULL;

-- 4. Data healing / sync: Synchronize users.permanent_team_id from teams where team_type = 'permanent'
-- For managers of permanent teams:
UPDATE users u
SET permanent_team_id = t.id
FROM teams t
WHERE t.team_type = 'permanent'
  AND t.manager_id = u.id
  AND (u.permanent_team_id IS NULL OR u.permanent_team_id = '');

-- For members of permanent teams:
UPDATE users u
SET permanent_team_id = t.id
FROM teams t
WHERE t.team_type = 'permanent'
  AND t.member_ids::jsonb @> to_jsonb(u.id::text)
  AND (u.permanent_team_id IS NULL OR u.permanent_team_id = '');
