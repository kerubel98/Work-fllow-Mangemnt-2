# Engineering Implementation Plan: Universal Hashtag Engine Gap Remediation
## Systematic Remediation of Architectural Gaps AGAP-01 through AGAP-09 for 100% Reality Certification

**Document ID**: `IMPLEMENTATION_PLAN_UNIVERSAL_HASHTAGS_REMEDIATION.md`  
**Governing Authority**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 1–23), [`bo-operational-governance`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md), [`.agent.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agent.md)  
**Parent Master Specification**: [`UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md)  
**Parent Index Entry**: [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md) (Domain 1)  
**Baseline Audit Source**: [`VERIFICATION_AUDIT_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/VERIFICATION_AUDIT_REPORT.md) & [`AUDIT_RESPONSE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AUDIT_RESPONSE_REPORT.md)  
**Target Outcome**: Full resolution of all 9 verified architectural gaps, eliminating false-green test loops, wiring Maker-Checker execution paths, and achieving genuine 100% Certified sign-off.

---

## 1. Executive Summary & Remediation Strategy

The physical code verification audit ([`AUDIT_RESPONSE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AUDIT_RESPONSE_REPORT.md)) revealed that while the core database schema, models, repository methods, and UI components were implemented, 9 critical execution bridges remain disconnected. 

This implementation plan defines the step-by-step engineering sequence to remediate each gap without regressions, conforming strictly to the repository's 6-phase workflow:
`Inspect` → `Analyze` → `Plan` → `Approval` → `Modify` → `Verify`.

### Gap Priority & Execution Sequence:
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          PHASED GAP REMEDIATION ROADMAP                                │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
  PHASE 1: HIGH-SEVERITY GOVERNANCE & TAINT TRACKING (AGAP-01, AGAP-02)
  • Populate tainted auditRows in Type D audits (Rule 12)
  • Eliminate vacuous test assertion loop in universalHashtagsEngine.test.ts
  • Wire conditionalAction onPass: EXECUTE_SQL to approvalService.submitProposal() (Rule 7)
  • Add "Run & Remediate (Live Scan)" button in ValidationOrchestratorWorkspace
                                           │
                                           ▼
  PHASE 2: API SURFACE, CONNECTOR ROUTING & VALIDATION (AGAP-04, AGAP-06, AGAP-07)
  • Add POST /api/hashtags/:tag/execute-file & POST /api/hashtags/:tag/execute-audit routes
  • Wire targetDbId live connector dispatch into testPreFlight() (Rule 4)
  • Relax solutionTemplate validation for zero-file types (B and D) in POST /hashtags
                                           │
                                           ▼
  PHASE 3: SECURITY, LOCKING & SCHEDULER INFRASTRUCTURE (AGAP-03, AGAP-05)
  • Refactor 64-bit advisory lock key to pre-computed BigInt with typed $1 parameter (Rule 10/11)
  • Build server-side cron scheduler daemon in hashtagSchedulerService.ts
                                           │
                                           ▼
  PHASE 4: METRICS ACCURACY & PERSONAL DASHBOARD UI (AGAP-08, AGAP-09)
  • Join hashtag_execution_runs against issues table for genuine MTTD & MTTR
  • Build Personal Hashtag Automation KPIs view in frontend
                                           │
                                           ▼
  PHASE 5: AUTOMATED REALITY GATE CERTIFICATION & SIGN-OFF
  • Execute Vitest suite ensuring non-vacuous assertions across all 4 types
  • Verify TypeScript compilation (0 errors) and Vite production bundle build
  • Update MASTER_ARCHITECTURE_INDEX.md and sign off as 100% Certified
```

---

## 2. Phase 1: High-Severity Governance & Taint Tracking

### 2.1 AGAP-01 Remediation: Type D `auditRows` Taint Enforcement
* **Target File**: `backend/src/services/hashtagService.ts` (`executeAuditingGovernance`)
* **Target Test**: `backend/src/services/__tests__/universalHashtagsEngine.test.ts`
* **Root Cause**: `executeAuditingGovernance()` returns `auditRows: []` as a hardcoded empty array. In the test, `for (const rec of auditResult.auditRows)` executes 0 times, creating a false-green test.
* **Remediation Steps**:
  1. In `executeAuditingGovernance()`, query actual SLA-breached tasks from `issues`:
     ```sql
     SELECT id, title, priority, status, linked_hashtag, created_at
     FROM issues
     WHERE status != 'Resolved' AND status != 'Closed'
       AND created_at < NOW() - INTERVAL '24 hours'
     LIMIT 50;
     ```
  2. Query unapproved or self-approved resolutions from `resolution_proposals`:
     ```sql
     SELECT id, title, type, maker_id, checker_id, status, created_at
     FROM resolution_proposals
     WHERE maker_id = checker_id OR status = 'REJECTED'
     LIMIT 50;
     ```
  3. Transform every retrieved breach row into an audit record with mandatory Rule 12 diagnostic taint:
     ```typescript
     const auditRows = [
       ...slaBreachedIssues.map(issue => ({
         entityType: 'ISSUE_SLA_BREACH',
         entityId: issue.id,
         details: { title: issue.title, priority: issue.priority, status: issue.status },
         _isDiagnosticOnly: true,
         _diagnosticTaintReason: 'TYPE_D_AUDITING_SWEEP: SLA breach detected (>24h open)'
       })),
       ...mcViolations.map(proposal => ({
         entityType: 'MAKER_CHECKER_VIOLATION',
         entityId: proposal.id,
         details: { title: proposal.title, makerId: proposal.maker_id, checkerId: proposal.checker_id },
         _isDiagnosticOnly: true,
         _diagnosticTaintReason: 'TYPE_D_AUDITING_SWEEP: Maker-Checker anti-self-approval violation'
       }))
     ];
     ```
  4. Return `auditRows` in the function result.
  5. In `universalHashtagsEngine.test.ts`, update the Type D test:
     - Seed a test issue in the database before running the sweep.
     - Add explicit non-vacuous assertion:
       ```typescript
       expect(auditResult.auditRows.length).toBeGreaterThan(0);
       ```
     - Keep the loop asserting `rec._isDiagnosticOnly === true` and `rec._diagnosticTaintReason.includes('TYPE_D_AUDITING_SWEEP')`.

---

### 2.2 AGAP-02 Remediation: Full Execution (`conditionalAction`) & Maker Proposal Staging
* **Target Files**: 
  - `backend/src/routes/misc.ts` (`POST /api/hashtags/:tag/execute-scan`)
  - `frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx`
  - `frontend/src/api/client.ts`
* **Root Cause**: `execute-scan` runs `executeDatabaseDirectScan()`, records the run, and exits without ever checking `preset.conditionalAction`. Operators have no way to execute remediations through Maker-Checker proposals.
* **Remediation Steps**:
  1. In `backend/src/routes/misc.ts`:
     - Accept `isDryRun: boolean` in request body (defaults to `true` if undefined).
     - When `isDryRun === false` (LIVE execution):
       - If `scanResult.verdict === 'PASS'` and `preset.conditionalAction?.onPass === 'EXECUTE_SQL'`:
         - Automatically stage a Maker Proposal using `approvalService.submitProposal()`:
           ```typescript
           const proposal = await approvalService.submitProposal({
             type: 'WORKSPACE_SETTING',
             settingKey: normalized,
             title: `Automated Remediation for ${normalized}`,
             justification: `Triggered by live hashtag scan on ${preset.targetTableName || 'target table'}. Scan verdict: PASS.`,
             makerId: executedBy,
             makerName: executedBy,
             teamId: teamId || 'team_core',
             proposedChanges: {
               action: 'EXECUTE_SQL',
               sql: preset.solutionTemplate || 'SELECT 1;',
               targetDbId: preset.targetDbId,
               targetTable: preset.targetTableName
             },
             evidenceSnapshot: {
               hashtagTag: normalized,
               runId,
               rowsScanned: scanResult.rowsScanned,
               anomaliesDetected: scanResult.anomaliesDetected,
               executedAt: new Date().toISOString()
             }
           });
           ```
         - Include `stagedProposalId: proposal.id` and `stagedProposalStatus: 'PENDING'` in the HTTP response.
       - If `scanResult.verdict === 'DISCREPANCY'` and `preset.conditionalAction?.onFail === 'FLAG_INVESTIGATION'`:
         - Flag task investigation state or create an alert issue linked to `normalized`.
  2. In `frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx`:
     - Add a second action button alongside `[Test DB Checks (Dry-Run)]`:
       **`[Run & Remediate (Live)]`**
     - When clicked, prompt confirmation: *"This will execute a live scan and stage a Maker-Checker proposal for technical review if checks pass. Proceed?"*
     - If confirmed, dispatch `api.executeHashtagScan(tag, { executedBy: currentUser.id, teamId, taskId, isDryRun: false })`.
     - If `res.stagedProposalId` is returned, display an approval badge/banner: *"Maker Proposal #{stagedProposalId} staged successfully. Awaiting Checker review."*

---

## 3. Phase 2: API Surface, Connector Routing & Validation

### 3.1 AGAP-04 Remediation: Expose Type A and Type D Execution Routes
* **Target Files**: `backend/src/routes/misc.ts`, `frontend/src/api/client.ts`
* **Remediation Steps**:
  1. In `backend/src/routes/misc.ts`, register `POST /api/hashtags/:tag/execute-file`:
     - Normalize tag via `normalizeHashtagParam(req.params.tag)`.
     - Fetch preset; verify `preset.hashtagType === 'FILE_INGESTION'`.
     - Extract `{ rows, executedBy, taskId, teamId }` from `req.body`.
     - Invoke `executeFileIngestionHashtag(preset, rows)`.
     - Record run in `hashtag_execution_runs`.
     - Return `{ runId, ...result }`.
  2. Register `POST /api/hashtags/:tag/execute-audit`:
     - Normalize tag; verify `preset.hashtagType === 'AUDITING_GOVERNANCE'`.
     - Extract `{ executedBy, teamId }` from `req.body`.
     - Invoke `executeAuditingGovernance(preset, teamId)`.
     - Record run in `hashtag_execution_runs`.
     - Return `{ runId, ...result }`.
  3. In `frontend/src/api/client.ts`, add methods:
     - `executeHashtagFile: (tag: string, payload: { rows: any[]; executedBy: string; taskId?: string; teamId?: string }) => client.post(...)`
     - `executeHashtagAudit: (tag: string, payload: { executedBy: string; teamId?: string }) => client.post(...)`

---

### 3.2 AGAP-06 Remediation: Live Connector Routing in `testPreFlight()`
* **Target File**: `backend/src/services/hashtagService.ts` (`testPreFlight`)
* **Remediation Steps**:
  1. In `testPreFlight()`, locate lines 575–590 where `preset.targetTableName` is queried.
  2. Replace hardcoded `queryPg()` with connector-aware dispatch matching `executeDatabaseDirectScan()`:
     ```typescript
     let executeQuery: (sql: string, params: any[]) => Promise<{ rows: any[] }> = queryPg;
     
     if (preset.targetDbId) {
       const { dbConnectionManager } = await import('./dbConnectionManager.js');
       const conn = await dbConnectionManager.getConnection(preset.targetDbId);
       if (conn) {
         executeQuery = (sql, p) => dbConnectionManager.executeLiveQueryOnDb(conn, sql, p);
       }
     }
     
     const tableIdent = `"${preset.targetTableName.replace(/"/g, '""')}"`;
     const countRes = await executeQuery(`SELECT COUNT(*) AS total FROM ${tableIdent}`, []);
     const sampleRes = await executeQuery(`SELECT * FROM ${tableIdent} LIMIT 10`, []);
     ```
  3. Verify against external PostgreSQL and MySQL connectors.

---

### 3.3 AGAP-07 Remediation: Conditional `solutionTemplate` Validation
* **Target File**: `backend/src/routes/misc.ts` (`POST /api/hashtags`)
* **Remediation Steps**:
  1. Update validation logic at lines 17–25:
     ```typescript
     if (!newTag.tag) {
       return res.status(400).json({ error: 'Hashtag name is required' });
     }
     
     // Solution template is required only for File Ingestion or when conditionalAction executes SQL
     const requiresSolution = 
       newTag.hashtagType === 'FILE_INGESTION' || 
       newTag.conditionalAction?.onPass === 'EXECUTE_SQL';
       
     if (requiresSolution && !newTag.solutionTemplate) {
       return res.status(400).json({ 
         error: 'Solution template is required for file-ingestion or automated SQL remediation presets' 
       });
     }
     ```
  2. Verify that creating a Type B scanner with an empty `solutionTemplate` succeeds.

---

## 4. Phase 3: Security, Locking & Scheduler Infrastructure

### 4.1 AGAP-05 Remediation: Parameterized 64-Bit Advisory Locking
* **Target File**: `backend/src/services/hashtagService.ts` (`derive64BitAdvisoryLockKey` & `executeExtractionStaging`)
* **Remediation Steps**:
  1. Replace string-interpolated lock derivation with typed BigInt computation using Node.js `crypto`:
     ```typescript
     import crypto from 'crypto';
     
     function derive64BitAdvisoryLockBigInt(identifier: string): string {
       const hash = crypto.createHash('md5').update(identifier).digest('hex');
       // Convert first 16 hex chars (64 bits) to signed 64-bit bigint string
       const hex64 = hash.slice(0, 16);
       let bigIntVal = BigInt('0x' + hex64);
       if (bigIntVal >= 2n ** 63n) {
         bigIntVal -= 2n ** 64n;
       }
       return bigIntVal.toString();
     }
     ```
  2. In `executeExtractionStaging()` (line 394), replace string interpolation with parameterized query:
     ```typescript
     const lockKey = derive64BitAdvisoryLockBigInt(`provision_staging_${stagingTable}`);
     await pool.query('SELECT pg_advisory_xact_lock($1::bigint)', [lockKey]);
     ```
  3. In lines 401 & 403, remove inline string interpolation of `executedBy` and `tag` from `DEFAULT` clauses in `CREATE TABLE`. Ensure column defaults use standard SQL defaults (`ingested_by VARCHAR(100) NOT NULL`), and supply values via parameterized inserts.

---

### 4.2 AGAP-03 Remediation: Server-Side Runtime Scheduler Daemon
* **Target Files**: 
  - `backend/src/services/hashtagSchedulerService.ts` (New Service)
  - `backend/src/server.ts`
* **Remediation Steps**:
  1. Create `backend/src/services/hashtagSchedulerService.ts`:
     - `initHashtagScheduler()`: Queries PostgreSQL for presets where `execution_trigger = 'SCHEDULED_CRON'` and `schedule_cron IS NOT NULL`.
     - Maintains active timers using a managed interval scheduler (checking every minute for presets matching cron expressions).
     - When a cron fires:
       - Dispatches `executeDatabaseDirectScan()` or `executeAuditingGovernance()`.
       - Records run in `hashtag_execution_runs` with `executedBy: 'SYSTEM_SCHEDULER'` and `executionMode: 'LIVE_FULL'`.
     - `reloadScheduledHashtags()`: Reloads and reschedules active timers dynamically when presets are created or modified.
  2. In `backend/src/server.ts`, invoke `initHashtagScheduler()` during server bootstrap.

---

## 5. Phase 4: Metrics Accuracy & Personal Dashboard UI

### 5.1 AGAP-08 Remediation: Genuine MTTD / MTTR Metric Calculation
* **Target Files**: 
  - `backend/src/store/postgresRepo.ts` (`getTeamHashtagReport`)
  - `frontend/src/components/team/TeamHashtagReportsTab.tsx`
* **Remediation Steps**:
  1. In `postgresRepo.ts`, rewrite `getTeamHashtagReport(teamId)` to join against `issues`:
     ```sql
     SELECT
       r.hashtag_tag,
       COUNT(*)                                                               AS total_runs,
       SUM(r.rows_scanned)                                                    AS total_rows_scanned,
       SUM(r.anomalies_detected)                                              AS total_anomalies,
       COUNT(*) FILTER (WHERE r.verdict = 'PASS')                             AS pass_count,
       COUNT(*) FILTER (WHERE r.verdict IN ('FAIL','DISCREPANCY'))             AS fail_count,
       COUNT(*) FILTER (WHERE r.verdict = 'STAGED')                           AS staged_count,
       ROUND(AVG(EXTRACT(EPOCH FROM (r.executed_at - i.created_at)) / 3600), 2) AS mttd_hours,
       ROUND(AVG(EXTRACT(EPOCH FROM (i.resolved_at - i.created_at)) / 3600) 
         FILTER (WHERE i.resolved_at IS NOT NULL), 2)                         AS mttr_hours,
       MAX(r.executed_at)                                                     AS last_run_at
     FROM hashtag_execution_runs r
     LEFT JOIN issues i ON i.linked_hashtag = r.hashtag_tag AND i.team_id = $1
     WHERE r.team_id = $1
     GROUP BY r.hashtag_tag
     ORDER BY total_runs DESC;
     ```
  2. In `TeamHashtagReportsTab.tsx`:
     - Update the KPI stats ribbon to show genuine **Mean Time to Detect (MTTD)** and **Mean Time to Resolve (MTTR)** in hours.

---

### 5.2 AGAP-09 Remediation: Personal Dashboard Hashtag Tab
* **Target Files**:
  - `frontend/src/components/team/PersonalHashtagsCard.tsx` (New Component)
  - `frontend/src/components/team/TeamWorkspace.tsx`
* **Remediation Steps**:
  1. Create `PersonalHashtagsCard.tsx`:
     - Fetches `api.getPersonalHashtagReport(currentUser.id)`.
     - Renders personal automation metrics:
       - My Executed Runs
       - Discrepancies Resolved
       - Pending Maker Proposals Authored by User
       - Success Rate (`% PASS`)
  2. Wire into the Personal workspace / user dashboard in `TeamWorkspace.tsx`.

---

## 6. Phase 5: Automated Reality Gate Certification & Sign-Off

### 6.1 Automated Test Suite Upgrades
* Update `backend/src/services/__tests__/universalHashtagsEngine.test.ts`:
  1. **Non-Vacuous Type D Assertion**: Ensure `auditResult.auditRows` has > 0 rows and each row contains `_isDiagnosticOnly: true` and `_diagnosticTaintReason`.
  2. **Live Execution Test**: Test `isDryRun: false` with `conditionalAction.onPass = 'EXECUTE_SQL'`, asserting that a proposal is created in `resolution_proposals` with `makerId !== checkerId`.
  3. **Type A & D Route Tests**: Test `POST /hashtags/:tag/execute-file` and `POST /hashtags/:tag/execute-audit`.
  4. **Connector Pre-Flight Test**: Test `testPreFlight()` with `targetDbId`.

### 6.2 Reality Gate Verification Checklist
- [ ] All 31+ test suites pass in Vitest.
- [ ] Backend TypeScript compiles with 0 errors (`npm run build`).
- [ ] Frontend TypeScript compiles with 0 errors.
- [ ] Vite production bundle builds successfully (`dist/`).
- [ ] Every API endpoint physically tested and returning valid payloads.
- [ ] Update `MASTER_ARCHITECTURE_INDEX.md` and `UNIVERSAL_HASHTAG_ARCHITECTURE_AND_SPECIFICATION.md` change logs.
- [ ] Issue formal **100% Certified Sign-Off Report**.
