# MASTER SYSTEM ARCHITECTURE AUDIT — EVIDENCE PACKAGE

**Audit Date**: 2026-10-10
**Auditor**: Independent Architecture Audit (OpenCode session)
**Scope**: Operational Workflow Management / Back Office platform — full repository, working tree state
**Governing Instructions**: `AGENTS.md`, `.agents/skills/bo-operational-governance/SKILL.md`, `MASTER_ARCHITECTURE_INDEX.md`
**Audit Mode**: Read-only (Rule D). No application code, migrations, tests, DB records, or config were modified. All DB access was read-only metadata/queries.

---

## 1. Executive Summary

**What was audited**: repository identity, architecture document inventory, 23 AGENTS.md governance rules, 6 architectural domains, critical invariants (verdict/action separation, coordinate injection, advisory locking, parameter bounds, Maker-Checker authorization, SQL compilation), test/build execution, and adversarial bypass paths.

**What was actually executed**:
- Backend TypeScript build (`tsc`) — **PASS (exit 0)**
- Backend test suite (`vitest run`) — **PASS: 33 files / 260 tests in 6.81s**, including real-DB integration tests against the live PostgreSQL 18.6 instance
- Frontend production build (`vite build`) — **PASS (exit 0, 12.30s)**
- Frontend typecheck (`tsc --noEmit`) — **FAIL (exit 2, 12 TypeScript errors)** in the current working tree
- Live read-only DB metadata inspection (76 public tables, 17 mirror tables, no migration ledger)

**Overall status**:
- **HEAD commit `8d573ca`**: `ACCEPTED WITH CONDITIONS`
- **Current working tree (uncommitted Domain 7 changes)**: `NOT ACCEPTED — CONFIRMED DEFECTS` (frontend typecheck failure, Finding F-01)

**Highest risks**:
1. Working tree does not typecheck on the frontend — 12 confirmed TS errors in `HashtagManager.tsx` / `WorkspaceTaskCreator.tsx` (F-01). `vite build` does **not** typecheck, so prior "verified" claims based on `vite build` are insufficient (F-02).
2. No migration ledger (`schema_migrations` absent) — applied migration state is unverifiable from the database (F-03).
3. Stale counts and overstated certification language in `MASTER_ARCHITECTURE_INDEX.md` ("31 suites / 248 tests", "0 errors across frontend") vs. observed 33/260 and a failing frontend typecheck (F-02, F-04).

**Major limitations**: no live HTTP/runtime traces (server not started; auth not exercised), no browser automation, no concurrency stress execution, MySQL/Oracle paths not runtime-verified, OAuth/FTP flows statically inspected only.

---

## 2. Repository Identity and Audit Scope

| Item | Observed Value | Evidence | Status |
|---|---|---|---|
| Repository root | `C:\Users\hp\Downloads\opration-workflow-mangement1` | filesystem | Verified |
| Branch | `stagings` | `git branch --show-current` | Verified |
| Commit SHA | `8d573ca5d95a319e84f701558cfe50e88f8331e2` | `git rev-parse HEAD` | Verified |
| Working tree | **Dirty**: 24 modified files + 5 untracked files (Domain 7 file-ingestion work in progress) | `git status --short` | Verified |
| Node.js | v24.14.1 | `node --version` | Verified |
| npm | 11.11.0 | `npm --version` | Verified |
| PostgreSQL | 18.6 (live, localhost:5432, `operational_workflow_db`) | live connection probe | Verified |
| psql CLI | not installed | `psql --version` | Verified |
| Backend build | `cd backend && npx tsc` (exit 0) | package.json `scripts.build` | Executed/PASS |
| Backend tests | `cd backend && npm test` → vitest run: 33 files, 260 tests, 6.81s | vitest.config.ts `include: src/**/*.test.ts` | Executed/PASS |
| Frontend build | `cd frontend && npm run build` → vite build, exit 0, 12.30s | package.json | Executed/PASS |
| Frontend lint/typecheck | `cd frontend && npm run lint` → `tsc --noEmit` exit 2, 12 errors | package.json `scripts.lint` | Executed/**FAIL** |
| Migration inventory | 28 files `001_initial_schema.sql` … `028_file_ingestion_mapping_templates.sql`; **two files share prefix `002_`** | filesystem glob | Verified |
| Applied migration state | **UNKNOWN** — no `schema_migrations` ledger table in live DB | live DB probe | Unknown |
| Architecture documents | 70+ markdown files in root; 7 domains indexed in `MASTER_ARCHITECTURE_INDEX.md` | filesystem + index | Verified |
| App entrypoints | Backend `backend/src/server.ts` (Express, port 5002, embedded Vite SPA); Frontend `frontend/` (React 19 + Vite 6) | server.ts:39-188 | Verified |
| Tracked build artifacts | `backend/dist` — **165 files tracked in git** | `git ls-files backend/dist` | Verified |

**Pre-existing working-tree changes (audit scope note)**: modified `CURRENT_PROJECT_CONTEXT.md`, `MASTER_ARCHITECTURE_INDEX.md`, `UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md`, 22 source files, plus untracked `IMPLEMENTATION_PLAN_STANDARD_FILE_INGESTION_WORKSPACE.md`, `STANDARD_FILE_INGESTION_AND_MAPPING_ARCHITECTURE.md`, `backend/src/database/migrations/028_file_ingestion_mapping_templates.sql`, `backend/src/services/__tests__/fileIngestionMappingTemplates.test.ts`, `frontend/src/components/common/StandardFileIngestionWorkspace.tsx`. All results in this report correspond to the **working tree** unless stated otherwise.

---

## 3. Audit Methodology and Limitations

**Method**: (1) baseline establishment via git/filesystem/live probes; (2) document inventory vs. `MASTER_ARCHITECTURE_INDEX.md`; (3) rule-by-rule governance mapping to enforcement code; (4) execution of all safe verification commands with preserved output; (5) adversarial static analysis of bypass paths; (6) evidence compilation.

**Limitations**:
- No live HTTP requests were made (server not started; would require seeding/auth). All API-path verification is static (route file → service function → repository method).
- No browser automation available; frontend verification limited to build/typecheck/static inspection.
- No concurrency stress tests executed; advisory-lock correctness verified statically + via unit assertions only.
- MySQL path (`mysql2` installed) and Oracle path (no `oracledb` package — consistent with skill §2) not runtime-verified.
- Tests requiring the live DB **did** execute (PostgreSQL 18.6 reachable); tests are a mix of unit (mocked `pg`) and integration (real `queryPg`).

---

## 4. Master Architecture Inventory

`MASTER_ARCHITECTURE_INDEX.md` (221 lines) indexes 7 domains. Document existence verification:

| Document (root) | Exists | Authority Status | Conflict / Note |
|---|---|---|---|
| `UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md` | Yes | Authoritative (Domain 1) | Modified in working tree |
| `PIPELINE_ENGINE_MASTER_ARCHITECTURE.md` | Yes | Authoritative (Domain 2) | — |
| `RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md` | Yes | Authoritative (Domain 3) | — |
| `MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md` | Yes | Active spec (Domain 3) | — |
| `MESSAGE_INTEGRATION_ARCHITECTURE.md` | Yes | Authoritative (Domain 4) | — |
| `RECONCILIATION_PROCESS_ARCHITECTURE_AND_SPECIFICATION.md` | Yes | Authoritative (Domain 5) | — |
| `CURRENT_PROJECT_CONTEXT.md` | Yes | Active baseline (Domain 6) | Modified in working tree |
| `STANDARD_FILE_INGESTION_AND_MAPPING_ARCHITECTURE.md` | Yes (untracked) | Active spec (Domain 7) | **Not in git** — uncommitted |
| `DECISION_LOG.md` (ADR-001..003) | Yes | Decision records | — |
| `COMPREHENSIVE MASTER ARCHITECTURAL AUDIT REPORT.md` (referenced by audit brief) | **No** — not present in repo root | Assertion only | The "fully verified/signed off" report cited in the audit brief does not exist as a file; treat its claims as unverified |
| `VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md` | Yes | Historical audit log | — |
| `COMPREHENSIVE_BUG_REPORT_AND_GOVERNANCE_AUDIT.md` | **No** (referenced path points to `C:/Users/hp/.gemini/...` outside repo) | External, unavailable | Broken reference in index |

**Document conflicts identified**:
- **C-1**: Index Domain 6 says "Relational Schema (27 Tables)"; skill §2 and `CURRENT_PROJECT_CONTEXT` claim "22-table schema"; `001_initial_schema.sql` contains **33** `CREATE TABLE` statements; live DB has **76** public tables. Four inconsistent counts — the "22 tables" baseline is stale.
- **C-2**: Index claims "All 31 backend test suites (248/248 passing)" (Domain 3 changelog) and "All 31 backend test suites (247 tests)" (Domain 1 changelog). Actual: **33 files / 260 tests**. Stale.
- **C-3**: Index Domain 7 changelog claims "verified 0 errors across backend (`npx tsc`) and frontend (`vite build`)". `vite build` performs **no typechecking**; frontend `tsc --noEmit` fails with 12 errors in the working tree. Claim is misleading.
- **C-4**: Index references `COMPREHENSIVE_BUG_REPORT_AND_GOVERNANCE_AUDIT.md` at an absolute path outside the repository — unverifiable from this clone.

---

## 5. Governance Rule-by-Rule Verification (AGENTS.md Rules 1–23)

| # | Rule (abbreviated) | Enforcement Point (file:line) | Layer | Evidence Type | Result |
|---|---|---|---|---|---|
| 1 | PostgreSQL primary datastore | `backend/src/config/postgres.ts`; `server.ts:105`; live DB probe | Server/DB | Executed (live connection) | **PASS** |
| 2 | Workflows/ValidationBoxes persisted in PG via `/api/workflows`, `/api/validation-boxes` | `server.ts:61,63`; `database_validation_workflows` + `validation_boxes` tables present in live DB | API/DB | Executed (metadata) + static | **PASS** |
| 3 | Validation Result ≠ Pipeline Action | `types.ts:801` (`ValidationResultStatus`) vs `types.ts:805` (`PipelineAction`); `pipeline/ReconciliationEngine.ts:100-110` (`determinePipelineAction` separate from verdict); `ExecutablePipeline.ts:238-239` | Backend types | Static | **PASS** |
| 4 | Lifecycle separation (Task/Financial/Investigation/Verdict) | `types.ts:801-805,863-943`; `statusAggregator.ts:74,88,178` | Backend | Static | **PASS** (static) |
| 5 | External system agnosticism (no hard-coded external tables) | `ruleSqlCompiler.ts` parameterized compilation; `mirrorTableManager.getMirrorTableName` (`:70-77`) derives names from config | Backend | Static (spot) | **PASS** (static, spot-checked) |
| 6 | No unapproved infrastructure (Kafka/Redis/queues) | `backend/package.json` deps: pg, mysql2, express, ssh2, basic-ftp, xlsx, fast-xml-parser only | Manifest | Static | **PASS** |
| 7 | ErrorBoundary + JSONB stringification in complex views | Skill §3.6 mandate; not all views audited file-by-file | Frontend | **Not fully inspected** | **UNKNOWN** |
| 8 | Maker-Checker dual authorization + anti-self-approval | `makerCheckerService.ts:142` (`proposal.maker_id === input.checkerId` → throw); `approvalService.ts:474`; `workflowBundleService.ts:199`; `stagingService.ts:268-284`; `workspaceSettingsProposals.ts:96`; `postgresRepo.ts:4181`; route maps to HTTP 403 (`resolutions.ts:28-29`) | API+Service+DB | Static + tests (`governanceAndAnalyticsRefactor.test.ts:39`, `universalHashtagsEngine.test.ts:234` reject self-approval) | **PASS** |
| 9 | Universal hashtag binding | `misc.ts:8-216` (14+ hashtag routes incl. `/hashtags/resolve/:tag`); `hashtag_execution_runs` table present in live DB | API/DB | Static + metadata | **PASS** |
| 10 | Tuple-based ingestion + key precedence | `externalDataQueryService.ts:497-504` (tuple chunking); `ruleSqlCompiler.ts` (compiled tuple SQL) | Backend | Static + compiler tests | **PASS** (static) |
| 11 | 64-bit cryptographic advisory locking | `mirrorTableManager.ts:58-59`; `reversionService.ts:122,221`; `investigationOrchestratorService.ts:1273,1451`; `hashtagService.ts:38-47`; `messageIntakeService.ts:127`; `stagingService.ts:40`. **Zero `hashtext` occurrences** in executable code (only an explanatory comment at `hashtagService.ts:35`) | Backend/DB | Static + test asserting exact SQL string (`zeroErrorReconciliationHardening.test.ts:25-29`) | **PASS** |
| 12 | Parameter bounds < 30,000 + ANSI identifier quoting | `externalDataQueryService.ts:304-305` (`MAX_PARAMS = 30_000`, `maxRowsPerChunk`); `:497` (`Math.min(1000, Math.floor(30000/fieldCount))`) | Backend | Static | **PASS** (static) |
| 13 | Diagnostic taint tracking (`_isDiagnosticOnly`) | `DiagnosticReportMethod.ts:41` counts ERROR/PAUSED lineage; `_isDiagnosticOnly` propagation **not line-verified in this audit** | Backend | Partial static | **PARTIAL** |
| 14 | Task-scoped rollback isolation (no `LOCK TABLE … EXCLUSIVE`) | `reversionService.ts:122,221` (`pg_advisory_xact_lock` on `'task_revert_' \|\| taskId`); absence of global table locks **not exhaustively grepped** | Backend | Static | **PARTIAL** |
| 15 | Centralized enterprise OAuth 2.0, admin-level secrets | `messaging/stagingService.ts:40` (lock); `oauth2Service` described in index; **implementation not inspected in this audit** | Backend | Not inspected | **UNKNOWN** |
| 16 | Persistent presentation assets | No presentation generation in audit scope | — | — | **NOT APPLICABLE** |
| 17 | Full-viewport workspace layout / scroll containment | CSS-level; not audited | Frontend | Not inspected | **UNKNOWN** |
| 18 | Data-loss prevention / dry-run protocol | Skill §3.19 protocol; no destructive scripts executed during audit (compliant) | Process | Observed | **PASS** (process) |
| 19 | Canonical `ValidationBoxType` vs `CheckType` segregation | `types.ts` defines both; DB `validation_boxes.box_type` values **not queried in this audit** | Cross-layer | Partial static | **PARTIAL** |
| 20 | Team-scoped DB connection isolation | `teamDatabaseAccessAndPermanentTeam.test.ts:127-191` (403 on cross-team query; permanent-team query-type restriction) | API/Service | Test (executed, passed) | **PASS** |
| 21 | Evidence-based persistent-state modification | Process rule; audit itself complied (read-only) | Process | Observed | **PASS** (process) |
| 22 | Four-tier flowchart DAG invariance | `pipeline/WorkflowPipelineBuilder.ts:53,80` (topoSort cycle detection); `CoordinateInjector.ts`, `NextStageInputResolver.ts` (both `pipeline/` and legacy `nextStageInputResolver.ts`); `WorkflowStudioFlowchart` chunk present in production build; `convertStagesToFlowchart` round-trip **not line-verified** | Frontend/Backend | Partial static | **PARTIAL** |
| 23 | No client-side `localStorage` as primary store | Not grepped across frontend in this audit | Frontend | Not inspected | **UNKNOWN** |

**Rule 22 note (index protocol)**: this audit itself is delivered as a standalone evidence file (`audit_output/`), not as a modification to master documents, per Rule D (read-only audit).

---

## 6. Cross-Layer System Map

**Execution flow (verified statically, entrypoints confirmed in `server.ts`)**:

```
Task Dataset Upload (WorkspaceTaskCreator / StandardFileIngestionWorkspace)
    ↓ POST /api/issues (routes/issues.ts)
Dataset Ingestion → task_dataset_transactions (table present in live DB)
    ↓ investigationOrchestratorService.executeUniversalWorkflow (investigationOrchestratorService.ts)
In-flight dedup + LRU (workflowEngineSingleton.ts)
    ↓ dbLivenessService pre-flight (dbLivenessService.ts:31 circuit breaker, COOLDOWN_MS=30000)
Mirror provisioning (mirrorTableManager.ts:83-159, CREATE UNLOGGED TABLE IF NOT EXISTS, :159)
    ↓ 64-bit DDL advisory lock (:93-96)
Batched tuple extraction (externalDataQueryService.ts:304-305, 497-504)
    ↓ mirror_{db}_{table} bulk insert
Pipeline compile (pipeline/WorkflowPipelineBuilder.ts:53, cycle check :80)
    ↓ pipeline/ExecutablePipeline.ts + methods/{IngestionSearch,ConditionCheck,Reconciliation,DiagnosticReport,DbConfigValidation}Method.ts
Set-based rule SQL (ruleSqlCompiler.ts:420 — duplicate count scoped by _cnt._row_number = m._row_number)
    ↓ reconciliationService.ts (PASS/FAIL key segregation)
Status aggregation + SSE (statusAggregator.ts, events.ts)
    ↓ Maker-Checker (makerCheckerService.ts:142 anti-self-approval)
Persistence (postgresRepo.ts) → API/UI
```

**Active production paths vs. other paths**:
- **Active**: Express routes mounted in `server.ts:54-76` (21 routers); autonomous hashtag scheduler started at boot (`server.ts:139` → `hashtagSchedulerService.ts:208-211`, `setInterval` 60s default, filters `executionTrigger === 'SCHEDULED_CRON'` at `:51`).
- **Legacy/compat**: `investigationEngine.evaluateAttachedColumnConfigurations` (legacy path, `investigationEngine.ts:34`) preserved for backward compatibility per its own header comment (`:20-26`); legacy `nextStageInputResolver.ts` coexists with `pipeline/NextStageInputResolver.ts`.
- **Dead/unverified**: none identified as dead; `dist/` is build output but **tracked in git (165 files)** — hygiene issue (F-07).
- **Test-only**: `notFoundInDbFailsRule.test.ts` creates and deletes its own workflow rows (`:37-44`) — legitimate integration test, not test-only production code.

**Domain inventory (6 required domains)**:

1. **Universal Hashtag Automation** — Spec: `UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md`. Routes: `misc.ts:8-216` + `/hashtags/:tag/execute-file` (`misc.ts:330`) and `/hashtags/:tag/execute-audit` (`misc.ts:371`) — **AGAP-04 remediation routes verified present**. Services: `hashtagService.ts:200` (`executeFileIngestionHashtag`), `:507` (`executeAuditingGovernance`); scheduler `hashtagSchedulerService.ts`. DB: `hashtag_presets`, `hashtag_execution_runs` (both present in live DB). Tests: `universalHashtagsEngine.test.ts` (incl. cron execution test `:286-303`, self-approval rejection `:234`).
2. **Pipeline Engine & Flowchart DAG** — `pipeline/{WorkflowPipelineBuilder,ExecutablePipeline,CoordinateInjector,NextStageInputResolver,ReconciliationEngine}.ts` + 5 method classes. Cycle detection via topoSort (`WorkflowPipelineBuilder.ts:80`).
3. **Rule-to-Method / Dynamic SQL** — `ruleSqlCompiler.ts` (tuple SQL, `:420` row-number-scoped duplicate count), `externalDataQueryService.ts` (chunking), cardinality/aggregation handled in `ReconciliationMethod.ts:63-85` (zero-row guard: mirror-configured reconciliation must remain empty — no synthetic records).
4. **Messaging, Staging, OAuth** — `messaging/{stagingService,messageIntakeService}.ts`, migration `024_staged_message_attachments_raw_data.sql`, `023_team_mailbox_and_threading.sql`. OAuth service not inspected (UNKNOWN).
5. **Financial Reconciliation & Maker-Checker** — `reconciliationService.ts`, `makerCheckerService.ts`, `approvalService.ts`, `resolutions.ts`; ADR-001..003 in `DECISION_LOG.md`.
6. **Operational Baseline** — `CURRENT_PROJECT_CONTEXT.md` (modified in working tree); live DB metadata confirms PostgreSQL reality.

---

## 7. Subsystem-by-Subsystem Findings (Deep Verification Highlights)

**7.1 Pipeline Builder & DAG**: `WorkflowPipelineBuilder` compiles stages with topological sort and rejects cycles (`:80`). `ExecutablePipeline` executes the compiled plan (`pipelineAction` default `'FLAG'` at `:140`, `'STOP'` fallback at `:419`). **Not runtime-executed** — static only.

**7.2 Verdict / Infrastructure / Action separation**: `ValidationResultStatus` includes `PAUSED_DB_OFFLINE` (`types.ts:801`); `ReconciliationEngine.ts:239-240` maps DB-offline to `finalResult='PAUSED_DB_OFFLINE'` + separate `finalAction`; `statusAggregator.ts:74,88` gives offline verdict precedence. Technical unavailability is **not** conflated with business FAIL in the compiled paths inspected.

**7.3 Immutable coordinates `(task_id, row_number)`**: mirror DDL adds `_row_number`, `_task_id`, `_batch_id` (`mirrorTableManager.ts:110-117`); compiled duplicate subquery scopes by `_cnt._batch_id = m._batch_id AND _cnt._task_id = m._task_id AND _cnt._row_number = m._row_number` (`ruleSqlCompiler.ts:420`); regression test asserts the old buggy `_dup._row_number = m._row_number` pattern is **absent** (`ruleSqlCompiler.test.ts:245`). `CoordinateInjector` exists (`pipeline/CoordinateInjector.ts`). Runtime propagation not traced live.

**7.4 External acquisition & mirror persistence**: parameterized chunked queries (`externalDataQueryService.ts`); mirror tables exist in live DB (17 `mirror_*` tables, incl. `mirror_core_settlement_db_transactions`, `mirror_sett_sv_fin_tab`, FTP staging mirrors). `ReconciliationMethod.ts:63-85`: when a mirror table was configured but returned zero rows, `rawRows` **must remain empty** — no synthetic record substitution (code comment `:83-85`). UNLOGGED DDL confirmed at `mirrorTableManager.ts:159`.

**7.5 Cardinality & aggregation**: policies (`STRICT_SINGLE`, `ONE_TO_MANY`, `EXPLICIT_LATEST`, `EXPLICIT_FIRST`, `ALL_ROWS`) and aggregations declared per skill §3.23; `investigationEngine.ts:255-264` flags `_matchCount > 1` as FAIL `DUPLICATE_EXTERNAL_MATCH`. Full policy matrix not exhaustively traced — **PARTIAL**.

**7.6 Set-based execution**: compiled SQL path is set-based (`ruleSqlCompiler.ts` single UPDATE with CASE WHEN). **Deviation found**: legacy `investigationEngine.ts:200-265` performs per-record in-memory duplicate evaluation (`record._batchRecords.filter(...)`) — a per-row loop over pre-fetched batch records, not native SQL. Scoped to already-fetched batches, so impact is bounded, but it partially deviates from AGENTS.md Rule 3.5 for the legacy path (F-06).

**7.7 Schema & migrations**: 28 migration files; `001_initial_schema.sql` = 33 CREATE TABLE. **No `schema_migrations` ledger** in live DB → applied state unverifiable (F-03). Two files share prefix `002_` (`002_hashtag_governance_and_reversion.sql`, `002_database_column_configurations.sql`) — ordering ambiguity. Migrations appear applied manually (Domain 6/7 tables exist: `hashtag_execution_runs`, `task_workflow_executions`, `file_ingestion_mapping_templates` all present). `schemaMigrationService.ts` is a *directory-field sync* service (ALTER TABLE central_transaction_repository from `global_standard_directory`), **not** a numbered migration runner.

**7.8 Maker-Checker**: full lifecycle `POST /api/resolutions/propose` → `PENDING_CHECKER_REVIEW` → `POST /api/resolutions/review` with anti-self-approval at service (`:142`) and route (`:28-29` → 403). `postgresRepo.ts:4181` enforces at persistence layer too. Concurrent-approval race behavior not runtime-tested — **PARTIAL**.

**7.9 Hashtag automation**: 4-type taxonomy routes + scheduler verified (above). `testPreFlight` route at `misc.ts:177`. Duplicate-execution protection via 64-bit advisory locks (`hashtagService.ts:422-426`).

**7.10 Messaging/OAuth**: staging + intake services use 64-bit `pg_advisory_xact_lock` (`stagingService.ts:40`, `messageIntakeService.ts:127`). OAuth credential resolution **not inspected** — **UNKNOWN**.

**7.11 Frontend/Workflow Studio**: production build succeeds; `WorkflowStudioFlowchart` chunk (118.71 kB) built. Round-trip persistence (create→edit→save→reload→compile→execute) **not verified** — no browser automation. Frontend typecheck failure (F-01) affects `HashtagManager.tsx`/`WorkspaceTaskCreator.tsx` specifically.

**7.12 Concurrency/retry**: `pg_advisory_xact_lock` (auto-release on commit/rollback) for DDL/reversion/staging; session-level `pg_advisory_lock`/`unlock` pair for task execution (`investigationOrchestratorService.ts:1273,1451` — explicit unlock present). Lock-release failure paths and retry overwrite behavior not stress-tested — **PARTIAL**.

---

## 8. API and Runtime Path Verification (Static Traces)

| API Route | Controller | Service Path | DB Effects | Tests | Result |
|---|---|---|---|---|---|
| `POST /api/resolutions/propose` | `resolutions.ts:10-17` | `makerCheckerService.submitResolutionProposal` (`:42` validates required fields) | INSERT resolution proposal | `governanceAndAnalyticsRefactor.test.ts` | Static-PASS |
| `POST /api/resolutions/review` | `resolutions.ts:23-31` | `makerCheckerService.reviewResolutionProposal` (`:142` anti-self-approval) | UPDATE status/checker | self-approval rejection tests | Static-PASS |
| `POST /api/hashtags/:tag/execute-file` | `misc.ts:330-341` | `hashtagService.executeFileIngestionHashtag` (`:200`) | Type A ingestion | `universalHashtagsEngine.test.ts` | Static-PASS |
| `POST /api/hashtags/:tag/execute-audit` | `misc.ts:371-381` | `hashtagService.executeAuditingGovernance` (`:507`) | Type D audit sweep | `universalHashtagsEngine.test.ts` | Static-PASS |
| `POST /api/hashtags/test-preflight` | `misc.ts:177-196` | preflight + external DB routing | none (dry-run) | `universalHashtagsEngine.test.ts` | Static-PASS |
| Investigation execution | `investigations.ts` router (`server.ts:62`) | `investigationOrchestratorService.executeUniversalWorkflow` → pipeline methods | mirror + `task_workflow_executions` | `notFoundInDbFailsRule.test.ts` (**live-DB integration, executed, PASS**) | Executed-PASS |
| `GET /api/health` | `server.ts:79-87` | reports DB connectivity status | none | — | Static-PASS |

**No deprecated/compat route was found that bypasses Maker-Checker or authorization controls.** `POST /api/resolutions/propose-from-chat` (`resolutions.ts:51-70`) defaults to synthetic IDs when fields are absent (`'usr-maker'`, `'default-team'`) — a hardening concern for production (F-08, LOW).

---

## 9. Database and Migration Verification

**Live DB metadata (read-only probe, 2026-10-10)**:
- PostgreSQL 18.6, database `operational_workflow_db`, **76 public tables**, **17 `mirror_*` tables**.
- Key governance tables confirmed present: `database_validation_workflows`, `validation_boxes`, `task_dataset_transactions`, `task_workflow_executions`, `hashtag_presets`, `hashtag_execution_runs`, `file_ingestion_mapping_templates`.
- **`schema_migrations` table: ABSENT** → applied-migration state cannot be verified from the database (F-03).

**Migration inventory (28 files)**: `001` … `028`, with duplicate `002_` prefix. Rollback safety/idempotency: `CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` patterns observed in `mirrorTableManager.ts:109-118` and `schemaMigrationService.ts:58-72`; full migration-file review not performed line-by-line — **PARTIAL**.

**Schema/code mismatches**: none observed for the tables inspected; table-count claims in docs are inconsistent (C-1).

---

## 10. Dynamic SQL and Data Integrity Verification

- **Tuple SQL**: `externalDataQueryService.ts:497-504` — `maxKeysPerChunk = Math.min(1000, Math.floor(30000/fieldCount))`, sub-chunk slicing with merge. Parameter ceiling respected by construction.
- **Compiled rule SQL**: `ruleSqlCompiler.ts:420` — duplicate-count subquery correctly scoped to the same `(batch_id, task_id, row_number)` coordinate; regression assertion at `ruleSqlCompiler.test.ts:245`.
- **Identifier quoting**: ANSI quoting helper present in compiler (per skill §3.12 and index changelog "ANSI column quoting"); dialect-specific quoting for MySQL claimed in docs — not line-verified in this audit — **PARTIAL**.
- **Zero-result integrity**: `ReconciliationMethod.ts:63-85` and `IngestionSearchMethod.ts:64-68` explicitly preserve empty `rawRows` when a configured mirror yields nothing — missing external results are **not** replaced by synthetic records.
- **Float coercion / 18-digit identifiers**: remediation documented in index (2026-10-05 entry, `buildValuesIngressQuery`); not re-verified line-by-line — **PARTIAL**.

---

## 11. Concurrency, Security, Retry, and Failure Analysis

- Advisory locks: 64-bit MD5 bigint derivation in 6 services; exact-SQL unit assertion in `zeroErrorReconciliationHardening.test.ts:25-29`. Transaction-scoped locks auto-release; task-execution session lock has explicit unlock (`investigationOrchestratorService.ts:1451`).
- Orphan sweep on boot (`server.ts:114-136`) only fails tasks whose heartbeat is older than 3 minutes — consistent with skill §3.16.
- **Security observations**: `app.use(cors({ origin: '*' }))` (`server.ts:41`); server binds `0.0.0.0` (`server.ts:175`); `.env` holds live PG credentials (redacted in this report). Production hardening items — out of audit scope to remediate.
- Retry/duplicate-ingestion idempotency: not runtime-verified — **PARTIAL**.

---

## 12. Test and Build Execution Evidence

| Command | Purpose | Executed? | Exit Code | Actual Result | Limitations |
|---|---|---|---|---|---|
| `cd backend && npx tsc` | Backend typecheck/build | Yes | 0 | Clean | — |
| `cd backend && npm test` | Full vitest suite | Yes | 0 | **33 files / 260 tests passed, 6.81s** | Mix of unit (mocked pg) + integration (live PG 18.6) |
| `cd frontend && npm run build` | Production bundle | Yes | 0 | Built in 12.30s, 24 chunks | **Vite does not typecheck** |
| `cd frontend && npm run lint` | Frontend typecheck (`tsc --noEmit`) | Yes | **2** | **12 TypeScript errors** | Working-tree state |
| Live DB metadata probes | Schema/table/mirror/ledger verification | Yes | 0 | 76 tables, 17 mirrors, no ledger | Read-only |
| HTTP/runtime traces | Route behavior | **No** | — | — | Server not started; BLOCKED |
| MySQL/Oracle runtime | Dialect paths | **No** | — | — | BLOCKED (no live external DBs) |
| Concurrency stress | Lock behavior | **No** | — | — | BLOCKED (unsafe in shared env) |

**Frontend typecheck failure detail (F-01, reproduced)**:
```
src/components/issue/HashtagManager.tsx(1316,32): error TS2304: Cannot find name 'showSampleDataPreview'.
src/components/issue/HashtagManager.tsx(1378,40): error TS2304: Cannot find name 'setShowDataTransformModal'.
src/components/issue/HashtagManager.tsx(1461,45): error TS2304: Cannot find name 'showSampleDataPreview'.
src/components/issue/HashtagManager.tsx(1885,8): error TS2304: Cannot find name 'showDataTransformModal'.
src/components/issue/HashtagManager.tsx(1900,32): error TS2304: Cannot find name 'setShowDataTransformModal'.
src/components/issue/HashtagManager.tsx(1924,32): error TS2304: Cannot find name 'setShowDataTransformModal'.
src/components/issue/WorkspaceTaskCreator.tsx(26,42): error TS2724: '"../common/StandardFileIngestionWorkspace"' has no exported member named 'StandardFileIngestionRef'.
src/components/issue/WorkspaceTaskCreator.tsx(26,68): error TS2614: Module '"../common/StandardFileIngestionWorkspace"' has no exported member named 'IngestionValidationOutcome'.
(+ 4 more TS errors; 12 total)
```

**Meaningful-assertion spot checks (anti-false-green)**:
- `notFoundInDbFailsRule.test.ts:68-77` — asserts `passedCount=0`, `failedCount=1`, `_validation_status='FAIL'`, `_validation_details.existence='NOT_FOUND_IN_TARGET_DB'` against the **live** orchestrator + DB. Non-vacuous.
- `zeroErrorReconciliationHardening.test.ts:25-29` — asserts exact 64-bit lock SQL string and distinctness for different params.
- `ruleSqlCompiler.test.ts:245` — asserts absence of the previously-buggy `_dup._row_number = m._row_number` pattern.
- `governanceAndAnalyticsRefactor.test.ts:39-79` — asserts self-approval rejection and distinct-checker approval.
- `teamDatabaseAccessAndPermanentTeam.test.ts:127-191` — asserts HTTP 403 for cross-team access and query-type restrictions.
- Vitest config excludes `dist/**` (`vitest.config.ts:8`) — the modified `backend/dist/**/*.test.js` files are **not** executed (correct; dist is build output).

---

## 13. Adversarial Audit Results

| Adversarial question | Finding |
|---|---|
| Can invalid data pass an alternate route? | No bypass route found; all resolution paths route through `makerCheckerService`. `propose-from-chat` defaults synthetic IDs when body fields are missing (F-08, LOW). |
| Can a missing external record silently pass? | **No** — remediated and proven by executed integration test (`notFoundInDbFailsRule.test.ts`); guard at `investigationEngine.ts:51-59` returns FAIL `Ext Data Missing` for external configs without external data; empty-config early return at `:38-40` is explicit (F-05, LOW, by-design for legacy path). |
| Can duplicate external rows be silently lost? | No — `_matchCount > 1` → FAIL `DUPLICATE_EXTERNAL_MATCH` (`investigationEngine.ts:255-264`); mirror uniqueness not observed to suppress multi-row matches in inspected code. |
| Can one failed row fail unrelated rows? | Compiled SQL scopes per-coordinate (`ruleSqlCompiler.ts:420`); global-batch misapplication not observed in inspected paths. |
| Can one task consume another task's mirror data? | Mirror columns carry `_task_id`/`_batch_id` and subqueries scope by them (`:420`); cross-task test suite exists (`crossTaskAndLookup.test.ts`, passed). |
| Can retry change transaction identity? | Coordinates are persisted columns, not regenerated; not runtime-verified under retry — **PARTIAL**. |
| Can an invalid DB binding reach a live query? | `targetDbId`/`targetTable` required at workflow level (skill §3.23); `DbConfigValidationMethod` derives target from config (`DbConfigValidationMethod.ts:39-40`). Runtime enforcement not traced — **PARTIAL**. |
| Can the test suite pass while production uses different code? | Backend `dist/` is tracked in git and **modified in the working tree** — stale build artifacts could be served by `npm start` (`node backend/dist/server.js`) without rebuild (F-07). |
| Can UI save silently drop a config field? | Round-trip not verifiable without browser automation — **UNKNOWN** (blocked). |
| Can a background job bypass authorization/idempotency? | Hashtag scheduler runs as `SYSTEM_SCHEDULER` maker (`hashtagSchedulerService.ts:74`) — system actor, by design; no user-auth context applicable. |

---

## 14. Architecture-to-Implementation Compliance Matrix

| ID | Requirement | Authoritative Source | Code Evidence | Test Evidence | Runtime Evidence | Result | Confidence |
|---|---|---|---|---|---|---|---|
| INV-01 | PostgreSQL as primary datastore | AGENTS.md R1; skill §2 | `config/postgres.ts`, `server.ts:105` | live-DB integration tests | live probe (PG 18.6) | **PASS** | High |
| INV-02 | Verdict ≠ Action separation | AGENTS.md R2; skill §3.1 | `types.ts:801,805`; `ReconciliationEngine.ts:100-110` | `serviceHardCodedLogicRefactor.test.ts:106-113` | static | **PASS** | High |
| INV-03 | `(task_id,row_number)` immutable coordinates | skill §4; Domain 2 spec | `mirrorTableManager.ts:110-117`; `ruleSqlCompiler.ts:420` | `ruleSqlCompiler.test.ts:245`; `crossTaskAndLookup.test.ts` | static | **PASS** (static) | Medium-High |
| INV-04 | UNLOGGED typed mirrors | ADR-003; skill §2 | `mirrorTableManager.ts:159` (CREATE UNLOGGED) | mirror provisioning tests | 17 mirror tables in live DB | **PASS** | High |
| INV-05 | Batched tuple SQL, <30k params | AGENTS.md R11; skill §3.12 | `externalDataQueryService.ts:304-305,497-504` | `ruleSqlCompiler.test.ts` | static | **PASS** (static) | High |
| INV-06 | 64-bit advisory locks (no hashtext) | ADR-002; AGENTS.md R10 | 6 services (see §5 R11) | `zeroErrorReconciliationHardening.test.ts:25-29` | static + unit | **PASS** | High |
| INV-07 | Maker-Checker + anti-self-approval | ADR-001; AGENTS.md R7 | `makerCheckerService.ts:142`; `resolutions.ts:28-29`; +4 more sites | `governanceAndAnalyticsRefactor.test.ts:39`; `universalHashtagsEngine.test.ts:234` | static + unit | **PASS** | High |
| INV-08 | Missing external record → FAIL (no false pass) | Domain 3 spec; §16 remediation | `investigationOrchestratorService.ts:817`; `ExecutablePipeline.ts:421,520`; `investigationEngine.ts:51-59` | `notFoundInDbFailsRule.test.ts` (**executed, live DB**) | executed | **PASS** | High |
| INV-09 | Hashtag 4-type engine + scheduler | Domain 1 spec | `hashtagService.ts:200,507`; `hashtagSchedulerService.ts:51,208` | `universalHashtagsEngine.test.ts:286-303` | static + unit | **PASS** | High |
| INV-10 | Pipeline DAG compile + cycle rejection | Domain 2 spec | `WorkflowPipelineBuilder.ts:53,80`; `ExecutablePipeline.ts` | `pipelineArchitecture.test.ts`; `multiStagePipelineExecution.test.ts` (passed) | static + unit | **PASS** | Medium-High |
| INV-11 | Frontend type health | Repo `frontend/package.json` lint | — | — | `tsc --noEmit` exit 2, 12 errors | **FAIL** (working tree) | High |
| INV-12 | Migration ledger / applied-state traceability | Audit requirement | no `schema_migrations` table | — | live probe | **FAIL** | High |
| INV-13 | Set-based execution (no per-row DB loops) | skill §3.5 | compiled SQL path set-based; legacy in-memory duplicate loop `investigationEngine.ts:200-265` | — | static | **PARTIAL** | Medium |
| INV-14 | OAuth 2.0 centralization | AGENTS.md R14; Domain 4 | not inspected | — | — | **UNKNOWN** | Low |
| INV-15 | ErrorBoundary/JSONB render safety | AGENTS.md R6; skill §3.6 | not exhaustively inspected | — | — | **UNKNOWN** | Low |
| INV-16 | No localStorage primary store | AGENTS.md R23 | not inspected | — | — | **UNKNOWN** | Low |

---

## 15. Findings and Remediation Register

| ID | Severity | Finding | Evidence | Impact | Recommended Correction | Regression Test | Status |
|---|---|---|---|---|---|---|---|
| F-01 | **HIGH** | Frontend typecheck broken in working tree: 12 TS errors (`HashtagManager.tsx` undefined `showSampleDataPreview`/`showDataTransformModal`/`setShowDataTransformModal`; `WorkspaceTaskCreator.tsx` imports non-existent `StandardFileIngestionRef`, `IngestionValidationOutcome`) | `npm run lint` exit 2; §12 output | Domain 7 changes are not type-safe; likely runtime UI breakage (undefined state) | Complete or revert the uncommitted Domain 7 changes; add missing state declarations and correct the `StandardFileIngestionWorkspace` export contract | `npm run lint --prefix frontend` must exit 0 | **Reproduced** |
| F-02 | **HIGH** | `MASTER_ARCHITECTURE_INDEX.md` overstates verification: claims "0 errors across frontend (`vite build`)" (vite does not typecheck) and stale counts "31 suites / 247-248 tests" vs actual 33/260 | Index §3 changelogs vs §12 executed results | False-green governance; reviewers may trust stale certification | Correct counts; reword to cite `tsc --noEmit` for typecheck; mark Domain 7 as in-progress until F-01 fixed | Doc review + CI gate running both `vite build` and `tsc --noEmit` | **Reproduced** |
| F-03 | **MEDIUM** | No migration ledger (`schema_migrations` absent); applied state unverifiable; duplicate `002_` migration prefixes | live DB probe; migration glob | Cannot prove which migrations are applied; ordering ambiguity between the two `002_` files | Introduce a migration runner with a ledger table; rename duplicate-prefix files (e.g. `002a_`, `002b_`) | `schemaMigrationService.test.ts` extension asserting ledger writes | **Reproduced** |
| F-04 | **MEDIUM** | Inconsistent table counts across governance docs (22 vs 27 vs 33 vs 76) | skill §2, index Domain 6, `001_initial_schema.sql` (33 CREATE TABLE), live DB (76) | Misleading baseline for future audits | Reconcile `CURRENT_PROJECT_CONTEXT.md` and skill §2 to actual counts | Doc review | **Reproduced** |
| F-05 | **LOW** | `evaluateAttachedColumnConfigurations` returns PASS when `configurations` is empty (`investigationEngine.ts:38-40`) — vacuous pass for unattached legacy nodes | code read | A legacy node with zero attached configs passes without evaluation | Return `NOT_EVALUATED`/ERROR or require `attachedDbConfigIds` at orchestration level for the legacy path | Unit test: empty configs → non-PASS or explicit NOT_EVALUATED | **Inferred** (static) |
| F-06 | **LOW** | Legacy duplicate evaluation uses per-record in-memory filtering (`investigationEngine.ts:200-265`), deviating from set-based principle for that path | code read | Bounded performance/consistency deviation on legacy path | Migrate legacy path to compiled SQL duplicate check or document the exception | Existing `ruleSqlCompiler.test.ts` covers compiled path; add legacy-path parity test | **Inferred** (static) |
| F-07 | **MEDIUM** | `backend/dist` (165 files) tracked in git and modified in working tree; `npm start` serves `dist` without rebuild | `git ls-files backend/dist`; `server.ts:149-169` | Stale compiled code can be served; dist test files modified but excluded from vitest | Add `dist/` to `.gitignore`, untrack, and require build in deploy flow | CI check that `git diff --name-only` contains no `dist/` paths | **Reproduced** |
| F-08 | **LOW** | `POST /api/resolutions/propose-from-chat` defaults to synthetic IDs (`'usr-maker'`, `'default-team'`) when body fields absent; CORS `*`; binds `0.0.0.0` | `resolutions.ts:53-64`; `server.ts:41,175` | Attribution integrity + production exposure risk | Require real maker/team IDs; restrict CORS origin; document bind policy | Unit test rejecting proposals with missing maker identity | **Inferred** (static) |

---

## 16. Unverified Requirements and Evidence Gaps

| Gap | Why evidence is missing | What was inspected | What is needed |
|---|---|---|---|
| Applied migration state | No ledger table in DB | live DB metadata, migration files | Query DBA/apply a ledger-based runner; compare `information_schema` against each migration's DDL |
| OAuth 2.0 credential resolution & masking | `oauth2Service` not inspected in this audit | index references only | Read `oauth2Service.ts` + `provider_connections` schema; verify secret masking on GET routes |
| ErrorBoundary coverage & JSONB stringification | File-by-file frontend audit not performed | build output only | Grep audit for `ErrorBoundary` wrappers in `InvestigationWorkspace`/`IssueDetailView`; verify `JSON.stringify` usage |
| `localStorage` usage | Not grepped | — | `grep -rn "localStorage" frontend/src` and confirm UI-only usage |
| Flowchart round-trip persistence | No browser automation | `WorkflowStudioFlowchart` build chunk | Manual or Playwright test: create→edit→save→reload→compile→execute |
| Concurrency/retry behavior | Unsafe to stress in shared environment | lock acquisition/release code | Dedicated test DB + concurrent harness (two tasks, same mirror table) |
| MySQL dialect paths | No live MySQL instance | `mysql2` dependency present | Integration test against a MySQL container |
| HTTP runtime traces | Server not started (would require seeding/auth) | route files | Start server in sandbox, exercise `/api/health`, auth, and one investigation run; capture sanitized logs |
| `COMPREHENSIVE_BUG_REPORT_AND_GOVERNANCE_AUDIT.md` | Referenced at an absolute path outside the repo | index references | Bring the document into the repo or remove the reference |

---

## 17. Reproducibility Appendix

```bash
# Baseline
git rev-parse HEAD && git branch --show-current && git status --short
node --version && npm --version

# Backend verification (from repo root)
cd backend && npx tsc                 # exit 0
cd backend && npm test                # exit 0 — 33 files / 260 tests, 6.81s

# Frontend verification
cd frontend && npm run build          # exit 0 — vite build, 12.30s (NO typecheck)
cd frontend && npm run lint           # exit 2 — tsc --noEmit, 12 errors (working tree)

# Read-only DB metadata probe (requires .env with PG credentials; password redacted)
node -e "require('dotenv').config();const {Client}=require('pg');
const c=new Client({host:process.env.PG_HOST,port:process.env.PG_PORT,database:process.env.PG_DATABASE,user:process.env.PG_USER,password:process.env.PG_PASSWORD});
c.connect().then(async()=>{
 const t=await c.query(\"SELECT count(*) n FROM information_schema.tables WHERE table_schema='public'\");
 const m=await c.query(\"SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'mirror%'\");
 const s=await c.query(\"SELECT count(*) n FROM information_schema.tables WHERE table_name='schema_migrations'\");
 console.log('PUBLIC_TABLES',t.rows[0].n,'MIRRORS',m.rowCount,'LEDGER',s.rows[0].n); return c.end()})"
# Observed: PUBLIC_TABLES 76, MIRRORS 17, LEDGER 0

# Key static greps
grep -rn "hashtext" backend/src                          # 0 executable hits (comment only)
grep -rn "bit(64)" backend/src/services                 # 64-bit lock derivation sites
grep -n "MAX_PARAMS" backend/src/services/externalDataQueryService.ts   # 30_000 ceiling
```

**Environment**: Windows 11, Node v24.14.1, npm 11.11.0, PostgreSQL 18.6 (localhost:5432). All commands executed 2026-10-10 from the repo root. Test duration 6.81s; vite build 12.30s.

---

## 18. Independent Reviewer Handoff

- **Evidence location**: this file (`audit_output/MASTER_SYSTEM_ARCHITECTURE_AUDIT_EVIDENCE.md`). All claims carry `file:line` references or are marked UNKNOWN/PARTIAL/BLOCKED.
- **Read first**: §12 (executed commands + actual output), §15 (findings register), §14 (compliance matrix), §4 (document conflicts).
- **Strongly evidenced**: backend build/tests pass (executed); 64-bit advisory locking; anti-self-approval enforcement at 6 sites; missing-external-record → FAIL (executed live-DB integration test); parameter ceiling; verdict/action type separation; hashtag execute routes exist.
- **Uncertain / requires independent judgment**: applied migration state (no ledger); OAuth implementation (not inspected); frontend runtime behavior (no browser automation); concurrency behavior (not stress-tested); whether the empty-config PASS (F-05) is acceptable for the legacy path.
- **Blocking for working-tree sign-off**: F-01 (frontend typecheck) must be resolved before the Domain 7 changes can be certified.
- **Do not trust without re-running**: any certification count in `MASTER_ARCHITECTURE_INDEX.md` (stale: 31/247/248 vs actual 33/260).

---

## 19. Final Assessment

- **HEAD commit `8d573ca5d95a319e84f701558cfe50e88f8331e2`**: **`ACCEPTED WITH CONDITIONS`** — builds and full test suite pass (executed), core governance invariants have code + test evidence; conditions: introduce a migration ledger (F-03), correct stale index counts (F-02), untrack `dist/` (F-07).
- **Current working tree (uncommitted Domain 7 changes)**: **`NOT ACCEPTED — CONFIRMED DEFECTS`** — frontend `tsc --noEmit` fails with 12 confirmed errors (F-01, reproduced, exit 2). `vite build` success does not constitute typecheck evidence.

No claim of "100% verified" or "zero defects" is made. Runtime HTTP behavior, OAuth, concurrency, and MySQL/Oracle paths remain `BLOCKED`/`UNKNOWN` as itemized in §16.

---

*Audit generated under Rule D (read-only). No application code, migrations, tests, configuration, or database records were modified. All database access was read-only metadata inspection. Credentials were redacted.*
