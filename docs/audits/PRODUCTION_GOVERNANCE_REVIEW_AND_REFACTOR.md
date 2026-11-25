# Production Governance Review and Refactor

## Executive Summary

The current governance model is too broad for production use.

The codebase already contains the right building blocks for maker-checker, approvals, and escalation, but those concepts are being applied to the wrong categories of work. The system currently mixes:

- operational workflow approval
- team KPI and reporting
- user/workspace settings
- team approvals and escalation
- investigation handoff logic

These are not the same problem and should not share the same review model.

The current implementation creates a broad approval surface that is difficult to reason about, difficult to maintain, and easy to misuse in production.

The correct production model is:

- keep maker-checker for operational workflow integrity
- keep escalation only for real cross-team investigation and override conditions
- keep KPI and reporting outside governance approval logic
- keep settings and personal workspace changes on a simple share / review model
- treat a shared workflow as a composite bundle made of validation box + validation flow + DB checks

---

## The primary design flaw

The root issue is not a single missing feature. It is a structural design problem:

- governance is being used as a universal approval layer
- settings are being treated like operational policy
- KPI reporting is being mixed into approval queues
- the same approval pattern is duplicated in multiple UI sections

This creates review loops, inconsistent ownership, and unclear user expectations.

---

## Evidence from the current codebase

### 1) Governance exists as a standalone surface

The app renders a dedicated governance screen in:

- [frontend/src/App.tsx](frontend/src/App.tsx#L1211-L1219)
- [frontend/src/components/governance/GovernanceScreen.tsx](frontend/src/components/governance/GovernanceScreen.tsx)

This page is a full dual-authorization queue for proposals and escalation.

That is already a sign that the product is trying to turn a narrow operational concept into a central application feature.

### 2) Governance is also embedded in Workspace Settings

The settings view includes a governance tab and proposal queue in:

- [frontend/src/components/WorkspaceSettings.tsx](frontend/src/components/WorkspaceSettings.tsx#L82-L144)
- [frontend/src/components/WorkspaceSettings.tsx](frontend/src/components/WorkspaceSettings.tsx#L500-L583)

This means the same approval model is being exposed in two completely different parts of the app:

- a central governance screen
- a settings section

This is not a clean design and will cause inconsistent behavior and confusion.

### 3) Governance is mixed with Team Workspace and KPI logic

The Team Workspace section loads approval state, KPI data, grants, AI objectives, and setting proposals together:

- [frontend/src/components/TeamWorkspace.tsx](frontend/src/components/TeamWorkspace.tsx#L763-L980)

This is a direct violation of separation of concerns.

KPI and reporting are analytics functions. They should not live in the same decision-making queue as operational workflow approval.

### 4) The navigation model exposes governance as a normal top-level app operation

The side nav renders governance as a core navigation tab:

- [frontend/src/components/SideNav.tsx](frontend/src/components/SideNav.tsx#L311-L348)

And access rules allow it as a normal, broadly available top-level tab:

- [frontend/src/utils/navigationPermissions.ts](frontend/src/utils/navigationPermissions.ts#L6-L41)

This makes governance look like an everyday app mode rather than a constrained operational review lane.

### 5) Backend approval is unified across multiple approval types

The backend approval service merges transaction resolutions and workspace setting proposals in one list:

- [backend/src/services/approvalService.ts](backend/src/services/approvalService.ts#L68-L214)

This is a dangerous abstraction.

These are different risk classes:

- transaction override and manual correction
- workflow bundle approval
- user settings or personal workspace sharing

Combining them in one feed creates false urgency and weak accountability.

### 6) Settings proposals are generic and too weak for production workflow bundles

The proposal API is a generic JSON payload:

- [backend/src/routes/workspaceSettingsProposals.ts](backend/src/routes/workspaceSettingsProposals.ts#L40-L96)

It accepts:

- settingType
- settingKey
- proposedChanges
- currentSnapshot
- justification

This is far too generic for a shared operational workflow bundle composed of validation logic, flow graph, and DB checks.

Production requires a structured bundle model with dependency validation, versioning, and ownership context.

---

## What is actually required

The system needs a strict separation of responsibilities.

### 1) Operational governance
Use maker-checker here:

- workflow bundle approval
- validation box update approval
- validation flow approval
- investigation protocol approval
- DB validation check approval
- remediation bundle approval

This is where the four-eyes principle matters.

### 2) Real escalation
Use escalation only when:

- actual cross-team investigation handoff occurs
- ownership is disputed
- a manual override is required
- a workflow crosses team boundaries
- first-level and second-level investigation are involved

This is not broad governance. This is operational accountability.

### 3) Reporting and KPI
Keep all KPI and scorecard logic separate from approval logic:

- team metrics
- productivity reporting
- objective tracking
- endorsement and goals

These should not pass through operational approval.

### 4) Personal workspace and simple sharing
For regular user settings and personal workspace config, use a light share model:

- share to user or team
- preview scope
- visible shared origin
- simple review only for real impact cases

No broad governance page should be required for these cases.

---

## Why the current design fails in production

### A. It treats low-risk settings as high-risk governance

A personal config or a basic workspace preference should not require the same process as a shared investigation workflow.

But the current model allows that by design.

### B. It creates multiple sources of review truth

Review exists in:

- Governance center
- Workspace settings
- Team workspace approvals

This creates ambiguity. Which queue is the real one?

### C. It creates a false audit burden

When everything is encoded as a formal approval item, the system becomes heavy and noisy.

Operators stop differentiating between:

- real operational risk
- low-risk changes
- reporting data
- simple sharing actions

That is not sustainable.

### D. It compromises UI clarity

The current UI encourages users to think governance is a general feature rather than a narrow operational control plane.

That is not the right product mental model.

---

## The correct production boundary

### Approval is required for:

- validation workflow bundle changes
- validation-box changes that affect operational logic
- investigation procedure changes
- DB validation check changes that affect execution integrity
- cross-team operational resolution proposals
- manual override of investigation decisions with audit traces

### Approval is not required for:

- personal workspace settings
- ordinary user preferences
- KPI target setting
- team reporting definitions
- non-operational dashboards

### Escalation is required for:

- first-level to second-level investigation handoff
- cross-team ownership disputes
- manual override decisions with system impact
- operational disagreement between teams

### Escalation is not required for:

- normal team metrics
- team goals
- general settings changes
- non-sensitive share actions

---

## The real shared object should be a workflow bundle

When a workflow is shared, it is not a single config item. It is a composite object including:

- validation box
- validation flow / DAG
- DB config checks
- related rules and assumptions
- linked metadata
- owner and source team
- approval status
- versioning
- scope

This should be treated as one bundle, not as a loose JSON proposal.

### Example bundle fields

- workflowBundleId
- workflowId
- validationBoxIds[]
- dbCheckIds[]
- version
- ownerUserId
- ownerTeamId
- targetScope: personal | team | shared
- approvalStatus: draft | pending_review | approved | rejected | escalated
- sourceLabel: personal | team | escalated
- createdAt
- reviewedBy
- reviewedAt

This is the minimum necessary model for production correctness.

---

## Recommended UX cleanup

### Remove or heavily reduce

1. Standalone Governance page
   - [frontend/src/components/governance/GovernanceScreen.tsx](frontend/src/components/governance/GovernanceScreen.tsx)

2. Full governance nav entry in sidebar
   - [frontend/src/components/SideNav.tsx](frontend/src/components/SideNav.tsx#L311-L348)

3. Governance tab inside Workspace Settings
   - [frontend/src/components/WorkspaceSettings.tsx](frontend/src/components/WorkspaceSettings.tsx#L500-L583)

4. Mixed team governance / KPI / grant approval section
   - [frontend/src/components/TeamWorkspace.tsx](frontend/src/components/TeamWorkspace.tsx#L763-L980)

5. Dashboard governance queue card
   - [frontend/src/components/ManagerialDashboard.tsx](frontend/src/components/ManagerialDashboard.tsx#L557-L608)

### Replace with a simpler model

Create a small set of review surfaces:

- Shared workflow bundle review queue
- Cross-team escalation queue
- Team reporting dashboard
- Personal/shared asset panel

This is much easier for users to understand and far cleaner in production.

---

## Recommended system architecture

### Layer 1: Shared asset and review model

Use a narrow route and service layer for:

- workflow bundle share
- workflow bundle review
- workflow bundle escalation
- validation box / flow bundle approval

### Layer 2: Investigation escalation model

Separate from settings entirely:

- first-level investigation
- second-level escalation
- ownership dispute resolution
- manual override with audit trace

### Layer 3: Reporting model

This should be exclusively analytics and KPI:

- team throughput
- intended team goals
- scorecards
- reporting summaries

### Layer 4: Personal workspace and share model

This should handle:

- simple sharing to user or team
- reference labels
- access scope information
- visibility of origin

---

## Final recommendation

The production-safe decision is:

- keep maker-checker for operational workflow validity and investigation integrity
- reserve escalation for real cross-team operational disputes
- remove broad governance from general settings
- remove KPI from approval flows
- treat a shared workflow as a composite bundle
- reduce the UI to focused review queues and reporting surfaces

This keeps the system safe without turning every configuration action into a governance exercise.

---

## Conclusion

The repo has the right operational concepts, but the current design scope is too broad and too generic.

If this is going to production, the governance architecture must be narrowed aggressively:

- broad governance page: remove or reduce
- global settings approval pattern: narrow to operational bundle review only
- KPI reporting: remove from approval logic
- mixed team approval surfaces: split into dedicated queues
- workflow sharing: model as a bundle with traceable ownership and approval state

This is the cleanest production implementation and the safest system behavior.
