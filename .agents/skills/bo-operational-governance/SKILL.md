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
3. **Transaction Investigation Status (`InvestigationTransaction.investigationStatus`)**: `UNINVESTIGATED` -> `IN_PROGRESS` -> `VERIFIED_MATCH` | `FLAGGED_DISCREPANCY` | `ERROR`.
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
6. Batched Chunk Extraction (externalDataQueryService.ts: SELECT [cols] WHERE primaryKey IN ($1, ...))
         ↓
7. Ingestion into PostgreSQL Mirror (Bulk insert into mirror_{db}_{table})
         ↓
8. Set-Based Rule Compilation (ruleSqlCompiler.ts: Single UPDATE with dynamic CASE WHEN)
         ↓
9. Relational Reconciliation (reconciliationService.ts: Segregate PASS vs FAIL keys)
         ↓
10. Key Chaining & Downstream Branching (Route PASS keys to Stage 2 if downstream primary keys match)
         ↓
11. State & Rollup Aggregation (statusAggregator.ts: Update investigation_transactions & broadcast SSE)
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
