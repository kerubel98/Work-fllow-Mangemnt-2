# System Remediation & Governance Implementation Plan (2026)

> **Document Status**: Active Implementation Plan  
> **Target Repository**: `c:\Users\hp\Downloads\opration-workflow-mangement1`  
> **Authoritative Specification**: [`MASTER_CONSOLIDATED_SYSTEM_AUDIT_2026.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_CONSOLIDATED_SYSTEM_AUDIT_2026.md)  
> **Master Governance Anchor**: [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md) (Domain 8) & [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md)  
> **Execution Mode**: Strict Multi-Phase Implementation with Independent Post-Remediation Reality Check  

---

## 1. Executive Implementation Scope

This implementation plan translates the 84 verified physical audit findings from [`MASTER_CONSOLIDATED_SYSTEM_AUDIT_2026.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_CONSOLIDATED_SYSTEM_AUDIT_2026.md) into concrete, sequenced code modifications across the backend, database migrations, pipeline engine, and frontend shell.

### Architectural Invariants Preserved:
1. **Development Authentication Deferral**: The backdoor password (`admin123` / `PRESET_PASSWORDS`) in [`backend/src/routes/auth.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/auth.ts) is retained for local development and test automation, but protected with an environment gate (`if (process.env.NODE_ENV === 'production')`) to prevent leaks into production environments.
2. **Approved Viewport Density Scaling**: `html { zoom: 0.8; }` in [`frontend/src/index.css`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/index.css) remains strictly preserved as the approved operational baseline to prevent Windows taskbar collision and match `redesigned_ui/`.
3. **Query Sandbox Live State**: Keep the real PostgreSQL/MySQL live query execution engine wired in [QuerySandboxStandaloneView.tsx](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/sandbox/QuerySandboxStandaloneView.tsx).

---

## 2. Detailed Work Breakdown Structure (WBS)

### Phase 1: Security, Access Control & Authorization Hardening (P0)

#### Task 1.1: Production Gating of Dev Authentication Backdoor
- **File**: [`backend/src/routes/auth.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/auth.ts#L38-L43)
- **Action**: Wrap `admin123` and `PRESET_PASSWORDS` so they are **only** permitted when `process.env.NODE_ENV !== 'production'`. In production mode, enforce strict database bcrypt/PBKDF2 hash verification from `user.password_hash`.
- **Target Line**: Line 39.

#### Task 1.2: Authentication & Admin RBAC on User Management Endpoints
- **File**: [`backend/src/routes/auth.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/auth.ts#L142-L185)
- **Action**:
  - Add auth verification to `PUT /api/auth/users/:id/approve` ensuring caller is an approved admin.
  - Add auth verification to `PUT /api/auth/users/:id/role` ensuring caller is an approved admin.
  - Add auth verification to `DELETE /api/auth/users/:id` ensuring caller is an approved admin.

#### Task 1.3: Anti-Self-Approval Identity Enforcement in Maker-Checker
- **File**: [`backend/src/routes/resolutions.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/resolutions.ts#L23-L31)
- **Action**:
  - Read `checkerId` and `checkerName` from authenticated user token session (`req.user`) or fallback to body only if verified.
  - In `backend/src/services/makerCheckerService.ts:142`, enforce `if (proposal.maker_id === effectiveCheckerId) throw new Error('Anti-Self-Approval Enforcement')` returning HTTP 403 Forbidden.

#### Task 1.4: Database Password Masking on Admin Retrieval
- **File**: [`backend/src/routes/database.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/database.ts#L601-L622)
- **Action**: Ensure `GET /api/db/admin/team-resources` calls `repo.getAdminTeamResources(true)` (maskSecret = true) so credentials are never transmitted in cleartext.

#### Task 1.5: Team Scoping Authorization on Table Discovery & Data Preview
- **File**: [`backend/src/routes/database.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/database.ts#L732-L750, #L926-L960)
- **Action**: In `GET /api/db/databases/:id/tables` and `GET /api/db/databases/:id/tables/:tableName/preview`, verify team ownership (`db.scope === 'team' => userPermTeam.id === db.teamId`) before executing catalog queries.

#### Task 1.6: Sanitize Target Table & Prevent Arbitrary SQL on System DB
- **File**: [`backend/src/services/dbConnectionManager.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/dbConnectionManager.ts#L456-L470)
- **Action**: When handling `mirror_` queries in `executeLiveQueryOnDb`, validate that `targetTable` strictly matches `^[a-zA-Z0-9_]+$` and only permit `SELECT` projections with bounded limits; forbid mutating SQL on `queryPg`.

---

### Phase 2: Database Schema & Relational Migration Remediation (P0)

#### Task 2.1: Fix `VARCHAR(16)` Status Buffer Overflow
- **Migration**: Create [`backend/src/database/migrations/034_schema_fixes.sql`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrations/034_schema_fixes.sql)
- **DDL Changes**:
  ```sql
  ALTER TABLE investigation_transactions ALTER COLUMN final_result TYPE VARCHAR(32);
  ALTER TABLE resolution_approval_requests ALTER COLUMN transaction_id TYPE VARCHAR(128);
  ```
- **Impact**: Eliminates PostgreSQL fatal error on 17-char canonical status `'PAUSED_DB_OFFLINE'`.

#### Task 2.2: Create Missing Core Relational Tables
- **Migration**: Create [`backend/src/database/migrations/035_create_missing_tables.sql`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrations/035_create_missing_tables.sql)
- **DDL Changes**:
  - `CREATE TABLE IF NOT EXISTS central_transaction_repository (...)` with indexes on `transaction_key`, `staged_at`, and `record_state`.
  - `CREATE TABLE IF NOT EXISTS task_workflow_executions (...)` with indexes on `task_id` and `execution_timestamp`.
  - Add missing columns to `workspace_table_records` (`file_name`, `user_name`, `user_id`, `tag`, `task_id`, `transformed_data`).

#### Task 2.3: Atomic Transaction Boundaries in Dataset Ingestion
- **File**: [`backend/src/store/postgresRepo.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/store/postgresRepo.ts#L580-L632)
- **Action**: Add `await client.query('BEGIN');` immediately after acquiring the database client in `createTaskDatasetTransactions` so that subsequent `COMMIT` and `ROLLBACK` operate within an active transaction block.

#### Task 2.4: Migration Ledger Table in `migrate.ts`
- **File**: [`backend/src/database/migrate.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrate.ts#L18-L45)
- **Action**: Create `schema_migrations (id SERIAL PRIMARY KEY, filename VARCHAR(255) UNIQUE, executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW())`. Record executed files and skip already-applied migrations to prevent redundant re-executions on boot.

---

### Phase 3: Backend Services & Execution Engine Concurrency (P1)

#### Task 3.1: Reconnect Pre-Flight Liveness Circuit Breaker
- **File**: [`backend/src/services/investigationOrchestratorService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/investigationOrchestratorService.ts#L1155-L1200)
- **Action**: In `executeViaNewPipeline()`, invoke `dbLivenessService.probeLiveness()` against `workflow.targetDbId`. If offline, trip circuit breaker, record status `'PAUSED_DB_OFFLINE'`, and avoid dead external queries.

#### Task 3.2: Wrap Advisory Locks in Explicit Transactions
- **File**: [`backend/src/services/mirrorTableManager.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/mirrorTableManager.ts#L91-L115)
- **Action**: Acquire a dedicated client, issue `BEGIN`, acquire advisory lock, execute table provisioning DDL, and `COMMIT` so the lock persists throughout the critical section.

#### Task 3.3: Eliminate Lifecycle Dimension Conflation
- **File**: [`backend/src/services/statusAggregator.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/statusAggregator.ts#L201-L215)
- **Action**: Remove the automatic mutation of `Issue.status = 'RESOLVED' | 'CLOSED'` when rows finish cleanly, enforcing Governance Principle 3 (Task Lifecycle ≠ Row Verdict).

---

### Phase 4: Frontend Routing, Live Data & Architecture Alignment (P1/P2)

#### Task 4.1: Wire Approvals Inbox View (Screen 18)
- **File**: [`frontend/src/App.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L1425-L1434)
- **Action**: Provide dedicated view routing or sub-tabs for `ApprovalsInboxView` so Screen 18 from `redesigned_ui/18_approvals.png` is fully reachable.

#### Task 4.2: Build Verification & Validation
- **Action**: Run `npx tsc --noEmit` and Vite build check to verify 0 regressions.

---

## 3. Execution Order & Verification Milestones

1. **Step 1**: Execute Phase 1 Security Hotfixes (`auth.ts`, `resolutions.ts`, `database.ts`).
2. **Step 2**: Execute Phase 2 Database Migrations (`034_schema_fixes.sql`, `035_create_missing_tables.sql`, `migrate.ts`, `postgresRepo.ts`).
3. **Step 3**: Execute Phase 3 Backend Engine Hardening (`investigationOrchestratorService.ts`, `mirrorTableManager.ts`, `statusAggregator.ts`).
4. **Step 4**: Execute Phase 4 Frontend Route Wiring (`App.tsx`).
5. **Step 5**: Run Backend Migration execution and TypeScript compilation tests.
6. **Step 6**: Generate `SYSTEM_REMEDIATION_ACCEPTANCE_REPORT.md`.
7. **Step 7**: Conduct Independent Zero-Assumption Code Reality Check.
