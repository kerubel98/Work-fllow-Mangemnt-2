# Session Handoff: Intake Page, Task Tracking & Triage Lifecycle

- **Session Date**: 2026-11-22 19:28 (UTC+3)
- **Branch**: `feature/frontend-redesign`
- **Git Commit**: `1dc1a71` (`1dc1a71ff884088bd0f6cb813c97a7b271f7882e`)
- **Commit Message**: `feat(intake): implement permanent per-file task tracking, quick email replies, and triage lifecycle`

---

## 1. Current Task
Design, implement, and verify the end-to-end architecture for the **Intake Page**:
1. **Query Sandbox Sidenav Relocation**: Move Query Sandbox from Rules to the main Sidenav under the WORK group.
2. **Created Tasks Tab**: Create a dedicated "Created Tasks" tab in the Intake view displaying all created issues/tasks with an `Open case ↗` action, positioned as the first tab in the tab list.
3. **Dynamic Header Metric Cards**: Dynamically synchronize the 4 top metric cards (`Total Inbound`, `Pending triage`, `Ready for task`, `Converted`, or `Total Created Tasks`, `Open & Investigating`, `Resolved Cases`, `High & Critical Priority`) according to the active Intake tab.
4. **Requests Table Cleanup**: Remove the AI Confidence column and restrict row actions to a single, clean **Review** button.
5. **Per-File Task Linkage & Tracking**: Move the "Create task" action into the Review drawer under attached files. If a task has already been created for an attached file, permanently display **`Open case ↗`** with its **`Case #ISS-...`** badge in PostgreSQL; otherwise display **`Create Task`**.
6. **Quick Email Reply & Triage Lifecycle**: Provide an interactive response composer with quick-reply templates directly in the Review drawer (replacing reliance on raw JSON payload) and operational triage controls (**Close**, **Archive**, **Reopen**) backed by PostgreSQL.

---

## 2. Progress

### Completed Work
- **Database Schema & Migrations**:
  - Created and executed migration [`backend/src/database/migrations/048_staged_attachment_task_tracking_and_intake_lifecycle.sql`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrations/048_staged_attachment_task_tracking_and_intake_lifecycle.sql):
    - Added `created_issue_id VARCHAR(64) REFERENCES issues(id) ON DELETE SET NULL` and `task_created_at TIMESTAMPTZ` to `staged_message_attachments`.
    - Added `closed_at TIMESTAMPTZ`, `close_reason TEXT`, and `archived_at TIMESTAMPTZ` to `staged_messages`.
- **Backend Services & API Endpoints**:
  - In [`backend/src/models/messageTypes.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/models/messageTypes.ts): Extended `StagedMessageStatus` with `'CLOSED' | 'ARCHIVED'` and typed per-attachment task linkage.
  - In [`backend/src/services/messaging/stagingService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/messaging/stagingService.ts):
    - Implemented `linkAttachmentTask(stagedMessageId, attachmentIdOrFilename, issueId)`.
    - Implemented `closeStagedMessage(id, actor, reason)`, `archiveStagedMessage(id, actor)`, and `reopenStagedMessage(id, actor)`.
    - Updated `getStagedMessages` query to include unassigned requests `(team_id = $1 OR team_id IS NULL)`.
    - Mapped `createdIssueId` and `taskCreatedAt` in `mapStagedRow`.
  - In [`backend/src/routes/messages.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/messages.ts):
    - Added `POST /api/messages/staging/:id/close`, `/archive`, `/reopen`, `/reply`.
    - Enhanced `PUT /api/messages/:messageId/link-issue` to accept `{ issueId, attachmentId, filename }` and automatically link attachments in `staged_message_attachments`.
- **Frontend State & Components**:
  - In [`frontend/src/api/client.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/api/client.ts): Added API client methods `closeStagedMessage`, `archiveStagedMessage`, `reopenStagedMessage`, `replyToStagedMessage`, and updated `linkMessageToIssue`.
  - In [`frontend/src/App.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx): Sidenav updated to position Query Sandbox under WORK group; `handleCreateIssue` forwards attachment identifiers to `api.linkMessageToIssue`.
  - In [`frontend/src/components/issue/WorkspaceTaskCreator.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/issue/WorkspaceTaskCreator.tsx): Preserved `attachmentId` and `uploadedFileName` during task ingestion submission.
  - In [`frontend/src/components/intake/IntakeView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/intake/IntakeView.tsx):
    - Created Tasks tab positioned first with count badge and search/filter controls.
    - Dynamic header cards adapt to the selected tab (`created_tasks`, `requests`, `ftp_feeds`, `providers`, `webhooks`, `simulator`).
    - Requests table cleaned: removed AI Confidence column; only **Review** action button per row.
    - Review drawer displays Triage Bar (**Close**, **Archive**, **Reopen**).
    - Per-attachment action checks `att.createdIssueId || att.created_issue_id`: renders `Case #...` and **`Open case ↗`** if linked; renders **`Create Task`** if unlinked.
    - Quick Reply panel with sender banner, 3 pre-configured template chips, textarea, and **`Send Reply`** dispatch action.
    - Collapsible raw ingested JSON payload.
- **Verification & Build**:
  - Full production build (`npm run build --prefix frontend`) passed in 28.01s with zero errors.
  - Live interactive verification completed via Puppeteer: tested quick reply dispatch, close/archive/reopen lifecycle, task creation from attachment, button conversion to `Open case ↗`, and deep-linking into Investigation workspace.

---

## 3. Important Technical Decisions
- **Granular Attachment-Level Tracking (`staged_message_attachments`)**:
  - In multi-file requests (e.g. SINQEE with clearing feed and reversal exceptions), tracking `created_issue_id` on each individual attachment allows partial conversion: operators can create a case for the clearing feed while keeping the reversal feed actionable.
- **Strict Separation of Triage Status vs Case Lifecycle**:
  - In accordance with `AGENTS.md` Rule 3, staged message lifecycle (`NEW`, `READY_FOR_TASK_CREATION`, `CONVERTED_TO_TASK`, `CLOSED`, `ARCHIVED`) is kept completely distinct from `issues.status` (`Open`, `In Progress`, `Resolved`, `Closed`).
- **PostgreSQL-First Telemetry (`Rule 1 & Rule 23`)**:
  - Staged requests and attachments are queried directly from PostgreSQL (`staged_messages`, `staged_message_attachments`). Browser `localStorage` is never used as the system of record.
- **Unassigned Request Visibility**:
  - Team intake queries use `(team_id = $1 OR team_id IS NULL)` so unrouted incoming bank feeds are immediately accessible to operations teams for triage.

---

## 4. Files Involved & Git State

### Modified & Committed Files (Commit `1dc1a71`)
- [`backend/src/models/messageTypes.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/models/messageTypes.ts): Extended status types and attachment tracking interfaces.
- [`backend/src/routes/messages.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/messages.ts): Added triage and reply endpoints; updated `link-issue` route.
- [`backend/src/services/messaging/stagingService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/messaging/stagingService.ts): Added database update queries for per-attachment task linkage and lifecycle.
- [`backend/src/database/migrations/048_staged_attachment_task_tracking_and_intake_lifecycle.sql`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrations/048_staged_attachment_task_tracking_and_intake_lifecycle.sql): Relational migration adding task and closure columns.
- [`frontend/src/types.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/types.ts): Added `createdIssueId`, `taskCreatedAt`, `attachmentId`, `uploadedFileName` to frontend types.
- [`frontend/src/api/client.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/api/client.ts): Added frontend API methods for triage lifecycle and per-attachment task linking.
- [`frontend/src/App.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/App.tsx): Reordered sidenav navigation; wired task creation attachment forwarding.
- [`frontend/src/components/issue/WorkspaceTaskCreator.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/issue/WorkspaceTaskCreator.tsx): Preserved attachment linkage during submission.
- [`frontend/src/components/intake/IntakeView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/intake/IntakeView.tsx): Intake UI tabs, dynamic cards, Requests table, Review drawer triage bar, quick reply, and per-attachment button logic.

### Working Tree State
- Git working tree is completely clean (`nothing to commit, working tree clean`).
- Branch is ahead of `origin/feature/frontend-redesign` by 13 commits (no remote push executed).

---

## 5. Current State
- **Created Tasks Tab**: Accessible at the top of Intake, showing all 1,151+ cases with quick search, priority pills, and 1-click **Open case** navigation.
- **Requests Tab**: Displays all inbound email and channel feeds from PostgreSQL. Clicking **Review** opens the slide-over drawer.
- **Review Drawer**:
  - Header displays current triage state with **Close** and **Archive** (or **Reopen**) buttons.
  - Attached files display their individual conversion state: converted files show **`Open case ↗`**; unconverted files show **`Create Task`**.
  - **Respond to Request**: Provides instant email drafting with pre-set operational templates and direct send action.
  - **Raw Payload**: Tucked in an accordion at the bottom.
- **Database**: PostgreSQL `operational_workflow_db` contains migration `048`, and active records reflect `created_issue_id` linkage and triage timestamps.

---

## 6. Issues and Blockers
- **None identified**. All core user requests are implemented, verified in the live browser, and passing full TypeScript and Vite production builds.

---

## 7. Next Steps
1. **Outbound Email Audit Trail in Message Center**: Connect outgoing replies dispatched from the Review drawer into the Team Messages thread view so the entire counterparty dialogue is unified.
2. **Batch Attachment Task Creation**: For requests containing 5+ files, consider a "Create Tasks for All Unlinked Files" bulk action in the Review drawer.
3. **Automated SLA Countdown in Intake**: Add a countdown timer badge for requests approaching their SLA due date.

---

## 8. Verification & Test Evidence
- **Frontend Build**: `npm run build --prefix frontend` exited with code 0 (`✓ built in 28.01s`).
- **Live Puppeteer Verifications**:
  1. Requests tab displays clean table with only **Review** action: [intake_requests_tab_verified.png](file:///C:/Users/hp/.gemini/antigravity/brain/205bd514-2921-4877-9f35-c59b31f714d7/intake_requests_tab_verified.png).
  2. Review drawer shows quick reply composer and triage bar: [review_drawer_quick_reply_and_triage.png](file:///C:/Users/hp/.gemini/antigravity/brain/205bd514-2921-4877-9f35-c59b31f714d7/review_drawer_quick_reply_and_triage.png).
  3. Per-file task linkage displays **`Open case ↗`** for created task and **`Create Task`** for pending file: [review_drawer_open_case_per_file_verified.png](file:///C:/Users/hp/.gemini/antigravity/brain/205bd514-2921-4877-9f35-c59b31f714d7/review_drawer_open_case_per_file_verified.png).
  4. 1-click deep link opens case in Investigation workspace: [open_case_from_intake_drawer_verified.png](file:///C:/Users/hp/.gemini/antigravity/brain/205bd514-2921-4877-9f35-c59b31f714d7/open_case_from_intake_drawer_verified.png).

---

## 9. Continuation Instructions
- When resuming work via `/resume intake-page` (or `/resume`):
  1. Inspect this document and verify Git commit `1dc1a71`.
  2. Both backend (`localhost:5002`) and frontend (`localhost:3000`) dev servers are running.
  3. Staged requests and attachments reside in PostgreSQL `operational_workflow_db` under `staged_messages` and `staged_message_attachments`.
  4. If extending the Intake view, modify [`frontend/src/components/intake/IntakeView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/intake/IntakeView.tsx) and maintain cross-layer consistency across `models/messageTypes.ts`, `routes/messages.ts`, and `client.ts`.
