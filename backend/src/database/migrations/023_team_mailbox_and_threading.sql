-- 023_team_mailbox_and_threading.sql
-- Add team_id and conversation_id to outgoing_messages for team-scoped outbox and thread collation
ALTER TABLE outgoing_messages ADD COLUMN IF NOT EXISTS team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE outgoing_messages ADD COLUMN IF NOT EXISTS conversation_id VARCHAR(255);
ALTER TABLE outgoing_messages ADD COLUMN IF NOT EXISTS sender_address VARCHAR(255);

-- Add parsed_data and raw_base64 to message_attachments for instant preview, promotion and download
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS parsed_data JSONB;
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS raw_base64 TEXT;

CREATE INDEX IF NOT EXISTS idx_outgoing_messages_team ON outgoing_messages(team_id);
CREATE INDEX IF NOT EXISTS idx_outgoing_messages_conversation ON outgoing_messages(conversation_id);
