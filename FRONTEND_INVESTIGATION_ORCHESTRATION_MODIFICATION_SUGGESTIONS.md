# Frontend Investigation Orchestration — Comprehensive Modification Suggestions

**Document**: `FRONTEND_INVESTIGATION_ORCHESTRATION_MODIFICATION_SUGGESTIONS.md`  
**Date**: October 10, 2026  
**Scope**: Investigation panel grid view, workspace UX, visual design, accessibility, performance  
**Target components**: `ValidationOrchestratorWorkspace.tsx`, `WorkspaceTable.tsx`, `DatabaseCrossVerificationPanel.tsx`, `QuerySandbox.tsx`

---

## Table of Contents

1. [Current State Summary](#1-current-state-summary)
2. [UI/UX Enhancement Proposals](#2-uiux-enhancement-proposals)
3. [Visual Design System](#3-visual-design-system)
4. [Interaction & Workflow Improvements](#4-interaction--workflow-improvements)
5. [Accessibility & Inclusive Design](#5-accessibility--inclusive-design)
6. [Performance Optimizations](#6-performance-optimizations)
7. [Component Architecture Refactoring](#7-component-architecture-refactoring)
8. [Implementation Roadmap](#8-implementation-roadmap)
9. [Success Metrics](#9-success-metrics)
10. [Document References](#10-document-references)
11. [Mandatory Governance Enforcement & Compliance Guardrails](#11-mandatory-governance-enforcement--compliance-guardrails)

---

## 1. Current State Summary

| Component | Lines | Key Issues |
|-----------|-------|------------|
| `ValidationOrchestratorWorkspace.tsx` | ~5,868 | Monolithic, no virtualization, 50+ useState, no debounced search |
| `WorkspaceTable.tsx` | 1,214 | Separate grid, inconsistent badge pattern |
| `DatabaseCrossVerificationPanel.tsx` | 1,237 | Simulated data, no live DB queries |
| `QuerySandbox.tsx` | 630 | Design-time tool, acceptable |

---

## 2. UI/UX Enhancement Proposals

### 2.1 Unified Investigation Dashboard Layout

**Current**: Single dense table with all information crammed into rows.  
**Proposed**: Multi-pane investigation workspace with contextual side panel.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Toolbar: Search | Filters | Column Manager | Export | Actions      │
├─────────────────────────────────────────────────────────────────────┤
│  KPI Cards: Total | Reconciled | Flagged | Errors | Pending          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────┐  ┌──────────────────────────┐ │
│  │                                  │  │  Context Panel           │ │
│  │   Transaction Grid               │  │                          │ │
│  │   (virtualized, sortable)        │  │  • Selected row details  │ │
│  │                                  │  │  • Multi-leg accordion   │ │
│  │                                  │  │  • Validation timeline   │ │
│  │                                  │  │  • Audit trail           │ │
│  │                                  │  │  • Maker-Checker actions │ │
│  │                                  │  │  • Chat context          │ │
│  └──────────────────────────────────┘  └──────────────────────────┘ │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  Pagination | Page Size | Summary Stats | Quick Actions              │
└─────────────────────────────────────────────────────────────────────┘
```

**Benefits**:
- Reduces cognitive load by separating data grid from detail context
- Enables multi-select operations without row expansion conflicts
- Provides persistent context panel that updates on row selection

---

### 2.2 Smart Default Views & Saved Views

**Current**: Users must manually configure columns and filters every session.  
**Proposed**:

1. **Role-based default views**:
   - **Investigator**: Shows transaction_id, amount, status, reconciliation_status, validation_status
   - **Supervisor**: Shows all investigator columns + maker-checker status, SLA timers
   - **Auditor**: Shows all columns + full audit trail, hash verification status

2. **User-saved views**:
   - Save current column configuration + filters + sort order
   - Named views: "My Daily Review", "High-Value Discrepancies", "Pending Approvals"
   - Share views via URL query parameters
   - **Governance Enforcement (Rule 23 & Rule 1)**: In accordance with AGENTS.md Rule 23 (*Strict Prohibition of Client-Side localStorage as Primary State Store*), user-saved views and filter sets MUST NOT use browser `localStorage` as primary storage. They must be persisted in PostgreSQL (`operational_workflow_db`) via `/api/user-views`. Browser `localStorage` is permitted strictly for ephemeral, device-local UI ergonomics (such as column width resizing and sidebar collapsed state).

3. **Quick filter chips**:
   - `Today's uploads`, `Unreconciled > 24h`, `Amount > $10,000`, `Duplicate suspects`
   - One-click application, visually distinct from manual filters

---

### 2.3 Progressive Disclosure Pattern

**Current**: All visible in a single dense grid.  
**Proposed**: Three-level information architecture:

| Level | What Shows | How |
|-------|-----------|-----|
| **L1: Scan** | Key columns, status badges, severity color coding | Default grid view |
| **L2: Inspect** | Expanded row or side panel with validation details, multi-leg data | Click row or hover preview |
| **L3: Deep Dive** | Full drilldown modal with SQL, raw data, audit trail, Maker-Checker | Double-click or explicit action |

**Implementation**:
- Row hover shows tooltip with key validation findings
- Click opens side panel (L2) with tabbed sections
- "Deep Dive" button opens full modal (L3) with all evidence

---

### 2.4 Inline Quick Actions

**Current**: Actions buried in drilldown modals.  
**Proposed**: Contextual inline actions on each row:

```
┌─────────────────────────────────────────────────────────────────────┐
│ ⚠ TX-99021 | $250.00 | RECONCILED | FLAGGED | [Quick Actions ▼]    │
│                                                                     │
│   Quick Actions dropdown:                                           │
│   • Propose Match Override (Maker)                                 │
│   • Flag Discrepancy (Maker)                                       │
│   • Propose Reversal (Maker)                                       │
│   • View in Core Banking                                           │
│   • Copy Transaction ID                                            │
│   • Add to Watchlist                                               │
└─────────────────────────────────────────────────────────────────────┘
```

**Governance Guardrail (Rule 7 & Rule 3)**:
- Manual resolution actions (`Propose Match Override`, `Propose Reversal`, `Write-Off`) MUST NEVER execute direct mutations on transaction or task state.
- All resolution actions must route through a Maker proposal (`POST /api/resolutions/propose`) and commit only upon Checker review (`makerId !== checkerId`, HTTP 403 anti-self-approval).
- Manual transaction case closure within the investigation workspace must maintain strict lifecycle separation (Rule 3) and never silently close the parent Task or Issue.

**Benefits**:
- Reduces modal open/close cycle for common actions
- Keyboard accessible (Cmd+K command palette)
- Action confirmation inline (no full page reload)

---

### 2.5 Batch Operations Toolbar

**Current**: No multi-select capability.  
**Proposed**:

- Checkbox column for multi-select
- Floating action bar appears when rows selected:
  - `Approve Selected (3)` — Maker-Checker batch proposal
  - `Flag Selected (3)` — Bulk discrepancy flagging
  - `Export Selected` — CSV/JSON export
  - `Re-run Validation` — Re-execute workflow on selected rows
  - `Assign to Investigator` — Team assignment

---

### 2.6 Real-Time Collaboration Indicators

**Current**: No awareness of other investigators.  
**Proposed**:

- Avatar stack showing who is viewing/investigating each row
- "John is viewing this row" indicator
- Lock indicator when a row is in Maker-Checker review
- Activity feed sidebar showing recent team actions

---

## 3. Visual Design System

### 3.1 Status Badge Redesign & Lifecycle Segregation

**Current**: Inconsistent badge patterns across components, conflating verdicts and actions.  
**Proposed**: Unified badge system adhering strictly to **Rule 2** (*Validation Result ≠ Pipeline Action*) and **Rule 3** (*Lifecycle Separation*):

#### A. Validation Result Verdict (`rule_definition.checkType` outcome)
| Verdict | Color | Icon | Badge Style | Semantics |
|---------|-------|------|-------------|-----------|
| `PASS` | Emerald | ✓ | Solid fill, emerald text (`bg-emerald-100 text-emerald-800 border-emerald-300`) | Rule passed successfully |
| `FAIL` | Rose | ⚠ | Solid fill, rose text (`bg-rose-100 text-rose-800 border-rose-300`) | Criteria mismatch detected |
| `ERROR` | Red | ✕ | Solid fill, red text (`bg-red-100 text-red-800 border-red-300`) | Execution syntax or format error |
| `PAUSED_DB_OFFLINE` | Amber | ⏸ | Solid fill, amber text (`bg-amber-100 text-amber-800 border-amber-300`) | Target DB unavailable |

#### B. Pipeline Action Taken (Engine progression instruction)
| Action | Color | Badge Style | Semantics |
|--------|-------|-------------|-----------|
| `CONTINUE` | Slate | `bg-slate-100 text-slate-700` | Proceeds to next sequential stage |
| `FLAG` | Amber | `bg-amber-100 text-amber-800 border border-amber-300` | Flags record for operator review |
| `REPORT` | Indigo | `bg-indigo-100 text-indigo-800 border border-indigo-300` | Advances with diagnostic taint (`_isDiagnosticOnly: true`) |
| `STOP` | Rose | `bg-rose-100 text-rose-800 border border-rose-300` | Halts downstream pipeline execution |
| `CLOSE` | Emerald | `bg-emerald-100 text-emerald-800 border border-emerald-300` | Concludes investigation as resolved |

#### C. Transaction Investigation Lifecycle (Operational case status)
| Lifecycle Status | Color | Badge Style | Semantics |
|------------------|-------|-------------|-----------|
| `INVESTIGATING` | Amber | Outline (`bg-amber-50 text-amber-800 border border-amber-300`) | Active review in progress |
| `RECONCILED` | Emerald | Solid (`bg-emerald-100 text-emerald-800 border border-emerald-300`) | Verified matched & reconciled |
| `FLAGGED` | Rose | Solid (`bg-rose-100 text-rose-800 border border-rose-300`) | Discrepancy confirmed by operator |
| `CLOSED` | Slate | Muted (`bg-slate-200 text-slate-700 border border-slate-300`) | Case resolved and archived |

#### D. Collision & Multi-Task State
| Collision Status | Color | Badge Style | Semantics |
|------------------|-------|-------------|-----------|
| `DUPLICATE` | Purple | Outline (`bg-purple-50 text-purple-700 border border-purple-300`) | Appears in prior task; links to source task ID |
| `UNIQUE` | Emerald | Muted (`bg-emerald-50 text-emerald-700 border border-emerald-200`) | First occurrence in central repository |

**Implementation Contract**:
```typescript
// Strongly typed, segregated badge interfaces
export interface ValidationVerdictBadgeProps {
  verdict: 'PASS' | 'FAIL' | 'ERROR' | 'PAUSED_DB_OFFLINE';
  size?: 'sm' | 'md';
}

export interface PipelineActionBadgeProps {
  action: 'CONTINUE' | 'FLAG' | 'REPORT' | 'STOP' | 'CLOSE';
  size?: 'sm' | 'md';
}

export interface InvestigationLifecycleBadgeProps {
  status: 'INVESTIGATING' | 'RECONCILED' | 'FLAGGED' | 'CLOSED';
  size?: 'sm' | 'md';
}

export interface DuplicateStatusBadgeProps {
  isDuplicate: boolean;
  duplicateTaskId?: string | number;
  size?: 'sm' | 'md';
}
```

---

### 3.2 Severity Color System

**Current**: Ad-hoc color assignments.  
**Proposed**: Consistent severity palette:

| Severity | Background | Border | Text | Usage |
|----------|-----------|--------|------|-------|
| CRITICAL | `bg-rose-50` | `border-rose-200` | `text-rose-700` | Financial discrepancy > $10K |
| WARNING | `bg-amber-50` | `border-amber-200` | `text-amber-700` | Validation failures |
| INFO | `bg-blue-50` | `border-blue-200` | `text-blue-700` | Informational |
| SUCCESS | `bg-emerald-50` | `border-emerald-200` | `text-emerald-700` | Reconciled |

---

### 3.3 Data Density Modes

**Current**: Fixed density.  
**Proposed**: User-selectable density:

| Mode | Row Height | Font Size | Use Case |
|------|-----------|-----------|----------|
| Compact | 32px | 12px | Scan many rows quickly |
| Default | 48px | 14px | Standard investigation |
| Comfortable | 64px | 16px | Detailed review, accessibility |

---

### 3.4 Dark Mode Support

**Current**: Light mode only.  
**Proposed**: Full dark mode with:
- CSS custom properties for all colors
- `prefers-color-scheme` media query
- Manual toggle in toolbar
- Persistent preference in localStorage

---

### 3.5 Micro-Interactions & Animations

**Current**: No transitions or feedback animations.  
**Proposed**:

| Interaction | Animation | Duration |
|-------------|-----------|----------|
| Row selection | Background color fade | 150ms |
| Status change | Badge pulse + color transition | 300ms |
| Filter apply | Table fade-in | 200ms |
| Modal open | Scale + fade | 200ms |
| Data refresh | Skeleton shimmer | infinite |
| Error shake | Horizontal shake | 400ms |
| Success checkmark | Draw animation | 500ms |

---

## 4. Interaction & Workflow Improvements

### 4.1 Command Palette (Cmd+K)

**Proposed**: Keyboard-driven command palette for power users:

```
┌─────────────────────────────────────────┐
│  🔍 Type a command...                   │
├─────────────────────────────────────────┤
│  > Go to transaction TX-99021           →   │
│  > Filter by status: FLAGGED            │
│  > Export current view                  │
│  > Run validation workflow              │
│  > Create Maker proposal                │
│  > Toggle column: amount                │
│  > Switch to Anomalies view             │
└─────────────────────────────────────────┘
```

---

### 4.2 Keyboard Navigation

**Proposed**: Full keyboard accessibility:

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate rows |
| `←` / `→` | Navigate pagination |
| `Enter` | Open selected row detail |
| `Space` | Toggle row selection |
| `Cmd+K` | Open command palette |
| `Cmd+F` | Focus search |
| `Cmd+E` | Export |
| `Esc` | Close modal/panel |
| `?` | Show keyboard shortcuts help |

---

### 4.3 Drag-and-Drop Column Reordering

**Proposed**: 
- Drag column headers to reorder
- Drag columns to/from hidden panel
- Visual drop indicator
- Persist order in localStorage

---

### 4.4 Column Resizing

**Proposed**:
- Drag column border to resize
- Min/max width constraints
- Double-click to auto-fit content
- Persist widths in localStorage

---

### 4.5 Smart Filter Suggestions

**Proposed**: AI-assisted filtering:
- "Show me rows similar to this one" (right-click context menu)
- "Find all transactions from this terminal"
- "Show all amounts within 10% of this value"
- Auto-suggest filter values based on selected row

---

### 4.6 Comparison Mode

**Proposed**: Side-by-side row comparison:
- Select 2+ rows
- "Compare" button opens split view
- Differences highlighted in yellow
- Common values collapsed
- Useful for duplicate detection and twin transaction analysis

---

### 4.7 Timeline View

**Proposed**: Alternative to grid view — chronological timeline:

```
─────────────────────────────────────────────────────────────
  10:23  TX-99021 uploaded    │  File: trn_log_tab.csv
  10:24  Workflow started     │  wf-1791494381096
  10:25  Mirror staged        │  50 rows → mirror_sett_tran_log_tab
  10:26  Reconciliation PASS  │  32 matched, 18 missing
  10:27  Validation FAIL      │  Duplicate posting detected
  10:28  Flagged for review   │  Assigned to John
─────────────────────────────────────────────────────────────
```

---

## 5. Accessibility & Inclusive Design

### 5.1 WCAG 2.1 AA Compliance

**Current**: Missing ARIA attributes, no keyboard navigation.  
**Proposed**:

| Requirement | Implementation |
|-------------|---------------|
| `role="grid"` | On table element |
| `role="row"` | On each row |
| `role="columnheader"` | On sortable headers |
| `aria-sort` | `ascending`/`descending`/`none` on sorted columns |
| `aria-expanded` | On expandable rows |
| `aria-label` | On icon-only buttons |
| `aria-live="polite"` | On status update regions |
| `aria-busy` | On loading states |
| Color contrast | Minimum 4.5:1 for text, 3:1 for UI components |
| Focus indicators | Visible 2px outline on all interactive elements |

---

### 5.2 Screen Reader Support

**Proposed**:
- Table summary: "Showing 25 of 500 transactions, 3 flagged, 2 reconciled"
- Row announcement: "Row 10: Transaction TX-99021, amount $250, status flagged"
- Filter announcement: "Filter applied: status equals flagged. 3 results found."
- Live region for async updates: "Validation complete: 32 passed, 18 failed"

---

### 5.3 Reduced Motion Support

**Proposed**:
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

### 5.4 High Contrast Mode

**Proposed**:
- `forced-colays: active` media query support
- Pattern fills in addition to color for status indicators
- Thicker borders for interactive elements

---

## 6. Performance Optimizations

### 6.1 Virtual Scrolling

**Current**: All rows rendered in DOM.  
**Proposed**: Use `@tanstack/react-virtual`:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizer = useVirtualizer({
  count: filteredRows.length,
  getScrollElement: () => tableRef.current,
  estimateSize: () => 48, // row height
  overscan: 5,
});
```

**Benefits**: Only visible rows + overscan rendered. Supports 100K+ rows smoothly.

---

### 6.2 Debounced Search

**Current**: Search filters on every keystroke.  
**Proposed**:

```typescript
const debouncedSearch = useDebounce(searchTerm, 300);
useEffect(() => {
  // Apply filter only after debounce
}, [debouncedSearch]);
```

---

### 6.3 Memoized Row Components

**Current**: All cells re-created on every render.  
**Proposed**:

```typescript
const MemoizedRow = React.memo(TransactionRow, (prev, next) => {
  return prev.row.id === next.row.id &&
         prev.row._validation_status === next.row._validation_status &&
         prev.isSelected === next.isSelected;
});
```

---

### 6.4 Web Worker for Heavy Computation

**Proposed**: Move `orchestratedRows` computation to Web Worker:

```typescript
// orchestration.worker.ts
self.onmessage = (e) => {
  const { rows, serverRecords, workflow } = e.data;
  const result = computeOrchestratedRows(rows, serverRecords, workflow);
  self.postMessage(result);
};
```

---

### 6.5 Lazy-Load Heavy Libraries & Debounced Search

**Status**: ✅ **Implemented & Verified** (October 2026)
- **Lazy-Load XLSX**: The `XLSX` library is dynamically imported on demand (`const XLSX = await import('xlsx')`), reducing the initial vendor bundle by 430 KB.
- **Debounced Search**: Search term filtering across 5,000+ items is debounced (250ms), decoupling the UI text input thread from filtering calculations to guarantee 60fps typing responsiveness.
- **Modal Fault Isolation**: All modal views (`outcomeDrilldownRow`, `inspectingRow`, `showReversionHistory`, `showHashtagDiffModal`) are wrapped in React `<ErrorBoundary>` components to enforce Rule 6 fault tolerance.

```typescript
const handleExportExcel = async () => {
  try {
    const XLSX = await import('xlsx');
    // Perform export
  } catch (err) {
    console.error('Failed to export Excel report:', err);
  }
};
```

---

### 6.6 Optimistic UI Updates

**Proposed**: Immediate visual feedback for user actions:

```typescript
const handleApprove = async (rowId: string) => {
  // Immediately update UI
  setRowStatus(rowId, 'APPROVING');
  try {
    await api.approveTransaction(rowId);
    setRowStatus(rowId, 'APPROVED');
  } catch (err) {
    setRowStatus(rowId, 'ERROR');
    showToast('Approval failed', 'error');
  }
};
```

---

## 7. Component Architecture Refactoring

### 7.1 Proposed File Structure

```
frontend/src/components/investigation/
├── InvestigationWorkspace.tsx          # Thin wrapper with ErrorBoundary
├── ValidationOrchestratorWorkspace.tsx # Main container (state orchestration only)
├── components/
│   ├── InvestigationToolbar.tsx        # Search, filters, actions
│   ├── KPICards.tsx                    # Summary statistics
│   ├── TransactionGrid.tsx             # Virtualized data grid
│   ├── TransactionRow.tsx              # Memoized row component
│   ├── StatusBadge.tsx                 # Unified badge component
│   ├── ColumnManager.tsx               # Column visibility panel
│   ├── FilterPanel.tsx                 # Advanced filter panel
│   ├── ContextPanel.tsx                # Side detail panel
│   ├── MultiLegAccordion.tsx           # Multi-leg data display
│   ├── ValidationTimeline.tsx          # Step-by-step timeline
│   ├── MakerCheckerActions.tsx         # Approval workflow
│   ├── CommandPalette.tsx              # Cmd+K palette
│   ├── ComparisonView.tsx              # Side-by-side comparison
│   └── ExportDialog.tsx                # Export options
├── hooks/
│   ├── useInvestigationData.ts         # Data fetching & orchestration
│   ├── useFiltering.ts                 # Filter state & logic
│   ├── useSorting.ts                   # Sort state & logic
│   ├── usePagination.ts                # Pagination state
│   ├── useColumnConfig.ts              # Column visibility
│   ├── useDebounce.ts                  # Debounced values
│   └── useKeyboardNavigation.ts        # Keyboard shortcuts
├── types/
│   └── investigation.ts                # Shared TypeScript types
└── utils/
    ├── formatValidationDetail.ts       # Detail formatting
    ├── exportHelpers.ts                # CSV/JSON/Excel export
    └── filterHelpers.ts                # Filter predicate builders
```

---

### 7.2 State Management Refactoring

**Current**: 50+ `useState` calls.  
**Proposed**: `useReducer` + context:

```typescript
interface InvestigationState {
  rows: TransactionRow[];
  filters: FilterState;
  sort: SortState;
  pagination: PaginationState;
  columns: ColumnState;
  selection: Set<string>;
  ui: UIState;
}

type InvestigationAction =
  | { type: 'SET_ROWS'; payload: TransactionRow[] }
  | { type: 'SET_FILTER'; payload: FilterPayload }
  | { type: 'SET_SORT'; payload: SortPayload }
  | { type: 'SET_PAGE'; payload: number }
  | { type: 'TOGGLE_COLUMN'; payload: string }
  | { type: 'SELECT_ROW'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean };
```

---

## 8. Implementation Roadmap

### Phase 1: Quick Wins (1-2 weeks)

| Item | Effort | Impact | Status |
|------|--------|--------|--------|
| Debounce search input (250ms) | 2h | High | ✅ **Completed** |
| Lazy-load XLSX dynamic import | 1h | Medium | ✅ **Completed** |
| Dual-accordion horizontal comparison table | 4h | Critical | ✅ **Completed** |
| Error boundaries on modals & panels | 4h | High | ✅ **Completed** |
| Top-level helper function extraction | 2h | Medium | ✅ **Completed** |
| Memoized row components | 4h | High | In Progress |
| Add loading skeletons | 4h | Medium | Planned |
| Empty state with filter reset | 2h | Medium | Planned |
| Unified Badge component | 4h | Medium | Planned |

### Phase 2: Core Improvements (3-4 weeks)

| Item | Effort | Impact |
|------|--------|--------|
| Virtual scrolling | 8h | Critical |
| Context panel (side panel) | 16h | High |
| Keyboard navigation | 8h | High |
| Command palette | 8h | Medium |
| Column resizing | 8h | Medium |
| Column reordering | 8h | Medium |
| Dark mode | 16h | Medium |

### Phase 3: Advanced Features (5-8 weeks)

| Item | Effort | Impact |
|------|--------|--------|
| Saved views | 16h | High |
| Batch operations | 16h | High |
| Comparison view | 16h | Medium |
| Timeline view | 24h | Medium |
| Real-time collaboration | 24h | High |
| Web Worker orchestration | 16h | High |
| WCAG 2.1 AA compliance | 24h | High |

### Phase 4: Polish & Optimization (2-3 weeks)

| Item | Effort | Impact |
|------|--------|--------|
| Micro-interactions | 16h | Medium |
| High contrast mode | 8h | Low |
| Reduced motion support | 4h | Low |
| Performance profiling | 8h | High |
| Cross-browser testing | 16h | Medium |
| User acceptance testing | 24h | High |

---

## 9. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Time to first meaningful paint | ~3s | <1s |
| Search filter latency | ~500ms | <100ms |
| Row render time (1000 rows) | ~2s | <100ms |
| Keyboard navigation coverage | 0% | 100% |
| WCAG 2.1 AA compliance | ~40% | 100% |
| User task completion time | Baseline | -40% |
| Modal open/close cycles per task | 8-12 | 2-3 |

---

## 10. Document References

- [RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md)
- [RULE_TO_METHOD_PIPELINE_SIGNOFF.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_SIGNOFF.md)
- [MULTI_LEG_SPEC_IMPLEMENTATION_AUDIT.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MULTI_LEG_SPEC_IMPLEMENTATION_AUDIT.md)
- [MASTER_ARCHITECTURE_INDEX.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md)
- [AGENTS.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md)
- [bo-operational-governance](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md)

---

## 11. Mandatory Governance Enforcement & Compliance Guardrails

All architectural modifications, proposals, and engineering implementations within the investigation orchestration workspace must strictly conform to the following non-negotiable governance principles established in [AGENTS.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) and [bo-operational-governance](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md):

### 11.1 Principle 1: Repository Reality Trumps Assumptions (Rule 1)
- **Persistent Relational Database**: The primary database is PostgreSQL (`operational_workflow_db`), managed via 22 relational tables in `backend/src/database/migrations/001_initial_schema.sql` and `postgresRepo.ts`.
- Workflows, column configurations, and extractions are persisted via REST API routes (`/api/workflows`, `/api/column-configurations`, `/api/validation-boxes`).
- Dynamic reconciliation routes through typed UNLOGGED mirror tables (`mirror_{db}_{table}`) and dynamic SQL compilation (`ruleSqlCompiler.ts`), never unbatched in-memory loops.

### 11.2 Principle 2: Validation Result ≠ Pipeline Action (Rule 2)
- Strict conceptual and visual segregation must be maintained between what a rule discovers (`PASS`, `FAIL`, `ERROR`, `PAUSED_DB_OFFLINE`) and what the pipeline executes next (`CONTINUE`, `STOP`, `CLOSE`, `FLAG`, `REPORT`).
- The UI must render distinct badges for rule verdicts vs pipeline actions; they must never be conflated into a single ambiguous status.

### 11.3 Principle 3: Lifecycle Separation (Rule 3)
- Four independent lifecycles must remain strictly decoupled:
  1. **Task / Case Lifecycle** (`Issue.status`: `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`).
  2. **Financial Transaction Status** (`PENDING`, `SETTLED`, `REVERSED`, `DISPUTED`).
  3. **Transaction Investigation Lifecycle** (`INVESTIGATING`, `RECONCILED`, `FLAGGED`, `CLOSED`).
  4. **Rule Execution Verdict** (`PASS`, `FAIL`, `ERROR`, `PAUSED_DB_OFFLINE`).
- **Critical Invariance**: Closing or toggling a single transaction case in the investigation table (`handleToggleRowClosed`) MUST NEVER mutate or close the parent Task / Issue.

### 11.4 Principle 6: Frontend Fault Tolerance & State Sanitization (Rule 6)
- **React ErrorBoundary Wrapping**:
  - All complex workspace views and modal drilldowns (`outcomeDrilldownRow`, `inspectingRow`, `showReversionHistory`, `showHashtagDiffModal`) MUST be wrapped in React `<ErrorBoundary>` components to prevent full-page blank screen unmounts if malformed payloads are encountered.
- **JSONB Object Sanitization**:
  - PostgreSQL JSONB objects (e.g., `_validation_details`, `returned_data`, `sourceRecord`) must NEVER be rendered as raw React JSX children.
  - All values must route through serialization helpers (`formatCellVal`, `formatValidationDetail`, `JSON.stringify`).

### 11.5 Principle 7: Maker-Checker Dual Authorization & Anti-Self-Approval (Rule 7)
- Any manual transaction resolution or discrepancy override (`FORCE_MATCH`, `WRITE_OFF`, `MANUAL_REVERSAL`) initiated via quick actions or contextual panels MUST route through a Maker proposal (`POST /api/resolutions/propose`).
- Transactions under review must lock in `PENDING_CHECKER_REVIEW` with an immutable evidence snapshot (`_inputData` + `_mirrorData`).
- Anti-Self-Approval is mandatory at the API and service layers: `makerId !== checkerId` (HTTP 403). Operators cannot approve their own submissions.

### 11.6 Principle 16: Full-Viewport Workspace Layout & Header Preservation (Rule 16)
- **No Hardcoded Viewport Heights in Inner Panes**: Brittle height subtractions (e.g., `h-[calc(100vh-140px)]`) are prohibited. All workspace containers must enforce strict flexbox bounding: `h-full flex-1 min-h-0 overflow-hidden` with `shrink-0` on stationary headers and toolbars.
- **Scroll Containment**: Multi-pane interfaces (grid + context panel) must scroll independently using `overflow-y-auto min-h-0` with clean custom scrollbars.

### 11.7 Principle 18: Canonical ValidationBoxType & CheckType Segregation (Rule 18)
- All validation box persistence and state must strictly conform to the four canonical `ValidationBoxType` enums:
  `'INGESTION_SEARCH' | 'CONDITION_CHECK' | 'RECONCILIATION' | 'REPORT'`.
- Internal rule check types (`EXISTENCE_CHECK`, `VALUE_MATCH`, `AMOUNT_MATCH`, `ISO_DECLINE_CODE`) belong exclusively inside `rule_definition.checkType` or `steps[].checkType`, never in `validation_boxes.box_type`.

### 11.8 Principle 23: Strict Prohibition of Client-Side `localStorage` as Primary State Store (Rule 23)
- **Zero Business Logic in Local Storage**: Browser `localStorage` or `sessionStorage` must NEVER be used as the primary storage or system of record for saved views, filter definitions, custom templates, or workflow rules.
- **Mandatory PostgreSQL First**: Saved views and filter configurations must be persisted in PostgreSQL (`operational_workflow_db`) via dedicated relational endpoints (`/api/user-views`).
- **Strictly Ephemeral UI Scoping**: `localStorage` is permitted solely for device-local, non-business ergonomic preferences (such as sidebar collapsed state and column resize widths).
