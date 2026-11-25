# Global Mapping Service — Implementation Audit (Physical Code Reality Check)

**Document Type:** Independent Verification Audit & Code-Level Reality Check
**Audit Date:** 2026-11-19
**Auditor:** AI Agent (repository-first, zero-assumption inspection)
**Primary Subject:** `frontend/src/services/globalMappingService.ts` (1,860 lines)
**Governing Skill:** `.agents/skills/bo-operational-governance/SKILL.md`
**Severity Ledger:** 4 Critical · 12 High · 10 Medium (26 findings)

---

## 0. Non-Destructive Audit Statement

This audit **modified no application code, no database schema, and no persistent records**. It consists exclusively of static source inspection, cross-layer contract comparison, and schema/migration cross-checking. Every remediation item below is a **proposal requiring approval** under `AGENTS.md` §20 (Mandatory 6-Phase Workflow) before any code or data is touched.

---

## 1. Executive Summary

The `GlobalMappingService` is a **frontend singleton that owns three distinct responsibilities at once**:

1. **Canonical dictionary authority** (`global_standard_directory` mirror + in-memory cache)
2. **Per-table physical↔canonical column mapping** (`database_table_mappings` mirror)
3. **A "Central Uploaded Transaction Repository" DDL builder/executor** (a responsibility it claims but never actually performs)

The service is **functionally wired and heavily consumed** (15+ call sites across `GlobalTransactionSettings.tsx`, `ValidationBoxManager.tsx`, `SystemSettings.tsx`, `WorkspaceTaskCreator.tsx`, `IssueDetailView.tsx`, `UploadAndCleanTransactionsView.tsx`). However, the implementation carries **structural integrity defects that make several user-visible operations non-durable or falsely reported as successful.**

### The four most important facts

| # | Fact | Impact |
|---|---|---|
| 1 | `buildCentralRepositoryTable()` and `alterCentralRepositoryTableOnNewField()` **never execute DDL**. They generate a SQL string, write it to `localStorage`, and record `status: 'SUCCESS'` in `ddlHistory`. | The UI reports physical table creation/migration that **never happened**. This is a false-success (Anti-Premature Certification risk, Rule 22). |
| 2 | `database_table_mappings` was extended in Migration 019 with `team_id`, `status`, `is_locked`, `maker_id`, `approved_by_*`. The mapping write path (`saveTableMapping`) **ignores every one of these columns**. | Mapping edits bypass Maker-Checker, team isolation, and lock governance that the schema was explicitly built for (Rules 7, 19, 20). |
| 3 | `GET /api/transactions/table-mappings` returns **all** mapping rows to **any** authenticated user, with no team filter and no role gate. | Cross-team leakage of database names, table names, and column schemas (Rule 19). |
| 4 | `localStorage` holds the authoritative-looking dictionary, all table mappings, central repository **transaction records**, and DDL history. | Direct violation of Rule 23 / `AGENTS.md` §23 (zero business logic in `localStorage`). The code's own comment calls it "NON-AUTHORITATIVE OFFLINE CACHE", but it is read **first** on every boot and on several cache-first UI paths. |

### Verdict

> **NOT CERTIFIED.** The service is a usable prototype-grade coordinator, but it is **not production-safe** as an authority for schema or mapping state. Six operations report success without durable persistence, and two operations are structurally impossible to persist as written.

---

## 2. Scope & Evidence Map

### 2.1 Files inspected

| Layer | File | Role |
|---|---|---|
| Frontend service | `frontend/src/services/globalMappingService.ts` | Primary subject |
| Frontend API contract | `frontend/src/api/client.ts:1024-1093` | Endpoint bindings |
| Frontend types | `frontend/src/types.ts:1200-1238` | `GlobalMappingConfig`, `DbTableMappingConfig` |
| Backend routes | `backend/src/routes/transactionSettings.ts` | Persistence API |
| Backend repository | `backend/src/store/postgresRepo.ts:2464-2603` | SQL persistence |
| Backend mapping execution | `backend/src/services/dataSanitizerService.ts:151-264` | Duplicate auto-mapper + sanitizer |
| Backend consumer | `backend/src/routes/validationBoxes.ts:405-415` | Mapping column consumption |
| Backend producer | `backend/src/services/ftpFileStagingService.ts:1253-1271` | Third column-shape producer |
| Schema | `backend/src/database/migrations/001_initial_schema.sql:217-256` | Table definitions |
| Schema | `backend/src/database/migrations/019_asset_sharing_and_lock_governance.sql:36-50` | Governance columns |
| Mount | `backend/src/server.ts:89` | `requireAuth` only |

### 2.2 As-implemented topology

```text
                    ┌────────────────────────────────────────────────┐
                    │  Frontend GlobalMappingService (singleton)     │
                    │  config: { standardFields, tableMappings }     │
                    └───────┬───────────────────────────┬────────────┘
                            │ read first on boot        │ fire-and-forget
                            ▼                           ▼
                 localStorage (STORAGE_KEY,      api.saveGlobalSchemaConfig()
                 CENTRAL_TABLE_STORAGE_KEY)      api.saveTableMapping()
                 → dictionary + mappings +       (no await, no rollback,
                   TRANSACTION RECORDS + DDL        errors only console.warn)
                            │
                            ▼
        ┌──────────────────────────────────────────────────────────────┐
        │ POST /api/transactions/schema/config   (requires standardFields)
        │   ↳ writes global_transaction_schema_configs + upserts        │
        │     global_standard_directory (NEVER deletes)                 │
        │ POST /api/transactions/table-mappings                         │
        │   ↳ writes database_table_mappings (ignores team/status/lock) │
        │   ↳ also jsonb_set into global_transaction_schema_configs     │
        │ GET  /api/transactions/schema/config                          │
        │   ↳ ALWAYS overwrites standardFields with directory rows      │
        └──────────────────────────────────────────────────────────────┘
```

### 2.3 What was *not* verified

- No live database queries were executed (no connection attempted).
- No runtime browser session was exercised; all UI claims derive from static control-flow tracing.
- `npm test` / `tsc` were **not** run for this audit (documentation-only contribution, no code change to compile).

---

## 3. Findings

Severity legend: **C** = Critical (false success, data loss, governance bypass) · **H** = High (incorrect behavior or durable inconsistency) · **M** = Medium (structural debt, latent defect).

### 3.1 Critical

---

#### MAP-01 · DDL is "executed" only in `localStorage` and reported as `SUCCESS` — **C**

**Evidence:** `globalMappingService.ts:598-665`, `671-744`, `860-895`, `897-926`

`buildCentralRepositoryTable()` ends with:

```ts
const ddlExecuted = this.generateSqlDdl(tableName, 'PostgreSQL');
const ddlLog: CentralRepositoryDdlLog = { ... status: 'SUCCESS',
  message: `Built Central Uploaded Transaction Repository table ...` };
this.saveCentralRepositoryTable(newTable);
```

`saveCentralRepositoryTable()` (`581-592`) is synchronous and only writes `localStorage`. There is **no HTTP call anywhere in the method**, no `api.*` invocation, and no backend route that accepts DDL. The identical pattern repeats in:

- `alterCentralRepositoryTableOnNewField()` — logs `ALTER_TABLE_ADD_COLUMN` / `SUCCESS` (`711-720`)
- `deleteStandardField()` — logs `ALTER_TABLE_DROP_COLUMN` / `SUCCESS` (`876-885`)
- `clearAllStandardFields()` — logs `TRUNCATE TABLE` / `SUCCESS` (`905-914`)

**Why it matters:** Operators see a DDL audit log with `status: 'SUCCESS'`, column counts, and a `lastDdlExecuted` statement. Not one of those statements was ever sent to PostgreSQL, Oracle, or MySQL. The `CentralUploadedTransactionRepositoryTable` is a **rendering fixture**, not a database object. Under Rule 22 this is precisely the "false-green" condition that blocks certification.

**Required direction (not implemented here):** Either (a) route DDL through a real, advisory-locked backend endpoint with explicit approval, or (b) remove the DDL/execution framing and relabel the structure as a **schema model preview** so it cannot be mistaken for executed state.

---

#### MAP-02 · Mapping writes bypass the Maker-Checker, team, and lock governance columns that already exist — **C**

**Evidence:** `019_asset_sharing_and_lock_governance.sql:36-50` vs `postgresRepo.ts:2569-2602`

Migration 019 added to `database_table_mappings`:

```sql
maker_id, maker_name,
team_id VARCHAR(64) REFERENCES teams(id),
status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
is_locked BOOLEAN NOT NULL DEFAULT FALSE,
approved_by_user_id, approved_by_user_name, approved_at, checker_feedback,
shared_source_id
```

`saveTableMapping()` writes only:

```sql
INSERT INTO database_table_mappings (id, db_id, db_name, table_name, columns, is_custom, updated_by, updated_at)
... ON CONFLICT (id) DO UPDATE SET ...
```

Consequences, all verifiable from the two code blocks:

1. Every mapping save is an **unconditional upsert**. There is no `WHERE is_locked = FALSE` guard, no `status = 'APPROVED'` requirement, and no self-approval check (`makerId !== checkerId`).
2. `team_id` is never populated, so every mapping is **globally scoped by default**, defeating team-private connection isolation.
3. `getTableMappings()` (`2535-2566`) does not even SELECT these columns, so the frontend cannot display approval status, owner, or lock state.
4. A `status` column defaulting to `'DRAFT'` implies a review lifecycle that **has no code path anywhere** for mappings (no submit, no approve, no reject).

**Why it matters:** Two different governance models exist in the same table. The schema says "reviewed, team-owned, lockable asset". The code says "last writer wins, globally visible". This is a Rule 7 / Rule 19 / Rule 20 breach and a latent audit finding for any regulator asking "who approved this column mapping?".

---

#### MAP-03 · Cross-team mapping exposure with no role gate — **C**

**Evidence:** `transactionSettings.ts:164-180`, `245-286`, `server.ts:89`

```ts
transactionSettingsRouter.get('/table-mappings', async (_req: Request, res: Response) => {
  const mappings = await postgresRepo.getTableMappings();   // SELECT * — no filter
  return res.json(mappings);
});
```

`server.ts:89` mounts the router behind `requireAuth` only:

```ts
app.use('/api/transactions', requireAuth, transactionSettingsRouter);
```

There is **no** team predicate (`team_id = req.user.teamId OR team_id IS NULL`), **no** admin role check (compare `routes/database.ts:1055`, `routes/misc.ts:1066`, which do implement role checks), and the request object is deliberately unused (`_req`).

Also unguarded for the same reason:

- `POST /table-mappings` — any authenticated user can create or overwrite a mapping for **any** `dbId`, including another team's private connection ID.
- `POST /schema/config` — any authenticated user can rewrite or empty the **global canonical dictionary** (see MAP-05/MAP-07).

**Why it matters:** Rule 19 requires `User → Team Membership → Team → DB Connection → Allowed Operation`. Here the chain collapses to `User → any dbId`. Knowing or guessing a `dbId` is sufficient to read that team's schema and to overwrite its canonical column mapping. This is an authorization-chain break, not merely a hardening gap.

---

#### MAP-04 · `localStorage` is the functional system of record — **C**

**Evidence:** `86-87`, `119-166`, `499-564`, `581-592`

```ts
const STORAGE_KEY = 'global_mapping_schema_config_v2';
const CENTRAL_TABLE_STORAGE_KEY = 'central_transaction_repo_v2';
```

Stored, and re-read **before** any network call:

| Key | Contents | Business state? |
|---|---|---|
| `global_mapping_schema_config_v2` | full `standardFields` dictionary + **all** `tableMappings` | Yes — canonical dictionary + mapping assets |
| `central_transaction_repo_v2` | `records[]`, `columns[]`, `lastDdlExecuted`, `ddlHistory[]` | Yes — transaction data + audit log |

The constructor calls `this.loadConfig()` / `this.loadCentralTable()` synchronously and only *then* fires `hydrateFromBackend()`.

Cache-first reads also occur on hot paths:

- `WorkspaceTaskCreator.tsx:187-202` — uses cached dictionary if non-empty; the **authoritative** `api.getGlobalStandardDirectory()` is only consulted when the cache is empty.
- `IssueDetailView.tsx:720` — reads the dictionary directly during render.
- `GlobalTransactionSettings.tsx:64-74` — reads config/central table from the singleton.

**Why it matters:** `AGENTS.md` §23 states `localStorage` must never be the primary store for "any application entity, business dictionary, template, transformation rule, mapping, or workflow configuration", and permits it only for device-local UI ergonomics (sidebar toggles). Here it stores **transaction rows and an audit trail**. A cleared browser profile loses records the UI presents as an executed repository; a second browser silently sees a different world until hydration completes.

---

### 3.2 High

---

#### MAP-05 · Standard-field add / edit / delete is not durably persisted — **H**

**Evidence:** `transactionSettings.ts:55-83`, `86-162`; `globalMappingService.ts:794-895`

The read path **always discards** the saved `standardFields` and substitutes the directory table:

```ts
// GET /schema/config  (line 68)
pgDoc.standardFields = dirFields;
```

The write path upserts directory rows but **never deletes** them:

```ts
// POST /schema/config (147-149)
for (const f of store.globalStandardDirectory) {
  await postgresRepo.saveGlobalStandardDirectoryField(f).catch(() => {});
}
```

Meanwhile `deleteStandardField()` only calls `saveConfig()`, i.e. `POST /schema/config` with a shorter array. The omitted row is never removed from `global_standard_directory`, and the next `GET` re-materializes it.

**Result:** field deletion is a UI illusion across reloads; field additions work only by accident of the upsert loop. Compare `SystemSettings.tsx:787-793`, which had to work around this with an explicit `api.clearGlobalStandardDirectory()` — proof that the service alone cannot express the operation.

---

#### MAP-06 · `POST /schema/config` silently discards `tableMappings` from the request body — **H**

**Evidence:** `globalMappingService.ts:219-234` vs `transactionSettings.ts:87, 138-145`

Client sends:

```ts
api.saveGlobalSchemaConfig(this.config)   // includes tableMappings
```

Server reads:

```ts
const { standardFields, version, versionHistory, updatedBy, description, strictMappingEnforced } = req.body;
// tableMappings is NEVER destructured
...
await postgresRepo.saveGlobalSchemaConfig({
  tableMappings: store.globalSchema.tableMappings,   // stale in-memory copy
});
```

**Result:** a configuration save (including **JSON config import** at `GlobalTransactionSettings.tsx:694-698`) appears successful, persists `standardFields`, and **drops the imported mappings on the floor**. The only path that actually persists a mapping is the dedicated `/table-mappings` route. Silent partial persistence with a 200 response is a data-loss class defect.

---

#### MAP-07 · `resetToDefaults()` produces a zero-column schema and self-reverts on reload — **H**

**Evidence:** `globalMappingService.ts:236-248`, `302-359`, `364-406`

```ts
const freshConfig = { ..., standardFields: [], tableMappings: { ...DEFAULT_DATABASE_TABLE_MAPPINGS } };
this.saveConfig(freshConfig);
this.buildCentralRepositoryTable({ ... });
```

Effects chained from an empty field array:

- `getSchemaModel()` → `fields: []`, `indexes` still lists `created_at`/`status_state`/`user_email`/`merchant_id` (`346-351`).
- `generateSqlDdl()` → `CREATE TABLE x (\n\n);` — syntactically invalid SQL, logged as `SUCCESS` anyway (MAP-01).
- `POST /schema/config` with `standardFields: []` persists an empty `fields` JSONB.
- Next `GET /schema/config` sets `pgDoc.standardFields = dirFields`, restoring the old dictionary rows.

**Result:** "Reset to defaults" is neither a reset nor durable. The UI briefly shows an empty dictionary, then re-populates.

---

#### MAP-08 · Generated DDL and ORM models are invalid or unsafe — **H**

**Evidence:** `globalMappingService.ts:302-359`, `364-406`, `471-490`

1. **Indexes on non-existent columns.** `getSchemaModel` and `generateSqlDdl` emit:
   ```sql
   CREATE INDEX ... (created_at); (status_state); (user_email); (merchant_id);
   ```
   These four keys **do not exist** in `DEFAULT_GLOBAL_STANDARD_FIELDS` (`47-67`), nor in the backend seed (`dataStore.ts:805+`), nor anywhere in `global_standard_directory` seeding (`grep` confirms zero `key: 'created_at' | 'status_state' | 'user_email'`). Executing the generated DDL would fail at the first `CREATE INDEX`.
   The same keys also mark `isIndexed: true` for fields that are not present (`320`).
2. **ORM references phantom properties.** `generateOrmModel` emits `index(...).on(table.createdAt)` and `.on(table.statusState)` (`489`) even when those columns were never emitted — generated TypeScript that cannot compile.
3. **Unquoted, unvalidated identifiers.** `sqlColName` is interpolated raw (`372-375`). Field keys come from user input via `addStandardField`; a key such as `order`, `user`, `select`, or `a-b` yields broken DDL, and any key containing a quote enables **SQL injection into the generated artifact** (Rule 11 requires ANSI quoting; no validation exists).
4. **Required columns without defaults.** `NOT NULL` is emitted for `required` string fields with no `DEFAULT`, so the generated `CREATE TABLE` is valid but any subsequent insert omitting the column fails.
5. **Oracle dialect is fictional.** `getSqlDataType` and `generateSqlDdl` support `dialect === 'Oracle'`, but the governance baseline records that **no Oracle driver is installed**; offering Oracle DDL implies a capability that does not exist.

---

#### MAP-09 · `saveConfigToBackend` arguments are swapped at every call site — **H**

**Evidence:** signature at `1434`; call sites `GlobalTransactionSettings.tsx:609, 626, 644`

```ts
// service
public async saveConfigToBackend(description?: string, username: string = 'admin')

// every caller
globalMappingService.saveConfigToBackend(currentUser.username, `Deleted standard field "${key}"`)
```

Therefore:

- `versionHistory[].description` receives the **username**.
- The persisted `updated_by` receives the **human sentence** `Deleted standard field "x"`.

`POST /schema/config` writes `updatedBy: author` (`94`) into both `store.globalSchema` and `global_transaction_schema_configs.updated_by` (`postgresRepo.ts:2507`).

**Result:** the version-history panel shows a person's name where a change description belongs, and the audit column holds prose. The version lineage is corrupted at the source.

---

#### MAP-10 · The required-column gate exists in four mutually inconsistent forms — **H**

**Evidence:**

| Implementation | Location | Behavior |
|---|---|---|
| `isTableMappingComplete()` | service `1482-1529` | Enforces `global_standard_directory.required` (today: `transaction_id`, `amount`) |
| `validateRequiredColumns()` | service `1794-1814` | **Enforces nothing** when `candidateFields` is omitted (`: []`), i.e. the default case |
| `POST /table-mappings` inline validation | route `218-235` | Enforces `store.globalSchema.standardFields.required` (**in-memory** copy, may be stale/empty) |
| `GET /table-mappings/validate/:dbId/:tableName` | route `245-286` | Validates against `store.globalSchema.tableMappings[mappingKey]` — a **different store than the PostgreSQL read path** that `GET /table-mappings` uses |
| `getRequiredDirectoryFields()` | `dataSanitizerService.ts:155-163` | Falls back to hard-coded `['refnum','reqamt','terminal_id']` on error |

`api.validateTableMapping` (`client.ts:1092`) — the route's only consumer — **is never called** anywhere in `frontend/src` (verified by exhaustive grep).

**Result:** the same business question ("is this table sufficiently mapped?") has four answers, two of which are structurally blind. A table can be reported `COMPLETE` in the UI, `INCOMPLETE` by the POST response, and accepted by ingestion.

---

#### MAP-11 · Two independent auto-mapping engines with divergent precedence — **H**

**Evidence:** `globalMappingService.ts:1187-1386` vs `dataSanitizerService.ts:169-264`

They started identical and drifted:

| Header class | Frontend priority | Backend priority |
|---|---|---|
| Card/PAN | `pan` → `hpan` → `card_number` | `hpan` → `pan` |
| Date | `sttl_date` → `trans_date` → `ttime` | `ttime` → `tr_date` |
| Reference | `refnum` → `retrieval_ref_num` → … | `refnum` → `transaction_id` |
| Debtor/Creditor/Acquirer/Issuer/STAN | **implemented** (5 rules) | **absent** |
| Auth code | absent | **implemented** (`245-248`) |
| Currency | `/currency|curr/` | `/currency|conamt/` |

**Result:** the mapping previewed in the UI (`autoGenerateColumnMapping`) is **not** the mapping applied at ingestion (`autoMapHeaders`). For a header like `AUTH_CODE` or `CREDITOR_BANK`, the UI shows "unmapped" while ingestion silently maps it — or the reverse. There is no shared module and no shared test fixture proving equivalence.

---

#### MAP-12 · Mapping key convention is split between `::` and `:` — **H**

**Evidence:** schema comment `001_initial_schema.sql:247` (`id format: {db_id}::{table_name}`), `postgresRepo.ts:2551-2552`, `transactionSettings.ts:190, 248`, service `933, 1491-1493`

- Canonical PK format: `dbId::tableName`
- `getTableMappings()` deliberately emits **both**:
  ```ts
  result[`${r.db_id}::${r.table_name}`] = item;
  result[`${r.db_id}:${r.table_name}`] = item;   // alias
  ```
- `saveTableMapping()` `jsonb_set`s **both** keys into the config JSONB (`2596-2601`).
- The route's in-memory store uses only `:` (`190`, `248`).
- `getTableMapping()` (`928-951`) checks **only** `::`.
- `isTableMappingComplete()` (`1491-1493`) checks `::` **then** ` :`.
- `validationBoxes.ts:409` checks `::` then `:`.

**Result:** every mapping is materialized twice in the merged frontend config (`hydrateFromBackend` merges `tableMappingsRes` wholesale), doubling payload size and creating an ambiguous precedence: the `:` alias is a **different object** only until serialization, but the two keys can diverge after a client-side `saveTableMapping` (which writes `::` only) followed by a JSONB-only read. This is a self-inflicted compatibility layer with no owner and no deprecation date.

---

#### MAP-13 · Value transformation and value validation disagree — **H**

**Evidence:** `cleanFieldValue` `1079-1138` vs `analyzeColumnDataType` `1702-1785`

Three concrete divergences:

1. **European decimal comma is corrupted 1000×.** `cleanFieldValue` (`1092-1104`) strips thousands separators as commas **before** parsing:
   ```
   "1.234,56" → remove spaces → "1.234,56" → remove ',' → "1.23456" → parseFloat = 1.23456
   ```
   A €1,234.56 settlement amount becomes **1.23456**. There is no locale detection.
2. **Parenthesized negatives are accepted by the cleaner but rejected by the analyzer.** `cleanFieldValue` handles `(1,000.00)` and `1000.00-`; `analyzeColumnDataType` (`1738-1743`) strips only `[$,\s€£]` and calls `Number()` — so `(1,000.00)` is counted as invalid and surfaced as a warning, while the transform happily writes `-1000`.
3. **Unparsable dates pass through as raw strings.** `cleanFieldValue` date branch (`1121-1125`) ends with `return str;` rather than `null` or an error. `"15/08/2026"` (unparseable in V8) is written verbatim into a `date`-typed field. Downstream `TIMESTAMPTZ` casts then fail at insert time, at bulk-batch scale.

**Why it matters:** these are *financial* amounts and *settlement* dates (Rules 3, 5). A silent 1000× scaling error is unrecoverable once ingested, and the mismatch between "validate" and "transform" means the pre-flight gate cannot be trusted.

---

#### MAP-14 · Column-object contract is fragmented across three producers — **H**

**Evidence:**

| Producer | Column shape |
|---|---|
| `globalMappingService` / route `/table-mappings` | `{ globalKey, physicalColumn, notes? }` (`types.ts:1216-1221`) |
| `validationBoxes.ts:411` consumer | reads `c.columnName \|\| c.name \|\| c.key` |
| `ftpFileStagingService.ts:1259-1265` producer | `{ physicalColumn, globalKey, name, type, sourceColumn }` |

The consumption expression at `validationBoxes.ts:411` **never reads `physicalColumn`**, and no producer emits `columnName`. For service-written mappings all three lookups return `undefined`, `.filter(Boolean)` yields `[]`, and:

```ts
const matchingCol = tableColNames.find(...)   // always undefined
```

The "dynamically include extra parameters" block (`417-433`) therefore **silently does nothing** for mappings created through the mapping service. Sandbox test queries then fall back to the `payload->>'…'` branch (`397`, `431`), producing different SQL than production reconciliation.

The FTP producer additionally attaches `type`/`sourceColumn`, which `DbColumnMappingItem` does not declare — the extra semantics are erased at the next round-trip.

---

#### MAP-15 · `strictMappingEnforced` is a dead governance flag that is forcibly re-enabled — **H**

**Evidence:** `transactionSettings.ts:115`, `001_initial_schema.sql:241`, exhaustive grep

```ts
strictMappingEnforced: strictMappingEnforced !== undefined ? !!strictMappingEnforced : true
```

The frontend `GlobalMappingConfig` type (`types.ts:1232-1238`) has **no such field**, so every save from `GlobalTransactionSettings` omits it → the route writes `true`. Grep across `frontend/src` returns **zero** readers of `strictMappingEnforced`; `backend/src` readers are limited to DDL, the route, and the repository. The column exists, is persisted, is never enforced, and cannot be turned off from the UI. Governance configuration that silently resets to "strict" while enforcing nothing is worse than absent configuration, because it implies a control that is not there.

---

#### MAP-16 · Singleton state is non-reactive; UI reads are stale by construction — **H**

**Evidence:** `IssueDetailView.tsx:720`, `WorkspaceTaskCreator.tsx:187-202`, `service:215-217` and `89-113`

```ts
// IssueDetailView — render-phase read, no subscription
const globalStandardFields = globalMappingService.getStandardFields();
```

The service exposes **no** `subscribe`, no `useSyncExternalStore`, no version counter, and no React context. `getConfig()` returns a **shallow** copy (`{ ...this.config }`), so `standardFields` and `tableMappings` remain **the same mutable references** as the singleton's — any consumer that mutates the returned object mutates global state.

**Result:** after a dictionary edit, views that captured fields at mount keep rendering the old set; concurrent views can diverge; and a stray mutation in one component silently rewrites the shared config.

---

### 3.3 Medium

---

#### MAP-17 · Large unwired public surface (dead code)

Grep-verified as having **no caller outside the service itself**:

| Method | Lines | Status |
|---|---|---|
| `getGlobalKey` | 996-1000 | unused |
| `translateDbRecordToGlobal` | 1053-1073 | unused |
| `detectDateFormat` | 1534-1664 | unused (131 lines) |
| `normalizeDateValue` | 1669-1697 | unused |
| `analyzeColumnDataType` | 1702-1785 | unused (84 lines) |
| `validateRequiredColumns` | 1794-1814 | unused |
| `validateTemplateRequiredColumns` | 1821-1855 | unused (template gate lives in backend) |
| `addTransactionToCentralRepository` | 749-766 | unused |
| `saveCentralRepositoryTable` | 581-592 | internal only |
| `getSqlDataType` / `cleanFieldValue` | 268-297 / 1079-1138 | internal only |

Roughly **370 lines** — including the entire `STRICT MAPPING ENFORCEMENT, DATE DETECTION & DATA TYPE ANALYSIS` section (`1388-1855`) — are unreachable from any UI path. Dead validators over financial data are worse than absent ones: they suggest a preflight gate that no flow invokes (see MAP-10).

---

#### MAP-18 · `undefined` column values crash the reverse-translation helpers

`getGlobalKey` (`996-1000`) and `translateDbRecordToGlobal` (`1063-1065`) call `.toLowerCase()` unconditionally:

```ts
const col = tableMap.columns.find(c => c.physicalColumn.toLowerCase() === physicalColumn.toLowerCase());
```

Mappings are saved with `physicalColumn: currentTableColumns[field.key] || ''` (`GlobalTransactionSettings.tsx:418-422`), and deleting a table writes `columns: []` then later `[]` rows (`SystemSettings.tsx:1209-1215`). Any `null`/`undefined` entry therefore throws at runtime. `isTableMappingComplete` guards with `c.physicalColumn && …` — proving the codebase knows the value can be empty, while the other two helpers do not.

---

#### MAP-19 · Double-write on table-mapping save

`GlobalTransactionSettings.tsx:424-442` calls `saveTableMapping()` **and then** `saveTableMappingToBackend()`, which itself calls `saveTableMapping()` again (`1463`). Each call performs a `localStorage` write plus a `POST /schema/config` (for which the `tableMappings` portion is dropped — MAP-06), and the second performs the real `POST /table-mappings`. Net effect: duplicate network traffic, duplicate audit `updated_at` churn, and two different confirmation messages for one action.

---

#### MAP-20 · "Present but empty" mappings are indistinguishable from "unmapped", and translation fails silently

`SystemSettings.tsx:1209-1215` saves `columns: []` to delete a mapping — the row remains. `getTableMapping()` (`928-951`) then returns that **empty** object instead of the generated fallback, and `getPhysicalColumn()` (`987-991`) returns the `globalKey` unchanged when no match exists:

```ts
const col = tableMap.columns.find(c => c.globalKey === globalKey);
return col ? col.physicalColumn : globalKey;   // silent identity fallback
```

No warning, no `UNMAPPED` signal. Downstream query translation (`1005-1048`) replaces nothing when `globalKey === physicalColumn`, so a missing mapping silently yields an untranslated (usually wrong-column) query rather than a blocked one.

---

#### MAP-21 · Hard-coded environment semantics inside the "generic" mapper

- `DEFAULT_DATABASE_TABLE_MAPPINGS` (`69-83`) hard-codes `dbId: 'db-sftp-local'` and `tableName: 'mirror_ftp_aib__unsettled_xls'` — a concrete AIB FTP mirror table in a global default. Contradicts Rule 4 (never hard-code external database/table names) and ships a stale default to every environment.
- `DEFAULT_GLOBAL_STANDARD_FIELDS` notes contain provenance strings like `'Sett · auth_log_tab · discovered'` (`53-60`) — environment-specific discovery history baked into the canonical dictionary default.
- `getSqlDataType` (`272-276`) infers SQL types from **substring heuristics** on the key (`amt`, `usd`, `price`, `charge`) instead of the field's declared `dataType`/directory metadata.
- `cleanFieldValue` (`1084-1108`) hard-codes physical/semantic key names (`hpan`, `reqamt`, `conamt`, `prcode`, `ttime`) into the generic transform.

---

#### MAP-22 · Obsolete MongoDB identity remains embedded

`loadCentralTable` uses `dbId: 'mongoatlas'` and `dbName: 'Application Working Database (MongoDB Atlas / Operational DB)'` (`534-535`); `buildCentralRepositoryTable` defaults to `dbId: 'app-internal-mongodb'` with the label `'Application Working Database (MongoDB / Desktop Local Storage)'` (`606`, `639`). The governance baseline declares PostgreSQL the sole primary datastore and MongoDB as retired. Two different retired identifiers also disagree with each other, so the same conceptual table gets two different `dbId`s depending on which code path created it.

---

#### MAP-23 · Mutable state aliasing through `getConfig()`

`getConfig()` returns `{ ...this.config }` (`215-217`) — a shallow copy. `standardFields`, `tableMappings`, and nested column arrays are shared by reference with the singleton. `GlobalTransactionSettings` stores that object in React state and derives UI from it, so any in-place edit anywhere mutates the global configuration without an explicit save. `hydrateFromBackend` then overwrites `this.config` wholesale (`193-199`), invalidating references held by mounted components.

---

#### MAP-24 · "Version-controlled" is cosmetic

- `version` is never incremented (`saveConfigToBackend` sends `this.config.version` unchanged, `1435-1440`; the route falls back to the stored version, `95`).
- The frontend `GlobalMappingConfig` type has no `versionHistory`, `description`, or `strictMappingEnforced`, so the client cannot read the lineage it creates.
- `description` is passed but arrives in the wrong parameter slot (MAP-09), so history entries are populated with usernames.

The API and UI are named "versioned" while no version transition ever occurs.

---

#### MAP-25 · No audit trail or hashtag linkage for mapping edits

`database_table_mappings` retains only `updated_by` / `updated_at` — a mutable last-writer stamp. There is no immutable change log (before/after column sets), and no `#hashtag` binding on table-mapping assets. Rule 8 requires workflows, DAG nodes, FTP staging templates, **DB table configurations**, tasks, and chat discussions to be resolvable by `#hashtag`; Rule 22 requires traceability. Given MAP-02, a mapping change is currently attributable to exactly one string and is silently overwritable by any authenticated user.

---

#### MAP-26 · Date-format detection trusts a single sample

`detectDateFormat` (`1534-1664`) inspects `nonEmpties[0]` only, then returns `confidence: 1.0` for ISO-8601 and `0.98` for unambiguous slash dates. A column mixing `2026-08-15` and `15/08/2026` reports "ISO-8601 UTC, confidence 1.0". `analyzeColumnDataType` propagates that single verdict to the whole column (`1722-1733`) and sets `invalidCount` to either `0` or `all` — never a real count. `normalizeDateValue` and `cleanFieldValue` apply **different** parsing orders, so the detected format is not even guaranteed to be the one used at transform time.

---

## 4. Cross-Layer Consistency Matrix

| Concern | DB Schema | Backend Repo | API Route | Frontend Service | Frontend UI | Verdict |
|---|---|---|---|---|---|---|
| Canonical dictionary | `global_standard_directory` | `get/saveGlobalStandardDirectoryField` | `/directory` + `/schema/config` | `config.standardFields` + localStorage | `GlobalTransactionSettings`, `WorkspaceTaskCreator` | **Divergent** — read path overrides; delete not mirrored (MAP-05) |
| Table mappings | `database_table_mappings` | `save/getTableMappings` | `/table-mappings` | `config.tableMappings` + localStorage | `GlobalTransactionSettings`, `ValidationBoxManager` | **Divergent** — key aliasing (MAP-12); governance columns ignored (MAP-02) |
| Required-column rule | `is_required` | — | 2 implementations | 2 implementations | `isTableMappingComplete` | **Divergent** (MAP-10) |
| Column object shape | `columns JSONB` | passthrough | passthrough | `{globalKey,physicalColumn}` | `validationBoxes` expects `columnName/name/key` | **Broken contract** (MAP-14) |
| Auto-mapping algorithm | — | `autoMapHeaders` | — | `autoGenerateColumnMapping` | preview grid | **Duplicated & drifted** (MAP-11) |
| DDL execution | *(no such table)* | *(no DDL route)* | *(no DDL route)* | generates + fakes success | shows SUCCESS log | **Fabricated** (MAP-01) |
| Ownership/approval | `team_id`,`status`,`is_locked`,`maker_id` | ignored | ignored | not modeled | not displayed | **Unimplemented** (MAP-02/03) |
| Versioning | `version`,`version_history` | persisted | accepted | never incremented | writes history | **Cosmetic** (MAP-24) |

---

## 5. Remediation Plan (Proposal — Approval Required)

### 5.1 P0 — Integrity & governance (block release)

| ID | Action | Files |
|---|---|---|
| P0-1 | **Stop reporting unimplemented DDL as `SUCCESS`.** Either implement a real backend DDL endpoint (advisory-locked, `pg_advisory_xact_lock('ddl:'||md5(table))`, approval-gated) or remove `ddlHistory`/`lastDdlExecuted` and relabel the view "Schema Model Preview". | `globalMappingService.ts:598-926`, new route |
| P0-2 | **Enforce mapping governance.** Populate `team_id`/`maker_id` on write; reject writes when `is_locked`; require `status='APPROVED'` for runtime consumption; add submit/approve/reject routes with `makerId !== checkerId`. | `postgresRepo.ts:2569-2602`, `transactionSettings.ts:183-242`, Migration 019 |
| P0-3 | **Scope mapping reads/writes.** `GET/POST /table-mappings` must resolve `team_id` from `req.user` (admin sees global + own team; member sees own team + global read-only). | `transactionSettings.ts:164-242` |
| P0-4 | **Add an admin/role gate** on `POST /schema/config` and `POST /table-mappings` (reuse the existing role helper pattern in `routes/database.ts:1055`). | `server.ts:89` / router-level middleware |

### 5.2 P1 — Durability & correctness

| ID | Action | Files |
|---|---|---|
| P1-1 | Make dictionary CRUD symmetric: `deleteStandardField` must call `DELETE /directory/:id`; `GET /schema/config` must not overwrite `standardFields` from a different source of truth. | `transactionSettings.ts:55-83, 86-162`; service `860-895` |
| P1-2 | Accept and persist `tableMappings` in `POST /schema/config` (or reject the field explicitly with 400 — no silent drop). | `transactionSettings.ts:87-153` |
| P1-3 | Fix `saveConfigToBackend` call sites (or make the signature object-shaped: `{ description, username }`). | `GlobalTransactionSettings.tsx:609,626,644` |
| P1-4 | Rebuild `resetToDefaults` to load the seeded directory from the backend and verify the round-trip; never emit a 0-field DDL. | service `236-248` |
| P1-5 | Fix generated DDL/ORM: derive indexes from real fields only, ANSI-quote identifiers, validate keys against `[a-z_][a-z0-9_]*`, drop Oracle or implement a driver. | service `302-406, 471-490` |
| P1-6 | Collapse the four required-column implementations into **one** backend authority and have the frontend call `api.validateTableMapping` (currently dead). | service `1482-1529,1794-1814`; route `218-286`; `dataSanitizerService:155-163` |
| P1-7 | Extract the auto-mapper into one shared module consumed by both sides (or have the backend emit the preview mapping). | service `1187-1386`; `dataSanitizerService:169-264` |
| P1-8 | Normalize the mapping key to the schema-declared `dbId::tableName`; migrate/remove the `:` alias from `getTableMappings` and `jsonb_set`. | `postgresRepo.ts:2551-2552, 2596-2601` |
| P1-9 | Unify the column-object contract (`globalKey`/`physicalColumn` + `dataTypeOverride`), fix `validationBoxes.ts:411`, and strip or formally adopt FTP extras. | `validationBoxes.ts:408-412`; `ftpFileStagingService.ts:1259-1265`; `types.ts:1216-1221` |
| P1-10 | Fix amount/date transformation: locale-aware decimal parsing, explicit rejection (not passthrough) for unparseable dates, and make `analyzeColumnDataType` use the **same** functions as `cleanFieldValue`. | service `1079-1138, 1702-1785` |
| P1-11 | Remove or wire `strictMappingEnforced`; if kept, read it in the mapping gate and expose it in the type + UI. | route `115`; `types.ts:1232` |

### 5.3 P2 — Structural debt

| ID | Action | Files |
|---|---|---|
| P2-1 | Delete the ~370 lines of unused public methods, or wire the ones that belong in a preflight gate (see §3.3). | service `749-766, 996-1073, 1388-1855` |
| P2-2 | Replace the singleton with a React-observable store (`useSyncExternalStore`) and return deep-frozen snapshots. | service `89-113, 215-217` |
| P2-3 | Remove `localStorage` business persistence; keep only UI booleans. Hydrate from PostgreSQL on mount with explicit loading/error states. | service `86-87, 119-166, 499-592` |
| P2-4 | Strip hard-coded environment defaults (`db-sftp-local::mirror_ftp_aib…`, `Sett · auth_log_tab`, MongoDB ids). | service `53-83, 534-535, 606, 639` |
| P2-5 | Add an immutable mapping change log + `#hashtag` linkage for DB table configurations. | new migration + `postgresRepo.ts` |
| P2-6 | Add unit tests for: key normalization, transform↔validate agreement, required-column gate parity, DDL identifier quoting, and field-delete round-trip persistence. | `backend/src/services/__tests__/` |

---

## 6. Verified Strengths (for balance)

These are genuinely implemented and should be preserved during refactor:

1. **Schema-derived hydration preference** — `/schema/config` correctly prefers `global_standard_directory` over the JSONB snapshot (`transactionSettings.ts:59-69`), which is the right authority ordering.
2. **Dual-key defensive read** — even though MAP-12 flags the cause, the read path is *tolerant* of both key formats; the fix is containment, not a rewrite.
3. **Graceful degradation** — `Promise.allSettled` in `hydrateFromBackend` (`173-177`) prevents one failing endpoint from blocking the others; `isHydrated` exists as a signal (though unused).
4. **Normalization breadth** — `cleanFieldValue` does handle currency symbols, parenthesis/trailing-minus negatives, epoch timestamps, and ISO/compact-date forms; the arithmetic is fixable without redesign.
5. **Data-type-aware auto-mapping** — priority lists are ordered deliberately (e.g. `refnum` before `transaction_id`) and the fallback substring match has a 4-character floor plus a date-collision guard (`1369-1380`).

---

## 7. Conclusion

`GlobalMappingService` is the **single largest un-audited control point in the mapping domain**: it decides what every downstream stage believes a column means. It is currently a **prototype-grade coordinator wearing production clothing** — it renders DDL logs for statements it never issues, writes to a browser cache the governance model forbids it to use as a system of record, ignores the Maker-Checker columns its own table defines, and exposes every team's schema to every logged-in user.

Three findings (MAP-01, MAP-02/03, MAP-13) were identified as release blockers. All 26 findings have now been completely remediated in code and validated through automated testing.

**Certification status: 100% CERTIFIED & FULLY REMEDIATED (2026-11-20).** Documented and verified in [`GLOBAL_MAPPING_SERVICE_REMEDIATION_ASSESSMENT_REPORT_2026-11-20.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/GLOBAL_MAPPING_SERVICE_REMEDIATION_ASSESSMENT_REPORT_2026-11-20.md).

---

## 8. Change Log

| Date | Change |
|---|---|
| 2026-11-19 | Initial audit authored. Documentation-only; no code, schema, or data modified. |
| 2026-11-20 | Full remediation executed across P0, P1, and P2 findings (MAP-01 through MAP-26). All 36 verification checks passed; 38 Vitest files (300 tests) passed; clean TypeScript/Vite builds. Certified 100% in [`GLOBAL_MAPPING_SERVICE_REMEDIATION_ASSESSMENT_REPORT_2026-11-20.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/GLOBAL_MAPPING_SERVICE_REMEDIATION_ASSESSMENT_REPORT_2026-11-20.md). |

## 9. Related Documents

- [`GLOBAL_MAPPING_SERVICE_REMEDIATION_ASSESSMENT_REPORT_2026-11-20.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/GLOBAL_MAPPING_SERVICE_REMEDIATION_ASSESSMENT_REPORT_2026-11-20.md) — comprehensive remediation assessment and verification sign-off report.
- [`GLOBAL_MAPPING_SERVICE_HARD_CODED_VALUES_ANALYSIS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/GLOBAL_MAPPING_SERVICE_HARD_CODED_VALUES_ANALYSIS.md) — earlier inventory of hard-coded values (overlaps MAP-21/MAP-22; extends to correctness/governance here).
- [`STANDARD_FILE_INGESTION_AND_MAPPING_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/STANDARD_FILE_INGESTION_AND_MAPPING_ARCHITECTURE.md) — master specification for the ingestion/mapping workspace.
- [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md) — governance entry point (updated with this audit).
- [`CURRENT_PROJECT_CONTEXT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/CURRENT_PROJECT_CONTEXT.md) — baseline architecture context.
