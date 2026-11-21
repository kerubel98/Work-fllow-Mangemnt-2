-- Migration 038: Value Dictionary Data Transformation Rules
-- Adds pre-lookup and post-lookup transformation rules and multi-rule chains to value translation dictionaries
-- Enables dictionaries to automatically normalize or sanitize inputs (e.g. UPPERCASE, TRIM, STRIP_CURRENCY, PHONE_ET, DATE_ISO)
-- before performing dictionary lookup, and post-transform output targets (e.g. UPPERCASE, MASK_PAN).
-- Governance: Complies with AGENTS.md Rules 1, 4, 17, 19, 20, 23.

ALTER TABLE value_translation_dictionaries
    ADD COLUMN IF NOT EXISTS pre_transform_rule VARCHAR(64),
    ADD COLUMN IF NOT EXISTS post_transform_rule VARCHAR(64),
    ADD COLUMN IF NOT EXISTS transformation_rules JSONB DEFAULT '[]'::jsonb;
