# Frontend Overall Refactor Suggestion

## Summary

The current frontend is feature-rich and visually ambitious, but it is over-scoped and too tightly coupled in several places. The main issue is not a single bug; it is an architectural pattern problem:

- too many responsibilities live in a single screen or component
- business logic is mixed directly with UI rendering
- hard-coded defaults and fallback data are used as a substitute for real configuration
- state is spread across multiple localStorage caches and component-level variables
- navigation and settings sections are overloaded with advanced, technical, and governance concerns in the same interface

The result is a frontend that is difficult to maintain, easy to break, and harder to reason about as the system grows.

---

## Main problems in the current frontend

### 1. Overloaded component structure
The main app shell in [frontend/src/App.tsx](frontend/src/App.tsx) holds a large amount of state and responsibility. The same pattern continues in [frontend/src/components/TeamWorkspace.tsx](frontend/src/components/TeamWorkspace.tsx) and [frontend/src/components/WorkspaceSettings.tsx](frontend/src/components/WorkspaceSettings.tsx).

These components are managing:

- workspace navigation
- user/team state
- issue/task data
- approvals and governance review
- team discussion and resource state
- DB access management
- admin-like configuration
- workflow builder and validation tools
- escalation logic

This creates a large, fragile component graph.

### 2. Hard-coded business assumptions
The project includes many seeded assumptions in [frontend/src/mockData.ts](frontend/src/mockData.ts). These are useful for demos, but they become problematic when used as default runtime behavior.

Examples:

- fixed user objects and role patterns
- static team and system metadata
- preconfigured app defaults
- mocked operational workflows

This is not inherently wrong for a prototype, but in a production-style front end it weakens correctness and makes real backend integration harder.

### 3. Fallback logic used as default behavior
The app relies on `localStorage` hydration and fallback states in several places. That is useful, but it should be a resilience layer, not the primary application model.

The current pattern often looks like:

- read from localStorage
- if missing, return mock data
- keep using that data as if it were real application state

This makes it hard to tell whether the app is running from actual backend data or a cached fallback model.

### 4. Mixed concerns in settings and governance
The current workspace settings screen is a strong example of this problem.

It mixes:

- general configuration
- governance proposals
- review and approval actions
- escalation management
- technical DB config tools
- workflow studio features
- validation box features

This makes the UI visually noisy and conceptually confusing.

### 5. Permission logic is embedded in UI
The authorization logic in [frontend/src/components/SideNav.tsx](frontend/src/components/SideNav.tsx) is hardcoded and intertwined with rendering. This should be moved into a dedicated permission utility or hook.

This reduces:

- duplication
- inconsistent checks across screens
- security review issues

---

## Recommended frontend architecture

### 1. Keep the app shell thin
[frontend/src/App.tsx](frontend/src/App.tsx) should act as the central orchestrator, not a giant state container for every feature.

It should mainly own:

- app-level navigation state
- user session
- global notifications
- common layout
- bootstrapping and global error handling

It should not contain everything needed for every business workflow directly.

### 2. Divide features into bounded domains
Each major domain should have its own bounded component tree.

Suggested domains:

- Workspace
- Teams
- Issues / Investigation
- Governance / Approvals
- Settings
- Admin / Systems
- Notifications
- Data / Query Tools

This reduces cross-feature coupling.

### 3. Use sub-pages for settings, not giant mixed tabs
The workspace settings redesign should follow a clear business grouping model:

- General
- Workflow
- Governance
- Notifications
- Data

Then advanced screens can be accessible as secondary pages:

- DB Config
- Validation Box
- Workflow Studio
- Approvals / Escalation

This matches the product direction described in [WORKSPACE_SETTINGS_OPTION_2.md](WORKSPACE_SETTINGS_OPTION_2.md).

### 4. Move business logic into hooks and services
Put rules in dedicated hooks/services such as:

- `usePersistentState`
- `useWorkspaceConfig`
- `usePermissions`
- `useWorkspaceProposals`
- `useTeamGovernance`

This keeps UI rendering clean and logic reusable.

### 5. Reduce UI-level alerts and imperative logic
The current code uses imperative patterns such as `alert(...)` in approval flows. Those should instead be handled by:

- toast notifications
- inline validation banners
- modal confirmation flows
- structured error states

This creates a better product experience and makes the logic easier to test.

---

## Suggested component structure

```tsx
<AppShell>
  <SideNav />
  <MainContent>
    <WorkspaceScreen />
    <TeamWorkspaceScreen />
    <IssueDetailScreen />
    <SettingsScreen />
    <AdminScreen />
  </MainContent>
</AppShell>
```

Then deeper:

```tsx
<SettingsScreen>
  <SettingsSidebar />
  <SettingsContent>
    <GeneralSettingsPanel />
    <WorkflowSettingsPanel />
    <GovernanceSettingsPanel />
    <NotificationsSettingsPanel />
    <DataSettingsPanel />
  </SettingsContent>
</SettingsScreen>
```

This is much easier to reason about than a single big settings panel with everything embedded.

---

## Recommended refactor strategy

### Phase 1: State cleanup

- centralize persistence logic
- reduce duplicate localStorage keys
- standardize fallback behavior

### Phase 2: Domain extraction

- split TeamWorkspace into team sections
- split WorkspaceSettings into business groups
- extract permissions into utility/hook

### Phase 3: UX simplification

- reduce tab overload
- convert dense forms to cards or grouped sections
- separate governance and technical tools into deep links or secondary views

### Phase 4: Testing and safety

- unit test permission logic
- test settings proposal flow
- validate fallback behavior only as a graceful degradation path

---

## Final recommendation

The frontend should be simplified around a clean layered model:

- shell
- domain screens
- feature panels
- service logic
- persistence layer

The current app is too close to a prototype dashboard with many features jammed together. The best improvement is not to add more features, but to clearly separate concerns and reduce the number of mixed responsibilities on each screen.

This is the most important design move for making the frontend stable, understandable, and easier to extend.

---

## Short version

If I had to summarize the frontend in one sentence:

The current frontend is powerful but overbuilt in structure, too dependent on hardcoded mock defaults and fallback state, and needs clearer separation between workspace operations, settings, and governance.
