# Implementation Plan: Streamlined Operational Asset Sharing, Verification & Task Escalation

> **Target Paradigm**: Investigation-First Operational Sharing  
> **Core Principle**: Replace bureaucratic approval queues with native, visual asset sharing (Workflows, Validation Boxes, DB Configs, Hashtags), hands-on Checker testing, peer-to-peer direct chat handoffs, and full technical autonomy during task escalation.

---

## 1. Executive Summary & Problem Realignment

The previous governance implementation focused heavily on financial dual-authorization and multi-layered approval queues. However, the core daily reality of the platform is **accelerating transaction investigations**. 

Operators need to:
1. Author **Validation Boxes**, **DAG Workflows**, and **DB Configs** in their own personal scope without friction.
2. Share them visually (never as raw JSON) with peers via **Direct Chat** or with their **Team** via the **Team Resource Center**.
3. Allow peers to immediately **"Add to My Workspace"** for personal testing without any approval roadblocks.
4. Have the team **Checker test the asset hands-on against real data** before granting an official **Approved & Locked** status.
5. Empower technical handlers during **Task Escalation** to test, swap, remove, or demand revisions on any workflow attached to an issue.

---

## 2. Core Operational Entities & Scoping Model

All operational assets share a unified scoping and lifecycle model:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        OPERATIONAL ASSET TYPES                         │
│  1. Validation Boxes  2. Workflow DAGs  3. DB Table Mappings  4. #Tags │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
 ┌───────────────────────────────────────────────────────────────────────┐
 │ SCOPE: PERSONAL (Default)                                             │
 │ • Owner: maker_id                                                     │
 │ • Fully editable by author in their personal studio/catalog           │
 └─────────────────┬───────────────────────────────────┬─────────────────┘
                   │                                   │
         Direct 1-on-1 Chat / Peer                     │ Share to Team
                   │                                   │
                   ▼                                   ▼
 ┌───────────────────────────────────────┐ ┌─────────────────────────────┐
 │ PEER-TO-PEER SHARING                  │ │ TEAM STAGING                │
 │ • Visual card sent in Direct Chat     │ │ • Staged in Resource Center │
 │ • 1-Click: "Add to My Workspace"      │ │ • Status: PENDING_TEST      │
 │ • Cloned as recipient's personal copy │ │ • Team members can clone it │
 │ • ZERO approval friction              │ └──────────────┬──────────────┘
 └───────────────────────────────────────┘                │
                                                          │ Hands-on Testing
                                                          ▼
                                           ┌─────────────────────────────┐
                                           │ CHECKER APPROVAL & LOCK     │
                                           │ • Checker tests with data   │
                                           │ • Approved = LOCKED         │
                                           │ • ONLY approving Checker    │
                                           │   can modify/unlock         │
                                           └──────────────┬──────────────┘
                                                          │
                                                          ▼
                                           ┌─────────────────────────────┐
                                           │ TASK EXECUTION & ESCALATION │
                                           │ • Used on live tasks        │
                                           │ • Unapproved shows warning  │
                                           │ • Tech Handler has full     │
                                           │   autonomy (swap/remove)    │
                                           └─────────────────────────────┘
```

---

## 3. Detailed Architecture & Phase Breakdown

### Phase 1: Database Schema Consolidation (Migration 019)
**File**: `backend/src/database/migrations/019_asset_sharing_and_lock_governance.sql`

1. **Scoping & Ownership Columns** on `validation_boxes`, `database_validation_workflows`, and `database_table_mappings`:
   ```sql
   -- Ensure consistent ownership & locking columns across all 3 asset tables
   ALTER TABLE validation_boxes 
     ADD COLUMN IF NOT EXISTS maker_id VARCHAR(64),
     ADD COLUMN IF NOT EXISTS maker_name VARCHAR(255),
     ADD COLUMN IF NOT EXISTS team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
     ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- 'DRAFT', 'PENDING_CHECKER_TEST', 'APPROVED', 'DECLINED'
     ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
     ADD COLUMN IF NOT EXISTS approved_by_user_id VARCHAR(64),
     ADD COLUMN IF NOT EXISTS approved_by_user_name VARCHAR(255),
     ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
     ADD COLUMN IF NOT EXISTS checker_feedback TEXT,
     ADD COLUMN IF NOT EXISTS shared_source_id VARCHAR(64); -- Pointer if forked/cloned from another asset

   ALTER TABLE database_validation_workflows 
     ADD COLUMN IF NOT EXISTS maker_id VARCHAR(64),
     ADD COLUMN IF NOT EXISTS maker_name VARCHAR(255),
     ADD COLUMN IF NOT EXISTS team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
     ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
     ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
     ADD COLUMN IF NOT EXISTS approved_by_user_id VARCHAR(64),
     ADD COLUMN IF NOT EXISTS approved_by_user_name VARCHAR(255),
     ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
     ADD COLUMN IF NOT EXISTS checker_feedback TEXT,
     ADD COLUMN IF NOT EXISTS shared_source_id VARCHAR(64);

   ALTER TABLE database_table_mappings 
     ADD COLUMN IF NOT EXISTS maker_id VARCHAR(64),
     ADD COLUMN IF NOT EXISTS maker_name VARCHAR(255),
     ADD COLUMN IF NOT EXISTS team_id VARCHAR(64) REFERENCES teams(id) ON DELETE SET NULL,
     ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
     ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
     ADD COLUMN IF NOT EXISTS approved_by_user_id VARCHAR(64),
     ADD COLUMN IF NOT EXISTS approved_by_user_name VARCHAR(255),
     ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
     ADD COLUMN IF NOT EXISTS checker_feedback TEXT,
     ADD COLUMN IF NOT EXISTS shared_source_id VARCHAR(64);
   ```

2. **Direct Peer & Team Share Auditing Table** `asset_shares`:
   ```sql
   CREATE TABLE IF NOT EXISTS asset_shares (
     id VARCHAR(64) PRIMARY KEY,
     asset_type VARCHAR(32) NOT NULL, -- 'WORKFLOW', 'VALIDATION_BOX', 'DB_CONFIG'
     asset_id VARCHAR(64) NOT NULL,
     sender_id VARCHAR(64) NOT NULL,
     sender_name VARCHAR(255) NOT NULL,
     target_type VARCHAR(32) NOT NULL, -- 'INDIVIDUAL', 'TEAM', 'CHAT_ROOM'
     target_id VARCHAR(64) NOT NULL,   -- recipient_user_id, team_id, or chat_room_id
     target_name VARCHAR(255),
     message TEXT,
     visual_payload JSONB NOT NULL,    -- Complete snapshot of asset representation for visual card rendering
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   CREATE INDEX IF NOT EXISTS idx_asset_shares_target ON asset_shares(target_type, target_id);
   ```

---

### Phase 2: Backend API & Service Layer

#### 2.1 Asset Sharing & Adoption Service
**File**: `backend/src/services/assetSharingService.ts`
* **`shareAsset(assetType, assetId, targetType, targetId, sender)`**:
  * Validates asset existence.
  * If `targetType === 'INDIVIDUAL'`: Generates visual payload and posts into Direct Chat / message queue.
  * If `targetType === 'TEAM'`: Updates asset `team_id`, marks status `PENDING_CHECKER_TEST`, and broadcasts WebSocket event to team members.
* **`adoptAsset(assetType, assetId, recipientUser)`**:
  * Creates an exact clone/fork of the asset scoped to `recipientUser.id` in `DRAFT` status (`is_locked: false`).
  * Links `shared_source_id` to preserve lineage.
  * Returns new personal asset ready for immediate editing and transaction testing.

#### 2.2 Checker Test & Approval Service
**File**: `backend/src/services/assetVerificationService.ts`
* **`testAssetAgainstTransactions(assetType, assetId, sampleTransactionIds, checkerUser)`**:
  * Runs the asset in a safe isolated execution sandbox using `ruleSqlCompiler.ts` or `validationEngine`.
  * Returns execution results (passes, fails, execution time) for Checker inspection.
* **`approveAsset(assetType, assetId, checkerUser, feedback)`**:
  * Validates Checker role (e.g., `CHECKER`, `SUPERVISOR`, `ADMIN`).
  * Enforces Anti-Self-Approval: `if (asset.maker_id === checkerUser.id) throw new ForbiddenError(...)`.
  * Updates: `status = 'APPROVED'`, `is_locked = TRUE`, `approved_by_user_id = checkerUser.id`, `approved_at = NOW()`.
* **`declineAsset(assetType, assetId, checkerUser, feedback)`**:
  * Updates: `status = 'DECLINED'`, `is_locked = FALSE`, `checker_feedback = feedback`.
* **`modifyLockedAsset(assetType, assetId, requestingUser, updates)`**:
  * Checks: `if (asset.is_locked && asset.approved_by_user_id !== requestingUser.id) throw new ForbiddenError('Only the approving Checker can modify a locked asset')`.

#### 2.3 Streamlined REST Routes
* `POST /api/assets/share` $\to$ Share asset to Team or Individual.
* `POST /api/assets/:type/:id/adopt` $\to$ 1-Click "Add to My Workspace" (clone into personal scope).
* `POST /api/assets/:type/:id/test` $\to$ Checker sandbox execution against sample transactions.
* `POST /api/assets/:type/:id/approve` $\to$ Checker approves and locks asset.
* `POST /api/assets/:type/:id/decline` $\to$ Checker declines with feedback.

---

### Phase 3: Frontend UI Components & User Experience

#### 3.1 Universal Visual "Share" Action & Modal
**Component**: `frontend/src/components/common/ShareAssetModal.tsx`
* Added to:
  * **Workflow DAG Builder** (`WorkflowStudioFlowchart.tsx` header: "Share Workflow")
  * **Validation Box Card** (`ValidationBoxManager.tsx` card action menu: "Share Box")
  * **DB Config Card** (`DatabaseColumnConfiguration.tsx` / `DbQueryTool.tsx`: "Share Configuration")
* **Modal Options**:
  * Target Toggle: **Share with Person (Direct Chat)** vs. **Share with Team (Resource Center)**.
  * Searchable picker for teammates or team channels.
  * Optional note / testing guidance from the author.

#### 3.2 Visual Asset Card & "Add to My Workspace" in Chats
**Component**: `frontend/src/components/chat/SharedAssetChatCard.tsx`
* Rendered inside `PersonalChat.tsx` and team discussion rooms when an asset is shared.
* **Never displays raw JSON**:
  * Displays asset name, type icon, author avatar, and parameter inputs.
  * Miniature flowchart step preview (for DAGs) or condition rules preview (for Validation Boxes).
  * Prominent **"Add to My Workspace"** button.
  * Clicking imports the asset directly into the recipient's personal collection with a success toast notification.

#### 3.3 Live Status Badges & Hashtag Integrations
**Component**: `frontend/src/components/common/AssetStatusBadge.tsx`
* Renders dynamically next to any mentioned or attached workflow / validation box:
  * 🟢 **`[APPROVED]`**: Green shield icon, tooltip showing *"Approved & locked by @CheckerName"*.
  * 🟡 **`[PENDING CHECKER TEST]`**: Amber flask icon, tooltip showing *"Awaiting Checker test run in Team Resource Center"*.
  * ⚪ **`[DRAFT / PERSONAL]`**: Gray user icon, tooltip showing *"Personal draft / Not verified for production"*.

#### 3.4 Team Resource Center: Hands-On Checker Testing Console
**Component**: `frontend/src/components/team/TeamResourceCenter.tsx`
* Located in `TeamWorkspace.tsx` under **"Resource Center & Staging"**.
* Cards categorized into **Validation Boxes**, **Workflows**, and **DB Configs**.
* For team members: "Add to My Workspace" button.
* For team Checkers:
  * **"Test with Sample Data"**: Launches an interactive modal executing the workflow against recent task transactions.
  * **"Approve & Lock"**: Sets locked state with checker attribution.
  * **"Decline with Notes"**: Sends feedback to the original maker.

#### 3.5 Task Escalation & Technical Handler Autonomy
**Component**: `frontend/src/components/team/EscalationRoomModal.tsx` & `frontend/src/components/IssueDetailView.tsx`
* When an issue is escalated with an attached workflow:
  * If the workflow is `APPROVED` by the escalating team: displays green verification check.
  * If `DRAFT` or `PENDING`: displays a prominent banner:
    > ⚠️ **Unapproved Workflow**: *This workflow has not been officially verified by the escalating team.*
* **Technical Handler Controls**:
  1. **"Test Against Issue Data"**: Runs the attached workflow on the issue's transactions in read-only mode to verify behavior.
  2. **"Remove Workflow"**: Decouples the workflow from the issue if found irrelevant.
  3. **"Replace with My Workflow"**: Allows the technician to select one of their own tested workflows.
  4. **"Request Workflow Changes"**: Opens a feedback form tagging the escalating team with exact requested modifications.

---

### Phase 4: Deprecation & Cleanup of Legacy Queues

1. **Retire `OperationalAuthorityCenter.tsx`**:
   * Remove the bulky dual-tab bureaucratic governance center.
   * Route all operational verifications directly to where work happens: the **Team Resource Center** and **Task Escalation Room**.
2. **Clean up `SideNav.tsx`**:
   * Replace generic Authority Center navigation with a streamlined badge on **Team Resources** and **Escalations**.
3. **Remove redundant proposal tables**:
   * Eliminate dead proposal states from `WorkspaceSettings.tsx` and legacy modals.

---

## 4. Step-by-Step Implementation Roadmap

| Step | Scope | Key Deliverables |
|:---:|:---|:---|
| **1** | **Database Migration 019** | Run SQL migration to add `maker_id`, `status`, `is_locked`, `approved_by_user_id`, and `asset_shares` table. |
| **2** | **Backend Asset Services** | Implement `assetSharingService.ts` and `assetVerificationService.ts` with adoption cloning, Checker testing, and lock enforcement. |
| **3** | **Visual Share Modal** | Build `ShareAssetModal.tsx` and integrate trigger buttons into DAG canvas, Validation Box manager, and DB config cards. |
| **4** | **Chat Visual Card & 1-Click Adopt** | Build `SharedAssetChatCard.tsx` and integrate into `PersonalChat.tsx` and discussion rooms with "Add to My Workspace". |
| **5** | **Live Status Badges** | Create `AssetStatusBadge.tsx` and embed across task headers, chat chips, and hashtag mentions. |
| **6** | **Checker Testing Console** | Refactor Team Workspace Resource Center with sample data testing, Approve & Lock, and Decline feedback. |
| **7** | **Escalation Handler Autonomy** | Update `EscalationRoomModal.tsx` and `IssueDetailView.tsx` with workflow unapproved indicators, test runner, remove, and swap actions. |
| **8** | **Automated Test Suite** | Write comprehensive vitest suite verifying Maker scoping, chat sharing, adoption cloning, Checker test-before-approve, and escalation autonomy. |

---

## 5. Verification & Acceptance Criteria

1. **Personal Scoping**: Newly created validation boxes, DAGs, and DB configs are owned by the author and not visible globally until shared.
2. **Zero-Friction Peer Sharing**: Sending an asset in Direct Chat allows the recipient to click "Add to My Workspace" and immediately run/edit it without any approval prompts.
3. **Hands-On Checker Testing**: A Checker can test a team-shared asset against real transactions before approving.
4. **Post-Approval Lock**: An approved asset cannot be edited by anyone except the specific Checker who approved it.
5. **Escalation Autonomy**: When handling an escalated issue, a technician can test, replace, or remove the attached workflow, with clear indicators if it was unapproved.
6. **No Raw JSON**: All shares, previews, and chat mentions render as rich, interactive UI cards.
7. **Test Coverage**: 100% pass rate on backend vitest suites and 0 errors on Vite frontend build.
