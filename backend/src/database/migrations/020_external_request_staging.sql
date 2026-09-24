-- 020_external_request_staging.sql
-- Dedicated tables for provider connections, fetch job auditing, 
-- staged external customer requests, structured attachment parsing, and triage.

-- 1. Provider Connections (Active fetch configuration for email/teams/whatsapp/telegram)
CREATE TABLE IF NOT EXISTS provider_connections (
    id VARCHAR(64) PRIMARY KEY,
    team_id VARCHAR(64) REFERENCES teams(id) ON DELETE CASCADE,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    channel VARCHAR(32) NOT NULL, -- 'email' | 'teams' | 'whatsapp' | 'telegram'
    display_name VARCHAR(128) NOT NULL,
    status VARCHAR(32) DEFAULT 'ACTIVE', -- 'ACTIVE' | 'PAUSED' | 'ERROR' | 'DISABLED'
    config JSONB DEFAULT '{}'::jsonb,
    last_fetch_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    created_by VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_connections_team ON provider_connections(team_id);
CREATE INDEX IF NOT EXISTS idx_provider_connections_channel ON provider_connections(channel, status);

-- 2. Provider Fetch Jobs Audit Log
CREATE TABLE IF NOT EXISTS provider_fetch_jobs (
    id VARCHAR(64) PRIMARY KEY,
    provider_id VARCHAR(64) NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
    channel VARCHAR(32) NOT NULL,
    status VARCHAR(32) DEFAULT 'RUNNING', -- 'RUNNING' | 'COMPLETED' | 'FAILED'
    messages_found INT DEFAULT 0,
    messages_staged INT DEFAULT 0,
    error_trace TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_provider_fetch_jobs_provider ON provider_fetch_jobs(provider_id);

-- 3. Staged External Customer Requests Queue
CREATE TABLE IF NOT EXISTS staged_messages (
    id VARCHAR(64) PRIMARY KEY,
    channel VARCHAR(32) NOT NULL,
    source_message_id VARCHAR(255) NOT NULL,
    conversation_id VARCHAR(255),
    thread_id VARCHAR(255),
    sender_address VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255),
    team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
    assigned_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    subject VARCHAR(255),
    text_body TEXT,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    dedupe_key VARCHAR(128) UNIQUE NOT NULL,
    status VARCHAR(32) DEFAULT 'NEW', -- 'NEW' | 'STAGED' | 'ATTACHMENT_PENDING' | 'PARSE_FAILED' | 'READY_FOR_TASK_CREATION' | 'REJECTED' | 'APPROVED' | 'CONVERTED_TO_TASK' | 'ESCALATED' | 'FAILED'
    urgency VARCHAR(32) DEFAULT 'normal', -- 'low' | 'normal' | 'high' | 'critical'
    category VARCHAR(64) DEFAULT 'GENERAL_INQUIRY',
    confidence_score NUMERIC(4,2) DEFAULT 1.0,
    parsed_fields JSONB DEFAULT '{}'::jsonb,
    linked_issue_id VARCHAR(64) REFERENCES issues(id) ON DELETE SET NULL,
    created_issue_id VARCHAR(64) REFERENCES issues(id) ON DELETE SET NULL,
    maker_id VARCHAR(64),
    checker_id VARCHAR(64),
    review_notes TEXT,
    sla_due_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staged_messages_status ON staged_messages(status);
CREATE INDEX IF NOT EXISTS idx_staged_messages_team ON staged_messages(team_id);
CREATE INDEX IF NOT EXISTS idx_staged_messages_assigned ON staged_messages(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_staged_messages_dedupe ON staged_messages(dedupe_key);

-- 4. Staged Message Attachments & Parsing Results
CREATE TABLE IF NOT EXISTS staged_message_attachments (
    id VARCHAR(64) PRIMARY KEY,
    staged_message_id VARCHAR(64) NOT NULL REFERENCES staged_messages(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    size_bytes BIGINT DEFAULT 0,
    content_type VARCHAR(32) DEFAULT 'document',
    storage_path TEXT,
    parsed_text TEXT,
    parsed_data JSONB DEFAULT '{}'::jsonb,
    parsing_status VARCHAR(32) DEFAULT 'PENDING', -- 'PENDING' | 'PARSED' | 'FAILED' | 'SKIPPED'
    parsing_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staged_attachments_msg ON staged_message_attachments(staged_message_id);
