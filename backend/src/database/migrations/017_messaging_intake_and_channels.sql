-- 017_messaging_intake_and_channels.sql
-- Relational persistence for channel identities, canonical incoming messages,
-- attachments, and transactional outbox.

-- 1. Team-level communication identities
CREATE TABLE IF NOT EXISTS team_channel_configurations (
    id VARCHAR(64) PRIMARY KEY,
    team_id VARCHAR(64) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    channel VARCHAR(32) NOT NULL, -- 'email' | 'teams' | 'whatsapp' | 'telegram'
    display_name VARCHAR(128) NOT NULL,
    address VARCHAR(255) NOT NULL, -- team inbox, group id, channel id, bot handle
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    webhook_secret VARCHAR(255),
    permissions JSONB DEFAULT '["read", "reply", "create_task", "escalate"]'::jsonb,
    created_by VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_channel_lookup ON team_channel_configurations(channel, address);
CREATE INDEX IF NOT EXISTS idx_team_channel_team ON team_channel_configurations(team_id);

-- 2. Personal communication identities
CREATE TABLE IF NOT EXISTS personal_channel_configurations (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel VARCHAR(32) NOT NULL, -- 'email' | 'teams' | 'whatsapp' | 'telegram'
    display_name VARCHAR(128) NOT NULL,
    address VARCHAR(255) NOT NULL, -- personal email, teams account, phone number, telegram id
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    notification_mode VARCHAR(32) DEFAULT 'all', -- 'all' | 'critical_only' | 'manual'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_channel_lookup ON personal_channel_configurations(channel, address);
CREATE INDEX IF NOT EXISTS idx_personal_channel_user ON personal_channel_configurations(user_id);

-- 3. Canonical incoming messages log
CREATE TABLE IF NOT EXISTS incoming_messages (
    id VARCHAR(64) PRIMARY KEY,
    channel VARCHAR(32) NOT NULL,
    source_message_id VARCHAR(255) NOT NULL,
    conversation_id VARCHAR(255),
    thread_id VARCHAR(255),
    sender_address VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255),
    sender_type VARCHAR(32) DEFAULT 'person', -- 'person' | 'team' | 'bot' | 'system'
    resolved_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    resolved_team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
    intent VARCHAR(64) DEFAULT 'FOLLOW_UP',
    priority VARCHAR(32) DEFAULT 'normal',
    text_body TEXT,
    html_body TEXT,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(32) DEFAULT 'RECEIVED', -- 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'FAILED'
    dedupe_key VARCHAR(128) UNIQUE NOT NULL,
    linked_issue_id VARCHAR(64) REFERENCES issues(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_incoming_messages_channel_source ON incoming_messages(channel, source_message_id);
CREATE INDEX IF NOT EXISTS idx_incoming_messages_linked_issue ON incoming_messages(linked_issue_id);
CREATE INDEX IF NOT EXISTS idx_incoming_messages_resolved_team ON incoming_messages(resolved_team_id);
CREATE INDEX IF NOT EXISTS idx_incoming_messages_dedupe ON incoming_messages(dedupe_key);

-- 4. Message attachments
CREATE TABLE IF NOT EXISTS message_attachments (
    id VARCHAR(64) PRIMARY KEY,
    message_id VARCHAR(64) NOT NULL REFERENCES incoming_messages(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    size_bytes BIGINT DEFAULT 0,
    storage_path TEXT,
    checksum VARCHAR(64),
    content_type VARCHAR(32) DEFAULT 'document', -- 'document' | 'image' | 'spreadsheet' | 'pdf' | 'audio' | 'other'
    ingestion_status VARCHAR(32) DEFAULT 'NONE', -- 'NONE' | 'INGESTED' | 'PENDING_MAPPING' | 'FAILED'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msg_attachments_msg ON message_attachments(message_id);

-- 5. Outgoing messages transactional outbox
CREATE TABLE IF NOT EXISTS outgoing_messages (
    id VARCHAR(64) PRIMARY KEY,
    channel VARCHAR(32) NOT NULL,
    recipient_address VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    text_body TEXT NOT NULL,
    linked_issue_id VARCHAR(64) REFERENCES issues(id) ON DELETE SET NULL,
    linked_message_id VARCHAR(64) REFERENCES incoming_messages(id) ON DELETE SET NULL,
    status VARCHAR(32) DEFAULT 'PENDING', -- 'PENDING' | 'DISPATCHING' | 'SENT' | 'FAILED'
    retry_count INT DEFAULT 0,
    last_error TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outgoing_messages_status ON outgoing_messages(status);
CREATE INDEX IF NOT EXISTS idx_outgoing_messages_linked_issue ON outgoing_messages(linked_issue_id);
