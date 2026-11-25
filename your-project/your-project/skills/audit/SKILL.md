---
name: audit
description: "Conducts an exhaustive architectural, security, and code quality audit of the FinSync platform. Trigger whenever the user types /audit or asks to audit the implementation."
---

# Custom Agent Directive: /audit

When I type `/audit`, conduct an exhaustive technical, architectural, security, and test suite audit of the FinSync platform.

## Objective
Inspect and verify the codebase against the seven non-negotiable architectural invariants, SOLID class contracts, cryptographic rigor, database integrity, and Phase 0 exit criteria, recording or updating the findings in `docs/sign-offs/AUDIT_REPORT.md`.

## Instructions
1. Verify the Seven Non-Negotiable Invariants:
   - National custody rule (banks hold money, no custodial wallets).
   - Beneficiary lockdown (merchant accounts only, cashier never beneficiary).
   - Authority of price (prices from inventory catalog only).
   - Asymmetric QR tokens (NIST P-256 ECDSA signatures, Redis single-use nonce consumption).
   - Cashier separation of interest (anti-collusion eligibility checks).
   - Double-entry balance constraint ($\sum \text{Debits} = \sum \text{Credits} \neq 0$).
   - Pre-consumption delivery escrow (100m geofence check before burning QR).
2. Execute and verify the complete test suite:
   - Run `npm run build && npm test && npm run test:e2e` in `code/unpacked/finsync-app`.
   - Confirm 0 failures across all microservice workspaces.
3. Verify live infrastructure status:
   - PostgreSQL (port 5433), Redis (port 6379), Kafka (port 9092), and microservice HTTP endpoints (:3001 through :3007).
4. Update `docs/sign-offs/AUDIT_REPORT.md` with:
   - Audit timestamp and version.
   - Comprehensive component matrix and test coverage figures.
   - Security and fraud defense assessment.
   - Definite audit verdict (PASSED / FAILED) with specific recommendations.
