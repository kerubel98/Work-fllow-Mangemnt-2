-- Migration 050: Sandbox Simulation Runs Persistence (AUD-SBX-002)

CREATE TABLE IF NOT EXISTS sandbox_simulation_runs (
    id VARCHAR(64) PRIMARY KEY,
    workflow_id VARCHAR(64) NOT NULL,
    executed_by VARCHAR(255) NOT NULL,
    total_records INT NOT NULL DEFAULT 0,
    passed_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    duration_ms INT NOT NULL DEFAULT 0,
    is_diagnostic_only BOOLEAN NOT NULL DEFAULT TRUE,
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sandbox_runs_workflow_id ON sandbox_simulation_runs (workflow_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_runs_executed_at ON sandbox_simulation_runs (executed_at DESC);
