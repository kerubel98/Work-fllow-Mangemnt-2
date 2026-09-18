-- Migration 008: Task Batch Worker Heartbeats
-- Tracks granular sub-chunk progress pulses from worker execution pipelines
-- Decouples alive/orphan detection from the coarse parent issue entity

CREATE TABLE IF NOT EXISTS task_batch_heartbeats (
  task_id VARCHAR(100) NOT NULL,
  batch_id VARCHAR(100) NOT NULL,
  worker_pid INT NOT NULL,
  last_chunk_index INT NOT NULL DEFAULT 0,
  total_chunks INT NOT NULL DEFAULT 1,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, batch_id)
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_timestamp 
ON task_batch_heartbeats(last_heartbeat_at);
