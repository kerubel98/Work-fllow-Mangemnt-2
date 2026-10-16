-- Migration 029: Persistent Value Translation Dictionaries
-- Enables PostgreSQL relational persistence for enterprise value lookup dictionaries
-- (e.g. Bank Name -> Bank Code, Channel Name -> Channel Code, Currencies, Statuses)
-- used during task creation file ingestion and hashtag absorption.
-- Governance: Complies with AGENTS.md Rules 1, 4, 11, 17, 19, 20, 23.

CREATE TABLE IF NOT EXISTS value_translation_dictionaries (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(32) NOT NULL DEFAULT 'CUSTOM',
    mappings JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_system_default BOOLEAN NOT NULL DEFAULT false,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_val_trans_dict_cat ON value_translation_dictionaries(category);
CREATE INDEX IF NOT EXISTS idx_val_trans_dict_name ON value_translation_dictionaries(name);

-- Seed Canonical Default System Translation Dictionaries
INSERT INTO value_translation_dictionaries (id, name, description, category, is_system_default, mappings)
VALUES
(
    'dict-bank-codes',
    'Bank Names to Central Bank BIC/Routing Codes',
    'Translates full bank naming variants (CBE, Dashen, Awash, etc.) into 2-digit central clearing codes.',
    'BANK_CODES',
    true,
    '[
        {"sourceValue": "Commercial Bank of Ethiopia", "targetValue": "01", "notes": "CBE Primary Clearing Code"},
        {"sourceValue": "CBE", "targetValue": "01", "notes": "Abbreviation"},
        {"sourceValue": "Awash Bank", "targetValue": "02", "notes": "Awash International Bank"},
        {"sourceValue": "Dashen Bank", "targetValue": "03", "notes": "Dashen Bank"},
        {"sourceValue": "Bank of Abyssinia", "targetValue": "04", "notes": "BoA"},
        {"sourceValue": "Wegagen Bank", "targetValue": "05", "notes": "Wegagen"},
        {"sourceValue": "United Bank", "targetValue": "06", "notes": "Hibret Bank / United Bank"},
        {"sourceValue": "Hibret Bank", "targetValue": "06", "notes": "Hibret Bank"},
        {"sourceValue": "Nib International Bank", "targetValue": "07", "notes": "Nib"},
        {"sourceValue": "Cooperative Bank of Oromia", "targetValue": "08", "notes": "Coop"},
        {"sourceValue": "Lion International Bank", "targetValue": "09", "notes": "LIB"},
        {"sourceValue": "Zemen Bank", "targetValue": "10", "notes": "Zemen"},
        {"sourceValue": "Oromia International Bank", "targetValue": "11", "notes": "OIB"},
        {"sourceValue": "Bunna International Bank", "targetValue": "12", "notes": "Bunna"},
        {"sourceValue": "Berhan International Bank", "targetValue": "13", "notes": "Berhan"},
        {"sourceValue": "Abay Bank", "targetValue": "14", "notes": "Abay"},
        {"sourceValue": "Addis International Bank", "targetValue": "15", "notes": "AdIB"},
        {"sourceValue": "Enat Bank", "targetValue": "16", "notes": "Enat"},
        {"sourceValue": "Goh Betoch Bank", "targetValue": "17", "notes": "Goh"},
        {"sourceValue": "Sinqee Bank", "targetValue": "18", "notes": "Sinqee"},
        {"sourceValue": "Tsehay Bank", "targetValue": "19", "notes": "Tsehay"},
        {"sourceValue": "Ahadu Bank", "targetValue": "20", "notes": "Ahadu"},
        {"sourceValue": "Amhara Bank", "targetValue": "21", "notes": "Amhara"},
        {"sourceValue": "Siinqee Bank", "targetValue": "18", "notes": "Siinqee Variant"}
    ]'::jsonb
),
(
    'dict-channel-codes',
    'Payment Channel Name to Core System Code',
    'Maps descriptive terminal and interface channels into standardized switch channel codes.',
    'CHANNEL_CODES',
    true,
    '[
        {"sourceValue": "Automated Teller Machine", "targetValue": "ATM", "notes": "ATM Switch"},
        {"sourceValue": "Point of Sale", "targetValue": "POS", "notes": "Merchant POS Terminal"},
        {"sourceValue": "Mobile Banking", "targetValue": "MB", "notes": "Mobile App / USSD"},
        {"sourceValue": "Internet Banking", "targetValue": "IB", "notes": "Web Portal"},
        {"sourceValue": "Agent Banking", "targetValue": "AGT", "notes": "Branchless Agent"},
        {"sourceValue": "Branch Counter", "targetValue": "BRH", "notes": "Over the Counter"},
        {"sourceValue": "E-Commerce Gateway", "targetValue": "ECOM", "notes": "Online Checkout / Cybersource"}
    ]'::jsonb
),
(
    'dict-status-codes',
    'Transaction Status Text to Normalized DB Status',
    'Normalizes heterogeneous statement statuses to canonical pipeline values (SUCCESS, FAILED, PENDING).',
    'STATUS_CODES',
    true,
    '[
        {"sourceValue": "Approved", "targetValue": "SUCCESS", "notes": "Standard approval"},
        {"sourceValue": "Success", "targetValue": "SUCCESS", "notes": "Standard success"},
        {"sourceValue": "Completed", "targetValue": "SUCCESS", "notes": "Settled completion"},
        {"sourceValue": "Declined", "targetValue": "FAILED", "notes": "Switch decline"},
        {"sourceValue": "Failed", "targetValue": "FAILED", "notes": "System failure"},
        {"sourceValue": "Timeout", "targetValue": "FAILED", "notes": "Acquirer timeout"},
        {"sourceValue": "Reversed", "targetValue": "REVERSED", "notes": "Auto-reversal"},
        {"sourceValue": "In Progress", "targetValue": "PENDING", "notes": "In flight"},
        {"sourceValue": "Waiting", "targetValue": "PENDING", "notes": "Queued"}
    ]'::jsonb
),
(
    'dict-currencies',
    'Currency Names and Symbols to ISO-4217 Alpha Codes',
    'Translates informal currency designations to ISO standard 3-letter codes.',
    'CURRENCIES',
    true,
    '[
        {"sourceValue": "Ethiopian Birr", "targetValue": "ETB", "notes": "Domestic Currency"},
        {"sourceValue": "Birr", "targetValue": "ETB", "notes": "Informal"},
        {"sourceValue": "Br", "targetValue": "ETB", "notes": "Symbol"},
        {"sourceValue": "US Dollar", "targetValue": "USD", "notes": "United States Dollar"},
        {"sourceValue": "$", "targetValue": "USD", "notes": "Dollar Symbol"},
        {"sourceValue": "Euro", "targetValue": "EUR", "notes": "European Union Euro"},
        {"sourceValue": "€", "targetValue": "EUR", "notes": "Euro Symbol"},
        {"sourceValue": "British Pound", "targetValue": "GBP", "notes": "Great British Pound"},
        {"sourceValue": "£", "targetValue": "GBP", "notes": "Pound Symbol"}
    ]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
