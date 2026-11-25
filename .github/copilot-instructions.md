# GitHub Copilot Instructions for FinSync on EthSwitch

## Project Overview
FinSync on EthSwitch is Ethiopia's national payment coordination, retail POS, asymmetric ECDSA QR token, double-entry ledger, and delivery escrow platform. It interfaces with commercial banks (CBE, Dashen Bank, etc.), EthSwitch national rails, and the Ministry of Revenues (MOR).

---

## 7 Non-Negotiable Invariants
When writing, reviewing, or refactoring code in this repository, you **MUST ALWAYS** uphold these architectural rules without exception:

1. **National Custody Rule:**
   - Banks hold all customer and merchant deposits.
   - EthSwitch coordinates clearing and settlement rails.
   - FinSync never holds deposits, never creates custodial balances, and never acts as a bank.

2. **Beneficiary Lockdown:**
   - Payment settlements flow exclusively to registered, verified `MerchantAccount` destinations.
   - Cashiers, clerks, and waitstaff are never beneficiaries of customer payments.

3. **Authority of Price:**
   - API callers and frontends send item IDs and quantities, **never unit prices**.
   - Unit prices are strictly resolved server-side from inventory catalogs implementing `IPriceSource`.
   - Never accept an `amount` or `price` parameter from the client for retail cart checkouts.

4. **Asymmetric QR Tokens:**
   - Payment QR tokens are signed using NIST P-256 (`secp256r1`) ECDSA private keys.
   - Mobile apps and merchant terminals cache public keys (JWKS SPKI PEM) for offline instant verification.
   - Single-use nonces are invalidated atomically in Redis (`SET NX EX 120`) to prevent replay attacks.

5. **Cashier Separation of Interest:**
   - Active cashiers cannot own or register unrelated businesses.
   - Business owners cannot act as cashiers for unrelated merchants.
   - A physical POS register may only host one active till session at a time (`TillSession`).

6. **Double-Entry Balance Constraint:**
   - Every financial journal transaction requires:
     $$\sum \text{Debits} = \sum \text{Credits} \neq 0$$
   - Enforce this invariant mathematically at both the application domain and PostgreSQL constraint levels.

7. **Pre-Consumption Escrow:**
   - Delivery order handover codes are only burned after verifying:
     - GPS distance proximity between courier and customer destination is $\le 100\text{m}$.
     - Recipient identity verification matches the assigned order.
     - Fund lock has not expired.

---

## Audit, Planning & Development Directives
Copilot must adhere to the standardized development and audit lifecycle:
- **Pre-Development Audit Check:** Before implementing new features, check `agent-handoffs/audit/master-audit.md` for pending audit findings in the affected subsystems. Prioritize resolving pending critical/high audit tasks before expanding features.
- **Plan Generation (`agent-handoffs/plan/`):** For every development request, author a structured plan in `agent-handoffs/plan/PLAN-<NAME>-<DATE>.md` and register it in `agent-handoffs/plan/INDEX.md` before coding.
- **Auditing (`/audit`):** Perform scoped assessments using the `code-audit` skill without modifying source code unless requested. When `/audit` is invoked without arguments, autonomously discover the scope by checking `agent-handoffs/plan/INDEX.md`, recent git diffs, and `agent-handoffs/audit/master-audit.md`. Record findings in `agent-handoffs/audit/reports/` and update `agent-handoffs/audit/master-audit.md`.
- **Remediation & Sign-Off (`/sign-off`):** When remediating audit findings, implement safe fixes, verify with targeted tests (`npm test --workspaces --if-present` and `npm run test:e2e`), generate sign-off records in `agent-handoffs/audit/sign-off/SIGN-OFF-<SCOPE>-<DATE>.md`, and update the master register.

---

## Technology Stack & Ports
- **Runtime:** Node.js (v20+ / v24+), TypeScript strict mode, ES2022.
- **Testing:** Node.js native test runner (`node:test`, `node:assert/strict`).
- **Services & Ports:**
  - `user-service`: `:3001` (National ID hashing, bank account linking, KYC)
  - `bank-gateway-service`: `:3002` (EthSwitch gateway, multi-party split holds)
  - `payment-service`: `:3003` (Asymmetric QR tokens, cart engine, OpenAPI /docs)
  - `merchant-service`: `:3004` (Inventory catalog, cashier shifts, till sessions)
  - `ledger-service`: `:3005` (Double-entry journal, settlement reconciliation)
  - `delivery-service`: `:3006` (Escrow fund locks, 100m geofence verification)
  - `tax-gateway-service`: `:3007` (Ministry of Revenues TIN checks, VAT receipts)
- **Infrastructure:**
  - PostgreSQL 16 on port `5433` (Docker mapped `5433:5432`, db: `finsync`, user: `finsync`)
  - Redis 7 on port `6379`
  - Apache Kafka 7.6 on port `9092`
  - Zookeeper on port `2181`

---

## Coding Conventions
- Prefer pure domain models with dependency inversion over framework couplings.
- Always use explicit types for financial amounts (numbers rounded to 2 decimal places: `Math.round(val * 100) / 100`).
- Always handle errors gracefully with meaningful HTTP status codes (`400`, `401`, `403`, `404`, `409`, `500`).
- Keep all unit and integration tests passing (`npm test --workspaces --if-present` and `npm run test:e2e`).
