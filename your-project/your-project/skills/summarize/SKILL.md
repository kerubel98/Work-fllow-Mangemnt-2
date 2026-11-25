---
name: summarize
description: "Creates a concise, accurate, context-preserving session handoff document at agent-handoffs/session-handoff.md for continuing work in a fresh conversation. Trigger whenever the user types /summarize or asks to summarize/handoff the session."
---

# Custom Agent Directive: /summarize

When I type `/summarize`, treat it as a request to create a session handoff for continuing the current coding task in a new agent conversation.

## Objective
Create a concise, accurate, context-preserving Markdown document that allows a fresh agent session to continue the work without re-investigating everything or asking me to repeat information.

## Instructions
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

## Required Markdown Structure

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

## Output Requirements
- Use concise Markdown.
- Prefer bullets over long paragraphs.
- Keep technical details that are necessary for continuation.
- Avoid repeating information.
- Do not invent progress, test results, file names, or decisions.
- Save the document to the specified path.
- After saving, provide a brief confirmation with the file path and a short summary of what the handoff contains.
- If the `/summarize` directive is invoked again later, update the handoff to reflect the latest state rather than blindly appending duplicate content.
