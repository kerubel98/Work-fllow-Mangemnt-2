# Antigravity Project Rules: Operational Workflow Management

## Mandatory Skill Activation
Whenever modifying, designing, reviewing, or analyzing features in this repository, you must consult and adhere to:
- **Skill**: [`bo-operational-governance`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md)
- **Baseline Context**: [`CURRENT_PROJECT_CONTEXT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/CURRENT_PROJECT_CONTEXT.md)

---

## Non-Negotiable Governance Principles

1. **Repository Reality Trumps Assumptions**:
   - The primary database is **PostgreSQL** (`operational_workflow_db`), managed via 22 relational tables in `backend/src/database/migrations/001_initial_schema.sql` and `postgresRepo.ts`.
   - Workflows, Validation Boxes, and Query Extractions are **persisted in PostgreSQL** via `/api/workflows` and `/api/validation-boxes`.
   - External reconciliation uses **dedicated typed UNLOGGED mirror tables** (`mirror_{db}_{table}`) and dynamic SQL compilation (`ruleSqlCompiler.ts`), never unbatched in-memory loops.

2. **Validation Result ≠ Pipeline Action**:
   - Always maintain the strict separation between what a rule discovers (`PASS`, `FAIL`, `ERROR`, `PAUSED_DB_OFFLINE`) and what the pipeline executes next (`CONTINUE`, `STOP`, `CLOSE`, `FLAG`, `REPORT`).

3. **Lifecycle Separation**:
   - Keep Task/Case Lifecycle (`Issue.status`), Financial Transaction Status, Transaction Investigation Lifecycle, and Rule Execution Verdict strictly separated.

4. **External System Agnosticism**:
   - External database names, tables, and column names must never be hard-coded.
   - All mapping must route through `global_standard_directory` and `database_table_mappings`.
   - External queries must be batched (`WHERE id IN (...)`) with minimal column projection.

5. **No Unapproved Infrastructure**:
   - Do not introduce Kafka, Redis, extra message queues, or rewrite the persistence layer without explicit user review and approval.

6. **Frontend Fault Tolerance & State Sanitization**:
   - All complex workspace views (e.g., `InvestigationWorkspace`, `IssueDetailView`) MUST be wrapped in React `<ErrorBoundary>` components to prevent full-page blank screen unmounts.
   - PostgreSQL JSONB objects (e.g., `_validation_details`, `sourceRecord`) must NEVER be directly rendered as React JSX children. Always format or serialize them via stringification helpers.

7. **Maker-Checker Dual Authorization & Anti-Self-Approval (Four-Eyes Principle)**:
   - Any manual transaction resolution or discrepancy override (`FORCE_MATCH`, `WRITE_OFF`, `MANUAL_REVERSAL`) must be routed through a Maker proposal (`POST /api/resolutions/propose`) and committed only upon Checker approval.
   - Transactions under review must lock in `PENDING_CHECKER_REVIEW` with an immutable evidence snapshot (`_inputData` + `_mirrorData`).
   - Anti-Self-Approval is mandatory at the API and service layers: `makerId !== checkerId` (HTTP 403). Operators cannot approve their own submissions.

8. **Universal Hashtag Binding & Traceability**:
   - Workflows, DAG nodes, FTP staging templates, DB table configurations, ingested tasks, and chat discussions must be linked via universal `#hashtags` (e.g., `#AIB_SETTLEMENT_2026`).
   - Resolution solutions emerging from team chat must be staged directly as Maker proposals with attribution to the author.

9. **Tuple-Based Ingestion & Reconciliation Key Hierarchy**:
   - Multi-column reconciliation matching must compile to batched tuple SQL (`WHERE (col1, col2, ...) IN ((val1, val2, ...), ...)`).
   - Key selection follows strict precedence: explicit DB table configuration overrides > validation box required columns.

10. **64-Bit Cryptographic Advisory Locking**:
    - Never use 32-bit `hashtext($1)` for advisory locks. Always derive 64-bit cryptographic bigint keys:
      `('x' || substr(md5($1), 1, 16))::bit(64)::bigint`.
    - Eliminates birthday paradox collisions and spurious deadlocks across thousands of concurrent mirror tables and rollback tasks.

11. **Query Parameter Bounds (< 30,000) & ANSI Identifier Quoting**:
    - Composite tuple SQL queries must dynamically cap parameter counts at 30,000 (well below PostgreSQL `UINT16_MAX` 65,535). Queries exceeding this bound must be sub-chunked and merged.
    - All SQL column identifiers must be ANSI-quoted (`"col"` for PostgreSQL, `` `col` `` for MySQL) to prevent keyword collisions and syntax errors.

12. **Diagnostic Taint Tracking & Downstream Math Isolation**:
    - Transactions advancing downstream under action `REPORT` must carry `_isDiagnosticOnly: true` and `_diagnosticTaintReason`.
    - Downstream stages must bypass arithmetic and mutating operations on tainted records, executing only observational checks.

13. **Task-Scoped Rollback Isolation & Deterministic Joins**:
    - Rollbacks must never execute global table locks (`LOCK TABLE ... IN EXCLUSIVE MODE`). Use task-scoped 64-bit advisory locks (`task_revert_${taskId}`).
    - All `UPDATE ... FROM` joins must deduplicate source rows using CTE `DISTINCT ON (task_id, row_number)` or join strictly on surrogate keys `(target.task_id = source.task_id AND target.row_number = source.row_number)`.

14. **Centralized Enterprise OAuth 2.0 & Team Credential Segregation**:
    - Centralize enterprise OAuth 2.0 credentials (Client ID, Client Secret, Tenant ID, Scopes) at the Admin level (`provider_connections` with `team_id IS NULL`).
    - Individual teams must NEVER manage, enter, or be exposed to sensitive Client Secrets or App Registrations. Teams only select an Admin-configured OAuth 2.0 connection and provide their dedicated mailbox / account address (`userEmail`).
    - The backend service layer (`oauth2Service`, `stagingService`) must dynamically resolve `adminOAuth2ConnectionId` at fetch/test runtime with least privilege.
    - All Admin API endpoints returning connection definitions must mask `clientSecret` (`••••••••`) and preserve existing database secrets when updating without a new secret.

15. **Persistent Presentation Assets & Re-executable Generation Scripts**:
    - Whenever generating presentations, executive slide decks (`.pptx`), or visual system introductions, NEVER treat captured screenshots or generator code as ephemeral scratch.
    - All high-resolution screenshots, diagrams, and media must be saved in a designated, persistent workspace folder (`presentation_assets/`) with clear descriptive filenames.
    - The compilation/builder script (e.g. `build_presentation.py`) must be preserved in the repository root or assets directory, fully parameterized and documented so that future modifications, slide re-orderings, or content additions can be executed in a single command (`python build_presentation.py`).

16. **Full-Viewport Workspace Layout, Scroll Containment & Header Preservation**:
    - **No Hardcoded Viewport Heights in Inner Panes**: Never use brittle height subtractions (e.g. `h-[calc(100vh-140px)]`) for inner workspace columns or tabs. Always enforce strict flexbox bounding: `h-full flex-1 min-h-0 overflow-hidden` on parent wrappers, with `shrink-0` on headers, toolbars, and tab bars so they are permanently stationary and never scroll out of view.
    - **Outer Viewport Scroll Isolation**: Route wrappers (such as `<main>` in `App.tsx`) must enforce `overflow-hidden flex flex-col h-[calc(100vh-2.25rem)] min-h-0` for full-screen workspace environments (`team_workspace`, `workspace`) to eliminate outer scroll leaks that push desktop TitleBars or TeamHeaders off-screen.
    - **Independent Dual-Pane Scrolling & Clean Scrollbars**: Multi-pane interfaces (like Mailbox thread list and message history) must scroll independently using `overflow-y-auto min-h-0` with `.no-scrollbar` (`scrollbar-width: none; -ms-overflow-style: none; ::-webkit-scrollbar { display: none; }`).
    - **Universal Team-Public Task Consolidation**: Operational tasks and issues with `visibility: 'TEAM_PUBLIC'` or belonging to an operational team must automatically project into the Team Tasks Kanban view with visual badges and 1-click workspace navigation links (`onOpenIssueInWorkspace`).

17. **Strict Data Loss Prevention, Scoped Cleanup & Mandatory Dry-Run**:
    - **No Blanket Deletions**: Automated scripts, scratch tools, migrations, or CLI commands must NEVER execute unconstrained `DELETE FROM <persistent_table>` or `DROP TABLE <persistent_table>` against persistent entities (`database_validation_workflows`, `validation_boxes`, `database_connections`, `database_table_mappings`, `issues`, `teams`, `users`, `workflow_bundles`).
    - **Explicit Provenance Scoping**: Any cleanup touching persistent records must use restrictive, reviewable identification (e.g. `WHERE id = ANY($1)` or `is_system_mock = true`). Names, creation dates, or appearance alone must never be treated as proof that a record is disposable.
    - **Mandatory Dry-Run Sequence**: Before deleting or modifying persistent records, the agent must execute:
      `IDENTIFY` → `SELECT matching records` → `VERIFY ownership/provenance` → `DRY RUN` → `REPORT affected records` → `OBTAIN EXPLICIT APPROVAL` → `MODIFY / DELETE` → `VERIFY final state`. If provenance cannot be verified, DO NOT delete.
    - **Transient Data Verification**: Never assume a table is safe to drop merely because of its name (e.g. `mirror_%`). Verify from the active repository that the object is truly a transient, generated structure before dropping.

18. **Canonical ValidationBoxType & CheckType Segregation**:
    - **Canonical Enums**: All validation box persistence in PostgreSQL (`validation_boxes.box_type`), backend models, API serialization, and frontend TypeScript state MUST strictly conform to the four canonical `ValidationBoxType` enums:
      `'INGESTION_SEARCH' | 'CONDITION_CHECK' | 'RECONCILIATION' | 'REPORT'`.
    - **Strict Layer Separation**: Internal rule check types (`EXISTENCE_CHECK`, `VALUE_MATCH`, `AMOUNT_MATCH`, `ISO_DECLINE_CODE`) belong exclusively inside `rule_definition.checkType` or `steps[].checkType`, NEVER in `validation_boxes.box_type`.
    - **Single Source of Truth**: Before modifying enum values, verify consistency across Database Schema ↔ Backend Model ↔ API Contract ↔ Frontend Type ↔ UI Filters ↔ Seeds/Migrations ↔ Existing Data.

19. **Team-Scoped Database Connection Isolation & Credential Protection**:
    - **Team Ownership**: Database connections created within a team context (`team_id = currentTeam.id` via `api.createTeamDatabase`) are strictly private to that team (`scope = 'team'`).
    - **Strict Authorization Chain**: Access must verify `User` → `Team Membership` → `Team` → `DB Connection` → `Allowed Operation`. Users must not access another team's connection simply by knowing an ID, database name, table name, or mirror table.
    - **Promotion Governance**: Promoting a connection from `team_id = <team>` to global (`team_id = NULL`) requires an explicit administrative/Maker-Checker promotion workflow (`promotion_status = 'PENDING'` -> approval).
    - **Credential Protection**: Passwords and secrets must never be logged or returned in plaintext, must be masked on retrieval (`••••••••`), and must remain unchanged during metadata updates when no new password is submitted.

20. **Evidence-Based Persistent-State Modification & Cross-Layer Verification**:
    - **No Speculative Assumptions**: Never assume a workflow is "probably a test workflow", a record is "probably unused", an enum "probably means the same thing", or a row "can probably be regenerated". Establish the intended state strictly from evidence (schemas, types, migrations, seeds, approved ADRs).
    - **Cross-Layer Invariance**: When changing any status, enum, type, lifecycle, or persistent field, inspect and synchronize every layer: `Database` ↔ `Backend` ↔ `API` ↔ `Frontend` ↔ `Seeds` ↔ `Migrations` ↔ `Existing Data` ↔ `Tests`. Never patch only the layer where the symptom surfaced.
    - **Mandatory 6-Phase Workflow**: For persistent state, architecture, schema, authorization, or lifecycle changes, execute:
      1. *Inspect* → 2. *Analyze* → 3. *Plan* → 4. *Approval* → 5. *Modify* → 6. *Verify*.

21. **Four-Tier Flowchart DAG Invariance & Explicit Pipeline Database Scoping**:
    - **Four-Tier Synchronization**: Any property added to a workflow, stage, or step MUST be synchronized across all four layers simultaneously:
      1. *Visual Canvas State* (`FlowchartNode`, `handleAddBoxNode`, `convertStagesToFlowchart`, `cleanNodes`, `createSnapshot`)
      2. *Inspector & Component State* (`WorkflowInspector` props, live configuration queries, form state)
      3. *Execution Model* (`ProcessingStage`, `ValidationCheckStep`, `ruleSqlCompiler`)
      4. *Persistence & Hydration* (`postgresRepo`, `workflowsRouter`, `hydrateWorkflowColumnConfigurations`).
      Never allow a property to exist in the database or execution model while being stripped during flowchart serialization or canvas loading.
    - **Explicit Database & Table Scoping**: Workflows must never execute queries against external tables with ambiguous or hardcoded references. Every workflow must specify its `targetDbId` and `targetTable` at the pipeline level, and each stage/node must bind strictly to registered database column configurations via `attachedDbConfigIds`.
    - **Execution Policy Preservation**: Multi-row cardinality policies (`cardinalityPolicy`), aggregation strategies (`aggregationStrategy`), and ordering columns (`orderByColumn`) must be preserved during conversion between stages, steps, and flowchart nodes.

22. **Mandatory Architectural Entry Point & End-to-End Sign-Off Traceability**:
    - **Authoritative Entry Point (`MASTER_ARCHITECTURE_INDEX.md`)**: The repository maintains a single grand entry point document, [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md), collecting and indexing all master architectural specifications, implementation plans, acceptance reports, audits, and decision logs across all subsystems.
    - **Single Master Specification Anchor**: In all architectural modifications, features, or system refactors, engineering work MUST be governed by a designated primary Master Architectural Specification document (e.g. [`UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md), [`PIPELINE_ENGINE_MASTER_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/PIPELINE_ENGINE_MASTER_ARCHITECTURE.md)).
    - **In-Document Architectural Change Summaries**: Whenever architectural changes are made, a structured change summary (Date, Scope, Rationale, and Physical Code Impact) MUST be appended directly under that master document's dedicated Changelog section AND mirrored in [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md).
    - **Unified Lifecycle Reference Hub**: That primary architectural document MUST contain a dedicated, continuously maintained traceability section (`Implementation Flow: Architectural Roadmap, Acceptance & Audit Traceability`) indexing every related document across the entire lifecycle until final sign-off:
      1. *Master Specifications & Domain Blueprints*
      2. *Engineering Implementation Plans*
      3. *Implementation Acceptance Reports*
      4. *Independent Verification Audits & Code-Level Reality Checks*
      5. *UI/UX Design System Audits*
      6. *Architecture Decision Records (ADRs) & Decision Logs*
    - **Summaries & Clickable Links**: Every referenced document MUST be hyperlinked using markdown links (`[Document](file:///...)`) and accompanied by concise, bullet-pointed summaries of its scope, findings, and key architectural points.
    - **Anti-Premature Certification (Zero-Assumption Reality Gate)**: No architectural modification may be declared "100% Certified" or signed off based solely on passing unit tests or acceptance claims. Final sign-off requires a rigorous physical code audit verifying that all runtime execution bridges, API routes, scheduled triggers, and test assertion loops physically execute non-vacuously (preventing false-green tests and disconnected schema fields).





