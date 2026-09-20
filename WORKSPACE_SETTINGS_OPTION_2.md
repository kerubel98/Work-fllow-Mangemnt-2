# Workspace Settings Redesign — Option 2

## Scope

This is the second option for redesigning the workspace settings experience based on the current implementation in [frontend/src/components/WorkspaceSettings.tsx](frontend/src/components/WorkspaceSettings.tsx).

This option keeps the system powerful, but reduces clutter by switching from a large multi-tab control panel to a cleaner power-user structure.

---

## Design goal

Keep advanced configuration available, but hide complexity behind a clearer structure:

- simple top-level navigation
- strong grouping by business purpose
- separate governance from everyday settings
- preserve advanced tools like workflow studio and validation box configuration as dedicated pages

---

## Recommended structure

### Primary navigation tabs

Use only these top-level sections:

1. General
2. Workflow
3. Governance
4. Notifications
5. Data

### Advanced pages kept as dedicated screens

These should no longer sit inline inside the main settingsworkspace:

- DB Config
- Validation Box
- Workflow Studio
- Setting Approvals

Instead, treat them as secondary full-page modules accessible from the Governance or Workflow area.

---

## Why this is better

### 1. Lower visual noise
The current settings page mixes:

- local config changes
- approval workflow review
- technical schema tooling
- advanced workflow builders

That creates a control-panel feel. A reduced tab system makes the page feel calmer and more intentional.

### 2. Better role clarity
This split matches user intent:

- General: everyday configuration
- Workflow: operational rules and SLA policies
- Governance: approvals, escalation, policy review
- Notifications: alerts and user communication
- Data: page size, export, masking

### 3. Keeps power-user tools
The advanced tools are preserved, but they are no longer competing with the main settings experience for attention.

---

## Proposed layout

### A. Left sidebar navigation

Use a slim sidebar with these items:

- General
- Workflow
- Governance
- Notifications
- Data

Optional section for advanced tools:

- Validation Box
- Workflow Studio
- DB Config

These can be accessed as secondary links or as a sub-menu under Governance / Configuration.

### B. Main content area

Use tiled cards rather than giant stacked forms.

Example card grouping:

#### General
- Workspace name
- Environment
- Default landing view

#### Workflow
- Auto-assign incoming cases
- Require hashtag for resolution
- Require sandbox simulation
- Auto reconcile on script execution
- SLA targets

#### Governance
- Pending setting approvals
- Approval history
- Escalation matrix
- Maker-checker enforcement status

#### Notifications
- Toast banners
- Sound chimes
- SLA breach warnings

#### Data
- Records per page
- Default export format
- Card masking

---

## Specific changes to make

### Remove from the main screen

- Current large tab list with too many categories
- Dense approval section inline with all controls
- Mixed advanced tools on the same screen as basic settings
- Repetition between general settings and approval actions

### Keep but move

- DB Config
- Validation Box
- Workflow Studio
- Setting Approvals

These become dedicated pages or in-depth subviews, not the main tabs.

---

## Suggested interface behavior

### Header

The page header should include:

- Workspace Settings title
- current environment badge
- Save button
- Submit for Approval button
- Reset Defaults button

### Action model

Use three clear action states:

1. Save Draft
2. Apply Changes
3. Submit for Approval

This makes the difference between local config and formal governance much easier to understand.

---

## Governance section design

The Governance section should be compact and readable:

- Pending proposals
- Approved proposals
- Rejected proposals
- Escalated proposals
- Filters by status

Each proposal card should contain:

- title
- type
- maker
- justification
- status
- review notes
- approve / reject actions

Escalation should be a secondary button, not a constant visual block.

---

## Advanced tools placement

### DB Config
Move to:

- Settings > Configuration > DB Config

### Validation Box
Move to:

- Settings > Configuration > Validation Box

### Workflow Studio
Move to:

- Settings > Workflow > Workflow Studio

This prevents the page from looking like a full technical console when a user is just changing workspace preferences.

---

## Recommended final UI

### Main workspace settings page

- General
- Workflow
- Governance
- Notifications
- Data

### Secondary drill-in pages

- DB Config
- Validation Box
- Workflow Studio
- Approvals / Escalation

---

## Recommended priority order

1. Reduce the tab set to the five main categories.
2. Move advanced tooling into dedicated pages.
3. Convert long stacked settings into cards.
4. Simplify governance review into a compact proposal list.
5. Rework the action bar so Save / Approve / Escalate are clearly separated.

---

## Final recommendation

This option keeps the app powerful while making it much more readable. It is the best fit for the current implementation because it preserves advanced configuration without letting the workspace settings screen become oversized and visually crowded.

The screen becomes:

- cleaner
- easier to scan
- more business-focused
- still powerful for advanced users

This is the strongest version of the redesign for the current product direction.
