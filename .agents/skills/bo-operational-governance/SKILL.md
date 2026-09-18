---
name: bo-operational-governance
description: >-
  Architecture-aware implementation governance and domain guide for the Back Office (BO)
  Settlement, Investigation, Validation, Rule Builder, and Reconciliation system.
  Enforces repository-first verification, PostgreSQL persistence, UNLOGGED mirror reconciliation,
  flowchart DAG pipeline standards, and strict separation between validation verdict and pipeline action.
---

# Architecture-Aware Implementation Governance: BO Operational Workflow Platform

This skill governs all software engineering, architecture, refactoring, and feature work on the **Back Office (BO) Settlement, Investigation, Validation, Rule Builder, and Reconciliation platform**.

> **CORE PRINCIPLE**:
> Understand first. Design second. Get approval when required. Implement third. Verify last.
> Never make assumptions based on outdated documentation. Repository reality always takes precedence.

---

## 1. Source of Truth Hierarchy

When information, discussions, or prompt instructions conflict, apply this strict priority order:

1. **Current repository implementation** (physical code, active database schemas, live endpoints)
2. **Explicit current user requirements**
3. **Approved architecture baseline** (`CURRENT_PROJECT_CONTEXT.md`)
4. **Current project context & decision logs**
5. **Historical documentation** (`SYSTEM_ARCHITECTURE.md`, old conversation logs)
6. **Previous AI suggestions or proposals**
7. **Assumptions** (Never fill unknowns with unverified assumptions)

If two sources conflict:
- Explicitly identify the contradiction.
- Explain the discrepancy using file references.
- Do not silently pick an obsolete approach.
- Ask for clarification if the conflict impacts ongoing design.

---

## 2. Key Architecture Alignments (Current Baseline vs Obsolete Proposals)

Ensure you NEVER re-introduce these obsolete historical decisions:

| Concept | Obsolete Historical Assumption | Actual Current Implementation Baseline |
| :--- | :--- | :--- |
| **Primary Datastore** | MongoDB (`mongoose`) | **PostgreSQL** (`operational_workflow_db`) with a 22-table schema (`backend/src/database/migrations/001_initial_schema.sql`) and connection pool (`config/postgres.ts`). MongoDB is commented out in `.env`. |
| **Workflow Persistence** | Browser `localStorage` | **PostgreSQL relational tables**: `database_validation_workflows`, `query_extractions`, and `validation_boxes` via REST endpoints `/api/workflows` and `/api/validation-boxes`. |
| **Mirroring Architecture** | Ad-hoc MongoDB mirror | **Dedicated typed `UNLOGGED` PostgreSQL mirror tables** (`mirror_{db}_{table}`) and `investigation_external_mirror` for microsecond set-based SQL joins. |
| **Query Strategy** | Per-transaction query lookups | **Batched Chunk Queries**: Parameterized `WHERE primaryKey IN ($1, $2, ...)` with minimal column projection (`SELECT col1, col2`). |
| **Task Dataset Storage** | Embedded inside `Issue` documents | **Decoupled Relational Table**: `task_dataset_transactions` with 500-row batch ingestion and thin-client pagination (`GET /api/issues/:id/transactions?page=1&limit=50`). |
| **Rule & Pipeline UI** | Flat 3-block form in settings | **Workflow Studio Flowchart** (`WorkflowStudioFlowchart.tsx`): Vertical visual DAG canvas connecting Search Blocks (rectangles) and Condition Checks (rhombuses) with interactive wire ports. |
| **External Database Drivers** | Claimed Oracle, SQLite, Postgres, MySQL | Only **PostgreSQL** (`pg`) and **MySQL** (`mysql2/promise`) have genuine drivers installed. **Oracle** is declared in types but has **NO driver package installed** (`oracledb` absent). |
| **Server & Port** | Port 3000 (Backend), 5173 (Frontend) | Unified server running on **Port 5002** (`backend/src/server.ts`) with Express and embedded Vite SPA middleware. |

---

## 3. Core Domain Principles & Architectural Constraints

### 3.1 Validation Result ≠ Pipeline Action
This distinction is mandatory and must never be merged:
- **Validation Result (`ValidationResultStatus`)**: What the business rule discovered about the transaction:
  - `PASS`: Transaction satisfied rule criteria.
  - `FAIL`: Transaction violated rule criteria.
  - `ERROR`: Technical exception (connection timeout, syntax error, database offline).
  - `NOT_EVALUATED`: Check has not run yet.
  - `PAUSED_DB_OFFLINE`: Execution halted because the target database tripped the circuit breaker.
- **Pipeline Action (`PipelineAction` / `FlowchartOutputAction`)**: What the orchestration engine does next:
  - `CONTINUE`: Proceed to the next step, stage, or connected flowchart node.
  - `STOP`: Halt execution of this transaction immediately.
  - `CLOSE`: Mark this transaction as investigated, verified, and closed.
  - `FLAG`: Flag as an operational discrepancy for human triage.
  - `REPORT`: Emit a diagnostic discrepancy record.

A failed validation does **not** automatically stop the pipeline if `onFailAction: 'CONTINUE'`.

### 3.2 Four Independent Lifecycle Dimensions
Never conflate these distinct state lifecycles:
1. **Case / Task Lifecycle (`Issue.status`)**: `Open` -> `In Progress` -> `Under Testing` -> `Resolved` -> `Closed`.
2. **Transaction Financial Status (`canonical_data.status_state`)**: `AUTHORIZED`, `SETTLED`, `PENDING`, `DECLINED`, `REVERSED`.
3. **Transaction Investigation Status (`InvestigationTransaction.investigationStatus`)**: `UNINVESTIGATED` -> `IN_PROGRESS` -> `PENDING_CHECKER_REVIEW` -> `VERIFIED_MATCH` | `FLAGGED_DISCREPANCY` | `ERROR`.
4. **Rule Execution Verdict (`InvestigationTransaction.finalResult`)**: `NOT_EVALUATED` -> `PASS` | `FAIL` | `ERROR` | `PAUSED_DB_OFFLINE`.

Resolving or closing a single transaction investigation must **never** automatically close the parent Task/Issue.


### 3.3 Configuration Over Hard-Coding
External target systems vary across banking switch vendors, CBS installations, and payment gateways.
- Never hard-code physical database, table, or column names into backend processors.
- Use **Canonical Business Fields** from the `global_standard_directory` (e.g., `transaction_id`, `amount_usd`, `card_number`, `response_code`).
- Map physical schema differences dynamically via `database_table_mappings` (`{dbId}::{tableName}`).

### 3.4 Generic Processing Stages
Do not build special-purpose, single-table processing classes (e.g., `AuthLogProcessor`, `FinTabProcessor`).
Workflows must be generic and stage-aware:
```text
ProcessingStage
  ├── targetDbId & targetDataSource
  ├── rules (ValidationCheckSteps)
  ├── keyMappings & selectedColumns (QueryExtraction)
  └── pipeline behavior & key chaining
```

### 3.5 Set-Based Database Execution Over Iterative Code
When evaluating thousands of rows against rules:
- Do not loop in Node.js executing `if/else` checks per transaction.
- Use `ruleSqlCompiler.ts` to compile declarative steps into native PostgreSQL `UPDATE mirror SET ... CASE WHEN ...` expressions.
- Execute set-based operations across dedicated typed `UNLOGGED` mirror tables.

### 3.6 React Rendering & JSONB Data Safety
When displaying PostgreSQL dataset records or validation execution details in the frontend:
- Protect React component trees with localized `<ErrorBoundary fallbackTitle="...">` blocks.
- Coalesce camelCase and snake_case properties returned from backend API queries (e.g., `row.workflowId ?? row.workflow_id`).
- Ensure all object-type metadata values are explicitly rendered using `typeof detail === 'object' ? JSON.stringify(detail) : String(detail)`.

### 3.7 Maker-Checker Dual Authorization (Four-Eyes Principle)
Manual overrides and discrepancy resolutions (`FORCE_MATCH`, `WRITE_OFF`, `MANUAL_REVERSAL`) require multi-party operational governance:
- **Proposal Submission**: The analyst (Maker) calls `POST /api/resolutions/propose` with their `justification` and an immutable evidence snapshot (`_inputData` + `_mirrorData`).
- **State Locking**: The target transaction switches to `PENDING_CHECKER_REVIEW`. It cannot be re-executed or modified until reviewed.
- **Anti-Self-Approval Enforcement**: At both API route (`resolutions.ts`) and service (`makerCheckerService.ts`) layers, `makerId !== checkerId` is strictly checked; violations return HTTP `403 Forbidden`.
- **Review Outcomes**:
  - `APPROVED`: Commits resolution to PostgreSQL, transitions status to `VERIFIED_MATCH` / `CLOSE`.
  - `REJECTED`: Reverts transaction status to `FLAGGED_DISCREPANCY` with recorded supervisor feedback notes.

### 3.8 Universal Hashtag Binding (`#hashtags`) & Chat Traceability
To guarantee enterprise traceability across operational silos:
- Assets are indexed and queryable by `#hashtags` via `GET /api/hashtags/resolve/:tag`:
  - Workflow DAGs and validation boxes
  - FTP file staging templates & schema mappings
  - Database connection configurations
  - Tasks / Issues and discrepancy logs
  - Team workspace chat messages
- Chat discussions can be directly staged into formal Maker proposals (`POST /api/resolutions/propose-from-chat`), retaining full attribution to the solution author.

### 3.9 Tuple-Based Ingestion & Multi-Column Reconciliation Matching
When reconciling against external databases with composite keys (e.g., `[terminal_id, rrn_reference, amount]`):
- Construct set-based tuple SQL: `SELECT * FROM table_a WHERE (col1, col2, ...) IN ((val1, val2, ...), ...)`.
- Respect key precedence hierarchy:
  1. Explicit table-level reconciliation key overrides in `database_table_mappings`.
  2. Default required column fields defined on the upstream validation box.

### 3.10 Team Operational Governance & Cross-Team In/Out KPIs
Departmental managers require visibility into throughput and cross-team dependencies:
- **Inflow Metrics**: Total ingested files, assigned tasks, open discrepancies, pending supervisor approvals.
- **Outflow Metrics**: Approved/rejected resolutions, 4-eyes clearance rate (%), SLA compliance rate (%), average resolution time.
- **Cross-Team Access Sharing**: Team leads can grant `FULL` or `PARTIAL_KPI` visibility to other departments (e.g., Audit, IT, Executives) without duplicating underlying data.
- **Strategic Scaffolding**: Cross-functional task forces (`cross_functional_project_groups`) and organizational goals (`ai_strategic_objectives`) correlate progress metrics directly to linked `#hashtags`.

### 3.11 64-Bit Cryptographic Advisory Locking
When synchronizing concurrent operations (table provisioning, task rollback, Maker-Checker proposals):
- Generate 64-bit keys via `derive64BitAdvisoryLockSql(paramIndex)`:
  ```sql
  ('x' || substr(md5($1), 1, 16))::bit(64)::bigint
  ```
- Use transaction-scoped locks (`pg_advisory_xact_lock`) to guarantee automatic release on commit or rollback.
- Eliminates 32-bit `hashtext` hash collisions across concurrent dynamic tables and worker processes.

### 3.12 Parameter Ceiling Bounds & Dynamic Chunking
- When building parameterized composite tuple queries (`WHERE (c1, c2) IN ((v1, v2), ...)`), compute:
  ```typescript
  const maxKeys = Math.min(1000, Math.floor(30000 / Math.max(1, keyMappings.length)));
  ```
- Automatically slice candidate records into sub-chunks of size `maxKeys` and merge results sequentially, guaranteeing total parameters stay well below PostgreSQL's `UINT16_MAX` (65,535) protocol ceiling.
- All column identifiers must be ANSI-quoted (`"col"` for PostgreSQL, `` `col` `` for MySQL) to prevent keyword collisions.

### 3.13 Multi-Row Discrepancy Flagging & Raw Evidence Retention
- For `STRICT_SINGLE`, `LATEST`, or `EARLIEST` policies where `rows.length > 1`:
  - Set `_discrepancyFlag: 'DUPLICATE_EXTERNAL_MATCH'`.
  - Set `_matchCount: rows.length`.
  - Retain complete `_rawRows: rows` in the evidence snapshot for Maker-Checker review. Never discard extra rows silently.

### 3.14 Diagnostic Taint Tracking & Downstream Math Isolation
- When a rule evaluates to `FAIL` and `onFailAction` is `'REPORT'`:
  - The record advances downstream for diagnostic reporting, but carries `_isDiagnosticOnly = true` and `_diagnosticTaintReason = 'UPSTREAM_FAILURE_DIAGNOSTIC_ONLY'`.
  - Downstream mutating or arithmetic rules (e.g., fee spreads, currency conversions) must bypass tainted records:
    ```typescript
    if (rec._isDiagnosticOnly) return { status: 'BYPASS_UPSTREAM_TAINTED' };
    ```

### 3.15 Task-Scoped Non-Blocking Rollback
- Isolate rollback operations with `pg_advisory_xact_lock` using key `'task_revert_' || taskId`.
- Never execute global table locks (`LOCK TABLE task_dataset_transactions IN EXCLUSIVE MODE`) during reversion, ensuring concurrent batch ingestions for other tasks proceed without blocking.

### 3.16 Sub-Chunk Worker Heartbeats & Precision Sweeper
- Worker processes emit progress pulses into `task_batch_heartbeats` `(task_id, batch_id, worker_pid, last_chunk_index, total_chunks, last_heartbeat_at)`.
- Server boot sweepers must only mark tasks as `Failed` if `last_heartbeat_at < NOW() - INTERVAL '3 minutes'`, safeguarding legitimately running long batches from premature termination.

---

## 4. End-to-End Investigation Flow

When adding or modifying investigation features, trace and respect the complete pipeline:

```text
1. Task Dataset (Spreadsheet Upload or Case Records)
         ↓
2. Dataset Ingestion (Chunked INSERT into task_dataset_transactions)
         ↓
3. Orchestrator Singleton (workflowEngineSingleton.ts: In-flight deduplication & LRU cache)
         ↓
4. Database Liveness Probe (dbLivenessService.ts: Pre-flight socket check & circuit breaker)
         ↓
5. Dedicated Mirror Provisioning (mirrorTableManager.ts: CREATE UNLOGGED TABLE IF NOT EXISTS mirror_{db}_{table})
         ↓
6. Batched Tuple Extraction (externalDataQueryService.ts: SELECT [cols] WHERE (k1, k2) IN ((v1, v2), ...))
         ↓
7. Ingestion into PostgreSQL Mirror (Bulk insert into mirror_{db}_{table})
         ↓
8. Set-Based Rule Compilation (ruleSqlCompiler.ts: Single UPDATE with dynamic CASE WHEN)
         ↓
9. Relational Reconciliation (reconciliationService.ts: Segregate PASS vs FAIL keys)
         ↓
10. Key Chaining & Downstream Branching (Route PASS keys to Stage 2 if downstream primary keys match)
         ↓
11. Discrepancy Triage & Chat Staging (Link discussions via #hashtags)
         ↓
12. Maker-Checker Resolution (Propose -> Lock in PENDING_CHECKER_REVIEW -> Checker Approve/Reject)
         ↓
13. State & Rollup Aggregation (statusAggregator.ts: Update investigation_transactions & broadcast SSE)
```

---

## 5. Mandatory Implementation Workflow

Before modifying or adding code in this repository, execute these phases:

### Phase A — Understand & Inspect
- Locate all existing components, APIs, and models involved.
- Verify whether the capability is `EXISTS`, `PARTIALLY_EXISTS`, or `MISSING`.
- Trace claims to actual files in `backend/src/` or `frontend/src/`.

### Phase B — Impact Analysis
Evaluate:
- Frontend impact (React 19 components, API client methods).
- Backend impact (Routes, controllers, services).
- Database impact (PostgreSQL schema, indexes, migrations).
- Performance impact (Ensure batching and set-based joins are preserved).
- Backward compatibility (Ensure existing issues, workflows, and table mappings remain valid).

### Phase C — Design
- Specify exact files to change, APIs to expose, and database queries to execute.
- Ensure business logic resides in backend domain services (`backend/src/services/`), not duplicated inside React component state.

### Phase D — Review & User Alignment
- Confirm no unapproved infrastructure (Kafka, Redis, extra queues, MongoDB rewrites) is introduced.
- Confirm no hard-coded external schema assumptions are introduced.

### Phase E — Implement & Verify
- Implement cleanly without modifying unrelated files.
- Verify TypeScript compilation: `npm run lint` or `npx tsx` execution.
- Run existing verification scripts in `backend/src/test-*.ts` or `scratch/`.

---

## 6. Forbidden Anti-Patterns

1. **NEVER** treat MongoDB as the active primary database. The primary database is PostgreSQL (`operational_workflow_db`).
2. **NEVER** store workflows in `localStorage`. Workflows must be persisted in PostgreSQL.
3. **NEVER** run single-row `SELECT *` queries per transaction against external databases. Always use chunked parameter binding (`WHERE key IN (...)`) with minimal column projection.
4. **NEVER** merge `ValidationResultStatus` (`PASS`/`FAIL`/`ERROR`) with `PipelineAction` (`CONTINUE`/`STOP`/`CLOSE`).
5. **NEVER** assume Oracle database connectivity works without installing and configuring `oracledb`.
6. **NEVER** embed large transaction arrays inside the `Issue` record. Use `task_dataset_transactions`.
7. **NEVER** duplicate business execution logic in the frontend. The frontend is for presentation and flowchart canvas interactions; execution belongs to the backend orchestrator.
8. **NEVER** introduce distributed queues or external caches (Kafka, Redis, RabbitMQ) unless explicitly justified and approved.
9. **NEVER** use 32-bit `hashtext` for advisory locks. Always derive 64-bit MD5 bigint keys: `('x' || substr(md5($1), 1, 16))::bit(64)::bigint`.
10. **NEVER** pass unbounded composite tuple lists to PostgreSQL without checking against the 65,535 parameter ceiling. Always chunk under 30,000 parameters.
11. **NEVER** silently discard duplicate matched rows in external reconciliation. Always flag `DUPLICATE_EXTERNAL_MATCH` and preserve `_rawRows` in the evidence snapshot.
12. **NEVER** acquire global table locks during task rollback. Always use task-scoped advisory locks (`task_revert_${taskId}`).
