# Architectural Documentation Index

Welcome to the **FinSync on EthSwitch** Architectural Documentation repository. This directory contains the authoritative system architecture, domain models, cryptographic designs, operational governance policies, and infrastructure specifications.

---

## Document Catalog

| Document | Purpose & Scope | Status | Last Updated |
| :--- | :--- | :---: | :---: |
| [ARCHITECTURE.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/architecture/ARCHITECTURE.md) | **System Architecture & SOLID Class Contracts**<br>Comprehensive technical specification covering the v2 EthSwitch-owned non-custodial model, 7 microservice responsibilities, asymmetric ECDSA QR cryptography, double-entry mathematical balancing, and AWS/hybrid cloud topology. | **Approved / Active** | 2026-11-24 |
| [GOVERNANCE.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/architecture/GOVERNANCE.md) | **Architecture Governance & Engineering Standards**<br>Authoritative governance rules for architecture organization, single-source-of-truth documentation, non-destructive development, and the senior engineer/architect dual role. | **Authoritative / Active** | 2026-11-24 |
| [OPERATIONAL_GOVERNANCE.md](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/architecture/OPERATIONAL_GOVERNANCE.md) | **Operational Governance & Policy Engine**<br>Two-tier governance rules (`strict` vs `loose` presets), cashier anti-collusion separation of interest, audit logging in PostgreSQL (`rules JSONB`), cashier daily closing, and Ministry of Revenues (MOR) fiscal tax integration. | **Approved / Active** | 2026-11-24 |

---

## Architectural Principles Quick Reference

1. **National Custody Rule:** Banks hold all funds; EthSwitch coordinates rails; FinSync never holds deposits or acts as a custodial wallet.
2. **Authority of Price:** Callers send item IDs and quantities, never prices. Prices strictly resolve from inventory catalogs (`IPriceSource`).
3. **Beneficiary Lockdown:** Money flows strictly to authorized `MerchantAccount` destinations. Cashiers are never beneficiaries.
4. **Asymmetric QR Tokens:** Signed with NIST P-256 (`secp256r1`) ECDSA private keys. Mobile apps cache public keys for instant offline verification. Single-use nonces are invalidated atomically in Redis.
5. **Cashier Separation of Interest:** Cashiers cannot own unrelated businesses; active cashiers cannot register businesses.
6. **Double-Entry Balance Constraint:** Every journal posting requires $\sum \text{Debits} = \sum \text{Credits} \neq 0$ enforced at the PostgreSQL constraint level.
7. **Pre-Consumption Escrow:** Delivery handover codes are only burned after verifying GPS proximity ($\le 100\text{m}$), recipient identity, and order status.

---

## Navigation
* [Back to Master Handoffs & Governance Hub](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/INDEX.md)
* [Implementation Plans](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/plan/INDEX.md)
* [Sign-Offs & Audits](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/master-audit.md)
