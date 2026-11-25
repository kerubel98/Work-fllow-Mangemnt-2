---
name: audit
description: "Conducts an exhaustive architectural, security, and code quality audit of the FinSync platform against the 7 invariants. Trigger whenever the user types /audit or asks to audit the implementation."
---

# /audit Directive

When the user types `/audit` (or `/audit [scope]`), conduct a scoped code and architecture audit using `.agents/skills/code-audit/SKILL.md`:

## Objective
Inspect and verify the codebase against the seven non-negotiable architectural invariants, SOLID class contracts, cryptographic rigor, database integrity, and Phase 0/1 exit criteria, updating `agent-handoffs/audit/reports/` and `agent-handoffs/audit/master-audit.md`.

## Context-Free Scope Discovery (When scope is omitted)
When `/audit` is invoked without arguments:
1. **Read Latest Plan:** Inspect [`agent-handoffs/plan/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/plan/INDEX.md) and the latest plan in `agent-handoffs/plan/` to identify the most recent feature development, target microservices, and declared invariants.
2. **Inspect Changed Files:** Check `git status --porcelain` and recently touched files under `services/` and `test/` to detect all added or modified code.
3. **Correlate with Audit Register:** Cross-reference against [`agent-handoffs/audit/master-audit.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/master-audit.md) to check for pending audit items in those subsystems.
4. **Identify Applicable Invariants:** Automatically map the changes to the relevant 7 Non-Negotiable Invariants.

## Instructions
1. Read `agent-handoffs/audit/master-audit.md`, previous relevant audit reports in `agent-handoffs/audit/reports/`, and sign-offs in `agent-handoffs/audit/sign-off/`.
2. Check if pending audit findings exist in the target subsystems.
3. Inspect the discovered/requested scope and minimum dependencies against the 7 invariants:
   - Invariant 1: National custody rule (banks hold money, no custodial shadow wallets).
   - Invariant 2: Beneficiary lockdown (merchant accounts only, cashier never beneficiary).
   - Invariant 3: Authority of price (prices from inventory catalog only).
   - Invariant 4: Asymmetric QR tokens (NIST P-256 ECDSA signatures, Redis single-use nonce consumption).
   - Invariant 5: Cashier separation of interest (anti-collusion eligibility checks, register single-occupancy).
   - Invariant 6: Double-entry balance constraint ($\sum \text{Debits} = \sum \text{Credits} \neq 0$).
   - Invariant 7: Pre-consumption delivery escrow (100m geofence check before burning QR).
4. Execute and verify the complete test suite:
   - Run `npm run build --workspaces --if-present`
   - Run `npm test --workspaces --if-present`
   - Run `npm run test:e2e`
5. Assign stable finding IDs (`AUD-<SCOPE>-###`) and severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`).
6. Create or update detailed audit report under `agent-handoffs/audit/reports/`.
7. Update [`agent-handoffs/audit/reports/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/reports/INDEX.md) with report details and what was audited.
8. Update `agent-handoffs/audit/master-audit.md` without deleting history.
9. Present scope, finding counts by severity, major risks, audit report path, master register path, and recommended next action (e.g. `/sign-off`). Do not modify application code during an audit unless explicitly requested.
