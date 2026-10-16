# Comprehensive Code Audit Verification & Architectural Remediation Plan
## Rule-to-Method Pipeline Subsystem

> **Document Status**: Authoritative Verification Report & Master Engineering Implementation Plan  
> **Date**: October 10, 2026  
> **Source Audit**: `RULE_TO_METHOD_PIPELINE_AUDIT.md`  
> **Governing Rules**: [`bo-operational-governance`](.agents/skills/bo-operational-governance/SKILL.md), [`AGENTS.md`](AGENTS.md) (Rules 1, 2, 3, 4, 7, 10, 11, 12, 13, 17, 18, 20, 21, 22)  
> **Target Scope**: `backend/src/services/pipeline/`, `backend/src/services/externalDataQueryService.ts`, `backend/src/services/reconciliationService.ts`, `backend/src/services/ruleSqlCompiler.ts`, `backend/src/services/validationPipelineBuilder.ts`

---

## 1. Executive Summary & Verification Matrix

Every finding from `RULE_TO_METHOD_PIPELINE_AUDIT.md` was physically cross-referenced and verified against the live repository. The static audit's findings are **substantively confirmed**: multiple fail-open fallbacks, SQL aliasing gaps, multi-stage state overwrites, metric inflation, and swallowed errors exist in the active codebase.

### Physical Code Verification Matrix

| Audit ID | Physical Location | Live Code Snippet / Mechanism | Verification Status | Operational Impact |
| :--- | :--- | :--- | :--- | :--- |
| **AUD-001** | [`ruleSqlCompiler.ts:136–139`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts#L136-L139) | `if (!targetCol && ...) baseSql = 'TRUE';` and `let baseSql = 'TRUE'` fallback | **CONFIRMED CRITICAL** | Incomplete, malformed, or unsupported rules silently evaluate to `PASS` in SQL. |
| **AUD-002** | [`ruleSqlCompiler.ts:20–38`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts#L20-L38) | Blacklist regex filtering in `sanitizeSqlConditionPredicate`; unvalidated operator interpolation in `NUMERIC_THRESHOLD` | **CONFIRMED CRITICAL** | Blacklists do not parse SQL ASTs; operator interpolation lacks an allowlist. |
| **AUD-003** | [`externalDataQueryService.ts:122, 138, 169`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/externalDataQueryService.ts#L169) | `else { whereClause = '1=1'; }` when `effectivePrimaryIds` or tuples are empty | **CONFIRMED CRITICAL** | Missing extraction keys produce unconstrained full table scans (`WHERE 1=1`) on external core DBs. |
| **AUD-004** | [`ReconciliationEngine.ts:210–238`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ReconciliationEngine.ts#L210-L238) vs [`ruleSqlCompiler.ts:153–160`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts#L153-L160) | Interactive `AMOUNT_MATCH` compares input amount vs mirror amount; batch SQL compares mirror col vs mirror col | **CONFIRMED HIGH** | Same transaction produces divergent verdicts depending on whether run via single-row or batch SQL. |
| **AUD-005** | [`reconciliationService.ts:305–306`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/reconciliationService.ts#L305-L306) | `(CASE WHEN bool_or(_validation_status = 'FAIL') THEN 'FAIL' ELSE 'PASS' END)` and hardcoded `CONTINUE`/`STOP` | **CONFIRMED HIGH** | Configured rule actions (`CLOSE`, `FLAG`, `REPORT`) are overwritten with hardcoded values in Postgres update. |
| **AUD-006** | [`ExecutablePipeline.ts:409–426`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ExecutablePipeline.ts#L409-L426) | Synthetic `FAIL` generated when staged rows count is 0; but when partial matches occur, missing rows logic relies on unindexed loop | **CONFIRMED HIGH** | Incomplete external ingress can leave unreturned rows without authoritative terminal outcomes. |
| **AUD-007** | [`ExecutablePipeline.ts:436, 564`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ExecutablePipeline.ts#L436) | Queries filter on `_batch_id` and `_rule_block_id` without filtering `_task_id` | **CONFIRMED HIGH** | Spurious collisions if batch/rule_block IDs are reused across tasks. |
| **AUD-008** | [`ExecutablePipeline.ts:495–505`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ExecutablePipeline.ts#L495-L505) | `cumulativeRowOutcomes.set(rNum, { ... stageId, validationStatus })` | **CONFIRMED CRITICAL** | Stage 2 completely overwrites Stage 1's verdict. If Stage 1 is `FAIL` + `CONTINUE` and Stage 2 passes, final result is `PASS`. |
| **AUD-009** | [`ruleSqlCompiler.ts:281–290`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts#L281-L290) | Subquery for `STRICT_SINGLE` omits `_rule_block_id` filter; `EXPLICIT_FIRST` lacks dedicated SQL row selector | **CONFIRMED HIGH** | Multi-rule stages share duplicate counts; policies lack deterministic sorting. |
| **AUD-010** | [`ExecutablePipeline.ts:531, 554, 578`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ExecutablePipeline.ts#L531) | Multiple empty `catch {}` blocks around mirror outcomes, downstream key extraction, and stop filtering | **CONFIRMED HIGH** | Database connection losses and runtime errors are swallowed silently, reporting incomplete runs as success. |
| **AUD-011** | [`ExecutablePipeline.ts:428–429`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ExecutablePipeline.ts#L428-L429) | `totalPass += batchResult.passedCount; totalFail += batchResult.failedCount;` | **CONFIRMED CRITICAL** | Cumulative metric inflation: 100 transactions passing 3 stages produce `totalPass = 300` on `totalEvaluated = 100`. |
| **AUD-012** | [`ruleSqlCompiler.ts:437`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts#L437) | `_validation_details` evaluates all rule expressions simultaneously into jsonb regardless of CASE short-circuit | **CONFIRMED MEDIUM** | Audit details claim multiple rules passed/failed even when early rules halted evaluation. |
| **SC-005** | [`ruleSqlCompiler.ts:80, 454–463`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts#L80) | `resolveOperandSqlExpr` outputs `t.canonical_data` but `fullUpdateSql` has no `FROM task_dataset_transactions t` | **CONFIRMED CRITICAL** | Immediate PostgreSQL runtime crash: `missing FROM-clause entry for table "t"`. |
| **PB-001** | [`validationPipelineBuilder.ts:322–330`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/validationPipelineBuilder.ts#L322-L330) | `CompiledValidationPlan` drops `workflow.connections` | **CONFIRMED HIGH** | Graph transition branches and actions configured in UI are lost upon compilation. |
| **PB-002** | [`validationPipelineBuilder.ts:341–343`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/validationPipelineBuilder.ts#L341-L343) | `if (stageIds.length <= 1) return { isAcyclic: true }` | **CONFIRMED MEDIUM** | Single-stage self-referential graph loops bypass cycle validation. |

---

## 2. Root Cause Analysis

1. **Permissive Fallbacks ("Fail-Open" Anti-Pattern)**: The pipeline and SQL compiler were designed with convenience fallbacks (`baseSql = 'TRUE'`, `whereClause = '1=1'`, `rule || rules[0]`, `catch {}`). While convenient in prototyping, in a financial Back Office reconciliation engine, these fallbacks allow corrupted queries, malformed configs, and database drops to look like passing validations.
2. **Missing Input Join in `fullUpdateSql`**: `ruleSqlCompiler.compileBlockUpdateSql` compiles `UPDATE mirror_table m SET ... WHERE m._batch_id = $1` as a single-table statement. However, dual-source rules comparing external records against local canonical input records require values from `task_dataset_transactions t`. Because `t` is not joined in the `UPDATE`, any dual-source query referencing `t` fails with an invalid column/table reference.
3. **State Overwriting in Multi-Stage Execution**: `ExecutablePipeline.executeBatch` uses a single `Map<number, Outcome>` and calls `.set(rNum, currentStageOutcome)` for each stage. Because map keys are `rNum`, stage $N$ completely erases stage $N-1$. There is no stage history accumulation or canonical rollup verdict.
4. **Metric Accumulation Across Stages**: `totalPass` and `totalFail` are summed across all stages (`totalPass += stagePass`), treating each stage evaluation as a new transaction instead of tracking transaction-level terminal outcomes.

---

## 3. The 5-Phase Master Remediation Plan

```text
══════════════════════════════════════════════════════════════════════════════════
                            MASTER REMEDIATION FLOW
══════════════════════════════════════════════════════════════════════════════════
  Phase 1: Fail-Closed SQL Compilation & Injection Hardening
  ├── [ruleSqlCompiler.ts] Add FROM task_dataset_transactions t to fullUpdateSql
  ├── [ruleSqlCompiler.ts] Remove baseSql = 'TRUE' -> Throw CompilationError
  ├── [ruleSqlCompiler.ts] Whitelist operators, sanitize identifiers, parameterize values
  └── [externalDataQueryService.ts] Remove WHERE 1=1 -> Throw MissingKeyError

  Phase 2: Multi-Stage Lifecycle & Canonical Outcome Preservation
  ├── [ExecutablePipeline.ts] Implement immutable StageExecutionRecord[] per row
  ├── [ExecutablePipeline.ts] Canonical verdict rollup: ANY stage FAIL -> final FAIL
  ├── [ExecutablePipeline.ts] Fix metric accounting: count unique rows, not stage iterations
  └── [ExecutablePipeline.ts] Remove empty catch {} -> Emit structured ERROR records

  Phase 3: Reconciliation Engine & Persistence Parity
  ├── [ruleSqlCompiler.ts & ReconciliationEngine.ts] Unify AMOUNT_MATCH semantics
  └── [reconciliationService.ts] Make ReconciliationResult authoritative (preserve CLOSE/FLAG/REPORT)

  Phase 4: DAG Validation & Pipeline Compiler Hardening
  ├── [validationPipelineBuilder.ts] Preserve workflow connections in CompiledValidationPlan
  └── [validationPipelineBuilder.ts] Fix single-stage self-loop cycle check

  Phase 5: Automated Verification & Conformance Testing
  ├── Implement test suite covering T-001 through T-034
  └── Re-run end-to-end task ISS-6362 reconciliation verification
══════════════════════════════════════════════════════════════════════════════════
```

---

### Phase 1: Fail-Closed SQL Compilation & Injection Hardening

#### 1.1 Fix `ruleSqlCompiler.ts` — Missing `FROM` Join in `fullUpdateSql` (SC-005)
When dual-source rules reference `t.canonical_data` or `t.raw_data`, `fullUpdateSql` must join `task_dataset_transactions t` on `(m._task_id = t.task_id AND m._row_number = t.row_number)`:

```diff
- UPDATE ${mirrorTableName} m
- SET 
-   _validation_status = ${statusCaseSql},
-   _validation_action = ${actionCaseSql},
-   _validation_details = ${detailsJsonSql},
-   _mirrored_at = NOW()
- WHERE m._batch_id = $1
-   AND m._rule_block_id = $2;
+ UPDATE ${mirrorTableName} m
+ SET 
+   _validation_status = ${statusCaseSql},
+   _validation_action = ${actionCaseSql},
+   _validation_details = ${detailsJsonSql},
+   _mirrored_at = NOW()
+ FROM task_dataset_transactions t
+ WHERE m._task_id = t.task_id
+   AND m._row_number = t.row_number
+   AND m._batch_id = $1
+   AND m._rule_block_id = $2;
```

#### 1.2 Fix `ruleSqlCompiler.ts` — Fail-Closed Rule Compilation (AUD-001)
Remove `baseSql = 'TRUE'` fallbacks. If a rule cannot be compiled, throw a descriptive `SqlCompilationError`:

```typescript
// Replace permissive fallbacks:
if (!targetCol && checkType !== 'SQL_CONDITION' && checkType !== 'EXISTENCE_CHECK') {
  throw new Error(`[ruleSqlCompiler] Rule "${rule.name || rule.id}" of checkType "${checkType}" is missing mandatory targetField/sourceField.`);
}
```

#### 1.3 Fix `ruleSqlCompiler.ts` — Operator Allowlists & Numeric Bounds (AUD-002)
- Validate `NUMERIC_THRESHOLD` operators against an explicit allowlist: `new Set(['=', '!=', '<', '<=', '>', '>='])`.
- Validate all numeric values with `Number.isFinite()`, rejecting `NaN` or `Infinity`.
- Parameterize or ANSI-quote all table identifiers and column names.

#### 1.4 Fix `externalDataQueryService.ts` — Eliminate Unrestricted Full Table Scans (AUD-003)
Replace `whereClause = '1=1'` with an explicit validation error:

```typescript
if (effectivePrimaryIds.length === 0 && compositeTuples.length === 0) {
  throw new Error(`[externalDataQueryService] Security Violation: Attempted to execute extraction query on "${targetTable}" with zero input transaction keys. Broad unrestricted table scans (WHERE 1=1) are strictly prohibited.`);
}
```

---

### Phase 2: Multi-Stage Lifecycle & Canonical Outcome Preservation

#### 2.1 Fix `ExecutablePipeline.ts` — Stage History & Rollup Verdict (AUD-008)
Instead of overwriting `cumulativeRowOutcomes.set(rNum, currentStageOutcome)`, maintain a full execution history per row and derive the final canonical outcome:

```typescript
// Maintain per-row stage history:
interface RowLifecycleState {
  rowNumber: number;
  stages: Map<string, {
    stageId: string;
    stageName: string;
    validationStatus: 'PASS' | 'FAIL' | 'ERROR' | 'PAUSED_DB_OFFLINE';
    validationAction: PipelineAction;
    details: any;
    targetRecord: any;
  }>;
}

// Canonical rollup:
// 1. Any ERROR -> Overall ERROR
// 2. Any FAIL (even with action CONTINUE) -> Overall FAIL
// 3. All PASS -> Overall PASS
```

#### 2.2 Fix `ExecutablePipeline.ts` — Metric Double-Counting (AUD-011)
Count unique transactions, not stage execution iterations:

```typescript
// At the conclusion of executeBatch():
let totalPass = 0;
let totalFail = 0;
let totalError = 0;

for (const outcome of canonicalOutcomes.values()) {
  if (outcome.validationStatus === 'PASS') totalPass++;
  else if (outcome.validationStatus === 'FAIL') totalFail++;
  else totalError++;
}

// totalEvaluated strictly equals unique input rows count
const totalEvaluated = inputRows.length;
```

#### 2.3 Fix `ExecutablePipeline.ts` — Eliminate Empty `catch {}` Blocks (AUD-010)
Replace empty catches with structured error records:
- Log warning/error details.
- Mark affected rows with `validationStatus: 'ERROR'`, `validationAction: 'STOP'`, and include error details.

---

### Phase 3: Reconciliation Engine & Persistence Parity

#### 3.1 Unify `AMOUNT_MATCH` Semantics (AUD-004)
Align `ruleSqlCompiler.compileBlockUpdateSql` with `ReconciliationEngine.reconcileRow`:
- Both must support comparing **Input Record Amount** vs **External Mirror Amount** using `toleranceMargin`.
- The SQL branch must utilize the `t.canonical_data` join established in Phase 1:
  ```sql
  ABS(COALESCE((t.canonical_data->>'amount')::numeric, 0) - COALESCE(m."amount"::numeric, 0)) <= margin
  ```

#### 3.2 Fix `reconciliationService.ts` — Authoritative Verdict & Action Persistence (AUD-005)
Update `reconciliationService.reconcileByRowNumber` to preserve the actual `_validation_action` produced by the pipeline (`CLOSE`, `FLAG`, `REPORT`) instead of collapsing it to `CONTINUE` / `STOP`.

---

### Phase 4: DAG Validation & Pipeline Compiler Hardening

#### 4.1 Preserve Graph Connections in `validationPipelineBuilder.ts` (PB-001)
Include `connections: workflow.connections || []` directly inside `CompiledValidationPlan`.

#### 4.2 Fix 1-Stage Cycle Check (PB-002)
Update `validateDagAcyclicity` in `validationPipelineBuilder.ts` so that single-stage graphs with self-loops (`fromNodeId === s.id && toNodeId === s.id`) fail Kahn's cycle detection.

---

### Phase 5: Automated Regression Test Suite

Implement physical automated tests in `backend/src/services/__tests__/pipelineAuditedDefects.test.ts` covering:

1. `T-001`: Incomplete rules throw compilation errors; never return `TRUE`.
2. `T-002`: Dual-source SQL compiles with `FROM task_dataset_transactions t` and executes validly in PostgreSQL.
3. `T-003`: Extraction queries with empty keys throw an error rather than generating `WHERE 1=1`.
4. `T-004`: Multi-stage execution preserves Stage 1 `FAIL` + `CONTINUE` through Stage 2 `PASS`, returning canonical `FAIL`.
5. `T-005`: Batch metrics count unique rows (`totalPass + totalFail === totalEvaluated`).
6. `T-006`: Configured actions (`CLOSE`, `FLAG`, `REPORT`) persist intact into PostgreSQL.
7. `T-007`: Single-stage self-loop graphs are rejected by DAG cycle validation.

---

## 4. Execution Sequence & Governance Approval Gate

In accordance with **Rule 20** (*Mandatory 6-Phase Workflow*) and **Rule 22** (*Anti-Premature Certification*):

| Step | Action | Status |
| :--- | :--- | :--- |
| **Step 1** | Inspect & Verify all 12 AUD findings against active files | **COMPLETED** |
| **Step 2** | Draft Authoritative Remediation Plan | **COMPLETED** |
| **Step 3** | User Review & Approval Gate | **PENDING USER PROCEED** |
| **Step 4** | Physical Code Modifications (Phases 1–4) | Staged |
| **Step 5** | Execute Regression Test Suite & Physical Database Verification | Staged |
| **Step 6** | Append Changelog to `MASTER_ARCHITECTURE_INDEX.md` | Staged |
