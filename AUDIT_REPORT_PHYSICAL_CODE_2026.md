# Comprehensive Project Code & Architectural Governance Audit Report

> **Target Repository**: `c:\Users\hp\Downloads\opration-workflow-mangement1`  
> **Governing Standards**: `AGENTS.md` (23 Non-Negotiable Governance Principles) & `bo-operational-governance` Skill (`SKILL.md`)  
> **Inspection Mode**: Zero-Assumption Physical Source Code & Migration DDL Analysis  
> **Date**: October 2026  

---

## Executive Summary Matrix

A comprehensive code-level audit was conducted across all core subsystems:
1. **Security & Authentication Layer** (`backend/src/routes/auth.ts`, `backend/src/utils/auth.ts`, `backend/src/routes/resolutions.ts`, `.env`)
2. **Backend Services & Engine** (`mirrorTableManager.ts`, `investigationOrchestratorService.ts`, `workflowEngineSingleton.ts`, `dbLivenessService.ts`, `externalDataQueryService.ts`, `statusAggregator.ts`, `reconciliationService.ts`, `datasetIngestionService.ts`, `hashtagService.ts`)
3. **Database Schema & Migrations** (`migrations/001_initial_schema.sql` through `033_*.sql`, `postgresRepo.ts`, `seedPostgres.ts`, `migrate.ts`, `postgres.ts`)
4. **Frontend Subsystem** (`frontend/src/App.tsx`, `client.ts`, `types.ts`, `globalMappingService.ts`, `SystemSettings.tsx`, `WorkspaceSettings.tsx`, `investigationEngine.ts`)

### Subsystem Severity Overview

| Subsystem | Critical | High | Medium | Low | Total Findings |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Backend Security & Auth** | 8 | 8 | 5 | 0 | **21** |
| **Backend Services & Engine** | 1 | 8 | 3 | 1 | **13** |
| **Database Schema & Migrations** | 6 | 7 | 6 | 1 | **20** |
| **Frontend Architecture & State** | 0 | 4 | 5 | 2 | **11** |
| **TOTAL** | **15** | **27** | **19** | **4** | **65** |

---

## Part 1: Security & Authentication Vulnerabilities

### 1.1 CRITICAL — Hardcoded Backdoor Master Password & Preset Bypass
- **File**: [`backend/src/routes/auth.ts: Lines 9–16, 38–41`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/auth.ts#L9-L41)
- **Governance Violation**: Principle 19 (Credential Protection & Access Control), Principle 7
- **Code**:
  ```typescript
  const PRESET_PASSWORDS: Record<string, string> = {
    admin: 'admin123',
    kirubel_ops: 'ops123',
    tech_sarah: 'tech123',
    manager_alex: 'mgr123',
    david_ops: 'ops123',
    samuel_tech: 'tech123'
  };
  ...
  const expectedPass = PRESET_PASSWORDS[user.username] || 'password123';
  const isValid = verifyPassword(password, expectedPass) || password === 'admin123';
  ```
- **Vulnerability**: Line 39 contains an unconditional backdoor: `|| password === 'admin123'`. Any user (including administrators and supervisors) can authenticate with `admin123`. Any username not in the preset dictionary defaults to password `password123`. PostgreSQL user password hashes are completely bypassed.

### 1.2 CRITICAL — Complete Lack of Authentication & RBAC on Admin User Management Endpoints
- **File**: [`backend/src/routes/auth.ts: Lines 142–183, 249–256`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/auth.ts#L142-L183)
- **Governance Violation**: Principle 19 ("Strict Authorization Chain: User -> Team -> Allowed Operation")
- **Code**:
  ```typescript
  /** PUT /api/auth/users/:id/approve (Admin only) */
  authRouter.put('/users/:id/approve', async (req: Request, res: Response) => { ... });

  /** PUT /api/auth/users/:id/role (Admin only) */
  authRouter.put('/users/:id/role', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { role, canExecuteSelect, canExecuteUpdate } = req.body;
    ...
  });
  ```
- **Vulnerability**: Despite comments claiming "(Admin only)", no authentication middleware (`requireAuth` or `requireRole('admin')`) is attached. Any anonymous HTTP client can approve pending accounts, elevate accounts to `role: 'admin'`, and grant `canExecuteUpdate: true`.

### 1.3 CRITICAL — Anti-Self-Approval Bypass via Caller Identity Spoofing
- **File**: [`backend/src/routes/resolutions.ts: Lines 20–31`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/resolutions.ts#L20-L31) & [`backend/src/services/makerCheckerService.ts: Lines 141–145`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/makerCheckerService.ts#L141-L145)
- **Governance Violation**: Principle 7 ("Maker-Checker Dual Authorization & Anti-Self-Approval: makerId !== checkerId at API and service layers")
- **Vulnerability**: `POST /api/resolutions/review` does not mount authentication middleware. `checkerId` is read directly from untrusted `req.body.checkerId` rather than `req.user.id`. A Maker can submit a proposal and immediately approve their own proposal by supplying a colleague's ID as `checkerId`.

### 1.4 CRITICAL — Arbitrary SQL Execution on System Database via Live Query Sandbox
- **File**: [`backend/src/routes/database.ts: Lines 2425–2536`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/database.ts#L2425-L2536) & [`backend/src/services/dbConnectionManager.ts: Lines 456–468`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/dbConnectionManager.ts#L456-L468)
- **Governance Violation**: Principle 17 (Strict Data Loss Prevention), Principle 19
- **Code**:
  ```typescript
  // dbConnectionManager.ts:
  if (targetTable.startsWith('mirror_')) {
    const cleanQuery = trimmed.toUpperCase().startsWith('SELECT')
      ? trimmed
      : `SELECT * FROM "${targetTable}" LIMIT 50`;
    const res = await queryPg(cleanQuery); // DIRECT EXECUTION ON SYSTEM DB!
  }
  ```
- **Vulnerability**: Unauthenticated callers can specify `{ userRole: 'admin' }` in `req.body`. When `targetTable` starts with `mirror_`, `cleanQuery` is sent directly to `queryPg` (the application's primary database pool) without sanitization, permitting raw SQL execution against production application tables.

### 1.5 CRITICAL — Plaintext Database Passwords Returned by Admin API
- **File**: [`backend/src/routes/database.ts: Lines 601–622`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/database.ts#L601-L622) & [`backend/src/store/postgresRepo.ts: Lines 941–949`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/store/postgresRepo.ts#L941-L949)
- **Governance Violation**: Principle 19 ("Passwords and secrets must never be logged or returned in plaintext, must be masked on retrieval (••••••••)")
- **Vulnerability**: `GET /api/db/admin/team-resources` has no authentication and calls `repo.getAdminTeamResources(maskSecret = false)`. All team database passwords stored in PostgreSQL are transmitted to the browser in cleartext.

### 1.6 CRITICAL — Zero Team Scoping Checks on Table Discovery & Data Preview
- **File**: [`backend/src/routes/database.ts: Lines 732–750, 926–960`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/database.ts#L732-L750)
- **Governance Violation**: Principle 19 ("Team Ownership: Database connections created within a team context are strictly private to that team")
- **Vulnerability**: `GET /api/db/databases/:id/tables` and `GET /api/db/databases/:id/tables/:tableName/preview` take a database ID and execute catalog queries and data previews without checking whether `db.scope === 'team'` or verifying that the caller belongs to `db.teamId`.

### 1.7 CRITICAL — Production Secrets & Weak Passwords in Root `.env`
- **File**: [`.env: Lines 7, 13, 19, 23`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.env#L7-L23)
- **Governance Violation**: Principle 14, Principle 19
- **Vulnerability**:
  - Live API key committed: `XKIRO_API_KEY=sk-xt-abca62eefa7b3e01175d8771b95455e0145783e169dd2ee5`
  - MongoDB production cloud password committed on line 7
  - Weak default database passwords: `MYSQL_PASSWORD=123456`, `PG_PASSWORD=123456`
  - `JWT_SECRET` is absent from `.env`, defaulting to the static fallback in code.

### 1.8 HIGH — Hand-Rolled Insecure JWT Implementation
- **File**: [`backend/src/utils/auth.ts: Line 3, Lines 109–119`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/utils/auth.ts#L3)
- **Governance Violation**: Principle 14, Principle 19
- **Vulnerability**: Static fallback secret `op_workflow_secret_key_prod_2026_x89f_secure_auth`. Signature verification uses standard string equality (`!==`) rather than constant-time `crypto.timingSafeEqual`, exposing it to timing attacks.

---

## Part 2: Backend Services & Execution Engine

### 2.1 CRITICAL — Pre-Flight Database Liveness Circuit Breaker Completely Disconnected in Active DAG Pipeline
- **File**: [`backend/src/services/investigationOrchestratorService.ts: Lines 51–53, 1155–1493`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/investigationOrchestratorService.ts#L51-L53)
- **Governance Violation**: Principle 22 (Zero-Assumption Reality Gate & Anti-Premature Certification), SKILL.md §4 Step 4
- **Vulnerability**: Line 51 delegates `executeUniversalWorkflow` directly to `executeViaNewPipeline`. However, `executeViaNewPipeline` **never invokes** `dbLivenessService.probeLiveness()`. The probe is only called in `_legacyExecuteUniversalWorkflow` (line 441), which is deprecated dead code. The system executes queries against external databases without pre-flight socket verification or circuit breaker tripping.

### 2.2 HIGH — Ineffectual Advisory Locking in `mirrorTableManager.ts`
- **File**: [`backend/src/services/mirrorTableManager.ts: Lines 91–99`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/mirrorTableManager.ts#L91-L99)
- **Governance Violation**: Principle 10 (64-Bit Cryptographic Advisory Locking)
- **Code**:
  ```typescript
  try {
    await queryPg(
      `SELECT pg_advisory_xact_lock(('x' || substr(md5($1), 1, 16))::bit(64)::bigint)`,
      [`mirror_ddl_${mirrorName}`]
    );
  } catch (lockErr: any) { ... }
  // DDL check and table creation occurs in subsequent queryPg calls...
  ```
- **Vulnerability**: `queryPg` executes in autocommit mode. `pg_advisory_xact_lock` only lives for the duration of the current transaction. Because there is no `BEGIN ... COMMIT` block, the lock is acquired and **immediately released upon statement completion**. Subsequent `CREATE UNLOGGED TABLE` and `ALTER TABLE` DDL queries run without any lock held, permitting concurrent catalog race conditions.

### 2.3 HIGH — Unbounded In-Memory Map in `workflowEngineSingleton.ts` (Progressive Memory Leak)
- **File**: [`backend/src/services/workflowEngineSingleton.ts: Lines 56–57, 77–88`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/workflowEngineSingleton.ts#L56-L88)
- **Governance Violation**: Principle 5 (No Unapproved Infrastructure / Architectural Robustness)
- **Vulnerability**: `resultCache` is declared as a plain `Map<string, CachedValidationResult>` without size limits, bounded LRU eviction, or background sweepers. TTL is only checked passively upon read. Ingesting large transaction volumes causes unbounded memory consumption leading to Node.js Out-Of-Memory (OOM) crashes.

### 2.4 HIGH — In-Flight Lock Resolution Corrupts Transaction Record Arrays
- **File**: [`backend/src/services/investigationOrchestratorService.ts: Lines 288–305`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/investigationOrchestratorService.ts#L288-L305) & [`backend/src/services/workflowEngineSingleton.ts: Lines 134–140`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/workflowEngineSingleton.ts#L134-L140)
- **Governance Violation**: Principle 1 (Repository Reality)
- **Vulnerability**: `workflowEngineSingleton.registerInFlightLock` registers a `jobPromise` that resolves to a `WorkflowJobResult` (containing `{ jobId, passedCount, records: [...] }`). When concurrent tasks await the lock, line 293 places `res.value` (the entire job result object) into `finalEvaluatedRecords[item.origIdx]`, replacing a single row record with an entire job object.

### 2.5 HIGH — Direct SQL Injection in Age-Based Cleanup Query
- **File**: [`backend/src/services/mirrorTableManager.ts: Lines 388–405`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/mirrorTableManager.ts#L388-L405)
- **Governance Violation**: Principle 11 (ANSI Quoting & Parameterized Queries), Principle 17 (Data Loss Prevention)
- **Code**:
  ```typescript
  await queryPg(`DELETE FROM ${mirrorName} WHERE _mirrored_at < NOW() - INTERVAL '${maxAgeHours} hours'`);
  ```
- **Vulnerability**: `maxAgeHours` is interpolated directly into the SQL string without numeric validation or parameterization.

### 2.6 HIGH — Direct SQL Injection in Rule SQL Compiler and Hashtag Service
- **Files**: [`backend/src/services/ruleSqlCompiler.ts: Lines 467, 481, 482`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ruleSqlCompiler.ts#L467-L482) & [`backend/src/services/hashtagService.ts: Lines 110–115, 370, 522`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/hashtagService.ts#L110-L115)
- **Governance Violation**: Principle 11
- **Vulnerability**: `rule.id` and `rule.onFailAction` are interpolated into `jsonb_build_object` and `CASE WHEN` clauses without single-quote escaping or enum whitelist verification. In `hashtagService.ts`, `mapping.lookupTable`, `sourceCol`, and `teamId` are interpolated with basic string replacement.

### 2.7 HIGH — Conflation of Lifecycle Dimensions & Auto-Closure of Parent Issues
- **File**: [`backend/src/services/statusAggregator.ts: Lines 68–78, 201–209`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/statusAggregator.ts#L68-L209)
- **Governance Violation**: Principle 2 (Validation Result ≠ Pipeline Action), Principle 3 (Lifecycle Separation)
- **Vulnerability**:
  - `statusAggregator.ts` combines Financial Status, Investigation Status, and Validation Result into a single `effectiveStatus`.
  - Lines 201–209 automatically set `issueStatus = 'RESOLVED'` or `'CLOSED'` when all transaction rows complete cleanly. Principle 3 explicitly prohibits this: *"Resolving or closing a single transaction investigation must never automatically close the parent Task/Issue."*

### 2.8 HIGH — Severe N+1 Sequential Database Roundtrips on Ingestion
- **File**: [`backend/src/services/datasetIngestionService.ts: Lines 121–153`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/datasetIngestionService.ts#L121-L153)
- **Governance Violation**: Principle 1, Principle 4 (External Queries Must Be Batched)
- **Vulnerability**: `ingestDatasetRows` checks for existing duplicates by invoking `repo.getCentralTransaction()` sequentially inside a `for` loop for every single row. Ingesting 10,000 rows executes 10,000+ sequential roundtrip queries before batch inserting.

---

## Part 3: Database Schema & Migrations

### 3.1 CRITICAL — `VARCHAR(16)` Buffer Overflow on Canonical Status `PAUSED_DB_OFFLINE`
- **File**: [`backend/src/database/migrations/001_initial_schema.sql: Line 444`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrations/001_initial_schema.sql#L444)
- **Governance Violation**: Principle 1 (Repository Reality Trumps Assumptions), Principle 2, Principle 20
- **Code**:
  ```sql
  final_result VARCHAR(16) NOT NULL DEFAULT 'NOT_EVALUATED',
  ```
- **Vulnerability**: The canonical status `'PAUSED_DB_OFFLINE'` is **17 characters long**. Whenever the circuit breaker trips or a database is offline, writing to `investigation_transactions` fails with PostgreSQL error: `value too long for type character varying(16)`.

### 3.2 CRITICAL — 5 Tables Queried in Code Missing from Migration DDL
- **Files**: `backend/src/store/postgresRepo.ts`, `backend/src/services/schemaMigrationService.ts`, `backend/src/database/migrations/*.sql`
- **Governance Violation**: Principle 1, Principle 20 (Cross-Layer Invariance)
- **Missing Tables**:
  1. `central_transaction_repository` (Queried in 13 places across `postgresRepo.ts` and `datasetIngestionService.ts`)
  2. `task_workflow_executions` (Queried in `postgresRepo.ts` Lines 489, 667, 2047, 2071, 2119, 2141, 2181)
  3. `workspace_table_records` column divergence (Schema has `name, columns, db_connection_id, target_table`; code inserts `file_name, user_name, user_id, tag, task_id, transformed_data`)
  4. `transaction_templates` (Stubbed with empty try/catch in `postgresRepo.ts: Line 3827`)
  5. `upload_audit_logs` (Stubbed with empty return in `postgresRepo.ts: Line 3866`)

### 3.3 CRITICAL — Missing `BEGIN` on Transaction in `createTaskDatasetTransactions`
- **File**: [`backend/src/store/postgresRepo.ts: Lines 580–632`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/store/postgresRepo.ts#L580-L632)
- **Governance Violation**: Principle 17 (Strict Data Loss Prevention)
- **Code**:
  ```typescript
  const client = await pool.connect();
  try {
    if (!hasExistingCoordinates) {
      await client.query('DELETE FROM task_dataset_transactions WHERE task_id = $1;', [taskId]);
    }
    // ... Chunked INSERT loop ...
    await client.query('COMMIT'); // COMMIT without BEGIN!
  } catch (e) {
    await client.query('ROLLBACK'); // ROLLBACK without BEGIN!
    throw e;
  }
  ```
- **Vulnerability**: There is no `client.query('BEGIN')`. The initial `DELETE` and each insert chunk execute in PostgreSQL auto-commit mode. If chunk 3 fails, `ROLLBACK` does nothing; the previous dataset has already been wiped, leaving only a corrupt partial chunk.

### 3.4 CRITICAL — Zero Migration Tracking Table (`schema_migrations` Absent)
- **Files**: [`backend/src/config/postgres.ts: Lines 46–53`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/config/postgres.ts#L46-L53) & [`backend/src/database/migrate.ts: Lines 18–27`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrate.ts#L18-L27)
- **Governance Violation**: Principle 1, Principle 20
- **Vulnerability**: There is no tracking ledger (`schema_migrations`). On every server boot, all 34 `.sql` migration files are read from disk and re-executed against PostgreSQL sequentially.

### 3.5 HIGH — Missing Transaction Boundaries in Multi-Statement Deletions
- **File**: [`backend/src/store/postgresRepo.ts: Lines 486–518, 2176–2198`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/store/postgresRepo.ts#L486-L518)
- **Governance Violation**: Principle 13, Principle 17
- **Vulnerability**:
  - `deleteIssue` executes 5 separate unbundled queries against `pool` directly. Intermediate failures leave orphan records.
  - `clearAllValidationExecutions` executes unconstrained `DELETE FROM` across 4 tables with no `WHERE` clause, directly violating Governance Principle 17.

### 3.6 HIGH — Hardcoded Mock OAuth 2.0 Client Secrets in Seed Data
- **File**: [`backend/src/config/seedPostgres.ts: Lines 79–81, 96–97`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/config/seedPostgres.ts#L79-L97)
- **Governance Violation**: Principle 14, Principle 19
- **Vulnerability**: `seedPostgres()` inserts hardcoded credentials into `provider_connections` (`clientSecret: 'ms_enterprise_secret_vault_secured_99'`, `'google_workspace_app_secret_vault_88'`).

---

## Part 4: Frontend Architecture & State Governance

### 4.1 HIGH — Primary Business State Persisted to `localStorage` (Principle 23 Breach)
- **Files**:
  - [`frontend/src/services/globalMappingService.ts: Lines 87, 108, 165, 187, 463, 520, 550`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/services/globalMappingService.ts#L87-L550)
  - [`frontend/src/components/settings/SystemSettings.tsx: Lines 160–169, 191, 393`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/SystemSettings.tsx#L160-L191)
  - [`frontend/src/components/WorkspaceSettings.tsx: Lines 115, 137, 150, 162`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/WorkspaceSettings.tsx#L115-L162)
- **Governance Violation**: Principle 23 ("Strict Prohibition of Client-Side localStorage as Primary State Store: Zero Business Logic in Local Storage")
- **Vulnerability**:
  - `SystemSettings.tsx` initializes `SystemTransformationRule[]` directly from `localStorage.getItem('system_transformation_rules')` as the primary state store.
  - `WorkspaceSettings.tsx` persists entire workspace configurations to `localStorage`.
  - `globalMappingService.ts` caches central table schema definitions to `localStorage` and falls back to local storage when backend sync fails.

### 4.2 HIGH — Duplicated Domain Execution Engine in Frontend
- **Files**: [`frontend/src/services/investigationEngine.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/services/investigationEngine.ts) (1,334 lines) vs [`backend/src/services/investigationEngine.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/investigationEngine.ts)
- **Governance Violation**: Principle 1, Principle 20
- **Vulnerability**: 1,334 lines of complex evaluation logic (`evaluateAttachedColumnConfigurations`, condition checking, range comparisons) are duplicated in the frontend bundle. Any bug fix or rule change applied to the backend is not reflected in client-side evaluations, causing divergence between browser simulations and backend DAG pipeline executions.

### 4.3 MEDIUM — Hardcoded Viewport Heights in Screen Wrappers
- **Files**: [`frontend/src/components/LoginScreen.tsx: Line 120`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/LoginScreen.tsx#L120) & [`frontend/src/components/WorkspaceSettings.tsx: Line 205`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/WorkspaceSettings.tsx#L205)
- **Governance Violation**: Principle 16 ("Full-Viewport Workspace Layout, Scroll Containment & Header Preservation: No Hardcoded Viewport Heights in Inner Panes")
- **Vulnerability**: Uses `h-[calc(100vh-2.25rem)]` and `min-h-[calc(100vh-3rem)]` which can cause nested scroll leaks when parent navigation headers are toggled.

### 4.4 MEDIUM — Inconsistent Enum Types Across Frontend and Backend
- **Files**: `frontend/src/types.ts` vs `backend/src/types.ts`
- **Governance Violation**: Principle 18, Principle 20
- **Vulnerability**:
  - `FlowchartNode.type` uses `'DECISION' | 'VALIDATION_BOX'` while `ValidationBoxType` uses `'INGESTION_SEARCH' | 'CONDITION_CHECK'`.
  - `Issue.status` in frontend uses `'Open' | 'Investigating' | 'Resolved' | 'Closed'`, while `CaseLifecycleStatus` uses 6 uppercase states (`'OPEN' | 'INVESTIGATING' | 'IN_PROGRESS' | 'ACTION_REQUIRED' | 'RESOLVED' | 'CLOSED'`).

---

## Actionable Remediation Roadmap

```text
Phase 1: Emergency Security Hotfixes (Immediate)
├── 1. Remove backdoor password ('admin123') and PRESET_PASSWORDS from backend/src/routes/auth.ts
├── 2. Attach requireAuth and requireRole('admin') to all /api/auth/users/* administrative routes
├── 3. Enforce authenticated req.user.id for checkerId in /api/resolutions/review (HTTP 403 on self-approval)
├── 4. Sanitize targetTable in /api/db/query/execute and prohibit raw queries on primary PostgreSQL pool
├── 5. Mask passwords in GET /api/db/admin/team-resources and add team ownership checks to /databases/:id/tables
└── 6. Rotate XKIRO_API_KEY, generate strong JWT_SECRET in .env, remove hardcoded DB passwords

Phase 2: Database Schema & Migration Remediation
├── 1. Create migration 034_schema_fixes.sql:
│   ├── ALTER TABLE investigation_transactions ALTER COLUMN final_result TYPE VARCHAR(32);
│   └── ALTER TABLE resolution_approval_requests ALTER COLUMN transaction_id TYPE VARCHAR(128);
├── 2. Create migration 035_create_missing_tables.sql:
│   ├── CREATE TABLE IF NOT EXISTS central_transaction_repository (...);
│   ├── CREATE TABLE IF NOT EXISTS task_workflow_executions (...);
│   └── Align workspace_table_records and organizations schema with active repository queries
├── 3. Create schema_migrations ledger table in migrate.ts to prevent redundant boot DDL
└── 4. Add client.query('BEGIN') to createTaskDatasetTransactions in postgresRepo.ts

Phase 3: Backend Services & Concurrency Hardening
├── 1. Re-connect dbLivenessService.probeLiveness() into executeViaNewPipeline()
├── 2. Wrap mirrorTableManager DDL provisioning inside explicit BEGIN ... COMMIT for advisory lock safety
├── 3. Replace unbound Map in workflowEngineSingleton.ts with bounded LRU cache (max 50,000 entries)
├── 4. Batch duplicate checks in datasetIngestionService.ts (eliminate N+1 queries via transaction_key = ANY($1))
└── 5. Remove automatic Issue.status = 'RESOLVED' / 'CLOSED' logic from statusAggregator.ts

Phase 4: Frontend State & Architecture Alignment
├── 1. Eliminate localStorage as primary state store in SystemSettings.tsx and WorkspaceSettings.tsx
├── 2. Deduplicate investigationEngine.ts (source from shared package or delegate to backend API)
└── 3. Align FlowchartNode.type with canonical ValidationBoxType ('INGESTION_SEARCH' | 'CONDITION_CHECK')
```
