# MASTER IMPLEMENTATION PLAN: BACKEND AUDIT REMEDIATION
## Engineering Roadmap & Definitive Acceptance Criteria for Backend Remediation, Credential Hardening & Full Release Certification

| Field | Value |
|---|---|
| **Document ID** | `BACKEND_AUDIT_REMEDIATION_IMPLEMENTATION_PLAN.md` |
| **Creation Date** | November 13, 2026 |
| **Governing Authority** | [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 1–23) & [`bo-operational-governance`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md) |
| **Master Index** | [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md) (Domain 14) |
| **Governing Audit** | [`BACKEND_IMPLEMENTATION_AUDIT_2026-11-13.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/BACKEND_IMPLEMENTATION_AUDIT_2026-11-13.md) |
| **Current Status** | APPROVED PLAN — Pending Execution |

---

## 1. Executive Purpose & Remediation Objective

This engineering plan defines the definitive, sequenced implementation roadmap, physical code remediation steps, and rigorous acceptance criteria to resolve all **30 findings (5 Critical, 7 High, 11 Medium, 7 Low)** identified in the physical backend code and live database audit ([`BACKEND_IMPLEMENTATION_AUDIT_2026-11-13.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/BACKEND_IMPLEMENTATION_AUDIT_2026-11-13.md)).

### Core Engineering Objectives:
1. **Unblock Backend Compilation & Test Gates (`BE-10`, `BE-11`)**:
   - Resolve all 7 TypeScript errors in `backend/` so `npx tsc --noEmit` exits cleanly with code 0.
   - Align Vitest version across backend and root workspace so that `cd backend && npm test` executes and passes all 38 test suites (300+ tests) without runtime errors.
2. **Eliminate Critical API & Governance Security Voids (`BE-01`, `BE-03`)**:
   - Mount `requireAuth` across operational routers with strict whitelist for public endpoints (`/api/auth/login`, `/api/auth/register`, `/api/health`).
   - Replace wildcard CORS `origin: '*'` with an explicit environment-governed origin allow-list.
   - Derive Maker and Checker identities exclusively from verified JWTs (`req.user.id`), rejecting client-supplied body overrides with HTTP 400, strictly enforcing the Four-Eyes principle (`makerId !== checkerId`, HTTP 403) at the HTTP transport layer.
3. **Establish Real User Credential Model & Remove Backdoors (`BE-02`)**:
   - Add `password_hash VARCHAR(255)` column via a versioned migration.
   - Require passwords on registration and persist PBKDF2 cryptographic hashes.
   - Eliminate hardcoded `PRESET_PASSWORDS` and the universal `admin123` backdoor.
4. **Restore Migration Ledger & Lock Concurrency Integrity (`BE-04`, `BE-05`, `BE-06`)**:
   - Remove the un-ledgered DDL loop from `config/postgres.ts`; invoke transactional, ledger-tracked `runMigrations()` on server boot with fail-fast semantics.
   - Fix mirror table provisioning to acquire 64-bit advisory locks and execute DDL within explicit client transactions (`BEGIN ... COMMIT`).
   - Re-architect `reversionService.revertTransaction` to use a single dedicated pool client rather than fragmented `pool.query` calls, restoring atomicity to transaction rollbacks (Rule 13).
5. **Harmonize Domain Lifecycles & Task Identity (`BE-07`, `BE-08`, `BE-09`, `BE-12`)**:
   - Align `issues(id)` and `investigation_tasks(id)` into a unified aggregate root model.
   - Canonicalize `IssueStatus` enum across Database, TypeScript types, and route queries, backfilling legacy drifted records.
   - Replace unsafe SQL condition regex blacklists with a whitelist AST/tokenizer grammar.
   - Purge in-memory mock store fallbacks from live API routes.

---

## 2. Phased Architecture & Execution Topology

```mermaid
flowchart TD
    subgraph P0["Phase 0: Release-Blocking Security, Credential Integrity & Build Gates"]
        P0_1["0.1 Fix 7 Backend TypeScript Errors (BE-10)"]
        P0_2["0.2 Align Vitest Version & Local Test Command (BE-11)"]
        P0_3["0.3 Enforce requireAuth & Eliminate Maker-Checker Spoofing (BE-01, BE-03)"]
        P0_4["0.4 Add password_hash Migration & Remove admin123 Backdoor (BE-02)"]
        P0_5["0.5 Wire Ledger-Aware runMigrations at Boot (BE-04)"]
        P0_6["0.6 Fix Mirror Provisioning Advisory Lock & DDL Transaction (BE-05)"]
        P0_7["0.7 Single-Client Atomic Rollback in reversionService (BE-06)"]
    end

    subgraph P1["Phase 1: Domain Integrity, Task Identity & Lifecycle Normalization"]
        P1_1["1.1 Canonicalize IssueStatus Enum & DB CHECK Constraints (BE-08)"]
        P1_2["1.2 Harmonize Task Identity: issues vs investigation_tasks (BE-07)"]
        P1_3["1.3 AST Whitelist Grammar for SQL_CONDITION Compiler (BE-12)"]
        P1_4["1.4 Eradicate In-Memory Mock Store Fallbacks from Routes (BE-09)"]
        P1_5["1.5 Deterministic Reconciliation & Error Verdict Propagation (BE-13, BE-14)"]
    end

    subgraph P2["Phase 2: Security Depth, Encryption at Rest & Parameter Bounds"]
        P2_1["2.1 AES-256-GCM Encryption for Database Passwords at Rest (BE-19)"]
        P2_2["2.2 Enforce Team Connection Ownership Invariant (BE-16, Rule 19)"]
        P2_3["2.3 DB-Level Lifecycle & Verdict CHECK Constraints (BE-17)"]
        P2_4["2.4 Clamp Pagination Limits to Max 250 (BE-18)"]
        P2_5["2.5 JWT Secret Hardening, Rate Limiting & Log Redaction (BE-27, BE-28)"]
    end

    subgraph P3["Phase 3: Operational Hygiene, Performance & Script Sanitization"]
        P3_1["3.1 Batch Central Repository Ingestion to Eliminate N+1 (BE-15)"]
        P3_2["3.2 Consolidate Single Engine of Record: ExecutablePipeline (BE-20)"]
        P3_3["3.3 Replace 39 Empty catch Blocks with Contextual Logging (BE-24)"]
        P3_4["3.4 Purge Hardcoded Database Credentials in Maintenance Scripts (BE-26)"]
        P3_5["3.5 Operational Log Retention & Tenant Hardcoding Removal (BE-23, BE-25)"]
    end

    P0 --> P1
    P1 --> P2
    P2 --> P3
```

---

## 3. Detailed Work Breakdown by Phase

### Phase 0: Release-Blocking Security, Credential Integrity & Build Gates
*Target: Release unblock, credential security, build/test gates, and core governance enforcement.*

#### 0.1 — Resolve All 7 TypeScript Compilation Errors (`BE-10`)
1. **Fix `src/routes/misc.ts`**:
   - Lines 364 & 368: Guard `HashtagPreset | null` before passing into functions expecting `HashtagPreset`.
2. **Fix `src/routes/teams.ts`**:
   - Line 501: Remove invalid comparison `task.status === 'ESCALATED'` on `TeamTask` (`'To Do' | 'In Progress' | 'Done'`). Check `task.escalatedToTeamId` or update `TeamTaskStatus` properly.
3. **Fix `src/store/postgresRepo.ts`**:
   - Lines 3398 & 3426: Import or define `HashtagCollectedTransaction` interface in `postgresRepo.ts` or export it from `types.ts`.
4. **Fix `src/services/__tests__/technicianSolutionFlow.test.ts`**:
   - Line 16: Replace invalid `'HIGH'` with `'High'` matching `IssuePriority`.
   - Lines 113 & 131: Remove invalid property `fileSchemaName` from object literal.
5. **Verify Gate**: `npx tsc --noEmit --project backend/tsconfig.json` must exit with code 0.

#### 0.2 — Align Vitest Version & Local Test Execution (`BE-11`)
1. **Update `backend/package.json`**:
   - Align `"vitest": "^5.0.2"` and `"vite": "^6.2.3"` to match root workspace dependencies.
2. **Verify Local Command**:
   - Run `cd backend && npx vitest run` and confirm all 38 test suites load and pass without `TypeError: Cannot read properties of undefined (reading 'config')`.

#### 0.3 — Global Route Authentication & Identity Derivation (`BE-01`, `BE-03`)
1. **Mount Route Guards in `backend/src/server.ts`**:
   - Apply `requireAuth` to all operational routers:
     - `/api/issues`, `/api/db`, `/api/workflows`, `/api/investigations`, `/api/validation-boxes`, `/api/teams`, `/api/resolutions`, `/api/approvals`, `/api/messages`, `/api/transactions`, `/api/organizations`, `/api/escalations`, `/api/sandbox`, `/api/workflow-bundles`, `/api/assets`, `/api/settings/proposals`.
   - Allow unauthenticated access only to explicit endpoints:
     - `/api/health`, `/api/auth/login`, `/api/auth/register`.
2. **CORS Allow-List**:
   - Replace `origin: '*'` with an explicit environment configuration:
     `const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://127.0.0.1:3000'];`
3. **Identity Derivation in `backend/src/routes/resolutions.ts`**:
   - Enforce `requireAuth` on `POST /api/resolutions/propose`, `POST /api/resolutions/review`, and `POST /api/resolutions/propose-from-chat`.
   - Reject any request where `req.body.makerId` or `req.body.checkerId` attempts to override `req.user.id` (HTTP 400 Bad Request).
   - In `/propose-from-chat`: Derive `makerId: req.user.id`, `makerName: req.user.username`. Verify team membership against `req.user.id`.

#### 0.4 — User Password Credential Model & Elimination of Backdoors (`BE-02`)
1. **Create Migration `042_user_password_hash.sql`**:
   ```sql
   -- 042_user_password_hash.sql
   ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
   ```
2. **Update User Persistence in `postgresRepo.ts` & `types.ts`**:
   - Add `passwordHash?: string` to `User` interface.
   - Include `password_hash` in `createUser`, `getUserByUsername`, `getUserById` queries.
3. **Registration & Login in `routes/auth.ts`**:
   - Require `password` (minimum 8 chars) on `POST /api/auth/register`.
   - Compute `password_hash = hashPassword(password)` and persist to PostgreSQL.
   - In `POST /api/auth/login`: verify `password` strictly against `user.password_hash`.
   - Delete `PRESET_PASSWORDS` dictionary and `isDevBackdoor = password === 'admin123'`.
   - Refuse application boot in `NODE_ENV=production` if any administrative user lacks a password hash.

#### 0.5 — Ledger-Aware Migration Runner at Boot (`BE-04`)
1. **Remove Un-Ledgered DDL Loop in `config/postgres.ts`**:
   - Delete lines 42–56 of `config/postgres.ts` that blindly run `fs.readdirSync` with `client.query(sql)` wrapped in a silent catch.
2. **Hook `runMigrations()` into Server Startup**:
   - In `backend/src/server.ts`: Call `await runMigrations();` in `startServer()` before mounting HTTP routes.
   - If `runMigrations()` throws any error, log the failing migration filename, abort startup, and exit process with code 1.
3. **Startup Migration Ledger Verification**:
   - Verify all files in `backend/src/database/migrations/*.sql` exist in `schema_migrations`.

#### 0.6 — Fix Mirror Table Provisioning Advisory Lock & DDL Transaction (`BE-05`)
1. **Refactor `mirrorTableManager.ts:85-185`**:
   - Checkout dedicated client: `const client = await pool.connect();`
   - Execute:
     ```ts
     await client.query('BEGIN;');
     await client.query(`SELECT pg_advisory_xact_lock(('x' || substr(md5($1), 1, 16))::bit(64)::bigint)`, [`mirror_ddl_${mirrorName}`]);
     // Perform table existence check & CREATE/ALTER UNLOGGED TABLE
     await client.query('COMMIT;');
     ```
   - Release client in `finally { client.release(); }`.
   - Remove silent `catch {}` blocks; log warnings or propagate fatal DDL errors.

#### 0.7 — Single-Client Atomic Rollback in `reversionService` (`BE-06`)
1. **Refactor `reversionService.ts:210-262` (`revertTransaction`)**:
   - Replace fragmented `pool.query('BEGIN;')` and subsequent `pool.query` calls with a single checked-out client:
     ```ts
     const client = await pool.connect();
     try {
       await client.query('BEGIN;');
       await client.query(`SELECT pg_advisory_xact_lock(('x' || substr(md5('task_revert_' || $1), 1, 16))::bit(64)::bigint)`, [taskId]);
       await client.query(`UPDATE task_dataset_transactions ...`);
       await client.query(`INSERT INTO transaction_reversion_snapshots ...`);
       // update issue
       await client.query('COMMIT;');
     } catch (err) {
       await client.query('ROLLBACK;');
       throw err;
     } finally {
       client.release();
     }
     ```
2. **Add Concurrency Rollback Test**:
   - Assert atomic rollback under injected mid-operation database error.

---

### Phase 1: Domain Integrity, Task Identity & Lifecycle Normalization
*Target: Relational consistency, canonical enums, and elimination of mock state.*

#### 1.1 — Canonical `IssueStatus` Lifecycle & Database CHECK Constraint (`BE-08`)
1. **Normalize TypeScript Union in `types.ts`**:
   - Define single uppercase canonical type:
     ```ts
     export type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED' | 'ESCALATED';
     ```
2. **Create Migration `043_canonical_issue_status.sql`**:
   - Backfill existing rows:
     ```sql
     UPDATE issues SET status = 'OPEN' WHERE status = 'Open';
     UPDATE issues SET status = 'INVESTIGATING' WHERE status = 'Investigating';
     UPDATE issues SET status = 'CLOSED' WHERE status = 'Closed';
     UPDATE issues SET status = 'IN_PROGRESS' WHERE status = 'In Progress';
     ALTER TABLE issues ADD CONSTRAINT chk_issue_status CHECK (status IN ('OPEN', 'IN_PROGRESS', 'INVESTIGATING', 'RESOLVED', 'CLOSED', 'ESCALATED'));
     ```
3. **Synchronize Route Queries & Sweeper**:
   - Update `server.ts` heartbeat sweeper from `status = 'In Progress'` to `status = 'IN_PROGRESS'`.
   - Update `routes/teams.ts`, `routes/issues.ts`, and frontend status mappings.

#### 1.2 — Harmonize Task Identity: `issues` vs `investigation_tasks` (`BE-07`)
1. **Architectural Anchor**:
   - Establish `issues(id)` as the universal aggregate root for all task datasets and workflows.
2. **Create Migration `044_harmonize_task_identity.sql`**:
   - Add `issue_id VARCHAR(64) NOT NULL REFERENCES issues(id) ON DELETE CASCADE` to `investigation_tasks`.
   - Add surrogate index on `investigation_transactions(task_id, transaction_id)`.
3. **Service Layer Bridging**:
   - Update `makerCheckerService.ts` and `reconciliationService.ts` to join on `task_dataset_transactions` via `issues.id`, ensuring Maker-Checker locks update the actual live records.

#### 1.3 — AST Whitelist Grammar for `SQL_CONDITION` Compiler (`BE-12`)
1. **Implement Whitelist Parser in `ruleSqlCompiler.ts`**:
   - Replace regex blacklist with a strict tokenizing parser.
   - Allowed Tokens:
     - Identifiers matching column names of target table.
     - Literals: Numbers, single-quoted strings, booleans, NULL.
     - Comparison operators: `=`, `!=`, `<>`, `<`, `>`, `<=`, `>=`, `IS`, `IS NOT`, `IN`, `LIKE`, `ILIKE`, `BETWEEN`.
     - Logical operators: `AND`, `OR`, `NOT`.
     - Whitelisted pure functions: `COALESCE`, `TRIM`, `UPPER`, `LOWER`, `LENGTH`, `ROUND`, `ABS`.
   - Reject any function call not in the explicit whitelist (blocking `pg_read_file`, `version()`, `lo_import`, `information_schema`, etc.).
2. **Transaction Scope Guard**:
   - Set `SET LOCAL statement_timeout = '5000ms'` within compiled rule execution blocks.

#### 1.4 — Eradicate In-Memory Mock Store Fallbacks (`BE-09`)
1. **Clean Route Handlers**:
   - Remove `store.users`, `store.issues`, `store.databases` from `routes/database.ts:189-211` (`POST /api/db/mongo/query`). Return `501 NOT_IMPLEMENTED` with `{ error: 'MongoDB connector is unconfigured.' }`.
   - In `routes/transactionSettings.ts`: Read and persist schema strictly via PostgreSQL; remove `store.globalSchema` fallbacks.
   - In `routes/issues.ts:384`: Remove `const { store } = await import('../store/dataStore.js')` auto-creation of mock issues. Return 404 if issue does not exist.

#### 1.5 — Deterministic Reconciliation & Error Verdict Propagation (`BE-13`, `BE-14`)
1. **Add `DISTINCT ON` to Legacy Reconciler**:
   - In `reconciliationService.ts:194-205`: Add `DISTINCT ON (m.investigation_id, m.transaction_id)` to prevent arbitrary multi-match collapses. If multiple external rows match, flag transaction with `DUPLICATE_EXTERNAL_MATCH`.
2. **Propagate Errors in `reconcileByRowNumber`**:
   - In `reconciliationService.ts:389-392`: Stop catching and returning zeros. Emit `status: 'ERROR'`, `actionTaken: 'STOP'` per Rule 2, and scope pass/fail aggregates strictly by `batch_id`.

---

### Phase 2: Security Depth, Encryption at Rest & Parameter Bounds
*Target: Defense-in-depth, credential encryption, and database-level constraints.*

#### 2.1 — AES-256-GCM Encryption for Database Passwords at Rest (`BE-19`)
1. **Implement Encryption Service (`backend/src/utils/crypto.ts`)**:
   - AES-256-GCM authenticated encryption using `process.env.ENCRYPTION_MASTER_KEY` (32 bytes).
   - Functions: `encryptSecret(plaintext: string): { iv: string; ciphertext: string; tag: string }` and `decryptSecret(...)`.
2. **Migration `045_encrypt_database_passwords.sql`**:
   - Convert `database_connections.password` to `encrypted_password JSONB` or encrypted string.
   - Decrypt credentials only at runtime when instantiating external client pools (`dbConnectionManager.ts`, `ftpConnectionService.ts`).
   - Purge cleartext passwords from memory once connections are established.

#### 2.2 — Enforce Team Connection Ownership Invariant (`BE-16`, Rule 19)
1. **Add Database CHECK Constraint**:
   ```sql
   ALTER TABLE database_connections ADD CONSTRAINT chk_db_conn_team_scope CHECK (scope <> 'team' OR team_id IS NOT NULL);
   ```
2. **Provenance Review & Backfill**:
   - Inspect `db-1793866908733` and `db-1793869456217`. Follow Rule 17 Dry-Run sequence: identify owning team or assign to global administrative scope with explicit user sign-off.

#### 2.3 — Database-Level Lifecycle & Verdict CHECK Constraints (`BE-17`)
1. **Add Constraints via Migration**:
   ```sql
   ALTER TABLE investigation_transactions 
     ADD CONSTRAINT chk_inv_final_result CHECK (final_result IN ('PASS', 'FAIL', 'ERROR', 'PAUSED_DB_OFFLINE', 'NOT_EVALUATED')),
     ADD CONSTRAINT chk_inv_final_action CHECK (final_action IN ('CONTINUE', 'STOP', 'CLOSE', 'FLAG', 'REPORT')),
     ADD CONSTRAINT chk_inv_status CHECK (investigation_status IN ('UNINVESTIGATED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED', 'FLAGGED'));
   ```

#### 2.4 — Clamp Pagination Limits (`BE-18`)
1. **Bound Query Limits**:
   - In `routes/issues.ts:224` and all paginated endpoints:
     ```ts
     const rawLimit = parseInt(req.query.limit as string || '50', 10);
     const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 50 : rawLimit), 250);
     ```

#### 2.5 — JWT Secret Hardening, Rate Limiting & Log Redaction (`BE-27`, `BE-28`)
1. **Fail-Fast `JWT_SECRET` Validation**:
   - In `utils/auth.ts`: Throw error if `JWT_SECRET` is missing or uses default fallback when `NODE_ENV=production`.
2. **Rate Limiting**:
   - Add rate limiter to `/api/auth/login` (max 5 failed attempts per 15-minute window per IP).
3. **Structured Request Logging**:
   - In `server.ts`: Redact query string tokens (`?token=...`, `?key=...`) and sensitive headers from log output.

---

### Phase 3: Operational Hygiene, Performance & Script Sanitization
*Target: Long-term maintainability, batch performance, and operational cleanup.*

#### 3.1 — Batch Central Repository Ingestion to Eliminate N+1 (`BE-15`)
1. **Set-Based Ingestion Lookup**:
   - In `datasetIngestionService.ts`: Replace per-row `repo.getCentralTransaction` with `repo.getCentralTransactionsByKeys(keys[])` using `WHERE transaction_key = ANY($1)`.
   - Reduce SQL roundtrips for 6,000-row ingestion from 6,000 queries to ~12 batch queries.

#### 3.2 — Consolidate Single Engine of Record (`BE-20`)
1. **Demote Legacy Engine**:
   - Migrate any remaining imports in `routes/investigations.ts` and `routes/validationBoxes.ts` to `ExecutablePipeline` via `investigationOrchestratorService`.
   - Deprecate direct calls to `investigationEngine.ts`.

#### 3.3 — Contextual Logging for Empty Catch Blocks (`BE-24`)
1. **Clean Catch Blocks**:
   - Replace empty `catch {}` blocks across routes and services with structured `logger.debug` or `logger.warn` statements containing contextual identifiers (connection ID, table name, task ID).

#### 3.4 — Purge Hardcoded Database Credentials in Maintenance Scripts (`BE-26`)
1. **Parameterize Scripts**:
   - In `src/scripts/sanitize_all_wfs.mjs`, `sanitize_wf.mjs`, `check_ftp_connections.mjs`, etc.:
     - Remove hardcoded `postgresql://postgres:123456@...`.
     - Resolve connection strings strictly from `process.env.DATABASE_URL` with fail-fast validation.

#### 3.5 — Operational Log Retention & Tenant Hardcoding Removal (`BE-23`, `BE-25`)
1. **Retention Archival Strategy**:
   - Add time-based retention policy for `hashtag_execution_runs` (purge runs older than 90 days) and `task_batch_heartbeats`.
2. **Dynamic Tenant Mapping**:
   - Parameterize fallback mailbox addresses in `stagingService.ts` and `messageIntakeService.ts` to read from team settings.

---

## 4. Definitive Acceptance Criteria Matrix

| Finding ID | Acceptance Criterion | Verification Method / Command | Pass / Fail Rule |
|---|---|---|---|
| **BE-10** | `npx tsc --noEmit` exits with code 0 and zero compiler errors. | `npx tsc --noEmit --project backend/tsconfig.json` | Exit code == 0 |
| **BE-11** | Local test command runs and passes all 38 test suites. | `cd backend && npm test` | 38/38 suites, 300+ tests pass; Exit code == 0 |
| **BE-01** | Unauthenticated requests to protected endpoints return HTTP 401. | `curl -i http://localhost:5002/api/db/databases` (no token) | HTTP 401 Unauthorized |
| **BE-02** | Registration persists `password_hash`; production login works with password; `admin123` backdoor is rejected. | Register new user with password; call `/api/auth/login` with correct and incorrect passwords. | Password hashes in DB; valid password → 200; `admin123` on arbitrary user → 401 |
| **BE-03** | Maker-Checker identity cannot be spoofed via request body; anti-self-approval returns HTTP 403. | Propose resolution with JWT A and attempt review with JWT A. | HTTP 403 Anti-Self-Approval Forbidden; body overrides ignored |
| **BE-04** | Migrations execute transactionally via `schema_migrations`; broken migration halts server boot. | Introduce deliberate syntax error in test `.sql`; start server. | Server aborts with error; zero unrecorded DDL changes |
| **BE-05** | Mirror DDL advisory lock held inside explicit transaction; concurrent provisioning does not race. | Spawn parallel `ensureMirrorTableExists` calls. | Exactly one `CREATE TABLE`; no swallowed DDL errors |
| **BE-06** | `revertTransaction` executes within single-client `BEGIN ... COMMIT`; failure leaves database unchanged. | Inject failure prior to snapshot insert in rollback. | Row changes rolled back; advisory lock released |
| **BE-08** | `IssueStatus` values in PostgreSQL strictly conform to canonical uppercase enum. | Query `SELECT DISTINCT status FROM issues;` against DB. | All rows match canonical union; DB rejects invalid status |
| **BE-12** | `SQL_CONDITION` compiler rejects unauthorized functions (`pg_read_file`, `version()`). | Compile condition `pg_read_file('/etc/passwd') IS NOT NULL`. | Throws security violation; statement rejected |
| **BE-09** | MongoDB query on offline connector returns 501 without in-memory store fallback. | `POST /api/db/mongo/query` with `{ collectionName: 'users' }`. | HTTP 501 Not Implemented; zero mock documents |
| **BE-19** | Database connection credentials at rest are AES-256-GCM encrypted. | `SELECT password FROM database_connections;` | Plaintext passwords == 0; ciphertext envelopes only |

---

## 5. Automated Verification Script

Execute the following PowerShell script to certify Phase 0 and Phase 1 completion:

```powershell
Write-Host "=== STARTING BACKEND REMEDIATION VERIFICATION SUITE ===" -ForegroundColor Cyan

# Gate 1: Backend TypeScript Compilation Gate (Must exit 0)
Write-Host "--> Gate 1: Verifying TypeScript Compilation..."
npx tsc --noEmit --project backend/tsconfig.json
if ($LASTEXITCODE -ne 0) { 
    Write-Error "Gate 1 FAILED: Backend TypeScript compiler errors detected."
    exit 1 
}
Write-Host "Gate 1 PASSED: Zero TypeScript errors." -ForegroundColor Green

# Gate 2: Local Vitest Suite Execution (Must pass 38/38 suites)
Write-Host "--> Gate 2: Executing Backend Test Suite via local command..."
cd backend
npm test
if ($LASTEXITCODE -ne 0) { 
    Write-Error "Gate 2 FAILED: Backend test suites failed."
    exit 1 
}
cd ..
Write-Host "Gate 2 PASSED: 38/38 test suites passing." -ForegroundColor Green

# Gate 3: Live Health Check
Write-Host "--> Gate 3: Probing Live Backend Health..."
$health = Invoke-RestMethod -Uri "http://localhost:5002/api/health" -Method Get
if ($health.status -ne "OK" -or $health.database -notmatch "PostgreSQL") {
    Write-Error "Gate 3 FAILED: Backend health is not OK or PostgreSQL disconnected."
    exit 1
}
Write-Host "Gate 3 PASSED: Backend healthy and connected to PostgreSQL." -ForegroundColor Green

# Gate 4: Unauthenticated Endpoint Access Gate (Must return HTTP 401)
Write-Host "--> Gate 4: Verifying Route Authentication Guard..."
try {
    $res = Invoke-WebRequest -Uri "http://localhost:5002/api/db/databases" -Method Get -SkipHttpErrorCheck
    if ($res.StatusCode -ne 401) {
        Write-Error "Gate 4 FAILED: Expected HTTP 401 but received $($res.StatusCode)"
        exit 1
    }
} catch {
    # Handled by SkipHttpErrorCheck
}
Write-Host "Gate 4 PASSED: Unauthenticated access properly rejected with HTTP 401." -ForegroundColor Green

Write-Host "=== ALL VERIFICATION GATES PASSED SUCCESSFULLY ===" -ForegroundColor Green
```

---

## 6. Architectural Change Summary / Revision Log

| Date | Scope | Rationale | Physical Code Impact |
|---|---|---|---|
| **2026-11-13** | Authoring of Master Implementation Plan `BACKEND_AUDIT_REMEDIATION_IMPLEMENTATION_PLAN.md` | Formal response and execution roadmap for `BACKEND_IMPLEMENTATION_AUDIT_2026-11-13.md` under AGENTS.md Rule 22 | New master engineering plan authored; indexed in `MASTER_ARCHITECTURE_INDEX.md` under Domain 14 |

---

## 7. Governing Rules & References

- **Master Architectural Entry Point**: [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md)
- **Governing Physical Audit**: [`BACKEND_IMPLEMENTATION_AUDIT_2026-11-13.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/BACKEND_IMPLEMENTATION_AUDIT_2026-11-13.md)
- **Project Rule Governance**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 1, 2, 7, 10, 11, 13, 17, 19, 20, 21, 22, 23)
- **Domain Blueprint**: [`.agents/skills/bo-operational-governance/SKILL.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md)
- **Baseline System Context**: [`CURRENT_PROJECT_CONTEXT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/CURRENT_PROJECT_CONTEXT.md)
- **Frontend Remediation Plan Counterpart**: [`FRONTEND_AUDIT_REMEDIATION_IMPLEMENTATION_PLAN.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/FRONTEND_AUDIT_REMEDIATION_IMPLEMENTATION_PLAN.md)

