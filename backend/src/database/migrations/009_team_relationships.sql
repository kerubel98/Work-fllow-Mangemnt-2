-- 009_team_relationships.sql
-- Relational table for storing inter-team organizational and operational relationships

CREATE TABLE IF NOT EXISTS team_relationships (
    id VARCHAR(64) PRIMARY KEY,
    source_team_id VARCHAR(64) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    target_team_id VARCHAR(64) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    relationship_type VARCHAR(64) NOT NULL,
    description TEXT,
    created_by VARCHAR(64) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_team_relationship UNIQUE (source_team_id, target_team_id, relationship_type),
    CONSTRAINT chk_no_self_relationship CHECK (source_team_id <> target_team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_rel_source ON team_relationships(source_team_id);
CREATE INDEX IF NOT EXISTS idx_team_rel_target ON team_relationships(target_team_id);
CREATE INDEX IF NOT EXISTS idx_team_rel_type ON team_relationships(relationship_type);
