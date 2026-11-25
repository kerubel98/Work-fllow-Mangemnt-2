# Implementation Plan: Universal Hashtag Automation Engine
## Multi-Type Directives, Zero-File DB Scanners, Pre-Flight Testing, and Dedicated Reporting

**Document Status**: Proposed (Pending User Review & Approval)  
**Author**: Antigravity Implementation Agent  
**Architectural Reference**: [`UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md)  
**Governance & Rules Compliance**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rule 1, Rule 2, Rule 7, Rule 8, Rule 9, Rule 11, Rule 20)

---

## 1. Executive Overview & Scope

This implementation plan translates the **Universal Hashtag Architecture & Specification** into a concrete, phased engineering roadmap. 

It establishes:
1. **Source-Agnostic Classification**: Supporting both **File-Ingestion Hashtags** (requiring sample upload, column integrity, and dictionary mappings) and **Database-Direct Scanner Hashtags** (zero-file directives executing directly against external/mirror tables to find duplicates or extract records).
2. **Lookup & Dictionary Transformations**: Built-in translation engine resolving codes (e.g. `bank_code: "001"`) into canonical values (`bank_name: "Awash International Bank"`).
3. **Pre-Flight Testing & Side-by-Side Diff Inspector**: Live dry-run verification against sample rows or external DBs before execution.
4. **Execution Run Ledger**: Recording all runs (`hashtag_execution_runs`) with metrics and Maker-Checker snapshot traceability.
5. **Chat Directives**: Native `/escalate` and `/create-hashtag` commands pre-populating issue context.
6. **Dedicated Reporting Architecture**: Granular reporting on Personal Dashboards (`My Tasks`) and Team Dashboards (`TeamWorkspace`).

---

## 2. Phased Implementation Roadmap

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        UNIVERSAL HASHTAG IMPLEMENTATION PHASES                         │
├─────────────────────┬─────────────────────┬─────────────────────┬──────────────────────┤
│ PHASE 1: DB SCHEMA  │ PHASE 2: SERVICES   │ PHASE 3: FRONTEND   │ PHASE 4: DASHBOARDS  │
│ & MIGRATIONS        │ & EXECUTION ENGINE  │ UI & CHAT DIRECTIVE │ & VERIFICATION       │
├─────────────────────┼─────────────────────┼─────────────────────┼──────────────────────┤
│ • Migration 026     │ • hashtagService.ts │ • HashtagManager UI │ • Personal Dashboard │
│ • hashtag_presets   │ • Type A/B/C/D logic│   (Type Selector)   │ • Team Reports Tab   │
│   extensions        │ • Zero-file scanner │ • Sample file & col │ • Vitest test suite  │
│ • execution_runs    │ • Lookup dictionary │   mapping builder   │ • 234 existing tests │
│ • Dedicated tables  │ • REST API routes   │ • Diff drawer modal │ • Frontend Vite build│
└─────────────────────┴─────────────────────┴─────────────────────┴──────────────────────┘
```

---

### Phase 1 — PostgreSQL Database Schema & Migrations

**File**: `backend/src/database/migrations/026_universal_hashtag_engine.sql`

1. **Extend `hashtag_presets`**:
   - `hashtag_type VARCHAR(50) NOT NULL DEFAULT 'FILE_INGESTION'`  
     (`'FILE_INGESTION' | 'DATABASE_DIRECT_SCANNER' | 'EXTRACTION_STAGING' | 'AUDITING_GOVERNANCE'`)
   - `data_source_mode VARCHAR(50) NOT NULL DEFAULT 'FILE_UPLOAD'`  
     (`'FILE_UPLOAD' | 'DATABASE_DIRECT' | 'HYBRID'`)
   - `target_db_id VARCHAR(100)`: Foreign key/reference to `database_connections.id`.
   - `target_table_name VARCHAR(150)`: Name of external/mirror table to scan or query.
   - `dedicated_app_table VARCHAR(150)`: Dedicated persistence table for Type C ETL staging.
   - `minimum_required_columns JSONB DEFAULT '[]'`: Array of column names required for ingestion.
   - `dictionary_lookup_mappings JSONB DEFAULT '{}'`: Dictionary mapping rules (e.g. `{"bank_code": {"sourceCol": "bank_code", "targetCol": "bank_name", "lookupTable": "bank_directory"}}`).
   - `execution_trigger VARCHAR(50) DEFAULT 'MANUAL'` (`'MANUAL' | 'SCHEDULED_CRON' | 'CHAT_DIRECTIVE'`).
   - `schedule_cron VARCHAR(100)`: Optional 5-field cron string for autonomous execution.
   - `conditional_action JSONB DEFAULT '{"onPass": "EXECUTE_SQL", "onFail": "FLAG_INVESTIGATION"}'`: Action rules based on rule verdict.

2. **Create Table `hashtag_execution_runs`**:
   ```sql
   CREATE TABLE IF NOT EXISTS hashtag_execution_runs (
       id VARCHAR(64) PRIMARY KEY,
       hashtag_tag VARCHAR(128) NOT NULL REFERENCES hashtag_presets(tag) ON DELETE CASCADE,
       task_id VARCHAR(100) REFERENCES issues(id) ON DELETE SET NULL,
       team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
       executed_by VARCHAR(100) NOT NULL,
       execution_mode VARCHAR(32) NOT NULL, -- 'DRY_RUN_PARTIAL', 'LIVE_FULL'
       rows_scanned INT NOT NULL DEFAULT 0,
       anomalies_detected INT NOT NULL DEFAULT 0,
       verdict VARCHAR(32) NOT NULL, -- 'PASS', 'FAIL', 'DISCREPANCY', 'STAGED'
       maker_proposal_id VARCHAR(100),
       result_snapshot JSONB DEFAULT '{}',
       executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   CREATE INDEX IF NOT EXISTS idx_hashtag_runs_tag ON hashtag_execution_runs(hashtag_tag, executed_at DESC);
   CREATE INDEX IF NOT EXISTS idx_hashtag_runs_team ON hashtag_execution_runs(team_id);
   ```

3. **Dedicated Table Dynamic Provisioning**:
   - Provide a safe helper to create dedicated staging tables `hashtag_stage_{clean_tag}` with standard audit columns (`id`, `ingested_at`, `source_file`, `transformed_payload JSONB`).

---

### Phase 2 — Backend Models, Types & Repository

**Files**:
- `backend/src/types.ts`
- `backend/src/store/postgresRepo.ts`

1. **Type Definitions**:
   - Define TypeScript interfaces `HashtagType`, `DataSourceMode`, `HashtagExecutionRun`, `DictionaryLookupMapping`.
   - Update `HashtagPreset` interface with the new schema fields.
2. **Repository Enhancements in `postgresRepo.ts`**:
   - `getHashtags(filter?: { type?: HashtagType; teamId?: string })`: Supports filtering by hashtag type.
   - `getHashtagByTag(tag: string)`: Retrieves single preset with all configuration.
   - `createHashtag(tag: HashtagPreset)`: Persists extended configuration with upsert logic.
   - `recordHashtagRun(run: HashtagExecutionRun)`: Persists an execution run record.
   - `getHashtagRuns(tag: string, limit?: number)`: Retrieves run history for audit trails.
   - `getTeamHashtagReport(teamId: string)`: Aggregates execution runs, SLA compliance, and throughput by hashtag.

---

### Phase 3 — Backend Services & Execution Engine

**File**: `backend/src/services/hashtagService.ts`

1. **Dictionary & Lookup Translator**:
   - `applyDictionaryLookups(records: any[], mappings: Record<string, any>): any[]`:
     Translates source values (e.g. `bank_code`) into canonical values (`bank_name`) using either inline dictionaries or registered lookup directories.
2. **Type A: File-Ingestion Executor (`executeFileIngestionHashtag`)**:
   - Validates incoming headers against `minimum_required_columns`.
   - Executes dictionary lookups on raw dataset.
   - Attaches bound workflow DAG and passes sanitized records to the Pipeline Engine.
3. **Type B: Database-Direct Scanner Executor (`executeDatabaseDirectScan`)**:
   - **Zero-File Execution**: Connects to `target_db_id` and targets `target_table_name`.
   - Compiles batched tuple SQL queries (e.g. duplicate transaction check: `GROUP BY ... HAVING count(*) > 1`).
   - Limits queries to ANSI-quoted identifiers and parameter limits (< 30,000 per Rule 11).
   - Returns structured anomaly matrix: total rows scanned, duplicates discovered, and detailed row records.
4. **Type C: Extraction & Staging Executor (`executeExtractionStaging`)**:
   - Extracts rows from external source DB.
   - Ingests sanitized records into `dedicated_app_table`.
5. **Type D: Auditing & Compliance Scanner (`executeAuditingGovernance`)**:
   - Executes observational queries marked with `_isDiagnosticOnly: true` (Rule 12).

---

### Phase 4 — REST API Endpoints

**File**: `backend/src/routes/misc.ts`

| HTTP Method & Path | Handler Description |
|---|---|
| `POST /api/hashtags` | Extended to accept `hashtagType`, `dataSourceMode`, `minimumRequiredColumns`, `dictionaryLookupMappings`. |
| `POST /api/hashtags/:tag/execute-scan` | Triggers a **Type B Database-Direct Scan** on demand, returning anomaly status report. |
| `POST /api/hashtags/test-preflight` | Dry-run pre-flight execution against sample data or live external DB, returning matched columns and diff preview. |
| `GET /api/hashtags/:tag/runs` | Retrieves audit run history from `hashtag_execution_runs`. |
| `POST /api/hashtags/:tag/provision-table` | Provisions dedicated app-level staging table for Type C hashtags. |
| `GET /api/hashtags/reports/team/:teamId` | Generates aggregated SLA velocity, throughput, and RCA reports for Team Dashboards. |
| `GET /api/hashtags/reports/personal/:userId` | Generates personal automation stats and pending Maker proposals for Personal Dashboards. |

---

### Phase 5 — Frontend: Hashtag Authoring & Sample-Based Mapper

**File**: `frontend/src/components/issue/HashtagManager.tsx`

1. **Hashtag Type Selector**:
   - Visual segmented control: `File-Ingestion Batch`, `Database-Direct Scanner`, `ETL Staging`, `Auditing & Governance`.
2. **Dynamic Configuration Panels based on Selected Type**:
   - **For Type A (File Ingestion)**:
     - Drag-and-drop sample file uploader (`.csv`, `.xlsx`).
     - Header extractor and data-type detector.
     - Checkbox matrix for **Minimum Required Columns**.
     - Dictionary Lookup Configurator (e.g., select source `bank_code` → select target `bank_name` → choose translation dictionary).
   - **For Type B (Database-Direct Scanner)**:
     - Hides file upload entirely.
     - Dropdown for **Target DB Connection** (from registered connections) and **Target Table / Mirror Table**.
     - Anomaly Detection Query builder (presets for Duplicate Detection, Balance Mismatch, Unsettled Legs).
   - **For Type C (ETL Staging)**:
     - Toggle to provision dedicated app table (`hashtag_stage_{tag}`).
3. **Interactive Pre-Flight Test Drawer**:
   - Button: **`[Test DB Config Pre-Flight]`**.
   - Executes `POST /api/hashtags/test-preflight` and displays a side-by-side verification drawer:
     - Sample Keys Found in External DB (Count & Percentage).
     - Column Nullability & Type Validation.
     - Lookup Resolution Check (verifying `bank_code` properly translates to `bank_name`).

---

### Phase 6 — Investigation Workspace Controls & Side-by-Side Diff Drawer

**Files**:
- `frontend/src/components/investigation/InvestigationWorkspace.tsx`
- `frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx`

1. **Hashtag Directive Header Badge**:
   - Renders visual tag badge with icon indicating type (File-driven vs. DB-Direct Scanner).
2. **Dual-Action Execution Controls**:
   - **`[Test DB Checks (Dry-Run)]` (Partial)**: Queries external/mirror tables, populates diff, and calculates rule verdicts without mutating records.
   - **`[Execute Solution Script]` (Full)**: Staged as a Maker proposal under Maker-Checker governance.
3. **Side-by-Side Result Diff Inspector Drawer**:
   - Modal drawer comparing:
     - `Input Record`: `{ txn_id: "TX-101", bank_code: "001", amount: 4500.00 }`
     - `External DB Mirror`: `{ txn_id: "TX-101", bank_name: "Awash Bank", amount: 4500.00, status: "POSTED" }`
     - Discrepancy highlights in red, matches in green.

---

### Phase 7 — Chat Directives (`/escalate` & `/create-hashtag`)

**Files**:
- `frontend/src/components/team/EscalationRoomModal.tsx`
- `frontend/src/components/team/TeamChannelsTab.tsx`

1. **Command Parser**:
   - Detects leading slash commands in chat input box: `/escalate` and `/create-hashtag`.
2. **`/escalate` Directive**:
   - Formally promotes chat thread to an operational case with status `INVESTIGATING`.
   - Links mentioned transactions and derives `#issueHashtag`.
3. **`/create-hashtag` Directive**:
   - Opens the `HashtagManager` creation drawer directly within the chat viewport.
   - **Auto-populates full issue context**:
     - Task file headers & sample rows (if file-driven).
     - Target DB connection, table name, and detection SQL (if DB-driven).
     - Proposed SQL solution script authored in chat.
   - 1-click promotion from ad-hoc problem resolution to reusable automated hashtag directive.

---

### Phase 8 — Dedicated Reporting Dashboards

**Files**:
- `frontend/src/components/ManagerialDashboard.tsx`
- `frontend/src/components/TeamWorkspace.tsx`
- `frontend/src/App.tsx` (`my_tasks` queue)

1. **Personal Dashboard (`My Tasks` / Operator View)**:
   - "My Hashtag Automation Metrics" card: tasks resolved by automated hashtags vs. manual investigation.
   - My pending Maker proposals awaiting Checker review.
   - Personal execution timeline with export options (`CSV` / `JSON`).
2. **Team Dashboard (`TeamWorkspace` Reports Tab)**:
   - Dedicated **"Reports & Hashtag Intelligence"** tab.
   - Throughput volume and SLA velocity matrix by hashtag.
   - Staging table metrics for Type C hashtags (records ingested, table size).
   - Discrepancy Root Cause Analysis (RCA) breakdown charts.
   - Exportable Compliance Audit Log.

---

### Phase 9 — Verification & Acceptance Suite

1. **Backend Integration Tests**:
   - Create test suite `backend/src/services/__tests__/universalHashtagsEngine.test.ts`:
     - Test 1: File-Ingestion Hashtag verifies required columns and converts `bank_code` -> `bank_name`.
     - Test 2: Database-Direct Scanner runs zero-file duplicate transaction detection query on mirror table.
     - Test 3: Dedicated app table provisioning and data staging.
     - Test 4: Maker-Checker dual authorization on hashtag solution execution (`makerId !== checkerId`).
2. **Full Regression Check**:
   - Ensure all **30 existing test files and 234 tests** continue to pass (`vitest run`).
3. **Frontend Production Build**:
   - Ensure `npm run build` in `frontend/` succeeds with 0 errors.

---

## 3. Implementation Order & Safety Checklist

| Step | Action | Files Touched | Verification |
|---|---|---|---|
| **1** | Database Migration 026 | `026_universal_hashtag_engine.sql` | Migration executes cleanly |
| **2** | Backend Types & Repository | `types.ts`, `postgresRepo.ts` | TypeScript builds without errors |
| **3** | Backend Services (Scanner & Mapper) | `hashtagService.ts` | Vitest service unit tests pass |
| **4** | REST API Endpoints | `misc.ts` | API routes testable via HTTP |
| **5** | Hashtag Creation UI (Type Selector & Mapper) | `HashtagManager.tsx` | Interactive UI renders and tests sample files |
| **6** | Investigation Controls & Diff Drawer | `InvestigationWorkspace.tsx`, `ValidationOrchestratorWorkspace.tsx` | Side-by-side diff drawer displays live rows |
| **7** | Chat Directives (`/escalate`, `/create-hashtag`) | `EscalationRoomModal.tsx`, `TeamChannelsTab.tsx` | Directives spawn pre-filled hashtag drawer |
| **8** | Personal & Team Reporting Dashboards | `TeamWorkspace.tsx`, `ManagerialDashboard.tsx`, `App.tsx` | Dashboard metrics render and export |
| **9** | Comprehensive Verification | Test suites & Vite build | 234/234 tests pass + 0 build errors |
