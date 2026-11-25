# Development Plans & Implementation Index

This directory stores operational development plans for the **FinSync on EthSwitch** platform. 

## Development Protocol
Every development request follows a strict sequence:
1. **Pending Audit Check:** Inspect [`agent-handoffs/audit/master-audit.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/master-audit.md). If pending audit findings or invariant violations exist in the targeted subsystems, resolve or integrate their remediation first.
2. **Plan Creation:** Author a structured plan document in this directory (`agent-handoffs/plan/PLAN-<FEATURE/DATE>.md`).
3. **Index Registration:** Register the plan in the catalog below with status, scope, target invariants, and date.
4. **Implementation:** Implement according to the plan while maintaining the 7 Non-Negotiable Invariants.
5. **Audit Index Update:** Update [`agent-handoffs/audit/reports/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/reports/INDEX.md) with the new scope and readiness for audit.
6. **Autonomous `/audit` Execution:** When `/audit` is invoked without arguments, it reads this index and the latest plan to automatically determine the exact scope, invariants, and test assertions.

---

## Plan Catalog

| Plan ID / Document | Date | Target Scope & Microservices | Target Invariants | Status | Related Audit / Sign-Off |
|:---|:---:|:---|:---|:---:|:---|
| [PHASE_0_PLAN.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/plan/PHASE_0_PLAN.md) | 2026-11-20 | Foundation sandbox verification (all 7 services) | INV-1 through INV-7 | **EXECUTED** | [PHASE_0_EXIT_SIGNOFF.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/sign-off/PHASE_0_EXIT_SIGNOFF.md) |
| [MASTER_IMPLEMENTATION_PLAN.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/plan/MASTER_IMPLEMENTATION_PLAN.md) | 2026-11-22 | 28-month 5-phase national rollout | Full Platform Architecture | **BASELINE** | [master-audit.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/master-audit.md) |
| [PLAN-PHASE-A-INVARIANTS-2026-11-24.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/plan/PLAN-PHASE-A-INVARIANTS-2026-11-24.md) | 2026-11-24 | Phase A Critical Invariant Remediation (`payment-service`, `ledger-service`) | INV-2, INV-3, INV-4, INV-6 | **COMPLETED** | [SIGN-OFF-PHASE-A-2026-11-24.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/sign-off/SIGN-OFF-PHASE-A-2026-11-24.md) |
| [PLAN-PHASE-A2-REMEDIATION-2026-11-24.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/plan/PLAN-PHASE-A2-REMEDIATION-2026-11-24.md) | 2026-11-24 | Phase A2 Remediation: Remove Demo Fixtures, Gated Auth, Token Binding (`payment-service`, `ledger-service`) | INV-2, INV-3, INV-4, INV-6 | **IN_PROGRESS** | [AUDIT-PLATFORM-2026-11-24-R2.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/reports/AUDIT-PLATFORM-2026-11-24-R2.md) |

---

## Required Structure for New Plan Documents (`PLAN-<NAME>-<DATE>.md`)

```markdown
# Development Plan: <Feature / Task Name>

**Plan ID:** `PLAN-<SCOPE>-<DATE>`  
**Date:** YYYY-MM-DD  
**Status:** `PLANNED` | `IN_PROGRESS` | `COMPLETED`  
**Target Services:** e.g. `payment-service`, `merchant-service`  
**Governing Invariants:** e.g. `INV-2`, `INV-3`  

## 1. Objective & Requirements
Clear description of what is being built and why.

## 2. Pre-Development Audit Check
- Check `agent-handoffs/audit/master-audit.md` for open findings in this subsystem.
- Explicitly list pending audit items that must be resolved first or concurrently.

## 3. Invariant Constraints & Guardrails
How the 7 Non-Negotiable Invariants apply to this feature.

## 4. Implementation Steps
- Step 1: Files to create or modify.
- Step 2: Class/interface contracts and domain rules.
- Step 3: REST API endpoints / DTO validation.

## 5. Verification & Testing Strategy
- Commands to compile: `npm run build --workspaces --if-present`
- Unit/integration test files to add or execute.
- E2E lifecycle test verification.

## 6. Audit Scope Definition for Context-Free `/audit`
- Components to inspect: `<list of files>`
- Endpoints to probe: `<HTTP endpoints>`
- Specific invariant assertions to verify.
```
