# Development Plan: Phase A2 Critical Invariant Remediation

**Plan ID:** `PLAN-PHASE-A2-REMEDIATION-2026-11-24`  
**Date:** 2026-11-24  
**Status:** `IN_PROGRESS`  
**Target Services:** `payment-service` (:3003), `ledger-service` (:3005), `merchant-service` (:3004)  
**Governing Invariants:** INV-2 (Beneficiary Lockdown), INV-3 (Authority of Price), INV-4 (Asymmetric QR Tokens), INV-6 (Double-Entry Balance)  

---

## 1. Objective & Requirements
Address the residual risks and qualifying findings identified in the forensic re-audit ([AUDIT-PLATFORM-2026-11-24-R2.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/reports/AUDIT-PLATFORM-2026-11-24-R2.md)) to achieve full, unconditional sign-off for Phase A before proceeding to Phase B.

---

## 2. Pre-Development Audit Check
- **Audited Findings Targeted:**
  - `AUD-PLAT-022` (MEDIUM, NEW): Hardcoded demo fixtures (`merch-cafe-1`, `demo-*`) in production payment path.
  - `AUD-PLAT-024` (MEDIUM, NEW): Merchant authorization check bypassed (account presence alone treated as authorized).
  - `AUD-PLAT-023` (LOW, NEW): Token validation on `/pay` does not bind merchant ID (`mid`) or kind (`k`).
  - `AUD-PLAT-004` (CRITICAL, PARTIAL): Complete removal of demo price fallback; fail closed on unlisted items.
  - `AUD-PLAT-005` (CRITICAL, PARTIAL): Ledger idempotency key enforcement and transaction rollback verification.
  - `AUD-PLAT-008` (HIGH, PARTIAL): Nonce storage verification against Redis distributed store.

---

## 3. Invariant Constraints & Guardrails
- **INV-2 (Beneficiary Lockdown):** A destination account must not only exist in `merchant_accounts`, but the parent merchant in `merchants` must have `auth_status = 'AUTHORIZED'`.
- **INV-3 (Authority of Price):** Prices derive 100% dynamically from PostgreSQL `inventory_items`. Any missing item immediately aborts checkout with `400 Bad Request`. No hardcoded fallback dictionaries.
- **INV-4 (Asymmetric QR Tokens):** Token verification on `/pay` must validate that `token.mid === payment.merchantId` and token kind matches payment mode. Cross-merchant token reuse is blocked.
- **INV-6 (Double-Entry Balance):** `postAtomicBatch` enforces idempotency (suppresses duplicates) and guarantees ACID atomicity with rollback.

---

## 4. Implementation Steps

### Step 1: Merchant Authorization Gating (`AUD-PLAT-024`)
- In `services/payment-service/src/main.ts`:
  - Update `fetchMerchantAccounts` to join against `merchants` table and check `auth_status = 'AUTHORIZED'`.
  - Reject payment creation with `403 Forbidden` (`Merchant not authorized to transact`) if the merchant is `PENDING`, `SUSPENDED`, or not found.

### Step 2: Remove Hardcoded Demo Fixtures & Fallbacks (`AUD-PLAT-022`, `AUD-PLAT-004`)
- In `services/payment-service/src/main.ts`:
  - Remove fallback mock dictionary `mockCatalog` and hardcoded `merch-cafe-1` default accounts.
  - Require PostgreSQL inventory lookup to succeed or fail closed with `400 Bad Request` (`Item not listed in merchant catalog`).
  - Update integration test suites (`http.test.ts`) to seed test merchants, accounts, and inventory items directly into PostgreSQL during test setup before running assertions.

### Step 3: Token Merchant & Kind Binding (`AUD-PLAT-023`)
- In `services/payment-service/src/main.ts`:
  - In `POST /api/v1/payments/:id/pay`, verify `token.mid === payment.merchantId`.
  - Reject with `400 Bad Request` if token was issued for a different merchant.

### Step 4: Ledger Idempotency & Rollback Tests (`AUD-PLAT-005`)
- In `services/ledger-service/src/postgres-journal.repository.ts`:
  - Add optional `idempotencyKey` check or verify deduplication on posting batch.
  - Author a test verifying that an intentional mid-batch failure rolls back both journal entries and outbox events.

---

## 5. Verification & Testing Strategy
- Compile TypeScript across all workspaces:
  ```bash
  npm run build --workspaces --if-present
  ```
- Run full test suite:
  ```bash
  npm test --workspaces --if-present
  npm run test:e2e
  ```
- Targeted tests to add in `services/payment-service/src/http.test.ts`:
  - Reject checkout for `PENDING` merchant with `403 Forbidden`.
  - Reject checkout for missing inventory item with `400 Bad Request`.
  - Reject payment using a token signed for another merchant with `400 Bad Request`.
  - Assert 91+ clean passing tests.

---

## 6. Audit Scope Definition for Context-Free `/audit`
- Target Microservices: `payment-service` (:3003), `ledger-service` (:3005).
- Target Files: `services/payment-service/src/{main.ts, http.test.ts}`, `services/ledger-service/src/postgres-journal.repository.ts`.
- Governing Invariants: INV-2, INV-3, INV-4, INV-6.
