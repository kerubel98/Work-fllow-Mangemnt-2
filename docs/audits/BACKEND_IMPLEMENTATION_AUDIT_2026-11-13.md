# BACKEND IMPLEMENTATION AUDIT — PHYSICAL CODE & LIVE DATABASE REALITY CHECK

**Audit Date**: 2026-11-13  
**Repository**: `c:\Users\hp\Downloads\opration-workflow-mangement1`  
**Scope**: `backend/` — Express API layer, PostgreSQL persistence layer, investigation/rule engine services, migration system, test suite, live `operational_workflow_db`  
**Audit Type**: Zero-assumption, physical code and live-database verification (AGENTS.md Rule 20 & 21; governance skill §5, §7.6)  
**Auditor**: OpenCode agent (`deepseek-v4.1-flash-free`)  
**Application Code Modified**: **None** (this audit is documentation and traceability only)  
**Overall Verdict**: ⚠️ **NOT CERTIFIED** — the backend contains genuinely strong reconciliation/pipeline engineering, but is currently blocked by **4 critical** security/credential/migration defects, **8 high**, **10 medium**, and **7 low** findings. Release sign-off is not supportable until Phase 0 (P0) items are remediated and re-verified.

---

## 1. Executive Summary

### 1.1 What was verified
The backend is a real, working system: the server is live on port `5002`, connected to PostgreSQL 18.6 (`operational_workflow_db`, 262 MB), serving 324 API endpoints across 22 route modules and 56,492 lines of TypeScript. The set-based reconciliation architecture described in `CURRENT_PROJECT_CONTEXT.md` is physically present and non-vacuous: parameterised tuple `IN` SQL with a 30,000-parameter guard, typed `UNLOGGED` mirror tables, 64-bit MD5-derived advisory locks in the staging/reversion/execution paths, verdict↔action separation with diagnostic taint, and Maker-Checker approval with a database-level `FOR UPDATE` lock and `makerId !== checkerId` enforcement were all confirmed in code and in live data (0 self-approved resolutions out of 5).

### 1.2 What blocks sign-off
| # | Blocking defect | Impact |
|---|---|---|
| 1 | **319 of 324 endpoints have no authentication middleware**; CORS is `origin: '*'`; `JWT_SECRET` has a hard-coded fallback | Any host on the LAN can CRUD database connections, execute queries, read mail, and approve resolutions |
| 2 | **The user credential model does not exist**: `users` has no `password_hash` column, registration discards the password, login only succeeds via dev preset passwords or the literal `admin123` backdoor | Production login is impossible; development login is a universal backdoor |
| 3 | **Maker-Checker is client-bypassable**: `/api/resolutions/review` uses `optionalAuth` and falls back to a body-supplied `checkerId`; `/propose` likewise accepts a body-supplied `makerId` | The four-eyes principle can be defeated with a single crafted JSON body |
| 4 | **The boot migration path ignores `schema_migrations` and swallows all DDL errors**, while the ledger-aware `runMigrations()` is never invoked anywhere | Silent schema drift; the "42 migrations applied" ledger is decorative |

### 1.3 What is genuinely strong (verified, not assumed)
- Tuple-based external querying is fully parameterised and refuses unrestricted table scans (`externalDataQueryService.ts:115-133, 501-514`).
- The new DAG pipeline enforces `ValidationResult` ≠ `PipelineAction` at every stage boundary, with `_isDiagnosticOnly` taint bypass downstream (`ExecutablePipeline.ts`, `ReconciliationEngine.ts:144`, `investigationEngine.ts:1432`).
- Diagnostic/circuit-breaker states (`PAUSED_DB_OFFLINE`, `CIRCUIT_BREAKER_PAUSED`, `DUPLICATE_EXTERNAL_MATCH`) are implemented, not aspirational.
- All 69 base tables have primary keys, 50 foreign keys exist, dataset orphans are zero, and mirror tables carry the standard `_task_id/_row_number/_batch_id/_rule_block_id` envelope plus indexes.
- 300 tests across 38 suites pass — **but only when run with the root workspace's Vitest 5.0.2**, not the backend's own pinned 5.0.0 (see BE-16).

---

## 2. Audit Method & Evidence Base

### 2.1 Inspection techniques used
1. **Static inspection** of every backend route module, service, migration, and type surface (targeted reads plus pattern censuses).
2. **Compilation gate**: `npx tsc --noEmit` (real output captured).
3. **Test execution**: `npx vitest run` with the backend-local binary, then with the root workspace binary.
4. **Live database interrogation**: direct `pg` queries against `operational_workflow_db` (table inventory, row counts, constraints, indexes, enum/status distributions, orphan detection, scope anomalies).
5. **Live runtime probe**: `GET http://localhost:5002/api/health` against the already-running server instance.
6. **Governance cross-check** against `AGENTS.md` Rules 1–23 and the `bo-operational-governance` skill invariants.

### 2.2 Environment facts
| Fact | Value |
|---|---|
| Node.js | v24.14.1 |
| npm | 11.11.0 |
| PostgreSQL | 18.6 (x86_64-windows) |
| Database size | 262 MB |
| Server port | 5002 (`0.0.0.0`) |
| Backend package manager | npm workspaces (`frontend`, `backend`) |
| Backend TS files | 56,492 lines |
| Route modules | 22 files, 11,264 lines, 324 endpoints |
| Service layer | 18,701 lines (`services/*.ts` + `services/pipeline/*.ts`) |
| Migrations | 42 `.sql` files (`001`–`041`, incl. `002b`) |
| Live health | `{"status":"OK","database":"PostgreSQL (operational_workflow_db)","uptimeSeconds":38682}` |

### 2.3 Live database census (executed 2026-11-13)
| Metric | Value |
|---|---|
| Total tables in `public` | 93 |
| Base (persistent) tables | 69 |
| `mirror_*` transient tables | 24 (19 `UNLOGGED`; 5 promoted to `LOGGED`) |
| Primary keys on base tables | 69/69 |
| Foreign keys | 50 |
| Indexes (total / on mirrors) | 304 / 95 |
| CHECK constraints | 13 |
| PostgreSQL ENUM types | 0 |
| `schema_migrations` rows | 42 |
| `users` | 12 |
| `teams` | 199 |
| `issues` | 719 |
| `task_dataset_transactions` | 6,281 |
| `investigation_tasks` | 3 |
| `investigation_transactions` | 10,001 |
| `investigation_external_mirror` | 10,000 |
| `database_validation_workflows` | 10 |
| `validation_boxes` | 5 |
| `database_connections` | 6 |
| `resolution_approval_requests` | 5 (all `APPROVED`) |
| `task_batch_heartbeats` | 559 (all older than 3 minutes) |
| `staged_messages` | 3,316 |
| `hashtag_execution_runs` | 18,159 |
| `workspace_setting_proposals` | 1,301 |
| `notifications` | 168 (144 unread) |

---

## 3. Backend Architecture Inventory (Physical)

| Layer | Physical implementation | Evidence |
|---|---|---|
| HTTP entry | Express 4.21.2, port 5002, `express.json({limit:'50mb'})`, request logger | `src/server.ts:38-51,175` |
| Route mounting | 22 routers mounted under `/api/*`; 51 endpoints in `database.ts`, 52 in `misc.ts`, 39 in `messages.ts` | `src/server.ts:54-76` |
| Auth middleware | JWT HS256 (`utils/auth.ts`), `requireAuth` / `optionalAuth` / `requireRole` / `requireApproved` implemented in `middleware/auth.ts` | `middleware/auth.ts:1-80` |
| Persistence | `repository.ts` delegates 100% to `postgresRepo.ts` (5,508 lines) | `store/repository.ts:14` |
| Pool | `pg.Pool`, max 25, 5s connect timeout | `config/postgres.ts:8-17` |
| Migrations | Boot-time re-execution of every `.sql` (no ledger); separate unused ledger runner | `config/postgres.ts:42-56`, `database/migrate.ts:16-55` |
| Rule compilation | `ruleSqlCompiler.ts` (535 lines) → `UPDATE mirror SET ... CASE WHEN` | `services/ruleSqlCompiler.ts:444-534` |
| Mirror provisioning | `mirrorTableManager.ts` typed `UNLOGGED` DDL + envelope columns | `services/mirrorTableManager.ts:83-186` |
| External querying | Parameterised tuple `IN`, ANSI quoting, 30k param guard | `services/externalDataQueryService.ts:63-133, 501-514` |
| Reconciliation (legacy) | `reconciliationService.ts` set-based `UPDATE ... FROM` + `DISTINCT ON` | `services/reconciliationService.ts:81-260, 277-394` |
| Reconciliation (new DAG) | `ExecutablePipeline` + `ReconciliationEngine` + `NextStageInputResolver` + `DbConfigValidationMethod` | `services/pipeline/*` |
| Orchestration | `investigationOrchestratorService.ts` (1,672 lines) — `executeViaNewPipeline` is the Phase-1 path | `services/investigationOrchestratorService.ts:49-52, 1155` |
| Liveness | 3-failure threshold, 30s cooldown, OPEN→HALF_OPEN→CLOSED | `services/dbLivenessService.ts:30-31,56-98` |
| Ingestion | 500-row batch envelopes, 1,000-row chunked inserts, coordinate columns | `services/datasetIngestionService.ts:64,94-101`; `store/postgresRepo.ts:621-678` |
| Rollback | Snapshot-based reversion with `task_revert_` advisory lock | `services/reversionService.ts:90-175` |
| Governance | Maker-Checker with `FOR UPDATE`, anti-self-approval, team match | `services/makerCheckerService.ts:122-238` |
| Realtime | SSE registry with 20s heartbeat | `services/events.ts:8-30`; `routes/events.ts:10-24` |

---

## 4. Governance Compliance Matrix

Legend: ✅ Compliant · 🟡 Partial · ❌ Non-compliant · n/a Not applicable to backend

| Rule | Subject | Status | Evidence |
|---|---|---|---|
| 1 | PostgreSQL as primary store | ✅ | `config/postgres.ts`, `store/repository.ts:14`; Mongo only as an optional external connector |
| 2 | Validation result ≠ pipeline action | ✅ | `types.ts:1122-1126`; `ExecutablePipeline.ts:238-265`; `reconciliationService.ts:167-176` |
| 3 | Lifecycle separation | 🟡 | Four lifecycles are typed separately, but `IssueStatus` and `TransactionInvestigationStatus` unions duplicate/merge casings (`types.ts:339-349, 1132-1148`) and live data has drifted (BE-11) |
| 4 | No hard-coded external tables | 🟡 | Core engine is configuration-driven; messaging/attachment services hard-code `team-settlement-01` and a seed mailbox (BE-25) |
| 5 | No unapproved infrastructure | ✅ | No Kafka/Redis/new brokers introduced; SSE + PostgreSQL only |
| 6 | Frontend fault tolerance | n/a | Out of scope (frontend audited separately) |
| 7 | Maker-Checker four-eyes | 🟡 | Service layer is correct; API layer allows identity spoofing (BE-03) |
| 8 | Universal hashtag traceability | ✅ | `hashtagService.ts` (841 lines), `026_universal_hashtag_engine.sql`, 18,159 execution runs |
| 9 | Tuple ingestion & key precedence | ✅ | `externalDataQueryService.ts:113-133`; override precedence at `:477-483` |
| 10 | 64-bit cryptographic advisory locks | 🟡 | Correct in task exec/revert/staging/intake/hashtag; **misused** in mirror DDL (BE-05) |
| 11 | Parameter bounds < 30,000 + ANSI quoting | ✅ | `externalDataQueryService.ts:501-514`; `quoteIdentifier` used for PG/MySQL |
| 12 | Diagnostic taint isolation | ✅ | `investigationEngine.ts:630,1052,1350,1432`; taint bypass in `reconciliationService.ts:168-191` |
| 13 | Task-scoped rollback isolation | 🟡 | No global table locks (good); but `revertTransaction` breaks transaction atomicity (BE-06) |
| 14 | Centralised OAuth 2.0 & secret masking | 🟡 | Masking implemented (`postgresRepo.ts:942`, `database.ts:432`, `messages.ts:737`); secrets stored in plaintext (BE-19) |
| 15 | Persistent presentation assets | ✅ | `presentation_assets/`, `build_presentation.py` retained |
| 16 | Viewport/scroll containment | n/a | Frontend scope |
| 17 | Data loss prevention / dry-run | 🟡 | No runtime blanket deletes; but repair scripts under `src/scripts/` perform unscoped persistent UPDATEs with inline credentials (BE-26) |
| 18 | Canonical `ValidationBoxType` | ✅ | `types.ts:1721`; live data: 3 `INGESTION_SEARCH`, 1 `CONDITION_CHECK`, 1 `RECONCILIATION`, 0 invalid |
| 19 | Team-scoped DB isolation | 🟡 | Entity FKs exist, but 2 connections have `scope='team'` with `team_id = NULL` (BE-20); no per-request authorisation enforcement (BE-01) |
| 20 | Evidence-based cross-layer state changes | ❌ | Status/enum drift across DB ↔ types ↔ UI filters (BE-11); dual task identity model (BE-12) |
| 21 | Four-tier DAG invariance | 🟡 | Pipeline builder preserves cardinality/aggregation (`routes/workflows.ts:134-151`); 1 workflow persisted with no `target_db_id`/`target_table` (BE-21) |
| 22 | Master architecture index & traceability | ✅ | `MASTER_ARCHITECTURE_INDEX.md` maintained; this audit registered under Domain 14 |
| 23 | No localStorage as primary store | ✅ (backend) | All business state persisted in PostgreSQL; no browser storage dependency in backend |

---

## 5. Findings Register

Severity definitions: **Critical** = exploitable now or blocks release; **High** = material correctness/security/operability defect; **Medium** = architectural debt or latent failure; **Low** = hygiene.

### 5.1 Critical

#### BE-01 — 319 of 324 API endpoints have no authentication
- **Evidence**: `src/server.ts:54-76` mounts routers with no global guard. Pattern census per route module: `database.ts` 51 endpoints / 0 auth references, `teams.ts` 29/0, `messages.ts` 39/0, `misc.ts` 52/3, `issues.ts` 17/0, `workflows.ts` 10/0, `issues`, `investigations`, `validationBoxes`, `transactionSettings`, `approvals`, `escalations`, `sandbox`, `metrics`, `events`, `ai`, `assetSharing`, `collaboration`, `organizations`, `workflowBundles`, `workspaceSettingsProposals` all 0. Also `cors({ origin: '*' })` (`server.ts:41`).
- **Impact**: Any device that can reach port 5002 can create/modify/delete database connections (`POST/PUT/DELETE /api/db/databases`), read table previews, execute free-form SQL through the sandbox, read all mail (`/api/messages/*`), mutate workflows, and drive the approvals API. This defeats Rules 7 and 19 regardless of service-layer correctness.
- **Remediation**: (a) Apply `requireAuth` globally via `app.use('/api', requireAuth)` with an explicit allow-list for `/api/auth/login`, `/api/auth/register`, `/api/health`; (b) add `requireApproved` to operational routers; (c) replace `origin:'*'` with an environment allow-list; (d) inject `req.user` identity into handlers instead of trusting `req.body.*Id`.

#### BE-02 — User credential model is absent; production login impossible, development login is a backdoor
- **Evidence**: live schema `users` columns are `id, username, email, role, is_approved, can_execute_select, can_execute_update, allowed_db_ids, created_at, permanent_team_id, share_workspace_with_team, workspace_oauth_config, display_name, avatar_url, phone, department, title, timezone, message_provider_settings, preferences, updated_at` — **no `password_hash`**. `routes/auth.ts:38-51` therefore always falls through to `PRESET_PASSWORDS` (`admin:admin123`, `kirubel_ops:ops123`, …) and `isDevBackdoor = password === 'admin123'`. Registration (`auth.ts:80-124`) destructures `password` but never hashes or stores it.
- **Impact**: In `NODE_ENV=production`, `expectedPass = null` and `isDevBackdoor = false`, so **every login fails**. In development, `admin123` authenticates as any existing username. `hashPassword`/`verifyPassword` (PBKDF2, `utils/auth.ts:20-42`) are implemented but unreachable because the column does not exist.
- **Remediation**: Add `password_hash VARCHAR(255)` via a new migration, persist `hashPassword(password)` on registration, require a password on registration, delete `PRESET_PASSWORDS` and the `admin123` backdoor, and refuse to boot when `NODE_ENV=production` and any account lacks a hash.

#### BE-03 — Maker-Checker identity is client-supplied (four-eyes bypass)
- **Evidence**: `routes/resolutions.ts:10-22` — `POST /propose` uses `optionalAuth` and `makerId: req.user?.id || req.body.makerId`; `routes/resolutions.ts:29-42` — `POST /review` uses `optionalAuth` and `checkerId: req.user?.id || req.body.checkerId`. `POST /propose-from-chat` (`:53-78`) has no auth at all and defaults `teamId`, `makerId`, `makerName`.
- **Impact**: The service-level guard `proposal.maker_id === input.checkerId` (`makerCheckerService.ts:142-144`) only compares whatever the client sent. One caller can submit as `maker-1` and approve as `maker-2`, defeating Rule 7 and the 403 anti-self-approval contract. Live data shows 5/5 `APPROVED` and 0 self-approved rows, i.e. the guard works *when honest input is supplied* — the vulnerability is identity spoofing, not the comparison.
- **Remediation**: Require `requireAuth` on all three endpoints; derive `makerId`/`checkerId`/`teamId` exclusively from the verified JWT (reject body overrides with 400); authorise `teamId` against team membership.

#### BE-04 — Boot migration path bypasses the migration ledger and swallows failures
- **Evidence**: `config/postgres.ts:42-56` reads every `.sql` file and executes it on **every boot**, wrapping the whole loop in a single `try/catch` that only `console.warn`s. The ledger-aware runner exists (`database/migrate.ts:16-55`, `schema_migrations` + per-file transaction) but `grep` shows **no caller** anywhere in `src/`. `schema_migrations` holds 42 rows, so the ledger is populated but never consulted.
- **Impact**: (a) A partially failing migration is silently ignored and the process continues with a drifted schema; (b) destructive/non-idempotent statements in a future migration would re-execute on every restart; (c) there is no mechanism to detect or repair drift.
- **Remediation**: Call `runMigrations()` from `startServer()` and remove the DDL loop from `connectPostgres()`; make migration failure fatal in production; add a drift check comparing `schema_migrations` to the file list at boot.

#### BE-05 — `pg_advisory_xact_lock` used outside a transaction (no DDL protection)
- **Evidence**: `services/mirrorTableManager.ts:92-99` calls `queryPg('SELECT pg_advisory_xact_lock(...)')` on the pool, then performs the `information_schema` check and `CREATE UNLOGGED TABLE` in separate pool queries (`:102-168`). A transaction-scoped advisory lock acquired outside an explicit transaction is released at statement end, so it protects nothing.
- **Impact**: Concurrent provisioning of the same mirror table (two tasks starting together, or boot + first request) can race on DDL, producing duplicate-object errors that are then swallowed by the empty `catch {}` at `:119, 123, 182`. This directly contradicts the Rule 10 intent and the skill's §3.11.
- **Remediation**: Reuse the correct pattern already present in `stagingService.ts:32-42` — `pool.connect()` → `BEGIN` → `pg_advisory_xact_lock($1::bigint)` → DDL → `COMMIT` — and delete the silent catches around the DDL block.

### 5.2 High

#### BE-06 — `revertTransaction` executes `BEGIN`/`COMMIT` on the pool, not a client
- **Evidence**: `services/reversionService.ts:218` `await pool.query('BEGIN;')`, followed by `pg_advisory_xact_lock` (`:220-223`), `UPDATE` (`:225`), `INSERT` (`:250`) and `COMMIT` (`:257`) all on `pool.query`. This is the **only** occurrence of the anti-pattern in the codebase; the other 16 transaction blocks correctly use `client.query`.
- **Impact**: Each `pool.query` may run on a different pooled connection. The `UPDATE` is autocommitted, the advisory lock is not held across the mutation, `COMMIT` applies to an unrelated (possibly rolled-back) statement, and on error the `ROLLBACK` at `:259` cannot undo the already-committed row change. A single-transaction rollback can therefore half-apply, which is precisely the failure mode Rule 13 exists to prevent.
- **Remediation**: Convert to the `revertTask` pattern (`:118-174`): one `pool.connect()`, `BEGIN`, `pg_advisory_xact_lock`, mutations, `COMMIT`, `ROLLBACK` on error, `release()` in `finally`. Add a regression test asserting rollback atomicity under an injected failure.

#### BE-07 — Dual, disjoint task identity systems (`issues` vs `investigation_tasks`)
- **Evidence**: `issues` = 719 rows; `investigation_tasks` = 3 rows; the intersection of their IDs is **0** (both directions). `investigation_transactions.task_id` FK targets `investigation_tasks(id)` (`investigation_transactions_task_id_fkey`), yet the day-to-day case model, dataset ingestion and `GET /api/issues/:id/transactions` are keyed on `issues(id)`. `task_dataset_transactions.task_id` FKs to `issues(id)`. Result: all 10,001 `investigation_transactions` rows are unrelated to any `issues` row.
- **Impact**: Reconciliation results, Maker-Checker locks (`UPDATE investigation_transactions WHERE task_id = $1` from an issue-scoped route) and case lifecycle operate on different identity spaces. A resolution proposed against an `issues.id` matches zero `investigation_transactions` rows and silently no-ops (the failure is swallowed at `makerCheckerService.ts:98-100`). Reporting joins across the two models are impossible without a mapping table.
- **Remediation**: Decide the canonical task identity (recommend `issues.id` as the aggregate root, with `investigation_tasks` demoted to an execution record carrying `issue_id`), add the FK, backfill, and add a startup invariant check. This is an architecture decision requiring approval (Rule 20 Phase 3–4) — do not migrate blindly.

#### BE-08 — `IssueStatus` drift across types, database, and route logic
- **Evidence**: `types.ts:339-349` declares `'Open' | 'Investigating' | 'Resolved' | 'Closed' | 'Escalated' | 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED' | 'ESCALATED'` (title-case and upper-case duplicates in one union). Live `issues.status` distribution: `Open` 621, `IN_PROGRESS` 89, `Investigating` 6, `Closed` 1, `ESCALATED` 1, `OPEN` 1 — note `IN_PROGRESS` is **not in the union at all**, and `Resolved` / `Under Testing` are absent from data. `routes/teams.ts:501` compares an `IssueStatus` against `'ESCALATED'` on a `'To Do' | 'In Progress' | 'Done'` team-task union, which `tsc` flags as an impossible comparison.
- **Impact**: Kanban grouping, KPI counts, SLA sweeps and the boot orphan sweeper (`server.ts:118-128`, which filters `status = 'In Progress'`) each operate on a different casing set. 95 rows are in an "in progress"-family state but only some match sweeper/SLA predicates.
- **Remediation**: Define one canonical union (upper snake case), add a DB `CHECK` constraint, normalise existing rows in a versioned migration, and update every filter (`teams.ts`, `analyticsService.ts`, boot sweeper, escalation logic) in the same change set.

#### BE-09 — In-memory mock store is still wired into live routes
- **Evidence**: `routes/database.ts:5` imports `store` from `store/dataStore.ts`; `POST /api/db/mongo/query` (`database.ts:189-211`) returns seeded `store.users` / `store.issues` / `store.databases` documents whenever Mongo is not connected (it is not). `routes/transactionSettings.ts:18-42` reads and mutates `store.globalSchema` in memory before persisting. `routes/issues.ts:384-400` auto-creates a missing issue from `store.issues`. `services/globalSchemaDiscoveryService.ts:8` also reads `store`.
- **Impact**: Responses can be fabricated seed data presented as operational data (Rule 20 evidence violation), and mutations can succeed in memory while failing to persist, producing "green" UI states over empty tables.
- **Remediation**: Delete `dataStore.ts` mock collections and route fallbacks; return `501 NOT_IMPLEMENTED` or an explicit empty result with provenance metadata where a connector is unconfigured; keep only seed constants that `seedPostgres.ts` genuinely needs.

#### BE-10 — TypeScript build is failing
- **Evidence**: `npx tsc --noEmit` (backend) exits non-zero with 7 errors:
  - `src/routes/misc.ts(364,34)` and `(368,54)`: `HashtagPreset | null` passed where `HashtagPreset` expected.
  - `src/routes/teams.ts(501,55)`: impossible comparison between `'To Do' | 'In Progress' | 'Done'` and `'ESCALATED'`.
  - `src/store/postgresRepo.ts(3398,93)` and `(3426,40)`: `Cannot find name 'HashtagCollectedTransaction'`.
  - `src/services/__tests__/technicianSolutionFlow.test.ts(16,9)`, `(113,11)`, `(131,35)`: invalid priority literal and unknown `fileSchemaName` property.
- **Impact**: `npm run build` cannot produce `dist/`; deployment relies on `tsx` transpile-only execution, so type drift is invisible at runtime. `HashtagCollectedTransaction` missing means the collected-transaction feature path is not type-safe.
- **Remediation**: Import/define `HashtagCollectedTransaction` in `postgresRepo.ts`, null-guard the preset lookups, fix the team-task status union or the comparison, and correct the test fixtures. Gate CI on `tsc --noEmit`.

#### BE-11 — The documented test command is broken (`npm test` executes zero tests)
- **Evidence**: `cd backend && npx vitest run` → `38 failed (38)`, `Tests no tests`, every suite failing at the `describe(` line with `TypeError: Cannot read properties of undefined (reading 'config')`. A trivial one-line smoke test fails identically, so this is environmental, not a defect in the suites. Backend pins `vitest ^5.0.0` (installed 5.0.0); the workspace root has 5.0.2. Running `./node_modules/.bin/vitest run --root backend` (5.0.2) yields **38 passed / 300 passed**.
- **Impact**: `MASTER_ARCHITECTURE_INDEX.md:435,443` assert "`npm test --prefix backend` (300/300 passed)". That claim is not reproducible with the documented command — a false-green certification vector under Rule 21. Any future regression will be invisible to whoever runs the documented command.
- **Remediation**: Align the backend's Vitest/Vite versions with the working root combination (or hoist a single version), add `npm test` to CI with a non-zero-test guard, and re-establish the 300/300 baseline.

#### BE-12 — `SQL_CONDITION` sanitiser blacklist is incomplete (arbitrary function execution)
- **Evidence**: `services/ruleSqlCompiler.ts:44-69` blocks `;`, comments, DDL/DML, `UNION`, `SELECT`, `EXEC`, `PG_SLEEP`, `PG_TERMINATE_BACKEND`, `PG_CANCEL_BACKEND`, `CURRENT_SETTING`, `SET_CONFIG`, `INTO/COPY/LOAD`. It does **not** block `pg_read_file`, `pg_ls_dir`, `lo_import`, `pg_read_binary_file`, `dblink`, `current_user`, `version()`, `information_schema`, or `pg_catalog`. The predicate is then interpolated directly into a set-based `UPDATE` (`:265-271`), executed against the primary database as the `postgres` superuser (`config/postgres.ts:12`).
- **Impact**: A user who can save a workflow (no auth — see BE-01) can express a condition that reads server files or exfiltrates catalogue data into `_validation_details`. Regex-based rules also allow catastrophic backtracking (`REGEX_MATCH`, `:259-262`).
- **Remediation**: Replace blacklisting with a whitelist grammar (identifier, literal, comparison operator, `AND/OR/NOT`, a fixed function allow-list), reject any `(` preceded by a non-allow-listed name, run compiled rules under a least-privilege DB role, and add `statement_timeout` to the rule execution transaction.

### 5.3 Medium

| ID | Finding | Evidence | Remediation |
|---|---|---|---|
| BE-13 | Multi-match external rows collapse non-deterministically in the legacy reconciler (no duplicate flag / no `DISTINCT ON`) | `reconciliationService.ts:194-205` LEFT JOINs `investigation_external_mirror` on a business key; multiple matches silently pick an arbitrary row | Add `DISTINCT ON` plus `_discrepancyFlag='DUPLICATE_EXTERNAL_MATCH'` / `_matchCount` (pattern already exists at `externalDataQueryService.ts:339-372`) |
| BE-14 | `reconcileByRowNumber` swallows all errors and returns zeros | `reconciliationService.ts:389-392` `catch → console.warn`, returns `totalUpdated: 0` (an ERROR verdict is never emitted); pass/fail counts at `:370-376` aggregate the whole task, not the batch | Re-throw or emit `ERROR`/`PAUSED_DB_OFFLINE` per Rule 2; scope counts by `batch_id` |
| BE-15 | Ingestion performs one central-repository query per row (N+1) | `datasetIngestionService.ts:121-149` inside a per-row loop; 6,281 rows today, 500-row batching exists for inserts only (`postgresRepo.ts:634-660`) | Batch `getCentralTransactionsByKeys(keys[])` with `WHERE key = ANY($1)` and dedupe in memory |
| BE-16 | Team-scoped connections with no owning team | Live: `db-1793866908733`, `db-1793869456217` have `scope='team'`, `team_id=NULL`, violating the User→Team→Connection chain (Rule 19) | Add `CHECK (scope <> 'team' OR team_id IS NOT NULL)`; migrate offending rows after provenance review |
| BE-17 | No DB-level lifecycle invariants | 13 CHECK constraints, 0 ENUM types across 69 tables; `final_result`/`investigation_status`/`status` are free-text `VARCHAR` | Introduce CHECK constraints (or domains) for the four lifecycle state sets; reject unknown values at write time |
| BE-18 | Unbounded pagination | `routes/issues.ts:223-225` accepts `limit` from the query string with no cap before `repo.getTaskDatasetTransactions` | Clamp `limit` to e.g. 500 and validate `page ≥ 1` |
| BE-19 | Credentials at rest are plaintext | `database_connections.password` holds raw values; masking exists only on read (`postgresRepo.ts:942`, `database.ts:432`); `src/scripts/*.mjs` embed `postgres:123456` | Encrypt with a KMS/env key (AES-256-GCM), decrypt only in the connector, rotate existing secrets, purge inline credentials from scripts |
| BE-20 | Legacy and new execution engines coexist | `investigationEngine.ts` (1,735 lines) is still imported by `routes/investigations.ts:9` and `routes/validationBoxes.ts:255` while `executeViaNewPipeline` is the declared Phase-1 path (`investigationOrchestratorService.ts:49-52`) | Declare one engine of record; reduce the other to a thin adapter or delete it with tests migrated |
| BE-21 | Workflow persisted without pipeline scope | Live: `wf-bridge-test-1790975134569` ("work flloq test") has `target_db_id=NULL`, `target_table=''` (1 of 10 workflows) — violates Rule 21 | Enforce `targetDbId`/`targetTable` at `POST/PUT /api/workflows`; data-fix the row only after confirming it is test residue with the owner |
| BE-22 | Mirror DDL errors are silently swallowed and caching hides drift | `mirrorTableManager.ts:119,123,182` empty catches; 30-minute `tableCache` (`:20-35`) skips column re-checks | Log at `error` with the mirror name, remove empty catches, shorten TTL or re-validate on schema-change events |
| BE-23 | Unbounded operational log growth, no retention policy | `hashtag_execution_runs` 18,159, `staged_messages` 3,316, `workspace_setting_proposals` 1,301, `notifications` 168, 24 mirror tables | Add time-based archival/partitioning jobs and a documented retention window per table |

### 5.4 Low

| ID | Finding | Evidence |
|---|---|---|
| BE-24 | No global Express error handler or 404 handler; 36 empty `catch {}` blocks | `server.ts` (no `app.use((err,req,res,next))`); census of `catch {}/catch (e) {}` = 36 |
| BE-25 | Hard-coded tenant/mailbox defaults in messaging | `messaging/stagingService.ts:69`, `attachmentParserService.ts:366-382`, `messageIntakeService.ts:472,511,1310,1369` (`team-settlement-01`, `settlement-support@corporatebank.com`) |
| BE-26 | Ad-hoc repair/debug scripts under `src/scripts/` mutate persistent data with inline credentials | `src/scripts/sanitize_all_wfs.mjs:5-7` (`postgresql://postgres:123456@…`), unscoped `UPDATE database_validation_workflows SET steps=…` at `:33`; `sanitize_wf.mjs:35` |
| BE-27 | JWT hardening gaps | `utils/auth.ts:3` hard-coded `JWT_SECRET` fallback; 24h expiry, no refresh, no revocation, no rate limiting on `/api/auth/login` |
| BE-28 | Logging hygiene | `server.ts:46-51` logs full URLs including query strings; no request IDs, no PII redaction, `console.warn` used for migration/DDL failures |
| BE-29 | Advisory-lock derivation uses MD5 instead of a keyed/CSPRNG function | `mirrorTableManager.ts:58-60`, `reversionService.ts:122`, `stagingService.ts:41` — collision-resistant enough for lock keys, but not "cryptographic" as Rule 10 states |
| BE-30 | Mirror/ index identifier truncation risk | `mirrorTableManager.ts:62-77` truncates table names to 50/63 chars and derived index names (`idx_${mirrorName}_context`) can exceed PostgreSQL's 63-byte limit for long external names |

### 5.5 Data-quality observations (evidence, not defects by themselves)

| Observation | Value | Note |
|---|---|---|
| Duplicate team names | 188 rows named `Mailbox Test Ops Team` (created 2026-09-27 → 2026-11-13) | Test residue accumulating in a persistent table; requires provenance review before any cleanup (Rule 17/19) |
| Stale heartbeats | 559/559 `task_batch_heartbeats` older than 3 minutes | Expected if no batch is running; confirms the boot sweeper's 3-minute threshold is the only guard |
| Stuck investigations | 5,000 rows `NOT_EVALUATED` / `IN_PROGRESS`; 5,001 `PASS` / `VERIFIED_MATCH` | 50% of the transaction ledger has no verdict — cohort is likely the first `inv-1788618299033-6rml` batch |
| All resolutions approved | 5 `APPROVED`, 0 rejected, 0 self-approved | Anti-self-approval holds on honest input; no rejection path has ever been exercised in this dataset |
| Orphan dataset rows | 0 (FK `ON DELETE CASCADE` works) | Positive control |
| Orphan investigation rows | 10,001 relative to `issues` | Consequence of BE-07 |
| Workflow scoping | 9/10 scoped, 1 unscoped | BE-21 |

---

## 6. Security Audit Summary

| Control | Status | Notes |
|---|---|---|
| Transport/route authentication | ❌ | BE-01 |
| Credential storage | ❌ | BE-02 (column absent), BE-19 (plaintext DB secrets) |
| Token integrity | 🟡 | HMAC-SHA256 with `timingSafeEqual`; secret falls back to a source-embedded constant (`utils/auth.ts:3,119`) |
| Authorisation / RBAC | 🟡 | `requireRole`/`requireApproved` exist but are applied only in `auth.ts`, `resolutions.ts`, `misc.ts` |
| Four-eyes separation | 🟡 | Service correct, transport spoofable (BE-03) |
| SQL injection (external queries) | ✅ | Parameterised tuple `IN`, ANSI quoting, unrestricted-scan refusal |
| SQL injection (rule predicates) | ❌ | BE-12 |
| Credential masking in responses | ✅ | `postgresRepo.ts:942`, `database.ts:432`, `messages.ts:737,785,833` |
| Secret redaction in logs | 🟡 | No redaction layer; full URLs logged (BE-28) |
| Rate limiting / brute-force protection | ❌ | Absent on `/api/auth/login` |

---

## 7. Performance & Scalability Audit

| Area | Assessment | Evidence |
|---|---|---|
| Set-based reconciliation | Strong: single `UPDATE ... FROM` per batch, no per-row Node loops in the new pipeline | `ruleSqlCompiler.ts:503-526`, `reconciliationService.ts:304-365` |
| External query batching | Strong: parameter ceiling respected, sub-chunked | `externalDataQueryService.ts:501-514` |
| Dataset ingestion | Mixed: inserts chunked at 1,000 rows, but central dedupe is N+1 | `postgresRepo.ts:634-660` vs `datasetIngestionService.ts:121-149` |
| Pagination | Thin-client pagination present; `limit` unbounded | `routes/issues.ts:221-239` |
| Mirror indexes | Good: 4 indexes per mirror, 95 total | `mirrorTableManager.ts:162-165` |
| Long transactions | None observed at audit time | `pg_stat_activity` idle-in-transaction: empty |
| Pool sizing | 25 connections per process; external pools also 25 (`dbConnectionManager.ts:392`) | Risk of connection amplification across many external DBs |
| Retention | No archival strategy | BE-23 |

---

## 8. Build, Test, and Runtime Verification

| Gate | Command | Result |
|---|---|---|
| Type check | `cd backend && npx tsc --noEmit` | ❌ 7 errors / 4 files (BE-10) |
| Backend build | `npm run build` (→ `tsc`) | ❌ Cannot emit `dist/` because of BE-10 |
| Documented test | `cd backend && npx vitest run` | ❌ 38/38 suites fail to load (BE-11) |
| Working test | `./node_modules/.bin/vitest run --root backend` | ✅ 38 suites / 300 tests passed in 5.72s |
| Test vacuity scan | grep for `it.skip`, `describe.skip`, `expect(true).toBe(true)`, `if (!isPostgresConnected) return` | ✅ None found — assertions are live |
| Live health | `GET http://localhost:5002/api/health` | ✅ `status OK`, PostgreSQL connected, uptime 38,682s |
| Live schema | `information_schema` / `pg_catalog` census | ✅ 93 tables, 69/69 base PKs, 50 FKs, 0 orphan dataset rows |
| Live enum sanity | `validation_boxes.box_type` | ✅ 0 invalid values |
| Live governance data | `resolution_approval_requests` | ✅ 0 self-approved (`checker_id = maker_id`) |

**Conclusion on false-green risk**: the 300/300 claim is *substantively* true but *procedurally* unreproducible via the documented command. Under Rule 21 a claim that cannot be reproduced by the documented command must be re-earned, not assumed.

---

## 9. Verified Strengths (do not regress these)

1. **Verdict/action separation is real** — `ValidationResultStatus` and `PipelineAction` are distinct types (`types.ts:1122-1126`) and distinct columns (`final_result`, `final_action`), and the pipeline halts on `STOP`/`CLOSE` while continuing on `FAIL + CONTINUE` with taint.
2. **Diagnostic taint works end-to-end** — set in `investigationEngine.ts:1432`, honoured in SQL at `reconciliationService.ts:168-191`, surfaced as `DIAGNOSTIC_BYPASSED`.
3. **Parameter safety** — 30,000-parameter ceiling, dynamic sub-chunking, ANSI identifier quoting, and a hard refusal to run an unrestricted scan (`externalDataQueryService.ts:122-124`).
4. **Governance locking is mostly correct** — task execution (`investigationOrchestratorService.ts:1292`/`1484` session lock with `finally` unlock), reversion (`reversionService.ts:122`), staging (`stagingService.ts:41`), intake (`messageIntakeService.ts:128`) all use dedicated clients with `BEGIN`; only the mirror DDL path is wrong (BE-05).
5. **Reboot safety** — precision sweeper only fails tasks whose heartbeat is older than 3 minutes (`server.ts:114-136`).
6. **Maker-Checker row locking** — `SELECT ... FOR UPDATE` + explicit column projection + team match + rejection reason requirement (`makerCheckerService.ts:131-181`).
7. **Relational integrity** — 69/69 base tables have primary keys; 50 FKs; `task_dataset_transactions` has zero orphan rows.

---

## 10. Remediation Roadmap

### Phase 0 — Release blockers (target: 1 sprint, no feature work in parallel)

| ID | Action | Acceptance criterion |
|---|---|---|
| P0-1 | Global `requireAuth` + CORS allow-list + identity from JWT only | Unauthenticated `GET /api/db/databases` → 401; body-supplied `makerId`/`checkerId` → 400 |
| P0-2 | `password_hash` migration + registration hashing + remove preset/backdoor | Production login works for a newly registered account; `admin123` rejected in all modes |
| P0-3 | Route-resolution identity hardening (`resolutions.ts`) | Two distinct JWTs required to approve; same JWT → 403 (existing test extended) |
| P0-4 | Use `runMigrations()` at boot; make failures fatal | Kill a migration mid-file → boot aborts with the failing filename |
| P0-5 | Fix mirror DDL advisory lock to a real transaction | Concurrency test spawning two `ensureMirrorTableExists` calls → exactly one `CREATE`, no swallowed error |
| P0-6 | Fix `revertTransaction` to a single client transaction | Injected mid-rollback failure → row unchanged, lock released |
| P0-7 | Restore `tsc --noEmit` to 0 errors | CI fails on any type error |
| P0-8 | Align Vitest versions; enforce non-zero test count | `npm test --prefix backend` → 38 suites / 300+ tests, exit 0 |

### Phase 1 — Correctness & domain integrity

- BE-07 canonical task identity decision (requires explicit approval before migration).
- BE-08 canonical `IssueStatus` + CHECK constraint + data normalisation in one migration.
- BE-12 `SQL_CONDITION` whitelist grammar + least-privilege execution role + `statement_timeout`.
- BE-13/BE-14 reconciliation determinism and error propagation.
- BE-09 remove in-memory mock fallbacks from live routes.

### Phase 2 — Security depth & data protection

- BE-19 AES-256-GCM encryption for connection secrets + rotation plan.
- BE-16 connection ownership CHECK constraint + provenance review of the 2 offending rows.
- BE-17 lifecycle CHECK constraints; BE-18 pagination clamp.
- BE-27 JWT rotation/expiry/rate limiting; BE-28 structured logging with redaction.

### Phase 3 — Debt, retention, and consolidation

- BE-15 batch central-repository dedupe; BE-20 single engine of record; BE-23 retention jobs; BE-25/BE-26 hard-coded tenant/credential removal; BE-29/BE-30 identifier hardening.

> ⚠️ **Data note (Rule 17/19)**: nothing in this audit authorises deletion of the 188 duplicate teams, 3,316 staged messages, 18,159 hashtag runs, or the unscoped workflow. Any cleanup must follow IDENTIFY → SELECT → VERIFY provenance → DRY RUN → REPORT → APPROVAL → DELETE → VERIFY.

---

## 11. Re-Verification Protocol

Run after each phase and attach output to the acceptance report:

```bash
# 1. Type gate
cd backend && npx tsc --noEmit                       # expect: no output, exit 0

# 2. Test gate (must be the same binary the docs reference)
cd backend && npm test                               # expect: 38+ suites, 300+ tests, exit 0

# 3. Auth gate (must all be 401 without a token)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5002/api/db/databases
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5002/api/teams
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5002/api/workflows

# 4. Anti-self-approval gate (same token → 403)
#    POST /api/resolutions/propose then POST /api/resolutions/review with the same JWT

# 5. Migration gate
#    Introduce a deliberately failing .sql, restart, expect non-zero exit + filename in stderr

# 6. Live integrity gate (via a read-only pg probe)
#    - base tables without PK = 0
#    - task_dataset_transactions orphans = 0
#    - resolution_approval_requests where checker_id = maker_id = 0
#    - validation_boxes.box_type NOT IN (4 canonical) = 0
#    - database_connections where scope='team' AND team_id IS NULL = 0
#    - issues.status outside canonical set = 0
```

**Sign-off rule (Rule 21)**: no phase may be marked complete on the basis of a claim; each gate above must be executed and its raw output attached.

---

## 12. Architectural Change Summary / Revision Log

| Date | Scope | Rationale | Physical code impact |
|---|---|---|---|
| 2026-11-13 | Full backend implementation audit (routes, services, persistence, migrations, tests, live DB) | User request: "analyse the backend implementation and prepare audit document". Required by Rule 22 to register a verification audit in the master index | **None** — documentation and traceability only. Temporary read-only probe scripts created for interrogation were deleted after use; no schema, row, or source file was modified |

---

## 13. References

**Governing documents**
- [AGENTS.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) — Rules 1–23
- [bo-operational-governance skill](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md) — invariants §3, workflow §5, doc hub §7
- [CURRENT_PROJECT_CONTEXT.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/CURRENT_PROJECT_CONTEXT.md) — architecture baseline
- [MASTER_ARCHITECTURE_INDEX.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md) — entry point (this audit registered as Domain 14)

**Backend surfaces inspected**
- [server.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/server.ts)
- [config/postgres.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/config/postgres.ts)
- [database/migrate.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrate.ts)
- [middleware/auth.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/middleware/auth.ts) · [utils/auth.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/utils/auth.ts)
- [routes/auth.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/auth.ts) · [routes/resolutions.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/resolutions.ts) · [routes/issues.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/issues.ts) · [routes/database.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/database.ts)
- [services/makerCheckerService.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/makerCheckerService.ts)
- [services/ruleSqlCompiler.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts)
- [services/mirrorTableManager.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/mirrorTableManager.ts)
- [services/externalDataQueryService.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/externalDataQueryService.ts)
- [services/reconciliationService.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/reconciliationService.ts)
- [services/reversionService.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/reversionService.ts)
- [services/datasetIngestionService.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/datasetIngestionService.ts)
- [services/pipeline/ExecutablePipeline.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/pipeline/ExecutablePipeline.ts)
- [store/postgresRepo.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/store/postgresRepo.ts) · [store/repository.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/store/repository.ts) · [store/dataStore.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/store/dataStore.ts)
- [types.ts](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/types.ts)
- [001_initial_schema.sql](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrations/001_initial_schema.sql) … [041_enhanced_notification_system.sql](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrations/041_enhanced_notification_system.sql)

**Related audit lineage**
- [FRONTEND_DESIGN_IMPLEMENTATION_AUDIT_2026-11-12.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/FRONTEND_DESIGN_IMPLEMENTATION_AUDIT_2026-11-12.md) — frontend counterpart (FE-01 auth bypass corroborates BE-01)
- [INDEPENDENT_PHYSICAL_CODE_REAUDIT_2026.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/INDEPENDENT_PHYSICAL_CODE_REAUDIT_2026.md) — prior physical re-audit
- [MASTER_CONSOLIDATED_SYSTEM_AUDIT_2026.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_CONSOLIDATED_SYSTEM_AUDIT_2026.md) — consolidated system baseline
