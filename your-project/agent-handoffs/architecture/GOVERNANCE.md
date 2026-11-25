# Architecture Governance & Engineering Standards

**Document ID:** `GOV-ARCH-001`  
**Governing Body:** FinSync Technical Steering Committee & Architecture Review Board  
**Target Platform:** FinSync on EthSwitch (v2)  
**Status:** **AUTHORITATIVE & ACTIVE**  

---

## 1. Purpose & Core Philosophy
This document establishes the architectural governance rules, documentation topology, and industrial-grade engineering practices for all engineers and autonomous AI agents working on the **FinSync on EthSwitch** platform.

**Core Philosophy:** *Architecture is a set of verifiable, non-negotiable invariants.* Software expansion must never compromise these invariants for short-term velocity.

---

## 2. Documentation Architecture & Single Source of Truth (SSOT)

All project documentation is organized under `agent-handoffs/` to guarantee instant discoverability and zero context degradation across agent sessions:

```
agent-handoffs/
├── INDEX.md                     # Single root entry point for all agents
├── session-handoff.md           # Transient session memory and immediate next steps
├── architecture/                # Invariant specifications, domain models & service boundaries
│   ├── ARCHITECTURE.md          # Full technical spec, ports, protocols, database schemas
│   ├── GOVERNANCE.md            # This document: architectural standards & rules of engagement
│   ├── INDEX.md                 # Architecture catalog and cross-reference links
│   └── OPERATIONAL_GOVERNANCE.md# Regulatory banking compliance (NBE), squad topology
├── plan/                        # Forward-looking execution blueprints
│   ├── INDEX.md                 # Master development plan ledger
│   └── PLAN-<SCOPE>-<DATE>.md   # Scoped feature implementation plans
└── audit/                       # Empirical, evidence-based verification
    ├── master-audit.md          # Authoritative ledger of all findings, invariants & statuses
    ├── reports/                 # Point-in-time forensic audit reports
    │   └── INDEX.md             # Audit reports index & pending development scopes
    └── sign-off/                # Formal milestone and remediation sign-off dossiers
        └── INDEX.md             # Sign-off catalog
```

### Fast-Access Rules for Agents:
1. **Never search recursively across the repository for architecture or audit state.** Always enter through [`agent-handoffs/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/INDEX.md).
2. **Inspect Indexes First:** Read `agent-handoffs/plan/INDEX.md` and `agent-handoffs/audit/reports/INDEX.md` to locate relevant documents before reading individual files.

---

## 3. The 7 Non-Negotiable Invariants

Every code modification, database migration, and API endpoint must explicitly demonstrate compliance with the 7 Invariants:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     THE 7 NON-NEGOTIABLE INVARIANTS                      │
├───────┬──────────────────────────────────┬───────────────────────────────┤
│ INV-1 │ National Custody Rule            │ bank-gateway-service (:3002)  │
│ INV-2 │ Beneficiary Lockdown             │ payment-service (:3003)       │
│ INV-3 │ Authority of Price               │ merchant-service (:3004)      │
│ INV-4 │ Asymmetric QR Tokens (P-256)     │ payment-service (:3003)       │
│ INV-5 │ Cashier Separation of Interest   │ merchant-service (:3004)      │
│ INV-6 │ Double-Entry Balance Constraint  │ ledger-service (:3005)        │
│ INV-7 │ Pre-Consumption Escrow (100m GPS)│ delivery-service (:3006)      │
└───────┴──────────────────────────────────┴───────────────────────────────┘
```

---

## 4. Architectural Rules of Engagement

### Rule 1: Hexagonal / Domain-Driven Service Isolation
- Each service under `services/` must isolate core business invariants into pure Domain Entities (e.g. `Payment`, `TillSession`, `Journal`, `EscrowDelivery`).
- Repositories (`Postgres*Repository`) and HTTP controllers (`main.ts`) are external adapters. **Invariants must never be delegated solely to database triggers or frontend validators.** Domain entities must reject invalid state transitions in code.

### Rule 2: Non-Destructive Modifications
- **No Invariant Weakening:** Never bypass validation using `as any`, optional bypass flags, or relaxed regexes.
- **Contract Backward Compatibility:** When modifying REST APIs, maintain support for existing consumers or update them synchronously across the monorepo workspace.
- **Audit Register Immutability:** Never delete, renumber, or silently drop findings in `audit/master-audit.md`. Mark them `RESOLVED`, `PARTIALLY RESOLVED`, or `ACCEPTED RISK` with references to formal sign-off documents.

### Rule 3: Atomic Financial Transactions
- Any operation mutating financial state (crediting merchant accounts, debiting clearing pools, writing outbox events, closing till drawers) must be wrapped in an ACID PostgreSQL transaction (`BEGIN ... COMMIT`) with automatic rollback on error.
- **Double-Entry Invariant:** Pre-commit assertions must verify $\sum \text{Debits} = \sum \text{Credits} \neq 0$.

### Rule 4: Cryptographic Rigor
- Cryptographic keys must never be hardcoded or generated ephemerally in production code.
- Asymmetric QR tokens must use NIST P-256 (`secp256r1`) ECDSA keys with SHA-256 digests.
- Single-use nonces must be checked and consumed atomically in Redis (`SET <nonce> <val> EX 120 NX`).

---

## 5. Development Lifecycle Governance

Every engineering initiative must follow this four-tier gate:

1. **Gate 1: Pre-Development Audit Check:** Inspect `agent-handoffs/audit/master-audit.md`. If pending audit findings exist in the target subsystem, remediate or incorporate them first.
2. **Gate 2: Plan Registration:** Author `agent-handoffs/plan/PLAN-<NAME>-<DATE>.md` and register in `agent-handoffs/plan/INDEX.md`.
3. **Gate 3: Safe Implementation & Test Pass:** Implement features while maintaining 100% test pass rate (91/91 tests).
4. **Gate 4: Context-Free Audit & Sign-Off:** Execute context-free `/audit`, which automatically identifies the changed scope and invariants from `plan/INDEX.md`, writes the audit report, and recommends `/sign-off`.

---

## 6. Senior Engineer & Principal Architect Dual Role

When an agent operates in this environment (via Antigravity, OpenCode, or Copilot), it acts in a **Dual Role**:
- **As Principal Architect:** It defends system invariants, enforces architectural boundaries, designs clean domain contracts, and prevents technical debt accumulation.
- **As Senior Staff Engineer:** It executes clean, robust, type-safe, production-ready code, writes targeted integration tests, ensures zero regressions, and delivers verified sign-off records.
