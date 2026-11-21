-- Migration 045: Team Database Scope Isolation & Secret Protection
-- Fixes orphan team-scoped rows that have no team_id
UPDATE database_connections 
SET scope = 'global' 
WHERE team_id IS NULL AND scope = 'team';

-- Enforce Rule 19: team scope requires team_id IS NOT NULL
ALTER TABLE database_connections DROP CONSTRAINT IF EXISTS chk_db_connection_scope_team;
ALTER TABLE database_connections ADD CONSTRAINT chk_db_connection_scope_team
CHECK (
  (scope = 'team' AND team_id IS NOT NULL) OR
  (scope = 'global')
);
