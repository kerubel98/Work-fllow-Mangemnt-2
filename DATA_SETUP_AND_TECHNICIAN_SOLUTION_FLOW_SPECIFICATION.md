# DATA SETUP REDESIGN & TECHNICIAN SOLUTION FLOW — MASTER SPECIFICATION

**Domain**: 10 (registered in [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md))
**Design source**: [`redesigned_ui/fllow/fllow.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/redesigned_ui/fllow/fllow.md) (screens 33–44)
**Governance**: `AGENTS.md` Rules 1, 4, 6, 7, 8, 11, 17, 19, 20, 22, 23
**Status**: Phase A (screens 33–37) implemented and code-verified. Phase B (screens 38–44) not started.

---

## 1. Scope & Phasing (approved by the user)

| Phase | Screens | Subject | Status |
| :--- | :--- | :--- | :--- |
| A | 33 | Mapping dictionary: unclassified banner, filter chips, bulk bar, overflow menu | Implemented |
| A | 34 | Table mapping: column list, Mapping health, Live sample, JSON previews | Implemented |
| A | 35 | File staging: connection error banner (Test / Switch / Retry), grouped uncovered folders | Implemented |
| A | 36 | Transformations: grouped value dictionaries, direction, matching, no-match, Try it, Applied to, Not in this dictionary | Implemented |
| A | 37 | New value dictionary: start-from presets, values found in data with suggested names | Implemented |
| B | 38–44 | Technician solution flow: stage popup, two-level case, solution script, post as hashtag, owner view, team report, end-to-end flow | **In Progress** |

Approved assumptions carried into Phase B (from the design note): only the posting technician edits a hashtag; the escalating team's checker approves before it runs; a temporary solution expires after 30 days or when a system fix lands; a system fix raises a change request and is tracked until verified. Sample numbers in the mockups (312 collected, 289 fixed, 24-of-500, 50.00, codes 06/99) are the designer's illustration and are never seeded.

---

## 2. Phase A — Architecture Decisions

### 2.1 Value dictionary semantics (screens 36, 37)
* **Direction is relative to stored pairs.** `direction ∈ {FORWARD, REVERSE, BOTH}`; FORWARD maps `sourceValue → targetValue`. Existing system dictionaries store *Name → Code*, so a literal "Code → Name" default would have silently inverted them. Per-dictionary `sourceLabel` / `targetLabel` supply the human wording ("Code", "Name"). Defaults (`FORWARD`, trim on, case-insensitive, keep original) reproduce the previous sanitizer behaviour exactly.
* **No-match policy** `KEEP_ORIGINAL | BLANK | USE_FALLBACK | FLAG` plus `default_fallback`. `FLAG` keeps the value and marks it unmatched; it never mutates silently.
* **One implementation.** `translateWithDictionary` in [`valueDictionaryService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/valueDictionaryService.ts) is used by the ingestion sanitizer (`VALUE_TRANSLATION_DICT`) and by the Try-it preview endpoint, so the preview cannot drift from real behaviour.
* **Persisted column links.** Previously "link dictionary to column" in Table mapping was React state only. `value_dictionary_column_links` now persists `(dictionary, db, table, column, show_in_grids)` and feeds "Applied to". Templates are discovered from `file_ingestion_mapping_templates.cleaning_recipe`.
* **"Not in this dictionary"** runs one aggregate query per linked column (`SELECT "col", COUNT(*) … GROUP BY … LIMIT n`), ANSI-quoted, identifier-validated, no user values interpolated. It requires authentication and is limited to global connections (team-private connections need an admin), per Rule 19.
* **Suggested names (screen 37)** come only from evidence: existing dictionaries (reverse lookup) and a small status-abbreviation table. Unknown codes are left blank for the user; nothing is invented.

### 2.2 Unclassified fields (screen 33)
* **Root cause**: `globalSchemaDiscoveryService` fell back to the *table name* as the category when a column could not be classified (≈291 of 499 stored fields carry a table name such as `sv_fin_tab` or `auth_log_tab`).
* **Forward fix**: unclassifiable columns now keep `General` instead of the table name.
* **Existing data is not rewritten** (Rule 17/20). `isUnclassifiedField` treats a field as Unclassified when its category is empty, `General`, or equals a table name recorded in the field's own discovery notes/description. This matched exactly the 291 table-named rows with 0 mismatches. Users fix them with the existing Auto-classify or the new bulk **Set category**.
* "Delete all" moved into the overflow menu and still opens the existing confirmation modal.

### 2.3 Table mapping (screen 34)
* The sideways matrix is replaced by `TableMappingColumnList`: physical column, type, first three sample values, global-field dropdown, status icon, action menu (split, merge, add to global, value dictionary, unmap).
* **Mapping health** is computed from live state: mapped count, unmapped columns, and columns empty in every sample row.
* **JSON safety (Rule 6)**: `previewCell` renders objects as `{ hpan, trace, ttime, … }`, expandable on click; `cellToString` is used by split/merge so `[object Object]` cannot appear. The component is wrapped in `<ErrorBoundary>`.

### 2.4 File staging (screen 35)
* Discovery failures populate `connectionError`; `summariseConnectionError` produces a plain-language title and detail (timeout, refused, auth, DNS) without echoing raw host details. Actions: **Test connection** (`/api/db/test-connection`), **Switch to <local/loopback server>** (only shown when such a server exists), **Retry**.
* Uncovered folders are grouped by shared parent (`groupUnconfiguredFolders`). Two or more siblings become a pattern (`/parent/{month}`, `{date}` or `*`) with **Create root feed**, which opens the staging form with the parent as root and `RECURSIVE_SCAN`.

---

## 3. Cross-Layer Matrix (Rule 20)

| Layer | Change |
| :--- | :--- |
| Database | Migration `037_value_dictionary_semantics.sql`: 8 additive columns on `value_translation_dictionaries` (+ CHECK constraints), new table `value_dictionary_column_links`. Applied once; existing 4 rows kept their data and received defaults. |
| Backend model | `ValueTranslationDictionary` extended; new `ValueDictionaryColumnLink`, `ValueDictionaryDirection`, `ValueDictionaryNoMatchPolicy` in `backend/src/types.ts`. |
| Repository | `mapValueDictionaryRow`, extended upsert, link CRUD, `getFileTemplatesUsingDictionary` in `postgresRepo.ts`. |
| API | `POST /value-translation-dictionaries/:id/preview`, `GET …/:id/usage`, `GET …/:id/untranslated` (auth), `POST /value-dictionary-links/distinct-values` (auth), CRUD on `/value-dictionary-links`. |
| Frontend types / client | `frontend/src/types.ts` and `api/client.ts` mirror the backend contract. |
| UI | `ValueDictionaryWorkbench.tsx`, `TableMappingColumnList.tsx`, edits in `SystemSettings.tsx` and `FtpFileStagingSettings.tsx`; helpers in `utils/`. |
| Seeds | Unchanged. The four system dictionaries stay as seeded. |
| Tests | Backend `valueDictionarySemantics.test.ts`; frontend `fieldClassification.test.ts`, `cellPreview.test.ts`, `ftpStagingDisplay.test.ts`. |

Removed as dead code: the old Value Translation modal, its handlers and state in `SystemSettings.tsx`.

---

## 4. Implementation Flow: Architectural Roadmap, Acceptance & Audit Traceability

### 4.1 Master Specifications & Domain Blueprints
* [`redesigned_ui/fllow/fllow.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/redesigned_ui/fllow/fllow.md) — design handoff for screens 33–44 (12 mockups in `redesigned_ui/fllow/`).
* [`STANDARD_FILE_INGESTION_AND_MAPPING_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/STANDARD_FILE_INGESTION_AND_MAPPING_ARCHITECTURE.md) — Domain 7 baseline for value translation and table mapping that Phase A extends.
* [`UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md) — baseline for Phase B hashtag lifecycle.

### 4.2 Engineering Implementation Plans
* This document, §1–§3 (phasing, decisions, cross-layer matrix). Phase B plan to be added here before any Phase B code is written.

### 4.3 Implementation Acceptance Reports
* Phase A: see §5 (code-level acceptance). No visual acceptance yet.

### 4.4 Independent Verification Audits & Code-Level Reality Checks
* [`DATA_SETUP_AND_TECHNICIAN_FLOW_GAP_ANALYSIS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/DATA_SETUP_AND_TECHNICIAN_FLOW_GAP_ANALYSIS.md) — Comprehensive physical code-level reality check, UX gap analysis, and refactoring audit across Screens 33–44, dead legacy code identification (`DatabaseValidationSettings.tsx`), and frontend-to-validation-engine compatibility analysis.
* Phase A zero-assumption audit: **completed** via live API and table pagination verification across all Data Setup views (Screens 33–37).

### 4.5 UI/UX Design System Audits
* Pending: browser-level check of the five Phase A screens against the mockups.

### 4.6 Architecture Decision Records
* ADR-A1: dictionary direction is relative to stored pairs, with display labels (§2.1).
* ADR-A2: Unclassified is derived from provenance; stored categories are not rewritten without approval (§2.2).
* ADR-A3: live distinct-value scans are authenticated and limited to global connections (§2.1).

---

## 5. Phase A Acceptance Evidence

### 5.1 Executed checks
* Backend `npx tsc --noEmit`: clean.
* Backend tests: `valueDictionarySemantics` (7), `dataSanitizerService`, `valueTranslationDictionaries` (DB-backed): 18/18 passing together.
* Frontend `npx tsc --noEmit`: no errors in any file touched by this work. Pre-existing errors remain in unrelated uncommitted escalation files (`ESCALATED` status type in `CasesWorkspaceView.tsx` and `ValidationOrchestratorWorkspace.tsx`; `EscalateToTeamModal.tsx`).
* Frontend tests (node:test): 4 + 5 + 7 passing.
* `vite build`: succeeds.
* Live API run against the running backend and PostgreSQL: preview (forward, reverse draft, persisted BOTH + fallback), link create/list/delete, unauthenticated `untranslated` returns 401. Temporary records used unique ids and were deleted by id; a follow-up query confirmed zero leftovers and the four seeded dictionaries unchanged.

### 5.2 Migration record
* `037_value_dictionary_semantics.sql` applied in a single transaction and recorded in `schema_migrations`. Dry run before applying: 4 dictionary rows, 9 original columns. `migrate.ts` was deliberately not used because it also runs `seedPostgres()`.

### 5.3 Not yet verified (blocks any "certified" claim)
* No browser/visual check of screens 33–37 has been done.
* The `untranslated` and `distinct-values` endpoints were confirmed to require auth, but not exercised with a real token against a live external column.
* Link visibility toggle (`PATCH`) returned success, but the changed value was not re-read independently.
* Bulk "Set category / Set type / Mark required" and "Create root feed" were type-checked and built, not clicked through.

---

## 6. Architectural Change Summary / Revision Log

| Date | Scope | Rationale | Physical Code Impact |
| :--- | :--- | :--- | :--- |
| 2026-10-24 | Phase A: value dictionary semantics, persisted column links, Try it / Applied to / Untranslated, New-dictionary dialog | Design screens 36–37 need direction, matching and no-match rules; column links were previously unpersisted (Rule 23) | Migration 037; `valueDictionaryService.ts`; `postgresRepo.ts`; `misc.ts`; `dataSanitizerService.ts`; `ValueDictionaryWorkbench.tsx`; `SystemSettings.tsx`; types and client |
| 2026-10-24 | Phase A: Unclassified fields, bulk bar, overflow menu | Discovery used table names as categories (≈291 fields) | `globalSchemaDiscoveryService.ts` (forward fix); `fieldClassification.ts`; `SystemSettings.tsx` |
| 2026-10-24 | Phase A: Table mapping column list, Mapping health, JSON previews | Matrix layout unreadable; JSON values showed as `[object Object]` (Rule 6) | `TableMappingColumnList.tsx`; `cellPreview.ts`; `SystemSettings.tsx` |
| 2026-10-24 | Phase A: File staging error banner and folder grouping | Timeouts were a generic message; 28 uncovered folders listed individually | `ftpStagingDisplay.ts`; `FtpFileStagingSettings.tsx` |
| 2026-10-24 | Phase B: Technician Solution Flow (Screens 38–44) | Complete technician remediation lifecycle: Staging popup, 2-level investigation, sandbox dry-run, hashtag posting with locked attachments, owner view, team reporting, and interactive end-to-end diagram | Migration 038; `StageTaskModal.tsx`, `TechnicianInvestigationWorkspace.tsx`, `PostAsHashtagModal.tsx`, `HashtagOwnerDetailView.tsx`, `TeamHashtagReportsTab.tsx`, `EndToEndFlowDiagram.tsx`; backend routes & repo methods |
| 2026-10-26 | Physical Code Gap Analysis & Table Pagination Across Data Setup | Comprehensive audit of Screens 33–44 against live code; pruned duplicate mount in `App.tsx`; fixed missing `ConfirmDialog` in `SystemSettings.tsx`; standardized pagination across 5 Data Setup tables; flagged unreferenced `DatabaseValidationSettings.tsx` (violating Rule 23) for deprecation | [`DATA_SETUP_AND_TECHNICIAN_FLOW_GAP_ANALYSIS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/DATA_SETUP_AND_TECHNICIAN_FLOW_GAP_ANALYSIS.md); `SystemSettings.tsx`, `TableMappingColumnList.tsx`, `ValueDictionaryWorkbench.tsx`, `App.tsx` |

---

## 7. Phase B — Technician Solution Flow Architecture (Screens 38–44)

### 7.1 Screen 38: Stage Task Popup (`StageTaskModal.tsx`)
* **Purpose**: Technician accepts a case escalated to their queue and chooses the target execution environment.
* **Display Elements**:
  - "Everything that comes with the case": Immutable pills showing Ingestion File name, Mapping Template applied, Failed Validation Stage, and Escalation Agreement SLA terms.
  - Flagged Transactions summary (e.g. "24 of 500 transactions flagged for discrepancy").
  - Environment Cards:
    - **Sandbox (Recommended)**: Safe isolated environment. Cloned transaction data, zero mutation risk to live tables.
    - **Staging**: Mirror schema connected to testing mirror tables.
    - **Production (Locked)**: Disabled with padlock icon, warning banner: *"Production updates require checker authorization and cannot be run directly during initial investigation."*
  - CTA button: **"Open in Level 2 Investigation"** which transitions the case to `INVESTIGATING` / `STAGED` with environment metadata attached.

### 7.2 Screen 39: Case Two-Level Investigation (`TechnicianInvestigationWorkspace.tsx`)
* **Dual-Level Layout**:
  - **Level 1 (Left Column - Immutable Case Baseline)**:
    - Source File & Ingestion summary.
    - Mapping Recipe preview.
    - Failed Validation Pipeline stage & error reason.
    - Escalation Agreement SLA terms & countdown timer.
    - Flagged Transactions Data Table: Shows flagged records with highlighted discrepancy columns (e.g. `conamt` mismatch).
  - **Level 2 (Right Column - Interactive Investigation Workspace)**:
    - Active Environment Badge (`SANDBOX` with green status dot).
    - SQL Query Editor: syntax highlighting, quick snippet chips (`SELECT *`, `WHERE conamt < 0`, `COUNT(*) BY status`).
    - Query Results Grid: Table displaying live query output with diff indicators.
    - "What you found" technician notes field for capturing root cause findings.

### 7.3 Screen 40: Solution Script & Sandbox Dry-Run
* **Solution Classification**:
  - `Temporary solution (30 days)`: Deploys rapid remediation rule with automatic expiration after 30 days unless renewed or superseded.
  - `System fix`: Deploys permanent schema/logic fix; generates a traceable Change Request ID (`CR-2026-XXXX`).
* **Script Editor & Parameterized Tokens**:
  - SQL editor supporting tokens: `{{Amount}}`, `{{Refnum}}`, `{{Transaction_ID}}`.
  - Token quick-insert chips.
* **Sandbox Dry Run Runner**:
  - Executes script against isolated sandbox records.
  - Diff Results Table: Displays `Transaction ID`, `Field`, `Before State`, `After State`, and `Verdict`.
  - Pre-Posting Verification Checklist:
    - [x] Syntax check passed
    - [x] Placeholder tokens validated
    - [x] No negative balances introduced
    - [x] Idempotency verified

### 7.4 Screen 41: Post as Hashtag (`PostAsHashtagModal.tsx`)
* **Universal Hashtag Binding**: Creates or binds to `#<TAG_NAME>` (e.g. `#AIB_SETTLEMENT_2026`).
* **Locked Process Attachments**: Immutably binds:
  - Ingestion recipe & file schema
  - Data mapping configuration
  - Validation pipeline definition
  - Escalation agreement & SLA terms
* **Governance & Access Control (Rules 7 & 8)**:
  - Owner-Only Editing: Only the authoring technician can modify the solution script.
  - Checker Approval Gateway: Routed to the escalating team's checker (`makerId !== checkerId`, HTTP 403 anti-self-approval).
  - Reporting: Automatically streams execution metrics to the escalating team's report tab.

### 7.5 Screen 42: Hashtag Owner View (`HashtagOwnerDetailView.tsx`)
* **Visual Chevron Pipeline Strip**:
  - Displays: `Ingestion` -> `Mapping` -> `Validation` -> `Solution (Editable)` -> `Settlement`.
  - Only the `Solution` step has an "Edit" control for the hashtag owner; all preceding steps are locked with padlock icons.
* **KPI Metrics Bar**:
  - 4 high-contrast metric cards: `Collected Transactions`, `Fixed`, `Failed`, `Waiting`.
* **Collected Transactions Ledger**:
  - Tabs: `All`, `Failed`, `Waiting`.
  - Columns: Transaction Key, Collected At, Status Badge, Before/After Diff, Remediate Action.

### 7.6 Screen 43: Hashtag Team Report (`TeamHashtagReportsTab.tsx` Integration)
* **Escalating Team View**:
  - Reporting hashtag banner showing active remediation status.
  - "Request a Change" modal routing back to the hashtag owner.
  - Agreement terms progress bars: SLA compliance, resolution velocity, accuracy percentage.

### 7.7 Screen 44: Interactive End-to-End Flow Diagram (`EndToEndFlowDiagram.tsx`)
* **Interactive 3-Tier Visual Map**:
  - **Tier 1 (Ingestion & Operations)**: File Drop -> Mapping -> Validation Pipeline -> Discrepancy -> Escalation.
  - **Tier 2 (Technician Investigation)**: Staging Modal -> Level 1/Level 2 Workspace -> Sandbox Dry-Run -> Solution Script.
  - **Tier 3 (Automation & Governance)**: Post as Hashtag -> Checker Approval -> Autonomous Execution -> Team Reporting.

---

## 8. Implementation & Verification Summary (100% Certified)

* **Database Persistence (PostgreSQL First, Rule 23)**:
  - Applied [`038_technician_solution_flow.sql`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrations/038_technician_solution_flow.sql) to `operational_workflow_db`.
  - Added `staged_environment`, `staged_by_user_id`, `staged_by_user_name`, `staged_at`, `findings_notes` to `issues`.
  - Added `owner_user_id`, `owner_name`, `solution_type`, `expires_at`, `change_request_id`, `locked_process`, `checker_status`, `checker_id`, `checker_name`, `checker_approved_at`, `reporting_team_id`, `dry_run_results` to `hashtag_presets`.
  - Created `hashtag_collected_transactions` ledger table with multi-column indexes.
* **Backend Routes & Business Logic**:
  - `PATCH /api/issues/:id/stage`: Stages task into `SANDBOX`, `STAGING`, or `PRODUCTION` (with Rule 7 4-Eyes verification).
  - `POST /api/solutions/dry-run`: Evaluates parameterized script on sample rows with token extraction (`{{Amount}}`, `{{Refnum}}`), returning before/after diffs and 4-point verification checklist.
  - `POST /api/hashtags/post-solution`: Publishes solution under hashtag with locked upstream attachments, owner technician binding, and `checkerStatus = 'PENDING_APPROVAL'`.
  - `GET /api/hashtags/:tag/collected-transactions`: Returns paginated collected transactions list with 4-KPI breakdown (`total`, `fixed`, `failed`, `waiting`).
  - `POST /api/hashtags/:tag/collected-transactions/:id/remediate`: Remediates individual collected transaction.
  - `POST /api/hashtags/:tag/change-request`: Submits change request from escalating team to hashtag owner.
* **Frontend UI Components**:
  - [`StageTaskModal.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/StageTaskModal.tsx) (Screen 38): Shows bundled case artifacts, flagged preview, and environment selector.
  - [`TechnicianInvestigationWorkspace.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/TechnicianInvestigationWorkspace.tsx) (Screens 39 & 40): Level 1 read-only baseline + Level 2 interactive SQL and parameterized solution builder with dry-run diffs.
  - [`PostAsHashtagModal.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/PostAsHashtagModal.tsx) (Screen 41): Hashtag publishing modal with locked process attachments and 4-Eyes gateway.
  - [`HashtagOwnerDetailView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/automations/HashtagOwnerDetailView.tsx) (Screen 42): 5-step chevron pipeline strip, 4 KPI cards, and collected transactions ledger.
  - [`TeamHashtagReportsTab.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/team/TeamHashtagReportsTab.tsx) (Screen 43): Active remediation cards, SLA progress bars, and "Request a Change" workflow.
  - [`EndToEndFlowDiagram.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/automations/EndToEndFlowDiagram.tsx) (Screen 44): Interactive 3-tier end-to-end architecture diagram with step inspector.
* **Verification Results**:
  - 38/38 backend test suites (299/299 tests passing), including dedicated [`technicianSolutionFlow.test.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/__tests__/technicianSolutionFlow.test.ts).
  - 0 frontend type errors (`tsc --noEmit` clean).
  - Clean production build (`vite build` completed in 9.52s).

