---
name: resume
description: "Resumes coding work from agent-handoffs/session-handoff.md. Trigger whenever the user types /resume or asks to resume the previous session."
---

# Custom Agent Directive: /resume

When I type `/resume`, resume the coding work from the most recent session handoff.

## Objective
Continue the previous coding session efficiently, preserving its progress, decisions, constraints, and next steps without wasting context on repeated investigations.

## Instructions
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

## Workflow
- Read the handoff.
- Quickly validate the current implementation state.
- Determine the next actionable task.
- Continue implementation.
- Run only relevant verification.
- Update the handoff file if meaningful progress is made.

## Response Behavior
After `/resume`, briefly state:
- What task is being resumed.
- Where the previous session stopped.
- What you will continue with.
Then work on it. Do not stop after summarizing the handoff or wait for approval unless clarification is genuinely required.

## If the Handoff Is Missing
If `agent-handoffs/session-handoff.md` does not exist:
- Do not invent a previous session.
- Ask me what work I want to continue, or check the current conversation if sufficient context is available.

## If the Handoff Is Outdated
If the handoff conflicts with the current project:
- Trust verified current code over stale descriptions of code.
- Preserve still-valid decisions and constraints.
- Update the handoff to reflect the actual state before proceeding if necessary.
