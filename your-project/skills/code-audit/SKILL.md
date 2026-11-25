---
name: code-audit
description: Perform scoped code audits, review audit history and sign-offs, document evidence-based findings, maintain a master audit register, remediate pending issues, verify fixes, and generate audit sign-off records. Use when asked to audit code or continue audit remediation.
---

# Code Audit Skill

This skill is agent-independent. Follow it regardless of whether you are running in Antigravity, OpenCode, GitHub Copilot, or another coding agent.

## Audit Documentation Location

All audit artifacts must be maintained under:

`agent-handoffs/audit/`

Required structure:

- `agent-handoffs/audit/master-audit.md` — master register of all audit scopes, findings, statuses, and pending work.
- `agent-handoffs/audit/reports/` — detailed audit reports, one report per audit scope/cycle.
- `agent-handoffs/audit/sign-off/` — remediation sign-off records.

Create missing directories when necessary.

## Commands

### /audit [scope]

Initiate a new audit or reassessment of the requested scope.

#### Autonomous Context-Free Discovery (When [scope] is omitted)
When the user types `/audit` without specifying a scope, do NOT ask for clarification. Automatically deduce the scope, changed features, and governing specifications by executing these discovery steps:
1. **Inspect Plan Index & Latest Plan:**
   - Read [`agent-handoffs/plan/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/plan/INDEX.md).
   - Read the most recently updated or active plan document in `agent-handoffs/plan/` (e.g. `agent-handoffs/plan/PLAN-*.md`).
   - Extract the target services, modified methods/endpoints, and target invariants.
2. **Inspect Codebase Diffs & Recent Changes:**
   - Check `git status --porcelain` and timestamps of files under `services/` and `test/`.
   - Identify which packages have new or modified code.
3. **Inspect Audit History & Pending Issues:**
   - Read [`agent-handoffs/audit/reports/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/reports/INDEX.md) to check recently completed development scopes awaiting audit.
   - Read [`agent-handoffs/audit/master-audit.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/master-audit.md) to correlate against unresolved findings in those subsystems.
4. **Determine Scope & Applicable Invariants:**
   - Map the detected changes to the governing invariants among the 7 Non-Negotiable Invariants.
   - Set the audit scope identifier (e.g. `AUD-<SERVICE>-<DATE>` or `AUD-PLAT-<FEATURE>`).

#### Audit Execution Steps
1. Read `agent-handoffs/audit/master-audit.md`, previous audit reports, and previous sign-offs.
2. Check if pending audit tasks or unresolved blockers exist from earlier iterations.
3. Inspect the discovered/requested scope and minimum necessary dependencies against the 7 Invariants.
4. Verify previous findings against current code to detect regressions or verified fixes.
5. Identify new issues, unresolved issues, partial fixes, and boundary leakages.
6. Run the empirical verification suite:
   ```bash
   cd code/unpacked/finsync-app
   npm run build --workspaces --if-present
   npm test --workspaces --if-present
   npm run test:e2e
   ```
7. Assign stable finding IDs (`AUD-<SCOPE>-###`) and severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`).
8. Create a new detailed audit report under `agent-handoffs/audit/reports/`.
9. Update [`agent-handoffs/audit/reports/INDEX.md`](file:///c:/Users/hp/Downloads/FinSync_Project/agent-handoffs/audit/reports/INDEX.md) with the new report, scope summary, and invariant coverage.
10. Update `agent-handoffs/audit/master-audit.md` without deleting history.
11. Include a prioritized remediation roadmap and recommend running `/sign-off` for remediation.
12. Do not modify application code during an audit unless explicitly requested.

### /sign-off

Resume outstanding audit remediation.

1. Read the master audit register.
2. Read the relevant detailed audit reports.
3. Read relevant sign-off documents.
4. Identify pending findings and their dependencies.
5. Prepare a prioritized remediation plan.
6. Implement fixes safely.
7. Verify each fix using targeted tests, builds, code inspection, or other appropriate checks.
8. Create a remediation sign-off document under `agent-handoffs/audit/sign-off/`.
9. Update the original audit report with the remediation and sign-off reference.
10. Update the master audit register.
11. Preserve unresolved findings and document incomplete verification.

Do not stop at planning when implementation is requested. Proceed with safe fixes and stop only for a genuine blocker, risky operation, or required user decision.

### /audit status

Read the master register and report:

- Outstanding findings
- Severity breakdown
- Pending remediation
- Recent audits
- Sign-off history
- Regressions
- Next recommended actions

Do not conduct a new code audit.

### /audit verify

Verify existing remediation against the current code. Update statuses and audit documentation with evidence.

Do not change source code unless explicitly requested.

## Finding Statuses

Use consistent statuses:

- NEW
- OPEN
- REGRESSION
- PARTIALLY RESOLVED
- RESOLVED
- ACCEPTED RISK
- NOT REPRODUCED
- DEFERRED
- BLOCKED

Do not silently remove or renumber historical findings.

## Severity

- CRITICAL — severe compromise, data loss, or major system failure risk.
- HIGH — significant security, correctness, reliability, or business impact.
- MEDIUM — meaningful defect with limited impact or workaround.
- LOW — minor issue or low-impact risk.
- INFO — recommendation or observation, not a confirmed defect.

## Stable Finding IDs

Format:

`AUD-<SCOPE>-###`

Reuse the original ID when revisiting an existing finding. Avoid duplicate findings.

## Detailed Audit Report

Each audit report must include:

1. Audit metadata and scope
2. Executive summary
3. Previous audit and sign-off review
4. Files/modules examined
5. Findings summary table
6. Detailed findings with evidence, location, impact, and remediation
7. Positive observations
8. Recommendations separated from confirmed defects
9. Remediation plan
10. Audit conclusion
11. Verification limitations
12. References to previous audit reports and sign-offs

Each finding should include:

- Finding ID
- Severity and priority
- Status
- Category
- File and line location, when available
- Evidence
- Description
- Impact
- Conditions for occurrence
- Recommended remediation
- Verification criteria
- Related findings and previous sign-offs

## Master Audit Register

Maintain these sections in `agent-handoffs/audit/master-audit.md`:

- Overall audit status
- Audit history
- Outstanding findings
- Resolved findings
- Regression watch
- Consolidated remediation roadmap
- Sign-off history

Preserve the register and historical findings when updating it.

## Remediation Sign-Off

When /sign-off has completed remediation and verification, create:

`agent-handoffs/audit/sign-off/SIGN-OFF-<SCOPE>-<DATE>.md`

Include:

1. Sign-off metadata
2. Original audit references
3. Findings addressed
4. Implementation summary
5. Files modified
6. Verification evidence and results
7. Findings remaining
8. Residual risks
9. Conclusion: FULL SIGN-OFF, PARTIAL SIGN-OFF, or NO SIGN-OFF
10. Related documents

Never issue full sign-off for unverified fixes. A sign-off covers only the findings explicitly addressed, not the entire project.

After creating sign-off:

- Update the original audit report with the sign-off reference.
- Update finding statuses based on evidence.
- Update the master register.
- Preserve unresolved findings.
- Do not fabricate human approval or certification.

## Audit Quality Rules

- Evidence before conclusions.
- Scope the investigation to the requested area.
- Do not scan the entire repository without reason.
- Never invent bugs, evidence, file paths, test results, or approvals.
- Do not expose credentials, tokens, or secrets in reports.
- Do not modify application code during /audit unless requested.
- Verify before marking findings resolved.
- Preserve audit history.
- Avoid repetitive investigation and unnecessary tool calls.
- Follow the project's existing architecture and conventions.
- Report clearly what was and was not verified.

## Final Response

At the end of /audit, report the scope, finding counts by severity, major risks, audit report path, master register path, and recommended next action.

At the end of /sign-off, report fixes completed, verification results, remaining findings, files modified, sign-off path, and updated report/register paths.

This skill must work across coding agents. Adapt command invocation and skill-loading mechanisms to the host agent, but do not change the audit methodology or document structure.
