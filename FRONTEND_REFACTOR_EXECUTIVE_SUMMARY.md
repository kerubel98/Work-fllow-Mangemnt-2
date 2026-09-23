# Frontend Refactor Executive Summary

## Objective

Reduce frontend overload, simplify the product structure, and separate business concerns so the app is easier to maintain, easier to use, and easier to extend.

---

## Why this change is needed

The current frontend contains too many concerns in the same screens. The main problem is architectural overload, not just visual clutter.

Examples from the current codebase:

- [frontend/src/App.tsx](frontend/src/App.tsx) keeps large app-wide state and multiple responsibilities in one place.
- [frontend/src/components/TeamWorkspace.tsx](frontend/src/components/TeamWorkspace.tsx) mixes collaboration, governance, tasks, resources, admin behavior, and access management.
- [frontend/src/components/WorkspaceSettings.tsx](frontend/src/components/WorkspaceSettings.tsx) mixes regular settings, governance review, escalation actions, and advanced technical tooling.
- [frontend/src/components/settings/WorkflowStudioFlowchart.tsx](frontend/src/components/settings/WorkflowStudioFlowchart.tsx) combines workflow design, rule editing, validation, and flow metadata in one heavy editor.

This creates confusion for users and makes future changes risky.

---

## Recommended direction

### 1. Split the product into clear domains

- Workspace
- Team
- Issues / Investigation
- Settings
- Governance / Approvals
- Admin / System config
- Advanced tools

Each domain should have a single responsibility and a smaller set of screens.

### 2. Reduce the settings page to a simple structure

Use five primary sections:

- General
- Workflow
- Governance
- Notifications
- Data

Move advanced tools into dedicated views:

- Workflow Studio
- Validation Box
- DB Mirror Config

### 3. Keep advanced tools available but separate

Power users should still have access to technical configuration, but it should not dominate the standard user experience. Advanced tools should live in a secondary area or dedicated screen.

### 4. Move business logic out of UI

Permissions, approval rules, persistence, and validation logic should live in hooks or services instead of being embedded directly in rendering components.

### 5. Reduce fallback behavior as a default mode

Local fallback and mock data can remain for resilience, but they should not be treated as a real operating state for core product behavior.

---

## Immediate implementation priorities

### Phase 1: Core cleanup
- [x] **centralize persistence logic**: Implemented [`usePersistentState.ts`](frontend/src/hooks/usePersistentState.ts) with resilient JSON parsing and serializer callbacks.
- [x] **centralize permission checks**: Implemented [`navigationPermissions.ts`](frontend/src/utils/navigationPermissions.ts) (`canAccessTab`), unified with [`SideNav.tsx`](frontend/src/components/SideNav.tsx).
- [x] **simplify app shell structure**: Pruned 100+ lines of duplicate `useEffect` storage sync blocks in [`App.tsx`](frontend/src/App.tsx).
- [x] **remove duplicated local state patterns**: Centralized state management into single-line persistent state hooks across all navigation domains.

### Phase 2: Settings simplification
- [x] **split settings into five main panels**: Decomposed into [`WorkspaceGeneralTab.tsx`](frontend/src/components/settings/WorkspaceGeneralTab.tsx), [`WorkspaceWorkflowTab.tsx`](frontend/src/components/settings/WorkspaceWorkflowTab.tsx), [`WorkspaceGovernanceTab.tsx`](frontend/src/components/settings/WorkspaceGovernanceTab.tsx), [`WorkspaceNotificationsTab.tsx`](frontend/src/components/settings/WorkspaceNotificationsTab.tsx), and [`WorkspaceDataTab.tsx`](frontend/src/components/settings/WorkspaceDataTab.tsx).
- [x] **isolate governance review into its own panel**: Built dedicated maker-checker proposal review and escalation matrix in [`WorkspaceGovernanceTab.tsx`](frontend/src/components/settings/WorkspaceGovernanceTab.tsx).
- [x] **move advanced tools into secondary screens**: Converted DB Mirror Config, Validation Box Manager, and Workflow Studio into dedicated full-page views with `← Back to Settings` navigation in [`WorkspaceSettings.tsx`](frontend/src/components/WorkspaceSettings.tsx).
- [x] **add unsaved-change state indicator**: Integrated real-time snapshot diffing and animated amber "Unsaved" badge with dynamic save button accent rings.

### Phase 3: Team workspace decomposition
- [x] **split team sections into overview, members, discussion, tasks, governance, and resources**: Built focused sub-tabs in [`TeamWorkspace.tsx`](frontend/src/components/TeamWorkspace.tsx).
- [x] **remove mixed admin logic from the main team view**: Delegated administration and four-eyes authorization decoupled into dedicated `Team Settings & Governance` panel.

### Phase 4: Workflow studio redesign
- [x] **split canvas, inspector, and rule panel**: Implemented 3-pane architecture in [`WorkflowStudioFlowchart.tsx`](frontend/src/components/settings/WorkflowStudioFlowchart.tsx) with [`WorkflowPalette.tsx`](frontend/src/components/settings/workflow/WorkflowPalette.tsx), center DAG canvas, and [`WorkflowInspector.tsx`](frontend/src/components/settings/workflow/WorkflowInspector.tsx).
- [x] **separate flow design from rule configuration**: Flowchart canvas manages vertical DAG wiring while the inspector manages node properties, intermediate report columns, and attached column rules.
- [x] **add workflow validation summary before save**: Embedded [`WorkflowValidationSummary.tsx`](frontend/src/components/settings/workflow/WorkflowValidationSummary.tsx) checking for terminals, orphan nodes, disconnected outputs, and unconfigured boxes.
- [x] **reduce modal overload**: Replaced intrusive full-screen blocking modals with the inline contextual side drawer ([`WorkflowInspector.tsx`](frontend/src/components/settings/workflow/WorkflowInspector.tsx)).

### Phase 5: UX polish
- [x] **improve action hierarchy**: Adopted 3-tier action model (`Reset Defaults`, `Save Draft`, `Apply Changes`, `Submit for Approval`).
- [x] **improve proposal states and review feedback**: Styled review actions, escalation targets modal, and inline feedback toasts.
- [x] **add clearer status indicators**: Pre-flight graph topology summary badges, wire routing action tags, and live snapshot dirty-state badges.
- [x] **clean up final visual density**: Consolidated Workflow Studio header into a single responsive, non-scrolling card box; eliminated duplicate buttons and moved canvas layout tools directly to the canvas toolbar.

---

## Expected outcome

The frontend should become:

- easier to navigate
- easier to maintain
- less dense and less noisy
- easier to test and extend
- clearer for both operational users and power users

---

## Final statement

This refactor should not remove features. It should organize them into the right places so the product feels intentional, stable, and easier to evolve over time.
