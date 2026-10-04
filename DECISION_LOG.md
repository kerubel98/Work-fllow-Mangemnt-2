# Architectural Decision Log (ADR)
## Operational Workflow Management Platform

**Repository:** `c:/Users/hp/Downloads/opration-workflow-mangement1`  
**Standard Status Values:** `PROPOSED` | `APPROVED` | `IMPLEMENTED` | `PARTIALLY_IMPLEMENTED` | `DEPRECATED` | `REJECTED`

---

## ADR-001: PostgreSQL as Authoritative Primary Datastore for Back-Office Operations

- **Status:** `IMPLEMENTED`
- **Date:** 2026-09-06
- **Decision:** Establish PostgreSQL (`operational_workflow_db`) as the sole authoritative persistence layer across 27 relational tables with connection pooling (`config/postgres.ts`), migrations (`backend/src/database/migrations/*.sql`), and relational repository (`postgresRepo.ts`).
- **Why:** Early historical prototypes evaluated MongoDB and browser `localStorage`. Those historical approaches lacked ACID transactions, foreign key constraints, set-based relational joins, and atomic locking required for enterprise banking reconciliation.
- **Alternatives Considered:**
  - *MongoDB*: Retained only as an external transaction data source with connection testing/pinging.
  - *Browser `localStorage`*: Obsolete. Replaced by server-side PostgreSQL REST endpoints (`/api/workflows`, `/api/validation-boxes`).
- **Rejected Alternatives:** Storing workflows in `localStorage` or relying on MongoDB as primary operational persistence.
- **Affected Components:** `backend/src/store/postgresRepo.ts`, `backend/src/database/migrations/`, `backend/src/config/postgres.ts`, `frontend/src/api/client.ts`.
- **Migration Required:** Initial schema `001_initial_schema.sql` through `024_*.sql`.
- **Implementation Evidence:** Active server pool in `backend/src/config/postgres.ts`, 27 registered tables in `information_schema.tables`.

---

## ADR-002: Two-Tier Validation Box Container Type vs Check Type Separation

- **Status:** `IMPLEMENTED`
- **Date:** 2026-10-01
- **Decision:** Strictly separate container classification (`ValidationBoxType`) from execution check algorithms (`CheckType`). Canonical `ValidationBoxType` values are strictly:
  1. `INGESTION_SEARCH`
  2. `CONDITION_CHECK`
  3. `RECONCILIATION`
  4. `REPORT`
  Internal check algorithms (`EXISTENCE_CHECK`, `VALUE_MATCH`, `AMOUNT_MATCH`, `ISO_DECLINE_CODE`) must reside strictly inside `rule_definition.checkType` or `steps[].checkType`, never in `validation_boxes.box_type`.
- **Why:** Non-conforming container strings in the database cause `ValidationBoxManager.tsx` to silently filter out records, resulting in empty UI displays despite rows existing in PostgreSQL.
- **Alternatives Considered:** Flat single-tier check typing.
- **Rejected Alternatives:** Setting `validation_boxes.box_type = 'EXISTENCE_CHECK'` or `'AMOUNT_MATCH'`.
- **Affected Components:** `frontend/src/types.ts`, `backend/src/types.ts`, `backend/src/store/postgresRepo.ts`, `frontend/src/components/settings/ValidationBoxManager.tsx`, `seedPostgres.ts`.
- **Migration Required:** Database rows in `validation_boxes` aligned to canonical enums.
- **Implementation Evidence:** Explicit union in `frontend/src/types.ts` (L1253) and `backend/src/types.ts` (L1126).

---

## ADR-003: Team Database Scoping, Credential Masking, and Promotion Lifecycle

- **Status:** `IMPLEMENTED`
- **Date:** 2026-09-18 (Updated 2026-10-01)
- **Decision:** Database connections created within a team context (`team_id = currentTeam.id`) are scoped as private (`scope = 'team'`). They remain strictly isolated to the creating team unless formally promoted to global (`team_id = NULL`, `scope = 'global'`) via administrative review (`promotion_status = 'PENDING'`). Connection secrets (passwords) are masked (`••••••••`) on retrieval and preserved across metadata updates.
- **Why:** Prevents cross-departmental data leaks, enforces multi-tenant boundary isolation, and ensures that sensitive database credentials cannot be accessed across operational silos without Four-Eyes or administrator sign-off.
- **Alternatives Considered:** All database connections globally accessible to all authenticated users.
- **Rejected Alternatives:** Unscoped database connections; plaintext credential exposure in API JSON responses.
- **Affected Components:** `backend/src/database/migrations/012_team_member_privileges_and_team_resources.sql`, `frontend/src/components/TeamWorkspace.tsx`, `backend/src/store/postgresRepo.ts`, `AdminTeamResourcesMonitor.tsx`.
- **Migration Required:** Columns `scope`, `team_id`, `created_by_user_id`, `promotion_status`, `promotion_requested_at`, `promotion_reviewed_at`, `promotion_notes` in `database_connections`.
- **Implementation Evidence:** `handleCreateTeamDbSubmit` in `frontend/src/components/TeamWorkspace.tsx` and migration `012`.

---

## ADR-004: Zero Data Loss, Mandatory Dry-Run, and Scoped Cleanup Protocol

- **Status:** `IMPLEMENTED`
- **Date:** 2026-10-01
- **Decision:** Strictly prohibit unconstrained blanket `DELETE FROM <persistent_table>` or `DROP TABLE` across core entity tables (`database_validation_workflows`, `validation_boxes`, `database_connections`, `database_table_mappings`, `issues`, `teams`, `users`, `workflow_bundles`). All cleanups must follow the mandatory 8-step dry-run execution flow:
  `IDENTIFY` → `SELECT matching records` → `VERIFY ownership/provenance` → `DRY RUN` → `REPORT affected records` → `OBTAIN EXPLICIT APPROVAL` → `MODIFY / DELETE` → `VERIFY final state`.
  Only verified generated mirror tables (`mirror_%`) may be dropped en masse.
- **Why:** Incident post-mortem from 2026-09-28 (2:53 PM), where an unconstrained maintenance script wiped user workflows and validation boxes because it assumed all existing rows were disposable test mocks.
- **Alternatives Considered:** Relying on developer caution without automated/procedural constraints.
- **Rejected Alternatives:** Unconstrained `DELETE FROM database_validation_workflows` or `DELETE FROM validation_boxes` in scratch scripts.
- **Affected Components:** `AGENTS.md` (Rule 17), `bo-operational-governance/SKILL.md` (§3.19), all future CLI and scratch maintenance scripts.
- **Migration Required:** Decommissioning of unconstrained scratch cleanup scripts (`scratch/comprehensive_cleanup.mjs`).
- **Implementation Evidence:** Rules 17 and 20 in `AGENTS.md` and Section 3.19 in `SKILL.md`.

---

## ADR-005: Four Independent State Dimensions & Separation of Validation Verdict from Pipeline Action

- **Status:** `IMPLEMENTED`
- **Date:** 2026-09-06
- **Decision:** Maintain strict architectural separation between four independent state dimensions:
  1. Case / Task Lifecycle (`Issue.status`): `Open` -> `In Progress` -> `Resolved` -> `Closed`.
  2. Transaction Financial Status (`status_state`): `AUTHORIZED`, `SETTLED`, `DECLINED`, `REVERSED`.
  3. Transaction Investigation Status: `UNINVESTIGATED` -> `IN_PROGRESS` -> `PENDING_CHECKER_REVIEW` -> `VERIFIED_MATCH` | `FLAGGED_DISCREPANCY`.
  4. Rule Execution Verdict: `PASS` | `FAIL` | `ERROR` | `PAUSED_DB_OFFLINE`.
  Additionally, rule validation verdict must NEVER be conflated with pipeline execution action (`CONTINUE`, `STOP`, `CLOSE`, `FLAG`, `REPORT`).
- **Why:** Conflating these lifecycles caused premature task closure when single transactions resolved, or forced pipeline halts on non-critical warning failures.
- **Alternatives Considered:** Single omnibus status enum combining issue status and rule status.
- **Rejected Alternatives:** Coupling transaction resolution to parent issue closure.
- **Affected Components:** `backend/src/services/investigationOrchestratorService.ts`, `backend/src/services/reconciliationService.ts`, `backend/src/types.ts`, `frontend/src/types.ts`.
- **Migration Required:** Relational separation across `issues`, `task_dataset_transactions`, and `investigation_transactions`.
- **Implementation Evidence:** Documented in `AGENTS.md` (Rules 2, 3) and `SKILL.md` (§3.1, §3.2).
