# FinSync on EthSwitch — Code Audit

**Date:** 2026-11-24
**Scope:** `code/unpacked/finsync-app` (services, tests, database schema, Docker Compose, Terraform), plus the project docs in `docs/` and the root `README.md`.
**Audit type:** Point-in-time technical review, not a formal security certification.

> **Snapshot warning:** The source tree was being modified during this review. The `delivery-service` and `tax-gateway-service` HTTP layers were added/changed around 19:40–19:43, and a transient `FundLock` signature mismatch was fixed before the final verification. Re-run the checks below before relying on this document for a later commit.

---

## 1. Verification performed

| Check | Command | Result |
|---|---|---|
| TypeScript build | `npm run build --workspaces --if-present` | **Passes** (exit 0) |
| Unit/integration tests | `npm test --workspaces --if-present` | **84/84 pass** |
| End-to-end test | `node --test test/e2e-lifecycle.test.js` | **1/1 pass** |
| Runtime prerequisites | Docker Compose | PostgreSQL :5433, Redis :6379, Kafka :9092, Zookeeper |

Test inventory at the time of review:

| Workspace | Tests |
|---|---:|
| `@finsync/bank-gateway-service` | 9 |
| `@finsync/delivery-service` | 15 |
| `@finsync/ledger-service` | 14 |
| `@finsync/merchant-service` | 19 |
| `@finsync/payment-service` | 16 |
| `@finsync/tax-gateway-service` | 6 |
| `@finsync/user-service` | 5 |
| **Workspace total** | **84** |
| Root e2e | 1 |
| **Grand total** | **85** |

The tests require live infrastructure. They are not hermetic; see §7.

---

## 2. Executive verdict

This is a **well-structured Phase 0 domain prototype**, not a production-ready payment system.

The domain model is the strongest part of the codebase: dependency inversion, explicit state machines, immutable journal entries, nonce/signature checks, and careful ordering of delivery checks are all thoughtfully implemented. The **HTTP and integration layers are demo-grade**. Several documented “fraud invariants” are enforced only in unit tests and are bypassed by the actual APIs.

Most serious issues:

1. No authentication or authorization anywhere; identity is read from request bodies.
2. The “beneficiary lockdown” invariant is bypassed by the payment HTTP API.
3. Payment prices and merchant governance are not read from merchant-service at runtime.
4. A payment can be marked paid without validating the QR token.
5. The payment HTTP path uses in-memory storage, and the PostgreSQL payment repository duplicates line items.
6. Ledger postings are neither atomic nor idempotent, and the database has no balance-enforcing trigger.
7. Merchant/TIN authorization is a rubber stamp, including a virtual-merchant review bypass.
8. QR replay protection is in-memory per process; signing keys are generated at startup.
9. The delivery “fund lock” is created locally and never calls the bank rail.
10. Kafka events are produced but no service consumes them; the services do not form an orchestrated end-to-end lifecycle.

**Recommended status:** sandbox / internal demo only until P0 items are fixed.

---

## 3. System overview

The project is an npm-workspaces monorepo with seven active services plus three README-only stubs (`catalog-service`, `ai-service`, `ad-service`).

| Service | Port | Current state |
|---|---:|---|
| user-service | 3001 | Express HTTP; KYC, roles, KYC pack; **in-memory repository** |
| bank-gateway-service | 3002 | HTTP; `EthSwitchGateway` with simulated sandbox and HTTP modes; fund lock/split |
| payment-service | 3003 | HTTP; `PaymentRequest` state machine, ECDSA QR, HMAC QR, dashboard; **in-memory store** |
| merchant-service | 3004 | HTTP; merchants, cashiers, governance, inventory; PostgreSQL |
| ledger-service | 3005 | HTTP; double-entry journals, reconciliation, end-of-day; PostgreSQL |
| delivery-service | 3006 | HTTP; delivery state machine, delivery QR, PostgreSQL; **does not call bank rail** |
| tax-gateway-service | 3007 | HTTP; in-memory TIN/sales/notices; real authority unimplemented |
| outbox-worker | — | Polls `outbox_events` and publishes to Kafka |
| catalog/ai/ad | — | Stubs |

Shared infrastructure is a single PostgreSQL database (cross-service foreign keys), Kafka via a transactional outbox, Redis configured but not wired into payment nonce checks, and Terraform for VPC/RDS/MSK/ALB.

---

## 4. What is done well

- **Dependency inversion:** `IUserRepository`, `IPaymentRail`, `ITaxAuthority`, `IPriceSource`, `INonceStore`, `IOwnershipLookup`.
- **State machines:** `PaymentRequest` and `DeliveryOrder` reject illegal transitions instead of relying on scattered guards.
- **Double-entry domain rules:** `Journal.post` rejects unbalanced, negative, or single-line entries; entries are frozen.
- **Security ordering:** `DeliveryOrder.scanDelivery` verifies status → payer → signature → order ID → geofence → **then** consumes the nonce, so a remote attacker cannot burn the real customer’s code.
- **Crypto basics:** ECDSA P-256 sign/verify, HMAC with `timingSafeEqual`, random nonces, explicit expiry.
- **Privacy basics:** national ID hashed, bank account number masked, no raw account number retained in `LinkedBankAccount`.
- **Governance design:** policy/rule pattern with strict/loose presets and audit entries.
- **Testing:** meaningful domain tests for happy paths and several fraud scenarios.
- **Documentation:** `docs/DECISIONS.md` is candid about open questions.

---

## 5. Critical findings (P0)

### P0-1. There is no authentication or authorization

A search of the service sources found no JWT verification, role middleware, service identity, API-key validation, or mTLS enforcement. Every HTTP service trusts the request body.

Examples:

- `services/user-service/src/main.ts:17-28`
  - `POST /api/v1/users/:userId/roles` accepts any role string and assigns it.
  - `POST /api/v1/users/:userId/kyc/verify` lets anyone mark any user as KYC-verified.
  - `GET /api/v1/users/:userId/kyc-pack` has no caller authentication.
- `services/payment-service/src/main.ts:155-157` — the caller sends `{"role":"MERCHANT"}` and the service trusts it.
- `services/payment-service/src/main.ts:170-171` — `payerId` and `bankAccountId` are accepted from the body with no ownership check.
- `services/delivery-service/src/main.ts` — `payerId`, `providerId`, GPS, and settlement account IDs are all caller-supplied.
- `services/ledger-service/src/main.ts:50-116` — any caller can post arbitrary `merchantId`, `cashierId`, `amount`, and `event`.
- `services/merchant-service/src/main.ts` — any caller can register a merchant under any `ownerUserId` and change its governance policy.

**Impact:** complete account takeover, role escalation, fake payments, fake ledger entries, and unauthorised merchant operations if exposed.

**Remediation:** terminate TLS at the gateway, require user JWTs on all public endpoints and service credentials/mTLS between services, derive actor identity from the token, and check resource ownership/role server-side.

---

### P0-2. The “beneficiary lockdown” invariant is bypassed by the HTTP API

The fixed rule says money may only go to a settlement account the merchant registered. The domain enforces it against a `Set` passed by the caller:

```ts
// services/payment-service/src/main.ts:102
registeredAccountIds: new Set(body.registeredAccountIds ?? [body.destinationAccountId])
```

If the caller omits `registeredAccountIds`, the destination is automatically treated as registered. If the caller supplies the array, the caller controls the contents. The payment service never queries merchant-service for the merchant’s real accounts.

**Impact:** the most important anti-fraud invariant only holds in unit tests that pass the real account set. Through the API it is effectively absent.

**Remediation:** load `Merchant.registeredAccountIds()` from merchant-service by `merchantId` inside payment-service; never accept the account set from the client.

---

### P0-3. Prices and governance are not wired into runtime payments

`services/payment-service/src/main.ts:22-32` uses a hardcoded global catalog and ignores `merchantId`:

```ts
lookup(merchantId, itemId) {
  const catalog = {
    "item-coffee": { name: "Ethiopian Yirgacheffe Coffee", price: 150 },
    "item-tea": { name: "Spiced Tea", price: 50 },
    "item-pastry": { name: "Bakery Pastry", price: 100 },
  };
  return catalog[itemId];
}
```

Consequences:

- Any merchant can “sell” only these three items at fixed prices through the API.
- The actual `InventoryItem` records in merchant-service are never used.
- The merchant’s `GovernancePolicy` is persisted but never read by payment-service.
- Cashier approval thresholds, cart-creation rules, and discount rules are never evaluated at runtime.
- `PaymentLimit` is implemented and tested but never checked before payment.
- QR TTL is hardcoded to 180 seconds (`main.ts:156`), while governance presets define 120/600 seconds.

**Impact:** “authority of price” and configurable governance exist only as isolated modules/tests, not as system behaviour.

**Remediation:** inject a real `IPriceSource` backed by merchant-service inventory and load the merchant policy before create/approve/issue. Use the policy TTL for QR issuance.

---

### P0-4. A payment can be marked paid without validating the QR token

`services/payment-service/src/main.ts:165-176` calls `pr.markPaid(payerId, bankAccountId)` directly. It does not:

- parse or validate the payment QR token,
- check that the payer owns/approved the bank account,
- apply payer payment limits,
- confirm that the bank rail moved funds,
- confirm that the ledger recorded the payment.

`PaymentRequest.markPaid` only checks QR expiry if a QR exists; it does not verify the token signature or nonce.

**Impact:** a caller can assert payment completion; the QR is decorative in the HTTP flow. The `/validate-token` endpoint is a separate optional call.

**Remediation:** require and verify the QR token (or an authenticated bank callback with a rail reference) in `markPaid`; bind the payer and account server-side; only mark paid after the rail confirms.

---

### P0-5. Persistence is inconsistent, and payment lines are duplicated

In-memory despite PostgreSQL repositories existing:

- `services/user-service/src/main.ts:9` — `new UserService(new InMemoryUserRepository(), ...)`.
- `services/payment-service/src/main.ts:21` — `export const paymentStore = new Map<string, PaymentRequest>()`.

Restarting these services loses users and payments. The payment HTTP path also never writes outbox events.

Separately, `PostgresPaymentRepository.save` inserts line items on every save:

```ts
// services/payment-service/src/postgres-payment.repository.ts:103-109
for (const line of pr.lines) {
  await client.query(
    `INSERT INTO payment_lines (payment_id, item_id, name, unit_price, qty)
     VALUES ($1, $2, $3, $4, $5)`,
    [pr.paymentId, line.itemId, line.name, line.unitPrice, line.qty]
  );
}
```

`save()` is called at each lifecycle transition, and the `ON CONFLICT` clause does not replace/delete previous lines. A local query confirmed payments with **6 line rows for 2 distinct items**. `findById` then returns duplicated line items.

Also, `ensureMerchantWithAccount` (`postgres-payment.repository.ts:29-61`) writes fake users, merchants, and accounts with hardcoded values (`hash-${ownerUserId}`, random phone, `'CBE'`, `'****2210'`). That is test-fixture logic inside a production repository.

**Remediation:** use the PostgreSQL repositories in the HTTP paths; replace/delete lines inside the same transaction as the payment update; move fixture helpers to tests.

---

### P0-6. Ledger postings are not atomic and are not idempotent

`services/ledger-service/src/main.ts:91-116` performs three separate transactions:

1. Post the merchant journal entry (`repo.postEntry` opens/commits its own transaction).
2. Post the cashier journal entry (another transaction).
3. Insert the outbox event (`pool.query`, another transaction).

A failure between steps leaves the merchant books, cashier books, and outbox inconsistent. Retries double-post: there is no unique constraint on `(journal_id, ref, event)` and no idempotency key. The local DB contained 8 `journal_entries` rows for the same `ref`, consistent with repeated event posting.

The HTTP path also bypasses the domain `Journal` validation and writes posting lines directly. The database schema contains **no trigger or constraint enforcing `sum(debit) = sum(credit)`** per entry, despite the README claiming “double-entry triggers”. The Phase 0 exit gate requiring mathematical enforcement at DB level is therefore not met.

**Remediation:** make both journals + outbox one transaction; validate balances inside the repository; add `UNIQUE (journal_id, ref, event)`; add a deferred constraint trigger verifying each entry balances.

---

### P0-7. Merchant/TIN authorization is a rubber stamp

`services/merchant-service/src/main.ts:62-63`:

```ts
merchant.authorize(true, b.kind === "VIRTUAL");
```

- `tinVerified` is always `true`; `ITaxAuthority` is never called.
- For virtual merchants, `virtualReviewPassed` is also `true`, so the stricter review is skipped.
- `kind` is cast without validation.

The tax service compounds this. `services/tax-gateway-service/src/main.ts:50-58` auto-validates **any** TIN starting with `TIN-`:

```ts
if (!result.valid && typeof b.tin === "string" && b.tin.startsWith("TIN-")) {
  return sendJson(res, 200, {
    valid: true,
    tin: b.tin,
    legalName: `Verified Ethiopian Enterprise (${b.tin})`,
    ...
  });
}
```

**Impact:** anyone can become an “authorized” merchant with an invented TIN. This is acceptable only as a gated local sandbox behaviour.

**Remediation:** call `ITaxAuthority.verifyTin`; pass `virtualReviewPassed = false` until a real review is recorded; gate sandbox auto-approval behind `NODE_ENV`/explicit config and never enable it in staging/production.

---

### P0-8. QR replay protection is not distributed, and signing keys are ephemeral

`services/payment-service/src/main.ts:13-18` generates a new ECDSA key pair at process startup:

```ts
const ecKeys = AsymmetricQRTokenService.generateECKeyPair();
const redisNonceStore = new RedisNonceStore();
```

- Keys rotate on every restart, and each replica has a different key.
- `RedisNonceStore` (`asymmetric-token-service.ts:15-33`) is an in-memory `Map`; passing a Redis client throws.
- `LiveRedisNonceStore` exists but is not wired in. Its synchronous `consume` (`live-redis-nonce.ts:54-62`) checks only the local map and ignores the Redis `SET NX` result, so two replicas can accept the same nonce.
- `validate()` consumes the nonce (`asymmetric-token-service.ts:130`), so a verification call can burn the payer’s code.
- `SIGNING_MODE` is read and displayed but never changes behaviour; `hmacQR` is exported but unused.

**Remediation:** load a stable private key from KMS/Secret Manager, publish the matching public key, wire an asynchronous atomic Redis nonce store (`SET key 1 EX ttl NX`), and separate “verify” from “consume” so only a successful payment burns the token.

---

### P0-9. Delivery “fund lock” is local and does not hold money

`services/delivery-service/src/main.ts:49-52` creates the lock itself:

```ts
const order = new DeliveryOrder(payerId, merchantId, fees as Fees, destination as GeoPoint, scanRadiusMeters ?? 100);
const lock = new FundLock(`lock-${randomUUID()}`, payerId, "ref", order.lockAmount, new Date(Date.now() + 3600000));
order.confirmLock(lock);
```

No call to `bank-gateway-service` / `IPaymentRail.lockFunds`. `/settle` computes splits and marks the order settled but never calls `settleLock`. No money moves.

Other delivery gaps:

- GPS coordinates are caller-supplied, so the geofence is trivially spoofable.
- `PostgresDeliveryRepository.findById` reconstructs every lock as `LOCKED` with a fresh expiry and `"ref"` account reference (`postgres-delivery.repository.ts:119-124`); released/settled state is lost, and `confirmLock` may later accept an already-released hold.
- Public setters `setStatus`, `setQrToken`, `setProviderId`, `setLock` (`delivery-order.ts:53-56`) bypass the state machine.
- Cancellation and lock-release paths are not exposed over HTTP.
- Lock expiry / merchant-never-confirms timeout is not implemented (acknowledged in `DECISIONS.md`).

**Remediation:** integrate with the bank rail for lock/release/settle; persist lock status, account reference, and expiry; rehydrate through validated state transitions rather than raw setters; add timeout release and cancellation endpoints.

---

### P0-10. The services do not form an end-to-end lifecycle

The e2e test manually sequences domain objects; it does not drive the system through HTTP. In the running services:

- payment-service does not call merchant, user, ledger, or bank services;
- delivery-service does not call the bank rail or ledger;
- tax-service is not called by payment or merchant;
- the outbox worker publishes Kafka events, but **no consumer exists**.

The result is a set of services with shared database access, not an orchestrated payment platform. There is no saga/process manager, no compensation logic, and no event contracts.

**Remediation:** define API/event contracts, add an orchestrator (or choreographed consumers) for payment → ledger → settlement and delivery → split settlement → ledger, and add contract tests that exercise the HTTP APIs rather than only domain objects.

---

## 6. High-priority issues (P1)

| Area | Finding | Evidence |
|---|---|---|
| Concurrent journal creation | `getOrCreateJournal` can return `undefined`: the losing transaction’s `SELECT` cannot see the winner’s uncommitted insert. | `services/ledger-service/src/postgres-journal.repository.ts:26-43` |
| Transactional outbox | Kafka send happens inside the DB transaction while holding `FOR UPDATE` locks. Crash after send but before commit causes duplicate delivery; slow Kafka holds locks. No DLQ, dedupe key, retry/backoff, or cleanup of published rows. Multiple workers do not guarantee per-aggregate order. | `services/payment-service/src/outbox-worker.ts:50-106` |
| Kafka unused by business flows | Events are produced but no consumer/service reacts to them. The system is still synchronous via direct HTTP/database writes. | Repository-wide |
| Schema | No DB balance trigger/constraint. `users.kyc_status` CHECK omits `UNVERIFIED` even though the domain enum has it. No check that `payment_requests.total = sum(payment_lines)`. `unit_price >= 0` vs domain `> 0`. No idempotency constraint on journal entries. | `infra/postgres/schema.sql` |
| Docker Compose | `infra/postgres/schema.sql` is **not mounted** (README claims it is). A fresh `docker compose up` starts with an empty DB and most tests fail. No volumes or healthchecks. | `docker-compose.yml` |
| Terraform | No compute resources (ECS/EKS/EC2), no ALB target groups/listener rules, no IAM/KMS/Secrets Manager, no CloudWatch logging, no WAF, no state lock. MSK security group declares no egress, so broker-to-broker/outbound connectivity is blocked. RDS has no Multi-AZ/SSL enforcement. | `infra/terraform/` |
| Secrets | Hardcoded development defaults for JWT, HMAC, delivery QR, DB password, and EthSwitch API key. Local Postgres uses `trust` auth and is published on 5433. | `src/main.ts` files; `docker-compose.yml` |
| Input validation | No zod/ajv/class-validator. Casts such as `kind as MerchantKind`, `mode as PaymentMode`, `role as Role`, `fees as Fees` accept malformed payloads. `parseBody` has no size limit. | Service `main.ts` files |
| Error handling | Several client errors return 500 with internal messages (merchant registration, delivery creation, ledger postings). Invalid quantities/prices throw 500 instead of 400. | Service `main.ts` files |
| Express async errors | `user-service` registration handler has no `try/catch`; Express 4 does not catch rejected promises, so duplicate phone/national ID can hang the request or produce an unhandled rejection. `GET /merchants/:id` is also unguarded. | `services/user-service/src/main.ts:11-16`; `services/merchant-service/src/main.ts:81-95` |
| National ID hashing | HTTP registration calls `User.register(nationalId, phone)` without the pepper, so production uses bare SHA-256. The comment and R-03 require HMAC with a pepper/KMS key. | `services/user-service/src/user.service.ts:10`; `services/user-service/src/user.ts:26-31` |
| KYC claims | Proofs are `"zk-proof-placeholder"`; `KYCPack.isValid` only checks age; `toJWT` re-signs rather than verifying the pack signature. | `services/user-service/src/user.ts:40-42`; `services/user-service/src/kyc-pack.ts:23-34` |
| Repository rehydration | `PostgresUserRepository.findById` builds a temporary user with a random hash and mutates `readonly` fields via `as any`. Brittle and hides model invariants. | `services/user-service/src/postgres-user.repository.ts:56-60` |
| Money type | Amounts are JS `number` with `Math.round(n * 100)`. Acceptable for small ETB values but not ideal for a financial core; use integer minor units or a decimal library. | `journal.ts`, `payment-request.ts`, `delivery-order.ts` |
| Observability | No structured logs, request IDs, metrics, tracing, readiness checks, or graceful shutdown. `/health` always returns UP. | All services |
| Code duplication | `parseBody`/`sendJson`/`PostgresConfig` duplicated; role enums, `Split`, nonce stores, and QR logic duplicated. `PaymentPosting` exists but the ledger HTTP path reimplements it inline. | Cross-service |
| Audit claim drift | `docs/AUDIT_REPORT.md` says 43/43 tests, “100% adherence”, and all seven invariants verified. The suite now has 85 tests, and several invariants are bypassed by HTTP. | `docs/AUDIT_REPORT.md` |
| README drift | Root README says only user-service has HTTP, no DB/Kafka wiring (both outdated), and 33 unit tests. App README says 43 tests and “double-entry triggers” (no triggers exist). | `README.md`; `code/unpacked/finsync-app/README.md` |

---

## 7. Testing assessment

**Strengths**

- Domain tests cover legal/illegal transitions, price authority at the domain boundary, cancellation, replay, expiry, geofence-before-burn, and ledger balancing.
- Integration tests exercise PostgreSQL repositories, Redis nonce behaviour, outbox → Kafka, and HTTP endpoints.
- e2e covers user → merchant → payment → ledger → outbox in one flow.

**Weaknesses**

- Tests require live Docker infrastructure; a fresh clone with `docker compose up` fails because the schema is not mounted.
- No migrations or seed automation; test data accumulates in the same database.
- Tests are not isolated; repeated runs create duplicate/leftover rows, which masks idempotency bugs.
- Security invariants are tested at the domain level, not through HTTP. There are no tests for:
  - missing `registeredAccountIds` (the P0-2 bypass),
  - unauthenticated role/KYC changes,
  - marking a payment paid without a token,
  - duplicate `payment_lines`,
  - ledger retry/idempotency and partial failure,
  - delivery bank-rail integration,
  - outbox duplicate/loss scenarios.
- No coverage threshold, linter, formatter, or CI configuration in the repository.
- No API contract/OpenAPI tests.

---

## 8. Architecture and documentation gaps

### Architecture

- **Shared database, not service-owned data.** Services read/write one schema with cross-service foreign keys, and some services write other contexts’ tables (`ensureMerchantWithAccount` writes users/merchants/accounts). This undermines microservice autonomy.
- **No orchestration.** There is no saga/process manager, compensation, or event consumer. The lifecycle is manual in tests.
- **No API gateway implementation.** Terraform defines an ALB with no listener rules/target groups; local services are exposed directly.
- **No service discovery, mTLS, or auth.**
- **No versioned event schemas.** Kafka topics are inferred from `aggregate_type`; no schema registry, DLQ, or consumer groups.
- **Duplicated concepts:** roles, `Split`, nonce stores, QR implementations. A shared contracts/domain library would reduce drift.
- **Unreachable domain features:** `PaymentRequest.issueWithoutApproval`, `assignTo`, `issueFromAssigned`, `requestCancel`, `approveCancel`, and `markSettled` are not exposed by HTTP. Assigned/restaurant and cancellation flows cannot be exercised through the API.
- **Decorative tax integration:** the tax service stores sales in memory and computes 15% VAT but does not sign fiscal receipts or connect to an authority.

### Documentation

- `docs/DECISIONS.md` is the most accurate document: it explicitly records unresolved questions (fund lock/split proof, TIN agency, retail approver, delivery timeout, refunds).
- `docs/AUDIT_REPORT.md` is **not** an accurate representation of the current runtime: it claims “PASSED (Production Foundation Grade)”, “43/43 tests”, “100% adherence”, and verified fraud invariants. The HTTP layer contradicts several of those claims.
- `docs/PHASE_0_PLAN.md` and `docs/MASTER_IMPLEMENTATION_PLAN.md` are aspirational/roadmap documents, not implementation status.
- Root `README.md` and app `README.md` are stale relative to the current tree.
- Several docs point to external Claude artifacts (`docs/DOCUMENT_LINKS.md`) not present in the repository, so the “full” documents are not locally auditable.

**Recommendation:** mark the audit report as superseded, update status tables from the current code, and add a “current limitations” section that distinguishes domain tests from runtime enforcement.

---

## 9. Prioritized remediation roadmap

### P0 — required before any shared or production environment

1. **Authentication/authorization**
   - User JWT on public endpoints; service credentials or mTLS between services.
   - Derive actor identity and roles from verified tokens, never from request bodies.
   - Enforce resource ownership (merchant, cashier, payer, provider).
2. **Beneficiary and price authority**
   - Look up merchant accounts and inventory from merchant-service inside payment-service.
   - Remove the client-supplied `registeredAccountIds` path and the mock global catalog from runtime.
3. **Payment completion**
   - Validate the QR token inside `markPaid`.
   - Check payer account ownership/approval and payment limits.
   - Only mark paid after a bank-rail confirmation or verified token + rail reference.
4. **Persistence and idempotency**
   - Move user/payment HTTP paths to PostgreSQL.
   - Fix duplicate `payment_lines`; update lines transactionally.
   - Add idempotency keys/unique constraints for payments, journal entries, and outbox events.
5. **Ledger atomicity**
   - One transaction for both journals + outbox.
   - DB balance trigger/constraint and `(journal_id, ref, event)` uniqueness.
6. **Merchant/TIN authorization**
   - Call `ITaxAuthority.verifyTin`.
   - Do not auto-pass virtual review.
   - Gate `TIN-` sandbox auto-approval behind an explicit non-production flag.
7. **Distributed QR protection**
   - Stable keys from KMS/Secret Manager.
   - Atomic Redis nonce store.
   - Separate verification from consumption; burn only on successful payment.

### P1 — required for a coherent system

8. Wire delivery-service to `IPaymentRail.lockFunds` / `releaseLock` / `settleLock`; add cancel and timeout release.
9. Persist and restore real lock status/expiry; stop using public state setters for rehydration.
10. Fix outbox semantics: claim rows, send outside the row lock, retry/backoff, dedupe, cleanup, DLQ.
11. Add Kafka consumers or an orchestrator and define event contracts.
12. Add migrations, mount the schema in Compose, add volumes/healthchecks, make tests reproducible.
13. Complete Terraform: compute, ALB rules/targets, MSK egress, IAM/KMS/Secrets, logging, RDS hardening, state locking.
14. Remove hardcoded secrets; require environment configuration and fail fast outside development.

### P2 — engineering quality

15. Add request validation, body limits, consistent 4xx errors, and Express async error handling.
16. Add structured logging, metrics, tracing, request IDs, readiness checks, and graceful shutdown.
17. Extract shared HTTP/domain utilities; use integer minor units/decimal money.
18. Add ESLint/Prettier, coverage thresholds, and CI.
19. Add HTTP-level security tests for every fraud invariant.
20. Rewrite the audit/README claims to match the implementation and test counts.

---

## 10. Appendix — key file index

| Concern | File |
|---|---|
| Beneficiary bypass, mock prices, role trust, pay-without-token | `services/payment-service/src/main.ts` |
| Payment state machine | `services/payment-service/src/payment-request.ts` |
| ECDSA tokens / nonce store | `services/payment-service/src/asymmetric-token-service.ts` |
| Redis nonce implementation | `services/payment-service/src/live-redis-nonce.ts` |
| Duplicate line inserts | `services/payment-service/src/postgres-payment.repository.ts` |
| Outbox worker | `services/payment-service/src/outbox-worker.ts` |
| Unauthenticated user/KYC endpoints | `services/user-service/src/main.ts` |
| Unpeppered hashing in HTTP path | `services/user-service/src/user.service.ts` |
| KYC placeholder proofs | `services/user-service/src/user.ts` |
| Merchant auto-authorization | `services/merchant-service/src/main.ts` |
| Governance policy | `services/merchant-service/src/governance-policy.ts` |
| Ledger non-atomic postings | `services/ledger-service/src/main.ts` |
| Journal repository / race | `services/ledger-service/src/postgres-journal.repository.ts` |
| Delivery fake lock / no rail | `services/delivery-service/src/main.ts` |
| Delivery lock rehydration | `services/delivery-service/src/postgres-delivery.repository.ts` |
| Sandbox TIN bypass | `services/tax-gateway-service/src/main.ts` |
| Schema / missing triggers | `infra/postgres/schema.sql` |
| Local infra | `docker-compose.yml` |
| Infrastructure as code | `infra/terraform/` |
| Stale audit claim | `docs/AUDIT_REPORT.md` |
| Candid open questions | `code/unpacked/finsync-app/docs/DECISIONS.md` |

---

## 11. Reproduction commands

```bash
cd code/unpacked/finsync-app

# start local PostgreSQL, Redis, Kafka, Zookeeper
docker compose up -d

# apply the schema once (the compose file does not mount it)
docker exec -i finsync-app-postgres-1 psql -U finsync -d finsync < infra/postgres/schema.sql

npm install
npm run build --workspaces --if-present
npm test --workspaces --if-present
node --test test/e2e-lifecycle.test.js

# start the services from compiled output
npm start
```

Expected at the time of this review: build exit 0, 84 workspace tests pass, 1 e2e test passes.

---

*End of audit.*
