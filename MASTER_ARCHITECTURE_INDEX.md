# MASTER ARCHITECTURE DIRECTORY & ENTRY POINT
## Central Governance Index, Architectural Hierarchy, and Evolution Changelog

**Repository Root**: `c:\Users\hp\Downloads\opration-workflow-mangement1`  
**Governance Authority**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rule 22 & 23) and [`bo-operational-governance`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md)  
**Document Status**: Authoritative Entry Point for All Architectural Specifications and Change Logs  
**Last Updated**: 2026-10-04

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

## 4. Architectural Document Change Management Protocol

Whenever an engineer or AI agent performs an architectural modification, refactoring, or schema extension:

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                    MANDATORY ARCHITECTURAL MODIFICATION PROTOCOL                     │
└──────────────────────────────────────────────────────────────────────────────────────┘
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
| **Universal Hashtags** | [`UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md) | [`IMPLEMENTATION_PLAN_UNIVERSAL_HASHTAGS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/IMPLEMENTATION_PLAN_UNIVERSAL_HASHTAGS.md) | [`ARCHITECTURE_IMPLEMENTATION_ACCEPTANCE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/ARCHITECTURE_IMPLEMENTATION_ACCEPTANCE_REPORT.md) | [`VERIFICATION_AUDIT_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/VERIFICATION_AUDIT_REPORT.md) | **PARTIAL** (9 Gaps in Audit) |
| **Pipeline Engine** | [`PIPELINE_ENGINE_MASTER_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/PIPELINE_ENGINE_MASTER_ARCHITECTURE.md) | [`IMPLEMENTATION_PLAN_PIPELINE_ENGINE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/IMPLEMENTATION_PLAN_PIPELINE_ENGINE.md) | [`ARCHITECTURE_ACCEPTANCE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/ARCHITECTURE_ACCEPTANCE_REPORT.md) | [`UI_UX_DESIGN_SYSTEM_AUDIT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/UI_UX_DESIGN_SYSTEM_AUDIT.md) | **ACCEPTED** |
| **Rule-to-Method** | [`RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md) & [`MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md) | [`COMPREHENSIVE_IMPLEMENTATION_PLAN_TWO_LEVEL_RECONCILIATION_AND_MULTI_LEG.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/COMPREHENSIVE_IMPLEMENTATION_PLAN_TWO_LEVEL_RECONCILIATION_AND_MULTI_LEG.md) | [`ARCHITECTURE_ACCEPTANCE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/ARCHITECTURE_ACCEPTANCE_REPORT.md) | [`VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md §17`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md#L667) & [`COMPREHENSIVE_BUG_REPORT_AND_GOVERNANCE_AUDIT.md`](file:///C:/Users/hp/.gemini/antigravity-ide/brain/6180632f-53f3-48f1-bcb3-16e17a5c46ce/COMPREHENSIVE_BUG_REPORT_AND_GOVERNANCE_AUDIT.md) | **IMPLEMENTED & VERIFIED** (All 31 Backend Suites & Frontend Build Passing) |
| **Messaging & OAuth** | [`MESSAGE_INTEGRATION_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MESSAGE_INTEGRATION_ARCHITECTURE.md) | `024_staged_message_attachments_raw_data.sql` | `ARCHITECTURE_ACCEPTANCE_REPORT.md` | Integration Test Suite | **ACCEPTED** |
| **Reconciliation & Maker-Checker** | [`RECONCILIATION_PROCESS_ARCHITECTURE_AND_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RECONCILIATION_PROCESS_ARCHITECTURE_AND_SPECIFICATION.md) | Migration `001_initial_schema.sql` | [`DECISION_LOG.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/DECISION_LOG.md) | [`COMPREHENSIVE_BUG_REPORT_AND_GOVERNANCE_AUDIT.md`](file:///C:/Users/hp/.gemini/antigravity-ide/brain/6180632f-53f3-48f1-bcb3-16e17a5c46ce/COMPREHENSIVE_BUG_REPORT_AND_GOVERNANCE_AUDIT.md) | **NEEDS REMEDIATION (Advisory Lock & Pool Leaks)** |
| **Project Baseline** | [`CURRENT_PROJECT_CONTEXT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/CURRENT_PROJECT_CONTEXT.md) | Relational Schema (27 Tables) | Continuous Sync | Repo Discrepancy Auditor | **ACTIVE BASELINE** |


