# Code & Architectural Audit Report: Governance Misalignments & Architectural Mismatches

**Audit ID**: `AUD-GOV-MISALIGN-2026-11-25`  
**Date**: 2026-11-25  
**Auditor**: Antigravity Autonomous Code Audit Engine  
**Governing Skills**: [`.agents/skills/audit/SKILL.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/audit/SKILL.md), [`.agents/skills/code-audit/SKILL.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)  
**Governing Invariants & Principles**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Principles 1–25)  
**Target Scope**: Cross-Cutting Governance Alignment & Architectural Consistency (Auth Middleware vs. Route Identity Trust, SSE Stream Auth, Rule 10 Advisory Locks, Rule 16 Flexbox Containment, Rule 23 `localStorage` Prohibition, Repository Delegation, and Governance Spec Alignment)  
**Branch / Commit**: `feature/frontend-redesign`  
**Status**: `RESOLVED`  
**Sign-Off**: [`SIGN-OFF-GOV-MISALIGN-2026-11-26.md`](file:///agent-handoffs/audit/sign-off/SIGN-OFF-GOV-MISALIGN-2026-11-26.md)  

---

## 1. Executive Summary

A repository-wide cross-cutting audit was conducted to compare the **25 Non-Negotiable Governance Principles** in [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) against the physical implementation in `backend/src/` and `frontend/src/`. All 5 misalignments have been resolved and verified with clean builds and passing tests.

### Verified Compliant Areas (No Mismatch)
- **Rule 1 (Single PostgreSQL Repository)**: [`backend/src/store/repository.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/store/repository.ts#L1-L18) cleanly delegates exclusively to `postgresRepo`; MongoDB and in-memory fallbacks have been removed.
- **Rule 10 (64-Bit Advisory Locking)**: All advisory locks in `hashtagService.ts`, `investigationOrchestratorService.ts`, `mirrorTableManager.ts`, and `reversionService.ts` use `('x' || substr(md5($1), 1, 16))::bit(64)::bigint` with zero 32-bit `hashtext()` calls.
- **Rule 6 (`<ErrorBoundary>` Top-Level Coverage)**: [`frontend/src/App.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L1223-L1597) wraps all top-level workspace views in `<ErrorBoundary>`.

### Remediated Misalignments & Architectural Mismatches (5 Findings: 0 Open / 5 Resolved)

| Finding ID | Severity | Governance Rule | Location | Status | Summary |
| :--- | :---: | :--- | :--- | :---: | :--- |
| `AUD-GOV-001` | **CRITICAL** | Auth & Privacy | `backend/src/server.ts`; `events.ts` | **RESOLVED** | `GET /api/events` SSE stream is protected by `requireAuth` and derives identity strictly from JWT claims. |
| `AUD-GOV-002` | **HIGH** | Auth Architecture | `teams.ts`, `database.ts`, `approvals.ts`, `workspaceSettingsProposals.ts`, `collaboration.ts`, `assetSharing.ts` | **RESOLVED** | Implemented `getVerifiedActor(req)` across all route handlers, prioritizing authenticated JWT `req.user` over client headers/body. |
| `AUD-GOV-003` | **HIGH** | Rule 23 (`localStorage`) | `WorkspaceSettings.tsx`; `globalMappingService.ts` | **RESOLVED** | Purged all active `localStorage` reads/writes for business configurations; PostgreSQL is the sole system of record. |
| `AUD-GOV-004` | **MEDIUM** | Rule 16 (Viewport) | `WorkspaceSettings.tsx`; `LoginScreen.tsx` | **RESOLVED** | Replaced brittle `calc(100vh-...)` subtractions with pure flexbox height containment (`h-full flex-1 min-h-0`). |
| `AUD-GOV-005` | **MEDIUM** | Spec Alignment | `AGENTS.md`; `.agents/skills/audit/SKILL.md` | **RESOLVED** | Removed obsolete FinSync v2 QR/geofence retail text and aligned all paths/directives with the 25 Governance Principles. |

---

## 2. Detailed Findings & Resolutions

### AUD-GOV-001: Unauthenticated Live SSE Broadcast Stream (`/api/events`)
- **Severity**: CRITICAL
- **Status**: RESOLVED
- **Location**: [`backend/src/server.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/server.ts); [`backend/src/routes/events.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/events.ts)
- **Remediation**: Mounted `eventsRouter` under JWT `requireAuth` protection. SSE connections extract subscriber identity directly from `req.user.id`.

### AUD-GOV-002: Systemic `req.user` Trust Boundary Bypass Across Route Handlers
- **Severity**: HIGH
- **Status**: RESOLVED
- **Location**: `backend/src/routes/teams.ts`; `database.ts`; `workspaceSettingsProposals.ts`; `collaboration.ts`; `assetSharing.ts`
- **Remediation**: Implemented `getVerifiedActor(req)` in `backend/src/utils/auth.ts` and integrated across all route handlers. When `req.user` is present, client header and body spoofing attempts are completely ignored.

### AUD-GOV-003: Rule 23 Violation — Active `localStorage` Business State Persistence
- **Severity**: HIGH
- **Status**: RESOLVED
- **Location**: [`frontend/src/components/WorkspaceSettings.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/WorkspaceSettings.tsx); [`frontend/src/services/globalMappingService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/services/globalMappingService.ts)
- **Remediation**: Removed `localStorage` persistence from `WorkspaceSettings.tsx` and `globalMappingService.ts`. System hydrates and persists configuration strictly through PostgreSQL REST endpoints.

### AUD-GOV-004: Rule 16 Violation — Brittle `calc(100vh-...)` Height Subtractions
- **Severity**: MEDIUM
- **Status**: RESOLVED
- **Location**: [`frontend/src/components/WorkspaceSettings.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/WorkspaceSettings.tsx); [`frontend/src/components/LoginScreen.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/LoginScreen.tsx)
- **Remediation**: Replaced `h-[calc(100vh-2.25rem)]` and `min-h-[calc(100vh-3rem)]` with `h-full flex-1 min-h-0 overflow-hidden` and `h-full flex-1 min-h-0 bg-slate-50 overflow-y-auto`.

### AUD-GOV-005: Governance Documentation Drift (`AGENTS.md` & `audit/SKILL.md`)
- **Severity**: MEDIUM
- **Status**: RESOLVED
- **Location**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md); [`.agents/skills/audit/SKILL.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/audit/SKILL.md)
- **Remediation**: Removed obsolete FinSync v2 retail QR/geofence text from `AGENTS.md`. Rewrote `.agents/skills/audit/SKILL.md` to reference the 25 Governance Principles and active workspace paths.

---

## 3. References

- [Sign-Off Document](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/sign-off/SIGN-OFF-GOV-MISALIGN-2026-11-26.md)
- [Master Audit Register](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/master-audit.md)
- [Audit Reports Index](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/INDEX.md)
