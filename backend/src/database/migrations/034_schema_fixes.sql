-- 034_schema_fixes.sql
-- Fixes VARCHAR(16) overflow for canonical status 'PAUSED_DB_OFFLINE' (17 chars) and expands transaction_id

DO $$
BEGIN
  -- 1. Expand final_result in investigation_transactions
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'investigation_transactions' AND column_name = 'final_result'
  ) THEN
    ALTER TABLE investigation_transactions ALTER COLUMN final_result TYPE VARCHAR(32);
  END IF;

  -- 2. Expand transaction_id in resolution_approval_requests
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'resolution_approval_requests' AND column_name = 'transaction_id'
  ) THEN
    ALTER TABLE resolution_approval_requests ALTER COLUMN transaction_id TYPE VARCHAR(128);
  END IF;
END $$;
