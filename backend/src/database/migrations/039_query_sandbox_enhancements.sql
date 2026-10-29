-- Migration 039: Query Sandbox Enhancements (Saved Queries & Extended Approvals)

-- 1. Create saved_queries table
CREATE TABLE IF NOT EXISTS saved_queries (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    username VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    db_id VARCHAR(64) NOT NULL,
    db_name VARCHAR(255) NOT NULL,
    table_name VARCHAR(255),
    query TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    is_favorite BOOLEAN DEFAULT FALSE,
    is_shared BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_queries_user_id ON saved_queries (user_id);
CREATE INDEX IF NOT EXISTS idx_saved_queries_db_id ON saved_queries (db_id);
CREATE INDEX IF NOT EXISTS idx_saved_queries_is_favorite ON saved_queries (is_favorite);

-- 2. Add approval_type, duration, reason, expires_at to query_approval_requests
ALTER TABLE query_approval_requests
ADD COLUMN IF NOT EXISTS approval_type VARCHAR(32) DEFAULT 'PERMANENT',
ADD COLUMN IF NOT EXISTS duration VARCHAR(64) DEFAULT 'PERMANENT',
ADD COLUMN IF NOT EXISTS reason TEXT,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
