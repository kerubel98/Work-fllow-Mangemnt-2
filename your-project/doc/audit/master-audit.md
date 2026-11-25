# FinSync on EthSwitch — Master Audit Ledger

## Overview
This document is the authoritative tracking ledger for architectural integrity, security posture, and invariant compliance across the FinSync platform.

**Repository:** `FinSync on EthSwitch (v2)`  
**Target Rails:** EthSwitch National Switch & Ethiopian Commercial Banks (CBE, Dashen, etc.)  
**Current Test Coverage:** 91 / 91 tests passing (100% clean)  
**Latest Point-in-Time Audit:** 2026-11-24  

---

## 1. Compliance Matrix: 7 Non-Negotiable Invariants

| # | Invariant | Scope / Service | Status | Verification Reference |
|---|---|---|---|---|
| **INV-1** | **National Custody Rule** | `bank-gateway-service` (:3002) | **COMPLIANT** | `ethswitch-gateway.ts`, tests in `bank-gateway-service` |
| **INV-2** | **Beneficiary Lockdown** | `payment-service` (:3003) | **COMPLIANT** | `payment-request.ts` (enforced in domain & API) |
| **INV-3** | **Authority of Price** | `merchant-service` (:3004), `payment-service` (:3003) | **COMPLIANT** | `IPriceSource`, `inventory.ts`, `postgres-merchant.repository.ts` |
| **INV-4** | **Asymmetric QR Tokens** | `payment-service` (:3003) | **COMPLIANT** | `asymmetric-token-service.ts` (NIST P-256 ECDSA), `live-redis-nonce.ts` |
| **INV-5** | **Cashier Separation of Interest** | `merchant-service` (:3004) | **COMPLIANT** | `cashier.ts` (`CashierEligibility`), `till-session.ts` |
| **INV-6** | **Double-Entry Constraint** | `ledger-service` (:3005) | **COMPLIANT** | `journal.ts`, `schema.sql` (DB constraints: $\sum D = \sum C \neq 0$) |
| **INV-7** | **Pre-Consumption Escrow** | `delivery-service` (:3006) | **COMPLIANT** | `delivery-service/src/main.ts` (Haversine $\le 100\text{m}$ geofence) |

---

## 2. Test Verification Ledger

| Workspace / Package | Tests Run | Pass | Fail | Coverage Highlights |
|---|---:|---:|---:|---|
| `@finsync/bank-gateway-service` | 9 | 9 | 0 | Native split settlement, clearing pool fallback, fund locks |
| `@finsync/delivery-service` | 15 | 15 | 0 | 100m geofence scan, courier pickup, 3-way split escrow |
| `@finsync/ledger-service` | 14 | 14 | 0 | Double-entry journal balance, cashier closing, bank settlement |
| `@finsync/merchant-service` | 25 | 25 | 0 | Catalog prices, anti-collusion, governance, dynamic till sessions |
| `@finsync/payment-service` | 16 | 16 | 0 | Asymmetric ECDSA QR, Redis single-use nonce, OpenAPI 3.1 Swagger UI |
| `@finsync/tax-gateway-service` | 6 | 6 | 0 | Ministry of Revenues TIN validation, 15% VAT fiscal receipt |
| `@finsync/user-service` | 5 | 5 | 0 | Peppered HMAC-SHA256 National ID hashing, KYC verification |
| `test/e2e-lifecycle.test.js` | 1 | 1 | 0 | 9-step cross-service lifecycle across all 7 microservices + Kafka |
| **Total** | **91** | **91** | **0** | **100% Passing** |

---

## 3. Audit Reports Directory
Detailed point-in-time reviews and gap analyses:
- [AUDIT_REPORT.md](file:///c:/Users/hp/Downloads/FinSync_Project/doc/audit/reports/AUDIT_REPORT.md) &mdash; Executive summary and production readiness assessment.
- [FINSYNC_CODE_AUDIT.md](file:///c:/Users/hp/Downloads/FinSync_Project/doc/audit/reports/FINSYNC_CODE_AUDIT.md) &mdash; Deep architectural and security code review.

---

## 4. Phase Exit Sign-Offs
Formal milestone reviews and committee sign-off dossiers:
- [PHASE_0_EXIT_SIGNOFF.md](file:///c:/Users/hp/Downloads/FinSync_Project/doc/audit/sign-off/PHASE_0_EXIT_SIGNOFF.md) &mdash; Formal Phase 0 Exit Sign-off Dossier (Gates G-1 through G-6).
