# FinSync on EthSwitch — Platform Audit R2 (Remediation Verification)

**Audit ID:** AUD-PLATFORM-2026-11-24-R2
**Date:** 2026-11-24
**Scope:** Verify the Phase A remediation recorded in `SIGN-OFF-PHASE-A-2026-11-24` against the current `payment-service`, `ledger-service`, their tests, and the unchanged platform dependencies.
**Audit type:** Evidence-based re-audit of remediation claims. Not a formal security certification.
**Method:** Read register/report/sign-off → diff working tree against the audited baseline → inspect changed code → run build, workspace tests and e2e → reclassify findings → register new defects.

> **Baseline:** `AUDIT-PLATFORM-2026-11-24` (21 findings). This audit reuses the stable IDs from that report and does not renumber them.

---

## 1. Executive Summary

The Phase A remediation is **real but narrower than the sign-off states**.

**Verified improvements**
- **INV-2 beneficiary lockdown is now enforced**: the client can no longer supply `registeredAccountIds`; payment-service resolves the merchant's accounts and rejects a foreign destination with 403.
- **INV-4 QR verification is now mandatory on `/pay`**: missing, expired, tampered, mismatched or replayed tokens are rejected; `/validate-token` was split into a non-destructive `inspect()`.
- **INV-6 ledger posting is now atomic**: merchant entry + cashier entry + outbox row are written in one transaction with a pre-commit `ΣD = ΣC ≠ 0` assertion.
- **INV-3 is partially wired**: prices are read from `inventory_items` per merchant instead of a global constant.

**What the sign-off overstates**
| Claimed | Actual |
|---|---|
| AUD-PLAT-003 RESOLVED | **PARTIALLY RESOLVED** — QR is required, but `payerId`/`bankAccountId` are still caller assertions with no ownership check and no bank-rail confirmation. |
| AUD-PLAT-004 RESOLVED | **PARTIALLY RESOLVED** — demo fallback catalog remains; governance policy, payment limits and dynamic QR TTL are still unused. |
| AUD-PLAT-005 RESOLVED | **PARTIALLY RESOLVED** — no idempotency key/unique constraint, no database-level balance trigger, and no test that a mid-batch failure rolls back. |
| AUD-PLAT-008 RESOLVED | **PARTIALLY RESOLVED** — only non-destructive inspection was fixed; nonce storage is still per-process and signing keys are still per-process. |
| "Delivered and verified with empirical test evidence" | Tests do not cover cross-merchant tokens, merchant authorization state, governance, rollback, or idempotency. |

**Verification executed (all green, but not sufficient by themselves):** build exit 0, 90/90 workspace tests, 1/1 e2e. The payment HTTP test passes partly because of a hardcoded `merch-cafe-1` fixture seeded in production code, not because merchant data was seeded in the database.

**New findings:** 3 — two MEDIUM (`AUD-PLAT-022`, `AUD-PLAT-024`) and one LOW (`AUD-PLAT-023`).

**Current finding state (24 total):** 1 RESOLVED, 4 PARTIALLY RESOLVED, 19 OPEN.
**Outstanding severity:** 4 CRITICAL · 8 HIGH · 7 MEDIUM · 4 LOW.
**Verdict:** **PARTIAL remediation accepted; production remains NO-GO.** Phase A is not complete.

---

## 2. Previous Audit and Sign-Off Review

| Document | Claim | Verification result |
|---|---|---|
| `agent-handoffs/audit/sign-off/SIGN-OFF-PHASE-A-2026-11-24.md` | PARTIAL SIGN-OFF; 002/003/005/008 RESOLVED, 004 PARTIALLY RESOLVED | **Overstated.** 002 is resolved; 003/004/005/008 are partially resolved. |
| `agent-handoffs/audit/reports/AUDIT-PLATFORM-2026-11-24.md` | 21 findings; sandbox only | Accurate baseline; 5 findings changed state. |
| `agent-handoffs/audit/master-audit.md` | 21 open findings, no sign-off | Re-synced by this audit; see §6–§10. |
| `agent-handoffs/audit/sign-off/PHASE_0_EXIT_SIGNOFF.md` | Phase 0 gates pass | Still unsupported for G-2/G-3/G-4 as described in the baseline audit. |
| `code/unpacked/finsync-app/agent-handoffs/session-handoff.md` | No blockers, 85/85 | Still stale; suite is 91 and 23 findings remain outstanding. |

**Files changed since the audited baseline (mtime > 2026-11-24 21:00):**

| File | Change |
|---|---|
| `services/payment-service/src/main.ts` | DB-backed merchant accounts + inventory; 403 on foreign destination; `/pay` token requirement; `inspect()` on validate |
| `services/payment-service/src/asymmetric-token-service.ts` | Added `inspect()`; `validate(..., consumeNonce)` |
| `services/payment-service/src/http.test.ts` | Added 403 foreign-destination, 400 no-token, 400 replay assertions |
| `services/ledger-service/src/main.ts` | Switched to single-call `postAtomicBatch` |
| `services/ledger-service/src/postgres-journal.repository.ts` | Added `postAtomicBatch` with balance assertion |

**Not changed:** all other services, `schema.sql`, `docker-compose.yml`, Terraform, e2e test. Consequently AUD-PLAT-006, -007, -009, -010, -011, -012, -013 … -021 remain untouched.

---

## 3. Files and Modules Examined

**Changed and inspected in depth**
- `services/payment-service/src/main.ts`
- `services/payment-service/src/asymmetric-token-service.ts`
- `services/payment-service/src/http.test.ts`
- `services/ledger-service/src/main.ts`
- `services/ledger-service/src/postgres-journal.repository.ts`
- `services/ledger-service/src/main.test.ts`, `postgres-journal.test.ts`

**Dependencies checked for unchanged behaviour**
- `services/payment-service/src/payment-request.ts`
- `services/payment-service/src/live-redis-nonce.ts`
- `services/payment-service/src/postgres-payment.repository.ts`
- `services/delivery-service/src/*`
- `infra/postgres/schema.sql`
- `infra/terraform/`
- `docker-compose.yml`
- `test/e2e-lifecycle.test.js`

---

## 4. Verification Results

| Check | Command | Result |
|---|---|---|
| TypeScript build | `npm run build --workspaces --if-present` | **Pass** (exit 0) |
| Workspace tests | `npm test --workspaces --if-present` | **90/90 pass** |
| E2E | `npm run test:e2e` | **1/1 pass** |
| Combined run | build && test && e2e | **EXIT=0** |

| Workspace | Tests | Pass | Fail |
|---|---:|---:|---:|
| bank-gateway-service | 9 | 9 | 0 |
| delivery-service | 15 | 15 | 0 |
| ledger-service | 14 | 14 | 0 |
| merchant-service | 25 | 25 | 0 |
| payment-service | 16 | 16 | 0 |
| tax-gateway-service | 6 | 6 | 0 |
| user-service | 5 | 5 | 0 |
| workspace total | **90** | **90** | **0** |
| e2e | 1 | 1 | 0 |
| **total** | **91** | **91** | **0** |

**Test-quality caveats**
- The e2e test still drives domain objects directly, uses an injected price source and in-memory nonces. It does not exercise the remediated HTTP paths.
- No test asserts cross-merchant or token-kind binding, merchant `auth_status`, governance/limits, ledger rollback, or ledger idempotency.
- The payment HTTP test relies on the production fixture `merch-cafe-1` → `cbe-settlement-acc-1`, not on a database seed.

---

## 5. Findings Summary (Current State)

| ID | Severity | Status after R2 | Change |
|---|---|---|---|
| AUD-PLAT-001 | CRITICAL | OPEN | — |
| AUD-PLAT-002 | CRITICAL | **RESOLVED** | Fixed in Phase A |
| AUD-PLAT-003 | CRITICAL | **PARTIALLY RESOLVED** | QR enforced; payer/rail still unverified |
| AUD-PLAT-004 | CRITICAL | **PARTIALLY RESOLVED** | DB prices; demo fallback + governance remain |
| AUD-PLAT-005 | CRITICAL | **PARTIALLY RESOLVED** | Atomic; idempotency + DB trigger remain |
| AUD-PLAT-006 | HIGH | OPEN | — |
| AUD-PLAT-007 | HIGH | OPEN | — |
| AUD-PLAT-008 | HIGH | **PARTIALLY RESOLVED** | `inspect()` fixed; nonce/key distribution remains |
| AUD-PLAT-009 | HIGH | OPEN | — |
| AUD-PLAT-010 | HIGH | OPEN | — |
| AUD-PLAT-011 | HIGH | OPEN | — |
| AUD-PLAT-012 | HIGH | OPEN | — |
| AUD-PLAT-013 | HIGH | OPEN | — |
| AUD-PLAT-014 | MEDIUM | OPEN | — |
| AUD-PLAT-015 | MEDIUM | OPEN | — |
| AUD-PLAT-016 | MEDIUM | OPEN | — |
| AUD-PLAT-017 | MEDIUM | OPEN | — |
| AUD-PLAT-018 | MEDIUM | OPEN | — |
| AUD-PLAT-019 | LOW | OPEN | — |
| AUD-PLAT-020 | LOW | OPEN | — |
| AUD-PLAT-021 | LOW | OPEN | — |
| **AUD-PLAT-022** | **MEDIUM** | **NEW** | Hardcoded demo fixtures in production payment path |
| **AUD-PLAT-023** | **LOW** | **NEW** | `/pay` does not bind token kind/merchant |
| **AUD-PLAT-024** | **MEDIUM** | **NEW** | Merchant authorization bypassed; shared-DB coupling |

**Totals:** 24 findings. RESOLVED 1 · PARTIALLY RESOLVED 4 · OPEN 19.
**Outstanding severity:** CRITICAL 4 · HIGH 8 · MEDIUM 7 · LOW 4.

---

## 6. Detailed Findings — Remediation Verification

### AUD-PLAT-002 — Beneficiary lockdown (INV-2) — **RESOLVED**

- **Severity:** CRITICAL (historical)
- **Evidence of fix:** `payment-service/src/main.ts:208-214` resolves `fetchMerchantAccounts(merchantId)` from `merchant_accounts` and returns **403** when the destination is not in the set. `CreateParams.registeredAccountIds` is populated server-side (`main.ts:223`); the request contract no longer reads `body.registeredAccountIds`.
- **Test evidence:** `http.test.ts:34-45` posts `destinationAccountId: "unauthorized-attacker-acc"` and asserts 403.
- **Residual risk:** the account set comes straight from the shared DB, ignores merchant authorization status, and is seeded with a demo merchant in production code — tracked as **AUD-PLAT-022** and **AUD-PLAT-024**.
- **Disposition:** RESOLVED for INV-2 enforcement. No regression observed.

---

### AUD-PLAT-003 — Payment completion (INV-4) — **PARTIALLY RESOLVED**

- **Severity:** CRITICAL
- **What was fixed:** `/pay` now requires `token`, calls `asymmetricQR.validate(token, new Date(), true)`, rejects missing/invalid tokens, requires `payload.ref === paymentId`, and consumes the nonce only on this path (`main.ts:296-310`). `/validate-token` now uses `inspect()` and does not burn the nonce (`main.ts:317-327`; `asymmetric-token-service.ts:112-139`).
- **Still missing:**
  - `payerId` and `bankAccountId` are still taken from the request body with no authenticated principal or account-ownership/approval check (`main.ts:291-293, 310`).
  - No call to `bank-gateway-service` and no rail reference; `markPaid` still asserts completion (`payment-request.ts:77-80`).
  - No `PaymentLimit` check.
  - Nonce is consumed before the state transition; an expired/already-paid request burns a still-presented token (minor operational issue).
- **Why the sign-off overstates:** the finding explicitly covered "bind the payer and account server-side; only mark paid after the rail confirms". Neither is implemented. `RESOLVED` is not supportable.
- **Disposition:** PARTIALLY RESOLVED. Remaining work depends on AUD-PLAT-001 (identity) and AUD-PLAT-006 (rail).

---

### AUD-PLAT-004 — Authority of price (INV-3) — **PARTIALLY RESOLVED**

- **Severity:** CRITICAL
- **What was fixed:** `dynamicPriceSource` + `syncMerchantInventory` read `item_id/name/price` from `inventory_items` for the merchant and requested items (`main.ts:58-92, 216-218`). Static global catalog is no longer the only source.
- **Still missing:**
  - `dynamicPriceSource` falls back to the hardcoded coffee/tea/pastry catalog whenever `merchantId === "merch-cafe-1"` **or `merchantId.startsWith("demo-")`** (`main.ts:81-89`). This is a runtime price-authority bypass for any merchant id with that prefix.
  - `GovernancePolicy` is still never loaded by payment-service.
  - QR TTL is still hardcoded to `180` seconds (`main.ts:277`) rather than `policy.qrTtlSeconds()`.
  - `PaymentLimit` remains unused (no reference in `payment-service`).
  - `syncMerchantInventory` swallows DB errors (`main.ts:70-72`), so a DB outage silently degrades to the demo catalog or an inventory-not-found error.
- **Disposition:** PARTIALLY RESOLVED. Residual demo bypass tracked as **AUD-PLAT-022**; governance/TTL/limits stay in this finding.

---

### AUD-PLAT-005 — Ledger atomicity (INV-6) — **PARTIALLY RESOLVED**

- **Severity:** CRITICAL
- **What was fixed:** `postAtomicBatch` (`postgres-journal.repository.ts:80-132`) validates `ΣD = ΣC > 0` per entry and writes all entries plus the outbox row in one `BEGIN … COMMIT`. The HTTP handler now makes a single call (`ledger-service/src/main.ts:91-120`), eliminating the prior three-transaction split.
- **Still missing:**
  - **No idempotency**: `journal_entries` has no unique constraint on `(journal_id, ref, …)` and the endpoint accepts no idempotency key; a retried request still double-posts.
  - **No database-level enforcement**: `schema.sql` still has no trigger/deferred constraint requiring per-entry balance. Direct SQL or a future code path can still write imbalances. (Tracked in AUD-PLAT-012.)
  - The HTTP path still builds `PostingLine[]` inline rather than going through the `Journal` aggregate; the new check is repository-level arithmetic only.
  - No test simulates a mid-batch failure to prove rollback, and no test asserts duplicate suppression.
- **Disposition:** PARTIALLY RESOLVED. Atomicity fixed; idempotency and DB enforcement remain.

---

### AUD-PLAT-008 — Distributed QR protection — **PARTIALLY RESOLVED**

- **Severity:** HIGH
- **What was fixed:** `inspect()` added and used by `/validate-token`; `validate(token, now, consumeNonce)` allows non-destructive verification (`asymmetric-token-service.ts:112-139`).
- **Still missing:**
  - `main.ts:16` still wires `RedisNonceStore`, which is a per-process `Map` (`asymmetric-token-service.ts:15-33`). `LiveRedisNonceStore` remains unused in production.
  - The synchronous `LiveRedisNonceStore.consume` still ignores the Redis `SET NX` result (`live-redis-nonce.ts:54-62`), so even if wired it would not be safe across replicas.
  - Signing keys are still generated at startup (`main.ts:15`), so they rotate on restart and differ per replica.
- **Disposition:** PARTIALLY RESOLVED. Only the destructive-validation defect was fixed.

---

## 7. Detailed Findings — New Defects

### AUD-PLAT-022 — Hardcoded demo fixtures remain in the production payment path

- **Severity / Priority:** MEDIUM / P1
- **Status:** NEW
- **Category:** Configuration / INV-3 integrity
- **Location:** `services/payment-service/src/main.ts:38-39, 41-56, 75-92`
- **Evidence:**
  ```ts
  // Default registered accounts for testing / development
  merchantAccountsCache.set("merch-cafe-1", new Set(["cbe-settlement-acc-1"]));
  ...
  if (merchantId === "merch-cafe-1" || merchantId.startsWith("demo-")) {
    const fallbackCatalog = { "item-coffee": 150, "item-tea": 50, "item-pastry": 100, ... };
    return fallbackCatalog[itemId];
  }
  ```
  Both DB helpers catch every error and silently fall back (`main.ts:52-55, 70-72`).
- **Description:** The remediation added DB-backed data but kept a demo allow-list, a demo price catalog and silent failure fallbacks in the production module. Any merchant id beginning with `demo-` bypasses inventory authority; `merch-cafe-1` bypasses beneficiary resolution. The HTTP test passes against this fixture, so the suite does not prove the DB path works.
- **Impact:** Violates INV-3 for `demo-*` merchants; masks broken DB wiring and outages; test evidence is weaker than claimed.
- **Conditions:** Any merchant id matching the demo patterns; any DB error.
- **Remediation:** Move fixtures into test setup (seed `merchants`, `merchant_accounts`, `inventory_items`); remove the seeded cache and fallback catalog from runtime; log and fail closed (5xx) on DB errors; gate any demo mode behind an explicit `NODE_ENV`/feature flag that is off outside development.
- **Verification criteria:** No hardcoded price/account constants in runtime code; payment HTTP tests seed the DB; DB failure returns 5xx, never a fallback price.
- **Related:** AUD-PLAT-004, -009, -014, -017.

---

### AUD-PLAT-023 — `/pay` does not bind token kind or merchant to the payment

- **Severity / Priority:** LOW / P2
- **Status:** NEW
- **Category:** Cryptographic binding / defense in depth
- **Location:** `services/payment-service/src/main.ts:301-308`; `asymmetric-token-service.ts:88-110`
- **Evidence:** Validation checks only `validation.payload?.ref !== pr.paymentId`. It never checks `payload.k === "PAYMENT"` or `payload.mid === pr.merchantId`, although both fields are signed into the token.
- **Description:** A signed ITEM token (whose `ref` is an item id) or a payment token issued for another merchant is rejected only if its `ref` does not equal the payment id. UUID payment ids make collision unlikely, but the binding is incomplete.
- **Impact:** Weakened cross-merchant/cross-purpose isolation; future id schemes could make this exploitable.
- **Conditions:** Token whose `ref` collides with the target payment id.
- **Remediation:** Reject unless `payload.k === "PAYMENT"` and `payload.mid === pr.merchantId`. Add negative tests for an item token and a token issued for a different merchant.
- **Verification criteria:** Both negative cases return 400 and do not consume the legitimate nonce.
- **Related:** AUD-PLAT-003, -008.

---

### AUD-PLAT-024 — Merchant authorization state bypassed; payment-service reads the shared DB directly

- **Severity / Priority:** MEDIUM / P1
- **Status:** NEW
- **Category:** Authorization / service boundary
- **Location:** `services/payment-service/src/main.ts:41-56, 208-214`
- **Evidence:** `fetchMerchantAccounts` selects only `account_id FROM merchant_accounts WHERE merchant_id = $1`. It never checks `merchants.auth_status`, `Merchant.canSell()`, or the merchant's existence/ownership. `merchantAccountsCache` has no TTL; when the DB returns zero rows (e.g. all accounts removed), the function falls back to a previously cached set.
- **Description:** The remediation enforces "destination belongs to merchant" but not "merchant is authorized to sell". A `PENDING` or `REJECTED` merchant that has an account row can create payments. Direct table reads also bypass merchant-service's aggregate rules and couple the two contexts to one schema.
- **Impact:** Unauthorized merchants can initiate collections; stale cache can keep a removed account valid after an empty result; future merchant-service rule changes will not propagate.
- **Conditions:** Merchant with `auth_status != 'AUTHORIZED'`; account removal; DB error.
- **Remediation:** Prefer a merchant-service API (`GET /merchants/:id`) that returns `canSell()` and the registered account set, or at minimum join `merchants` and require `auth_status = 'AUTHORIZED'`. Cache with TTL and invalidate on account changes; fail closed on DB errors.
- **Verification criteria:** PENDING/REJECTED merchant → 403; removed account → 403 after cache TTL; no direct cross-context table writes.
- **Related:** AUD-PLAT-002, -007, -011.

---

## 8. Unchanged Open Findings

The following findings were re-checked for regression and remain unchanged. Full evidence is in `AUDIT-PLATFORM-2026-11-24.md` §6.

| ID | Severity | Reason unchanged |
|---|---|---|
| AUD-PLAT-001 | CRITICAL | No auth middleware added anywhere. |
| AUD-PLAT-006 | HIGH | Delivery still fabricates `FundLock`; no rail calls. |
| AUD-PLAT-007 | HIGH | `merchant.authorize(true, …)` and `TIN-` auto-validation unchanged. |
| AUD-PLAT-009 | HIGH | `paymentStore` Map and `InMemoryUserRepository` remain; duplicate line inserts unchanged. |
| AUD-PLAT-010 | HIGH | Delivery rehydration/setters unchanged. |
| AUD-PLAT-011 | HIGH | No consumers or cross-service calls; e2e still domain-only. |
| AUD-PLAT-012 | HIGH | No trigger/unique constraint in `schema.sql`. |
| AUD-PLAT-013 | HIGH | Unpeppered registration and placeholder KYC proofs unchanged. |
| AUD-PLAT-014 | MEDIUM | Hardcoded secrets and exposed data stores unchanged. |
| AUD-PLAT-015 | MEDIUM | Outbox worker unchanged. |
| AUD-PLAT-016 | MEDIUM | No validation layer added. |
| AUD-PLAT-017 | MEDIUM | Register/sign-off overstatement now partially corrected by this report only. |
| AUD-PLAT-018 | MEDIUM | Terraform unchanged. |
| AUD-PLAT-019 | LOW | Observability unchanged. |
| AUD-PLAT-020 | LOW | Money type unchanged. |
| AUD-PLAT-021 | LOW | Repository rehydration unchanged. |

---

## 9. Positive Observations

1. **The INV-2 fix is structural, not cosmetic:** the client-supplied allow-list was removed from the contract and the server resolves the destination set itself. This is the right shape.
2. **`inspect()` vs `validate()` is a clean separation** and removes the "validation burns the payer's code" hazard.
3. **`postAtomicBatch` correctly places all writes and the outbox row in one transaction**, which is a meaningful improvement over the prior three-transaction implementation.
4. **The balance assertion is duplicated at the repository boundary**, so the HTTP path now has a mathematical guard even though it skips the aggregate.
5. **New HTTP tests assert the 403/400 negative paths** for beneficiary lockdown and token enforcement — the first runtime tests of those invariants.

---

## 10. Recommendations

1. **Do not treat the Phase A sign-off as complete.** Re-issue it with `PARTIALLY RESOLVED` statuses for 003/004/005/008 and reference this verification report.
2. **Remove demo fixtures from runtime** before the next test cycle; seed test data in the database instead. Otherwise the suite continues to certify a fixture, not the system.
3. **Add the missing negative/atomicity tests** before claiming verification: cross-merchant token, item-token-as-payment, PENDING merchant, ledger rollback on failure, ledger duplicate suppression.
4. **Enforce INV-6 at the database** (deferred constraint trigger) rather than only in repository code.
5. **Make INV-2/-3 resolution go through merchant-service**, or explicitly accept shared-DB coupling as a documented architectural decision.
6. **Keep the sign-off evidence rule**: a finding may only be marked RESOLVED when every clause of its original remediation criteria is met and a targeted test exists.

---

## 11. Prioritized Remediation Plan (Phase A2)

### Immediate (complete Phase A)
1. **AUD-PLAT-003** Bind `payerId`/`bankAccountId` to an authenticated principal and account-ownership check; add rail confirmation or explicit "sandbox" flag that blocks PAID without a rail reference.
2. **AUD-PLAT-004** Remove the demo price fallback; load governance policy and apply `qrTtlSeconds()`; enforce `PaymentLimit`.
3. **AUD-PLAT-005** Add idempotency key + `UNIQUE (journal_id, ref, event)`; add deferred balance trigger; add rollback/idempotency tests.
4. **AUD-PLAT-008** Wire atomic `LiveRedisNonceStore` (or equivalent async store); load stable keys from KMS/env; remove per-startup key generation.
5. **AUD-PLAT-022** Move fixtures to tests; fail closed on DB errors.
6. **AUD-PLAT-024** Require `auth_status = 'AUTHORIZED'` via merchant-service or a joined query; add cache TTL.
7. **AUD-PLAT-023** Validate `k` and `mid` in `/pay`.

### Then Phase B (unchanged from baseline)
8. AUD-PLAT-001 authentication/authorization.
9. AUD-PLAT-006/-010 bank-backed delivery escrow.
10. AUD-PLAT-007 real TIN/virtual-merchant review.
11. AUD-PLAT-009 persistence and duplicate lines.
12. AUD-PLAT-011 orchestration/consumers + HTTP e2e.
13. AUD-PLAT-012 DB constraints; AUD-PLAT-013 privacy; AUD-PLAT-014 secrets; AUD-PLAT-015 outbox; AUD-PLAT-018 Terraform.
14. AUD-PLAT-016/-017/-019/-020/-021 quality items.

---

## 12. Audit Conclusion

The Phase A remediation delivered **one fully resolved CRITICAL finding (INV-2)** and **four partial fixes**. The claim that 003, 005 and 008 are RESOLVED is not supported by the code or tests; 004 was correctly labelled partial in the sign-off but still contains a demo-only price bypass that the sign-off did not mention.

The platform remains **NO-GO for production**, with 23 outstanding findings including 4 CRITICAL. The remediation improved the security posture materially, but it also introduced fixture-driven test evidence and a merchant-authorization gap that must be closed before the Phase A sign-off can be upgraded.

**Recommended next action:** run `/sign-off` scoped to **AUD-PLAT Phase A2** (AUD-PLAT-003, -004, -005, -008, -022, -023, -024), then re-audit. Do not begin Phase B until Phase A2 is verified.

---

## 13. Verification Limitations

- The verification ran against the same live local PostgreSQL/Redis/Kafka stack; no clean-room rebuild or fresh schema apply was performed.
- The working directory is not a git repository, so change detection used file mtimes and code inspection, not diffs.
- No dynamic testing of concurrency, replay across replicas, or rollback injection was performed.
- The sign-off's own evidence was not independently re-executed at its timestamp; it was re-run now against the current tree.
- Findings are point-in-time and should be re-checked before any release decision.

---

## 14. References

- `agent-handoffs/audit/reports/AUDIT-PLATFORM-2026-11-24.md` — baseline audit (21 findings, full evidence).
- `agent-handoffs/audit/sign-off/SIGN-OFF-PHASE-A-2026-11-24.md` — remediation record under verification.
- `agent-handoffs/audit/reports/FINSYNC_CODE_AUDIT.md` — original deep audit.
- `agent-handoffs/audit/master-audit.md` — updated register.
- `services/payment-service/src/main.ts`, `asymmetric-token-service.ts`, `http.test.ts`
- `services/ledger-service/src/main.ts`, `postgres-journal.repository.ts`
- `infra/postgres/schema.sql`

---

*End of audit — AUD-PLATFORM-2026-11-24-R2.*
