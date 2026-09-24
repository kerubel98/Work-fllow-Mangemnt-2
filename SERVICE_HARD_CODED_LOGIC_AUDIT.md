# Service Layer Hard-Coded Value, Loop, and Logic Mismatch Audit

## Scope reviewed

I reviewed the main operational service files in the repo, especially these high-risk implementation points:

- [backend/src/services/approvalService.ts](backend/src/services/approvalService.ts)
- [backend/src/services/workflowBundleService.ts](backend/src/services/workflowBundleService.ts)
- [backend/src/services/investigationPlanner.ts](backend/src/services/investigationPlanner.ts)
- [backend/src/services/batchPlanner.ts](backend/src/services/batchPlanner.ts)
- [backend/src/services/requiredFieldResolver.ts](backend/src/services/requiredFieldResolver.ts)
- [backend/src/services/makerCheckerService.ts](backend/src/services/makerCheckerService.ts)
- [backend/src/services/reconciliationService.ts](backend/src/services/reconciliationService.ts)
- [frontend/src/services/globalMappingService.ts](frontend/src/services/globalMappingService.ts)
- [frontend/src/services/investigationPlanner.ts](frontend/src/services/investigationPlanner.ts)
- [frontend/src/services/statusAggregator.ts](frontend/src/services/statusAggregator.ts)

The repo already contains strong governance intent, but the service layer still has a number of hard-coded assumptions and logic mismatches that would become fragile under real operational scale or multi-workflow usage.

---

## 1) Hard-coded canonical field assumptions

### Findings

The clearest pattern is a repeated use of canonical field names without a metadata-driven resolver.

Examples:

- [backend/src/services/investigationPlanner.ts](backend/src/services/investigationPlanner.ts) defaults to `transaction_id` and falls back to `id` / `tx_id` / row index.
- [frontend/src/services/investigationPlanner.ts](frontend/src/services/investigationPlanner.ts) does the same.
- [frontend/src/services/globalMappingService.ts](frontend/src/services/globalMappingService.ts) hard-codes `transaction_id` as the primary key and several derived defaults such as `created_at`, `status_state`, `user_email`, and `merchant_id`.
- [backend/src/services/requiredFieldResolver.ts](backend/src/services/requiredFieldResolver.ts) explicitly filters out only `transaction_id` and `id` from SQL-like parameter extraction.
- [backend/src/services/reconciliationService.ts](backend/src/services/reconciliationService.ts) uses `primaryKey = keys[0] || 'transaction_id'` and then builds comparisons around that assumption.

### Why this matters

This is not a harmless convenience. It creates hidden business assumptions:

- every workflow is expected to carry `transaction_id`
- fallback aliases are treated as equivalent
- if a source system uses a different key naming convention, the service will silently degrade, not fail loudly
- the system can reconcile records that “look valid” but are actually mapped to the wrong identifier domain

### Severity

High

### Recommendation

Create one registry of canonical key aliases and an explicit resolver that uses workflow metadata, source mapping config, or DB table config before falling back. Do not embed `transaction_id` as a global default in every service instance.

---

## 2) Status semantics are mixed together: verdict, action, and lifecycle

### Findings

The biggest architectural mismatch is that services combine three different concepts into the same status strings:

- validation verdict: PASS / FAIL / ERROR / PAUSED_DB_OFFLINE
- workflow action: CONTINUE / STOP / CLOSE / FLAG / REPORT
- issue lifecycle: OPEN / IN_PROGRESS / ACTION_REQUIRED / RESOLVED / CLOSED

You can see this drift in:

- [frontend/src/services/statusAggregator.ts](frontend/src/services/statusAggregator.ts)
- [backend/src/services/makerCheckerService.ts](backend/src/services/makerCheckerService.ts)
- [backend/src/services/reconciliationService.ts](backend/src/services/reconciliationService.ts)

Examples:

- `statusAggregator` treats `PASS`, `FAIL`, `VERIFIED_MATCH`, `FLAGGED_DISCREPANCY`, `PAUSED_DB_OFFLINE`, `IN_PROGRESS` all in the same aggregate flow.
- `makerCheckerService` sets `final_result = 'PASS'` and `final_action = 'CLOSE'` and also writes `investigation_status = targetStatus`.
- `reconciliationService` writes `final_result`, `final_action`, `investigation_status`, `status_flag_text`, and `status_flag_color` in one update block.

### Why this matters

These semantics are not interchangeable. A validation result is not the same as a downstream operational action. A workflow action is not the same as a parent-case lifecycle state.

This is exactly the governance principle the repo already describes: keep validation verdict and pipeline action separate.

### Severity

High

### Recommendation

Define three separate typed values or enums:

- `ValidationVerdict`
- `PipelineAction`
- `CaseLifecycleStatus`

Then map them explicitly and keep the aggregator focused on lifecycle state only.

---

## 3) Hard-coded defaults and fallback values create operational drift

### Findings

Several services rely on default strings that silently override real config or user input.

Examples:

- [backend/src/services/workflowBundleService.ts](backend/src/services/workflowBundleService.ts) uses `scope = input.scope || 'TEAM'` and `version = input.version || '1.0.0'`.
- [backend/src/services/makerCheckerService.ts](backend/src/services/makerCheckerService.ts) inserts `input.teamId || 'default-team'`, `makerName || 'Maker Operator'`, `input.proposedAction || 'FORCE_MATCH'`, `input.proposedStatus || 'VERIFIED_MATCH'`.
- [frontend/src/services/globalMappingService.ts](frontend/src/services/globalMappingService.ts) uses default `updatedBy: 'system_default'` and created table names that are assumed as defaults without source-bound validation.
- [backend/src/services/reconciliationService.ts](backend/src/services/reconciliationService.ts) defaults `passAction` to `CONTINUE` and fail action to `STOP` when no action config is supplied.

### Why this matters

This means a missing config can create an operational decision without surfacing that the config was absent. In a real environment, that is exactly where silent business risk appears.

### Severity

Medium-high

### Recommendation

Use explicit validation failures for missing config rather than silent fallback values. If a fallback is required, log it, record it, and keep it traceable to a config source.

---

## 4) Loop and chunking logic is mostly structured, but the assumptions are brittle

### Findings

The batching code is intentionally written to partition work, which is good, but the policy assumptions are still hard-wired.

Examples:

- [backend/src/services/batchPlanner.ts](backend/src/services/batchPlanner.ts) defines a default policy with `maxRowsPerBatch: 5000`, `maxQueryKeys: 1000`, `maxPayloadSizeMb: 10`, `maxExecutionTimeMs: 30000`.
- [backend/src/services/reconciliationService.ts](backend/src/services/reconciliationService.ts) uses `CHUNK_SIZE = 500` for inserting mirror batches.
- [backend/src/services/approvalService.ts](backend/src/services/approvalService.ts) merges data from three independent sources into one flat list with sorting on `createdAt`.

### Risk patterns

- large arrays and large query key sets can still become operationally expensive if the policy is not validated against actual source volume
- the system assumes these limits are valid for all workflows and all datasource types
- there is no explicit guard for inconsistent policy values such as `maxQueryKeys > maxRowsPerBatch`, or `maxRowsPerBatch <= 0`
- the logic does not guard against oversized arrays before building query strings

### Severity

Medium

### Recommendation

Add policy validation at the start of batching logic, including:

- maxRowsPerBatch > 0
- maxQueryKeys > 0
- maxQueryKeys < maxRowsPerBatch
- payload size guard before building SQL
- chunk-size cap enforcement before emitted SQL exceeds parameter or tuple limits

---

## 5) Dynamic SQL and string interpolation are high-risk in several services

### Findings

The repo is PostgreSQL-first and dynamic SQL is appropriate, but the code is sometimes mixing configuration, user-provided values, and direct string interpolation in a way that is not fully constrained.

Examples:

- [backend/src/services/reconciliationService.ts](backend/src/services/reconciliationService.ts) builds SQL using dynamic columns and dynamic comparator logic.
- [backend/src/services/workflowBundleService.ts](backend/src/services/workflowBundleService.ts) uses `ANY($1::varchar[])` arrays and JSON serialization, but it is not fully protected against invalid IDs or malformed payloads.
- [backend/src/services/approvalService.ts](backend/src/services/approvalService.ts) queries multiple tables and normalizes statuses, but the merge logic is broad and may hide domain mismatches.

### Why this matters

This is not necessarily an injection bug in every case, but it is a maintainability and correctness risk. When fields, table names, statuses, and comparator expressions are not all metadata-controlled, the SQL can drift away from the intended contract.

### Severity

Medium-high

### Recommendation

- centralize SQL generation for dynamic field access
- validate field names and identifiers before interpolation
- preserve safe ANSI quoting for schema identifiers
- enforce a clear contract between source metadata and generated query field names

---

## 6) Multi-source aggregation logic collapses too much detail into one feed

### Findings

In [backend/src/services/approvalService.ts](backend/src/services/approvalService.ts), the service merges three different approval domains into a single `UnifiedApprovalItem` list:

- transaction resolution requests
- workflow bundles
- workspace settings

This is a reasonable API shape, but it hides the fact that the underlying domains have different semantics, statuses, and evidence contracts.

### Why this matters

The result is a generic feed that can feel “complete” while actually being semantically inconsistent. A checker may be approving one type of entity based on a workflow bundle, but the UI can render it with the same status and metadata shape as a territory-level setting proposal.

### Severity

Medium

### Recommendation

Keep a unified feed for display, but maintain separate domain-specific models and a typed adapter layer. Do not treat all approval types as interchangeable at the service boundary.

---

## 7) LocalStorage-backed config and service state may mask real data problems

### Findings

[frontend/src/services/globalMappingService.ts](frontend/src/services/globalMappingService.ts) stores schema config in browser localStorage and then reconstructs a service singleton from it. It also includes cleanup logic for stale mock mappings.

This is useful for front-end convenience, but it makes the system materially dependent on client-side persisted state.

### Why this matters

A browser can retain stale or user-specific state that no longer matches backend database reality. The service does attempt to clean stale data, but there is still no authoritative server-side validation before using the config in production workflows.

### Severity

Medium

### Recommendation

Keep frontend local config only for UX convenience, but ensure the backend remains source-of-truth for any operational mapping and workflow configuration.

---

## 8) Logic holes in fallback chains and missing validation

### Findings

There are several “fallback instead of reject” patterns:

- if a workflow is missing or invalid, the planner warns rather than stopping at the right stage
- if a transaction key is missing, it falls back to row index or generic IDs
- default status values are used when config is absent
- empty or invalid IDs still flow into SQL arrays and static IDs generation

### Why this matters

Fallbacks are useful, but they become dangerous when they silently conceal operational breaks. A system will continue running while data integrity quietly degrades.

### Severity

High

### Recommendation

For each fallback branch, decide whether it is:

1. a safe non-critical convenience, or
2. a data quality violation that should fail fast

Only the first category should be silent. The second should raise an explicit validation error and surface to the user or task queue.

---

## 9) Concrete risk matrix

| Area | File(s) | Issue | Severity |
| --- | --- | --- | --- |
| Canonical field assumptions | [frontend/src/services/globalMappingService.ts](frontend/src/services/globalMappingService.ts), [backend/src/services/investigationPlanner.ts](backend/src/services/investigationPlanner.ts), [frontend/src/services/investigationPlanner.ts](frontend/src/services/investigationPlanner.ts) | hard-coded `transaction_id` assumptions | High |
| Status semantics drift | [frontend/src/services/statusAggregator.ts](frontend/src/services/statusAggregator.ts), [backend/src/services/makerCheckerService.ts](backend/src/services/makerCheckerService.ts), [backend/src/services/reconciliationService.ts](backend/src/services/reconciliationService.ts) | validation verdict mixed with action and lifecycle | High |
| Silent fallback defaults | [backend/src/services/makerCheckerService.ts](backend/src/services/makerCheckerService.ts), [backend/src/services/workflowBundleService.ts](backend/src/services/workflowBundleService.ts) | defaults mask missing config | High |
| Batch policy brittleness | [backend/src/services/batchPlanner.ts](backend/src/services/batchPlanner.ts), [backend/src/services/reconciliationService.ts](backend/src/services/reconciliationService.ts) | hard-coded chunk limits and no validation | Medium |
| Global gating and merge logic | [backend/src/services/approvalService.ts](backend/src/services/approvalService.ts) | unified feed is broad and semantically mixed | Medium |
| Local cache drift | [frontend/src/services/globalMappingService.ts](frontend/src/services/globalMappingService.ts) | browser-local config may conflict with backend truth | Medium |
| SQL generation drift | [backend/src/services/reconciliationService.ts](backend/src/services/reconciliationService.ts) | runtime-generated SQL path depends on config and string assembly | Medium-high |

---

## 10) Overall conclusion

The service layer is structurally strong in a prototype sense, but it is not yet fully production-safe from a hard-coded-value and logic-contract standpoint.

The main issues are not random defects. They are systemic patterns:

- canonical field names are assumed instead of resolved from metadata
- status values mix verdict, action, and lifecycle
- fallback defaults silence business configuration gaps
- batching and SQL generation rely on broad assumptions rather than strict validation
- downstream logic is too generic across domains

This does not mean the repo is broken. It means the architecture is close to a real operating system, but it still contains strong “prototype assumptions” in a small number of service classes.

---

## 11) Recommended refactor direction

### A. Central canonical registry

Create a single canonical metadata registry for:

- canonical transaction keys
- canonical field aliases
- data-source contract definitions
- workflow-specific required fields
- business status enums and mappings

### B. Split status domains

Create separate types for:

- `ValidationVerdict`
- `PipelineAction`
- `IssueLifecycleStatus`

Then map them explicitly instead of inlining strings across services.

### C. Fail fast on missing config

Fewer silent fallbacks. Prefer:

- explicit validation errors
- config warnings with traceable source
- logged fallback metadata when convenience is necessary

### D. Validate batch policy at entry

Add a common validation guard for all batching functions:

- non-empty array check
- positive chunk limits
- parameter cap enforcement
- safe merging of query chunks

### E. Separate domain approval adapters

Keep the “unified feed” for UI convenience, but maintain domain-specific adapters and validation so each review type remains semantically honest.

---

## 12) Bottom line

The repo has solid service structure and a clear governance model, but the existing service logic still contains pockets of hard-coded business assumptions. The highest priority changes are:

1. canonical field resolution
2. status-domain separation
3. stricter fallback behavior
4. stronger batch and SQL validation
5. domain-aware approval normalization

Those changes would materially reduce logic drift and make the system far more stable in real operational usage.
