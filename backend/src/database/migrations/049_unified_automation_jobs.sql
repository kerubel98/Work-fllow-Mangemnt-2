-- Migration: 049_unified_automation_jobs.sql
-- Description: Establishes persistent unified automation jobs, execution run history, and dead-letter queue (DLQ)
-- Governs: AUD-AUTO-001, AUD-AUTO-005, AUD-AUTO-006

CREATE TABLE IF NOT EXISTS automation_jobs (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  trigger_type VARCHAR(32) NOT NULL DEFAULT 'CRON', -- 'CRON' | 'FTP_POLL' | 'EVENT'
  schedule_cron VARCHAR(64) DEFAULT '0 2 * * *',
  attached_workflow_id VARCHAR(64),
  target_db_id VARCHAR(64),
  is_active BOOLEAN NOT NULL DEFAULT true,
  team_id VARCHAR(64),
  config JSONB DEFAULT '{}'::jsonb,
  last_run_at TIMESTAMPTZ,
  last_run_status VARCHAR(32) DEFAULT 'PENDING', -- 'SUCCESS' | 'FAILED' | 'PENDING' | 'RUNNING'
  last_run_duration_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_jobs_team ON automation_jobs(team_id);
CREATE INDEX IF NOT EXISTS idx_automation_jobs_active_trigger ON automation_jobs(is_active, trigger_type);

CREATE TABLE IF NOT EXISTS automation_runs (
  id VARCHAR(64) PRIMARY KEY,
  job_id VARCHAR(64) NOT NULL REFERENCES automation_jobs(id) ON DELETE CASCADE,
  trigger_source VARCHAR(32) NOT NULL DEFAULT 'MANUAL', -- 'MANUAL' | 'CRON_DAEMON' | 'FTP_DAEMON'
  status VARCHAR(32) NOT NULL DEFAULT 'RUNNING', -- 'RUNNING' | 'SUCCESS' | 'FAILED'
  duration_ms INTEGER DEFAULT 0,
  rows_processed INTEGER DEFAULT 0,
  anomalies_detected INTEGER DEFAULT 0,
  error_message TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_job_id ON automation_runs(job_id, executed_at DESC);

CREATE TABLE IF NOT EXISTS automation_dlq (
  id VARCHAR(64) PRIMARY KEY,
  job_id VARCHAR(64) NOT NULL,
  job_name VARCHAR(255),
  run_id VARCHAR(64),
  error_payload JSONB DEFAULT '{}'::jsonb,
  retry_count INTEGER DEFAULT 0,
  status VARCHAR(32) DEFAULT 'PENDING', -- 'PENDING' | 'REPLAYED' | 'DISCARDED'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_dlq_status ON automation_dlq(status, created_at DESC);

-- Seed initial real baseline automation jobs if table is empty
INSERT INTO automation_jobs (id, name, description, trigger_type, schedule_cron, attached_workflow_id, target_db_id, is_active, team_id, last_run_at, last_run_status, last_run_duration_ms)
VALUES 
  ('auto-cbe-nightly', 'Nightly CBE Settlement Reconciler', 'Triggers every night at 2:00 AM EAT to reconcile CBE core banking transactions with switch settlement logs', 'CRON', '0 2 * * *', 'wf-cbe-settlement', 'cbe_production_db', true, 'default-team', NOW() - INTERVAL '12 hours', 'SUCCESS', 3200),
  ('auto-telebirr-hourly', 'Telebirr Hourly Ingress Scanner', 'Polls incoming Telebirr switch transaction batches every hour to verify ISO status and flag duplicates', 'CRON', '0 * * * *', 'wf-telebirr-validation', 'telebirr_switch_db', true, 'default-team', NOW() - INTERVAL '45 minutes', 'SUCCESS', 1400),
  ('auto-aib-reversal-sync', 'Awash Bank Reversal Sync', 'Detects pending unconfirmed financial requests and executes auto-reversal validation rule checks', 'EVENT', 'On Event / Webhook', 'wf-aib-reversal', 'aib_host_db', false, 'default-team', NOW() - INTERVAL '1 day', 'SUCCESS', 850)
ON CONFLICT (id) DO NOTHING;
