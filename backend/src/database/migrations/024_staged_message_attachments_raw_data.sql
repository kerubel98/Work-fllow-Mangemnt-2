-- 024_staged_message_attachments_raw_data.sql
-- Add raw_base64 and checksum to staged_message_attachments for tabular parsing, previews, and direct browser downloads
ALTER TABLE staged_message_attachments ADD COLUMN IF NOT EXISTS raw_base64 TEXT;
ALTER TABLE staged_message_attachments ADD COLUMN IF NOT EXISTS checksum VARCHAR(64);
