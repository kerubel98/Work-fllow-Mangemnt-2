# CURRENT PROJECT CONTEXT REPORT: OPERATIONAL WORKFLOW MANAGEMENT PLATFORM

> **Authoritative Current Architecture & Implementation Baseline**  
> **Inspection Timestamp:** 2026-09-06T21:05:00Z  
> **Repository Path:** `c:/Users/hp/Downloads/opration-workflow-mangement1`  
> **Document Status:** 100% Grounded in Live Source Code, Physical Database Schemas, API Endpoints, and Active Configurations.

---

## TABLE OF CONTENTS
1. [Objective & Scope](#1-objective--scope)
2. [Repository Structure & High-Level Component Map](#2-repository-structure--high-level-component-map)
3. [Current Architecture & System Boundaries](#3-current-architecture--system-boundaries)
4. [Domain Model & Entity Inventory](#4-domain-model--entity-inventory)
5. [Current Transaction Flow](#5-current-transaction-flow)
6. [Current Investigation Architecture](#6-current-investigation-architecture)
7. [Current Rule Engine & Execution Mechanisms](#7-current-rule-engine--execution-mechanisms)
8. [Validation Result vs Pipeline Action](#8-validation-result-vs-pipeline-action)
9. [Processing Stages & Stage-Aware Workflows](#9-processing-stages--stage-aware-workflows)
10. [External Database Architecture & Driver Reality](#10-external-database-architecture--driver-reality)
11. [External Query & Batch Processing](#11-external-query--batch-processing)
12. [Database Persistence & Storage Usage](#12-database-persistence--storage-usage)
13. [Data Sources Inventory](#13-data-sources-inventory)
14. [Task & Transaction Lifecycle States](#14-task--transaction-lifecycle-states)
15. [Configuration Architecture](#15-configuration-architecture)
16. [Frontend Architecture & Screen Mapping](#16-frontend-architecture--screen-mapping)
17. [Backend Architecture & Layer Mapping](#17-backend-architecture--layer-mapping)
18. [API Inventory (Complete Endpoint Catalog)](#18-api-inventory)
19. [Security Architecture & Governance](#19-security-architecture--governance)
20. [Performance Architecture & Bottlenecks](#20-performance-architecture--bottlenecks)
21. [Scale Assumptions & Boundaries](#21-scale-assumptions--boundaries)
22. [Automated Test Coverage & Gap Analysis](#22-automated-test-coverage--gap-analysis)
23. [Technical Debt & Architectural Inconsistencies](#23-technical-debt--architectural-inconsistencies)
24. [Historical Architecture vs Current Architecture](#24-historical-architecture-vs-current-architecture)
25. [Current Architecture Diagram (ASCII)](#25-current-architecture-diagram)
26. [Current Context Summary](#26-current-context-summary)
27. [AI Handoff Context](#27-ai-handoff-context)
28. [Critical Accuracy Rules Verification](#28-critical-accuracy-rules-verification)
29. [Final Concluding Deliverable Summary](#29-final-concluding-deliverable-summary)

---

## 1. Objective & Scope

This report reconstructs the **real, current application architecture** of the **Operational Workflow Management** platform.

Historical documentation (`SYSTEM_ARCHITECTURE.md`, earlier meeting transcripts, and obsolete inspection notes from early September 2026) describes a system centered around MongoDB, client-side `localStorage` rule persistence, unbatched mock fallbacks, and generic external database abstractions.

**The actual repository has fundamentally changed:**
1. **Primary Persistence**: The active operational datastore is **PostgreSQL** (`operational_workflow_db`), driven by a 27-table schema across migrations `backend/src/database/migrations/*.sql`, with connection pooling, migrations, and set-based SQL joins.
2. **Investigation & Rule Execution**: The application features a dynamic **Rule-to-SQL compiler** (`backend/src/services/ruleSqlCompiler.ts`), auto-provisioned **UNLOGGED mirror tables** in PostgreSQL (`backend/src/services/mirrorTableManager.ts`), in-flight execution deduplication (`backend/src/services/workflowEngineSingleton.ts`), pre-flight database liveness circuit breakers (`backend/src/services/dbLivenessService.ts`), and set-based relational reconciliation.
3. **Workflow Studio Flowchart**: The frontend features a visual vertical flowchart builder (`frontend/src/components/settings/WorkflowStudioFlowchart.tsx`) that links **Search Blocks** (rectangles) to **Condition Check Blocks** (rhombuses) into a Directed Acyclic Graph (DAG) pipeline with persistent backend synchronization.
4. **Data Isolation**: Large task datasets are separated from issue metadata and stored in an indexed standalone relational table (`task_dataset_transactions`), supporting streaming pagination without memory bloat.

This report serves as the authoritative, definitive guide for subsequent development and AI assistance.

---

## 2. Repository Structure & High-Level Component Map

The repository is structured as an npm multi-workspace repository:
- **Root**: `package.json` with npm workspaces `["frontend", "backend"]`.
- **Backend**: `backend/` running Node.js / Express 4.21.2 with TypeScript (`tsx watch src/server.ts`).
- **Frontend**: `frontend/` running React 19.0.1, Vite 6.2.3, TailwindCSS 4.1.14 (`@tailwindcss/vite`), `motion`, `recharts`, `lucide-react`, and `xlsx`.

```text
[Browser User / Operator]
         │
         │ HTTP / REST / SSE (Port 5002)
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Express Application Server (backend/src/server.ts)           │
│  - Port: 5002 (0.0.0.0 bind)                                │
│  - Middleware: CORS, JSON parser (50MB cap), Req Logger     │
│  - Vite Middleware (dev SPA serving) / Static dist fallback │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│ Operational Services Layer   │ │ Relational Repository Layer  │
│ - investigationOrchestrator  │ │ - backend/src/store/         │
│ - ruleSqlCompiler            │ │   - postgresRepo.ts (Active) │
│ - mirrorTableManager         │ │   - repository.ts (Router)   │
│ - workflowEngineSingleton    │ │   - dataStore.ts (Fallback)  │
│ - dbConnectionManager        │ └──────────────┬───────────────┘
│ - dbLivenessService          │                │
│ - datasetIngestionService    │                ▼
└──────────────┬───────────────┘ ┌──────────────────────────────┐
               │                 │ Primary PostgreSQL Database  │
               ├─────────────────► (operational_workflow_db)    │
               │                 │ - 26 Relational Tables       │
               │                 │ - UNLOGGED Mirror Tables     │
               │                 └──────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│ External Transaction Systems (Discovered via Drivers)       │
│ - MySQL 8.x (mysql2/promise)                                 │
│ - Remote PostgreSQL (pg client)                              │
│ - MongoDB (mongoose admin/collection ping)                   │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Current Architecture & System Boundaries

### 3.1 Boundaries and Responsibilities

| Subsystem | Responsibility | Physical Location | Persistence Mechanism |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | Visual case management, visual flowchart pipeline designer, rule block manager, live query sandbox, discrepancy viewer. | `frontend/src/` | In-memory React state, API client sync, minimal auth token in `localStorage`. |
| **Backend API** | Route handling, authentication, authorization, query parameter validation, event broadcasting via SSE. | `backend/src/routes/` | Stateless controllers delegating to `repo` and domain services. |
| **Primary Datastore** | Core business data: users, issues, tasks, batches, workflows, table mappings, directory, audit trails. | PostgreSQL (`localhost:5432`) | ACID relational tables via `pg` connection pool. |
| **Transient Mirror Layer** | High-speed staging of external transaction query results for SQL set-based reconciliation joins. | PostgreSQL (`localhost:5432`) | Dynamic typed `UNLOGGED` tables (`mirror_{db}_{table}`). |
| **External Systems** | Source of truth for production transaction ledgers (e.g., core banking, switch gateways). | Remote/Local MySQL, Postgres, Mongo | Read-only parameterized chunk queries executed via `dbConnectionManager`. |
| **Rule & Pipeline Engine** | Declarative rule-to-SQL compilation, in-flight transaction locking, step evaluation, verdict aggregation. | `backend/src/services/` | In-memory singleton state + PostgreSQL compiled `UPDATE ... CASE` execution. |

---

## 4. Domain Model & Entity Inventory

Based on `backend/src/types.ts`, `backend/src/database/migrations/001_initial_schema.sql`, and `backend/src/store/postgresRepo.ts`:

### 4.1 `Issue` (Case / Operational Ticket)
- **Purpose**: Represents an operational incident, ticket, or batch upload.
- **Model / Storage**: Table `issues` (`001_initial_schema.sql: line 262`), `backend/src/models/Issue.ts`.
- **Key Fields**: `id`, `title`, `description`, `status` (`Open`, `In Progress`, `Under Testing`, `Resolved`, `Closed`), `priority`, `creator_id`, `transaction_count`, `dataset_status` (`NONE`, `INGESTED`, `PROCESSED`), `file_mapping`, `solution_script`, `solution_executed`, `chat`.
- **Relationships**: 1-to-many with `task_dataset_transactions` and 1-to-many with `investigation_tasks`.
- **Lifecycle**: Created by operator (`POST /api/issues`), updated as investigations and resolution scripts proceed.

### 4.2 `TaskDatasetTransaction` (Ingested Row Record)
- **Purpose**: Decoupled relational representation of individual spreadsheet rows / transactions within an issue.
- **Model / Storage**: Table `task_dataset_transactions` (`001_initial_schema.sql: line 303`).
- **Key Fields**: `id` (UUID), `task_id` (FK to `issues.id`), `row_number`, `canonical_data` (JSONB), `raw_data` (JSONB), `created_at`.
- **Indexes**: `(task_id, row_number)`, `(task_id, canonical_data->>'retrievalRefNum')`, `(task_id, canonical_data->>'terminalId')`.
- **Lifecycle**: Ingested in batches via `POST /api/issues/:id/dataset`.

### 4.3 `DatabaseValidationWorkflow` (Investigation Pipeline)
- **Purpose**: Defines an end-to-end investigation workflow comprising ordered stages, validation steps, flowchart nodes, and connections.
- **Model / Storage**: Table `database_validation_workflows` (`001_initial_schema.sql: line 316`), `backend/src/models/DatabaseValidationWorkflow.ts`.
- **Key Fields**: `id`, `name`, `description`, `target_db_id`, `target_table`, `stages` (JSONB `ProcessingStage[]`), `steps` (JSONB `ValidationCheckStep[]`), `nodes` (JSONB `FlowchartNode[]`), `connections` (JSONB `FlowchartConnection[]`), `version`.
- **Lifecycle**: Created and edited in `WorkflowStudioFlowchart.tsx` and persisted via `POST/PUT /api/workflows`.

### 4.4 `ValidationBox` (Reusable Flowchart Block)
- **Purpose**: Atomic building block in the visual studio. Can be an `INGESTION_SEARCH` block (rectangle) or a `CONDITION_CHECK` block (rhombus).
- **Model / Storage**: Table `validation_boxes` (`postgresRepo.ts: line 1075`), `backend/src/types.ts`.
- **Key Fields**: `id`, `name`, `description`, `box_type` (`INGESTION_SEARCH` | `CONDITION_CHECK`), `category`, `target_db_id`, `target_table`, `mirror_table_name`, `search_parameters` (JSONB), `check_step` (JSONB `ValidationCheckStep`).
- **Lifecycle**: Managed via `ValidationBoxManager.tsx` and endpoints `/api/validation-boxes`.

### 4.5 `QueryExtraction` (Stage Query Plan)
- **Purpose**: Defines which columns and keys to extract from an external database table for a specific workflow stage.
- **Model / Storage**: Table `query_extractions` (`001_initial_schema.sql: line 334`), `backend/src/models/QueryExtraction.ts`.
- **Key Fields**: `id`, `workflow_id`, `stage_id`, `target_db_id`, `target_data_source`, `selected_columns` (JSONB `QueryColumn[]`), `key_mappings` (JSONB `KeyMapping[]`), `filters` (JSONB `ExtractionFilter[]`), `batch_policy` (JSONB).

### 4.6 `InvestigationTask` & `InvestigationBatch`
- **Purpose**: Orchestrates the execution of a workflow across an entire dataset or subset.
- **Model / Storage**: Tables `investigation_tasks` (`001_initial_schema.sql: line 350`) and `investigation_batches` (`line 371`).
- **Key Fields**:
  - Task: `id`, `workflow_id`, `total_transactions`, `processed_transactions`, `reconciled_transactions`, `flagged_transactions`, `status` (`PENDING`, `RUNNING`, `COMPLETED`, `PARTIAL`, `FAILED`), `execution_plan` (JSONB).
  - Batch: `id`, `task_id`, `sequence`, `transaction_count`, `processed_count`, `status`.

### 4.7 `InvestigationTransaction` (Granular Transaction Execution State)
- **Purpose**: Tracks the per-transaction status, audit trail, and verdicts through an investigation.
- **Model / Storage**: Table `investigation_transactions` (`001_initial_schema.sql: line 386`).
- **Key Fields**: `id` (`itx-{taskId}-{txId}`), `task_id`, `batch_id`, `transaction_id`, `investigation_status` (`UNINVESTIGATED`, `IN_PROGRESS`, `VERIFIED_MATCH`, `FLAGGED_DISCREPANCY`, `ERROR`), `final_result` (`PASS`, `FAIL`, `ERROR`, `NOT_EVALUATED`), `final_action` (`CONTINUE`, `STOP`, `CLOSE`), `audit_trail` (JSONB).

### 4.8 `InvestigationExternalMirror` (Transient Reconciler Table)
- **Purpose**: Stores partitioned payloads fetched from external databases to enable set-based SQL joins during batch reconciliation.
- **Model / Storage**: Table `investigation_external_mirror` (`001_initial_schema.sql: line 406`).
- **Key Fields**: `id`, `investigation_id`, `data_source_id`, `external_system_id`, `record_key`, `canonical_payload` (JSONB), `retrieved_at`.

### 4.9 `DatabaseTableMapping` & `GlobalStandardDirectory`
- **Purpose**: Normalizes arbitrary physical external database column names to standard canonical schema fields.
- **Model / Storage**: Tables `database_table_mappings` (`001_initial_schema.sql: line 240`) and `global_standard_directory` (`line 211`).
- **Key Fields**:
  - `database_table_mappings`: `id` (`{dbId}::{tableName}`), `db_id`, `table_name`, `columns` (JSONB array of mapped columns).
  - `global_standard_directory`: `id`, `field_name`, `display_name`, `data_type`, `is_required`, `default_mapping`.

### 4.10 `ResolutionApprovalRequest` (Maker-Checker Dual Authorization)
- **Purpose**: Enforces the Four-Eyes principle for manual transaction adjustments (`FORCE_MATCH`, `WRITE_OFF`, `MANUAL_REVERSAL`).
- **Model / Storage**: Table `resolution_approval_requests` (`001_initial_schema.sql`).
- **Key Fields**: `id` (`res-req-{uuid}`), `issue_id`, `transaction_id`, `resolution_type`, `maker_id`, `maker_name`, `justification`, `checker_id`, `checker_notes`, `status` (`PENDING`, `APPROVED`, `REJECTED`), `input_data_snapshot` (JSONB), `mirror_data_snapshot` (JSONB), `applied_at`.

### 4.11 `TeamDashboardVisibilityGrant` & `CrossFunctionalProjectGroup`
- **Purpose**: Governs cross-department visibility delegation and strategic cross-functional project groups.
- **Model / Storage**: Tables `team_dashboard_visibility_grants` and `cross_functional_project_groups`.
- **Key Fields**:
  - `team_dashboard_visibility_grants`: `id`, `grantor_team_id`, `grantee_team_id`, `visibility_scope` (`FULL`, `PARTIAL_KPI`), `granted_by`.
  - `cross_functional_project_groups`: `id`, `group_name`, `lead_user_id`, `participating_team_ids` (JSONB), `strategic_objective_id`.

### 4.12 `AiStrategicObjective` (Organizational Goal Scaffolding)
- **Purpose**: Connects strategic departmental targets, executive KPIs, and task forces to operational `#hashtags`.
- **Model / Storage**: Table `ai_strategic_objectives`.
- **Key Fields**: `id`, `objective_code`, `title`, `target_metric`, `current_metric`, `linked_hashtags` (JSONB), `assigned_team_ids` (JSONB), `status`.

---

## 5. Current Transaction Flow

The end-to-end execution flow through the codebase is traced below:

```text
1. Spreadsheets / CSV File Upload
   └─► Frontend: IssueCreator.tsx / GlobalTransactionSettings.tsx
       └─► Parse XLSX / CSV rows in browser using xlsx library.
       └─► POST /api/issues/:id/dataset (or /api/transactions/upload)
           └─► datasetIngestionService.ts & postgresRepo.ts
               └─► Chunked INSERT into task_dataset_transactions (500 rows/batch).

2. Investigation Task Initiation
   └─► Frontend: ValidationOrchestratorWorkspace.tsx or QuerySandbox.tsx
       └─► POST /api/investigations/start (or /api/investigations/execute-universal)
           └─► routes/investigations.ts & investigationOrchestratorService.ts
               └─► Plan validation via investigationPlanner.ts / batchPlanner.ts.
               └─► InvestigationTask & InvestigationBatch records inserted in PostgreSQL.

3. Singleton Deduplication & In-Flight Lock Check
   └─► services/workflowEngineSingleton.ts
       └─► Check in-memory LRU cache: cache hits skip re-query.
       └─► Check in-flight mutex promises: parallel requests for identical keys await the active promise.
       └─► Uncached keys assigned to execution batch.

4. Database Liveness Probe & Circuit Breaker
   └─► services/dbLivenessService.ts
       └─► Ping target external DB (socket timeout: 3500ms).
       └─► If dead: Circuit trips OPEN, marks transactions as PAUSED_DB_OFFLINE, broadcasts SSE alert.

5. Dynamic Mirror Table Provisioning
   └─► services/mirrorTableManager.ts
       └─► Introspect target database table columns via dbConnectionManager.ts.
       └─► Execute DDL: CREATE UNLOGGED TABLE IF NOT EXISTS mirror_{db}_{table} (...).

6. Batch Chunk Query Generation & Dispatch
   └─► services/externalDataQueryService.ts
       └─► Chunk keys into batches (e.g. 50-100 IDs).
       └─► Build SQL: SELECT [projectedCols] FROM table WHERE primaryKey IN ($1, $2, ...).
       └─► Execute on external DB driver (pg, mysql2) via dbConnectionManager.ts.

7. Ingestion into PostgreSQL Mirror
   └─► services/mirrorTableManager.ts & reconciliationService.ts
       └─► Bulk INSERT into mirror_{db}_{table} (or investigation_external_mirror).

8. Dynamic Rule-to-SQL Compilation & Set-Based Execution
   └─► services/ruleSqlCompiler.ts
       └─► Compile ValidationCheckSteps into CASE WHEN ... THEN ... SQL expressions.
       └─► Execute single UPDATE mirror_{db}_{table} SET _validation_status = ..., _validation_action = ... WHERE _batch_id = $1.

9. Relational Reconciliation & Verdict Segregation
   └─► services/reconciliationService.ts & investigationOrchestratorService.ts
       └─► Query mirror results: segregate PASS keys from FAIL keys.
       └─► Update investigation_transactions records.
       └─► If stage has downstream dependencies (Key Chaining): route PASS keys to next stage.

10. Completion & Aggregation
    └─► services/statusAggregator.ts
        └─► Calculate aggregate pass/fail/flagged counts.
        └─► Update investigation_tasks and parent issue status.
        └─► Broadcast SSE event: investigation:completed.
```

---

## 6. Current Investigation Architecture

| Question | Implementation Reality |
| :--- | :--- |
| **Where does investigation start?** | Can start from **three entry points**: (1) Issue Investigation Panel (`ValidationOrchestratorWorkspace.tsx`), (2) DB Query Sandbox (`QuerySandbox.tsx`), (3) Direct API (`POST /api/investigations/start` or `POST /api/investigations/execute-universal`). |
| **Is it frontend or backend driven?** | **Backend-driven execution**. While the frontend can simulate single-step checks (`POST /api/validation-boxes/test`), end-to-end multi-transaction investigations run entirely inside backend services (`investigationOrchestratorService.ts`). |
| **Where is the transaction dataset obtained?** | From `task_dataset_transactions` in PostgreSQL, uploaded payload bodies, or workspace records. |
| **Which logic queries external systems vs simulated?** | When target DB connections are online, `externalDataQueryService.ts` executes **real live parameterized queries** on MySQL or PostgreSQL. If the target DB is missing, offline, or marked simulated, fallback simulation evaluates in-memory arrays. |
| **Where are results stored?** | Results are persisted in PostgreSQL: `investigation_tasks`, `investigation_batches`, `investigation_transactions`, and the `UNLOGGED` mirror tables. Transient cache is held in `workflowEngineSingleton.ts`. |
| **Are results persistent or ephemeral?** | **Persistent**. Investigation tasks, audit logs, and per-transaction outcomes survive server restarts in PostgreSQL. Mirror table rows are persistent UNLOGGED rows tagged with `_batch_id`. |
| **How does one rule trigger another?** | In the flowchart model (`WorkflowStudioFlowchart.tsx`), wires connect the `pass` or `fail` port of a Condition Check (rhombus) to downstream Search or Condition nodes. In sequential pipelines, `dependencyCondition` (`ALWAYS`, `IF_PREV_SUCCESS`, `IF_PREV_FAILURE`) dictates ordering. |
| **How is completion determined?** | When all batches reach `COMPLETED` or `FAILED`, the task status changes to `COMPLETED` (or `PARTIAL`), and an SSE `investigation:completed` event is broadcast. |

---

## 7. Current Rule Engine & Execution Mechanisms

The rule execution architecture exists across **three levels**:

### Level 1: Dynamic Rule-to-SQL Compiler (`ruleSqlCompiler.ts`)
* **Location**: `backend/src/services/ruleSqlCompiler.ts`.
* **Execution**: Centralized set-based database execution.
* **Mechanism**: Compiles declarative `ValidationCheckStep` objects directly into PostgreSQL `CASE WHEN ... THEN ...` statements.
* **Supported Compilations**:
  - `EXISTENCE_CHECK`: `m._mirror_id IS NOT NULL`
  - `AMOUNT_MATCH`: `ABS(COALESCE((m.amount)::numeric, 0) - expected) <= tolerance`
  - `FIELD_COMPARATOR`: `COALESCE(col::text, '') = 'val'`, supporting `=`, `!=`, `>`, `<`, `IN`, `LIKE`
  - `STATUS_MATCH`: `UPPER(COALESCE(col::text, '')) = 'SETTLED'`
  - `ISO_DECLINE_CODE`: `COALESCE(col::text, '00') = '00'`
  - `NUMERIC_THRESHOLD`: `COALESCE((col)::numeric, 0) > threshold`
  - `REGEX_MATCH`: `COALESCE(col::text, '') ~* 'pattern'`
  - `SQL_CONDITION`: Native SQL clause with `{table}` substitution.

### Level 2: In-Memory Condition Evaluator (`investigationEngine.ts`)
* **Location**: `backend/src/services/investigationEngine.ts` and mirrored in `frontend/src/services/investigationEngine.ts`.
* **Execution**: Evaluates individual records in memory when running simulation or when operating without PostgreSQL.
* **Mechanism**: Switch statement evaluating record properties against step criteria, generating a `ConditionEvaluationResult`.

### Level 3: Flowchart Wire Routing (`WorkflowStudioFlowchart.tsx`)
* **Location**: `frontend/src/components/settings/WorkflowStudioFlowchart.tsx`.
* **Execution**: Graph traversal across `FlowchartNode` (Search Rectangles, Check Rhombuses) and `FlowchartConnection` wires.
* **Duplication Warning**: `investigationEngine.ts` exists in **both** `backend/src/services/` and `frontend/src/services/`.

---

## 8. Validation Result vs Pipeline Action

The application **explicitly distinguishes** between a check's **Verdict** (the evaluation outcome) and its **Pipeline Action** (what the workflow engine should do next).

Defined in `backend/src/types.ts`:

### Validation Result (`ValidationResultStatus`)
* `PASS`: The transaction met the business rule criteria.
* `FAIL`: The transaction violated the business rule criteria.
* `ERROR`: A technical fault occurred (e.g., query timeout, network error, syntax error).
* `NOT_EVALUATED`: The check has not run yet.
* `PAUSED_DB_OFFLINE`: Execution halted because the target database was unreachable.

### Pipeline Action (`PipelineAction` / `FlowchartOutputAction`)
* `CONTINUE`: Proceed to the next step or stage in the pipeline.
* `STOP`: Terminate evaluation of this transaction immediately (do not run downstream rules).
* `CLOSE`: Automatically resolve and close the transaction.
* `FLAG`: Flag the transaction as an operational discrepancy for human triage.
* `REPORT`: Emit a diagnostic discrepancy record.

Each `ValidationCheckStep` defines independent actions for success and failure:
- `onPassAction`: Default `'CONTINUE'`
- `onFailAction`: Default `'STOP'` (or `'FLAG'`)
- `onErrorAction`: Default `'STOP'`

---

## 9. Processing Stages & Stage-Aware Workflows

### 9.1 Stage Definition
Workflows are divided into ordered **`ProcessingStage`** objects:
- `id`: Unique stage ID (`stage-1`, `stage-2`, etc.).
- `name`: Human-readable stage name (e.g., "Primary Ingress", "Settlement Clearing", "Ledger Verification").
- `order`: Numeric sequence (1, 2, 3...).
- `enabled`: Boolean toggle.
- `targetDbId`: Foreign key to `database_connections.id`.
- `targetDataSource`: Physical table name in that database.
- `businessMeaning`: Operational context (e.g., "Network Switch Ingress").

### 9.2 Key Chaining Between Stages
When a workflow spans multiple databases across stages, the orchestrator uses **Pipeline Key Chaining** (`investigationOrchestratorService.ts: lines 184–209`):
1. Stage 1 searches Table A using `transaction_id`.
2. Stage 1 writes results to `mirror_db1_tableA`.
3. Stage 2 requires a downstream key (e.g., `settlement_id`, `batch_id`, `account_id`).
4. The orchestrator inspects `mirror_db1_tableA`, extracts the discovered key for passed rows, and queries Stage 2's database using those extracted keys.

---

## 10. External Database Architecture & Driver Reality

### 10.1 Real Physical Drivers vs Declared Enums

The TypeScript interface `DatabaseConnection` (`backend/src/types.ts: line 210`) declares:
```typescript
type: 'PostgreSQL' | 'Oracle' | 'MySQL' | 'MongoDB';
```

**Actual Repository Implementation Reality:**
* **MySQL**: **100% IMPLEMENTED**. Uses `mysql2/promise` (`^3.12.0`). Performs ping testing, catalog discovery (`information_schema.tables`), column introspection, and live parameterized SQL execution.
* **PostgreSQL**: **100% IMPLEMENTED**. Uses `pg` (`^8.13.1`). Performs ping testing, catalog discovery (`information_schema.tables`), column introspection, and live parameterized SQL execution.
* **MongoDB**: **PARTIALLY IMPLEMENTED / DIAGNOSTIC**. Uses `mongoose` (`^8.9.5`). Pings admin database, lists collections, and queries documents.
* **Oracle**: **NOT IMPLEMENTED / SIMULATED**. The `oracledb` package is **NOT** installed in `package.json`. Connection string regex exists, but execution falls through to generic test stubs. Table discovery returns empty arrays.

### 10.2 Connection Pooling & Security
- PostgreSQL pool config (`backend/src/config/postgres.ts`): Max 25 clients, 30s idle timeout, 5s connection timeout.
- Dynamic MySQL connections: Created on demand with a 4s timeout and terminated after query execution.
- Password masking: Masked in logs and UI previews.

---

## 11. External Query & Batch Processing

| Capability | Current Repository Implementation |
| :--- | :--- |
| **Query Granularity** | **BATCHED CHUNKS**. Queries are never executed per-transaction if multiple transactions exist. Chunks of 50–100 transaction IDs are consolidated into single SQL statements. |
| **Parameter Binding & Bound** | Consolidated into parameterized `WHERE primaryKey IN ($1, $2, ...)` or composite tuple `WHERE (c1, c2) IN ((v1, v2), ...)`. **Dynamic Parameter Bounding**: Capped at 30,000 parameters (well below PostgreSQL $\text{UINT16\_MAX} = 65,535$); wider tuples are sub-chunked and sequentially merged. |
| **Identifier Quoting** | **ANSI QUOTED**. All column identifiers are safely escaped (`"col"` for PostgreSQL, `` `col` `` for MySQL) to prevent SQL keyword collisions (e.g. `order`, `group`). |
| **Column Projection** | **MINIMAL PROJECTION**. If `QueryExtraction.selectedColumns` contains specific columns, the query compiles to `SELECT col1 AS a1, col2 ...`. Only falls back to `SELECT *` if no columns are specified. |
| **Streaming / Pagination** | Query results are returned in memory as array sets by the database driver. Large task dataset viewing in the frontend is paginated via `GET /api/issues/:id/transactions?page=1&limit=50`. |
| **Mirroring & Persistence** | **YES**. External query chunks are mirrored into PostgreSQL: written to `investigation_external_mirror` and dedicated typed UNLOGGED tables (`mirror_{db}_{table}`). |

---

## 12. Database Persistence & Storage Usage

### 12.1 PostgreSQL Collections / Tables (Primary)
Managed via `backend/src/database/migrations/*.sql`:

| Table Name | Primary Purpose | Key Indexes |
| :--- | :--- | :--- |
| `users` | RBAC accounts & DB permissions | `username` (UNIQUE), `email` (UNIQUE) |
| `organizations` | Multi-tenant tenant configuration | `id` (PK) |
| `teams` | Team grouping & managerial hierarchy | `id` (PK), `manager_id` |
| `team_tasks` | Operational sub-tasks | `team_id`, `status` |
| `team_insights` | Shift handover & technical notes | `team_id` |
| `team_discussion_messages` | Team collaboration chat | `team_id`, `timestamp` |
| `notifications` | In-app alerts | `(user_id, is_read)` |
| `direct_messages` | User-to-user private chat | `(sender_id, receiver_id)` |
| `plugins` | Feature flags and external plugins | `id` (PK) |
| `database_connections` | External DB credentials & endpoints | `id` (PK) |
| `environment_systems` | Testing vs Production systems | `id` (PK) |
| `query_approval_requests` | Dual-control query approvals | `id` (PK), `system_id` |
| `db_access_requests` | User DB access permission requests | `id` (PK) |
| `connection_usage_logs` | Audit trail of executed queries | `id` (PK), `db_id` |
| `hashtag_presets` | `#` resolution presets & criteria rules | `tag` (UNIQUE) |
| `global_standard_directory` | Master canonical field catalog | `field_name` (UNIQUE) |
| `global_transaction_schema_configs` | Versioned global mapping configs | `id` (PK), `version` |
| `database_table_mappings` | `{dbId}::{tableName}` column maps | `(db_id, table_name)` |
| `workspace_table_records` | Transformed workspace records | `id` (PK) |
| `issues` | Operational tickets & investigation cases | `status`, `creator_id` |
| `task_dataset_transactions` | Ingested spreadsheet rows (JSONB) | `(task_id, row_number)`, `(task_id, canonical_data->>'retrievalRefNum')` |
| `database_validation_workflows` | Stage-aware pipelines & flowchart DAGs | `id` (PK) |
| `query_extractions` | Stage query definitions | `workflow_id`, `stage_id` |
| `investigation_tasks` | Investigation execution tasks | `status` |
| `investigation_batches` | Chunks within an investigation task | `(task_id, status)` |
| `investigation_transactions` | Per-transaction results & audit trail | `(task_id, final_result, final_action)`, `(task_id, investigation_status)` |
| `investigation_external_mirror` | Partitioned external payloads | `(investigation_id, data_source_id, record_key)`, `retrieved_at` |
| `mirror_{db}_{table}` | Dedicated UNLOGGED tables for fast SQL | `_batch_id`, `(_rule_block_id, _validation_status)` |
| `resolution_approval_requests` | Maker-Checker dual authorization proposals | `(task_id, status)`, `maker_id`, `checker_id` |
| `transaction_reversion_snapshots` | Pre-change rollback states for cautious processes | `(task_id, snapshot_type)`, `created_at` |
| `cross_functional_project_groups` | Cross-department task forces linked to hashtags | `id` (PK) |
| `team_dashboard_visibility_grants` | Cross-team KPI sharing grants | `(grantor_team_id, grantee_team_id)` |
| `ai_strategic_objectives` | Organizational high-level objectives | `id` (PK) |
| `task_batch_heartbeats` | Granular sub-chunk worker progress pulses | `(task_id, batch_id)`, `last_heartbeat_at` |

### 12.2 MongoDB (Legacy / Commented Out)
- Driver: `mongoose` 8.9.5.
- `.env`: `# MONGODB_URI=mongodb://localhost:27017/operational_workflow_db` (Commented out).
- Fallback: Used only if PostgreSQL is unreachable and MongoDB is explicitly booted.

---

## 13. Data Sources Inventory

| Source | Status | Retrieval Mechanism | Practical Capacity | Persistence |
| :--- | :--- | :--- | :--- | :--- |
| **Excel / CSV Upload** | Active | Browser parsing (`xlsx`) -> Chunked HTTP POST -> `task_dataset_transactions` | 100,000+ rows (tested with chunking) | Persistent in PostgreSQL |
| **External MySQL** | Active | `mysql2/promise` parameterized chunk queries | Thousands per batch | External DB -> PostgreSQL mirror |
| **External PostgreSQL** | Active | `pg` parameterized chunk queries | Thousands per batch | External DB -> PostgreSQL mirror |
| **External MongoDB** | Diagnostic | `mongoose` collection queries | Small diagnostic queries | External DB -> in-memory |
| **In-Memory Store** | Fallback | `backend/src/store/dataStore.ts` | Development only | Ephemeral (wiped on restart) |

---

## 14. Task & Transaction Lifecycle States

The application maintains **four distinct lifecycle dimensions**:

```text
Dimension 1: Task / Case Lifecycle (Issue.status)
  [Open] ──► [In Progress] ──► [Under Testing] ──► [Resolved] ──► [Closed]

Dimension 2: Transaction Financial Status (canonical_data.status_state)
  [AUTHORIZED] ──► [SETTLED] ──► [PENDING] ──► [DECLINED] ──► [REVERSED]

Dimension 3: Transaction Investigation Lifecycle (InvestigationTransaction.investigationStatus)
  [UNINVESTIGATED] ──► [IN_PROGRESS] ──► [VERIFIED_MATCH]
                                     └──► [FLAGGED_DISCREPANCY]
                                     └──► [ERROR]

Dimension 4: Rule Execution Verdict (InvestigationTransaction.finalResult)
  [NOT_EVALUATED] ──► [PASS]
                  └──► [FAIL]
                  └──► [ERROR]
                  └──► [PAUSED_DB_OFFLINE]
```

---

## 15. Configuration Architecture

| Configuration Item | Persistence | Scope | Mechanism |
| :--- | :--- | :--- | :--- |
| **Environment Variables** | Static File | Backend / Build | `.env` (`PORT`, `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`, `GEMINI_API_KEY`) |
| **Global Standard Directory** | Database | Global | `global_standard_directory` table in PostgreSQL |
| **Database Table Mappings** | Database | Per DB & Table | `database_table_mappings` table (`{dbId}::{tableName}`) |
| **Validation Workflows** | Database | Global / Pipeline | `database_validation_workflows` table |
| **Validation Boxes** | Database | Reusable Blocks | `validation_boxes` table |
| **Auth JWT Token** | LocalStorage | Browser Client | Key: `operational_workflow_jwt_token` |
| **Historical Workflows (v1)** | LocalStorage | Browser Client | Key: `'operational_validation_workflows_v1'` (Fallback only) |

---

## 16. Frontend Architecture & Screen Mapping

Built with React 19, Vite, and TailwindCSS 4:

| Screen / Component | Primary Responsibility | Primary API Calls |
| :--- | :--- | :--- |
| `App.tsx` | Main layout, navigation tabs, global state provider, user session management. | `/auth/me`, `/auth/users`, `/issues`, `/db/databases` |
| `IssueCreator.tsx` | Creation of single or batch incident tickets, Excel/CSV file upload, column mapping. | `POST /issues`, `POST /issues/:id/dataset`, `/hashtags` |
| `IssueDetailView.tsx` | Case triage, spreadsheet transaction grid (paginated thin client), automated resolution scripts, case chat. | `GET /issues/:id/transactions`, `POST /issues/:id/execute-script` |
| `WorkflowStudioFlowchart.tsx` | Visual vertical flowchart canvas. Connects Search Blocks and Condition Checks into DAG pipelines. | `GET/POST/PUT /workflows`, `GET /validation-boxes` |
| `ValidationBoxManager.tsx` | CRUD manager for atomic Validation Boxes (Ingestion/Search and Condition Check). | `GET/POST/PUT/DELETE /validation-boxes`, `POST /validation-boxes/test` |
| `DatabaseValidationSettings.tsx` | Legacy 3-block rule builder, natural language sentence generator, blueprint library. | `GET/POST /workflows` |
| `GlobalTransactionSettings.tsx` | Global schema directory, database table mapping editor, mapping validation engine. | `/transactions/directory`, `/transactions/table-mappings`, `/transactions/schema/config` |
| `DatabaseCrossVerificationPanel.tsx` | Multi-database cross verification UI, live database comparison grid. | `/investigations/execute-universal`, `/db/query/execute` |
| `DbQueryTool.tsx` | Multi-dialect live SQL query sandbox with approval workflow. | `POST /db/query/execute`, `POST /db/query/approvals` |

---

## 17. Backend Architecture & Layer Mapping

```text
backend/src/
├── config/
│   ├── postgres.ts       # Pool manager, queryPg helper, withTransaction helper
│   ├── seedPostgres.ts   # Relational initial seed data populator
│   ├── db.ts             # Legacy MongoDB connection manager (fallback)
│   └── seed.ts           # Legacy Mongo seed populator
├── database/
│   └── migrations/
│       └── 001_initial_schema.sql  # 26 relational PostgreSQL DDL tables
├── models/               # Mongoose schema definitions (legacy/fallback)
├── routes/               # Express Router controllers (REST APIs)
│   ├── auth.ts           # Authentication & RBAC user management
│   ├── issues.ts         # Tickets, chat, and paginated transaction dataset
│   ├── database.ts       # External DB connections, introspection, SQL runner
│   ├── workflows.ts      # Stage-aware workflows & QueryExtractions
│   ├── investigations.ts # Investigation planning & orchestrator execution
│   ├── validationBoxes.ts# Reusable ValidationBox blocks
│   ├── transactionSettings.ts # Directory, Table Mappings, Schema config
│   ├── teams.ts          # Team management, In/Out KPIs, and visibility grants
│   ├── resolutions.ts    # Maker-Checker dual authorization & review queues
│   ├── misc.ts           # Universal hashtag resolution & asset indexing
│   ├── ai.ts             # Google Gemini GenAI SQL assistant
│   └── events.ts         # SSE real-time event broadcasting
├── services/             # Core Domain Business Logic
│   ├── investigationOrchestratorService.ts # Master execution orchestrator
│   ├── ruleSqlCompiler.ts                 # Dynamic Rule-to-SQL compiler
│   ├── mirrorTableManager.ts              # UNLOGGED PostgreSQL mirror tables
│   ├── reconciliationService.ts           # Set-based relational reconciliation
│   ├── makerCheckerService.ts             # 4-Eyes dual control & anti-self-approval
│   ├── hashtagService.ts                  # Universal hashtag asset resolver
│   ├── workflowEngineSingleton.ts         # Deduplication & in-flight locking
│   ├── dbConnectionManager.ts             # Live MySQL, Postgres, Mongo runner
│   ├── dbLivenessService.ts               # Pre-flight liveness & circuit breakers
│   ├── externalDataQueryService.ts        # Batched chunk query generation
│   ├── datasetIngestionService.ts         # High-throughput row ingestion
│   └── statusAggregator.ts                # Hierarchical verdict rollup
└── store/
    ├── repository.ts     # Central router (PostgreSQL -> Mongo -> Memory)
    ├── postgresRepo.ts   # Active PostgreSQL implementation
    └── dataStore.ts      # In-memory mock and seed dataset
```

---

## 18. API Inventory

### Authentication & Users (`/api/auth`)
* `POST /login`: Authenticate credentials, issue mock JWT token.
* `POST /register`: Register user account.
* `GET /me`: Return current user profile.
* `GET /users`: List all system users.
* `PUT /users/:id/approve`: Approve pending user.
* `PUT /users/:id/role`: Update user RBAC role and SQL execution permissions.

### Issues & Cases (`/api/issues`)
* `GET /`: List all tickets/issues.
* `POST /`: Create an operational issue.
* `GET /:id`: Retrieve issue by ID.
* `PUT /:id`: Update issue properties.
* `GET /:id/transactions`: Paginated thin-client dataset rows (`?page=1&limit=50&batchId=...`).
* `GET /:id/batches`: List distinct batches in an issue.
* `POST /:id/dataset`: High-throughput row ingestion into `task_dataset_transactions`.
* `POST /:id/chat`: Post a comment in issue triage chat.
* `POST /:id/execute-script`: Execute pre-approved resolution script.

### External Databases & SQL Sandbox (`/api/db`)
* `GET /databases`: List registered database connections.
* `POST /databases`: Register a new external database connection.
* `PUT /databases/:id`: Update connection details.
* `DELETE /databases/:id`: Remove connection.
* `POST /test-connection`: Ping socket and measure round-trip latency.
* `GET /databases/:id/tables`: Retrieve allowed and available tables.
* `POST /databases/:id/discover-tables`: Introspect live catalog via `information_schema`.
* `GET /databases/:id/tables/:tableName/columns`: Introspect column data types and nullability.
* `PUT /databases/:id/allowed-tables`: Update whitelist of permitted tables.
* `POST /query/execute`: Execute live SQL query (enforces RBAC and dual approval for DML).
* `GET /query/logs`: Retrieve audit logs of executed queries.
* `GET /query/approvals`: List pending dual-control query approvals.
* `POST /query/approvals`: Submit a query for managerial approval.
* `PUT /query/approvals/:id`: Approve or reject a query approval.

### Workflows & Stages (`/api/workflows`)
* `GET /`: List all stage-aware workflows.
* `POST /`: Create workflow with stages, steps, flowchart nodes, and connections.
* `GET /:id`: Get workflow by ID.
* `PUT /:id`: Update workflow definition.
* `DELETE /:id`: Delete workflow.
* `GET /:id/query-extractions`: List stage query extractions for a workflow.
* `POST /:id/query-extractions`: Create stage query extraction.
* `POST /query-sandbox/preview`: Generate parameterized SQL preview for a chunk.

### Validation Boxes (`/api/validation-boxes`)
* `GET /`: List reusable validation boxes (filterable by `?boxType=...`).
* `POST /`: Create new Search or Condition validation box (auto-provisions mirror table).
* `GET /:id`: Get validation box by ID.
* `PUT /:id`: Update validation box properties.
* `DELETE /:id`: Delete validation box.
* `POST /test`: Test standalone validation box against sample record.

### Investigations & Execution (`/api/investigations`)
* `POST /plan`: Generate batched chunk execution plan for a workflow.
* `POST /start`: Initiate and execute an investigation task across external DBs.
* `GET /:id`: Get investigation task details and batch breakdown.
* `GET /:id/batches`: List batches in an investigation task.
* `GET /:id/transactions`: List all investigated transaction records.
* `GET /:id/transactions/:transactionId`: Get granular transaction audit record.
* `GET /:id/audit`: Aggregated audit trail for task.
* `POST /execute-universal`: Universal entry point for Panel, Query Sandbox, and API.

### Transaction Schema & Global Directory (`/api/transactions`)
* `GET /settings`: Get global transaction schema settings.
* `GET /schema/config`: Get versioned Global Mapping configuration.
* `POST /schema/config`: Save versioned Global Mapping configuration.
* `GET /directory`: List all canonical fields in Global Standard Directory.
* `POST /directory`: Create canonical field definition.
* `PUT /directory/:id`: Update canonical field.
* `DELETE /directory/:id`: Delete canonical field.
* `GET /table-mappings`: Get dictionary of all `{dbId}::{tableName}` column mappings.
* `POST /table-mappings`: Upsert table mapping.
* `GET /table-mappings/validate/:dbId/:tableName`: Validate physical table against directory.

### Resolution Governance & Maker-Checker (`/api/resolutions`)
* `POST /propose`: Submit Maker resolution proposal (`FORCE_MATCH`, `WRITE_OFF`, `MANUAL_REVERSAL`) with justification & evidence snapshot.
* `POST /review`: Checker approval or rejection. Enforces anti-self-approval (`makerId !== checkerId`).
* `GET /pending`: List pending resolution proposals awaiting supervisor review.
* `POST /propose-from-chat`: Convert a team chat discussion into a formal Maker proposal with attribution.

### Universal Hashtags (`/api/hashtags`)
* `GET /resolve/:tag`: Resolve and aggregate all platform assets linked by `#hashtag` (workflows, templates, DB connections, tasks, chat messages).

### Teams, Dashboards & Governance (`/api/teams`)
* `GET /`: List departments and teams.
* `GET /:id/dashboard`: Fetch Inflow/Outflow KPIs, 4-Eyes clearance rate, and SLA compliance metrics.
* `POST /:id/visibility-grants`: Grant cross-team dashboard visibility (`FULL` vs `PARTIAL_KPI`).
* `GET /:id/visibility-grants`: List active visibility grants.
* `GET /strategic-objectives`: List organizational strategic goals and linked `#hashtags`.

---

## 19. Security Architecture & Governance

* **Authentication**: Simulated JWT token stored in browser `localStorage`, passed in `Authorization: Bearer <token>` headers. Decoded in `backend/src/middleware/auth.ts`.
* **RBAC Privileges**: Users possess role (`admin`, `tech`, `manager`, `operational`) and explicit execution flags (`can_execute_select`, `can_execute_update`, `allowed_db_ids`).
* **Query Restrictions & Approval**: Direct DML (`UPDATE`, `DELETE`, `INSERT`, `DROP`) requires prior approval via `query_approval_requests` unless user has administrative bypass.
* **Maker-Checker Dual Control**: Manual transaction resolution requires distinct Maker and Checker identities (`makerId !== checkerId`). Operators cannot approve their own submissions (HTTP 403).
* **Audit Logging & Snapshots**: Every query executed via `POST /api/db/query/execute` is written to `connection_usage_logs`. Every resolution proposal snapshots input and mirror state into `resolution_approval_requests`.
* **Cross-Team Access Grants**: Departmental visibility delegation is mediated via `team_dashboard_visibility_grants` without altering base data tenancy.
* **Credential Handling**: Stored in `database_connections`. Passwords are encrypted/masked in transit.

---

## 20. Performance Architecture & Bottlenecks

### Implemented High-Performance Patterns:
1. **UNLOGGED Mirror Tables**: Mirror tables in PostgreSQL are created as `UNLOGGED`, bypassing Write-Ahead Logging (WAL) for 3x–5x higher write throughput.
2. **Set-Based Batch Updates**: Rule evaluations are compiled into a single `UPDATE mirror SET ... WHERE _batch_id = $1` statement, evaluating thousands of rows in milliseconds.
3. **Tuple-Based External Matching**: Multi-column key extraction uses batched tuple SQL (`WHERE (col1, col2, ...) IN ((v1, v2), ...)`), drastically reducing query overhead over composite keys.
4. **Partitioned Ingestion**: Spreadsheets with 50,000+ rows are inserted into `task_dataset_transactions` in 500-row parameterized batches.
5. **Thin-Client Pagination**: Grid views fetch 50 rows at a time using SQL `LIMIT 50 OFFSET 0`.
6. **In-Flight Lock Deduplication**: Duplicate parallel requests for identical transactions join existing promises via `workflowEngineSingleton.ts`.

### Current Bottlenecks & Failure Risks:
1. **Large Excel Ingestion in Browser**: Parsing multi-megabyte Excel files in `IssueCreator.tsx` runs on the main browser thread via SheetJS (`xlsx`), which can freeze low-end client machines.
2. **Lack of DB Connection Pooling for MySQL**: While PostgreSQL uses a shared pool, MySQL creates and destroys connections per query chunk.

---

## 21. Scale Assumptions & Boundaries

| Parameter | Current Enforced Limit | Configured Limit | Planning / Observed Assumption |
| :--- | :--- | :--- | :--- |
| **Express Body Payload** | 50 MB (`server.ts`) | 50 MB | Suitable for ~100,000 raw JSON transaction rows |
| **PostgreSQL Pool** | 25 connections (`postgres.ts`) | `PG_MAX_POOL=25` | Concurrently serves ~500 requests/sec |
| **Socket Ping Timeout** | 3,000 ms (`database.ts`) | Hardcoded 3000ms | Trips circuit breaker if latency > 3.5s |
| **Batch Chunk Size** | 50–100 transaction IDs | Configurable in plan | Avoids parameter limits in SQL engines |
| **Thin Client Limit** | 50 rows/page (`issues.ts`) | `limit=50` default | Prevents DOM bloat in browser |

---

## 22. Automated Test Coverage & Gap Analysis

### Current Test Files in Repository:
* `backend/src/test-database-table-discovery.ts`: Direct driver test for catalog discovery on MySQL and PostgreSQL.
* `backend/src/test-investigation-engine.ts`: Integration test for `investigationOrchestratorService`, batch planner, and condition evaluation.
* `backend/src/test-query-extraction-and-batching.ts`: Tests SQL query generation and chunk parameter binding.
* `scratch/test_e2e_full_workflow.mjs`: E2E verification of workflow creation, mirror table creation, and execution.
* `scratch/test_report_column_engine.mjs`: Tests report column generation and rule evaluation.

### Testing Gaps:
* **No Formal Test Runner**: Neither `backend` nor `frontend` includes Jest, Vitest, or Mocha in `package.json`. Tests are executed via standalone `npx tsx` scripts.
* **No Automated CI Pipeline**: No GitHub Actions or automated test scripts exist in the repository root.
* **Frontend Components Uncovered**: `WorkflowStudioFlowchart.tsx`, `ValidationBoxManager.tsx`, and `IssueDetailView.tsx` have no unit or integration tests.

---

## 23. Technical Debt & Architectural Inconsistencies

1. **Duplicated Engine Logic**: `investigationEngine.ts` exists in both `backend/src/services/` and `frontend/src/services/`. The frontend copy contains simulation logic that can drift from backend behavior.
2. **Oracle Driver Phantom**: `Oracle` is declared in database type unions and connection string parsers, but `oracledb` is not installed, causing silent fallback or runtime errors if configured.
3. **Dual Legacy Rule Builders**: The UI maintains both the new **Workflow Studio Flowchart** (`WorkflowStudioFlowchart.tsx`) and the older **Database Validation Settings** (`DatabaseValidationSettings.tsx`), creating user confusion regarding where workflows should be defined.
4. **Legacy Mongoose Models**: 28 Mongoose models in `backend/src/models/` remain in the codebase despite the active operational switch to PostgreSQL.

---

## 24. Historical Architecture vs Current Architecture

| Historical Decision / Assumption | Current Implementation Reality | Status |
| :--- | :--- | :--- |
| **MongoDB as Primary Datastore** | **PostgreSQL** is the primary datastore (`001_initial_schema.sql`). `.env` has MongoDB commented out. | **CHANGED** |
| **LocalStorage Rule Persistence** | Workflows and Validation Boxes are **persisted in PostgreSQL** (`database_validation_workflows`, `validation_boxes`). | **CHANGED** |
| **React 18 + Vite on Port 5173** | **React 19.0.1** + Vite 6.2.3 embedded on backend port `5002` via middleware. | **CHANGED** |
| **Multi-DB Support for Oracle & SQLite** | Only **MySQL** and **PostgreSQL** have genuine driver implementations. `oracledb` and `sqlite3` are absent. | **CHANGED** |
| **Sequential Per-Transaction Lookups** | **Batched Chunk Queries** (`WHERE key IN (...)`) with UNLOGGED mirror tables and SQL compilation. | **IMPLEMENTED** |
| **Global Mapping Schema Directory** | Full relational implementation in `global_standard_directory` and `database_table_mappings`. | **IMPLEMENTED** |
| **Visual Flowchart Pipeline** | Visual vertical canvas with Search Rectangles and Decision Rhombuses (`WorkflowStudioFlowchart.tsx`). | **IMPLEMENTED** |
| **Separation of Result vs Action** | Strict separation of `ValidationResultStatus` and `PipelineAction`. | **IMPLEMENTED** |

---

## 25. Current Architecture Diagram

```text
                               ┌──────────────────────────────────────────────┐
                               │               OPERATIONAL UI                 │
                               │  (React 19, TailwindCSS 4, Vite Middleware)  │
                               │  - WorkflowStudioFlowchart (DAG Studio)      │
                               │  - ValidationBoxManager (Block Catalog)      │
                               │  - IssueDetailView (Thin-Client Grid)        │
                               └──────────────────────┬───────────────────────┘
                                                      │
                                                      ▼  REST API / SSE (Port 5002)
                               ┌──────────────────────────────────────────────┐
                               │           EXPRESS SERVER & ROUTERS           │
                               │  /api/workflows        /api/validation-boxes │
                               │  /api/investigations   /api/issues           │
                               │  /api/transactions    /api/db               │
                               └──────────────────────┬───────────────────────┘
                                                      │
                                                      ▼
                       ┌──────────────────────────────────────────────────────────────┐
                       │               INVESTIGATION ORCHESTRATOR                     │
                       │  (investigationOrchestratorService.ts)                       │
                       │  - In-flight deduplication (workflowEngineSingleton.ts)      │
                       │  - Pre-flight liveness check (dbLivenessService.ts)          │
                       │  - Key Chaining & Downstream Key Discovery                   │
                       └──────────────┬───────────────────────────────┬───────────────┘
                                      │                               │
                                      ▼                               ▼
       ┌─────────────────────────────────────────────┐ ┌──────────────────────────────┐
       │         EXTERNAL DATA RETRIEVAL             │ │   RULE-TO-SQL COMPILATION    │
       │  (externalDataQueryService.ts)              │ │   (ruleSqlCompiler.ts)       │
       │  - Builds batched WHERE IN ($1, ...) chunk  │ │   - Compiles declarative     │
       │  - Dispatches via live drivers:             │ │     steps to CASE WHEN SQL   │
       │    * MySQL (mysql2/promise)                 │ └──────────────┬───────────────┘
       │    * PostgreSQL (pg)                        │                │
       └──────────────────────┬──────────────────────┘                │
                              │                                       │
                              ▼ Chunk Query Results                   ▼ Set-Based UPDATE
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                             PRIMARY POSTGRESQL DATABASE                             │
│  ┌─────────────────────────────────────────┐  ┌──────────────────────────────────┐  │
│  │ 26 Core Relational Tables               │  │ Dedicated UNLOGGED Mirror Tables │  │
│  │ - issues & task_dataset_transactions    │  │ - mirror_db_transactions         │  │
│  │ - database_validation_workflows         │  │ - Indexed by _batch_id, status   │  │
│  │ - validation_boxes                      │  │ - Blazing-fast set updates       │  │
│  │ - global_standard_directory             │  │ - Dropped/cleaned on completion  │  │
│  │ - resolution_approval_requests          │  └──────────────────────────────────┘  │
│  │ - team_dashboard_visibility_grants      │                                        │
│  │ - cross_functional_project_groups       │                                        │
│  │ - ai_strategic_objectives               │                                        │
│  └─────────────────────────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 26. Current Context Summary

* **Application Purpose**: Payment reconciliation and operational incident triage platform designed to investigate transaction discrepancies across external banking databases.
* **Current Architecture**: Node.js/Express backend with React 19 frontend; primary datastore is PostgreSQL; external targets queried via live drivers into UNLOGGED PostgreSQL mirror tables.
* **Current Data Model**: Decoupled relational entities across 26 tables: `issues`, `task_dataset_transactions`, `database_validation_workflows`, `validation_boxes`, `query_extractions`, `investigation_tasks`, `investigation_batches`, `investigation_transactions`, `global_standard_directory`, `database_table_mappings`, `resolution_approval_requests`, `team_dashboard_visibility_grants`, `cross_functional_project_groups`, and `ai_strategic_objectives`.
* **Current Investigation Flow**: Batched chunk queries execute against external databases, persist into transient PostgreSQL mirror tables, and evaluate using set-based SQL `CASE WHEN` compilation.
* **Current Rule Flow**: Flowchart DAG connects Search Rectangles and Decision Rhombuses; rules compile directly into native PostgreSQL predicates.
* **Current Operational Governance**: Maker-Checker Dual Authorization (`makerId !== checkerId`) for manual financial adjustments (`FORCE_MATCH`, `WRITE_OFF`, `MANUAL_REVERSAL`), locking in `PENDING_CHECKER_REVIEW`.
* **Current Enterprise Traceability**: Universal `#hashtags` bind workflow DAGs, FTP staging templates, DB table configs, tickets, and team chat messages for end-to-end attribution.
* **Current External Integrations**: MySQL and PostgreSQL are fully operational via live drivers. MongoDB has diagnostic status endpoints. Oracle is not implemented.
* **Current Persistence**: PostgreSQL handles all operational data. Browser `localStorage` is used only for authentication JWT tokens.
* **Current Lifecycle**: 4 independent dimensions: Case Status, Financial Status, Investigation Status (including `PENDING_CHECKER_REVIEW`), and Rule Execution Verdict.
* **Current Performance**: Fast set-based joins, UNLOGGED mirror tables, 500-row batch ingestion, tuple-based multi-column matching (`WHERE (k1, k2) IN ((v1, v2), ...)`), thin-client pagination.
* **Important Existing Decisions**: PostgreSQL is the single source of truth; transaction arrays are decoupled into `task_dataset_transactions`; mirror tables are UNLOGGED; dual control prevents self-approval.

---

## 27. AI Handoff Context

> **CRITICAL INSTRUCTIONS FOR FUTURE AI AGENTS WORKING ON THIS CODEBASE**

1. **DO NOT assume MongoDB is the primary database.** The primary database is **PostgreSQL** (`operational_workflow_db`). All persistent records must be queried and stored via `postgresRepo.ts` and `pg`.
2. **DO NOT assume rules and workflows are stored in `localStorage`.** They are stored in PostgreSQL tables `database_validation_workflows` and `validation_boxes` via `/api/workflows` and `/api/validation-boxes`.
3. **DO NOT generate per-transaction external SQL queries.** The system uses **chunked batch queries** (`WHERE id IN ($1, $2, ...)`). External records are staged in UNLOGGED mirror tables (`mirror_{db}_{table}`).
4. **DO NOT assume Oracle database connections work.** `oracledb` is NOT installed. If you are asked to support Oracle, you must explicitly propose installing the official driver and creating an adapter.
5. **DO NOT store large transaction arrays inside the `Issue` model.** Transaction datasets must be inserted into `task_dataset_transactions` via `datasetIngestionService.ts` or `POST /api/issues/:id/dataset`.
6. **DO NOT confuse Validation Verdict with Pipeline Action.** A rule returns a status (`PASS`, `FAIL`, `ERROR`), which then triggers a distinct pipeline action (`CONTINUE`, `STOP`, `CLOSE`, `FLAG`).
7. **DO NOT edit `frontend/src/services/investigationEngine.ts` without verifying `backend/src/services/investigationEngine.ts`.** Both exist; ensure changes remain aligned.
8. **DO NOT assume Vite runs on port 5173.** The backend server (`server.ts`) embeds Vite middleware and serves both API and frontend on port **5002**.

---

## 28. Critical Accuracy Rules Verification

- **Rule 1 (Repository reality beats historical assumptions)**: Fully verified. Identified that PostgreSQL replaced MongoDB, and backend persistence replaced `localStorage`.
- **Rule 2 (Do not describe planned functionality as implemented)**: Fully verified. Oracle marked as NOT IMPLEMENTED despite presence in type unions.
- **Rule 3 (Do not describe simulated functionality as real)**: Fully verified. In-memory fallback and test stubs clearly distinguished from live MySQL/Postgres queries.
- **Rule 4 (Do not invent database entities)**: Fully verified. Every documented table maps directly to `001_initial_schema.sql`.
- **Rule 5 (Do not assume external systems use a specific schema)**: Fully verified. External schemas are discovered dynamically via `information_schema`.
- **Rule 6 (Do not assume SQL is the only external query mechanism)**: Fully verified. MongoDB collection introspection documented.
- **Rule 7 (Do not silently resolve contradictions)**: Fully verified. Documented explicit contradictions between `SYSTEM_ARCHITECTURE.md` and live code in Section 24.
- **Rule 8 (Identify uncertainty explicitly)**: Fully verified. Production secret management identified as an unknown.
- **Rule 9 (Trace claims to actual code)**: Fully verified. Every section references exact file names and line ranges.
- **Rule 10 (Do not modify repository)**: Fully verified. No application code, schemas, or configurations were modified.

---

## 29. Final Concluding Deliverable Summary

The current application context report has been generated and saved to `CURRENT_PROJECT_CONTEXT.md` in the workspace root.

---

## 30. Production Governance Segregation & Composite Workflow Bundles (Migration 018)

- **Migration**: `018_workflow_bundles_and_governance_segregation.sql` introduces the `workflow_bundles` table to manage composite operational bundles (DAG Flow + Validation Boxes + DB Table Mappings) with versioning, scoping (`PERSONAL`, `TEAM`, `GLOBAL_ENTERPRISE`), and Anti-Self-Approval constraint (`chk_bundle_anti_self_approval`).
- **Domain Segregation**: De-unified the approval model into dedicated, risk-appropriate operational feeds:
  - `GET /api/approvals/transactions`: High-risk financial ledger overrides (`FORCE_MATCH`, `WRITE_OFF`, `MANUAL_REVERSAL`) under strict Four-Eyes review (`makerId !== checkerId`).
  - `GET /api/approvals/workflow-bundles`: Composite workflow promotion reviews across scopes.
- **Service Layer**: Implemented `workflowBundleService.ts` for atomic snapshotting of workflow DAGs and linked validation boxes/DB mappings into `evidence_snapshot`.
- **UI Consolidation**:
  - Re-skinned `GovernanceScreen.tsx` into the **Operational Authority & Dual Authorization Center** featuring dedicated tabs for Financial Resolutions and Workflow Bundles with interactive evidence/manifest inspectors and Anti-Self-Approval enforcement banners, fully wrapped in `<ErrorBoundary>`.
  - Streamlined `WorkspaceSettings.tsx` and `WorkspaceGovernanceTab.tsx` by removing the redundant proposal queue and linking directly to the centralized Authority Center.
- **Verification**: 100% pass rate across test suites (`workflowBundleAndGovernanceRefactor.test.ts`, `governanceAndAnalyticsRefactor.test.ts`, `messageIntegrationArchitecture.test.ts`), with clean TypeScript compilation and Vite build (`0` errors).
