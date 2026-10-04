# Universal Hashtag Architecture & Specification
## Autonomous Operational Directives, Source-Agnostic Classification, and Reporting Engine

---

## 1. Executive Summary & Paradigm Shift

Historically within this repository, hashtags were treated primarily as **task-level classification tags** and **static metadata templates** attached to uploaded spreadsheet files. 

This specification establishes the comprehensive architectural blueprint for the **Universal Hashtag Automation System**. A `#hashtag` in this system is an **executable operational directive**. Crucially, hashtags are **not strictly bound to uploaded files or task intake forms**:
* Some hashtags require **uploaded batch files** and enforce column-level schema mappings.
* Other hashtags are **completely zero-file, database-direct directives** that execute database configurations directly against mirror tables (e.g. FTP mirror databases, core banking mirrors, or external live databases) to scan for duplicate transactions, reconcile balances, or extract datasets for staging and investigation without needing any manual file upload.

---

## 2. Baseline Architecture: Facts from Current Implementation

Based on inspection of the active codebase (`backend/`, `frontend/`, and PostgreSQL `operational_workflow_db`):

### 2.1 Database Schema (Current State)
1. **`hashtag_presets`** (Migrations `001_initial_schema.sql` and `002_hashtag_governance_and_reversion.sql`):
   - `id VARCHAR(64) PRIMARY KEY`, `tag VARCHAR(128) UNIQUE NOT NULL`
   - `description TEXT`, `criteria TEXT`
   - `expected_file_structure JSONB DEFAULT '[]'`
   - `solution_template TEXT` (SQL statement)
   - `author VARCHAR(255)`, `created_at TIMESTAMPTZ`
   - `file_template_data JSONB`, `criteria_rules JSONB`
   - `workflow_id VARCHAR(100)`, `workflow_name VARCHAR(255)`
   - `process_type VARCHAR(50) DEFAULT 'INTERNAL_STAGED_FIX'`
   - `kpis JSONB DEFAULT '[]'` (SLA targets, resolution hours)
2. **`issues`** (Tasks):
   - Stores `linked_hashtag VARCHAR(128)`.
3. **`workflow_bundles`** (Migration `018_workflow_bundles_and_governance_segregation.sql`):
   - Stores `hashtag_bindings JSONB DEFAULT '[]'` for composite governance.

### 2.2 Backend Services & Endpoints (Current State)
* **[hashtagService.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/hashtagService.ts)**:
  - `resolveHashtagAssets(tag)` queries across 5 PostgreSQL entities: workflows, FTP configs, DB connections, tasks/issues, and team chat messages matching `%#tag%`.
* **[misc.ts (Router)](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/misc.ts)**:
  - `GET /api/hashtags`: Lists registered presets.
  - `POST /api/hashtags`: Registers/upserts a preset.
  - `GET /api/hashtags/resolve/:tag`: Cross-system asset discovery.
  - `PUT /api/hashtags/:tag/kpis`: Updates managerial SLA expectations.
  - `POST /api/hashtags/create-from-issue/:issueId`: Derives a preset from a resolved task.
  - `GET /api/hashtags/analytics`: Aggregates volume, open/resolved counts, and tasks awaiting SQL scripts.

### 2.3 Frontend Integration (Current State)
* **`HashtagManager.tsx`**: Interactive preset library (chips on left, inspector on right).
* **`WorkspaceTaskCreator.tsx`**: Category / Hashtag dropdown during manual task creation.
* **`ValidationOrchestratorWorkspace.tsx`**: Auto-loads the workflow bound to the task's hashtag; provides *Reset to Hashtag Default Workflow*.
* **`IssueResolutionPanel.tsx`**: Auto-populates SQL solution templates matching `issue.linkedHashtag`.
* **`EscalationRoomModal.tsx`**: Chat rooms compute `#issueHashtag` and bind proposals to Maker-Checker review.
* **`ManagerialDashboard.tsx`**: Dedicated *Hashtag Intelligence & KPIs* tab with volume charts and SLA configurations.
* **`WorkspaceSettings.tsx`**: Governance toggle `requireHashtagForResolution`.

---

## 3. The Core Realization: Source-Agnostic Hashtag Classification

### 3.1 Limitation of the Legacy Assumption
The previous assumption treated hashtags solely as:
```
[User Uploads File] ──> [Select #Hashtag] ──> [Apply Mapping] ──> [Run Workflow]
```
This fails to address major enterprise operational scenarios:
1. **Autonomous Anomaly Scanners**: Checking for duplicate transactions on external DBs or unlogged FTP mirror tables does not require an operator to upload a file. The target is an external database table.
2. **Autonomous Extraction & Staging**: Extracting data from an external DB table or staging mirror into an internal table for later investigation requires zero incoming files.
3. **Scheduled Diagnostic Audits**: Periodic compliance checks that run nightly against settlement tables need direct DB configuration execution, producing a status report without an input file.

### 3.2 The New Taxonomy: 4 Distinct Hashtag Types

Hashtags are classified by their **Data Source Mode**, **Input Requirements**, and **Execution Purpose**:

```
                                  ┌───────────────────────────────────┐
                                  │      HASHTAG TAXONOMY & TYPES     │
                                  └─────────────────┬─────────────────┘
                                                    │
         ┌──────────────────────────┬───────────────┴──────────────┬──────────────────────────┐
         ▼                          ▼                              ▼                          ▼
┌──────────────────┐      ┌──────────────────┐           ┌──────────────────┐       ┌──────────────────┐
│ TYPE A: BATCH    │      │ TYPE B: DB-DIRECT│           │ TYPE C: ETL /    │       │ TYPE D: AUDITING │
│ FILE-INGESTION   │      │ SCANNER (ZERO-FILE)          │ STAGING PIPELINE │       │ & COMPLIANCE     │
├──────────────────┤      ├──────────────────┤           ├──────────────────┤       ├──────────────────┤
│ • Input: File    │      │ • Input: NONE    │           │ • Input: NONE /  │       │ • Input: Variable│
│   (CSV, Excel)   │      │ • Source: DB/    │           │   Query Trigger  │       │ • Source: Live DB│
│ • Sample upload  │      │   Mirror Table   │           │ • Action: Extract│       │ • Action: Read-  │
│   defines schema │      │ • Action: Query  │           │   & Insert into  │       │   only diagnostic│
│ • Validates cols │      │   duplicates /   │           │   Dedicated Table│       │   evaluation     │
│ • Ingests & maps │      │   anomalies      │           │ • Stages for     │       │ • Generates SLA  │
│ • Runs workflow  │      │ • Generates      │           │   investigation  │       │   & discrepancy  │
│ • Conditional fix│      │   status report  │           │ • Downstream use │       │   audit report   │
└──────────────────┘      └──────────────────┘           └──────────────────┘       └──────────────────┘
```

---

## 4. Detailed Specification of Hashtag Types

### Type A: Batch File-Ingestion Hashtags (`FILE_INGESTION`)
* **Trigger Mode**: Manual task intake, FTP batch ingestion, or file drop.
* **Input Requirement**: Batch file (.csv, .xlsx).
* **Creation / Authoring Requirements**:
  - Requires uploading a **representative sample file** during creation.
  - The author defines **minimum required columns** and column-level integrity checks.
  - Supports **value & dictionary transformations** (e.g., converting incoming `bank_code: "001"` into canonical `bank_name: "Awash International Bank"`).
* **Execution Flow**:
  1. Operator uploads file and selects `#HASHTAG`.
  2. Engine validates column presence and data integrity against the preset's rules before task creation.
  3. Transforms raw records into canonical schema fields.
  4. Runs bound validation workflow DAG.
  5. If workflow yields `PASS`, conditionally executes parameterized SQL remediation on the target external database (or routes to Maker-Checker review).

---

### Type B: Database-Direct Scanner Hashtags (`DATABASE_DIRECT_SCANNER`)
* **Trigger Mode**: On-demand button click, scheduled cron job, or triggered from an escalation directive.
* **Input Requirement**: **NONE (Zero-File)**.
* **Authoring Requirements**:
  - Does **NOT** require an uploaded sample file.
  - Author selects:
    1. **Target DB Connection** (e.g., `pg-core-banking-mirror` or `mysql-pos-settlement`).
    2. **Target Table / Mirror Table** (e.g., `mirror_ftp_settlement_feed`).
    3. **Detection / Extraction SQL Criteria** (e.g., duplicate detection logic: `WHERE (ref_num, card_num) IN (SELECT ref_num, card_num FROM mirror_feed GROUP BY ref_num, card_num HAVING COUNT(*) > 1)`).
    4. **Bound Workflow**: Optional validation stages to check discrepancy flags.
* **Execution Flow**:
  1. Triggered autonomously or by an operator in the Investigation Panel.
  2. Compiles batched tuple SQL directly against the connected external/mirror database.
  3. Discovers anomaly rows (e.g. duplicate transactions, missing settlement legs).
  4. Generates a **Status & Discrepancy Report** without needing any input file.
  5. Optionally spawns an Investigation Task with the discovered anomalies pre-populated.

---

### Type C: Extraction & Staging Hashtags (`EXTRACTION_STAGING`)
* **Trigger Mode**: Scheduled sync or ad-hoc batch trigger.
* **Input Requirement**: **Zero-File (Direct DB query)** or **FTP Raw File Stream**.
* **Authoring Requirements**:
  - Configures an internal **Dedicated App-Level Database Table** (`hashtag_stage_{tag_name}`).
  - Defines the source query projections and mapping rules.
* **Execution Flow**:
  1. Extracts records from source database or mirror table based on query configuration.
  2. Sanitizes and transforms fields (e.g., `bank_code` -> `bank_name`, timestamps to UTC ISO).
  3. Inserts records into the hashtag's dedicated staging table.
  4. Publishes execution metrics to Team and Personal Dashboards.

---

### Type D: Auditing & Governance Hashtags (`AUDITING_GOVERNANCE`)
* **Trigger Mode**: Scheduled audit sweep or manager review.
* **Input Requirement**: None (evaluates live tables and task logs).
* **Guarantees**:
  - Strictly non-mutating (`_isDiagnosticOnly: true`).
  - Evaluates SLA compliance, resolution velocity, maker-checker adherence, and false-positive rates.
  - Emits structured governance reports directly to the Managerial Dashboard.

---

## 5. Technical Architecture & Lifecycle

### 5.1 Proposed Schema Extension for `hashtag_presets`

To support source-agnostic hashtags, `hashtag_presets` will be extended with the following columns:

```sql
ALTER TABLE hashtag_presets 
  ADD COLUMN IF NOT EXISTS hashtag_type VARCHAR(50) NOT NULL DEFAULT 'FILE_INGESTION',
  ADD COLUMN IF NOT EXISTS data_source_mode VARCHAR(50) NOT NULL DEFAULT 'FILE_UPLOAD', -- 'FILE_UPLOAD', 'DATABASE_DIRECT', 'HYBRID'
  ADD COLUMN IF NOT EXISTS target_db_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS target_table_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS dedicated_app_table VARCHAR(150),
  ADD COLUMN IF NOT EXISTS minimum_required_columns JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS dictionary_lookup_mappings JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS execution_trigger VARCHAR(50) DEFAULT 'MANUAL', -- 'MANUAL', 'SCHEDULED_CRON', 'CHAT_DIRECTIVE'
  ADD COLUMN IF NOT EXISTS schedule_cron VARCHAR(100),
  ADD COLUMN IF NOT EXISTS conditional_action JSONB DEFAULT '{"onPass": "EXECUTE_SQL", "onFail": "FLAG_INVESTIGATION"}'::jsonb;
```

---

## 6. Execution Flow: Running DB Configs & Inspecting Results

### 6.1 In Authoring ("Pre-Flight Test")
When creating or editing any hashtag (File-based or Database-direct):
1. Operator attaches DB configuration and target table.
2. Operator clicks **`[Test DB Config]`**:
   - For Type A: Evaluates sample file rows against target DB table using tuple query (`WHERE (col1, col2) IN (...)`).
   - For Type B/C: Executes detection query directly against the target DB/mirror table.
3. The interface displays a **Live Pre-Flight Inspection Drawer**:
   - Total rows matched in target DB.
   - Column match validation (nullability, data types).
   - Lookup resolution verification (verifying `bank_code` translates to valid `bank_name`).

### 6.2 In Investigation Workspace ("Partial vs. Full Execution")
When an operator is investigating a task or reviewing a hashtag run:
1. **Partial Execution (`Test DB Checks / Dry-Run`)**:
   - Queries the external database or unlogged mirror table.
   - Calculates rule verdicts (`PASS`, `FAIL`, `DISCREPANCY`).
   - Opens the **Side-by-Side Result Diff Inspector**:
     - *Source Value* vs. *External DB Value*.
     - Discrepancy highlights (mismatched amount, invalid state).
   - **Does NOT execute mutating SQL scripts.**
2. **Full Execution (`Run & Remediate`)**:
   - Executes the pre-flight checks.
   - If verdict satisfies conditional rules (e.g. `onPass: "EXECUTE_SQL"`), stages the solution script as a **Maker Proposal** under dual-authorization governance (`makerId !== checkerId`).

---

## 7. Chat Escalation & Directives (`/escalate`, `/create-hashtag`)

In Team Discussion Channels and Escalation Rooms:
* **/escalate**:
  - Turns a specific chat thread or message into a formal operational task.
  - Automatically captures the context: author, timestamp, mentioned transaction IDs, and target system.
* **/create-hashtag**:
  - Opens the **Hashtag Creation Drawer** directly from the chat conversation.
  - **Auto-populates full issue context**:
    - If the issue was File-driven: pre-loads uploaded headers and sample data.
    - If the issue was DB-direct: pre-loads target DB connection, table name, and SQL query discovered during investigation.
    - Pre-loads the proposed solution script drafted by team members in chat.
  - Enables instant promotion of an ad-hoc fix into an automated, permanent hashtag directive.

---

## 8. Dedicated Reporting Architecture: Personal vs. Team Dashboards

### 8.1 Personal Dashboard (`My Tasks` & Operator Workspace)
* **My Hashtag Automation Metrics**:
  - Total tasks resolved via automated hashtags vs. manual intervention.
  - Success rate (`% PASS`, `% FAIL`, `% STAGED`).
* **My Pending Actions**:
  - Proposals authored by the user awaiting Checker sign-off.
  - Discrepancies flagged by Database-Direct scanner hashtags assigned to the user.
* **Personal Audit Timeline**:
  - Chronological history of hashtag runs with one-click export (`CSV` / `JSON`).

### 8.2 Team Dashboard (`TeamWorkspace` Reports Tab)
* **Team Hashtag SLA & Velocity Matrix**:
  - Volume breakdown per hashtag across all team members.
  - Mean Time to Detect (MTTD) and Mean Time to Resolve (MTTR) against hashtag SLA targets.
* **Extraction & Staging Audit (for Type C ETL Hashtags)**:
  - Total records ingested into dedicated app-level tables.
  - Growth metrics, error rates, and last sync timestamp.
* **Discrepancy Root Cause Analysis (RCA)**:
  - Aggregated failure breakdown (e.g., *42% Bank Code Lookup Failure, 28% Amount Discrepancy*).
* **Compliance & Maker-Checker Audit Export**:
  - Exportable report detailing every executed hashtag, rule outcome, SQL script committed, and approving Checker.

---

## 9. Phased Implementation Plan & Execution Reference

The comprehensive, step-by-step engineering plan for realizing this architecture is detailed in:

📄 **[`IMPLEMENTATION_PLAN_UNIVERSAL_HASHTAGS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/IMPLEMENTATION_PLAN_UNIVERSAL_HASHTAGS.md)**

### Implementation Summary Breakdown:
1. **Phase 1 (PostgreSQL Migration `026_universal_hashtag_engine.sql`)**: Extends `hashtag_presets` with `hashtag_type`, `data_source_mode`, `target_db_id`, `target_table_name`, `minimum_required_columns`, `dictionary_lookup_mappings`, and provisions `hashtag_execution_runs`.
2. **Phase 2 (Backend Models & Repository)**: Updates `types.ts` and `postgresRepo.ts` with multi-type persistence, run recording, and reporting aggregators.
3. **Phase 3 (Service & Execution Engine)**: Adds zero-file DB scanner executors (`executeDatabaseDirectScan`), lookup translators (`bank_code` → `bank_name`), and staging pipelines in `hashtagService.ts`.
4. **Phase 4 (API Endpoints)**: Exposes execution, pre-flight testing, and reporting routes under `/api/hashtags/*` in `misc.ts`.
5. **Phase 5 (Authoring UI)**: Upgrades `HashtagManager.tsx` with Type Selector (File vs DB-Direct), sample file mapper, and live DB test inspection drawer.
6. **Phase 6 (Investigation Diff Drawer)**: Adds side-by-side verification (`Source Row` vs `Mirror DB Row`) and partial dry-run controls in `InvestigationWorkspace.tsx`.
7. **Phase 7 (Chat Directives)**: Implements `/escalate` and `/create-hashtag` in `EscalationRoomModal.tsx` and Team Chat with issue context inheritance.
8. **Phase 8 (Dashboards & Reports)**: Implements dedicated reporting on Personal Dashboard (`My Tasks`) and Team Dashboard (`TeamWorkspace`).
9. **Phase 9 (Verification)**: Full integration test suite (`universalHashtagsEngine.test.ts`), Vitest regression pass (234 tests), and Vite build validation.
