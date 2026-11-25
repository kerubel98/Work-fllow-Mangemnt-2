# Status Aggregator Hard-Coded Values Analysis

## Executive Summary

The file [frontend/src/services/statusAggregator.ts](frontend/src/services/statusAggregator.ts) is relatively simple, but it still contains hard-coded operational status assumptions.

This is not a database mapping problem. It is a status semantics problem.

The aggregator treats a fixed set of strings as the canonical truth for parent-case status. That is acceptable for an internal prototype or a specific workflow, but it is risky in production because status meaning must be traceable to workflow metadata, validation results, and domain-specific lifecycle definitions.

---

## 1) Parent status is determined by a hard-coded string list

The aggregator resolves raw transaction status from a set of fields:

- investigationStatus
- investigation_status
- _validation_status
- validationStatus
- finalResult
- final_result
- status

Then it compares them to a long list of fixed strings, such as:

- VERIFIED_MATCH
- RECONCILED
- PASS
- PASSED
- SUCCESS
- CLOSED
- FLAGGED_DISCREPANCY
- FLAGGED
- FAIL
- FAILED
- DISCREPANCY
- ERROR
- NOT_FOUND_IN_TARGET_DB
- IN_PROGRESS
- INVESTIGATING
- PAUSED_DB_OFFLINE

This is a canonical status dictionary embedded in the frontend logic.

### Risk

- external systems may return different status names
- workflow states may evolve and the aggregator falls behind
- statuses are treated as global truth even though they are workflow-specific

### Production-safe direction

- status mapping should come from workflow metadata or a normalized enum contract
- the aggregator should resolve domain status values through a central mapping dictionary, not a local hard-coded set

---

## 2) Status semantics are implicitly business rules, not explicit configuration

The logic encodes a decision tree:

- flagged transaction => ACTION_REQUIRED
- active investigation => IN_PROGRESS
- all resolved => RESOLVED or CLOSED
- some results => IN_PROGRESS
- none => OPEN

This is a valid business model, but the rule is hard-coded in the code.

In production, operational status aggregation should be driven by:

- workflow configuration
- validation outcome definitions
- lifecycle policy
- explicit pipeline action semantics

### Risk

- business logic changes require code changes in multiple places
- different teams may classify the same status differently
- the system can drift away from the actual lifecycle semantics used in backend rules

---

## 3) The aggregator accepts too many synonyms without normalization

The file accepts broad variants like:

- PASS / PASSED / SUCCESS
- FAIL / FAILED / ERROR / DISCREPANCY
- IN_PROGRESS / INVESTIGATING / PAUSED_DB_OFFLINE

This is convenient for the UI, but it introduces silent normalization risk.

A production system should distinguish:

- validation verdict
- process action
- parent case lifecycle state

The current logic collapses multiple concepts into one string target without explicit separation.

That is exactly the governance principle mentioned elsewhere in the project: validation result and pipeline action must remain distinct.

---

## 4) Status strings are treated as global truth rather than workflow-defined truth

This is the biggest architectural concern.

The aggregator assumes that the following statuses are universally meaningful:

- VERIFIED_MATCH
- RECONCILED
- FLAGGED_DISCREPANCY
- PAUSED_DB_OFFLINE

But in a real multi-workflow environment, a status may mean something different depending on:

- the validation box
- the source data source
- the investigation stage
- the business process type

### Risk

- a workflow-specific result can be incorrectly promoted to parent-case status
- parent-case state can be wrong even when transaction-level statuses are valid
- one workflow may map status semantics differently from another, but the aggregator cannot represent that distinction

---

## 5) The fallback branch treats all unknown values as pending

The default branch is:

- else => pendingCount++

This is a reasonable generic fallback, but it means the system treats unknown statuses as not yet evaluated rather than as value errors.

In production, unknown statuses should be surfaced as a data-quality signal rather than silently treated as pending.

### Risk

- status drift goes unnoticed
- investigation queue may hide real data or mapping issues
- analysts may think records are pending when they are actually malformed or unmapped

---

## 6) There is no explicit distinction between validation verdict and parent workflow action

This file combines validation outcomes and aggregated case state in one place.

For example:

- PASS and SUCCESS are treated as reconciled count
- FAIL, ERROR, DISCREPANCY are treated as flagged
- IN_PROGRESS and PAUSED_DB_OFFLINE are treated as investigating

This is exactly the pattern the project governance notes warn against: combining verdict and action semantics in one path.

### Production-safe direction

The system should ideally separate:

- validation verdict: PASS / FAIL / ERROR / PAUSED_DB_OFFLINE
- workflow action: CONTINUE / STOP / CLOSE / FLAG / REPORT
- parent issue lifecycle: OPEN / IN_PROGRESS / RESOLVED / ACTION_REQUIRED / CLOSED

The current aggregator collapses these layers too early.

---

## 7) There is no evidence of domain-driven mapping metadata

The function receives transaction items and evaluates one raw field, but it does not seem to reference any central workflow metadata or domain contract.

That means the status interpretation is effectively local logic, not controlled by configuration.

### Risk

- the same code can produce different operational meanings across contexts
- business teams cannot adjust status semantics without code changes

---

## Final conclusion

This file does not contain obvious database hard-coding, but it does contain operational hard-coding.

The main production concerns are:

- a fixed canonical status vocabulary
- implicit business semantics embedded in code
- no explicit distinction between validation verdict and workflow action
- unknown statuses silently treated as pending
- no domain-specific metadata to resolve status meaning per workflow

This is not as severe as the mapping service issue, but it does violate the spirit of the project governance rules around explicit lifecycle separation and status/action integrity.

### Production-safe recommendation

- move validation/status mapping into a workflow-defined metadata layer
- keep separate enums for verdict, pipeline action, and parent lifecycle
- surface unknown or unmapped statuses as errors or warnings
- use a dictionary-based status resolver, not a hard-coded switch list

This file is acceptable as a lightweight UI aggregation helper, but it is not a robust production source of truth.
