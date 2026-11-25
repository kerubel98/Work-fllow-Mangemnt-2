# Audit Report: Intake Page & Messaging Staging (`AUD-INTAKE-STAGING-2026-11-24`)

## 1. Audit Metadata & Scope
- **Audit ID**: `AUD-INTAKE-STAGING-2026-11-24`
- **Audit Date**: 2026-11-24 22:36 (UTC+3)
- **Target Scope**: Intake Page, Per-File Attachment Task Tracking, Quick Email Reply, and Triage Lifecycle (discovered via autonomous context-free discovery from recent deliverable commit `1dc1a71` and handoff [`intake-page.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/intake-page.md))
- **Branch**: `feature/frontend-redesign`
- **Commit**: `d7bf228` (deliverable code at `1dc1a71`)
- **Governing Standards**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 1, 3, 6, 17, 19, 20, 23) & [`code-audit`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)
- **Audit Mode**: Read-only code & empirical verification audit (zero application source edits)

---

## 2. Executive Summary
A scoped audit of the recently implemented Intake Page & Messaging Staging deliverables (`1dc1a71`) was conducted across PostgreSQL migration `048`, `stagingService.ts`, `messages.ts`, and `IntakeView.tsx`.

- **Empirical Suite Baseline** (verified against current HEAD `d7bf228`):
  - `npm run build --prefix backend` (`tsc`): **PASS**
  - `npm test --prefix backend -- --run` (`vitest`): **PASS** (**39 test files, 312 tests passed**)
  - `npm run build --prefix frontend` (`vite build`): **PASS**
- **Findings Summary**: **5 findings** identified (**0 CRITICAL**, **2 HIGH**, **2 MEDIUM**, **1 LOW**).

---

## 3. Previous Audit & Sign-Off Review
- Correlated against [`agent-handoffs/audit/master-audit.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/master-audit.md). Prior audit `AUD-INVESTIGATION-CORE-2026-11-24` covered the Investigation Core; this audit covers the un-audited Intake & Messaging Staging scope (`1dc1a71`).

---

## 4. Files & Modules Examined
- [`backend/src/database/migrations/048_staged_attachment_task_tracking_and_intake_lifecycle.sql`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrations/048_staged_attachment_task_tracking_and_intake_lifecycle.sql)
- [`backend/src/models/messageTypes.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/models/messageTypes.ts)
- [`backend/src/routes/messages.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/messages.ts#L993-L1115)
- [`backend/src/services/messaging/stagingService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/messaging/stagingService.ts#L162-L215) & [`L487-L964`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/messaging/stagingService.ts#L487-L964)
- [`frontend/src/components/intake/IntakeView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/intake/IntakeView.tsx#L523-L1007)
- [`frontend/src/App.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx#L1480-L1488)

---

## 5. Findings Summary Table

| Finding ID | Severity | Status | Category | Location | Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-INT-001` | `HIGH` | `OPEN` | Error Handling / State Integrity | `IntakeView.tsx:914-1007` | API failures in reply/close/archive/reopen silently show success or mutate local UI state |
| `AUD-INT-002` | `HIGH` | `OPEN` | Validation / 404 Handling | `stagingService.ts:846,868,888,910`; `messages.ts:1015-1102` | Missing 404 checks, non-null `!` assertions, and missing `attachmentId \|\| filename` guard |
| `AUD-INT-003` | `MEDIUM` | `OPEN` | Identity / Authorization | `messages.ts:994-1073` | Client-supplied `actorId`/`actorName` trusted over `req.user`; no team check on staged actions |
| `AUD-INT-004` | `MEDIUM` | `OPEN` | Query Correctness / Performance | `stagingService.ts:204-210,489-499` | Summary counts exclude `CLOSED`/`ARCHIVED` from SLA exclusion; N+1 attachment queries |
| `AUD-INT-005` | `LOW` | `OPEN` | Persistence / Mock Fallback | `IntakeView.tsx:523,705` | Empty PostgreSQL staged queue falls back to hardcoded `DEFAULT_INTAKE_ITEMS` |

---

## 6. Detailed Findings

### `AUD-INT-001` — Silent Failure Masking & False UI Success in `IntakeView.tsx`
- **Severity**: `HIGH` | **Status**: `OPEN` | **Category**: Error Handling / State Integrity (`AGENTS.md` Rules 1 & 23)
- **File & Line**: [`IntakeView.tsx#L914-L1007`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/intake/IntakeView.tsx#L914-L1007)
- **Evidence**:
  - `handleSendReply` (`L928-L931`): Inside `catch`, sets `setReplySuccessMsg('Reply dispatched and recorded in outgoing log.')` even when `api.replyToStagedMessage` throws.
  - `handleCloseRequest` (`L951-L956`), `handleArchiveRequest` (`L975-L980`), `handleReopenRequest` (`L999-L1004`): Inside `catch`, mutate `stagedMessages` and `selectedStaged` to `CLOSED` / `ARCHIVED` / `NEW` despite backend failure.
- **Impact**: Operators receive false confirmation that an email was sent or a request was closed/archived when PostgreSQL was not updated.
- **Recommended Remediation**: Surface `setErrorMsg(...)` in `catch` blocks and refrain from mutating persistent triage state or showing success banners when the backend request fails.

### `AUD-INT-002` — Missing 404 / Input Guards in Staging Endpoints & Service
- **Severity**: `HIGH` | **Status**: `OPEN` | **Category**: Validation / Reliability
- **File & Line**: [`stagingService.ts#L846`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/messaging/stagingService.ts#L846), [`messages.ts#L1015-L1102`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/messages.ts#L1015-L1102)
- **Evidence**:
  - `POST /staging/:id/link-attachment-task` (`messages.ts:1018-1022`) checks `if (!issueId)` but does not check `if (!attachmentId && !filename)`. Passing neither executes `WHERE staged_message_id = $2 AND (id = NULL OR filename = NULL)` (0 attachment rows updated) while still marking the parent message `CONVERTED_TO_TASK`.
  - `linkAttachmentTask`, `closeStagedMessage`, `archiveStagedMessage`, and `reopenStagedMessage` return `(await this.getStagedMessageById(id))!`, returning `null` (or throwing downstream) for unknown IDs instead of a 404.
  - `POST /staging/:id/reply` (`messages.ts:1083-1085`) proceeds with `teamId = ''` if `stagedMsg` is `null`.
- **Recommended Remediation**: Require `attachmentId || filename` (400 if absent) and return HTTP 404 when the staged message ID does not exist.

### `AUD-INT-003` — Client-Supplied Actor Identity & Missing Team Scope Check on Staging Actions
- **Severity**: `MEDIUM` | **Status**: `OPEN` | **Category**: Identity / Authorization
- **File & Line**: [`messages.ts#L994-L1073`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/messages.ts#L994-L1073)
- **Evidence**: `escalate`, `close`, `archive`, and `reopen` routes take `actorId` and `actorName` from `req.body` (falling back to `'sys'`/`'Operator'`) instead of `(req as any).user?.id`, and do not verify team membership when `stagedMsg.teamId` is populated.
- **Recommended Remediation**: Derive actor identity from `req.user` and enforce team membership for team-scoped staged messages.

### `AUD-INT-004` — Summary SLA Exclusion & Team Filter Mismatch + N+1 Attachment Queries
- **Severity**: `MEDIUM` | **Status**: `OPEN` | **Category**: Query Correctness / Performance
- **File & Line**: [`stagingService.ts#L174-L212`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/messaging/stagingService.ts#L174-L212), [`L487-L502`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/messaging/stagingService.ts#L487-L502)
- **Evidence**:
  - `getExternalRequestSummary` (`L489`) filters `WHERE team_id = $1` (excluding `team_id IS NULL` shown in `getStagedMessages`), and `sla_breached` (`L499`) uses `status NOT IN ('CONVERTED_TO_TASK', 'REJECTED')`, omitting `'CLOSED'` and `'ARCHIVED'`.
  - `getStagedMessages` (`L204-L210`) runs an N+1 query per staged message to load `staged_message_attachments`.
- **Recommended Remediation**: Exclude `'CLOSED'` and `'ARCHIVED'` from `sla_breached`, align team filter semantics, and batch-load attachments via `WHERE staged_message_id = ANY($1)`.

### `AUD-INT-005` — Mock `DEFAULT_INTAKE_ITEMS` Shown When DB Queue Is Empty
- **Severity**: `LOW` | **Status**: `OPEN` | **Category**: Persistence (`AGENTS.md` Rule 1)
- **File & Line**: [`IntakeView.tsx#L523`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/intake/IntakeView.tsx#L523), [`L705`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/intake/IntakeView.tsx#L705)
- **Evidence**: `stagedMessages` initializes to `DEFAULT_INTAKE_ITEMS` and `if (Array.isArray(staged) && staged.length > 0)` skips updating state when PostgreSQL returns `[]`.
- **Recommended Remediation**: Initialize `stagedMessages` to `[]` and always apply `setStagedMessages(staged)` when the API succeeds.

---

## 7. Positive Observations
- **Relational Foreign-Key Integrity**: Migration `048` defines `created_issue_id VARCHAR(64) REFERENCES issues(id) ON DELETE SET NULL` with supporting indexes on `created_issue_id`, `closed_at`, and `archived_at`.
- **Route Protection & ErrorBoundary**: `/api/messages` and `/api/external-requests` are mounted behind `requireAuth` (`server.ts:102-103`), and `IntakeView` is wrapped in `<ErrorBoundary>` (`App.tsx:1481`).
- **Per-File Task Granularity**: Multi-file requests track `created_issue_id` per attachment row cleanly, preserving partial conversion workflows.

---

## 8. Recommendations & Remediation Plan
1. **P1 (High)**: Fix silent `catch` success/state mutations in `IntakeView.tsx` (`AUD-INT-001`) and add 400/404 guards in `messages.ts` & `stagingService.ts` (`AUD-INT-002`).
2. **P2 (Medium/Low)**: Derive actor identity from `req.user` (`AUD-INT-003`), fix `sla_breached` exclusion & N+1 attachment loading (`AUD-INT-004`), and remove `DEFAULT_INTAKE_ITEMS` fallback (`AUD-INT-005`).

**Recommended Next Action**: Run `/sign-off` to remediate open findings across both `AUD-INVESTIGATION-CORE-2026-11-24` and `AUD-INTAKE-STAGING-2026-11-24`.
