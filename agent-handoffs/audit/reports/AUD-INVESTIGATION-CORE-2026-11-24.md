# Audit Report: Investigation Core (`AUD-INVESTIGATION-CORE-2026-11-24`)

## 1. Audit Metadata & Scope
- **Audit ID**: `AUD-INVESTIGATION-CORE-2026-11-24`
- **Audit Date**: 2026-11-24 22:30 (UTC+3)
- **Target Scope**: Investigation Core (Backend Orchestration, Compiled DAG Pipeline, Dynamic Rule-to-SQL Compiler, Reconciliation & Reversion Services, Maker-Checker Resolution Authorization, Investigation/Issue/Resolution Routes, and Frontend Investigation Workspace)
- **Branch**: `feature/frontend-redesign`
- **Commit**: `d7bf228`
- **Governing Standards**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Governance Principles 1–25) & [`code-audit`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)
- **Audit Mode**: Read-only code & empirical verification audit (zero application source edits)

---

## 2. Executive Summary
A thorough cross-layer audit of the **Investigation Core** was conducted across backend routes, pipeline orchestration, SQL compilation, reconciliation/rollback services, Maker-Checker dual authorization, and frontend investigation components.

- **Empirical Suite Baseline**:
  - `npm run build --prefix backend` (`tsc`): **PASS** (exit code 0)
  - `npm test --prefix backend -- --run` (`vitest`): **PASS** (**39 test files, 312 tests passed**)
  - `npm run build --prefix frontend` (`vite build`): **PASS** (exit code 0, 2,186 modules)
- **Findings Summary**: **7 findings** identified (**2 CRITICAL**, **2 HIGH**, **2 MEDIUM**, **1 LOW**).
- **Highest-Risk Defect**: In [`ExecutablePipeline.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ExecutablePipeline.ts#L691-L698), when an external database is offline (`ECONNREFUSED` / `ETIMEDOUT` / `Access denied`), `executeBatch` records `'PAUSED_DB_OFFLINE'` in `rowHistoryMap`, but the stage rollup only checks `'ERROR'` and `'FAIL'`, causing offline-paused rows to silently roll up as **`PASS`**.

---

## 3. Previous Audit & Sign-Off Review
- No prior `agent-handoffs/audit/` register existed in this repository; this report establishes the baseline `agent-handoffs/audit/master-audit.md` and `agent-handoffs/audit/reports/INDEX.md`.

---

## 4. Files & Modules Examined
- **Backend Routes**:
  - [`backend/src/server.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/server.ts)
  - [`backend/src/routes/investigations.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/investigations.ts)
  - [`backend/src/routes/issues.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/issues.ts)
  - [`backend/src/routes/resolutions.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/resolutions.ts)
- **Backend Investigation & Pipeline Core**:
  - [`backend/src/services/investigationOrchestratorService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/investigationOrchestratorService.ts)
  - [`backend/src/services/investigationEngine.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/investigationEngine.ts)
  - [`backend/src/services/investigationPlanner.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/investigationPlanner.ts)
  - [`backend/src/services/pipeline/ExecutablePipeline.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ExecutablePipeline.ts)
  - [`backend/src/services/pipeline/ReconciliationEngine.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ReconciliationEngine.ts)
  - [`backend/src/services/pipeline/CoordinateInjector.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/CoordinateInjector.ts)
  - [`backend/src/services/externalDataQueryService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/externalDataQueryService.ts)
  - [`backend/src/services/ruleSqlCompiler.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts)
  - [`backend/src/services/reconciliationService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/reconciliationService.ts)
  - [`backend/src/services/reversionService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/reversionService.ts)
  - [`backend/src/services/makerCheckerService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/makerCheckerService.ts)
- **Frontend Investigation Core**:
  - [`frontend/src/components/investigation/InvestigationWorkspace.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/InvestigationWorkspace.tsx)
  - [`frontend/src/components/investigation/CasesWorkspaceView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/CasesWorkspaceView.tsx)
  - [`frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx)
  - [`frontend/src/components/IssueDetailView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/IssueDetailView.tsx)

---

## 5. Findings Summary Table

| Finding ID | Severity | Status | Category | Location | Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-INV-001` | `CRITICAL` | `OPEN` | Correctness / Fail-Open | `ExecutablePipeline.ts:410,693-759` | `PAUSED_DB_OFFLINE` stage status rolls up as `PASS` in `executeBatch` |
| `AUD-INV-002` | `CRITICAL` | `OPEN` | Authorization / Data Loss | `investigations.ts:357,376`; `issues.ts:439` | Global `clear-all` and task `DELETE` endpoints lack admin/team ownership checks |
| `AUD-INV-003` | `HIGH` | `OPEN` | Maker-Checker Bypass | `resolutions.ts:39`; `makerCheckerService.ts:161`; `issues.ts:611` | Optional `checkerTeamId` bypasses team check; `execute-script` resolves issue without Checker approval |
| `AUD-INV-004` | `HIGH` | `OPEN` | SQL Safety / Validation | `ruleSqlCompiler.ts:150,186,310,390,473-494` | Unvalidated `Number(...)` (`NaN`) and unescaped `onPassAction`/`onFailAction` interpolated into SQL |
| `AUD-INV-005` | `MEDIUM` | `OPEN` | Pipeline Semantics | `reconciliationService.ts:318-319`; `ExecutablePipeline.ts:732` | `reconcileByRowNumber` hardcodes `STOP`/`CONTINUE`; `allStageLegs` overwrites same-named tables |
| `AUD-INV-006` | `MEDIUM` | `OPEN` | Identity Spoofing | `issues.ts:27,451,518,584`; `investigations.ts:226` | Request body actor IDs trusted instead of JWT `req.user.id` |
| `AUD-INV-007` | `LOW` | `OPEN` | Performance / Tech Debt | `reversionService.ts:127-139` | `revertTask` executes row-by-row `INSERT` loop instead of batched multi-row insert |

---

## 6. Detailed Findings

### `AUD-INV-001` — `PAUSED_DB_OFFLINE` Rolls Up as `PASS` in `ExecutablePipeline.executeBatch`
- **Severity**: `CRITICAL` | **Status**: `OPEN` | **Category**: Correctness / Fail-Open
- **File & Line**: [`ExecutablePipeline.ts#L407-L427`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ExecutablePipeline.ts#L407-L427), [`ExecutablePipeline.ts#L691-L760`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ExecutablePipeline.ts#L691-L760)
- **Evidence**:
  - Line 410: `const status = isDbOffline ? 'PAUSED_DB_OFFLINE' : 'ERROR';`
  - Line 417: `recordStageOutcome(rNum, { ..., validationStatus: status as any, ... })`
  - Lines 693–698:
    ```ts
    let finalStatus: 'PASS' | 'FAIL' | 'ERROR' = 'PASS';
    if (history.some(h => h.validationStatus === 'ERROR')) {
      finalStatus = 'ERROR';
    } else if (history.some(h => h.validationStatus === 'FAIL')) {
      finalStatus = 'FAIL';
    }
    ```
  - Lines 758–759: `passedCount = rowOutcomes.filter(o => o.validationStatus === 'PASS').length;`
- **Description & Impact**: When an external database connection fails with `ECONNREFUSED`, `ETIMEDOUT`, or `Access denied`, the stage records `'PAUSED_DB_OFFLINE'`, but the rollup only inspects `'ERROR'` and `'FAIL'`. Every paused row therefore defaults to `finalStatus = 'PASS'` and is counted in `passedCount`.
- **Conditions for Occurrence**: Any batch investigation against an offline or unreachable external database.
- **Recommended Remediation**: Add `'PAUSED_DB_OFFLINE'` to `rowHistoryMap` status typing and rollup precedence (`ERROR > PAUSED_DB_OFFLINE > FAIL > PASS`), and ensure `PAUSED_DB_OFFLINE` rows are never counted as `passedCount`.
- **Verification Criteria**: Unit test simulating `ECONNREFUSED` in `CoordinateInjector.ingestAndMirror` asserting `passedCount === 0` and `finalStatus === 'PAUSED_DB_OFFLINE'`.

### `AUD-INV-002` — Unscoped Global Reset & Task Deletion Endpoints
- **Severity**: `CRITICAL` | **Status**: `OPEN` | **Category**: Authorization / Data Loss Prevention (`AGENTS.md` Rule 17 & Rule 19)
- **File & Line**: [`investigations.ts#L357-L390`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/investigations.ts#L357-L390), [`issues.ts#L439-L447`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/issues.ts#L439-L447)
- **Evidence**: `DELETE /api/investigations/executions/clear-all` (`investigations.ts:376`) executes `repo.clearAllValidationExecutions()` for any authenticated user without admin role validation. `DELETE /api/investigations/:taskId/workflow-executions` (`investigations.ts:357`) and `DELETE /api/issues/:id` (`issues.ts:439`) perform no team membership, creator, or admin authorization check.
- **Impact**: Any authenticated non-admin user can wipe all validation execution records across the entire platform or delete other teams' cases.
- **Recommended Remediation**: Gate `/executions/clear-all` behind `requireAdmin`; enforce team membership / creator / admin authorization on `:taskId` and `:id` `DELETE` routes.
- **Verification Criteria**: Integration test asserting HTTP 403 for non-admin users calling `/executions/clear-all` and cross-team `DELETE /api/issues/:id`.

### `AUD-INV-003` — Maker-Checker Team Authorization Bypass & Unverified `execute-script` Resolution
- **Severity**: `HIGH` | **Status**: `OPEN` | **Category**: Maker-Checker Governance (`AGENTS.md` Rule 7)
- **File & Line**: [`resolutions.ts#L33-L50`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/resolutions.ts#L33-L50), [`makerCheckerService.ts#L160-L163`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/makerCheckerService.ts#L160-L163), [`issues.ts#L611-L645`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/issues.ts#L611-L645)
- **Evidence**:
  1. `makerCheckerService.ts:161`: `if (input.checkerTeamId && proposal.team_id && input.checkerTeamId !== proposal.team_id)` skips team verification whenever `req.body.checkerTeamId` is omitted.
  2. `issues.ts:611-645`: `POST /api/issues/:id/execute-script` marks an issue `status: 'Resolved'` (`solutionExecuted: true`) immediately without checking whether a resolution or script proposal was approved by a Checker/peer.
- **Impact**: A Checker from an unrelated team can approve/reject another team's resolution by omitting `checkerTeamId`; operators can resolve issues via `execute-script` without Four-Eyes approval.
- **Recommended Remediation**: Resolve `checkerTeamId` authoritatively from `req.user` / PostgreSQL team membership in `resolutions.ts`; require Checker/peer approval or `lead`/`admin` authorization before resolving via `execute-script`.
- **Verification Criteria**: Tests confirming HTTP 403 when `checkerTeamId` is omitted by a non-member Checker and when `execute-script` is called on unapproved scripts.

### `AUD-INV-004` — Unsanitized Numeric & Action String Interpolation in `ruleSqlCompiler.ts`
- **Severity**: `HIGH` | **Status**: `OPEN` | **Category**: SQL Safety / Input Validation
- **File & Line**: [`ruleSqlCompiler.ts#L150`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts#L150), [`L186`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts#L186), [`L310-L314`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts#L310-L314), [`L390`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts#L390), [`L473-L494`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts#L473-L494)
- **Evidence**: `margin`, `minValue`, `maxValue`, and `threshold` are converted with `Number(...)` without `Number.isFinite(...)` checks, allowing `NaN` in SQL. `rule.onFailAction` and `rule.onPassAction` are interpolated directly into SQL literals (`'${rule.onFailAction || 'STOP'}'`) without allow-list checks.
- **Recommended Remediation**: Enforce `Number.isFinite(...)` checks on all numeric parameters and validate `onPassAction`/`onFailAction` against `['CONTINUE', 'STOP', 'CLOSE', 'FLAG', 'REPORT']`.
- **Verification Criteria**: Unit tests in `ruleSqlCompiler` rejecting non-finite margins and invalid `PipelineAction` strings.

### `AUD-INV-005` — Hardcoded `STOP`/`CONTINUE` in `reconcileByRowNumber` & Stage Leg Overwrite
- **Severity**: `MEDIUM` | **Status**: `OPEN` | **Category**: Pipeline Semantics (`AGENTS.md` Rule 2)
- **File & Line**: [`reconciliationService.ts#L318-L319`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/reconciliationService.ts#L318-L319), [`ExecutablePipeline.ts#L728-L734`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ExecutablePipeline.ts#L728-L734)
- **Evidence**: `reconcileByRowNumber` hardcodes `'STOP'`/`'CONTINUE'` when aggregating mirror verdicts instead of preserving the mirror's `_validation_action`. In `ExecutablePipeline.ts:732`, `allStageLegs[tbl] = h.targetRecords` overwrites earlier stage legs if two stages share the same `targetTable` name.
- **Recommended Remediation**: Preserve `_validation_action` from mirror rows in `reconcileByRowNumber`; key `allStageLegs` by stage or preserve multi-stage arrays.
- **Verification Criteria**: Multi-stage unit test with `FLAG`/`REPORT` actions and same-named tables across two stages.

### `AUD-INV-006` — Client-Supplied Actor IDs Trusted Over JWT `req.user.id`
- **Severity**: `MEDIUM` | **Status**: `OPEN` | **Category**: Identity Integrity
- **File & Line**: [`issues.ts#L27`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/issues.ts#L27), [`L451`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/issues.ts#L451), [`L518`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/issues.ts#L518), [`L584`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/issues.ts#L584), [`investigations.ts#L226`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/investigations.ts#L226)
- **Evidence**: Issue creation, chat posting, solution acceptance, revert (`req.body.userId`), and pipeline `executedBy` accept caller-supplied user IDs instead of deriving from `req.user!.id`.
- **Recommended Remediation**: Derive actor IDs from `req.user!.id` (or reject mismatches as `resolutions.ts` does).
- **Verification Criteria**: Route tests verifying spoofed `userId`/`creatorId` in request bodies are rejected or overridden by `req.user.id`.

### `AUD-INV-007` — Row-by-Row `INSERT` Loop in `reversionService.revertTask`
- **Severity**: `LOW` | **Status**: `OPEN` | **Category**: Performance
- **File & Line**: [`reversionService.ts#L127-L139`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/reversionService.ts#L127-L139)
- **Evidence**: `revertTask` issues N sequential `INSERT INTO task_dataset_transactions` queries inside a `for` loop.
- **Recommended Remediation**: Batch inserts into chunked multi-row `INSERT` statements (e.g., 500 rows per chunk).

---

## 7. Positive Observations
- **64-Bit Cryptographic Advisory Locking (`Rule 10`)**: Consistently enforced via `('x' || substr(md5(...), 1, 16))::bit(64)::bigint` in `investigationOrchestratorService.ts` and `reversionService.ts`.
- **VALUES Ingress & 30,000-Parameter Ceiling (`Rule 9 & Rule 11`)**: `CoordinateInjector` + `chunkRowsForValuesIngress` + `buildValuesIngressQuery` preserve `_row_number` for twin transactions and enforce ANSI identifier quoting for PostgreSQL and MySQL.
- **Anti-Self-Approval (`Rule 7`)**: `makerCheckerService.ts` enforces `proposal.maker_id === input.checkerId` inside an ACID transaction with `SELECT ... FOR UPDATE`, returning HTTP 403.
- **Frontend Fault Tolerance (`Rule 6`)**: `InvestigationWorkspace` wraps `ValidationOrchestratorWorkspace` in `<ErrorBoundary>`, `IssueDetailView` wraps complex panels in `<ErrorBoundary>`, and `CasesWorkspaceView` safely serializes object values with `JSON.stringify`.

---

## 8. Recommendations (Non-Defect Observations)
- Remove deprecated `_legacyExecuteUniversalWorkflow` (`investigationOrchestratorService.ts:58`) once verified no callers remain.
- Add `isPostgresConnected` test coverage for `PAUSED_DB_OFFLINE` end-to-end in `pipelineAuditedDefects.test.ts`.

---

## 9. Remediation Plan
1. **P0 (Critical)**: Fix `PAUSED_DB_OFFLINE` rollup in `ExecutablePipeline.ts` (`AUD-INV-001`); restrict `/executions/clear-all` to admins and add ownership/team checks on `DELETE` routes (`AUD-INV-002`).
2. **P1 (High)**: Enforce server-derived `checkerTeamId` and `execute-script` approval checks (`AUD-INV-003`); harden `ruleSqlCompiler.ts` numeric and action validation (`AUD-INV-004`).
3. **P2 (Medium/Low)**: Fix `reconcileByRowNumber` action preservation and `allStageLegs` keying (`AUD-INV-005`), derive actor IDs from `req.user` (`AUD-INV-006`), and batch `revertTask` inserts (`AUD-INV-007`).

---

## 10. Audit Conclusion
The Investigation Core's compiled DAG pipeline, 64-bit advisory locking, VALUES-ingress coordinate injection, and Maker-Checker anti-self-approval core are architecturally strong, with **312/312 backend tests** and **frontend/backend builds passing**. However, **2 CRITICAL** and **2 HIGH** defects—most notably `PAUSED_DB_OFFLINE` rolling up as `PASS` and unscoped destructive/authorization endpoints—require remediation before production sign-off.

**Recommended Next Action**: Run `/sign-off` to execute the P0–P2 remediation plan and generate a verified sign-off record.

---

## 11. Verification Limitations
- Tests ran against the existing Vitest unit/integration suite (`312` tests); live E2E database-offline failure injection against a running external MySQL/PostgreSQL target was not executed in this read-only audit.
