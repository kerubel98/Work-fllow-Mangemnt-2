# FinSync Platform — Agent Handoffs & Governance Master Hub

Welcome to the centralized engineering handoff and architecture repository for **FinSync on EthSwitch**. This directory is the single authoritative source of truth for system blueprints, development roadmaps, invariant compliance audits, remediation sign-offs, and cross-agent session continuity.

---

## 1. Directory Structure & Fast-Path Sitemaps

```
agent-handoffs/
├── INDEX.md                     # This Master Navigation & Architecture Hub
├── session-handoff.md           # Active session state & cross-agent context handoff
├── architecture/                # Core system blueprints & operational governance
│   ├── ARCHITECTURE.md          # Technical specifications, service boundaries & rails
│   ├── GOVERNANCE.md            # Architecture governance rules & engineering standards
│   ├── INDEX.md                 # Architecture catalog & sequence flows
│   └── OPERATIONAL_GOVERNANCE.md# Squad topologies, NBE compliance & operational gates
├── plan/                        # Implementation plans & work breakdown structures
│   ├── INDEX.md                 # Development plan catalog & lifecycle tracking
│   ├── PHASE_0_PLAN.md          # Phase 0 sandbox execution plan
│   ├── MASTER_IMPLEMENTATION_PLAN.md # 28-month 5-phase national rollout blueprint
│   └── PLAN-*.md                # Scoped feature implementation plans
└── audit/                       # Independent audit registers, reports & sign-offs
    ├── master-audit.md          # Master register of findings, invariants & regression watch
    ├── reports/                 # Point-in-time evidence-based audit reports
    │   ├── INDEX.md             # Audit reports index & pending development scopes
    │   ├── AUDIT-PLATFORM-2026-11-24.md
    │   ├── AUDIT-PLATFORM-2026-11-24-R2.md # Latest verification report
    │   └── FINSYNC_CODE_AUDIT.md
    └── sign-off/                # Milestone and remediation sign-off dossiers
        ├── INDEX.md             # Sign-off directory & formal approvals
        ├── PHASE_0_EXIT_SIGNOFF.md
        └── SIGN-OFF-PHASE-A-2026-11-24.md
```

---

## 2. Fast Navigation Matrix for Agents

| When you need to: | Consult this file first: | What to look for: |
|:---|:---|:---|
| **Resume previous session** | [`session-handoff.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/session-handoff.md) | Current task, last completed step, next actionable tasks, and blockers. |
| **Understand system architecture** | [`architecture/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/architecture/INDEX.md) | Service ports, boundaries, EthSwitch rails, and double-entry flows. |
| **Review architecture rules** | [`architecture/GOVERNANCE.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/architecture/GOVERNANCE.md) | Invariant guardrails, domain modeling rules, and industrial-grade standards. |
| **Start a development request** | [`plan/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/plan/INDEX.md) | Active plans, pre-development audit check protocol, and plan authoring template. |
| **Check open security/invariant findings** | [`audit/master-audit.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/master-audit.md) | Current compliance table, finding statuses (`OPEN`, `PARTIALLY RESOLVED`, `RESOLVED`). |
| **Inspect recent audit evidence** | [`audit/reports/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/reports/INDEX.md) | Empirical test reports, findings summary, and audit scope mapping. |
| **Verify remediation sign-offs** | [`audit/sign-off/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/sign-off/INDEX.md) | Formal verification records and committee gate sign-offs. |

---

## 3. The 7 Non-Negotiable Invariants

All development, planning, and auditing must enforce these invariants without exception:

1. **INV-1: National Custody Rule** &mdash; Banks hold all deposits; EthSwitch coordinates rails; FinSync never holds deposits or acts as a custodial wallet.
2. **INV-2: Beneficiary Lockdown** &mdash; Money flows strictly to verified `MerchantAccount` destinations. Cashiers and clerks are never beneficiaries.
3. **INV-3: Authority of Price** &mdash; Callers send item IDs and quantities, never unit prices. Prices resolve server-side from inventory catalogs (`IPriceSource`).
4. **INV-4: Asymmetric QR Tokens** &mdash; Signed with NIST P-256 (`secp256r1`) ECDSA private keys. Single-use nonces invalidated atomically in Redis.
5. **INV-5: Cashier Separation of Interest** &mdash; Active cashiers cannot own businesses; registers host only one active till session (`TillSession`).
6. **INV-6: Double-Entry Balance Constraint** &mdash; Every journal posting requires $\sum \text{Debits} = \sum \text{Credits} \neq 0$ enforced at the PostgreSQL constraint level inside an ACID transaction.
7. **INV-7: Pre-Consumption Escrow** &mdash; Delivery handover codes are only burned after verifying GPS proximity ($\le 100\text{m}$), recipient identity, and order status.

---

## 4. Industrial-Grade Engineering Standards for Agents

To ensure fast, targeted, and non-destructive development:

- **Targeted Code Inspection:** Do not scan the entire codebase blindly. Start with `agent-handoffs/INDEX.md`, inspect only the relevant microservice under `services/`, and follow domain interfaces.
- **Non-Destructive Modifications:**
  - Preserve historical records: Never overwrite or renumber findings in `audit/master-audit.md`.
  - Maintain backward compatibility: When changing contracts, support existing consumers or migrate them atomically.
  - ACID Transactions: Financial mutations (ledger entries, outbox events, inventory updates) must run inside explicit PostgreSQL `BEGIN ... COMMIT` blocks with rollback on error.
- **Strict Typing & Financial Precision:**
  - Strict TypeScript mode. Never use `any` or forced casts (`as any`).
  - Money amounts must always be rounded to 2 decimal places: `Math.round(val * 100) / 100` (or integer cents).
- **Mandatory Verification Protocol:**
  - Every change must verify:
    ```bash
    cd code/unpacked/finsync-app
    npm run build --workspaces --if-present
    npm test --workspaces --if-present
    npm run test:e2e
    ```
  - Maintain 100% clean test passes (91/91 tests).
