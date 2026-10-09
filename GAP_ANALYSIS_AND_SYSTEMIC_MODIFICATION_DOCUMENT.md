# Gap Analysis & Systemic Modification Document
## Reconciliation Engine Evolution: From Mirror Subqueries to Two-Level Method Pipelines

**Repository Root**: `c:\Users\hp\Downloads\opration-workflow-mangement1`  
**Governance Authority**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 1, 2, 3, 9, 10, 13, 19, 20, 21, 22) & [`bo-operational-governance`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md)  
**Parent Master Architecture**: [`RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md)  
**Baseline Specification**: [`MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md)  
**Historical Audit Baseline**: [`VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md §11–§17`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md)  
**Document Status**: APPROVED FOR IMPLEMENTATION  
**Date**: October 8, 2026  

---

## 1. Executive Summary & Comparative Matrix

This document provides a comparative gap analysis between the historical system audit gaps ([`VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md)) and the newly finalized architectural specification ([`MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md)).

### 1.1 Comparative Gap Matrix

| Historical Audit Gap | Previous Vulnerability / Symptom | Multi-Leg Spec Resolution | Residual Code Modification Required | Status |
| :--- | :--- | :--- | :--- | :--- |
| **GAP-1: False-Pass on Missing DB Records** | 18 missing transactions evaluated as `PASS` because `workflow.targetDbId` was omitted in `evaluateRuleCondition`. | Two-Level Status: Level 1 `reconciliation_status` is stamped **`FAIL`** (`NOT_FOUND_IN_TARGET_DB`) during bulk set join if 0 rows matched. | Pass `workflow` context in `investigationEngine.ts:364` & `ExecutablePipeline.ts:315`. | **RESOLVED IN SPEC** (Code patch ready) |
| **GAP-2: Duplicate Check Subquery Catch-22** | Subqueries scoped with `_row_number` blinded file deduplication (`COUNT=1 <= 1` always TRUE); omitting it broke 3-leg banking transactions (`COUNT=3 > 1` false failure). | **Layer Separation**: File deduplication runs at ingress in `datasetIngestionService.ts`. Ledger duplicates evaluate against full `returned_data` in `DbConfigValidationMethod`. | Remove correlated self-join subqueries from `ruleSqlCompiler.ts:347`. | **RESOLVED IN SPEC** (Code patch ready) |
| **GAP-3: Multi-Stage Table Clobbering** | Stage 2 (`sett_trans_tab`) overwrote Stage 1 (`tran_log_tab`) in `canonical_data._target_record`, permanently destroying CBS ledger evidence. | **Target-Table Namespacing**: `returned_data` structured as `{ [targetTable]: [ ...allColumns ] }` using PostgreSQL `\|\|` non-destructive merge. | Schema migration for `returned_data JSONB` on `task_dataset_transactions`. | **NEW ARCHITECTURE DEFINED** |
| **GAP-4: Multi-Workflow Task Collisions** | Running Workflow B on the same task overwrote Workflow A's status and legs; concurrent runs caused deadlocks and dirty reads. | **Workflow Namespacing & Advisory Locking**: Results partitioned under `[workflowId]`; 64-bit cryptographic advisory lock (`task_exec_${taskId}`) enforces mutual exclusion. | Update `postgresRepo.ts` and add `task_exec_${taskId}` locking to orchestrator. | **NEW ARCHITECTURE DEFINED** |
| **GAP-5: DAG Visual Complexity Risk** | Dragging DB configs as standalone canvas nodes with wire connectors creates a cluttered "spaghetti DAG". | **Inspector-Driven Attachment (Option A)**: Validation box represents macro table search; Inspector filters and attaches DB configs; node shows badge `[ 🛡️ 3 Rules ]`. | Update `WorkflowStudioFlowchart.tsx` & `WorkflowInspector.tsx`. | **USER APPROVED** |
| **GAP-6: Sequential Execution Ordering** | DB column configs ran out of sync with external mirror staging, leading to empty evaluations. | **Stage Ordering**: External Query $\rightarrow$ Mirror Stage $\rightarrow$ Bulk Reconcile $\rightarrow$ Level 1 Status $\rightarrow$ **DB Config Method Runs LAST** on passed rows. | Integrate `DbConfigValidationMethod` into stage pipeline builder. | **NEW ARCHITECTURE DEFINED** |
| **GAP-7: Downstream Validator Input Sourcing** | Downstream validation stages relied directly on transient mirror tables of the top stage, creating cursor locks and lifetime coupling. | **Dataset Input Sourcing**: Downstream validators/reconciliators read input directly from accumulated `returned_data` in `task_dataset_transactions`. | Update downstream step input resolution to read from `tdt.returned_data`. | **NEW ARCHITECTURE DEFINED** |
| **GAP-8: Default Reconciliator Scope Creep** | Conflating presence checks with arithmetic amount checks and field comparisons inside the default reconciliator. | **Pure Presence Separation**: Default Reconciliator **ONLY** verifies presence ($\ge 1 \implies$ PASS, $0 \implies$ FAIL). Amount checks (`AMOUNT_MATCH`) and field comparisons belong strictly to dedicated `CHECK_TYPE` steps or `RECONCILIATION` boxes. | Enforce presence-only logic in default reconciliator; route amount/field checks to dedicated check methods. | **NEW ARCHITECTURE DEFINED** |
| **GAP-9: DB Config Dual-Mode Execution** | DB configs were assumed to always fail/halt transactions on breach, lacking non-blocking observability. | **Configurable Status Behavior**: DB configs support `statusBehavior: 'MUTATE_STATUS' \| 'REPORT_ONLY'`. When `REPORT_ONLY`, captures full key attribution into task report without altering transaction PASS status. | Add `statusBehavior` to `DatabaseColumnConfiguration` and `DbConfigValidationMethod`. | **NEW REQUIREMENT CODIFIED** |

---

## 2. In-Depth Comparative Gap Analysis

### 2.1 Gap 1: Ingress Deduplication vs. External Ledger Multi-Leg Verification

#### Historical State:
In previous iterations, the query compiler in [`ruleSqlCompiler.ts:347`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts#L347) attempted to compile dynamic SQL on mirror tables:
```sql
(SELECT COUNT(*) FROM mirror_sett_tran_log_tab _dup 
 WHERE _dup._batch_id = m._batch_id 
   AND _dup._task_id = m._task_id 
   AND _dup._row_number = m._row_number 
   AND _dup."fe_utrnno" = m."fe_utrnno") <= 1
```
* **Failure Mode A**: Because `_dup._row_number = m._row_number` isolated the subquery to one input row, duplicate rows in the input CSV (e.g. Row 10 and Row 25) could never see each other. The subquery returned 1, so the check was permanently `TRUE`.
* **Failure Mode B**: When `_row_number` was removed, a single transaction returning 1 settlement leg + 2 switch fee legs returned `COUNT(*) = 3`, triggering a false failure.

#### The Architectural Resolution:
1. **Ingress Deduplication** belongs strictly at the door in [`datasetIngestionService.ts:115-165`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/datasetIngestionService.ts#L115-L165):
   * When a file is uploaded, any duplicate identifiers across rows or existing tasks are marked upfront: `is_duplicate = true`, `status = 'DUPLICATE'`.
2. **Ledger Multi-Leg Verification** belongs in `DbConfigValidationMethod`:
   * PostgreSQL joins `mirror_{db}_{table}` using immutable row coordinates `(tdt.task_id = m._task_id AND tdt.row_number = m._row_number)`.
   * All mirror legs are aggregated into `returned_data`.
   * `DbConfigValidationMethod` inspects the array, filters for target discriminator criteria (`BO_TYPE = 'CMTP254' AND PROC_NAME != 'RVS'`), and evaluates whether matching settlement legs breach the configured threshold.

---

### 2.2 Gap 2: Dual-Level Status Architecture (`reconciliation_status` vs. `validation_status`)

#### Historical State:
The system used a single overloaded status field `_validation_status` (or `status`). This led to frequent confusion:
* If a row was missing from the target DB, was it a pipeline execution failure or a business check failure?
* If a row matched in the DB but failed an ISO decline check, did reconciliation fail or validate?

#### The Architectural Resolution:
The system enforces a **strict two-level status hierarchy**:
1. **Level 1: `reconciliation_status` (`PASS` | `FAIL` | `PENDING`)**:
   * Derived solely from physical data discovery in the external mirror table.
   * **The Presence Rule**: If $\ge 1$ mirror rows matched the `(task_id, row_number)` coordinate $\rightarrow$ **`PASS`**.
   * If 0 mirror rows matched $\rightarrow$ **`FAIL`** (`NOT_FOUND_IN_TARGET_DB`).
2. **Level 2: `validation_status` (`PASS` | `FAIL` | `ERROR` | `PENDING`)**:
   * Evaluated by business rules and attached `DbConfigValidationMethod` instances operating on `returned_data`.
   * **Configurable Mutation**:
     * If `affectsReconciliationStatus === true` and the DB config check fails, it flips `reconciliation_status` to **`FAIL`** (Action: `STOP`).
     * If `affectsReconciliationStatus === false`, `reconciliation_status` remains **`PASS`**, recording findings strictly in the diagnostic report.

---

### 2.3 Gap 3: Data Loss Across Multi-Table Reconciliations

#### Historical State:
In a multi-stage workflow:
* Stage 1 reconciled against `tran_log_tab` (CBS).
* Stage 2 reconciled against `sett_trans_tab` (Switch).
* Stage 2 overwrote `canonical_data._target_record`, wiping out all CBS columns.

#### The Architectural Resolution:
`task_dataset_transactions` stores a dedicated first-class column `returned_data JSONB`:
```json
{
  "tran_log_tab": [
    { "BO_TYPE": "CMTP254", "AMNT1": 142000, "TR_GROUP_ID": "103458988891", "...": "all CBS columns" }
  ],
  "sett_trans_tab": [
    { "PAN": "4111...", "SYS_TRACE": "092102", "RESP_CODE": "00", "...": "all Switch columns" }
  ]
}
```
* **Full Column Fidelity**: 100% of physical columns from the external table are retained (no projection loss).
* **Non-Destructive PostgreSQL Merge**: `returned_data = COALESCE(tdt.returned_data, '{}'::jsonb) || jsonb_build_object(targetTable, am.returned_legs)`.

---

### 2.4 Gap 4: Multi-Workflow Task Execution & Concurrency Isolation

#### Historical State:
If Workflow A and Workflow B ran on the same task:
* Concurrent runs caused row-lock contention and state collisions.
* Sequential runs caused the second workflow to wipe the first workflow's results from the active view.

#### The Architectural Resolution:
1. **Concurrency Protection**:
   * Execution acquires a 64-bit cryptographic advisory lock:
     `SELECT pg_try_advisory_xact_lock(('x' || substr(md5('task_exec_' || $1), 1, 16))::bit(64)::bigint);`
   * Prevents simultaneous runs; returns HTTP 409 Conflict if a task is already executing.
2. **Sequential Workflow Isolation**:
   * Results are stored in `canonical_data._workflow_runs[workflowId]` and `returned_data[workflowId][targetTable]`.
   * Re-running Workflow A executes `jsonb_set` targeting only `workflowId`, leaving Workflow B completely untouched.
   * The UI provides a **Workflow Switcher Dropdown** to seamlessly toggle active views.

---

### 2.5 Gap 5: Visual DAG Simplicity vs. DB Config Configuration

#### The Evaluated Dilemma:
Should DB configurations be separate nodes with drag-and-drop wire connectors in the flowchart?

#### The Analysis:
* **Standalone Nodes with Canvas Wires**: Clutters the DAG with 12–18 nodes and complex crossing wires, confusing operations analysts and obscuring the high-level workflow journey.
* **Adopted Solution (Option A — Inspector-Driven Attachment)**:
  * The DAG retains its clean macro structure: `[ Ingestion Search: tran_log_tab ]`.
  * The node displays a compact status badge: `[ 🛡️ 3 Table Rules Attached ]`.
  * In the Inspector panel, under a collapsible **"DB Configurations"** section, rules for that specific `targetDbId` and `targetTable` are automatically filtered and attached via 1-click toggles or drag-to-attach cards.
  * In the workflow JSON, DB configs carry `{ stageNumber, targetDbId, targetTable, affectsReconciliationStatus }` without requiring independent graph edge connectors.

---

### 2.6 Gap 6: Stage Execution Lifecycle & Sequential Ordering

#### The Mandated Ordering:
Within any given workflow stage, execution strictly follows:
1. **External Query & Staging**: Batch query loads records into typed `mirror_{db}_{table}`.
2. **Bulk Reconciliation Join**: Matches on `(task_id, row_number)`.
3. **Data Consolidation**: Aggregates 100% of mirror columns into `returned_data[workflowId][targetTable]` and stamps Level 1 `reconciliation_status`.
4. **DB Config Method Runs LAST**: Receives only passed records (`reconciliation_status === 'PASS'`). Evaluates multi-leg business logic and appends `identifierColumn`, `identifierValue`, and `dataKeys` to the task data report.

---

### 2.7 Gap 7: Downstream Validator Input Sourcing from `returned_data`

#### Historical State:
In earlier iterations, downstream validation stages and check types attempted to query the transient UNLOGGED mirror table created by top stages (`mirror_sett_tran_log_tab`). This created severe vulnerabilities:
* **Mirror Lifecycle Coupling**: UNLOGGED mirror tables are ephemeral structures designed for high-throughput batch staging. Holding references across multi-stage pipelines prevented table cleanup and caused concurrency deadlocks.
* **Dialect Incompatibilities**: Downstream steps had to reconstruct table-specific projection columns.

#### The Architectural Resolution:
Downstream validation methods and check steps **never read from transient mirror tables**. Instead:
* **Direct Input from `task_dataset_transactions`**: All downstream validators take their input directly from `returned_data[workflowId]` accumulated up to that stage in the persistent dataset.
* **Full Context Availability**: Downstream methods have instantaneous, in-memory access to both `canonical_data` (ingress input fields) and `returned_data` (external ledger records) for each row coordinate.

---

### 2.8 Gap 8: Separation of Default Reconciliator (Presence Only) vs. Dedicated Check Types

#### Historical State:
There was ambiguity regarding what the "default reconciliator" should do: should it verify existence, check amounts (`AMOUNT_MATCH`), compare authorization codes, and enforce tolerance thresholds all in one monolithic step?
* Bundling arithmetic and value matching into the default reconciliator violated **Rule 2 (Validation Result ≠ Pipeline Action)** and obscured root-cause reporting.

#### The Architectural Resolution:
A strict architectural boundary is established:
1. **Default Reconciliator = Pure Presence / Existence Check**:
   * The default reconciliator **ONLY** verifies data presence in the external ledger:
     * Matched $\ge 1$ mirror row $\rightarrow$ `reconciliation_status = 'PASS'`.
     * Matched 0 mirror rows $\rightarrow$ `reconciliation_status = 'FAIL'` (`NOT_FOUND_IN_TARGET_DB`).
   * **Zero Arithmetic / Zero Field Comparison**: It does NOT perform amount checks, status checks, or value comparisons.
2. **Dedicated Check Types & Reconciliation Boxes = Business & Field Comparisons**:
   * Any comparison between `canonical_data` and `returned_data` (e.g. `canonical_data.reqamt == returned_data.tran_log_tab[0].AMNT1`, ISO decline code check, date range validation) is strictly executed by:
     * A **Dedicated `CHECK_TYPE` Step** (e.g. `AMOUNT_MATCH`, `VALUE_MATCH`, `FIELD_COMPARATOR`), or
     * A **`RECONCILIATION` Box**, or
     * An attached **`DbConfigValidationMethod`**.
   * These check types act upon the accumulated data stored in `task_dataset_transactions` up to that stage, updating `validation_status` and appending diagnostic reasons into the report.

---

### 2.9 Gap 9: DB Config Dual-Mode Execution (Status Mutation vs. Report-Only Observability)

#### Historical State:
Previously, the system assumed that any rule violation or duplicate check breach had to unconditionally fail the record (`validation_status = 'FAIL'`, `onFailAction = 'STOP'`). There was no native mechanism for non-blocking observability, telemetry, or diagnostic key attribution.

#### The Architectural Resolution:
`DatabaseColumnConfiguration` and `DbConfigValidationMethod` are enhanced with a first-class configuration attribute:
`statusBehavior: 'MUTATE_STATUS' | 'REPORT_ONLY'` (or `reportOnly: boolean`):

1. **Mode 1: `MUTATE_STATUS` (Active Enforcement)**:
   * **Behavior**: If the rule conditions or thresholds are breached (e.g. duplicate settlement legs found > 1, or amount out of range):
     * The record’s Level 2 status is set to `validation_status = 'FAIL'`.
     * If configured (`affectsReconciliationStatus: true`), it flips Level 1 `reconciliation_status = 'FAIL'`.
     * Pipeline action triggers `STOP` (halts pipeline) or `FLAG`.
     * Full violation evidence and keys are attached to the report.
2. **Mode 2: `REPORT_ONLY` (Non-Blocking Observability & Telemetry)**:
   * **Behavior**: The check runs fully against `returned_data`:
     * Filters legs, calculates counts, extracts `identifierColumn` and `dataKeys`.
     * Logs the complete diagnostic summary into `canonical_data._validation_details` in the task report.
     * **CRITICAL INVARIANT: ZERO STATUS MUTATION**: The transaction’s status is **NOT changed**. A record with `reconciliation_status = 'PASS'` remains **`PASS`**, and `validation_status` remains unaffected.
     * The pipeline advances smoothly downstream without being blocked, giving operations teams complete audit visibility without false-alarm stoppages.

---

## 3. Comprehensive Physical Modification Plan

To bring the codebase into 100% compliance with this architecture, the following physical modifications are scheduled:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PHYSICAL MODIFICATION ROADMAP                                                          │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. PERSISTENCE LAYER (PostgreSQL Migration & Repository)                               │
│    • Migration 027: ADD COLUMN returned_data JSONB DEFAULT '{}'::jsonb                 │
│    • GIN Index: idx_tdt_returned_data ON task_dataset_transactions USING gin(...)       │
│    • Update postgresRepo.ts: Namespace canonical_data by _workflow_runs[workflowId]    │
│                                                                                        │
│ 2. PIPELINE METHODS & COMPILER (Rule-to-Method)                                        │
│    • Create backend/src/services/pipeline/methods/DbConfigValidationMethod.ts          │
│    • Implement StageTargetConfigMap in WorkflowPipelineBuilder.ts                      │
│    • Update ExecutablePipeline.ts: Run DbConfigValidationMethod LAST in stage          │
│                                                                                        │
│ 3. RECONCILIATION & ORCHESTRATION ENGINE                                               │
│    • Update reconciliationService.ts: Bulk set-based join populating returned_data     │
│    • Add 64-bit advisory locking in investigationOrchestratorService.ts                │
│    • Apply False-Pass guard fix in investigationEngine.ts (pass workflow object)       │
│                                                                                        │
│ 4. FRONTEND DAG CANVAS & INSPECTOR                                                     │
│    • Update WorkflowStudioFlowchart.tsx: Node badges for attached DB configs           │
│    • Enhance WorkflowInspector.tsx: Collapsible DB Configs with auto-table filtering   │
│    • WorkspaceTable.tsx: Two-level status pills & returned_data multi-leg accordion    │
│                                                                                        │
│ 5. VERIFICATION & AUTOMATED TEST SUITE                                                 │
│    • Add unit tests for DbConfigValidationMethod (1 leg PASS, 2 legs FAIL)             │
│    • Add multi-workflow isolation test (Workflow A re-run does not alter Workflow B)   │
│    • Run full Vitest suite (31/31 suites green) and Vite production build              │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Master Architectural Index Registration

* **Governing Rules**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 1, 2, 3, 9, 10, 13, 20, 21, 22)
* **Master Architecture Hub**: [`MASTER_ARCHITECTURE_INDEX.md §3 & §7`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md)
* **Authoritative Specification**: [`MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md)
* **Audit Trail**: [`VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md §17`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md#L667)
* **Decision Status**: **ACCEPTED & RATIFIED FOR IMPLEMENTATION**
