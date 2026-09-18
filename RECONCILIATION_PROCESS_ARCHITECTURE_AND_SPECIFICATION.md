# RECONCILIATION PROCESS ARCHITECTURE & TECHNICAL SPECIFICATION

> **Authoritative Current Architecture & Algorithmic Baseline**  
> **Repository Path**: `c:/Users/hp/Downloads/opration-workflow-mangement1`  
> **System Scope**: Back-Office (BO) Financial Settlement, Investigation, Validation, and Multi-Database Reconciliation  
> **Document Purpose**: Ground-truth specification for independent AI analysis, technical auditing, and architectural review.

---

## 1. System Overview & Architectural Reality

* **Primary Functionality**: Financial transaction cross-verification across disparate core banking systems (CBS), payment switches, card network clearing files, and customer dispute ledgers.
* **Primary Operational Datastore**: **PostgreSQL** (`operational_workflow_db`) managed through 26 relational tables (`backend/src/database/migrations/001_initial_schema.sql`) using connection pooling (`backend/src/config/postgres.ts`).
* **Active Runtime**:
  * **Backend**: Express 4.21.2 on Node.js, running on **Port 5002** (`backend/src/server.ts`).
  * **Frontend**: React 19.0.1, Vite 6.2.3, TailwindCSS 4.1.14 (`@tailwindcss/vite`), `motion`, `recharts`, `lucide-react`, and `xlsx`.
* **Database Drivers**:
  * Active & Connected: **PostgreSQL** (`pg`) and **MySQL 8.x** (`mysql2/promise`).
  * Legacy / Types only: **Oracle** (`oracledb` is not installed; interfaces exist in types for forward driver integration).

```text
[Input Feed: Excel / CSV / FTP Staging]
               │
               ▼ (Chunked Ingestion: 500 rows/batch)
    [task_dataset_transactions]  (Internal Staging System)
               │
               ▼ (Universal Ingestion Envelope)
  [workflowEngineSingleton] ──► LRU Cache & In-Flight Mutex Locks
               │
               ▼ (Pre-Flight Socket Ping: 3500ms timeout)
     [dbLivenessService]    ──► Circuit Breaker (PAUSED_DB_OFFLINE)
               │
               ▼ (Dynamic DDL on PostgreSQL)
    [mirrorTableManager]   ──► CREATE UNLOGGED TABLE mirror_{db}_{table}
               │
               ▼ (Batched Composite Tuple Queries: WHERE (k1, k2) IN (...))
 [externalDataQueryService]──► External System (Core Banking / Switch)
               │
               ▼ (Bulk Ingestion)
     [mirror_{db}_{table}] (Unlogged Microsecond Staging Table)
               │
               ▼ (Dynamic SQL Compilation)
     [ruleSqlCompiler]     ──► UPDATE mirror SET ... CASE WHEN ...
               │
               ▼ (Set-Based Partitioning)
   [reconciliationService] ──► Segregates PASS / FAIL / DISCREPANCY
               │
               ▼
[Maker-Checker & Snapshot Layer] ──► transaction_reversion_snapshots
```

---

## 2. Core Operational Governance Invariants

The reconciliation engine enforces five non-negotiable architectural invariants:

### Invariant 1: Strict Separation of Verdict vs. Pipeline Action
* **Validation Result (`ValidationResultStatus`)**: What the business rule discovers about a transaction:
  * `PASS`: Transaction met all rule criteria.
  * `FAIL`: Discrepancy, threshold violation, or data absence.
  * `ERROR`: Technical runtime exception (query timeout, syntax failure).
  * `PAUSED_DB_OFFLINE`: Halted because the target database tripped the circuit breaker.
* **Pipeline Action (`PipelineAction`)**: What the orchestration engine executes next:
  * `CONTINUE`: Advance transaction to the next stage or node.
  * `STOP`: Halt evaluation on this record immediately.
  * `CLOSE`: Mark this record as investigated, balanced, and closed.
  * `FLAG`: Isolate record as an operational exception for human triage.
  * `REPORT`: Output an intermediate diagnostic field to the investigation grid.
* *Rule*: A `FAIL` verdict does **not** stop the pipeline if `onFailAction: 'CONTINUE'`.

### Invariant 2: Four Decoupled Lifecycle Dimensions
The platform maintains complete separation between:
1. **Case / Task Lifecycle (`issues.status`)**: `Open` $\rightarrow$ `In Progress` $\rightarrow$ `Under Testing` $\rightarrow$ `Resolved` $\rightarrow$ `Closed`.
2. **Financial Transaction Status (`canonical_data.status_state`)**: `AUTHORIZED`, `SETTLED`, `PENDING`, `DECLINED`, `REVERSED`.
3. **Transaction Investigation Status (`investigation_status`)**: `UNINVESTIGATED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `PENDING_CHECKER_REVIEW` $\rightarrow$ `VERIFIED_MATCH` | `FLAGGED_DISCREPANCY` | `CLOSED`.
4. **Rule Execution Verdict (`final_result`)**: `NOT_EVALUATED` $\rightarrow$ `PASS` | `FAIL` | `ERROR` | `PAUSED_DB_OFFLINE`.

*Rule*: Resolving or closing an individual transaction investigation must **never** automatically close the parent Task/Issue.

### Invariant 3: Canonical Mapping Over Hard-Coding
* Physical database column names (e.g., `ACQ_INST_ID`, `TXN_AMT`, `UTRNNO`, `FE_TRACE`) are never hardcoded in service logic.
* Ingestion maps raw fields to canonical business fields in `global_standard_directory` via `database_table_mappings` (`{dbId}::{tableName}`).

### Invariant 4: Two-Tiered Staged Ingestion & Process Types
* External databases are protected from direct mutation by unverified scripts. Candidate transactions are extracted into the **Internal Staging System** (`task_dataset_transactions`).
* Process classification:
  * `READ_ONLY_AUDIT`: Diagnostic verification; zero data mutation.
  * `INTERNAL_STAGED_FIX`: Staged modifications inside the internal dataset; external databases remain untouched.
  * `CAUTIOUS_PROCESS`: High-impact external synchronizations. Requires:
    1. Automatic pre-change snapshot capture (`transaction_reversion_snapshots`),
    2. Staged execution against the internal working dataset first,
    3. Maker-Checker dual authorization before external commit,
    4. Granular point-in-time rollback capability.

### Invariant 5: Maker-Checker Dual Authorization (Four-Eyes Principle)
* Manual transaction adjustments (`FORCE_MATCH`, `WRITE_OFF`, `MANUAL_REVERSAL`) require an immutable evidence snapshot (`_inputData` + `_mirrorData`).
* Anti-Self-Approval constraint: `makerId !== checkerId` is strictly enforced at both the API route and service layers (HTTP 403 Forbidden).

---

## 3. Physical Database Entities & Schemas

### 3.1 `task_dataset_transactions`
Decoupled table storing individual rows uploaded from files or queries:
```sql
CREATE TABLE task_dataset_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(100) REFERENCES issues(id) ON DELETE CASCADE,
    batch_id VARCHAR(100),
    row_number INTEGER NOT NULL,
    canonical_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_task_dataset_task_row ON task_dataset_transactions(task_id, row_number);
CREATE INDEX idx_task_dataset_task_rrn ON task_dataset_transactions(task_id, (canonical_data->>'retrievalRefNum'));
CREATE INDEX idx_task_dataset_task_term ON task_dataset_transactions(task_id, (canonical_data->>'terminalId'));
```

### 3.2 `database_validation_workflows`
Stores DAG flowchart structures, validation boxes, and message aggregation rules:
```sql
CREATE TABLE database_validation_workflows (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    target_db_id VARCHAR(100),
    target_table VARCHAR(100),
    stages JSONB NOT NULL DEFAULT '[]'::jsonb,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
    connections JSONB NOT NULL DEFAULT '[]'::jsonb,
    message_aggregations JSONB DEFAULT '[]'::jsonb,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3.3 Dynamic `UNLOGGED` Mirror Tables (`mirror_{db}_{table}`)
Created dynamically by `mirrorTableManager.ts`:
```sql
CREATE UNLOGGED TABLE IF NOT EXISTS mirror_{db}_{table} (
    _mirror_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    _batch_id VARCHAR(100) NOT NULL,
    _source_id VARCHAR(100),
    _ingested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    _validation_status VARCHAR(50) DEFAULT 'PENDING',
    _validation_action VARCHAR(50) DEFAULT 'CONTINUE',
    _validation_details JSONB DEFAULT '{}'::jsonb,
    tx_key VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    [...dynamically projected external typed columns...]
);
CREATE INDEX idx_mirror_{db}_{table}_key ON mirror_{db}_{table}(tx_key);
CREATE INDEX idx_mirror_{db}_{table}_batch ON mirror_{db}_{table}(_batch_id);
```
*Why `UNLOGGED`?* Unlogged tables bypass PostgreSQL WAL (Write-Ahead Logging), giving 3x–5x faster bulk inserts for ephemeral reconciliation staging while still supporting full SQL indexing and relational joins.

### 3.4 `transaction_reversion_snapshots`
Stores immutable pre-change state before executing cautious solutions:
```sql
CREATE TABLE transaction_reversion_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(100) NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    solution_proposal_id VARCHAR(100),
    process_type VARCHAR(50) NOT NULL,
    pre_change_dataset JSONB NOT NULL,
    row_count INTEGER NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3.5 `resolution_approval_requests`
Maker-Checker authorization record:
```sql
CREATE TABLE resolution_approval_requests (
    id VARCHAR(100) PRIMARY KEY,
    issue_id VARCHAR(100) NOT NULL REFERENCES issues(id),
    transaction_id VARCHAR(100) NOT NULL,
    resolution_type VARCHAR(50) NOT NULL, -- FORCE_MATCH, WRITE_OFF, MANUAL_REVERSAL
    maker_id VARCHAR(100) NOT NULL,
    maker_name VARCHAR(100) NOT NULL,
    justification TEXT NOT NULL,
    checker_id VARCHAR(100),
    checker_notes TEXT,
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    input_data_snapshot JSONB NOT NULL,
    mirror_data_snapshot JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    applied_at TIMESTAMP WITH TIME ZONE
);
```

### 3.6 `central_transaction_repository`
Tracks global transaction lineage and prevents cross-task processing collisions:
```sql
CREATE TABLE central_transaction_repository (
    transaction_key VARCHAR(255) PRIMARY KEY,
    original_task_id VARCHAR(100) NOT NULL REFERENCES issues(id),
    current_task_id VARCHAR(100) NOT NULL REFERENCES issues(id),
    batch_id VARCHAR(100),
    row_number INTEGER,
    canonical_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(50) DEFAULT 'INGESTED',
    is_duplicate BOOLEAN DEFAULT FALSE,
    duplicate_from_task_id VARCHAR(100),
    duplicate_count INTEGER DEFAULT 1,
    duplicate_status VARCHAR(50) DEFAULT 'ORIGINAL',
    all_task_ids JSONB DEFAULT '[]'::jsonb,
    was_previously_closed BOOLEAN DEFAULT FALSE,
    reopen_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 4. Algorithmic Pipeline & Execution Flow

### Step 1: Universal Ingestion Envelope & Parameter Discovery
When an investigation is triggered, `investigationOrchestratorService.ts` extracts all user-configured parameters across:
* `step.searchParameters[].inputField`
* `step.requiredParams[]`
* `step.optionalParams[]`
* `step.sourceField` and `step.canonicalField`

It filters to the active parameters present in the file without hardcoding field names.

### Step 2: In-Flight Locking & LRU Cache Deduplication
In `workflowEngineSingleton.ts`:
* **LRU Cache** (`maxSize: 50,000`, `ttl: 300,000ms`): If a key was evaluated under the same workflow recently, cached verdicts are returned immediately.
* **In-Flight Mutex**: If an external query for transaction `TXN-881` is currently pending, concurrent requests await the active Promise rather than dispatching duplicate socket requests.

### Step 3: Pre-Flight Database Liveness Probe & Circuit Breaker
In `dbLivenessService.ts`:
* Dispatches a `SELECT 1` probe with a 3,500ms socket timeout.
* If dead or unreachable, the circuit trips to `OPEN`. All affected records are marked `PAUSED_DB_OFFLINE` with zero external timeout penalties.

### Step 4: Batched Chunk Extraction & Composite Tuple SQL
In `externalDataQueryService.ts`:
* Batches keys into chunks (50–100 records).
* Constructs composite tuple SQL rather than single-column lookups:
```sql
SELECT transaction_id, terminal_id, rrn, amount, response_code, status
FROM cbs_transactions
WHERE (terminal_id, rrn) IN (
    ('TERM-01', 'RRN-99401'),
    ('TERM-02', 'RRN-99402'),
    ('TERM-03', 'RRN-99403')
);
```

### Step 5: Multi-Row Resolution Policies
When an external query returns multiple rows for a single lookup key (e.g., authorization, reversal, fee), `externalDataQueryService.ts` applies the configured policy:
* `LATEST`: Orders by timestamp descending and selects the most recent transaction leg.
* `EARLIEST`: Selects the original initialization leg.
* `AGGREGATE_SUM`: Sums configured numeric columns (e.g., partial reversals).
* `COMPOSITE_BUNDLE`: Bundles records into an array representing the complete transaction lifecycle (`ORIGINAL.DEBIT`, `REVERSAL.CREDIT`).
* `STRICT_SINGLE`: Throws an ambiguity error if duplicate records exist.

### Step 6: Dynamic Rule-to-SQL Compilation
In `ruleSqlCompiler.ts`:
Declarative rules are compiled directly into a single native PostgreSQL `UPDATE ... CASE` query executed across the mirror table:
```sql
UPDATE mirror_cbs_transactions m
SET 
  _validation_status = CASE 
    WHEN (
      m._mirror_id IS NOT NULL 
      AND ABS(COALESCE((m.amount)::numeric, 0) - COALESCE((t.canonical_data->>'amount')::numeric, 0)) <= 0.01
      AND UPPER(COALESCE(m.status::text, '')) = 'SETTLED'
    ) THEN 'PASS'
    ELSE 'FAIL'
  END,
  _validation_action = CASE 
    WHEN (m._mirror_id IS NOT NULL AND ...) THEN 'CONTINUE'
    ELSE 'STOP'
  END,
  _validation_details = jsonb_build_object(
    'existence', CASE WHEN m._mirror_id IS NOT NULL THEN 'MATCH' ELSE 'MISSING' END,
    'amountDiff', ABS(COALESCE((m.amount)::numeric, 0) - COALESCE((t.canonical_data->>'amount')::numeric, 0))
  )
FROM task_dataset_transactions t
WHERE m._batch_id = $1 AND m.tx_key = (t.canonical_data->>'transaction_id');
```

### Step 7: Key Chaining & Multi-Database Stage Routing
* For multi-stage pipelines (e.g., Stage 1: Payment Gateway $\rightarrow$ Stage 2: Core Banking $\rightarrow$ Stage 3: Card Network Switch), passed keys are chained downstream:
```typescript
currentActiveKeys = passKeys;
currentActiveRecords = currentActiveRecords.filter((r, idx) => {
  const rKeys = getRecordCandidateKeys(r, idx);
  return rKeys.some(k => passKeys.includes(k));
});
```
* If a stage produces zero passed records, execution terminates early to prevent futile downstream queries.

---

## 5. API Route Inventory (Reconciliation & Investigation)

| Method | Endpoint | Description | Key Request Parameters | Response Contract |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/investigations/execute-universal` | Core execution endpoint for investigation grids, sandbox, and automated tasks. | `{ workflowId, records: [], keyField, keyFields: [], priority, forceRerun, executedBy }` | `{ jobId, workflowId, totalRecords, passedCount, failedCount, cachedHits, durationMs, records: [] }` |
| `POST` | `/api/investigations/plan` | Validates a candidate workflow against an input dataset and generates chunk plans. | `{ transactions: [], workflowId, batchPolicy: { batchSize: 50 }, keyField }` | `{ isValid: boolean, plan: { batches: [], transactionCount: number }, errors: [] }` |
| `POST` | `/api/investigations/start` | Creates a persisted `InvestigationTask` and runs batched execution. | `{ transactions: [], workflowId, issueId, teamTaskId, keyField }` | `{ task: InvestigationTask, parentAggregation: {}, transactions: [] }` |
| `GET` | `/api/investigations/:id` | Fetches investigation task status and associated batches. | `id` (Task UUID) | `{ task: InvestigationTask, batches: InvestigationBatch[] }` |
| `GET` | `/api/investigations/:taskId/central-records` | Fetches Sheet 1 Master Ledger records with cross-task duplicate detection. | `taskId` | `{ taskId, totalCount: number, records: [] }` |
| `GET` | `/api/investigations/:taskId/workflow-executions` | Lists completed/cached workflow executions for a specific task. | `taskId` | `{ taskId, count: number, executions: TaskWorkflowExecution[] }` |
| `DELETE` | `/api/investigations/:taskId/workflow-executions`| Clears validation execution history for a specific task. | `taskId` | `{ success: true, taskId, deleted: number }` |
| `POST` | `/api/resolutions/propose` | Submits a Maker resolution proposal requiring Checker review. | `{ issueId, transactionId, resolutionType, justification, inputDataSnapshot, mirrorDataSnapshot }` | `{ success: true, requestId, status: 'PENDING' }` |
| `POST` | `/api/resolutions/:id/review` | Checker approves or rejects a proposed resolution (`makerId !== checkerId`). | `{ approved: boolean, notes: string }` | `{ success: true, status: 'APPROVED' \| 'REJECTED' }` |
| `POST` | `/api/issues/:id/revert` | Granular rollback: reverts dataset to pre-change snapshot. | `{ transactionId?: string }` (Optional single row rollback) | `{ success: true, revertedCount: number, timestamp }` |
| `GET` | `/api/issues/:id/audit-dossier` | Exports a single unified immutable audit dossier. | `id` (Issue ID) | `{ taskMetadata, chatHistory, investigationResults, rawExtracts, solutionScript, reversionAudit }` |
| `GET` | `/api/hashtags/resolve/:tag` | Resolves all bound assets (workflows, templates, DB connections, tasks, KPIs) by hashtag. | `tag` (e.g. `AIB_SETTLEMENT_2026`) | `{ hashtag, workflows: [], presets: [], tasks: [], dbConfigs: [], kpis: [] }` |

---

## 6. Key Design Choices & Rationale

| Design Decision | Alternative Rejected | Architectural Rationale |
| :--- | :--- | :--- |
| **PostgreSQL `UNLOGGED` Mirror Tables** | In-Memory JavaScript Objects / Redis | When reconciling 50,000+ rows, in-memory loops cause V8 garbage collection thrashing and out-of-memory crashes. PostgreSQL `UNLOGGED` tables provide microsecond writes, zero WAL overhead, and allow PostgreSQL's query optimizer to execute hash joins across indexed columns. |
| **Dynamic SQL Compilation (`CASE WHEN ...`)** | Iterating rows in Node.js with `if/else` | Compiling rules to SQL transforms row-by-row CPU-bound checks into a single atomic set-based database statement, reducing runtimes from minutes to milliseconds. |
| **Composite Tuple Queries (`WHERE (k1, k2) IN (...)`)** | Nested `WHERE k1 = $1 AND k2 = $2` or client filtering | Banking switch records often lack a single global primary key. Matching on composite keys (e.g., `terminal_id + rrn + amount`) directly in the database eliminates massive full-table transfers. |
| **Dual Staging (Internal First, External Second)** | Direct mutation on target databases | High-impact solution scripts cannot be allowed to mutate live core banking or switch tables without staged testing. Staging changes in `task_dataset_transactions` allows operators to test accuracy, review discrepancies, and capture snapshots before any live commit. |
| **Mandatory Anti-Self-Approval (`makerId !== checkerId`)** | Single-click operator overrides | Financial discrepancy overrides (`FORCE_MATCH`, `WRITE_OFF`) carry fraud risk. Enforcing Maker-Checker dual authorization guarantees an immutable audit trail compliant with banking regulatory standards. |

---

## 7. Recommended Instructions for External AI Models

When feeding this context into another AI model, provide this guiding prompt:

> *"Analyze this architecture based strictly on the provided specifications. The primary database is PostgreSQL with UNLOGGED mirror tables. Rules are compiled to set-based SQL expressions. Validation verdicts ('PASS'/'FAIL') are strictly decoupled from pipeline execution actions ('CONTINUE'/'STOP'/'CLOSE'/'FLAG'/'REPORT'). Evaluate according to these documented constraints without assuming MongoDB, in-memory loops, or single-tier mutations."*
