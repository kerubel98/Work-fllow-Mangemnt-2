-- Migration 026: Universal Hashtag Automation Engine
-- Extends hashtag_presets with source-agnostic type classification (A/B/C/D),
-- adds hashtag_execution_runs ledger, and creates a safe dedicated-staging-table helper.
-- Governance: Complies with AGENTS.md Rules 1, 8, 9, 10, 11, 12, 14, 17.

-- ============================================================
-- 1. Extend hashtag_presets with Universal Hashtag Engine fields
-- ============================================================

ALTER TABLE hashtag_presets
  -- Taxonomy: Type A / B / C / D
  ADD COLUMN IF NOT EXISTS hashtag_type VARCHAR(50) NOT NULL DEFAULT 'FILE_INGESTION',
  -- Determines whether the hashtag requires file input, direct DB access, or both
  ADD COLUMN IF NOT EXISTS data_source_mode VARCHAR(50) NOT NULL DEFAULT 'FILE_UPLOAD',
  -- For Type B / C / D: target external or mirror DB connection
  ADD COLUMN IF NOT EXISTS target_db_id VARCHAR(100),
  -- For Type B / C: specific table name in target DB
  ADD COLUMN IF NOT EXISTS target_table_name VARCHAR(150),
  -- For Type C ETL: internal dedicated staging table (hashtag_stage_<tag>)
  ADD COLUMN IF NOT EXISTS dedicated_app_table VARCHAR(150),
  -- For Type A: minimum required file columns for ingestion integrity check
  ADD COLUMN IF NOT EXISTS minimum_required_columns JSONB DEFAULT '[]'::jsonb,
  -- Dictionary lookup mappings: e.g. {"bank_code": {"sourceCol":"bank_code","targetCol":"bank_name","lookupTable":"bank_directory"}}
  ADD COLUMN IF NOT EXISTS dictionary_lookup_mappings JSONB DEFAULT '{}'::jsonb,
  -- How the hashtag is triggered: manually, on a cron schedule, or via chat directive
  ADD COLUMN IF NOT EXISTS execution_trigger VARCHAR(50) DEFAULT 'MANUAL',
  -- Optional 5-field cron expression for autonomous scheduled execution
  ADD COLUMN IF NOT EXISTS schedule_cron VARCHAR(100),
  -- Conditional action rules based on workflow verdict: onPass / onFail
  ADD COLUMN IF NOT EXISTS conditional_action JSONB DEFAULT '{"onPass":"EXECUTE_SQL","onFail":"FLAG_INVESTIGATION"}'::jsonb;

-- Add CHECK constraints for enum-like fields (graceful; skipped if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_hashtag_type'
  ) THEN
    ALTER TABLE hashtag_presets
      ADD CONSTRAINT chk_hashtag_type CHECK (
        hashtag_type IN ('FILE_INGESTION','DATABASE_DIRECT_SCANNER','EXTRACTION_STAGING','AUDITING_GOVERNANCE')
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_hashtag_data_source_mode'
  ) THEN
    ALTER TABLE hashtag_presets
      ADD CONSTRAINT chk_hashtag_data_source_mode CHECK (
        data_source_mode IN ('FILE_UPLOAD','DATABASE_DIRECT','HYBRID')
      );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_hashtag_execution_trigger'
  ) THEN
    ALTER TABLE hashtag_presets
      ADD CONSTRAINT chk_hashtag_execution_trigger CHECK (
        execution_trigger IN ('MANUAL','SCHEDULED_CRON','CHAT_DIRECTIVE')
      );
  END IF;
END$$;

-- ============================================================
-- 2. Create hashtag_execution_runs ledger table
-- ============================================================

CREATE TABLE IF NOT EXISTS hashtag_execution_runs (
  id               VARCHAR(64)  PRIMARY KEY,
  hashtag_tag      VARCHAR(128) NOT NULL REFERENCES hashtag_presets(tag) ON DELETE CASCADE,
  task_id          VARCHAR(100) REFERENCES issues(id) ON DELETE SET NULL,
  team_id          VARCHAR(64)  REFERENCES teams(id) ON DELETE SET NULL,
  executed_by      VARCHAR(100) NOT NULL,
  -- 'DRY_RUN_PARTIAL' | 'LIVE_FULL'
  execution_mode   VARCHAR(32)  NOT NULL CHECK (execution_mode IN ('DRY_RUN_PARTIAL','LIVE_FULL')),
  rows_scanned     INT          NOT NULL DEFAULT 0,
  anomalies_detected INT        NOT NULL DEFAULT 0,
  -- 'PASS' | 'FAIL' | 'DISCREPANCY' | 'STAGED' | 'ERROR'
  verdict          VARCHAR(32)  NOT NULL CHECK (verdict IN ('PASS','FAIL','DISCREPANCY','STAGED','ERROR')),
  -- Maker proposal ID if the run staged a resolution
  maker_proposal_id VARCHAR(100),
  -- Full result snapshot (anomaly rows, diff, lookup mismatches)
  result_snapshot  JSONB        DEFAULT '{}'::jsonb,
  -- Diagnostic taint flag: run is observational only, no mutations
  is_diagnostic_only BOOLEAN    NOT NULL DEFAULT FALSE,
  executed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes for common access patterns
CREATE INDEX IF NOT EXISTS idx_hashtag_runs_tag        ON hashtag_execution_runs(hashtag_tag, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_hashtag_runs_team       ON hashtag_execution_runs(team_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_hashtag_runs_task       ON hashtag_execution_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_hashtag_runs_executor   ON hashtag_execution_runs(executed_by, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_hashtag_runs_verdict    ON hashtag_execution_runs(verdict, executed_at DESC);

-- ============================================================
-- 3. Bank directory lookup table (for bank_code -> bank_name resolution)
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_directory (
  id            VARCHAR(64)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  bank_code     VARCHAR(20)  NOT NULL UNIQUE,
  bank_name     VARCHAR(255) NOT NULL,
  swift_code    VARCHAR(20),
  country_code  VARCHAR(3)   DEFAULT 'ET',
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_directory_code ON bank_directory(bank_code);

-- Seed Ethiopian bank directory (upsert-safe)
INSERT INTO bank_directory (id, bank_code, bank_name, swift_code, country_code) VALUES
  (gen_random_uuid()::VARCHAR, '001', 'Commercial Bank of Ethiopia',         'CBETETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '002', 'Awash International Bank',            'AWSHETHIAXXX', 'ET'),
  (gen_random_uuid()::VARCHAR, '003', 'Dashen Bank',                         'DASHETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '004', 'Bank of Abyssinia',                   'ABYSETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '005', 'Wegagen Bank',                        'WEGAETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '006', 'United Bank',                         'UNBKETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '007', 'Nib International Bank',              'NIBIETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '008', 'Cooperative Bank of Oromia',          'CBORETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '009', 'Lion International Bank',             'LIBIETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '010', 'Oromia International Bank',           'ORINETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '011', 'Zemen Bank',                          'ZEMNETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '012', 'Berhan Bank',                         'BRHNETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '013', 'Addis International Bank',            'ADIBETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '014', 'Debub Global Bank',                   'DGBLETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '015', 'Enat Bank',                           'ENTAETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '016', 'Hijra Bank',                          'HJRAETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '017', 'Tsedey Bank',                         'TSEDYETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '018', 'Ahadu Bank',                          'AHADETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '019', 'Goh Betoch Bank',                     'GOHBETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '020', 'Siinqee Bank',                        'SIINQETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '021', 'ZamZam Bank',                         'ZAMZETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, '901', 'National Bank of Ethiopia (Central)', 'NBEEETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, 'AWB', 'Awash International Bank',            'AWSHETHIAXXX', 'ET'),
  (gen_random_uuid()::VARCHAR, 'CBE', 'Commercial Bank of Ethiopia',         'CBETETAA', 'ET'),
  (gen_random_uuid()::VARCHAR, 'DBE', 'Dashen Bank',                         'DASHETAA', 'ET')
ON CONFLICT (bank_code) DO NOTHING;

-- ============================================================
-- 4. Generic lookup directories table (supports any code→name mapping)
-- ============================================================

CREATE TABLE IF NOT EXISTS lookup_directories (
  id            VARCHAR(64)  PRIMARY KEY DEFAULT gen_random_uuid()::VARCHAR,
  directory_name VARCHAR(100) NOT NULL,          -- e.g. 'bank_directory', 'iso_currency_codes'
  source_column  VARCHAR(100) NOT NULL,          -- e.g. 'bank_code'
  source_value   VARCHAR(255) NOT NULL,          -- e.g. '001'
  target_column  VARCHAR(100) NOT NULL,          -- e.g. 'bank_name'
  target_value   VARCHAR(500) NOT NULL,          -- e.g. 'Commercial Bank of Ethiopia'
  metadata       JSONB        DEFAULT '{}'::jsonb,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (directory_name, source_column, source_value)
);

CREATE INDEX IF NOT EXISTS idx_lookup_dir_name  ON lookup_directories(directory_name, source_column, source_value);
CREATE INDEX IF NOT EXISTS idx_lookup_dir_active ON lookup_directories(directory_name, is_active);

-- Back-fill bank_directory entries into the generic lookup table as well
INSERT INTO lookup_directories (directory_name, source_column, source_value, target_column, target_value)
SELECT 'bank_directory', 'bank_code', bank_code, 'bank_name', bank_name
FROM bank_directory
ON CONFLICT (directory_name, source_column, source_value) DO NOTHING;
