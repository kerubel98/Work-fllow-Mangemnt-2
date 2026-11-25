# Code & Architectural Audit Report: Governance Misalignments & Architectural Mismatches

**Audit ID**: `AUD-GOV-MISALIGN-2026-11-25`  
**Date**: 2026-11-25  
**Auditor**: Antigravity Autonomous Code Audit Engine  
**Governing Skills**: [`.agents/skills/audit/SKILL.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/audit/SKILL.md), [`.agents/skills/code-audit/SKILL.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)  
**Governing Invariants & Principles**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Principles 1–25)  
**Target Scope**: Cross-Cutting Governance Alignment & Architectural Consistency (Auth Middleware vs. Route Identity Trust, SSE Stream Auth, Rule 10 Advisory Locks, Rule 16 Flexbox Containment, Rule 23 `localStorage` Prohibition, Repository Delegation, and Governance Spec Alignment)  
**Branch / Commit**: `feature/frontend-redesign` (`d7bf228`)  
**Status**: `OPEN`  

---

## 1. Executive Summary

A repository-wide cross-cutting audit was conducted to compare the **25 Non-Negotiable Governance Principles** in [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) against the physical implementation in `backend/src/` and `frontend/src/`.

### Verified Compliant Areas (No Mismatch)
- **Rule 1 (Single PostgreSQL Repository)**: [`backend/src/store/repository.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/store/repository.ts#L1-L18) cleanly delegates exclusively to `postgresRepo`; MongoDB and in-memory fallbacks have been removed.
- **Rule 10 (64-Bit Advisory Locking)**: All advisory locks in `hashtagService.ts`, `investigationOrchestratorService.ts`, `mirrorTableManager.ts`, and `reversionService.ts` use `('x' || substr(md5($1), 1, 16))::bit(64)::bigint` with zero 32-bit `hashtext()` calls.
- **Rule 6 (`<ErrorBoundary>` Top-Level Coverage)**: [`frontend/src/App.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L1223-L1597) wraps all top-level workspace views in `<ErrorBoundary>`.

### Identified Misalignments & Architectural Mismatches (5 Findings: 1C / 2H / 2M / 0L)

| Finding ID | Severity | Governance Rule | Location | Summary |
| :--- | :---: | :--- | :--- | :--- |
| `AUD-GOV-001` | **CRITICAL** | Auth & Privacy | `backend/src/server.ts:82`; `events.ts:11-21` | `GET /api/events` SSE stream is mounted before `requireAuth`, broadcasting live messages, chat, and issue updates unauthenticated. |
| `AUD-GOV-002` | **HIGH** | Auth Architecture | `teams.ts`, `database.ts`, `approvals.ts`, `workflowBundles.ts`, `collaboration.ts` | Systemic mismatch: `server.ts` enforces JWT `requireAuth`, yet downstream route handlers bypass `req.user` by reading spoofable `req.body`/`req.query`/`x-user-*` fields. |
| `AUD-GOV-003` | **HIGH** | Rule 23 (`localStorage`) | `WorkspaceSettings.tsx:115,137,150`; `globalMappingService.ts:108-1646` | Business configuration (`operational_workspace_config_v1`) and mapping schemas still persist in `localStorage` despite Rule 23 prohibition. |
| `AUD-GOV-004` | **MEDIUM** | Rule 16 (Viewport) | `WorkspaceSettings.tsx:204`; `LoginScreen.tsx:131` | Brittle `h-[calc(100vh-2.25rem)]` and `min-h-[calc(100vh-3rem)]` height subtractions violate Rule 16 flexbox containment. |
| `AUD-GOV-005` | **MEDIUM** | Spec Alignment | `AGENTS.md`; `.agents/skills/audit/SKILL.md:15,24-37` | Governance docs embed unrelated FinSync v2 QR/geofence/cashier invariants and external `FinSync_Project` paths that do not match this BO Settlement codebase. |

---

## 2. Detailed Findings

### AUD-GOV-001: Unauthenticated Live SSE Broadcast Stream (`/api/events`)
- **Severity**: CRITICAL
- **Status**: OPEN
- **Location**: [`backend/src/server.ts#L82`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/server.ts#L82); [`backend/src/routes/events.ts#L11-L21`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/events.ts#L11-L21)
- **Evidence**: `app.use('/api', eventsRouter);` is mounted prior to `requireAuth`. Any unauthenticated caller can subscribe to `GET /api/events?userId=admin` and receive real-time direct messages, team chat, and operational events.
- **Recommended Remediation**: Require JWT authentication (or short-lived signed SSE ticket) on `/api/events` and bind `userId` strictly from `req.user.id`.

### AUD-GOV-002: Systemic `req.user` Trust Boundary Bypass Across Route Handlers
- **Severity**: HIGH
- **Status**: OPEN
- **Location**: `backend/src/routes/teams.ts:131,206,252`; `database.ts:407,720,923`; `approvals.ts:84`; `workflowBundles.ts:110`; `workspaceSettingsProposals.ts:84`; `collaboration.ts:22,56`
- **Evidence**: `server.ts` enforces `requireAuth` on `/api/*` routes (populating `req.user`), but downstream route handlers prioritize or trust `req.body.callerRole`, `req.body.checkerId`, `req.body.senderId`, `req.query.role`, and `req.headers['x-user-role']` over `req.user`.
- **Recommended Remediation**: Introduce a strict `getVerifiedActor(req)` helper reading solely from `req.user` and remove all client-supplied identity/role fallbacks.

### AUD-GOV-003: Rule 23 Violation — Active `localStorage` Business State Persistence
- **Severity**: HIGH
- **Status**: OPEN
- **Location**: [`frontend/src/components/WorkspaceSettings.tsx#L115-L150`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/WorkspaceSettings.tsx#L115-L150); [`frontend/src/services/globalMappingService.ts#L108-L268, L544-L633, L1646`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/services/globalMappingService.ts#L108)
- **Evidence**: `WorkspaceSettings.tsx` reads and writes `operational_workspace_config_v1` in `localStorage`. `globalMappingService.ts` contains a comment citing Rule 23 at line 613 (`// Zero localStorage business state per AGENTS.md Rule 23`) while continuing to read/write `STORAGE_KEY` and `CENTRAL_TABLE_STORAGE_KEY` in `localStorage`.
- **Recommended Remediation**: Remove `localStorage` reads/writes for business configurations and hydrate solely from PostgreSQL APIs.

### AUD-GOV-004: Rule 16 Violation — Brittle `calc(100vh-...)` Height Subtractions
- **Severity**: MEDIUM
- **Status**: OPEN
- **Location**: [`frontend/src/components/WorkspaceSettings.tsx#L204`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/WorkspaceSettings.tsx#L204); [`frontend/src/components/LoginScreen.tsx#L131`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/LoginScreen.tsx#L131)
- **Evidence**: Uses `h-[calc(100vh-2.25rem)]` and `min-h-[calc(100vh-3rem)]` instead of `h-full flex-1 min-h-0 overflow-hidden`.
- **Recommended Remediation**: Convert both containers to pure flexbox height containment (`h-full flex-1 min-h-0`).

### AUD-GOV-005: Governance Documentation Drift (`AGENTS.md` & `audit/SKILL.md`)
- **Severity**: MEDIUM
- **Status**: OPEN
- **Location**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md); [`.agents/skills/audit/SKILL.md#L15-L37`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/audit/SKILL.md#L15-L37)
- **Evidence**: Both files reference an unrelated FinSync v2 retail/QR/delivery system (QR tokens, 100m geofence, cashier separation of interest) and hardcoded path `c:\Users\hp\Downloads\FinSync_Project\agent-handoffs\plan\INDEX.md`, creating conflicting governance criteria during `/audit`.
- **Recommended Remediation**: Remove obsolete FinSync QR/geofence invariants from `AGENTS.md` and update `.agents/skills/audit/SKILL.md` to reference the 25 Back-Office Governance Principles and active workspace paths.

---

## 3. References

- [Master Audit Register](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/master-audit.md)
- [Audit Reports Index](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/INDEX.md)
