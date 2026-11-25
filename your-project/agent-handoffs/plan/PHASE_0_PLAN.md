# FinSync on EthSwitch: Phase 0 Plan (Foundations & Sandbox Verification)
*See full detailed implementation plan in artifacts directory: `phase_0_master_plan.md`*

## Summary of Phase 0 (Months 1–3 / 12 Weeks)
- **Goal:** De-risk technical, banking, legal, and infrastructure hypotheses before Phase 1 Core Payments.
- **5 Core Workstreams:**
  1. *EthSwitch & Banking Integration:* Sandbox connectivity, proving `IPaymentRail` (`requestAccountApproval`, `pay`, `lockFunds`, `releaseLock`, `settleLock` multi-recipient split) or ratifying Clearing Pool fallback.
  2. *Regulatory & Compliance:* National Bank of Ethiopia (NBE) regulatory sandbox filing, Ethiopian Data Protection Proclamation (local data residency) clearance, Ministry of Revenues (MOR) electronic tax API discovery.
  3. *Cloud & Hybrid Infrastructure:* Terraform deployment for AWS VPC (af-south-1) / local hybrid, MSK Kafka (v2 topics), RDS PostgreSQL 16 Multi-AZ, Redis Cluster, API Gateway, and mTLS internal service mesh.
  4. *Cryptography & Security:* Upgrade QR tokens from HMAC to Asymmetric ECDSA (secp256r1) with AWS KMS / CloudHSM, Redis atomic nonce invalidation, peppered National ID hashing.
  5. *Transport & Persistence Scaffolding:* Fastify HTTP controllers, OpenAPI 3.1 contracts, PostgreSQL DDL migrations with double-entry balance constraints, and Kafka transactional outbox pattern.
- **Exit Gates:**
  - Multi-recipient split settlement proven or Clearing Pool fallback ratified.
  - Terraform infrastructure 100% automated with zero public database exposure.
  - NBE sandbox filing submitted and Data Residency certified.
  - Mathematical double-entry balance enforcement at DB level ($D = C \neq 0$).
