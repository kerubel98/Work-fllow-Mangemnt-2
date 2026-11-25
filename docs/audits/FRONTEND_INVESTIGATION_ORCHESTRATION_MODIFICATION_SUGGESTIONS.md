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
12. [Task ISS-6362 Audit Verification & Per-Validation-Step Accordion Architecture](#12-task-iss-6362-audit-verification--per-validation-step-accordion-architecture)
13. [Schema-Agnostic Deduplication, Null-Only Column Pruning & Interactive Filter-Highlight](#13-schema-agnostic-deduplication-null-only-column-pruning--interactive-filter-highlight-october-2026)
14. [Investigation Workspace Streamlining, Single Workflow Selector, Validation Status Column Filter & Scoped Actions Architecture](#14-investigation-workspace-streamlining-single-workflow-selector-validation-status-column-filter--scoped-actions-architecture)

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

---

## 12. Task ISS-6362 Audit Verification & Per-Validation-Step Accordion Architecture

### 12.1 Real-World Task ISS-6362 Audit & Leg Count Rectification

During real-data auditing of Task `ISS-6362` (`operational_workflow_db.task_dataset_transactions`), discrepancy analysis identified duplicate leg counting in the frontend investigation inspector modals (`inspectingRow` and `outcomeDrilldownRow`):

| Transaction Reference (`fe_utrnno`) | Row Number | Defect (Pre-Fix Display) | Physical DB Ground Truth | Corrected Display | Resolution Status |
|-------------------------------------|------------|-------------------------|--------------------------|-------------------|-------------------|
| `2597220450` | Row 1 | 12 Legs | 6 Physical Records in `tran_log_tab` | 6 Legs | ✅ VERIFIED & FIXED |
| `2689236323` | Rows 7, 8, 9 | 6 Legs | 3 Physical Records in `tran_log_tab` | 3 Legs | ✅ VERIFIED & FIXED |
| Non-Matching Samples (e.g. `2597220480`) | Rows 22–39 | 0 Rows | 0 Records in `sett_tran_log_tab` | 0 Rows (Clean empty state) | ✅ VERIFIED & FIXED |

#### Root Cause Analysis
1. **Multi-Source Alias Envelope Duplication**: In PostgreSQL `task_dataset_transactions.returned_data`, external lookup results were stored under both `'default'` and the active workflow key (`wf-1790956098575`), targeting aliases `sett_tran_log_tab` and `tran_log_tab`.
2. **Compound Table-Prefixed Deduplication Key**: The helper `extractRowLegs` constructed its deduplication key as `${tblName}_${hisId}`. Because the same physical transaction leg (`TR_HIS_ID`) was projected through both table alias envelopes, it received two separate keys (`sett_tran_log_tab_414164` and `tran_log_tab_414164`), doubling the leg count from 6 to 12 and 3 to 6.
3. **Rectification**:
   - Extraction is scoped strictly to `activeWorkflow.id` whenever workflow-specific response data is present.
   - Deduplication keying is bound directly to the unique physical ledger history ID: `hisId ? `his_${hisId}` : ...`, preventing duplicate counting across table aliases.

---

### 12.2 Per-Validation-Step Accordion Architecture

In adherence to the core objective—**giving investigators a transparent, purpose-driven view of what occurred throughout the workflow process**—the inspector interface was refactored from a monolithic flat table into dedicated per-step accordions.

#### 1. Architectural Blueprint
Instead of cramming multiple heterogeneous checks (ingestion lookups, multi-leg cardinality, table rules, and field comparisons) into a single flat table, each stage/step executes as an independent collapsible unit:

```
┌────────────────────────────────────────────────────────────────────────┐
│ [Accordion 1] Data Comparison: Input Data vs Returned DB Data (Unified) │
└────────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────────┐
│ [Accordion 2 Container] Workflow Process Stages & Validation Steps      │
│  [Expand All Steps] [Collapse All Steps]                               │
│                                                                        │
│  ▼ STEP #1: Target Ingestion & Ledger Lookup          [PASS] ➔ CONTINUE │
│    • Target DB: private_recon_db • Table: tran_log_tab                 │
│    • Ingress Query Parameters: [fe_utrnno, amount, proc_name]          │
│    • Query Ingress Match Result: 6 Legs Detected                       │
│                                                                        │
│  ▼ STEP #2: Multi-Leg Cardinality Evaluation          [PASS] ➔ CONTINUE │
│    • Cardinality Policy: EXACT_ONE • Total Legs: 6                     │
│    • Settlement Legs: 6 • Reversals (RVS): 0                           │
│    • Leg Grid: Breakdown of each leg amount, proc, and BO type         │
│                                                                        │
│  ▼ STEP #3: Amount & Currency Validation Step         [PASS] ➔ CONTINUE │
│    • Check Type: EQUALITY_MATCH                                        │
│    • Parameter Comparison Table:                                       │
│      ├── reqamt: 1,500.00 (Input) == 1,500.00 (DB)  [MATCH]            │
│      └── curr:   USD      (Input) == USD      (DB)  [MATCH]            │
│                                                                        │
│  ▼ STEP #4: Step Payload & Diagnostics Disclosure                      │
│    • Full JSONB envelope inspection with 1-click clipboard copy        │
└────────────────────────────────────────────────────────────────────────┘
```

#### 2. Key UX Improvements
- **Purpose-Driven Process Clarity**: The investigator immediately sees the chronological pipeline execution order (Ingestion Lookup $\rightarrow$ Cardinality Check $\rightarrow$ Field Validations $\rightarrow$ Table Rules).
- **Direct Parameter Comparison**: Field-level validation steps feature a dedicated parameter comparison table highlighting exact input values against target database values with color-coded `[MATCH]` or `[MISMATCH]` badges.
- **Independent State Control**: Operators can expand or collapse individual steps or toggle all steps simultaneously via `Expand All Steps` and `Collapse All Steps`.
- **Fault Tolerance**: Wrapped in React `<ErrorBoundary>` with complete serialization of all JSONB payloads (`formatCellVal`, `formatValidationDetail`) to prevent render crashes.

---

### 13. Schema-Agnostic Deduplication, Null-Only Column Pruning & Interactive Filter-Highlight (October 2026)

#### 1. Schema-Agnostic Leg Identification (Rule 4: External System Agnosticism)
- **Eliminated Hardcoded Key Assumptions**: Removed all hardcoded assumptions on `TR_HIS_ID`, `FE_UTRNNO`, `ACCT_NUM1`, and `PROC_NAME`.
- **Dynamic Technical ID & PK Resolution**: Inspects record properties dynamically for any key matching `id`, `*_id`, or `_mirror_id`.
- **Canonical Content Signature Fallback**: When no primary key exists, constructs a deterministic content signature from non-metadata scalar values:
  `Object.entries(p).filter(([k, v]) => !k.startsWith('_') && typeof v !== 'object').sort().map(([k, v]) => `${k.toLowerCase()}:${String(v).trim().toLowerCase()}`).join('|')`
- **Dynamic Action / Status / Type Classification**: Automatically maps record classification from any present candidate key (`proc_name`, `bo_type`, `legtype`, `type`, `action`, `status`) without assuming schema naming.

#### 2. Automatic Null-Only Column Pruning
- **Zero-Value Clutter Elimination**: In both manual cross-check (`outcomeDrilldownRow`) and in-flight inspection (`inspectingRow`), columns where every record (Input Baseline, Target Record, and all returned DB records) has `null`, `undefined`, or empty string `""` are filtered out (`activeComparisonColumns` / `activeInspectComparisonColumns`).
- **Removed Hardcoded Column Arrays**: Completely removed static column lists (`['transaction_id', 'retrieval_ref_num', ...]`), ensuring the table projects only actual parameters and real data columns.

#### 3. Slim `w-16` Source Column & Viewport Optimization
- **Replaced Bulky First Column**: The previous `Data Record Source` column (`min-w-[200px]`) consumed excessive horizontal width, forcing critical data columns off-screen.
- **Ultra-Compact Sticky Badge**: Replaced with a slim 64px `w-16` sticky header (`Source`) with compact badges (`[INPUT]`, `[DB #1]`, `[DB #2]`), freeing up >136px of view space.

#### 4. Interactive Filter View Toolbar & Row Highlighting
- **Clickable Filter View Buttons**:
  - `All Records`: Resets focus and displays all records with standard alternating styles.
  - `Input Data (Task)`: Directly highlights the Input Baseline row with a prominent blue focus ring (`ring-2 ring-blue-500 bg-blue-100/90 font-bold`).
  - `Returned DB Data`: Highlights all returned external DB records simultaneously (`ring-2 ring-indigo-500 bg-indigo-50/80 font-semibold`).
  - `DB #N (Record Details)`: Highlights the specific external DB leg in the comparison grid.
- **Focus Sub-Banner**: When any filter is activated, displays a high-contrast focus banner explaining the active highlight with a 1-click `Clear Focus` button.

---

## 14. Investigation Workspace Streamlining, Single Workflow Selector, Validation Status Column Filter & Scoped Actions Architecture

### 14.1 Problem Statement & Architectural Defect Analysis

As the investigation workspace grew in functional scope, the visual layout accumulated redundant controls, repetitive user interactions, and visual noise:

1. **Toolbar Button Clutter & Triplicate Workflow Selectors**:
   - The top toolbar contained **three separate workflow selectors**:
     1. An in-flight evolution button (`Swap WF`),
     2. A secondary popup button (`Select Workflow`), and
     3. An inline `<select>` element (`Workflow Picker`).
   - Having three different controls doing the exact same task crowded out screen real estate and confused operators.

2. **Conflation of Column Header with Workflow Switcher**:
   - The table header for `Validation Status` embedded a custom workflow switcher popover (`Conducted Workflows Filter Popover Menu`) and an inline `<select>` element, preventing operators from performing a normal column filter on validation statuses (`PASS`, `FAIL`, `RECONCILED`, `PENDING`).
   - Simultaneously, a redundant standalone status button strip (`Status: ALL | INVESTIGATING | FLAGGED | RECONCILED | CLOSED`) was taking up space in the top toolbar.

3. **Redundant Bottom Sheet Tabs**:
   - The bottom Excel-style sheet tabs included dedicated tabs for `Anomalies` and `Clean`. Because these are simple filtered views of the main dataset, having separate tabs was unnecessary clutter when status filtering can be performed directly on the column.

4. **Rigid Dataset-Wide Validation Trigger**:
   - The `▶ Run Validation` button executed exclusively against the full dataset (`effectiveRows`), offering operators no way to re-validate only an active filtered subset of records (e.g., re-running only flagged transactions after staging a fix).

5. **Popover Dismissal Frustration**:
   - Column filter popovers lacked an outside-click listener, forcing users to click specific sub-buttons or leaving popovers floating over table data.

6. **Action Column Overhead**:
   - An `Actions` column existed on every row of the table, displaying multiple buttons (`Trace DB`, `Close Txn`, `Revert`, `Copy SQL`, `Hide`). This forced operators into tedious row-by-row interactions instead of allowing batch/scoped operations.

---

### 14.2 Core Architectural Principles & Specification

#### 14.2.1 Header De-Cluttering & Consolidation to Exactly ONE Workflow Selector
* **Single Source of Truth**: The top toolbar preserves **exactly ONE** workflow selector.
* **Component Form**: A unified, styled `<select>` element (or dropdown menu) grouping:
  - **Conducted Workflows (Task History)**: Shows workflows previously executed on this task, marked with `★ (Latest)` or `✓ (Conducted)` and execution timestamp/metrics.
  - **Available Workflows**: Shows all other active workflows registered in PostgreSQL.
* **Removed Buttons**: The redundant `Swap WF` button and `Select Workflow` dropdown button are completely removed.

#### 14.2.2 Active Workflow Display Alongside "Reset Row Filter"
* The name and version of the currently active workflow are cleanly rendered as an informational status pill in the Secondary Ribbon/Status Banner right alongside the `Reset Row Filter` control:
  ```
  [Active Workflow: Settlement Multi-Leg Recon v2]  [Reset Row Filter]  [Show All Columns]
  ```

#### 14.2.3 Native Column Filter for "Validation Status" & Removal of Header Status Bar
* **Removal of Header Status Bar**: The top-level `Status: ALL | INVESTIGATING | FLAGGED | RECONCILED | CLOSED` button strip is removed from the header.
* **Native Column Filter UX**: The `Validation Status` column header receives the standard, robust column filter popover:
  - Text search for status values (`PASS`, `FAIL`, `PENDING`, `CRITICAL`, `WARNING`).
  - `Select All` and `Clear` shortcuts.
  - Interactive checkboxes for each distinct validation status present in the dataset.
  - Active filter icon indicator when a status filter is engaged.

#### 14.2.4 Streamlining Bottom Sheet Tabs
* The **`Anomalies`** and **`Clean`** sheet tabs are removed from the bottom tab bar.
* Retained tabs:
  1. **Task Transactions (`dataset`)**: Primary spreadsheet grid containing all rows and validation verdicts.
  2. **Central Repo Cross-Check (`sheet1_central`)**: Master reference comparison against PostgreSQL central repository.
  3. **Attachments (`attachments`)**: Visible dynamically only when attached message/reconciliation files exist for the task.

#### 14.2.5 Scoped Validation Execution Engine (Filtered Rows vs All Rows)
* The `handleRunValidation` function is upgraded to accept an execution target scope:
  ```typescript
  handleRunValidation(forceRerun: boolean, scope: 'ALL' | 'FILTERED'): Promise<void>
  ```
* When active column filters, search terms, or duplicate filters are present:
  - The `▶ Run Validation` button provides a clear scope toggle or dropdown option:
    - `▶ Run on Filtered Rows ({count})` (Recommended when filters active)
    - `▶ Run on All Rows ({total})`
  - When no filters are active, it runs on all rows by default.

#### 14.2.6 Click-Outside Popover Dismissal & Filter Invariance
* All column filter popovers are wrapped with an outside-click handler (via `useRef` + document `mousedown` listener or invisible full-screen dismissal backdrop).
* Clicking anywhere outside an open filter popover immediately and smoothly dismisses it without applying unintended side-effects.

#### 14.2.7 Per-Row Action Column Removal & Unified Top-Level Scoped Action Engine
* **Table Cleanup**: The `Actions` `<th>` and `<td>` are completely removed from the table grid.
* **Unified Action Button in Toolbar**: A top-level **"⚡ Actions"** dropdown button is placed in the primary toolbar.
* **Scope-Aware Execution**:
  - **Clicked / Selected Row**: Operates on the currently highlighted or selected transaction row.
  - **Filtered Rows**: Operates on all rows currently visible under the active column/search filters.
  - **All Rows**: Operates across the entire task dataset.
* **Available Action Operations**:
  1. **Run #Hashtag**: Triggers the universal hashtag resolution engine (e.g. `#AIB_SETTLEMENT_2026`) on the scoped records, evaluating external database dry-runs or staging Maker proposals.
  2. **Batch Investigation Status**: Change status to `CLOSED`, `RECONCILED`, or `INVESTIGATING` across scoped rows.
  3. **Batch Revert**: Roll back staged changes across scoped rows to pre-change snapshot.
  4. **Inspect in Modal**: Opens deep multi-leg comparison drilldown for the selected row.

---

### 14.3 Phased Engineering Implementation Plan

| Phase | Target Component | Description & Scope |
|-------|------------------|---------------------|
| **Phase 1** | `ValidationOrchestratorWorkspace.tsx` (Toolbar) | Remove duplicate `Swap WF` and `Select Workflow` buttons. Consolidate to single `<select>` workflow picker. Display active workflow pill alongside `Reset Row Filter`. |
| **Phase 2** | `ValidationOrchestratorWorkspace.tsx` (Table Headers) | Remove embedded workflow switcher from `Validation Status` column header. Implement native column filter popover for validation statuses (`PASS`, `FAIL`, etc.). Remove top-level header status button strip. |
| **Phase 3** | `ValidationOrchestratorWorkspace.tsx` (Sheet Tabs) | Remove `anomalies` and `reconciled` sheet tabs from bottom tab bar. Align active tab state to `'dataset' \| 'sheet1_central' \| 'attachments'`. |
| **Phase 4** | `ValidationOrchestratorWorkspace.tsx` (Engine) | Upgrade `handleRunValidation` to support executing against `filteredAndSortedRows` when scoped, sending targeted records to `api.executeUniversalWorkflow`. |
| **Phase 5** | `ValidationOrchestratorWorkspace.tsx` (Actions) | Remove per-row `Actions` column from table. Implement top-level `Actions` dropdown with scope selection (`Selected Row`, `Filtered Rows`, `All Rows`) and operations (`Run #Hashtag`, `Batch Status`, `Batch Revert`). Add click-outside dismiss listeners to all filter popovers. |

---

### 14.4 Formal Acceptance Criteria & Verification Matrix

#### Criterion 1: Single Toolbar Workflow Selector Invariance
* **Given** an operator is viewing the Investigation Workspace on any task,
* **When** inspecting the top toolbar,
* **Then** there must be **exactly ONE** workflow selector component present, cleanly displaying conducted and available workflows without duplicate `Swap WF` or `Select Workflow` modal buttons.

#### Criterion 2: Active Workflow Attribution Display
* **Given** a workflow is selected or active,
* **When** viewing the ribbon banner below the toolbar,
* **Then** the active workflow name must be prominently displayed as an informational pill alongside the `Reset Row Filter` button.

#### Criterion 3: Validation Status Column Filter Functionality
* **Given** validation results are loaded for the dataset (`PASS`, `FAIL`, `PENDING`),
* **When** the operator clicks the filter icon on the `Validation Status` column header,
* **Then** a standard column filter popover opens listing the distinct validation statuses with checkboxes, allowing filtering by `PASS`, `FAIL`, etc., without showing any workflow selection dropdowns.

#### Criterion 4: Click-Outside Popover Dismissal
* **Given** any column filter popover is currently open,
* **When** the operator clicks anywhere on the page outside the popover boundary,
* **Then** the popover immediately closes cleanly without triggering table cell selections or side-effects.

#### Criterion 5: Bottom Sheet Tab Streamlining
* **Given** the bottom Excel-style sheet tab bar,
* **When** inspecting available tabs,
* **Then** only `Task Transactions`, `Central Repo Cross-Check`, and `Attachments` (if files exist) are present; `Anomalies` and `Clean` tabs are completely absent.

#### Criterion 6: Filtered Rows Validation Execution
* **Given** an active filter is applied showing a subset of 20 rows out of 500 total rows,
* **When** the operator clicks `Run Validation`,
* **Then** the validation engine executes strictly on the 20 filtered rows, updating backend verdicts and UI statuses for those records without requiring a full-dataset rerun.

#### Criterion 7: Unified Scoped Action Engine & Row-Level Action Removal
* **Given** the main dataset table,
* **When** inspecting table headers and rows,
* **Then** no per-row `Actions` column exists.
* **When** the operator clicks the top-level `Actions` button in the toolbar,
* **Then** a scoped action menu opens allowing execution of actions (including `#Hashtag` execution, Batch Status toggle, and Revert) across Selected, Filtered, or All rows.

---

### 14.5 Post-Implementation Rectification Log (2026-10-16)

1. **Hoisting & Temporal Dead Zone (TDZ) Fix**:
   - **Defect**: Vite minified `evaluateWorkflowOutcome` to `Ca`. In `ValidationOrchestratorWorkspace.tsx`, `evaluateWorkflowOutcome` was defined at line ~2752 using `const`, but was referenced during initial render at lines ~1981-2081 within `getUniqueColumnValues` and `filteredAndSortedRows`. This triggered a runtime `ReferenceError: Cannot access 'Ca' before initialization`.
   - **Fix**: Relocated `OutcomeEvaluation` interface and `evaluateWorkflowOutcome` up before `batchExecutionPlans`, `getUniqueColumnValues`, and `filteredAndSortedRows`. Automated bundle AST verification confirmed 0 uses before definition.
2. **Complete Row-Level Action Column Removal**:
   - **Defect**: While the header `<th className="... Actions ...">` was removed, the corresponding row-level `<td className="py-1 px-2 ... Action Tools">` was still rendering in each row's `<tr>`, causing table column offset mismatch and visible per-row buttons.
   - **Fix**: Surgically removed the row-level Action Tools `<td>` block from the main dataset table body. All row actions are now governed exclusively by the top-level `⚡ Actions` dropdown targeting Active Row, Filtered Rows, or All Rows.
3. **Modal `isNotFoundInDb` Scope Resolution**:
   - **Defect**: Inside `renderDatabaseInspectorModal`, `isNotFoundInDb` was referenced at line 7894 while the scoped variable was `inspectIsNotFoundInDb`, throwing a runtime `ReferenceError` when opening inspection modal.
   - **Fix**: Replaced with `inspectIsNotFoundInDb`.
4. **Column & Validation Status Filter Engine Hardening**:
   - **Defect**: `state.selectedValues !== null` was evaluating to `true` when `selectedValues` was `undefined`, falsely marking columns as filtered and crashing set operations. In addition, `rowKeyCandidates` in `evaluateWorkflowOutcome` did not include raw row numbers (`'1'`, `'2'`, etc.), preventing matching against backend execution results and causing PASS records to misclassify as PENDING/FAIL.
   - **Fix**: Replaced with loose null check `selectedValues != null`, expanded `rowKeyCandidates` with numerical string keys (`_rowNumber`, `row_number`, `rowId`), fixed Select All / Clear toggles, and added `activeWorkflow` to `filteredAndSortedRows` dependency array.
### 14.6 Toolbar Stabilization, Permanent Force Re-run & Investigation Status Filter Architecture (2026-10-17)

1. **Toolbar Layout Shifting Elimination & Stationary Status Telemetry**:
   - **Root Cause**: The conditional execution summary badge (`Evaluated on Task: X PASS / Y FAIL | Force Re-run`) was conditionally mounted in the top-right toolbar on validation completion. Because its presence and text length fluctuated between un-evaluated and evaluated states, it dynamically pushed adjacent buttons, breaking visual stability.
   - **Rectification**: Removed the conditional badge from the green header. Relocated the task evaluation telemetry (`Evaluated on Task: X PASS / Y FAIL` with execution duration) down into the stationary black status bar (`bg-slate-900 text-white`) alongside overall aggregate counts (`Total`, `Reconciled`, `Flagged`, `Closed`) and parent case status.

2. **Permanent Force Re-run Button Beside Workflow Selector**:
   - **Placement**: Permanently rendered in the top toolbar directly beside the interactive Workflow Selector trigger button.
   - **State Handling**: Dynamically activated and styled in high-visibility amber/gold (`bg-amber-400 hover:bg-amber-300 text-slate-950`) when an active workflow is selected; cleanly dimmed and disabled (`cursor-not-allowed bg-black/20 text-white/40`) when no active workflow is selected or during active verification. Never mounts or unmounts, guaranteeing zero toolbar layout shifts.

3. **Streamlined Top Toolbar (Removal of Flagged/Clean Pills & Batches Dropdown)**:
   - **Removal of Redundant Quick Pills**: Removed `All / Flagged / Clean` quick filter pills from the top toolbar to eliminate clutter and duplication.
   - **Relocation of Batches Dropdown**: Moved the `All Batches` selector (`availableBatches`) out of the top toolbar down into the black status bar, styling it with dark theme ergonomics (`bg-slate-800 border-slate-600 text-white focus:ring-emerald-500`).

4. **Native Column Filter on Investigation Status**:
   - **Table Header Integration**: Upgraded the `Investigation Status` column header (`<th>`) with a full native column filter button and popover matching the Excel spreadsheet experience:
     - Ascending / Descending sorting (`Sort Status (A to Z)` / `Sort Status (Z to A)`).
     - Live search filter input for instant status filtering.
     - Select All / Clear toggles.
     - Per-status checkboxes with colored lifecycle badges (`RECONCILED`, `FLAGGED`, `CLOSED`, `PENDING`) and live row counts.
     - Full click-outside auto-dismissal.
   - **Filter & Sort Engine Integration**: Extended `getUniqueColumnValues`, `filteredAndSortedRows`, and column sort comparator to natively recognize `'investigationStatus'` and `'investigation_status'`.

### 14.7 Investigation Outcome Integrity & Filter Rectification (2026-10-17)

1. **Clear Results Dummy Failed Status Elimination**:
   - **Defect**: When clicking "Clear Results", the backend previously deleted records from `task_workflow_executions`, but left `canonical_data._validation_status = 'FAIL'` intact on `task_dataset_transactions` rows. Because the evaluation engine detected stale row validation flags while the target record was absent, `evaluateWorkflowOutcome` synthesized a dummy `FAIL` ("Record not found in target database") across all records.
   - **Fix**:
     - Upgraded `postgresRepo.clearTaskWorkflowExecutions` to strip all validation evaluation keys (`_validation_status`, `_validation_workflow_id`, `_validation_details`, `returned_data`, `_target_record`, `_workflow_runs`) from `task_dataset_transactions.canonical_data` and reset `issues.validation_status` to `'PENDING'`.
     - In `handleClearResults`, purged local `taskDatasetRows` validation metadata and notified the parent issue to reset `validationStatus: 'PENDING'`.
     - In `evaluateWorkflowOutcome`, enforced that un-conducted or cleared workflows unconditionally resolve to `status: 'PENDING'` (`Pending Verification`), never synthesizing dummy failed checks.

2. **Conducted Workflow Persistence & Automatic Reversion Elimination**:
   - **Defect**: When executing a newly selected workflow, `onUpdateIssue` updated parent issue state without passing `workflowId: activeWorkflow.id`. The task's `workflowId` remained pinned to the first or default workflow. When the parent component re-rendered, an unconstrained `useEffect` detected `selectedIssue.workflowId !== activeWorkflow.id` and forcibly reset `activeWorkflow` back to the first workflow.
   - **Fix**:
     - Instrumented `previousTaskIdRef` in `ValidationOrchestratorWorkspace` to guarantee that workflow auto-initialization executes strictly on initial task mount, never overriding `activeWorkflow` on intra-task state updates.
     - Updated `handleRunValidation` to pass `workflowId: activeWorkflow.id` to `onUpdateIssue` and persist it to PostgreSQL via `api.updateIssue`, permanently binding the conducted workflow to the task.

3. **Validation & Investigation Status Table View Filter Responsiveness**:
   - **Defect**: Selecting status values in the `Validation Status` or `Investigation Status` column filter popovers failed to update the visible table view when `currentPage` remained out of bounds for the filtered row count, or when mismatching workflow contexts evaluated all rows as failed.
   - **Fix**:
     - Added an automatic page reset hook (`setCurrentPage(1)`) triggered whenever `columnFilters`, `duplicateFilter`, `debouncedSearchTerm`, or `activeWorkflow` changes.
     - Standardized `columnFilters['workflow_outcome']` and `columnFilters['investigationStatus']` matching against evaluated cell outcomes, ensuring immediate table view re-rendering and precise row isolation upon checkbox selection.
