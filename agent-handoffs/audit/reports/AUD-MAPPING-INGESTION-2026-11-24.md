# Audit Report: Mapping & Workspace Ingestion (`AUD-MAPPING-INGESTION-2026-11-24`)

## 1. Audit Metadata & Scope
- **Audit ID**: `AUD-MAPPING-INGESTION-2026-11-24`
- **Audit Date**: 2026-11-24 23:45 (UTC+3) (Remediated & Signed Off: 2026-11-26)
- **Status**: `RESOLVED` (see [`SIGN-OFF-MAPPING-INGESTION-2026-11-26.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/sign-off/SIGN-OFF-MAPPING-INGESTION-2026-11-26.md))
- **Target Scope**: Mapping & Workspace Ingestion Architecture (`globalMappingService.ts`, `recipeExecutionService.ts`, `valueDictionaryService.ts`, `dataSanitizerService.ts`, `misc.ts` mapping/dictionary routes, `WorkspaceTaskCreator.tsx`, `ValueDictionariesView.tsx`, `ValueDictionaryWorkbench.tsx`)
- **Branch**: `feature/frontend-redesign`
- **Governing Standards**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 1, 19, 20, 23, 24, 25) & [`code-audit`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)
- **Audit Mode**: Code & empirical verification audit (all findings remediated and verified)

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
| `AUD-MAP-001` | `HIGH` | `RESOLVED` | Persistence Governance (`Rule 23`) | `globalMappingService.ts:108-268,544-633,1646` | `localStorage` used to persist mapping schema config & central table state (Resolved in `SIGN-OFF-MAPPING-INGESTION-2026-11-26.md`) |
| `AUD-MAP-002` | `MEDIUM` | `RESOLVED` | Backend Replay Parity (`Rule 24`) | `recipeExecutionService.ts:689-707`; `valueDictionaryService.ts:65-75` | `NUMBER_CLEAN` and `ROUND_INT` UI transforms implemented across both backend services (Resolved in `SIGN-OFF-MAPPING-INGESTION-2026-11-26.md`) |
| `AUD-MAP-003` | `MEDIUM` | `RESOLVED` | Error Handling / Persistence (`Rule 23`) | `ValueDictionariesView.tsx:364-555` | `catch` block shows error banner and prevents phantom local dictionary creation on API error (Resolved in `SIGN-OFF-MAPPING-INGESTION-2026-11-26.md`) |
| `AUD-MAP-004` | `MEDIUM` | `RESOLVED` | Mapping Correctness | `dataSanitizerService.ts:170-265` | `autoMapHeaders` collision guard with Set uniqueness and exact-match priority (Resolved in `SIGN-OFF-MAPPING-INGESTION-2026-11-26.md`) |
| `AUD-MAP-005` | `LOW` | `RESOLVED` | Authorization (`Rule 19`) | `misc.ts:1021-1067` | `file-mapping-templates` routes enforce team scoping and admin checks (Resolved in `SIGN-OFF-MAPPING-INGESTION-2026-11-26.md`) |

---

## 6. Detailed Findings

### `AUD-MAP-001` — `localStorage` Persistence Used in `globalMappingService.ts` (`AGENTS.md` Rule 23)
- **Severity**: `HIGH` | **Status**: `RESOLVED` | **Category**: Persistence Governance (`AGENTS.md` Rule 23)
- **File & Line**: [`globalMappingService.ts#L108-L268`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/services/globalMappingService.ts#L108-L268), [`L544-L633`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/services/globalMappingService.ts#L544-L633), [`L1646`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/services/globalMappingService.ts#L1646)
- **Remediation**: Eliminated all `CENTRAL_TABLE_STORAGE_KEY` writes and reads to `localStorage`; central preview table model is now kept in-memory and dynamically derived from PostgreSQL global schema fields. Authoritative persistence routes to PostgreSQL via `api.saveGlobalSchemaConfig()`. Verified in `SIGN-OFF-MAPPING-INGESTION-2026-11-26.md`.

### `AUD-MAP-002` — Transform Rule ID Mismatch (`NUMBER_CLEAN` & `ROUND_INT`) in Backend Recipe Replay
- **Severity**: `MEDIUM` | **Status**: `RESOLVED` | **Category**: Cross-Layer Recipe Parity (`AGENTS.md` Rules 20 & 24)
- **File & Line**: [`WorkspaceTaskCreator.tsx#L68-L70`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/issue/WorkspaceTaskCreator.tsx#L68-L70), [`recipeExecutionService.ts#L698-L707`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/recipeExecutionService.ts#L698-L707), [`valueDictionaryService.ts#L65-L75`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/valueDictionaryService.ts#L65-L75)
- **Remediation**: Implemented `case 'NUMBER_CLEAN':` and `case 'ROUND_INT':` in both `recipeExecutionService.applySingleTransform` and `valueDictionaryService.applyTransformationRule`, achieving 100% parity across both backend services. Verified in `SIGN-OFF-MAPPING-INGESTION-2026-11-26.md`.

### `AUD-MAP-003` — False-Positive Save Confirmation on PostgreSQL Failure in `ValueDictionariesView.tsx`
- **Severity**: `MEDIUM` | **Status**: `RESOLVED` | **Category**: Error Handling / State Integrity (`AGENTS.md` Rule 23)
- **File & Line**: [`ValueDictionariesView.tsx#L364-L555`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/datasetup/ValueDictionariesView.tsx#L364-L555)
- **Remediation**: Updated all `catch` blocks in `handleDeletePair`, `handleAddNewPair`, `handleAddPairFromMissing`, and `handleCreateDictionary` to display explicit error banners via `setSaveError(...)` and prevented phantom local state insertion when backend API calls throw. Verified in `SIGN-OFF-MAPPING-INGESTION-2026-11-26.md`.

### `AUD-MAP-004` — Unchecked Target-Key Collisions in `dataSanitizerService.autoMapHeaders`
- **Severity**: `MEDIUM` | **Status**: `RESOLVED` | **Category**: Mapping Correctness
- **File & Line**: [`dataSanitizerService.ts#L170-L265`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/dataSanitizerService.ts#L170-L265)
- **Remediation**: Refactored `autoMapHeaders` into a 3-pass resolution algorithm with target uniqueness tracking (`assignedTargetKeys`), preventing column overwriting collisions and prioritizing exact matches and date patterns before generic reference synonyms. Verified in `SIGN-OFF-MAPPING-INGESTION-2026-11-26.md`.

### `AUD-MAP-005` — Unscoped `POST`/`DELETE` on `file-mapping-templates`
- **Severity**: `LOW` | **Status**: `RESOLVED` | **Category**: Authorization (`AGENTS.md` Rule 19)
- **File & Line**: [`misc.ts#L1021-L1067`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/misc.ts#L1021-L1067)
- **Remediation**: Added team ownership and admin checks: 403 on cross-team modification/deletion, 404 for nonexistent templates, 400 for missing names, and non-admin list queries scoped by caller `teamId`. Verified in `SIGN-OFF-MAPPING-INGESTION-2026-11-26.md`.

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
