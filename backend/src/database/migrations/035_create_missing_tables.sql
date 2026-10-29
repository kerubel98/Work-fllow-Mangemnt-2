-- 035_create_missing_tables.sql
-- Creates central_transaction_repository, task_workflow_executions, and updates workspace_table_records schema

-- 1. central_transaction_repository
CREATE TABLE IF NOT EXISTS central_transaction_repository (
    id SERIAL PRIMARY KEY,
    transaction_key VARCHAR(255) UNIQUE NOT NULL,
    task_id VARCHAR(255) NOT NULL,
    original_task_id VARCHAR(255),
    current_task_id VARCHAR(255),
    all_task_ids JSONB DEFAULT '[]'::jsonb,
    batch_id VARCHAR(255),
    row_number INT,
    status VARCHAR(64) DEFAULT 'INGESTED',
    is_duplicate BOOLEAN DEFAULT FALSE,
    duplicate_count INT DEFAULT 0,
    duplicate_status VARCHAR(64) DEFAULT 'ORIGINAL',
    duplicate_from_task_id VARCHAR(255),
    workflow_ids JSONB DEFAULT '[]'::jsonb,
    canonical_data JSONB DEFAULT '{}'::jsonb,
    raw_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ctr_task_id ON central_transaction_repository(task_id);
CREATE INDEX IF NOT EXISTS idx_ctr_batch_id ON central_transaction_repository(batch_id);
CREATE INDEX IF NOT EXISTS idx_ctr_txn_key ON central_transaction_repository(transaction_key);

-- 2. task_workflow_executions
CREATE TABLE IF NOT EXISTS task_workflow_executions (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(255) NOT NULL,
    workflow_id VARCHAR(255) NOT NULL,
    workflow_name VARCHAR(255) DEFAULT 'Workflow',
    status VARCHAR(64) DEFAULT 'COMPLETED',
    total_records INT DEFAULT 0,
    passed_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    duration_ms INT DEFAULT 0,
    execution_summary JSONB DEFAULT '{}'::jsonb,
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    executed_by VARCHAR(255),
    CONSTRAINT uq_task_workflow_exec UNIQUE (task_id, workflow_id)
);

CREATE INDEX IF NOT EXISTS idx_twe_task_id ON task_workflow_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_twe_workflow_id ON task_workflow_executions(workflow_id);

-- 3. workspace_table_records column synchronization
DO $$
BEGIN
    ALTER TABLE workspace_table_records ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
    ALTER TABLE workspace_table_records ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
    ALTER TABLE workspace_table_records ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);
    ALTER TABLE workspace_table_records ADD COLUMN IF NOT EXISTS tag VARCHAR(255);
    ALTER TABLE workspace_table_records ADD COLUMN IF NOT EXISTS task_id VARCHAR(255);
    ALTER TABLE workspace_table_records ADD COLUMN IF NOT EXISTS transformed_data JSONB DEFAULT '{}'::jsonb;
END $$;
