# Development Plan: Phase A Critical Invariant Remediation

**Plan ID:** `PLAN-PHASE-A-INVARIANTS-2026-11-24`  
**Date:** 2026-11-24  
**Status:** `COMPLETED`  
**Target Services:** `payment-service` (:3003), `ledger-service` (:3005)  
**Governing Invariants:** INV-2 (Beneficiary Lockdown), INV-3 (Authority of Price), INV-4 (Asymmetric QR Tokens), INV-6 (Double-Entry Balance)  

---

## 1. Objective & Requirements
Remediate the critical runtime bypasses identified during the platform audit ([AUDIT-PLATFORM-2026-11-24.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/reports/AUDIT-PLATFORM-2026-11-24.md)), transitioning domain-only compliance claims to live, runtime-enforced HTTP and database assertions.

## 2. Pre-Development Audit Check
- Audited Findings Targeted:
  - `AUD-PLAT-002` (CRITICAL): Beneficiary lockdown bypass.
  - `AUD-PLAT-003` (CRITICAL): Payment completed without QR token or rail verification.
  - `AUD-PLAT-004` (CRITICAL): Mock catalog used instead of live dynamic merchant inventory.
  - `AUD-PLAT-005` (CRITICAL): Ledger postings non-atomic and unvalidated at DB level.
  - `AUD-PLAT-008` (HIGH): QR verify burns nonce prematurely; ephemeral memory nonce store.

## 3. Invariant Constraints & Guardrails
- Money flows strictly to verified merchant destination accounts from PostgreSQL `merchant_accounts`.
- Prices strictly resolve server-side from PostgreSQL `inventory_items` table per merchant.
- NIST P-256 signatures verified on `/pay` with atomic single-use nonce consumption in Redis.
- Double-entry ledger postings executed in a single ACID transaction (`BEGIN ... COMMIT`) asserting $\sum \text{Debits} = \sum \text{Credits} \neq 0$.

## 4. Implementation Steps
1. In `payment-service`:
   - Add `inspect()` to `AsymmetricQRTokenService` to support preview without burning the nonce.
   - Remove `registeredAccountIds` from client request bodies.
   - Wire `fetchMerchantAccounts(merchantId)` and `syncMerchantInventory(merchantId, itemIds)` to query PostgreSQL directly.
   - Enforce mandatory QR token validation and nonce consumption on `POST /api/v1/payments/:id/pay`.
2. In `ledger-service`:
   - Implement `postAtomicBatch` in `PostgresJournalRepository` to execute merchant entry, cashier entry, and outbox event in a single PostgreSQL transaction with balance verification.
   - Connect `POST /api/v1/ledger/postings` to `postAtomicBatch`.

## 5. Verification & Testing Strategy
- Compile TypeScript: `npm run build --workspaces --if-present`
- Run workspace tests: `npm test --workspaces --if-present` (90 tests)
- Run E2E test: `npm run test:e2e` (1 test)
- Add negative tests in `http.test.ts` for:
  - Client attempting to pay an unregistered account (403 Forbidden).
  - Client attempting to pay without a QR token (400 Bad Request).
  - Client attempting to replay a consumed QR token (400 Bad Request).

## 6. Audit Scope Definition for Context-Free `/audit`
- Files Inspected: `services/payment-service/src/{asymmetric-token-service.ts, main.ts, http.test.ts}`, `services/ledger-service/src/{postgres-journal.repository.ts, main.ts}`.
- Sign-Off Dossier: [`agent-handoffs/audit/sign-off/SIGN-OFF-PHASE-A-2026-11-24.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/sign-off/SIGN-OFF-PHASE-A-2026-11-24.md).
