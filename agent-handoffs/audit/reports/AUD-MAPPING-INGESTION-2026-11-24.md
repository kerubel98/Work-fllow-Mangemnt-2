# Audit Report: Mapping & Workspace Ingestion (`AUD-MAPPING-INGESTION-2026-11-24`)

## 1. Audit Metadata & Scope
- **Audit ID**: `AUD-MAPPING-INGESTION-2026-11-24`
- **Audit Date**: 2026-11-24 23:45 (UTC+3)
- **Target Scope**: Mapping & Workspace Ingestion Architecture (`globalMappingService.ts`, `recipeExecutionService.ts`, `valueDictionaryService.ts`, `dataSanitizerService.ts`, `misc.ts` mapping/dictionary routes, `WorkspaceTaskCreator.tsx`, `ValueDictionariesView.tsx`, `ValueDictionaryWorkbench.tsx`)
- **Branch**: `feature/frontend-redesign`
- **Commit**: `d7bf228` (baseline mapping handoff at `b19bbaa`)
- **Governing Standards**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 1, 20, 23, 24, 25) & [`code-audit`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)
- **Audit Mode**: Read-only code & empirical verification audit (zero application source edits)

---

## 2. Executive Summary
A deep-dive audit of the **Mapping & Workspace Ingestion** subsystem was conducted across frontend mapping state (`globalMappingService.ts`, `WorkspaceTaskCreator.tsx`, `ValueDictionariesView.tsx`), backend API routes (`misc.ts`), and backend sanitization/replay engines (`dataSanitizerService.ts`, `recipeExecutionService.ts`, `valueDictionaryService.ts`).

- **Empirical Suite Baseline** (verified at HEAD `d7bf228`):
  - `npm run build --prefix backend` (`tsc`): **PASS**
  - `npm test --prefix backend -- --run` (`vitest`): **PASS** (**39 test files, 312 tests passed**)
  - `npm run build --prefix frontend` (`vite build`): **PASS**
- **Findings Summary**: **5 findings** identified (**0 CRITICAL**, **1 HIGH**, **3 MEDIUM**, **1 LOW**).

---

## 3. Previous Audit & Sign-Off Review
- Expanded from initial `AUD-MAPPING-INGESTION-2026-11-24` pass (`AUD-MAP-001`, `AUD-MAP-002`) with deep-dive coverage of `dataSanitizerService.ts`, `misc.ts`, and `ValueDictionariesView.tsx` (`AUD-MAP-003`, `AUD-MAP-004`, `AUD-MAP-005`).

---

## 4. Files & Modules Examined
- [`frontend/src/services/globalMappingService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/services/globalMappingService.ts#L108-L268), [`L544-L633`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/services/globalMappingService.ts#L544-L633), [`L1646`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/services/globalMappingService.ts#L1646)
- [`backend/src/services/recipeExecutionService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/recipeExecutionService.ts#L1-L320), [`L650-L715`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/recipeExecutionService.ts#L650-L715)
- [`backend/src/services/valueDictionaryService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/valueDictionaryService.ts#L49-L94)
- [`backend/src/services/dataSanitizerService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/dataSanitizerService.ts#L1-L260)
- [`backend/src/routes/misc.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/misc.ts#L918-L970)
- [`frontend/src/components/issue/WorkspaceTaskCreator.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/issue/WorkspaceTaskCreator.tsx#L53-L72)
- [`frontend/src/components/datasetup/ValueDictionariesView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/datasetup/ValueDictionariesView.tsx#L214-L370)
- [`frontend/src/components/settings/ValueDictionaryWorkbench.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/ValueDictionaryWorkbench.tsx#L466-L615)

---

## 5. Findings Summary Table

| Finding ID | Severity | Status | Category | Location | Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-MAP-001` | `HIGH` | `OPEN` | Persistence Governance (`Rule 23`) | `globalMappingService.ts:108-268,544-633,1646` | `localStorage` used to persist mapping schema config & central table state |
| `AUD-MAP-002` | `MEDIUM` | `OPEN` | Backend Replay Parity (`Rule 24`) | `recipeExecutionService.ts:689-691`; `WorkspaceTaskCreator.tsx:68-70` | `NUMBER_CLEAN` and `ROUND_INT` UI transforms silently no-op in backend recipe replay |
| `AUD-MAP-003` | `MEDIUM` | `OPEN` | Error Handling / Persistence (`Rule 23`) | `ValueDictionariesView.tsx:326-328` | `catch` block shows `setSaveSuccess(true)` even when PostgreSQL save fails |
| `AUD-MAP-004` | `MEDIUM` | `OPEN` | Mapping Correctness | `dataSanitizerService.ts:197-260` | `autoMapHeaders` lacks duplicate-target collision guard; multiple columns overwrite same key |
| `AUD-MAP-005` | `LOW` | `OPEN` | Authorization (`Rule 19`) | `misc.ts:941-964` | `file-mapping-templates` `POST`/`DELETE` lack team ownership or admin checks |

---

## 6. Detailed Findings

### `AUD-MAP-001` — `localStorage` Persistence Used in `globalMappingService.ts` (`AGENTS.md` Rule 23)
- **Severity**: `HIGH` | **Status**: `OPEN` | **Category**: Persistence Governance (`AGENTS.md` Rule 23)
- **File & Line**: [`globalMappingService.ts#L108-L268`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/services/globalMappingService.ts#L108-L268), [`L544-L633`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/services/globalMappingService.ts#L544-L633), [`L1646`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/services/globalMappingService.ts#L1646)
- **Evidence**: `globalMappingService.ts` reads and writes `STORAGE_KEY` (`global_mapping_schema_config_v2`) and `CENTRAL_TABLE_STORAGE_KEY` (`central_transaction_repo_v2`) via `localStorage.getItem` / `localStorage.setItem` across 12 call sites, contradicting Rule 23 and the file's own comment at line 613.
- **Recommended Remediation**: Hydrate unconditionally from PostgreSQL and remove `localStorage.setItem` writes for business schema/table entities.

### `AUD-MAP-002` — Transform Rule ID Mismatch (`NUMBER_CLEAN` & `ROUND_INT`) in Backend Recipe Replay
- **Severity**: `MEDIUM` | **Status**: `OPEN` | **Category**: Cross-Layer Recipe Parity (`AGENTS.md` Rules 20 & 24)
- **File & Line**: [`WorkspaceTaskCreator.tsx#L68-L70`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/issue/WorkspaceTaskCreator.tsx#L68-L70), [`recipeExecutionService.ts#L689-L691`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/recipeExecutionService.ts#L689-L691), [`valueDictionaryService.ts#L62-L67`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/valueDictionaryService.ts#L62-L67)
- **Evidence**: `WorkspaceTaskCreator.tsx` emits `'NUMBER_CLEAN'` and `'ROUND_INT'`, whereas `recipeExecutionService.applySingleTransform` only handles `'NUMERIC_CLEAN'` and has no `'ROUND_INT'` branch (`valueDictionaryService.applyTransformationRule` lacks both).
- **Recommended Remediation**: Add `case 'NUMBER_CLEAN':` and `case 'ROUND_INT':` to both `recipeExecutionService.applySingleTransform` and `valueDictionaryService.applyTransformationRule`.

### `AUD-MAP-003` — False-Positive Save Confirmation on PostgreSQL Failure in `ValueDictionariesView.tsx`
- **Severity**: `MEDIUM` | **Status**: `OPEN` | **Category**: Error Handling / State Integrity (`AGENTS.md` Rule 23)
- **File & Line**: [`ValueDictionariesView.tsx#L326-L328`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/datasetup/ValueDictionariesView.tsx#L326-L328)
- **Evidence**: In `catch (e)` after PostgreSQL dictionary save failure, `setSaveSuccess(true)` is still called, misleading the operator into believing dictionary changes were persisted.
- **Recommended Remediation**: Display an explicit error banner when persistence fails and never set `saveSuccess` inside `catch`.

### `AUD-MAP-004` — Unchecked Target-Key Collisions in `dataSanitizerService.autoMapHeaders`
- **Severity**: `MEDIUM` | **Status**: `OPEN` | **Category**: Mapping Correctness
- **File & Line**: [`dataSanitizerService.ts#L197-L260`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/dataSanitizerService.ts#L197-L260)
- **Evidence**: Broad `.includes('ref')` / `.includes('amt')` / `.includes('date')` / `.includes('auth')` synonym checks do not track already-mapped target keys, allowing two distinct raw headers (e.g., `Ref_Date` and `Txn_Ref`) to map onto the same canonical target key and overwrite values.
- **Recommended Remediation**: Track assigned target keys in a `Set` and prioritize exact matches over substring heuristics before falling back.

### `AUD-MAP-005` — Unscoped `POST`/`DELETE` on `file-mapping-templates`
- **Severity**: `LOW` | **Status**: `OPEN` | **Category**: Authorization (`AGENTS.md` Rule 19)
- **File & Line**: [`misc.ts#L941-L964`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/misc.ts#L941-L964)
- **Evidence**: `POST` and `DELETE /api/file-mapping-templates` perform no team membership, creator, or admin authorization check.
- **Recommended Remediation**: Enforce team ownership or admin authorization on template updates and deletions.

---

## 7. Positive Observations
- **`RENAME_HEADER` Backend Parity**: `recipeExecutionService.ts:94-112` replays `cleaningRecipe.renamedHeaders` during Stage 1 before split/merge/dictionary steps.
- **`ValueDictionaryWorkbench.tsx` PostgreSQL Discipline**: Properly surfaces API errors (`setMessage({ kind: 'err', ... })`) on save/delete/link failures without faking success.
- **SQL Identifier Validation in `valueDictionaryService.ts`**: `fetchDistinctColumnValues` strictly validates identifiers against `/^[A-Za-z0-9_$]+$/`, enforces ANSI quoting, and clamps `LIMIT`.

---

## 8. Recommendations & Remediation Plan
1. **P1 (High)**: Remove `localStorage` business-entity persistence in `globalMappingService.ts` (`AUD-MAP-001`).
2. **P2 (Medium/Low)**: Add `NUMBER_CLEAN`/`ROUND_INT` backend replay (`AUD-MAP-002`), fix `ValueDictionariesView.tsx` error reporting (`AUD-MAP-003`), add collision guard in `autoMapHeaders` (`AUD-MAP-004`), and gate `file-mapping-templates` mutations (`AUD-MAP-005`).

**Recommended Next Action**: Run `/sign-off` to remediate open findings across the master audit register.
