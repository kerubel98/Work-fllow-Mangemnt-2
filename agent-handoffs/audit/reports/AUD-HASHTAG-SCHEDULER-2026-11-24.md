# Audit Report: Universal Hashtag Engine & Schedulers (`AUD-HASHTAG-SCHEDULER-2026-11-24`)

## 1. Audit Metadata & Scope
- **Audit ID**: `AUD-HASHTAG-SCHEDULER-2026-11-24`
- **Audit Date**: 2026-11-24 23:04 (UTC+3)
- **Target Scope**: Universal Hashtag Engine (`hashtagService.ts`, `hashtagSchedulerService.ts`), Hashtag API Routes (`routes/misc.ts`), and Scheduled FTP Ingestion (`ftpSchedulerService.ts`)
- **Branch**: `feature/frontend-redesign`
- **Commit**: `d7bf228`
- **Governing Standards**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 4, 7, 8, 10, 17) & [`code-audit`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)
- **Audit Mode**: Remediated & Certified (`FULL SIGN-OFF` on 2026-11-26 via [`SIGN-OFF-HASHTAG-SCHEDULER-2026-11-26.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/sign-off/SIGN-OFF-HASHTAG-SCHEDULER-2026-11-26.md))

---

## 2. Executive Summary
A scoped security and reliability audit was conducted on the Universal Hashtag Engine and background schedulers.

- **Empirical Suite Baseline** (re-verified on 2026-11-26):
  - `npm run build --prefix backend` (`tsc`): **PASS (0 errors)**
  - `npm test --prefix backend -- --run` (`vitest`): **PASS (46 test files, 388 tests passed)**
  - `npm run build --prefix frontend` (`vite build`): **PASS (15.50s, 2,186 modules transformed)**
- **Findings Summary**: **All 3 findings RESOLVED & SIGNED OFF** (0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW remaining).

---

## 3. Previous Audit & Sign-Off Review
- Correlated against [`agent-handoffs/audit/master-audit.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/master-audit.md). Fully signed off under [`SIGN-OFF-HASHTAG-SCHEDULER-2026-11-26.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/sign-off/SIGN-OFF-HASHTAG-SCHEDULER-2026-11-26.md).

---

## 4. Files & Modules Examined
- [`backend/src/services/hashtagService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/hashtagService.ts)
- [`backend/src/services/hashtagSchedulerService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/hashtagSchedulerService.ts)
- [`backend/src/services/ftpSchedulerService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ftpSchedulerService.ts)
- [`backend/src/routes/misc.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/misc.ts)

---

## 5. Findings Summary Table

| Finding ID | Severity | Status | Category | Location | Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-TAG-001` | `CRITICAL` | `RESOLVED` | SQL Injection | `hashtagService.ts:340-378,457-460` | Unsanitized `preset.criteria` and `preset.solutionTemplate` executed directly as raw SQL (Resolved via `validateReadOnlySelectQuery` and `sanitizeSqlConditionPredicate`) |
| `AUD-TAG-002` | `HIGH` | `RESOLVED` | Authorization / Cron Escalation | `misc.ts:24-87` | Any authenticated user can create/edit/delete any hashtag preset, including `SCHEDULED_CRON` SQL (Resolved via role authorization gates, ownership checks, and pre-commit SQL validation) |
| `AUD-TAG-003` | `MEDIUM` | `RESOLVED` | Scheduler Routing / Cadence | `hashtagSchedulerService.ts:76`; `ftpSchedulerService.ts:49` | Hardcoded `'default-team'` in Maker proposals; FTP scheduler ignores interval/cadence checks (Resolved via dynamic team ID resolution and `isFtpScheduleDue` cadence checks) |

---

## 6. Detailed Findings

### `AUD-TAG-001` — Arbitrary SQL Injection via Unsanitized `preset.criteria` & `preset.solutionTemplate`
- **Severity**: `CRITICAL` | **Status**: `RESOLVED` | **Category**: SQL Injection
- **File & Line**: [`hashtagService.ts#L340-L378`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/hashtagService.ts#L340-L378), [`L457-L460`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/hashtagService.ts#L457-L460)
- **Resolution**:
  - Implemented `validateReadOnlySelectQuery` forbidding semicolons/stacked queries, SQL comments, mutating DML/DDL keywords, and system catalog access.
  - Sanitized WHERE criteria via `sanitizeSqlConditionPredicate(whereClause, '')`.
  - Added strict alphanumeric identifier checks for duplicate column criteria.
  - Added upfront SQL validation in `routes/misc.ts` for both `criteria` and `solutionTemplate`.

### `AUD-TAG-002` — Unscoped Hashtag Preset Mutations & `SCHEDULED_CRON` Privilege Escalation
- **Severity**: `HIGH` | **Status**: `RESOLVED` | **Category**: Authorization
- **File & Line**: [`misc.ts#L24-L87`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/misc.ts#L24-L87)
- **Resolution**:
  - Attached `requireAuth` to all hashtag mutation routes.
  - Required Administrator, Lead, or Technical privileges for configuring `SCHEDULED_CRON`, `DATABASE_DIRECT_SCANNER`, `EXTRACTION_STAGING`, or `EXECUTE_SQL`.
  - Enforced author ownership or administrative privileges on `PUT` and `DELETE /api/hashtags/:tag`.

### `AUD-TAG-003` — Hardcoded `'default-team'` & Missing FTP Schedule Cadence Check
- **Severity**: `MEDIUM` | **Status**: `RESOLVED` | **Category**: Scheduler Correctness
- **File & Line**: [`hashtagSchedulerService.ts#L76`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/hashtagSchedulerService.ts#L76), [`ftpSchedulerService.ts#L49`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ftpSchedulerService.ts#L49)
- **Resolution**:
  - Replaced hardcoded `'default-team'` in `hashtagSchedulerService` by dynamically looking up team ownership from `preset.teamId`, target database (`preset.targetDbId`), and workflow (`preset.workflowId`).
  - Implemented `isFtpScheduleDue` in `ftpSchedulerService` to evaluate frequency intervals (`EVERY_15_MIN`, `HOURLY`, `EVERY_6_HOURS`, `DAILY`, `CUSTOM_CRON`) against `lastRunAt`.
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
