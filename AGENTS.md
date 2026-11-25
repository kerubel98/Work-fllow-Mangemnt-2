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

23. **Strict Prohibition of Client-Side `localStorage` as Primary State Store**:
    - **Zero Business Logic in Local Storage**: Browser `localStorage` or `sessionStorage` must NEVER be used as the primary storage, system of record, or source of truth for any application entity, business dictionary, template, transformation rule, mapping, or workflow configuration.
    - **Mandatory PostgreSQL First**: Any new feature, dictionary, or configuration schema MUST be persisted in PostgreSQL (`operational_workflow_db`) via a versioned relational migration, backend repository methods in `postgresRepo.ts`, and REST API routes before or alongside frontend wiring.
    - **Strictly Ephemeral UI Scoping**: `localStorage` is permitted solely for non-business, device-local UI ergonomics (such as sidebar collapsed toggles). Any frontend state caching must serve only as a secondary optimistic read cache that is unconditionally hydrated and governed by PostgreSQL.

24. **Composite Executable Ingestion Mappings (Mapping = Schema + Ordered Recipe Pipeline)**:
    - **Composite Execution Entity**: An ingestion mapping template must NEVER be saved or executed as a simple column-to-column dictionary. It is a composite entity containing both schema projections and an ordered array of cleaning recipes (`FileIngestionCleaningRecipe`: Header Row Index, Data Start Row, Whitespace Trimming, Deduplication, and Value Translation Dictionaries).
    - **Mandatory Backend Replay**: When an ingestion template is applied—either interactively during task creation or automatically in scheduled cron automations—the backend engine (`recipeExecutionService`) must replay all recipe steps sequentially against the raw data rows before committing them to the persistent store.
    - **Multi-Tier Cross-File Resolution**: Mappings must never fail on minor header discrepancies. Column matching must resolve across three tiers:
      1. *Normalized Alphanumeric Matching*: Strips whitespace, underscores, and special characters (`[a-z0-9]`).
      2. *Global Standard Directory Matching*: Resolves aliases against `global_standard_directory` keys and display labels.
      3. *Explicit Template Overrides*: Applies user-configured custom mappings.

25. **Clean Table Toolbars & Modal-Governed Ingestion Transformations**:
    - **Zero Clutter on Primary Toolbars**: Table toolbars must remain uncluttered by redundant status strings or inline configuration inputs (e.g. raw "Showing X of Y columns Header: 1•Data: 2").
    - **Contextual Action Containment**: Structural dataset adjustments (Header Row Index, Data Start Row, Deduplicate, Whitespace Trim, Column Pruning) must be housed inside the table's contextual `...` dropdown menu.
    - **Explicit Provenance via Confirmation Modals**: Changes to ingestion row structures must open dedicated validation modals (`HeaderDataRowModal`) that record an explicit, reviewable entry into the task's Applied Recipes history.

## Project Agent Guidelines & Directives

### Non-Negotiable Architectural Invariants (FinSync v2 on EthSwitch)
1. **National Custody Rule:** Banks hold all funds; EthSwitch coordinates rails; FinSync never holds deposits or acts as a custodial wallet.
2. **Beneficiary Lockdown:** Money flows strictly to authorized `MerchantAccount` destinations. Cashiers are never beneficiaries.
3. **Authority of Price:** Callers send item IDs and quantities, never prices. Prices strictly resolve from inventory catalogs (`IPriceSource`).
4. **Asymmetric QR Tokens:** Signed with NIST P-256 (`secp256r1`) ECDSA private keys. Mobile apps cache public keys for instant offline verification. Single-use nonces are invalidated atomically in Redis.
5. **Cashier Separation of Interest:** Cashiers cannot own unrelated businesses; active cashiers cannot register businesses.
6. **Double-Entry Balance Constraint:** Every journal posting requires $\sum \text{Debits} = \sum \text{Credits} \neq 0$ enforced at the PostgreSQL constraint level.
7. **Pre-Consumption Escrow:** Delivery handover codes are only burned after verifying GPS proximity ($\le 100\text{m}$), recipient identity, and order status.

---

### Custom Directives

#### 1. `/summarize` Directive
When the user types `/summarize`, treat it as a request to create a session handoff for continuing the current coding task in a new agent conversation.

##### Objective
Create a concise, accurate, context-preserving Markdown document that allows a fresh agent session to continue the work without re-investigating everything or asking the user to repeat information.

##### Instructions
1. Review the current conversation and identify the actual task and progress.
2. Verify important implementation details against the current project files when necessary. Do not assume a change was completed just because it was discussed.
3. Create or update a Markdown handoff file at:
   `agent-handoffs/session-handoff.md`
4. Include only information that is relevant to continuing the current task.
5. Preserve important decisions, constraints, unresolved issues, and next steps.
6. Keep the document concise, structured, and easy to scan.
7. Do not copy entire source files, large code blocks, or unrelated conversation content.
8. Do not modify application source code just to create a session summary.
9. If a fact is uncertain, explicitly label it as unverified rather than inventing details.
10. Make the handoff self-contained so a new agent can use it without access to this conversation.

##### Required Markdown Structure
```markdown
# Session Handoff

## 1. Current Task
What we are currently trying to accomplish and the expected outcome.

## 2. Progress
- Completed work
- Partially completed work
- Work not yet started

## 3. Important Technical Decisions
- Architecture, implementation choices, constraints, and decisions that must not be changed without reason.

## 4. Files Involved
List relevant files and briefly explain their roles.
Distinguish files modified from files merely inspected.

## 5. Current State
Describe how the implementation currently works and where work stopped.

## 6. Issues and Blockers
Include errors, unresolved questions, bugs, or dependencies. If none, state "None identified."

## 7. Next Steps
Provide a prioritized, actionable checklist of the next tasks.

## 8. Verification
List relevant commands, tests, builds, and their results. Clearly distinguish executed tests from tests not run.

## 9. Continuation Instructions
Tell the next agent exactly where to start, what to inspect first, what to avoid repeating, and how to continue.
```

---

#### 2. `/resume` Directive
When the user types `/resume`, resume the coding work from the most recent session handoff.

##### Objective
Continue the previous coding session efficiently, preserving its progress, decisions, constraints, and next steps without wasting context on repeated investigations.

##### Instructions
1. Read `agent-handoffs/session-handoff.md` first.
2. Identify the last task, completed work, current state, and remaining steps.
3. Inspect only the files necessary to verify the current state of the documented work.
4. Check whether the documented files, code, or tasks have changed since the handoff was created.
5. Do not redo completed work unless it is incomplete, broken, or needs correction.
6. Respect previously established architecture, design decisions, user requirements, and constraints.
7. Continue from the highest-priority unfinished step.
8. For a small task, proceed directly without creating another lengthy plan.
9. For a complex task, provide a short continuation plan and then execute it.
10. If a blocker prevents continuation, explain the specific blocker and offer the most practical solution.
11. Do not scan the entire repository unless the task requires it.
12. Do not treat the handoff file as unquestionable truth; verify relevant details against the current project.

##### Response Behavior
After `/resume`, briefly state:
- What task is being resumed.
- Where the previous session stopped.
- What you will continue with.
Then work on it immediately without waiting for approval unless clarification is genuinely required.

---

### 3. `/audit` Directive
When the user types `/audit` (or `/audit [scope]`), conduct a scoped code and architecture audit using `.agents/skills/code-audit/SKILL.md`:

#### Context-Free Auto-Discovery (When [scope] is omitted)
When `/audit` is invoked without arguments, autonomously determine the audit scope without asking clarification:
1. **Read Latest Plan:** Inspect [`agent-handoffs/plan/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/plan/INDEX.md) and the latest plan document in `agent-handoffs/plan/` for target services, modified methods, and invariants.
2. **Inspect Changed Files:** Check `git status --porcelain` and timestamps of recently touched files in `services/` and `test/`.
3. **Correlate with Master Ledger:** Check [`agent-handoffs/audit/master-audit.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/master-audit.md) for pending audit findings or regressions in those subsystems.
4. **Map to Invariants:** Map detected changes to the governing 7 Non-Negotiable Invariants.

#### Audit Execution
1. Read `agent-handoffs/audit/master-audit.md`, previous relevant audit reports in `agent-handoffs/audit/reports/`, and sign-offs in `agent-handoffs/audit/sign-off/`.
2. Check if pending audit tasks or unresolved blockers exist from earlier iterations.
3. Inspect the requested/discovered scope and minimum dependencies against the 7 invariants.
4. Execute verification: `npm run build --workspaces --if-present`, `npm test --workspaces --if-present`, and `npm run test:e2e`.
5. Assign stable finding IDs (`AUD-<SCOPE>-###`) and severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`).
6. Create a new detailed audit report under `agent-handoffs/audit/reports/`.
7. Update [`agent-handoffs/audit/reports/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/reports/INDEX.md) with report link, scope summary, and invariant coverage.
8. Update `agent-handoffs/audit/master-audit.md` without deleting history.
9. Present scope, finding counts by severity, major risks, audit report path, master register path, and recommended next action. Do not modify application code during an audit unless explicitly requested.

---

### 4. `/sign-off` Directive
When the user types `/sign-off`, execute outstanding audit remediation, verification, and sign-off generation using `.agents/skills/code-audit/SKILL.md`:
1. Read `agent-handoffs/audit/master-audit.md`, relevant audit reports, and previous sign-offs.
2. Identify pending findings and their dependencies.
3. Prepare a prioritized remediation plan and implement fixes safely.
4. Verify each fix using targeted tests (`npm test --workspaces --if-present` and `npm run test:e2e`).
5. Create a formal remediation sign-off record at `agent-handoffs/audit/sign-off/SIGN-OFF-<SCOPE>-<DATE>.md`.
6. Update the original audit report with the sign-off reference.
7. Update the master register in `agent-handoffs/audit/master-audit.md`.
8. Report fixes completed, verification results, remaining findings, files modified, sign-off path, and updated register path.

---

### 5. Development Request Protocol (`development-workflow`)
Whenever the user requests new development (e.g. features, bug fixes, refactoring, next steps):
1. **Pre-Development Audit Check:**
   - Inspect [`agent-handoffs/audit/master-audit.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/master-audit.md) first.
   - Check if pending audit tasks, open findings, or invariant violations exist in the targeted subsystems.
   - If pending audit tasks exist, **execute or integrate that remediation first** before building new features.
2. **Author Plan Document in `agent-handoffs/plan/`:**
   - Create a formal plan at `agent-handoffs/plan/PLAN-<FEATURE/SCOPE>-<DATE>.md`.
   - Include: Objective, Pre-Development Audit Check, Invariant Alignment, Implementation Steps, Verification Commands, and Audit Scope.
   - Register the new plan in [`agent-handoffs/plan/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/plan/INDEX.md) with status `IN_PROGRESS`.
3. **Safe Invariant Implementation:**
   - Implement the code strictly enforcing the 7 Non-Negotiable Invariants.
   - Run compilation and tests (`npm test --workspaces --if-present` and `npm run test:e2e`).
4. **Update Audit Reports Index & Scope:**
   - Mark the plan `COMPLETED` in `agent-handoffs/plan/INDEX.md`.
   - Update [`agent-handoffs/audit/reports/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/reports/INDEX.md) under "Ready for Audit" with the exact files modified and invariants to be verified.
   - Ensure a context-free `/audit` call will immediately recognize and audit the work.

---

### 6. Architecture Organization & Fast Navigation Governance
All architectural blueprints, domain contracts, and roadmaps are consolidated in [`agent-handoffs/`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/INDEX.md):
- **Single Source of Truth (SSOT):** Agents must enter through [`agent-handoffs/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/INDEX.md). Do not perform unbounded directory scans.
- **Hierarchical Sitemaps:**
  - `agent-handoffs/architecture/`: Technical specifications (`ARCHITECTURE.md`), standards (`GOVERNANCE.md`), operational policies (`OPERATIONAL_GOVERNANCE.md`).
  - `agent-handoffs/plan/`: Operational plans (`INDEX.md`, `PLAN-*.md`).
  - `agent-handoffs/audit/`: Master ledger (`master-audit.md`), point-in-time reports (`reports/`), and remediation dossiers (`sign-off/`).
  - `agent-handoffs/session-handoff.md`: Active cross-agent working memory.
- **Clean Hexagonal Isolation:** Business invariants belong exclusively to Domain Entities inside `services/<service>/src/`. Adapters (HTTP controllers, SQL repositories) must not bypass domain rules or mutate entities via forced type casting (`as any`).

---

### 7. Industrial-Grade Engineering & Non-Destructive Implementation Standards
When modifying or adding code:
- **Fast & Targeted Reads:** Target files directly from indexed references. Never scan or read entire workspaces unnecessarily.
- **Non-Destructive Mutations:**
  - Backward compatibility: API contract modifications must not break existing clients or tests.
  - Immutability: Never delete historical audit logs or overwrite prior finding IDs.
  - ACID Transactions: All database writes mutating balances, outbox queues, or till sessions must be wrapped in atomic PostgreSQL transactions with pre-commit balance checks.
- **Strict Typing & Precision:**
  - Strict TypeScript mode. Absolutely zero `any`.
  - Financial calculations must strictly preserve 2-decimal-place rounding: `Math.round(val * 100) / 100`.
- **Pre-Handoff Verification Gate:**
  - Always verify: `npm run build --workspaces --if-present`, `npm test --workspaces --if-present`, and `npm run test:e2e`.
  - Maintain 100% clean test passes (91/91 tests).

---

### 8. Senior Engineer & Principal Architect Dual Role (OpenCode & Multi-Model Orchestration)
Every AI agent operating in this codebase operates in a dual capacity:
- **As Principal Architect:**
  - Enforces the 7 Non-Negotiable Invariants unconditionally.
  - Defines service boundaries, sequence flows, and integration contracts.
  - Rejects premature implementation that compromises security, custody, or auditability.
- **As Senior Staff Engineer:**
  - Executes type-safe, production-ready, clean implementations.
  - Authors empirical, rigorous tests for both happy paths and edge cases (tampering, replays, unauthorized accounts).
  - Drives OpenCode slash commands (`/plan`, `/audit`, `/sign-off`, `/resume`, `/summarize`) with clear scopes, documented assignments, and verified sign-off records.
