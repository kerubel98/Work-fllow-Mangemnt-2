# Audit Report: Query Sandbox & Bilateral Escalations (`AUD-SANDBOX-ESCALATIONS-2026-11-24`)

## 1. Audit Metadata & Scope
- **Audit ID**: `AUD-SANDBOX-ESCALATIONS-2026-11-24`
- **Audit Date**: 2026-11-24 23:08 (UTC+3)
- **Target Scope**: Query Sandbox Execution (`routes/sandbox.ts`, `sandboxExecutionService.ts`) and Bilateral Escalation Agreements (`routes/escalations.ts`)
- **Branch**: `feature/frontend-redesign`
- **Commit**: `d7bf228`
- **Governing Standards**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 1, 7, 12, 20) & [`code-audit`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)
- **Audit Mode**: Read-only code & empirical verification audit (zero application source edits)

---

## 2. Executive Summary
A scoped audit was conducted on the Query Sandbox simulation engine and Bilateral Escalation Agreement state machine.

- **Empirical Suite Baseline** (verified at HEAD `d7bf228`):
  - `npm run build --prefix backend` (`tsc`): **PASS**
  - `npm test --prefix backend -- --run` (`vitest`): **PASS** (**39 test files, 312 tests passed**)
  - `npm run build --prefix frontend` (`vite build`): **PASS**
- **Findings Summary**: **2 findings** identified (**0 CRITICAL**, **1 HIGH**, **1 MEDIUM**, **0 LOW**).

---

## 3. Previous Audit & Sign-Off Review
- Correlated against [`agent-handoffs/audit/master-audit.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/master-audit.md). Prior 6 audits remain `OPEN`.

---

## 4. Files & Modules Examined
- [`backend/src/routes/sandbox.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/sandbox.ts)
- [`backend/src/services/sandboxExecutionService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/sandboxExecutionService.ts#L1-L80)
- [`backend/src/routes/escalations.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/escalations.ts#L1-L210)

---

## 5. Findings Summary Table

| Finding ID | Severity | Status | Category | Location | Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `AUD-SBX-001` | `HIGH` | `OPEN` | State Machine / AuthZ (`Rule 7`) | `escalations.ts:116-205` | Escalation `sign`/`accept`/`decline` skip status transition guards, JWT actor checks, and team checks |
| `AUD-SBX-002` | `MEDIUM` | `OPEN` | Persistence / Dry-Run Isolation | `sandboxExecutionService.ts:39,60-74` | Sandbox history is in-memory only; `dryRun: true` still writes `task_workflow_executions` rows |

---

## 6. Detailed Findings

### `AUD-SBX-001` — Unchecked State Transitions & Actor Spoofing in `escalations.ts`
- **Severity**: `HIGH` | **Status**: `OPEN` | **Category**: State Machine & Authorization
- **File & Line**: [`escalations.ts#L116-L205`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/escalations.ts#L116-L205)
- **Evidence**: `sign-escalating`, `accept-receiving`, and `decline-receiving` do not verify `agreement.status` before mutating state, trust `req.body.leadId` over `req.user.id`, and do not validate team membership against `escalatingTeamId` / `receivingTeamId`.
- **Recommended Remediation**: Enforce valid state transition preconditions (`AWAITING_ESCALATING_SIGNATURE` → `AWAITING_RECEIVING_ACCEPTANCE` → `ACTIVE`), derive `leadId` from `req.user.id`, and verify team membership.

### `AUD-SBX-002` — In-Memory Sandbox History & `dryRun` Persistence Leakage
- **Severity**: `MEDIUM` | **Status**: `OPEN` | **Category**: Persistence / Dry-Run Isolation
- **File & Line**: [`sandboxExecutionService.ts#L39`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/sandboxExecutionService.ts#L39), [`L60-L74`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/sandboxExecutionService.ts#L60-L74)
- **Evidence**: `sandboxRunsHistory` is stored in a volatile `Map`, while `simulateWorkflow` passes `sourceId: 'sandbox-' + Date.now()` to `executeUniversalWorkflow`, causing `executeViaNewPipeline` to persist `task_workflow_executions` records despite `dryRun: true`.
- **Recommended Remediation**: Respect `envelope.options?.dryRun` in `executeViaNewPipeline` to skip `recordTaskWorkflowExecution` / `updateTaskDatasetValidationStatus`, and persist sandbox audit logs cleanly if needed.

---

## 7. Positive Observations
- **Diagnostic Tainting (`Rule 12`)**: `sandboxExecutionService.ts:78-80` taints all simulated output records with `_isDiagnosticOnly: true`.
- **Single-Escalation Invariance**: `escalations.ts:53-62` prevents duplicate escalation agreements on the same `issueId`.

---

## 8. Recommendations & Remediation Plan
1. **P1 (High)**: Add state transition guards and JWT actor/team checks in `escalations.ts` (`AUD-SBX-001`).
2. **P2 (Medium)**: Honor `options.dryRun` in `executeViaNewPipeline` (`AUD-SBX-002`).

**Recommended Next Action**: Run `/sign-off` to remediate open findings across the master audit register.
