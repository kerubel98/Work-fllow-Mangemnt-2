# Implementation Plan: Ingestion Search Missing Record Accounting & Row Coordinate Audit Remediation

**Target Subsystems**: `ExecutablePipeline`, `CoordinateInjector`, `investigationOrchestratorService`, `ruleSqlCompiler`  
**Governance Anchor**: [`RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md §8 & §10`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md)  
**Audit Reference**: [`VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md §11 & §12`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md)  
**Date**: October 5, 2026  
**Status**: PROPOSED (Awaiting User Review — No Code Implemented)

---

## 1. Executive Summary & Problem Statement

During the physical runtime audit of Task `ISS-6362` (50 ingested rows from `trn_log tab.csv`) evaluated against workflow `"outh fllow"` (`wf-1790660651185`), three critical structural flaws were identified in the execution pipeline:

| Flaw ID | Subsystem | Physical Symptom | Root Cause |
| :--- | :--- | :--- | :--- |
| **FLAW-1** | `CoordinateInjector` & `ExecutablePipeline` | Records **missing from the external database** are marked as **`PASS`** instead of **`FAIL`**. | External query uses `INNER JOIN`, so missing rows produce 0 rows and are omitted from `mirror_sett_tran_log_tab`. `ExecutablePipeline.executeBatch` only reads rows that exist in the mirror. |
| **FLAW-2** | `investigationOrchestratorService` | Absent row outcomes fall back to **`PASS`**. | When `outcomeMap.get(rowNum)` returns `undefined`, line 1326 evaluates `(batchReport.failedCount === 0 ? 'PASS' : 'FAIL')`. Since the found rows had 0 failures, the missing rows silently default to `PASS`. |
| **FLAW-3** | `investigationOrchestratorService` | Workflow executions serve stale cached results. | Lines 1211-1250 intercept execution requests with `repo.getTaskWorkflowExecution()`, returning the old completed run in 2ms without re-evaluating live data or updated rules. |

---

## 2. Architectural Principles & Invariants (Mandatory Skill Compliance)

1. **Every Ingested Coordinate Must Have an Explicit Verdict (100% Ingress Accounting)**:
   - For an ingested batch of $N$ rows, exactly $N$ row outcomes must be emitted.
   - No row coordinate `_row_number` may ever be silently dropped or defaulted.
2. **Missing External Record = Explicit `FAIL` on `EXISTENCE_CHECK` / Ingestion Search**:
   - If an Ingestion Search / Existence check stage fails to find a record in the target database, that specific `_row_number` must emit:
     - `validationResult: 'FAIL'`
     - `pipelineAction: onFailAction` (default `'STOP'`)
     - `details: { existence: 'NOT_FOUND_IN_TARGET_DB', targetDb, targetTable }`
     - `targetRecord: null`
3. **Execution Endpoint Must Execute Live**:
   - `POST /api/workflows/:id/execute` and `POST /api/investigation/evaluate` represent active operator commands. They must always execute live (`forceRerun = true`).
   - `task_workflow_executions` serves as an immutable compliance audit trail, not a bypass cache.
4. **Tuple Parameter Ceiling & ANSI Quoting**:
   - All external batch queries must preserve ANSI identifier quoting (`` `col` `` for MySQL, `"col"` for PG) and parameter chunking below 30,000 bounds (§Rule 11).

---

## 3. Detailed Implementation Phases

### Phase 1: Missing Row Synthesizer in `ExecutablePipeline.executeBatch`
*File*: [`backend/src/services/pipeline/ExecutablePipeline.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ExecutablePipeline.ts#L315-L360)

**The Problem**:
Currently, lines 315-320 only handle the edge case where **100% of rows** are missing (`batchResult.totalEvaluated === 0`). If 32 rows match and 18 rows are missing, the 18 missing rows are skipped completely.

**Remediation**:
1. At the conclusion of each stage in `executeBatch`:
   - Compute the set of all input `_row_number` coordinates:
     `const allInputRowNumbers = new Set(currentRows.map(r => Number(r._row_number)));`
   - Compute the set of staged `_row_number` coordinates present in the mirror:
     `const stagedRowNumbers = new Set((mirrorOutcomeRes.rows || []).map(r => Number(r._row_number)));`
   - Calculate missing coordinates:
     `const missingRowNumbers = [...allInputRowNumbers].filter(rNum => !stagedRowNumbers.has(rNum));`
2. For each `missingRowNumber`:
   - If the stage contains an external query (`db && targetTable`) and represents an Ingestion Search / Existence check:
     - Record an explicit outcome in `cumulativeRowOutcomes`:
       ```typescript
       cumulativeRowOutcomes.set(missingRNum, {
         rowNumber: missingRNum,
         stageId: stage.stageId,
         stageName: stage.stageName,
         validationStatus: 'FAIL',
         validationAction: (rule0?.onFailAction as PipelineAction) || 'STOP',
         details: {
           existence: 'NOT_FOUND_IN_TARGET_DB',
           reason: `Record not found in target database ${db.name} (${targetTable}).`,
           searchedParameters: keyMappings,
         },
         targetRecord: null,
       });
       ```
     - Increment `batchResult.failedCount` and `totalFail`.
     - Increment `batchResult.totalEvaluated`.

---

### Phase 2: Orchestrator Fallback Sanitization
*File*: [`backend/src/services/investigationOrchestratorService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/investigationOrchestratorService.ts#L1324-L1338)

**The Problem**:
Line 1326 has a dangerous fallback:
`_validation_status: outcome?.validationStatus || (batchReport.failedCount === 0 ? 'PASS' : 'FAIL')`
If any row lacks an outcome, it incorrectly defaults to `'PASS'` whenever `failedCount === 0`.

**Remediation**:
1. Remove the naive `batchReport.failedCount === 0` fallback.
2. If `outcome` is missing after Phase 1, log a diagnostic warning and default safely to:
   - `_validation_status: 'FAIL'` (or `'PENDING'` if not yet reached by pipeline)
   - `_validation_action: 'STOP'`
   - `_validation_details: { reason: 'UNPROCESSED_OR_MISSING_COORDINATE_IN_PIPELINE' }`

---

### Phase 3: Workflow Execution Cache Governance
*File*: [`backend/src/services/investigationOrchestratorService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/investigationOrchestratorService.ts#L1211-L1250)

**The Problem**:
When an operator runs a workflow from the UI, the backend returns the cached snapshot from `task_workflow_executions` without running the pipeline, masking rule changes and updated data.

**Remediation**:
1. In `investigationOrchestratorService.ts`:
   - Change `executeViaNewPipeline` so that manual execution requests default to `forceRerun = true`.
   - Only serve from `task_workflow_executions` when explicitly invoked as a passive read-only lookup (e.g. `isReadOnlyLookup: true`).
2. When a workflow execution completes:
   - Update `task_workflow_executions` with the fresh execution summary (UPSERT on `task_id, workflow_id` or append execution history entry).

---

### Phase 4: `DUPLICATE_CHECK` Rule Clarification & Reversal Policy
*Files*: [`backend/src/services/ruleSqlCompiler.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts#L285-L365), [`backend/src/services/investigationEngine.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/investigationEngine.ts#L200-L245)

**The Problem**:
- `_dup._row_number = m._row_number` successfully isolates leg-multiplicity per input row.
- However, when a transaction has both active and reversal legs (e.g. `2597220450` with Rows 1–6), the filter `PROC_NAME != 'RVS'` ignored the reversal leg, treating it as a normal single transaction.
- If the business intent is to detect **reversal presence** or **file-level duplicates**, these must be modeled cleanly as distinct rule checks:
  1. **Check A: Leg Multiplicity in DB**: Multi-leg `CMTP254` within the matched group (`COUNT <= 1`).
  2. **Check B: Reversal Dispute Check**: Flag transactions where `PROC_NAME = 'RVS'` or counterpart reversal leg exists.
  3. **Check C: Spreadsheet Duplicate Rows**: Cross-row check on `task_dataset_transactions` comparing `(fe_utrnno, reqamt, refnum)`.

---

## 4. Verification & Testing Matrix

| Test Case | Scenario | Expected Physical Result |
| :--- | :--- | :--- |
| **TC-1: Partial Match Accounting** | Task `ISS-6362` (50 rows: 32 in MySQL, 18 missing). | Exactly **32 rows** proceed to rule evaluation. Exactly **18 rows** evaluate to `FAIL` (`NOT_FOUND_IN_TARGET_DB`, `STOP`). |
| **TC-2: Total Record Invariance** | 50 rows in $\rightarrow$ exactly 50 row outcomes. | `passed_count + failed_count = 50`. Zero missing coordinates. |
| **TC-3: Cache Bypass Verification** | Trigger workflow execution via UI or API. | Pipeline executes live (`durationMs > 2`), creates fresh execution record, and never serves stale cache. |
| **TC-4: Automated Regression Suite** | Run `npm test` across all 31 Vitest suites. | 31/31 test suites pass, 248/248 tests green. |
| **TC-5: Full TypeScript Build** | Run `npm run build` in `backend/`. | Exit code 0, clean `dist/` compilation. |

---

## 5. Architectural Traceability & Documentation Updates

Upon user approval of this plan:
1. Update [`RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md) under Section 10.8 documenting the Missing Coordinate Accounting Pattern.
2. Update [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md) Domain 3 change log.
3. Update [`VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md) Section 13 with the implementation sign-off.
