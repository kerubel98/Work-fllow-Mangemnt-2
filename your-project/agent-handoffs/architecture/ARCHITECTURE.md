# FinSync on EthSwitch: System Architecture Document (v2.0)
*See full system architectural specification in artifacts directory: `architecture_document.md`*

## Summary of Core Architecture
- **Ownership:** Owned & operated by EthSwitch (National Payment Switch of Ethiopia).
- **Core Principle:** Banks hold the money. FinSync provides routing, governance, cashier controls, geofenced delivery release, and double-entry balancing.
- **Microservices:**
  - `user-service`: KYC, National ID hashing, Bank account linking with bank approval.
  - `bank-gateway-service`: `IPaymentRail` decouples platform from individual banks. `EthSwitchGateway` manages payments, fund locks, releases, and split settlements.
  - `merchant-service`: Business profile, TIN verification, registered settlement accounts, inventory pricing, and cashier governance (`GovernancePolicy`).
  - `payment-service`: `PaymentRequest` state machine, cryptographically signed, timestamped, single-use QR tokens (`QRTokenService`).
  - `ledger-service`: Immutable double-entry bookkeeping on PostgreSQL (`Journal`, `JournalEntry`, `PaymentPosting`, `EndOfDayClose`, `ReconciliationService`).
  - `delivery-service`: `DeliveryOrder` state machine, bank fund lock, geofenced single-use delivery QR, atomic split payout.
  - `tax-gateway-service`: `ITaxAuthority` integration for Ministry of Revenues (MOR) electronic tax reporting and TIN verification.
  - `catalog-service`, `ai-service`, `ad-service`: Stubs for commerce, trust graph modeling, and targeted advertising in later phases.
