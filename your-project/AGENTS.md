# FinSync Project Agent Guidelines & Directives

## Non-Negotiable Architectural Invariants (FinSync v2 on EthSwitch)
1. **National Custody Rule:** Banks hold all funds; EthSwitch coordinates rails; FinSync never holds deposits or acts as a custodial wallet.
2. **Beneficiary Lockdown:** Money flows strictly to authorized `MerchantAccount` destinations. Cashiers are never beneficiaries.
3. **Authority of Price:** Callers send item IDs and quantities, never prices. Prices strictly resolve from inventory catalogs (`IPriceSource`).
4. **Asymmetric QR Tokens:** Signed with NIST P-256 (`secp256r1`) ECDSA private keys. Mobile apps cache public keys for instant offline verification. Single-use nonces are invalidated atomically in Redis.
5. **Cashier Separation of Interest:** Cashiers cannot own unrelated businesses; active cashiers cannot register businesses.
6. **Double-Entry Balance Constraint:** Every journal posting requires $\sum \text{Debits} = \sum \text{Credits} \neq 0$ enforced at the PostgreSQL constraint level.
7. **Pre-Consumption Escrow:** Delivery handover codes are only burned after verifying GPS proximity ($\le 100\text{m}$), recipient identity, and order status.

---

## Custom Directives

### 1. `/summarize` Directive
When the user types `/summarize`, treat it as a request to create a session handoff for continuing the current coding task in a new agent conversation.

#### Objective
Create a concise, accurate, context-preserving Markdown document that allows a fresh agent session to continue the work without re-investigating everything or asking the user to repeat information.

#### Instructions
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

#### Required Markdown Structure
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

### 2. `/resume` Directive
When the user types `/resume`, resume the coding work from the most recent session handoff.

#### Objective
Continue the previous coding session efficiently, preserving its progress, decisions, constraints, and next steps without wasting context on repeated investigations.

#### Instructions
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

#### Response Behavior
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
