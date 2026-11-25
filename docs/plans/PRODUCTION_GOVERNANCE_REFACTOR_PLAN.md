# Implementation Plan: Production Governance Review & Refactor

**Target Architecture**: Strict Risk Segregation, Composite Workflow Bundles, and UI De-duplication  
**Reference Document**: [`PRODUCTION_GOVERNANCE_REVIEW_AND_REFACTOR.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/PRODUCTION_GOVERNANCE_REVIEW_AND_REFACTOR.md)  
**Governing Principles**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (PostgreSQL Source of Truth, Anti-Self-Approval `makerId !== checkerId`, 64-bit Advisory Locks, Zero Unapproved Queue Infrastructure)

---

## 1. Executive Overview & Problem Statement

The current implementation suffers from **governance sprawl**:
1. **Risk Conflation**: Low-risk UI settings, personal preferences, and team KPIs are pushed through the same dual-authorization queue as high-risk financial transaction overrides (`FORCE_MATCH`, `WRITE_OFF`).
2. **Review Surface Duplication**: Governance proposal queues are exposed redundantly across `GovernanceScreen.tsx`, `WorkspaceSettings.tsx`, and `TeamWorkspace.tsx`.
3. **Piecemeal Workflows**: Workflows are shared as loose JSON settings rather than deterministic, versioned, multi-component bundles (Flow DAG + Validation Boxes + DB Table Mappings).
4. **False Audit Burden**: Operators suffer from decision fatigue, increasing the risk that critical ledger overrides are rubber-stamped without diligence.

This implementation plan refactors the governance model into **four cleanly segregated operational layers**, introduces the **Composite Workflow Bundle** primitive, and streamlines the operator UX.

---

## 2. Target 4-Layer Architecture

```
Layer 1: Financial & Transaction Resolutions (Strict 4-Eyes)
├── Target: Overrides, Write-Offs, Force Matches, Manual Reversals
├── Storage: resolution_approval_requests (PostgreSQL)
├── Invariants: makerId !== checkerId, 64-bit advisory locks, immutable evidence snapshot
└── UI Surface: Operational Authority Center -> Financial Resolutions Tab

Layer 2: Operational Workflow Bundles (Strict 4-Eyes)
├── Target: Atomic bundles (Flow DAG + Validation Boxes + DB Checks + Version)
├── Storage: workflow_bundles (PostgreSQL, Migration 018)
├── Invariants: makerId !== checkerId, semver versioning, atomic promotion
└── UI Surface: Operational Authority Center -> Workflow Bundles Tab

Layer 3: Cross-Team Escalation (Operational Dispute & Handoff)
├── Target: First-level -> Second-level investigation handoff, ownership disputes
├── Storage: escalation_events, issues.escalated_to_team_id (PostgreSQL)
├── Invariants: Linked to Issue lifecycle, audit history trail
└── UI Surface: Escalation Room Modal, Multi-Team Discussion Rooms

Layer 4: Team Reporting & Workspace Preferences (Zero Governance Gates)
├── Target: KPIs, throughput metrics, scorecards, personal themes, local layout
├── Storage: Read-only analytics queries & user_preferences
├── Invariants: Real-time PostgreSQL aggregation, zero maker-checker friction
└── UI Surface: TeamWorkspace (Reporting Tab), WorkspaceSettings (Direct Save)
```

---

## 3. Detailed Phase Breakdown

### Phase 1: PostgreSQL Schema Migration (Migration 018)
**File**: `backend/src/database/migrations/018_workflow_bundles_and_governance_segregation.sql`

1. Create `workflow_bundles` table:
   ```sql
   CREATE TABLE IF NOT EXISTS workflow_bundles (
       id VARCHAR(64) PRIMARY KEY,
       bundle_code VARCHAR(100) NOT NULL UNIQUE, -- e.g., 'WB-2026-AIB-SETTLEMENT'
       name VARCHAR(255) NOT NULL,
       description TEXT,
       version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
       scope VARCHAR(32) NOT NULL DEFAULT 'TEAM', -- 'PERSONAL', 'TEAM', 'GLOBAL_ENTERPRISE'
       workflow_id VARCHAR(64) NOT NULL REFERENCES database_validation_workflows(id) ON DELETE CASCADE,
       validation_box_ids JSONB NOT NULL DEFAULT '[]', -- Array of validation box UUIDs
       db_check_ids JSONB NOT NULL DEFAULT '[]',        -- Array of table mapping IDs
       source_team_id VARCHAR(64) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
       status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',   -- 'DRAFT', 'PENDING_CHECKER_REVIEW', 'APPROVED', 'REJECTED'
       maker_id VARCHAR(64) NOT NULL,
       maker_name VARCHAR(255) NOT NULL,
       checker_id VARCHAR(64),
       checker_name VARCHAR(255),
       checker_feedback TEXT,
       evidence_snapshot JSONB,                       -- Complete snapshot of workflow DAG + boxes at proposal time
       hashtag_bindings JSONB DEFAULT '[]',           -- Universal hashtags (e.g. ['#AIB_SETTLEMENT_2026'])
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       approved_at TIMESTAMPTZ,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       CONSTRAINT chk_bundle_status CHECK (
           status IN ('DRAFT', 'PENDING_CHECKER_REVIEW', 'APPROVED', 'REJECTED')
       ),
       CONSTRAINT chk_bundle_scope CHECK (
           scope IN ('PERSONAL', 'TEAM', 'GLOBAL_ENTERPRISE')
       ),
       CONSTRAINT chk_bundle_anti_self_approval CHECK (
           checker_id IS NULL OR maker_id != checker_id
       )
   );

   CREATE INDEX IF NOT EXISTS idx_workflow_bundles_team ON workflow_bundles(source_team_id, status);
   CREATE INDEX IF NOT EXISTS idx_workflow_bundles_scope ON workflow_bundles(scope, status);
   ```

2. Add index on `workspace_setting_proposals` to support migration or retirement of non-operational setting proposals.

---

### Phase 2: Backend Domain & Service Refactoring

#### 2.1 Composite Workflow Bundle Engine
**File**: `backend/src/services/workflowBundleService.ts`
- **`createBundle(params)`**: Assembles a bundle from a workflow DAG, resolves all attached `validation_boxes` and `database_table_mappings`, and generates a deterministic `evidence_snapshot`.
- **`proposePromotion(bundleId, targetScope, maker)`**: Transitions bundle status to `PENDING_CHECKER_REVIEW`.
- **`approvePromotion(bundleId, checkerId, checkerName, feedback)`**:
  - Validates anti-self-approval: `if (bundle.maker_id === checkerId) throw new ForbiddenError(...)`.
  - Atomically applies the bundle to the target scope (`TEAM` or `GLOBAL_ENTERPRISE`).
  - Broadcasts WebSocket event via `eventService`.
- **`rejectPromotion(bundleId, checkerId, checkerName, reason)`**: Records rejection feedback and returns bundle to `REJECTED`/`DRAFT`.

#### 2.2 Split & Segregate `approvalService.ts`
**File**: `backend/src/services/approvalService.ts`
- Separate `getApprovals()` into two distinct domain queries:
  1. `getTransactionApprovals()`: Queries strictly `resolution_approval_requests` with financial context (`amount`, `transaction_id`, `proposed_action`, `evidence_snapshot`).
  2. `getWorkflowBundleApprovals()`: Queries strictly `workflow_bundles` with composite bundle context (`workflow_id`, `version`, `box_count`, `scope`).
- Deprecate mixing low-risk UI settings into the main approval response.
- Provide clean API routes:
  - `GET /api/approvals/transactions`
  - `POST /api/approvals/transactions/:id/approve`
  - `POST /api/approvals/transactions/:id/reject`
  - `GET /api/approvals/workflow-bundles`
  - `POST /api/workflow-bundles/:id/propose`
  - `POST /api/workflow-bundles/:id/review`

---

### Phase 3: Frontend UX Streamlining & De-duplication

#### 3.1 Rebrand & Focus `GovernanceScreen.tsx` $\to$ "Operational Authority Center"
**File**: `frontend/src/components/governance/GovernanceScreen.tsx`
- Replace generic mixed cards with two explicit, role-gated tabs:
  - **Tab 1: Financial & Transaction Resolutions**:
    - Displays pending ledger overrides, force-matches, and write-offs.
    - Full evidence viewer: original transaction record vs. mirror reconciliation record side-by-side.
    - Anti-self-approval disabled state for maker (with tooltip explaining Four-Eyes principle).
  - **Tab 2: Workflow Bundle Promotions**:
    - Displays versioned bundles pending promotion to Team or Enterprise.
    - Interactive DAG & Validation Box inspector drawer (preview the exact flow being promoted).
    - Approval action commits promotion; rejection returns feedback to author.

#### 3.2 Clean up `WorkspaceSettings.tsx`
**File**: `frontend/src/components/WorkspaceSettings.tsx`
- **Remove** the embedded governance approval proposals tab (`L500-L583`).
- Retain direct save for personal workspace settings (themes, default views, notification toggles).
- If system-level infrastructure config (e.g. database credentials) is modified, route the proposal cleanly to the dedicated admin config channel, not a general user tab.

#### 3.3 Clean up `TeamWorkspace.tsx`
**File**: `frontend/src/components/TeamWorkspace.tsx`
- **Remove** the mixed governance approval sub-queue (`L763-L980`).
- Convert the "Approvals / Governance" tab into a clean, dedicated **"Workflow Bundles & Assets"** tab showing:
  - Team-approved workflow bundles.
  - Published validation boxes.
  - Quick action to "Promote Bundle to Enterprise" (which submits a Maker request to the Authority Center).
- Isolate Team KPIs and scorecards into a pure read-only analytics view (`TeamReportingTab`).

#### 3.4 Update Navigation Permissions
**File**: `frontend/src/utils/navigationPermissions.ts` & `frontend/src/components/SideNav.tsx`
- Rebrand side-nav icon from generic "Governance" to "Authority Center" or "Approvals".
- Restrict visibility to users with operational authority (e.g., `SUPERVISOR`, `CHECKER`, `ADMIN`, or users with pending maker requests).

---

### Phase 4: Automated Testing & Verification Gates

#### 4.1 Backend Test Suite
**File**: `backend/src/tests/workflowBundleAndGovernanceRefactor.test.ts`
- **Test 1**: Create composite workflow bundle (DAG + 2 Validation Boxes + 1 DB Check) $\to$ status `DRAFT`.
- **Test 2**: Maker submits bundle for `GLOBAL_ENTERPRISE` promotion $\to$ status `PENDING_CHECKER_REVIEW`.
- **Test 3**: Anti-Self-Approval Enforcement: Maker attempts to approve own bundle $\to$ Expect HTTP 403 Forbidden (`makerId !== checkerId`).
- **Test 4**: Separate Checker approves bundle $\to$ status `APPROVED`, scope updated to `GLOBAL_ENTERPRISE`.
- **Test 5**: Domain Segregation Verification:
  - `GET /api/approvals/transactions` returns only transaction overrides.
  - `GET /api/approvals/workflow-bundles` returns only workflow bundles.
  - No low-risk UI settings appear in either queue.

#### 4.2 Frontend Build & Lint Verification
- Backend TypeScript compilation: `npm run build --prefix backend` $\to$ 0 errors.
- Frontend TypeScript & bundle build: `npm run build --prefix frontend` $\to$ 0 errors.

---

## 4. Rollout & Risk Mitigation Strategy

| Potential Risk | Severity | Mitigation Strategy |
| :--- | :---: | :--- |
| **Orphaned Validation Boxes**: A promoted workflow references validation boxes that were deleted or modified after promotion. | High | **Immutable Snapshotting**: When a bundle is proposed, the complete JSON definition of the workflow DAG and its validation boxes is snapshotted into `workflow_bundles.evidence_snapshot`. |
| **Breaking Existing Transaction Approvals**: Existing pending `resolution_approval_requests` might be lost during refactor. | High | **Zero Data Deletion**: We do not alter or drop `resolution_approval_requests`. We only segregate queries in `approvalService.ts` and add `workflow_bundles`. |
| **User Confusion during UX Transition**: Users looking for approvals in `WorkspaceSettings` cannot find them. | Low | **Guided Redirect Banners**: In `WorkspaceSettings`, display an informative banner: *"Looking for approvals? Operational approvals have moved to the Operational Authority Center."* |

---

## 5. Definition of Done (DoD)

1. [ ] Migration 018 executed cleanly on PostgreSQL `operational_workflow_db`.
2. [ ] `workflowBundleService.ts` implemented with Maker-Checker dual authorization and anti-self-approval.
3. [ ] `approvalService.ts` cleanly segregated into financial transaction overrides vs. workflow bundles.
4. [ ] `GovernanceScreen.tsx` refactored into the 2-tab "Operational Authority Center".
5. [ ] Duplicate approval queues removed from `WorkspaceSettings.tsx` and `TeamWorkspace.tsx`.
6. [ ] Team KPI reporting completely decoupled from approval queues.
7. [ ] All automated tests pass (100% pass rate).
8. [ ] Full documentation and changelog updated in `CURRENT_PROJECT_CONTEXT.md`.
