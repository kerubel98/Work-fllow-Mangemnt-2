# FinSync Master Implementation Plan (v2.0)
*See full implementation roadmap in artifacts directory: `master_implementation_plan.md`*

## 28-Month Phased Roadmap
- **Phase 0: Foundations & Sandbox Verification (Months 1–3)**
  - Validate `IPaymentRail.lockFunds` and `settleLock` (multi-recipient split settlement) in EthSwitch sandbox.
  - Provision AWS VPC / Local Hybrid infrastructure via Terraform; establish mTLS and private subnets.
  - Complete NBE regulatory filing and Ethiopian Personal Data Protection compliance clearance.
- **Phase 1: Core Payments & Double-Entry Ledger (Months 4–10)**
  - Implement HTTP layer, PostgreSQL relational schemas, and Kafka event bus for core services.
  - Upgrade QR signing from HMAC to Asymmetric ECDSA with AWS KMS / CloudHSM.
  - Deploy Item QR, Assigned Restaurant Payment, and Cashier Cart with strict/loose governance.
  - Complete closed beta with 50 merchants across Addis Ababa.
- **Phase 2: Digital Commerce & Tax Gateway (Months 11–16)**
  - Launch virtual merchant storefronts and shared deep links (TikTok / Instagram cards).
  - Integrate Ministry of Revenues electronic sales tax reporting (`ITaxAuthority`).
- **Phase 3: Delivery Escrow & Pay Later (Months 17–22)**
  - Deploy `DeliveryOrder` state machine with geofenced release ($\le 100\text{m}$) and multi-recipient split payout.
  - Deploy Pay Later structured receivable agreements.
- **Phase 4: AI Intelligence & Ecosystem Scale (Months 23–28)**
  - Deploy `TrustGraph` behavioral fraud models and `AdvertiserCampaign` ad platform.
  - Full nationwide expansion across major Ethiopian urban centers.
