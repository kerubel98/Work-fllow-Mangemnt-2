# Audit Report: Universal Hashtag Engine & Schedulers (`AUD-HASHTAG-SCHEDULER-2026-11-24`)

## 1. Audit Metadata & Scope
- **Audit ID**: `AUD-HASHTAG-SCHEDULER-2026-11-24`
- **Audit Date**: 2026-11-24 23:04 (UTC+3)
- **Target Scope**: Universal Hashtag Engine (`hashtagService.ts`, `hashtagSchedulerService.ts`), Hashtag API Routes (`routes/misc.ts`), and Scheduled FTP Ingestion (`ftpSchedulerService.ts`)
- **Branch**: `feature/frontend-redesign`
- **Commit**: `d7bf228`
- **Governing Standards**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 4, 7, 8, 10, 17) & [`code-audit`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)
- **Audit Mode**: Read-only code & empirical verification audit (zero application source edits)

---

## 2. Executive Summary
A scoped security and reliability audit was conducted on the Universal Hashtag Engine and background schedulers.

- **Empirical Suite Baseline** (verified at HEAD `d7bf228`):
  - `npm run build --prefix backend` (`tsc`): **PASS**
  - `npm test --prefix backend -- --run` (`vitest`): **PASS** (**39 test files, 312 tests passed**)
  - `npm run build --prefix frontend` (`vite build`): **PASS**
- **Findings Summary**: **3 findings** identified (**1 CRITICAL**, **1 HIGH**, **1 MEDIUM**, **0 LOW**).

---

## 3. Previous Audit & Sign-Off Review
- Correlated against [`agent-handoffs/audit/master-audit.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/master-audit.md). Prior 5 audits remain `OPEN`.

---

## 4. Files & Modules Examined
- [`backend/src/services/hashtagService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/hashtagService.ts#L305-L470)
- [`backend/src/services/hashtagSchedulerService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/hashtagSchedulerService.ts#L1-L120)
- [`backend/src/services/ftpSchedulerService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ftpSchedulerService.ts#L1-L120)
- [`backend/src/routes/misc.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/misc.ts#L14-L168)

---

## 5. Findings Summary Table

| Finding ID | Severity | Status | Category | Location | Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-TAG-001` | `CRITICAL` | `OPEN` | SQL Injection | `hashtagService.ts:340-378,457-460` | Unsanitized `preset.criteria` and `preset.solutionTemplate` executed directly as raw SQL |
| `AUD-TAG-002` | `HIGH` | `OPEN` | Authorization / Cron Escalation | `misc.ts:24-87` | Any authenticated user can create/edit/delete any hashtag preset, including `SCHEDULED_CRON` SQL |
| `AUD-TAG-003` | `MEDIUM` | `OPEN` | Scheduler Routing / Cadence | `hashtagSchedulerService.ts:76`; `ftpSchedulerService.ts:49` | Hardcoded `'default-team'` in Maker proposals; FTP scheduler ignores interval/cadence checks |

---

## 6. Detailed Findings

### `AUD-TAG-001` — Arbitrary SQL Injection via Unsanitized `preset.criteria` & `preset.solutionTemplate`
- **Severity**: `CRITICAL` | **Status**: `OPEN` | **Category**: SQL Injection
- **File & Line**: [`hashtagService.ts#L340-L378`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/hashtagService.ts#L340-L378), [`L457-L460`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/hashtagService.ts#L457-L460)
- **Evidence**:
  - `executeDatabaseDirectScan` executes `${rawSql} LIMIT ${limit}` (`L344`) whenever `preset.criteria` starts with `SELECT`, and `SELECT * FROM ${tableIdent} WHERE (${whereClause}) LIMIT ${limit}` (`L372`) otherwise, without calling `sanitizeSqlConditionPredicate` or blocking `;`, comments, DDL/DML, or system tables.
  - `executeExtractionStaging` (`L457-460`) executes `preset.solutionTemplate` directly via `client.query(extractSql, [])` whenever it starts with `SELECT`.
- **Recommended Remediation**: Validate all `WHERE` predicates with `sanitizeSqlConditionPredicate`, prohibit stacked statements (`;`), comments, and DML/DDL in `SELECT` templates, and require explicit table allow-listing.

### `AUD-TAG-002` — Unscoped Hashtag Preset Mutations & `SCHEDULED_CRON` Privilege Escalation
- **Severity**: `HIGH` | **Status**: `OPEN` | **Category**: Authorization
- **File & Line**: [`misc.ts#L24-L87`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/misc.ts#L24-L87)
- **Evidence**: `POST /api/hashtags`, `PUT /api/hashtags/:tag`, and `DELETE /api/hashtags/:tag` perform no role (`admin`/`lead`) or team ownership checks. Combined with `AUD-TAG-001`, any authenticated user can inject SQL into a `SCHEDULED_CRON` hashtag executed by `SYSTEM_SCHEDULER`.
- **Recommended Remediation**: Require `admin`/`lead` role or team ownership for creating/modifying `DATABASE_DIRECT_SCANNER`, `EXTRACTION_STAGING`, or `SCHEDULED_CRON` presets.

### `AUD-TAG-003` — Hardcoded `'default-team'` & Missing FTP Schedule Cadence Check
- **Severity**: `MEDIUM` | **Status**: `OPEN` | **Category**: Scheduler Correctness
- **File & Line**: [`hashtagSchedulerService.ts#L76`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/hashtagSchedulerService.ts#L76), [`ftpSchedulerService.ts#L49`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ftpSchedulerService.ts#L49)
- **Evidence**: `hashtagSchedulerService` hardcodes `teamId: 'default-team'` when auto-staging Maker proposals; `ftpSchedulerService` checks `scheduleConfig.enabled === true` without evaluating `lastRunAt` against the configured schedule interval.
- **Recommended Remediation**: Resolve `teamId` from the hashtag preset/target DB; enforce interval eligibility in `ftpSchedulerService` when `forceAll` is false.

---

## 7. Positive Observations
- **64-Bit Advisory Locking (`Rule 10`)**: `hashtagService.ts:434,440` derives 64-bit `bigint` advisory locks (`derive64BitAdvisoryLockBigInt`) for concurrent Type C staging table provisioning.
- **Rule 7 Auto-Staging**: `hashtagSchedulerService.ts:64-90` routes `EXECUTE_SQL` conditional actions through `approvalService.submitProposal` rather than executing mutating SQL directly.

---

## 8. Recommendations & Remediation Plan
1. **P0 (Critical)**: Sanitize and restrict SQL predicates/templates in `hashtagService.ts` (`AUD-TAG-001`).
2. **P1 (High)**: Gate Type B/C/cron hashtag mutations in `misc.ts` (`AUD-TAG-002`).
3. **P2 (Medium)**: Resolve dynamic `teamId` and cadence checks in schedulers (`AUD-TAG-003`).

**Recommended Next Action**: Run `/sign-off` to remediate open findings across the master audit register.
