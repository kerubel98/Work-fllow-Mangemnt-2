# Code & Architectural Audit Report: Data Setup vs. Architecture & Frontend Design

**Audit ID**: `AUD-DATASETUP-DESIGN-2026-11-25`  
**Date**: 2026-11-25  
**Auditor**: Antigravity Autonomous Code Audit Engine  
**Governing Skills**: [`.agents/skills/audit/SKILL.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/audit/SKILL.md), [`.agents/skills/code-audit/SKILL.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)  
**Governing Specs & Rules**:
- [`DATA_SETUP_AND_TECHNICIAN_SOLUTION_FLOW_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/docs/architecture/DATA_SETUP_AND_TECHNICIAN_SOLUTION_FLOW_SPECIFICATION.md) (Screens 33–37)
- [`STANDARD_FILE_INGESTION_AND_MAPPING_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/docs/architecture/STANDARD_FILE_INGESTION_AND_MAPPING_ARCHITECTURE.md)
- [`FRONTEND_REDESIGN_SYSTEM_SPECIFICATION_AND_PLAN.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/docs/architecture/FRONTEND_REDESIGN_SYSTEM_SPECIFICATION_AND_PLAN.md)
- [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 1, 16, 19, 20, 23)

**Target Scope**: `DataSetupLandingView.tsx`, `MappingDictionaryView.tsx`, `ValueDictionariesView.tsx`, `ResourceDetailView.tsx`, `DataSetupWizardModal.tsx`, and `backend/src/routes/transactionSettings.ts`  
**Branch / Commit**: `feature/frontend-redesign` (`d7bf228`)  
**Status**: `RESOLVED` (Signed off in `SIGN-OFF-DATASETUP-DESIGN-2026-11-26.md`)  

---

## 1. Executive Summary

An architectural and design-compliance audit was conducted on the **Data Setup** subsystem (`frontend/src/components/datasetup/` and `backend/src/routes/transactionSettings.ts`), comparing the live code against the Data Setup Master Specification (Screens 33–37) and the EthioPay Redesigned UI system.

While the visual layout and 5-step wizard structure closely align with the redesigned UI mockups, **5 architectural and specification mismatches** (**3 HIGH**, **2 MEDIUM**) were identified: hardcoded mock resources persisting alongside live PostgreSQL connections, non-persisted React-only bulk edits in `MappingDictionaryView.tsx`, contract drift on `ValueDictionariesView.tsx` (`noMatchPolicy` and seeded sample pairs), unauthenticated global schema mutation endpoints, and CSS double-zooming.

| Severity | Count | Summary of Key Vulnerabilities / Risks |
| :--- | :---: | :--- |
| **CRITICAL** | 0 | None identified in this scope. |
| **HIGH** | 3 | `DataSetupLandingView.tsx` merges real DBs onto hardcoded fake resources (`Core Ledger`, `SettlemFTP`); `MappingDictionaryView.tsx` auto-classify & bulk actions mutate React state only without PostgreSQL persistence; `transactionSettings.ts` allows any non-admin operator to overwrite global schema configs. |
| **MEDIUM** | 2 | `ValueDictionariesView.tsx` uses `'FALLBACK'` instead of spec `'USE_FALLBACK'`, omits `'FLAG'`, and seeds mockup sample numbers (`07`/`128`, `11`/`9`); `DataSetupLandingView.tsx` applies `zoom: 0.9` on top of global `zoom: 0.8`. |
| **LOW** | 0 | None identified in this scope. |

---

## 2. Files & Modules Examined

- [`frontend/src/components/datasetup/DataSetupLandingView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/datasetup/DataSetupLandingView.tsx): Resources list, setup progress cards, wizard launcher, and tab switcher.
- [`frontend/src/components/datasetup/MappingDictionaryView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/datasetup/MappingDictionaryView.tsx): Global standard directory table, unclassified banner, bulk actions, and add-field modal.
- [`frontend/src/components/datasetup/ValueDictionariesView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/datasetup/ValueDictionariesView.tsx): Grouped value dictionaries, direction/no-match controls, and live Try-it tester.
- [`backend/src/routes/transactionSettings.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/transactionSettings.ts): Global schema config, templates, and directory endpoints.

---

## 3. Findings Summary Table

| Finding ID | Severity | Spec / Rule | Location | Summary |
| :--- | :---: | :--- | :--- | :--- |
| `AUD-DSU-001` | **HIGH** | Rule 1 & Rule 20 | `DataSetupLandingView.tsx:39-150` | Hardcoded mock resources (`Core Ledger`, `SettlemFTP`) merged permanently with live PostgreSQL DBs; hardcoded `mappingCount = 119` (Resolved in `SIGN-OFF-DATASETUP-DESIGN-2026-11-26.md`) |
| `AUD-DSU-002` | **HIGH** | Rule 1 & Spec §2.2 | `MappingDictionaryView.tsx:72, 88, 107-141` | `handleAutoClassify`, `handleBulkSetCategory`, and `handleBulkMarkRequired` mutate local React state only (lost on reload); `UNCLASSIFIED` filter misses `General`/table-named fields (Resolved in `SIGN-OFF-DATASETUP-DESIGN-2026-11-26.md`) |
| `AUD-DSU-003` | **HIGH** | Rule 19 & Admin Auth | `backend/src/routes/transactionSettings.ts:26-48, 86-120` | `POST /settings/schema` and `POST /schema/config` lack admin role checks and mutate stale in-memory `store.globalSchema` (Resolved in `SIGN-OFF-DATASETUP-DESIGN-2026-11-26.md`) |
| `AUD-DSU-004` | **MEDIUM** | Spec §1 & §2.1 | `ValueDictionariesView.tsx:39, 59-80` | `noMatchPolicy` uses `'FALLBACK'` instead of `'USE_FALLBACK'`, omits `'FLAG'`, and seeds designer mockup counts (`128`, `9`) (Resolved in `SIGN-OFF-DATASETUP-DESIGN-2026-11-26.md`) |
| `AUD-DSU-005` | **MEDIUM** | Redesign UI / Rule 16 | `DataSetupLandingView.tsx:197` | Inline `style={{ zoom: 0.9 }}` compounds with global `html { zoom: 0.8 }` (`index.css:90`), shrinking Data Setup to 72% scale (Resolved in `SIGN-OFF-DATASETUP-DESIGN-2026-11-26.md`) |

---

## 4. Detailed Findings

### AUD-DSU-001: Hardcoded Mock Resources Merged Permanently with Live PostgreSQL Connections
- **Severity**: HIGH
- **Status**: OPEN
- **Location**: [`frontend/src/components/datasetup/DataSetupLandingView.tsx#L39-L150`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/datasetup/DataSetupLandingView.tsx#L39-L150)
- **Evidence**: `resources` initializes with 5 hardcoded mock connections (`Core Ledger` at `10.0.4.12:5432`, `Sett`, `LocalFTP`, `MongoDB Operational Workflow`, `SettlemFTP` at `192.168.22.210:2222`). When `api.getDatabases()` resolves, `setResources(prev => { const list = [...prev]; ... })` merges live connections onto the mock array instead of replacing it, leaving non-existent systems permanently visible.
- **Recommended Remediation**: Initialize `resources` as `[]` with a loading skeleton, and populate strictly from `api.getDatabases()` and `api.getFtpStagingConfigs()`.

### AUD-DSU-002: Non-Persisted Bulk Edits & Incomplete Unclassified Filter in `MappingDictionaryView.tsx`
- **Severity**: HIGH
- **Status**: OPEN
- **Location**: [`frontend/src/components/datasetup/MappingDictionaryView.tsx#L72, L88, L107-L141`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/datasetup/MappingDictionaryView.tsx#L72)
- **Evidence**: `handleAutoClassify`, `handleBulkSetCategory`, and `handleBulkMarkRequired` only call `setFields(...)` without calling `api.saveGlobalStandardDirectory` or `globalMappingService` persistence methods. Additionally, `filterMode === 'UNCLASSIFIED'` checks only `!f.category || f.category === 'Unclassified'`, ignoring `General` and table-named categories specified in `DATA_SETUP_AND_TECHNICIAN_SOLUTION_FLOW_SPECIFICATION.md §2.2`.
- **Recommended Remediation**: Persist all dictionary classifications and required flags to PostgreSQL via API, and use the shared `isUnclassifiedField` helper.

### AUD-DSU-003: Unprotected Global Schema Mutation Routes in `transactionSettings.ts`
- **Severity**: HIGH
- **Status**: OPEN
- **Location**: [`backend/src/routes/transactionSettings.ts#L26-L48, L86-L120`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/transactionSettings.ts#L26-L48)
- **Evidence**: `POST /api/transactions/settings/schema` and `POST /api/transactions/schema/config` do not enforce `requireRole('admin')`, allowing any operator to overwrite global schema fields. `GET /schema/config` also falls back silently to in-memory `store.globalSchema` on DB errors.
- **Recommended Remediation**: Add `requireRole('admin')` (or Maker-Checker proposal routing) to global schema mutation routes and propagate PostgreSQL errors cleanly.

### AUD-DSU-004: Contract Drift & Mockup Sample Seeding in `ValueDictionariesView.tsx`
- **Severity**: MEDIUM
- **Status**: OPEN
- **Location**: [`frontend/src/components/datasetup/ValueDictionariesView.tsx#L39, L59-L80`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/datasetup/ValueDictionariesView.tsx#L39)
- **Evidence**: `DictionaryItem.noMatchPolicy` is typed as `'KEEP_ORIGINAL' | 'BLANK' | 'FALLBACK'`, diverging from backend `ValueDictionaryNoMatchPolicy` (`'KEEP_ORIGINAL' | 'BLANK' | 'USE_FALLBACK' | 'FLAG'`). Initial state also seeds designer illustration counts (`missingPairs: [{ code: '07', count: 128 }, { code: '11', count: 9 }]`), contradicting Spec §1.
- **Recommended Remediation**: Align `noMatchPolicy` with the backend enum (`USE_FALLBACK`, `FLAG`) and load `missingPairs` solely from `/api/value-translation-dictionaries/:id/untranslated`.

### AUD-DSU-005: Compound CSS Zoom (`0.9` × `0.8`) in `DataSetupLandingView.tsx`
- **Severity**: MEDIUM
- **Status**: OPEN
- **Location**: [`frontend/src/components/datasetup/DataSetupLandingView.tsx#L197`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/datasetup/DataSetupLandingView.tsx#L197)
- **Evidence**: `style={{ zoom: 0.9 }}` compounds with `html { zoom: 0.8 }` in `index.css:90`, rendering Data Setup at 72% scale compared to 80% across the rest of the redesigned UI.
- **Recommended Remediation**: Remove `style={{ zoom: 0.9 }}` and rely on standard Tailwind spacing/typography tokens.

---

## 5. References
- [Master Audit Register](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/master-audit.md)
- [Audit Reports Index](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/INDEX.md)
