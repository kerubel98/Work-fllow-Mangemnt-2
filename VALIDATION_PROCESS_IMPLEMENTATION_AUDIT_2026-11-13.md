# VALIDATION PROCESS IMPLEMENTATION AUDIT — BACKEND & FRONTEND REALITY CHECK
## Physical Code Audit, Architectural Topology & End-to-End Validation Process Verification

| Field | Value |
|---|---|
| **Document ID** | `VALIDATION_PROCESS_IMPLEMENTATION_AUDIT_2026-11-13.md` |
| **Audit Date** | 2026-11-13 |
| **Repository Root** | `c:\Users\hp\Downloads\opration-workflow-mangement1` |
| **Scope** | Complete End-to-End Validation Subsystem: Frontend Visual Workflow Studio & Inspector (`WorkflowStudioFlowchart.tsx`, `WorkflowInspector.tsx`, `ValidationBoxManager.tsx`), Investigation & Reconciliation Workspaces (`ValidationOrchestratorWorkspace.tsx`, `InvestigationWorkspace.tsx`), API Transport (`routes/investigations.ts`, `routes/workflows.ts`, `routes/validationBoxes.ts`), Backend DAG Compilation & Execution Engine (`WorkflowPipelineBuilder.ts`, `ExecutablePipeline.ts`, `ReconciliationEngine.ts`), Dynamic SQL Compilation (`ruleSqlCompiler.ts`), External Query Extraction & Bounds (`externalDataQueryService.ts`, `dbLivenessService.ts`), and PostgreSQL UNLOGGED Mirror Staging (`mirrorTableManager.ts`, `reconciliationService.ts`, `reversionService.ts`) |
| **Governing Authority** | [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 1, 2, 4, 6, 7, 9, 10, 11, 12, 13, 18, 20, 21, 22, 23) & [`bo-operational-governance`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md) |
| **Audit Method** | Zero-assumption static source inspection, line-level code verification, runtime endpoint tracing, database schema analysis, and governance compliance cross-checking |
| **Overall Verdict** | 🟡 **SUBSTANTIALLY ROBUST WITH IDENTIFIED INTEGRITY & SECURITY GAPS** — The core set-based execution engine (`ExecutablePipeline`, `WorkflowPipelineBuilder`, `externalDataQueryService`, `ruleSqlCompiler`) is exceptionally well-engineered, parameter-safe, and set-based. However, full production certification is blocked by: (1) residual frontend per-step verdict synthesis in `ValidationOrchestratorWorkspace.tsx` (Rule 2 breach), (2) unauthenticated API execution endpoints (`/api/investigations/execute-universal`), (3) `SQL_CONDITION` blacklist sanitization gaps, and (4) dual backend execution engine / task identity coexistence. |

---

## 1. Executive Summary & Architectural Topology

The platform's validation subsystem executes complex financial settlement reconciliation and transaction compliance verification. It bridges **declarative visual DAG workflow models** in the frontend with **high-throughput, compiled set-based relational execution** in PostgreSQL.

```mermaid
flowchart TD
    subgraph Frontend["Frontend Client Layer"]
        A[Workflow Studio Flowchart DAG<br/><code>WorkflowStudioFlowchart.tsx</code>] -->|Visual Canvas JSON| B[Workflow Model<br/><code>stages</code>, <code>steps</code>, <code>attachedDbConfigIds</code>]
        C[Task Dataset / File Feed<br/><code>ValidationOrchestratorWorkspace.tsx</code>] -->|Click 'Run Validation'| D[Dispatch Request<br/><code>POST /api/investigations/execute-universal</code>]
    end

    subgraph BackendAPI["Backend Orchestration & Compilation Layer"]
        D --> E[<code>investigationOrchestratorService.executeViaNewPipeline()</code>]
        B --> F[<code>WorkflowPipelineBuilder.compile()</code>]
        F -->|Kahn's Topological Sort| G[<code>ExecutablePipeline</code> Instance]
    end

    subgraph BackendExecution["Set-Based Execution & External Staging"]
        E --> H[Dynamic Key & Tuple Resolution<br/><code>externalDataQueryService.ts</code>]
        H -->|< 30,000 Parameter Guard| I[External Core Banking / Settlement DB]
        I -->|Batch Tuples WHERE IN| J[UNLOGGED Mirror Table<br/><code>mirror_{db}_{table}</code>]
        G --> K[Dynamic Predicate Compiler<br/><code>ruleSqlCompiler.ts</code>]
        K -->|UPDATE mirror SET ... CASE WHEN| J
        J --> L[Reconciliation Engine<br/><code>ReconciliationEngine.ts</code>]
    end

    subgraph VerdictTaint["Verdict, Action & Taint Resolution"]
        L --> M{Rule Discovery}
        M -->|PASS / EXACT_MATCH| N[Action: CONTINUE / CLOSE]
        M -->|FAIL / DISCREPANCY| O[Action: STOP / FLAG / REPORT]
        O -->|FAIL + CONTINUE| P[Apply Diagnostic Taint<br/><code>_isDiagnosticOnly: true</code>]
        P --> Q[Isolate Downstream Math / Mutations]
    end

    subgraph ResultsPersistence["Persistence & UI Hydration"]
        N & O & Q --> R[Snapshot & Audit Ledger<br/><code>task_workflow_executions</code><br/><code>task_dataset_transactions.returned_data</code>]
        R --> S[Frontend Results Map & Drilldown<br/><code>ValidationOrchestratorWorkspace.tsx</code>]
    end
```

---

## 2. End-to-End Validation Execution Lifecycle

The lifecycle follows a strict 7-phase execution sequence:

```
[1. Ingestion / Data Setup] ────────▶ [2. Workflow & Box Composition] ────────▶ [3. Pipeline Compilation]
  • Task dataset / feed loaded          • Stages, steps & attached DB configs     • Kahn's topo-sort (acyclic DAG)
  • Parameter fields identified         • Cardinality & aggregation policies      • ValidationMethod instantiation

                                            │
                                            ▼
[6. Results Persistence & Audit] ◀─── [5. Verdict & Taint Evaluation] ◀─── [4. External Query & Mirror Staging]
  • task_workflow_executions snapshot   • Verdict: PASS | FAIL | ERROR             • Batched tuple candidate SQL
  • task_dataset_transactions update    • Action: CONTINUE | STOP | FLAG | REPORT  • UNLOGGED mirror table provisioning
  • Lineage audit trail populated       • Diagnostic taint (_isDiagnosticOnly)     • Dynamic SQL compiled (ruleSqlCompiler)

                                            │
                                            ▼
[7. Frontend UI Presentation & Maker-Checker Resolution]
  • Multi-key indexed reconciliation grid (serverEvaluatedRecords)
  • Outcome drilldown modal & execution metrics
  • Maker proposal submission for discrepancies (Four-Eyes Principle)
```

---

## 3. Backend Implementation Assessment

### 3.1 DAG Pipeline Compilation (`WorkflowPipelineBuilder.ts`)
* **File**: [`backend/src/services/pipeline/WorkflowPipelineBuilder.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/WorkflowPipelineBuilder.ts)
* **Status**: 🟢 **EXCELLENT / ARCHITECTURALLY COMPLIANT**
* **Verification Evidence**:
  1. **Topological Sort (`_topoSort`)**: Implements Kahn's algorithm over `workflow.nodes` and `workflow.connections`. Acyclicity is strictly validated; cyclic graphs throw descriptive compilation errors.
  2. **Canonical Stage Dispatching**: Maps each stage to its dedicated `ValidationMethod` based on canonical `ValidationBoxType`:
     - `INGESTION_SEARCH` → `IngestionSearchMethod` (queries external target DB, provisions mirror table).
     - `CONDITION_CHECK` → `ConditionCheckMethod` (local in-memory predicate matching).
     - `RECONCILIATION` → `ReconciliationMethod` (mirror reads + tolerance math).
     - `REPORT` → `DiagnosticReportMethod` (non-mutating lineage reports; prohibited from configuring `onFailAction = 'STOP'`).
  3. **Attached Database Column Configurations**: Automatically binds `attachedDbConfigIds` into `DbConfigValidationMethod` instances to evaluate data quality rules (`MUTATE_STATUS` vs `REPORT_ONLY`).

### 3.2 Dynamic Rule-to-SQL Predicate Compiler (`ruleSqlCompiler.ts`)
* **File**: [`backend/src/services/ruleSqlCompiler.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts)
* **Status**: 🟡 **STRONG PERFORMANCE / MINOR SANITIZATION GAP**
* **Verification Evidence**:
  - Compiles declarative rule checks into native PostgreSQL set-based `UPDATE mirror_table SET _validation_status = CASE WHEN ...` statements.
  - Supports `EXISTENCE_CHECK`, `VALUE_MATCH`, `AMOUNT_MATCH` (numeric tolerance bounds), `ISO_DECLINE_CODE`, `REGEX_MATCH`, and `DUAL_SOURCE_COMPARISON`.
  - **Defect Identified (BE-12)**: `sanitizeSqlConditionPredicate` uses a blacklist approach (`DROP`, `DELETE`, `PG_SLEEP`, `CURRENT_SETTING`, etc.) but misses file system and catalog functions (`pg_read_file`, `dblink`, `lo_import`). Must be replaced with a strict whitelist grammar.

### 3.3 External Data Querying & Parameter Bounds (`externalDataQueryService.ts`)
* **File**: [`backend/src/services/externalDataQueryService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/externalDataQueryService.ts)
* **Status**: 🟢 **EXCELLENT / COMPLIANT WITH RULES 4, 9, 11**
* **Verification Evidence**:
  - **Composite Candidate Tuples**: Builds batched parameter queries: `WHERE (col1, col2) IN (($1, $2), ($3, $4), ...)`.
  - **Parameter Ceiling (< 30,000)**: Dynamically checks parameter width (`candidateTuples.length * colCount`). Batches exceeding 30,000 parameters are automatically sub-chunked and merged, preventing PostgreSQL `UINT16_MAX` (65,535) protocol failures.
  - **Circuit Breaker Integration**: External queries route through `dbLivenessService`. If an external database is offline or degraded, validation rules pause safely in `PAUSED_DB_OFFLINE` / `CIRCUIT_BREAKER_PAUSED` rather than fabricating false-negative `FAIL` records.

### 3.4 UNLOGGED Mirror Table Lifecycle (`mirrorTableManager.ts`, `reconciliationService.ts`)
* **Files**: [`backend/src/services/mirrorTableManager.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/mirrorTableManager.ts), [`backend/src/services/reconciliationService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/reconciliationService.ts)
* **Status**: 🟡 **HIGH THROUGHPUT / ADVISORY LOCK BUG**
* **Verification Evidence**:
  - Automatically provisions typed `UNLOGGED` mirror tables (`mirror_{db}_{table}`) matching external schemas with standardized operational envelope columns: `_task_id`, `_row_number`, `_batch_id`, `_rule_block_id`, and index sets (`idx_*_task_row`, `idx_*_context`).
  - **Defect Identified (BE-05)**: `mirrorTableManager.ts:92-99` invokes `pg_advisory_xact_lock` on the pool outside an explicit `BEGIN...COMMIT` transaction, causing the lock to release immediately at statement completion and leaving mirror DDL unprotected against concurrent provisioning races.

### 3.5 Diagnostic Taint Isolation & Lineage History
* **Files**: [`backend/src/services/pipeline/ExecutablePipeline.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ExecutablePipeline.ts), [`backend/src/services/investigationEngine.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/investigationEngine.ts)
* **Status**: 🟢 **FULLY COMPLIANT WITH RULE 12**
* **Verification Evidence**:
  - Strict separation of Validation Verdict (`PASS`, `FAIL`, `ERROR`, `PAUSED_DB_OFFLINE`) vs Pipeline Action (`CONTINUE`, `STOP`, `CLOSE`, `FLAG`, `REPORT`).
  - When a step fails with action `CONTINUE` or `REPORT`, `ExecutablePipeline` applies `_isDiagnosticOnly: true` and records `_diagnosticTaintReason`. Downstream mutating stages skip tainted rows and emit `DIAGNOSTIC_BYPASSED`.

---

## 4. Frontend Implementation Assessment

### 4.1 Workflow Studio & Inspector
* **Files**: [`frontend/src/components/settings/WorkflowStudioFlowchart.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/WorkflowStudioFlowchart.tsx), [`frontend/src/components/settings/workflow/WorkflowInspector.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/workflow/WorkflowInspector.tsx), [`frontend/src/components/settings/ValidationBoxManager.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/ValidationBoxManager.tsx)
* **Status**: 🟢 **ROBUST & INTUITIVE DESIGN STUDIO**
* **Verification Evidence**:
  - **4-Tier State Synchronization**: Preserves visual DAG nodes, flowchart connections, stage execution parameters, and `attachedDbConfigIds` without stripping properties during canvas load/save cycles.
  - **Cardinality & Aggregation Controls**: Visual configuration for cardinality policies (`STRICT_SINGLE`, `ALLOW_MULTIPLE`, `EXPLICIT_LATEST`) and ordering columns (`orderByColumn`).

### 4.2 Investigation Workspace Execution & Reconciliation Grid
* **File**: [`frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx)
* **Status**: 🟡 **FEATURE-RICH WITH RESIDUAL VERDICT SYNTHESIS DEFECTS**
* **Verification Evidence**:
  - Dispatches execution via `api.executeUniversalWorkflow()` (`/api/investigations/execute-universal`).
  - Indexes returned server records across candidate parameter keys, composite tuple keys (`val1:::val2`), and row coordinate identifiers (`ROW-1`, `ROW-2`).
  - Displays live execution metrics dock (Execution Duration, Passed, Failed, Cached Hits).

---

## 5. Physical Code Findings & Integrity Gaps

### 5.1 Critical / High Findings

#### VLD-01: Residual Frontend Verdict Synthesis (Rule 2 Breach)
* **Severity**: **Critical (Data Integrity)**
* **File**: [`ValidationOrchestratorWorkspace.tsx:3055-3071, 2029-2042`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx#L3055-L3071)
* **Code Trace**:
  ```typescript
  // Lines 3055-3071:
  if (rowValStatus === 'PASS' && (!workflow.targetTable || targetRecord)) {
    return {
      status: 'PASS',
      message: 'All Checks Passed',
      stepDetails: workflow.steps.map(s => ({
        stepId: s.id,
        stepName: s.name,
        checkType: s.checkType,
        status: 'PASS', // ❌ Synthesizes per-step PASS from row-level flag
        actionTaken: 'CONTINUE',
        detail: 'Verified in conducted workflow'
      }))
    };
  }
  ```
* **Impact**: If a backend execution passes at the row level without returning granular step execution records, the frontend fabricates a `PASS` verdict for every individual step. This violates Governance Rule 2 (Validation Result must come from engine discovery, never synthesized by the client).
* **Remediation**: Render step-level verdicts strictly from `stepResults` or `auditTrail` emitted by `ExecutablePipeline`. If step-level data is absent, emit `NOT_EVALUATED` / `PENDING`.

#### VLD-02: Action Buttons Not Gated on `NOT_EVALUATED` / `PENDING`
* **Severity**: **High (Operational Risk)**
* **File**: [`ValidationOrchestratorWorkspace.tsx:3490-4000`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx)
* **Impact**: Operators can click "Reconcile", "Close Case", or trigger manual overrides while steps remain in `PENDING` or `NOT_EVALUATED`, allowing unverified transactions to be settled.
* **Remediation**: Disable closing/reconciling buttons whenever any workflow step has not produced a verified `PASS` verdict.

#### VLD-03: Unauthenticated API Validation Endpoints
* **Severity**: **Critical (Security / BE-01)**
* **File**: [`backend/src/routes/investigations.ts:202-263`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/investigations.ts#L202-L263), [`backend/src/server.ts:66`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/server.ts#L66)
* **Impact**: `/api/investigations/execute-universal` and `/api/investigations/execute-pipeline` have no `requireAuth` middleware. Any unauthenticated network client can trigger heavy pipeline executions against external core banking systems.
* **Remediation**: Mount `requireAuth` on `/api/investigations` in `backend/src/server.ts`.

#### VLD-04: Incomplete `SQL_CONDITION` Sanitization (BE-12)
* **Severity**: **High (Security / Remote File Exfiltration)**
* **File**: [`backend/src/services/ruleSqlCompiler.ts:44-69`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts#L44-L69)
* **Impact**: Blacklist regex misses PostgreSQL server functions (`pg_read_file`, `dblink`, `lo_import`).
* **Remediation**: Enforce a strict token whitelist for user-defined SQL conditions.

#### VLD-05: Mirror DDL Advisory Lock Outside Transaction (BE-05)
* **Severity**: **High (Concurrency / DDL Race)**
* **File**: [`backend/src/services/mirrorTableManager.ts:92-99`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/mirrorTableManager.ts#L92-L99)
* **Impact**: `pg_advisory_xact_lock` executed via pool without `BEGIN...COMMIT` releases instantly, failing to prevent concurrent `CREATE UNLOGGED TABLE` races.
* **Remediation**: Wrap mirror table provisioning in an explicit client transaction (`pool.connect() -> BEGIN -> lock -> DDL -> COMMIT`).

#### VLD-06: Monolithic Workspace Component Footprint
* **Severity**: **Medium (Maintainability / FE-24)**
* **File**: [`ValidationOrchestratorWorkspace.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx)
* **Impact**: Spans **9,015 lines**, mixing state management, reconciliation logic, CSV exports, modal dialogs, and SVG rendering.
* **Remediation**: Extract pure verdict projection functions and custom hooks (`useValidationExecution`, `useReconciliationTable`).

---

## 6. End-to-End Validation Process Health Matrix

| Subsystem / Layer | Component / Area | Status | Strengths | Gaps & Risks |
|---|---|---|---|---|
| **Authoring (FE)** | Flowchart DAG Studio & Inspector | 🟢 **Healthy** | Visual DAG canvas, 4-tier state preservation, attached DB column configurations. | Triplicated navigation aliases in settings hubs. |
| **Transport (API)** | `/api/investigations/execute-universal` | 🔴 **Needs Auth** | Unified execution entry point, parameter key forwarding, execution caching. | Missing `requireAuth` router guard (**BE-01 / VLD-03**). |
| **Compiler (BE)** | `WorkflowPipelineBuilder` | 🟢 **Healthy** | Kahn's topological sort, DAG acyclicity validation, stage dispatching. | None observed. |
| **Execution (BE)** | `ExecutablePipeline` & `ruleSqlCompiler` | 🟢 **Strong** | Set-based `UPDATE` batching, 30k param bounds, diagnostic taint tracking. | `SQL_CONDITION` blacklist needs grammar whitelist (**BE-12 / VLD-04**). |
| **Staging (BE)** | Mirror Tables (`UNLOGGED`) | 🟡 **Needs DDL Fix** | Dedicated typed mirrors, standard coordinate envelope (`_task_id`, `_row_number`). | `pg_advisory_xact_lock` used outside transaction on DDL (**BE-05 / VLD-05**). |
| **Reconciliation (BE)** | `ReconciliationEngine` | 🟢 **Strong** | Dual-verdict/action separation, strict multi-leg classification. | Legacy engine still imported in some routes (**BE-20**). |
| **Rendering (FE)** | `ValidationOrchestratorWorkspace` | 🟡 **Needs Cleanup** | Instant parameter map (`ROW-N`), execution metrics dock, audit drilldown. | Residual per-step `PASS` synthesis (**FE-04 / VLD-01**); 9k-line component size. |
| **Governance** | Maker-Checker & Reversion | 🟡 **Needs Hardening** | Snapshot creation, anti-self-approval logic in service. | Identity spoofable over unauthenticated HTTP (**BE-03**). |

---

## 7. Actionable Remediation Roadmap

```
┌────────────────────────────────────────────────────────────────────────┐
│                   VALIDATION PROCESS REMEDIATION ROADMAP               │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 1: Data Integrity & Verdict Honesty (Immediate)                  │
│   1. Strip row-to-step PASS synthesis in ValidationOrchestratorWorkspace│
│      (lines 3055-3071, 2029-2042)                                      │
│   2. Render step-level verdicts strictly from engine audit trail       │
│   3. Disable Reconcile/Close actions when any step is NOT_EVALUATED    │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 2: Security & Transport Guarding (Sprint 1)                      │
│   1. Apply requireAuth on /api/investigations routers in server.ts     │
│   2. Fix mirror table DDL advisory lock into a real client transaction │
│   3. Replace SQL_CONDITION regex blacklist with strict whitelist       │
├────────────────────────────────────────────────────────────────────────┤
│ PHASE 3: Architecture Consolidation & Component Hygiene (Sprint 2)     │
│   1. Deprecate legacy investigationEngine.ts in favor of DAG engine    │
│   2. Extract pure projection helpers from ValidationOrchestrator       │
│      Workspace to reduce component weight from 9,015 lines             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Verification & Test Protocol

To certify the validation process after remediation:

```bash
# 1. Type gate check
npm run lint --prefix frontend                                   # expect: exit 0

# 2. Production build check
npm run build --prefix frontend                                  # expect: exit 0

# 3. Backend pipeline test suite execution (using working root binary)
./node_modules/.bin/vitest run --root backend src/services/__tests__/pipelineArchitecture.test.ts
./node_modules/.bin/vitest run --root backend src/services/__tests__/ruleSqlCompiler.test.ts
./node_modules/.bin/vitest run --root backend src/services/__tests__/multiStagePipelineExecution.test.ts

# 4. Auth gate check on validation endpoints (must return 401 without Bearer token)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5002/api/investigations/execute-universal \
  -H "Content-Type: application/json" -d '{"workflowId":"wf-1","records":[{"id":"1"}]}'
# expect: 401

# 5. Physical check: Zero synthesized PASS strings in ValidationOrchestratorWorkspace
grep -n "Verified in conducted workflow" frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx
# expect: 0 matches
```

---

## 9. Architectural Change Summary & Reference Ledger

| Date | Scope | Rationale | Physical code impact |
|---|---|---|---|
| 2026-11-13 | End-to-End Validation Process Audit (Backend Compilation, Execution Engine, Staging, Frontend Visual Studio & Reconciliation Workspace) | User request: assess backend and frontend implementation of validation process. Required by AGENTS.md Rule 22 to register a domain audit in the master index | **None** — verification, diagnostic analysis, and documentation only. No source code, database schemas, or persistent records were modified |

---

## 10. References

**Governing Standards**
- [AGENTS.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) — Rules 1, 2, 4, 6, 7, 9, 10, 11, 12, 13, 18, 20, 21, 22, 23
- [bo-operational-governance skill](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md) — §3 Invariants, §5 Inspection Workflow, §7 Document Hub
- [CURRENT_PROJECT_CONTEXT.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/CURRENT_PROJECT_CONTEXT.md) — Architectural Baseline
- [MASTER_ARCHITECTURE_INDEX.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md) — Entry Point (Domain 16)

**Backend Implementation Files**
- [WorkflowPipelineBuilder.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/WorkflowPipelineBuilder.ts)
- [ExecutablePipeline.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ExecutablePipeline.ts)
- [ReconciliationEngine.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ReconciliationEngine.ts)
- [ruleSqlCompiler.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts)
- [externalDataQueryService.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/externalDataQueryService.ts)
- [mirrorTableManager.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/mirrorTableManager.ts)
- [reconciliationService.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/reconciliationService.ts)
- [investigationOrchestratorService.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/investigationOrchestratorService.ts)
- [routes/investigations.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/investigations.ts)

**Frontend Implementation Files**
- [WorkflowStudioFlowchart.tsx](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/WorkflowStudioFlowchart.tsx)
- [WorkflowInspector.tsx](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/workflow/WorkflowInspector.tsx)
- [ValidationBoxManager.tsx](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/ValidationBoxManager.tsx)
- [ValidationOrchestratorWorkspace.tsx](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx)
