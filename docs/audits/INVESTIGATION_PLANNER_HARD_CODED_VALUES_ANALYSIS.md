# Investigation Planner Hard-Coded Values Analysis

## Executive Summary

The file [frontend/src/services/investigationPlanner.ts](frontend/src/services/investigationPlanner.ts) is much less problematic than the mapping service, but it still contains hard-coded operational assumptions that should be reviewed before production use.

The most important issue is not database names or table names. The issue is that the planner assumes a canonical transaction identity and canonical workflow behavior in several places.

This is acceptable for a lightweight internal planner, but it is not fully compliant with the repo’s production rule that operational logic should be generic, metadata-driven, and not tightly coupled to fixed field names or fixed workflow assumptions.

---

## 1) Default transaction key is hard-coded

The file defines:

- keyField = options.transactionKeyField || 'transaction_id'

This is a strong default assumption.

It means the planner assumes the default primary identity field is transaction_id unless the caller passes something else.

That is fine only if the app is consistently built around that canonical field. In a generic investigation system, especially one that maps multiple external systems, this is a risky default because transaction identity should come from the configured workflow metadata, the DB mapping layer, or the dataset contract.

### Risk

- wrong identity field for some datasets
- duplicate or missing keys silently treated as acceptable
- plan execution may use the wrong transaction identity despite a valid external table mapping

### Production-safe direction

- resolve transaction key from workflow configuration or schema mapping metadata
- do not default to a single global field name unless the workflow explicitly declares it

---

## 2) Fallback transaction identity logic is hard-coded

The planner does:

- t[keyField] ?? t.id ?? t.tx_id ?? `TX-${idx + 1}`

This is another fixed assumption about what transaction identity may look like.

The service is effectively deciding that valid identities can come from:

- transaction_id
- id
- tx_id
- generated fallback label

This is practical for local prototyping, but it is a rigid operational assumption.

### Risk

- the planner can silently accept records with no valid key and generate synthetic IDs
- a real business workflow may use different keys, such as reference numbers, external ids, or composite keys
- batch execution can drift if different data sources use different identifier conventions

### Production-safe direction

- use configuration-driven key resolution
- support composite keys
- enforce a valid key policy based on workflow metadata or data source contract

---

## 3) Missing key warnings are generated from a hard-coded fallback model

The file does:

- if missingKeysCount > 0, warnings.push(...)

This is not a direct bug, but it means the system assumes that a missing transaction id can be tolerated and recovered by row index or id fallback.

That is a practical fallback, but not a strong production control.

### Risk

- the system may proceed with weak identity values
- later stages may not reconcile correctly across datasets
- the generated plan may look valid even when it is not grounded in a true source key

### Production-safe direction

- treat missing transaction identity as a blocking validation error for production workflows
- only allow fallback if the workflow explicitly permits it

---

## 4) Workflow stage validity is based on enabled stage count only

The file checks:

- enabledStages = (workflow.stages || []).filter(s => s.enabled)
- if enabledStages.length === 0 => error

This is a reasonable basic validation, but it hard-codes a simplified workflow assumption:

- a workflow is valid if it has at least one enabled stage
- stage execution is driven by the workflow’s internal stage array

That is acceptable for a UI planner, but it assumes a stage model that may not match every business process.

### Risk

- workflows with dynamic or external stage definitions may not map cleanly
- stage dependencies and sequencing may be under-specified
- planner can produce valid plans for workflows that are operationally incomplete

### Production-safe direction

- validate stage dependency graph explicitly
- require stage metadata such as required inputs, outputs, and target data source
- support workflows where stage sequencing is configured externally

---

## 5) Query extraction is tied to stage and workflow matching heuristics

This section:

- const extraction = queryExtractions.find(e => e.stageId === stage.id || e.workflowId === workflow.id);

is a hard-coded matching logic that assumes a query extraction can be found by either stageId or workflowId without further validation.

This is a loose assumption and could produce the wrong extraction binding in a complex workflow.

### Risk

- multiple extractions for the same workflow can be incorrectly matched
- a stage may inherit extraction metadata that does not belong to it
- the plan may produce invalid column requirements for later execution

### Production-safe direction

- bind extraction by a unique workflow-stage contract, not only stageId or workflowId
- require a deterministic query extraction relationship

---

## 6) The planner assumes a single default workflow model

The planner uses a workflow object and returns a plan shaped like:

- workflowId
- workflowName
- transactionCount
- stages
- batches
- batchPolicy

This is a conventional internal model, but it is still a strong assumption about workflow structure.

In a production system, workflows may vary by:

- source system
- verification method
- DB type
- custom validation rules
- multi-step escalation logic

### Risk

- the planner may model workflows too generically
- operational metadata can be lost in translation
- downstream execution may be less accurate than the plan appears

### Production-safe direction

- workflow metadata should be explicit and versioned
- stage definitions should carry required inputs and outputs
- plan object should be schema-driven, not inferred from defaults alone

---

## 7) Batch policy is imported and merged with a default rather than configured per workflow

The file imports:

- DEFAULT_BATCH_POLICY

and then does:

- const activeBatchPolicy = { ...DEFAULT_BATCH_POLICY, ...(options.batchPolicy || {}) }

This is a practical pattern, but it still means the planner hard-codes a default batch policy unless overridden.

That may be okay for general execution, but in production the batch policy should be derived from:

- workflow requirement
- source table size
- DB constraints
- operational thresholds

### Risk

- large source sets may be chunked inefficiently
- high-risk data sources may be processed with unsafe defaults
- the same workflow may behave differently depending on the default policy in the client

### Production-safe direction

- batch policy should be part of the workflow or source configuration
- not just a default package imported from a shared helper

---

## 8) Plan ID generation is hard-coded to timestamp and random suffix

The planner generates:

- `plan-${Date.now()}-${Math.random().toString(36)...}`

This is fine for temporary UI planning, but it is not a stable production identity model.

Production identities should usually be:

- deterministic where possible
- traceable to workflow and source version
- tied to business context or execution time

### Risk

- non-deterministic plan IDs reduce traceability
- hard to correlate with workflow runs or audit history
- more difficult to reproduce investigations from a saved plan

### Production-safe direction

- generate IDs from a stable server-side ID strategy or workflow execution metadata
- include workflow version and source identity when possible

---

## 9) The planner is intentionally simple, which is good, but too implicit for production enforcement

This file is not as risky as the mapping service, and it reflects a practical design philosophy:

- validate workflow shape
- resolve required columns
- build stage plan
- create batches
- return execution plan

That simplicity is valuable.

However, the weak point is that it is intentionally implicit. It does not enforce a strong contract for:

- transaction identity
- workflow contract
- extraction binding
- required stage graph
- batch policy derivation

That makes it flexible, but also easier to silently drift into incorrect execution.

---

## Final conclusion

This file does have hard-coded assumptions, but they are mostly operational defaults rather than database-level hard-codes.

The main concerns are:

- default transaction identity field = transaction_id
- fallback identity logic based on a fixed list of fields
- default batch policy
- default plan ID pattern
- implicit workflow-stage assumptions
- loose matching between stage and extraction data

These are not catastrophic problems by themselves, but they are not fully aligned with the repo’s stronger production rules around generic mapping and explicitly configured operational contracts.

### Production-safe recommendation

- resolve transaction key from workflow metadata or schema mapping
- block missing transaction identity in production-grade workflows
- explicitly validate stage graph and dependencies
- bind extraction records deterministically
- make batch policy workflow-configurable
- avoid using hidden default assumptions as the source of truth

This file is acceptable as a lightweight internal planner, but it should not be treated as a strict production execution contract without stronger metadata-driven validation.
