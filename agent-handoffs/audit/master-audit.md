# Master Audit Register

Central ledger of all audit scopes, findings, remediation statuses, and sign-off records for the Operational Workflow Management platform.

---

## Overall Audit Status
- **Active Audits**: 16 (`AUD-INVESTIGATION-CORE-2026-11-24`, `AUD-INTAKE-STAGING-2026-11-24`, `AUD-MAPPING-INGESTION-2026-11-24`, `AUD-DB-GOVERNANCE-APPROVALS-2026-11-24`, `AUD-AUTH-OAUTH-2026-11-24`, `AUD-HASHTAG-SCHEDULER-2026-11-24`, `AUD-SANDBOX-ESCALATIONS-2026-11-24`, `AUD-CASES-PAGE-2026-11-25`, `AUD-TEAM-COLLAB-2026-11-25`, `AUD-WORKFLOW-STUDIO-2026-11-25`, `AUD-AUTOMATION-E2E-2026-11-25`, `AUD-GOV-MISALIGN-2026-11-25`, `AUD-EXTDB-AI-METRICS-2026-11-25`, `AUD-DATASETUP-DESIGN-2026-11-25`, `AUD-INGESTION-TRANSFORMS-2026-11-25`, `AUD-INGESTION-WORKBENCH-REASSESSMENT-2026-11-25`)
- **Open Findings**: 56 (**11 CRITICAL**, **21 HIGH**, **20 MEDIUM**, **4 LOW**)
- **Resolved Findings**: 14 (`AUD-MAP-002`, `AUD-ING-001`, `AUD-ING-002`, `AUD-ING-003`, `AUD-ING-004`, `AUD-ING-005`, `AUD-ING-006`, `AUD-WFS-001`, `AUD-WFS-002`, `AUD-WFS-003`, `AUD-WFS-004`, `AUD-WFS-005`, `AUD-WFS-006`, `AUD-GOV-001`)
- **Regressions**: 0

---

## Audit History
| Date | Audit ID | Scope | Commit | Findings | Status | Report |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-11-25 | `AUD-WORKFLOW-STUDIO-2026-11-25` | Workflow Studio, Flowchart DAG & Pipeline Execution | Working Tree | 0C / 0H / 0M / 0L | `RESOLVED` | [`AUD-WORKFLOW-STUDIO-2026-11-25.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-WORKFLOW-STUDIO-2026-11-25.md) · [Sign-Off](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/sign-off/SIGN-OFF-WORKFLOW-STUDIO-SECURITY-2026-11-25.md) |
| 2026-11-25 | `AUD-INGESTION-WORKBENCH-REASSESSMENT-2026-11-25` | Reassessment of Ingestion, Transforms & Workbench | Working Tree | 0C / 0H / 0M / 0L | `RESOLVED` | [`AUD-INGESTION-WORKBENCH-REASSESSMENT-2026-11-25.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-INGESTION-WORKBENCH-REASSESSMENT-2026-11-25.md) · [Sign-Off](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/sign-off/SIGN-OFF-INGESTION-TRANSFORMS-2026-11-25.md) |
| 2026-11-25 | `AUD-INGESTION-TRANSFORMS-2026-11-25` | Data Ingestion, Recipe Transformations & Value Dictionaries | `8f41c47` | 0C / 0H / 0M / 0L | `RESOLVED` | [`AUD-INGESTION-TRANSFORMS-2026-11-25.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-INGESTION-TRANSFORMS-2026-11-25.md) · [Sign-Off](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/sign-off/SIGN-OFF-INGESTION-TRANSFORMS-2026-11-25.md) |
| 2026-11-25 | `AUD-DATASETUP-DESIGN-2026-11-25` | Data Setup vs. Architecture & Frontend Design | `d7bf228` | 0C / 3H / 2M / 0L | `OPEN` | [`AUD-DATASETUP-DESIGN-2026-11-25.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-DATASETUP-DESIGN-2026-11-25.md) |
| 2026-11-25 | `AUD-EXTDB-AI-METRICS-2026-11-25` | External DB Connectivity, Live Query Engine, AI & Analytics | `d7bf228` | 1C / 1H / 2M / 0L | `OPEN` | [`AUD-EXTDB-AI-METRICS-2026-11-25.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-EXTDB-AI-METRICS-2026-11-25.md) |
| 2026-11-25 | `AUD-GOV-MISALIGN-2026-11-25` | Governance Misalignments & Architectural Mismatches | `d7bf228` | 0C / 2H / 2M / 0L | `OPEN` | [`AUD-GOV-MISALIGN-2026-11-25.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-GOV-MISALIGN-2026-11-25.md) |
| 2026-11-25 | `AUD-AUTOMATION-E2E-2026-11-25` | End-to-End Automation Process & Modernization | `d7bf228` | 1C / 2H / 1M / 0L | `OPEN` | [`AUD-AUTOMATION-E2E-2026-11-25.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-AUTOMATION-E2E-2026-11-25.md) |
| 2026-11-25 | `AUD-TEAM-COLLAB-2026-11-25` | Team Workspace, Multi-Tenant Boundary Isolation & Asset Sharing | `d7bf228` | 2C / 3H / 2M / 0L | `OPEN` | [`AUD-TEAM-COLLAB-2026-11-25.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-TEAM-COLLAB-2026-11-25.md) |
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
| `AUD-MAP-002` | `MEDIUM` | `RESOLVED` | `AUD-MAPPING-INGESTION-2026-11-24` | `backend/src/services/recipeExecutionService.ts:689-691`; `WorkspaceTaskCreator.tsx:68-70` | `NUMBER_CLEAN` and `ROUND_INT` UI transforms silently no-op in backend recipe replay (Resolved in `recipeExecutionService.ts`) |
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
| `AUD-TEAM-001` | `CRITICAL` | `OPEN` | `AUD-TEAM-COLLAB-2026-11-25` | `backend/src/routes/teams.ts:137-143, 206-223` | Bypassed manager check on omitted `callerUserId` in `member-privileges`; client-supplied `callerRole` grants team admin |
| `AUD-TEAM-002` | `CRITICAL` | `OPEN` | `AUD-TEAM-COLLAB-2026-11-25` | `backend/src/routes/teams.ts:97-125, 290-298` | Unauthenticated `DELETE /api/teams/:id` and unconstrained `PUT /api/teams/:id` allow deleting or mutating any team |
| `AUD-TEAM-003` | `HIGH` | `OPEN` | `AUD-TEAM-COLLAB-2026-11-25` | `backend/src/services/assetSharingService.ts:174-180`; `assetSharing.ts:11-43` | `POST /api/assets/share` mutates `team_id` in PostgreSQL without verifying sender ownership (asset hijacking) |
| `AUD-TEAM-004` | `HIGH` | `OPEN` | `AUD-TEAM-COLLAB-2026-11-25` | `backend/src/routes/assetSharing.ts:116-119`; `assetVerificationService.ts:129-132` | Header-spoofed `x-user-id` and null `maker_id` bypass Anti-Self-Approval in asset approval route |
| `AUD-TEAM-005` | `HIGH` | `OPEN` | `AUD-TEAM-COLLAB-2026-11-25` | `backend/src/routes/collaboration.ts:9-18, 20-52, 69-77` | Direct messages and user notifications can be intercepted, spoofed, and read across teams without auth |
| `AUD-TEAM-006` | `MEDIUM` | `OPEN` | `AUD-TEAM-COLLAB-2026-11-25` | `backend/src/routes/workspaceSettingsProposals.ts:81-115` | `POST /api/settings/proposals/:id/review` trusts client-supplied `checkerId` instead of JWT identity |
| `AUD-TEAM-007` | `MEDIUM` | `OPEN` | `AUD-TEAM-COLLAB-2026-11-25` | `backend/src/routes/database.ts:720-725, 923-928` | Private team database access checks pass when `callerTeamId` / `x-team-id` is omitted by caller |
| `AUD-WFS-001` | `CRITICAL` | `RESOLVED` | `AUD-WORKFLOW-STUDIO-2026-11-25` | `backend/src/routes/workflows.ts:347-364` | Raw SQL injection in `POST /api/workflows/query-sandbox/preview` (Resolved with regex identifier validation & ANSI quoting) |
| `AUD-WFS-002` | `CRITICAL` | `RESOLVED` | `AUD-WORKFLOW-STUDIO-2026-11-25` | `validationPipelineBuilder.ts:367-372`; `WorkflowStudioFlowchart.tsx:1334, 1508` | Vacuous DAG cycle detection: `validationPipelineBuilder` matches stage IDs against node IDs (Resolved with prefix-aware `resolveStageId`) |
| `AUD-WFS-003` | `HIGH` | `RESOLVED` | `AUD-WORKFLOW-STUDIO-2026-11-25` | `backend/src/routes/workflows.ts:235-271, 310-330` | Unauthenticated `PUT /:id` and `DELETE /:id` routes (Resolved with admin/team ownership authorization) |
| `AUD-WFS-004` | `HIGH` | `RESOLVED` | `AUD-WORKFLOW-STUDIO-2026-11-25` | `backend/src/routes/workflowBundles.ts:107-120`; `workflowBundleService.ts:199-201` | Anti-Self-Approval bypass in workflow bundle promotion review (Resolved with verified JWT `req.user.id` & spoofing guard) |
| `AUD-WFS-005` | `HIGH` | `RESOLVED` | `AUD-WORKFLOW-STUDIO-2026-11-25` | `frontend/src/components/settings/WorkflowStudioFlowchart.tsx:444` | Silent production rule corruption: missing validation box fallback uses modulo index (Resolved by eliminating modulo fallback) |
| `AUD-WFS-006` | `MEDIUM` | `RESOLVED` | `AUD-WORKFLOW-STUDIO-2026-11-25` | `backend/src/routes/workflows.ts:263-271`; `postgresRepo.ts` | Deleting a workflow leaves orphaned query extractions (Resolved with transaction client and active bundle block) |
| `AUD-AUTO-001` | `CRITICAL` | `OPEN` | `AUD-AUTOMATION-E2E-2026-11-25` | `frontend/src/components/automations/AutomationsView.tsx:58-71, 91-135, 168-211` | Ephemeral UI-only automation creation, hardcoded mock cron list, and fake `setTimeout(1200)` execution |
| `AUD-AUTO-002` | `HIGH` | `OPEN` | `AUD-AUTOMATION-E2E-2026-11-25` | `backend/src/server.ts:175-177`; `ftpSchedulerService.ts:31-169` | FTP/SFTP scheduler is never booted as a daemon in `server.ts`, and staging does not trigger `attachedWorkflowId` |
| `AUD-AUTO-003` | `HIGH` | `OPEN` | `AUD-AUTOMATION-E2E-2026-11-25` | `backend/src/services/hashtagSchedulerService.ts:19, 50-52, 208-221` | Ignores cron expressions (runs every 60s) and uses in-memory `isExecuting` flag without PostgreSQL advisory locks |
| `AUD-AUTO-004` | `MEDIUM` | `OPEN` | `AUD-AUTOMATION-E2E-2026-11-25` | `backend/src/routes/database.ts:2501-2505`; `hashtagSchedulerService.ts:91-93` | `run-scheduled` defaults `forceAll: true` without auth checks; background failures lack SSE alerts or DLQ |
| `AUD-GOV-001` | `CRITICAL` | `RESOLVED` | `AUD-GOV-MISALIGN-2026-11-25` | `backend/src/server.ts:82`; `events.ts:11-21` | `GET /api/events` SSE stream mounted before `requireAuth` (Resolved with JWT token authentication and verified identity) |
| `AUD-GOV-002` | `HIGH` | `OPEN` | `AUD-GOV-MISALIGN-2026-11-25` | `teams.ts`, `database.ts`, `approvals.ts`, `workflowBundles.ts`, `collaboration.ts` | Systemic mismatch: `server.ts` enforces JWT `requireAuth`, yet route handlers bypass `req.user` via spoofable `req.body`/`req.query`/`x-user-*` |
| `AUD-GOV-003` | `HIGH` | `OPEN` | `AUD-GOV-MISALIGN-2026-11-25` | `WorkspaceSettings.tsx:115,137,150`; `globalMappingService.ts:108-1646` | Business config (`operational_workspace_config_v1`) and mapping schemas still persist in `localStorage` despite Rule 23 |
| `AUD-GOV-004` | `MEDIUM` | `OPEN` | `AUD-GOV-MISALIGN-2026-11-25` | `WorkspaceSettings.tsx:204`; `LoginScreen.tsx:131` | Brittle `h-[calc(100vh-2.25rem)]` and `min-h-[calc(100vh-3rem)]` height subtractions violate Rule 16 flexbox containment |
| `AUD-GOV-005` | `MEDIUM` | `OPEN` | `AUD-GOV-MISALIGN-2026-11-25` | `AGENTS.md`; `.agents/skills/audit/SKILL.md:15,24-37` | Governance docs embed unrelated FinSync v2 QR/geofence/cashier invariants and external `FinSync_Project` paths |
| `AUD-EXT-001` | `CRITICAL` | `OPEN` | `AUD-EXTDB-AI-METRICS-2026-11-25` | `backend/src/services/dbConnectionManager.ts:456-471` | `mirror_*` fast-path allows `UNION` / stacked-query exfiltration of internal `operational_workflow_db` tables |
| `AUD-EXT-002` | `HIGH` | `OPEN` | `AUD-EXTDB-AI-METRICS-2026-11-25` | `backend/src/routes/ai.ts:48-66` | Unredacted financial `transactionData` sent to external Google Gemini API |
| `AUD-EXT-003` | `MEDIUM` | `OPEN` | `AUD-EXTDB-AI-METRICS-2026-11-25` | `backend/src/routes/metrics.ts:22-29` | `GET /api/metrics/team/:teamId` exposes team KPIs without checking team membership |
| `AUD-EXT-004` | `MEDIUM` | `OPEN` | `AUD-EXTDB-AI-METRICS-2026-11-25` | `backend/src/services/dbConnectionManager.ts:376-417` | External DB pool caches lack periodic TTL sweep, omit credential hash in key, and omit TLS/SSL options |
| `AUD-DSU-001` | `HIGH` | `OPEN` | `AUD-DATASETUP-DESIGN-2026-11-25` | `frontend/src/components/datasetup/DataSetupLandingView.tsx:39-150` | Hardcoded mock resources (`Core Ledger`, `SettlemFTP`) merged permanently with live PostgreSQL DBs |
| `AUD-DSU-002` | `HIGH` | `OPEN` | `AUD-DATASETUP-DESIGN-2026-11-25` | `frontend/src/components/datasetup/MappingDictionaryView.tsx:72,88,107-141` | `handleAutoClassify` and bulk actions mutate React state only (no DB save); `UNCLASSIFIED` misses `General` |
| `AUD-DSU-003` | `HIGH` | `OPEN` | `AUD-DATASETUP-DESIGN-2026-11-25` | `backend/src/routes/transactionSettings.ts:26-48,86-120` | `POST /settings/schema` and `POST /schema/config` lack admin role checks and mutate stale `store.globalSchema` |
| `AUD-DSU-004` | `MEDIUM` | `OPEN` | `AUD-DATASETUP-DESIGN-2026-11-25` | `frontend/src/components/datasetup/ValueDictionariesView.tsx:39,59-80` | `noMatchPolicy` uses `'FALLBACK'` instead of `'USE_FALLBACK'`, omits `'FLAG'`, and seeds mockup counts |
| `AUD-DSU-005` | `MEDIUM` | `OPEN` | `AUD-DATASETUP-DESIGN-2026-11-25` | `frontend/src/components/datasetup/DataSetupLandingView.tsx:197` | Inline `style={{ zoom: 0.9 }}` compounds with global `html { zoom: 0.8 }` (72% double-scaling) |
| `AUD-ING-002` | `HIGH` | `OPEN` | `AUD-INGESTION-TRANSFORMS-2026-11-25` | `ValueDictionariesView.tsx:40, 736-745, 423` | Dropdown persists invalid `'FALLBACK'` instead of `'USE_FALLBACK'`, violating DB CHECK constraint `chk_value_dict_no_match`, while catch block reports false `Saved` |
| `AUD-ING-003` | `MEDIUM` | `OPEN` | `AUD-INGESTION-TRANSFORMS-2026-11-25` | `recipeExecutionService.ts:768-780` | `VALUE_TRANSLATION_DICT` lookup is strictly unidirectional, ignoring `direction: 'BOTH'` / `'REVERSE'` semantics during headless cron replay |
| `AUD-ING-004` | `MEDIUM` | `OPEN` | `AUD-INGESTION-TRANSFORMS-2026-11-25` | `recipeExecutionService.ts:717, 723, 729, 735` | Floating-point operations (`DIVIDE_BY`, `MULTIPLY_BY`, `ADD_NUMBER`) lack decimal precision clamping, causing IEEE 754 precision drift |
| `AUD-ING-006` | `LOW` | `OPEN` | `AUD-INGESTION-TRANSFORMS-2026-11-25` | `StandardFileIngestionWorkspace.tsx:3639`; `recipeExecutionService.ts:736` | `CHAR_LENGTH` mode and pad character are serialized via naive colon delimiter (`mode:char`), failing if pad character is a colon |

---

## Resolved Findings
| Finding ID | Severity | Audit Scope | Resolution Details |
| :--- | :--- | :--- | :--- |
| `AUD-MAP-002` | `MEDIUM` | `AUD-MAPPING-INGESTION-2026-11-24` | **RESOLVED**: `recipeExecutionService.ts` lines 692-740 now physically implements headless recipe execution for `NUMBER_CLEAN`, `ROUND_INT`, `ABS_VALUE`, `DIVIDE_BY`, `MULTIPLY_BY`, `ADD_NUMBER`, `SUBTRACT_NUMBER`, `ADD_PREFIX_SUFFIX`, and `CHAR_LENGTH`, achieving full runtime parity with frontend transforms. |
| `AUD-ING-001` | `HIGH` | `AUD-INGESTION-TRANSFORMS-2026-11-25` | **RESOLVED**: `StandardFileIngestionWorkspace.tsx` lines 210-225 now safely normalizes mapping entries with multi-schema fallback (`m.sourceValue ?? m.code ?? m.source`) and safe string coercion, resolving unhandled runtime `TypeError` and adding bidirectional matching. |
| `AUD-ING-005` | `MEDIUM` | `AUD-INGESTION-TRANSFORMS-2026-11-25` | **RESOLVED**: `StandardFileIngestionWorkspace.tsx` lines 3425-3435 unconditionally initializes `transformParam1` to `availableValueDicts[0]?.id` upon selecting the `'RULE'` category, preventing silent no-op transforms. |

---

## Regression Watch
- Ensure `PAUSED_DB_OFFLINE` never falls back to `PASS` in `ExecutablePipeline.executeBatch` or `executeRow`.
- Ensure `WorkflowStudioFlowchart` preserves all four tiers simultaneously (Canvas State, Inspector, Execution Model, and PostgreSQL Hydration) per Principle 21.
- Ensure Kahn's topological sort accurately maps connection node IDs to stage IDs.

---

## Consolidated Remediation Roadmap

1. **Phase 1: Critical Invariants & Security Hardening (11 Critical Findings)**
   - `AUD-WFS-001`: Sanitize and parameterize query sandbox preview query; eliminate raw SQL concatenation.
   - `AUD-WFS-002`: Fix node ID / stage ID prefix resolution in `validationPipelineBuilder.ts` to restore Kahn's cycle detection.
   - `AUD-TEAM-001`: Secure `teamsRouter.put('/:id/member-privileges')` and eliminate client-supplied `callerRole`.
   - `AUD-TEAM-002`: Protect `teamsRouter.delete('/:id')` and `teamsRouter.put('/:id')` with admin / manager auth.
   - `AUD-INV-001`: Fix `PAUSED_DB_OFFLINE` stage rollup in `ExecutablePipeline.ts`.
   - `AUD-INV-002`: Authorize task `DELETE` and global `clear-all` routes.
   - `AUD-DB-001`: Enforce admin verification on database connection promotion and team isolation.
   - `AUD-DB-002`: Eliminate `req.body.checkerId` spoofing in `approvals.ts`.
   - `AUD-AUTH-001`: Protect `GET /users`, reorder router middleware, and restrict role assignment.
   - `AUD-AUTH-002`: Remove hardcoded fallback `JWT_SECRET` and plaintext password comparison.
   - `AUD-TAG-001`: Sanitize and bind criteria and solution SQL templates in `hashtagService.ts`.

2. **Phase 2: High Severity Integrity & Authorization (16 High Findings)**
   - `AUD-WFS-003`: Protect `workflowsRouter` mutation and deletion routes with authentication and team checks.
   - `AUD-WFS-004`: Enforce JWT identity on workflow bundle promotion reviews.
   - `AUD-WFS-005`: Remove modulo validation box fallback in `WorkflowStudioFlowchart.tsx`.
   - `AUD-TEAM-003`: Guard asset sharing to prevent unauthorized `team_id` reassignment in PostgreSQL.
   - `AUD-TEAM-004`: Enforce strict JWT actor identity and require non-null distinct `maker_id` on asset approvals.
   - `AUD-TEAM-005`: Authorize direct message retrieval, message creation, and notifications by authenticated user.
   - `AUD-CAS-001`: Synchronize Cases workspace client pagination with backend limits and total counts.
   - `AUD-INV-003`, `AUD-INV-004`, `AUD-INT-001`, `AUD-INT-002`, `AUD-MAP-001`, `AUD-DB-003`, `AUD-AUTH-003`, `AUD-TAG-002`, `AUD-SBX-001`.

3. **Phase 3: Medium & Low Operational Reliability (15 Medium / 4 Low Findings)**
   - `AUD-WFS-006`, `AUD-TEAM-006`, `AUD-TEAM-007`, `AUD-CAS-002`, `AUD-CAS-003`, `AUD-CAS-004`, `AUD-INV-005`, `AUD-INV-006`, `AUD-INV-007`, `AUD-INT-003`, `AUD-INT-004`, `AUD-INT-005`, `AUD-MAP-002`, `AUD-MAP-003`, `AUD-MAP-004`, `AUD-MAP-005`, `AUD-DB-004`, `AUD-TAG-003`, `AUD-SBX-002`.

---

## Sign-Off History
_No formal sign-offs executed yet. Run `/sign-off` to begin prioritized remediation._
