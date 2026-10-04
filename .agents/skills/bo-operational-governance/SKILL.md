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

### 3.17 Centralized OAuth 2.0 & Channel Ingestion Architecture
Enterprise messaging channels (Microsoft 365, Google Workspace, Zoho Mail, Custom OAuth 2.0) follow strict administrative centralization:
- **Admin Hub Responsibility**: IT Administrators configure the single authoritative OAuth 2.0 App Registration (`provider_connections` where `team_id IS NULL` and `config->>'isGlobal' = 'true'`).
- **Team Responsibility**: Operational teams select the pre-approved corporate provider and specify only their operational inbox/mailbox address (`userEmail`).
- **Dynamic Credential Merging**: The backend service layer (`stagingService.resolveEffectiveConfig` and `oauth2Service.resolveOAuth2Config`) merges the corporate credentials with the team's email identity at execution time, enforcing least-privilege token acquisition.

### 3.18 Persistent Presentation Assets & Re-executable Generation Scripts
When producing executive slide decks (`.pptx`), system introductions, or compliance walkthroughs:
- **Dedicated Asset Folder**: All high-definition screenshots (1920x1080), diagrams, and media must be retained in `presentation_assets/` with descriptive filenames.
- **Re-executable Automation**: Store and maintain the Python compiler script (`build_presentation.py`) in the workspace. Any future modifications (slide re-ordering, text copy updates, replacing individual screenshot steps) must be executable with `python build_presentation.py` without re-extracting assets from scratch.
- **No Disposable Presentation Materials**: Screenshots and slide generation routines are permanent deliverables, never to be stored solely in ephemeral logs or transient temp directories.

### 3.19 Safe Database Maintenance, Seed Isolation & Zero Data Loss
When performing database cleanups, schema maintenance, or test teardowns:
- **No Blanket Deletions**: Never execute unconstrained `DELETE FROM <persistent_table>` or `DROP TABLE <persistent_table>` against persistent entities (`database_validation_workflows`, `validation_boxes`, `database_connections`, `database_table_mappings`, `issues`, `teams`, `users`, `workflow_bundles`).
- **Explicit Provenance Scoping**: Any cleanup touching persistent records must use restrictive, reviewable identification (e.g., `WHERE id = ANY($1)` or `is_system_mock = true`). Names, creation dates, or appearance alone must never be treated as proof that a record is disposable.
- **Mandatory 8-Step Dry-Run Execution Flow**:
  ```text
  1. IDENTIFY exact target records and tables
          ↓
  2. SELECT matching records via non-destructive read query
          ↓
  3. VERIFY ownership and provenance (confirm user-created records are NOT included)
          ↓
  4. DRY RUN: evaluate exact record count and IDs
          ↓
  5. REPORT affected records explicitly to the user
          ↓
  6. OBTAIN EXPLICIT APPROVAL before executing any destructive query
          ↓
  7. MODIFY / DELETE with scoped WHERE clause
          ↓
  8. VERIFY final state via post-operation verification query
  ```
  If ownership or provenance cannot be established: **Do not delete or overwrite the data.**
- **Transient Data Verification**: Never assume a table is safe to drop merely because its name matches `mirror_%`. Verify from the repository and metadata that the object is truly a transient, generated structure before dropping.

### 3.20 Canonical Validation Box Type System & Cross-Layer Consistency
The validation platform enforces a strict separation between validation box container types and internal rule check types:
1. **Canonical Container Types (`ValidationBoxType`)**:
   - `INGESTION_SEARCH`: Ingress table existence and primary key discovery (`auth_log_tab`).
   - `CONDITION_CHECK`: Inline field values, status checks, and ISO decline code validation.
   - `RECONCILIATION`: Cross-table / cross-system mathematical matching and financial amounts (`sv_fin_tab`).
   - `REPORT`: Diagnostic discrepancy emission.
2. **Internal Rule Check Types (`CheckType`)**:
   - Resides strictly within `rule_definition` or `steps[].checkType` (e.g., `EXISTENCE_CHECK`, `AMOUNT_MATCH`, `VALUE_MATCH`, `ISO_DECLINE_CODE`).
   - Never set `validation_boxes.box_type` to a `CheckType` string (e.g. `box_type = 'EXISTENCE_CHECK'` is invalid).

**Single Source of Truth & Cross-Layer Inspection**:
Before modifying any enum, type, or persistent field, verify synchronization across the complete layer stack:
```text
Database schema (001_initial_schema.sql / migrations)
        ↕
Backend model / schema (backend/src/types.ts & postgresRepo.ts)
        ↕
API contract (routes/*.ts & client.ts)
        ↕
Frontend TypeScript type (frontend/src/types.ts)
        ↕
Frontend UI filtering & grouping (ValidationBoxManager.tsx)
        ↕
Seed routines & test fixtures (seedPostgres.ts)
        ↕
Existing persistent database records
        ↕
Automated test suites
```
Never update only the single layer where a visible symptom surfaced.

### 3.21 Team-Private Database Connection Lifecycle & Credential Protection
- **Creation & Ownership**: Teams configure private database connections via `POST /api/teams/:teamId/databases`. The backend sets `database_connections.team_id = :teamId` and `database_connections.scope = 'team'`.
- **Strict Authorization Chain**: Access must verify:
  ```text
  User → Team Membership → Team → Database Connection → Allowed Operation
  ```
  A user must never gain query or mirror access to another team's connection simply by knowing a connection ID, database name, table name, or mirror table.
- **Promotion Governance**: Promoting a connection from `team_id = <team>` to global (`team_id = NULL`, `scope = 'global'`) requires formal administrative authorization (`promotion_status = 'PENDING'` reviewed via `AdminTeamResourcesMonitor.tsx` or `db_access_requests`).
- **Credential Protection**:
  - Passwords and secrets must never be logged or returned in plaintext.
  - API responses must mask passwords (`••••••••`).
  - Metadata-only updates must preserve existing database secrets when no new password is submitted.
### 3.22 Flowchart DAG State Synchronization & Four-Tier Field Invariance
In visual workflow builders (such as `WorkflowStudioFlowchart.tsx`), workflows transition continuously between visual graph nodes (`FlowchartNode`), execution stages (`ProcessingStage`), individual checks (`ValidationCheckStep`), and PostgreSQL persistence (`database_validation_workflows`).

Whenever introducing, updating, or debugging workflow or stage attributes:
1. **Canvas Node Definition**: Ensure the attribute is declared in `FlowchartNode` in both `frontend/src/types.ts` and `backend/src/types.ts`.
2. **Snapshot & Dirty Tracking**: Include the attribute in `createSnapshot` and `currentSnapshot` dependencies to preserve unsaved change detection.
3. **Canvas Loading & Synthesis**: Ensure `convertStagesToFlowchart` transfers the attribute from incoming `stages` and `steps` to `FlowchartNode`.
4. **Toolbox Instantiation**: Ensure `handleAddBoxNode` populates default values from the selected Validation Box or parent workflow.
5. **Sanitization & Save Mapping**: Ensure `cleanNodes`, `stages` mapping, and `steps` mapping in `handleSaveWorkflow` do not strip the attribute before emitting the API payload.
6. **Backend Ingestion & Hydration**: Verify `POST /api/workflows` and `PUT /api/workflows/:id` in `workflows.ts` do not strip the attribute, and update `hydrateWorkflowColumnConfigurations` if relational hydration is required.

### 3.23 Pipeline & Stage Database Scoping Governance (`attachedDbConfigIds`)
- **Workflow Scope (`targetDbId`, `targetTable`)**: Every workflow pipeline must declare its primary target database connection and default scope table in the studio header bar.
- **Node-Level Rule Attachment (`attachedDbConfigIds`)**: Rather than executing unconstrained table scans, each validation node must explicitly reference registered `database_column_configurations` IDs (`attachedDbConfigIds`).
- **Dynamic Rule Discovery**: The UI inspector must query `api.getColumnConfigurations(dbId, table)` to provide operators with live rule checkboxes, type badges, and active count indicators.
- **Cardinality & Aggregation Contracts**: Multi-row queries must explicitly specify cardinality policy (`STRICT_SINGLE`, `ONE_TO_MANY`, `EXPLICIT_LATEST`, `EXPLICIT_FIRST`, `ALL_ROWS`) and aggregation strategy (`NONE`, `SUM`, `COUNT`, `MIN`, `MAX`) to prevent ambiguous result sets during external mirror reconciliation.

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

## 5. Mandatory Implementation Workflow (Inspect → Plan → Approve → Modify → Verify)

For changes involving persistent data, architecture, schema, authorization, or lifecycle behavior, execute this 6-phase workflow:

### Phase 1 — Inspect
- Read the repository and identify the current physical implementation.
- Trace claims to actual source files in `backend/src/`, `frontend/src/`, and migration scripts.
- Verify whether the capability is `EXISTS`, `PARTIALLY_EXISTS`, or `MISSING`.

### Phase 2 — Analyze
- Identify current vs. intended behavior.
- Evaluate cross-layer dependencies (Database, Backend, API, Frontend, Seeds, Tests).
- Assess ownership, authorization, data impact, and architectural conflicts.

### Phase 3 — Plan
- Produce the exact files, models, APIs, and data queries affected.
- Clearly separate required changes from optional future improvements.

### Phase 4 — Approval
- For destructive, persistent-state, or high-impact operations, obtain explicit user approval before execution.

### Phase 5 — Modify
- Apply only the approved changes cleanly.
- Do not expand scope or touch unrelated files.

### Phase 6 — Verify
- Inspect the diff for unintended changes.
- Verify affected database records via explicit read queries.
- Run relevant test suites (`npm test` or `npx tsx`).
- Verify API contracts, frontend behavior, and authorization controls.

---

## 6. Forbidden Anti-Patterns

1. **NEVER** execute blanket `DELETE FROM <persistent_table>` or unconstrained `DROP TABLE`.
2. **NEVER** drop persistent application tables during ordinary test cleanup.
3. **NEVER** treat user-created data as test data without verified provenance.
4. **NEVER** modify persistent data simply to make a UI display correctly.
5. **NEVER** assign `CheckType` values (`EXISTENCE_CHECK`, `AMOUNT_MATCH`) to `validation_boxes.box_type`.
6. **NEVER** invent enum values or modify only the frontend/backend layer when a cross-layer type is involved.
7. **NEVER** expose team-private database connections to another team or promote them to global without formal authorization.
8. **NEVER** expose database credentials in logs or API responses in plaintext.
9. **NEVER** assume a mirror/temporary table is disposable without verifying its lifecycle.
10. **NEVER** repair data by guessing the intended state without evidence.
11. **NEVER** bypass existing authorization, 4-eyes Maker-Checker controls, or anti-self-approval (`makerId !== checkerId`).
12. **NEVER** modify unrelated persistent records while fixing a specific issue.
13. **NEVER** claim a repository behavior exists without inspecting physical code.
14. **NEVER** merge `ValidationResultStatus` (`PASS`/`FAIL`/`ERROR`) with `PipelineAction` (`CONTINUE`/`STOP`/`CLOSE`).
15. **NEVER** acquire global table locks during task rollback. Always use task-scoped advisory locks (`task_revert_${taskId}`).
16. **NEVER** use 32-bit `hashtext` for advisory locks. Always derive 64-bit MD5 bigint keys: `('x' || substr(md5($1), 1, 16))::bit(64)::bigint`.
17. **NEVER** pass unbounded composite tuple lists to PostgreSQL without checking against the 65,535 parameter ceiling. Always chunk under 30,000 parameters.
18. **NEVER** hardcode inner viewport heights (`h-[calc(100vh-...)]`) in workspace tabs. Always constrain full-screen views with `overflow-hidden flex-1 min-h-0` and `shrink-0` stationary headers.
19. **NEVER** add or modify properties in `ProcessingStage` or `ValidationCheckStep` without updating `FlowchartNode`, `cleanNodes`, `convertStagesToFlowchart`, and `createSnapshot` in `WorkflowStudioFlowchart.tsx`. Doing so silently drops configurations during canvas interactions.
20. **NEVER** save workflows without explicit `targetDbId` and `targetTable` scoping or execute validation blocks without explicit `attachedDbConfigIds` bindings.



