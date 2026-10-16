# WORKING NOTES - CODEBASE DEEP ANALYSIS
## Temporary Analysis File for Audit Compilation

---

### STAGE 1: ARCHITECTURAL DOCUMENTS REVIEWED
- MASTER_ARCHITECTURE_INDEX.md (248 lines) - Central entry point, 7 domains indexed
- CURRENT_PROJECT_CONTEXT.md (715+ lines) - Baseline reality document
- UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md (504 lines) - 4-Type taxonomy
- PIPELINE_ENGINE_MASTER_ARCHITECTURE.md (663+ lines) - 5 architectural pillars
- RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md (500+ of 2928 lines) - 15 directives
- DECISION_LOG.md (89 lines) - ADR-001 through ADR-005
- RECONCILIATION_PROCESS_ARCHITECTURE_AND_SPECIFICATION.md (339 lines) - 5 invariants
- FRONTEND_INVESTIGATION_ORCHESTRATION_MODIFICATION_SUGGESTIONS.md (300+ of 743 lines)
- STANDARD_FILE_INGESTION_AND_MAPPING_ARCHITECTURE.md (300+ of 328 lines)
- MESSAGE_INTEGRATION_ARCHITECTURE.md (300+ of 671 lines)
- AUDIT_REPORT_2026-10-10.md (700+ of 1249 lines) - Prior audit with 21 findings

### STAGE 2: BACKEND SERVICES INSPECTED

#### investigationOrchestratorService.ts (1639 lines)
- Lines 1-200: Universal envelope, legacy executor marked @deprecated, parameter discovery
- Lines 200-600: Singleton dedup, cache eviction, Builder compilation gate (line 357), liveness probe (line 441), key chaining via NextStageInputResolver (line 501)
- Lines 600-1000: Mirror provisioning, external chunk query execution, ruleSqlCompiler invocation (line 655), PASS/FAIL partitioning (lines 705-888), StageOutputContract construction (lines 893-923), heartbeat telemetry (line 956)
- FINDINGS: Builder pattern properly enforced. Compilation failure halts execution (line 358-393). Key chaining correctly avoids _validation_status='PASS' filter (line 525-531 comment confirms FAIL+CONTINUE hydration preserved). Heartbeat non-blocking (line 964-966 catch swallows error silently - potential observability gap).

#### ruleSqlCompiler.ts (505 lines)
- Lines 1-200: sanitizeSqlConditionPredicate blocks SQL injection (semicolons, comments, DDL/DML, SELECT subqueries, PG_SLEEP). resolveOperandSqlExpr handles INPUT/LEG origins. compileStepCondition supports DUAL_SOURCE_COMPARISON, EXISTENCE_CHECK, VALUE_MATCH, AMOUNT_MATCH, FIELD_COMPARATOR
- FINDINGS: baseSql = 'TRUE' on line 102 is a FALLBACK not default - throws error on line 139 if no targetField and no columnConfigs. SQL injection sanitization robust. ANSI quoting via quoteIdentifier in externalDataQueryService.

#### mirrorTableManager.ts (417 lines)
- Lines 1-200: Table cache with 30min TTL (line 20-35). derive64BitAdvisoryLockSql uses correct formula (line 58-59). ensureMirrorTableExists acquires advisory lock (line 93-96). Dynamic DDL with UNLOGGED tables. Column type mapping (line 44-56).
- FINDINGS: Advisory lock acquired via queryPg not pool.connect() - lock released immediately after query returns per pg_advisory_xact_lock semantics. This is CORRECT for transaction-scoped locks but the try/catch swallows errors (line 97-99).

#### workflowEngineSingleton.ts (199 lines)
- LRU cache with 15-min TTL. In-flight mutex deduplication. partitionIncomingTransactions separates cache hits, in-flight, and fresh executions.
- FINDINGS: No max cache size enforcement visible - unbounded Map growth potential under sustained load.

#### reconciliationService.ts (455 lines)
- Lines 1-200: persistExternalMirrorBatch with 500-chunk inserts. reconcileBatchInDatabase uses CTE DISTINCT ON (row_number) per Rule 13. Sanitizes keys to prevent JSON path injection (line 104-110). Diagnostic taint protection bypasses mutation for _isDiagnosticOnly records (line 168-173).
- FINDINGS: CTE deduplication correctly implemented. Diagnostic taint tracking active.

#### validationPipelineBuilder.ts (401 lines)
- Gang of Four Builder Pattern. PipelineBuilder + StageBuilder fluent API. Kahn's algorithm for DAG acyclicity. Validates cardinality policies and orderByColumn requirements.
- FINDINGS: Connections preserved in CompiledValidationPlan (line 46). Self-referential cycle detection present.

#### dbConnectionManager.ts (713 lines)
- MySQL via mysql2/promise with pool. PostgreSQL via pg.Client (creates new client per call - NO POOLING for external PG). MongoDB via mongoose. Oracle explicitly returns failure (line 92-98). FTP/SFTP delegated.
- FINDINGS: External PostgreSQL connections create new pg.Client per operation without pooling (line 101-115, 171-188). Connection cleanup relies on client.end() in finally block - if process crashes mid-query, connection leaks on remote DB.

#### externalDataQueryService.ts (677 lines)
- Composite tuple SQL generation. ANSI identifier quoting via quoteIdentifier (line 58-61). WHERE 1=1 unrestricted scan prevention (line 175 throws error). Multi-row resolution policies supported.
- FINDINGS: Security violation check on empty composite tuples (line 123, 142, 175) - correctly refuses unrestricted scans.

#### postgresRepo.ts (4747 lines)
- Lines 1-200: Schema initialization via inline DDL (ensureFileMappingTemplatesSchema, ensureSystemTransformationRulesSchema, ensureFtpStagingSchema). User CRUD with role mapping.
- Password masking: Line 886 masks with '••••••••' when maskSecret=true. Line 910 SELECT * FROM database_connections returns ALL columns including password. Line 1012 preserves password when update contains '••••••••'.
- FINDINGS: getDatabases() at line 910 uses SELECT * which includes password column. Masking depends on caller passing maskSecret flag. If any route calls without maskSecret=true, plaintext password leaks.

#### makerCheckerService.ts (270 lines)
- submitResolutionProposal validates required fields, inserts proposal, locks transaction to PENDING_CHECKER_REVIEW (line 88-100).
- reviewResolutionProposal uses pool.connect() + BEGIN/COMMIT (line 124-127). Anti-self-approval check: proposal.maker_id === input.checkerId throws error (line 142-143). Team authorization check (line 147-149).
- FINDINGS: Transaction management correct using dedicated client. Anti-self-approval enforced at service layer.

#### resolutions.ts (72 lines)
- POST /propose, POST /review, GET /pending, POST /propose-from-chat
- Anti-self-approval error caught and returned as HTTP 403 (line 28-29)
- FINDINGS: propose-from-chat endpoint uses fallback defaults ('usr-maker', 'default-team') which could bypass proper attribution if frontend doesn't send values.

### STAGE 3: FRONTEND COMPONENTS INSPECTED

#### WorkflowStudioFlowchart.tsx (2822 lines)
- Lines 1-300: State management for workflows, boxes, databases, canvas. createSnapshot includes all governance properties (cardinalityPolicy, aggregationStrategy, orderByColumn, attachedDbConfigIds) at lines 162-165. currentSnapshot memoized for dirty tracking. loadData fetches workflows scoped by teamId.
- FINDINGS: Snapshot function correctly preserves all four-tier properties. Canvas dimensions calculated dynamically (line 283-294) - no hardcoded viewport heights for inner panes.

#### ValidationOrchestratorWorkspace.tsx (7811+ lines)
- Lines 1-300: Helper functions formatValidationDetail (handles nested objects, stage history, cardinality breaches), renderDataAsTable (recursive table rendering preventing raw JSONB JSX children), formatCellVal, areValuesEqual, getCaseInsensitiveVal, extractRowLegs.
- ErrorBoundary imported and used at lines 5268, 6737, 7630, 8130 for modals.
- FINDINGS: JSONB sanitization correctly implemented via renderDataAsTable. ErrorBoundary wraps complex modal views. Component is 7811+ lines - monolithic, violates single responsibility.

#### HashtagManager.tsx (1937+ lines)
- Lines 1-300: Wrapped in ErrorBoundary (line 48). 4-Type taxonomy state management. Template loading from API. Multi-format file parsing (Excel via XLSX, XML via DOMParser). Workflow sorting with approval hierarchy.
- FINDINGS: XLSX imported synchronously at top (line 7) - not lazy-loaded. Violates architecture claim of dynamic import('xlsx') for bundle optimization.

### STAGE 4: SECURITY & GOVERNANCE AUDIT

#### localStorage Usage (Rule 23 Compliance Check)
CRITICAL FINDINGS - 28 matches across frontend:
1. globalMappingService.ts: Lines 87, 108, 165, 187, 216, 463, 477, 520, 550, 1304 - Uses localStorage as PRIMARY store for schema configs and central table mappings. THIS IS A DIRECT VIOLATION OF RULE 23.
2. WorkspaceSettings.tsx: Lines 115, 137, 150, 162 - Stores workspace configuration in localStorage.
3. SystemSettings.tsx: Lines 162, 191, 393 - Stores system_transformation_rules in localStorage.
4. client.ts: Lines 18, 27 - JWT token storage (acceptable per Rule 23 ephemeral UI scoping).
5. SideNav.tsx, TeamWorkspace.tsx: Sidebar/rail collapsed state (acceptable per Rule 23).
6. FtpFileStagingSettings.tsx: preferred_ftp_server_id (borderline - UI preference).
7. usePersistentState.ts: Generic hook using localStorage.

RULE 23 BREACH: globalMappingService.ts uses localStorage as primary persistence for business-critical schema configurations. Migration 029 added value_translation_dictionaries to PostgreSQL but globalMappingService still reads/writes localStorage independently.

#### Credential Protection (Rule 19)
- postgresRepo.ts line 886: Masks password when maskSecret=true
- postgresRepo.ts line 910: SELECT * FROM database_connections includes password
- database.ts line 430: Masks password in route response
- postgresRepo.ts line 1012: Preserves password when update is '••••••••'
- FINDING: Route-level masking exists but repo-level getDatabases() does NOT enforce masking unconditionally. Any internal caller can get plaintext passwords.

#### Maker-Checker Anti-Self-Approval (Rule 7)
- 15 matches across codebase confirming makerId !== checkerId enforcement
- makerCheckerService.ts line 142: Service-layer enforcement
- resolutions.ts line 28: API-layer HTTP 403 response
- postgresRepo.ts line 4269: Database-layer enforcement for settings proposals
- workflowBundleService.ts line 183: Bundle approval enforcement
- FINDING: Properly enforced across multiple layers.

#### ErrorBoundary Coverage (Rule 6)
- 56 matches across frontend
- App.tsx wraps major workspace areas
- ValidationOrchestratorWorkspace.tsx wraps all modals
- HashtagManager.tsx wrapped entirely
- InvestigationWorkspace.tsx wrapped
- IssueDetailView.tsx wraps workspace sections
- FINDING: Comprehensive coverage implemented.

### STAGE 5: PRIOR AUDIT CROSS-REFERENCE (AUDIT_REPORT_2026-10-10.md)

| Finding | Status in Current Code | Verdict |
|---------|----------------------|---------|
| S1.1 False-Pass on Missing DB Records | orchestrator lines 812-887 correctly handles NOT_FOUND_IN_TARGET_DB with FAIL status | RESOLVED |
| S1.2 Duplicate Check Mathematical Invalidation | ruleSqlCompiler needs verification of _dup._row_number scope | NEEDS VERIFICATION |
| S1.3 Connection Pool Starvation (pool.query BEGIN) | grep found ZERO instances of pool.query('BEGIN'). makerCheckerService uses pool.connect() correctly | RESOLVED |
| S1.4 Advisory Lock Bypass | mirrorTableManager uses queryPg for advisory lock which releases immediately | PARTIALLY RESOLVED |
| S1.5 Plaintext Password Leakage | postgresRepo.ts line 910 still uses SELECT * including password | UNRESOLVED |
| S1.6 Browser UI Thread Freeze | ValidationOrchestratorWorkspace is 7811 lines, synchronous processing | UNRESOLVED |
| S2.1 Four-Tier DAG Invariance | createSnapshot includes all properties | RESOLVED |
| S2.2 ValidationBoxType vs CheckType | box_type VARCHAR(64) in schema allows any string | SCHEMA WEAKNESS |
| S2.3 Missing ErrorBoundary | 56 ErrorBoundary usages found | RESOLVED |
| S2.4 Hardcoded Viewport Heights | Dynamic canvas calculation used | RESOLVED |
| S2.5 Team DB Isolation Bypass | Scope filtering present in repo queries | NEEDS VERIFICATION |

### STAGE 6: CRITICAL GAPS IDENTIFIED

1. **CRITICAL - Rule 23 Breach**: globalMappingService.ts uses localStorage as primary store for business schema configs (10+ read/write operations). Value translation dictionaries were migrated to PostgreSQL (Migration 029) but global mapping config remains in localStorage.

2. **HIGH - Password Exposure**: postgresRepo.ts:getDatabases() executes SELECT * FROM database_connections returning password in plaintext. Masking is opt-in via maskSecret parameter rather than default behavior.

3. **HIGH - HashtagManager XLSX Import**: Synchronous import('xlsx') at top of file (line 7) contradicts architectural documentation claiming lazy-loaded binary modules for bundle optimization.

4. **MEDIUM - Unbounded Cache Growth**: workflowEngineSingleton.ts resultCache is an unbounded Map. Under sustained high-throughput load, memory grows without eviction beyond TTL-based cleanup that only triggers on read.

5. **MEDIUM - Monolithic Components**: ValidationOrchestratorWorkspace.tsx exceeds 7811 lines. Violates single responsibility principle. Frontend modification suggestions document acknowledged this (line 30: "50+ useState") but refactoring appears incomplete.

6. **MEDIUM - Heartbeat Error Swallowing**: investigationOrchestratorService.ts line 964-966 catches heartbeat insert errors silently. Worker progress telemetry lost during DB stress.

7. **LOW - Schema Type Weakness**: validation_boxes.box_type is VARCHAR(64) without CHECK constraint enforcing canonical enum values. Application-level enforcement only.

8. **LOW - propose-from-chat Defaults**: resolutions.ts line 55-57 uses fallback strings ('usr-maker', 'default-team') which could create proposals with invalid attribution if frontend payload is incomplete.
