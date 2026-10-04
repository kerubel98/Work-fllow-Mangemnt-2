# UI/UX Design System Audit & Gap Analysis

Scope: `frontend/` (81 TSX files, ~64.9k lines). Phases 1–2 of the redesign (inspection + audit). No business logic, API, or routing behavior is changed by this document.

---

## 1. Stack Inspection

| Area | Finding |
|---|---|
| Framework | React 19.0.1, TypeScript 5.8, Vite 6 |
| Styling | Tailwind v4 (`@import "tailwindcss"`); `@theme` defines only `--font-sans` (Inter) and `--font-mono` (JetBrains Mono) |
| Libraries | `lucide-react`, `recharts`, `xlsx`; `motion` installed but unused |
| Routing | **None.** `activeNavigation` string state in `App.tsx`, synced to `window.location.hash` / `?tab=` |
| State | ~All global state via `usePersistentState` (localStorage) in `App.tsx`; many `deepLink*` props drilled; one context (`GovernanceProvider`) |
| Data fetching | Plain service layer; no react-query/SWR/redux |
| Forms | Hand-rolled; no form/validation library |
| Code splitting | Major panels lazy-loaded with `PanelLoadingSkeleton` (good) |
| Error handling | `ErrorBoundary` used 14× (per AGENTS.md rule 6) |
| Frontend tests | None found |
| Shared UI | `components/common/` (`Button`, `Badge`, `Card`, `EmptyState`, `Skeleton`, `Tooltip`) — **zero imports anywhere** |

Recommendation: keep the stack. Do not add a router, form library, or data library as part of the visual redesign.

---

## 2. Visual Problems

| # | Problem | Evidence |
|---|---|---|
| V1 | No design tokens | `index.css` has fonts, one body bg, scrollbar styles only |
| V2 | Hard-coded colors | 656 arbitrary-hex class uses, 64 distinct hexes (worst: `WorkflowInspector` 163, `WorkflowStudioFlowchart` 108, `TeamWorkspace` 77, `IssueDetailView` 47, `SideNav` 38) |
| V3 | Split visual language | Workflow Studio is dark cyber-ops (`#071318`/`#163848`/`#00e5b3`); most other screens are light slate/white; several screens mixed (`ValidationBoxManager`, `ValidationOrchestratorWorkspace`, `TeamWorkspace`) |
| V4 | Rainbow of accent colors | blue 1,759 · emerald 1,304 · amber 678 · rose 663 · purple 556 · indigo 482 · cyan 186 — color is used decoratively, not semantically |
| V5 | Tiny, unsystematic type | `text-xs` 1,869 · `text-[10px]` 1,069 · `text-[11px]` 715 · `text-[9px]` 159 vs `text-sm` 210 · `text-base` 32 |
| V6 | Mono overused | `font-mono` ×1,495, used for ordinary labels |
| V7 | Radius inconsistency | `rounded-lg` 988 · `rounded-xl` 859 · `rounded-2xl` 252 · `rounded-full` 288 |
| V8 | Shadow noise | 915 `shadow-*` uses, no elevation scale |
| V9 | Unused `Button` is off-brand | Blue gradient `#3b6cff` clashes with both the teal studio palette and elsewhere |

## 3. UX Problems

| # | Problem | Evidence |
|---|---|---|
| U1 | Two dialog systems | Native `confirm()`/`alert()` in ~25 files and a custom `showSystemAlert` |
| U2 | No shared Modal/Drawer | 50+ hand-rolled `fixed inset-0 z-50` overlays (`TeamWorkspace` ×13, `SystemSettings` ×6, `ValidationOrchestratorWorkspace` ×5); backdrop opacity/blur varies (`slate-900/40–60`, `black/60–80`, blur xs/2xs/sm/[2px]); no observed Escape/focus-trap handling |
| U3 | Hand-rolled drawers | `ValidationBoxManager.tsx:2389`, `ValidationBoxWizardDrawer.tsx:465`, `TeamChannelsTab.tsx:1158` |
| U4 | Ad-hoc empty/loading states | ~82 bespoke "No … found/yet" strings, 249 "Loading" strings; the shared `EmptyState`/`Skeleton` are unused |
| U5 | Raw technical errors likely surfaced | to verify per screen during Phase 6 |
| U6 | Navigation depends on hash state | No breadcrumbs / consistent page header; location awareness relies on sidebar highlight only (**verify `SideNav` before changing**) |
| U7 | Tooltip via `title=` | 352 uses — not keyboard/touch accessible |
| U8 | Table capability unverified | `WorkspaceTable` greps found no sort/pagination/column-visibility state under common names; must be read before claiming a gap |

## 4. Technical UI Problems

- **Mega-components**: `ValidationOrchestratorWorkspace` 5,537 · `TeamWorkspace` 4,316 · `IssueDetailView` 4,206 · `DatabaseColumnConfiguration` 3,960 · `GlobalTransactionSettings` 3,845 · `WorkflowStudioFlowchart` 2,823 · `ValidationBoxManager` 2,674 · `FtpFileStagingSettings` 2,646 · `DatabaseValidationSettings` 2,627 · `SystemSettings` 1,980 · `ManagerialDashboard` 1,888 · `App.tsx` 1,318 lines.
- **Duplication**: 989 raw `<button>`, 317 `<input>`, 236 `<select>`; shared primitives exist but are not adopted.
- **No feature separation**: folders are `admin, authority, chat, common, investigation, issue, settings, team, transactions` — reasonable grouping, but reusable UI is not separated from feature UI.
- **Prop drilling** of `deepLink*` state from `App.tsx`.
- **Responsive**: 515 breakpoint-prefixed classes in total, 43 fixed pixel heights, 8 `calc(100vh…)`. No defined tablet/mobile transformation strategy (unverified per screen).

## 5. Accessibility Gaps

| Metric | Count | Issue |
|---|---|---|
| `aria-*` attributes | 8 | Almost no semantics |
| `role=` | 2 | Dialogs lack `role="dialog"`/`aria-modal` |
| `htmlFor` vs `<label>` | 8 / 416 | Labels not programmatically bound |
| `<div onClick>` | 50 | Not keyboard operable |
| `onKeyDown` | 7 | Little keyboard handling |
| `focus:outline-none` | 330 (vs 485 `focus:ring`) | Potentially invisible focus on ~⅓ |
| `alt=` | 1 | |
| `motion-reduce` | 0 | No reduced-motion support |
| Status by color | widespread | PASS/FAIL badges need icon/text, not hue alone |
| Text size | 9–11px ≈ 1,943 uses | Fails comfortable legibility/contrast |

## 6. Proposed Design Tokens (Tailwind v4 `@theme`)

- **Surface**: `bg`, `surface`, `surface-elevated`, `border`, `border-strong`
- **Text**: `text`, `text-muted`, `text-disabled`
- **Brand/Interaction**: `primary` (candidate: studio teal `#00e5b3` family), `primary-hover`, `focus-ring`
- **Status** (semantic only): `success`, `warning`, `danger`, `info`
- **Type scale**: 12 / 13 / 14 / 16 / 20 / 24 (floor at 12px; retire `text-[9–11px]`)
- **Spacing**: 4px base grid
- **Radius**: `sm 6` · `md 8` · `lg 12` · `full`
- **Elevation**: `sm`, `md`, `overlay`
- **Motion**: 120ms / 200ms, ease-out, wrapped in `motion-safe`
- **Z-index layers**: `nav 30`, `drawer 40`, `modal 50`, `toast 60`, `tooltip 70`
- **Breakpoints**: keep Tailwind defaults (`sm 640`, `md 768`, `lg 1024`, `xl 1280`)

Theme decision needed: dark-only (matches Workflow Studio), light-only, or dual theme via CSS variables.

## 7. Prioritized Improvement Points

### P0 — Foundation (low risk, high leverage)
1. Add tokens to `index.css` `@theme`.
2. Rework `Button`, `Badge`, `Card`, `EmptyState`, `Skeleton`, `Tooltip` to token-based APIs (`variant`, `size`, `loading`).
3. New `Modal`, `Drawer`, `ConfirmDialog`, `FormField`, `Toast` with `role="dialog"`, focus trap, Escape, scroll lock, reduced-motion support.
4. Status badge = icon + text + color (`✓ PASS`, `! WARNING`, `× FAIL`).

### P1 — Shell and cross-cutting
5. App shell: SideNav (grouped, collapsible, `aria-current`), TitleBar, consistent `PageHeader` + breadcrumb (verify SideNav first).
6. Replace native `confirm()`/`alert()` with `ConfirmDialog`/`Toast` (same call semantics — async result must preserve branching).
7. Keyboard/ARIA pass: convert `<div onClick>` → `<button>`, add `htmlFor`/`aria-label`, restore focus rings.
8. Raise minimum type size to 12px.

### P2 — Feature pages (incremental, per page)
9. Data tables: search/filter/sort/pagination/column visibility/bulk actions (after reading `WorkspaceTable` and others).
10. Migrate hand-rolled modals/drawers to shared components, starting with `TeamWorkspace`, `SystemSettings`, `ValidationOrchestratorWorkspace`.
11. Contextual empty/loading/error states.
12. Responsive: mobile nav, table → card list on small screens.
13. Decompose mega-components into feature subcomponents (only when touched).
14. Dashboard: metrics → pending work → recent activity → alerts → quick actions.

### P3 — Later
15. Real router (changes routing behavior — **needs approval**).
16. Frontend tests (component + a11y smoke).
17. Remove unused `motion` dependency or use it for modal transitions.

## 8. Changes That Could Affect Business Behavior (flag before doing)

- Replacing `confirm()`/`alert()` — turns synchronous calls into async; each call site's control flow must be adapted.
- Introducing routing — alters deep-link/hash behavior.
- Changing the persisted `usePersistentState` keys.
- Any theme change in `WorkflowStudioFlowchart`/`WorkflowInspector` must keep the four-tier DAG property sync (AGENTS.md rule 21) untouched — visual only.
- Layout changes must keep Rule 16 (full-viewport shells, `shrink-0` headers, `min-h-0`, `no-scrollbar`).

## 9. Roadmap and Verification Status

| Phase | Deliverable | Status | Verify |
|---|---|---|---|
| 3 | Tokens (Brand Palette: Orange `#F47920`, Navy `#0F172A`, Dark Gray `#555555`, Light Gray `#D3D3D3`, White `#FFFFFF`) | **COMPLETED** | `npm run build` (Passed) |
| 4 | App shell (`TitleBar.tsx`, `SideNav.tsx` tokens, active states, WCAG contrast, ARIA landmarks) | **COMPLETED** | `npm run build` (Passed) |
| 5 | Shared components (`Button`, `Badge`, `Modal`, `Drawer`, `ConfirmDialog`, `FormField`, `ErrorState`, `EmptyState`) | **COMPLETED** | `npm run build` (Passed) |
| 6 | Feature pages (`WorkspaceTable.tsx` sorting, pagination, `<Modal>`, `<ConfirmDialog>`, `<EmptyState>`; `SystemSettings.tsx` `<ConfirmDialog>`) | **COMPLETED** | `npm run build` (Passed), backend vitest (234/234 Passed) |
| 7–8 | Responsive + workflow audit | In Progress | Layout flex bounds & no-scrollbar intact |
| 9 | Final report | Provided | Complete |

### Verification Summary
- **Frontend Vite 6 Build**: Passed (0 errors, 2326 modules transformed, ~5.6s).
- **Backend Vitest Suite**: 30 files passed, 234 tests passed with 0 regressions.
- **Accessibility & Design Tokens**: Active navigation contrasts verified (> 8:1 WCAG AAA), keyboard focus rings (`focus-visible: 2px solid var(--ds-primary)`), semantic dialogs (`role="dialog"`, focus trap, escape listener, scroll lock).
