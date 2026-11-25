# Service Refactor Implementation Plan

## Objective

Remove hard-coded operational assumptions from the service layer, normalize status semantics, and reduce fragile fallback behavior so the system remains stable under real multi-workflow, multi-team operation.

This plan is the execution version of the service audit and is designed to be implemented in controlled phases with clear ownership, test coverage, and rollback boundaries.

---

## 1) Refactor goals

### Primary goals

1. Replace canonical field assumptions such as `transaction_id` with metadata-driven resolution.
2. Separate validation verdict, pipeline action, and issue lifecycle into distinct typed domains.
3. Remove silent fallback behavior that masks configuration drift.
4. Harden batching and query chunking logic with explicit validation guardrails.
5. Keep approval flows domain-aware instead of flattening all review types into one generic model.
6. Keep reporting/dashboard metrics separate from operational approval and workflow governance.

### Non-goals

- Do not introduce a new queueing system like Kafka or Redis.
- Do not rewrite the PostgreSQL persistence layer.
- Do not broaden governance to general settings UI unless the task is a true operational approval case.

---

## 2) Architectural decision to enforce

The system should follow this contract:

- Validation verdict answers: “Did the rule pass or fail?”
- Pipeline action answers: “What should the workflow do next?”
- Issue lifecycle answers: “What state is the parent case in?”

These must never be treated as the same field or same type.

### Required model split

- ValidationVerdict: PASS | FAIL | ERROR | PAUSED_DB_OFFLINE | PENDING
- PipelineAction: CONTINUE | STOP | CLOSE | FLAG | REPORT
- IssueLifecycleStatus: OPEN | IN_PROGRESS | ACTION_REQUIRED | RESOLVED | CLOSED

The UI can still render simplified state labels, but the service contracts must remain explicit and typed.

---

## 3) Scope of files to refactor

### Backend services

- [backend/src/services/makerCheckerService.ts](backend/src/services/makerCheckerService.ts)
- [backend/src/services/reconciliationService.ts](backend/src/services/reconciliationService.ts)
- [backend/src/services/investigationPlanner.ts](backend/src/services/investigationPlanner.ts)
- [backend/src/services/batchPlanner.ts](backend/src/services/batchPlanner.ts)
- [backend/src/services/requiredFieldResolver.ts](backend/src/services/requiredFieldResolver.ts)
- [backend/src/services/workflowBundleService.ts](backend/src/services/workflowBundleService.ts)
- [backend/src/services/approvalService.ts](backend/src/services/approvalService.ts)

### Frontend services

- [frontend/src/services/globalMappingService.ts](frontend/src/services/globalMappingService.ts)
- [frontend/src/services/investigationPlanner.ts](frontend/src/services/investigationPlanner.ts)
- [frontend/src/services/statusAggregator.ts](frontend/src/services/statusAggregator.ts)

### Shared types

- [backend/src/types.ts](backend/src/types.ts)
- [frontend/src/types.ts](frontend/src/types.ts) if present

---

## 4) Implementation phases

## Phase 1: Introduce metadata-driven field resolution

### Goal

Stop assuming every workflow uses the same transaction identifier and canonical field names.

### Work items

1. Add a field-resolution registry that maps workflow, data source, and table context to canonical fields.
2. Add a resolver service that returns the correct key fields for a given workflow and source.
3. Replace direct `transaction_id` defaults in planner and reconciliation logic.
4. Keep the current fallback behavior only as a last-resort, logged, explicit path.

### Files to update

- [backend/src/services/investigationPlanner.ts](backend/src/services/investigationPlanner.ts)
- [backend/src/services/requiredFieldResolver.ts](backend/src/services/requiredFieldResolver.ts)
- [backend/src/services/reconciliationService.ts](backend/src/services/reconciliationService.ts)
- [frontend/src/services/investigationPlanner.ts](frontend/src/services/investigationPlanner.ts)
- [frontend/src/services/globalMappingService.ts](frontend/src/services/globalMappingService.ts)

### Acceptance criteria

- No service assumes `transaction_id` exists unless workflow metadata explicitly says it does.
- A workflow can specify aliases like `tx_id`, `refnum`, or custom keys without silent drift.
- Unknown keys are flagged as configuration issues, not silently tolerated.

### Validation

Add failing tests for:

- workflow with custom transaction key alias
- workflow with missing key field
- workflow with multiple candidate identifiers

---

## Phase 2: Split status domains and remove string conflation

### Goal

Make status semantics explicit and type-safe.

### Work items

1. Add new enums or union types for verdict, action, and lifecycle.
2. Replace string comparisons in status aggregator logic with normalized resolution functions.
3. Update maker-checker and reconciliation SQL writes to write the correct fields separately.
4. Ensure downstream code can inspect each domain independently.

### Files to update

- [backend/src/services/makerCheckerService.ts](backend/src/services/makerCheckerService.ts)
- [backend/src/services/reconciliationService.ts](backend/src/services/reconciliationService.ts)
- [frontend/src/services/statusAggregator.ts](frontend/src/services/statusAggregator.ts)
- [backend/src/types.ts](backend/src/types.ts)

### Acceptance criteria

- `final_result` is never used to imply lifecycle state.
- `final_action` is never inferred from a validation verdict without explicit mapping.
- The parent issue aggregate is based only on lifecycle/aggregate state, not on raw validation string comparisons.

### Validation

Add failing tests for:

- PASS + REPORT remains a reportable validation without converting to a resolved parent case
- FAIL + STOP is not treated as a successful closed case
- unknown status values are surfaced clearly rather than silently counted as pending

---

## Phase 3: Remove unsafe default behavior and require explicit config

### Goal

Stop hiding configuration gaps behind default strings.

### Work items

1. Replace `|| 'default-team'`, `|| 'Maker Operator'`, `|| 'VERIFIED_MATCH'` patterns with validation guard logic.
2. Replace default workflow bundle status and scope values with explicit validation or required config.
3. Log all fallback usage, and differentiate between convenience fallback and real business default.

### Files to update

- [backend/src/services/makerCheckerService.ts](backend/src/services/makerCheckerService.ts)
- [backend/src/services/workflowBundleService.ts](backend/src/services/workflowBundleService.ts)
- [frontend/src/services/globalMappingService.ts](frontend/src/services/globalMappingService.ts)

### Acceptance criteria

- Missing required data is rejected clearly.
- Optional convenience defaults are explicitly marked and logged.
- No service silently invents business state when the source config is absent.

### Validation

Add failing tests for:

- null teamId in proposal submission
- missing makerId or taskId in approval creation
- invalid workflow bundle scope

---

## Phase 4: Harden batch policy and query chunking logic

### Goal

Turn chunking and query partitioning into a validated contract, not a loose configuration assumption.

### Work items

1. Add validation at the start of batch creation.
2. Enforce positive bounds, ordering, and per-batch caps.
3. Ensure query chunking respects parameter limits and tuple cap thresholds.
4. Add infrastructure-safe logging when a policy would exceed safe bounds.

### Files to update

- [backend/src/services/batchPlanner.ts](backend/src/services/batchPlanner.ts)
- [backend/src/services/reconciliationService.ts](backend/src/services/reconciliationService.ts)

### Acceptance criteria

- Invalid batch policy values fail fast.
- Query chunking never exceeds configured bounds.
- The system can split large workloads deterministically and safely.

### Validation

Add failing tests for:

- zero or negative maxRowsPerBatch
- maxQueryKeys greater than maxRowsPerBatch
- oversized input list with forced chunk rebalancing

---

## Phase 5: Refactor unified approval domain feed into typed domain adapters

### Goal

Keep a single UI list where useful, but preserve domain semantics and evidence contracts.

### Work items

1. Separate `TransactionApprovalItem`, `WorkflowBundleApprovalItem`, and `WorkspaceSettingApprovalItem` into typed domain models.
2. Create conversion/adaptor logic in [backend/src/services/approvalService.ts](backend/src/services/approvalService.ts).
3. Keep a unified view model only as a final display adapter.
4. Ensure the UI can render per-domain metadata without losing original semantics.

### Files to update

- [backend/src/services/approvalService.ts](backend/src/services/approvalService.ts)
- [frontend/src/components/TeamWorkspace.tsx](frontend/src/components/TeamWorkspace.tsx)
- [frontend/src/components/governance/GovernanceScreen.tsx](frontend/src/components/governance/GovernanceScreen.tsx)

### Acceptance criteria

- The UI still shows a combined list, but the underlying domain type remains intact.
- Similar statuses across domains do not imply the same operational semantics.
- Domain-specific review actions remain distinct.

### Validation

Add failing tests for:

- bundle approval and workspace-setting approval are not misclassified as transaction resolutions
- exporter and display adapter preserve original evidence snapshots correctly

---

## Phase 6: Split operational approval from reporting/dashboard logic

### Goal

Keep dashboard metrics and team reporting decoupled from approval-critical workflow state.

### Work items

1. Move KPI aggregation to reporting-focused services.
2. Ensure the approval pipeline is driven only by reviewable operational decisions.
3. Keep general user/team reporting outside the critical maker-checker path unless a real escalation is required.

### Files to update

- [frontend/src/components/TeamWorkspace.tsx](frontend/src/components/TeamWorkspace.tsx)
- [frontend/src/components/ManagerialDashboard.tsx](frontend/src/components/ManagerialDashboard.tsx)
- [frontend/src/components/governance/GovernanceScreen.tsx](frontend/src/components/governance/GovernanceScreen.tsx)
- [frontend/src/utils/navigationPermissions.ts](frontend/src/utils/navigationPermissions.ts)

### Acceptance criteria

- KPI tracking and operational approval are not mixed in a single render path.
- A dashboard metric does not affect a maker-checker approval state unless intentionally designed to do so.

---

## 5) Test-first implementation pattern

For each major phase, use the following test pattern:

1. Write a failing test covering the real behavior.
2. Implement the minimal fix.
3. Verify regression safety in adjacent services.
4. Only then move to the next phase.

### Minimum test set

- workflow planner resolves custom key aliases
- status aggregator handles verdict/action/lifecycle states correctly
- maker-checker rejects self-approval
- reconciliation uses correct pass/fail action transitions
- workflow bundle promotion validation rejects invalid scope or missing IDs
- approval feed retains correct domain typing

---

## 6) Delivery order and dependency map

### Dependency order

1. Field resolution and metadata contract
2. Status domain split
3. Safe default removal
4. Batch validation hardening
5. Approval domain typing
6. Reporting separation

This order prevents rework. If status semantics are wrong, later batch and dashboard work will be built on unstable assumptions.

---

## 7) Operational rollout approach

### Stage A: internal refactor only

- Add new types and resolvers
- Keep old contracts temporarily
- Add warnings for deprecated paths

### Stage B: dual-read / single-write migration

- New metadata-driven resolver used in production flow
- Old fallback path still available in read-only compatibility mode
- Collect metrics on violations and drift

### Stage C: enforcement cutoff

- Silent fallback removed
- explicit config checks enforced
- legacy aliases remain only under explicit compatibility configuration

---

## 8) Acceptance checklist for completion

The refactor is complete when all of the following are true:

- no service depends on a global hard-coded transaction identifier contract without metadata confirmation
- status domains are separated and typed
- missing operational config fails clearly instead of silently defaulting
- batching is validated and bounded
- approval items remain domain-aware
- dashboards and operational approvals are separated
- all critical service paths have test coverage

---

## 9) Recommended immediate next action

Begin with the following sequence:

1. [backend/src/services/investigationPlanner.ts](backend/src/services/investigationPlanner.ts)
2. [backend/src/services/requiredFieldResolver.ts](backend/src/services/requiredFieldResolver.ts)
3. [frontend/src/services/statusAggregator.ts](frontend/src/services/statusAggregator.ts)
4. [backend/src/services/makerCheckerService.ts](backend/src/services/makerCheckerService.ts)
5. [backend/src/services/reconciliationService.ts](backend/src/services/reconciliationService.ts)

This is the cleanest start because it resolves the highest-risk architecture mismatch early and gives the rest of the refactor a stable base.

---

## 10) Summary

This refactor is not a cosmetic cleanup. It is a production-stability correction.

The codebase already has the right strategic intent: workflow governance, review controls, and metadata-aware processing. What is missing is strict service-level discipline: explicit contracts, metadata resolution, and a clear separation between verdict, action, and lifecycle.

Once those are enforced, the rest of the workflow and reporting system becomes much easier to reason about, validate, and evolve.
