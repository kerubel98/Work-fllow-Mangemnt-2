-- Migration 030: Persistent System Transformation Rules
-- Relational persistence for enterprise column transformation rules
-- (e.g. Ethiopian Mobile Phone Normalizer, Name Splitter, Currency Stripper, PAN Masker)
-- Governance: Complies with AGENTS.md Rules 1, 4, 11, 17, 19, 20, 23.

CREATE TABLE IF NOT EXISTS system_transformation_rules (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(32) NOT NULL DEFAULT 'Sanitization',
    type VARCHAR(32) NOT NULL DEFAULT 'CASE',
    delimiter VARCHAR(64),
    separator VARCHAR(64),
    pattern TEXT,
    replacement TEXT,
    target_format VARCHAR(64),
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trans_rule_category ON system_transformation_rules(category);
CREATE INDEX IF NOT EXISTS idx_trans_rule_type ON system_transformation_rules(type);

-- Seed Canonical Default Transformation Rules
INSERT INTO system_transformation_rules (id, name, description, category, type, delimiter, separator, pattern, replacement, target_format, is_system)
VALUES
(
    'rule-phone-et',
    'Ethiopian Mobile Phone Normalizer',
    'Normalizes Ethiopian local numbers (09..., 07..., 251...) to standard +251XXXXXXXXX format.',
    'Sanitization',
    'PHONE_ET',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    true
),
(
    'rule-name-split',
    'Full Name to First & Last Splitter',
    'Splits compound full name by whitespace into distinct first and last name columns.',
    'Splitting',
    'SPLIT',
    ' ',
    NULL,
    NULL,
    NULL,
    NULL,
    true
),
(
    'rule-branch-account-merge',
    'Branch Code & Account Number Merger',
    'Concatenates branch prefix and bank account number with hyphen separator.',
    'Merging',
    'MERGE',
    NULL,
    '-',
    NULL,
    NULL,
    NULL,
    true
),
(
    'rule-card-pan-mask',
    '16-Digit Card PAN Masker',
    'Preserves first 4 BIN digits and last 4 card digits, masking the middle 8 digits with asterisks.',
    'Masking',
    'MASK',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    true
),
(
    'rule-iso-date-normalize',
    'ISO Date Normalizer (YYYY-MM-DD)',
    'Converts legacy DD/MM/YYYY and MM/DD/YYYY dates to standard ISO-8601 YYYY-MM-DD format.',
    'Date',
    'DATE_FORMAT',
    NULL,
    NULL,
    NULL,
    NULL,
    'YYYY-MM-DD',
    true
),
(
    'rule-iso-decline-uppercase',
    'ISO Decline Code Uppercase Standardizer',
    'Standardizes network decline reasons and response codes to uppercase canonical format.',
    'Sanitization',
    'CASE',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    true
),
(
    'rule-currency-cleaner',
    'Currency Symbol & Comma Stripper',
    'Removes $, ETB, EUR symbols, commas, and whitespace, yielding a clean decimal number.',
    'Sanitization',
    'STRIP_CURRENCY',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    true
),
(
    'rule-trim-whitespace',
    'Whitespace Cleaner & Compactor',
    'Trims leading/trailing whitespace and compresses consecutive internal spaces.',
    'Sanitization',
    'TRIM',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    true
)
ON CONFLICT (id) DO NOTHING;
