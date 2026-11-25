# Code & Architectural Audit Report: Cases Page & Investigation Workspace UI/Navigation

**Audit ID**: `AUD-CASES-PAGE-2026-11-25`  
**Date**: 2026-11-25  
**Auditor**: Antigravity Autonomous Code Audit Engine  
**Governing Skill**: [`.agents/skills/code-audit/SKILL.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)  
**Governing Invariants & Principles**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rule 1: PostgreSQL Reality, Rule 6: Frontend Fault Tolerance & Error Boundary, Rule 7: Maker-Checker Dual Authorization, Rule 16: Full-Viewport Workspace Layout, Rule 19: Team-Scoped Connection & Data Isolation)  
**Target Scope**: Cases Workspace View, Investigation Workspace, Validation Orchestrator Workspace, Issue Detail View, Transaction Drawers & Modals, and Related Backend Dataset / Central Ledger Routes  
**Branch / Commit**: `feature/frontend-redesign` (`d7bf228`)  
**Status**: `OPEN`  

---

## 1. Executive Summary

A comprehensive architectural, security, and UI resilience audit was conducted across the **Cases Page / Investigation Workspace UI & Navigation** subsystem. This subsystem serves as the core operational workbench where investigators analyze transaction batches, cross-reference central ledgers, inspect pipeline validation verdicts, collaborate in team case discussions, and propose dispute resolutions.

The audit verified that the primary views comply with modern layout standards (Rule 16 full-viewport containment, sticky table headers, active pagination components, and top-level `<ErrorBoundary>` containment). However, **4 actionable findings** (0 Critical, 1 High, 2 Medium, 1 Low) were identified across data fetching integrity, memory scaling, error boundary isolation, and team data isolation.

| Severity | Count | Summary of Key Vulnerabilities / Risks |
| :--- | :--- | :--- |
| **CRITICAL** | 0 | None identified in this scope. |
| **HIGH** | 1 | Client-side silent record truncation via mismatched pagination fetch (`limit=5000` requested vs `limit=500` hardcoded backend clamp in `issues.ts:274`). |
| **MEDIUM** | 2 | Unbounded full-dataset React state & unvirtualized table DOM causing UI freezes on 10,000+ row cases; missing granular sub-pane error boundaries and unhandled optimistic row override desynchronization. |
| **LOW** | 1 | `GET /api/investigations/:taskId/central-records` lacks team ownership check, allowing cross-team transaction metadata visibility. |

---

## 2. Previous Audit and Sign-Off Review

The platform master audit register ([`agent-handoffs/audit/master-audit.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/master-audit.md)) tracks 7 completed audits covering Investigation Core (`AUD-INV`), Intake & Staging (`AUD-INT`), Mapping & Ingestion (`AUD-MAP`), Database Governance & Approvals (`AUD-DB`), Auth & OAuth (`AUD-AUTH`), Hashtag Engine & Schedulers (`AUD-TAG`), and Sandbox Escalations (`AUD-SBX`), comprising 29 open findings (7 CRITICAL, 9 HIGH, 10 MEDIUM, 3 LOW).

This audit (`AUD-CASES-PAGE-2026-11-25`) establishes the 8th audit scope, targeting the front-facing **Cases Page & Investigation Workspace UI/Navigation**.

---

## 3. Files & Modules Examined

### Frontend Components
- [`frontend/src/components/investigation/CasesWorkspaceView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/CasesWorkspaceView.tsx): Modern Cases workspace, active pagination, KPI summary cards, filter pills, cross-check tab, and cell formatters.
- [`frontend/src/components/investigation/InvestigationWorkspace.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/InvestigationWorkspace.tsx): Top-level wrapper containing the `<ErrorBoundary fallbackTitle="Investigation Workspace Error">`.
- [`frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx): Master investigation orchestrator managing view modes (`modern_cases` vs `advanced_grid`), dataset rows, central master rows, and modal triggers.
- [`frontend/src/components/IssueDetailView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/IssueDetailView.tsx): Workspace routing, task creator, hashtag manager, and investigation workspace hosting.
- [`frontend/src/components/investigation/TransactionInvestigationDrawer.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/TransactionInvestigationDrawer.tsx): Side drawer for single transaction deep inspection and history timeline.
- [`frontend/src/components/investigation/CaseDiscussionDrawer.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/CaseDiscussionDrawer.tsx): In-case team chat, hashtags, script proposals, and escalation agreements.
- [`frontend/src/components/investigation/CompareAndResolveModal.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/CompareAndResolveModal.tsx): Transaction-level diff and resolution modal.

### Backend Endpoints & Services
- [`backend/src/routes/issues.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/issues.ts): `GET /:id/transactions`, `GET /:id/batches`, `PUT /:id`, `DELETE /:id`, `POST /:id/chat`.
- [`backend/src/routes/investigations.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/investigations.ts): `GET /:taskId/central-records`, `GET /:taskId/workflow-executions`, `POST /duplicates/scan`.

---

## 4. Findings Summary Table

| Finding ID | Severity | Category | Location | Summary |
| :--- | :--- | :--- | :--- | :--- |
| `AUD-CAS-001` | **HIGH** | Data Integrity & UX | `CasesWorkspaceView.tsx:126`; `issues.ts:274` | Client-side silent record truncation via mismatched pagination fetch (`limit=5000` requested vs `500` backend cap). |
| `AUD-CAS-002` | **MEDIUM** | Performance & Resilience | `ValidationOrchestratorWorkspace.tsx:3656-3686`; `CasesWorkspaceView.tsx:430-443` | Unbounded full-dataset React state & unvirtualized table DOM causing UI freezes on large datasets. |
| `AUD-CAS-003` | **MEDIUM** | Fault Tolerance & Consistency | `InvestigationWorkspace.tsx:28-34`; `CasesWorkspaceView.tsx:149, 1300` | Missing granular sub-pane error boundaries and unhandled optimistic row override desynchronization. |
| `AUD-CAS-004` | **LOW** | Security & Team Isolation | `backend/src/routes/investigations.ts:267-294` | `GET /api/investigations/:taskId/central-records` lacks team ownership and visibility guards. |

---

## 5. Detailed Findings

### AUD-CAS-001: Client-Side Silent Record Truncation via Mismatched Pagination Fetch
- **Severity**: HIGH
- **Status**: OPEN
- **Category**: Data Integrity & UX Correctness
- **Location**: [`frontend/src/components/investigation/CasesWorkspaceView.tsx#L126`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/CasesWorkspaceView.tsx#L126); [`backend/src/routes/issues.ts#L273-L274`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/issues.ts#L273-L274)
- **Evidence**:
  In `frontend/src/components/investigation/CasesWorkspaceView.tsx`:
  ```typescript
  // Line 126
  api.getTaskTransactions(currentIssue.id, 1, 5000)
  ```
  In `backend/src/routes/issues.ts`:
  ```typescript
  // Lines 273-274
  const page = Math.max(1, parseInt(req.query.page as string || '1', 10) || 1);
  const limit = Math.max(1, Math.min(parseInt(req.query.limit as string || '50', 10) || 50, 500));
  ```
- **Description**: When `CasesWorkspaceView` fetches transactions autonomously, it attempts to load all rows by requesting `limit = 5000`. However, the backend route `GET /api/issues/:id/transactions` explicitly caps the maximum limit at `500` via `Math.min(..., 500)`. Consequently, the API returns only 500 rows. The frontend assigns `txnRes.rows` to `internalTaskRows` without checking `txnRes.totalCount`. If the task contains 1,500 or 10,000 transactions, 66% to 95% of the records are omitted silently.
- **Impact**: Operators reviewing cases believe they are inspecting the complete dataset, but records beyond index 500 are never loaded into the workspace table or search index.
- **Conditions for Occurrence**: Any task containing more than 500 transactions viewed in `CasesWorkspaceView`.
- **Recommended Remediation**:
  1. Have `CasesWorkspaceView` inspect `txnRes.totalCount` and `txnRes.totalPages`.
  2. Implement server-side paginated queries (`currentPage`, `pageSize`) or, if client-side aggregation is required, batch fetch subsequent pages or provide a visible banner: `"Showing first 500 of {totalCount} records. Use server search or export for full dataset."`
- **Verification Criteria**: A task with 1,200 rows displays an accurate total count indicator and allows paginating or searching through all 1,200 records.

---

### AUD-CAS-002: Unbounded Full-Dataset React State & Unvirtualized Table DOM
- **Severity**: MEDIUM
- **Status**: OPEN
- **Category**: Performance & Client Resilience
- **Location**: [`frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx#L3656-L3686`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx#L3656-L3686); [`frontend/src/components/investigation/CasesWorkspaceView.tsx#L430-L443`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/CasesWorkspaceView.tsx#L430-L443)
- **Evidence**:
  In `ValidationOrchestratorWorkspace.tsx`:
  ```typescript
  <CasesWorkspaceView
    issue={selectedIssue}
    issues={issues}
    taskDatasetRows={taskDatasetRows}
    sourceRecords={orchestratedRows}
    centralMasterRows={centralMasterRows}
    ...
  />
  ```
  In `CasesWorkspaceView.tsx`:
  ```typescript
  const availableTasks = useMemo(() => {
    let list = Array.isArray(issues) && issues.length > 0 ? issues : (currentIssue ? [currentIssue] : []);
    if (taskSwitcherStatusFilter !== 'ALL') {
      list = list.filter(t => (t.status || 'Open').toLowerCase() === taskSwitcherStatusFilter.toLowerCase());
    }
    if (taskSwitcherQuery.trim()) {
      const q = taskSwitcherQuery.toLowerCase();
      list = list.filter(t => 
        (t.title || '').toLowerCase().includes(q) || 
        (t.id || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [issues, currentIssue, taskSwitcherStatusFilter, taskSwitcherQuery]);
  ```
- **Description**: `orchestratedRows`, `centralMasterRows`, and `taskDatasetRows` are stored in React component state in memory. For large tasks (50,000+ transactions), passing these entire arrays between components triggers heavy memory consumption and garbage collection spikes. Furthermore, the task switcher performs full string searches across all issues in memory rather than debounced server queries.
- **Impact**: Sluggish tab switches, high RAM consumption on operator machines, and risk of browser tab crashes on memory-constrained systems.
- **Conditions for Occurrence**: Large datasets (> 20,000 rows) or high task volume (> 5,000 cases).
- **Recommended Remediation**:
  1. Implement row virtualization (e.g. `@tanstack/react-virtual` or windowing) in the active table bodies.
  2. Implement debounced server-side search in the task switcher dropdown when total issue count exceeds 50.
- **Verification Criteria**: Memory consumption remains stable (< 200MB) when navigating a 50,000-row task.

---

### AUD-CAS-003: Missing Granular Sub-Pane Error Boundaries & Optimistic Override Desynchronization
- **Severity**: MEDIUM
- **Status**: OPEN
- **Category**: Fault Tolerance & State Consistency
- **Location**: [`frontend/src/components/investigation/InvestigationWorkspace.tsx#L28-L34`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/InvestigationWorkspace.tsx#L28-L34); [`frontend/src/components/investigation/CasesWorkspaceView.tsx#L149`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/CasesWorkspaceView.tsx#L149)
- **Evidence**:
  In `InvestigationWorkspace.tsx`:
  ```typescript
  export default function InvestigationWorkspace(props: InvestigationWorkspaceProps) {
    return (
      <ErrorBoundary fallbackTitle="Investigation Workspace Error">
        <ValidationOrchestratorWorkspace {...props} />
      </ErrorBoundary>
    );
  }
  ```
  In `CasesWorkspaceView.tsx`:
  ```typescript
  const [rowOverrides, setRowOverrides] = useState<Record<string, { investigationStatus?: string; investigationLabel?: string; isClosed?: boolean; resolutionNote?: string }>>({});
  ```
- **Description**: While `InvestigationWorkspace.tsx` wraps `ValidationOrchestratorWorkspace` in an `<ErrorBoundary>`, there are no isolated error boundaries around individual sub-components (such as `TransactionInvestigationDrawer`, `CaseDiscussionDrawer`, or table cell renderers). A single unhandled runtime error in a complex JSON cell formatter crashes the entire investigation workspace. Furthermore, `rowOverrides` updates local UI state optimistically without rolling back if the underlying Maker proposal or API resolution request fails.
- **Impact**: Entire workspace unmounts on minor rendering bugs; users see a transient "resolved" state even if the backend rejected the action.
- **Conditions for Occurrence**: Malformed nested JSON in transaction attributes; network timeout or 403 on dispute override.
- **Recommended Remediation**:
  1. Wrap `TransactionInvestigationDrawer` and `CaseDiscussionDrawer` in local `<ErrorBoundary>` components.
  2. Implement rollback logic in `setRowOverrides` if the resolution mutation rejects.
- **Verification Criteria**: Throwing a render error inside `TransactionInvestigationDrawer` leaves the main table intact and displays a drawer-scoped error card.

---

### AUD-CAS-004: Unauthenticated Central Transaction Ledger Ingress Lacks Team Ownership Guard
- **Severity**: LOW
- **Status**: OPEN
- **Category**: Security & Team Isolation
- **Location**: [`backend/src/routes/investigations.ts#L267-L294`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/investigations.ts#L267-L294)
- **Evidence**:
  ```typescript
  // GET /api/investigations/:taskId/central-records - Dedicated Sheet 1 Master Ledger ingress
  investigationsRouter.get('/:taskId/central-records', async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const records = await repo.getCentralTransactionsByTaskId(taskId);
      return res.json({
        taskId,
        totalCount: records.length,
        records: records.map(r => ({ ... }))
      });
  ```
- **Description**: The endpoint retrieves central master ledger records and cross-task duplicate linkages purely based on `req.params.taskId`. It does not verify whether the requesting user (`req.user`) has access to the task's owning team (`issue.team_id`) or if the task visibility is `TEAM_PRIVATE`.
- **Impact**: An authenticated user in Team A can query central transaction data belonging to Team B's private tasks if they know or discover the `taskId`.
- **Conditions for Occurrence**: Multi-tenant operational environments where tasks are partitioned across different financial institutions or internal teams.
- **Recommended Remediation**:
  Add task existence and team authorization checks:
  ```typescript
  const issue = await repo.getIssueById(taskId);
  if (!issue) return res.status(404).json({ error: 'Task not found' });
  if (issue.team_id && issue.visibility === 'TEAM_PRIVATE' && (req as any).user?.teamId !== issue.team_id && (req as any).user?.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied to team private task records' });
  }
  ```
- **Verification Criteria**: A user from Team B attempting to fetch central records for Team A's private task receives HTTP 403.

---

## 6. Positive Observations

1. **Full-Viewport Containment Compliance (Rule 16)**:
   `CasesWorkspaceView.tsx` strictly adheres to `h-full flex flex-col min-h-0 overflow-hidden` without brittle `calc(100vh-...)` subtractions in inner columns, ensuring sticky table headers and clean scroll containment.
2. **Safe JSON Cell Serialization (Rule 6)**:
   Lines 410-415 of `CasesWorkspaceView.tsx` properly serialize nested JSON objects with `JSON.stringify(rawVal)` rather than attempting to render raw objects directly as React children, preventing React invariant crashes.
3. **Canonical Mapping Integration (Rule 4)**:
   Column definitions in `availableColumns` dynamically hydrate from `api.getGlobalStandardDirectory()` and `globalMappingService`, ensuring table columns remain decoupled from hardcoded database schemas.
4. **Clean Production Builds**:
   Frontend builds cleanly via `npm run build --prefix frontend` (2,186 modules built in 19.44s without warnings or syntax errors).

---

## 7. Recommendations (Separated from Confirmed Defects)

1. **Debounced Filter Query**: Debounce `searchQuery` and `columnSearchQuery` by 150ms in `CasesWorkspaceView.tsx` to prevent redundant re-renders on every keystroke.
2. **Export Progress Indicator**: For exports exceeding 1,000 rows, show an indeterminate progress spinner on the `onExport` button to prevent duplicate clicks while XLSX is generating.

---

## 8. Remediation Plan

1. **Remediation Order**:
   - **Step 1 (AUD-CAS-001)**: Align frontend autonomous fetch with backend pagination bounds; display accurate total count indicator in table footer.
   - **Step 2 (AUD-CAS-004)**: Enforce team ownership check on `GET /api/investigations/:taskId/central-records`.
   - **Step 3 (AUD-CAS-003)**: Introduce granular `<ErrorBoundary>` wrappers around side drawers and rollback optimistic state on mutation failure.
   - **Step 4 (AUD-CAS-002)**: Add table windowing/virtualization for datasets exceeding 5,000 rows.
2. **Remediation Execution**:
   To begin implementing fixes, run `/sign-off` targeting this scope.

---

## 9. Audit Conclusion & Sign-Off Readiness

- **Audit Result**: `OPEN` (Remediation Required).
- **Severity Breakdown**: 0 Critical, 1 High, 2 Medium, 1 Low.
- **Sign-Off Status**: **BLOCKED** until `AUD-CAS-001` (High) and `AUD-CAS-004` (Low/Security) are remediated and verified.

---

## 10. References & Invariant Mapping

- [Master Audit Register](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/master-audit.md)
- [Audit Reports Index](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/INDEX.md)
- [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md)
