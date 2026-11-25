# Deep Technical Inspection: Rule Builder, Transaction Investigation & Multi-Database Architecture

> **Inspection Date**: September 3, 2026  
> **Repository**: `operation-workflow-management1`  
> **Status**: Read-only architectural inspection completed. No source code modifications made.

---

## Table of Contents
1. [Current Rule Builder](#1-current-rule-builder)
2. [Transaction Investigation Flow](#2-transaction-investigation-flow)
3. [Task / Case / Transaction Relationship](#3-task--case--transaction-relationship)
4. [External Database Architecture](#4-external-database-architecture)
5. [Global Mapping](#5-global-mapping)
6. [Database Validation](#6-database-validation)
7. [Rule Execution Engine](#7-rule-execution-engine)
8. [Status / Result / Action Model](#8-status--result--action-model)
9. [Investigation Stages](#9-investigation-stages)
10. [Existing Data Models](#10-existing-data-models)
11. [Frontend Component Map](#11-frontend-component-map)
12. [Backend API Map](#12-backend-api-map)
13. [Current Gaps](#13-current-gaps)
14. [Reuse vs New](#14-reuse-vs-new)
15. [Concrete End-to-End Execution Trace](#15-concrete-end-to-end-execution-trace)
16. [Constraint Verification](#16-constraint-verification)
---
- [Executive Architecture Summary (A–I)](#executive-architecture-summary)

---

## 1. CURRENT RULE BUILDER

### 1.1 Where Rules are Defined
- **Primary Frontend UI**: [`frontend/src/components/settings/DatabaseValidationSettings.tsx`](frontend/src/components/settings/DatabaseValidationSettings.tsx)  
  Houses the **3-Block Visual Rule Builder**, rule blueprint library drawer, natural language sentence generator, and local simulation runner.
- **Investigation Pipeline Configuration**: [`frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx`](frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx)  
  Houses `pipelineSteps: ValidationStepConfig[]` used in the investigation table.
- **Hashtag Resolution Criteria Rules**: [`frontend/src/components/IssueCreator.tsx`](frontend/src/components/IssueCreator.tsx) and [`frontend/src/components/issue/HashtagManager.tsx`](frontend/src/components/issue/HashtagManager.tsx)  
  Houses `CriteriaRule[]` attached to `HashtagPreset`.
- **Backend Models**: [`backend/src/models/HashtagPreset.ts`](backend/src/models/HashtagPreset.ts) and [`backend/src/types.ts`](backend/src/types.ts) define `CriteriaRule`.  
  *Crucial finding*: Neither `DatabaseValidationWorkflow` nor `ValidationCheckStep` exists in backend Mongoose models or backend routes. They are currently frontend-only interfaces.

### 1.2 How Rules are Persisted
- Workflows are stored in browser **`localStorage`** under the key `'operational_validation_workflows_v1'` (`DatabaseValidationSettings.tsx: lines 312–320`). If the key is absent, the UI loads hardcoded `DEFAULT_WORKFLOWS`.
- `ValidationStepConfig` in `ValidationOrchestratorWorkspace.tsx` is held in React component state (`useState(pipelineSteps)`), with predefined templates in `savedWorkflows`.
- **Backend Persistence**: None. There are no backend database collections or endpoints saving `DatabaseValidationWorkflow`.

### 1.3 Complete Rule Data Structure & Schema
From [`DatabaseValidationSettings.tsx`](frontend/src/components/settings/DatabaseValidationSettings.tsx):

```typescript
export interface ValidationCheckStep {
  id: string;
  stepNumber: number;
  name: string;
  description?: string;
  checkType: 'SQL_CONDITION' | 'FIELD_COMPARATOR' | 'REGEX_MATCH' | 'EXISTENCE_CHECK' | 'NUMERIC_THRESHOLD' | 'ISO_DECLINE_CODE';
  targetDbId: string;
  targetTable: string;
  
  // Custom Criteria
  sqlCondition?: string;
  sourceField?: string;
  comparator?: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'IN' | 'LIKE' | 'REGEX';
  targetField?: string;
  compareValue?: string;
  regexPattern?: string;
  
  // Parameter Management
  requiredParams: string[];
  optionalParams: string[];
  
  // Advanced Logic & Workflow Orchestration
  dependencyCondition: 'ALWAYS' | 'IF_PREV_SUCCESS' | 'IF_PREV_FAILURE' | 'IF_PREV_DATASET_NON_EMPTY';
  holdStateVariable?: string;
  
  // Filtering and Recursive Validation
  applyFilterOnPrevResult?: boolean;
  filterField?: string;
  filterOperator?: '=' | '!=' | '>' | '<' | 'CONTAINS';
  filterValue?: string;
  
  // Output Configuration
  successMessage?: string;
  failureMessage?: string;
  severityOnFailure: 'CRITICAL' | 'WARNING' | 'INFO';
}

export interface DatabaseValidationWorkflow {
  id: string;
  name: string;
  description: string;
  targetDbId: string;
  targetTable: string;
  category: 'Settlement' | 'Fulfillment' | 'Compliance' | 'Reconciliation' | 'Custom';
  steps: ValidationCheckStep[];
  globalSuccessMessage: string;
  globalFailureMessage: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isSystemDefault?: boolean;
}
```

### 1.4 Rule Types, Condition Types & Execution Triggers
- **Rule Types**:
  - `EXISTENCE_CHECK`: Validates entity presence in the target database table.
  - `FIELD_COMPARATOR`: Checks column status against an expected literal.
  - `ISO_DECLINE_CODE`: Inspects response codes for ISO-8583 bank declines (`05`, `51`, `14`, etc.).
  - `SQL_CONDITION`: Custom SQL expression/predicate (e.g., SLA window check).
  - `NUMERIC_THRESHOLD`: Validates numeric boundaries.
  - `REGEX_MATCH`: Regular expression pattern matching.
  - In `ValidationOrchestratorWorkspace`: `DB_EXISTENCE`, `AMOUNT_MATCH`, `DECLINE_CODE_CHECK`, `STATUS_MATCH`, `CROSS_DB_LOOKUP`.
  - In `HashtagPreset`: `is_required`, `must_be_numeric`, `value_greater_than`, `length_matches`.
- **Condition Comparators**: `=`, `!=`, `>`, `<`, `>=`, `<=`, `IN`, `LIKE`, `REGEX`.
- **Execution Triggers**: `dependencyCondition: 'ALWAYS' | 'IF_PREV_SUCCESS' | 'IF_PREV_FAILURE' | 'IF_PREV_DATASET_NON_EMPTY'`.

### 1.5 How Previous-Rule Conditions Work
In `handleRunSimulation` (`DatabaseValidationSettings.tsx: lines 610–625`):
```typescript
let prevSuccess = true;
editingWorkflow.steps.forEach((step, idx) => {
  if (idx > 0 && step.dependencyCondition === 'IF_PREV_SUCCESS' && !prevSuccess) {
    logs.push({
      stepNumber: step.stepNumber,
      status: 'SKIPPED',
      message: `Skipped because Step ${idx} failed dependency criteria.`
    });
    return;
  }
  // If step fails:
  if (isFail) {
    prevSuccess = false;
    // ...
  }
});
```
If a step fails, `prevSuccess` is set to `false`, causing downstream `IF_PREV_SUCCESS` steps to log as `SKIPPED`.

### 1.6 Success, Failure & Action Representation
- **Success / Failure Representation**:
  - Step Status: `'PASSED' | 'FAILED' | 'SKIPPED'` (in test logs) and `'PASSED' | 'FAILED' | 'WARNING' | 'SKIPPED'` (in `StepExecutionResult`).
  - Step Failure Severity: `'CRITICAL' | 'WARNING' | 'INFO'`.
  - Row Overall Severity: `'CRITICAL' | 'WARNING' | 'RECONCILED' | 'MISSING'`.
- **Concept of Actions (CONTINUE, STOP, CLOSE)**:
  - **NO.** There are currently no pipeline action directives such as `CONTINUE`, `STOP`, or `CLOSE`. The execution flow only computes step outcome badges and severity.

### 1.7 Ordering, Simulation & APIs
- **Ordering**: Strict 1-indexed array order based on `stepNumber: number`.
- **Testing / Simulation**: Client-side simulated execution in `handleRunSimulation()` using `setTimeout(..., 650)`. Evaluates mandatory parameters against `testInputs` and returns mock execution timing and logs.
- **APIs Involved**: None.

---

## 2. TRANSACTION INVESTIGATION FLOW

### 2.1 Where a Transaction is Loaded & Identified
- **Loading Sources**:
  1. **Batch File Upload**: In `IssueCreator.tsx`, parsed from CSV/XLSX into `Issue.firstLevelMappedData: Record<string, any>[]`.
  2. **Working DB**: In `backend/src/routes/transactionSettings.ts`, via `GET /api/transactions/working-db`.
  3. **SQL Query Sandbox**: In `DbQueryTool.tsx`, via `POST /api/db/query/execute`.
  4. **Investigation Workspace**: Loaded into `ValidationOrchestratorWorkspace.tsx` from `selectedIssue.firstLevelMappedData` (or sample rows if empty).
- **Transaction Identifier**: Canonical key `transaction_id`. Alternatively `row.id`, `row.card_number`, or fallback row key `ROW-${idx + 1}`.

### 2.2 Transaction Status vs. Investigation Status
- **Transaction Status**:
  - Strongly typed in `Transaction.status`: `'PENDING' | 'SETTLED' | 'DECLINED' | 'REVERSED'`.
  - In raw mapped rows: dynamic field `status` or `status_state`.
- **Investigation Status**:
  - Only exists at the Case/Issue level: `Issue.status: 'Open' | 'Investigating' | 'Resolved' | 'Closed'`.
  - Individual transaction rows within a batch do **not** have an independent investigation lifecycle status.
- **Separation**: Yes, case lifecycle and transaction state are distinct, but there is no per-transaction investigation closure status.

### 2.3 Investigation Lifecycle & Execution Flow
1. **Triggering**:
   - Operator navigates to the Investigation tab (`InvestigationWorkspace.tsx` -> `ValidationOrchestratorWorkspace.tsx`).
   - The workspace reads `selectedIssue.firstLevelMappedData`.
   - A React `useMemo` automatically runs `pipelineSteps` across all rows.
2. **Success Flow**:
   - The row is marked `'PASSED'` for that step (e.g. `'Found (200)'` or `'Match'`).
   - If all steps pass, row `overallSeverity` remains `'RECONCILED'`.
3. **Failure Flow**:
   - Step status becomes `'FAILED'` or `'WARNING'`.
   - Row `overallSeverity` transitions to `'CRITICAL'`, `'WARNING'`, or `'MISSING'`.
   - A client-side template constructs suggested `remedySql` (e.g., `UPDATE transactions SET status = 'REVERSED' WHERE card_number = '...'`).
4. **Sequential Execution**: All enabled steps in `pipelineSteps` execute in a loop for each transaction.
5. **Closure & Persistence**:
   - **No automatic closure exists**. The operator must manually update the parent issue status.
   - Results are held in ephemeral React state (`orchestratedRows`) and are **not persisted** to backend tables.

---

## 3. TASK / CASE / TRANSACTION RELATIONSHIP

### 3.1 Entity Hierarchy & Multi-Transaction Support
- **Case / Issue (`Issue`)**: The main operational ticket.
- **Team Task (`TeamTask`)**: A Kanban collaboration task (`status: 'To Do' | 'In Progress' | 'Done'`).
- **Transaction (`Transaction` / row record)**: An individual transaction record.
- **Can one Task/Case contain multiple transactions?**
  **YES.** When an `Issue` is created via file upload (`type === 'file'`), `Issue.firstLevelMappedData` holds an array of rows (representing 10, 100, or 10,000 transactions).

### 3.2 Status Matrix
| Entity | Status Field | Allowed Values |
| :--- | :--- | :--- |
| **Case / Issue** | `Issue.status` | `'Open'`, `'Investigating'`, `'Resolved'`, `'Closed'` |
| **Team Task** | `TeamTask.status` | `'To Do'`, `'In Progress'`, `'Done'` |
| **Transaction** | `Transaction.status` | `'PENDING'`, `'SETTLED'`, `'DECLINED'`, `'REVERSED'` |
| **Row Validation** | `OrchestratedRow.overallSeverity` | `'CRITICAL'`, `'WARNING'`, `'RECONCILED'`, `'MISSING'` |

### 3.3 Closure Mechanics
- **Closing a Transaction**: There is no transaction-level "closed" flag. Operators update status via SQL DML statements (`status = 'SETTLED'` or `'REVERSED'`).
- **Closing a Task/Case**: Operator changes `Issue.status` to `'Resolved'` or `'Closed'`.
- **Does closing a transaction affect the parent task?**
  **NO.** Reconciling or modifying an individual transaction has no automated impact on the parent `Issue` or `TeamTask`.

---

## 4. EXTERNAL DATABASE ARCHITECTURE

### 4.1 Database Connectivity & Model
- **Supported Engines**: `PostgreSQL`, `Oracle`, `MySQL`, `MongoDB` (defined in `backend/src/models/DatabaseConnection.ts`).
- **Model Properties**: `id`, `name`, `type`, `host`, `port`, `connectionString`, `databaseName`, `username`, `password`, `status: 'online' | 'offline'`, `apiEndpoint`, `isExternal: boolean`, `systemCategory: ExternalSystemCategory`, `environmentType: BankingEnvironmentType`.
- **Database Selection**: Selected via UI dropdowns by `dbId`.
- **Table / Column Selection**: Physical table name (`targetTable`) is entered as text or picked from presets. Column mappings are defined in `DbTableMappingConfig.columns: [{ globalKey, physicalColumn }]`.

### 4.2 Query Execution & Security
- **Execution Endpoint**: `POST /api/db/query/execute` in `backend/src/routes/database.ts: lines 443–580`.
- **Current Backend Implementation**: Intercepts SQL strings, detects `SELECT` vs `UPDATE`, queries uploaded transactions (`UploadedTransactionRecordModel` / `store.uploadedTransactions`), logs usage in `ConnectionUsageLogModel`, and returns formatted rows.
- **Frontend SQL Construction**: Frontend components (`ValidationOrchestratorWorkspace.tsx`, `IssueResolutionPanel.tsx`, `DbQueryTool.tsx`) directly generate SQL strings.
- **Backend Guardrails**: Checks user permissions (`canExecuteSelect`, `canExecuteUpdate`), inspects query keywords with regex (`/UPDATE|DELETE|INSERT|DROP|ALTER/i`), triggers `QueryApprovalRequest` for restricted environments, and logs all queries.

### 4.3 Processing Stage Concept
`NO EXISTING PROCESSING-STAGE ABSTRACTION FOUND`

There is currently no model or type representing an external processing stage (e.g. Ingress, Authorization, Clearing, Settlement) in the transaction lifecycle.

---

## 5. GLOBAL MAPPING

### 5.1 Canonical Fields & Mapping Architecture
- **Canonical Fields**: Defined in `frontend/src/services/globalMappingService.ts` (`DEFAULT_GLOBAL_STANDARD_FIELDS`):
  `transaction_id`, `card_number`, `amount_usd`, `status_state`, `created_at`, `user_email`, `merchant_id`, `response_code`, `currency`, `terminal_id`, `dispute_reason`, `batch_seq_num`.
- **Physical Column Mapping**: Defined in `DbTableMappingConfig`:
  ```typescript
  columns: [
    { globalKey: 'transaction_id', physicalColumn: 'txn_ref_num' },
    { globalKey: 'amount_usd', physicalColumn: 'tran_amt_usd' },
    { globalKey: 'status_state', physicalColumn: 'tran_status_cd' }
  ]
  ```
- **Storage**: Frontend uses `localStorage.getItem('global_mapping_schema_config_v2')`. Backend uses `GlobalTransactionSchemaConfigModel` and `store.globalSchema`.
- **How Rules Reference Fields**: In `DatabaseValidationSettings.tsx`, parameter presets and target field datalists dynamically load canonical keys from `globalMappingService.getStandardFields()`.
- **Limitation**: Each rule step is bound directly to a concrete `targetDbId` and physical `targetTable` string, rather than referencing an abstract stage that dynamically resolves the physical table/view per system.

---

## 6. DATABASE VALIDATION

- **Existence Check**: Checks whether the lookup key exists in the target table (simulated in UI as `status = 'PASSED'` or `status = 'FAILED'`, badge `'404 Missing'`).
- **Field Comparison**: Evaluates `sourceField` vs `compareValue` using `comparator` (`=`, `!=`, `>`, etc.).
- **ISO Decline Code**: Checks `response_code` against `'00'`; flags decline codes (`05`, `14`, `51`, `54`, `61`, `91`, `96`).
- **SQL Condition**: Text expression evaluated during test simulations.
- **Conversion to PASS / FAIL**: Simple boolean comparison.
- **Not Found Record**: Treated as business failure (`status: 'FAILED'`, badge `'404 Missing'`).
- **Query Error**: Caught in `catch` blocks and logged as text.
- **Distinction Between Business Failure and Technical Error**:
  **NO.** Both are lumped into `status: 'FAILED'`.

---

## 7. RULE EXECUTION ENGINE

### Is there an actual centralized rule execution engine?
**NO.** There is no centralized rule execution engine or service.

### Current Implementation Locations
Rule execution logic is duplicated across four distinct UI components:
1. `DatabaseValidationSettings.tsx`: `handleRunSimulation()` simulates multi-step sequencing for workflow design.
2. `ValidationOrchestratorWorkspace.tsx`: A local React `useMemo` iterates `pipelineSteps` over batch rows.
3. `DatabaseCrossVerificationPanel.tsx`: A local React `useMemo` runs cross-database comparison logic.
4. `IssueCreator.tsx`: Evaluates `preset.criteriaRules` against uploaded CSV/XLSX preview rows.

---

## 8. STATUS / RESULT / ACTION MODEL

### 8.1 Validation Result
- **Existing Values**: `'PASSED'`, `'FAILED'`, `'SKIPPED'`, `'WARNING'`.
- **Missing Value**: `'ERROR'` (distinguishing technical runtime / network / timeout errors from business validation failures).

### 8.2 Pipeline Action
- **Existing Values**: None.
- **Missing Values**: `'CONTINUE'`, `'CLOSE'`, `'STOP'`.
- The only flow control currently present is `dependencyCondition: 'ALWAYS' | 'IF_PREV_SUCCESS' | 'IF_PREV_FAILURE' | 'IF_PREV_DATASET_NON_EMPTY'`. There is no action model controlling pipeline flow or transaction closure.

---

## 9. INVESTIGATION STAGES

`NO EXISTING PROCESSING-STAGE ABSTRACTION FOUND`

The application has no concept of a generic "Processing Stage", "Investigation Stage", or "Transaction Lifecycle Stage" separate from physical database tables. Rules currently connect directly to physical table strings.

---

## 10. EXISTING DATA MODELS

| Model / Type | File Path | Key Fields | Relationships |
| :--- | :--- | :--- | :--- |
| **`Transaction`** | [`frontend/src/types.ts:278`](frontend/src/types.ts#L278) | `id`, `timestamp`, `cardNumber`, `amount`, `currency`, `status`, `responseCode`, `dbOrigin` | Core transaction entity |
| **`Issue`** | [`frontend/src/types.ts:113`](frontend/src/types.ts#L113) & [`backend/src/models/Issue.ts`](backend/src/models/Issue.ts) | `id`, `title`, `description`, `status`, `priority`, `type`, `firstLevelMappedData`, `fileMapping`, `linkedHashtag` | Parent Case / Task holding batch rows |
| **`TeamTask`** | [`frontend/src/types.ts:62`](frontend/src/types.ts#L62) & [`backend/src/models/TeamTask.ts`](backend/src/models/TeamTask.ts) | `id`, `teamId`, `title`, `description`, `assigneeId`, `status`, `priority` | Team Kanban task |
| **`ValidationCheckStep`** | [`DatabaseValidationSettings.tsx:17`](frontend/src/components/settings/DatabaseValidationSettings.tsx#L17) | `id`, `stepNumber`, `checkType`, `targetDbId`, `targetTable`, `sourceField`, `comparator`, `dependencyCondition`, `severityOnFailure` | Step inside `DatabaseValidationWorkflow` |
| **`DatabaseValidationWorkflow`** | [`DatabaseValidationSettings.tsx:55`](frontend/src/components/settings/DatabaseValidationSettings.tsx#L55) | `id`, `name`, `targetDbId`, `targetTable`, `category`, `steps: ValidationCheckStep[]` | Multi-step validation workflow |
| **`ValidationStepConfig`** | [`ValidationOrchestratorWorkspace.tsx:24`](frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx#L24) | `id`, `stepNumber`, `checkType`, `targetDbId`, `targetTable`, `lookupDatasetKey`, `targetDbColumn`, `enabled` | Investigation pipeline step |
| **`OrchestratedRow`** | [`ValidationOrchestratorWorkspace.tsx:47`](frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx#L47) | `rowId`, `sourceRecord`, `stepResults`, `overallSeverity`, `remedySql` | Evaluated row in investigation table |
| **`DatabaseConnection`** | [`frontend/src/types.ts:226`](frontend/src/types.ts#L226) & [`backend/src/models/DatabaseConnection.ts`](backend/src/models/DatabaseConnection.ts) | `id`, `name`, `type`, `host`, `port`, `connectionString`, `status`, `apiEndpoint`, `isExternal`, `systemCategory` | Target database connection |
| **`GlobalTransactionSchemaField`** | [`frontend/src/types.ts:306`](frontend/src/types.ts#L306) | `key`, `label`, `description`, `dataType`, `required`, `exampleValue` | Canonical Global Mapping field |
| **`DbTableMappingConfig`** | [`frontend/src/types.ts:329`](frontend/src/types.ts#L329) | `dbId`, `dbName`, `tableName`, `columns: [{ globalKey, physicalColumn }]` | Physical table to canonical mapping |

---

## 11. FRONTEND COMPONENT MAP

| Component | File Path | Current Role | Modification Needed for Stage-Aware Rules? |
| :--- | :--- | :--- | :--- |
| **`DatabaseValidationSettings`** | `frontend/src/components/settings/DatabaseValidationSettings.tsx` | Rule Builder & workflow configuration UI | **YES**: Add Stage selector, Action selector (`CONTINUE`, `STOP`, `CLOSE`), and result routing. |
| **`ValidationOrchestratorWorkspace`** | `frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx` | Investigation Workspace table & step runner | **YES**: Execute stage-aware rules, evaluate Actions, display stage progression. |
| **`DatabaseCrossVerificationPanel`** | `frontend/src/components/investigation/DatabaseCrossVerificationPanel.tsx` | Parameterized multi-DB verification | **Optional**: Align with stage-based query resolution. |
| **`GlobalTransactionSettings`** | `frontend/src/components/GlobalTransactionSettings.tsx` | Canonical schema & table mapping management | **Optional**: Add stage grouping to table mappings. |
| **`IssueDetailView`** | `frontend/src/components/IssueDetailView.tsx` | Master case management & triage | **YES**: Display per-transaction stage status & investigation closure state. |
| **`DbQueryTool`** | `frontend/src/components/DbQueryTool.tsx` | SQL Sandbox and query console | **NO**: Remains general-purpose database query tool. |
| **`IssueCreator`** | `frontend/src/components/IssueCreator.tsx` | Uploads file and creates case | **Minor**: Pass initial processing stage if specified. |

---

## 12. BACKEND API MAP

```
Frontend → API Client → Express Route → Storage / Repository → Model / Store
```

1. **Database Connections**:  
   `DbQueryTool / Settings` → `api.getDatabases()` → `GET /api/db/databases` → `repo.getDatabases()` → `DatabaseConnectionModel` / `store.databases`
2. **Query Execution**:  
   `DbQueryTool` → `api.executeQuery()` → `POST /api/db/query/execute` → `database.ts handler` → `UploadedTransactionRecordModel` / `store.uploadedTransactions` + `ConnectionUsageLogModel`
3. **Transaction Schema & Mappings**:  
   `GlobalTransactionSettings` → `api.getTransactionSettings()` → `GET /api/transactions/settings` → `GlobalTransactionSchemaConfigModel` + `TransactionTemplateModel`
4. **Cases / Issues**:  
   `IssueDetailView` → `api.getIssues()` / `api.updateIssue()` → `GET/PUT /api/issues/:id` → `repo.updateIssue()` → `IssueModel` / `store.issues`
5. **Validation Rules**:  
   `DatabaseValidationSettings` → `localStorage` (**No backend API currently exists**).

---

## 13. CURRENT GAPS

To support the target workflow:  
`Transaction → Processing Stage → External Data Source → Validation Rule → Validation Result → Pipeline Action → Next Rule/Stage OR Close OR Stop`

The following gaps exist in the current implementation:

1. **No Processing Stage Entity**: No abstraction connects an external system to a business stage (e.g. Ingress, Auth, Settlement) before mapping to physical tables.
2. **No Pipeline Action Model**: Rule steps have no concept of `CONTINUE`, `STOP`, or `CLOSE`.
3. **Incomplete Validation Result Model**: Results only distinguish `PASSED`, `FAILED`, and `SKIPPED`. There is no distinction between a business rule failure and a technical query/connection `ERROR`.
4. **No Centralized Execution Service**: Rule execution is hardcoded in UI component loops (`useMemo` in `ValidationOrchestratorWorkspace` and `setTimeout` in `DatabaseValidationSettings`). There is no reusable execution engine that can run on either frontend or backend.
5. **No Per-Transaction Investigation Status**: Transactions in a batch only have financial status (`status_state`). There is no independent status indicating whether an individual transaction's investigation is `IN_PROGRESS`, `FLAGGED`, `RECONCILED`, or `CLOSED`.
6. **No Backend Persistence for Rule Workflows**: Rule workflows exist only in browser `localStorage`. They cannot be shared across team members or executed headless on the backend.

---

## 14. REUSE VS NEW

### 14.1 Existing Functionality to Reuse
- `GlobalTransactionSchemaField` and `globalMappingService` (canonical fields dictionary).
- `DbTableMappingConfig` (table column to canonical field mapping).
- `DatabaseConnection` model and configuration.
- `Issue.firstLevelMappedData` for batch transaction row storage.
- Rule condition structures (`checkType`, `comparator`, `compareValue`, `sqlCondition`, `requiredParams`, `severityOnFailure`).
- `ValidationOrchestratorWorkspace` visual table grid, cell inspectors, and Excel-style filtering.
- `ConnectionUsageLogModel` and `QueryApprovalRequestModel` query safety mechanisms.

### 14.2 New Concepts to Introduce
- **`ProcessingStage` / `InvestigationStage`**: An abstraction representing an operational or lifecycle stage (e.g., `Stage 1: Gateway Ingress`, `Stage 2: Core Authorization`, `Stage 3: Settlement Clearing`) which binds to an external data source and table mapping.
- **Pipeline Actions (`PipelineAction`)**: `'CONTINUE'`, `'STOP'`, `'CLOSE'`.
- **Three-state Validation Result (`ValidationResultStatus`)**: `'PASS'`, `'FAIL'`, `'ERROR'`.
- **Per-Transaction Investigation State**: Adding a dedicated investigation state to individual transactions (`investigationStatus: 'PENDING' | 'PASSED' | 'FLAGGED' | 'CLOSED'`) so closing one transaction is independent from the parent task.
- **Unified Rule Engine Service**: A single pure evaluation function/service (`evaluateRuleStep`, `runStagePipeline`) reusable across components.
- **Backend Workflow API / Model**: Persisting workflows to MongoDB / in-memory store so rules are available system-wide.

---

## 15. CONCRETE END-TO-END EXECUTION TRACE

Trace of a hypothetical transaction through the current system:

1. **Transaction Enters Investigation**:
   - Operator creates an issue in [`IssueCreator.tsx`](frontend/src/components/IssueCreator.tsx) by uploading a file.
   - Rows are parsed into `Issue.firstLevelMappedData`.
   - Operator clicks the "Investigation" tab.
   - [`InvestigationWorkspace.tsx`](frontend/src/components/investigation/InvestigationWorkspace.tsx) mounts and renders [`ValidationOrchestratorWorkspace.tsx`](frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx).
2. **Data Loaded**:
   - `selectedIssue = issues.find(i => i.id === selectedIssueId)`.
   - `effectiveRows` pulls `rawRows = selectedIssue.firstLevelMappedData`.
3. **Rule Configuration Retrieval**:
   - `pipelineSteps` is loaded from React local state (`useState(initialSteps)`).
   - *Note*: It does **not** load from `DatabaseValidationSettings` or `localStorage`. It uses hardcoded default steps in `ValidationOrchestratorWorkspace.tsx`.
4. **Rule Execution**:
   - Evaluated inside the `orchestratedRows` `useMemo` loop (`ValidationOrchestratorWorkspace.tsx: lines 231–319`).
   - Evaluates step 1 (`DB_EXISTENCE`), step 2 (`AMOUNT_MATCH`), step 3 (`DECLINE_CODE_CHECK`).
5. **External DB Querying**:
   - `NOT CURRENTLY IMPLEMENTED IN INVESTIGATION WORKSPACE`  
     Step execution is evaluated against simulated conditions on the row object itself rather than executing live SQL against `targetDbId`. (Live SQL execution only exists in `DbQueryTool.tsx`).
6. **Result Interpretation**:
   - Evaluated as `'PASSED'`, `'FAILED'`, or `'WARNING'`.
   - Assigns `overallSeverity = 'CRITICAL' | 'WARNING' | 'RECONCILED' | 'MISSING'`.
7. **Where Result is Stored**:
   - Stored in React component state (`orchestratedRows`).
   - `NOT PERSISTED TO BACKEND DATABASE`.
8. **What Determines Whether the Next Rule Executes**:
   - Pure array iteration (`for (const step of pipelineSteps)`).
   - If a step is disabled (`!step.enabled`), it skips. Otherwise, all steps run unconditionally.
   - Pipeline actions (`CONTINUE`, `STOP`, `CLOSE`): `NOT CURRENTLY IMPLEMENTED`.
9. **What Determines Whether the Investigation Closes**:
   - `NOT CURRENTLY IMPLEMENTED`.
   - The investigation never closes automatically. The parent issue status remains unchanged unless manually edited.

---

## 16. CONSTRAINT VERIFICATION

**Confirmed**: No physical tables named `auth_log`, `fin_tab`, `tran_log` or any other specific example names are assumed or created. The system remains completely configuration-driven and dynamic.

---

## EXECUTIVE ARCHITECTURE SUMMARY

### A. Current Architecture Summary
The system has a dual React/Node architecture with strong Global Mapping capabilities and multiple disconnected validation concepts (Rule Builder in Settings, Validation Orchestrator in Investigation, Cross-Verification Panel in Investigation, and Criteria Rules in Hashtag Presets).

### B. Current Rule Execution Flow
Rule execution is not centralized. Rules are evaluated in component-level `useMemo` loops or UI simulation timers. They produce display badges (`PASSED`, `FAILED`, `SKIPPED`) and UI severity tags.

### C. Current Investigation Flow
Investigations load batch rows from `Issue.firstLevelMappedData` into `ValidationOrchestratorWorkspace`. The rows are evaluated against local step configurations and displayed in an interactive table with remediation SQL suggestions. Results remain in component state.

### D. Existing Stage/Workflow Capability
`NO EXISTING PROCESSING-STAGE ABSTRACTION FOUND`. The only sequencing capability is a flat numerical `stepNumber` array within a workflow that directly references a single physical table.

### E. Missing Capabilities
1. Processing Stage abstraction.
2. Pipeline Actions (`CONTINUE`, `STOP`, `CLOSE`).
3. Three-state Result model (`PASS`, `FAIL`, `ERROR`).
4. Centralized, reusable execution engine.
5. Per-transaction investigation status independent of the parent case.
6. Backend persistence for validation workflows.

### F. Existing Components We Can Reuse
- `globalMappingService` (canonical fields & physical table mappings).
- `DatabaseConnection` configuration and socket health checks.
- `Issue` batch data storage (`firstLevelMappedData`).
- Rule Builder UI layout (3-Block structure) in `DatabaseValidationSettings.tsx`.
- Table orchestration UI & column filters in `ValidationOrchestratorWorkspace.tsx`.

### G. Components/Models That Would Need Extension
- `ValidationCheckStep`: Add `stageId`, `onPassAction`, `onFailAction`, `onErrorAction`.
- `Issue` / row record: Add per-transaction `investigationStatus`.
- `DatabaseValidationSettings.tsx`: Add stage selector and action controls.
- `ValidationOrchestratorWorkspace.tsx`: Wire to stage-aware rules and pipeline actions.
- Backend: Add a Mongoose model / route for persisting workflows.

### H. Risks / Compatibility Concerns
- **Component Divergence**: `DatabaseValidationSettings` and `ValidationOrchestratorWorkspace` currently maintain separate step types (`ValidationCheckStep` vs `ValidationStepConfig`). Unifying them requires keeping existing LocalStorage configurations backward-compatible.
- **Batch Performance**: Evaluating multi-stage rules over large CSV/XLSX files (e.g. 5,000+ rows) in the frontend requires clean iteration to avoid UI freezing.

### I. Recommended Minimal Architecture Change
1. Introduce a lightweight `ProcessingStageConfig` definition that references an external database and table mapping.
2. Extend `ValidationCheckStep` with `stageId` and `action: { onPass: 'CONTINUE' | 'CLOSE', onFail: 'CONTINUE' | 'STOP' | 'CLOSE', onError: 'STOP' }`.
3. Create a shared pure function `executeValidationPipeline(rows, stages, rules)` used by both `DatabaseValidationSettings` (for simulation) and `ValidationOrchestratorWorkspace` (for live investigation).
4. Add transaction-level investigation status (`investigationStatus: 'PENDING' | 'RECONCILED' | 'FLAGGED' | 'CLOSED'`) on row records so individual transactions can close independently of the parent task.
