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
1. Read `doc/audit/master-audit.md`, previous relevant audit reports in `doc/audit/reports/`, and sign-offs in `doc/audit/sign-off/`.
2. Inspect the requested scope and minimum dependencies against the 7 invariants.
3. Execute verification: `npm run build --workspaces --if-present`, `npm test --workspaces --if-present`, and `npm run test:e2e`.
4. Assign stable finding IDs (`AUD-<SCOPE>-###`) and severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`).
5. Create a new detailed audit report under `doc/audit/reports/`.
6. Update `doc/audit/master-audit.md` without deleting history.
7. Present scope, finding counts by severity, major risks, audit report path, master register path, and recommended next action. Do not modify application code during an audit unless explicitly requested.

---

### 4. `/sign-off` Directive
When the user types `/sign-off`, execute outstanding audit remediation, verification, and sign-off generation using `.agents/skills/code-audit/SKILL.md`:
1. Read `doc/audit/master-audit.md`, relevant audit reports, and previous sign-offs.
2. Identify pending findings and their dependencies.
3. Prepare a prioritized remediation plan and implement fixes safely.
4. Verify each fix using targeted tests (`npm test --workspaces --if-present` and `npm run test:e2e`).
5. Create a formal remediation sign-off record at `doc/audit/sign-off/SIGN-OFF-<SCOPE>-<DATE>.md`.
6. Update the original audit report with the sign-off reference.
7. Update the master register in `doc/audit/master-audit.md`.
8. Report fixes completed, verification results, remaining findings, files modified, sign-off path, and updated register path.
