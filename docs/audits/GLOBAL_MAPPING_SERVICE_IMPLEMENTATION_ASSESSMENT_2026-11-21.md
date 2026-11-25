# Global Mapping Service — Implementation Assessment Report

**Document Type:** Implementation Assessment (delivery evaluation, not a finding re-audit)
**Assessment Date:** 2026-11-21
**Change Set Assessed:** the uncommitted 2026-11-20 remediation work in the Domain 17 mapping surface
**Baseline Audit:** [`GLOBAL_MAPPING_SERVICE_IMPLEMENTATION_AUDIT_2026-11-19.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/GLOBAL_MAPPING_SERVICE_IMPLEMENTATION_AUDIT_2026-11-19.md)
**Finding-level Verdicts:** [`GLOBAL_MAPPING_SERVICE_REMEDIATION_RE_ASSESSMENT_2026-11-20.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/GLOBAL_MAPPING_SERVICE_REMEDIATION_RE_ASSESSMENT_2026-11-20.md)
**Governing Standard:** `AGENTS.md` · `.agents/skills/bo-operational-governance/SKILL.md`
**Overall Implementation Score:** **1.85 / 5.00 (37%) — Below Acceptable**
**Acceptance Decision:** **REJECTED — conditional re-submission required**

---

## 1. Decision

| Item | Outcome |
|---|---|
| Implementation accepted? | **NO** |
| Certification of the change set? | **REFUSED** |
| Releasable to production? | **NO** |
| Recoverable by targeted patching? | **YES** — all blockers are localised |
| Recommended path | Apply P0 gates (§11), close the transformation defects (§10), re-run a route-level verification protocol (§9), re-submit |

### Rationale in one paragraph

The change set does real, verifiable engineering. Seven audit findings are genuinely closed. But the same change set introduces four critical defects on the HTTP boundary — a dictionary mass-delete path, a one-click purge of all custom fields, a team-scope query override, and caller-controlled Maker-Checker fields that permit self-approval. None of these is deep: each is a small, localised authorisation or scope decision made in the route layer. The implementation is therefore **rejected as delivered but recommended for repair**, not rewrite. The accompanying "100% CERTIFIED" sign-off is not admissible because its verification suite tests a locally re-implemented copy of the logic under test and never exercises the route layer where every new critical defect lives.

A second, independent defect family was confirmed after this assessment's first pass and is documented in §10: **the data-type transformation that the mapping service defines is not the transformation that runs before the central database insert.** The fix applied to the frontend preview path (`globalMappingService.cleanFieldValue`) was never mirrored into the backend path (`dataSanitizerService.cleanAmount`) that actually writes `central_transaction_repository`. The 1000× European decimal-comma defect is therefore still live on the persisting path, and the automation paths apply two further, divergent coercion implementations. Financial data integrity was re-scored from 4/5 to 2/5 accordingly.

---

## 2. Scope, Method and Evidence Basis

### 2.1 In scope

The Domain 17 mapping surface as modified on 2026-11-20:

| Layer | File | Lines changed |
|---|---|---|
| Frontend service | `frontend/src/services/globalMappingService.ts` | 366 |
| Backend route | `backend/src/routes/transactionSettings.ts` | 228 |
| Backend repository | `backend/src/store/postgresRepo.ts` | 431 (mixed domain) |
| Frontend UI | `frontend/src/components/GlobalTransactionSettings.tsx` | 35 |
| Frontend types | `frontend/src/types.ts` | 40 (mixed domain) |
| Backend consumer | `backend/src/routes/validationBoxes.ts` | 2 |
| Backend producer | `backend/src/services/ftpFileStagingService.ts` | 546 (predominantly other domain) |
| Frontend API | `frontend/src/api/client.ts` | 153 (other domain) |

Aggregate: **1,485 insertions / 316 deletions across 8 files.**

### 2.2 Out of scope

- The Domain 18 Executable Mapping & Recipe Engine (`047_executable_mapping_recipes.sql`, recipe stages, FTP durable ledger). Its code arrived in the same working tree and is assessed only for change-set entanglement (§4.2), not for functional correctness.
- Runtime browser behaviour and live database state. No session was exercised and no query was issued against `operational_workflow_db`.

### 2.3 Method

1. **Repository-first static inspection** of the current working tree — every claim below is anchored to `file:line`.
2. **Change-set archaeology** via `git diff HEAD` (HEAD = `be1e824`, 2026-11-13), used only to establish *what was delivered*, never to establish *what the baseline was*.
3. **Cross-layer trace** for each concern: DB schema → repository → route → API client → TypeScript type → UI consumer.
4. **Independent build verification** (not inherited from the remediation report).
5. **Evidence-quality review** of `verify_remediation_suite.ts`, performed statically and deliberately not executed (it performs live `INSERT`/`DELETE`).

### 2.4 Independent build results

| Check | Command | Result |
|---|---|---|
| Backend typecheck | `npx tsc --noEmit -p backend/tsconfig.json` | exit 0 |
| Frontend production build | `npm run build --prefix frontend` | clean, 0 errors |

Both claims in the remediation report are factually correct. They are also orthogonal to the defects: every critical issue in §7 is a **logic/authorisation** defect that a type checker cannot see.

### 2.5 Non-destructive statement

No application code, schema, migration, or persistent record was created, modified, or deleted by this assessment. All remediation items in §10 are proposals requiring approval under `AGENTS.md` §20.

---

## 3. Delivered Implementation Inventory

What was actually built, per area, with an honest verdict.

| # | Delivered capability | Location | Implemented? | Works as intended? |
|---|---|---|---|---|
| 1 | 18-column governance upsert for table mappings | `postgresRepo.ts:2671-2700` | Yes | **Partly** — columns persist, values are client-supplied |
| 2 | Lock enforcement on mapping write | `postgresRepo.ts:2651-2657` | Yes | **No** — self-approval bypass (§7 R-04) |
| 3 | Team-scoped mapping read | `postgresRepo.ts:2562-2572` | Yes | **No** — query override + empty-set fallback (§7 R-03) |
| 4 | Team resolution at the route | `transactionSettings.ts:192-194` | Yes | **No** — trusts `?teamId=`, wrong role casing |
| 5 | Symmetrical directory deletion | `transactionSettings.ts:156-162` | Yes | **Destructive** — absence-based mass delete (§7 R-01) |
| 6 | `tableMappings` accepted and persisted | `transactionSettings.ts:87,109-113,150,169-177` | Yes | **Yes** — MAP-06 genuinely closed |
| 7 | DDL relabelled "preview" + hardened | `globalMappingService.ts:384-441,635-700` | Yes | **Mostly** — Oracle dialect still backticked |
| 8 | Fabricated migration UI removed | `GlobalTransactionSettings.tsx:882-939` | **No** | **No** — `[DDL_EXEC]` / "0 errors detected" / 100% still hard-coded |
| 9 | EU decimal-comma disambiguation | `globalMappingService.ts:1156-1171` | Yes | **Yes** — MAP-13 genuinely closed |
| 10 | Strict date rejection (`null`, not passthrough) | `globalMappingService.ts:1215` | Yes | **Yes** |
| 11 | Column contract repaired | `validationBoxes.ts:411` | Yes | **Yes** — MAP-14 closed |
| 12 | `saveConfigToBackend` object signature | `globalMappingService.ts:1533-1552` | Yes | **Yes** — 3/3 call sites migrated |
| 13 | Observable store primitives | `globalMappingService.ts:202-225` | Yes | **No** — zero subscribers, zero consumers |
| 14 | `resetToDefaults` seeds 19 defaults | `globalMappingService.ts:249-261` | Yes | **Destructive** — triggers R-01 purge (§7 R-02) |
| 15 | Governance fields in frontend types | `types.ts:1236-1258` | Yes | **Partly** — no `PENDING_CHECKER_REVIEW` |
| 16 | MongoDB identifiers removed | `globalMappingService.ts:647` | Yes | **Yes** — MAP-22 closed |
| 17 | Hard-coded mirror-table default removed | `globalMappingService.ts` (deleted block) | Yes | **Yes** — Rule 4 improvement |
| 18 | Deep-cloned `getConfig()` | `globalMappingService.ts:223-225` | Yes | **Yes** — MAP-23 closed |
| 19 | Submit / approve / reject transitions for mappings | — | **No** | **Not implemented** — the review lifecycle still has no code path |
| 20 | Mapping change log / `#hashtag` binding | — | **No** | **Not implemented** |
| 21 | Version increment on persist | `globalMappingService.ts:1554-1559` | **No** | `version` still spread unchanged |

**Delivery ratio:** of 21 assessed capabilities, **8 are fully correct**, **3 are partly correct**, **5 are implemented but fail their stated purpose**, **2 are destructive**, and **3 are absent**.

A structural observation worth stating plainly: the two things the schema most clearly asks for — an approval workflow and an audit trail — are precisely the two that were not built, while the write path was opened to caller control to approximate them.

---

## 4. Change-Set Composition

### 4.1 Nothing in this change set is committed

`git status` shows every assessed file as `MM` or `M`/` M` against `HEAD = be1e824` (2026-11-13):

```
MM backend/src/routes/transactionSettings.ts
MM backend/src/store/postgresRepo.ts
MM backend/src/services/ftpFileStagingService.ts
MM frontend/src/services/globalMappingService.ts
MM frontend/src/types.ts
M  frontend/src/api/client.ts
 M frontend/src/components/GlobalTransactionSettings.tsx
 M backend/src/routes/validationBoxes.ts
```

Consequences:

- **No attributable change history.** Rule 22 requires architectural change traceability; a working-tree-only remediation has no author, no timestamp, no diff review, and no commit message.
- **No rollback point.** Reverting requires reconstructing intent by hand.
- **The build verification ran against a state that may never have existed on any branch.** A passing `tsc` on an uncommitted tree certifies only that transient directory.

### 4.2 The change set is entangled with an unrelated feature

Roughly half of the 1,485 insertions belong to the **Domain 18 recipe engine**, not the mapping remediation:

| Domain 17 (mapping) | Domain 18 (recipe / FTP) |
|---|---|
| `transactionSettings.ts` (228) | `ftpFileStagingService.ts` (~546) |
| `globalMappingService.ts` (366) | `client.ts` (~153, FTP/recipe APIs) |
| `GlobalTransactionSettings.tsx` (35) | `postgresRepo.ts` FTP-ledger methods (~300) |
| `validationBoxes.ts` (2) | `types.ts` recipe/ingestion fields (~25) |
| `postgresRepo.ts` mapping methods (~130) | |
| `types.ts` mapping fields (~15) | |
| **≈ 776 lines** | **≈ 700 lines** |

Two features with different risk profiles, different owners and different rollback boundaries were delivered in one uncommitted blob, and the certification report attributes all of it to the mapping audit. This is a Rule 20 (cross-layer invariance) and Rule 22 (traceability) hygiene failure independent of any individual bug. It also means the mapping remediation cannot be reverted without discarding the recipe engine, and vice versa.

### 4.3 No new migration accompanied the governance work

The 18 columns written by `saveTableMapping` come from `019_asset_sharing_and_lock_governance.sql`, which already existed. That is correct — no schema change was needed. However, the review lifecycle those columns encode (`status`, `maker_id`, `approved_by_*`, `checker_feedback`) remains unimplemented in code, so the schema now describes a workflow the application does not have. That mismatch is now *wider* than before the remediation, because the columns are actively written with meaningless values.

---

## 5. Quality Assessment by Dimension

Scoring: 1 = unacceptable, 2 = below acceptable, 3 = acceptable, 4 = good, 5 = exemplary. Weights are the assessor's judgement, disclosed for challenge.

| # | Dimension | Weight | Score | Weighted | Basis |
|---|---|---|---|---|---|
| 1 | Functional correctness of delivered changes | 20% | 3 | 0.60 | 10 of 21 capabilities fully correct; one UI flow still fabricates success |
| 2 | Persistence integrity & data durability | 15% | 2 | 0.30 | Durability achieved via absence-based deletion; concurrency-unsafe |
| 3 | Authorization & governance | 20% | 1 | 0.20 | Four critical bypasses introduced: scope override, self-approval, status forgery, team spoofing |
| 4 | Financial data integrity | 15% | 2 | 0.30 | Fixed in the frontend preview path only; the backend path that writes the central DB still strips decimal commas (`dataSanitizerService.cleanAmount:53`) — see §10 |
| 5 | Cross-layer consistency | 10% | 2 | 0.20 | `PENDING_CHECKER_REVIEW` still missing from the type union; role literals inconsistent across 4 files |
| 6 | Code hygiene & maintainability | 5% | 2 | 0.10 | ~370 dead lines retained; two auto-mappers retained; triple write on save |
| 7 | Verification & evidence quality | 10% | 1 | 0.10 | Suite asserts against a local re-implementation; route layer untested; destructive on live DB |
| 8 | Change-set hygiene & reversibility | 5% | 1 | 0.05 | Uncommitted; entangled with Domain 18; no rollback boundary |
| | **Total** | **100%** | | **1.85 / 5.00** | **37% — Below Acceptable** |

### Score interpretation

The distribution is the finding, not the total. The change set scores **2/5 on financial data integrity** — the *preview* transform is fixed while the *persisting* transform is not — and **1/5 on authorization**. That is the signature of work performed against the *visible* symptom list while the *structural* control model was reinterpreted ad hoc.

A repair that closes §7's four critical items and §10's four critical items would raise the weighted score to approximately **3.4/5**. The ceiling is set by the two capabilities never built (#19 approval workflow, #20 audit trail) and by the verification evidence remaining grade D until a route-level, non-destructive protocol exists.

---

## 6. AGENTS.md Compliance Matrix

| Rule | Requirement | Compliance | Evidence |
|---|---|---|---|
| 1 | Repository reality over assumptions | **Partial** | Both report and re-assessment are repo-anchored; the report's ledger however mis-maps audit IDs (§9.2) |
| 4 | No hard-coded external DB/table names | **Improved** | `DEFAULT_DATABASE_TABLE_MAPPINGS` removed; `'Sett · auth_log_tab · discovered'` notes remain at `globalMappingService.ts:53-55` |
| 7 | Maker-Checker, `makerId !== checkerId` | **Violated** | Self-approval possible; `makerId !== checkerId` absent from the domain (§7 R-04) |
| 8 | Universal `#hashtag` binding incl. DB table configs | **Not addressed** | No hashtag column or linkage for mappings |
| 11 | ANSI identifier quoting | **Compliant** | `generateSqlDdl` quotes and sanitises identifiers (`:397-401`) |
| 17 | No unconstrained deletion; mandatory dry run | **Violated** | Absence-based `DELETE` from `global_standard_directory` (`transactionSettings.ts:156-162`) |
| 19 | Team-scoped connection isolation | **Violated** | `?teamId=` override (`:193`); unscoped JSONB fallback (`postgresRepo.ts:2600-2606`) |
| 20 | Cross-layer invariance | **Partial** | Types/route/repo updated together; `PENDING_CHECKER_REVIEW` and role literals not synchronised |
| 22 | Anti-premature certification | **Violated** | "100% CERTIFIED" signed on non-admissible evidence (§9) |
| 23 | No `localStorage` as primary business store | **Unchanged violation** | Records, mappings, DDL history still cached and read first on boot |

**Score: 2 compliant/improved · 3 partial · 5 violated.** Rules 7, 17, 19 and 23 are the load-bearing governance rules for this subsystem, and three of the four are actively violated by the delivered code.

---

## 7. Defect & Regression Register

Severity: **C** = critical (data loss, authorization bypass, false certification) · **H** = high · **M** = medium.
"Introduced" = did not exist in the 2026-11-19 baseline.

### 7.1 Critical

| ID | Defect | Location | Introduced | Exploitability | Blast radius |
|---|---|---|---|---|---|
| **R-01** | `POST /schema/config` deletes every `global_standard_directory` row absent from the posted `standardFields` | `transactionSettings.ts:156-162` | **Yes** | Authenticated, one request | Total loss of dictionary entries created by any other actor |
| **R-02** | `resetToDefaults()` posts only the 19 hard-coded defaults → triggers R-01 | `globalMappingService.ts:249-261` + UI `:650` | **Yes** | One UI click | Permanent loss of all admin/team/discovery fields |
| **R-03** | `?teamId=` overrides JWT team scope; empty filtered result returns the **unscoped global JSONB** | `transactionSettings.ts:193`; `postgresRepo.ts:2600-2606` | **Yes** | Query-string parameter | Cross-team disclosure of DB/table/column metadata |
| **R-04** | `status`, `isLocked`, `approvedByUserId`, `makerId`, `teamId` all read from `req.body`; lock check compares actor to the same actor's self-declared approver | `transactionSettings.ts:212,230-235`; `postgresRepo.ts:2651-2667` | **Yes** | Crafted POST | Rule 7 defeated; forged approvals; mappings planted into other teams |

### 7.2 High

| ID | Defect | Location | Note |
|---|---|---|---|
| **R-05** | Role compared as `'ADMIN'\|'SUPER_ADMIN'` while platform canon is lowercase `'admin'` | `transactionSettings.ts:194`; `postgresRepo.ts:2653` | Admins locked out of legitimate override; `!user` treated as admin |
| **H-01** | Migration UI still fabricates execution (`[DDL_EXEC]`, `[INTEGRITY_CHECK] … 0 errors detected`, 100%, success toast) | `GlobalTransactionSettings.tsx:882-939` | MAP-01 substance unchanged at the operator surface |
| **H-02** | `subscribe()` has zero consumers; `getStandardFields()` read directly in render | `IssueDetailView.tsx:720`, `WorkspaceTaskCreator.tsx:187` | Stale-render defect unchanged |

### 7.3 Medium

| ID | Defect | Location |
|---|---|---|
| **R-06** | `'PENDING_CHECKER_REVIEW'` used by `makerCheckerService` and the verification suite, absent from `DbTableMappingConfig.status` | `types.ts:1243` |
| **M-01** | Triple write per mapping save | `GlobalTransactionSettings.tsx:424-442` + `globalMappingService.ts:1582` |
| **M-02** | Silent identity fallback in column translation | `globalMappingService.ts:1043` |
| **M-03** | Unguarded `.toLowerCase()` on possibly-empty `physicalColumn` | `globalMappingService.ts:1051` |
| **M-04** | Two auto-mapping engines with opposite PAN precedence | `globalMappingService.ts:1403-1404` vs `dataSanitizerService.ts:214-215` |
| **M-05** | `::`/`:` dual key materialisation | `postgresRepo.ts:2593-2594, 2730-2739` |
| **M-06** | `version` never incremented | `globalMappingService.ts:1554-1559` |
| **M-07** | `validateRequiredColumns` enforces nothing by default | `globalMappingService.ts:1918` |
| **M-08** | Single-sample date detection with confidence 1.0 | `globalMappingService.ts:1669` |
| **M-09** | Oracle dialect emitted with backtick quoting (invalid) | `globalMappingService.ts:395-397` |
| **M-10** | ~370 lines of unreachable public methods | `globalMappingService.ts` (7 methods) |

### 7.4 Defect density

**18 open defects** (4 C, 3 H, 11 M) against **1,485 inserted lines** ≈ 1 defect per 82 added lines — concentrated almost entirely in `transactionSettings.ts` (the route layer) rather than in the service layer. One of the eight modified files (`validationBoxes.ts`) contains **zero** open defects; `globalMappingService.ts` contains zero *critical* defects. The risk is not distributed: it is a route-layer problem.

---

## 8. Cross-Layer Consistency Assessment

| Concern | DB | Repo | Route | Type | UI | Verdict |
|---|---|---|---|---|---|---|
| Dictionary CRUD | `global_standard_directory` | delete-by-id exists | **delete-by-absence** | ok | calls reset/save | **Broken** — R-01/R-02 |
| Mapping governance | 18 columns (mig 019) | all 18 written | all 18 from `req.body` | 10 fields typed | not displayed | **Broken** — R-04 |
| Mapping team scope | `team_id` | filter correct | **override + fallback** | `teamId?` | not used | **Broken** — R-03 |
| Mapping review status | `status DEFAULT 'DRAFT'` | persisted | from `req.body` | lacks `PENDING_CHECKER_REVIEW` | not displayed | **Broken** — R-04/R-06 |
| Column object shape | `columns JSONB` | passthrough | passthrough | `{globalKey, physicalColumn}` | consumer reads `physicalColumn` first | **Fixed** (MAP-14) |
| DDL generation | no table | — | no DDL route | — | fabricates execution | **Split** — service ok, UI false |
| Amount/date transform | — | — | — | — | — | **Fixed** (MAP-13) |
| Version lineage | `version`, `version_history` | persisted | accepted | typed | writes history | **Cosmetic** — never incremented |
| `localStorage` | — | — | — | — | records + DDL history | **Unchanged violation** |

The pattern is consistent and diagnosable: **the repository layer is the best code in the change set; the route layer is the worst.** Every critical defect is a decision made between `req` and the repository call.

---

## 9. Verification Evidence Assessment

### 9.1 What the suite actually verifies

| Suite | Mechanism | Admissible? |
|---|---|---|
| 1 — Amount/Date | Local re-implementation of `cleanFieldValue` (`:23-90`); imports are only `queryPg`, `postgresRepo` | **No** — tests a copy, not the shipped function |
| 2 — Type mapping | Same local-duplicate pattern | **No** |
| 3 — Table schema | `information_schema` column existence | **Yes**, but proves schema not behaviour |
| 4 — Lock | Repository-level different-user rejection | **Partial** — omits self-approval |
| 5 — Team scope | Repository called with explicit `teamId` args | **Partial** — bypasses the route, so R-03 is invisible |
| 6 — Deletion | Direct repo delete against live DB | **No** as certification evidence — destructive |
| 7 — Tautology | Self-referential assertions | **No** |

### 9.2 Why the headline figure is not usable

1. **Coverage gap by construction.** No suite calls `transactionSettingsRouter`. All four critical defects live there. A suite that cannot reach the failing layer cannot certify it.
2. **The lock test proves the opposite of what is claimed.** It shows an *unauthorised* user is blocked. It does not test the authorised-looking path where the actor pre-declares itself as approver.
3. **Destructive verification.** Suites 4–6 `INSERT`/`DELETE` on `operational_workflow_db`, breaching Rule 17's dry-run mandate.
4. **Ledger drift.** The report's remediation-to-finding mapping does not reconcile with the audit numbering (e.g. MAP-20 is presented as "Lock Protection" while the audit's MAP-20 is the identity-fallback defect).
5. **Green build ≠ correct behaviour.** Both builds genuinely pass; neither can observe an authorization decision.

### 9.3 Evidence grade

**Grade: D — not admissible.** The correct evidence for this change set is a route-level `supertest` matrix with three identities and a rolled-back transaction. That does not exist yet.

---

## 10. Data Transformation & Automation Audit

This section evaluates the implementation against the **intended architecture**: that a saved mapping is not merely a column-renaming table, but an **ordered, recorded transformation program** applied to the data before persistence, and reused identically by manual task creation, the central database insert, and hashtag/automation execution.

### 10.1 Stated intended model

1. A mapping is created during task creation **or from any workspace** and captures both column mapping *and* the operations to apply.
2. Those operations are **recorded as ordered steps**.
3. The steps are **replayed step by step on the data**.
4. The saved mapping is applied **before the transaction is inserted into the database**.
5. The same saved mapping is applied when data arrives through **hashtags / automation**.

### 10.2 Current reality — four independent transform implementations

| # | Engine | Location | Type authority | Applied at | Persists to |
|---|---|---|---|---|---|
| E1 | `cleanFieldValue` + `transformRowToGlobalSchema` | `globalMappingService.ts:1136, 1231` (frontend) | `GlobalMappingConfig.standardFields[].dataType` | UI preview, workspace record creation | `workspace_table_records`, `localStorage` |
| E2 | `sanitizeRows` + `cleanAmount`/`cleanDate`/`cleanBoolean`/`cleanPan` | `dataSanitizerService.ts:31-149, 334-480` (backend) | `global_standard_directory.data_type` | `issues.ts:181` (preview), `datasetIngestionService.ts:71` (ingest) | `task_dataset_transactions`, **`central_transaction_repository`** |
| E3 | Inline coercion block | `ftpFileStagingService.ts:1373-1386` (backend) | Mirror column `dataType` string | FTP scheduled/manual staging | `mirror_*` UNLOGGED tables |
| E4 | `recipeExecutionService.executeRecipe` | `recipeExecutionService.ts` (backend) | Ordered template steps (`orderedRecipeSteps`, cleaning/split/merge/translate) | `issues.ts:140, 342`; `misc.ts:1240, 1264`; `ftpFileStagingService.ts:1337`; `hashtagService.ts:218, 637` | Feeds E1/E2/E3 — no persistence of its own |

**E4 is the only engine that matches the intended model** (ordered, recorded, replayable steps). It is genuinely well-distributed: five entry points invoke it, and FTP staging logs the audit trail (`ftpFileStagingService.ts:1343`). **It is also the only engine that does not enforce data types.**

### 10.3 Conformance to the intended model

| Intended requirement | Status | Basis |
|---|---|---|
| Mapping carries operations, not just column names | **Partial** | Template/recipe steps exist; type coercion lives elsewhere and is not part of the mapping asset |
| Operations recorded as ordered steps | **Yes** (E4) | `orderedRecipeSteps` + `recipeRes.auditTrail` |
| Steps replayed step-by-step on the data | **Yes** (E4) | Five call sites; audit trail logged at `ftpFileStagingService.ts:1343` |
| Saved mapping applied before DB insert | **Partial** | True only on the manual `POST /issues/:id/ingest` route; automation cannot reach the central repository |
| Same mapping applied in hashtags | **Partial** | Recipe steps yes (`hashtagService.ts:218`); type coercion no |
| One authoritative transform | **No** | Four engines, three coercion behaviours, three EU-comma policies |

### 10.4 Findings

Severity as §7. All are distinct from the §7 register.

| ID | Finding | Location | Sev |
|---|---|---|---|
| **T-01** | The European decimal-comma defect is **still live on the persisting path**. `cleanAmount` strips every comma unconditionally, so `"1.234,56"` → `1.23456`. The corrected logic exists only in the frontend preview engine. | `dataSanitizerService.ts:52-56` vs `globalMappingService.ts:1156-1171` | **C** |
| **T-02** | Unparseable dates are written as **raw strings into a `TIMESTAMPTZ` column**: `cleanDate` returns `null`, then the caller substitutes the original string instead of dropping the value. | `dataSanitizerService.ts:448-454`; column type from `mapTypeToPostgres` → `TIMESTAMPTZ` (`schemaMigrationService.ts:25-28`) | **C** |
| **T-03** | Task rows are committed **before** the central upsert, and the upsert failure is swallowed with a `console.warn`. Result: `task_dataset_transactions` holds the rows while `central_transaction_repository` silently does not. | `datasetIngestionService.ts:210` then `:213-217` | **C** |
| **T-04** | Silent type loss: `dataType` is derived from `standardKeyMap`. A target key present in the mapping but absent from `global_standard_directory` falls back to `'string'` and receives no type coercion, with no warning. | `dataSanitizerService.ts:420-421` | **C** |
| **T-05** | Ambiguous slash dates are resolved **differently** by preview and persistence: `new Date('05/06/2026')` = 6 May (MM/DD) on persist, while `detectDateFormat` reports DD/MM to the operator. | `dataSanitizerService.ts:116` vs `globalMappingService.ts:1750-1758` | H |
| **T-06** | FTP staging is a **third** coercion engine with its own comma-strip bug, silent `NULL` on unparseable numerics/dates, and `FALSE` for any unrecognised boolean. | `ftpFileStagingService.ts:1373-1386` | H |
| **T-07** | Hashtag file ingestion applies recipe steps but **no schema/type cleaning**, and persists to `hashtag_collected_transactions` — never to the central repository. | `hashtagService.ts:201-261`; `misc.ts:381-429` | H |
| **T-08** | The scheduled hashtag runner has **no `FILE_INGESTION` branch** — only `DATABASE_DIRECT_SCANNER`, `EXTRACTION_STAGING`, `AUDITING_GOVERNANCE`. A scheduled file-ingestion hashtag is silently skipped with no run record and no error. | `hashtagSchedulerService.ts:59-182` | H |
| **T-09** | Hashtag execution silently caps processing at **500 records** with no warning or remainder reporting. | `misc.ts:382` | M |
| **T-10** | The auto-initialised hashtag preset hard-codes schema keys (`Transaction_ID`, `Card_Number`, `Amount_USD`, `Auth_Time`) and interpolates the tag into a SQL template string. | `misc.ts:349-362` | M |
| **T-11** | `ON CONFLICT` hard-codes `is_duplicate = TRUE`, so re-ingesting the same task marks every row as a duplicate of itself at column level, contradicting the service's own in-memory duplicate logic. | `postgresRepo.ts:1970` | M |
| **T-12** | Canonical keys with no migrated physical column are written only into `canonical_data` JSONB, never as a column — invisible to SQL-based validation and reconciliation. | `postgresRepo.ts:1978-1985` | M |

### 10.5 Automation reachability

| Entry point | Recipe steps | Type coercion | Can reach `central_transaction_repository`? |
|---|---|---|---|
| Manual task creation → `POST /issues/:id/ingest` | **Yes** | **Yes** (E2) | **Yes** — the only path |
| Hashtag file execution (`POST /hashtags/:tag/execute-file`) | **Yes** | **No** | **No** → `hashtag_collected_transactions` |
| Scheduled hashtag cron | **No** for `FILE_INGESTION` (unhandled branch) | No | **No** |
| FTP manual/scheduled staging | **Yes** (if template bound) | **Yes** (E3, divergent) | **No** → `mirror_*` |
| DB-direct scanner hashtag | n/a (SQL criteria) | n/a | **No** (read-only scan) |

**Consequence:** the canonical central ledger is populated by exactly one route. Every automated and hashtag-driven ingestion lands in a different store with a different coercion policy. The intended model — "the saved mapping is used before the transaction is inserted in db **or** used in hashtags" — is therefore not implemented as a single contract; it is implemented as five separate, partially-overlapping behaviours.

Two silent degradations compound this:

- FTP staging applies the recipe **only if a template is bound** (`if (boundTemplate)`, `ftpFileStagingService.ts:1334`). With no bound template, the rows are inserted into the mirror table with **no mapping and no recipe** — only the inline coercion of E3 — and nothing is logged to indicate the mapping was skipped.
- Hashtag execution behaves the same way: if `preset.mappingTemplateId` is unset (`hashtagService.ts:209`), the recipe block is bypassed entirely and only dictionary lookups run.

### 10.6 Root cause

There is no component that owns "compile the saved mapping into an executable transform". The recipe engine owns *user-defined* operations; each persistence path independently re-invents *schema-driven* coercion. Because the E2 fixes were applied to E1, the two engines now disagree on the two most financially material behaviours (decimal comma, invalid date).

### 10.7 Target design (proposal)

1. **One entry point:** `mappingExecutionService.applyMapping(rows, { template, directoryFields, mode })` returning `{ rows, auditTrail, dropped[] }`.
2. **Fixed internal order:** recipe steps → schema type coercion → required-field validation → projection. Recorded as one ordered audit trail including the coercion stage.
3. **One coercion implementation** shared by ingest, hashtag, and FTP paths; EU-comma and strict-date rules defined once.
4. **Compiled mapping artefact:** persist the resolved transform (steps + field types + version hash) so automation replays a *pinned* version rather than re-resolving at runtime.
5. **Single sink contract:** either route all automation through `central_transaction_repository`, or document each sink explicitly with its retention and queryability semantics.
6. **Fail-loud persistence:** the central upsert must participate in the same transaction as the task rows, or surface a blocking error — never a warning after commit.
7. **Scheduler parity:** implement the `FILE_INGESTION` branch so scheduled hashtags use the same transform path as manual execution.

---

## 11. Acceptance Decision & Conditions Precedent

### 11.1 Decision

**REJECTED.** The change set may not be merged, certified, or released in its current form. The rejection is **remediable, not terminal**: the failing surface is small and well identified.

### 11.2 Conditions precedent (all must be satisfied before re-submission)

| Gate | Condition | Target |
|---|---|---|
| **CP-1** | Remove absence-based deletion. Accept an explicit `deletedFieldIds[]`, or restrict deletion to `DELETE /directory/:id`. Assert with a test that a subset payload deletes nothing. | `transactionSettings.ts:156-162` |
| **CP-2** | Make `resetToDefaults` non-destructive: server-side "restore seeds, preserve custom", plus a confirmation dialog naming affected fields. | `globalMappingService.ts:249-261`, `GlobalTransactionSettings.tsx:650` |
| **CP-3** | Delete the `?teamId=` override; remove the empty-set JSONB fallback. | `transactionSettings.ts:193`, `postgresRepo.ts:2600-2606` |
| **CP-4** | Server-derive `makerId`, `makerName`, `status`, `isLocked`, `approvedBy*`, `teamId`. Reject `status:'APPROVED'` in a plain save; add `/submit`, `/approve`, `/reject` enforcing `makerId !== checkerId`. | `transactionSettings.ts:212-236`, `postgresRepo.ts:2659-2668` |
| **CP-5** | Remove or wire the fabricated `[DDL_EXEC]` migration UI. | `GlobalTransactionSettings.tsx:882-939` |
| **CP-6** | Centralise `isAdminRole()` on lowercase canon; add a unit test for `'admin'`. | 4 files (§6 Rule 20) |
| **CP-7** | Add `'PENDING_CHECKER_REVIEW'` to the mapping status union. | `types.ts:1243` |
| **CP-8** | Commit the change set in reviewable slices (mapping separately from recipe), with the architectural change summary appended to `MASTER_ARCHITECTURE_INDEX.md`. | repo |
| **CP-9** | Replace the verification suite with a non-destructive, route-level protocol (§9) and attach the output. | `backend/src/scripts/` |
| **CP-10** | **Mirror the decimal-comma and strict-date fixes into the persisting path.** Port the `globalMappingService.cleanFieldValue` number/date logic into `dataSanitizerService.cleanAmount` / `cleanDate`; drop unparseable dates instead of substituting the raw string. | `dataSanitizerService.ts:31-125, 448-454` |
| **CP-11** | **Make the central upsert transactional or fail-loud.** Move `upsertCentralTransactions` into the same transaction as `createTaskDatasetTransactions`, or return a blocking error instead of `console.warn`. | `datasetIngestionService.ts:210-217` |
| **CP-12** | **Introduce one transform authority.** Implement `mappingExecutionService.applyMapping()` as the single ordered pipeline (recipe steps → type coercion → required validation → projection) and route manual ingest, hashtag execution and FTP staging through it. Remove the inline coercion block at `ftpFileStagingService.ts:1373-1386`. | new service + 3 call sites |
| **CP-13** | **Automation parity.** Implement the `FILE_INGESTION` branch in the hashtag scheduler, remove the silent 500-row cap, and define an explicit sink contract for automation (either central repository or a documented alternative). | `hashtagSchedulerService.ts:59-182`, `misc.ts:382` |

### 11.3 Recommended sequencing

**Workstream A — boundary hardening (§7, CP-1…CP-9)**
1. **CP-1 → CP-3** first (stop the data loss and the leak — these are active risks in any running instance).
2. **CP-4 → CP-7** next (restore the governance contract).
3. **CP-5** independently (operator-trust surface; no dependency).
4. **CP-9**, then **CP-8** last so the commit records a verified state.

**Workstream B — transformation authority (§10, CP-10…CP-13)**
5. **CP-10 → CP-11** first: they are small and stop ongoing financial corruption and silent ledger loss on the path that is already in use.
6. **CP-12** next: build `mappingExecutionService.applyMapping()` and rewire the three call sites. Land it behind the existing endpoints so no UI contract changes.
7. **CP-13** last: automation parity depends on CP-12 existing.

Workstream B may run concurrently with A — they touch different files — but must not be committed in the same slice (CP-8 rationale).

### 11.4 What must be preserved during repair

The following are correct and should not be disturbed by the repair: EU decimal-comma disambiguation, strict date rejection, ANSI-quoted DDL generation, the `tableMappings` persistence path, the object-shaped `saveConfigToBackend` signature, the repaired `validationBoxes` column consumer, deep-cloned `getConfig()`, and the removal of the hard-coded mirror-table default and MongoDB identifiers.

> **Estimated repair surface.** §7/§11 boundary hardening: **~120 lines across 3 files**, no architectural change. §10 transformation unification: **one new service plus three call-site rewires**, moderate size but architecturally significant. The two workstreams are independent and should be sequenced separately.

---

## 12. Assessment Limitations

- Static analysis only; no browser session, no live query execution.
- The Domain 18 recipe engine was functionally assessed only at its call boundaries (§10.5); its internal step semantics were not re-verified.
- Hashtag collected-transaction retention and queryability semantics were not traced beyond the write site (`misc.ts:428`).
- Severity weights and dimension weights are assessor judgement and are disclosed for challenge; the factual findings do not depend on them.
- Four of the eight modified files cannot be attributed cleanly between domains at line granularity without per-hunk review; the split in §4.2 is approximate and marked as such.

---

## 13. Change Log

| Date | Change |
|---|---|
| 2026-11-21 | Initial implementation assessment of the 2026-11-20 Domain 17 change set. Decision: REJECTED with 9 conditions precedent. Documentation-only; no code, schema, or data modified. |
| 2026-11-21 | **Amendment 1 — Data Transformation & Automation Audit (§10).** Confirmed that the type-based transform which populates `central_transaction_repository` is `dataSanitizerService`, not the mapping service, and that it retains the 1000× decimal-comma defect (T-01), writes unparseable dates into `TIMESTAMPTZ` (T-02), and fails silently after task rows commit (T-03). Audited automation usage: four transform engines (E1–E4), five entry points, only one of which can reach the central ledger; scheduled hashtag runner has no `FILE_INGESTION` branch (T-08). Financial-integrity dimension re-scored 4/5 → 2/5; overall score 2.15 → **1.85 / 5.00 (37%)**; conditions precedent extended to CP-13. |

## 14. Related Documents

- [`GLOBAL_MAPPING_SERVICE_IMPLEMENTATION_AUDIT_2026-11-19.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/GLOBAL_MAPPING_SERVICE_IMPLEMENTATION_AUDIT_2026-11-19.md) — baseline findings.
- [`GLOBAL_MAPPING_SERVICE_REMEDIATION_RE_ASSESSMENT_2026-11-20.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/GLOBAL_MAPPING_SERVICE_REMEDIATION_RE_ASSESSMENT_2026-11-20.md) — per-finding verdicts that this assessment summarises at delivery level.
- [`GLOBAL_MAPPING_SERVICE_REMEDIATION_ASSESSMENT_REPORT_2026-11-20.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/GLOBAL_MAPPING_SERVICE_REMEDIATION_ASSESSMENT_REPORT_2026-11-20.md) — the "100% CERTIFIED" claim refused in §9.
- [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md) — governance entry point.
- [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) — Rules 4, 7, 8, 11, 17, 19, 20, 22, 23.
