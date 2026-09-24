# Backend, Governance, and Dashboard Refactor Plan

## Objective

This document captures the recommended execution plan for the operational workflow platform based on the current repository implementation and the architectural gaps identified in the existing backend and dashboard layers.

The goal is to move from a mixed operational model to a clean, decision-ready architecture with explicit ownership across:

- workflow execution
- issue and task lifecycle
- maker-checker governance
- escalation / collaboration rooms
- managerial reporting
- sandbox validation and production approval

---

## 1. Current architecture reality

The real project baseline is stronger than the earlier assumptions suggested. The actual implementation already contains the foundations of a solid operational platform:

- Express API server in [backend/src/server.ts](backend/src/server.ts)
- workflow orchestration in [backend/src/services/investigationOrchestratorService.ts](backend/src/services/investigationOrchestratorService.ts)
- maker-checker logic in [backend/src/services/makerCheckerService.ts](backend/src/services/makerCheckerService.ts)
- team KPI endpoints in [backend/src/routes/teams.ts](backend/src/routes/teams.ts)
- PostgreSQL-backed persistence in [backend/src/database/migrations/001_initial_schema.sql](backend/src/database/migrations/001_initial_schema.sql)

The main problem is not missing infrastructure. The main problem is architectural drift: multiple operational concerns are currently merged into one runtime model.

---

## 2. Core design principle

The system should be split into five distinct but connected domains:

1. Workflow execution engine
2. Issue and task lifecycle
3. Governance and approval layer
4. Escalation and collaboration layer
5. Dashboard and executive reporting layer

These domains must not be represented by a single overloaded status model. Instead, each has its own state transitions and evidence model.

---

## 3. Refactor outcome

The target architecture should deliver:

- clearer service ownership
- cleaner API boundaries
- stronger auditability
- safer governance enforcement
- more reliable dashboard metrics
- explicit sandbox versus production execution separation

---

## 4. Backend refactor blueprint

### 4.1 Service boundary split

The backend should be organized around the following service groups:

- `workflowExecutionService`
- `issueLifecycleService`
- `taskExecutionService`
- `approvalService`
- `escalationService`
- `analyticsService`
- `sandboxExecutionService`
- `auditLogService`

Each service owns its own state transitions and writes to a common evidence layer.

### 4.2 Canonical state model

The project should define explicit entities instead of overloaded `status` strings alone:

- workflow_version
- workflow_run
- issue
- task
- approval_request
- escalation_event
- team_assignment
- dashboard_snapshot
- audit_event

This prevents the system from conflating:

- business status
- workflow execution state
- governance state
- escalation state
- reporting state

### 4.3 Governance contract hardening

The maker-checker pattern already exists and should be formalized as the foundation of all operational change approvals.

Required lifecycle:

1. maker creates proposal
2. immutable evidence snapshot is captured
3. item is locked to `PENDING_CHECKER_REVIEW`
4. checker reviews and approves or rejects
5. state transitions are recorded and preserved
6. self-approval is rejected at both API and service layers

This matches the policy already intended in [backend/src/services/makerCheckerService.ts](backend/src/services/makerCheckerService.ts).

### 4.4 Workflow execution isolation

The orchestration layer in [backend/src/services/investigationOrchestratorService.ts](backend/src/services/investigationOrchestratorService.ts) is the correct engine to preserve, but the execution context must be explicitly separated into:

- sandbox execution
- diagnostic-only execution
- production execution
- approved manual override flow

The system must never blur:

- validation result
- pipeline action
- execution context
- governance approval

### 4.5 Reporting contract normalization

The KPI logic in [backend/src/routes/teams.ts](backend/src/routes/teams.ts) should be replaced with a typed analytics service that returns structured outcome data:

```ts
{
  summary: { open, resolved, slaBreaches, approvalQueue },
  trend: { daily: [...], weekly: [...] },
  teamPerformance: [...],
  governance: { approvalsPending, approvalRate, escalations },
  hashtags: [...],
  lastUpdated: '2026-09-24T00:00:00Z'
}
```

This makes reporting consistent, testable, and safe for the dashboard.

---

## 5. Dashboard reporting refactor

### 5.1 Current dashboard problem

The current dashboard model is useful but too broad. It is trying to do too much at once: operational throughput, governance queue, team actions, KPI summary, and management context all in one place.

This creates three issues:

1. reporting scope becomes inconsistent
2. KPI reliability becomes harder to trust
3. the screen becomes both a control room and a configuration page

### 5.2 Recommended reporting structure

Create a reporting shell with the following domains:

- Overview
- Operational Throughput
- Governance / Approvals
- Team Performance
- Workflow / Hashtag Intelligence
- SLA Risk and Exceptions

### 5.3 Reporting layer requirements

Each dashboard card should include:

- time window
- scope
- data source
- freshness timestamp
- fallback indicator
- threshold description

This is critical because fallback and stale-data states must be visible to managers.

### 5.4 Recommended metric model

Keep a clear metric definition for each value:

- numerator
- denominator
- time period
- source system
- freshness status
- alert threshold

This prevents “magic numbers” from being displayed without context.

---

## 6. Escalation room model

The escalation room should be treated as a first-class operational workspace, not an ad hoc discussion trail.

### 6.1 Proposed room structure

Each escalation should include:

- issue id
- task id or transaction id
- linked workflow or hashtag
- target team(s)
- current owner
- reason for escalation
- evidence reference
- decision state
- closed/resolved timestamp

### 6.2 State machine

Use a clear escalation lifecycle:

- NEW
- RECOMMENDED
- ACCEPTED
- IN_PROGRESS
- RESOLVED
- CLOSED
- REJECTED

This keeps reporting reliable and avoids informal status drift.

### 6.3 Action-based chat guardrails

Only explicit structured actions should trigger operational changes:

- escalate_issue
- recommend_team
- run_sandbox
- approve_workflow
- reassign_owner
- close_escalation

Plain conversation text remains commentary and must not mutate runtime state.

### 6.4 Dedupe and idempotency

Each escalation action should carry a dedupe key created from:

- issue id
- workflow id / hashtag id
- target team id
- action type
- state transition

This prevents duplicate escalations from multiple room posts.

---

## 7. Sandbox execution model

The sandbox must remain separate from production execution and should never mutate the live state without approval.

### Sandbox rules

- same workflow logic, different execution context
- isolated dataset or shadow run context
- no live production mutation
- evidence must be stored as a structured result
- production execution only allowed after approval and review

### Required evidence for sandbox results

- workflow version
- dataset used
- start and end time
- pass/fail status
- warnings and exceptions
- output summary
- target execution path

---

## 8. Recommended API structure

The backend should expose a cleaner route boundary:

- `/api/issues`
- `/api/tasks`
- `/api/workflows`
- `/api/approvals`
- `/api/escalations`
- `/api/metrics`
- `/api/sandbox`
- `/api/audit`

This should replace the current pattern of mixing concerns across broad route responsibilities in [backend/src/server.ts](backend/src/server.ts).

---

## 9. Execution sequence

### Phase 1: Domain separation

- define exact state models for workflows, issues, approvals, escalations, and analytics
- split services cleanly
- remove overloaded lifecycle assumptions

### Phase 2: Governance hardening

- finalize maker-checker workflow
- enforce role checks
- implement evidence snapshots
- tighten review reject/approve transitions

### Phase 3: Reporting normalization

- create an analytics contract
- move formulas into a service
- add freshness and fallback indicators
- split overview from operational and governance reporting

### Phase 4: Escalation room integration

- create issue-to-room model
- add structured action messages
- dedupe escalation events
- link room to workflow, issue, team, and evidence

### Phase 5: Sandbox separation

- isolate validation execution
- capture results as evidence
- require approval before production execution

### Phase 6: Frontend domain split

- split governance UI from workspace UI
- split team workspace into tabs or subviews
- extract advanced tools from the main settings flow
- reduce mixed state in the main shell

---

## 10. Success criteria

The refactor is successful when:

- each domain has a clear owner and clear state transitions
- approval and escalation behavior is auditable
- dashboard metrics are transparent and reliable
- sandbox runs remain separate from production execution
- no screen acts simultaneously as operational console, governance queue, and admin panel
- future features can be added without large UI rewrites

---

## 11. Final recommendation

The strongest path is not to add more complexity to the current structure. The right move is to formalize separation of concerns and treat each domain as a distinct operational layer.

That means:

- workflow execution stays in the engine layer
- governance stays in the approval layer
- escalation stays in the collaboration layer
- reporting stays in the analytics layer
- sandbox stays in the validation layer
- operations remain in the workflow and issue lifecycle layer

This architecture aligns with the current codebase reality and creates a stable platform for the next phase of product growth.
