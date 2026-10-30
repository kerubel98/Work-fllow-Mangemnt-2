# MASTER ARCHITECTURE DIRECTORY & ENTRY POINT
## Central Governance Index, Architectural Hierarchy, and Evolution Changelog

**Repository Root**: `c:\Users\hp\Downloads\opration-workflow-mangement1`  
**Governance Authority**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rule 22 & 23) and [`bo-operational-governance`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md)  
**Document Status**: Authoritative Entry Point for All Architectural Specifications and Change Logs  
**Last Updated**: 2026-10-24

---

## 1. Executive Purpose & Entry Point Mandate

This document serves as the **single authoritative entry point** collecting, indexing, and organizing all master architectural specifications, engineering implementation plans, acceptance reports, verification audits, and decision logs across the entire Back Office (BO) Settlement, Investigation, Validation, Rule Builder, and Reconciliation platform.

### The Governance Invariant:
1. **Mandatory Central Indexing**: Any architectural modification, new domain subsystem, or refactoring in this repository MUST be registered in this document with its scope, document references, and cross-layer impact.
2. **Dedicated Change Summaries**: Every referenced master document MUST maintain its own in-document **Architectural Change Summary / Revision Log** documenting every architectural shift, the rationale, and physical code impact.
3. **Traceability Until Sign-Off**: No feature or milestone may be accepted or signed off without full end-to-end traceability connecting the master spec, plan, acceptance report, code-level verification audit, and recorded change summary.

---

## 2. Complete Master Architecture Map & Domain Index

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               MASTER ARCHITECTURAL DOMAIN TOPOLOGY                                │
└──────────────────────────────────┬────────────────────────────────┬───────────────────────────────┘
                                   │                                │
            ┌──────────────────────┴───────┐        ┌───────────────┴──────────────────┐
            ▼                              ▼        ▼                                  ▼
 ┌──────────────────────┐       ┌──────────────────────┐      ┌─────────────────────┐   ┌──────────────────────┐
 │ 1. PIPELINE ENGINE   │       │ 2. RULE COMPILATION  │      │ 3. UNIVERSAL        │   │ 4. MESSAGING &       │
 │    & FLOWCHART DAG   │       │    & METHOD MAPPING  │      │    HASHTAG ENGINE   │   │    FTP STAGING       │
 ├──────────────────────┤       ├──────────────────────┤      ├─────────────────────┤   ├──────────────────────┤
 │ • 4-Stage Flowchart  │       │ • Verdict vs Action  │      │ • 4-Type Taxonomy   │   │ • Central OAuth 2.0  │
 │ • Coordinate Inject  │       │ • Box Type -> Method │      │ • Zero-File Scanner │   │ • Staged Message DDL │
 │ • UNLOGGED Mirrors   │       │ • Dynamic Tuple SQL  │      │ • Dry-Run Diff UI   │   │ • Secure Credentials │
 │ • Input Resolver     │       │ • Parameter bounds   │      │ • Maker-Checker PR  │   │ • Channel Adapters   │
 └──────────┬───────────┘       └──────────┬───────────┘      └──────────┬──────────┘   └──────────┬───────────┘
            │                              │                             │                         │
            └──────────────────────────────┼─────────────────────────────┴─────────────────────────┘
                                           │
                                           ▼
            ┌───────────────────────────────────────────────────────────────────────┐
            │ 5. RECONCILIATION, GOVERNANCE & MAKER-CHECKER (CROSS-CUTTING)         │
            ├───────────────────────────────────────────────────────────────────────┤
            │ • Anti-Self-Approval (`makerId !== checkerId`)                        │
            │ • 64-Bit Cryptographic Advisory Locking (`md5` BigInt)                │
            │ • Full-Viewport Scroll Containment & Stationary Headers               │
            └───────────────────────────────────────────────────────────────────────┘
```

---

## 3. Master Architectural Documents Directory & Change Summaries

### Domain 1: Universal Hashtag Automation Engine
* **Master Specification**: [`UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md)
* **Associated Implementation Plans**: [`IMPLEMENTATION_PLAN_UNIVERSAL_HASHTAGS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/IMPLEMENTATION_PLAN_UNIVERSAL_HASHTAGS.md) & [`IMPLEMENTATION_PLAN_UNIVERSAL_HASHTAGS_REMEDIATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/IMPLEMENTATION_PLAN_UNIVERSAL_HASHTAGS_REMEDIATION.md)
* **Acceptance Reports**: [`ARCHITECTURE_IMPLEMENTATION_ACCEPTANCE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/ARCHITECTURE_IMPLEMENTATION_ACCEPTANCE_REPORT.md) & [`ARCHITECTURE_REMEDIATION_FINAL_ACCEPTANCE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/ARCHITECTURE_REMEDIATION_FINAL_ACCEPTANCE_REPORT.md)
* **Verification Audit & Response**: [`VERIFICATION_AUDIT_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/VERIFICATION_AUDIT_REPORT.md) & [`AUDIT_RESPONSE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AUDIT_RESPONSE_REPORT.md)
* **Key Scope & Architectural Principles**:
  * Transforms `#hashtags` from static file upload labels into executable operational directives.
  * **4-Type Taxonomy**: Type A (*Batch File-Ingestion*), Type B (*Database-Direct Scanner / Zero-File*), Type C (*ETL / Staging Pipeline*), Type D (*Auditing & Compliance Sweep*).
  * Enforces partial dry-run investigation checks vs. full mutating execution (`onPass: "EXECUTE_SQL"`).
  * Directives in team escalation chat (`/escalate`, `/create-hashtag`).
* **Cumulative Architectural Change Summary**:
  * **2026-10-04 (Initial Architecture Implementation)**: Migrated schema via `026_universal_hashtag_engine.sql` adding 9 columns to `hashtag_presets` and table `hashtag_execution_runs`. Added 9 repository methods, live DB routing for Type B, 500-chunk batch staging for Type C, 14 API routes, and 4-type authoring UI with Pre-Flight Drawer in `HashtagManager.tsx`.
  * **2026-10-04 (Traceability Hub Integration)**: Added Section 10 (`Implementation Flow: Architectural Roadmap, Acceptance & Audit Traceability`) indexing all 10 architectural plans, reports, and audits.
  * **2026-10-04 (Reality Check Audit - AGAP-01 to 09)**: Independent verification audit uncovered false-green test in Type D `auditRows: []`, unwired `conditionalAction` Maker Proposal staging, missing Type A/D execute routes, and `testPreFlight` external DB routing omission.
  * **2026-10-04 (Formal Audit Response Compiled)**: Produced [`AUDIT_RESPONSE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AUDIT_RESPONSE_REPORT.md) with full inspection log, physical code evidence, line-by-line verification, and actionable remediation matrix. Re-classified engine certification status to PARTIAL pending gap remediation.
  * **2026-10-04 (Remediation Plan Authored)**: Authored [`IMPLEMENTATION_PLAN_UNIVERSAL_HASHTAGS_REMEDIATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/IMPLEMENTATION_PLAN_UNIVERSAL_HASHTAGS_REMEDIATION.md) establishing 5-phase engineering roadmap to systematically resolve AGAP-01 through AGAP-09.
  * **2026-10-04 (Gap Remediation & 100% Final Sign-Off)**: Executed all 5 phases of remediation plan. Resolved AGAP-01 (Type D diagnostic taint query with real breached issues, zero false greens), AGAP-02 (`conditionalAction` Maker Proposal auto-staging upon passing scans), AGAP-03 (built and booted `hashtagSchedulerService` for `SCHEDULED_CRON`), AGAP-04 (added `execute-file` and `execute-audit` API routes and frontend client methods), AGAP-05 (64-bit BigInt advisory locking parameterization and clean DDL), AGAP-06 (`testPreFlight` external DB routing), AGAP-07 (relaxed preset template validation), AGAP-08 (genuine lifecycle MTTD/MTTR in `getTeamHashtagReport`), and AGAP-09 (Personal Automation metrics view in `TeamHashtagReportsTab.tsx`). All 31 backend test suites (247 tests) passing; backend and frontend production builds exit with code 0. Certified 100% in [`ARCHITECTURE_REMEDIATION_FINAL_ACCEPTANCE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/ARCHITECTURE_REMEDIATION_FINAL_ACCEPTANCE_REPORT.md).
  * **2026-10-09 (Hashtag Preset Lifecycle: Edit, Share & Delete Operations)**: Implemented complete lifecycle management for hashtag presets across backend, API, and UI layers. Added repository methods `updateHashtag` and `deleteHashtag` with dual tag/ID scoping in [`postgresRepo.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/store/postgresRepo.ts), REST API routes `PUT /api/hashtags/:tag` and `DELETE /api/hashtags/:tag` in [`misc.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/misc.ts), and integrated `'HASHTAG'` as a first-class asset type in [`assetSharingService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/assetSharingService.ts) enabling workspace cloning (`#TAG_COPY`). Upgraded [`HashtagManager.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/issue/HashtagManager.tsx) with card footer and inspector action buttons (Edit, Share, Delete), an in-place Edit configuration modal, a 1-click Quick Share clipboard dialog (Copy Tag, Copy SQL, Copy JSON), seamless integration with [`ShareAssetModal.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/common/ShareAssetModal.tsx) for Team Resource Center distribution, and a delete confirmation dialog. Verified in test suite 10 of [`universalHashtagsEngine.test.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/__tests__/universalHashtagsEngine.test.ts) (14/14 tests passing) with clean backend (`tsc`) and frontend (`vite build`) compilation.
  * **2026-10-09 (Multi-Format Ingestion Engine: Excel & XML Support)**: Extended Type A (`FILE_INGESTION`) hashtags and operational task intake to ingest Excel (`.xlsx`, `.xls`) and XML (`.xml`) files alongside CSV. Integrated binary worksheet parsing via `XLSX` and DOM-level tree parsing for banking/financial XML interchange formats (e.g. ISO 20022 `camt.053` / `pacs.008` feeds) with automatic candidate record identification, attribute flattening, and canonical dictionary lookups. Verified in test suite 1 of [`universalHashtagsEngine.test.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/__tests__/universalHashtagsEngine.test.ts) (15/15 tests passing) and verified clean production bundle in `vite build`.
  * **2026-10-09 (Interactive Column Mapping, Data Cleaning Suite & Workflow Approval Hierarchy)**: Added header acceptance, interactive column mapping to canonical standard fields, per-column required field toggles (`minimumRequiredColumns`), sample data preview table, and integrated sample data cleaning tools (deduplication, empty row removal, date format standardization to ISO `YYYY-MM-DD`, whitespace trimming). Added Data Transformation Dictionary deferred preview modal. Integrated task creation schema mismatch alert/guard when uploaded files miss required columns. Linked hashtag presets to validation workflows with approval hierarchy (approved workflows sorted first and badges indicating approval status). Verified with 15/15 tests passing in backend Vitest and 0 compilation errors across backend (`tsc`) and frontend (`vite build`).
  * **2026-10-17 (Workflow Universal Hashtag Binding & Dedicated Pipeline Action Column with Workflow Conducted Inspector)**:
    * **PostgreSQL Schema**: Added `hashtags JSONB DEFAULT '[]'::jsonb` to `database_validation_workflows` with GIN indexing via migration `031_workflow_universal_hashtags.sql`.
    * **Backend Repository & Routes**: Updated `postgresRepo.ts` and `workflowsRouter` to persist, hydrate, and update `hashtags` via `GET /api/workflows`, `GET /api/workflows/:id`, and `PUT /api/workflows/:id`.
    * **Frontend Action Column & Layout**: Dedicated `Action Taken` / `Action Status` column restored in `ValidationOrchestratorWorkspace.tsx` immediately adjacent to Validation Status, displaying color-coded interactive badges (`STOP`, `CONTINUE`, `FLAG`, `REPORT`, `RECONCILE`, `PENDING`) with Excel-style column filtering and sorting popover.
    * **Action & Workflow Conducted Inspector Modal**: Active and connected to the Action Taken badges, displaying effective action verdict, stage-by-stage sequential DAG audit trail, and source vs target ledger records.
    * **Workflow Universal Hashtag Management**: Maintained toolbar and inspector controls to bind and unbind universal hashtags directly on the active workflow, persisted in PostgreSQL. Verified with full `tsc` and `vite build` production compilation.

---

### Domain 2: Operational Pipeline Engine & Flowchart DAG Architecture
* **Master Specification**: [`PIPELINE_ENGINE_MASTER_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/PIPELINE_ENGINE_MASTER_ARCHITECTURE.md)
* **Associated Implementation Plan**: [`IMPLEMENTATION_PLAN_PIPELINE_ENGINE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/IMPLEMENTATION_PLAN_PIPELINE_ENGINE.md)
* **Acceptance Report**: [`ARCHITECTURE_ACCEPTANCE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/ARCHITECTURE_ACCEPTANCE_REPORT.md)
* **Design System Audit**: [`UI_UX_DESIGN_SYSTEM_AUDIT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/UI_UX_DESIGN_SYSTEM_AUDIT.md)
* **Key Scope & Architectural Principles**:
  * Decouples the 4 lifecycle dimensions: Task Status, Financial Status, Investigation State, and Rule Verdict.
  * **Deterministic Coordinate Injection**: Injects `(task_id, row_number)` across all pipeline stages, preserving individual transaction identity through batch queries.
  * **Dedicated UNLOGGED Mirror Tables**: Dynamically mirrors external DB data into typed `UNLOGGED` tables (`mirror_{db}_{table}`) with 64-bit advisory locking.
  * **NextStageInputResolver**: Automatically propagates resolved columns and coordinates between consecutive pipeline stages.
* **Cumulative Architectural Change Summary**:
  * **2026-10-02 (Pipeline Architecture Overhaul)**: Deprecated legacy single-stage processors in favor of multi-stage `WorkflowPipelineBuilder`, `ExecutablePipeline`, and `CoordinateInjector`.
  * **2026-10-03 (Flowchart Synchronization & Scope Invariance)**: Synchronized pipeline properties across Canvas (`WorkflowStudioFlowchart.tsx`), Inspector, Execution Engine, and Persistence. Enforced explicit `targetDbId` and `targetTable` scoping.
  * **2026-10-03 (Operational Acceptance)**: Certified row-number invariants, multi-row matching, duplicate input handling, and unlogged mirror persistence with zero regressions.

---

### Domain 3: Rule-to-Method Pipeline Architecture & Dynamic SQL Compilation
* **Master Specifications**: [`RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md), [`MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md) & [`GAP_ANALYSIS_AND_SYSTEMIC_MODIFICATION_DOCUMENT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/GAP_ANALYSIS_AND_SYSTEMIC_MODIFICATION_DOCUMENT.md)
* **Implementation Plan**: [`COMPREHENSIVE_IMPLEMENTATION_PLAN_TWO_LEVEL_RECONCILIATION_AND_MULTI_LEG.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/COMPREHENSIVE_IMPLEMENTATION_PLAN_TWO_LEVEL_RECONCILIATION_AND_MULTI_LEG.md)
* **Key Scope & Architectural Principles**:
  * Translates visual validation boxes into concrete executable pipeline methods:
    * `INGESTION_SEARCH` -> `IngestionSearchMethod`
    * `CONDITION_CHECK` -> `ConditionCheckMethod`
    * `RECONCILIATION` -> `ReconciliationMethod`
    * `REPORT` -> `DiagnosticReportMethod`
  * **Strict Separation**: Separates what a rule evaluates (`PASS`, `FAIL`, `DISCREPANCY`, `ERROR`) from what the pipeline triggers next (`CONTINUE`, `STOP`, `CLOSE`, `FLAG`, `REPORT`).
  * **Batched Tuple SQL Compilation**: Dynamically compiles declarative matching criteria into batched ANSI SQL tuple queries (`WHERE (col1, col2) IN ((val1, val2), ...)`), capped strictly below 30,000 parameters.
  * **Full Schema Fidelity & Workflow-Scoped Storage**: Multi-leg banking transactions retain 100% of physical mirror columns in `returned_data[workflowId][targetTable]`, evaluating duplicate postings with full identifier attribution (`identifierColumn`, `identifierValue`) without mirror self-joins.
  * **Inspector-Driven DB Config Attachment & Stage Lifecycle**: Preserves DAG canvas simplicity without wire connectors; DB configs run strictly LAST in the stage after set-based reconciliation.
* **Cumulative Architectural Change Summary**:
  * **2026-10-02 (Initial Method Mapping Blueprint)**: Formalized the 4 canonical box types, decoupling check algorithms from pipeline routing.
  * **2026-10-03 (Composite Tuple Query Engine)**: Upgraded `ruleSqlCompiler.ts` with ANSI column quoting and composite key tuple chunking.
  * **2026-10-04 (Leg-Level Duplicate Scoping & Nullable Column Preservation)**: Upgraded `ruleSqlCompiler.ts` and `investigationEngine.ts` to scope duplicate count subqueries by `_dup._row_number = m._row_number` and preserve filter conditions on nullable columns. Documented in [`RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md §10.7`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md#L2719) and audited in [`VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md).
  * **2026-10-05 (Ingestion Search Missing Coordinate Accounting & Float Coercion Elimination)**: Formulated and executed [`IMPLEMENTATION_PLAN_ROW_COORDINATE_AND_INGESTION_AUDIT_GAPS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/IMPLEMENTATION_PLAN_ROW_COORDINATE_AND_INGESTION_AUDIT_GAPS.md). Remediated external database dropout of non-matching records, eliminated IEEE 754 precision distortion and MySQL numeric double-float coercion on 18-digit financial UTRNNO identifiers (`buildValuesIngressQuery`), and established immutable row coordinate binding across database, backend, and UI layers. Verified on Task `ISS-6362` producing exactly 32 PASS and 18 FAIL. Documented in [`VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md §15`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md#L557).
  * **2026-10-08 (Comprehensive Codebase Bug Report & Systemic Reality Check)**: Conducted repository-wide static and architectural audit. Uncovered mathematical duplicate check invalidation (`_dup._row_number = m._row_number` in `ruleSqlCompiler.ts:347`), false-pass guard bypass on missing external DB records (`investigationEngine.ts:375`), connection pool transaction leaks (`pool.query('BEGIN')`), advisory lock bypass, and worst-case 50,000-row UI thread freeze. Documented in [`VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md §16`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md#L617) and published in authoritative audit artifact [`COMPREHENSIVE_BUG_REPORT_AND_GOVERNANCE_AUDIT.md`](file:///C:/Users/hp/.gemini/antigravity-ide/brain/6180632f-53f3-48f1-bcb3-16e17a5c46ce/COMPREHENSIVE_BUG_REPORT_AND_GOVERNANCE_AUDIT.md).
  * **2026-10-08 (Multi-Leg Duplicate Detection, Inspector DAG & Comparative Gap Ratification)**: Codified Option A Inspector-driven DB config attachment (eliminating canvas wire clutter), workflow-scoped `returned_data[workflowId][targetTable]` with full column fidelity, sequential stage execution (DB configs execute LAST on passed rows), and published comparative gap analysis against historical audits. Codified in [`MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md), [`GAP_ANALYSIS_AND_SYSTEMIC_MODIFICATION_DOCUMENT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/GAP_ANALYSIS_AND_SYSTEMIC_MODIFICATION_DOCUMENT.md), [`RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md §10.8`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md#108-multi-leg-duplicate-checking-via-jsonb-coordinate-consolidation-and-identifier-attribution), and [`VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md §17`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md#L667).
  * **2026-10-08 (Two-Level Reconciliation, Multi-Leg Drilldown & Pipeline Method Implementation)**: Fully executed [`COMPREHENSIVE_IMPLEMENTATION_PLAN_TWO_LEVEL_RECONCILIATION_AND_MULTI_LEG.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/COMPREHENSIVE_IMPLEMENTATION_PLAN_TWO_LEVEL_RECONCILIATION_AND_MULTI_LEG.md) across all 5 phases: Applied Migration 027 (`returned_data` JSONB, GIN index, and `status_behavior`/`affects_reconciliation_status`), decoupled Two-Level Status (`reconciliation_status` Level 1 vs `validation_status` Level 2), implemented `DbConfigValidationMethod` executing last on passed rows with `MUTATE_STATUS` / `REPORT_ONLY` modes, resolved false-pass and correlated subquery bugs, integrated 64-bit cryptographic advisory locking (`task_exec_${taskId}`), and added frontend multi-leg drilldown accordion in `ValidationOrchestratorWorkspace.tsx`. Verified across all 31 backend test suites (248/248 passing) and clean frontend build (`vite build` passing in 15.07s).
  * **2026-10-10 (Rule-to-Method Static Audit Verification & Full Remediation Execution)**: Verified all 12 AUD findings from `RULE_TO_METHOD_PIPELINE_AUDIT.md`. Executed full remediation across 5 phases:
    1. **Phase 1 (Fail-Closed SQL Compilation & Hardening)**: Replaced permissive `baseSql = 'TRUE'` with explicit error throws on missing target fields or unsupported check types; validated numeric thresholds with `Number.isFinite`; dynamically injected `FROM task_dataset_transactions t` join on `(m._task_id = t.task_id AND m._row_number = t.row_number)` in `ruleSqlCompiler.ts`; and eliminated unrestricted `WHERE 1=1` table scans in `externalDataQueryService.ts`.
    2. **Phase 2 (Transaction Identity & Multi-Stage Rollup)**: Replaced destructive row-level outcome map overwriting with immutable `rowHistoryMap` and canonical rollup (ANY stage `FAIL`/`ERROR` preserves final `FAIL`/`ERROR`, action precedence `STOP` > `CLOSE` > `FLAG` > `REPORT` > `CONTINUE`); calculated `passedCount` and `failedCount` over unique input transactions; preserved full stage history in `details.stageHistory`; and replaced silent error swallows with structured `ERROR` outcomes in `ExecutablePipeline.ts`.
    3. **Phase 3 (Reconciliation Action Preservation & Parity)**: Replaced false-success count return when PostgreSQL is offline with 0 in `reconciliationService.ts`; fixed `ORDERED_FIRST_PICKED` status for `EXPLICIT_FIRST` policy and fail-closed check type evaluation in `ReconciliationEngine.ts`.
    4. **Phase 4 (DAG Hardening & Connection Preservation)**: Preserved `workflow.connections` in `CompiledValidationPlan` and added self-referential cycle detection for single-stage graphs in `validationPipelineBuilder.ts`.
    5. **Phase 5 (Regression Suite & Verification)**: Authored `pipelineAuditedDefects.test.ts`. Verified full backend suite: 36 passed test files out of 36, 280 passed tests out of 280 (100% pass rate). Documented in [`RULE_TO_METHOD_PIPELINE_REMEDIATION_PLAN.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_REMEDIATION_PLAN.md).
  * **2026-10-10 (Decoupling Mirror Table Reconciliation from Coordinate-Scoped DbConfigValidationMethod & Multi-Leg Filter Preservation)**: Rectified conflation of batch-wide mirror staging records with coordinate-scoped candidate legs. Table-level column configurations (`DUPLICATE_CHECK`, `COMPLETENESS_CHECK`, `VALUE_RANGE_CHECK`) now execute exclusively in `DbConfigValidationMethod` on `targetRows` belonging to that transaction coordinate (`_row_number`), stripping `columnConfigurations` from the mirror table `UPDATE` compiled rules in `WorkflowPipelineBuilder.ts`. Preserved coordinate-level filter conditions (`PROC_NAME != 'RVS'`), ensuring reversal legs are filtered out and leaving exactly 1 settlement leg (`count = 1 <= 1`), passing the check and correcting prior assessments that omitted the filter. Enforced case-insensitive field resolution (`resolveField`) across uppercase MySQL projections and lowercase PostgreSQL mirror attributes, and deduplicated external SQL key mappings. Verified on Task `ISS-6362` yielding exactly 32 PASS and 18 FAIL (`NOT_FOUND_IN_TARGET_DB`). Documented in [`RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md §10.8.2`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md#1082-decoupling-mirror-table-sql-reconciliation-from-coordinate-scoped-dbconfigvalidationmethod--filter-preservation).
  * **2026-10-11 (Multi-Leg Architecture Review Remediation & Zero-Match Atomic Left Join Invariance)**: Resolved all 12 architectural recommendations from the formal 11 October 2026 Architecture Review:
    1. **Decoupled 4-Dimension Lifecycle**: Formalized strict separation of `acquisition_status` (`SUCCESS`/`ERROR`), `match_status` (`FOUND`/`NOT_FOUND`), `validation_status` (`PASS`/`FAIL`/`ERROR`), and `pipeline_action` (`CONTINUE`/`STOP`/`CLOSE`/`FLAG`/`REPORT`).
    2. **Single Atomic Set-Based `LEFT JOIN` Update**: Refactored `reconciliationService.ts` to drive updates from `task_dataset_transactions source_rows LEFT JOIN grouped_mirror gm`. Guaranteed 100% row coverage: zero-match rows receive explicit `match_status = 'NOT_FOUND'`, `_matched_leg_count = 0`, and `returned_data = NULL` without separate fragile SQL passes.
    3. **Standardized Option B `returned_data` JSONB Contract**: Codified `returned_data = { [workflow_id]: { [target_table]: [leg1, leg2, ...] } }`, stripping synthetic metadata clutter (`stages`, `audit`), and strictly persisting `NULL` for zero-match rows.
    4. **Multi-Leg Duplicate Evaluator Upgrades (`DbConfigValidationMethod.ts`)**: Implemented allowlisted operator evaluation (`>`, `>=`, `=`, `==`, `<`, `<=`, `!=`, `<>`), fail-closed rejection of unsupported operators (`status: 'ERROR'`), diagnostic retention of all violating leg identifiers (`violatingLegIdentifiers`), and strict null semantics in filter predicates (missing fields never qualify `!=` conditions). Aligned `DbConfigMethodResult` TypeScript interface.
    5. **Automated Verification & Zero-Assumption Certification**: Expanded regression test suite in [`twoLevelReconciliationAndMultiLeg.test.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/__tests__/twoLevelReconciliationAndMultiLeg.test.ts) to 8 comprehensive test cases (100% passing). Verified physical database state on Task `ISS-6362`. Ratified and fully signed off in [`MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md §8-§9`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md#8-formal-architecture-review--required-corrections-11-october-2026).

---


### Domain 4: Enterprise Messaging, Staging & Centralized OAuth 2.0
* **Master Specification**: [`MESSAGE_INTEGRATION_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MESSAGE_INTEGRATION_ARCHITECTURE.md)
* **Database Migrations**: `024_staged_message_attachments_raw_data.sql`, `025_workflow_attached_db_configs.sql`
* **Key Scope & Architectural Principles**:
  * Ingestion and staging architecture for multi-channel intake (Email, WhatsApp, Telegram, SFTP).
  * **Centralized OAuth 2.0 Credentials**: Enterprise credentials (Client ID, Secret, Tenant ID) managed strictly at Admin level (`provider_connections`). Individual teams only provide their mailbox email address, never sensitive secrets.
  * **Raw Data Staging**: Decoupled attachment parsing and raw data staging preventing large payloads from bloating task documents.
* **Cumulative Architectural Change Summary**:
  * **2026-09-24 (Initial Messaging Architecture)**: Blueprint for inbound message intake, attachment parsing, and team mailbox routing.
  * **2026-10-01 (OAuth 2.0 Centralization & Team Segregation)**: Implemented `oauth2Service.ts` and masked credential storage in PostgreSQL.
  * **2026-10-03 (Attachment Raw Data Schema)**: Added migration 024 supporting raw data persistence and background attachment staging.
  * **2026-10-18 (Personal User OAuth 2.0 Mailbox, Circular Avatars, In-Chat Email Threads & Attachment Intake)**:
    1. **Personal User Scope & Rule 14 Enforcement**: Enforced strictly personal user scope for user profile OAuth 2.0 configurations. Centralized enterprise app registrations remain managed at Admin level; individual users consent only to required mailbox scopes (*Inbox/Outbox, Attachments, Send/Reply, Auto-Sync*) without raw passwords.
    2. **PostgreSQL Schema Persistence (Rule 23)**: Added migration `032_user_profile_and_settings.sql` extending `users` with `message_provider_settings`, `avatar_url`, `phone_number`, `job_title`, `department`, `timezone`, and UI preferences with atomic JSONB updates via `postgresRepo.ts` and `/api/auth/profile`.
    3. **Personal Mailbox Intake & Collation**: Implemented `getUserMailbox(userId, filter, search)` in `messageIntakeService.ts` grouping raw messages into normalized threads with participants, timestamps, and staged attachment records (`settlement_mailbox_guide.pdf`).
    4. **Circular Visual Design System**: Standardized circular geometry (`rounded-full`) across SideNav collapsed buttons, SideNav profile cards, UserProfileModal presets/uploads, Personal Chat colleague directory, conversation headers, and chat message bubbles (self right, sender left).
    5. **Dual-Mode Personal Chat Workspace**: Enhanced `PersonalChat.tsx` with top mode switcher (*Direct Messages* vs *Personal Mailbox (OAuth 2.0)*), email thread inspection, attachment downloads, and direct in-thread reply dispatches.
    6. **Rule 16 Viewport Containment**: Enforced stationary header containment and eliminated outer scroll leaks in `App.tsx` for `activeNavigation === 'direct_chat'`. Verified with zero TypeScript errors across both workspaces and 100% clean production build.
    7. **Universal In-Chat Directives & Mentions Engine (`MESSAGE_INTEGRATION_ARCHITECTURE.md §19`)**: Standardized `UnifiedChatInput.tsx` across personal direct chat (`PersonalChat.tsx`), personal mailbox replies, team discussions (`TeamDiscussionTab.tsx`), incident escalation room modal (`EscalationRoomModal.tsx`), and the investigation workspace collaborative consensus chat drawer (`ValidationOrchestratorWorkspace.tsx`) with real-time keyboard-navigated popover triggers for `/` command directives (`/create-task`, `/create-escalate`, `/create-hashtag`, `/call-hashtag`, `/request-approval`), `@` user mentions, `@@` team mentions, and `#` universal hashtags from PostgreSQL.

---

### Domain 5: Financial Reconciliation & Discrepancy Settlement
* **Master Specification**: [`RECONCILIATION_PROCESS_ARCHITECTURE_AND_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RECONCILIATION_PROCESS_ARCHITECTURE_AND_SPECIFICATION.md)
* **Decision Records**: [`DECISION_LOG.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/DECISION_LOG.md) (ADR-001, ADR-002, ADR-003)
* **Key Scope & Architectural Principles**:
  * Governs high-volume back-office settlement matching between core banking transactions and switch/FTP logs.
  * **Maker-Checker Dual Authorization (ADR-001)**: Every manual match override or write-off must be proposed by a Maker and confirmed by a separate Checker (`makerId !== checkerId`). Anti-self-approval enforced at API and DB layers.
  * **64-Bit Cryptographic Advisory Locking (ADR-002)**: Replaced 32-bit `hashtext` with 64-bit MD5 bigint derivation to eliminate hash collisions across concurrent rollbacks.
  * **UNLOGGED Mirror Table Reconciliation (ADR-003)**: Eliminates WAL write amplification during intensive reconciliation bulk loads.
* **Cumulative Architectural Change Summary**:
  * **2026-09-18 (Reconciliation Specification)**: Original back-office settlement matching rules, tolerance matching, and exception queues.
  * **2026-09-28 (Governance & Maker-Checker ADRs)**: Codified ADR-001, ADR-002, and ADR-003 in `DECISION_LOG.md`.

---

### Domain 6: Operational Implementation Baseline & System Context
* **Master Baseline Document**: [`CURRENT_PROJECT_CONTEXT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/CURRENT_PROJECT_CONTEXT.md)
* **Key Scope & Architectural Principles**:
  * Grounded 100% in physical source code, active schemas, and live endpoints.
  * Serves as the authoritative barrier preventing recurrence of obsolete historical assumptions (e.g. MongoDB, client-side localStorage, or unbatched queries).
* **Cumulative Architectural Change Summary**:
  * **2026-09-06 (Baseline Reconstruction)**: Replaced legacy MongoDB assumptions with active PostgreSQL schema, 22 tables, and pool configuration.
  * **2026-10-04 (Architecture Hub Integration)**: Cross-linked to `MASTER_ARCHITECTURE_INDEX.md` as the unified master architectural directory.

---

### Domain 7: Standard File Ingestion & Column Mapping Workspace
* **Master Specification**: [`STANDARD_FILE_INGESTION_AND_MAPPING_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/STANDARD_FILE_INGESTION_AND_MAPPING_ARCHITECTURE.md)
* **Associated Implementation Plan**: [`IMPLEMENTATION_PLAN_STANDARD_FILE_INGESTION_WORKSPACE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/IMPLEMENTATION_PLAN_STANDARD_FILE_INGESTION_WORKSPACE.md)
* **Key Scope & Architectural Principles**:
  * Decouples ingestion, cleaning, and schema mapping from `WorkspaceTaskCreator.tsx` into standalone reusable component [`StandardFileIngestionWorkspace.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/common/StandardFileIngestionWorkspace.tsx).
  * **Preamble-Aware Header Positioning**: Allows operators to set variable header start rows (`headerRowIndex >= 1`), stripping preamble metadata rows.
  * **Interactive Headerless Data Support**: Automatically counts columns on headerless files and prompts operators to manually assign unique column headers.
  * **PostgreSQL Relational Template Persistence**: Replaces in-memory mock templates with relational PostgreSQL persistence (`file_ingestion_mapping_templates`, Migration 028) and REST API routes.
  * **Ingestion Recipe & Column Hygiene**: Formally records `deletedColumns`, empty row policies (`DROP`, `FILL_NA`, `ERROR_BLOCK`), duplicate row policies (`DROP_EXACT`, `KEEP_FIRST`, `FLAG_FOR_REVIEW`), text hygiene, and required fields.
  * **Pre-Commit Integrity Gate & Save Interruption**: Aborts task creation if the file is incomplete, un-mapped, or schema-mismatched, displaying clear corrective feedback.
  * **Purge of Synthetic Mock Loaders**: Deprecates hardcoded sample buttons (`📄 Chargebacks CSV`, `📊 Settlement CSV`).
* **Cumulative Architectural Change Summary**:
  * **2026-10-09 (Master Architecture & Refactoring Plan Codified)**: Authored standalone specification [`STANDARD_FILE_INGESTION_AND_MAPPING_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/STANDARD_FILE_INGESTION_AND_MAPPING_ARCHITECTURE.md) and 6-phase engineering plan [`IMPLEMENTATION_PLAN_STANDARD_FILE_INGESTION_WORKSPACE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/IMPLEMENTATION_PLAN_STANDARD_FILE_INGESTION_WORKSPACE.md) establishing standalone component contract, PostgreSQL template schema, and pre-commit save interruption barrier.
  * **2026-10-09 (Full Implementation & Decoupled Required Column Enforcement)**: Migrated database schema via `028_file_ingestion_mapping_templates.sql` adding `file_ingestion_mapping_templates` and `mapping_template_id` on `hashtag_presets`. Decoupled required column constraints from `globalMappingService` and `dataSanitizerService`, shifting full schema enforcement authority to individual saved mapping templates (`FileIngestionMappingTemplate.requiredColumns`). Integrated `<StandardFileIngestionWorkspace />` into `WorkspaceTaskCreator.tsx` with preamble header row selection, headerless manual naming, column exclusion, in-place cleaning tools, and imperative pre-commit validation. Enforced template required columns across dual intake points: Task Creation (`POST /api/issues` halting on missing mandated columns) and Universal Hashtags (`executeFileIngestionHashtag` and `testPreFlight` enforcing linked template columns during transaction batch absorption). Verified via 5/5 integration tests in [`fileIngestionMappingTemplates.test.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/__tests__/fileIngestionMappingTemplates.test.ts) and verified 0 errors across backend (`npx tsc`) and frontend (`vite build`).
  * **2026-10-09 (Column Header Transformation Suite, Value Translation Architecture & Table Mapping Redesign)**: Implemented column header `...` action menu (Splitting, Merging, Quick Transformations, DB Sample Comparator). Fixed template save redirection by eliminating nested `<form>` event bubbling. Established architectural distinction between Global Schema (`global_standard_directory`) and Value Transformation Dictionaries (lookup tables like Bank Name $\rightarrow$ Bank Code for task creation & hashtags). Re-architected Admin Hub "Table Mapping" (renamed from Environment & Table Mappings) to adopt the live database sample table grid with header `...` actions (Split, Merge, Add to Global Field, and Value Transformation Dictionary linking).
  * **2026-10-10 (Universal Column Checkbox Selection & Dynamic Merge Action)**: Equipped all column headers in both Table Mapping (`SystemSettings.tsx`) and File Ingestion Workspace (`StandardFileIngestionWorkspace.tsx`) with individual selection checkboxes and master select-all in the `#` header. Positioned dynamic "Merge Columns" toolbar buttons that activate with selection counts (e.g. `Merge Columns (2)`) and launch pre-populated merge modals when $\ge 2$ columns are selected.
  * **2026-10-10 (Full PostgreSQL Relational Migration 029 & Governance Rule 23 Codification)**: Codified Governance Principle 23 (*Strict Prohibition of Client-Side localStorage as Primary State Store*) into `AGENTS.md`. Replaced client `localStorage` with relational PostgreSQL persistence (`value_translation_dictionaries`, Migration 029), backend repository methods in `postgresRepo.ts`, REST API endpoints (`/api/value-translation-dictionaries`), and authoritative hydration across `SystemSettings.tsx` and `StandardFileIngestionWorkspace.tsx`. Verified via 5/5 unit tests in [`valueTranslationDictionaries.test.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/__tests__/valueTranslationDictionaries.test.ts).
  * **2026-10-10 (Auto-Cleaner Recipe & Data Transformer Template Engine)**: Upgraded mapping templates from passive static column maps into full operational recipe holders (`splitOperations`, `mergeOperations`, `transformOperations`, `cleaningActions`, `valueTranslations`). All operations performed on a file prior to saving are saved in PostgreSQL (`cleaning_recipe` JSONB) and automatically replayed upon template selection, file drag-and-drop, issue creation, or hashtag ingestion. Verified via 6/6 unit tests in [`fileIngestionMappingTemplates.test.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/__tests__/fileIngestionMappingTemplates.test.ts) and clean frontend production build.

---

### Domain 6: Investigation Orchestration Workspace & Front-End Governance
* **Master Specification & Architecture Document**: [`FRONTEND_INVESTIGATION_ORCHESTRATION_MODIFICATION_SUGGESTIONS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/FRONTEND_INVESTIGATION_ORCHESTRATION_MODIFICATION_SUGGESTIONS.md)
* **Governing Component**: [`ValidationOrchestratorWorkspace.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx)
* **Key Scope & Architectural Principles**:
  * **Dual-Accordion Horizontal Comparison Table**: Replaces fragmented vertical cards with a structured, single horizontal comparison table in Accordion 1 (Input Data vs Returned DB Leg(s) with freeze-pane source labels and cell-level mismatch highlighting) and aggregated multi-stage validation findings in Accordion 2.
  * **Rule 6 Fault Tolerance & Modal Containment**: All complex workspace modals and drawers (`outcomeDrilldownRow`, `inspectingRow`, `showReversionHistory`, `showHashtagDiffModal`) wrapped in React `<ErrorBoundary>` components to prevent full-page unmounts from corrupted payloads.
  * **Debounced Search Performance (60fps)**: 250ms debounced search decoupling input keystroke rendering from dataset filtering across 5,000+ records.
  * **Lazy-Loaded Binary Modules**: Dynamic `await import('xlsx')` in `handleExportExcel` reducing initial bundle size by 430 KB.
  * **Governance Guardrails Codification**: Strict enforcement of Rule 2 (Verdict vs Pipeline Action), Rule 3 (Lifecycle Separation), Rule 7 (Maker-Checker proposal staging), and Rule 23 (Mandatory PostgreSQL persistence for Saved Views, zero business state in `localStorage`).
* **Cumulative Architectural Change Summary**:
  * **2026-10-11 (Dual-Accordion Table Architecture & Governance Enforcement)**: Re-architected `outcomeDrilldownRow` and `inspectingRow` in `ValidationOrchestratorWorkspace.tsx` to display dual horizontal tables with unified headers and sticky source indicators. Extracted top-level helpers (`formatCellVal`, `areValuesEqual`, `formatHeaderLabel`, `getCaseInsensitiveVal`), eliminating duplicated inner functions. Applied 250ms debounced search, converted XLSX export to dynamic lazy-load, and wrapped all workspace modals in `<ErrorBoundary>` components. Codified Section 11 (*Mandatory Governance Enforcement & Compliance Guardrails*) into `FRONTEND_INVESTIGATION_ORCHESTRATION_MODIFICATION_SUGGESTIONS.md`. Verified with 36/36 backend test suites (280/280 tests) passing and clean Vite production build.
  * **2026-10-16 (Task ISS-6362 Physical Leg Count Rectification & Per-Validation-Step Accordion Architecture)**: Resolved multi-leg duplicate counting defect on Task `ISS-6362` where `extractRowLegs` was generating duplicated keys across table aliases (rectified `fe_utrnno = 2597220450` from 12 $\rightarrow$ 6 legs, and `2689236323` from 6 $\rightarrow$ 3 legs) by keying deduplication directly to `his_${hisId}` and scoping to `activeWorkflow.id`. Re-architected inspector views (`outcomeDrilldownRow` and `inspectingRow`) to replace monolithic flat tables with dedicated, purpose-driven per-validation-step accordions for each pipeline stage/step (displaying target database ingress parameters, cardinality compliance breakdowns, color-coded input vs database field comparisons, and expandable raw JSON payloads). Verified with 36/36 backend test suites (284 tests) passing and clean Vite production build.
  * **2026-10-16 (Investigation Workspace Streamlining, Single Workflow Selector, Validation Status Column Filter & Scoped Actions Architecture)**: Formalized architectural specification, implementation plan, and acceptance criteria in [`FRONTEND_INVESTIGATION_ORCHESTRATION_MODIFICATION_SUGGESTIONS.md §14`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/FRONTEND_INVESTIGATION_ORCHESTRATION_MODIFICATION_SUGGESTIONS.md#14-investigation-workspace-streamlining-single-workflow-selector-validation-status-column-filter--scoped-actions-architecture). Consolidated triplicate workflow buttons in the toolbar to a single clean workflow selector with active workflow attribution alongside `Reset Row Filter`. Replaced embedded workflow switcher in the `Validation Status` column header with a standard column value filter popover, removing redundant top-level status buttons. Pruned redundant `Anomalies` and `Clean` bottom sheet tabs. Enabled scoped validation re-runs on active filtered row subsets (`handleRunValidation(forceRerun, scope)`). Added click-outside dismissal for all column filter popovers. Eliminated the per-row `Actions` column in favor of a top-level unified `⚡ Actions` dropdown supporting batch status changes, batch revert, and `#Hashtag` execution across selected, filtered, or all records.

---

## 4. Architectural Document Change Management Protocol

Whenever an engineer or AI agent performs an architectural modification, refactoring, or schema extension:

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                    MANDATORY ARCHITECTURAL MODIFICATION PROTOCOL                     │
│                                                                                      │
  Step 1: IDENTIFY MASTER DOCUMENT
          Determine which master architectural specification governs the modified domain.
                                  │
                                  ▼
  Step 2: UPDATE MASTER SPECIFICATION
          Modify the specification and append the change to its internal
          "Implementation Flow & Traceability" or "Architectural Change Summary" section.
                                  │
                                  ▼
  Step 3: UPDATE THIS MASTER INDEX (MASTER_ARCHITECTURE_INDEX.md)
          Append a summary of the modification under the relevant domain in Section 3
          with: Date, Scope, Rationale, and Affected Files.
                                  │
                                  ▼
  Step 4: EXECUTE ZERO-ASSUMPTION VERIFICATION AUDIT
          Conduct a physical code audit verifying that all runtime routes, triggers, and
          test assertions execute non-vacuously before declaring sign-off.
```

---

## 5. Master Governance Reference Table

| Domain / Subsystem | Primary Master Document | Associated Plan | Acceptance Report | Audit / Review | Current Certified Status |
|---|---|---|---|---|---|
| **Universal Hashtags** | [`UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md) | [`COMPREHENSIVE_AUDIT_REMEDIATION_PLAN_2026-10-10.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/COMPREHENSIVE_AUDIT_REMEDIATION_PLAN_2026-10-10.md) | [`REMEDIATION_SIGN_OFF_2026-10-10.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/REMEDIATION_SIGN_OFF_2026-10-10.md) | [`AUDIT_REPORT_2026-10-10.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AUDIT_REPORT_2026-10-10.md) & [`FINAL_ASSESSMENT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/audit_output/FINAL_ASSESSMENT.md) | **100% CERTIFIED & COMPLETED** (Pool client checkout & TS unblocked) |
| **Pipeline Engine** | [`PIPELINE_ENGINE_MASTER_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/PIPELINE_ENGINE_MASTER_ARCHITECTURE.md) | [`IMPLEMENTATION_PLAN_PIPELINE_ENGINE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/IMPLEMENTATION_PLAN_PIPELINE_ENGINE.md) | [`REMEDIATION_SIGN_OFF_2026-10-10.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/REMEDIATION_SIGN_OFF_2026-10-10.md) | [`FRONTEND_UI_UX_AUDIT_REPORT_2026-10-10.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/FRONTEND_UI_UX_AUDIT_REPORT_2026-10-10.md) | **100% CERTIFIED & COMPLETED** (Rule 16 flexbox layout & ErrorBoundary active) |
| **Rule-to-Method** | [`RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md) & [`MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md) | [`COMPREHENSIVE_IMPLEMENTATION_PLAN_TWO_LEVEL_RECONCILIATION_AND_MULTI_LEG.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/COMPREHENSIVE_IMPLEMENTATION_PLAN_TWO_LEVEL_RECONCILIATION_AND_MULTI_LEG.md) | [`ARCHITECTURE_ACCEPTANCE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/ARCHITECTURE_ACCEPTANCE_REPORT.md) | [`VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md §17`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md#L667) | **100% CERTIFIED** (Dynamic CTE Tuple SQL & Coordinate Injection active) |
| **Messaging & OAuth** | [`MESSAGE_INTEGRATION_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MESSAGE_INTEGRATION_ARCHITECTURE.md) | `024_staged_message_attachments_raw_data.sql` | [`REMEDIATION_SIGN_OFF_2026-10-10.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/REMEDIATION_SIGN_OFF_2026-10-10.md) | Integration Test Suite | **100% CERTIFIED** (Admin-segregated OAuth 2.0 active, ID collisions eliminated) |
| **Reconciliation & Maker-Checker** | [`RECONCILIATION_PROCESS_ARCHITECTURE_AND_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RECONCILIATION_PROCESS_ARCHITECTURE_AND_SPECIFICATION.md) | Migration `001_initial_schema.sql` | [`REMEDIATION_SIGN_OFF_2026-10-10.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/REMEDIATION_SIGN_OFF_2026-10-10.md) | [`AUDIT_REPORT_2026-10-10.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AUDIT_REPORT_2026-10-10.md) | **100% CERTIFIED** (Client-managed transactions & masked password updates) |
| **Project Baseline** | [`CURRENT_PROJECT_CONTEXT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/CURRENT_PROJECT_CONTEXT.md) | Relational Schema (34 Base Tables, 77 Public Tables) | Continuous Sync | Tri-Audit Verification (October 10, 2026) | **ACTIVE BASELINE** (36 Vitest Suites / 280 Tests PASS) |
| **File Ingestion & Mapping Workspace** | [`STANDARD_FILE_INGESTION_AND_MAPPING_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/STANDARD_FILE_INGESTION_AND_MAPPING_ARCHITECTURE.md) | [`COMPREHENSIVE_AUDIT_REMEDIATION_PLAN_2026-10-10.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/COMPREHENSIVE_AUDIT_REMEDIATION_PLAN_2026-10-10.md) | Migrations 028, 029, 030 & Governance Rule 23 | [`REMEDIATION_SIGN_OFF_2026-10-10.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/REMEDIATION_SIGN_OFF_2026-10-10.md) | **100% CERTIFIED & COMPLETED** (Rule 23 localStorage zero-breach certified) |
| **Investigation Orchestration** | [`FRONTEND_INVESTIGATION_ORCHESTRATION_MODIFICATION_SUGGESTIONS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/FRONTEND_INVESTIGATION_ORCHESTRATION_MODIFICATION_SUGGESTIONS.md) | Phase 1 Implementation Plan | Verified via Vitest & Vite Build | Governance Compliance Section 11 | **100% CERTIFIED & COMPLETED** (Dual-Accordion Table, ErrorBoundary, Lazy XLSX) |
| **IssueTrace Redesign System** | [`FRONTEND_REDESIGN_SYSTEM_SPECIFICATION_AND_PLAN.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/FRONTEND_REDESIGN_SYSTEM_SPECIFICATION_AND_PLAN.md) | 6-Phase Implementation Plan | 21 Screen Visual Alignment & Zero Breaking Changes | Verified via Puppeteer MCP Live Screenshots & Vite Production Build | **100% CERTIFIED & COMPLETED** (All 21 screens verified live with zero backend regressions) |
| **Consolidated Governance Audit & Remediation (2026)** | [`MASTER_CONSOLIDATED_SYSTEM_AUDIT_2026.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_CONSOLIDATED_SYSTEM_AUDIT_2026.md) | [`SYSTEM_REMEDIATION_IMPLEMENTATION_PLAN.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/SYSTEM_REMEDIATION_IMPLEMENTATION_PLAN.md) | [`SYSTEM_REMEDIATION_ACCEPTANCE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/SYSTEM_REMEDIATION_ACCEPTANCE_REPORT.md) | [`INDEPENDENT_PHYSICAL_CODE_REAUDIT_2026.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/INDEPENDENT_PHYSICAL_CODE_REAUDIT_2026.md) | **100% REMEDIATED & CERTIFIED** (284/284 Vitest tests pass, 0 TS errors, clean Vite build) |
| **Inter-Team Escalation & Signed SLA Agreements** | [`redesigned_ui/new-redsign/fllow-discription.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/redesigned_ui/new-redsign/fllow-discription.md) | Migration `036_escalation_agreements.sql` | [`ESCALATION_AGREEMENT_ACCEPTANCE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/ESCALATION_AGREEMENT_ACCEPTANCE_REPORT.md) | Verified via Puppeteer MCP Screenshots (Screens 27–32) & Vitest Suite | **100% CERTIFIED & COMPLETED** (Dual signatures, live KPI clock, PostgreSQL-persisted) |
| **Data Setup & Technician Flow** | [`DATA_SETUP_AND_TECHNICIAN_SOLUTION_FLOW_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/DATA_SETUP_AND_TECHNICIAN_SOLUTION_FLOW_SPECIFICATION.md) | Migrations 037, 038 | Live API & Integration Test Suite | [`DATA_SETUP_AND_TECHNICIAN_FLOW_GAP_ANALYSIS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/DATA_SETUP_AND_TECHNICIAN_FLOW_GAP_ANALYSIS.md) | **100% CERTIFIED** (38/38 backend suites PASS, 0 TS errors, clean build) |

---

### Domain 7: IssueTrace by EthioPay Comprehensive Frontend Redesign
* **Master Specification & Architecture Document**: [`FRONTEND_REDESIGN_SYSTEM_SPECIFICATION_AND_PLAN.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/FRONTEND_REDESIGN_SYSTEM_SPECIFICATION_AND_PLAN.md)
* **Governing Components**: [`SideNav.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/SideNav.tsx), [`TopBar.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/TopBar.tsx), [`CasesWorkspaceView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/CasesWorkspaceView.tsx), [`TransactionInvestigationDrawer.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/TransactionInvestigationDrawer.tsx), [`AutomationsView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/automations/AutomationsView.tsx), [`TeamTasksTab.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/team/TeamTasksTab.tsx), [`TeamMailboxTab.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/team/TeamMailboxTab.tsx), [`ValidationBoxManager.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/ValidationBoxManager.tsx)
* **Key Scope & Architectural Principles**:
  * **EthioPay Design Tokens & 4-Layer Shell**: Google Font `Poppins`, EthioPay Orange (`#F27421`), Navy (`#0F142A`), Slate Canvas (`#F8FAFC`). Stationary TopBar with responsive breadcrumbs, `Ctrl+K` search, `● Production` pill, notification bell counter, avatar dropdown. 5-group SideNav (`WORK`, `COLLABORATE`, `INSIGHTS`, `BUILD`, `ADMIN`) with badge counts, database health dock, and smooth collapse toggle.
  * **Zero Backend Breaking Changes**: All 22 PostgreSQL relational tables, REST API contracts (`/api/issues`, `/api/workflows`, `/api/validation-boxes`, etc.), dynamic SQL compilers, and UNLOGGED mirror reconciliation preserved with 100% fidelity.
  * **Cases Workspace & Slide-Over Investigation Drawer**: 4 KPI cards (`Records`, `Total Amount`, `Average`, `Duplicates`), clean multi-column table, and slide-over investigation drawer with segmented status controls, rule audit trail, and Maker proposal integration.
  * **Automations Engine & Collaboration**: Card grid with trigger types (CRON, FTP, Event), active toggles, Run Now actions, 5-step automation wizard, 3-column Team Tasks Kanban, and dual-pane independent scroll mailbox.
  * **Automated Visual Verification via Puppeteer MCP**: All 21 reference screens from `redesigned_ui/` were captured live, visually audited, and verified against reference designs.
  * **Production Compilation**: Clean Vite production build with 0 TypeScript/ESBuild errors (`built in 15.54s`).

---

### Domain 8: Master Consolidated System Audit & Physical Code Governance Baseline (2026)
* **Master Specification & Consolidated Audit Document**: [`MASTER_CONSOLIDATED_SYSTEM_AUDIT_2026.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_CONSOLIDATED_SYSTEM_AUDIT_2026.md)
* **Associated Implementation Plan**: [`SYSTEM_REMEDIATION_IMPLEMENTATION_PLAN.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/SYSTEM_REMEDIATION_IMPLEMENTATION_PLAN.md)
* **Implementation Acceptance Report**: [`SYSTEM_REMEDIATION_ACCEPTANCE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/SYSTEM_REMEDIATION_ACCEPTANCE_REPORT.md)
* **Independent Physical Code Re-Audit**: [`INDEPENDENT_PHYSICAL_CODE_REAUDIT_2026.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/INDEPENDENT_PHYSICAL_CODE_REAUDIT_2026.md)
* **Governing Baseline Audits Incorporated**:
  1. [`AUDIT_REPORT_PHYSICAL_CODE_2026.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AUDIT_REPORT_PHYSICAL_CODE_2026.md) (Physical Source Code, Security & Services Audit)
  2. [`GOVERNANCE_AUDIT_VERIFICATION_AND_COMPARISON.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/GOVERNANCE_AUDIT_VERIFICATION_AND_COMPARISON.md) (Governance Reality Check & Claim Verification)
  3. [`FRONTEND_UI_UX_DESIGN_AND_ARCHITECTURE_AUDIT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/FRONTEND_UI_UX_DESIGN_AND_ARCHITECTURE_AUDIT.md) (27-Screen UI/UX & Design System Audit)
* **Key Scope, Architectural Decisions & Deferrals**:
  * **Consolidated Severity & Reality Score**: 84 initial physical findings (26 Critical, 34 High, 20 Medium, 4 Low). Physical code compliance baseline evaluated at ~35% across the 23 Non-Negotiable Governance Principles from [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md).
  * **Development Authentication Policy (Section 2 — Deferred Backdoor Removal)**:
    - **Explicit Architectural Decision**: The backdoor authentication bypass (`admin123` / `PRESET_PASSWORDS` in [`backend/src/routes/auth.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/auth.ts#L38-L41)) is deliberately preserved at this stage exclusively for local engineering, automated test execution, and rapid multi-role operator simulation (`admin`, `kirubel_ops`, `tech_sarah`, `samuel_tech`, `manager_alex`).
    - **Production Hardening Guard**: Gated behind `process.env.NODE_ENV !== 'production'` to prevent execution in production environments.
  * **Approved Viewport Density Scaling**: Retained `html { zoom: 0.8; }` in [`frontend/src/index.css`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/index.css#L90) as an approved operational baseline, permanently preventing the Windows taskbar from overlapping footers, modals, and buttons, and ensuring 100% density match with `redesigned_ui/`.
  * **Query Sandbox Live Backend Integration**: Connected [`QuerySandboxStandaloneView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/sandbox/QuerySandboxStandaloneView.tsx) directly to live PostgreSQL and MySQL database pools (`POST /api/db/query/execute`), streaming live records to unlogged mirror tables, rendering dynamic columns, and recording audited query logs directly to PostgreSQL `connection_usage_logs`.
* **Cumulative Architectural Change Summary**:
  * **2026-10-23 (Master Consolidated Audit Unification & Remediation Implementation)**:
    - **Phase 1 (Security & RBAC Enforcement)**: Replaced timing-vulnerable checks with `crypto.timingSafeEqual` in `auth.ts`; exported and applied `requireAuth` and `requireRole('admin')` to administrative endpoints (`/users/:id/approve`, `/role`, `DELETE /users/:id`); enforced anti-self-approval (`makerId !== checkerId`) on resolution commitments (`/api/resolutions/commit`) returning HTTP 403; enforced default `maskSecret = true` across `getAdminTeamResources` and database discovery routes; restricted live query execution to read-only queries with strict table name regex validation.
    - **Phase 2 (Relational Schema & Migration Transactions)**: Executed migration `034_schema_fixes.sql` expanding `final_result` to `VARCHAR(32)` (eliminating `PAUSED_DB_OFFLINE` overflow) and `transaction_id` to `VARCHAR(128)`; executed migration `035_create_missing_tables.sql` creating missing `central_transaction_repository`, `task_workflow_executions`, and updating `workspace_table_records`; upgraded `migrate.ts` with transactional DDL execution and `schema_migrations` tracking table; inserted missing `BEGIN` transaction call in `createTaskDatasetTransactions`.
    - **Phase 3 (Ingestion Services & Execution Resilience)**: Fixed `Number(undefined) === NaN` bug in `attachmentParserService.ts` restoring tabular row extraction; enabled non-throwing `dbLookup` allowing `ExecutablePipeline.ts` to cleanly catch socket disconnections as `PAUSED_DB_OFFLINE`.
    - **Phase 4 (Frontend UI/UX, Approvals Inbox & Build Cleanliness)**: Integrated Screen 18 `<ApprovalsInboxView>` under `activeNavigation === 'approvals'` with dedicated SideNav badge and TopBar breadcrumb; normalized client API methods (`dispatchSimulatedExternalRequest`, `proposeResolution`); resolved all 13 TypeScript interface mismatches across views.
    - **Verification & Zero-Gap Sign-Off**: Verified with 36/36 test suites passing (284/284 tests in 4.40s), 0 backend TypeScript errors, 0 frontend lint errors (`tsc --noEmit`), and clean production bundle (`vite build` in 9.82s). Full independent re-audit documented in [`INDEPENDENT_PHYSICAL_CODE_REAUDIT_2026.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/INDEPENDENT_PHYSICAL_CODE_REAUDIT_2026.md).

---

### Domain 9: Inter-Team Escalation & Signed SLA Agreements (Screens 27–32)
* **Master Specification & Architecture Document**: [`redesigned_ui/new-redsign/fllow-discription.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/redesigned_ui/new-redsign/fllow-discription.md) (Screens 27 through 32)
* **Implementation Acceptance Report**: [`ESCALATION_AGREEMENT_ACCEPTANCE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/ESCALATION_AGREEMENT_ACCEPTANCE_REPORT.md)
* **Database Migration**: [`backend/src/database/migrations/036_escalation_agreements.sql`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrations/036_escalation_agreements.sql)
* **Governing Components**: [`CaseDiscussionDrawer.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/CaseDiscussionDrawer.tsx), [`UnifiedChatInput.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/chat/UnifiedChatInput.tsx), [`EscalateToTeamModal.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/EscalateToTeamModal.tsx), [`EscalationRoomView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/team/EscalationRoomView.tsx), [`EscalationAgreementView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/team/EscalationAgreementView.tsx), [`TeamDiscussionTab.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/team/TeamDiscussionTab.tsx)
* **Key Scope & Architectural Principles**:
  * **Rule 23 Relational PostgreSQL Persistence**: Dedicated `escalation_agreements` table with foreign key integrity, JSONB payload travelers, KPI terms, and append-only audit ledgers. Zero business logic or agreement status stored in browser `localStorage`.
  * **Rule 7 & ADR-001 Maker-Checker Dual Authorization**: Maker proposes escalation; Escalating Lead signs and assigns independent Checker (`@checker_ops_2`); Receiving Lead accepts and assigns Technician (`@samuel_tech`). Enforces anti-self-approval (`makerId !== checkerId`).
  * **Dynamic KPI Clock Governance**: SLA clock commencement is strictly tied to Receiving Lead acceptance (`clockStartedAt = NOW()`), not agreement drafting or unilateral escalation signing.
  * **Full-Viewport & Stationary Header Containment (Rule 16)**: Enforces `h-full flex-1 min-h-0 overflow-hidden` across drawers and room views, preserving global UI scaling (`html { zoom: 0.8; }`).
  * **6-Screen Flow Architecture**:
    * **Screen 27**: Case Discussion Drawer with Case Summary Bar, Investigation Capsule (`PASS`/`FAIL`), action `⚑ Escalate`, and dynamic Orange Callout Card upon escalation.
    * **Screen 28**: `/create-escalate` in-chat directive in `UnifiedChatInput.tsx`.
    * **Screen 29**: 4-step `EscalateToTeamModal.tsx` with candidate team selector, SLA metrics, payload travelers, and custom KPI terms.
    * **Screen 30**: Escalation Room (Escalating Perspective) with permanent record notice, context card, and lead signature + checker assignment.
    * **Screen 31**: Escalation Room (Receiving Perspective) with amber clock commencement notice, technician picker, and transition to co-signed active status banner.
    * **Screen 32**: Formal Signed Agreement (`EscalationAgreementView.tsx`) with institutional seal, roles matrix, live KPI progress table, cursive electronic signatures, and permanent chronological audit ledger.
* **Cumulative Architectural Change Summary**:
  * **2026-10-24 (Inter-Team Escalation & Signed SLA Agreement Full Implementation & Visual MCP Certification)**:
    - Executed migration `036_escalation_agreements.sql` creating `escalation_agreements` table with foreign keys, indexes, and JSONB fields in PostgreSQL.
    - Added backend models, repository methods in `postgresRepo.ts` with `issue_key` projection, and 8 REST API endpoints in `escalations.ts`.
    - Implemented frontend components: `CaseDiscussionDrawer.tsx`, `/create-escalate` directive in `UnifiedChatInput.tsx`, `EscalateToTeamModal.tsx`, `EscalationRoomView.tsx`, `EscalationAgreementView.tsx`, and sidebar room routing in `TeamDiscussionTab.tsx`.
    - Verified all 6 screens live via Puppeteer MCP screenshot captures (`screen_27_case_discussion_verified.png`, `screen_29_escalate_to_team_verified.png`, `screen_27_with_orange_card_verified.png`, `screen_30_escalating_team_room_verified.png`, `screen_31_receiving_team_room_verified.png`, `screen_31_accepted_state_verified.png`, `screen_32_formal_signed_agreement_verified.png`).
    - Verified zero backend regressions (36/36 test suites, 284/284 tests passing) and 100% clean production build (`vite build` in 8.47s). Certified in [`ESCALATION_AGREEMENT_ACCEPTANCE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/ESCALATION_AGREEMENT_ACCEPTANCE_REPORT.md).

### Domain 10: Data Setup Redesign & Technician Solution Flow (Screens 33-44)
* **Master Specification & Architecture Document**: [`DATA_SETUP_AND_TECHNICIAN_SOLUTION_FLOW_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/DATA_SETUP_AND_TECHNICIAN_SOLUTION_FLOW_SPECIFICATION.md)
* **Design Source**: [`redesigned_ui/fllow/fllow.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/redesigned_ui/fllow/fllow.md)
* **Database Migrations**: [`backend/src/database/migrations/037_value_dictionary_semantics.sql`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrations/037_value_dictionary_semantics.sql), [`backend/src/database/migrations/038_technician_solution_flow.sql`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrations/038_technician_solution_flow.sql)
* **Governing Components**: [`ValueDictionaryWorkbench.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/ValueDictionaryWorkbench.tsx), [`TableMappingColumnList.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/TableMappingColumnList.tsx), [`StageTaskModal.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/StageTaskModal.tsx), [`TechnicianInvestigationWorkspace.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/TechnicianInvestigationWorkspace.tsx), [`PostAsHashtagModal.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/PostAsHashtagModal.tsx), [`HashtagOwnerDetailView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/automations/HashtagOwnerDetailView.tsx), [`EndToEndFlowDiagram.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/automations/EndToEndFlowDiagram.tsx)
* **Key Scope & Architectural Principles**:
  * **Phase A (screens 33-37, implemented & verified)**: value dictionary direction relative to stored pairs, case/trim matching, no-match policy; persisted column links (`value_dictionary_column_links`) replacing React-state-only links; unclassified-field handling derived from provenance without rewriting stored data; column-list Table Mapping with Mapping health and JSON-safe previews; File Staging connection-error actions and grouped uncovered folders.
  * **Phase B (screens 38-44, implemented & verified)**: complete technician solution lifecycle: stage task popup with environment isolation (Sandbox, Staging, Production locked behind 4-Eyes checker authorization); 2-level case investigation workspace (Level 1 immutable baseline + Level 2 interactive SQL); parameterized solution script editor with dry-run diffs (`{{Amount}}`, `{{Refnum}}`); post as hashtag with immutable locked process attachments and anti-self-approval checker routing; hashtag owner view with chevron step strip, 4 KPI cards (Collected, Fixed, Failed, Waiting), and collected transactions ledger; team reporting with change request workflow; interactive 3-tier end-to-end diagram.
* **Cumulative Architectural Change Summary**:
  * **2026-10-24 (Phase A implementation)**: Migration 037 applied (additive only; 4 seeded dictionaries unchanged). New dictionary preview/usage/untranslated/link endpoints; shared `translateWithDictionary` used by ingestion and preview; forward fix so schema discovery no longer uses table names as categories. Verified: backend and frontend type checks clean for touched files, 18/18 backend tests, 16 frontend tests, `vite build`, live API run with scoped cleanup.
  * **2026-10-24 (Phase B implementation & Full Verification)**: Migration 038 applied to PostgreSQL (environment isolation on `issues`, solution metadata on `hashtag_presets`, and new `hashtag_collected_transactions` ledger). Added dry-run diff simulation, locked process hashtag publishing with checker gateway, collected transaction ledger routes, and dedicated UI components for screens 38-44 (`StageTaskModal.tsx`, `TechnicianInvestigationWorkspace.tsx`, `PostAsHashtagModal.tsx`, `HashtagOwnerDetailView.tsx`, `EndToEndFlowDiagram.tsx`, updated `TeamHashtagReportsTab.tsx`, wired into `CasesWorkspaceView.tsx` and `AutomationsView.tsx`). Verified: 38/38 backend test suites (299/299 tests passing), 0 frontend type errors (`tsc --noEmit`), and clean production bundle (`vite build` in 9.52s).
  * **2026-10-26 (Physical Code Gap Analysis, Table Pagination & Route Consolidation)**: Conducted exhaustive physical code audit documented in [`DATA_SETUP_AND_TECHNICIAN_FLOW_GAP_ANALYSIS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/DATA_SETUP_AND_TECHNICIAN_FLOW_GAP_ANALYSIS.md). Pruned duplicate `<SystemSettings>` mount in `App.tsx` (lines 1389–1406) ensuring single-mount scroll containment; resolved runtime `ConfirmDialog` missing import in `SystemSettings.tsx`; standardized table pagination using `<DataTablePagination>` (defaulting to 7 items with user-configurable sizing) across all 5 Data Setup views (Mapping Dictionary, Format Rules, Table Mapping Column List, Value Dictionary Pairs, and Live Value Scanner); flagged unreferenced legacy monolith `DatabaseValidationSettings.tsx` (2,627 lines persisting to `localStorage`, violating Rule 23) for formal deprecation. Verified: 38/38 backend test suites (299/299 tests passing in 4.35s), 0 frontend type errors, and clean production build (`vite build` in 17.81s).

---

### Domain 11: Enterprise Notification Center, Preferences & Real-Time Flow (Screens 45–49)
* **Master Specification & Architecture Document**: [`redesigned_ui/notification/fllow.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/redesigned_ui/notification/fllow.md) (Screens 45 through 49)
* **Implementation Acceptance & Sign-Off Report**: [`NOTIFICATION_SYSTEM_REDESIGN_ACCEPTANCE_AND_SIGN_OFF.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/NOTIFICATION_SYSTEM_REDESIGN_ACCEPTANCE_AND_SIGN_OFF.md)
* **Database Migrations**: [`backend/src/database/migrations/040_notifications_broadcast_support.sql`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrations/040_notifications_broadcast_support.sql), [`backend/src/database/migrations/041_enhanced_notification_system.sql`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrations/041_enhanced_notification_system.sql)
* **Governing Components**: [`NotificationBellDropdown.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/notifications/NotificationBellDropdown.tsx), [`NotificationCenterView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/notifications/NotificationCenterView.tsx), [`NotificationPreferencesView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/notifications/NotificationPreferencesView.tsx), [`NotificationToastsAndBanner.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/notifications/NotificationToastsAndBanner.tsx), [`TopBar.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/TopBar.tsx), [`App.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx)
* **Key Scope & Architectural Principles**:
  * **Rule 23 Relational PostgreSQL Persistence**: Staged on PostgreSQL (`notifications` and `user_notification_preferences`), zero reliance on browser `localStorage` for notifications, read states, snooze expiries, or user preferences.
  * **Always-On SLA & System Outage Alerts**: SLA warnings and System/Connection alerts are permanently locked ON across all dispatch channels (In-app, Desktop push, Email, Sound) at both frontend and backend API layers.
  * **Rule 16 Full-Viewport Scroll Containment**: 3-column Notification Center and floating dropdown popovers enforce strict independent scroll containers (`no-scrollbar`) and stationary header bars.
  * **5-Screen Flow Architecture**:
    * **Screen 45**: Floating bell popover with 4 tabs (`All`, `Unread`, `Mentions`, `To do`), 1-tap actions (`Stage task`, `Reply`, `Open case`), and center link.
    * **Screen 46**: Full 3-column Notification Center with Category/Lifecycle Rail, middle stream with pinned `"Needs your action"` group and countdowns, and rich preview panel with SLA banners and sticky action footer.
    * **Screen 47**: Matrix preferences across 7 categories and 4 channels with quiet hours, digest schedule, and behavioral settings.
    * **Screen 48**: End-to-end lifecycle state transitions (`unread` → `needs_action` → `done` → `snoozed` → `archived`).
    * **Screen 49**: Floating auto-hide toasts, sticky critical banner below TopBar, bell badge variations, empty states, and standard card anatomy.
* **Cumulative Architectural Change Summary**:
  * **2026-10-28 (Enterprise Notification Redesign Implementation & 100% Sign-Off)**:
    - Executed migrations `040_notifications_broadcast_support.sql` (broadcast support, FK constraint drop) and `041_enhanced_notification_system.sql` (priority, status, category, action buttons, snooze, and `user_notification_preferences` table).
    - Updated backend models, added 10 repository methods in `postgresRepo.ts`, and implemented 11 REST API routes in `collaboration.ts`.
    - Created React frontend views: `NotificationBellDropdown.tsx`, `NotificationCenterView.tsx`, `NotificationPreferencesView.tsx`, and `NotificationToastsAndBanner.tsx`.
    - Verified: 38/38 backend test suites (299/299 tests passing), 0 frontend type errors, and clean production build (`vite build` in 20.46s). Certified in [`NOTIFICATION_SYSTEM_REDESIGN_ACCEPTANCE_AND_SIGN_OFF.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/NOTIFICATION_SYSTEM_REDESIGN_ACCEPTANCE_AND_SIGN_OFF.md).
### Domain 12: Comprehensive User Presentation Deck & Visual Asset System
* **Master Presentation Decks**: [`IssueTrace_User_Guide_and_System_Walkthrough.pptx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/IssueTrace_User_Guide_and_System_Walkthrough.pptx) & [`IssueTrace_System_Introduction.pptx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/IssueTrace_System_Introduction.pptx)
* **Re-Executable Generator Script**: [`build_presentation.py`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/build_presentation.py)
* **Persistent Assets Repository**: [`presentation_assets/`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/presentation_assets/) (61 high-resolution screenshots consolidating all reference screens from `redesigned_ui/`, `new-redsign/`, `fllow/`, `notification/`, and `gap_screens/`)
* **Key Scope & Architectural Principles**:
  * **Rule 15 Compliance**: Strictly preserves high-resolution media in a persistent workspace folder (`presentation_assets/`) and provides a single-command generator script (`python build_presentation.py`).
  * **30-Slide Widescreen Architecture (16:9)**:
    * **Slide 1**: Hero Title Slide & Platform Pillars (Dark Theme).
    * **Slide 2**: End-to-End Operational Lifecycle & Flow Architecture (`44_end_to_end_flow.png`).
    * **Slide 3**: Design System, Visual Tokens & Workspace Ergonomics (`00_design_system.png`).
    * **Slide 4**: Intake Cockpit: External Request Ingress & Triage (`19_intake.png`).
    * **Slide 5**: Remote SFTP File Staging & Ingestion Automation (`16_file_staging.png`).
    * **Slide 6**: Global Data Directory & Physical Column Mapping (`14_data_mapping.png`).
    * **Slide 7**: Value Dictionary Workbench & Code Harmonization (`37_new_value_dictionary.png`).
    * **Slide 8**: Data Transformations & Calculated Expression Studio (`15_transformations.png`).
    * **Slide 9**: Operations Workspace & High-Throughput Case Grid (`01_cases_workspace.png`).
    * **Slide 10**: Staging New Cases & Pipeline Assignment (`21_new_case_upload_clean.png`).
    * **Slide 11**: Real-Time Pipeline Execution & Progress Monitoring (`22_investigation_running.png`).
    * **Slide 12**: Transaction Forensics & Sequential Rule Trajectory (`02_transaction_drawer.png`).
    * **Slide 13**: Two-Level Discrepancy Investigation Workflow (`39_case_two_levels_investigate.png`).
    * **Slide 14**: Compare & Resolve: Side-by-Side Discrepancy Reconciliation (`23_compare_and_resolve.png`).
    * **Slide 15**: Workflow Studio: Visual Flowchart DAG Pipeline Builder (`03_workflow_studio.png`).
    * **Slide 16**: Modular Validation Rules Library & Sandbox (`04_rules_library.png`).
    * **Slide 17**: Multi-Leg Transaction Rules & Duplicate Elimination (`05_duplicate_check_builder.png`).
    * **Slide 18**: Automations: Event Triggers & Scheduled Batch Jobs (`06_automations.png`).
    * **Slide 19**: Query Sandbox & Database Explorer (`26_query_sandbox.png`).
    * **Slide 20**: Team Tasks: Operational Kanban & Task Tracking (`08_team_tasks.png`).
    * **Slide 21**: Shared Team Mailbox & Customer Dispute Triage (`09_team_mailbox.png`).
    * **Slide 22**: Contextual Case Discussions & Slash Directives (`27_case_discussion.png`).
    * **Slide 23**: Inter-Team Escalation Rooms & Cross-Squad Collaboration (`30_room_escalating_team.png`).
    * **Slide 24**: Escalation Agreements & Mutual Resolution Commitments (`32_escalation_agreement.png`).
    * **Slide 25**: Technician Solution Scripts & Universal Hashtag Knowledge (`40_solution_script.png`).
    * **Slide 26**: Maker-Checker Dual Authorization & Authority Center (`18_approvals.png`).
    * **Slide 27**: Notification Center & Multi-Channel Alert Matrix (`46_notification_center.png`).
    * **Slide 28**: Managerial Dashboard & Executive SLA Analytics (`11_dashboard.png`).
    * **Slide 29**: Enterprise Administration, RBAC & Connection Security (`12_people_access.png`).
    * **Slide 30**: Daily User Workflow & Reconciliation Best Practices (Dark Theme Summary).
* **Cumulative Architectural Change Summary**:
  * **2026-10-29 (30-Slide User Presentation Deck & Asset Consolidation)**: Consolidated all 51 reference screenshots from `redesigned_ui/` into `presentation_assets/`. Created `build_presentation.py` compiling 30 executive widescreen slides with high-contrast visual tokens, card containers, feature takeaways, and user action guides. Generated both `IssueTrace_User_Guide_and_System_Walkthrough.pptx` and `IssueTrace_System_Introduction.pptx` (4.8 MB each) with 100% build verification.

