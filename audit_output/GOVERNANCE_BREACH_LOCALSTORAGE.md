# GOVERNANCE BREACH REGISTER — AGENTS.md Rule 23 (localStorage as Primary State Store)

**Date**: 2026-10-10 · **Rule violated**: AGENTS.md Rule 23 — "Strict Prohibition of Client-Side `localStorage` as Primary State Store" + skill §6 forbidden anti-patterns
**Method**: Full-codebase grep (`localStorage`, `sessionStorage`, zustand `persist`) across `frontend/src` and `backend/src`; every hit classified; HEAD-vs-working-tree origin checked via `git show HEAD:<file>`.

**Rule text (key clause)**: localStorage "must NEVER be used as the primary storage, system of record, or source of truth for any application entity, business dictionary, template, transformation rule, mapping, or workflow configuration… permitted solely for non-business, device-local UI ergonomics (such as sidebar collapsed toggles)… secondary optimistic read cache that is unconditionally hydrated and governed by PostgreSQL."

**Backend**: zero `localStorage`/`sessionStorage` usage (clean). **Frontend**: 49 `localStorage` hits + 4 `sessionStorage` hits across 14 files. No zustand persist middleware.

---

## CONFIRMED BREACHES

### B-1 · CRITICAL — Core business entities persisted via `usePersistentState` (App.tsx:61-94)

19 `usePersistentState` keys form the application's **Core State Engine** ("// 1. Core State Engine (safely persisted with usePersistentState)", `App.tsx:60`):

| Key | Entity | Business data? | Backend-hydrated in inspected effect (App.tsx:243-269)? |
|---|---|---|---|
| `it_users` | Users | Yes | **Not observed** |
| `it_session` | Current session user | Yes | **Not observed** |
| `it_issues` | Issues / operational tasks | Yes | **Not observed** |
| `it_hashtags` | Hashtag presets | Yes | **Not observed** |
| `it_plugins` | Plugins | Config | Yes (`:267-269`) |
| `it_databases` | Database connections | Yes (+ credentials risk) | **Not observed** |
| `it_systems` | Environment systems | Config | **Not observed** |
| `it_teams` | Teams | Yes | **Not observed** |
| `it_team_tasks` | Team tasks | Yes | Yes (`:243-245`) |
| `it_team_insights` | Team insights | Yes | Yes (`:246-248`) |
| `it_team_messages` | Team chat messages | Yes | Yes (`:249-251`) |
| `it_notifications` | Notifications | Yes | Yes (`:255-257`) |
| `it_direct_messages` | Direct messages | Yes | Yes (`:252-254`) |
| `it_query_approvals` | Query approval requests | Yes | Yes (`:258-260`) |
| `it_db_access_requests` | DB access requests | Yes | Yes (`:261-263`) |
| `it_connection_usage_logs` | Connection usage logs | Yes | Yes (`:264-266`) |
| `it_team_tasks`/`it_team_insights`/`it_team_messages` | (above) | — | — |

**Why it breaches**:
1. First-run state is seeded from **frontend constants** (`INITIAL_USERS`, `INITIAL_ISSES`, `INITIAL_HASHTAGS`, …) — the frontend, not PostgreSQL, is the origin of record on first run.
2. `usePersistentState` writes **every** state mutation to `localStorage` (`usePersistentState.ts:37`) — localStorage is the write-through primary store.
3. Only **9 of 19** keys are overridden by backend hydration in the inspected effect; unconditional hydration for `it_users`, `it_session`, `it_issues`, `it_hashtags`, `it_databases`, `it_systems`, `it_teams` was **not observed** — on backend failure the app runs on localStorage state (App.tsx:274-276 explicitly logs "using localStorage cache fallback").
4. `it_databases` may persist `DatabaseConnection` objects (credential-bearing) into localStorage — compounding Rule 21 credential-protection risk.

**Origin**: present in **HEAD** (`git show HEAD:frontend/src/App.tsx` → 18 `usePersistentState` hits). **Not** introduced by the working tree.
**Evidence**: `App.tsx:60-94`, `usePersistentState.ts:12-41`, `App.tsx:236-276`.
**Remediation**: migrate all 19 entities to PostgreSQL-backed REST hydration; reduce `usePersistentState` to UI-only keys; make backend hydration unconditional (blocking render until resolved or explicitly degraded); never seed business entities from frontend constants.
**Regression test**: integration test that clears localStorage, boots the app against a seeded test DB, and asserts every entity loads from `/api/*` with zero localStorage reads for business keys.

### B-2 · CRITICAL — Transaction/workspace records in `workspace_table_records`

- `WorkspaceTable.tsx:40-46` (load), `:105` (save on data change), `:122` (save on update), `:135` (clear)
- `IssueDetailView.tsx:1329-1332`, `:1423-1426` (merge-and-save into localStorage)
- `WorkspaceTaskCreator.tsx:741-744` (merge-and-save)
- `globalMappingService.ts:533` (read)

**Why it breaches**: actual ingested transaction/dataset records — business data — are persisted to `localStorage` as a cross-view store. PostgreSQL `task_dataset_transactions` is the mandated system of record (skill §2). localStorage is ~5MB, device-local, unversioned, and unbounded — records silently vanish across devices/browsers and can desync from the DB.
**Origin**: present in **HEAD** (5 hits in HEAD's `WorkspaceTable.tsx`).
**Remediation**: route all record persistence through `task_dataset_transactions` via `/api/issues/:id/transactions`; delete the localStorage path.
**Regression test**: assert no `workspace_table_records` key is written during task creation/record edit flows.

### B-3 · CRITICAL (working-tree) — Transformation rules in `system_transformation_rules`

- `SystemSettings.tsx:162` (load), `:191` (save)

**Why it breaches**: "transformation rule" is an **explicitly prohibited** category in Rule 23. Saved rules land only in localStorage — no PostgreSQL persistence observed at the save site.
**Origin**: **working tree only** — `git show HEAD:frontend/src/components/settings/SystemSettings.tsx | grep -c system_transformation_rules` → **0**. Introduced by the uncommitted Domain 7 changes (`SystemSettings.tsx` is in the modified set).
**Remediation**: persist transformation dictionaries to PostgreSQL (relational table + REST route) per Rule 23's "Mandatory PostgreSQL First"; keep localStorage only as a read cache.
**Regression test**: save a rule → assert a PostgreSQL row exists and survives localStorage clearing.

### B-4 · HIGH (working-tree) — Value translation dictionaries read from `system_value_translation_dictionaries`

- `StandardFileIngestionWorkspace.tsx:146`

**Why it breaches**: value translation dictionaries are a business dictionary (explicitly prohibited category). Read side observed in an untracked new file; writer not located in this audit — if the writer is also localStorage, this is a full breach; if the writer is PostgreSQL, this is a compliant cache read. **Classification pending writer verification** (see §Unresolved).
**Origin**: working tree (untracked new component).

### B-5 · HIGH — Workspace configuration persisted only to `operational_workspace_config_v1`

- `WorkspaceSettings.tsx:83` (`STORAGE_KEY`), `:114-120` (init from localStorage), `:125-133` (`handleSaveDraft` → localStorage only, "saved as draft"), `:135-139` (`handleApplyChanges` → localStorage only, "configuration applied successfully")
- `ErrorBoundary.tsx:83` (removes the key as crash recovery — proof the key is load-bearing)

**Why it breaches**: "workflow configuration" / workspace configuration is a prohibited category; `handleApplyChanges` reports success after writing **only** to localStorage, with no observed API call. A backend `workspaceSettingsProposals` route exists (`server.ts:68`), indicating the intended persistence path is PostgreSQL-governed.
**Origin**: present in **HEAD** (`operational_workspace_config_v1` referenced in HEAD's ErrorBoundary).
**Remediation**: route apply/save through the workspace-settings proposal/approval API; localStorage at most as a draft cache.

### B-6 · HIGH — Global mapping schema & central table caches (`global_mapping_schema_config_v2`, `central_transaction_repo_v2`)

- `globalMappingService.ts:52-53` (keys), `:85-128` (loadConfig from localStorage), `:165,187,216,1319` (saveConfig → localStorage), `:463-567` (central table cache load/save)

**Why it is (partially) compliant / partially breaching**: the service explicitly documents "PostgreSQL `global_standard_directory` and `database_table_mappings` are the sole authority" (`:51`) and runs `hydrateFromBackend()` (`:66-71, 133+`) — the correct secondary-cache pattern. **However**, `saveConfig`/central-table saves write localStorage at the cited lines; whether every save is accompanied by a PostgreSQL write was **not verified line-by-line in this audit**. If any save path writes localStorage without a backend write, the cache becomes the system of record → breach.
**Origin**: present in **HEAD** (13 localStorage hits in HEAD's `globalMappingService.ts`).
**Verification needed**: trace `saveConfig` callers (`SystemSettings`, `DatabaseColumnConfiguration`, `WorkspaceTaskCreator`) to confirm dual-write to PostgreSQL.

### B-7 · MEDIUM — Legacy workflow-config key residue (`operational_database_validation_workflows_v2`)

- `ErrorBoundary.tsx:82` (removeItem only; **no writer found** in current code)

**Why it matters**: residual evidence that validation workflow configurations were previously localStorage-persisted. No active writer → no active breach, but the key must stay dead; reintroducing a writer would breach Rule 23's "workflow configuration" prohibition outright.

### B-8 · MEDIUM (security) — JWT stored in `localStorage`

- `client.ts:14-34` (`operational_workflow_jwt_token`)

**Why it matters**: not a Rule 23 business-state breach, but tokens in localStorage are exposed to XSS theft. Recommend in-memory token + httpOnly cookie or silent refresh. (Out of Rule 23 scope; recorded as a security observation.)

---

## PERMITTED USAGES (ephemeral UI ergonomics — Rule 23 compliant)

| Key | Location | Classification |
|---|---|---|
| `it_sidebar_collapsed` | `SideNav.tsx:61-72` | ✅ Sidebar toggle — the rule's own example |
| `it_team_rail_open` | `TeamWorkspace.tsx:276-287` | ✅ Rail toggle |
| `preferred_ftp_server_id` | `FtpFileStagingSettings.tsx:91,843,1000` | ✅ Last-selection memory; server remains authority |
| sessionStorage reload guard | `lazyWithRetry.ts:19-39` | ✅ Ephemeral reload-debounce flag |

---

## Summary

| Severity | Count | IDs |
|---|---|---|
| CRITICAL | 3 | B-1 (core state engine, HEAD), B-2 (workspace records, HEAD), B-3 (transformation rules, working tree) |
| HIGH | 3 | B-4 (translation dictionaries, working tree), B-5 (workspace config, HEAD), B-6 (mapping caches — pending dual-write verification, HEAD) |
| MEDIUM | 2 | B-7 (legacy key residue), B-8 (JWT in localStorage) |
| Permitted | 4 | sidebar/rail toggles, FTP selection memory, reload guard |

**Impact on audit verdict**: B-1, B-2, B-5, and B-6 exist in **HEAD commit `8d573ca`** — therefore the Rule 23 breach is **not** merely a working-tree defect. The HEAD verdict is revised from `ACCEPTED WITH CONDITIONS` to **`NOT ACCEPTED — CONFIRMED DEFECTS`** (blocking governance breach). The working tree additionally carries B-3 and B-4.

**Unresolved (requires verification)**:
1. B-4: locate the writer of `system_value_translation_dictionaries` (grep found only the reader at `StandardFileIngestionWorkspace.tsx:146`).
2. B-6: confirm every `saveConfig`/central-table save path dual-writes to PostgreSQL (`globalMappingService.ts:165,187,216,565,1319` callers).
3. B-1: confirm whether additional hydration effects outside `App.tsx:236-269` unconditionally hydrate `it_users`, `it_session`, `it_issues`, `it_hashtags`, `it_databases`, `it_systems`, `it_teams` from `/api/*`.

*Audit performed read-only. No code modified.*
