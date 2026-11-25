# FinSync on EthSwitch — Master Audit Ledger

## Overview

This document is the authoritative tracking ledger for architectural integrity, security posture, and invariant compliance across the FinSync platform.

**Repository:** `FinSync on EthSwitch (v2)`
**Target Rails:** EthSwitch National Switch & Ethiopian Commercial Banks (CBE, Dashen, etc.)
**Current Test Coverage:** 91 / 91 tests passing (90 workspace + 1 e2e) — **re-verified 2026-11-24 (R2)**
**Latest Point-in-Time Audit:** 2026-11-24 — `AUD-PLATFORM-2026-11-24-R2` (remediation verification)
**Outstanding Findings:** 23 (4 CRITICAL · 8 HIGH · 7 MEDIUM · 4 LOW)
**Runtime Readiness Verdict:** **NOT PRODUCTION READY — SANDBOX ONLY**

> **Register integrity note:** invariant statuses were originally asserted from domain-level tests. The platform audits re-verified them against the HTTP/runtime layer. Original claims are preserved as history in §5 and in the audit reports. Runtime statuses in §1 are the current evidence-based position.

---

## 1. Compliance Matrix: 7 Non-Negotiable Invariants

| # | Invariant | Scope / Service | Runtime status | Current evidence |
|---|---|---|---|---|
| **INV-1** | **National Custody Rule** | `bank-gateway-service` (:3002) | **PARTIAL / DOMAIN-ONLY** | Payment HTTP flow never calls the rail; delivery fabricates `FundLock` (`delivery-service/src/main.ts:49-52`). No real money movement. AUD-PLAT-006. |
| **INV-2** | **Beneficiary Lockdown** | `payment-service` (:3003) | **ENFORCED AT API (residual risk)** | Server resolves `merchant_accounts`; foreign destination → 403 (`payment-service/src/main.ts:208-214`). AUD-PLAT-002 RESOLVED. Residual: AUD-PLAT-022 (demo seed), AUD-PLAT-024 (auth status not checked). |
| **INV-3** | **Authority of Price** | `merchant-service` (:3004), `payment-service` (:3003) | **PARTIAL** | DB-backed `inventory_items` prices; but demo `merch-cafe-1`/`demo-*` fallback catalog remains, governance/TTL/limits unused. AUD-PLAT-004, -022. |
| **INV-4** | **Asymmetric QR Tokens** | `payment-service` (:3003) | **PARTIAL** | `/pay` now requires and verifies a signed token (signature, `ref`, expiry, nonce). Remaining: payer/rail not verified; nonce store per-process; keys generated at startup. AUD-PLAT-003, -008, -023. |
| **INV-5** | **Cashier Separation of Interest** | `merchant-service` (:3004) | **PARTIAL** | Server-side eligibility/till checks exist, but caller-supplied `userId` and no authentication. AUD-PLAT-001. |
| **INV-6** | **Double-Entry Constraint** | `ledger-service` (:3005) | **PARTIAL** | `postAtomicBatch` writes both journals + outbox in one transaction with `ΣD = ΣC > 0`. No idempotency, no DB trigger, HTTP path bypasses the `Journal` aggregate. AUD-PLAT-005, -012. |
| **INV-7** | **Pre-Consumption Escrow** | `delivery-service` (:3006) | **PARTIAL** | Check ordering is correct, but GPS is caller-supplied and the hold is not bank-backed. AUD-PLAT-006. |

---

## 2. Test Verification Ledger

**Re-verified 2026-11-24 (R2)** against live local PostgreSQL :5433, Redis :6379, Kafka :9092, Zookeeper.

| Workspace / Package | Tests Run | Pass | Fail | Notes |
|---|---:|---:|---:|---|
| `@finsync/bank-gateway-service` | 9 | 9 | 0 | Native split, clearing-pool fallback, fund locks |
| `@finsync/delivery-service` | 15 | 15 | 0 | Domain tests; bank rail not exercised |
| `@finsync/ledger-service` | 14 | 14 | 0 | Balanced postings; no rollback/idempotency test |
| `@finsync/merchant-service` | 25 | 25 | 0 | Catalog, anti-collusion, governance, till sessions |
| `@finsync/payment-service` | 16 | 16 | 0 | Includes 403 foreign-destination, 400 no-token, 400 replay; relies on demo fixture |
| `@finsync/tax-gateway-service` | 6 | 6 | 0 | TIN validation, 15% VAT |
| `@finsync/user-service` | 5 | 5 | 0 | Hashing, KYC (domain) |
| `test/e2e-lifecycle.test.js` | 1 | 1 | 0 | Domain-object lifecycle; does **not** use HTTP |
| **Total** | **91** | **91** | **0** | **100% passing** |

> Green tests are necessary but not sufficient. Known uncovered paths: cross-merchant/item token binding, merchant `auth_status`, governance/limits, ledger rollback and idempotency, bank-rail delivery, outbox duplicate/loss, auth on every endpoint.

---

## 3. Audit Reports Directory

- [AUDIT-PLATFORM-2026-11-24-R2.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/reports/AUDIT-PLATFORM-2026-11-24-R2.md) &mdash; **Latest.** Verification of Phase A remediation. 1 resolved, 4 partial, 3 new findings. 23 outstanding.
- [AUDIT-PLATFORM-2026-11-24.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/reports/AUDIT-PLATFORM-2026-11-24.md) &mdash; Baseline platform audit. 21 findings; full evidence.
- [FINSYNC_CODE_AUDIT.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/reports/FINSYNC_CODE_AUDIT.md) &mdash; Original deep architectural/security review (10 P0 + P1 table).
- [AUDIT_REPORT.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/reports/AUDIT_REPORT.md) &mdash; Executive summary. **Superseded** by runtime evidence.

---

## 4. Sign-Offs

- [SIGN-OFF-PHASE-A-2026-11-24.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/sign-off/SIGN-OFF-PHASE-A-2026-11-24.md) &mdash; Phase A remediation sign-off (payment-service + ledger-service). **Qualified:** its RESOLVED claims for AUD-PLAT-003/-005/-008 are downgraded to PARTIALLY RESOLVED by R2. AUD-PLAT-002 is confirmed RESOLVED.
- [PHASE_0_EXIT_SIGNOFF.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/sign-off/PHASE_0_EXIT_SIGNOFF.md) &mdash; Phase 0 gate dossier (G-1…G-6). **Partially unsupported:** G-2, G-3, G-4 do not hold in the running system. Not a remediation sign-off.

---

## 5. Audit History

| Audit ID | Date | Scope | Result |
|---|---|---|---|
| `AUD-PLATFORM-2026-11-24-R2` | 2026-11-24 | Verify Phase A remediation | 002 RESOLVED; 003/004/005/008 PARTIAL; 022/023/024 NEW. 23 outstanding. |
| `SIGN-OFF-PHASE-A-2026-11-24` | 2026-11-24 | Remediation of payment/ledger critical invariants | PARTIAL SIGN-OFF issued; qualified by R2 |
| `AUD-PLATFORM-2026-11-24` | 2026-11-24 | Platform-wide runtime invariant audit | 21 findings (5 CRITICAL / 8 HIGH / 5 MEDIUM / 3 LOW) |
| `FINSYNC_CODE_AUDIT` | 2026-11-24 | Deep code/architecture review | 10 P0 + ~20 P1; "sandbox only" |
| `AUDIT_REPORT` | 2026-11-24 | Executive readiness summary | Superseded |

**Build/test verification at latest audit:** build exit 0; 90/90 workspace tests; 1/1 e2e (combined exit 0).

---

## 6. Outstanding Findings

23 outstanding. Statuses: OPEN or PARTIALLY RESOLVED. No finding is closed without code + targeted-test evidence.

| ID | Severity | Status | Title |
|---|---|---|---|
| AUD-PLAT-001 | CRITICAL | OPEN | No authentication or authorization; identity from request bodies |
| AUD-PLAT-003 | CRITICAL | PARTIALLY RESOLVED | QR enforced; payer identity/account ownership/rail confirmation still missing |
| AUD-PLAT-004 | CRITICAL | PARTIALLY RESOLVED | DB prices wired; demo fallback, governance, TTL and limits remain |
| AUD-PLAT-005 | CRITICAL | PARTIALLY RESOLVED | Atomic batch; idempotency and DB-level balance trigger remain |
| AUD-PLAT-006 | HIGH | OPEN | Delivery escrow local; no bank lock/settle; spoofable GPS |
| AUD-PLAT-007 | HIGH | OPEN | Merchant/TIN authorization rubber stamp |
| AUD-PLAT-008 | HIGH | PARTIALLY RESOLVED | Non-destructive inspect fixed; nonce store and keys still per-process |
| AUD-PLAT-009 | HIGH | OPEN | In-memory HTTP persistence; duplicated payment lines |
| AUD-PLAT-010 | HIGH | OPEN | Delivery rehydration corrupts lock; public setters bypass FSM |
| AUD-PLAT-011 | HIGH | OPEN | No orchestration/consumers; e2e never exercises HTTP |
| AUD-PLAT-012 | HIGH | OPEN | DB constraint gaps (balance trigger, idempotency, enums, totals) |
| AUD-PLAT-013 | HIGH | OPEN | National ID unpeppered in HTTP path; placeholder KYC proofs |
| AUD-PLAT-014 | MEDIUM | OPEN | Hardcoded secrets and exposed local data stores |
| AUD-PLAT-015 | MEDIUM | OPEN | Outbox sends inside DB transaction; no retry/DLQ |
| AUD-PLAT-016 | MEDIUM | OPEN | Missing input validation and error handling |
| AUD-PLAT-017 | MEDIUM | OPEN | Audit documents overstate compliance; domain-only evidence |
| AUD-PLAT-018 | MEDIUM | OPEN | Terraform lacks compute/ALB/IAM/KMS/hardening |
| AUD-PLAT-019 | LOW | OPEN | No observability, readiness or graceful shutdown |
| AUD-PLAT-020 | LOW | OPEN | Money stored as floating-point `number` |
| AUD-PLAT-021 | LOW | OPEN | Repository rehydration mutates invariants via `as any`/setters |
| AUD-PLAT-022 | MEDIUM | OPEN (NEW) | Hardcoded demo fixtures in production payment path |
| AUD-PLAT-023 | LOW | OPEN (NEW) | `/pay` does not bind token kind/merchant |
| AUD-PLAT-024 | MEDIUM | OPEN (NEW) | Merchant authorization bypassed; shared-DB coupling |

**Severity totals (outstanding):** CRITICAL 4 · HIGH 8 · MEDIUM 7 · LOW 4 · **Total 23**.

---

## 7. Resolved Findings

| ID | Severity | Resolved | Evidence |
|---|---|---|---|
| AUD-PLAT-002 | CRITICAL | 2026-11-24 (Phase A) | `payment-service/src/main.ts:208-214` resolves accounts server-side and returns 403 for a foreign destination; `http.test.ts:34-45` asserts it. Residual risks tracked as AUD-PLAT-022/-024. |

No other finding has met all of its original remediation criteria. Notably, `SIGN-OFF-PHASE-A` marked AUD-PLAT-003/-005/-008 RESOLVED, but R2 downgraded them to PARTIALLY RESOLVED with evidence.

---

## 8. Regression Watch

| Item | Watch reason |
|---|---|
| INV-2 account resolution | Any reintroduction of `body.registeredAccountIds` or a client-controlled allow-list is an immediate regression. |
| INV-3 price source | Demo fallback for `demo-*`/`merch-cafe-1` must not survive into any shared environment. |
| INV-4 token validation | `/validate-token` must stay non-destructive; `/pay` must remain the only nonce consumer. |
| INV-6 ledger atomicity | Do not split the batch again; do not remove the balance assertion before adding the DB trigger. |
| Test fixtures | Do not let HTTP tests pass because of runtime constants; seed the DB instead. |
| Merchant authorization | Account existence must not be treated as authorization to sell. |
| Audit register | Never mark an invariant COMPLIANT or a finding RESOLVED without runtime + targeted-test evidence. |

---

## 9. Consolidated Remediation Roadmap

### Phase A — Completed
- ✅ AUD-PLAT-002 Beneficiary lockdown (INV-2) — RESOLVED.
- ◐ AUD-PLAT-003/-004/-005/-008 — partial, see Phase A2.

### Phase A2 — Complete Phase A (next)
1. AUD-PLAT-003 Bind payer/account to an authenticated principal; add rail confirmation (or an explicit sandbox flag that forbids PAID without a rail reference).
2. AUD-PLAT-004 Remove demo price fallback; load governance policy; apply `qrTtlSeconds()`; enforce `PaymentLimit`.
3. AUD-PLAT-005 Idempotency key + unique constraint on journal entries; deferred balance trigger; rollback/idempotency tests.
4. AUD-PLAT-008 Wire an atomic distributed nonce store; load stable keys from KMS/secret config.
5. AUD-PLAT-022 Remove runtime demo fixtures; seed tests; fail closed on DB errors.
6. AUD-PLAT-024 Require `auth_status = 'AUTHORIZED'`; cache with TTL; go through merchant-service or a joined query.
7. AUD-PLAT-023 Validate token `k` and `mid` in `/pay`; add negative tests.

### Phase B — Coherence
8. AUD-PLAT-001 Authentication/authorization and service identity.
9. AUD-PLAT-006/-010 Bank-backed delivery locks, real settle/release, persisted lock state, cancel/timeout.
10. AUD-PLAT-007 Real TIN verification and virtual-merchant gating.
11. AUD-PLAT-009 PostgreSQL persistence on payment/user HTTP paths; fix duplicate lines; remove fixtures.
12. AUD-PLAT-011 Orchestration/consumers; HTTP-driven e2e.
13. AUD-PLAT-012 DB constraints; AUD-PLAT-013 privacy; AUD-PLAT-014 secrets; AUD-PLAT-015 outbox; AUD-PLAT-018 Terraform.

### Phase C — Engineering quality
14. AUD-PLAT-016 Validation/error mapping; AUD-PLAT-017 register corrections; AUD-PLAT-019/-020/-021 observability, decimal money, validated rehydration.
15. Add CI, migrations, lint/format, coverage thresholds.

---

## 10. Sign-Off History

| Sign-off | Date | Scope | Verdict |
|---|---|---|---|
| `SIGN-OFF-PHASE-A-2026-11-24.md` | 2026-11-24 | Phase A critical invariants (payment/ledger) | **PARTIAL SIGN-OFF** — verified by R2: AUD-PLAT-002 resolved; 003/004/005/008 partial; 3 new findings |
| `PHASE_0_EXIT_SIGNOFF.md` | 2026-11-24 | Phase 0 gates G-1…G-6 | "RECOMMENDED FOR FORMAL SIGN-OFF" — not a remediation sign-off; G-2/G-3/G-4 unsupported |

No full remediation sign-off exists. A Phase A2 sign-off is required before Phase B begins.

---

## 11. Next Recommended Action

Run `/sign-off` scoped to **AUD-PLAT Phase A2** (AUD-PLAT-003, -004, -005, -008, -022, -023, -024). After remediation, re-run:

```bash
cd code/unpacked/finsync-app
npm run build --workspaces --if-present
npm test --workspaces --if-present
npm run test:e2e
```

…plus targeted tests for: cross-merchant/item token rejection, PENDING/REJECTED merchant rejection, ledger mid-batch rollback, duplicate-posting suppression, and DB-level unbalanced-entry rejection.
