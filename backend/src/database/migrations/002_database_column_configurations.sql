-- =============================================================================
-- Migration 002: Database Column Configurations & Rules
-- =============================================================================

CREATE TABLE IF NOT EXISTS database_column_configurations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    db_id VARCHAR(64) NOT NULL,
    db_name VARCHAR(255),
    table_name VARCHAR(255) NOT NULL,
    rule_type VARCHAR(64) NOT NULL, -- 'DUPLICATE_CHECK' | 'GROUPING_CHECK' | 'UNIQUE_CONSTRAINT' | 'COMPLETENESS_CHECK' | 'VALUE_RANGE_CHECK' | 'PATTERN_CHECK' | 'CUSTOM_LOGIC'
    description TEXT,
    columns JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of { columnName: string, priority: number, role?: string, matchMode?: string, transform?: string }
    group_by_columns JSONB DEFAULT '[]'::jsonb, -- Array of strings for grouping checks
    aggregation_rules JSONB DEFAULT '[]'::jsonb, -- Array of { function: 'COUNT'|'SUM'|'AVG'|'MIN'|'MAX', column?: string, operator: string, value: any }
    violation_action VARCHAR(32) NOT NULL DEFAULT 'FLAG', -- 'FLAG' | 'STOP' | 'CONTINUE' | 'REPORT'
    severity VARCHAR(32) NOT NULL DEFAULT 'CRITICAL', -- 'CRITICAL' | 'WARNING' | 'INFO'
    violation_message TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by VARCHAR(255) DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_col_cfg_db_tbl ON database_column_configurations(db_id, table_name);
CREATE INDEX IF NOT EXISTS idx_col_cfg_rule_type ON database_column_configurations(rule_type);
