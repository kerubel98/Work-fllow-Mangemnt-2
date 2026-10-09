-- Migration 027: Add dedicated returned_data JSONB column for multi-leg external mirror records
ALTER TABLE task_dataset_transactions 
ADD COLUMN IF NOT EXISTS returned_data JSONB DEFAULT '{}'::jsonb;

-- Indexing for high-speed multi-leg querying and workflow-namespaced lookups
CREATE INDEX IF NOT EXISTS idx_tdt_returned_data_gin 
ON task_dataset_transactions USING gin (returned_data);

-- Add status_behavior to database_column_configurations
ALTER TABLE database_column_configurations
ADD COLUMN IF NOT EXISTS status_behavior VARCHAR(32) DEFAULT 'MUTATE_STATUS';

ALTER TABLE database_column_configurations
ADD COLUMN IF NOT EXISTS affects_reconciliation_status BOOLEAN DEFAULT true;

COMMENT ON COLUMN task_dataset_transactions.returned_data IS 
'Stores full external mirror records namespaced by [workflowId][targetTable] for multi-leg reconciliation and downstream validation.';
