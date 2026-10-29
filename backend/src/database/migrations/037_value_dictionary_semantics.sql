-- Migration 037: Value Dictionary Semantics & Persistent Column Links
-- Adds direction, matching and no-match behaviour to value translation dictionaries
-- and persists column -> dictionary links (previously held only in React state).
-- ADDITIVE ONLY: no DROP / DELETE against persistent tables; existing rows keep current
-- behaviour through defaults (FORWARD, trim on, case-insensitive, keep original).
-- Governance: Complies with AGENTS.md Rules 1, 4, 17, 19, 20, 23.

ALTER TABLE value_translation_dictionaries
    ADD COLUMN IF NOT EXISTS group_name VARCHAR(64),
    ADD COLUMN IF NOT EXISTS direction VARCHAR(16) NOT NULL DEFAULT 'FORWARD',
    ADD COLUMN IF NOT EXISTS case_sensitive BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS trim_whitespace BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS no_match_policy VARCHAR(16) NOT NULL DEFAULT 'KEEP_ORIGINAL',
    ADD COLUMN IF NOT EXISTS default_fallback TEXT,
    ADD COLUMN IF NOT EXISTS source_label VARCHAR(64),
    ADD COLUMN IF NOT EXISTS target_label VARCHAR(64);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_value_dict_direction') THEN
    ALTER TABLE value_translation_dictionaries
      ADD CONSTRAINT chk_value_dict_direction CHECK (direction IN ('FORWARD','REVERSE','BOTH'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_value_dict_no_match') THEN
    ALTER TABLE value_translation_dictionaries
      ADD CONSTRAINT chk_value_dict_no_match CHECK (no_match_policy IN ('KEEP_ORIGINAL','BLANK','USE_FALLBACK','FLAG'));
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS value_dictionary_column_links (
    id VARCHAR(64) PRIMARY KEY,
    dictionary_id VARCHAR(64) NOT NULL REFERENCES value_translation_dictionaries(id) ON DELETE CASCADE,
    db_id VARCHAR(100) NOT NULL,
    table_name VARCHAR(150) NOT NULL,
    column_name VARCHAR(150) NOT NULL,
    show_in_grids BOOLEAN NOT NULL DEFAULT true,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_value_dict_column_link UNIQUE (dictionary_id, db_id, table_name, column_name)
);

CREATE INDEX IF NOT EXISTS idx_value_dict_links_dict ON value_dictionary_column_links(dictionary_id);
CREATE INDEX IF NOT EXISTS idx_value_dict_links_col ON value_dictionary_column_links(db_id, table_name, column_name);
