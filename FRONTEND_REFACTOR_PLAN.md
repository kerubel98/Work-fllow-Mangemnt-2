# Frontend Refactor Plan

## Goal

Simplify the current frontend architecture, reduce screen overload, separate business concerns, and make the workspace settings and team workspace easier to understand, test, and extend.

This plan is based on the current structure in:

- [frontend/src/App.tsx](frontend/src/App.tsx)
- [frontend/src/components/WorkspaceSettings.tsx](frontend/src/components/WorkspaceSettings.tsx)
- [frontend/src/components/TeamWorkspace.tsx](frontend/src/components/TeamWorkspace.tsx)
- [frontend/src/components/SideNav.tsx](frontend/src/components/SideNav.tsx)
- [frontend/src/components/settings/WorkflowStudioFlowchart.tsx](frontend/src/components/settings/WorkflowStudioFlowchart.tsx)

---

## 1. Refactor principles

### 1.1 Separate business domains
Each screen should own a single responsibility:

- Workspace: operational work and task flow
- Team: group collaboration and communication
- Settings: configuration and preferences
- Governance: approvals, escalations, review state
- Admin: system access and technical configuration
- Advanced Tools: workflow studio, validation box, DB config

### 1.2 Reduce component overload
Large screens should be split into subcomponents and subpages. Avoid giant mixed components that manage state for unrelated domains.

### 1.3 Keep only essential navigation
Navigation should be simple and easy to scan.

Recommended top-level structure:

- Workspace
- Team Workspace
- Issues
- Settings
- Admin

Secondary maps for advanced tools should live under dedicated sections or under a minimal “Advanced” area.

### 1.4 Move logic out of UI components
Business rules should move into:

- hooks
- services
- permission utilities
- state adapters

UI should mainly render state and trigger actions.

---

## 2. Screen-level refactor plan

## 2.1 App shell refactor

### Current issue
[frontend/src/App.tsx](frontend/src/App.tsx) manages too much application state and many unrelated concerns.

### Target state
The shell should only manage:

- current user
- active app section
- global notification state
- layout and navigation
- lazy-loaded screen mounting
- application-level error boundaries

### Suggested substructure

```tsx
<AppShell>
  <SideNav />
  <MainBody>
    <WorkspaceScreen />
    <TeamWorkspaceScreen />
    <IssueScreen />
    <SettingsScreen />
    <AdminScreen />
  </MainBody>
</AppShell>
```

### Action items

- extract app-level persistence helper into one reusable hook
- remove scattered localStorage logic from feature components
- pass data through props or context rather than storing duplicate copies in many places

---

## 2.2 Settings screen refactor

### Current issue
[frontend/src/components/WorkspaceSettings.tsx](frontend/src/components/WorkspaceSettings.tsx) still mixes settings, governance, and advanced tools in one screen.

### Target structure

```tsx
<SettingsScreen>
  <SettingsSidebar>
    <GeneralSection />
    <WorkflowSection />
    <GovernanceSection />
    <NotificationsSection />
    <DataSection />
  </SettingsSidebar>

  <SettingsContent>
    <GeneralSettingsPanel />
    <WorkflowSettingsPanel />
    <GovernanceSettingsPanel />
    <NotificationsSettingsPanel />
    <DataSettingsPanel />
  </SettingsContent>
</SettingsScreen>
```

### Advanced tools
These should move into secondary navigation or dedicated sub-pages:

- Workflow Studio
- Validation Box
- DB Mirror Config

### Action items

- keep only 5 main tabs in the main settings UI
- move decision-heavy governance review into its own dedicated governance panel
- reduce direct inline technical editing in the main settings view
- add “unsaved changes” indicator
- split the current monolithic page into smaller panel components

---

## 2.3 Governance refactor

### Current issue
Governance is mixed into settings and contains dense approval logic, escalation handling, and review state in the same component.

### Target structure

```tsx
<GovernancePanel>
  <GovernanceHeader />
  <GovernanceFilters />
  <ProposalList />
  <ProposalDetail />
</GovernancePanel>
```

### Proposal list should include

- title
- type
- maker
- status
- justification
- review notes
- actions

### Action items

- remove direct alert-based self-review blocking
- use inline warning or disabled state instead
- create a separate proposal detail view for full context
- separate escalation logic from normal approval list

---

## 2.4 Team workspace refactor

### Current issue
[frontend/src/components/TeamWorkspace.tsx](frontend/src/components/TeamWorkspace.tsx) handles too many independent domains in one place.

### Target structure

```tsx
<TeamWorkspace>
  <TeamSidebar />
  <TeamMain>
    <OverviewTab />
    <MembersTab />
    <DiscussionTab />
    <TasksTab />
    <GovernanceTab />
    <ResourcesTab />
  </TeamMain>
</TeamWorkspace>
```

### Action items

- split team functions into separate tabs/components
- keep only the active team subview rendered
- remove duplicated governance and permissions state from the main team view
- move delegated admin and access state into a dedicated admin or governance panel

---

## 2.5 Workflow studio refactor

### Current issue
[frontend/src/components/settings/WorkflowStudioFlowchart.tsx](frontend/src/components/settings/WorkflowStudioFlowchart.tsx) is too dense and combines flow design, metadata, rule editing, and validation in one editor.

### Target structure

```tsx
<WorkflowStudio>
  <WorkflowSidebar />
  <WorkflowCanvas />
  <WorkflowInspector />
  <WorkflowRulePanel />
</WorkflowStudio>
```

### Recommended layout

- left: workflow list + palette
- center: visual flow canvas
- right: properties / rules / validations

### Action items

- separate flow design from rule configuration
- use guided templates instead of too much implicit auto-generation
- add validation summary before save
- reduce modal clutter
- keep the canvas readable and calm

---

## 3. Data and state refactor

## 3.1 Consolidate persistence logic
Create a single persistence layer for settings and local state:

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

### Action items

- replace repeated `localStorage` hydration logic
- avoid silent fallback data as the primary mode
- keep fallback as recovery only

---

## 3.2 Centralize permissions
The logic in [frontend/src/components/SideNav.tsx](frontend/src/components/SideNav.tsx) should move to a permission utility.

```ts
export function canAccessTab(user: User | null, tab: string, teams: Team[] = []) {
  if (!user) return false;
  // central role and capability checks
  return true;
}
```

### Action items

- remove role checks interleaved with rendering
- keep permission decisions in a single utility or hook
- simplify the navigation component

---

## 4. UX improvements

### 4.1 Action clarity
Use a clear action hierarchy:

- Save Draft
- Apply Changes
- Submit for Approval
- Reset

### 4.2 Status clarity
Show explicit project state:

- unsaved changes
- saved
- pending approval
- approved
- escalated

### 4.3 Better proposal feedback
Use toast or banner patterns rather than alert-based blocking.

### 4.4 Better density management
Use cards and grouped controls rather than long stacked forms in settings pages.

---

## 5. Recommended implementation order

### Phase 1: App shell and state cleanup

- consolidate persistence logic
- centralize permissions
- simplify sidebar navigation

### Phase 2: Settings modularization

- split settings into five main panels
- move advanced tools into secondary pages
- simplify governance area

### Phase 3: Team workspace decomposition

- split team work into tabs and components
- remove overloaded state from the main workspace component

### Phase 4: Workflow studio redesign

- split canvas, inspector, and rule panel
- add workflow validation summary
- reduce modal congestion

### Phase 5: UX polish and QA

- unsaved state messaging
- stronger action hierarchy
- better proposal review states
- visual consistency pass

---

## 6. Final design target

The final product should feel like this:

- simple navigation
- clear business grouping
- reduced screen overload
- dedicated governance flow
- advanced tools hidden behind secondary access
- calm, readable operational screens

The purpose of the refactor is not to remove power from the app. It is to make the app feel intentional, controlled, and easier to maintain.

---

## 7. One-line summary

The frontend should move from a dense operational control center into a structured product with clear domains, simpler navigation, better state separation, and dedicated advanced tooling.
