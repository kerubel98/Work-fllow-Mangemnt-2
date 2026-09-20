-- =============================================================================
-- Migration 001: Operational Workflow Manager Complete PostgreSQL Schema
-- =============================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settings JSONB DEFAULT '{}'::jsonb
);

-- 2. Users
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'operational',
    is_approved BOOLEAN NOT NULL DEFAULT true,
    can_execute_select BOOLEAN DEFAULT true,
    can_execute_update BOOLEAN DEFAULT false,
    allowed_db_ids JSONB DEFAULT '[]'::jsonb,
    permanent_team_id VARCHAR(64),
    share_workspace_with_team BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Teams
CREATE TABLE IF NOT EXISTS teams (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    team_type VARCHAR(32) DEFAULT 'permanent',
    manager_id VARCHAR(64) NOT NULL,
    manager_name VARCHAR(255) NOT NULL,
    member_ids JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Team Tasks
CREATE TABLE IF NOT EXISTS team_tasks (
    id VARCHAR(64) PRIMARY KEY,
    team_id VARCHAR(64) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assignee_id VARCHAR(64) NOT NULL,
    assignee_name VARCHAR(255) NOT NULL,
    creator_id VARCHAR(64) NOT NULL,
    creator_name VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'To Do',
    priority VARCHAR(32) NOT NULL DEFAULT 'Medium',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    due_date TIMESTAMPTZ,
    start_date TIMESTAMPTZ,
    milestone VARCHAR(255)
);

-- 5. Team Insights
CREATE TABLE IF NOT EXISTS team_insights (
    id VARCHAR(64) PRIMARY KEY,
    team_id VARCHAR(64) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    author_id VARCHAR(64) NOT NULL,
    author_name VARCHAR(255) NOT NULL,
    author_role VARCHAR(32) NOT NULL,
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Team Discussion Messages
CREATE TABLE IF NOT EXISTS team_discussion_messages (
    id VARCHAR(64) PRIMARY KEY,
    team_id VARCHAR(64) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    sender_id VARCHAR(64) NOT NULL,
    sender_name VARCHAR(255) NOT NULL,
    sender_role VARCHAR(32) NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_read BOOLEAN NOT NULL DEFAULT false,
    link_tab VARCHAR(64),
    target_team_id VARCHAR(64),
    target_task_id VARCHAR(64),
    target_issue_id VARCHAR(64),
    target_direct_user_id VARCHAR(64),
    target_sub_tab VARCHAR(64),
    actor_name VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);

-- 8. Direct Messages
CREATE TABLE IF NOT EXISTS direct_messages (
    id VARCHAR(64) PRIMARY KEY,
    sender_id VARCHAR(64) NOT NULL,
    sender_name VARCHAR(255) NOT NULL,
    sender_role VARCHAR(32) NOT NULL,
    receiver_id VARCHAR(64) NOT NULL,
    receiver_name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_read BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation ON direct_messages(sender_id, receiver_id);

-- 9. Plugins
CREATE TABLE IF NOT EXISTS plugins (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT false,
    category VARCHAR(64) NOT NULL,
    config JSONB DEFAULT '{}'::jsonb
);

-- 10. Database Connections
CREATE TABLE IF NOT EXISTS database_connections (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(32) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port INT,
    connection_string TEXT,
    database_name VARCHAR(255),
    username VARCHAR(255),
    password VARCHAR(255),
    status VARCHAR(32) NOT NULL DEFAULT 'offline',
    api_endpoint TEXT,
    created_by_admin BOOLEAN DEFAULT false,
    requires_access_approval BOOLEAN DEFAULT false,
    description TEXT,
    allowed_roles JSONB DEFAULT '[]'::jsonb,
    allowed_tables JSONB DEFAULT '[]'::jsonb,
    available_tables JSONB DEFAULT '[]'::jsonb,
    last_tested_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT
);

-- 11. Environment Systems
CREATE TABLE IF NOT EXISTS environment_systems (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    testing JSONB NOT NULL DEFAULT '{}'::jsonb,
    production JSONB NOT NULL DEFAULT '{}'::jsonb,
    allowed_user_ids JSONB DEFAULT '[]'::jsonb,
    allowed_roles JSONB DEFAULT '[]'::jsonb,
    require_dml_approval BOOLEAN DEFAULT false
);

-- 12. Query Approval Requests
CREATE TABLE IF NOT EXISTS query_approval_requests (
    id VARCHAR(64) PRIMARY KEY,
    system_id VARCHAR(64) NOT NULL,
    system_name VARCHAR(255) NOT NULL,
    environment VARCHAR(32) NOT NULL,
    table_name VARCHAR(255) NOT NULL,
    query TEXT NOT NULL,
    requester_id VARCHAR(64) NOT NULL,
    requester_name VARCHAR(255) NOT NULL,
    requester_role VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    request_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    issue_id VARCHAR(64),
    issue_title VARCHAR(255)
);

-- 13. DB Access Requests
CREATE TABLE IF NOT EXISTS db_access_requests (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    username VARCHAR(255) NOT NULL,
    db_id VARCHAR(64) NOT NULL,
    db_name VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Connection Usage Logs
CREATE TABLE IF NOT EXISTS connection_usage_logs (
    id VARCHAR(64) PRIMARY KEY,
    db_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    username VARCHAR(255) NOT NULL,
    action VARCHAR(64) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. Hashtag Presets
CREATE TABLE IF NOT EXISTS hashtag_presets (
    id VARCHAR(64) PRIMARY KEY,
    tag VARCHAR(128) UNIQUE NOT NULL,
    description TEXT,
    criteria TEXT,
    expected_file_structure JSONB DEFAULT '[]'::jsonb,
    solution_template TEXT,
    author VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    file_template_data JSONB DEFAULT '[]'::jsonb,
    criteria_rules JSONB DEFAULT '[]'::jsonb
);

-- 16. Global Standard Directory & Schemas
CREATE TABLE IF NOT EXISTS global_standard_directory (
    id VARCHAR(64) PRIMARY KEY,
    field_name VARCHAR(128) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    data_type VARCHAR(64) NOT NULL,
    description TEXT,
    is_required BOOLEAN DEFAULT false,
    default_mapping JSONB DEFAULT '{}'::jsonb,
    category VARCHAR(64),
    example_value TEXT,
    notes TEXT,
    user_id VARCHAR(64),
    is_standard BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS global_transaction_schema_configs (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(32) NOT NULL,
    fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    table_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
    version_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    strict_mapping_enforced BOOLEAN NOT NULL DEFAULT true,
    updated_by VARCHAR(255) DEFAULT 'system',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS database_table_mappings (
    id VARCHAR(128) PRIMARY KEY, -- format: {db_id}::{table_name}
    db_id VARCHAR(64) NOT NULL,
    db_name VARCHAR(255),
    table_name VARCHAR(255) NOT NULL,
    columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_custom BOOLEAN DEFAULT false,
    updated_by VARCHAR(255) DEFAULT 'admin',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_db_table_mappings_db_tbl ON database_table_mappings(db_id, table_name);

CREATE TABLE IF NOT EXISTS workspace_table_records (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    db_connection_id VARCHAR(64),
    target_table VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. Issues (Lifting 16MB document cap: transaction arrays extracted)
CREATE TABLE IF NOT EXISTS issues (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'Open',
    priority VARCHAR(32) NOT NULL DEFAULT 'Medium',
    creator_id VARCHAR(64) NOT NULL,
    creator_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    type VARCHAR(32) NOT NULL DEFAULT 'single',
    transaction_id VARCHAR(128),
    uploaded_file_name VARCHAR(255),
    uploaded_file_headers JSONB DEFAULT '[]'::jsonb,
    file_mapping JSONB DEFAULT '{}'::jsonb,
    transaction_count INT DEFAULT 0,
    dataset_status VARCHAR(32) DEFAULT 'NONE',
    first_level_notes TEXT,
    second_level_notes TEXT,
    solution_script TEXT,
    solution_test_result TEXT,
    solution_executed BOOLEAN DEFAULT false,
    solution_executed_at TIMESTAMPTZ,
    linked_hashtag VARCHAR(128),
    chat JSONB DEFAULT '[]'::jsonb,
    assigned_tech_user_id VARCHAR(64),
    assigned_tech_user_name VARCHAR(255),
    investigation_system_id VARCHAR(64),
    investigation_environment VARCHAR(32),
    investigation_table VARCHAR(255),
    validation_status VARCHAR(32) DEFAULT 'untested',
    validation_errors JSONB DEFAULT '[]'::jsonb,
    query_results JSONB DEFAULT '[]'::jsonb,
    moved_to_testing BOOLEAN DEFAULT false,
    row_labels JSONB DEFAULT '{}'::jsonb,
    added_label_column_name VARCHAR(128),
    custom_filters JSONB DEFAULT '[]'::jsonb,
    team_id VARCHAR(64),
    visibility VARCHAR(32) DEFAULT 'TEAM_PUBLIC'
);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_creator ON issues(creator_id);
CREATE INDEX IF NOT EXISTS idx_issues_team_visibility ON issues(team_id, visibility);

-- Auto-migration statements for existing databases
ALTER TABLE users ADD COLUMN IF NOT EXISTS permanent_team_id VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS share_workspace_with_team BOOLEAN DEFAULT true;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS team_id VARCHAR(64);
ALTER TABLE issues ADD COLUMN IF NOT EXISTS visibility VARCHAR(32) DEFAULT 'TEAM_PUBLIC';

-- 18. Task Dataset Transactions (Standalone Relational Transactions Table)
CREATE TABLE IF NOT EXISTS task_dataset_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(64) NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    row_number INT NOT NULL,
    canonical_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_dataset_lookup ON task_dataset_transactions(task_id, row_number);
CREATE INDEX IF NOT EXISTS idx_task_dataset_rrn ON task_dataset_transactions(task_id, (canonical_data->>'retrievalRefNum'));
CREATE INDEX IF NOT EXISTS idx_task_dataset_term ON task_dataset_transactions(task_id, (canonical_data->>'terminalId'));

-- 19. Validation Workflows & Extractions
CREATE TABLE IF NOT EXISTS database_validation_workflows (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    target_db_id VARCHAR(64),
    target_table VARCHAR(255),
    category VARCHAR(64),
    stages JSONB NOT NULL DEFAULT '[]'::jsonb,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    global_success_message TEXT,
    global_failure_message TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_system_default BOOLEAN DEFAULT false,
    version VARCHAR(32) DEFAULT '1.0.0'
);

CREATE TABLE IF NOT EXISTS query_extractions (
    id VARCHAR(64) PRIMARY KEY,
    workflow_id VARCHAR(64) NOT NULL,
    stage_id VARCHAR(64) NOT NULL,
    target_db_id VARCHAR(64) NOT NULL,
    target_data_source VARCHAR(255) NOT NULL,
    selected_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    key_mappings JSONB NOT NULL DEFAULT '[]'::jsonb,
    filters JSONB DEFAULT '[]'::jsonb,
    batch_policy JSONB DEFAULT '{}'::jsonb,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 20. Investigation Tasks & Batches
CREATE TABLE IF NOT EXISTS investigation_tasks (
    id VARCHAR(64) PRIMARY KEY,
    workflow_id VARCHAR(64) NOT NULL,
    workflow_name VARCHAR(255),
    issue_id VARCHAR(64) REFERENCES issues(id) ON DELETE SET NULL,
    team_task_id VARCHAR(64),
    total_transactions INT NOT NULL DEFAULT 0,
    processed_transactions INT NOT NULL DEFAULT 0,
    reconciled_transactions INT NOT NULL DEFAULT 0,
    flagged_transactions INT NOT NULL DEFAULT 0,
    closed_transactions INT NOT NULL DEFAULT 0,
    failed_transactions INT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    execution_plan JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_inv_tasks_status ON investigation_tasks(status);

CREATE TABLE IF NOT EXISTS investigation_batches (
    id VARCHAR(64) PRIMARY KEY,
    task_id VARCHAR(64) NOT NULL REFERENCES investigation_tasks(id) ON DELETE CASCADE,
    sequence INT NOT NULL,
    transaction_count INT NOT NULL DEFAULT 0,
    processed_count INT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_detail TEXT,
    retry_count INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_inv_batches_task ON investigation_batches(task_id, status);

-- 21. Investigation Transactions (Granular Decoupled State Lifecycle)
CREATE TABLE IF NOT EXISTS investigation_transactions (
    id VARCHAR(128) PRIMARY KEY, -- Format: itx-{taskId}-{txId}
    task_id VARCHAR(64) NOT NULL REFERENCES investigation_tasks(id) ON DELETE CASCADE,
    batch_id VARCHAR(64) REFERENCES investigation_batches(id) ON DELETE SET NULL,
    transaction_id VARCHAR(128) NOT NULL,
    investigation_status VARCHAR(32) NOT NULL DEFAULT 'UNINVESTIGATED',
    status_flag_text VARCHAR(64),
    status_flag_color VARCHAR(32),
    current_stage_id VARCHAR(64),
    current_rule_id VARCHAR(64),
    final_result VARCHAR(16) NOT NULL DEFAULT 'NOT_EVALUATED', -- PASS | FAIL | ERROR | NOT_EVALUATED
    final_action VARCHAR(16) NOT NULL DEFAULT 'CONTINUE',        -- CONTINUE | STOP | CLOSE
    audit_trail JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_task_transaction UNIQUE (task_id, transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_inv_tx_results ON investigation_transactions(task_id, final_result, final_action);
CREATE INDEX IF NOT EXISTS idx_inv_tx_status ON investigation_transactions(task_id, investigation_status);

-- 22. Investigation External Mirror (Partitioned by retrieved_at for zero-cost cleanup)
CREATE TABLE IF NOT EXISTS investigation_external_mirror (
    id VARCHAR(128) PRIMARY KEY, -- Hash(investigationId + dataSourceId + recordKey)
    investigation_id VARCHAR(64) NOT NULL,
    data_source_id VARCHAR(64) NOT NULL,
    external_system_id VARCHAR(64),
    record_key VARCHAR(128) NOT NULL,
    canonical_payload JSONB NOT NULL,
    raw_payload JSONB,
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mirror_lookup ON investigation_external_mirror(investigation_id, data_source_id, record_key);
CREATE INDEX IF NOT EXISTS idx_mirror_retrieved ON investigation_external_mirror(retrieved_at);

-- 23. FTP / SFTP File Parsing & Staging Configurations
CREATE TABLE IF NOT EXISTS ftp_file_staging_configs (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    ftp_connection_id VARCHAR(64) NOT NULL REFERENCES database_connections(id) ON DELETE CASCADE,
    file_name_pattern VARCHAR(255) NOT NULL,
    file_format VARCHAR(32) NOT NULL DEFAULT 'CSV',
    custom_delimiter VARCHAR(10) DEFAULT ',',
    has_header BOOLEAN DEFAULT true,
    header_row_index INT DEFAULT 1,
    data_start_row INT DEFAULT 2,
    skip_footer_lines INT DEFAULT 0,
    quote_char VARCHAR(4) DEFAULT '"',
    encoding VARCHAR(32) DEFAULT 'utf-8',
    date_format VARCHAR(64) DEFAULT 'YYYY-MM-DD',
    field_mappings JSONB DEFAULT '[]'::jsonb,
    staging_table_name VARCHAR(128),
    last_staged_at TIMESTAMPTZ,
    last_staged_status VARCHAR(32) DEFAULT 'IDLE',
    last_staged_count INT DEFAULT 0,
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ftp_staging_conn ON ftp_file_staging_configs(ftp_connection_id);

-- 24. Maker-Checker Resolution Approval Requests
CREATE TABLE IF NOT EXISTS resolution_approval_requests (
    id VARCHAR(64) PRIMARY KEY,
    task_id VARCHAR(64) NOT NULL REFERENCES investigation_tasks(id) ON DELETE CASCADE,
    transaction_id VARCHAR(64) NOT NULL,
    team_id VARCHAR(64) NOT NULL,
    maker_id VARCHAR(64) NOT NULL,
    maker_name VARCHAR(255) NOT NULL,
    proposed_action VARCHAR(64) NOT NULL,
    proposed_status VARCHAR(64) NOT NULL,
    justification_note TEXT NOT NULL,
    evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    checker_id VARCHAR(64),
    checker_name VARCHAR(255),
    rejection_reason TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_resolution_team_status ON resolution_approval_requests(team_id, status);
CREATE INDEX IF NOT EXISTS idx_resolution_task_txn ON resolution_approval_requests(task_id, transaction_id);

-- 25. Cross-Functional Project Groups
CREATE TABLE IF NOT EXISTS cross_functional_project_groups (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    strategic_objective_id VARCHAR(64),
    member_user_ids JSONB DEFAULT '[]'::jsonb,
    created_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 26. Team Dashboard Visibility Grants
CREATE TABLE IF NOT EXISTS team_dashboard_visibility_grants (
    id VARCHAR(64) PRIMARY KEY,
    grantor_team_id VARCHAR(64) NOT NULL,
    grantee_team_id VARCHAR(64) NOT NULL,
    access_level VARCHAR(32) NOT NULL DEFAULT 'PARTIAL_KPI',
    granted_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 27. AI Strategic Objectives & Alignment Tracking
CREATE TABLE IF NOT EXISTS ai_strategic_objectives (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    target_metric VARCHAR(128),
    target_value NUMERIC(18, 4),
    current_value NUMERIC(18, 4) DEFAULT 0.00,
    linked_hashtags JSONB DEFAULT '[]'::jsonb,
    assigned_team_ids JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
