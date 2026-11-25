# FinSync Operational Governance & Cashier Controls (v2.0)
*See full governance specification in artifacts directory: `operational_governance_and_skills.md`*

## Summary of Operational Governance
- **Two-Tier Governance Model:**
  1. *Fixed Invariants:* Settlement strictly to registered merchant accounts; amounts derived exclusively from inventory; geofenced delivery check before token burn; balanced double-entry journals.
  2. *Configurable Merchant Policies (`GovernancePolicy`):* Cart creation, approval thresholds, cashier limits, discount permissions, QR code TTL (30–900s). Available in `strict` and `loose` presets. Every change creates an append-only `AuditEntry`.
- **Cashier Anti-Collusion (`CashierEligibility`):**
  - Cross-platform business lookup (`IOwnershipLookup`): Blocks users who own an unrelated business from being cashiers.
  - Active cashiers are barred from registering new businesses.
- **Daily Financial Close & Reconciliation:**
  - Cashier clearing accounts (`PENDING_COLLECTION` vs `DUE_TO_MERCHANT`) must net to 0.00 ETB.
  - Nightly automated comparison between internal books and EthSwitch bank settlement files via `ReconciliationService`.
- **Tax Authority Integration (`ITaxAuthority`):**
  - Pre-authorization TIN check with Ministry of Revenues.
  - Real-time or buffered electronic invoice transmission upon transaction settlement.
