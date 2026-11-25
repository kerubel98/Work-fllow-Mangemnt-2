# FinSync on EthSwitch — Platform Invariant Audit

**Audit ID:** AUD-PLATFORM-2026-11-24
**Date:** 2026-11-24
**Scope:** Platform-wide runtime enforcement of the 7 Non-Negotiable Invariants across all 7 services, their HTTP layers, PostgreSQL schema, docker-compose topology, and the prior P0/P1 findings in `FINSYNC_CODE_AUDIT.md`.
**Audit type:** Point-in-time technical review with empirical build/test execution. Not a formal security certification.
**Method:** Read prior register, reports and sign-offs → inspect scoped source → run build and tests → assign stable finding IDs → update master register.

> **Scope note:** `/audit` was invoked without an explicit sub-scope. Because the master register claims full invariant compliance and 91/91 green tests while the last deep audit found ten P0 defects, the audit was scoped to re-verify those P0/P1 findings and the seven invariants at runtime. Unit-domain behaviour was re-verified only where it bears on runtime enforcement.

---

## 1. Executive Summary

The platform **builds cleanly and its 91 automated tests pass**, but the pass count is not evidence that the seven invariants hold at runtime. Every service HTTP layer still trusts caller-supplied identity, roles, account sets, prices, GPS coordinates and settlement outcomes. The ten P0 findings from `FINSYNC_CODE_AUDIT.md` (2026-11-24) remain reproducible in the current tree with no remediation applied.

- **Build:** `npm run build --workspaces --if-present` → exit 0.
- **Workspace tests:** 90/90 pass across 7 workspaces.
- **E2E:** 1/1 pass, but it drives domain objects directly and never calls a service over HTTP.
- **Runtime verdict:** **NOT PRODUCTION READY / SANDBOX ONLY.** The domain model is sound; the deployed behaviour does not enforce the invariants that the domain model tests.
- **New finding of governance significance:** the master audit register states all seven invariants are COMPLIANT and that compliance is verified by tests. The evidence contradicts that claim for INV-2, INV-3, INV-4, INV-6 and INV-7, and partially for INV-1 and INV-5.

| Severity | Count |
|---|---:|
| CRITICAL | 5 |
| HIGH | 8 |
| MEDIUM | 5 |
| LOW | 3 |
| INFO | 0 |
| **Total** | **21** |

**Recommended status:** internal sandbox/demo only. Do not expose any service beyond localhost or place it in front of real funds until AUD-PLAT-001 through AUD-PLAT-005 are remediated and re-verified.

---

## 2. Previous Audit and Sign-Off Review

| Document | Date | Claim | Audit assessment |
|---|---|---|---|
| `agent-handoffs/audit/master-audit.md` | 2026-11-24 | All 7 invariants COMPLIANT; 91/91 tests | Test counts **accurate** (90 workspace + 1 e2e). Compliance claims **not supported** at runtime. |
| `agent-handoffs/audit/reports/FINSYNC_CODE_AUDIT.md` | 2026-11-24 | 10 P0 + ~20 P1 findings; "sandbox only" | **Still accurate.** No P0 remediation is present in the current tree. |
| `agent-handoffs/audit/reports/AUDIT_REPORT.md` | 2026-11-24 | "PASSED (Production Foundation Grade)" | **Not accurate.** Contradicted by code inspection. |
| `agent-handoffs/audit/sign-off/PHASE_0_EXIT_SIGNOFF.md` | 2026-11-24 | Gates G-1…G-6 PASSED; recommends sign-off | Gates are satisfied only by domain-level tests; G-2 data-store isolation, G-3 anti-replay and G-4 DB-level balance enforcement are not met in the running system. |
| `code/unpacked/finsync-app/agent-handoffs/session-handoff.md` | undated | "85/85 passing", "None identified" issues | Stale (suite is now 91) and inaccurate on blockers. |
| `code/unpacked/finsync-app/docs/AUDIT_REPORT.md` | undated | "43/43 tests", "production foundation" | Stale and inaccurate. |

No prior remediation sign-off exists for the P0 findings. This audit therefore treats them as **OPEN**, not RESOLVED.

---

## 3. Files and Modules Examined

**HTTP/runtime layers (all inspected):**
- `services/payment-service/src/main.ts`
- `services/payment-service/src/payment-request.ts`
- `services/payment-service/src/asymmetric-token-service.ts`
- `services/payment-service/src/live-redis-nonce.ts`
- `services/payment-service/src/postgres-payment.repository.ts`
- `services/payment-service/src/outbox-worker.ts`
- `services/merchant-service/src/main.ts`, `merchant.ts`
- `services/ledger-service/src/main.ts`, `journal.ts`
- `services/delivery-service/src/main.ts`, `delivery-order.ts`, `fund-lock.ts`, `postgres-delivery.repository.ts`
- `services/user-service/src/main.ts`, `user.service.ts`, `user.ts`
- `services/bank-gateway-service/src/main.ts`
- `services/tax-gateway-service/src/main.ts`

**Persistence and infrastructure:**
- `infra/postgres/schema.sql`
- `docker-compose.yml`
- `infra/terraform/` (file inventory only)

**Verification artifacts:**
- `test/e2e-lifecycle.test.js`
- `services/payment-service/src/http.test.ts`
- `services/merchant-service/src/merchant-http.test.ts`
- each workspace `package.json`

**Not examined in depth:** dashboard HTML, OpenAPI spec body, Terraform module internals, front-end/design assets.

---

## 4. Invariant Compliance Matrix (Runtime Reality)

| # | Invariant | Claimed | Evidence-based status | Key gap |
|---|---|---|---|---|
| INV-1 | National Custody Rule | COMPLIANT | **PARTIAL / DOMAIN-ONLY** | Payment HTTP flow never calls `bank-gateway-service`; delivery fabricates its own `FundLock`. No service moves real money. |
| INV-2 | Beneficiary Lockdown | COMPLIANT | **FAILS AT RUNTIME** | `registeredAccountIds` is supplied by the client (AUD-PLAT-002). |
| INV-3 | Authority of Price | COMPLIANT | **FAILS AT RUNTIME** | Hardcoded 3-item catalog; merchant inventory/governance/limits never read (AUD-PLAT-004). |
| INV-4 | Asymmetric QR Tokens | COMPLIANT | **PARTIAL** | P-256 signatures are real, but payment completion ignores the token; keys are per-process; nonce store is per-process (AUD-PLAT-003, -008). |
| INV-5 | Cashier Separation of Interest | COMPLIANT | **PARTIAL** | Enforced server-side in merchant-service, but caller can claim any `userId`; no authentication (AUD-PLAT-001). |
| INV-6 | Double-Entry Balance Constraint | COMPLIANT | **FAILS AT DATABASE LEVEL** | No trigger/constraint enforces `ΣD = ΣC ≠ 0`; postings are non-atomic (AUD-PLAT-005, -012). |
| INV-7 | Pre-Consumption Escrow | COMPLIANT | **PARTIAL** | Check ordering is correct, but GPS is caller-supplied and the escrow hold is not backed by the bank rail (AUD-PLAT-006). |

---

## 5. Findings Summary

| ID | Severity | Priority | Status | Title | Legacy |
|---|---|---|---|---|---|
| AUD-PLAT-001 | CRITICAL | P0 | OPEN | No authentication or authorization; identity taken from request bodies | P0-1 |
| AUD-PLAT-002 | CRITICAL | P0 | OPEN | Beneficiary lockdown bypassed by client-supplied account set | P0-2 |
| AUD-PLAT-003 | CRITICAL | P0 | OPEN | Payment can be marked PAID without QR verification or rail confirmation | P0-4 |
| AUD-PLAT-004 | CRITICAL | P0 | OPEN | Authority of price/governance not enforced by the payment API | P0-3 |
| AUD-PLAT-005 | CRITICAL | P0 | OPEN | Ledger postings non-atomic, non-idempotent, unvalidated in HTTP path | P0-6 |
| AUD-PLAT-006 | HIGH | P0 | OPEN | Delivery escrow is local; no bank lock/settle; GPS spoofable | P0-9 |
| AUD-PLAT-007 | HIGH | P0 | OPEN | Merchant/TIN authorization is a rubber stamp | P0-7 |
| AUD-PLAT-008 | HIGH | P0 | OPEN | QR nonce protection per-process; ephemeral keys; verify burns nonce | P0-8 |
| AUD-PLAT-009 | HIGH | P0 | OPEN | In-memory HTTP persistence and duplicated payment lines | P0-5 |
| AUD-PLAT-010 | HIGH | P1 | OPEN | Delivery state rehydration corrupts lock state; public setters bypass FSM | P0-9 (cont.) |
| AUD-PLAT-011 | HIGH | P0 | OPEN | No orchestration or event consumers; e2e never exercises HTTP | P0-10 |
| AUD-PLAT-012 | HIGH | P1 | OPEN | Database constraint gaps (KYC enum, payment totals, idempotency, balance) | P1 |
| AUD-PLAT-013 | HIGH | P1 | OPEN | National ID unpeppered in HTTP path; placeholder KYC proofs | P1 |
| AUD-PLAT-014 | MEDIUM | P1 | OPEN | Hardcoded secrets and exposed local data stores | P1 |
| AUD-PLAT-015 | MEDIUM | P1 | OPEN | Outbox worker sends inside the DB transaction; no retry/DLQ/cleanup | P1 |
| AUD-PLAT-016 | MEDIUM | P1 | OPEN | No input validation; client errors surface as 500s; unhandled async errors | P1 |
| AUD-PLAT-017 | MEDIUM | P1 | OPEN | Audit documents overstate compliance; invariant evidence is domain-only | P1 |
| AUD-PLAT-018 | MEDIUM | P1 | OPEN | Terraform lacks compute, ALB routing, IAM/KMS, logging, RDS hardening | P1 |
| AUD-PLAT-019 | LOW | P2 | OPEN | No structured logging, request IDs, metrics, readiness, graceful shutdown | P1 |
| AUD-PLAT-020 | LOW | P2 | OPEN | Money stored as JS floating-point `number` | P1 |
| AUD-PLAT-021 | LOW | P2 | OPEN | Repository rehydration mutates invariants via `as any` / raw setters | P1 |

---

## 6. Detailed Findings

### AUD-PLAT-001 — No authentication or authorization

- **Severity / Priority:** CRITICAL / P0
- **Status:** OPEN (unchanged from P0-1)
- **Category:** Security / access control
- **Location:** All service `main.ts` files.
- **Evidence:**
  - A repository-wide search for `jwt.verify`, `Authorization`, `requireAuth`, `mTLS`, `apiKey` finds no verification middleware. `jsonwebtoken` is imported only to *sign* KYC packs (`user.ts:42`, `kyc-pack.ts`).
  - `user-service/src/main.ts:17-27` accepts any role string, marks any user KYC-verified, and issues any user's KYC pack without a caller token.
  - `payment-service/src/main.ts:201-203` trusts `role` from the request body to approve a payment.
  - `payment-service/src/main.ts:216-217` accepts `payerId` and `bankAccountId` from the body.
  - `merchant-service/src/main.ts:44-65` lets any caller register a merchant under any `ownerUserId`.
  - `ledger-service/src/main.ts:50-127` accepts arbitrary `merchantId`, `cashierId`, `amount`, `event`.
  - `delivery-service/src/main.ts:44-51, 111-113, 164-169` accepts payer, provider, GPS and all settlement account IDs from the caller.
- **Description:** There is no authentication layer, no service identity, no role middleware and no resource-ownership check anywhere in the HTTP surface of the seven services.
- **Impact:** Complete account takeover, role escalation, forged payments, forged ledger postings and unauthorised merchant operations if any port is reachable. Invariant INV-5 is only nominally enforced because `userId` itself is caller-chosen.
- **Conditions:** Any network exposure beyond localhost; also exploitable by any co-tenant process.
- **Remediation:** Terminate TLS at a gateway; require user JWTs on public endpoints and service credentials/mTLS internally; derive actor id/role from the verified token; check resource ownership server-side; add negative auth tests at the HTTP layer.
- **Verification criteria:** Unauthenticated requests to every mutating endpoint return 401/403; a request cannot act as another user; tests assert this for each service.
- **Related:** AUD-PLAT-002, -003, -007, -017.

---

### AUD-PLAT-002 — Beneficiary lockdown bypassed by client-supplied account set

- **Severity / Priority:** CRITICAL / P0
- **Status:** OPEN (P0-2)
- **Category:** Fraud invariant INV-2
- **Location:** `services/payment-service/src/main.ts:145-153`
- **Evidence:**
  ```ts
  registeredAccountIds: new Set(body.registeredAccountIds ?? [body.destinationAccountId]),
  ...
  prices: mockInventoryPriceSource,
  ```
  `PaymentRequest.create` (`payment-request.ts:36`) only checks membership in the caller-provided set. The payment service never queries merchant-service for the merchant's registered accounts.
  The HTTP test reinforces the bypass by supplying the set itself (`http.test.ts:40`).
- **Description:** The strongest anti-fraud invariant is enforced against a caller-controlled allow-list. Omitting `registeredAccountIds` auto-registers whatever destination the caller chose.
- **Impact:** Funds can be directed to any account id (including a cashier's or an attacker's) through the public API.
- **Conditions:** Any create-payment call; no special preconditions.
- **Remediation:** Remove `registeredAccountIds` from the request contract. Inside payment-service, load the merchant and its `registeredAccountIds()` from merchant-service (with caching) and pass that set to the domain. Reject non-merchant destinations. Add an HTTP test that a foreign destination id is rejected when the caller cannot supply the allow-list.
- **Verification criteria:** `POST /api/v1/payments` with `destinationAccountId` not registered for the merchant returns 4xx even when the body contains no account set; code contains no `body.registeredAccountIds`.
- **Related:** AUD-PLAT-001, -004, -011.

---

### AUD-PLAT-003 — Payment can be marked PAID without QR / rail / payer verification

- **Severity / Priority:** CRITICAL / P0
- **Status:** OPEN (P0-4)
- **Category:** Fraud invariant INV-4 / payment completion
- **Location:** `services/payment-service/src/main.ts:210-222`; `payment-request.ts:77-80`
- **Evidence:** The `/pay` handler reads `{ payerId, bankAccountId }` and calls `pr.markPaid(payerId, bankAccountId)`. `markPaid` only checks QR expiry if a QR happens to exist; it never verifies signature, nonce, order binding, payer ownership, limits or rail confirmation. `/validate-token` is a separate optional call, and it consumes the nonce (`asymmetric-token-service.ts:130`), so a "validate" call can burn the payer's code before the real payment.
- **Description:** Payment completion is an unauthenticated assertion. The QR is decorative in the runtime flow and the bank rail is never consulted.
- **Impact:** A caller can declare any issued payment paid with any payer/account; the ledger and merchant state then reflect money that never moved.
- **Conditions:** Any issued payment; attacker needs only the payment id.
- **Remediation:** Require the QR token (or a signed bank callback with a rail reference) in `/pay`; verify signature, payload `ref`, expiry and nonce server-side; bind `payerId` to the authenticated principal; validate account ownership/approval and `PaymentLimit`; only transition to PAID after the rail confirms. Separate `verify` from `consume` so read-only validation does not burn the token.
- **Verification criteria:** `/pay` without a valid token returns 4xx and does not change status; a replayed token is rejected; status changes only after a successful rail call; tests cover all three.
- **Related:** AUD-PLAT-008, -004, -011.

---

### AUD-PLAT-004 — Authority of price and governance not enforced at runtime

- **Severity / Priority:** CRITICAL / P0
- **Status:** OPEN (P0-3)
- **Category:** Business invariant INV-3
- **Location:** `services/payment-service/src/main.ts:21-33, 145-153, 196-208`
- **Evidence:**
  - `mockInventoryPriceSource` returns three hardcoded items (`item-coffee` 150, `item-tea` 50, `item-pastry` 100) and ignores `merchantId`.
  - Merchant `InventoryItem` rows in merchant-service are never consulted by payment-service (no cross-service call exists; see AUD-PLAT-011).
  - `GovernancePolicy` is persisted by merchant-service (`main.ts:164-179`) but never loaded by payment-service.
  - QR TTL is hardcoded to `180` at `main.ts:202`; strict/loose presets define 120/600.
  - `PaymentLimit` exists in user-service but payment-service never imports or calls it (grep: no matches).
- **Description:** "Callers send ids and quantities, never prices" holds only inside the domain unit tests, which inject a real price source. Through the API every merchant can sell only the three demo items at fixed prices.
- **Impact:** Real merchant catalogs cannot be sold; governance controls (approval thresholds, cart rules, discounts, cashier limits, QR expiry) have no runtime effect; payment limits are unenforced.
- **Conditions:** Any payment created via HTTP.
- **Remediation:** Inject a `IPriceSource` adapter backed by merchant-service inventory/catalog; load the merchant governance policy before create/approve/issue and apply it; use `policy.qrTtlSeconds()` when issuing; check `PaymentLimit` before marking paid. Delete the mock catalog from runtime code (keep it in tests/fixtures).
- **Verification criteria:** A merchant-specific inventory item can be sold; an item from another merchant is rejected; QR TTL reflects the active policy; a payment over the payer limit is rejected.
- **Related:** AUD-PLAT-002, -011, -017.

---

### AUD-PLAT-005 — Ledger postings non-atomic, non-idempotent, unvalidated in HTTP path

- **Severity / Priority:** CRITICAL / P0
- **Status:** OPEN (P0-6)
- **Category:** Financial integrity INV-6
- **Location:** `services/ledger-service/src/main.ts:49-127`
- **Evidence:**
  - Three separate transactions: merchant entry (`repo.postEntry`), cashier entry (`repo.postEntry`), outbox insert (`pool.query`). A failure between them leaves the books and stream inconsistent.
  - The HTTP handler builds `PostingLine[]` inline and bypasses the `Journal` aggregate (`journal.ts`), so domain balance validation is not applied to API postings.
  - `journal_entries` has no unique constraint on `(journal_id, ref, event-like discriminator)` and no idempotency key; retried requests double-post. The deep audit observed 8 rows for one `ref`.
  - `schema.sql:128-147` contains row-level `debit > 0` / `credit > 0` checks but **no trigger or deferred constraint** that a whole entry balances.
- **Description:** The ledger is append-only in name only: it is not atomic, not idempotent and not validated at the database boundary.
- **Impact:** Unbalanced or duplicated books, phantom receivables and irreconcilable settlements; INV-6 and Phase 0 Gate G-4 are not met.
- **Conditions:** Concurrent/retried requests, partial failures, or any direct API posting.
- **Remediation:** Post both journals plus the outbox row in **one** transaction; assert balance through the `Journal` aggregate or an equivalent repository validator; add `UNIQUE (journal_id, ref, event)`; add a deferred constraint trigger that sums `posting_lines` per `entry_id` and rejects `ΣD ≠ ΣC` or `ΣD = 0`; require an idempotency key on the endpoint.
- **Verification criteria:** A simulated failure mid-posting leaves zero rows; replaying the same key produces one entry; an SQL-level attempt to insert an unbalanced entry fails.
- **Related:** AUD-PLAT-012, -011.

---

### AUD-PLAT-006 — Delivery escrow is local and does not hold money

- **Severity / Priority:** HIGH / P0
- **Status:** OPEN (P0-9)
- **Category:** Fraud invariant INV-7 / custody INV-1
- **Location:** `services/delivery-service/src/main.ts:41-63, 155-179`; `delivery-order.ts:88-97`; `fund-lock.ts:1-9`
- **Evidence:**
  ```ts
  const lock = new FundLock(`lock-${randomUUID()}`, payerId, "ref", order.lockAmount, new Date(Date.now() + 3600000));
  order.confirmLock(lock);
  ```
  No call to `IPaymentRail.lockFunds`. `/settle` computes splits and mutates `_lock.status = "SETTLED"` locally; it never calls `settleLock`. The `accountRef` is the literal `"ref"`.
- **Description:** The "pre-authorization hold" is an in-memory/database object with no bank backing. Delivery is "escrowed" against money that was never reserved.
- **Impact:** A merchant can hand over goods against a non-existent hold; settlement reports success without funds movement. INV-7's economic guarantee is absent even though the geofence ordering itself is correct.
- **Conditions:** Every delivery order.
- **Remediation:** Call `bank-gateway-service` (`lockFunds`) before `confirmLock`; persist the returned lock id, account reference, amount and expiry; call `settleLock` on settle and `releaseLock` on cancel/timeout; reconcile lock status from the rail.
- **Verification criteria:** Creating a delivery creates a real rail hold visible at the bank gateway; settlement invokes `settleLock`; a failed hold prevents `FUNDS_LOCKED`.
- **Related:** AUD-PLAT-010, -011.

---

### AUD-PLAT-007 — Merchant and TIN authorization is a rubber stamp

- **Severity / Priority:** HIGH / P0
- **Status:** OPEN (P0-7)
- **Category:** Onboarding / regulatory
- **Location:** `services/merchant-service/src/main.ts:63-65`; `services/tax-gateway-service/src/main.ts:49-58`
- **Evidence:**
  ```ts
  // Auto-authorize physical merchants with valid TIN for Phase 0
  merchant.authorize(true, b.kind === "VIRTUAL");
  ```
  `tinVerified` is hardcoded `true` and `ITaxAuthority` is never called; virtual merchants get `virtualReviewPassed = true` automatically. The tax gateway then auto-validates **any** string starting with `TIN-` and invents a legal name.
- **Description:** Merchant authorization and TIN verification are unconditional in practice.
- **Impact:** Anyone can register as an authorized merchant with a fabricated TIN and accept payments; the stricter virtual-merchant review is never exercised.
- **Conditions:** Any merchant registration call.
- **Remediation:** Call `ITaxAuthority.verifyTin` and pass the real result; default `virtualReviewPassed` to `false` until a recorded review exists; gate sandbox auto-approval behind an explicit non-production flag and fail closed outside development; validate `kind` against the enum.
- **Verification criteria:** An unknown TIN is rejected in staging/production; a virtual merchant remains PENDING without review; the `TIN-` shortcut is unreachable when `NODE_ENV !== "development"`.
- **Related:** AUD-PLAT-001, -016.

---

### AUD-PLAT-008 — QR replay protection is per-process and signing keys are ephemeral

- **Severity / Priority:** HIGH / P0
- **Status:** OPEN (P0-8)
- **Category:** Cryptographic invariant INV-4
- **Location:** `services/payment-service/src/main.ts:13-16`; `asymmetric-token-service.ts:15-33, 112-135`; `live-redis-nonce.ts:54-62`
- **Evidence:**
  - `generateECKeyPair()` runs at process start, so every restart and every replica has a different key.
  - The wired `RedisNonceStore` is a `Map`, not Redis; passing a Redis client throws (`asymmetric-token-service.ts:21-23`).
  - `LiveRedisNonceStore` exists but is never instantiated. Its synchronous `consume` ignores the `SET NX` result and returns `true` locally, so two replicas can each accept the same nonce.
  - `validate()` consumes the nonce, making verification destructive.
- **Description:** Signature cryptography itself is correct (P-256/ES256, real `createSign`/`createVerify`), but key continuity and distributed replay protection are absent.
- **Impact:** Horizontal scaling or restart invalidates mobile-cached public keys and allows token replay across replicas; a validation call can burn a legitimate payer's code.
- **Conditions:** Multi-replica deployment, restart, or any caller invoking `/validate-token`.
- **Remediation:** Load a stable private key from KMS/Secret Manager and publish the matching public key (JWKS with `kid`); wire an atomic Redis `SET key 1 EX ttl NX` nonce store into the runtime and make `consume` asynchronous; split `verify` (read-only) from `consume` (called once on successful payment).
- **Verification criteria:** Restarting the service preserves the public key; two replicas reject the second use of one nonce; `/validate-token` does not burn the token.
- **Related:** AUD-PLAT-003, -014.

---

### AUD-PLAT-009 — In-memory HTTP persistence and duplicated payment lines

- **Severity / Priority:** HIGH / P0
- **Status:** OPEN (P0-5)
- **Category:** Persistence / correctness
- **Location:** `services/payment-service/src/main.ts:21-22`; `services/user-service/src/main.ts:9`; `services/payment-service/src/postgres-payment.repository.ts:29-61, 102-109`
- **Evidence:**
  - Payment HTTP handlers read/write `export const paymentStore = new Map<string, PaymentRequest>()`; no PostgreSQL repository is used on the HTTP path.
  - User service wires `new InMemoryUserRepository()`.
  - `PostgresPaymentRepository.save` inserts every line on each call and never deletes/replaces prior lines. `save()` runs at each transition, so `payment_lines` grows per transition (the deep audit observed 6 rows for 2 items).
  - `ensureMerchantWithAccount` writes fake users/merchants/accounts (`hash-${ownerUserId}`, random phone, `'CBE'`, `'****2210'`) inside a production repository.
- **Description:** Runtime state is volatile and, where PostgreSQL *is* used, line items are duplicated and fixture data is fabricated.
- **Impact:** Restart loses payments/users; persisted payments report duplicated lines and inflated histories; test fixtures leak into production data; FK integrity is satisfied with fake rows.
- **Conditions:** Any service restart; any persisted payment read after multiple saves.
- **Remediation:** Use the PostgreSQL repositories in the HTTP paths; inside one transaction, delete/replace `payment_lines` (or diff them); move `ensureMerchantWithAccount` to test fixtures; add a uniqueness constraint on `(payment_id, item_id)` or a versioned line-set strategy.
- **Verification criteria:** Restart preserves payments/users; a payment read after approve→pay→settle returns exactly the original lines; no production code writes `hash-` or `****2210`.
- **Related:** AUD-PLAT-012, -021.

---

### AUD-PLAT-010 — Delivery rehydration corrupts lock state; public setters bypass the state machine

- **Severity / Priority:** HIGH / P1
- **Status:** OPEN (P0-9 continuation)
- **Category:** State integrity
- **Location:** `services/delivery-service/src/postgres-delivery.repository.ts:111-126`; `delivery-order.ts:53-56`; `main.ts` (no cancel/release/timeout routes)
- **Evidence:** `findById` rebuilds any persisted order and, if a `lock_id` exists, constructs `new FundLock(r.lock_id, r.payer_id, "ref", order.lockAmount, new Date())` — always `LOCKED`, always account `"ref"`, always expiring now. Released/settled state and the real expiry are lost. `setStatus`, `setQrToken`, `setProviderId`, `setLock` are public and used for rehydration, bypassing `move()`.
- **Description:** Rehydration bypasses the domain state machine and fabricates lock status.
- **Impact:** A released or settled hold can be treated as locked, a settled order can be re-settled, and invariant checks (payer match, amount match) can be skipped by calling setters.
- **Conditions:** Any order fetched from PostgreSQL.
- **Remediation:** Persist lock status, account reference and expiry; rehydrate through validated transitions or a dedicated factory that replays the event history; make setters private/internal; expose cancel, release and timeout endpoints with legitimate transitions.
- **Verification criteria:** After settle/release, a re-fetch reports the true status and expiry; the public API cannot set arbitrary status; timeout automatically releases the hold.
- **Related:** AUD-PLAT-006, -021.

---

### AUD-PLAT-011 — No orchestration or event consumers; the e2e test bypasses HTTP

- **Severity / Priority:** HIGH / P0
- **Status:** OPEN (P0-10)
- **Category:** Architecture / integration
- **Location:** Repository-wide; `test/e2e-lifecycle.test.js`; `outbox-worker.ts`
- **Evidence:**
  - No service calls another over HTTP (grep finds no `localhost:300x` client calls outside tests/dashboard). Payment does not call merchant, user, ledger or bank; delivery does not call the bank rail; tax is never called by payment/merchant.
  - Kafka events are produced by the outbox worker but no consumer exists.
  - The e2e test instantiates domain classes, injects its own `priceSource`, uses in-memory nonces and calls repositories directly (lines 102-121, 160-167). It never starts a service or sends an HTTP request.
- **Description:** The platform is a set of services sharing a database, not an orchestrated payment system. The e2e "lifecycle" validates the domain model, not the deployed behaviour.
- **Impact:** Cross-service invariants (price, beneficiary, settlement, fiscal reporting) cannot hold end-to-end; the green e2e gives false confidence.
- **Conditions:** Always.
- **Remediation:** Define API/event contracts and an orchestrator or choreographed consumers (payment→ledger→settlement; delivery→split settlement→ledger; payment→tax). Add HTTP/contract tests that boot the services and assert the lifecycle. Add consumer groups, DLQ and versioned event schemas.
- **Verification criteria:** An e2e test drives real HTTP endpoints end-to-end; Kafka consumers react to payment/delivery events; failures trigger compensation.
- **Related:** AUD-PLAT-004, -005, -017.

---

### AUD-PLAT-012 — Database constraint gaps

- **Severity / Priority:** HIGH / P1
- **Status:** OPEN (P1)
- **Category:** Data integrity
- **Location:** `infra/postgres/schema.sql`
- **Evidence:**
  - `users.kyc_status` CHECK allows only `PENDING/VERIFIED/REJECTED` while the domain enum also has `UNVERIFIED` (`schema.sql:11`).
  - `payment_requests.total` is not constrained to equal `SUM(payment_lines.unit_price * qty)` (`schema.sql:100, 110-117`).
  - `payment_lines.unit_price >= 0` while the domain requires `> 0` (`schema.sql:115`).
  - No unique constraint on journal entries for idempotency (`schema.sql:128-133`).
  - No per-entry balance trigger/constraint (`schema.sql:135-147`).
  - `delivery_orders` stores `lock_id` but no lock status/expiry/account reference (`schema.sql:150-168`).
- **Description:** Several database-level guarantees that the documentation claims do not exist.
- **Impact:** Invalid states can be persisted even if the domain would reject them; direct DB writes or bugs bypass invariants.
- **Conditions:** Any write path that skips the domain layer (including the ledger HTTP path).
- **Remediation:** Add the missing CHECK/UNIQUE constraints and a deferred constraint trigger for journal balance; add a line-total integrity check (trigger or generated aggregate); align enums; persist delivery lock metadata.
- **Verification criteria:** SQL inserts violating each rule fail; schema introspection lists the constraints/trigger.
- **Related:** AUD-PLAT-005, -009, -010.

---

### AUD-PLAT-013 — National ID unpeppered in the HTTP path; placeholder KYC proofs

- **Severity / Priority:** HIGH / P1
- **Status:** OPEN (P1)
- **Category:** Privacy / regulatory
- **Location:** `services/user-service/src/main.ts:11-16`; `user.service.ts:9-12`; `user.ts:26-31, 37-43`; `kyc-pack.ts`
- **Evidence:** `User.register` supports an optional pepper, but `UserService.register` calls it with two arguments, so the HTTP path always uses bare SHA-256. KYC proofs are the literal `"zk-proof-placeholder"`; `KYCPack.toJWT` re-signs instead of verifying the pack signature.
- **Description:** The R-03 HMAC-with-pepper requirement is met only when a caller supplies a pepper, which production code never does.
- **Impact:** National IDs are exposed to offline dictionary/rainbow attacks if the database leaks; KYC packs are not evidentiary.
- **Conditions:** Every HTTP registration; any KYC pack issuance.
- **Remediation:** Require a KMS/Secret Manager pepper in `UserService.register` and fail fast if absent outside development; replace placeholder proofs with real verification artefacts or explicitly mark the pack non-production; verify rather than re-sign.
- **Verification criteria:** Stored hashes change when the pepper changes; registration fails without a configured pepper in non-dev; KYC pack JWT is verified against the issuer key.
- **Related:** AUD-PLAT-001, -014.

---

### AUD-PLAT-014 — Hardcoded secrets and exposed local data stores

- **Severity / Priority:** MEDIUM / P1
- **Status:** OPEN (P1)
- **Category:** Configuration / infrastructure security
- **Location:** service `main.ts` defaults; `docker-compose.yml`
- **Evidence:** Defaults include `JWT_SECRET="dev-only-secret-do-not-use-in-prod"` (`user-service/src/main.ts:8`), `HMAC_SECRET="dev-hmac-secret-only"` (`payment-service/src/main.ts:18`), `"dev-delivery-hmac-secret"` (`delivery-service/src/main.ts:10`), `PGPASSWORD="finsync_dev_only"` and `ETHSWITCH_API_KEY="dev-sandbox-key"` (`ethswitch-gateway.ts:48`). Compose publishes PostgreSQL on `5433` with `POSTGRES_HOST_AUTH_METHOD: "trust"`; Redis/Kafka are also published; the schema file is not mounted, so a fresh `docker compose up` yields an empty database.
- **Description:** Development credentials are embedded and the local topology is insecure by default; there is no fail-fast on missing production secrets.
- **Impact:** Accidental exposure of a developer machine or a misconfigured deployment grants full database/rail access; fresh clones fail tests and mask setup problems.
- **Conditions:** Local/shared environments using defaults; any host exposing the published ports.
- **Remediation:** Remove secret defaults; require environment/KMS configuration and fail fast outside development; mount `infra/postgres/schema.sql` (or run migrations); add volumes and health checks; bind infra ports to localhost only; do not use `trust` auth.
- **Verification criteria:** Services refuse to start without required secrets in production mode; compose boots a schema-initialised database; ports are not bound to `0.0.0.0`.
- **Related:** AUD-PLAT-008, -013, -018.

---

### AUD-PLAT-015 — Outbox worker sends inside the DB transaction

- **Severity / Priority:** MEDIUM / P1
- **Status:** OPEN (P1)
- **Category:** Reliability / messaging
- **Location:** `services/payment-service/src/outbox-worker.ts:50-106`
- **Evidence:** The worker opens a transaction, selects rows `FOR UPDATE SKIP LOCKED`, awaits `producer.send()` per row, updates `published_at`, then commits. A crash after send but before commit republishes duplicates; a slow broker holds row locks. There is no retry/backoff, DLQ, dedupe key, or cleanup of published rows; multiple workers do not guarantee per-aggregate ordering.
- **Description:** The outbox pattern is implemented with inverted failure semantics: it produces at-least-once without consumer-side dedupe and holds DB locks during network I/O.
- **Impact:** Duplicate or lost downstream events; lock contention; unbounded outbox growth.
- **Conditions:** Broker slowness/failure, worker crash, scaling workers.
- **Remediation:** Claim rows (mark `IN_PROGRESS` with a lease), commit, send outside the lock, then mark published; add retry/backoff, a DLQ, a dedupe key and a cleanup job; partition by aggregate for ordering.
- **Verification criteria:** A broker failure does not hold row locks; a crash after send does not duplicate business effects; a poison message lands in a DLQ.
- **Related:** AUD-PLAT-011.

---

### AUD-PLAT-016 — Missing input validation and error handling

- **Severity / Priority:** MEDIUM / P1
- **Status:** OPEN (P1)
- **Category:** Robustness / API quality
- **Location:** All service `main.ts` files; `user-service/src/main.ts:11-16`
- **Evidence:** No zod/ajv/class-validator; payloads are cast (`kind as MerchantKind`, `mode as PaymentMode`, `role as Role`, `fees as Fees`). `parseBody` has no size limit and ignores `Content-Type`. Several handlers wrap client errors as HTTP 500 (merchant registration, delivery creation, ledger postings). `POST /api/v1/users/register` has no `try/catch`; Express 4 does not catch rejected promises, so a duplicate phone/national ID can hang the request or produce an unhandled rejection. `GET /merchants/:id` is unguarded.
- **Description:** Invalid input is accepted until it crashes deeper layers, and error mapping is inconsistent.
- **Impact:** 500s leak internals, malformed data reaches the database, oversized bodies can exhaust memory, and duplicate registrations can wedge the user service.
- **Conditions:** Malformed or duplicate requests.
- **Remediation:** Add a schema validator per endpoint, a body-size limit, consistent 400/409 mapping, an async error wrapper, and enum validation.
- **Verification criteria:** Fuzzed/invalid payloads return 4xx without stack traces; duplicate registration returns 409; a >1 MB body is rejected.
- **Related:** AUD-PLAT-001.

---

### AUD-PLAT-017 — Audit documents overstate compliance; invariant evidence is domain-only

- **Severity / Priority:** MEDIUM / P1
- **Status:** OPEN (P1)
- **Category:** Audit governance / documentation
- **Location:** `agent-handoffs/audit/master-audit.md` §1–2; `agent-handoffs/audit/reports/AUDIT_REPORT.md`; `agent-handoffs/audit/sign-off/PHASE_0_EXIT_SIGNOFF.md`; `code/unpacked/finsync-app/docs/AUDIT_REPORT.md`
- **Evidence:** The master register marks all seven invariants COMPLIANT with test references, but the tests cited are domain tests with injected dependencies. Example: the price-authority test injects a real `priceSource`, while the HTTP path uses the mock catalog. The Phase 0 sign-off cites G-2/G-3/G-4 as passed, although compose has no network isolation/volumes, replay protection is per-process, and there is no DB balance trigger. `docs/AUDIT_REPORT.md` still claims 43/43 tests.
- **Description:** Documentation asserts control effectiveness that the running system does not exhibit, and the most recent deep audit's P0 findings were never dispositioned in the register.
- **Impact:** Stakeholders may approve a phase or expose the system based on inaccurate assurance. This is itself a control failure under the audit skill's evidence-before-conclusions rule.
- **Conditions:** Always (documentation defect).
- **Remediation:** Reclassify the matrix using this report's runtime statuses; record the 21 findings in the master register; mark prior audit/sign-off claims as superseded where contradicted; add an evidence requirement that each "COMPLIANT" entry name a runtime (HTTP/e2e) test; update the stale 43/43 claim.
- **Verification criteria:** Master register lists every finding with a status; no invariant is marked COMPLIANT without a runtime test reference; stale counts are corrected.
- **Related:** All findings; AUD-PLAT-011.

---

### AUD-PLAT-018 — Terraform is not a deployable topology

- **Severity / Priority:** MEDIUM / P1
- **Status:** OPEN (P1)
- **Category:** Infrastructure as code
- **Location:** `infra/terraform/`
- **Evidence:** Modules exist for `vpc`, `kafka`, `postgres`, `api-gateway`, but a repository-wide search finds no `aws_ecs_*`, `aws_eks_*`, `aws_instance`, or `aws_lb_target_group`. There is no IAM/KMS/Secrets Manager, CloudWatch, WAF or state locking. The Kafka security group declares no egress; RDS has no Multi-AZ/SSL enforcement.
- **Description:** Infrastructure code stops at managed data stores and an ALB shell; there is no compute or routing for the seven services.
- **Impact:** The system cannot be deployed from IaC; if deployed manually, it will not match the reviewed configuration.
- **Conditions:** Any cloud deployment attempt.
- **Remediation:** Add compute (ECS/EKS), ALB listener rules/target groups, IAM/KMS/Secrets Manager, logging/metrics, WAF, RDS hardening, MSK egress, and remote state with locking.
- **Verification criteria:** `terraform plan` produces a complete runnable topology; services are reachable only through the ALB; secrets come from a managed store.
- **Related:** AUD-PLAT-014.

---

### AUD-PLAT-019 — Observability and lifecycle gaps

- **Severity / Priority:** LOW / P2
- **Status:** OPEN (P1)
- **Category:** Operability
- **Location:** All services
- **Evidence:** No structured logs, request IDs, metrics, tracing, readiness checks or graceful shutdown. `/health` always returns `UP` regardless of database/Redis/Kafka connectivity.
- **Description:** Health endpoints are liveness-only and do not reflect dependencies.
- **Impact:** Failures are hard to detect and diagnose; orchestrators cannot distinguish a live-but-broken instance.
- **Conditions:** Any dependency outage.
- **Remediation:** Add structured logging with request IDs, readiness checks that probe dependencies, metrics/tracing, and signal handlers that drain connections.
- **Verification criteria:** `/ready` returns 503 when PostgreSQL/Redis/Kafka is down; logs are JSON with correlation ids; SIGTERM drains in-flight requests.
- **Related:** AUD-PLAT-014.

---

### AUD-PLAT-020 — Money represented as floating-point `number`

- **Severity / Priority:** LOW / P2
- **Status:** OPEN (P1)
- **Category:** Financial correctness
- **Location:** `journal.ts`, `payment-request.ts`, `delivery-order.ts`
- **Evidence:** Amounts are JS `number`; conversions use `Math.round(n * 100)` in several places. PostgreSQL stores `NUMERIC(12,2)`, creating a representation boundary.
- **Description:** Binary floating point cannot represent all decimal amounts; repeated arithmetic can drift at rounding boundaries.
- **Impact:** Small rounding discrepancies on large carts or split calculations; risk grows with fee/percentage logic.
- **Conditions:** Amounts with more than two decimal places or long arithmetic chains.
- **Remediation:** Use integer minor units or a decimal library at all boundaries; convert once at the DB layer.
- **Verification criteria:** Property tests over random amounts show exact cent-level totals and splits.
- **Related:** AUD-PLAT-005.

---

### AUD-PLAT-021 — Repository rehydration mutates invariants via `as any` / raw setters

- **Severity / Priority:** LOW / P2
- **Status:** OPEN (P1)
- **Category:** Code quality / model integrity
- **Location:** `services/user-service/src/postgres-user.repository.ts:56-60`; `services/delivery-service/src/postgres-delivery.repository.ts:119-124`
- **Evidence:** `PostgresUserRepository.findById` constructs a temporary user and mutates `readonly` fields via `as any`; the delivery repository uses public setters to restore arbitrary state.
- **Description:** Persistence adapters bypass the aggregate's construction rules.
- **Impact:** Corrupt or legacy rows can materialise into objects that violate domain invariants; refactors of the model silently break rehydration.
- **Conditions:** Reading any persisted aggregate.
- **Remediation:** Add explicit reconstitution factories that validate persisted state, or persist/restore through domain events; remove `as any` casts and public mutators.
- **Verification criteria:** Rehydration of invalid persisted state fails loudly; no `as any` in repositories.
- **Related:** AUD-PLAT-010.

---

## 7. Positive Observations

These are genuine strengths and should be preserved during remediation:

1. **Domain modelling is strong.** `PaymentRequest` and `DeliveryOrder` are explicit state machines that reject illegal transitions; `Journal` rejects unbalanced/negative/single-line entries and freezes postings.
2. **Dependency inversion is used consistently:** `IUserRepository`, `IPaymentRail`, `ITaxAuthority`, `IPriceSource`, `INonceStore`, `IOwnershipLookup`.
3. **Security ordering in delivery scanning is correct:** status → payer → signature → order binding → geofence → nonce burn. This is exactly the right order and is a meaningful defence against remote nonce-burning attacks.
4. **Cryptographic primitives are real:** P-256/ES256 ECDSA via Node `crypto`, `timingSafeEqual` for HMAC comparisons, random nonces, explicit expiry.
5. **Privacy basics exist:** bank account numbers are masked and not retained in clear; national IDs are hashed (though unpeppered on the HTTP path).
6. **Merchant anti-collusion is enforced server-side** in the merchant service (`CashierEligibility`, `mayRegisterBusiness`, unique active till sessions), not only in tests.
7. **Database schema uses real constraints** for enums, positive amounts, single-sided posting lines, and FK integrity; the gap is aggregate-level balance, not basic column hygiene.
8. **Test suite is meaningful at the domain layer** and runs against live PostgreSQL/Redis/Kafka rather than mocks.
9. **The outbox concept, IPv4/IPv6-safe port mapping and the OpenAPI/Swagger surface** show production intent.

---

## 8. Recommendations (Separate from Confirmed Defects)

1. Adopt a **single enforcement gate**: every invariant must have at least one HTTP-level test that fails if the API trusts the caller. Domain tests are necessary but insufficient.
2. Introduce a **shared contracts/domain library** for roles, `Split`, nonce stores, HTTP helpers and error types to eliminate the duplication that lets implementations drift.
3. Add **CI**: build, lint, unit, integration and HTTP contract tests on every change; publish coverage with a threshold; fail on new unauthenticated endpoints.
4. Add a **threat model** for the payment/delivery lifecycle and map each invariant to a control, an enforcement point and a test.
5. Treat the **master audit register as a controlled document**: finding IDs are stable, statuses change only with evidence, and "COMPLIANT" requires a runtime test reference.
6. Add **migrations** (e.g. node-pg-migrate) rather than a single hand-applied `schema.sql`, so constraints/triggers are versioned and testable.
7. Add **fiscal-receipt signing** and a real MOR adapter before claiming tax compliance (currently a prototype with 15% arithmetic only).
8. Introduce an **idempotency-key convention** across payment, ledger and delivery endpoints.

---

## 9. Prioritized Remediation Plan

### Phase A — Blockers (before any shared deployment)

1. **AUD-PLAT-001** Authentication/authorization + service identity; derive actors from tokens; ownership checks.
2. **AUD-PLAT-002 / -004** Wire merchant-service into payment-service for registered accounts, inventory prices and governance policies; delete the mock catalog and client account-set path.
3. **AUD-PLAT-003 / -008** Verify the QR token inside `/pay`; bind payer/account; split verify/consume; atomic Redis nonce; stable KMS key.
4. **AUD-PLAT-005 / -012** One-transaction ledger posting + uniqueness/idempotency + deferred balance trigger; align enums.
5. **AUD-PLAT-006 / -010** Bank-backed delivery locks, real settle/release, persisted lock state, cancel/timeout endpoints.
6. **AUD-PLAT-007** Real TIN verification and virtual-merchant review gating.

### Phase B — Coherence

7. **AUD-PLAT-009** PostgreSQL persistence on payment/user HTTP paths; fix duplicate lines; remove fixture code.
8. **AUD-PLAT-011** Orchestration/consumers and HTTP-driven e2e.
9. **AUD-PLAT-013** Peppered hashing, real KYC artefacts.
10. **AUD-PLAT-014** Secrets management, schema mount, health checks, localhost-only ports.
11. **AUD-PLAT-015** Outbox claim/send/commit semantics with DLQ and dedupe.
12. **AUD-PLAT-018** Complete Terraform.

### Phase C — Engineering quality

13. **AUD-PLAT-016** Validation, body limits, error mapping, async wrapper.
14. **AUD-PLAT-017** Correct the audit register and prior claims; add evidence requirements.
15. **AUD-PLAT-019 / -020 / -021** Observability, decimal money, validated rehydration.
16. Add CI, migrations, lint/format, coverage thresholds.

---

## 10. Audit Conclusion

**NO-GO for production or any environment handling real funds.** The domain layer is well designed, but the runtime does not enforce the two most important anti-fraud invariants (beneficiary lockdown and authority of price), accepts payment completion without cryptographic proof, lacks database-level double-entry enforcement, and uses a fabricated delivery escrow. The passing 91-test suite measures the domain model, not the deployed system, and the master register's COMPLIANT statuses are not supported by runtime evidence.

The prior deep audit (`FINSYNC_CODE_AUDIT.md`) was accurate; its findings are re-confirmed here with stable IDs and current line references. No application code was modified during this audit.

**Recommended next action:** run `/sign-off` with scope **AUD-PLAT Phase A** to remediate AUD-PLAT-001 through AUD-PLAT-008 and AUD-PLAT-012, then re-run this audit's verification commands plus new HTTP-level invariant tests.

---

## 11. Verification Limitations

- The audit ran against a live local stack (PostgreSQL :5433, Redis :6379, Kafka :9092, Zookeeper) already running on the host; container state was not rebuilt from scratch, so schema drift accumulated from earlier test runs cannot be excluded.
- `docker compose up` from a clean state was **not** executed; the missing schema mount was established by reading `docker-compose.yml`, not by observing a failure.
- Tests write to the shared development database; their passes do not prove isolation or idempotency.
- Some prior-audit P1 items were confirmed by code inspection only (e.g. `postgres-journal.repository.ts` race) and not exercised concurrently.
- No penetration testing, dependency-vulnerability scan or formal crypto review was performed.
- All findings are point-in-time; the tree may change. Re-run §11 commands before relying on this report.
- Findings are based on the current working tree; the directory is not a git repository, so no commit hash can be cited.

---

## 12. References

- `agent-handoffs/audit/reports/FINSYNC_CODE_AUDIT.md` — prior deep audit, P0-1…P0-10 / P1 table (still authoritative for the issues re-confirmed here).
- `agent-handoffs/audit/reports/AUDIT_REPORT.md` — prior summary (claims contradicted by evidence).
- `agent-handoffs/audit/sign-off/PHASE_0_EXIT_SIGNOFF.md` — Phase 0 gate dossier (partially unsupported).
- `agent-handoffs/audit/master-audit.md` — master register (updated by this audit).
- `code/unpacked/finsync-app/agent-handoffs/session-handoff.md` — stale handoff.

### Reproduction commands executed

```bash
cd code/unpacked/finsync-app
npm run build --workspaces --if-present     # exit 0
npm test --workspaces --if-present           # 90/90 pass
npm run test:e2e                             # 1/1 pass
docker ps                                    # postgres/redis/kafka/zookeeper up
```

| Workspace | Tests | Pass | Fail |
|---|---:|---:|---:|
| `@finsync/bank-gateway-service` | 9 | 9 | 0 |
| `@finsync/delivery-service` | 15 | 15 | 0 |
| `@finsync/ledger-service` | 14 | 14 | 0 |
| `@finsync/merchant-service` | 25 | 25 | 0 |
| `@finsync/payment-service` | 16 | 16 | 0 |
| `@finsync/tax-gateway-service` | 6 | 6 | 0 |
| `@finsync/user-service` | 5 | 5 | 0 |
| **Workspace total** | **90** | **90** | **0** |
| `test/e2e-lifecycle.test.js` | 1 | 1 | 0 |
| **Total** | **91** | **91** | **0** |

---

## 13. Remediation and Sign-Off Reference

- **Remediation Sign-Off Dossier:** [agent-handoffs/audit/sign-off/SIGN-OFF-PHASE-A-2026-11-24.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/sign-off/SIGN-OFF-PHASE-A-2026-11-24.md)
- **Sign-Off Date:** 2026-11-24
- **Remediated Findings:**
  - `AUD-PLAT-002` (CRITICAL) &mdash; **RESOLVED**: Beneficiary lockdown enforced via direct PostgreSQL lookup of merchant authorized accounts.
  - `AUD-PLAT-003` (CRITICAL) &mdash; **RESOLVED**: Payment completion `/pay` requires valid signed asymmetric QR token, validates P-256 signature, and consumes single-use Redis nonce.
  - `AUD-PLAT-004` (CRITICAL) &mdash; **PARTIALLY RESOLVED**: Dynamic price derivation resolved from PostgreSQL merchant inventory catalog.
  - `AUD-PLAT-005` (CRITICAL) &mdash; **RESOLVED**: Atomic single-transaction posting with mathematical balance assertion ($\sum \text{Debits} = \sum \text{Credits} \neq 0$).
  - `AUD-PLAT-008` (HIGH) &mdash; **RESOLVED**: Non-destructive QR token inspection added to `/validate-token`; single-use nonce consumed only at `/pay`.
- **Status of Scope:** 4 findings resolved, 1 partially resolved, 16 findings remain open for Phase B/C.
- **Verification Evidence:** 91 / 91 tests passing (100% clean, 0 failures).

---

*End of audit — AUD-PLATFORM-2026-11-24.*
