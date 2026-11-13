# Frontend Design & Implementation Audit
## Physical Code Review of the IssueTrace / BO Operational Workflow Frontend

| Field | Value |
|---|---|
| **Document ID** | `FRONTEND_DESIGN_IMPLEMENTATION_AUDIT_2026-11-12` |
| **Audit date** | 2026-11-12 |
| **Scope** | `frontend/` (all 158 `.ts` / `.tsx` files, 108,971 lines), plus the backend contracts the frontend depends on |
| **Audit type** | Zero-assumption physical code audit (repository reality, not documentation claims) |
| **Governing rules** | [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) Rules 1-23, [`bo-operational-governance`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md) |
| **Verdict** | **NOT READY FOR CERTIFICATION.** 38 findings: 4 Critical, 12 High, 15 Medium, 7 Low. `npm run lint` fails with 41 errors. |
| **Change impact** | Documentation only. No application code, schema, or data modified by this audit. |

---

## 1. Executive Summary

The frontend is a functionally broad React 19 + TypeScript + Tailwind 4 SPA (135 components) that successfully produces a production bundle, but it **does not pass its own type gate**, **does not authenticate against the backend it ships with**, **stores business entities in `localStorage` as a system of record**, and **derives validation verdicts in the browser** rather than reflecting the pipeline engine's results.

Four findings are release-blocking:

1. **The login screen never authenticates** (`api.login` is never called; the password field is unused; users can self-register as `admin`).
2. **`localStorage` is the de-facto primary datastore** for 15 business entities plus the session object (16 keys), enabling role tampering and cross-user data bleed.
3. **Stored XSS** through unsanitized inbound email HTML (`dangerouslySetInnerHTML`, no sanitizer dependency).
4. **The investigation workspace fabricates `PASS` verdicts** for rows that were never evaluated, violating the mandatory separation of "what the rule found" from "what the UI displays".

In addition, the design system that exists in [`components/common`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/common) (Modal, Drawer, Button, Card, Badge, Tooltip, Skeleton, Feedback) is **effectively unused**: 1,646 raw `<button>` elements against 2 imports of the shared `Button`, and 120 hand-rolled overlay implementations of which only 6 have `role="dialog"` or an Escape handler. The documented EthioPay brand tokens are also largely bypassed (93 `ds-*` utility usages vs 979 hardcoded hex values and 12,300 `slate-*` usages).

### 1.1 Reality check against prior certifications

Several previously accepted documents in this repository assert states that the current physical code does not satisfy. Under Governance Rule 22 (anti-premature certification) these discrepancies must be recorded, not smoothed over:

| Prior claim | Physical evidence | Status |
|---|---|---|
| "0 frontend lint errors (`tsc --noEmit`)" and "0 TypeScript/ESBuild errors" ([`INDEPENDENT_PHYSICAL_CODE_REAUDIT_2026.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/INDEPENDENT_PHYSICAL_CODE_REAUDIT_2026.md), [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md#L308)) | `npm run lint` = `tsc --noEmit` exits 1 with **41 errors in 11 files** | **Contradicted** |
| "Rule 23 localStorage zero-breach certified" ([`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md#L264)) | `App.tsx` persists **16 business entities** and the session object through `usePersistentState`; `globalMappingService` persists mapping dictionaries | **Contradicted** |
| "All complex workspace views are wrapped in `<ErrorBoundary>`" (Rule 6) | `PersonalChat`, `DbQueryTool`, `ManagerialDashboard`, `AdminPanel`, `PeopleAccessView` are mounted without a boundary | **Partial** |
| "Rule 16 flexbox containment, no viewport subtractions" | `WorkspaceSettings.tsx` and `LoginScreen.tsx` use `calc(100vh - ...)` inner panes | **Partial** |

> **Note on `html { zoom: 0.8; }`**: this is an *explicitly approved* architectural decision recorded in [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md#L300). It is therefore not treated as a rogue change here, but its compounding effect with 8-10px type is raised as an accessibility risk in **FE-11**.

---

## 2. Methodology

### 2.1 Evidence hierarchy applied

Per Governance Rule 1, the repository was treated as the only source of truth. Documentation was read only to detect drift; no claim in this audit relies on a document.

### 2.2 Verification performed

| # | Check | Command / method | Result |
|---|---|---|---|
| 1 | Type gate | `cd frontend; npm run lint` (`tsc --noEmit`) | **FAIL**, 41 errors |
| 2 | Production build | `cd frontend; npm run build` | PASS, 19.04s (esbuild transpiles without type checking) |
| 3 | Test inventory | file scan for `*.test.ts(x)`; `package.json` scripts | 4 test files, **no runner config, no `test` script** |
| 4 | Auth contract | trace `LoginScreen` -> `App.handleLoginSuccess` -> `api.login` | `api.login` **never called** |
| 5 | Backend auth | [`backend/src/middleware/auth.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/middleware/auth.ts), route mounts in `server.ts` | `requireAuth` exists but core routers use it **0 times** |
| 6 | Persistence | grep `localStorage.` across `src` | 16 keys (15 business entities + session) + 4 config keys |
| 7 | Design-system adoption | regex count of raw `<button>` vs common imports | 1,646 vs 2 |
| 8 | Overlay/accessibility | count `fixed inset-0`, `role="dialog"`, `'Escape'`, `htmlFor`, `aria-*` | 120 / 6 / 6 / 14 / 83 |
| 9 | Token adoption | count `ds-*` utilities vs hardcoded hex and palette families | 93 vs 979 hex; 12,300 slate |
| 10 | Dead code | cross-reference every component filename against all imports | 15 orphaned components |
| 11 | Error handling | count empty / console-only / silent `.catch` blocks | 12 / 126 / 16 |
| 12 | Bundle | `vite build` chunk table | IssueDetailView 521KB, TeamWorkspace 351KB |
| 13 | API drift | cross-check `api/client.ts` methods against call sites | 2 missing methods called; stale response types |

### 2.3 Out of scope

- Runtime visual regression (no browser harness was executed for this audit).
- Backend business logic correctness (only the frontend-facing auth/persistence contracts were inspected).
- The two files with uncommitted local modifications (`StandardFileIngestionWorkspace.tsx`, `WorkspaceTaskCreator.tsx`) are included in the analysis but their local diffs are not characterized as defects.

---

## 3. Metrics Dashboard

| Metric | Value |
|---|---|
| TypeScript/TSX files | 158 |
| Total lines | 108,971 |
| React components (`.tsx`) | 135 |
| Files > 1,000 lines | 31 |
| Largest file | `ValidationOrchestratorWorkspace.tsx` — 8,416 lines |
| `tsc --noEmit` errors | **41** (11 files) |
| Explicit `any` usages | ~1,030 |
| `console.*` statements | 249 |
| `@types/react` / `@types/react-dom` installed | **No** |
| `tsconfig` `strict` | **Not enabled** |
| Raw `<button>` vs shared `Button` import | 1,646 vs 2 |
| Hand-rolled overlays vs `role="dialog"` | 120 vs 6 |
| `<input>` vs `<label htmlFor>` | 470 vs 14 |
| Tiny type (`8/9/10px`) vs `text-sm` | 1,529 vs 320 |
| Hardcoded hex colors | 979 |
| Off-brand `indigo`/`purple`/`violet` utilities | 1,336 |
| Orphaned component files | 15 (~700 KB source) |
| Frontend test files | 4 (no runner, not runnable via npm) |
| Initial CSS payload | 214 KB (28 KB gzip) |
| Largest JS chunks | IssueDetailView 521 KB, vendor-xlsx 430 KB, TeamWorkspace 351 KB, vendor-charts 322 KB |

---

## 4. Findings Register

Severity: **C** = Critical (security / data integrity / release blocker), **H** = High, **M** = Medium, **L** = Low.

### 4.1 Critical

#### FE-01 — The login screen never authenticates; RBAC in the UI is cosmetic
- **Severity:** Critical
- **Evidence:**
  - [`LoginScreen.tsx:20`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/LoginScreen.tsx#L20) — password held in state but never read.
  - [`LoginScreen.tsx:44-80`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/LoginScreen.tsx#L44-L80) — submit matches by username only; **auto-creates a user when the username is unknown** and signs in.
  - [`LoginScreen.tsx:34-42`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/LoginScreen.tsx#L34-L42) — "quick login" signs in as any listed profile.
  - [`LoginScreen.tsx:322-329`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/LoginScreen.tsx#L322-L329) — self-registration allows choosing **System Administrator**.
  - [`App.tsx:814-817`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L814-L817) — success handler simply stores the client-supplied object.
  - `api.login()` exists and issues a JWT ([`client.ts:86-95`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/api/client.ts#L86-L95)) but **is never invoked anywhere in the UI** (`grep "api.login("` -> 0 hits).
  - `api.logout()` is never invoked either ([`App.tsx:819-822`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L819-L822)); the persisted token is never cleared.
- **Impact:** No JWT is ever issued to the running SPA, so `Authorization: Bearer` is never sent. `GET /api/auth/me` therefore always returns 401 (masked by `Promise.allSettled`), and the app silently falls back to the cached `it_session` object. Because the backend's primary routers (`issues`, `teams`, `workflows`, `database`, `sandbox`) register **zero** auth middleware, everything still "works" — meaning the observed system is authenticated by accident, not by design.
- **Remediation:** Wire `LoginScreen` to `api.login(username, password)`; delete the auto-create and quick-login paths (or gate them behind an explicit `VITE_DEV_AUTH` flag); remove the privileged option from self-registration; call `api.logout()` and clear persisted entities on logout; then enforce `requireAuth` + `requireRole` on all non-public routers.

#### FE-02 — `localStorage` is the primary system of record for business entities and the session (Rule 23 breach)
- **Severity:** Critical
- **Evidence:** [`App.tsx:76-110`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L76-L110) persists: `it_users`, `it_session`, `it_issues`, `it_hashtags`, `it_plugins`, `it_databases`, `it_systems`, `it_teams`, `it_team_tasks`, `it_team_insights`, `it_team_messages`, `it_notifications`, `it_direct_messages`, `it_query_approvals`, `it_db_access_requests`, `it_connection_usage_logs`. Also [`globalMappingService.ts:121-588`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/services/globalMappingService.ts#L121-L588) (mapping dictionary + central table), [`SystemSettings.tsx:167-394`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/SystemSettings.tsx#L167-L394) (`system_transformation_rules`), [`WorkspaceSettings.tsx:84-162`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/WorkspaceSettings.tsx#L84-L162) (`operational_workspace_config_v1`).
- **Impact:**
  - `it_session` stores the full user object including `role` and `isApproved`; editing it in DevTools grants admin UI immediately ([`App.tsx:1092-1119`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L1092-L1119) trusts `currentUser.role`).
  - Logout sets `it_session` to `null` but leaves the other 15 business keys intact, so the next operator on a shared workstation inherits the previous operator's cached cases, notifications, and direct messages whenever a hydration call fails (the `length > 0` guards in FE-15 make this likely).
  - Mapping dictionaries and transformation rules — explicitly named in Rule 23 — live only in the browser.
- **Remediation:** Move every entity in the list to PostgreSQL reads/writes through `api/client.ts`; keep `localStorage` only for device-local UI ergonomics (sidebar, rail). Replace `usePersistentState` for business data with a server-backed query layer (or at minimum a strictly non-authoritative cache that is cleared on logout and never read for authorization).

#### FE-03 — Stored XSS via unsanitized inbound email HTML
- **Severity:** Critical
- **Evidence:** [`PersonalChat.tsx:1697-1702`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/PersonalChat.tsx#L1697-L1702) renders `msg.html_body` with `dangerouslySetInnerHTML`. No sanitizer is present: `dompurify`/`sanitize-html` are absent from `frontend/package.json`, and this is the only `dangerouslySetInnerHTML` in the codebase.
- **Impact:** Email bodies are attacker-controlled (external inbound mail is a first-class ingestion channel in this product). A crafted message executes script in the operator console with access to the persisted JWT and the full data set.
- **Remediation:** Sanitize with DOMPurify before rendering, or render `text_body` only and offer "view raw HTML" behind an explicit, sandboxed action. Add a CSP that forbids inline script.

#### FE-04 — The investigation workspace fabricates validation verdicts
- **Severity:** Critical (data integrity)
- **Evidence:** [`ValidationOrchestratorWorkspace.tsx:3028-3071`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx#L3028-L3071):
  - When a row has no server results (`!hasAnyResults`) and `_validation_status === 'PASS'`, every step is emitted as `status: 'PASS'`, `detail: 'Verified in conducted workflow'`.
  - When the target record is missing, non-first steps are emitted as `status: 'PASS'`, `detail: 'Condition satisfied'` (lines 3039-3046) purely because `idx !== 0`.
  - [`3101`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx#L3101): `let sStatus: 'PASS' | 'FAIL' | 'PENDING' = 'PASS'` — the default for an unevaluated step is PASS.
- **Impact:** Direct violation of Governance Rule 2 / skill §3.1 (validation result is produced by the engine, never by the renderer). An operator can see "All Checks Passed" for a transaction that no rule ever evaluated, and proceed to close or reconcile it. This is the highest-consequence defect in the frontend.
- **Remediation:** Make the renderer a pure projection of engine output. Unknown/unreported steps must render `NOT_EVALUATED` / `PENDING`. Delete the `idx === 0` heuristics and the `_validation_status` shortcut; if the server has no verdict, show "Not evaluated" and disable close/reconcile actions.

### 4.2 High

#### FE-05 — The type gate fails: 41 TypeScript errors
- **Severity:** High
- **Evidence:** `npm run lint` -> 41 errors. Distribution: `HashtagFileUploadModal` 8, `EscalationRoomView` 7, `MessageChatActions` 5, `StandardFileIngestionWorkspace` 4, `App.tsx` 4, `CaseDiscussionDrawer` 3, `WorkspaceSettings` 3, `ResourceDetailView` 3, `Step1Connect` 2, `DataSetupWizardModal` 1, `TeamOrgStructureTab` 1.
- **Impact:** Real defects are hidden behind the failing gate (see FE-07, FE-27, FE-29). `vite build` succeeds only because esbuild strips types without checking them, which is exactly why the prior "clean build = certified" conclusion was unsound.
- **Remediation:** Fix the 41 errors, then make `lint` a required pre-build step (`npm run build` should depend on `tsc --noEmit`).

#### FE-06 — React typings are absent and TypeScript is non-strict, so JSX is untyped
- **Severity:** High
- **Evidence:** `@types/react` and `@types/react-dom` are **not installed** (root `node_modules/@types` contains no `react`); they are absent from [`frontend/package.json`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/package.json). [`tsconfig.json`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/tsconfig.json) sets no `strict`, `noImplicitAny`, `noUnusedLocals`, or `noUncheckedIndexedAccess`.
- **Impact:** Under non-strict mode, an unresolved module import degrades to `any`, so every component's props are unchecked. `tsc --noEmit --strict` produces ~38,700 diagnostics, almost all rooted in the missing React declarations (`TS7016`/`TS7026`) — i.e. the codebase cannot currently adopt strict mode. This also explains the defensive hack `class ErrorBoundary extends (React.Component as any)` in [`ErrorBoundary.tsx:20`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/ErrorBoundary.tsx#L20).
- **Remediation:** Add `@types/react@19` + `@types/react-dom@19`; enable `strict` incrementally per directory; restore a properly typed `ErrorBoundary extends React.Component<Props, State>`.

#### FE-07 — Two user-facing buttons call API methods that do not exist
- **Severity:** High
- **Evidence:**
  - [`ResourceDetailView.tsx:331`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/datasetup/ResourceDetailView.tsx#L331) — `api.inspectFtpStructure(...)`; the real method is `inspectFtpFileStructure` ([`client.ts:319`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/api/client.ts#L319)).
  - [`ResourceDetailView.tsx:441`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/datasetup/ResourceDetailView.tsx#L441) — `api.triggerFtpScheduledIngestion({...})`; the real method is `runScheduledFtpStaging` ([`client.ts:393`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/api/client.ts#L393)).
- **Impact:** `api.x` is `undefined`, so invocation throws `TypeError` **before** `.catch()` can attach. The "inspect structure" fallback is dead, and the "Trigger Ingestion" button can never succeed — yet the success notice is written immediately after the failing call in the same block, so the UI can claim a job was queued.
- **Remediation:** Correct the method names; remove `.catch(() => {})` around calls whose failure must be surfaced; add a typed API surface so a non-existent method is a compile error (this is exactly what FE-06 prevents).

#### FE-08 — The shared design system is bypassed
- **Severity:** High (consistency, accessibility, maintainability)
- **Evidence:**
  - 1,646 raw `<button>` elements; `Button` imported from `components/common` in **2** files.
  - 120 instances of `fixed inset-0` (hand-rolled overlays) vs **6** `role="dialog"` and **6** Escape handlers.
  - `Drawer`, `Tooltip`, `Card`, `Skeleton`, `Feedback` have **0** consumers; `Modal` 2; `EmptyState` 1; `Badge` 2; `DataTablePagination` 7.
  - The shared [`Overlay.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/common/Overlay.tsx) is correct and well-built (focus trap, Escape, body scroll lock, focus restore, `aria-modal`, `aria-labelledby`) — and is not used for the 120 overlays that need it.
- **Impact:** Most modals lack focus trapping, Escape handling, scroll locking, and dialog semantics; keyboard users can tab into the page behind the overlay. Button styling is re-implemented 1,646 times, so variants drift (see FE-09).
- **Remediation:** Adopt `Modal`/`Drawer` for every overlay; codify one `Button` variant set; add an ESLint rule or review checklist that forbids new `fixed inset-0` overlays outside `common/Overlay.tsx`.

#### FE-09 — Brand and theme tokens are defined but not implemented
- **Severity:** High (design implementation gap)
- **Evidence:** [`index.css:15-87`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/index.css#L15-L87) defines the EthioPay palette and the `ds-*` utility bridge. Actual usage:
  - `ds-*` utilities: **93** occurrences total (`bg-ds-` 18, `text-ds-` 44, `border-ds-` 17, `rounded-ds-` 10, `shadow-ds-` 4).
  - Hardcoded hex values inside TSX: **979**.
  - Palette families: `slate` 12,300; `blue` 1,776; `emerald` 1,772; `rose` 1,106; `amber` 872; `indigo` 779; `purple` 555; **brand `orange` only 418**.
  - Radius is a coin flip: `rounded-lg` 1,398 vs `rounded-xl` 1,394 vs `rounded-2xl` 450.
  - The `[data-theme="dark"]` block is dead: **0** theme setters, **1** `dark:` variant in the entire codebase.
- **Impact:** The shipped UI does not express the documented EthioPay Orange/Navy identity; it reads as blue/indigo/slate. Dark mode is advertised in CSS and cannot be activated. Any future token change requires touching hundreds of files.
- **Remediation:** Declare `ds-*` the only permissible color/radius source; add a lint rule or review gate for hex literals and `indigo|purple|violet`; either implement the theme switch or delete the dark token block.

#### FE-10 — Complex views are mounted without an ErrorBoundary (Rule 6)
- **Severity:** High
- **Evidence:** [`App.tsx:1279-1292`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L1279-L1292) (`PersonalChat`, 127 KB), [`1294-1304`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L1294-L1304) (`DbQueryTool`), [`1306-1319`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L1306-L1319) (`ManagerialDashboard`, 102 KB), [`1321-1348`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L1321-L1348) (`AdminPanel`), [`1350-1363`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L1350-L1363) (`PeopleAccessView`) are rendered as direct `Suspense` children.
- **Impact:** A malformed payload in any of these views unmounts the entire application shell (the top-level boundary in `main.tsx` takes over), which is the exact failure mode Rule 6 exists to prevent.
- **Remediation:** Wrap all five routes in `<ErrorBoundary fallbackTitle="...">`; add a route-level boundary wrapper component so new routes cannot forget it.

#### FE-11 — Text is rendered at 6.4-8.8px effective size
- **Severity:** High (accessibility)
- **Evidence:** `text-[8px]` 16, `text-[9px]` 164, `text-[10px]` 1,349, `text-[11px]` 1,342, versus `text-sm` only 320. Combined with the approved `html { zoom: 0.8; }` ([`index.css:89-93`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/index.css#L89-L93)), a 10px label renders at ~8px and a 9px badge at ~7.2px.
- **Impact:** Fails WCAG 2.2 minimum comfortable body text for an operations console used for hours-long data review; users with low vision or high-DPI displays will zoom the browser, which then breaks the fixed-height flex shells.
- **Remediation:** Establish a 12/13/14px minimum type scale; reserve 10-11px for non-essential metadata only. Re-evaluate the global `zoom` in favour of a responsive density token (`--ds-density`) so scaling is decoupled from layout.

#### FE-12 — Accessibility coverage is largely absent
- **Severity:** High
- **Evidence:** 470 `<input>` vs 14 `<label htmlFor>`; 83 `aria-*` attributes and 29 `role=` attributes across 135 components; 246 `<button>` tags without `type` inside 50 `<form>` elements (implicit submit risk); of 47 icon-only buttons, 14 lack `title`/`aria-label`; 122 `<table>` vs 82 `<thead>`.
- **Impact:** Screen-reader and keyboard users cannot reliably identify fields, controls, or tables; the implicit-submit buttons can trigger unintended form submissions inside dialogs.
- **Remediation:** Label every input; add `type="button"` to all non-submit buttons; add `aria-label` to icon buttons; give every data table `<thead>`/`scope`; add a keyboard-navigation smoke test.

#### FE-13 — Fabricated operational data is presented as live state
- **Severity:** High (trust)
- **Evidence:**
  - [`SideNav.tsx:57-61`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/SideNav.tsx#L57-L61) defaults: `openIssuesCount = 237`, `intakeCount = 60`, `automationsCount = 7`, `onlineDatabasesCount = 3`, `totalDatabasesCount = 4`.
  - [`App.tsx:1161-1165`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L1161-L1165) reinforces them with `|| 237`, `intakeCount={60}`, `|| 7`, `|| 3`, `|| 4` — so a system with **zero** open cases displays **237**.
  - [`SideNav.tsx:376`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/SideNav.tsx#L376) hardcodes a `2` badge fallback on Authority Center.
  - [`TopBar.tsx:179-184`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/TopBar.tsx#L179-L184) renders a permanent pulsing green "Production" pill, fed by a literal `environmentName="Production"` ([`App.tsx:1192`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L1192)).
- **Impact:** Operators and managers cannot distinguish real workload from decoration; the health pill reports green regardless of database or environment state, which contradicts the health/observability intent of the dock.
- **Remediation:** Delete every numeric fallback; render `0`; make the environment pill derive from a real health endpoint and show degraded/offline states.

#### FE-14 — Universal search does nothing
- **Severity:** High (user-facing)
- **Evidence:** [`TopBar.tsx:48`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/TopBar.tsx#L48) holds `searchQuery`; [`TopBar.tsx:160-167`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/TopBar.tsx#L160-L167) binds it; it is never read for filtering, navigation, or an API query. `Ctrl+K` ([`53-66`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/TopBar.tsx#L53-L66)) only focuses this inert input.
- **Impact:** The most prominent control in the shell is a no-op; the documented "Search cases, tasks, #automations" capability does not exist.
- **Remediation:** Implement the search (debounced cross-entity query) or remove the input and the advertised shortcut.

#### FE-15 — Hydration cannot delete data, and stage-2 hydration outlives the component
- **Severity:** High (data integrity)
- **Evidence:** [`App.tsx:233-315`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L233-L315) — every stage-2 assignment is guarded by `Array.isArray(v) && v.length > 0`. A successful server response of `[]` is therefore ignored for: `users`, `systems`, `teams`, `hashtags`, `teamTasks`, `teamInsights`, `teamMessages`, `directMessages`, `notifications`, `queryApprovals`, `dbAccessRequests`, `connectionUsageLogs`, and `plugins`. (`issues` and `databases` are correctly authoritative, without the length guard.)
- **Secondary:** the `setTimeout(..., 150)` at [`257`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L257) is never cleared; `isMounted` is checked before the fetch batch but not before each `setState`.
- **Impact:** Deletions never propagate to a client that has a non-empty cache; users see and can act on records that no longer exist. Combined with FE-02 this is the mechanism by which stale cross-user data resurfaces.
- **Remediation:** Treat a fulfilled response as authoritative regardless of emptiness; store the timeout id and clear it in the effect cleanup; abort in-flight requests with `AbortController`.

#### FE-16 — Settings "Apply" bypasses Maker-Checker and reports success on failure
- **Severity:** High (governance)
- **Evidence:** [`WorkspaceSettings.tsx:158-192`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/WorkspaceSettings.tsx#L158-L192): step 1 writes the new configuration to `localStorage` *before* the proposal is submitted; the `catch` branch sets a **success** banner ("Workspace configuration saved locally (offline buffer active)") when proposal submission throws.
- **Impact:** An unapproved configuration is applied to the active session, violating the four-eyes principle; and a failed governance submission is presented to the user as success, so the change is believed to be recorded when it is not.
- **Remediation:** Submit first, apply only on approval; render the failure as an error with retry; keep drafts explicitly labelled as drafts and never active.

### 4.3 Medium

#### FE-17 — Hand-rolled routing: no URL synchronisation, no fallback route
- **Evidence:** `location.hash =` assignments: **0**; `history.pushState`: **0**. `activeNavigation` is initialised from the hash once ([`App.tsx:126-147`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L126-L147)) but navigation never writes the hash, so URLs are not shareable and Back/Forward do not work. If the hash contains an unknown tab, [`App.tsx:1205-1590`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L1205-L1590) renders an empty `<main>` while `TopBar` falls back to a misleading "Operations / Workspace" breadcrumb.
- **Remediation:** Adopt a router (or at minimum bidirectional hash sync) and add an explicit `NotFound` view.

#### FE-18 — Deep-link state is never reset
- **Evidence:** `deepLinkIssueId` / `deepLinkTeamId` / `deepLinkTaskId` ([`App.tsx:92-96`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L92-L96)) are set but never cleared. Navigating to another case and back re-opens the previous record.
- **Remediation:** Clear the deep-link after consumption, or drive selection from the URL.

#### FE-19 — Notification toast lifecycle is incorrect
- **Evidence:** [`NotificationToastsAndBanner.tsx:67-72`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/notifications/NotificationToastsAndBanner.tsx#L67-L72) runs a single 6-second interval that removes **all** auto-hide toasts regardless of how long each has existed (a toast can vanish after 0.1s or 5.9s). [`79-81`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/notifications/NotificationToastsAndBanner.tsx#L79-L81): once `bannerDismissed` is true it never resets, so **all future critical banners are suppressed for the rest of the session**.
- **Remediation:** Per-toast timers; reset `bannerDismissed` when the active critical notification id changes.

#### FE-20 — Raw `fetch()` bypasses the API client (auth + error normalisation)
- **Evidence:** 13 raw `fetch(` calls; 10 in [`TeamWorkspace.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/TeamWorkspace.tsx#L889) (relationships, hierarchy, CRUD), plus `PersonalChat.tsx:1471` and `IssueResolutionPanel.tsx:104`.
- **Impact:** No `Authorization` header, no envelope normalisation, no shared error handling; failures degrade to `console.warn` and empty panels.
- **Remediation:** Move all calls into `api/client.ts`; forbid direct `fetch` outside that module.

#### FE-21 — No 401/403 handling in the API client
- **Evidence:** [`client.ts:76-81`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/api/client.ts#L76-L81) throws on non-2xx and stops there; no auth interceptor, no re-auth, no global toast.
- **Impact:** Expired or missing tokens produce silent empty screens instead of a login redirect — which is precisely how FE-01 stays invisible.
- **Remediation:** Centralise 401 -> clear session + redirect; 403 -> permission toast.

#### FE-22 — Errors are systematically swallowed
- **Evidence:** 126 `catch` blocks whose only statement is `console.*`; 12 completely empty `catch {}`; 16 `.catch(() => {})`.
- **Impact:** Silent partial failures across ingestion, FTP, settings, and chat. Users cannot tell "no data" from "request failed".
- **Remediation:** Route failures into the existing `Feedback` component; reserve silent catches for genuinely optional telemetry.

#### FE-23 — 15 orphaned component files (~700 KB of source)
- **Evidence (no references from any other file):** `settings/DatabaseValidationSettings.tsx` (136 KB), `investigation/DatabaseCrossVerificationPanel.tsx` (60 KB), `WorkspaceTable.tsx` (56 KB), `settings/validation/ValidationBoxHub.tsx`, `UserAdminPanel.tsx`, `settings/WorkspaceGovernanceTab.tsx`, `issue/IssueResolutionPanel.tsx`, `issue/IssueChatPanel.tsx`, `issue/IssueDiscrepancyViewer.tsx`, `issue/IssueHeader.tsx`, `IssueCreator.tsx`, `transactions/TransactionSchemaBuilder.tsx`, `transactions/WorkingDbBrowser.tsx`, `common/DestructiveConfirmModal.tsx`, `context/NavigationContext.tsx`.
- **Impact:** Reviewers and AI agents repeatedly "fix" dead files (and the dead `DatabaseValidationSettings` still contains the richest rule-authoring UI), while live behaviour lives elsewhere. Dead files also inflate search results and audit noise.
- **Remediation:** Delete after confirming intent with the owner (per Rule 17 provenance discipline); if `DatabaseValidationSettings` is the intended rule editor, wire it and delete the duplicate path instead.

#### FE-24 — Monolithic components
- **Evidence:** 31 files > 1,000 lines; `ValidationOrchestratorWorkspace.tsx` 8,416; `TeamWorkspace.tsx` 3,847; `IssueDetailView.tsx` 3,684; `SystemSettings.tsx` 3,612; `GlobalTransactionSettings.tsx` 3,566; `DatabaseColumnConfiguration.tsx` 3,551; `StandardFileIngestionWorkspace.tsx` 3,411; `ValidationBoxManager.tsx` 3,248.
- **Impact:** Each of these files mixes data access, business heuristics, and presentation. The verdict-fabrication logic in FE-04 sits inside a render helper of an 8.4k-line component — it is invisible to review and impossible to unit test.
- **Remediation:** Extract hooks (`useX`) and pure selectors from the largest files; move verdict projection into a tested pure function.

#### FE-25 — Bundle weight concentrated in single views
- **Evidence:** `IssueDetailView` 521 KB (119 KB gzip), `TeamWorkspace` 351 KB (71 KB), `vendor-xlsx` 430 KB (143 KB), `vendor-charts` 322 KB, `DataSetupLandingView` 185 KB, `SystemSettings` 174 KB, CSS 214 KB.
- **Secondary:** `xlsx` is imported at module scope in 7 components — 4 live (`HashtagFileUploadModal`, `StandardFileIngestionWorkspace`, `HashtagManager`, `WorkspaceTaskCreator`) and 3 orphaned — so any ingestion/automation view pulls the 430 KB library up front. `@google/genai` (4 MB-class dependency) is installed in `frontend/package.json` but **never imported**.
- **Remediation:** Convert `xlsx` to `await import('xlsx')` at the export/parse boundary (the investigation workspace already does this — replicate the pattern); remove unused dependencies.

#### FE-26 — The test story is not executable
- **Evidence:** 4 test files (`utils/adminCapabilities`, `cellPreview`, `fieldClassification`, `ftpStagingDisplay`); no `test` script in [`frontend/package.json`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/package.json); no Vitest/Jest config; no testing-library dependency.
- **Impact:** `npm test` is undefined at the workspace frontend, so these files cannot run in CI. There are **zero** component or integration tests for 135 components, including the verdict renderer in FE-04.
- **Remediation:** Add Vitest + `@testing-library/react`, a `test` script, and CI wiring; start with pure functions (verdict projection, formatters, capability checks) and then the login and settings flows.

#### FE-27 — API contract drift between client types and backend
- **Evidence:** `executeHashtagFile` is typed without `executionMode` and without the `stats`/`newlyCollectedCount`/`fixedCount`/`waitingCount`/`failedCount` fields the UI reads ([`client.ts:1632-1641`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/api/client.ts#L1632-L1641) vs [`HashtagFileUploadModal.tsx:209-232`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/automations/HashtagFileUploadModal.tsx#L209-L232)). Connection test types omit `password` and `latencyMs` that callers pass/read (`Step1Connect.tsx:42-48`). `FileIngestionMappingTemplate` requires `manualHeaders`/`deletedColumns`/`cleaningRecipe`/timestamps that seeds omit (4 errors).
- **Impact:** Runtime happens to work (the backend accepts/returns the extra fields), but the compiler is blind to breakage; this is the mechanism by which FE-07 survived.
- **Remediation:** Generate or hand-align response types from the backend route contracts; add a contract test that asserts response keys.

#### FE-28 — Three overlapping configuration hubs
- **Evidence:** `WorkspaceSettings` (8 tabs, including launchers for workflow studio, validation boxes, column configuration) vs `SystemSettings` (dictionary / connections / environment / staging / transformations) vs `DataSetupLandingView`, all reachable from SideNav ("Settings", "Data setup") and cross-linked. Navigation aliases pile up: `workspace_settings | setting | system_settings | data_setup | txn_settings | connections`.
- **Impact:** Operators cannot tell which surface is authoritative; the same studio is reachable from two App routes; alias sets in `App.tsx`, `SideNav.tsx`, and `TopBar.tsx` must be kept in sync manually (they already differ).
- **Remediation:** One navigation registry (route id -> component -> label -> breadcrumb -> permission) shared by `App`, `SideNav`, and `TopBar`; one settings entry point with explicit sub-navigation.

#### FE-29 — Duplicate import declaration in `CaseDiscussionDrawer`
- **Evidence:** [`CaseDiscussionDrawer.tsx:20-21`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/CaseDiscussionDrawer.tsx#L20-L21) contains `import { api } from '../../api/client';` twice; `tsc` reports "Duplicate identifier 'api'".
- **Impact:** Invalid module syntax per the ES spec; tolerated only because the bundler dedupes. Also a symptom of unguarded copy/paste in a 24 KB file.
- **Remediation:** Delete the duplicate line.

#### FE-30 — `currentUser.name` is optional but interpolated directly
- **Evidence:** [`WorkspaceSettings.tsx:172-175`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/WorkspaceSettings.tsx#L172-L175) builds the audit justification from `${currentUser.name}` although `User.name` is optional ([`types.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/types.ts)). Other call sites correctly use `currentUser.name || currentUser.username`.
- **Impact:** Governance proposals can be recorded as "Configuration updated by undefined (admin)", weakening the audit trail.
- **Remediation:** Use a single `displayName(user)` helper everywhere.

#### FE-31 — Stale closures in effects
- **Evidence:** [`SideNav.tsx:109-118`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/SideNav.tsx#L109-L118) registers a keydown handler with `[]` deps while calling `toggleCollapsed` (which closes over props). [`App.tsx:330`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L330) opens the SSE stream with `[]` deps while reading `currentUser`, so the stream keeps the first user's `userId` for the session.
- **Impact:** Wrong-user notification routing after a user switch; sidebar shortcut may target stale callbacks.
- **Remediation:** Add the real dependencies; recreate `EventSource` when `currentUser.id` changes and close the previous instance.

### 4.4 Low

| ID | Finding | Evidence | Remediation |
|---|---|---|---|
| **FE-32** | `ErrorBoundary` is untyped and cannot recover on child change: `class ErrorBoundary extends (React.Component as any)` with hand-declared `props`/`setState` | [`ErrorBoundary.tsx:20-31`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/ErrorBoundary.tsx#L20-L31) | Restore proper generics once FE-06 is fixed; add a `resetKeys` prop |
| **FE-33** | Native `window.alert/confirm/prompt` used in 12 places | `SystemSettings.tsx:2915,3149`, `ValidationOrchestratorWorkspace.tsx:1349,1370,2481,2505,2536`, `WorkflowStudioFlowchart.tsx:909`, `WorkspaceTaskCreator.tsx:675`, `ValueDictionaryWorkbench.tsx:555`, `ValidationBoxHub.tsx:150`, `UserAdminPanel.tsx:332` | Replace with `DestructiveConfirmModal` / `Modal` |
| **FE-34** | Login screen reports false technical facts: "PORT 3000 (LOCAL)" while the server listens on 5002; "SECURE HANDSHAKE RSA 2048" is not implemented | [`LoginScreen.tsx:170-171`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/LoginScreen.tsx#L170-L171); [`server.ts:39`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/server.ts#L39) | Remove or derive from configuration |
| **FE-35** | `getRoleBadgeColor(_r)` ignores its argument, so every role renders identically | [`LoginScreen.tsx:115-117`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/LoginScreen.tsx#L115-L117) | Implement per-role styling or drop the parameter |
| **FE-36** | Dead variable `effectiveRole` | [`App.tsx:1092`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L1092) (1 reference) | Remove |
| **FE-37** | Falsy-vs-null bug in badge precedence: `pendingProposalsCount \|\| contextPendingCount` shows the context count when the real count is `0` | [`SideNav.tsx:78`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/SideNav.tsx#L78) | Use `??` |
| **FE-38** | `useGovernance()` returns a silent no-op default context outside the provider, so mis-wiring fails quietly | [`GovernanceContext.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/context/GovernanceContext.tsx) (tail) | Throw outside provider, or gate the fallback behind a dev flag |

> Finding count: FE-01..FE-04 Critical, FE-05..FE-16 High, FE-17..FE-31 Medium, FE-32..FE-38 Low = **38 findings** (4 Critical, 12 High, 15 Medium, 7 Low).

---

## 5. Governance Compliance Matrix

| Rule | Requirement | Status | Evidence |
|---|---|---|---|
| **2** | Validation result must come from the engine; never merged with pipeline action | **VIOLATED** | FE-04 (renderer fabricates `PASS`, uses `idx` heuristics) |
| **6** | All complex workspace views wrapped in `ErrorBoundary` | **PARTIAL** | FE-10 (5 unwrapped routes) |
| **16** | No `calc(100vh-...)` in inner panes; stationary headers; isolated scroll | **PARTIAL** | `WorkspaceSettings.tsx` `h-[calc(100vh-2.25rem)]`, `LoginScreen.tsx` `min-h-[calc(100vh-3rem)]`; `TeamWorkspace`/`CasesWorkspaceView` otherwise compliant |
| **18** | Canonical `ValidationBoxType` only in `box_type` | **PASS** | 21 `EXISTENCE_CHECK` occurrences are all `checkType`/UI labels, never `box_type` |
| **20** | Cross-layer invariance for state/enum changes | **PARTIAL** | FE-27 API type drift; alias lists duplicated across 3 files (FE-28) |
| **22** | No certification without physical verification | **VIOLATED (historical)** | Prior "0 TS errors" / "localStorage zero-breach" claims vs FE-05 / FE-02 |
| **23** | `localStorage` never the primary store for business entities | **VIOLATED** | FE-02 (16 entities + session) |
| **7** | Maker-Checker cannot be bypassed | **PARTIAL** | FE-16 (optimistic local apply, success banner on failed submission) |

---

## 6. Prioritised Remediation Roadmap

### Phase 0 — Release blockers (target: 1 sprint)
| ID | Action | Effort |
|---|---|---|
| FE-01 | Wire real `api.login`/`api.logout`; remove auto-create and privileged self-registration; enforce `requireAuth` on core routers | 2-3 d |
| FE-02 | Remove business entities from `usePersistentState`; persist via API; clear all caches on logout; stop trusting `currentUser.role` for authorization | 4-6 d |
| FE-03 | Sanitize email HTML (DOMPurify) or render text-only | 0.5 d |
| FE-04 | Replace frontend verdict synthesis with pure projection of engine output; unknown => `NOT_EVALUATED` | 3-4 d |
| FE-07 | Fix the two phantom API methods | 0.5 d |
| FE-15 | Treat empty responses as authoritative; clear the hydration timeout | 1 d |
| FE-16 | Submit-then-apply; error banner on failure | 1 d |
| FE-05 | Fix the 41 type errors; make `tsc --noEmit` a build dependency | 2 d |

### Phase 1 — Correctness, trust and accessibility (target: 1-2 sprints)
- FE-06 install React typings and begin `strict` rollout module-by-module.
- FE-13 delete fabricated counters and the static green health pill.
- FE-14 implement or remove universal search.
- FE-11/12 typography floor, input labelling, `type="button"`, table semantics.
- FE-17/18 routing: real URLs, `NotFound`, clear deep-links.
- FE-19/21/22 toast timers, 401 handling, eliminate silent catches.
- FE-20 route all `fetch` calls through the API client.

### Phase 2 — Design system consolidation (target: 1-2 sprints)
- FE-08 migrate 120 overlays to `Modal`/`Drawer`; one `Button` family.
- FE-09 enforce `ds-*` tokens; remove hex literals and `indigo/purple/violet`; decide the dark-theme question.
- FE-10 wrap remaining routes; add a route-level boundary wrapper.
- FE-28 single navigation registry (route/label/breadcrumb/permission).
- FE-33 replace native dialogs.

### Phase 3 — Structural debt (ongoing)
- FE-23 delete or wire the 15 orphaned components.
- FE-24 extract hooks/selectors from the 31 >1,000-line files (start with `ValidationOrchestratorWorkspace`).
- FE-25 lazy-load `xlsx`; drop `@google/genai`.
- FE-26 stand up Vitest + Testing Library, CI gate.
- FE-27 generate API response types from backend contracts.
- FE-29..FE-38 cleanup batch.

---

## 7. Verification Protocol (definition of done)

Re-run these and record raw output in the remediation acceptance report:

```powershell
# 1. Type gate must exit 0
cd frontend; npm run lint; echo "exit=$LASTEXITCODE"

# 2. Build must succeed and stay within budget
cd frontend; npm run build

# 3. Tests must exist and run
cd frontend; npm test        # requires FE-26 to add this script

# 4. No direct fetch outside the API client
Select-String -Path frontend/src/**/*.tsx -Pattern "[^a-zA-Z]fetch\(" |
  Where-Object { $_.Path -notmatch 'api\\client.ts' }

# 5. No business entity in localStorage
Select-String -Path frontend/src/**/*.ts,frontend/src/**/*.tsx -Pattern "localStorage" |
  Where-Object { $_.Line -notmatch 'it_sidebar_collapsed|it_team_rail_open' }

# 6. Overlay adoption
(Select-String -Path frontend/src/**/*.tsx -Pattern 'fixed inset-0').Count   # target: source-file count only in common/Overlay.tsx

# 7. Token adoption
(Select-String -Path frontend/src/**/*.tsx -Pattern '#[0-9A-Fa-f]{6}').Count # target: 0
```

**Acceptance gates**

1. `npm run lint` exits 0 and is invoked by `npm run build`.
2. Zero business entity keys in `localStorage` (Rule 23 achieved, not asserted).
3. A login attempt with a wrong password is rejected by the UI; no user is auto-created.
4. A transaction with no engine results renders `NOT_EVALUATED` and cannot be closed or reconciled.
5. An inbound email containing `<script>` renders inert text.
6. Every route is reachable by URL, and an unknown URL renders `NotFound`.
7. Every modal traps focus, closes on Escape, and exposes `role="dialog"`.

---

## 8. Appendix

### 8.1 File inventory examined (largest 15)

| Lines | File |
|---|---|
| 8,416 | `components/investigation/ValidationOrchestratorWorkspace.tsx` |
| 3,847 | `components/TeamWorkspace.tsx` |
| 3,684 | `components/IssueDetailView.tsx` |
| 3,612 | `components/settings/SystemSettings.tsx` |
| 3,566 | `components/GlobalTransactionSettings.tsx` |
| 3,551 | `components/settings/DatabaseColumnConfiguration.tsx` |
| 3,411 | `components/common/StandardFileIngestionWorkspace.tsx` |
| 3,248 | `components/settings/ValidationBoxManager.tsx` |
| 2,737 | `components/settings/FtpFileStagingSettings.tsx` |
| 2,602 | `components/settings/WorkflowStudioFlowchart.tsx` |
| 2,464 | `components/settings/DatabaseValidationSettings.tsx` (orphaned) |
| 2,322 | `components/PersonalChat.tsx` |
| 2,285 | `types.ts` |
| 1,913 | `components/sandbox/QuerySandboxStandaloneView.tsx` |
| 1,823 | `components/ManagerialDashboard.tsx` |

### 8.2 Raw `tsc` error distribution

| Errors | File |
|---|---|
| 8 | `components/automations/HashtagFileUploadModal.tsx` |
| 7 | `components/team/EscalationRoomView.tsx` |
| 5 | `components/chat/MessageChatActions.tsx` |
| 4 | `components/common/StandardFileIngestionWorkspace.tsx` |
| 4 | `App.tsx` |
| 3 | `components/investigation/CaseDiscussionDrawer.tsx` |
| 3 | `components/WorkspaceSettings.tsx` |
| 3 | `components/datasetup/ResourceDetailView.tsx` |
| 2 | `components/datasetup/wizard/Step1Connect.tsx` |
| 1 | `components/datasetup/wizard/DataSetupWizardModal.tsx` |
| 1 | `components/team/TeamOrgStructureTab.tsx` |
| **41** | **TOTAL** |

### 8.3 Build output reference

```
dist/assets/index-*.css                       213.94 kB │ gzip:  28.12 kB
dist/assets/vendor-xlsx-*.js                  429.53 kB │ gzip: 143.08 kB
dist/assets/vendor-charts-*.js                321.76 kB │ gzip:  87.72 kB
dist/assets/IssueDetailView-*.js              521.38 kB │ gzip: 119.46 kB
dist/assets/TeamWorkspace-*.js                350.59 kB │ gzip:  71.01 kB
dist/assets/vendor-core-*.js                  290.57 kB │ gzip:  93.86 kB
dist/assets/index-*.js                        211.91 kB │ gzip:  51.81 kB
dist/assets/DataSetupLandingView-*.js         185.29 kB │ gzip:  35.54 kB
✓ built in 19.04s
```

### 8.4 Traceability

This document is the master anchor for frontend design-system and frontend-integration remediation. It is registered in [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md) under the frontend domain, and it **supersedes** the frontend-related "100% certified" status lines it contradicts (see §1.1) until the Phase 0 and Phase 1 gates in §7 pass.

**Related documents**
- [`FRONTEND_UI_UX_DESIGN_AND_ARCHITECTURE_AUDIT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/FRONTEND_UI_UX_DESIGN_AND_ARCHITECTURE_AUDIT.md) — earlier 27-screen UI/UX audit (design intent).
- [`FRONTEND_REDESIGN_SYSTEM_SPECIFICATION_AND_PLAN.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/FRONTEND_REDESIGN_SYSTEM_SPECIFICATION_AND_PLAN.md) — design-system specification (tokens, shell).
- [`FRONTEND_INVESTIGATION_ORCHESTRATION_MODIFICATION_SUGGESTIONS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/FRONTEND_INVESTIGATION_ORCHESTRATION_MODIFICATION_SUGGESTIONS.md) — investigation workspace specification (Rule 2/6 intent).
- [`INDEPENDENT_PHYSICAL_CODE_REAUDIT_2026.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/INDEPENDENT_PHYSICAL_CODE_REAUDIT_2026.md) — prior re-audit whose frontend certification claims are contradicted in §1.1.

---

*End of audit.*
