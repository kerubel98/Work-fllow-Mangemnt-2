-- Migration 041: Enhanced Notification System & User Notification Preferences
-- Aligned with redesigned_ui/notification specifications

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'unread';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(32) NOT NULL DEFAULT 'normal';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'system';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_label VARCHAR(64);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_type VARCHAR(64);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS secondary_action_label VARCHAR(64);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS snooze_until TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category);

-- Table for User Notification Preferences
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id VARCHAR(64) PRIMARY KEY,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
