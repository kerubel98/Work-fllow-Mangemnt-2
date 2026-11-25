# Code & Architectural Audit Report: End-to-End Automation Process & Modernization Roadmap

**Audit ID**: `AUD-AUTOMATION-E2E-2026-11-25`  
**Date**: 2026-11-25  
**Auditor**: Antigravity Autonomous Code Audit Engine  
**Governing Skills**: [`.agents/skills/audit/SKILL.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/audit/SKILL.md), [`.agents/skills/code-audit/SKILL.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)  
**Governing Invariants & Principles**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rule 1: PostgreSQL Reality, Rule 7: Maker-Checker Dual Authorization, Rule 10: 64-Bit Cryptographic Advisory Locking, Rule 23: No `localStorage`/In-Memory Business State, Rule 24: Composite Executable Ingestion Mappings)  
**Target Scope**: End-to-End Automation Lifecycle (Frontend `AutomationsView.tsx` -> Backend Schedulers `hashtagSchedulerService.ts` & `ftpSchedulerService.ts` -> `ftpFileStagingService.ts` -> `recipeExecutionService.ts` -> `server.ts` Boot -> Downstream Workflow & Maker Proposal Triggers)  
**Branch / Commit**: `feature/frontend-redesign` (`d7bf228`)  
**Status**: `OPEN`  

---

## 1. Executive Summary

An end-to-end architectural and code audit was conducted across the **Automation Process**—tracing the full lifecycle from UI authoring and trigger scheduling through SFTP/Database polling, composite recipe replay, pipeline execution, and Maker-Checker proposal staging.

While individual components such as `recipeExecutionService` integration inside `ftpFileStagingService.ts` and `hashtagSchedulerService` Maker-Checker auto-staging are well-structured, **4 significant end-to-end defects** (**1 CRITICAL**, **2 HIGH**, **1 MEDIUM**) prevent the automation subsystem from functioning as a true autonomous, production-grade orchestrator. Most critically, `AutomationsView.tsx` relies on hardcoded mock jobs, ephemeral React state, and `setTimeout` simulations for `CRON`/`EVENT` automations, while `ftpSchedulerService` is never booted as a background daemon in `server.ts`.

| Severity | Count | Summary of Key Vulnerabilities / Risks |
| :--- | :---: | :--- |
| **CRITICAL** | 1 | `AutomationsView.tsx` uses hardcoded mock jobs, stores newly created automations solely in ephemeral React state, and simulates `CRON`/`EVENT` runs via `setTimeout(1200)`. |
| **HIGH** | 2 | `ftpSchedulerService` is never booted on a background timer in `server.ts` and does not trigger `attachedWorkflowId` after staging; `hashtagSchedulerService` ignores cron schedules (runs every 60s) and lacks distributed PostgreSQL advisory locking. |
| **MEDIUM** | 1 | `POST /api/database/ftp-staging/run-scheduled` defaults `forceAll: true` without team/admin checks; scheduled execution failures are silently swallowed via `console.warn` without SSE alerts or DLQ persistence. |
| **LOW** | 0 | None identified in this scope. |

---

## 2. Previous Audit & Correlation

This audit correlates with and extends [`AUD-HASHTAG-SCHEDULER-2026-11-24.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-HASHTAG-SCHEDULER-2026-11-24.md) (`AUD-TAG-001` raw SQL criteria execution, `AUD-TAG-002` unauthenticated preset edits, `AUD-TAG-003` hardcoded `'default-team'` and missing FTP interval checks). Rather than duplicating those IDs, this report audits the **end-to-end orchestration chain** including frontend `AutomationsView.tsx`, server daemon wiring, cross-stage workflow chaining, and architectural modernization.

---

## 3. Files & Modules Examined

- [`frontend/src/components/automations/AutomationsView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/automations/AutomationsView.tsx): Automation Hub, Cron/Schedule creator modal, manual run triggers, and Hashtag stats.
- [`backend/src/server.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/server.ts#L175-L177): Server startup and background daemon initialization.
- [`backend/src/services/hashtagSchedulerService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/hashtagSchedulerService.ts): `SCHEDULED_CRON` hashtag poller, Maker proposal staging, and run logging.
- [`backend/src/services/ftpSchedulerService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ftpSchedulerService.ts): Scheduled FTP/SFTP staging runner and Intake envelope registration.
- [`backend/src/services/ftpFileStagingService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ftpFileStagingService.ts#L1336-L1348): File discovery, UNLOGGED mirror staging, and `recipeExecutionService` replay.
- [`backend/src/routes/database.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/database.ts#L2501-L2505): Manual scheduled FTP trigger endpoint.

---

## 4. Findings Summary Table

| Finding ID | Severity | Category | Location | Summary |
| :--- | :---: | :--- | :--- | :--- |
| `AUD-AUTO-001` | **CRITICAL** | Persistence & Fake Execution | `frontend/src/components/automations/AutomationsView.tsx:58-71, 91-135, 168-211` | Ephemeral UI-only automation creation, hardcoded mock cron list, and fake `setTimeout(1200)` execution. |
| `AUD-AUTO-002` | **HIGH** | Orchestration Gap | `backend/src/server.ts:175-177`; `ftpSchedulerService.ts:31-169` | FTP/SFTP scheduler is never booted as a daemon in `server.ts`, and staging does not trigger `attachedWorkflowId`. |
| `AUD-AUTO-003` | **HIGH** | Scheduling & Concurrency | `backend/src/services/hashtagSchedulerService.ts:19, 50-52, 208-221` | Ignores cron expressions (runs every 60s) and uses in-memory `isExecuting` flag without PostgreSQL advisory locks. |
| `AUD-AUTO-004` | **MEDIUM** | Security & Observability | `backend/src/routes/database.ts:2501-2505`; `hashtagSchedulerService.ts:91-93` | `run-scheduled` defaults `forceAll: true` without auth checks; background failures lack SSE alerts or DLQ. |

---

## 5. Detailed Findings

### AUD-AUTO-001: Ephemeral UI-Only Automations & Fake `setTimeout` Execution
- **Severity**: CRITICAL
- **Status**: OPEN
- **Category**: Persistence Integrity & Reality Gate (Rules 1, 22, 23)
- **Location**: [`frontend/src/components/automations/AutomationsView.tsx#L58-L211`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/automations/AutomationsView.tsx#L58-L211)
- **Evidence**:
  - `baseAutomations` (lines 91-135) hardcodes 3 mock jobs (`auto-cbe-nightly`, `auto-telebirr-hourly`, `auto-aib-reversal-sync`).
  - `handleRunAutomation` (lines 173-175) executes `await new Promise(r => setTimeout(r, 1200))` for `CRON` and `EVENT` triggers and sets `lastRunStatus: 'SUCCESS'` without calling any backend API.
  - `handleCreateAutomation` (lines 188-211) pushes the new job solely into React state (`setAutomations(prev => [newAuto, ...prev])`), losing all created automations on page refresh.
  - `availableHashtags` (lines 66-71) and `hashtagStats` (lines 58-63) initialize with static mock data.
- **Impact**: Operators believe they are creating and running real production cron jobs, when in reality nothing is persisted or executed on the backend.
- **Recommended Remediation**: Persist automation definitions in PostgreSQL (`automation_jobs`) via REST APIs and wire `handleRunAutomation` to real backend execution endpoints.

### AUD-AUTO-002: Missing FTP Scheduler Daemon & Disconnected Downstream Workflow Execution
- **Severity**: HIGH
- **Status**: OPEN
- **Category**: End-to-End Orchestration
- **Location**: [`backend/src/server.ts#L175-L177`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/server.ts#L175-L177); [`backend/src/services/ftpSchedulerService.ts#L90-L125`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ftpSchedulerService.ts#L90-L125)
- **Evidence**:
  `server.ts:176` starts `hashtagSchedulerService.startHashtagScheduler()`, but `ftpSchedulerService.runScheduledFtpStaging()` is never scheduled on any timer. Furthermore, when `ftpSchedulerService` runs, it only stages an Intake envelope (`stagingService.stageInboundEnvelope`) and never triggers the attached validation workflow (`attachedWorkflowId`).
- **Impact**: Scheduled SFTP clearing feeds never run automatically, and staged files stall in Intake awaiting manual intervention.
- **Recommended Remediation**: Boot a unified scheduler loop in `server.ts` and automatically enqueue staged batches into `investigationOrchestratorService` when `attachedWorkflowId` is configured.

### AUD-AUTO-003: Missing Cron Expression Evaluation & Distributed Advisory Locking
- **Severity**: HIGH
- **Status**: OPEN
- **Category**: Scheduling Correctness & Concurrency (Rule 10)
- **Location**: [`backend/src/services/hashtagSchedulerService.ts#L19, L50-L52, L208-L221`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/hashtagSchedulerService.ts#L19)
- **Evidence**:
  `startHashtagScheduler` polls every `60000ms` and runs every preset with `executionTrigger === 'SCHEDULED_CRON'` unconditionally without parsing a cron expression or checking `lastRunAt`. Concurrency is guarded only by in-memory `let isExecuting = false`.
- **Impact**: Nightly or weekly jobs execute 1,440 times per day; multi-instance deployments execute duplicate scans and duplicate Maker proposals simultaneously.
- **Recommended Remediation**: Store `cron_expression` and `next_run_at` in PostgreSQL, use `SELECT ... FOR UPDATE SKIP LOCKED` or 64-bit MD5 BigInt advisory locks (Rule 10), and evaluate due windows via a deterministic cron parser.

### AUD-AUTO-004: Unconstrained `run-scheduled` Endpoint & Silent Failure Swallowing
- **Severity**: MEDIUM
- **Status**: OPEN
- **Category**: Security & Observability
- **Location**: [`backend/src/routes/database.ts#L2501-L2505`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/database.ts#L2501-L2505); [`backend/src/services/hashtagSchedulerService.ts#L91-L93`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/hashtagSchedulerService.ts#L91-L93)
- **Evidence**:
  `POST /api/database/ftp-staging/run-scheduled` defaults `forceAll` to `true` without role/team checks. Background errors are logged only via `console.warn` without emitting SSE events or notifications.
- **Recommended Remediation**: Require `requireAuth` + team/admin authorization on manual trigger routes, and broadcast SSE failure alerts to team leads.

---

## 6. Modernization Recommendations (End-to-End Architecture)

To modernize the automation engine into a resilient, enterprise-grade financial orchestrator without introducing unapproved external infrastructure (Rule 5: no Kafka/Redis required):

1. **PostgreSQL-Backed Unified Job & Execution Registry (`automation_jobs` + `automation_runs`)**:
   - Consolidate Hashtag Cron jobs, SFTP polling schedules, and Event/Webhook triggers into a single PostgreSQL schema with `cron_expression`, `timezone` (default `Africa/Addis_Ababa`), `next_run_at`, `last_run_at`, `max_retries`, and `status`.
   - Eliminate all hardcoded mock automations and `setTimeout` simulations in `AutomationsView.tsx`.
2. **Distributed Exactly-Once Polling via PostgreSQL `SKIP LOCKED` + 64-Bit Advisory Locks**:
   - Replace `setInterval` + in-memory `isExecuting` with a PostgreSQL-coordinated worker loop (`WHERE enabled = true AND next_run_at <= NOW() FOR UPDATE SKIP LOCKED`), ensuring safe horizontal scaling.
3. **True End-to-End Chained Pipeline Execution**:
   - Wire `SFTP/Email Poll -> Recipe Replay (recipeExecutionService) -> Task Creation -> DAG Pipeline (investigationOrchestratorService) -> Discrepancy Alert / Maker Proposal` as an atomic, resumable state machine.
4. **Dead-Letter Queue (DLQ) & Exponential Backoff**:
   - Add bounded retry logic (e.g., 3 attempts with exponential backoff) for transient SFTP or external DB outages, routing exhausted failures into an inspectable DLQ tab in `AutomationsView.tsx` with 1-click replay.
5. **Real-Time SSE Telemetry & Live Metrics**:
   - Broadcast `automation:started`, `automation:completed`, and `automation:failed` events via `eventService` so operators see live run durations, row counts, and failure alerts in real time.

---

## 7. Empirical Verification Results

- **Backend Type-Check (`npm run build --prefix backend`)**: Passed (`tsc` exited 0).
- **Backend Test Suite (`npm test --prefix backend -- --run`)**: **39/39 test files passing, 312/312 tests passing** (duration: 5.86s).

---

## 8. References

- [Master Audit Register](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/master-audit.md)
- [Audit Reports Index](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/INDEX.md)
- [`AUD-HASHTAG-SCHEDULER-2026-11-24.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/AUD-HASHTAG-SCHEDULER-2026-11-24.md)
