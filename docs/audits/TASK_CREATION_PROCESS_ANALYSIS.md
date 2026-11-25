# Task Creation Process Analysis

> **Scope**: Ground-truth code analysis of the end-to-end task creation process in this codebase.
> **Sources**: Traced directly from `frontend/src/components/IssueCreator.tsx`, `frontend/src/App.tsx`, `backend/src/routes/issues.ts`, `backend/src/services/dataSanitizerService.ts`, `backend/src/services/datasetIngestionService.ts`, `backend/src/store/postgresRepo.ts`, and `backend/src/routes/investigations.ts`.

---

## 1. Executive Summary & Conceptual Model

In this codebase, what is conceptually termed a **"Task"** by operators is modeled and stored as an **`Issue`** (representing a reconciliation/discrepancy dataset investigation task), backed by relational storage in:
- **`issues`**: Stores task identity, status, metadata, team scoping, and file mapping configuration.
- **`task_dataset_transactions`**: Stores the thousands of individual parsed transaction rows, chunked into numbered batches.
- **`central_transaction_repository`**: Global transaction registry for lineage tracking and cross-task duplicate detection.
- **`workspace_table_records`**: Session snapshots of uploaded vs. transformed rows.
- **`investigation_tasks`**: Created when an ingested task is executed against a validation workflow DAG.

```
[Operator Uploads CSV/XLSX]
         │
         ▼
[Frontend: IssueCreator.tsx]
   - SheetJS (xlsx) parses rows
   - Global schema mapping applied
   - Dispatches onCreateIssue()
         │  HTTP POST /api/issues
         ▼
[Backend: routes/issues.ts]
   1. Validate required fields (title, creatorId)
   2. Resolve creator's permanent team & visibility (TEAM_PUBLIC vs PERSONAL_PRIVATE)
   3. Pre-Flight Mapping Validation (dataSanitizerService.validateMapping)
      -> 422 Unprocessable Entity if standard fields missing
   4. Strict Sanitization (dataSanitizerService.sanitizeRows)
      -> Prunes unmapped keys, strips nulls/spaces, coerces dates & amounts
   5. Persist to PostgreSQL (repo.createIssue -> INSERT INTO issues)
   6. Broadcast Real-time Event (eventService.broadcastEvent('issue:created'))
   7. Stream Rows to Relational Storage (datasetIngestionService.ingestDatasetRows)
      - Assigns 500-record batches (BATCH-{id}-001, ...)
      - Cross-task duplicate detection against central_transaction_repository
      - Batched multi-value INSERT into task_dataset_transactions (1,000/chunk)
      - Master ledger upsert into central_transaction_repository
      - Broadcasts eventService.broadcastEvent('issue:dataset_ingested')
         │
         ▼
[201 Created Response]
```

---

## 2. Step-by-Step Execution Lifecycle

### Step 1: Frontend User Input, Parsing, & Schema Mapping
- **Files**: 
  - [`frontend/src/components/IssueCreator.tsx:800-860`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/IssueCreator.tsx#L800-L860)
  - [`frontend/src/App.tsx:947-963`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L947-L963)
  - [`frontend/src/services/globalMappingService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/services/globalMappingService.ts)

1. **User Input**:
   - The operator inputs `title`, `description`, `priority` (`Low`, `Medium`, `High`, `Critical`), `linkedHashtag` (e.g. `#AIB_SETTLEMENT_2026`), and uploads an external reconciliation file (`.csv`, `.xlsx`).
2. **File Parsing**:
   - SheetJS (`xlsx`) parses the file into raw JavaScript objects (`filePreviewData`) and extracts raw header names (`rawHeaders`).
3. **Column Mapping**:
   - The user selects a mapping template or manually aligns source headers to the standard dictionary (`globalStandardFields`).
   - `globalMappingService.transformRowToGlobalSchema()` normalizes row keys to standard attributes (`tran_ref`, `amount`, `account_number`, etc.).
4. **Submission**:
   - `IssueCreator` triggers `onCreateIssue()`.
   - `App.tsx` generates an optimistic ID (`ISS-xxx`), sets initial `status: 'Open'`, attaches current user information, and dispatches an HTTP POST request:
     ```http
     POST /api/issues
     Content-Type: application/json
     ```

---

### Step 2: Route Reception & Team Governance Enforcement
- **File**: [`backend/src/routes/issues.ts:19-52`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/issues.ts#L19-L52)

When `POST /api/issues` receives the payload:
1. **Mandatory Field Validation**:
   - Checks `title` and `creatorId`. If either is missing, execution halts immediately:
     ```typescript
     if (!issueData.title || !issueData.creatorId) {
       return res.status(400).json({ error: 'Title and creatorId are required' });
     }
     ```
2. **Team Membership & Visibility Resolution**:
   - Resolves the user's permanent team via `repo.getUserById(issueData.creatorId)`:
     - If the creator belongs to or manages a team where `teamType === 'permanent'`, `effectiveTeamId` is assigned to that team ID.
     - **Default Visibility**:
       - If the user belongs to a permanent team: defaults to `'TEAM_PUBLIC'`.
       - If the user has no permanent team: defaults to `'PERSONAL_PRIVATE'`.

---

### Step 3: Pre-Flight Mapping Validation & Data Sanitization
- **Files**: 
  - [`backend/src/routes/issues.ts:53-83`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/issues.ts#L53-L83)
  - [`backend/src/services/dataSanitizerService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/dataSanitizerService.ts)

If rows are supplied (`firstLevelMappedData`, `records`, or `rows`):
1. **Pre-flight Mapping Validation**:
   - Calls `dataSanitizerService.validateMapping(effectiveMapping, sampleRow)`.
   - Ensures required global standard directory fields are present. If missing, the request is rejected with **HTTP 422**:
     ```json
     {
       "error": "Pre-flight mapping validation failed: Required standard fields are not mapped",
       "missingFields": ["..."],
       "requiredFields": ["..."]
     }
     ```
2. **Data Sanitization (`dataSanitizerService.sanitizeRows`)**:
   - Prunes unmapped source columns not in the schema mapping.
   - Strips `null`, `undefined`, and blank string values.
   - Coerces numbers and strips currency symbols (`$`, `,`).
   - Normalizes date values into ISO-8601 strings (`YYYY-MM-DD` or full ISO).

---

### Step 4: Primary Task / Issue Record Persistence
- **Files**: 
  - [`backend/src/routes/issues.ts:85-110`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/issues.ts#L85-L110)
  - [`backend/src/store/postgresRepo.ts:320-365`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/store/postgresRepo.ts#L320-L365)

1. **Entity Assembly**:
   Assembles the complete `Issue` object:
   - `id`: Client-supplied or generated (`ISSUE-${Math.floor(1000 + Math.random() * 9000)}`)
   - `status`: `'Open'`
   - `type`: `'file'` if rows exist, else `'single'`
   - `teamId`: `effectiveTeamId`
   - `visibility`: `effectiveVisibility`
   - `firstLevelMappedData`: sanitized rows
   - `fileMapping`, `uploadedFileHeaders`, `linkedHashtag`
2. **PostgreSQL Write**:
   - Calls `repo.createIssue(newIssue)`.
   - Executes parameterized `INSERT INTO issues (...) VALUES (...) ON CONFLICT (id) DO UPDATE...` covering 33 relational columns.
3. **Real-time Event Broadcast**:
   - Calls `eventService.broadcastEvent('issue:created', saved)` via SSE / WebSocket to notify connected team operators.

---

### Step 5: Dataset Streaming, Batching, & Cross-Task Duplicate Detection
- **Files**: 
  - [`backend/src/routes/issues.ts:113-131`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/issues.ts#L113-L131)
  - [`backend/src/services/datasetIngestionService.ts:57-190`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/datasetIngestionService.ts#L57-L190)
  - [`backend/src/store/postgresRepo.ts:446-490`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/store/postgresRepo.ts#L446-L490)

If transaction rows exist, `datasetIngestionService.ingestDatasetRows(saved.id, sanitizedRows, ...)` executes:

1. **Batch Allocation**:
   - Partitions rows into chunks of **500 records**.
   - Generates deterministic batch IDs: `BATCH-{taskSuffix}-001`, `BATCH-{taskSuffix}-002`, etc.
   - Assigns a sequential 1-indexed `row_number`.
2. **Cross-Task Duplicate Check (`central_transaction_repository`)**:
   - Resolves a canonical `transactionKey` (`tran_ref`, `transaction_id`, `tran_id`, etc.).
   - Queries `repo.getCentralTransaction(transactionKey)`:
     - **If transaction was in a CLOSED/RESOLVED task**: Marks `was_previously_closed = true`. Re-ingestion proceeds normally.
     - **If transaction is active in another task**: Marks `is_duplicate = true`, records `duplicate_from_task_id`, and flags discrepancy.
3. **Database Streaming to `task_dataset_transactions`**:
   - In [`postgresRepo.ts:446`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/store/postgresRepo.ts#L446) (`createTaskDatasetTransactions`):
     ```sql
     BEGIN;
     DELETE FROM task_dataset_transactions WHERE task_id = $1;
     INSERT INTO task_dataset_transactions (task_id, row_number, batch_id, canonical_data, raw_data)
     VALUES ($1, $2, $3, $4, $5), ... (up to 1,000 rows per chunk);
     UPDATE issues SET transaction_count = $1, dataset_status = 'INGESTED' WHERE id = $2;
     COMMIT;
     ```
4. **Master Ledger Upsert**:
   - Upserts entries into `central_transaction_repository` with status `INGESTED` or `DUPLICATE`.
5. **Broadcast Ingestion Completion**:
   - Calls `eventService.broadcastEvent('issue:dataset_ingested', { issueId, transactionCount, duplicateCount })`.
6. **HTTP Response**:
   - Responds with **HTTP 201 Created** containing the persisted task object.

---

### Step 6: Downstream Investigation Task Execution (Reconciliation Stage)
- **File**: [`backend/src/routes/investigations.ts:42-120`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/investigations.ts#L42-L120)

When an operator runs a validation/reconciliation workflow against an ingested task:
1. `POST /api/investigations/start` is called with `{ issueId, workflowId, transactions }`.
2. `planInvestigation()` generates the execution plan.
3. Creates an **`InvestigationTask`** in the **`investigation_tasks`** table (`id: inv-...`, `issueId`, `workflowId`, `totalTransactions`).
4. Creates batch records in **`investigation_batches`**.
5. Populates **`investigation_transactions`** with initial state `PENDING`.
6. Hands off execution to `investigationOrchestratorService` to extract external mirror data and execute validation rules.

---

## 3. Physical Database Tables Involved

| Database Table | Schema Role | Primary Keys / Indexes |
|---|---|---|
| **`issues`** | Primary task record, metadata, lifecycle status (`Open`), team ID, visibility, and mapping rules. | Primary Key: `id`<br>Index: `idx_issues_team_id`, `idx_issues_status` |
| **`task_dataset_transactions`** | Relational storage for all individual transaction rows belonging to the task. | Composite Key: `(task_id, row_number)`<br>Index: `idx_tdt_task_batch` |
| **`central_transaction_repository`** | Global ledger of all transaction keys to identify cross-task duplicates and track historical lineage. | Primary Key: `transaction_key` |
| **`workspace_table_records`** | Client session staging records storing raw vs. transformed row arrays. | Primary Key: `id` |
| **`investigation_tasks`** | Validation/Reconciliation execution instance run against a specific task and workflow. | Primary Key: `id`<br>Index: `idx_inv_tasks_issue_id` |
| **`investigation_transactions`** | Per-transaction audit trail and result status during workflow execution. | Composite Key: `(task_id, transaction_id)` |
