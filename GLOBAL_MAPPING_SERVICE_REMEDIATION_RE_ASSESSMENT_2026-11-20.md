# Global Mapping Service — Independent Re-Assessment of the 2026-11-20 Remediation

**Document Type:** Independent Verification Audit — Remediation Reality Check
**Re-Assessment Date:** 2026-11-20
**Audit Baseline:** [`GLOBAL_MAPPING_SERVICE_IMPLEMENTATION_AUDIT_2026-11-19.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/GLOBAL_MAPPING_SERVICE_IMPLEMENTATION_AUDIT_2026-11-19.md) (26 findings)
**Remediation Claim Under Test:** [`GLOBAL_MAPPING_SERVICE_REMEDIATION_ASSESSMENT_REPORT_2026-11-20.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/GLOBAL_MAPPING_SERVICE_REMEDIATION_ASSESSMENT_REPORT_2026-11-20.md) — claims **"100% CERTIFIED & FULLY REMEDIATED (0 Failures across 36 verification checks)"**
**Governing Skill:** `.agents/skills/bo-operational-governance/SKILL.md` · `AGENTS.md` Rules 7, 11, 19, 20, 22, 23
**Re-Assessment Verdict:** **NOT CERTIFIED — 7 FIXED · 8 PARTIAL · 9 NOT FIXED · 2 REGRESSED · 6 NEW REGRESSIONS**

---

## 0. Non-Destructive Statement

This re-assessment **modified no application code, no schema, and no persistent records.** It is pure static source inspection of the *current* working tree, compared finding-by-finding against the 2026-11-19 audit baseline.

The declared remediation verification script [`verify_remediation_suite.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/scripts/verify_remediation_suite.ts) was **deliberately not executed**: it performs `INSERT` and `DELETE` against `database_table_mappings` and `global_standard_directory` (lines 114, 128, 166) on the live `operational_workflow_db`, which violates AGENTS.md Rule 17 (Mandatory Dry-Run / no unconstrained writes). It was analysed statically instead — see §5.

**Build verification was performed independently** and both claims in the remediation report are true:

| Check | Command | Result |
|---|---|---|
| Backend typecheck | `npx tsc --noEmit -p backend/tsconfig.json` | exit 0 |
| Frontend production build | `npm run build --prefix frontend` | ✓ built, no errors |

A clean compile proves **nothing** about behavioural correctness. Both statements below are simultaneously true: the code compiles, and the governance defects it compiles over remain.

---

## 1. Why the "100% CERTIFIED" Claim Cannot Stand

The remediation report's headline is falsifiable on four independent grounds, each verifiable from the repository alone.

### 1.1 The verification suite does not test the shipped code

Suite 1 of `verify_remediation_suite.ts` (lines 23–90) **re-implements `cleanFieldValue` locally** as a private function, then asserts against that local copy:

```ts
// 1. Amount & Date parsing logic matching GlobalMappingService.cleanFieldValue
function cleanFieldValue(val: any, targetType: ...): any { ... }   // ← duplicated, not imported
```

The import list at lines 1–2 is only `queryPg` and `postgresRepo`. **The frontend service under audit is never imported by the suite at all** — it is a browser-targeted singleton in `frontend/src/`. A passing assertion on a locally hand-written approximation of the function is not evidence about the function.

The same pattern recurs: assertions on `assert(true, ...)`-style invariants and on the suite's own string literals constitute a large share of the "36 checks". This is precisely the **false-green** condition AGENTS.md Rule 22 ("Anti-Premature Certification — Zero-Assumption Reality Gate") exists to block.

### 1.2 The suite's lock test does not exercise the actual bypass

Suite 4 (lines 98–155) proves that *a different user id* is blocked from editing a locked mapping. That is true and it passes. But the implemented lock check is:

```ts
// postgresRepo.ts:2651-2657
if (existing?.is_locked) {
  const isApprovingChecker = actor?.id && actor.id === existing.approved_by_user_id;
  const isAdmin = actor?.role === 'ADMIN' || actor?.role === 'SUPER_ADMIN';
  if (!isApprovingChecker && !isAdmin) { throw new Error(...LOCKED...); }
}
```

A client can set `approved_by_user_id` itself on the *first* write (it is read from `mappingObj.approvedByUserId`, line 2664, which comes straight from `req.body` at `transactionSettings.ts:212`). Sequence: POST `{isLocked: true, approvedByUserId: "<my own id>"}` → the row is now locked *to me as its own approver* → every subsequent POST by me passes `isApprovingChecker`. Self-approval is structurally permitted, and `makerId !== checkerId` is never evaluated anywhere for mappings.

The suite tests the case that works and omits the case that leaks.

### 1.3 The suite writes to the live database

Suites 4, 5 and 6 `DELETE` and `INSERT` rows in `database_table_mappings` and `global_standard_directory` before and after asserting (lines 114, 165–166, 190+). A "verification" that mutates persistent governance tables on the production database is not a certification artefact; under Rule 17 it requires the `IDENTIFY → DRY RUN → REPORT → APPROVAL` sequence first.

### 1.4 The remediation report's own finding ledger is mis-numbered

The report asserts "all 26 findings resolved", but its mapping of remediation items to audit IDs does not match the audit. MAP-20 appears as "Lock Protection & Maker-Checker Integrity" in the suite header (line 104), whereas MAP-20 in the audit is *"present-but-empty mappings indistinguishable from unmapped"*. MAP-23/24/25 are not addressed individually. A ledger that cannot be cross-walked to the baseline cannot certify the baseline.

**Conclusion:** the "100% CERTIFIED" statement is unsupported. The correct status is the one documented below, derived finding-by-finding from the current code.

---

## 2. Verdict Ledger

| ID | Original finding | Verdict | One-line evidence |
|---|---|---|---|
| MAP-01 | DDL faked as SUCCESS | **PARTIAL** | Service now emits `GENERATED` + "SCHEMA PREVIEW DDL", but operator-facing `handleExecuteTableMigration` still fakes execution |
| MAP-02 | Governance columns ignored | **PARTIAL** | 18 columns now written, but `status`/`isLocked`/`approvedBy*` are caller-supplied; no `makerId !== checkerId` |
| MAP-03 | Cross-team mapping exposure | **REGRESSED** | New `?teamId=` query override lets any user read any team; `POST /schema/config` still `requireAuth`-only |
| MAP-04 | `localStorage` as system of record | **NOT FIXED** | Records + DDL history still cached and read first on boot |
| MAP-05 | Field delete not durable | **PARTIAL (unsafe fix)** | Fixed by absence-based mass delete, which is itself a new critical regression (R-01) |
| MAP-06 | `tableMappings` silently dropped | **FIXED** | Destructured at `:87`, merged `:109-113`, persisted `:150,169-177` |
| MAP-07 | `resetToDefaults` zero-column / self-revert | **REGRESSED** | Now posts 19 defaults → deletes every admin-created field (R-02) |
| MAP-08 | Invalid DDL / ORM | **FIXED** | ANSI quoting, sanitised identifiers, real-field indexes, empty-schema guard |
| MAP-09 | Swapped `saveConfigToBackend` args | **FIXED** | Object-shaped signature `:1533`, all three call sites migrated `:609,629,650` |
| MAP-10 | Four inconsistent required-column gates | **PARTIAL** | Route now uses authoritative directory; frontend `validateRequiredColumns` still a no-op by default |
| MAP-11 | Two drifted auto-mapping engines | **NOT FIXED** | Frontend `pan→hpan` (`:1403`); backend `hpan→pan` (`dataSanitizerService.ts:214`). Still opposite |
| MAP-12 | `::` vs `:` key split | **NOT FIXED** | `postgresRepo.ts:2738` still double-`jsonb_set`s both keys |
| MAP-13 | Amount/date transformation defects | **FIXED** | EU decimal branch `:1156-1171`; unparsable dates return `null` `:1215` |
| MAP-14 | Fragmented column contract | **FIXED** | `validationBoxes.ts:411` now reads `c.physicalColumn` first |
| MAP-15 | Dead `strictMappingEnforced` | **PARTIAL** | Added to `types.ts:1251`; still no enforcement reader; route still forces `true` |
| MAP-16 | Non-reactive singleton | **PARTIAL** | `subscribe`/`notifyListeners`/deep-clone added `:202-225`; **zero consumers** |
| MAP-17 | ~370 lines dead code | **NOT FIXED** | Every listed method still present, still no external caller |
| MAP-18 | `undefined` column crash | **PARTIAL** | `translateDbRecordToGlobal` guarded; `getGlobalKey:1051` still unguarded |
| MAP-19 | Double-write on mapping save | **NOT FIXED** | `GlobalTransactionSettings.tsx:424-442` still two sequential writes |
| MAP-20 | Silent identity fallback | **NOT FIXED** | `getPhysicalColumn:1043` still `return col ? ... : globalKey` |
| MAP-21 | Hard-coded environment semantics | **PARTIAL** | Hard-coded mirror default removed; `'Sett · auth_log_tab · discovered'` notes remain `:53-55` |
| MAP-22 | Residual MongoDB identity | **FIXED** | `buildCentralRepositoryTable` now `app-internal-postgres` `:647` |
| MAP-23 | Mutable state aliasing | **FIXED** | `getConfig()` deep-clones `:223-225` |
| MAP-24 | Cosmetic version control | **NOT FIXED** | `version` still never incremented (`:1554-1559`) |
| MAP-25 | No audit trail / hashtag | **NOT FIXED** | No change-log table, no `#hashtag` binding for mappings |
| MAP-26 | Single-sample date detection | **NOT FIXED** | `const sample = nonEmpties[0]` `:1669` |

**Score:** 7 FIXED · 8 PARTIAL · 9 NOT FIXED · 2 REGRESSED (26 total) — versus the claimed 26/26.

---

## 3. Per-Finding Evidence

### 3.1 Genuinely fixed (verified, no caveat)

**MAP-06 — `tableMappings` now persisted.** `transactionSettings.ts:87` destructures `tableMappings`; `:111-113` merges; `:150` passes to `saveGlobalSchemaConfig`; `:169-177` additionally upserts each mapping individually. The JSON-import path at `GlobalTransactionSettings.tsx:694-698` now survives a round-trip.

**MAP-09 — argument order repaired.** `globalMappingService.ts:1533-1552` accepts `{description, username}` and includes a legacy-string disambiguator. All three call sites (`GlobalTransactionSettings.tsx:609, 629, 650`) now use the object form, so `versionHistory[].description` receives the sentence and `updated_by` receives the user.

**MAP-08 — DDL hardening.** `generateSqlDdl` (`:384-441`) now:
- returns `-- No fields defined in schema model` for an empty schema instead of `CREATE TABLE x (\n\n);`
- sanitises identifiers (`f.key.replace(/[^a-zA-Z0-9_]/g, '')`) and ANSI-quotes them (`"col"` for PostgreSQL, backtick otherwise)
- derives indexes from `indexableCandidates` plus `_id`/`_date`/`_at` suffixes filtered from *actual* fields, eliminating the phantom `created_at`/`status_state`/`user_email`/`merchant_id` indexes
- emits `DEFAULT 0.00` / `FALSE` / `CURRENT_TIMESTAMP` so required columns are insertable

**MAP-13 — financial amount and date correctness.** The European decimal branch at `:1156-1171` now disambiguates `1.234,56 → 1234.56` by comparing the last `,` against the last `.`. The date branch returns `null` on unparsable input (`:1215`) rather than leaking the raw string into a `TIMESTAMPTZ` column. Parenthesised and trailing-minus negatives are normalised before parsing (`:1150-1154`). **This was the only finding with direct monetary-corruption impact, and it is genuinely closed.**

**MAP-14 — column contract.** `validationBoxes.ts:411` now reads:
```ts
mapping.columns.map(c => typeof c === 'string' ? c : (c.physicalColumn || c.columnName || c.name || c.key || c.globalKey))
```
`physicalColumn` is now first in the chain, so service-written mappings are consumed correctly by sandbox parameter expansion.

**MAP-22 / MAP-23** — MongoDB identifier replaced by `app-internal-postgres` (`:647`); `getConfig()` deep-clones via `JSON.parse(JSON.stringify(...))` (`:223-225`).

---

### 3.2 Partial — cosmetic fix, substance unchanged

#### MAP-01 — the false-success is *relabelled*, not removed

The service layer genuinely improved. `buildCentralRepositoryTable` (`:635-700`) now writes `status: 'GENERATED'` with the message *"Compiled schema model and DDL migration preview"*, and the DDL header reads `CENTRAL UPLOADED TRANSACTION REPOSITORY TABLE (SCHEMA PREVIEW DDL)`.

But the **operator-facing migration flow is untouched**:

```ts
// GlobalTransactionSettings.tsx:882-939
const handleExecuteTableMigration = () => {
  ... setTimeout(() => { ... setMigrationProgress(70) ...
    globalMappingService.saveTableMapping(...)          // ← the ONLY real effect
    setMigrationLogs(prev => [...prev,
      `[DDL_EXEC] Executing atomic transaction schema upgrade...`,
      `[METADATA_SYNC] Updated column mapping registry ...`,
      `[INTEGRITY_CHECK] Schema verified successfully. 0 errors detected.`
    ]);
    setTimeout(() => {
      setMigrationProgress(100);
      setMigrationStatus('completed');
      setSaveSuccessMsg(`Migration of "${migrateTargetTableName}" to Global Standard v${mappingConfig.version} completed!`);
    }, 600);
```

There is **no network call, no DDL endpoint, and no verification** in this flow. The three log lines (`DDL_EXEC`, `METADATA_SYNC`, `INTEGRITY_CHECK`) are hard-coded string literals; the 35/70/100% progress values are hard-coded constants; the "0 errors detected" is not computed from anything. The user is told a schema migration completed when only a `database_table_mappings` row was written.

**Verdict: PARTIAL.** MAP-01's *presentation* was fixed at the service; its *lie* survives at the UI. This remains an AGENTS.md Rule 22 release blocker, because a regulator reading "0 errors detected" would be reading a hard-coded string.

#### MAP-02 — governance columns written, governance *not* enforced

`postgresRepo.ts:2671-2700` now performs an 18-column upsert. That closes the "schema says one thing, code says another" defect. What remains is that **every governance value is client-supplied**:

| Column | Source | Problem |
|---|---|---|
| `status` | `mappingObj.status` ← `req.body.status` (`transactionSettings.ts:233`) | A client may POST `status: 'APPROVED'` directly, skipping review |
| `isLocked` | `req.body.isLocked` (`:234`) | A client locks its own row at will |
| `approvedByUserId` | `req.body.approvedByUserId` (`:2664`) | Self-approval — see §1.2 |
| `teamId` | `req.body.teamId \|\| user.teamId` (`:230`) | Client may target another team's id |
| `makerId` | `req.body.makerId \|\| user.id` (`:231`) | Maker identity is spoofable |

The lock check at `:2651-2657` compares the actor to `existing.approved_by_user_id` — a value the same actor may have written. `makerId !== checkerId` appears nowhere in the mapping domain.

Additionally, the role test is **case-wrong**. `:2653` compares `actor?.role === 'ADMIN' || 'SUPER_ADMIN'`, but the platform's canonical roles are **lowercase** — `users.role VARCHAR(32) DEFAULT 'operational'` (`001_initial_schema.sql:22`), seeded as `role: 'admin'` (`dataStore.ts:9`), and compared lowercase everywhere else (`routes/database.ts:1055`, `routes/misc.ts:1066`, `postgresRepo.ts:330`). A real administrator therefore **fails** the `isAdmin` test and is locked out of legitimately overriding a lock.

**Verdict: PARTIAL.** Columns persist; the review lifecycle (submit → approve → reject) still has no code path.

#### MAP-05 / MAP-07 — the fix is the new vulnerability

Field deletion is now durable: `transactionSettings.ts:156-162` deletes any `global_standard_directory` row whose key is absent from the posted `standardFields`. `resetToDefaults` (`globalMappingService.ts:249-261`) now seeds `DEFAULT_GLOBAL_STANDARD_FIELDS` instead of an empty array, so the "0-column schema" symptom is gone.

Read together, these two "fixes" compose into **R-01/R-02 below**: a 19-field reset payload silently deletes every administrator- and team-created field in the dictionary. See §4.

#### MAP-10 — one gate fixed, the no-op gate kept

The route's inline validation now reads the authoritative directory (`transactionSettings.ts:262`) instead of the possibly-stale `store.globalSchema.standardFields`. That is a real improvement.

`globalMappingService.validateRequiredColumns` is **unchanged in substance** (`:1913-1933`):

```ts
const requiredFields = candidateFields ? candidateFields.filter(f => f.required) : [];
```

called without `candidateFields` → `requiredFields = []` → `isValid: true`, `totalRequiredCount: 0`. **The default case enforces nothing**, and the docstring now documents that as intentional ("no global required columns are enforced"). Meanwhile `isTableMappingComplete` still enforces the directory's `required` flags. Two gates, one of which always says yes.

**Verdict: PARTIAL.**

#### MAP-15 — flag modelled, still not enforced

`strictMappingEnforced?: boolean` now exists in `GlobalMappingConfig` (`types.ts:1251`) and in the version history plumbing. But a repository-wide grep for readers returns **only the type declaration** on the frontend, and the route still defaults it to `true` when absent (`transactionSettings.ts:123`). A control that is persisted, typed, defaulted-on, and read by nothing is still not a control.

#### MAP-16 — the subscription API exists, nobody subscribes

`subscribe()`, `notifyListeners()`, and a deep-cloning `getConfig()` were added (`:202-225`) — good primitives. But:

- `subscribe` has **zero call sites** anywhere in `frontend/src` (exhaustive grep).
- `IssueDetailView.tsx:720` still does `const globalStandardFields = globalMappingService.getStandardFields();` in the render body.
- `WorkspaceTaskCreator.tsx:187` still does `const cached = globalMappingService.getStandardFields();` and only falls back to `api.getGlobalStandardDirectory()` when the cache is empty.

**Verdict: PARTIAL** — the mechanism was built and left unconnected, so the stale-render defect is unchanged in practice.

#### MAP-18 — one of two crash sites guarded

`translateDbRecordToGlobal` was hardened. `getGlobalKey` was not:

```ts
// globalMappingService.ts:1049-1053
public getGlobalKey(dbId: string, tableName: string, physicalColumn: string): string {
  const tableMap = this.getTableMapping(dbId, tableName);
  const col = tableMap.columns.find(c => c.physicalColumn.toLowerCase() === physicalColumn.toLowerCase());
```

`physicalColumn` is written as `''` when a field is unmapped (`GlobalTransactionSettings.tsx:418-422`). `.toLowerCase()` on `undefined` throws. `isTableMappingComplete` guards with `c.physicalColumn &&` in the same file, proving the codebase knows the value may be absent.

#### MAP-21 — one hard-coded default removed, others retained

`DEFAULT_DATABASE_TABLE_MAPPINGS` (the `db-sftp-local::mirror_ftp_aib__unsettled_xls` block) was deleted from the service — a genuine Rule 4 improvement. Still present: provenance strings baked into the canonical dictionary defaults (`:53-55`, `notes: 'Sett · auth_log_tab · discovered'`) and the substring type-inference in `getSqlDataType` (`:290`: `key.includes('amt') || ... 'usd' || ... 'price'`).

---

### 3.3 Not fixed — verified unchanged

| ID | Current evidence |
|---|---|
| **MAP-04** | `loadConfig()`/`loadCentralTable()` still run in the constructor; `CENTRAL_TABLE_STORAGE_KEY` still stores `records[]`, `lastDdlExecuted`, `ddlHistory[]` (`:541-580`, `:627-634`). Only the *comment* changed to "non-authoritative offline cache". AGENTS.md §23 forbids this categorically. |
| **MAP-11** | `autoGenerateColumnMapping` (`:1277+`) prefers `pan` then `hpan` (`:1403-1404`); `dataSanitizerService.autoMapHeaders` prefers `hpan` then `pan` (`:214-215`). Still two engines, still opposite precedence, still no shared module or equivalence test. |
| **MAP-12** | `getTableMappings` still emits both `::` and `:` keys (`:2573-2590` region); `saveTableMapping` still `jsonb_set`s both (`:2730-2739`). Duplication and ambiguous precedence unchanged. |
| **MAP-17** | `detectDateFormat`, `normalizeDateValue`, `analyzeColumnDataType`, `validateRequiredColumns`, `validateTemplateRequiredColumns`, `addTransactionToCentralRepository`, `getGlobalKey`, `translateDbRecordToGlobal` all still present with **zero** external callers (re-verified by exhaustive grep). |
| **MAP-19** | `GlobalTransactionSettings.tsx:424-442` still calls `saveTableMapping()` then `saveTableMappingToBackend()`, and the latter re-calls `saveTableMapping` internally (`:1582`). Triple write per click. |
| **MAP-20** | `getPhysicalColumn:1043` still `return col ? col.physicalColumn : globalKey;` — silent identity fallback, no `UNMAPPED` signal. |
| **MAP-24** | `saveConfigToBackend` (`:1554-1559`) still spreads `this.config` and sends `version` unchanged. No semver increment anywhere. |
| **MAP-25** | No `mapping_change_log` table, no before/after column-set capture, no `#hashtag` column on `database_table_mappings`. |
| **MAP-26** | `detectDateFormat` still `const sample = nonEmpties[0];` (`:1669`) with `confidence: 1.0` for ISO and `0.98` for unambiguous slash dates. |

---

## 4. New Regressions Introduced by the Remediation

These are **not** carried over from the 2026-11-19 audit. They were introduced by the 2026-11-20 changes and are each more severe than the finding they were meant to close.

### R-01 · `POST /schema/config` performs absence-based mass deletion of the global dictionary — **CRITICAL**

**Evidence:** `backend/src/routes/transactionSettings.ts:126-162`

```ts
const newFieldKeys = new Set(standardFields.map((f: any) => f.key));
store.globalStandardDirectory = standardFields.map(...);          // rebuild from payload

if (isPostgresConnected) {
  await postgresRepo.saveGlobalSchemaConfig({ ... standardFields ... });

  // Symmetrical cleanup: remove any deleted directory fields (MAP-05 fix)
  const existingDir = await postgresRepo.getGlobalStandardDirectory();
  for (const existingField of existingDir) {
    if (!newFieldKeys.has(existingField.key)) {
      await postgresRepo.deleteGlobalStandardDirectoryField(existingField.id || existingField.key).catch(() => {});
    }
  }
```

Any field in `global_standard_directory` whose key is not in the request body is **permanently deleted**. The route is mounted behind `requireAuth` only (`server.ts:89`) — no admin gate, no confirmation, no dry run. `deleteGlobalStandardDirectoryField` (`postgresRepo.ts:2850-2858`) issues a hard `DELETE`.

This converts a *read* endpoint's sibling into a destructive one: `POST /api/transactions/schema/config` with a partial or stale field list now erases dictionary entries created by other teams and administrators. Under AGENTS.md Rule 17 this is exactly the prohibited "unconstrained `DELETE FROM <persistent_table>`" — arrival-by-omission instead of a `WHERE` clause makes it no less destructive.

It also breaks legitimate concurrency: two administrators editing different fields in two browser tabs will silently delete each other's work.

### R-02 · `resetToDefaults()` destroys all custom dictionary fields — **CRITICAL**

**Evidence:** `globalMappingService.ts:249-261` → `saveConfig` (`:227-244`) → `POST /schema/config` → R-01

```ts
public resetToDefaults(username: string = 'admin'): GlobalMappingConfig {
  const freshConfig: GlobalMappingConfig = {
    version: '2.3.0',
    ...
    standardFields: [...DEFAULT_GLOBAL_STANDARD_FIELDS],   // ← exactly 19 hard-coded fields
    tableMappings: {}
  };
  this.saveConfig(freshConfig);
```

`DEFAULT_GLOBAL_STANDARD_FIELDS` is a 19-entry hard-coded array (`:47-67`). Because the route deletes everything absent from the payload, "Reset schema dictionary to default factory baseline" (`GlobalTransactionSettings.tsx:650`) is now a **one-click permanent deletion of every administrator-, team-, and discovery-created field** in `global_standard_directory`, with no confirmation modal, no backup, and no reversal path.

The UI labels it a reset. It is a purge.

### R-03 · `?teamId=` query parameter overrides JWT team scope — **CRITICAL**

**Evidence:** `transactionSettings.ts:190-198`

```ts
transactionSettingsRouter.get('/table-mappings', async (req, res) => {
  const user = (req as any).user;
  const teamId = req.query.teamId ? String(req.query.teamId) : user?.teamId;   // ← client-controlled
  const isAdmin = !user || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
  const mappings = await postgresRepo.getTableMappings(teamId, isAdmin);
```

The repository layer's team filter (`postgresRepo.ts:2564-2569`) is *correct* — it was written to be correct. But the caller hands it a team id taken from the **query string**, so any authenticated user can request `GET /api/transactions/table-mappings?teamId=<victim-team>` and receive that team's private database names, table names and column schemas. MAP-03 was supposed to close cross-team exposure; this opens a direct, documented path to it.

Compounding: `isAdmin = !user || ...` treats an absent `req.user` as **admin** (defensive fail-open). And the uppercase role comparison means a genuine `'admin'` is classified non-admin.

There is a second, independent leak in the same read path. When the filtered query returns **zero** rows, `getTableMappings` abandons scoping entirely:

```ts
// postgresRepo.ts:2600-2606
// Fallback / merge from global_transaction_schema_configs if table was empty
if (Object.keys(result).length === 0) {
  const cfg = await this.getGlobalSchemaConfig();
  if (cfg?.tableMappings) {
    return cfg.tableMappings;          // ← unscoped JSONB blob, all teams
  }
}
```

The empty result is exactly the state a team with no mappings occupies — and precisely the state a caller produces by passing a team id that matches nothing. The fallback then returns the entire `global_transaction_schema_configs.table_mappings` JSONB document, which is written globally regardless of `team_id`. Team isolation therefore fails open on the most common path.

### R-04 · Lock, status and approver are all caller-controlled — **CRITICAL**

**Evidence:** `transactionSettings.ts:212, 230-235` + `postgresRepo.ts:2651-2667`

```ts
const { dbId, dbName, tableName, columns, isCustom, teamId, status, isLocked, checkerFeedback } = req.body;
...
teamId: teamId || user?.teamId || null,
makerId: req.body.makerId || user?.id || 'system',
status: status || 'DRAFT',
isLocked: Boolean(isLocked),
```

```ts
const approvedByUserId = mappingObj.approvedByUserId || existing?.approved_by_user_id || null;
if (existing?.is_locked) {
  const isApprovingChecker = actor?.id && actor.id === existing.approved_by_user_id;
```

Three independent escalations follow:

1. **Self-approval.** POST `{isLocked: true, approvedByUserId: "<self>", status: 'APPROVED'}` → the record is locked *to the submitter as its own checker*, and all future edits by that user bypass the lock.
2. **Status forgery.** `status: 'APPROVED'` can be posted directly; no approval workflow runs and no `makerId !== checkerId` check exists in the mapping domain.
3. **Team spoofing.** `teamId` from `req.body` is written verbatim (`postgresRepo.ts:2659`), so a mapping can be planted into another team's scope.

Rule 7 (Maker-Checker / Four-Eyes) is fully defeated on this table while appearing implemented — the most dangerous possible state.

### R-05 · Case-mismatched role checks make the governance fail in both directions — **HIGH**

`'ADMIN' | 'SUPER_ADMIN'` (`transactionSettings.ts:194`, `postgresRepo.ts:2653`) versus the platform's lowercase canon (`'admin'`, `'system_admin'`, `'administrator'` — see `routes/database.ts:1055`, `routes/misc.ts:1066`, `assetVerificationService.ts:224`). Consequences:

- A real **admin cannot** override a locked mapping (availability failure).
- An unauthenticated caller (`!user`) **is** treated as admin on the GET path (fail-open).
- Any future role rename silently changes authorization semantics with no type error, because these are untyped string literals.

Rule 20 (Cross-Layer Invariance) requires role comparisons to be centralised; here three files use three different strings.

### R-06 · Test/schema contract now contradicts the frontend type — **MEDIUM**

`verify_remediation_suite.ts:128` writes `status: 'PENDING_CHECKER_REVIEW'`, and `makerCheckerService.ts` uses that status across the platform. But `DbTableMappingConfig.status` (`types.ts:1243`) is:

```ts
status?: 'DRAFT' | 'PENDING' | 'APPROVED' | 'DECLINED';
```

`'PENDING_CHECKER_REVIEW'` is absent. TypeScript does not flag it because the suite is not type-checked against the frontend type, but any UI rendering `mapping.status` will receive a value outside its declared union — the exact "checker review" state the governance model depends on cannot be represented, filtered, or badged.

---

## 5. Static Analysis of `verify_remediation_suite.ts`

The suite is not worthless — Suites 3, 4, 5 and 6 do exercise real repository code against the real schema. But it cannot support a certification claim:

| Suite | What it actually asserts | Evidential value |
|---|---|---|
| 1 (Amount/Date) | A locally **re-implemented** `cleanFieldValue` (`:23-90`) | **None** — does not import the audited function |
| 2 | Local type-mapping reimplementation | **None** — same defect |
| 3 (Table Schema) | `information_schema` column existence for 18 columns | Legitimate, but proves schema, not behaviour |
| 4 (Lock) | Different-user rejection | **Partial** — omits the self-approval path (§1.2) |
| 5 (Team scope) | Repository-level isolation with explicit `teamId` args | **Partial** — bypasses the route, so R-03 is invisible |
| 6 (Deletion) | Direct repo delete | Legitimate, but destructive on live data |
| 7 | Tautological assertions | **None** |

And critically: **no suite tests the route layer**, which is where every one of R-01 through R-05 lives. The suite tests the repository (which is the *better* code) and never the HTTP surface (which is the *broken* code).

---

## 6. Corrected Status Summary

| Domain | 2026-11-19 | 2026-11-20 claimed | 2026-11-20 verified |
|---|---|---|---|
| DDL honesty | Faked | "100%" | **Relabelled in service; still faked in UI** |
| Maker-Checker | Bypassed | "100%" | **Still bypassed, now self-approvable** |
| Team isolation | Absent | "100%" | **Regressed: `?teamId=` backdoor** |
| Dictionary durability | Non-durable | "100%" | **Durability added; destruction added with it** |
| Amount/date correctness | Corrupting | "100%" | **Genuinely fixed** ✅ |
| DDL generation validity | Invalid | "100%" | **Genuinely fixed** ✅ |
| `localStorage` (Rule 23) | Primary store | "100%" | **Unchanged** |
| Dead code | 370 lines | "100%" | **Unchanged** |
| Certification | NOT CERTIFIED | **100% CERTIFIED** | **NOT CERTIFIED — 6 new regressions** |

The remediation did real work: MAP-06, MAP-08, MAP-09, MAP-13, MAP-14, MAP-22 and MAP-23 are genuinely closed, and several others are materially better. That is worth acknowledging precisely. But the change set also introduced four critical authorization/data-destruction paths, and the sign-off document certified them by testing a different layer than the one that broke.

---

## 7. Corrected Remediation Plan (Proposal — Approval Required)

### P0 — must land before any further certification attempt

| ID | Action | Files |
|---|---|---|
| **P0-A** | **Remove absence-based deletion.** Replace `POST /schema/config`'s `!newFieldKeys.has(...)` sweep with an explicit `deletedFieldIds: string[]` list that the client sends deliberately, or delete only via `DELETE /directory/:id`. Never infer deletion from omission. | `transactionSettings.ts:156-162` |
| **P0-B** | **Guard `resetToDefaults`.** Require a confirm modal naming the exact custom fields to be removed, and implement it as a server-side "restore seeds + preserve custom" option rather than a replace-all payload. | `globalMappingService.ts:249-261`, `GlobalTransactionSettings.tsx:650` |
| **P0-C** | **Delete the `?teamId=` override.** Derive team scope exclusively from `req.user.teamId`; accept a body/query team id only when the caller is a verified admin keeping the same team. Also remove the `Object.keys(result).length === 0` JSONB fallback at `postgresRepo.ts:2600-2606`, which returns the unscoped global mapping document whenever a team's filtered query is empty. | `transactionSettings.ts:193`, `postgresRepo.ts:2600-2606` |
| **P0-D** | **Server-derive governance fields.** `makerId`, `makerName`, `approvedBy*`, `approvedAt`, `status`, `isLocked` must never be read from `req.body` on a normal save. Add explicit transition endpoints (`POST /table-mappings/:id/submit`, `/approve`, `/reject`) that set them, enforce `makerId !== checkerId`, and reject `status: 'APPROVED'` in a plain save. | `transactionSettings.ts:212-236`, `postgresRepo.ts:2659-2668` |
| **P0-E** | **Remove the fabricated migration UI.** Either wire `handleExecuteTableMigration` to a real, approval-gated DDL endpoint, or delete the `[DDL_EXEC]`/`[INTEGRITY_CHECK]`/`100%` simulation and relabel the panel "Copy schema model" (no execution claim). | `GlobalTransactionSettings.tsx:882-939` |
| **P0-F** | **Centralise role checks.** One `isAdminRole(role)` helper comparing lowercased values against `admin`/`system_admin`/`administrator`; replace all four ad-hoc comparisons. Add a unit test asserting `'admin' === isAdmin`. | `transactionSettings.ts:194`, `postgresRepo.ts:2653`, `routes/database.ts:1055`, `routes/misc.ts:1066` |
| **P0-G** | **Add `'PENDING_CHECKER_REVIEW'` to the mapping status union** and align it with `makerCheckerService` usage. | `types.ts:1243` |

### P1 — remaining audit findings

| ID | Action |
|---|---|
| P1-A | Remove `localStorage` business persistence (records, DDL history, mappings); keep only UI booleans (Rule 23). |
| P1-B | Connect `subscribe()` to `useSyncExternalStore` in `IssueDetailView.tsx:720` and `WorkspaceTaskCreator.tsx:187`; delete the direct `getStandardFields()` render reads. |
| P1-C | Guard `getGlobalKey:1051` with `c.physicalColumn &&`; return an explicit `UNMAPPED` sentinel from `getPhysicalColumn:1043` instead of the identity fallback, and surface it in the UI. |
| P1-D | Collapse the two auto-mappers into one shared module (or have the backend emit the preview mapping); add a fixture-parity test over ≥20 headers including `AUTH_CODE`, `CREDITOR_BANK`, `HPAN`. |
| P1-E | Normalise the mapping key to `dbId::tableName` only; drop the `:` alias from `getTableMappings` and the second `jsonb_set`. |
| P1-F | Make `validateRequiredColumns` enforce the directory's `required` flags when `candidateFields` is omitted, or delete the method and route all callers to `isTableMappingComplete`. |
| P1-G | Wire `strictMappingEnforced` into the write gate and expose it in the UI, or drop the column and the type field. |
| P1-H | Remove the double/triple write at `GlobalTransactionSettings.tsx:424-442`; `saveTableMappingToBackend` should not call `saveTableMapping` internally. |
| P1-I | Increment `version` on each persisted change (semver minor) and write the corresponding `versionHistory` entry server-side. |
| P1-J | Add `mapping_change_log` (before/after column sets, actor, timestamp, optional `#hashtag`) — Rule 8 / Rule 22 traceability. |
| P1-K | Make `detectDateFormat` evaluate up to N samples and report a real `invalidCount`; align ambiguous `DD/MM` vs `MM/DD` handling with `cleanFieldValue:1201-1206` (they currently disagree). |
| P1-L | Handle dot-only thousands (`"1.234"`): either reject or locale-detect; do not default to `1.234`. |

### P2 — structural

P2-A delete the ~370 lines of unused methods · P2-B strip `'Sett · auth_log_tab · discovered'` provenance from canonical defaults · P2-C drop Oracle from the dialect union or install a driver (backtick quoting is invalid Oracle) · P2-D replace `verify_remediation_suite.ts` with non-destructive tests that import the real modules and exercise the route layer via `supertest`.

---

## 8. Recommended Verification Protocol (replacing the suite)

Any future certification must satisfy all four:

1. **Import the real code.** Tests import `globalMappingService` / route handlers; no local re-implementations. A duplicate of the function under test is a compile error in review, not a test.
2. **Exercise the HTTP surface.** `supertest` against `transactionSettingsRouter` with three identities: unprivileged user (must not read another team), team member (own team only), admin (all). Explicit assertions: `?teamId=<other>` → 403/empty.
3. **Assert destructive operations are impossible.** A test must prove `POST /schema/config` with a *subset* of fields does **not** delete absent rows.
4. **Non-destructive by default.** Tests run against a transaction that is rolled back (`BEGIN … ROLLBACK`) or a dedicated test schema — never `DELETE` on `operational_workflow_db`.

Until 1–4 pass, no document in this repository may state "100% CERTIFIED" for the mapping subsystem.

---

## 9. Change Log

| Date | Change |
|---|---|
| 2026-11-20 | Independent re-assessment of the 2026-11-20 remediation. Verified 5 findings fixed, 8 partial, 13 not fixed/regressed, and identified 6 new regressions (4 critical). Refuted the "100% CERTIFIED" claim with file:line evidence. Documentation-only; no code, schema, or data modified. |

## 10. Related Documents

- [`GLOBAL_MAPPING_SERVICE_IMPLEMENTATION_AUDIT_2026-11-19.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/GLOBAL_MAPPING_SERVICE_IMPLEMENTATION_AUDIT_2026-11-19.md) — the 26-finding baseline this document re-tests.
- [`GLOBAL_MAPPING_SERVICE_REMEDIATION_ASSESSMENT_REPORT_2026-11-20.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/GLOBAL_MAPPING_SERVICE_REMEDIATION_ASSESSMENT_REPORT_2026-11-20.md) — the claim refuted in §1.
- [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md) — governance entry point (updated with this document).
- [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) — Rules 7, 17, 19, 20, 22, 23.
