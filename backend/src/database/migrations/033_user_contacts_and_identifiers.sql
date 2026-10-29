-- 033_user_contacts_and_identifiers.sql
-- Enables persistent user contacts and multi-channel identifier mapping for messaging triage.

CREATE TABLE IF NOT EXISTS user_contacts (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    organization VARCHAR(128),
    role_or_title VARCHAR(128),
    primary_email VARCHAR(255),
    primary_phone VARCHAR(64),
    avatar_url TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_identifiers (
    id VARCHAR(64) PRIMARY KEY,
    contact_id VARCHAR(64) NOT NULL REFERENCES user_contacts(id) ON DELETE CASCADE,
    channel VARCHAR(32) NOT NULL, -- 'email' | 'teams' | 'whatsapp' | 'telegram' | 'other'
    identifier_value VARCHAR(255) NOT NULL,
    label VARCHAR(64),
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_identifiers_lookup ON contact_identifiers(channel, identifier_value);
CREATE INDEX IF NOT EXISTS idx_contact_identifiers_contact ON contact_identifiers(contact_id);
CREATE INDEX IF NOT EXISTS idx_user_contacts_user ON user_contacts(user_id);
