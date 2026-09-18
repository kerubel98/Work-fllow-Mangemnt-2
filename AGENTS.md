# Antigravity Project Rules: Operational Workflow Management

## Mandatory Skill Activation
Whenever modifying, designing, reviewing, or analyzing features in this repository, you must consult and adhere to:
- **Skill**: [`bo-operational-governance`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md)
- **Baseline Context**: [`CURRENT_PROJECT_CONTEXT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/CURRENT_PROJECT_CONTEXT.md)

---

## Non-Negotiable Governance Principles

1. **Repository Reality Trumps Assumptions**:
   - The primary database is **PostgreSQL** (`operational_workflow_db`), managed via 22 relational tables in `backend/src/database/migrations/001_initial_schema.sql` and `postgresRepo.ts`.
   - Workflows, Validation Boxes, and Query Extractions are **persisted in PostgreSQL** via `/api/workflows` and `/api/validation-boxes`.
   - External reconciliation uses **dedicated typed UNLOGGED mirror tables** (`mirror_{db}_{table}`) and dynamic SQL compilation (`ruleSqlCompiler.ts`), never unbatched in-memory loops.

2. **Validation Result ≠ Pipeline Action**:
   - Always maintain the strict separation between what a rule discovers (`PASS`, `FAIL`, `ERROR`, `PAUSED_DB_OFFLINE`) and what the pipeline executes next (`CONTINUE`, `STOP`, `CLOSE`, `FLAG`, `REPORT`).

3. **Lifecycle Separation**:
   - Keep Task/Case Lifecycle (`Issue.status`), Financial Transaction Status, Transaction Investigation Lifecycle, and Rule Execution Verdict strictly separated.

4. **External System Agnosticism**:
   - External database names, tables, and column names must never be hard-coded.
   - All mapping must route through `global_standard_directory` and `database_table_mappings`.
   - External queries must be batched (`WHERE id IN (...)`) with minimal column projection.

5. **No Unapproved Infrastructure**:
   - Do not introduce Kafka, Redis, extra message queues, or rewrite the persistence layer without explicit user review and approval.

6. **Frontend Fault Tolerance & State Sanitization**:
   - All complex workspace views (e.g., `InvestigationWorkspace`, `IssueDetailView`) MUST be wrapped in React `<ErrorBoundary>` components to prevent full-page blank screen unmounts.
   - PostgreSQL JSONB objects (e.g., `_validation_details`, `sourceRecord`) must NEVER be directly rendered as React JSX children. Always format or serialize them via stringification helpers.

7. **Maker-Checker Dual Authorization & Anti-Self-Approval (Four-Eyes Principle)**:
   - Any manual transaction resolution or discrepancy override (`FORCE_MATCH`, `WRITE_OFF`, `MANUAL_REVERSAL`) must be routed through a Maker proposal (`POST /api/resolutions/propose`) and committed only upon Checker approval.
   - Transactions under review must lock in `PENDING_CHECKER_REVIEW` with an immutable evidence snapshot (`_inputData` + `_mirrorData`).
   - Anti-Self-Approval is mandatory at the API and service layers: `makerId !== checkerId` (HTTP 403). Operators cannot approve their own submissions.

8. **Universal Hashtag Binding & Traceability**:
   - Workflows, DAG nodes, FTP staging templates, DB table configurations, ingested tasks, and chat discussions must be linked via universal `#hashtags` (e.g., `#AIB_SETTLEMENT_2026`).
   - Resolution solutions emerging from team chat must be staged directly as Maker proposals with attribution to the author.

9. **Tuple-Based Ingestion & Reconciliation Key Hierarchy**:
   - Multi-column reconciliation matching must compile to batched tuple SQL (`WHERE (col1, col2, ...) IN ((val1, val2, ...), ...)`).
   - Key selection follows strict precedence: explicit DB table configuration overrides > validation box required columns.

10. **64-Bit Cryptographic Advisory Locking**:
    - Never use 32-bit `hashtext($1)` for advisory locks. Always derive 64-bit cryptographic bigint keys:
      `('x' || substr(md5($1), 1, 16))::bit(64)::bigint`.
    - Eliminates birthday paradox collisions and spurious deadlocks across thousands of concurrent mirror tables and rollback tasks.

11. **Query Parameter Bounds (< 30,000) & ANSI Identifier Quoting**:
    - Composite tuple SQL queries must dynamically cap parameter counts at 30,000 (well below PostgreSQL `UINT16_MAX` 65,535). Queries exceeding this bound must be sub-chunked and merged.
    - All SQL column identifiers must be ANSI-quoted (`"col"` for PostgreSQL, `` `col` `` for MySQL) to prevent keyword collisions and syntax errors.

12. **Diagnostic Taint Tracking & Downstream Math Isolation**:
    - Transactions advancing downstream under action `REPORT` must carry `_isDiagnosticOnly: true` and `_diagnosticTaintReason`.
    - Downstream stages must bypass arithmetic and mutating operations on tainted records, executing only observational checks.

13. **Task-Scoped Rollback Isolation & Deterministic Joins**:
    - Rollbacks must never execute global table locks (`LOCK TABLE ... IN EXCLUSIVE MODE`). Use task-scoped 64-bit advisory locks (`task_revert_${taskId}`).
    - All `UPDATE ... FROM` joins must deduplicate source rows using CTE `DISTINCT ON (task_id, row_number)` or join strictly on surrogate keys `(target.task_id = source.task_id AND target.row_number = source.row_number)`.

