/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Issue, DatabaseConnection, EnvironmentSystem, HashtagPreset, QueryApprovalRequest, User,
  DatabaseValidationWorkflow, ProcessingStage, ValidationResultStatus, PipelineAction,
  TransactionInvestigationStatus, TransactionExecutionSummary, RuleExecutionAuditEntry
} from '../../types';
import { executeBatchInvestigation } from '../../services/investigationEngine';
import { aggregateParentIssueStatus } from '../../services/statusAggregator';
import { createBatchPlan } from '../../services/batchPlanner';
import { api } from '../../api/client';
import { 
  Database, Search, Download, Terminal, Copy, Check, Filter, 
  Eye, EyeOff, Plus, X, Server, ChevronRight, Play, Code2, Table,
  CheckCircle2, AlertTriangle, RefreshCw, FileSpreadsheet,
  Layers, SlidersHorizontal, ArrowUpDown, ChevronDown, ArrowUpAZ, ArrowDownZA,
  Sliders, ShieldAlert, CheckSquare, Square, RotateCcw, ShieldCheck, CheckCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';

export interface StepExecutionResult {
  stepId: string;
  status: 'PASSED' | 'FAILED' | 'WARNING' | 'SKIPPED';
  badgeText: string;
  detail: string;
  dbValue?: any;
  resultStatus?: ValidationResultStatus;
  actionTaken?: PipelineAction;
  stageName?: string;
}

export interface OrchestratedRow {
  rowId: string;
  sourceRecord: Record<string, any>;
  stepResults: Record<string, StepExecutionResult>;
  overallSeverity: 'CRITICAL' | 'WARNING' | 'RECONCILED' | 'MISSING';
  overallSummary: string;
  remedySql?: string;
  executionSummary?: TransactionExecutionSummary;
  investigationStatus: TransactionInvestigationStatus;
  isClosed: boolean;
  isHalted: boolean;
}


interface ColumnFilterState {
  sortDirection: 'asc' | 'desc' | null;
  selectedValues: Set<string> | null; // null means all values are selected
}

interface ValidationOrchestratorWorkspaceProps {
  issues: Issue[];
  selectedIssueId: string;
  onSelectIssueId: (id: string) => void;
  currentUser: User;
  users: User[];
  databases: DatabaseConnection[];
  systems: EnvironmentSystem[];
  hashtags: HashtagPreset[];
  onUpdateIssue: (issueId: string, updates: Partial<Issue>) => void;
  onDeleteIssue?: (issueId: string) => void;
  onSendChatMessage: (issueId: string, text: string) => void;
  onSubmitQueryApproval?: (request: Omit<QueryApprovalRequest, 'id' | 'status' | 'requestDate'>) => void;
  onOpenNewCase?: () => void;
}

export default function ValidationOrchestratorWorkspace({
  issues,
  selectedIssueId,
  onSelectIssueId,
  databases,
  onOpenNewCase
}: ValidationOrchestratorWorkspaceProps) {
  const selectedIssue = issues.find(i => i.id === selectedIssueId) || issues[0];
  
  // Dynamic dataset rows loaded strictly for the currently selected task
  const [taskDatasetRows, setTaskDatasetRows] = useState<any[]>(() => {
    return selectedIssue?.firstLevelMappedData || [];
  });
  const [isLoadingDataset, setIsLoadingDataset] = useState<boolean>(false);

  // Available batches for the current task
  const [availableBatches, setAvailableBatches] = useState<{ batchId: string; count: number }[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('ALL');

  // Load task dataset transactions strictly for this task from PostgreSQL/memory
  useEffect(() => {
    if (!selectedIssue?.id) {
      setTaskDatasetRows([]);
      setAvailableBatches([]);
      return;
    }

    setSelectedBatchId('ALL');

    // Seed immediately with in-memory task data if present
    if (selectedIssue.firstLevelMappedData && selectedIssue.firstLevelMappedData.length > 0) {
      setTaskDatasetRows(selectedIssue.firstLevelMappedData);
    } else {
      setTaskDatasetRows([]);
    }

    setIsLoadingDataset(true);

    // Fetch batches for this task
    api.getTaskBatches(selectedIssue.id)
      .then((res: any) => {
        const list = Array.isArray(res) ? res : (res?.batches || []);
        setAvailableBatches(list);
      })
      .catch(e => console.warn('Could not load task batches:', e));

    // Fetch actual transactions stored for this specific task
    api.getTaskTransactions(selectedIssue.id, 1, 5000)
      .then((res: any) => {
        if (res && Array.isArray(res.rows) && res.rows.length > 0) {
          setTaskDatasetRows(res.rows);
        } else if (selectedIssue.firstLevelMappedData && selectedIssue.firstLevelMappedData.length > 0) {
          setTaskDatasetRows(selectedIssue.firstLevelMappedData);
        } else {
          setTaskDatasetRows([]);
        }
      })
      .catch(err => {
        console.warn('Could not fetch task dataset from backend API:', err);
        if (selectedIssue.firstLevelMappedData && selectedIssue.firstLevelMappedData.length > 0) {
          setTaskDatasetRows(selectedIssue.firstLevelMappedData);
        } else {
          setTaskDatasetRows([]);
        }
      })
      .finally(() => {
        setIsLoadingDataset(false);
      });
  }, [selectedIssue?.id]);

  const effectiveRows = useMemo(() => {
    let rows = taskDatasetRows;
    if (selectedBatchId !== 'ALL') {
      rows = rows.filter((r: any) => r._batchId === selectedBatchId);
    }
    return rows;
  }, [taskDatasetRows, selectedBatchId]);

  const sourceFileName = useMemo(() => {
    return selectedIssue?.uploadedFileName || (selectedIssue?.title ? `${selectedIssue.title}.xlsx` : 'Dataset.xlsx');
  }, [selectedIssue]);

  // State for toggling only mapped columns (defaults to true for lean workspace excel)
  const [onlyMappedColumns, setOnlyMappedColumns] = useState<boolean>(true);

  // Clean, Abstracted Column Definitions showing only columns with mapped/populated values from this task's data
  const columnDefs = useMemo(() => {
    const formatLabel = (key: string) => {
      return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    };

    if (effectiveRows.length > 0) {
      // Find all keys that actually have at least one non-empty value across the rows of THIS task
      const populatedKeys = new Set<string>();
      effectiveRows.forEach(row => {
        Object.entries(row).forEach(([k, v]) => {
          if (!k.startsWith('_') && v !== undefined && v !== null && String(v).trim() !== '') {
            populatedKeys.add(k);
          }
        });
      });

      const keysToUse = onlyMappedColumns && populatedKeys.size > 0
        ? Array.from(populatedKeys)
        : Object.keys(effectiveRows[0]).filter(k => !k.startsWith('_'));

      return keysToUse.map(key => ({
        key,
        label: formatLabel(key),
        type: typeof effectiveRows[0]?.[key] === 'number' || (!isNaN(Number(effectiveRows[0]?.[key])) && effectiveRows[0]?.[key] !== '') ? 'number' : 'text'
      }));
    }

    return [];
  }, [effectiveRows, onlyMappedColumns]);

  // Column Visibility State
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showColumnManager, setShowColumnManager] = useState(false);

  // Hidden Rows State
  const [hiddenRowIds, setHiddenRowIds] = useState<Set<string>>(new Set());

  // Per-column Excel Filtering & Sorting State
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterState>>({});
  const [activeFilterPopoverCol, setActiveFilterPopoverCol] = useState<string | null>(null);
  const [filterSearchTerm, setFilterSearchTerm] = useState('');

  // Active Multi-Stage Workflow State (Mock workflows completely removed)
  const [availableWorkflows, setAvailableWorkflows] = useState<DatabaseValidationWorkflow[]>(() => {
    try {
      const saved = localStorage.getItem('operational_validation_workflows_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return [];
  });

  const [activeWorkflow, setActiveWorkflow] = useState<DatabaseValidationWorkflow | null>(() => {
    return availableWorkflows.length > 0 ? availableWorkflows[0] : null;
  });

  // Explicit Validation Execution State: Stop auto-validation on file mount without explicit user run
  const [hasExecutedValidation, setHasExecutedValidation] = useState<boolean>(false);

  // Fetch workflows from Backend API on mount
  useEffect(() => {
    api.getWorkflows()
      .then(wfs => {
        if (Array.isArray(wfs)) {
          setAvailableWorkflows(wfs);
          setActiveWorkflow(wfs.length > 0 ? wfs[0] : null);
          try {
            localStorage.setItem('operational_validation_workflows_v1', JSON.stringify(wfs));
          } catch { /* ignore */ }
        }
      })
      .catch(err => console.warn('Could not fetch workflows from API in workspace:', err));
  }, []);

  // Reset execution when selected issue changes
  useEffect(() => {
    setHasExecutedValidation(false);
  }, [selectedIssue?.id]);

  const [isVerifying, setIsVerifying] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'FLAGGED' | 'CLEAN'>('ALL');
  const [showValidationDropdown, setShowValidationDropdown] = useState(false);
  const [inspectingRow, setInspectingRow] = useState<OrchestratedRow | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Manual Transaction Investigation Status Overrides
  // (Closing one transaction must NOT automatically close the parent Issue or TeamTask)
  const [manualStatusOverrides, setManualStatusOverrides] = useState<Record<string, TransactionInvestigationStatus>>({});

  const handleToggleRowClosed = (rowId: string) => {
    setManualStatusOverrides(prev => {
      const current = prev[rowId] || (orchestratedRows.find(r => r.rowId === rowId)?.investigationStatus) || 'INVESTIGATING';
      const nextStatus: TransactionInvestigationStatus = current === 'CLOSED' ? 'INVESTIGATING' : 'CLOSED';
      return {
        ...prev,
        [rowId]: nextStatus
      };
    });
  };

  // Selected Cell & Formula Bar
  const [selectedCell, setSelectedCell] = useState<{
    rowIdx: number;
    colKey: string;
    colLabel: string;
    value: string;
  }>({
    rowIdx: 0,
    colKey: '',
    colLabel: '',
    value: ''
  });

  // Keep selectedCell in sync when effectiveRows or columnDefs change
  useEffect(() => {
    if (effectiveRows.length > 0 && columnDefs.length > 0) {
      const firstCol = columnDefs[0];
      setSelectedCell(prev => {
        if (prev.colKey && columnDefs.some(c => c.key === prev.colKey)) {
          const row = effectiveRows[prev.rowIdx] || effectiveRows[0];
          return {
            ...prev,
            value: String(row?.[prev.colKey] ?? '')
          };
        }
        return {
          rowIdx: 0,
          colKey: firstCol.key,
          colLabel: firstCol.label,
          value: String(effectiveRows[0]?.[firstCol.key] ?? '')
        };
      });
    } else {
      setSelectedCell({
        rowIdx: 0,
        colKey: '',
        colLabel: '',
        value: ''
      });
    }
  }, [effectiveRows, columnDefs]);

  const [activeSheetTab, setActiveSheetTab] = useState<'dataset' | 'anomalies' | 'reconciled'>('dataset');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Compute Orchestrated Row Results using the Centralized Shared Investigation Engine
  const orchestratedRows: OrchestratedRow[] = useMemo(() => {
    if (!hasExecutedValidation || !activeWorkflow) {
      return effectiveRows.map((row, rowIdx) => {
        const rowId = String(row.transaction_id || row.card_number || `ROW-${rowIdx + 1}`);
        const overriddenStatus = manualStatusOverrides[rowId];
        return {
          rowId,
          sourceRecord: row,
          stepResults: {},
          overallSeverity: 'RECONCILED' as const,
          overallSummary: activeWorkflow 
            ? 'Awaiting validation trigger. Click "▶ Run Validation" to evaluate against pipeline rules.' 
            : 'No validation workflow configured.',
          investigationStatus: (overriddenStatus || 'PENDING') as TransactionInvestigationStatus,
          isClosed: false,
          isHalted: false
        };
      });
    }

    const batchSummaries = executeBatchInvestigation(effectiveRows, activeWorkflow);

    return effectiveRows.map((row, rowIdx) => {
      const rowId = String(row.transaction_id || row.card_number || `ROW-${rowIdx + 1}`);
      const summary = batchSummaries[rowId];
      const overriddenStatus = manualStatusOverrides[rowId];
      const finalStatus: TransactionInvestigationStatus = overriddenStatus || summary?.investigationStatus || 'PENDING';
      const isClosed = finalStatus === 'CLOSED' || summary?.isClosed || false;
      const isHalted = summary?.isHalted || false;

      let rowSeverity: 'CRITICAL' | 'WARNING' | 'RECONCILED' | 'MISSING' = 'RECONCILED';
      if (finalStatus === 'FLAGGED') {
        rowSeverity = summary?.hasTechnicalError ? 'CRITICAL' : 'WARNING';
      } else if (finalStatus === 'INVESTIGATING') {
        rowSeverity = 'WARNING';
      } else if (finalStatus === 'CLOSED' || finalStatus === 'RECONCILED') {
        rowSeverity = 'RECONCILED';
      }

      // Map audit trail to stepResults for backwards UI display
      const stepResults: Record<string, StepExecutionResult> = {};
      (summary?.auditTrail || []).forEach(entry => {
        stepResults[entry.ruleId] = {
          stepId: entry.ruleId,
          status: entry.validationResult === 'PASS' ? 'PASSED' : entry.validationResult === 'FAIL' ? 'FAILED' : 'WARNING',
          badgeText: `${entry.validationResult} ➔ ${entry.pipelineAction}`,
          detail: entry.message,
          dbValue: entry.errorDetail,
          resultStatus: entry.validationResult,
          actionTaken: entry.pipelineAction,
          stageName: entry.stageName
        };
      });

      return {
        rowId,
        sourceRecord: row,
        stepResults,
        overallSeverity: rowSeverity,
        overallSummary: summary?.auditTrail.map(a => `${a.ruleName}: [${a.validationResult}] ${a.pipelineAction}`).join(' | ') || 'Passed multi-stage validation',
        remedySql: summary?.remedySql,
        executionSummary: summary,
        investigationStatus: finalStatus,
        isClosed,
        isHalted
      };
    });
  }, [effectiveRows, activeWorkflow, manualStatusOverrides, hasExecutedValidation]);

  // Aggregate Parent Issue / Case Status from child transactions
  const parentIssueAggregation = useMemo(() => {
    return aggregateParentIssueStatus(
      orchestratedRows.map(r => ({
        transactionId: r.rowId,
        investigationStatus: r.investigationStatus
      }))
    );
  }, [orchestratedRows]);

  // Decoupled batch plans for scalable processing
  const batchExecutionPlans = useMemo(() => {
    const ids = orchestratedRows.map(r => r.rowId);
    return createBatchPlan(ids, { maxRowsPerBatch: 50, maxQueryKeys: 10 });
  }, [orchestratedRows]);


  // Unique values for a given column (used in column filter popover)
  const getUniqueColumnValues = (colKey: string): string[] => {
    const valSet = new Set<string>();
    orchestratedRows.forEach(r => {
      const val = String(r.sourceRecord[colKey] ?? '');
      if (val !== '') valSet.add(val);
    });
    return Array.from(valSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  };

  // Filtered & Sorted Rows based on Excel Toolbar & Column Filters
  const filteredAndSortedRows = useMemo(() => {
    let result = orchestratedRows.filter(r => !hiddenRowIds.has(r.rowId));

    // Sheet tab filter
    if (activeSheetTab === 'anomalies') {
      result = result.filter(r => r.overallSeverity !== 'RECONCILED');
    } else if (activeSheetTab === 'reconciled') {
      result = result.filter(r => r.overallSeverity === 'RECONCILED');
    }

    // Outcome quick filter
    if (outcomeFilter === 'FLAGGED') {
      result = result.filter(r => r.overallSeverity !== 'RECONCILED');
    } else if (outcomeFilter === 'CLEAN') {
      result = result.filter(r => r.overallSeverity === 'RECONCILED');
    }

    // Global search term
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(r => {
        const matchValues = Object.values(r.sourceRecord).some(v => String(v).toLowerCase().includes(q));
        return matchValues || r.overallSummary.toLowerCase().includes(q);
      });
    }

    // Per-column filters
    Object.entries(columnFilters).forEach(([colKey, filterState]) => {
      const state = filterState as ColumnFilterState | undefined;
      if (state && state.selectedValues !== null) {
        result = result.filter(r => {
          const val = String(r.sourceRecord[colKey] ?? '');
          return state.selectedValues!.has(val);
        });
      }
    });

    // Check if any column has a sort active
    const activeSortEntry = Object.entries(columnFilters).find(([_, f]) => (f as ColumnFilterState)?.sortDirection !== null);
    if (activeSortEntry) {
      const [colKey, filterVal] = activeSortEntry;
      const sortDirection = (filterVal as ColumnFilterState).sortDirection;
      result = [...result].sort((a, b) => {
        const valA = a.sourceRecord[colKey];
        const valB = b.sourceRecord[colKey];
        const numA = Number(valA);
        const numB = Number(valB);

        let comparison = 0;
        if (!isNaN(numA) && !isNaN(numB)) {
          comparison = numA - numB;
        } else {
          comparison = String(valA ?? '').localeCompare(String(valB ?? ''), undefined, { numeric: true });
        }
        return sortDirection === 'desc' ? -comparison : comparison;
      });
    }

    return result;
  }, [orchestratedRows, hiddenRowIds, activeSheetTab, outcomeFilter, searchTerm, columnFilters]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAndSortedRows.slice(start, start + pageSize);
  }, [filteredAndSortedRows, currentPage, pageSize]);

  // Aggregate stats
  const aggregateStats = useMemo(() => {
    let sum = 0;
    let numericCount = 0;
    let min = Infinity;
    let max = -Infinity;

    filteredAndSortedRows.forEach(r => {
      const numVal = Number(r.sourceRecord.amount_usd ?? r.sourceRecord.amount);
      if (!isNaN(numVal)) {
        sum += numVal;
        numericCount++;
        if (numVal < min) min = numVal;
        if (numVal > max) max = numVal;
      }
    });

    const average = numericCount > 0 ? sum / numericCount : 0;
    const anomaliesCount = orchestratedRows.filter(r => r.overallSeverity !== 'RECONCILED').length;
    const reconciledCount = orchestratedRows.filter(r => r.overallSeverity === 'RECONCILED').length;

    return {
      total: orchestratedRows.length,
      visibleCount: filteredAndSortedRows.length,
      anomaliesCount,
      reconciledCount,
      sum,
      average,
      min: min === Infinity ? 0 : min,
      max: max === -Infinity ? 0 : max,
      hiddenColCount: hiddenColumns.size,
      hiddenRowCount: hiddenRowIds.size
    };
  }, [orchestratedRows, filteredAndSortedRows, hiddenColumns, hiddenRowIds]);

  // Toggle Column Visibility
  const toggleColumnVisibility = (key: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const showAllColumns = () => {
    setHiddenColumns(new Set());
  };

  const showAllRows = () => {
    setHiddenRowIds(new Set());
  };

  // Column Sort Actions
  const handleSortColumn = (colKey: string, direction: 'asc' | 'desc') => {
    setColumnFilters(prev => {
      const next = { ...prev };
      // Reset other column sorts so single-column sort is clean
      Object.keys(next).forEach(k => {
        if (next[k]) next[k] = { ...next[k], sortDirection: null };
      });
      next[colKey] = {
        sortDirection: direction,
        selectedValues: prev[colKey]?.selectedValues ?? null
      };
      return next;
    });
    setActiveFilterPopoverCol(null);
  };

  const handleClearColumnFilter = (colKey: string) => {
    setColumnFilters(prev => {
      const next = { ...prev };
      delete next[colKey];
      return next;
    });
    setActiveFilterPopoverCol(null);
    setFilterSearchTerm('');
  };

  const handleToggleValueSelection = (colKey: string, value: string) => {
    const allVals = getUniqueColumnValues(colKey);
    setColumnFilters(prev => {
      const currentSelected = prev[colKey]?.selectedValues ? new Set(prev[colKey].selectedValues) : new Set(allVals);
      if (currentSelected.has(value)) {
        currentSelected.delete(value);
      } else {
        currentSelected.add(value);
      }

      return {
        ...prev,
        [colKey]: {
          sortDirection: prev[colKey]?.sortDirection ?? null,
          selectedValues: currentSelected.size === allVals.length ? null : currentSelected
        }
      };
    });
  };

  const handleSelectAllValues = (colKey: string, selectAll: boolean) => {
    const allVals = getUniqueColumnValues(colKey);
    setColumnFilters(prev => ({
      ...prev,
      [colKey]: {
        sortDirection: prev[colKey]?.sortDirection ?? null,
        selectedValues: selectAll ? null : new Set()
      }
    }));
  };

  const handleRunValidation = () => {
    if (!activeWorkflow) {
      alert('Please select or create a validation workflow first.');
      return;
    }
    setIsVerifying(true);
    setTimeout(() => {
      setHasExecutedValidation(true);
      setIsVerifying(false);
    }, 350);
  };

  const handleApplyWorkflow = (wf: DatabaseValidationWorkflow) => {
    setActiveWorkflow(wf);
    setShowValidationDropdown(false);
    setHasExecutedValidation(false);
  };

  const handleExportExcel = () => {
    const exportData = filteredAndSortedRows.map(r => {
      const base: Record<string, any> = {};
      base['Investigation Status'] = r.investigationStatus;
      base['Case Closed'] = r.isClosed ? 'YES' : 'NO';
      base['Pipeline Halted'] = r.isHalted ? 'YES' : 'NO';

      columnDefs.forEach(c => {
        if (!hiddenColumns.has(c.key)) {
          base[c.label] = r.sourceRecord[c.key] ?? '';
        }
      });
      (activeWorkflow?.steps || []).forEach(s => {
        if (!hiddenColumns.has(s.id)) {
          base[s.name] = r.stepResults[s.id]?.badgeText || 'N/A';
        }
      });
      base['Diagnostic Summary'] = r.overallSummary;
      return base;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reconciliation_Data');
    XLSX.writeFile(wb, `${sourceFileName.replace(/\.[^/.]+$/, "")}_Export.xlsx`);
  };

  const handleCopySql = (sql: string, rowId: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedId(rowId);
    setTimeout(() => setCopiedId(null), 2500);
  };

  if (!selectedIssue) {
    return (
      <div className="bg-white border border-slate-300 rounded-lg p-10 text-center space-y-3 font-sans">
        <FileSpreadsheet size={32} className="mx-auto text-emerald-600" />
        <h3 className="text-sm font-bold text-slate-800">No Active Case Selected</h3>
        {onOpenNewCase && (
          <button
            type="button"
            onClick={onOpenNewCase}
            className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded cursor-pointer"
          >
            Open New Case
          </button>
        )}
      </div>
    );
  }

  // Intermediate REPORT Columns derived from active Workflow
  const reportColumns = useMemo(() => {
    const list: { key: string; label: string; stepId?: string; sourceField?: string }[] = [];
    const seen = new Set<string>();

    (activeWorkflow?.steps || []).forEach(s => {
      if (s.onPassAction === 'REPORT' || s.onFailAction === 'REPORT' || s.reportColumnName) {
        const colKey = s.reportColumnName || s.name;
        if (!seen.has(colKey)) {
          seen.add(colKey);
          list.push({ key: colKey, label: colKey, stepId: s.id, sourceField: s.reportField });
        }
      }
    });

    (activeWorkflow?.nodes || []).forEach(n => {
      if (n.type === 'REPORT' || n.onPassAction === 'REPORT' || n.onFailAction === 'REPORT' || n.reportColumnName) {
        const colKey = n.reportColumnName || n.name;
        if (!seen.has(colKey)) {
          seen.add(colKey);
          list.push({ key: colKey, label: colKey, sourceField: n.reportField });
        }
      }
    });

    return list;
  }, [activeWorkflow]);

  // Visible columns lists
  const visibleDatasetColumns = columnDefs.filter(c => !hiddenColumns.has(c.key));
  const visibleReportColumns = reportColumns.filter(c => !hiddenColumns.has(`report_${c.key}`));
  const visibleValidationSteps = (activeWorkflow?.steps || []).filter(s => !hiddenColumns.has(s.id));

  return (
    <div className="space-y-0 font-sans text-slate-800 border border-slate-300 rounded-xl shadow-sm overflow-hidden bg-white">
      {/* =========================================================================
          1. ULTRA-COMPACT UNIFIED TOP TOOLBAR (SIMPLIFIED TO MAXIMIZE TABLE SPACE)
          ========================================================================= */}
      <div className="bg-[#107c41] text-white px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-[#0b5a2f] text-xs">
        {/* Left: Excel Mini Icon, File Name Chip & Compact Case Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 font-bold text-xs tracking-tight text-white pr-0.5">
            <span className="p-0.5 bg-white/20 rounded">
              <FileSpreadsheet size={13} className="text-white" />
            </span>
            <span>Data Grid</span>
          </div>

          {/* Source File Name Pill */}
          <span 
            className="text-[11px] bg-[#0b5a2f] text-emerald-100 px-2 py-0.5 rounded font-mono font-semibold border border-emerald-400/20 max-w-[220px] truncate" 
            title={`Dataset File: ${sourceFileName}`}
          >
            {sourceFileName}
          </span>

          {/* Active Multi-Stage Workflow Pill */}
          {activeWorkflow ? (
            <span 
              className="text-[11px] bg-emerald-800/80 text-white px-2 py-0.5 rounded font-mono font-semibold border border-emerald-400/30 max-w-[240px] truncate flex items-center gap-1"
              title={`Active Workflow: ${activeWorkflow.name}`}
            >
              <Layers size={11} className="text-emerald-300" />
              <span className="truncate">{activeWorkflow.name}</span>
            </span>
          ) : (
            <span 
              className="text-[11px] bg-emerald-950/80 text-emerald-300/80 px-2 py-0.5 rounded font-mono border border-emerald-500/20 flex items-center gap-1"
            >
              <AlertTriangle size={11} className="text-amber-400" />
              <span>No Workflow Configured</span>
            </span>
          )}

          {/* Compact Case Switcher */}
          <div className="flex items-center gap-1 bg-white/10 px-1.5 py-0.5 rounded border border-white/15">
            <span className="text-[10px] text-emerald-100 font-mono">Case:</span>
            <select
              value={selectedIssue.id}
              onChange={(e) => onSelectIssueId(e.target.value)}
              className="text-[11px] bg-white text-slate-900 font-medium px-1.5 py-0.5 rounded focus:outline-none cursor-pointer max-w-[160px] truncate"
            >
              {issues.map(iss => (
                <option key={iss.id} value={iss.id}>
                  #{iss.id} — {iss.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Actions, Filters, Search & Export in Single Row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* RUN VALIDATION TRIGGER BUTTON */}
          <button
            type="button"
            onClick={hasExecutedValidation ? () => setHasExecutedValidation(false) : handleRunValidation}
            disabled={isVerifying || !activeWorkflow}
            className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer ${
              !activeWorkflow
                ? 'bg-white/10 text-emerald-200/50 cursor-not-allowed border border-white/10'
                : hasExecutedValidation
                  ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 border border-amber-300'
                  : 'bg-white hover:bg-emerald-50 text-[#107c41] border border-white font-extrabold'
            }`}
            title={!activeWorkflow ? 'Select or create a workflow first' : hasExecutedValidation ? 'Reset validation status' : 'Run validation rules on current dataset'}
          >
            {isVerifying ? (
              <RotateCcw size={12} className="animate-spin" />
            ) : hasExecutedValidation ? (
              <RotateCcw size={12} />
            ) : (
              <Play size={12} className="fill-[#107c41]" />
            )}
            <span>
              {isVerifying ? 'Evaluating...' : hasExecutedValidation ? 'Reset Validation' : '▶ Run Validation'}
            </span>
          </button>

          {/* Validation Execution Status Badge */}
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold ${
            hasExecutedValidation
              ? 'bg-emerald-900/90 text-emerald-200 border-emerald-400/40'
              : 'bg-white/10 text-emerald-100 border-white/20'
          }`}>
            {hasExecutedValidation ? '✓ Validated' : '⏸ Unvalidated'}
          </span>

          {/* Only Mapped Columns Toggle Pill */}
          <button
            type="button"
            onClick={() => setOnlyMappedColumns(prev => !prev)}
            className={`px-2 py-1 rounded text-[11px] font-mono font-medium border flex items-center gap-1 transition cursor-pointer ${
              onlyMappedColumns
                ? 'bg-emerald-800/90 text-emerald-100 border-emerald-400/40 font-bold'
                : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'
            }`}
            title={onlyMappedColumns ? 'Currently showing only mapped / populated columns' : 'Currently showing all columns including blanks'}
          >
            <Check size={11} className={onlyMappedColumns ? 'text-emerald-300' : 'text-transparent'} />
            <span>Mapped Only</span>
          </button>

          {/* Workflow Selector Dropdown Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowValidationDropdown(prev => !prev)}
              className="px-2.5 py-1 bg-white/15 hover:bg-white/25 text-white border border-white/20 rounded text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
            >
              <CheckCircle2 size={12} className={isVerifying ? 'animate-spin' : ''} />
              <span>{isVerifying ? 'Evaluating...' : 'Select Workflow'}</span>
              <ChevronDown size={11} className={`transition-transform ${showValidationDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showValidationDropdown && (
              <div className="absolute right-0 sm:left-0 top-full mt-1 w-80 bg-white rounded-lg border border-slate-300 shadow-xl p-2 z-40 space-y-1 text-slate-800">
                <div className="px-2 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  Configured Multi-Stage Workflows
                </div>
                {availableWorkflows.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500">
                    No validation workflows configured.
                  </div>
                ) : (
                  availableWorkflows.map((wf) => (
                    <button
                      key={wf.id}
                      type="button"
                      onClick={() => handleApplyWorkflow(wf)}
                      className={`w-full text-left p-2 rounded text-xs font-medium flex items-center justify-between transition cursor-pointer ${
                        activeWorkflow?.id === wf.id ? 'bg-emerald-50 text-emerald-950 font-bold border border-emerald-200' : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="truncate mr-2">
                        <div className="font-semibold text-slate-900 truncate">{wf.name}</div>
                        <div className="text-[10px] text-slate-500">
                          {(wf.stages || []).length} Stages • {wf.steps?.length || 0} Rules • {wf.category}
                        </div>
                      </div>
                      <Play size={11} className="text-emerald-700 fill-emerald-700 shrink-0" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>


          {/* Column Visibility Manager Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColumnManager(prev => !prev)}
              className={`px-2 py-1 rounded text-[11px] font-medium border flex items-center gap-1 transition cursor-pointer ${
                hiddenColumns.size > 0
                  ? 'bg-amber-400 text-slate-950 border-amber-300 font-bold'
                  : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
              }`}
            >
              <Eye size={12} />
              <span>Columns</span>
              {hiddenColumns.size > 0 && (
                <span className="px-1 bg-amber-900 text-amber-100 rounded-full text-[9px] font-bold">
                  {hiddenColumns.size}
                </span>
              )}
              <ChevronDown size={11} />
            </button>

            {showColumnManager && (
              <div className="absolute right-0 top-full mt-1 w-60 bg-white rounded-lg border border-slate-300 shadow-xl p-2.5 z-40 space-y-1.5 text-slate-800">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                  <span className="text-[11px] font-bold text-slate-800">Columns</span>
                  <button
                    type="button"
                    onClick={showAllColumns}
                    className="text-[10px] text-emerald-700 hover:underline font-semibold cursor-pointer"
                  >
                    Show All
                  </button>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1">
                  <div className="text-[9px] font-bold text-slate-400 uppercase font-mono px-1">Dataset</div>
                  {columnDefs.map(col => {
                    const isHidden = hiddenColumns.has(col.key);
                    return (
                      <label
                        key={col.key}
                        className="flex items-center gap-1.5 p-1 rounded hover:bg-slate-50 text-xs text-slate-700 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={!isHidden}
                          onChange={() => toggleColumnVisibility(col.key)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span className="truncate">{col.label}</span>
                      </label>
                    );
                  })}

                  <div className="text-[9px] font-bold text-slate-400 uppercase font-mono px-1 pt-1">Verification</div>
                  {(activeWorkflow?.steps || []).map(step => {
                    const isHidden = hiddenColumns.has(step.id);
                    return (
                      <label
                        key={step.id}
                        className="flex items-center gap-1.5 p-1 rounded hover:bg-slate-50 text-xs text-slate-700 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={!isHidden}
                          onChange={() => toggleColumnVisibility(step.id)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                        <span className="truncate font-medium text-emerald-900">{step.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Pre-Batched Chunks Selector */}
          {availableBatches.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-white">
              <Layers className="w-3.5 h-3.5 text-emerald-200" />
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
                className="bg-[#084725] border border-white/30 text-white text-[11px] rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-white font-mono"
              >
                <option value="ALL">All Batches ({effectiveRows.length} rows)</option>
                {availableBatches.map(b => (
                  <option key={b.batchId} value={b.batchId}>
                    {b.batchId} ({b.count} rows)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quick Outcome Filter Pills */}
          <div className="flex items-center border border-white/20 rounded bg-[#0b5a2f] overflow-hidden text-[11px]">
            <button
              type="button"
              onClick={() => setOutcomeFilter('ALL')}
              className={`px-2 py-0.5 transition cursor-pointer ${
                outcomeFilter === 'ALL' ? 'bg-white text-emerald-950 font-bold' : 'text-emerald-100 hover:bg-white/10'
              }`}
            >
              All ({orchestratedRows.length})
            </button>
            <button
              type="button"
              onClick={() => setOutcomeFilter('FLAGGED')}
              className={`px-2 py-0.5 border-l border-white/10 transition cursor-pointer ${
                outcomeFilter === 'FLAGGED' ? 'bg-rose-500 text-white font-bold' : 'text-emerald-100 hover:bg-white/10'
              }`}
            >
              Flagged ({aggregateStats.anomaliesCount})
            </button>
            <button
              type="button"
              onClick={() => setOutcomeFilter('CLEAN')}
              className={`px-2 py-0.5 border-l border-white/10 transition cursor-pointer ${
                outcomeFilter === 'CLEAN' ? 'bg-emerald-300 text-emerald-950 font-bold' : 'text-emerald-100 hover:bg-white/10'
              }`}
            >
              Clean
            </button>
          </div>

          {/* Quick Find Input */}
          <div className="relative">
            <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Find..."
              className="text-[11px] pl-6 pr-2 py-0.5 bg-white text-slate-900 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-400 w-28"
            />
          </div>

          {/* Export Button */}
          <button
            type="button"
            onClick={handleExportExcel}
            className="text-[11px] px-2 py-1 bg-white hover:bg-slate-100 text-[#0b5a2f] rounded font-bold flex items-center gap-1 transition cursor-pointer shadow-2xs"
            title="Export Excel Worksheet"
          >
            <Download size={11} className="text-[#0b5a2f]" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          1.5. INVESTIGATION EXECUTION SUMMARY & BATCH PROGRESS (PHASE 14 & 15)
          ========================================================================= */}
      <div className="bg-slate-900 text-white px-3 py-1.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Overall Execution Stats & Parent Case Aggregate Status */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-slate-400">Total:</span>
            <span className="font-bold text-white">{aggregateStats.total}</span>
            <span className="text-slate-600">|</span>
            <span className="text-emerald-400">Reconciled:</span>
            <span className="font-bold text-emerald-300">{parentIssueAggregation.reconciledCount}</span>
            <span className="text-slate-600">|</span>
            <span className="text-rose-400">Flagged:</span>
            <span className="font-bold text-rose-300">{parentIssueAggregation.flaggedCount}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">Closed:</span>
            <span className="font-bold text-slate-300">{parentIssueAggregation.closedCount}</span>
          </div>

          {/* Parent Issue Status Badge */}
          <div className="flex items-center gap-1.5 bg-white/10 px-2 py-0.5 rounded-lg border border-white/15">
            <span className="text-[10px] text-slate-300 font-mono">Case Status:</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono ${
              parentIssueAggregation.issueStatus === 'RESOLVED' || parentIssueAggregation.issueStatus === 'CLOSED'
                ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                : parentIssueAggregation.issueStatus === 'ACTION_REQUIRED'
                ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
                : 'bg-blue-500/30 text-blue-300 border border-blue-500/40'
            }`}>
              {parentIssueAggregation.issueStatus}
            </span>
          </div>
        </div>

        {/* Right: Decoupled Batch Progress Chips */}
        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          <span className="text-slate-400">Batches ({batchExecutionPlans.length}):</span>
          <div className="flex items-center gap-1 overflow-x-auto max-w-xs">
            {batchExecutionPlans.slice(0, 4).map(b => (
              <span
                key={b.batchId}
                className="px-1.5 py-0.2 rounded bg-white/10 text-emerald-300 border border-emerald-500/30 font-mono text-[9px]"
                title={`${b.transactionIds.length} txns in ${b.queryChunks.length} chunks`}
              >
                {b.batchId} ✓
              </span>
            ))}
            {batchExecutionPlans.length > 4 && (
              <span className="text-slate-500 text-[9px]">+{batchExecutionPlans.length - 4} more</span>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          2. HIDDEN ITEMS RESTORE BANNER (IF COLUMNS/ROWS ARE HIDDEN)
          ========================================================================= */}
      {(aggregateStats.hiddenColCount > 0 || aggregateStats.hiddenRowCount > 0) && (
        <div className="bg-amber-50/90 border-b border-amber-200 px-3 py-1 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-1.5">
            <EyeOff size={12} className="text-amber-700" />
            <span className="text-[11px]">
              {aggregateStats.hiddenColCount > 0 && `${aggregateStats.hiddenColCount} column(s) hidden. `}
              {aggregateStats.hiddenRowCount > 0 && `${aggregateStats.hiddenRowCount} row(s) hidden.`}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            {aggregateStats.hiddenColCount > 0 && (
              <button
                type="button"
                onClick={showAllColumns}
                className="font-bold underline hover:text-amber-950 cursor-pointer"
              >
                Unhide Columns
              </button>
            )}
            {aggregateStats.hiddenRowCount > 0 && (
              <button
                type="button"
                onClick={showAllRows}
                className="font-bold underline hover:text-amber-950 cursor-pointer"
              >
                Unhide Rows
              </button>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          3. COMPACT EXCEL FORMULA BAR (SLIMMED DOWN)
          ========================================================================= */}
      <div className="bg-white border-b border-slate-300 px-3 py-1 flex items-center gap-2 text-xs font-mono">
        <span className="px-1.5 py-0.2 bg-slate-100 border border-slate-300 rounded text-slate-700 font-bold min-w-14 text-center text-[11px]">
          Row {selectedCell.rowIdx + 1}
        </span>
        <span className="text-slate-400 font-serif italic text-xs select-none">fx</span>
        <div className="flex-1 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 text-slate-800 truncate font-sans text-xs flex items-center justify-between">
          <span className="truncate">{selectedCell.value || '—'}</span>
          <span className="text-[10px] text-slate-400 font-mono ml-2 flex-shrink-0">
            Field: [{selectedCell.colLabel}]
          </span>
        </div>
      </div>

      {/* =========================================================================
          4. EXCEL DATA GRID (EXPANDED VIEWPORT HEIGHT FOR MAXIMUM DATA SPACE)
          ========================================================================= */}
      <div className="overflow-x-auto max-h-[calc(100vh-210px)] min-h-[520px] relative">
        <table className="w-full text-left text-xs border-collapse border border-slate-300">
          <thead>
            {/* Header Row: Clean Abstracted Labels with Excel-Style Filter/Sort Menu */}
            <tr className="bg-[#f3f4f6] border-b border-slate-300 sticky top-0 z-20 shadow-2xs">
              {/* Row Index Column Header */}
              <th className="w-12 border-r border-slate-300 bg-[#e5e7eb] font-bold p-2 text-center text-slate-500 font-mono text-[11px] select-none">
                #
              </th>

              {/* Dataset Columns (Clean Names, No RAW/Mapped tags) */}
              {visibleDatasetColumns.map((col) => {
                const isFiltered = columnFilters[col.key]?.selectedValues !== null || columnFilters[col.key]?.sortDirection !== null;
                const isSorted = columnFilters[col.key]?.sortDirection;

                return (
                  <th
                    key={col.key}
                    className="py-2 px-2.5 font-normal align-middle border-r border-slate-300 bg-[#f8f9fa] hover:bg-slate-200/60 transition-colors group select-none"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-bold text-slate-800 text-[11px] tracking-tight truncate">
                          {col.label}
                        </span>
                        {isSorted && (
                          <span className="text-[10px] text-emerald-700 font-bold font-mono">
                            {isSorted === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </div>

                      {/* Excel Header Filter Dropdown Button */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveFilterPopoverCol(activeFilterPopoverCol === col.key ? null : col.key);
                            setFilterSearchTerm('');
                          }}
                          className={`p-1 rounded transition cursor-pointer ${
                            isFiltered
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                          }`}
                          title={`Filter & Sort ${col.label}`}
                        >
                          <Filter size={11} className={isFiltered ? 'fill-white' : ''} />
                        </button>

                        {/* Excel-style Column Filter & Sort Popover */}
                        {activeFilterPopoverCol === col.key && (
                          <div 
                            className="absolute left-0 top-full mt-1 w-60 bg-white rounded-lg border border-slate-300 shadow-2xl p-3 z-50 text-xs font-sans text-slate-800 space-y-2.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {/* Sort Actions */}
                            <div className="space-y-1 border-b border-slate-200 pb-2">
                              <button
                                type="button"
                                onClick={() => handleSortColumn(col.key, 'asc')}
                                className="w-full text-left px-2 py-1 rounded hover:bg-slate-100 flex items-center gap-2 text-slate-700 cursor-pointer"
                              >
                                <ArrowUpAZ size={13} className="text-slate-500" />
                                <span>Sort A to Z (Ascending)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSortColumn(col.key, 'desc')}
                                className="w-full text-left px-2 py-1 rounded hover:bg-slate-100 flex items-center gap-2 text-slate-700 cursor-pointer"
                              >
                                <ArrowDownZA size={13} className="text-slate-500" />
                                <span>Sort Z to A (Descending)</span>
                              </button>
                            </div>

                            {/* Clear Filter */}
                            {isFiltered && (
                              <button
                                type="button"
                                onClick={() => handleClearColumnFilter(col.key)}
                                className="w-full text-left px-2 py-1 rounded hover:bg-rose-50 text-rose-700 font-semibold flex items-center gap-1.5 cursor-pointer"
                              >
                                <RotateCcw size={12} />
                                <span>Clear Filter from "{col.label}"</span>
                              </button>
                            )}

                            {/* Value Search Filter */}
                            <div className="space-y-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Filter by Values</span>
                              <div className="relative">
                                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                  type="text"
                                  value={filterSearchTerm}
                                  onChange={(e) => setFilterSearchTerm(e.target.value)}
                                  placeholder="Search values..."
                                  className="w-full pl-6 pr-2 py-1 text-xs bg-slate-50 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-600"
                                />
                              </div>

                              {/* Select All / Deselect All */}
                              <div className="flex items-center justify-between text-[11px] pt-1 text-slate-600 px-1">
                                <button
                                  type="button"
                                  onClick={() => handleSelectAllValues(col.key, true)}
                                  className="text-emerald-700 hover:underline font-semibold cursor-pointer"
                                >
                                  Select All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSelectAllValues(col.key, false)}
                                  className="text-slate-500 hover:underline cursor-pointer"
                                >
                                  Clear
                                </button>
                              </div>

                              {/* Unique values checklist */}
                              <div className="max-h-36 overflow-y-auto space-y-0.5 border border-slate-200 rounded p-1 bg-slate-50/50">
                                {getUniqueColumnValues(col.key)
                                  .filter(val => val.toLowerCase().includes(filterSearchTerm.toLowerCase()))
                                  .map(val => {
                                    const isChecked = columnFilters[col.key]?.selectedValues 
                                      ? columnFilters[col.key]?.selectedValues?.has(val) 
                                      : true;

                                    return (
                                      <label
                                        key={val}
                                        className="flex items-center gap-1.5 p-1 rounded hover:bg-white text-xs text-slate-700 cursor-pointer select-none"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={Boolean(isChecked)}
                                          onChange={() => handleToggleValueSelection(col.key, val)}
                                          className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                        />
                                        <span className="truncate font-mono text-[11px]">{val}</span>
                                      </label>
                                    );
                                  })}
                              </div>
                            </div>

                            {/* Hide this Column Action */}
                            <div className="border-t border-slate-200 pt-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  toggleColumnVisibility(col.key);
                                  setActiveFilterPopoverCol(null);
                                }}
                                className="w-full text-left px-2 py-1 rounded hover:bg-amber-50 text-amber-800 font-medium flex items-center gap-1.5 cursor-pointer text-xs"
                              >
                                <EyeOff size={12} />
                                <span>Hide this Column</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </th>
                );
              })}

              {/* Investigation Lifecycle Status Column Header */}
              <th className="py-2 px-2.5 font-bold align-middle border-r border-slate-300 bg-slate-100 text-slate-800 text-[11px] select-none text-center">
                <div className="flex items-center justify-center gap-1">
                  <ShieldCheck size={12} className="text-blue-600" />
                  <span>Investigation Status</span>
                </div>
              </th>

              {/* Dynamic Validation Result Columns */}
              {visibleValidationSteps.map((step) => {
                const stage = (activeWorkflow.stages || []).find(st => st.id === step.stageId);
                return (
                  <th
                    key={step.id}
                    className="py-1.5 px-2 font-normal align-middle border-r border-slate-300 bg-emerald-50/70 select-none min-w-[130px]"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <span className="px-1 py-0.2 rounded text-[8px] font-mono font-bold bg-white text-emerald-900 border border-emerald-300 shadow-2xs truncate max-w-[110px]">
                          {stage?.name || 'Stage 1'}
                        </span>
                        <span className="px-1 py-0.2 rounded text-[8px] font-bold bg-emerald-700 text-white font-mono">
                          {step.checkType}
                        </span>
                      </div>
                      <div className="font-bold text-emerald-950 text-[11px] tracking-tight truncate" title={step.name}>
                        {step.name}
                      </div>
                    </div>
                  </th>
                );
              })}

              {/* Intermediate Function REPORT Columns */}
              {visibleReportColumns.map(rc => (
                <th
                  key={`report_${rc.key}`}
                  className="py-1.5 px-2.5 font-normal align-middle border-r border-slate-300 bg-purple-50 select-none min-w-[125px]"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="px-1 py-0.2 rounded text-[8px] font-mono font-bold bg-white text-purple-900 border border-purple-300 shadow-2xs truncate max-w-[90px]">
                        REPORT
                      </span>
                      <span className="px-1 py-0.2 rounded text-[8px] font-bold bg-purple-700 text-white font-mono">
                        OUTPUT
                      </span>
                    </div>
                    <div className="font-bold text-purple-950 text-[11px] tracking-tight truncate" title={rc.label}>
                      {rc.label}
                    </div>
                  </div>
                </th>
              ))}

              {/* Action Column */}
              <th className="py-2 px-2 font-bold text-center border-r border-slate-300 text-slate-600 text-[11px] select-none">
                Actions
              </th>
            </tr>
          </thead>

          {/* Row Data with Authentic Excel Grid Lines */}
          <tbody className="text-slate-800 divide-y divide-slate-200">
            {paginatedRows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(1, visibleDatasetColumns.length + visibleValidationSteps.length + visibleReportColumns.length + 3)}
                  className="py-12 text-center text-slate-400 font-mono"
                >
                  {isLoadingDataset ? (
                    <div className="flex flex-col items-center justify-center space-y-2 text-slate-500 py-6">
                      <RotateCcw size={22} className="animate-spin text-emerald-600" />
                      <span className="text-xs font-mono font-medium">Loading task dataset records from database...</span>
                    </div>
                  ) : effectiveRows.length === 0 ? (
                    <div className="space-y-3 py-6 max-w-md mx-auto text-slate-500 font-sans">
                      <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center mx-auto border border-slate-200">
                        <FileSpreadsheet size={20} />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800">No Dataset Records Found for #{selectedIssue?.id}</div>
                        <p className="text-xs text-slate-500 mt-1 font-sans">
                          This task does not contain any uploaded transaction records yet. Upload a batch reconciliation file or ingest records into this task to view and run validation.
                        </p>
                      </div>
                      {onOpenNewCase && (
                        <button
                          type="button"
                          onClick={onOpenNewCase}
                          className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                        >
                          + Upload File & Create Task
                        </button>
                      )}
                    </div>
                  ) : (
                    'No records found matching current criteria.'
                  )}
                </td>
              </tr>
            ) : (
              paginatedRows.map((row, idx) => {
                const rowIdx = (currentPage - 1) * pageSize + idx;
                const isSelectedRow = selectedCell.rowIdx === rowIdx;

                return (
                  <tr 
                    key={row.rowId}
                    className={`transition-colors ${
                      isSelectedRow ? 'bg-emerald-50/30' : 'hover:bg-blue-50/20'
                    }`}
                  >
                    {/* Row Index */}
                    <td className="p-1.5 text-center font-mono text-[11px] text-slate-500 bg-[#f8f9fa] border-r border-b border-slate-300 select-none font-semibold">
                      {rowIdx + 1}
                    </td>

                    {/* Data Cells */}
                    {visibleDatasetColumns.map((col) => {
                      const val = String(row.sourceRecord[col.key] ?? '');
                      const isSelectedCell = selectedCell.rowIdx === rowIdx && selectedCell.colKey === col.key;

                      return (
                        <td
                          key={col.key}
                          onClick={() => setSelectedCell({
                            rowIdx,
                            colKey: col.key,
                            colLabel: col.label,
                            value: val
                          })}
                          className={`py-2 px-3 border-r border-b border-slate-300 whitespace-nowrap cursor-cell text-xs ${
                            isSelectedCell
                              ? 'bg-emerald-100/60 outline-2 outline-[#107c41] relative z-10 font-medium text-slate-950'
                              : ''
                          }`}
                        >
                          {val || <span className="text-slate-300 italic">—</span>}
                        </td>
                      );
                    })}

                    {/* Investigation Lifecycle Status Cell */}
                    <td className="py-2 px-2.5 border-r border-b border-slate-300 whitespace-nowrap text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono inline-block ${
                          row.investigationStatus === 'RECONCILED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                          row.investigationStatus === 'CLOSED' ? 'bg-slate-200 text-slate-800 border border-slate-400' :
                          row.investigationStatus === 'FLAGGED' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                          'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}>
                          {row.investigationStatus}
                        </span>

                        {/* Cross-Task Duplicate Badge */}
                        {(row.sourceRecord?._isDuplicate || row.sourceRecord?.isDuplicate) && (
                          <span 
                            className="text-[9px] font-bold font-mono tracking-tight px-1.5 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-300 shadow-2xs"
                            title={`Cross-task duplicate detected in Central Repository. Originally in Task #${row.sourceRecord?._duplicateFromTaskId || row.sourceRecord?._originalTaskId || 'Prior'}`}
                          >
                            DUPLICATE (Task #{row.sourceRecord?._duplicateFromTaskId || row.sourceRecord?._originalTaskId || 'Prior'})
                          </span>
                        )}

                        {/* Batch Assignment Tag */}
                        {row.sourceRecord?._batchId && (
                          <span className="text-[9px] font-mono text-slate-500 bg-slate-100 border border-slate-200 px-1 rounded">
                            {row.sourceRecord._batchId}
                          </span>
                        )}

                        {/* Outcome Flag (e.g. "Settled on 2026-08-09" or "Declined (Code 05)") */}
                        {row.executionSummary?.statusFlagText && (
                          <span 
                            className={`text-[10px] font-bold font-sans tracking-tight px-1.5 py-0.5 rounded border shadow-2xs ${
                              row.executionSummary.statusFlagColor === 'emerald' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                              row.executionSummary.statusFlagColor === 'rose' ? 'bg-rose-50 text-rose-800 border-rose-300' :
                              row.executionSummary.statusFlagColor === 'purple' ? 'bg-purple-50 text-purple-800 border-purple-300' :
                              row.executionSummary.statusFlagColor === 'amber' ? 'bg-amber-50 text-amber-800 border-amber-300' :
                              row.executionSummary.statusFlagColor === 'blue' ? 'bg-blue-50 text-blue-800 border-blue-300' :
                              'bg-slate-50 text-slate-700 border-slate-300'
                            }`}
                            title={row.executionSummary.statusFlagText}
                          >
                            {row.executionSummary.statusFlagText}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Dynamic Multi-Stage Validation Results */}
                    {visibleValidationSteps.map((step) => {
                      const res = row.stepResults[step.id];
                      return (
                        <td key={step.id} className="py-1.5 px-2 border-r border-b border-slate-300 whitespace-nowrap bg-slate-50/20 text-xs">
                          {res ? (
                            <div className="flex items-center gap-1">
                              {/* Result Badge */}
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono ${
                                res.resultStatus === 'PASS' ? 'bg-emerald-600 text-white' :
                                res.resultStatus === 'FAIL' ? 'bg-amber-500 text-white' :
                                'bg-rose-600 text-white'
                              }`}>
                                {res.resultStatus || res.status}
                              </span>

                              {/* Action Badge */}
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border font-mono ${
                                res.actionTaken === 'CONTINUE' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                                res.actionTaken === 'STOP' ? 'bg-rose-50 text-rose-800 border-rose-200' :
                                'bg-purple-50 text-purple-800 border-purple-200'
                              }`}>
                                {res.actionTaken || 'ACT'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-300 font-mono text-[10px]">—</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Intermediate Function REPORT Cells */}
                    {visibleReportColumns.map(rc => {
                      const reportVal = row.sourceRecord[`_report_${rc.key}`] 
                        ?? row.executionSummary?.intermediateReports?.[rc.key]
                        ?? (rc.sourceField ? row.sourceRecord[rc.sourceField] : null)
                        ?? '';
                      return (
                        <td
                          key={`report_${rc.key}`}
                          className="py-1.5 px-2.5 border-r border-b border-slate-300 whitespace-nowrap text-xs bg-purple-50/20 font-mono text-purple-950 font-medium"
                        >
                          {reportVal ? (
                            <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-900 px-1.5 py-0.5 rounded border border-purple-200 text-[11px]">
                              {String(reportVal)}
                            </span>
                          ) : (
                            <span className="text-slate-300 italic">—</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Action Tools */}
                    <td className="py-1 px-2 border-r border-b border-slate-300 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setInspectingRow(row)}
                          className="px-2 py-0.5 text-blue-700 hover:bg-blue-50 rounded text-[10px] font-semibold border border-blue-200 transition cursor-pointer"
                        >
                          Trace DB
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleRowClosed(row.rowId)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                            row.investigationStatus === 'CLOSED'
                              ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300'
                              : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200'
                          }`}
                          title="Toggle transaction investigation state independently without affecting parent issue"
                        >
                          {row.investigationStatus === 'CLOSED' ? 'Reopen' : 'Close Txn'}
                        </button>
                        {row.remedySql && (
                          <button
                            type="button"
                            onClick={() => handleCopySql(row.remedySql!, row.rowId)}
                            className="px-1.5 py-0.5 text-slate-700 hover:bg-slate-100 rounded text-[10px] font-mono border border-slate-300 transition cursor-pointer"
                            title="Copy SQL Remedy Statement"
                          >
                            {copiedId === row.rowId ? <Check size={11} className="text-emerald-700" /> : <Code2 size={11} />}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setHiddenRowIds(prev => new Set(prev).add(row.rowId));
                          }}
                          className="p-0.5 text-slate-400 hover:text-rose-600 rounded text-[10px] transition cursor-pointer"
                          title="Hide this row"
                        >
                          <EyeOff size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* =========================================================================
          6. EXCEL BOTTOM SHEET TABS & STATUS BAR
          ========================================================================= */}
      <div className="bg-[#f3f4f6] border-t border-slate-300 px-3 py-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs select-none">
        {/* Sheet Tabs */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveSheetTab('dataset')}
            className={`px-3 py-1 text-xs font-sans rounded-t font-semibold flex items-center gap-1.5 border-t-2 transition cursor-pointer ${
              activeSheetTab === 'dataset'
                ? 'bg-white text-slate-900 border-emerald-600 shadow-2xs'
                : 'text-slate-600 border-transparent hover:bg-slate-200'
            }`}
          >
            <FileSpreadsheet size={13} className="text-emerald-700" />
            <span>Master Dataset ({orchestratedRows.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSheetTab('anomalies')}
            className={`px-3 py-1 text-xs font-sans rounded-t font-semibold flex items-center gap-1.5 border-t-2 transition cursor-pointer ${
              activeSheetTab === 'anomalies'
                ? 'bg-white text-rose-800 border-rose-600 shadow-2xs'
                : 'text-slate-600 border-transparent hover:bg-slate-200'
            }`}
          >
            <AlertTriangle size={13} className="text-rose-600" />
            <span>Anomalies ({aggregateStats.anomaliesCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSheetTab('reconciled')}
            className={`px-3 py-1 text-xs font-sans rounded-t font-semibold flex items-center gap-1.5 border-t-2 transition cursor-pointer ${
              activeSheetTab === 'reconciled'
                ? 'bg-white text-emerald-800 border-emerald-600 shadow-2xs'
                : 'text-slate-600 border-transparent hover:bg-slate-200'
            }`}
          >
            <CheckCircle2 size={13} className="text-emerald-600" />
            <span>Clean ({aggregateStats.reconciledCount})</span>
          </button>
        </div>

        {/* Pagination & Excel Status Metrics */}
        <div className="flex items-center gap-4 text-[11px] text-slate-600 font-mono">
          <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded border border-slate-300">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="px-1.5 py-0.2 rounded hover:bg-slate-200 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-bold"
            >
              ◀
            </button>
            <span>
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="px-1.5 py-0.2 rounded hover:bg-slate-200 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer font-bold"
            >
              ▶
            </button>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="ml-1 text-[10px] bg-white border border-slate-300 rounded px-1 py-0.2 text-slate-700 font-mono focus:outline-none"
            >
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
              <option value={250}>250 / page</option>
            </select>
          </div>

          <span>COUNT: <strong className="text-slate-900 font-bold">{aggregateStats.visibleCount}</strong></span>
          <span>SUM: <strong className="text-slate-900 font-bold">${aggregateStats.sum.toFixed(2)}</strong></span>
          <span>AVG: <strong className="text-slate-900 font-bold">${aggregateStats.average.toFixed(2)}</strong></span>
          <span className="text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.2 rounded">READY</span>
        </div>
      </div>

      {/* =========================================================================
          7. DATABASE RECORD INSPECTOR MODAL
          ========================================================================= */}
      {inspectingRow && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-300 max-w-xl w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div className="flex items-center gap-2">
                <Database size={16} className="text-blue-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-xs font-mono uppercase tracking-wider">
                    Transaction Investigation: {inspectingRow.rowId}
                  </h3>
                  <p className="text-[10px] text-slate-500">Multi-Stage Investigation Audit Trail</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingRow(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Lifecycle Status Pill and Individual Transaction Closure Button */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Investigation Status:</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase font-mono ${
                  inspectingRow.investigationStatus === 'RECONCILED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                  inspectingRow.investigationStatus === 'CLOSED' ? 'bg-slate-200 text-slate-800 border border-slate-400' :
                  inspectingRow.investigationStatus === 'FLAGGED' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                  'bg-amber-100 text-amber-800 border border-amber-300'
                }`}>
                  {inspectingRow.investigationStatus}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  handleToggleRowClosed(inspectingRow.rowId);
                  setInspectingRow({
                    ...inspectingRow,
                    investigationStatus: inspectingRow.investigationStatus === 'CLOSED' ? 'INVESTIGATING' : 'CLOSED',
                    isClosed: inspectingRow.investigationStatus !== 'CLOSED'
                  });
                }}
                className={`px-3 py-1 rounded text-xs font-bold border transition cursor-pointer ${
                  inspectingRow.investigationStatus === 'CLOSED'
                    ? 'bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-400'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-700 shadow-xs'
                }`}
              >
                {inspectingRow.investigationStatus === 'CLOSED' ? 'Reopen Transaction' : 'Close Transaction Case'}
              </button>
            </div>

            {/* Central Repository Lineage & Cross-Task Duplicate Detection Card */}
            {(inspectingRow.sourceRecord?._isDuplicate || inspectingRow.sourceRecord?.isDuplicate) ? (
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-purple-950 text-xs space-y-1.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1.5 text-purple-900 font-mono text-[11px] uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-purple-600 inline-block animate-pulse"></span>
                    Central Transaction Repository: Duplicate Identified
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-purple-200 text-purple-900 border border-purple-300">
                    Prior Task #{inspectingRow.sourceRecord?._duplicateFromTaskId || inspectingRow.sourceRecord?._originalTaskId || 'Recorded'}
                  </span>
                </div>
                <p className="text-[11px] text-purple-800">
                  This transaction key previously appeared in Task <strong>#{inspectingRow.sourceRecord?._duplicateFromTaskId || inspectingRow.sourceRecord?._originalTaskId}</strong>. The Central Repository automatically synchronized historical state to prevent redundant downstream processing.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[10px]">
                  <span className="bg-white/80 px-2 py-0.5 rounded border border-purple-300">
                    Batch: <strong>{inspectingRow.sourceRecord?._batchId || 'N/A'}</strong>
                  </span>
                  {inspectingRow.sourceRecord?._allTaskIds && (
                    <span className="bg-white/80 px-2 py-0.5 rounded border border-purple-300">
                      Task History: {Array.isArray(inspectingRow.sourceRecord._allTaskIds) ? inspectingRow.sourceRecord._allTaskIds.map(t => `#${t}`).join(', ') : inspectingRow.sourceRecord._allTaskIds}
                    </span>
                  )}
                </div>
              </div>
            ) : inspectingRow.sourceRecord?._batchId ? (
              <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-[11px] font-mono text-slate-600">
                <span>Central Batch Allocation: <strong>{inspectingRow.sourceRecord._batchId}</strong></span>
                <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">First Ingested</span>
              </div>
            ) : null}

            <p className="text-[10px] text-slate-400 italic">
              Note: Closing this individual transaction does not automatically close other records or the parent Issue (#{selectedIssue.id}).
            </p>

            {/* Audit Trail of Rules Evaluated */}
            <div className="space-y-2 text-xs">
              <span className="font-bold text-slate-700 text-[11px] uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <CheckCircle size={13} className="text-blue-600" />
                <span>Multi-Stage Rule Evaluation Trajectory:</span>
              </span>

              <div className="space-y-2">
                {(inspectingRow.executionSummary?.auditTrail || []).length > 0 ? (
                  inspectingRow.executionSummary!.auditTrail.map((entry, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-lg border text-xs space-y-1 ${
                        entry.validationResult === 'PASS' ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950' :
                        entry.validationResult === 'FAIL' ? 'bg-amber-50/60 border-amber-200 text-amber-950' :
                        'bg-rose-50/60 border-rose-200 text-rose-950'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-white text-slate-700 border border-slate-300">
                            {entry.stageName}
                          </span>
                          <span className="font-bold text-slate-900">{entry.ruleName}</span>
                        </div>

                        <div className="flex items-center gap-1.5 font-mono text-[10px]">
                          <span className={`px-1.5 py-0.5 rounded font-bold ${
                            entry.validationResult === 'PASS' ? 'bg-emerald-600 text-white' :
                            entry.validationResult === 'FAIL' ? 'bg-amber-500 text-white' :
                            'bg-rose-600 text-white'
                          }`}>
                            {entry.validationResult}
                          </span>
                          <span className="px-1.5 py-0.5 rounded font-bold bg-white border border-slate-300 text-slate-700">
                            ➔ {entry.pipelineAction}
                          </span>
                          <span className="text-slate-400 font-bold">{entry.durationMs}ms</span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-700 font-sans">{entry.message}</p>
                      {entry.errorDetail && (
                        <div className="p-1.5 bg-rose-100 rounded text-[10px] font-mono text-rose-800 border border-rose-200">
                          {entry.errorDetail}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-3 bg-slate-50 rounded border border-slate-200 text-slate-500 italic text-center">
                    No sequential audit entries recorded for this transaction.
                  </div>
                )}
              </div>
            </div>

            {inspectingRow.remedySql && (
              <div className="space-y-1 text-xs">
                <span className="font-bold text-slate-600 text-[10px] uppercase font-mono">Suggested Remedy / Correction DML:</span>
                <div className="relative">
                  <pre className="bg-slate-900 text-emerald-400 p-2.5 rounded font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                    {inspectingRow.remedySql}
                  </pre>
                  <button
                    type="button"
                    onClick={() => handleCopySql(inspectingRow.remedySql!, inspectingRow.rowId)}
                    className="absolute right-2 top-2 p-1 bg-slate-800 hover:bg-slate-700 text-white rounded text-[10px] font-mono cursor-pointer"
                  >
                    {copiedId === inspectingRow.rowId ? 'Copied!' : 'Copy SQL'}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setInspectingRow(null)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
