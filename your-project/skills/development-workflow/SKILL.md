---
name: development-workflow
description: Governs the development lifecycle for all feature and bugfix requests: checks pending audit tasks first, authors plan documents under agent-handoffs/plan/, links architectural invariants, executes safe implementation, updates audit report index with what has been done, and enables context-free /audit inspection.
---

# Development Workflow Skill

This skill governs how software development, refactoring, and feature expansion are carried out across the FinSync platform. It is agent-independent and applies to Antigravity, OpenCode, GitHub Copilot, and any other coding agent.

## Core Principle
**Never build on top of compromised architectural invariants.** Every development request follows a strict 5-stage lifecycle. The agent acts in a dual capacity as **Senior Engineer** and **Principal Architect**.

---

## Fast-Path Architecture & Document Navigation
Agents must NEVER scan the repository indiscriminately. Follow this targeted lookup path:
1. **Master Navigation Hub:** Enter through [`agent-handoffs/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/INDEX.md).
2. **Architecture Blueprints:** Consult [`agent-handoffs/architecture/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/architecture/INDEX.md) and [`agent-handoffs/architecture/GOVERNANCE.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/architecture/GOVERNANCE.md).
3. **Audit History & Open Tasks:** Check [`agent-handoffs/audit/master-audit.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/master-audit.md).
4. **Active Development Plans:** Check [`agent-handoffs/plan/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/plan/INDEX.md).
5. **Code Inspection:** Inspect only the specific files declared in the plan under `services/<target-service>/src/`.

---

## 5-Stage Development Lifecycle

```
Stage 1: Pre-Development Audit Check (Inspect agent-handoffs/audit/master-audit.md)
  └── Stage 2: Create & Register Plan Document (agent-handoffs/plan/PLAN-<NAME>-<DATE>.md)
        └── Stage 3: Invariant-Compliant Implementation & Test Suite
              └── Stage 4: Update Audit Scope & Report Index (agent-handoffs/audit/reports/INDEX.md)
                    └── Stage 5: Context-Free Autonomous /audit Verification
```

---

### Stage 1: Pre-Development Audit Check
Before writing any code:
1. Open and read [`agent-handoffs/audit/master-audit.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/master-audit.md).
2. Check for any `OPEN` or `PARTIALLY RESOLVED` audit findings in:
   - The specific microservice(s) targeted by the new request.
   - Any of the 7 Non-Negotiable Invariants.
   - Any `CRITICAL` or `HIGH` severity blockers.
3. **If pending audit tasks exist in the targeted subsystems:**
   - **Prioritize and resolve them first** (via `/sign-off` remediation or by explicitly incorporating their remediation as Step 1 of the implementation plan).
   - Do not layer new features on top of unresolved security vulnerabilities, price leaks, or unverified custody rails.

---

### Stage 2: Plan Document Generation (`agent-handoffs/plan/`)
For every development request, author a dedicated plan document:
- **Location:** `agent-handoffs/plan/PLAN-<FEATURE/SCOPE>-<DATE>.md`
- **Required Sections:**
  1. **Objective & User Requirements:** Exactly what is being built.
  2. **Pre-Development Audit Check:** Document findings from `master-audit.md` and how pending items are addressed.
  3. **7 Non-Negotiable Invariants Alignment:** Specify how each relevant invariant is enforced (e.g., Beneficiary Lockdown, Price Authority, NIST P-256 QR, Double-Entry).
  4. **Implementation Breakdown:** Target files, method signatures, REST endpoints, DTO contracts, and database migrations.
  5. **Verification & Testing Criteria:** Target commands (`npm test --workspaces --if-present`, `npm run test:e2e`), new test cases, and assertions.
  6. **Audit Scope Definition:** Files, endpoints, and invariant assertions to guide the subsequent `/audit`.
- **Register in [`agent-handoffs/plan/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/plan/INDEX.md):** Add a row in the Plan Catalog table with status `IN_PROGRESS`.

---

### Stage 3: Invariant-Compliant Industrial-Grade Implementation
When implementing code, enforce these strict engineering standards:

1. **Strict Typing & No Escape Hatches:**
   - Strict TypeScript mode. Never use `any` or forced type bypasses (`as any`).
   - Use explicit domain DTOs and type guards.
2. **Financial Precision:**
   - Financial amounts must always be rounded to 2 decimal places: `Math.round(val * 100) / 100` (or integer cents).
3. **ACID PostgreSQL Transactions:**
   - Any multi-entity mutation (journal entries, till drawer balances, outbox messages) must be wrapped in explicit transactions with pre-commit balance checks ($\sum \text{Debits} = \sum \text{Credits} \neq 0$).
4. **Non-Destructive Modifications:**
   - Backward compatibility: Never break existing API contracts or public routes without a migration path.
   - State Machine Integrity: Domain entity transitions must occur through explicit domain methods, never public property setters.
5. **The 7 Invariants Checklist:**
   - **INV-1 (National Custody):** Never hold custodial balances.
   - **INV-2 (Beneficiary Lockdown):** Only route funds to verified `MerchantAccount` destinations.
   - **INV-3 (Authority of Price):** Never take unit prices from callers; resolve from `IPriceSource`.
   - **INV-4 (Asymmetric QR):** Verify NIST P-256 ECDSA signatures and burn single-use Redis nonces atomically.
   - **INV-5 (Cashier Separation):** Enforce till single-occupancy and anti-collusion checks.
   - **INV-6 (Double-Entry Balance):** Ensure $\sum \text{Debits} = \sum \text{Credits} \neq 0$ inside an ACID transaction.
   - **INV-7 (Pre-Consumption Escrow):** Check courier GPS proximity ($\le 100\text{m}$) before burning delivery QR.
6. **Pre-Handoff Verification:**
   ```bash
   cd code/unpacked/finsync-app
   npm run build --workspaces --if-present
   npm test --workspaces --if-present
   npm run test:e2e
   ```
   All 91 tests must pass cleanly with 0 failures before proceeding.

---

### Stage 4: Update Audit Reports Index & Scope
Once implementation is complete:
1. Update [`agent-handoffs/plan/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/plan/INDEX.md) setting plan status to `COMPLETED`.
2. Update [`agent-handoffs/audit/reports/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/reports/INDEX.md):
   - Add entry under "Active & Pending Development Audit Scopes".
   - State clearly:
     - What was added/modified.
     - What specific microservices and files were affected.
     - Which invariants govern the new changes.
     - Link to the plan document in `agent-handoffs/plan/`.

---

### Stage 5: Context-Free `/audit` Readiness
The implementation and documentation must be structured so that when the user invokes `/audit` without any arguments:
- `/audit` reads the latest entry in [`agent-handoffs/plan/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/plan/INDEX.md) and [`agent-handoffs/audit/reports/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/reports/INDEX.md).
- It autonomously extracts the audit scope, runs test verifications, checks invariant assertions, and publishes the new audit report.

---

## Senior Engineer & Principal Architect Dual Role
When orchestrating tasks in OpenCode or other environments:
- **Principal Architect Authority:** Veto any design that violates bank custody, leaks price control to clients, or compromises ledger balance.
- **Senior Staff Engineer Rigor:** Deliver robust, self-testing, production-grade code that leaves zero technical debt and clean sign-off dossiers.
