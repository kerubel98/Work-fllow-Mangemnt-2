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
