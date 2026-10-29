-- Migration 040: Support broadcast and system notifications without strict user FK lock
ALTER TABLE notifications ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
