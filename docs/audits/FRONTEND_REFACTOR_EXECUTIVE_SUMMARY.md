# Frontend Refactor Plan

## Objective

Reduce frontend complexity, simplify the product structure, and separate business concerns so the application is easier to maintain, easier to use, and easier to extend.

This refactor is not a visual cleanup alone. It is an architectural simplification of how the product is organized, how state flows, and how operational workflows are exposed to users.

## Final execution direction

The system should be refactored around clear operational boundaries instead of mixed screens and overloaded dashboards:

- Backend: separate workflow execution, issue lifecycle, governance approval, escalation, and analytics into distinct service domains.
- Dashboard: split managerial reporting from purely operational actions; expose overview, team, workflow, governance, and SLA-risk panels with clear data-freshness indicators.
- Escalation room: treat cross-team coordination as a structured operational room with action-based chat commands, dedupe keys, and versioned workflow context rather than free-form admin chatter.
- Sandbox: keep validation and diagnostic execution isolated from production mutation until approval and evidence capture are complete.

This final model matches the real backend structure in [backend/src/server.ts](backend/src/server.ts), [backend/src/services/investigationOrchestratorService.ts](backend/src/services/investigationOrchestratorService.ts), [backend/src/services/makerCheckerService.ts](backend/src/services/makerCheckerService.ts), and the reporting contract in [backend/src/routes/teams.ts](backend/src/routes/teams.ts).

---

## Why this refactor is needed

The current frontend has grown into a mixed-responsibility UI. The core problem is not just overcrowded screens; it is overlapping domains and duplicated logic.

Examples from the current codebase:

- [frontend/src/App.tsx](frontend/src/App.tsx) holds broad application state and cross-cutting concerns in one place.
- [frontend/src/components/TeamWorkspace.tsx](frontend/src/components/TeamWorkspace.tsx) mixes team collaboration, governance, member management, tasks, admin actions, and access review in one large screen.
- [frontend/src/components/WorkspaceSettings.tsx](frontend/src/components/WorkspaceSettings.tsx) combines configuration, approvals, escalation flows, and technical tooling.
- [frontend/src/components/settings/WorkflowStudioFlowchart.tsx](frontend/src/components/settings/WorkflowStudioFlowchart.tsx) mixes graph editing, rule configuration, validation state, and metadata management.

This creates multiple business problems:

- users cannot tell which domain a screen belongs to
- permissions and actions are harder to reason about
- the same data is copied into multiple local state stores
- changes become high-risk because unrelated logic lives together
- testing and feature work are slowed by dense screens and mixed concerns

---

## Refactor principles

### 1. Clear domain ownership
Each feature area should own one job:

- Workspace
- Team
- Issues / Investigation
- Settings
- Governance / Approvals
- Admin / System config
- Advanced tools

No single screen should coordinate operational work, governance review, and advanced tooling at the same time.

### 2. Keep the main experience simple
The default user path should feel calm and focused. Power-user functionality should still exist, but it should be placed in dedicated surfaces rather than dominating the core interface.

### 3. Move business logic out of UI
Permissions, proposal review rules, persistence adapters, validation checks, and workflow enforcement should live in hooks, services, or utilities. Rendering components should primarily display state and trigger actions.

### 4. Reduce fallback behavior as default behavior
Local fallback/mock layers can remain for resilience, but they should never be treated as the normal operation mode for core workflows.

### 5. Maintain a clear action hierarchy
The interface should enforce a clean progression:

- draft / review
- validate
- submit
- approve / reject
- apply / revert

This matters especially for governance-sensitive actions and maker-checker approval flows.

---

## Target product architecture

### Screen map

```tsx
<AppShell>
  <SideNav />
  <MainLayout>
    <WorkspaceScreen />
    <TeamWorkspaceScreen />
    <IssueInvestigationScreen />
    <SettingsScreen />
    <GovernanceScreen />
    <AdminScreen />
    <AdvancedToolsScreen />
  </MainLayout>
</AppShell>
```

### Domain responsibilities

#### Workspace
Focus on operational task flow and day-to-day execution.

Goals:
- show active tasks, issue context, and queue actions
- reduce unrelated planning widgets from the main workspace view
- keep all operational summary cards scoped to the current workflow

#### Team
Focus on collaboration and team organization.

Suggested subviews:
- Overview
- Members
- Discussion
- Tasks
- Governance
- Resources

#### Issues / Investigation
Focus on investigating, resolving, and validating exceptions.

Suggested subviews:
- Summary
- Evidence
- Resolution
- Review
- Audit trail

#### Settings
Focus on plain configuration needs for ordinary users.

Five primary groups:
- General
- Workflow
- Governance
- Notifications
- Data

#### Governance / Approvals
Focus on maker-checker review, escalation, and decision tracking.

Suggested responsibilities:
- proposal queue
- proposal detail
- approval/rejection flow
- escalation state
- history and audit view

#### Admin / System config
Focus on the platform-level controls and support operations.

#### Advanced tools
Focus on system power-user features that should not sit in the main user flow:
- Workflow Studio
- Validation Box
- DB Mirror Config

---

## Detailed refactor plan

## 1. App shell simplification

### Current issue
[frontend/src/App.tsx](frontend/src/App.tsx) contains too much cross-cutting state and repeated persistence logic.

### Target outcome
The app shell should only own:

- current user session
- selected navigation section
- global notifications
- top-level layout and error boundaries
- app-wide persistence coordination
- lazy-loaded domain screens

### Actions

1. Consolidate duplicated persistence logic into shared hooks.
2. Remove ad hoc localStorage effects from feature components.
3. Create a narrower root state model.
4. Keep the shell free of business-specific rules.
5. Ensure route/screen switching is driven by a clean navigation state model.

### Deliverables

- one shared application state adapter
- one global notification container
- one central permission gate for navigation
- simplified app bootstrap flow

---

## 2. Settings domain split

### Current issue
The settings area is overloaded with governance, review flow, escalation, and advanced tooling all in one surface.

### Target structure

```tsx
<SettingsScreen>
  <SettingsSidebar />
  <SettingsContent>
    <GeneralTab />
    <WorkflowTab />
    <GovernanceTab />
    <NotificationsTab />
    <DataTab />
  </SettingsContent>
</SettingsScreen>
```

### Advanced tools move out of the main settings path

Dedicated views should be accessed via secondary screens or a collapsed advanced panel:

- Workflow Studio
- Validation Box Manager
- DB Mirror Config

### Actions

1. Reduce the main settings page to five standard tabs.
2. Move proposal review and escalations into a dedicated governance panel.
3. Reduce inline technical editing in the primary settings surface.
4. Add a clear dirty-state indicator for unsaved changes.
5. Make advanced configuration easy to access but not visually dominant.

### Acceptance criteria

- a standard user can configure core settings without seeing technical infra controls
- advanced tools are visible and accessible but not the default path
- save state is visible and predictable
- no setting screen manages unrelated approval workflows

---

## 3. Governance domain extraction

### Current issue
Governance, approvals, and escalation logic are embedded inside high-level feature screens.

### Target structure

```tsx
<GovernanceScreen>
  <GovernanceHeader />
  <GovernanceFilters />
  <GovernanceQueue />
  <GovernanceDetail />
</GovernanceScreen>
```

### Governance responsibilities

- proposal list
- maker identity and justification
- checker review
- escalation handling
- approval history
- audit/display metadata

### Actions

1. Centralize proposal data-fetching and actions.
2. Create dedicated review cards and detail panels.
3. Keep anti-self-approval checks in one service layer.
4. Use structured review notes instead of ad hoc alerts.
5. Separate escalation logic from regular approval logic.

### Required behavior

- maker and checker roles must be explicit
- self-approval must be rejected in the API/service layer, not only in UI text
- proposal state transitions must be traceable and auditable
- rejection reasons must be preserved with the proposal record

---

## 4. Team workspace decomposition

### Current issue
[frontend/src/components/TeamWorkspace.tsx](frontend/src/components/TeamWorkspace.tsx) is acting as a mixed dashboard rather than a domain surface.

### Target structure

```tsx
<TeamWorkspace>
  <TeamWorkspaceHeader />
  <TeamWorkspaceTabs>
    <OverviewTab />
    <MembersTab />
    <DiscussionTab />
    <TasksTab />
    <GovernanceTab />
    <ResourcesTab />
  </TeamWorkspaceTabs>
</TeamWorkspace>
```

### Actions

1. Separate discussion, governance, and resource management into tab-scoped components.
2. Keep team-level state local to the team domain.
3. Remove admin and escalation logic from the main team view.
4. Move user or access management into a dedicated governance/admin subview.
5. Ensure tab switching does not re-fetch unrelated data unnecessarily.

### Acceptance criteria

- team flows are navigable by sub-area
- actions are grouped by purpose
- governance review is distinct from collaboration and resource work
- the team screen no longer acts as a generic admin console

---

## 5. Workflow studio redesign

### Current issue
The workflow editor is one large heavy component combining graph logic, validation, metadata, and rules.

### Target structure

```tsx
<WorkflowStudio>
  <WorkflowPalette />
  <WorkflowCanvas />
  <WorkflowInspector />
  <WorkflowValidationSummary />
</WorkflowStudio>
```

### Recommended layout

- left: palette and node list
- center: DAG canvas
- right: inspector and rule details
- top or footer: validation summary and action toolbar

### Actions

1. Separate graph editing from rule configuration.
2. Keep node properties and attached rules in the inspector rather than a hidden modal flow.
3. Add pre-save validation summary for topology issues.
4. Reduce modal density and blocking overlays.
5. Keep the canvas surface clean and high-contrast.

### Validation checks to surface before save

- disconnected nodes
- orphaned outputs
- unconfigured terminal nodes
- incomplete validation boxes
- broken routing or missing nodes

---

## 6. Data and state normalization

### Current issue
The app uses repeated local state patterns and inconsistent persistence behavior.

### Target state
Create a shared pattern for state and persistence:

```ts
function usePersistentState<T>(key: string, initialValue: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);

  return [state, setState] as const;
}
```

### Actions

1. Centralize repeated persistence behavior into reusable hooks.
2. Standardize serializer logic and fallback parsing.
3. Ensure domain state is loaded from one source of truth.
4. Remove duplicate state duplication across screens.
5. Normalize naming conventions across domain modules.

---

## 7. Permission and governance logic

### Current issue
Permissions and approval logic are spread across components and UI state.

### Target state
Move critical checks into a shared permission/service layer:

- `canAccessTab`
- `canReviewProposal`
- `canEscalate`
- `canEditWorkflow`
- `canApplyResolution`

### Actions

1. Move security and approval checks into utility modules.
2. Gate UI actions at the service boundary, not just in button labels.
3. Keep user-role checks consistent across the app.
4. Make maker-checker rules enforceable in one place.

### Governance principle to preserve

A maker cannot approve their own proposal. The enforcement must happen at the service/API layer and be reflected consistently in the UI.

---

## 8. Feature migration sequence

### Phase 1: Foundation cleanup

- standardize state persistence
- centralize permission logic
- simplify app shell and layout structure
- remove duplicate storage sync patterns

### Phase 2: Settings split

- create five core settings tabs
- isolate governance review into dedicated panel
- move advanced tools into dedicated views
- add explicit unsaved-state indicator

### Phase 3: Team workspace decomposition

- split into sub-tabs or sub-screens
- move admin and governance concerns out of the main team screen
- standardize team data loading and tab state

### Phase 4: Governance module extraction

- separate proposal queue and detail views
- add review notes and action states
- enforce role-based approvals
- add clear escalation audit history

### Phase 5: Workflow studio simplification

- reorganize editor into palette + canvas + inspector
- create validation summary before save
- reduce modal clutter
- improve readability and action clarity

### Phase 6: UX polish and hardening

- reduce visual density
- align action buttons hierarchy
- standardize empty states and error states
- improve accessibility and status labeling

---

## 9. Implementation checklist

### Frontend structure
- [ ] App shell simplified
- [ ] side navigation reduced to meaningful domains
- [ ] settings split into five primary tabs
- [ ] governance extracted from settings
- [ ] advanced tools moved to dedicated secondary views
- [ ] workflow editor split into focused panels

### State and logic
- [ ] persistence logic centralized
- [ ] shared permission checks implemented
- [ ] business rules in hooks/services
- [ ] fallback data isolated from main operational flow
- [ ] consistent dirty-state handling

### Governance and approval flow
- [ ] maker-checker review queue separated
- [ ] anti-self-approval enforced at service/API boundary
- [ ] approval history and notes preserved
- [ ] escalation path distinct from standard approvals

### UX quality
- [ ] action hierarchy clearer
- [ ] status indicators more consistent
- [ ] reduced visual clutter
- [ ] empty/error states standardized
- [ ] advanced features still accessible without dominating default UX

---

## 10. Success metrics

The refactor is successful when:

- the main screens are easier to understand in under 10 seconds
- feature ownership is obvious by domain
- users can navigate without jumping across unrelated concerns
- governance actions are predictable and auditable
- future features can be added without major UI rewrites
- fewer duplicate state patterns and fewer cross-screen side effects exist

---

## Dashboard reporting analysis and enhancement recommendations

The current dashboard layer shows useful operational intent, but it is currently mixing several different reporting concerns inside a single large component.

### Where the dashboard is currently overloaded

The main reporting surface exists in [frontend/src/components/ManagerialDashboard.tsx](frontend/src/components/ManagerialDashboard.tsx). It currently combines:

- team task progress metrics
- issue resolution trend charts
- hashtag-based KPI tracking
- manager SLA configuration
- team management actions
- operational health summaries
- governance queue context

This is a strong overview, but it is too broad for one screen. The same issue exists in the KPI backend contract in [backend/src/routes/teams.ts](backend/src/routes/teams.ts#L776-L820), which combines inflow and outflow metrics but still falls back to hardcoded values when PostgreSQL is unavailable.

### Current strengths

- the dashboard already exposes KPI cards, charts, and operational status summaries
- task and issue coverage is visible by scope (`MY_ASSIGNED`, `MY_CREATED`, `ALL`)
- hashtag analytics are surfaced as a managerial reporting view
- the app includes a maker-checker and SLA-related governance layer in the same operational context

### Main problems

1. Reporting scope is mixed together
   - operational metrics, governance metrics, and team admin actions are all in the same surface
2. KPI values are not fully trustworthy as real-time data
   - the route in [backend/src/routes/teams.ts](backend/src/routes/teams.ts#L776-L820) returns static values in fallback mode and uses a simplified clearance-rate formula
3. The dashboard is too event-driven and not data-model driven
   - many values are recalculated inline in the component rather than from a clear analytics service contract
4. There is no consistent reporting lifecycle
   - no clear definition of time window, scope, refresh cadence, or drill-down behavior
5. The UI is dense and decision-oriented, but not focused enough for senior decision-makers
   - the surface tries to be both monitoring dashboard and operations console

### Recommended enhancement direction

#### 1. Split dashboard into reporting domains

Use a dashboard shell with dedicated sections:

- Overview
- Operational throughput
- Governance / approvals
- Team performance
- Hashtag / workflow intelligence
- Exceptions and SLA risk

This matches the same product-domain split recommended earlier in this plan.

#### 2. Move metrics generation to a service layer

The dashboard should consume a structured analytics contract such as:

```ts
{
  summary: { open, resolved, slaBreaches, approvalQueue },
  trend: { daily: [...], weekly: [...] },
  teamPerformance: [...],
  governance: { approvalsPending, approvalRate, escalations },
  hashtags: [...],
  lastUpdated: '2026-09-23T10:00:00Z'
}
```

This should be produced by a dedicated analytics service instead of being assembled ad hoc in the React component.

#### 3. Add explicit time-window and scope filters

Every reporting card should answer:

- period: today, 7 days, 30 days, quarter
- scope: team, user, workflow, hashtag, issue type
- target: throughput, SLA, governance, exception volume

Right now the component uses local filtering but not a clean reporting model. This makes the dashboard harder to trust and harder to extend.

#### 4. Standardize KPI calculation rules

The current clearance rate logic in [backend/src/routes/teams.ts](backend/src/routes/teams.ts#L782-L814) is mathematically valid only as a simplified approximation. It should be replaced by clearly defined formulas:

- approval rate = approved / total reviewed
- SLA compliance = on-time completions / total completions
- resolution throughput = resolved issues / active issue pool
- exception volume = open discrepancies by severity and team

Every KPI should also define:

- numerator
- denominator
- time window
- source system
- alert threshold

#### 5. Add executive-friendly drill-down

A good dashboard should support three levels:

1. overview cards
2. detail list or trend by segment
3. underlying issue/proposal drill-down

Example actions:

- click a KPI card to open a filtered issue list
- open approval queue from governance summary
- open SLA-risk list from unresolved issues
- inspect hashtag cluster anomalies in a dedicated detail panel

#### 6. Separate governance and operational reporting

Governance metrics should not sit inside the same card stack as issue throughput. Instead:

- operational reporting: throughput, backlog, SLA risk
- governance reporting: maker-checker queue, approvals, rejections, escalations
- team reporting: workload and capacity

This distinction is important because executives and operators need different decision signals.

#### 7. Add quality and reliability signals to reporting

The dashboard should include:

- data freshness timestamps
- source confidence indicator
- fallback mode badge when sample/mock data is in use
- last successful sync time
- invalid/unknown metric warning state

This is especially important because fallback logic in [backend/src/routes/teams.ts](backend/src/routes/teams.ts#L790-L820) can silently replace live numbers with default ones.

#### 8. Improve visual hierarchy and comprehension

Recommendations for the UI:

- group cards by dimension rather than by raw data-type
- use consistent colors and labels for risk, warning, success, and neutral states
- add tooltips for formulas and denominators
- expose trend arrows with target comparison per metric
- reduce density on the main screen by moving secondary lists to tabs or side drawers

### Suggested dashboard architecture

```tsx
<DashboardShell>
  <DashboardHeader />
  <DashboardFilters />
  <DashboardSummaryCards />
  <DashboardGrid>
    <OperationalThroughputPanel />
    <GovernancePanel />
    <TeamPerformancePanel />
    <HashtagIntelligencePanel />
    <SlaRiskPanel />
  </DashboardGrid>
</DashboardShell>
```

### Recommended implementation sequence

#### Phase 1: Reporting model cleanup
- define analytics schema and time-window contract
- centralize KPI formulas in a service layer
- add data-freshness and fallback-state indicators

#### Phase 2: Dashboard decomposition
- split analytics into overview, operational, governance, and team views
- separate KPI cards from tables and charts
- remove mixed admin actions from the reporting surface

#### Phase 3: Drill-down and alerting
- add click-through issue lists
- support SLA-risk drill-down
- expose exception and approval queue detail views

#### Phase 4: Executive polish
- improve card hierarchy and trend interpretation
- add target-vs-actual indicators
- reduce screen density and improve readability

### Final recommendation

The dashboard should stop acting as a catch-all operational console and instead become a focused reporting system with clear ownership by domain: throughput, governance, team productivity, and workflow intelligence.

That gives the product a much healthier reporting model without removing the operational visibility the product already has.

---

## Managerial reporting and escalation architecture

The managerial role should not be treated as a configuration owner. It should be treated as an operational decision-maker and monitor. In this model, the dashboard is a live control room for operational progress and escalation readiness, while the actual routing and rule setup remain in the lower-level system configuration or in a recommendation engine backed by approved workflow metadata.

### 1. Core operating model

The managerial user should see a dashboard that answers five questions:

1. What is currently blocked or at risk?
2. Which teams are overloaded or underperforming?
3. Which issues need escalation or a fresh owner?
4. Which workflows are healthy, failing, or drifting?
5. Which escalation rooms are active and what is the current decision state?

The remaining user roles should be intentionally separated:

- Manager: monitor, prioritize, approve escalation, review progress
- Team lead: own workflow execution and case ownership within team scope
- Technical operator: run sandbox testing and workflow validation
- Admin / system config: maintain escalation policy, workflow version registry, and template approvals

This keeps the managerial dashboard focused on monitoring and decision support rather than heavy setup work.

---

### 2. Dashboard responsibility split

The dashboard should be read-first and decisions-first, not setup-first.

#### A. Manager overview panel
This should show:

- active escalations
- backlog by team
- SLA breach rate
- unresolved issues by hashtag
- workflow health by process type
- pending approvals and escalation decisions
- sandbox execution state

#### B. Team performance panel
This should show per-team metrics:

- open tasks
- assigned workload
- aging issues
- escalation volume
- average resolution duration
- ratio of issues resolved vs escalated

#### C. Workflow health panel
This should show per-hashtag workflow status:

- current workflow version
- approval status
- last successful run
- failure rate
- sandbox pass/fail ratio
- escalation trend

#### D. Escalation feed panel
This should show active issue and team action streams:

- current escalation rooms
- latest status updates
- owners assigned
- explicit escalation reasons
- resolved or rejected items

This is the operational “news feed” for the manager.

---

### 3. Escalation matrix integration through chat rooms

The escalation matrix should not be managed as a static system configuration page for most users. Instead, escalation should live inside a special team discussion room that is created for operational coordination.

#### Proposed concept: Escalation Room

Each issue or operational case gets an escalation room with:

- issue summary and identifier
- linked task or transaction
- relevant team list
- linked hashtag / workflow template
- sandbox execution outputs
- investigation notes
- recommended target team(s)
- current escalation state
- final decision owner

This room should support:

- team mentions
- issue import
- workflow import
- attached evidence
- sandbox run summaries
- decision notes and lead approvals

This gives the manager a peer-to-peer operational room rather than a form-heavy administrative config screen.

#### Why this is better

It matches the actual operating rhythm of a team:

- the issue is discussed while it is active
- technical validation happens in the same context
- lead decisions are captured with the issue
- future reporting can be derived from room events
- the escalation state naturally becomes part of the record

---

### 4. Recommended chat behavior and guardrails

The chat room should not become an uncontrolled automation loop. To keep it stable, all action-triggering messages must be explicitly structured.

#### Required message actions

Messages should be interpreted as actions only when they are marked with a defined command such as:

- escalate_issue
- recommend_team
- run_sandbox
- approve_workflow
- reassign_owner
- close_escalation

Any plain conversation text should remain commentary only.

#### Dedupe rule
Each escalation action should carry a unique idempotency key based on:

- issue id
- workflow id / hashtag id
- target team id
- action type
- state transition

This prevents duplicate escalations when multiple leads post similar updates.

#### State model for escalation room

Use a clear state machine instead of ad hoc flags:

- NEW
- RECOMMENDED
- ACCEPTED
- IN_PROGRESS
- RESOLVED
- CLOSED
- REJECTED

This keeps the manager’s reporting layer trustworthy.

---

### 5. Hashtag-driven workflow template model

The hashtag concept is valuable if it is treated as an approved operational workflow contract, not as a loose label.

Each hashtag should represent an approved process definition with:

- workflow version
- expected inputs
- required validation checks
- sandbox execution profile
- target owner teams
- output reporting contract
- approval rules
- linked issue types

This makes the hashtag a standard mapping layer across:

- issue creation
- workflow selection
- team ownership
- execution result
- reporting output

#### Required attributes of an approved workflow hashtag

- immutable version number
- approved by designated workflow owner
- linked to canonical standard mappings
- includes required input schema
- includes validation steps and exit conditions
- includes produced outputs / reports
- can be run in sandbox without mutation of production state

This is much more reliable than allowing a live investigation flow to mutate the workflow definition in an unapproved way.

---

### 6. Sandbox execution model

The sandbox is essential and should remain separate from the current production query implementation.

#### Sandbox rules

- same workflow logic, different execution context
- isolated data or shadow run context
- no production mutation
- no side-effecting query execution against live transactional data
- run result must be captured as evidence and attached to issue / escalation room

#### Required evidence for sandbox results

- workflow version
- selected test dataset
- start time and end time
- pass/fail status
- output report summary
- warnings and exceptions
- target execution path

The manager should see sandbox readiness as a KPI and operational signal, not as a hidden technical action.

---

### 7. Execution flow: from issue to completed workflow

A healthier workflow should follow this chain:

1. Issue is created and mapped to a hashtag / workflow template
2. Workflow engine identifies the recommended operational path
3. Manager reviews the issue, workflow, and target teams
4. Escalation room is opened with relevant team members and workflow context
5. Technical user runs the workflow in sandbox
6. Workflow result is evaluated against risk and quality conditions
7. Final owner is assigned or changed by lead approval
8. Execution proceeds to approved step or full end-to-end run
9. Reporting is generated from the execution evidence and state transitions

This keeps the system in a clean operational lifecycle without mixing setup, governance, and live execution.

---

### 8. Reporting model for managerial use

The dashboard should not simply display raw metrics. It should tell the manager what needs attention and what decisions are ready.

#### Recommended reporting blocks

- Executive overview
  - open issues
  - escalations in progress
  - SLA risk items
  - team overload map

- Team workload and throughput
  - current capacity
  - backlog trend
  - resolution velocity
  - escalation ratio

- Workflow and hashtag performance
  - success rate
  - failure points
  - timeout rate
  - repeated bottlenecks

- Escalation decision board
  - recommended targets
  - active rooms
  - pending approvals
  - current resolution owner

- Sandbox and validation status
  - ready for execution
  - blocked by missing input
  - failed validation
  - passed but awaiting approval

This gives managers real control without turning the dashboard into a system administration page.

---

### 9. Loops and anti-patterns to avoid

#### A. Escalation loop
Multiple teams keep being added because every chat update is interpreted as escalation action.

Solution:
- action-based message processing only
- dedupe by issue + team + action type
- one active escalation per target team at a given state

#### B. Workflow re-trigger loop
A workflow continues to re-run because a state update triggers another evaluation.

Solution:
- workflow runs only on valid state transitions
- run hash and version matching
- suppress repeats for same issue + workflow version + state

#### C. Chat recursion
A chat room generates tasks and tasks generate new chat rooms endlessly.

Solution:
- chat rooms must be attached to existing issue/task records
- only explicit escalation actions create a new workflow instance
- plain chat remains non-actionable

#### D. Sandbox-to-production bleed
Sandbox testing writes into the same state as production.

Solution:
- sandbox environment must be isolated
- execution result stored as separate evidence record
- production execution triggered only after approval

#### E. Unapproved workflow mutation
Hashtag definitions can be changed mid-investigation and disrupt reporting.

Solution:
- only approved template versions can be used in production execution
- all workflow edits require versioning and approval
- reports reference workflow version, not only tag name

---

### 10. Recommended architectural boundary

The clean separation should be:

- Dashboard: monitor and support decisions
- Escalation room: operational collaboration and ownership routing
- Workflow templates: approved process definitions and standards
- Sandbox execution: technical validation without production state mutation
- Governance / approval layer: enforcement of policy and checklist completion
- Reporting layer: notifies managers using structured execution and escalation events

This boundary keeps the user experience calm while preserving enough operational detail for teams and managers to act on real issues.

---

### 11. Recommended implementation sequence

#### Phase 1: managerial dashboard split
- define overview, team, workflow, escalation, and risks panels
- remove admin-style configuration from the main dashboard
- add escalation-room summary and active queue cards

#### Phase 2: escalation room integration
- create dedicated issue/team chat room model
- add action-based message parsing and dedupe keys
- link room to issue, task, workflow, and teams

#### Phase 3: workflow template versioning
- introduce approved workflow versioning for hashtags
- attach execution output and validation metadata
- add version-aware reporting and alerting

#### Phase 4: sandbox execution isolation
- separate sandbox outputs from production state
- attach evidence to issue and escalation room
- require approval before production execution

#### Phase 5: reporting and audit layer
- add operation-specific metrics for workload, SLA, escalation, and workflow health
- add confidence / fallback / freshness indicators
- provide drill-down from manager cards to active issue, room, and workflow detail

---

### 12. Final recommendation

The right managerial pattern is not to turn the dashboard into a system setup console. It is to turn it into a live operations control room that:

- watches the execution health of teams and workflows
- recommends escalation targets based on hashtag and workflow context
- pushes decisions into structured chat rooms for coordination
- keeps technical sandbox testing separate from current production query behavior
- records every escalation, workflow, and team action as evidence

This is a cleaner integration with the existing repo structure and a better fit for the way operational teams actually work.

---

## Final statement

This refactor should not remove features. It should reorganize them into the correct domains so the product feels intentional, stable, and easier to evolve over time.

The goal is simple: make the product easier to trust, easier to operate, and easier to extend without increasing complexity in the UI.
