# Universal Hashtag Engine — Verification Audit Report
## Evidence-Based Cross-Check: ARCHITECTURE_IMPLEMENTATION_ACCEPTANCE_REPORT vs. Physical Code

**Audit Date**: 2026-10-04
**Method**: Physical code inspection — zero assumptions, all claims verified against actual file contents
**Ground Truth Documents**:
- `UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md`
- `AGENTS.md` (Rules 1–21)
- `bo-operational-governance/SKILL.md`

---

## SECTION 1: VERIFIED CLAIMS (Implementation Confirmed)

### Phase 1: Database Migration 026
**File**: `backend/src/database/migrations/026_universal_hashtag_engine.sql`
- **VERIFIED**: ALTER TABLE adds all 9 new columns with correct types and defaults
- **VERIFIED**: CHECK constraints for hashtag_type (4 values), data_source_mode, execution_trigger — all idempotent via DO $$ IF NOT EXISTS
- **VERIFIED**: hashtag_execution_runs table + 5 covering indexes + FK to hashtag_presets(tag) and issues(id)
- **VERIFIED**: bank_directory table + 25 Ethiopian bank seeds (ON CONFLICT DO NOTHING)
- **VERIFIED**: lookup_directories table + back-fill from bank_directory
- **GOVERNANCE**: 64-bit advisory locking confirmed in hashtagService.ts executeExtractionStaging (Rule 10 OK)

### Phase 2: Backend and Frontend Types
**Files**: `backend/src/types.ts` lines 249–343, `frontend/src/types.ts` lines 300–378
- **VERIFIED**: HashtagType union in both (4 values)
- **VERIFIED**: DataSourceMode union in both
- **VERIFIED**: DictionaryLookupMapping interface in both
- **VERIFIED**: HashtagExecutionRun interface in both
- **VERIFIED**: HashtagExecutionVerdict distinct from ValidationResultStatus (Rule 2 OK)

### Phase 2c: Repository Persistence (postgresRepo.ts)
**File**: `backend/src/store/postgresRepo.ts` lines 2813–3062
- **VERIFIED**: _mapHashtagRow() at line 2816 — maps all 24 columns
- **VERIFIED**: getHashtags(filter?) at 2845
- **VERIFIED**: getHashtagByTag(tag) at 2860 — case-insensitive, with/without # prefix (GAP-01 fix OK)
- **VERIFIED**: createHashtag(tag) at 2872 — 24-parameter UPSERT, normalizes to uppercase #
- **VERIFIED**: updateHashtagKpis, recordHashtagRun, getHashtagRuns all present
- **VERIFIED**: getTeamHashtagReport(teamId) at 2993 — window-function aggregation
- **VERIFIED**: getPersonalHashtagReport(userId) at 3022
- **VERIFIED**: lookupBankCode(bankCode) at 3051 — ANSI-quoted identifiers (Rule 11 OK)

### Phase 3: Execution Engine Services (hashtagService.ts)
- **VERIFIED**: Type A executeFileIngestionHashtag — validates minimumRequiredColumns, applyDictionaryLookups
- **VERIFIED**: Type B executeDatabaseDirectScan — external DB routing via dbConnectionManager, lines 268–282
- **VERIFIED**: Type C executeExtractionStaging — 64-bit advisory lock, CREATE TABLE IF NOT EXISTS, batch insert in chunks of 500 with jsonb_array_elements, ANSI-quoted identifiers
- **VERIFIED**: Type D executeAuditingGovernance — read-only, returns isDiagnosticOnly: true (function level) — SEE AGAP-01
- **VERIFIED**: testPreFlight — column validation for Type A, table row count for B/C/D — SEE AGAP-06
- **VERIFIED**: resolveHashtagAssets — cross-queries 6 entities

### Phase 4: REST API Routes (misc.ts)
- **VERIFIED**: Route ordering — static deep routes (/analytics, /test-preflight, /reports/*, /lookup/*) all appear before /:tag catch-all (GAP-02 fix OK)
- **VERIFIED**: normalizeHashtagParam() at line 145 (GAP-03 fix OK)
- **VERIFIED**: 14 hashtag routes registered total
- **VERIFIED**: execute-scan type-guards DATABASE_DIRECT_SCANNER, records run in hashtag_execution_runs
- **VERIFIED**: provision-table route delegates to executeExtractionStaging

### Phase 5: Frontend API Client (client.ts)
**File**: `frontend/src/api/client.ts` lines 1330–1396
- **VERIFIED**: All 11 universal hashtag API methods present and typed correctly

### Phase 5: Authoring UI (HashtagManager.tsx)
- **VERIFIED**: 4-Type segmented selector at lines 253–256
- **VERIFIED**: hashtagType state set on creation (line 132), dataSourceMode derived correctly
- **VERIFIED**: Pre-Flight Test drawer at lines 471–567 — calls testHashtagPreflight, shows results
- **VERIFIED**: Type B/C DB connection fields shown conditionally (lines 739–775)

### Phase 6: Investigation Dry-Run and Diff (ValidationOrchestratorWorkspace.tsx)
- **VERIFIED**: Type badge showing hashtagType at lines 3015–3017
- **VERIFIED**: Test DB Checks (Dry-Run) button at lines 3024–3029, calls executeHashtagScan with isDryRun: true
- **VERIFIED**: Side-by-side diff modal state and render at lines 848–860 and 5598–5755

### Phase 7: Chat Directives (EscalationRoomModal.tsx)
- **VERIFIED**: parseCommand() at line 114 recognizes /escalate and /create-hashtag
- **VERIFIED**: Quick command chips at lines 426–451

### Phase 8: Team Reports Dashboard (TeamHashtagReportsTab.tsx)
- **VERIFIED**: Calls api.getTeamHashtagReport(teamId) at line 41
- **VERIFIED**: KPI cards for presets, total runs, rows scanned, avg SLA duration
- **VERIFIED**: Velocity Matrix table rendered at line 181+
- **VERIFIED**: Wired into TeamWorkspace.tsx at lines 35 and 1546

### Phase 9: Integration Test Suite
- **VERIFIED**: 5 test groups for Types A–D and Maker-Checker anti-self-approval
- **VERIFIED**: Calls postgresRepo.createHashtag, getHashtagByTag, hashtagService.*, approvalService.*
- **NOTE**: Type D test passes vacuously — see AGAP-01

---

## SECTION 2: ARCHITECTURAL GAPS DISCOVERED

The following 9 gaps were discovered through direct code inspection. None are documented in the current ARCHITECTURE_IMPLEMENTATION_ACCEPTANCE_REPORT.md.

---

### AGAP-01 [SEVERITY: HIGH] — Type D auditRows Per-Record Taint Missing (False-Green Test)

**Rule**: AGENTS.md Rule 12 — Diagnostic Taint Tracking
**Evidence**: hashtagService.ts lines 507–514

Test expects (universalHashtagsEngine.test.ts lines 176–179):
```
for (const rec of auditResult.auditRows) {
  expect(rec._isDiagnosticOnly).toBe(true);
  expect(rec._diagnosticTaintReason).toContain('TYPE_D_AUDITING_SWEEP');
}
```

Actual implementation (hashtagService.ts:511):
```
auditRows: [],   // Always empty — loop body never executes
isDiagnosticOnly: true
```

The function-level isDiagnosticOnly: true is correct. But auditRows always returns [] — no individual SLA-breached issues or Maker-Checker violations are placed into auditRows with per-row _isDiagnosticOnly: true and _diagnosticTaintReason tags. The test loop runs zero iterations: the test passes vacuously and is a false-green, masking the missing row-level taint enforcement.

**Required**: Fetch individual SLA-breached issue rows and Maker-Checker violation rows, tag each with _isDiagnosticOnly: true and _diagnosticTaintReason: 'TYPE_D_AUDITING_SWEEP', and populate auditRows.

---

### AGAP-02 [SEVERITY: HIGH] — Full Execution (conditionalAction / EXECUTE_SQL / Maker Proposal Staging) Never Wired

**Rule**: AGENTS.md Rule 7 — Maker-Checker Dual Authorization; Spec §6.2 Full Execution
**Evidence**: No matches in misc.ts, hashtagService.ts, or ValidationOrchestratorWorkspace.tsx for: onPass, EXECUTE_SQL, conditionalAction, submitProposal (in hashtag context), LIVE_FULL execution path, or "Run and Remediate" button

The conditionalAction field ({ onPass: 'EXECUTE_SQL', onFail: 'FLAG_INVESTIGATION' }) is:
- Correctly stored in the database schema
- Correctly deserialized in _mapHashtagRow and createHashtag
- Never evaluated at runtime

The execute-scan route only records the run result. It never inspects preset.conditionalAction.onPass, never triggers approvalService.submitProposal(), and there is no frontend "Run and Remediate" (LIVE_FULL) button that would initiate this flow.

**Required**:
1. Backend: After a LIVE scan, if preset.conditionalAction.onPass === 'EXECUTE_SQL' and verdict is PASS, call approvalService.submitProposal() with the solutionTemplate script.
2. Frontend: Add a Run and Remediate button in ValidationOrchestratorWorkspace.tsx (isDryRun: false), show the staged Maker proposal ID.

---

### AGAP-03 [SEVERITY: MEDIUM] — SCHEDULED_CRON Trigger: Schema Ready, Runtime Not Wired

**Evidence**: schedule_cron column exists in migration, executionTrigger deserialized in repo. No matches in server.ts or any service file for: SCHEDULED_CRON, cron, node-cron, setInterval (in hashtag scheduling context).

The SCHEDULED_CRON enum value is stored and persisted correctly, but no server startup code queries presets with execution_trigger = 'SCHEDULED_CRON' and registers cron jobs using the stored schedule_cron expression.

**Required**: At server startup, load SCHEDULED_CRON presets and register node-cron (or equivalent) jobs.

---

### AGAP-04 [SEVERITY: MEDIUM] — No API Routes for Type A File Execution or Type D Audit Trigger

**Evidence**: misc.ts route list shows execute-scan type-guards to DATABASE_DIRECT_SCANNER only (line 226–230). No execute-file or execute-audit routes exist.

- executeFileIngestionHashtag() is exported from hashtagService but never called from any route handler
- executeAuditingGovernance() is exported but has no API endpoint — the audit sweep cannot be triggered externally

**Required**:
- POST /hashtags/:tag/execute-file (Type A: accepts { rows, executedBy }, validates columns, enriches via dictionary, triggers DAG)
- POST /hashtags/:tag/execute-audit (Type D: accepts { teamId?, executedBy }, runs sweep, returns diagnostic report)

---

### AGAP-05 [SEVERITY: MEDIUM] — derive64BitAdvisoryLockKey Uses String Interpolation

**Evidence**: hashtagService.ts line 37

```
function derive64BitAdvisoryLockKey(identifier: string): string {
  return `('x' || substr(md5('${identifier.replace(/'/g, "''")}'), 1, 16))::bit(64)::bigint`;
}
```

Used at line 394:
```
await pool.query(`SELECT pg_advisory_xact_lock(${lockKey})`);
```

The single-quote escaping prevents injection for the MD5 inner call, but the pattern deviates from the parameterized-query-first governance principle. Since pg_advisory_xact_lock requires an expression (not a $1 parameter), the safest alternative is to pre-compute the bigint in application code using Node.js crypto (md5 → 16-byte hex → BigInt) and pass it as a typed parameter.

---

### AGAP-06 [SEVERITY: MEDIUM] — testPreFlight Ignores targetDbId for External DB Routing

**Evidence**: hashtagService.ts lines 575–590

```
const countRes = await queryPg(`SELECT COUNT(*) AS total FROM ${tableIdent}`, []);
```

testPreFlight() always queries internal PostgreSQL via queryPg(). It does not apply the external DB routing logic (dbConnectionManager.executeLiveQueryOnDb) that executeDatabaseDirectScan() correctly uses. For a Type B hashtag pointing to an external DB via targetDbId, the pre-flight test will query the wrong database, showing misleading row counts and sample data.

**Required**: Apply the same targetDbId routing guard in testPreFlight() that exists in executeDatabaseDirectScan() (lines 268–282).

---

### AGAP-07 [SEVERITY: LOW-MEDIUM] — POST /hashtags Requires solutionTemplate for Zero-File Types

**Evidence**: misc.ts lines 17–28

```
if (!newTag.tag || !newTag.solutionTemplate) {
  return res.status(400).json({ error: 'Tag name and solution template are required' });
}
```

Types B (DATABASE_DIRECT_SCANNER) and D (AUDITING_GOVERNANCE) are zero-file, query-based types with no SQL remediation script. The blanket requirement for solutionTemplate forces operators to supply a meaningless placeholder or blocks creation.

**Required**: Conditional validation — solutionTemplate required only when hashtagType === 'FILE_INGESTION' or conditionalAction.onPass === 'EXECUTE_SQL'.

---

### AGAP-08 [SEVERITY: LOW] — MTTD/MTTR Metrics Are Approximations (Spec §8.2)

**Evidence**: postgresRepo.ts getTeamHashtagReport() returns avg_run_interval_hours (window function over run timestamps). TeamHashtagReportsTab displays this as "Avg SLA Duration".

This is run-frequency, not Mean Time to Detect (time from issue creation to first detection) nor Mean Time to Resolve (time from issue creation to resolution). The spec requires true MTTD and MTTR joined against issues.created_at and issues.resolved_at.

---

### AGAP-09 [SEVERITY: LOW] — Personal Dashboard Hashtag Tab Not Implemented in Frontend (Spec §8.1)

**Evidence**: getPersonalHashtagReport() exists in postgresRepo.ts (line 3022) and api.getPersonalHashtagReport() in client.ts (line 1383). Searching frontend/src for getPersonalHashtagReport finds it only in client.ts. No component renders personal hashtag metrics.

---

## SECTION 3: GAP SUMMARY TABLE

| GAP ID  | Description                                              | Severity | In Acceptance Report |
|---------|----------------------------------------------------------|----------|----------------------|
| AGAP-01 | Type D auditRows per-record taint — false-green test     | HIGH     | No                   |
| AGAP-02 | Full Execution + conditionalAction + Maker Proposal      | HIGH     | No                   |
| AGAP-03 | SCHEDULED_CRON trigger not wired to runtime scheduler    | MEDIUM   | No                   |
| AGAP-04 | No API routes for Type A execute or Type D audit trigger | MEDIUM   | No                   |
| AGAP-05 | derive64BitAdvisoryLockKey uses string interpolation     | MEDIUM   | No                   |
| AGAP-06 | testPreFlight ignores targetDbId for external DB routing | MEDIUM   | No                   |
| AGAP-07 | POST /hashtags requires solutionTemplate for zero-file   | MEDIUM   | No                   |
| AGAP-08 | MTTD/MTTR are approximations, not true metrics           | LOW      | No                   |
| AGAP-09 | Personal Dashboard hashtag tab missing in frontend       | LOW      | No                   |

---

## SECTION 4: OVERALL CERTIFICATION STATUS

Previous report declared: 100% CERTIFIED
Verified status: PARTIAL

| Component                          | Previous Claim | Evidence-Based Status                               |
|------------------------------------|----------------|-----------------------------------------------------|
| DB Migration 026                   | VERIFIED       | CONFIRMED                                           |
| Backend + Frontend Types           | VERIFIED       | CONFIRMED                                           |
| Repository Methods (9 methods)     | VERIFIED       | CONFIRMED                                           |
| Type A Executor (service)          | VERIFIED       | CONFIRMED — no API route (AGAP-04)                  |
| Type B Executor                    | VERIFIED       | CONFIRMED (external routing correct)                |
| Type C Executor                    | VERIFIED       | CONFIRMED (64-bit lock + batch insert)              |
| Type D Executor                    | VERIFIED       | PARTIAL — auditRows taint incomplete (AGAP-01)      |
| API Routes (14 routes)             | VERIFIED       | PARTIAL — missing Type A/D execute (AGAP-04)        |
| Full Execution / conditionalAction | Not claimed    | MISSING (AGAP-02)                                   |
| Scheduled Cron Runtime             | Not claimed    | SCHEMA ONLY, no runtime (AGAP-03)                   |
| Pre-Flight Test                    | VERIFIED       | PARTIAL — ignores targetDbId (AGAP-06)              |
| Frontend API Client (11 methods)   | VERIFIED       | CONFIRMED                                           |
| HashtagManager 4-Type UI           | VERIFIED       | CONFIRMED                                           |
| Pre-Flight Drawer                  | VERIFIED       | CONFIRMED                                           |
| Dry-Run + Diff Modal               | VERIFIED       | CONFIRMED                                           |
| Chat Directives (/escalate etc.)   | VERIFIED       | CONFIRMED                                           |
| Team Reports Dashboard             | VERIFIED       | PARTIAL — MTTD/MTTR approximated (AGAP-08)          |
| Personal Dashboard Reports         | Not verified   | API only, no UI component (AGAP-09)                 |
| Integration Tests                  | VERIFIED       | PARTIAL — Type D test vacuously passes (AGAP-01)    |

> **AGAP-01 and AGAP-02 are the highest-priority findings.**
> AGAP-01 is a false-green test masking a real Rule 12 governance violation.
> AGAP-02 means the conditionalAction field persisted in PostgreSQL is never evaluated — the Maker-Checker governance chain is broken for the full-execution path.
