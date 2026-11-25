# Audit Report: Database Governance, Approvals & Validation Boxes (`AUD-DB-GOVERNANCE-APPROVALS-2026-11-24`)

## 1. Audit Metadata & Scope
- **Audit ID**: `AUD-DB-GOVERNANCE-APPROVALS-2026-11-24`
- **Audit Date**: 2026-11-24 22:50 (UTC+3)
- **Target Scope**: Database Connections & Team-Scoped Isolation (`database.ts`), Unified Approvals (`approvals.ts`), Workflows (`workflows.ts`), and Validation Boxes (`validationBoxes.ts`)
- **Branch**: `feature/frontend-redesign`
- **Commit**: `d7bf228`
- **Governing Standards**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 7, 14, 18, 19, 21) & [`code-audit`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)
- **Audit Mode**: Read-only code & empirical verification audit (zero application source edits)

---

## 2. Executive Summary
A scoped security and governance audit was conducted on the Database Connection, Unified Approvals, Workflow, and Validation Box routers.

- **Empirical Suite Baseline** (verified at HEAD `d7bf228`):
  - `npm run build --prefix backend` (`tsc`): **PASS**
  - `npm test --prefix backend -- --run` (`vitest`): **PASS** (**39 test files, 312 tests passed**)
  - `npm run build --prefix frontend` (`vite build`): **PASS**
- **Findings Summary**: **4 findings** identified (**2 CRITICAL**, **1 HIGH**, **1 MEDIUM**, **0 LOW**).

---

## 3. Previous Audit & Sign-Off Review
- Correlated against [`agent-handoffs/audit/master-audit.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/master-audit.md). Prior audits (`AUD-INVESTIGATION-CORE-2026-11-24`, `AUD-INTAKE-STAGING-2026-11-24`, `AUD-MAPPING-INGESTION-2026-11-24`) remain `OPEN`.

---

## 4. Files & Modules Examined
- [`backend/src/routes/database.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/database.ts#L405-L715)
- [`backend/src/routes/approvals.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/approvals.ts#L1-L180)
- [`backend/src/routes/workflows.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/workflows.ts#L1-L150)
- [`backend/src/routes/validationBoxes.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/validationBoxes.ts#L1-L140)

---

## 5. Findings Summary Table

| Finding ID | Severity | Status | Category | Location | Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-DB-001` | `CRITICAL` | `OPEN` | Team Isolation / Auth Bypass (`Rule 19`) | `database.ts:407-418,544-604,672-711` | Client-supplied `role`/`callerId` & missing admin checks expose team DBs and self-promotion |
| `AUD-DB-002` | `CRITICAL` | `OPEN` | Anti-Self-Approval Bypass (`Rule 7`) | `approvals.ts:81-156` | `approvals.ts` trusts `req.body.checkerId` instead of JWT `req.user.id` |
| `AUD-DB-003` | `HIGH` | `OPEN` | Credential Protection (`Rule 19`) | `database.ts:576-577,684-686` | `PUT /databases/:id` & `review-promotion` return unmasked `updated` DB objects |
| `AUD-DB-004` | `MEDIUM` | `OPEN` | Canonical Enum Validation (`Rule 18`) | `validationBoxes.ts:99-101` | `POST /validation-boxes` does not enforce the 4 canonical `ValidationBoxType` enums |

---

## 6. Detailed Findings

### `AUD-DB-001` — Team-Scoped DB Isolation & Admin Promotion Bypass (`AGENTS.md` Rule 19)
- **Severity**: `CRITICAL` | **Status**: `OPEN` | **Category**: Authorization / Team Isolation
- **File & Line**: [`database.ts#L407-L418`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/database.ts#L407-L418), [`L544-L604`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/database.ts#L544-L604), [`L674-L702`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/database.ts#L674-L702)
- **Evidence**:
  - `GET /databases` (`L407-L418`) reads `role` from `req.query` (`if (role === 'admin' || role === 'superadmin')`), allowing any authenticated user to enumerate all private team DBs by passing `?role=admin`.
  - `PUT /databases/:id` (`L676`) and `DELETE /databases/:id` (`L697`) gate `resolveUserAdminCapabilities` inside `if (callerId)` where `callerId` is read from `req.body`/`req.query` — omitting `callerId` skips authorization completely.
  - `POST /team-databases/:id/review-promotion` (`L544`) and `GET /admin/team-resources` (`L584`) have no admin role verification.
- **Recommended Remediation**: Derive caller identity and role exclusively from `req.user` (`requireAuth`), require admin privileges unconditionally on `/review-promotion`, `/admin/team-resources`, and global DB mutations, and enforce team ownership on team-scoped DBs.

### `AUD-DB-002` — Anti-Self-Approval Bypass via Spoofed `req.body.checkerId` in `approvals.ts`
- **Severity**: `CRITICAL` | **Status**: `OPEN` | **Category**: Maker-Checker (`AGENTS.md` Rule 7)
- **File & Line**: [`approvals.ts#L81-L156`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/approvals.ts#L81-L156)
- **Evidence**: `POST /transactions/:id/approve`, `/reject`, and `POST /:id/review` take `checkerId` directly from `req.body` without checking `(req as any).user?.id`.
- **Impact**: A Maker can approve their own proposal by supplying a different `checkerId` in the JSON body.
- **Recommended Remediation**: Derive `checkerId` exclusively from `(req as any).user.id` and reject mismatches with HTTP 403/400 (matching `resolutions.ts`).

### `AUD-DB-003` — Unmasked `password` Returned & Masked Sentinel Overwrite Risk in `database.ts`
- **Severity**: `HIGH` | **Status**: `OPEN` | **Category**: Credential Protection (`AGENTS.md` Rule 19)
- **File & Line**: [`database.ts#L576-L577`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/database.ts#L576-L577), [`L684-L686`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/database.ts#L684-L686)
- **Evidence**: `PUT /databases/:id` and `POST /team-databases/:id/review-promotion` return `res.json(updated)` without masking `updated.password`, and `PUT /databases/:id` passes `req.body` directly to `repo.updateDatabase` without stripping `password: '••••••••'`.
- **Recommended Remediation**: Strip masked sentinel passwords before `repo.updateDatabase` and mask `password` in all database connection API responses.

### `AUD-DB-004` — Missing Canonical `ValidationBoxType` Validation in `validationBoxes.ts`
- **Severity**: `MEDIUM` | **Status**: `OPEN` | **Category**: Enum Invariance (`AGENTS.md` Rule 18)
- **File & Line**: [`validationBoxes.ts#L99-L101`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/validationBoxes.ts#L99-L101)
- **Evidence**: `POST /api/validation-boxes` checks `if (!name || !boxType)` without validating `boxType` against `['INGESTION_SEARCH', 'CONDITION_CHECK', 'RECONCILIATION', 'REPORT']`.
- **Recommended Remediation**: Reject non-canonical `boxType` values with HTTP 400 on both `POST` and `PUT`.

---

## 7. Positive Observations
- **Workflow Configuration Hydration**: `workflows.ts:9-87` cleanly batch-hydrates `attachedDbConfigIds` across workflow, stage, and step tiers (`Rule 21`).
- **Masked Password Handling in `GET /databases` & `/test-connection`**: `database.ts:271,412` properly masks passwords on `GET` list responses and resolves stored passwords when `'••••••••'` is sent to `/test-connection`.

---

## 8. Recommendations & Remediation Plan
1. **P0 (Critical)**: Enforce JWT-derived `req.user` identity/roles across `database.ts` (`AUD-DB-001`) and `approvals.ts` (`AUD-DB-002`).
2. **P1 (High)**: Mask passwords on `PUT`/`review-promotion` responses and preserve existing DB secrets (`AUD-DB-003`).
3. **P2 (Medium)**: Enforce canonical `ValidationBoxType` enum allow-list (`AUD-DB-004`).

**Recommended Next Action**: Run `/sign-off` to remediate open findings across the master audit register.
