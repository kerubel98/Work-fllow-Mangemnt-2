# Master Audit Register

Central ledger of all audit scopes, findings, remediation statuses, and sign-off records for the Operational Workflow Management platform.

---

## Overall Audit Status
- **Active Audits**: 8 (`AUD-INVESTIGATION-CORE-2026-11-24`, `AUD-INTAKE-STAGING-2026-11-24`, `AUD-MAPPING-INGESTION-2026-11-24`, `AUD-DB-GOVERNANCE-APPROVALS-2026-11-24`, `AUD-AUTH-OAUTH-2026-11-24`, `AUD-HASHTAG-SCHEDULER-2026-11-24`, `AUD-SANDBOX-ESCALATIONS-2026-11-24`, `AUD-CASES-PAGE-2026-11-25`)
- **Open Findings**: 33 (**7 CRITICAL**, **10 HIGH**, **12 MEDIUM**, **4 LOW**)
- **Resolved Findings**: 0
- **Regressions**: 0

---

## Audit History
| Date | Audit ID | Scope | Commit | Findings | Status | Report |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-11-25 | `AUD-CASES-PAGE-2026-11-25` | Cases Page & Investigation Workspace UI/Navigation | `d7bf228` | 0C / 1H / 2M / 1L | `OPEN` | [`AUD-CASES-PAGE-2026-11-25.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-CASES-PAGE-2026-11-25.md) |
| 2026-11-24 | `AUD-SANDBOX-ESCALATIONS-2026-11-24` | Query Sandbox & Bilateral Escalations | `d7bf228` | 0C / 1H / 1M / 0L | `OPEN` | [`AUD-SANDBOX-ESCALATIONS-2026-11-24.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-SANDBOX-ESCALATIONS-2026-11-24.md) |
| 2026-11-24 | `AUD-HASHTAG-SCHEDULER-2026-11-24` | Universal Hashtag Engine & Schedulers | `d7bf228` | 1C / 1H / 1M / 0L | `OPEN` | [`AUD-HASHTAG-SCHEDULER-2026-11-24.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-HASHTAG-SCHEDULER-2026-11-24.md) |
| 2026-11-24 | `AUD-AUTH-OAUTH-2026-11-24` | Auth Middleware, JWT & OAuth 2.0 Segregation | `d7bf228` | 2C / 1H / 0M / 0L | `OPEN` | [`AUD-AUTH-OAUTH-2026-11-24.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-AUTH-OAUTH-2026-11-24.md) |
| 2026-11-24 | `AUD-DB-GOVERNANCE-APPROVALS-2026-11-24` | DB Connections, Approvals & Validation Boxes | `d7bf228` | 2C / 1H / 1M / 0L | `OPEN` | [`AUD-DB-GOVERNANCE-APPROVALS-2026-11-24.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-DB-GOVERNANCE-APPROVALS-2026-11-24.md) |
| 2026-11-24 | `AUD-MAPPING-INGESTION-2026-11-24` | Mapping & Workspace Ingestion (`b19bbaa`) | `d7bf228` | 0C / 1H / 3M / 1L | `OPEN` | [`AUD-MAPPING-INGESTION-2026-11-24.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-MAPPING-INGESTION-2026-11-24.md) |
| 2026-11-24 | `AUD-INTAKE-STAGING-2026-11-24` | Intake Page & Messaging Staging (`1dc1a71`) | `d7bf228` | 0C / 2H / 2M / 1L | `OPEN` | [`AUD-INTAKE-STAGING-2026-11-24.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-INTAKE-STAGING-2026-11-24.md) |
| 2026-11-24 | `AUD-INVESTIGATION-CORE-2026-11-24` | Investigation Core (Backend & Frontend) | `d7bf228` | 2C / 2H / 2M / 1L | `OPEN` | [`AUD-INVESTIGATION-CORE-2026-11-24.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-INVESTIGATION-CORE-2026-11-24.md) |

---

## Outstanding Findings

| Finding ID | Severity | Status | Audit Scope | Location | Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-INV-001` | `CRITICAL` | `OPEN` | `AUD-INVESTIGATION-CORE-2026-11-24` | `backend/src/services/pipeline/ExecutablePipeline.ts:410,693-759` | `PAUSED_DB_OFFLINE` stage status silently rolls up as `PASS` in `executeBatch` |
| `AUD-INV-002` | `CRITICAL` | `OPEN` | `AUD-INVESTIGATION-CORE-2026-11-24` | `backend/src/routes/investigations.ts:357,376`; `issues.ts:439` | Global `clear-all` and task `DELETE` endpoints lack admin/team ownership authorization |
| `AUD-INV-003` | `HIGH` | `OPEN` | `AUD-INVESTIGATION-CORE-2026-11-24` | `backend/src/routes/resolutions.ts:39`; `makerCheckerService.ts:161`; `issues.ts:611` | Omitting `checkerTeamId` bypasses team check; `execute-script` resolves issue without Checker approval |
| `AUD-INV-004` | `HIGH` | `OPEN` | `AUD-INVESTIGATION-CORE-2026-11-24` | `backend/src/services/ruleSqlCompiler.ts:150,186,310,390,473-494` | Unvalidated `Number(...)` (`NaN`) and unescaped `onPassAction`/`onFailAction` interpolated into SQL |
| `AUD-INV-005` | `MEDIUM` | `OPEN` | `AUD-INVESTIGATION-CORE-2026-11-24` | `backend/src/services/reconciliationService.ts:318-319`; `ExecutablePipeline.ts:732` | `reconcileByRowNumber` hardcodes `STOP`/`CONTINUE`; `allStageLegs` overwrites same-named tables |
| `AUD-INV-006` | `MEDIUM` | `OPEN` | `AUD-INVESTIGATION-CORE-2026-11-24` | `backend/src/routes/issues.ts:27,451,518,584`; `investigations.ts:226` | Client-supplied actor IDs trusted over JWT `req.user.id` |
| `AUD-INV-007` | `LOW` | `OPEN` | `AUD-INVESTIGATION-CORE-2026-11-24` | `backend/src/services/reversionService.ts:127-139` | `revertTask` performs row-by-row `INSERT` loop instead of batched multi-row inserts |
| `AUD-INT-001` | `HIGH` | `OPEN` | `AUD-INTAKE-STAGING-2026-11-24` | `frontend/src/components/intake/IntakeView.tsx:914-1007` | API failures in reply/close/archive/reopen silently show success or mutate local UI state |
| `AUD-INT-002` | `HIGH` | `OPEN` | `AUD-INTAKE-STAGING-2026-11-24` | `backend/src/services/messaging/stagingService.ts:846`; `messages.ts:1015-1102` | Missing 404 checks, non-null `!` assertions, and missing `attachmentId \|\| filename` guard |
| `AUD-INT-003` | `MEDIUM` | `OPEN` | `AUD-INTAKE-STAGING-2026-11-24` | `backend/src/routes/messages.ts:994-1073` | Client-supplied `actorId`/`actorName` trusted over `req.user`; no team check on staged actions |
| `AUD-INT-004` | `MEDIUM` | `OPEN` | `AUD-INTAKE-STAGING-2026-11-24` | `backend/src/services/messaging/stagingService.ts:204-210,489-499` | Summary SLA query omits `CLOSED`/`ARCHIVED`; N+1 attachment queries in `getStagedMessages` |
| `AUD-INT-005` | `LOW` | `OPEN` | `AUD-INTAKE-STAGING-2026-11-24` | `frontend/src/components/intake/IntakeView.tsx:523,705` | Empty PostgreSQL staged queue falls back to hardcoded `DEFAULT_INTAKE_ITEMS` |
| `AUD-MAP-001` | `HIGH` | `OPEN` | `AUD-MAPPING-INGESTION-2026-11-24` | `frontend/src/services/globalMappingService.ts:108-268,544-633,1646` | `localStorage` used to persist mapping schema config & central table state |
| `AUD-MAP-002` | `MEDIUM` | `OPEN` | `AUD-MAPPING-INGESTION-2026-11-24` | `backend/src/services/recipeExecutionService.ts:689-691`; `WorkspaceTaskCreator.tsx:68-70` | `NUMBER_CLEAN` and `ROUND_INT` UI transforms silently no-op in backend recipe replay |
| `AUD-MAP-003` | `MEDIUM` | `OPEN` | `AUD-MAPPING-INGESTION-2026-11-24` | `frontend/src/components/datasetup/ValueDictionariesView.tsx:326-328` | `catch` block shows `setSaveSuccess(true)` even when PostgreSQL save fails |
| `AUD-MAP-004` | `MEDIUM` | `OPEN` | `AUD-MAPPING-INGESTION-2026-11-24` | `backend/src/services/dataSanitizerService.ts:197-260` | `autoMapHeaders` lacks duplicate-target collision guard; multiple columns overwrite same key |
| `AUD-MAP-005` | `LOW` | `OPEN` | `AUD-MAPPING-INGESTION-2026-11-24` | `backend/src/routes/misc.ts:941-964` | `file-mapping-templates` `POST`/`DELETE` lack team ownership or admin checks |
| `AUD-DB-001` | `CRITICAL` | `OPEN` | `AUD-DB-GOVERNANCE-APPROVALS-2026-11-24` | `backend/src/routes/database.ts:407-418,544-604,672-711` | Client-supplied `role`/`callerId` & missing admin checks expose team DBs and self-promotion |
| `AUD-DB-002` | `CRITICAL` | `OPEN` | `AUD-DB-GOVERNANCE-APPROVALS-2026-11-24` | `backend/src/routes/approvals.ts:81-156` | `approvals.ts` trusts `req.body.checkerId` instead of JWT `req.user.id` |
| `AUD-DB-003` | `HIGH` | `OPEN` | `AUD-DB-GOVERNANCE-APPROVALS-2026-11-24` | `backend/src/routes/database.ts:576-577,684-686` | `PUT /databases/:id` & `review-promotion` return unmasked `updated` DB objects |
| `AUD-DB-004` | `MEDIUM` | `OPEN` | `AUD-DB-GOVERNANCE-APPROVALS-2026-11-24` | `backend/src/routes/validationBoxes.ts:99-101` | `POST /validation-boxes` does not enforce the 4 canonical `ValidationBoxType` enums |
| `AUD-AUTH-001` | `CRITICAL` | `OPEN` | `AUD-AUTH-OAUTH-2026-11-24` | `backend/src/routes/auth.ts:130-159,187-208` | Unauthenticated `GET /users`, broken `/approve` middleware order, self-assignable `admin` role |
| `AUD-AUTH-002` | `CRITICAL` | `OPEN` | `AUD-AUTH-OAUTH-2026-11-24` | `backend/src/utils/auth.ts:3,40-41` | Hardcoded fallback `JWT_SECRET` in source and plaintext password comparison fallback |
| `AUD-AUTH-003` | `HIGH` | `OPEN` | `AUD-AUTH-OAUTH-2026-11-24` | `backend/src/routes/auth.ts:96,157,178`; `messages.ts:748-805` | `password_hash` returned in auth responses; `/admin/oauth2` routes lack `requireRole('admin')` |
| `AUD-TAG-001` | `CRITICAL` | `OPEN` | `AUD-HASHTAG-SCHEDULER-2026-11-24` | `backend/src/services/hashtagService.ts:340-378,457-460` | Unsanitized `preset.criteria` and `preset.solutionTemplate` executed directly as raw SQL |
| `AUD-TAG-002` | `HIGH` | `OPEN` | `AUD-HASHTAG-SCHEDULER-2026-11-24` | `backend/src/routes/misc.ts:24-87` | Any authenticated user can create/edit/delete any hashtag preset, including `SCHEDULED_CRON` SQL |
| `AUD-TAG-003` | `MEDIUM` | `OPEN` | `AUD-HASHTAG-SCHEDULER-2026-11-24` | `backend/src/services/hashtagSchedulerService.ts:76`; `ftpSchedulerService.ts:49` | Hardcoded `'default-team'` in Maker proposals; FTP scheduler ignores interval/cadence checks |
| `AUD-SBX-001` | `HIGH` | `OPEN` | `AUD-SANDBOX-ESCALATIONS-2026-11-24` | `backend/src/routes/escalations.ts:116-205` | Escalation `sign`/`accept`/`decline` skip status transition guards, JWT actor checks, and team checks |
| `AUD-SBX-002` | `MEDIUM` | `OPEN` | `AUD-SANDBOX-ESCALATIONS-2026-11-24` | `backend/src/services/sandboxExecutionService.ts:39,60-74` | Sandbox history is in-memory only; `dryRun: true` still writes `task_workflow_executions` rows |
| `AUD-CAS-001` | `HIGH` | `OPEN` | `AUD-CASES-PAGE-2026-11-25` | `frontend/src/components/investigation/CasesWorkspaceView.tsx:126`; `issues.ts:274` | Client-side silent record truncation via mismatched pagination fetch (`limit=5000` requested vs `500` backend cap) |
| `AUD-CAS-002` | `MEDIUM` | `OPEN` | `AUD-CASES-PAGE-2026-11-25` | `frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx:3656-3686`; `CasesWorkspaceView.tsx:430-443` | Unbounded full-dataset React state & unvirtualized table DOM causing UI freezes on large datasets |
| `AUD-CAS-003` | `MEDIUM` | `OPEN` | `AUD-CASES-PAGE-2026-11-25` | `frontend/src/components/investigation/InvestigationWorkspace.tsx:28-34`; `CasesWorkspaceView.tsx:149, 1300` | Missing granular sub-pane error boundaries and unhandled optimistic row override desynchronization |
| `AUD-CAS-004` | `LOW` | `OPEN` | `AUD-CASES-PAGE-2026-11-25` | `backend/src/routes/investigations.ts:267-294` | `GET /api/investigations/:taskId/central-records` lacks team ownership and visibility guards |

---

## Resolved Findings
_None yet._

---

## Regression Watch
- Ensure `PAUSED_DB_OFFLINE` never falls back to `PASS` in `ExecutablePipeline.executeBatch` or `executeRow`.
- Ensure `CasesWorkspaceView` table headers remain stationary with strict `min-h-0` flexbox isolation (Rule 16).
- Ensure JSON cell formatters continue using `JSON.stringify` serialization rather than direct React node rendering (Rule 6).

---

## Consolidated Remediation Roadmap

1. **Phase 1: Critical Invariants & Security Hardening (7 Critical Findings)**
   - `AUD-INV-001`: Fix `PAUSED_DB_OFFLINE` stage rollup in `ExecutablePipeline.ts`.
   - `AUD-INV-002`: Authorize task `DELETE` and global `clear-all` routes.
   - `AUD-DB-001`: Enforce admin verification on database connection promotion and team isolation.
   - `AUD-DB-002`: Eliminate `req.body.checkerId` spoofing in `approvals.ts`.
   - `AUD-AUTH-001`: Protect `GET /users`, reorder router middleware, and restrict role assignment.
   - `AUD-AUTH-002`: Remove hardcoded fallback `JWT_SECRET` and plaintext password comparison.
   - `AUD-TAG-001`: Sanitize and bind criteria and solution SQL templates in `hashtagService.ts`.

2. **Phase 2: High Severity Integrity & Authorization (10 High Findings)**
   - `AUD-CAS-001`: Synchronize Cases workspace client pagination with backend limits and total counts.
   - `AUD-INV-003`, `AUD-INV-004`, `AUD-INT-001`, `AUD-INT-002`, `AUD-MAP-001`, `AUD-DB-003`, `AUD-AUTH-003`, `AUD-TAG-002`, `AUD-SBX-001`.

3. **Phase 3: Medium & Low Operational Reliability (12 Medium / 4 Low Findings)**
   - `AUD-CAS-002`, `AUD-CAS-003`, `AUD-CAS-004`, `AUD-INV-005`, `AUD-INV-006`, `AUD-INV-007`, `AUD-INT-003`, `AUD-INT-004`, `AUD-INT-005`, `AUD-MAP-002`, `AUD-MAP-003`, `AUD-MAP-004`, `AUD-MAP-005`, `AUD-DB-004`, `AUD-TAG-003`, `AUD-SBX-002`.

---

## Sign-Off History
_No formal sign-offs executed yet. Run `/sign-off` to begin prioritized remediation._
