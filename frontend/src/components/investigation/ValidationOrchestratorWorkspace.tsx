/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Issue, DatabaseConnection, EnvironmentSystem, HashtagPreset, QueryApprovalRequest, User,
  DatabaseValidationWorkflow, ProcessingStage, ValidationResultStatus, PipelineAction,
  TransactionInvestigationStatus, TransactionExecutionSummary, RuleExecutionAuditEntry, GlobalTransactionSchemaField
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
  Sliders, ShieldAlert, CheckSquare, Square, RotateCcw, ShieldCheck, CheckCircle, Zap, Activity, GitBranch
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

/**
 * Extracts ALL parameters configured by the user in the workflow's validation boxes
 * (searchParameters[].inputField, requiredParams, optionalParams, sourceField, canonicalField)
 * and filters them strictly to the ones that are actually PRESENT in the file / data rows.
 * This guarantees the system never guesses keys from a hardcoded list and uses ALL
 * parameters the user put in the validation box if they are present in the file.
 */
export function getWorkflowConfiguredParamsPresentInRow(
  workflow: DatabaseValidationWorkflow | null,
  sampleRow?: Record<string, any>
): { presentParams: string[]; allConfiguredParams: string[] } {
  if (!workflow) return { presentParams: [], allConfiguredParams: [] };
  const configured: string[] = [];
  const seen = new Set<string>();

  const registerParam = (p?: string) => {
    if (!p) return;
    const trimmed = String(p).trim();
    if (trimmed && !seen.has(trimmed.toLowerCase())) {
      seen.add(trimmed.toLowerCase());
      configured.push(trimmed);
    }
  };

  if (Array.isArray(workflow.steps)) {
    for (const step of workflow.steps) {
      if (Array.isArray(step.searchParameters)) {
        for (const sp of step.searchParameters) {
          registerParam(sp.inputField);
        }
      }
      if (Array.isArray(step.requiredParams)) {
        for (const rp of step.requiredParams) {
          registerParam(rp);
        }
      }
      if (Array.isArray(step.optionalParams)) {
        for (const op of step.optionalParams) {
          registerParam(op);
        }
      }
      registerParam(step.sourceField);
      registerParam(step.canonicalField);
    }
  }

  const sampleCols = sampleRow ? Object.keys(sampleRow) : [];
  const present: string[] = [];
  for (const cp of configured) {
    const matchedCol = sampleCols.find(col =>
      col.toLowerCase() === cp.toLowerCase() ||
      col.toLowerCase().replace(/[^a-z0-9]/g, '') === cp.toLowerCase().replace(/[^a-z0-9]/g, '')
    );
    if (matchedCol && !present.includes(matchedCol)) {
      present.push(matchedCol);
    }
  }

  return { presentParams: present, allConfiguredParams: configured };
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
  currentUser,
  users,
  databases,
  systems,
  hashtags,
  onUpdateIssue,
  onDeleteIssue,
  onSendChatMessage,
  onSubmitQueryApproval,
  onOpenNewCase
}: ValidationOrchestratorWorkspaceProps) {
  const selectedIssue = issues.find(i => i.id === selectedIssueId) || issues[0];

  // Dynamic dataset rows loaded strictly for the currently selected task
  const [taskDatasetRows, setTaskDatasetRows] = useState<any[]>(() => {
    return selectedIssue?.firstLevelMappedData || [];
  });
  const [isLoadingDataset, setIsLoadingDataset] = useState<boolean>(false);
  const [centralMasterRows, setCentralMasterRows] = useState<any[]>([]);
  const [isLoadingCentral, setIsLoadingCentral] = useState<boolean>(false);
  const [taskWorkflowExecutions, setTaskWorkflowExecutions] = useState<any[]>([]);
  const [isScanningDuplicates, setIsScanningDuplicates] = useState<boolean>(false);
  const [isMovingOrRemoving, setIsMovingOrRemoving] = useState<boolean>(false);

  // Available batches for the current task
  const [availableBatches, setAvailableBatches] = useState<{ batchId: string; count: number }[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>('ALL');

  // Load task dataset transactions strictly for this task from PostgreSQL/memory
  useEffect(() => {
    if (!selectedIssue?.id) {
      setTaskDatasetRows([]);
      setAvailableBatches([]);
      setTaskWorkflowExecutions([]);
      setHasExecutedValidation(false);
      setServerEvaluatedRecords(null);
      setLiveExecutionMetrics(null);
      return;
    }

    setSelectedBatchId('ALL');
    setHasExecutedValidation(false);
    setServerEvaluatedRecords(null);
    setLiveExecutionMetrics(null);

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

    // Fetch Central Repository Master Records (Sheet 1)
    setIsLoadingCentral(true);
    api.getCentralTransactions(selectedIssue.id)
      .then((res: any) => {
        if (res && Array.isArray(res.records)) {
          setCentralMasterRows(res.records);
        } else {
          setCentralMasterRows([]);
        }
      })
      .catch(err => {
        console.warn('Could not fetch central transactions:', err);
        setCentralMasterRows([]);
      })
      .finally(() => {
        setIsLoadingCentral(false);
      });

    // Fetch Task Workflow Executions (Lookup Table in PostgreSQL) & Workflows together
    Promise.all([
      api.getTaskWorkflowExecutions(selectedIssue.id),
      api.getWorkflows()
    ])
      .then(([res, wfs]: [any, any]) => {
        const executions = res?.executions || [];
        setTaskWorkflowExecutions(executions);
        const workflowList = (Array.isArray(wfs) && wfs.length > 0) ? wfs : availableWorkflows;
        if (Array.isArray(wfs) && wfs.length > 0) {
          setAvailableWorkflows(wfs);
        }

        if (executions.length > 0) {
          const latestExec = executions[0];
          const latestWfId = latestExec.workflow_id || latestExec.workflowId;
          const matchedWf = workflowList.find((w: any) => w.id === latestWfId) || workflowList[0] || null;
          if (matchedWf) {
            setActiveWorkflow(matchedWf);
          }
          if (latestExec.execution_summary?.results) {
            const serverMap: Record<string, any> = {};
            const resultMap = latestExec.execution_summary.results;
            Object.keys(resultMap).forEach(k => {
              serverMap[k] = {
                transaction_id: k,
                retrieval_ref_num: k,
                refnum: k,
                _validation_status: resultMap[k].status,
                _validation_details: resultMap[k].details,
                _target_record: resultMap[k].targetRecord ?? resultMap[k]._target_record ?? null,
                _target_db: resultMap[k].targetDb ?? resultMap[k]._target_db,
                _target_table: resultMap[k].targetTable ?? resultMap[k]._target_table
              };
            });
            setServerEvaluatedRecords(serverMap);
            setLiveExecutionMetrics({
              jobId: `lookup-${latestExec.id || latestWfId}`,
              passedCount: latestExec.passed_count ?? 0,
              failedCount: latestExec.failed_count ?? 0,
              durationMs: latestExec.duration_ms ?? 0,
              cachedHits: 1,
              liveSource: `PostgreSQL Lookup Table (task_workflow_executions) - Executed by ${latestExec.executed_by || 'investigator'}`
            });
            setLiveProgressMsg(`Conducted workflow [${latestExec.workflow_name || latestWfId}] loaded from PostgreSQL lookup table (conducted by ${latestExec.executed_by || 'investigator'}).`);
          }
          setHasExecutedValidation(true);
        } else {
          setServerEvaluatedRecords(null);
          setLiveExecutionMetrics(null);
          setHasExecutedValidation(false);
          if (workflowList.length > 0 && !activeWorkflow) {
            setActiveWorkflow(workflowList[0]);
          }
        }
      })
      .catch((e: any) => console.warn('Could not load task workflow executions:', e));

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

  // Global Standard Directory for categorizing default visible columns (Required + Date + Financial)
  const [standardFields, setStandardFields] = useState<GlobalTransactionSchemaField[]>([]);

  useEffect(() => {
    api.getGlobalStandardDirectory()
      .then(fields => {
        if (Array.isArray(fields) && fields.length > 0) {
          setStandardFields(fields);
        }
      })
      .catch(e => console.warn('Could not load global standard directory:', e));
  }, []);

  // Column View Mode: 'DEFAULT' (Required + Date + Financial), 'ALL', or 'CUSTOM'
  const [columnViewPreset, setColumnViewPreset] = useState<'DEFAULT' | 'ALL' | 'CUSTOM'>('DEFAULT');

  // Row Collision / Duplicate Filter State: 'ALL' | 'DUPLICATES_ONLY' | 'UNIQUE_ONLY'
  const [duplicateFilter, setDuplicateFilter] = useState<'ALL' | 'DUPLICATES_ONLY' | 'UNIQUE_ONLY'>('ALL');
  const [showRowFilterDropdown, setShowRowFilterDropdown] = useState<boolean>(false);
  const [columnSearchTerm, setColumnSearchTerm] = useState<string>('');

  // Helper predicate: Default visible columns = Required + Date category + Financial category (+ core identifiers)
  const isDefaultVisibleColumn = (key: string): boolean => {
    const lower = key.toLowerCase();

    // Always keep essential row tracking/identifiers visible so context is clear
    if (['row_number', 'row_id', '_rownumber', 'transaction_id', 'transaction_key', '_transactionkey', 'hpan', 'prcode', 'card_number'].includes(lower)) {
      return true;
    }

    const field = standardFields.find(f => f.key.toLowerCase() === lower);

    // 1. Required columns
    if (field?.required || ['terminal_id', 'refnum', 'reqamt'].includes(lower)) {
      return true;
    }

    // 2. Date category columns
    if (
      field?.category === 'Audit & Timestamps' ||
      field?.dataType === 'date' ||
      field?.category?.toLowerCase().includes('date') ||
      field?.category?.toLowerCase().includes('time') ||
      lower.includes('date') ||
      lower.includes('time') ||
      ['ttime', 'udatetime', 'exprdate', 'acq_sdatetime', 'iss_sdatetime', 'sw_convdate', 'convdate', 'captdate', 'sttl_date', 'last_update', 'unhold_date', 'created_at'].includes(lower)
    ) {
      return true;
    }

    // 3. Financial category columns
    if (
      field?.category === 'Financial & Amounts' ||
      field?.category?.toLowerCase().includes('finan') ||
      field?.category?.toLowerCase().includes('amount') ||
      lower.endsWith('amt') ||
      lower.includes('fee') ||
      lower.includes('rate') ||
      lower.includes('curr') ||
      ['reqamt', 'interchangeamt', 'conamt', 'client_billingfee', 'sw_convertrate', 'convertrate', 'transfeeamt1', 'transfeeamt2', 'debpfeeamt', 'settlefeeamt', 'currency', 'sw_currency', 'cnvt_currency', 'addlamt', 'repamts', 'actamt', 'tips_amount', 'tax1_amt', 'tax2_amt', 'cashback_amt'].includes(lower)
    ) {
      return true;
    }

    return false;
  };

  // Helper: determine if row is a duplicate across tasks
  const isRowDuplicate = (row: OrchestratedRow | any): boolean => {
    const src = row?.sourceRecord || row;
    if (!src) return false;
    if (src._isDuplicate === true || src.is_duplicate === true) return true;
    if (src._duplicateStatus === 'DUPLICATE' || src.duplicateStatus === 'DUPLICATE') return true;
    if (src._duplicateFromTaskId && src._duplicateFromTaskId !== src._currentTaskId) return true;
    if (Array.isArray(src._allTaskIds) && src._allTaskIds.length > 1) return true;
    if (typeof src._allTaskIds === 'string' && src._allTaskIds.includes(',')) return true;
    if (src._duplicateCount && Number(src._duplicateCount) > 1) return true;
    if (src.duplicate_count && Number(src.duplicate_count) > 1) return true;
    return false;
  };

  // Column Visibility State
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showColumnManager, setShowColumnManager] = useState(false);

  // Visible columns lists (Respects default Required + Date + Financial preset)
  const visibleDatasetColumns = useMemo(() => {
    return columnDefs.filter(c => {
      if (columnViewPreset === 'DEFAULT') {
        return isDefaultVisibleColumn(c.key) && !hiddenColumns.has(c.key);
      }
      return !hiddenColumns.has(c.key);
    });
  }, [columnDefs, columnViewPreset, standardFields, hiddenColumns]);

  // Hidden Rows State
  const [hiddenRowIds, setHiddenRowIds] = useState<Set<string>>(new Set());

  // Per-column Excel Filtering & Sorting State
  const [columnFilters, setColumnFilters] = useState<Record<string, ColumnFilterState>>({});
  const [activeFilterPopoverCol, setActiveFilterPopoverCol] = useState<string | null>(null);
  const [filterSearchTerm, setFilterSearchTerm] = useState('');

  // Active Multi-Stage Workflow State (Loaded strictly from PostgreSQL database via API)
  const [availableWorkflows, setAvailableWorkflows] = useState<DatabaseValidationWorkflow[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<DatabaseValidationWorkflow | null>(null);

  // Explicit Validation Execution State: Driven strictly by PostgreSQL task_workflow_executions lookup table
  const [hasExecutedValidation, setHasExecutedValidation] = useState<boolean>(false);

  // Fetch workflows from Backend API on mount and sync with current task executions
  useEffect(() => {
    api.getWorkflows()
      .then(wfs => {
        if (Array.isArray(wfs)) {
          setAvailableWorkflows(wfs);
          setActiveWorkflow(prev => {
            if (prev) {
              return wfs.find(w => w.id === prev.id) || prev;
            }
            if (taskWorkflowExecutions.length > 0) {
              const latestExecId = taskWorkflowExecutions[0].workflow_id || taskWorkflowExecutions[0].workflowId;
              const found = wfs.find(w => w.id === latestExecId);
              if (found) return found;
            }
            return wfs.length > 0 ? wfs[0] : null;
          });
        }
      })
      .catch(err => console.warn('Could not fetch workflows from API in workspace:', err));
  }, [taskWorkflowExecutions]);

  const [isVerifying, setIsVerifying] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'FLAGGED' | 'CLEAN'>('ALL');
  const [investigationStatusFilter, setInvestigationStatusFilter] = useState<'ALL' | 'INVESTIGATING' | 'RECONCILED' | 'FLAGGED' | 'CLOSED'>('ALL');
  const [showValidationDropdown, setShowValidationDropdown] = useState(false);
  const [inspectingRow, setInspectingRow] = useState<OrchestratedRow | null>(null);
  const [outcomeDrilldownRow, setOutcomeDrilldownRow] = useState<any | null>(null);
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

  const [activeSheetTab, setActiveSheetTab] = useState<'dataset' | 'sheet1_central' | 'anomalies' | 'reconciled'>('dataset');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);

  // Live Server Orchestration & Mirror Execution State
  const [serverEvaluatedRecords, setServerEvaluatedRecords] = useState<Record<string, any> | null>(null);
  const [liveExecutionMetrics, setLiveExecutionMetrics] = useState<{
    jobId?: string;
    passedCount: number;
    failedCount: number;
    durationMs: number;
    cachedHits: number;
    liveSource?: string;
  } | null>(null);
  const [liveProgressMsg, setLiveProgressMsg] = useState<string>('');

  // SSE Listener for Real-Time Pipeline Events
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events');
      es.addEventListener('workflow:stage_completed', (e: any) => {
        try {
          const data = JSON.parse(e.data);
          setLiveProgressMsg(`Stage [${data.stageName || data.stageId}] complete: ${data.passedCount} passed, ${data.failedCount} failed`);
        } catch { }
      });
      es.addEventListener('workflow:db_unreachable', (e: any) => {
        try {
          const data = JSON.parse(e.data);
          setLiveProgressMsg(`Circuit tripped for DB '${data.dbName}': ${data.error || 'Connection offline'}`);
        } catch { }
      });
    } catch { }
    return () => {
      if (es) es.close();
    };
  }, []);

  // Compute Orchestrated Row Results using the Centralized Shared Investigation Engine
  const orchestratedRows: OrchestratedRow[] = useMemo(() => {
    const isTaskValidated = hasExecutedValidation
      || (taskWorkflowExecutions && taskWorkflowExecutions.length > 0)
      || effectiveRows.some(r => r._validation_status && r._validation_status !== 'PENDING');

    const sampleRow = effectiveRows.length > 0 ? effectiveRows[0] : {};
    const { presentParams: wfParamsPresent } = getWorkflowConfiguredParamsPresentInRow(activeWorkflow, sampleRow);

    const getRowCandidateKeys = (row: any, rowIdx: number): string[] => {
      const keys: string[] = [];
      for (const param of wfParamsPresent) {
        const val = row[param];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          keys.push(String(val));
        }
      }
      const tuple = wfParamsPresent.map(p => String(row[p] ?? '').trim()).filter(Boolean).join(':::');
      if (tuple && !keys.includes(tuple)) keys.push(tuple);
      keys.push(`ROW-${rowIdx + 1}`);
      return keys;
    };

    if (!isTaskValidated || !activeWorkflow) {
      return effectiveRows.map((row, rowIdx) => {
        const rowId = getRowCandidateKeys(row, rowIdx)[0] || `ROW-${rowIdx + 1}`;
        const overriddenStatus = manualStatusOverrides[rowId];
        const rowValStatus = row._validation_status || serverEvaluatedRecords?.[rowId]?._validation_status;
        let initialStatus: TransactionInvestigationStatus = overriddenStatus || 'PENDING';
        if (rowValStatus === 'PASS') initialStatus = 'RECONCILED';
        else if (rowValStatus === 'FAIL') initialStatus = 'FLAGGED';
        else if (rowValStatus === 'PAUSED_DB_OFFLINE') initialStatus = 'INVESTIGATING';

        const stepResults: Record<string, StepExecutionResult> = {};
        if (rowValStatus && activeWorkflow?.steps) {
          activeWorkflow.steps.forEach(step => {
            stepResults[step.id] = {
              stepId: step.id,
              status: rowValStatus === 'PASS' ? 'PASSED' : 'FAILED',
              badgeText: rowValStatus,
              detail: row._validation_details || (rowValStatus === 'PASS' ? 'Verified in conducted workflow' : 'Discrepancy detected in conducted workflow'),
              resultStatus: rowValStatus === 'PASS' ? 'PASS' : 'FAIL',
              actionTaken: rowValStatus === 'PASS' ? 'CONTINUE' : 'FLAG'
            };
          });
        }

        return {
          rowId,
          sourceRecord: row,
          stepResults,
          overallSeverity: initialStatus === 'FLAGGED' ? 'CRITICAL' : 'RECONCILED',
          overallSummary: activeWorkflow
            ? (rowValStatus ? `Conducted verdict: [${rowValStatus}]` : 'Awaiting validation trigger. Click "▶ Run Validation" to evaluate against pipeline rules.')
            : (rowValStatus ? `Conducted verdict: [${rowValStatus}]` : 'No validation workflow configured.'),
          investigationStatus: initialStatus,
          isClosed: false,
          isHalted: false
        };
      });
    }

    const mergedEffectiveRows = effectiveRows.map((row, rowIdx) => {
      const rowKeyCandidates = getRowCandidateKeys(row, rowIdx);

      let serverRec: any = null;
      if (serverEvaluatedRecords) {
        for (const cand of rowKeyCandidates) {
          if (serverEvaluatedRecords[cand]) {
            serverRec = serverEvaluatedRecords[cand];
            break;
          }
        }
      }

      const isRowEvaluated = (serverRec && serverRec._validation_status && serverRec._validation_status !== 'PENDING')
        || (row._validation_status && row._validation_status !== 'PENDING')
        || (row.sourceRecord && row.sourceRecord._validation_status && row.sourceRecord._validation_status !== 'PENDING');
      const hasTargetRecordExplicit = isRowEvaluated && (
        (serverRec && '_target_record' in serverRec)
        || ('_target_record' in row)
        || (row.canonical_data && '_target_record' in row.canonical_data)
      );
      const targetRecord = isRowEvaluated ? (serverRec?._target_record ?? row._target_record ?? row.canonical_data?._target_record ?? null) : null;
      const targetDbName = serverRec?._target_db || row._target_db || activeWorkflow?.targetDbId || 'Target DB';
      const targetTableName = serverRec?._target_table || row._target_table || activeWorkflow?.targetTable || 'transactions';

      return {
        ...row,
        ...(serverRec || {}),
        ...(hasTargetRecordExplicit ? { _target_record: targetRecord } : {}),
        _target_db: targetDbName,
        _target_table: targetTableName
      };
    });

    const batchSummaries = executeBatchInvestigation(mergedEffectiveRows, activeWorkflow);

    return mergedEffectiveRows.map((row, rowIdx) => {
      const rowKeyCandidates = getRowCandidateKeys(row, rowIdx);

      const rowId = rowKeyCandidates[0] || `ROW-${rowIdx + 1}`;
      let serverRec: any = null;
      if (serverEvaluatedRecords) {
        for (const cand of rowKeyCandidates) {
          if (serverEvaluatedRecords[cand]) {
            serverRec = serverEvaluatedRecords[cand];
            break;
          }
        }
      }

      const summary = batchSummaries[rowId] || (rowKeyCandidates[1] ? batchSummaries[rowKeyCandidates[1]] : undefined);
      const isRowEvaluated = (serverRec && serverRec._validation_status && serverRec._validation_status !== 'PENDING')
        || (row._validation_status && row._validation_status !== 'PENDING')
        || (row.canonical_data && row.canonical_data._validation_status && row.canonical_data._validation_status !== 'PENDING')
        || (row.sourceRecord && row.sourceRecord._validation_status && row.sourceRecord._validation_status !== 'PENDING');
      const hasTargetRecordExplicit = isRowEvaluated && (
        (serverRec && '_target_record' in serverRec)
        || ('_target_record' in row)
        || (row.canonical_data && '_target_record' in row.canonical_data)
      );
      const targetRecord = isRowEvaluated ? (serverRec?._target_record ?? row._target_record ?? row.canonical_data?._target_record ?? null) : null;
      const targetDbName = serverRec?._target_db || row._target_db || activeWorkflow?.targetDbId || 'Target DB';
      const targetTableName = serverRec?._target_table || row._target_table || activeWorkflow?.targetTable || 'transactions';

      let serverStatus: TransactionInvestigationStatus | undefined;
      if (serverRec && serverRec._validation_status && serverRec._validation_status !== 'PENDING') {
        if (serverRec._validation_status === 'FAIL' || (hasTargetRecordExplicit && !targetRecord)) serverStatus = 'FLAGGED';
        else if (serverRec._validation_status === 'PASS') serverStatus = 'RECONCILED';
        else if (serverRec._validation_status === 'PAUSED_DB_OFFLINE') serverStatus = 'INVESTIGATING';
      } else if (row._validation_status && row._validation_status !== 'PENDING') {
        if (row._validation_status === 'FAIL' || (hasTargetRecordExplicit && !targetRecord)) serverStatus = 'FLAGGED';
        else if (row._validation_status === 'PASS') serverStatus = 'RECONCILED';
        else if (row._validation_status === 'PAUSED_DB_OFFLINE') serverStatus = 'INVESTIGATING';
      }

      const overriddenStatus = manualStatusOverrides[rowId];
      const finalStatus: TransactionInvestigationStatus = overriddenStatus || serverStatus || summary?.investigationStatus || 'PENDING';
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

      // Map audit trail to stepResults for UI display
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

      // CRITICAL: If target database was queried and returned 0 matching records,
      // any EXISTENCE_CHECK step MUST be marked as FAILED with 404 Missing:
      if (hasTargetRecordExplicit && !targetRecord && activeWorkflow?.steps) {
        activeWorkflow.steps.forEach(step => {
          if (step.checkType === 'EXISTENCE_CHECK') {
            stepResults[step.id] = {
              stepId: step.id,
              status: 'FAILED',
              badgeText: '404 Missing',
              detail: `Record not found in target database (${targetDbName}.${targetTableName})`,
              resultStatus: 'FAIL',
              actionTaken: step.onFailAction || 'STOP'
            };
          }
        });
      }

      // If batch summary audit trail was empty or server evaluated as FAIL, populate stepResults
      const rowValStatus = serverRec?._validation_status || row._validation_status;
      if (Object.keys(stepResults).length === 0 && rowValStatus && activeWorkflow?.steps) {
        activeWorkflow.steps.forEach(step => {
          stepResults[step.id] = {
            stepId: step.id,
            status: rowValStatus === 'PASS' ? 'PASSED' : 'FAILED',
            badgeText: rowValStatus,
            detail: (hasTargetRecordExplicit && !targetRecord)
              ? `Record not found in target database (${targetDbName}.${targetTableName})`
              : (row._validation_details || (rowValStatus === 'PASS' ? 'Condition satisfied' : 'Discrepancy detected in conducted workflow')),
            resultStatus: rowValStatus === 'PASS' ? 'PASS' : 'FAIL',
            actionTaken: rowValStatus === 'PASS' ? 'CONTINUE' : 'FLAG'
          };
        });
      }

      const mergedSource = {
        ...row,
        ...(serverRec || {}),
        ...(targetRecord ? { _target_record: targetRecord } : {}),
        _target_db: targetDbName,
        _target_table: targetTableName
      };

      return {
        rowId,
        sourceRecord: mergedSource,
        _target_record: targetRecord,
        _target_db: targetDbName,
        _target_table: targetTableName,
        stepResults,
        overallSeverity: rowSeverity,
        overallSummary: summary?.auditTrail.map(a => `${a.ruleName}: [${a.validationResult}] ${a.pipelineAction}`).join(' | ') || (serverRec ? `Evaluated via ${activeWorkflow?.name}: [${serverRec._validation_status}]` : rowValStatus ? `Conducted verdict: [${rowValStatus}]` : 'Passed multi-stage validation'),
        remedySql: summary?.remedySql,
        executionSummary: summary,
        investigationStatus: finalStatus,
        isClosed,
        isHalted
      };
    });
  }, [effectiveRows, activeWorkflow, manualStatusOverrides, hasExecutedValidation, serverEvaluatedRecords, taskWorkflowExecutions]);

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

  // Filtered & Sorted Rows based on Excel Toolbar & Column Filters (Dual Sheet Support)
  const filteredAndSortedRows = useMemo(() => {
    let result: OrchestratedRow[];

    if (activeSheetTab === 'sheet1_central') {
      const source = centralMasterRows.length > 0 ? centralMasterRows : effectiveRows;
      result = source.map((r, idx) => {
        const rowId = String(r.transaction_id || r._transactionKey || r.refnum || `CENTRAL-${idx + 1}`);
        const matchedOrchestrated = orchestratedRows[idx]
          || orchestratedRows.find(o => o.rowId === rowId || (o.sourceRecord?.refnum && o.sourceRecord.refnum === r.refnum));
        if (matchedOrchestrated) {
          return {
            ...matchedOrchestrated,
            sourceRecord: {
              ...r,
              ...matchedOrchestrated.sourceRecord
            }
          };
        }
        const rowValStatus = r._validation_status || serverEvaluatedRecords?.[rowId]?._validation_status;
        return {
          rowId,
          sourceRecord: r,
          stepResults: {},
          overallSeverity: (rowValStatus === 'FAIL' ? 'CRITICAL' : 'RECONCILED') as 'CRITICAL' | 'RECONCILED',
          overallSummary: 'Central Master Record (Clean Ingested Ledger - Immutable)',
          investigationStatus: (rowValStatus === 'PASS' ? 'RECONCILED' : rowValStatus === 'FAIL' ? 'FLAGGED' : 'PENDING') as any,
          isClosed: false,
          isHalted: false
        };
      });
    } else {
      result = orchestratedRows.filter(r => !hiddenRowIds.has(r.rowId));
      if (activeSheetTab === 'anomalies') {
        result = result.filter(r => r.overallSeverity !== 'RECONCILED');
      } else if (activeSheetTab === 'reconciled') {
        result = result.filter(r => r.overallSeverity === 'RECONCILED');
      }
    }

    // Outcome quick filter
    if (outcomeFilter === 'FLAGGED') {
      result = result.filter(r => r.overallSeverity !== 'RECONCILED');
    } else if (outcomeFilter === 'CLEAN') {
      result = result.filter(r => r.overallSeverity === 'RECONCILED');
    }

    // Investigation Status quick filter
    if (investigationStatusFilter !== 'ALL') {
      result = result.filter(r => r.investigationStatus === investigationStatusFilter);
    }

    // Row Duplicate / Unique filter
    if (duplicateFilter === 'DUPLICATES_ONLY') {
      result = result.filter(r => isRowDuplicate(r));
    } else if (duplicateFilter === 'UNIQUE_ONLY') {
      result = result.filter(r => !isRowDuplicate(r));
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
  }, [orchestratedRows, hiddenRowIds, activeSheetTab, outcomeFilter, investigationStatusFilter, duplicateFilter, searchTerm, columnFilters, centralMasterRows, effectiveRows]);

  // Real-time duplicate & unique record counts
  const duplicateCounts = useMemo(() => {
    const source = activeSheetTab === 'sheet1_central'
      ? (centralMasterRows.length > 0 ? centralMasterRows : effectiveRows)
      : orchestratedRows;
    let dups = 0;
    source.forEach((r: any) => {
      if (isRowDuplicate(r)) dups++;
    });
    return {
      duplicates: dups,
      unique: Math.max(0, source.length - dups),
      total: source.length
    };
  }, [activeSheetTab, centralMasterRows, effectiveRows, orchestratedRows]);

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
      hiddenColCount: Math.max(0, columnDefs.length - visibleDatasetColumns.length),
      hiddenRowCount: hiddenRowIds.size
    };
  }, [orchestratedRows, filteredAndSortedRows, columnDefs, visibleDatasetColumns, hiddenRowIds]);

  // Toggle Column Visibility
  const toggleColumnVisibility = (key: string) => {
    const isCurrentlyVisible = visibleDatasetColumns.some(c => c.key === key);
    let nextHidden: Set<string>;
    if (columnViewPreset === 'DEFAULT') {
      nextHidden = new Set(columnDefs.filter(c => !isDefaultVisibleColumn(c.key)).map(c => c.key));
    } else {
      nextHidden = new Set(hiddenColumns);
    }

    if (isCurrentlyVisible) {
      nextHidden.add(key);
    } else {
      nextHidden.delete(key);
    }

    setColumnViewPreset('CUSTOM');
    setHiddenColumns(nextHidden);
  };

  const showAllColumns = () => {
    setColumnViewPreset('ALL');
    setHiddenColumns(new Set());
  };

  const resetToDefaultColumns = () => {
    setColumnViewPreset('DEFAULT');
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

  const currentWorkflowExecution = useMemo(() => {
    if (!activeWorkflow || !taskWorkflowExecutions) return null;
    return taskWorkflowExecutions.find((e: any) => e.workflow_id === activeWorkflow.id);
  }, [activeWorkflow, taskWorkflowExecutions]);

  // Workflows conducted on this investigation (ordered chronologically, latest first)
  const conductedWorkflows = useMemo(() => {
    const list: Array<{ id: string; name: string; status?: string; passedCount?: number; failedCount?: number; executedAt?: string; isLatest: boolean }> = [];
    const seenIds = new Set<string>();

    (taskWorkflowExecutions || []).forEach((e: any, idx: number) => {
      const id = e.workflow_id || e.workflowId;
      const name = e.workflow_name || e.workflowName || availableWorkflows.find(w => w.id === id)?.name || id;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        list.push({
          id,
          name,
          status: e.status,
          passedCount: e.passed_count ?? e.passedCount,
          failedCount: e.failed_count ?? e.failedCount,
          executedAt: e.executed_at || e.executedAt,
          isLatest: idx === 0
        });
      }
    });

    if (hasExecutedValidation && activeWorkflow && !seenIds.has(activeWorkflow.id)) {
      list.push({
        id: activeWorkflow.id,
        name: activeWorkflow.name,
        isLatest: list.length === 0
      });
    }

    return list;
  }, [taskWorkflowExecutions, availableWorkflows, hasExecutedValidation, activeWorkflow]);

  const conductedWorkflowsCount = conductedWorkflows.length;

  const handleSelectWorkflow = (chosenId: string) => {
    const chosen = availableWorkflows.find(w => w.id === chosenId);
    if (!chosen) return;
    setActiveWorkflow(chosen);

    const conductedExec = taskWorkflowExecutions.find((x: any) => (x.workflow_id || x.workflowId) === chosenId);
    if (conductedExec) {
      if (conductedExec.execution_summary?.results) {
        const serverMap: Record<string, any> = {};
        const resultMap = conductedExec.execution_summary.results;
        Object.keys(resultMap).forEach(k => {
          serverMap[k] = {
            transaction_id: k,
            retrieval_ref_num: k,
            refnum: k,
            _validation_status: resultMap[k].status,
            _validation_details: resultMap[k].details,
            _target_record: resultMap[k].targetRecord ?? resultMap[k]._target_record ?? null,
            _target_db: resultMap[k].targetDb ?? resultMap[k]._target_db,
            _target_table: resultMap[k].targetTable ?? resultMap[k]._target_table
          };
        });
        setServerEvaluatedRecords(serverMap);
        setLiveExecutionMetrics({
          jobId: `lookup-${conductedExec.id || conductedExec.workflow_id}`,
          passedCount: conductedExec.passed_count ?? 0,
          failedCount: conductedExec.failed_count ?? 0,
          durationMs: conductedExec.duration_ms ?? 0,
          cachedHits: 1,
          liveSource: `PostgreSQL Lookup Table (task_workflow_executions) - Executed by ${conductedExec.executed_by || 'investigator'}`
        });
        setLiveProgressMsg(`Loaded conducted validation for [${conductedExec.workflow_name || chosen.name}] from PostgreSQL lookup table.`);
      }
      setHasExecutedValidation(true);
    } else {
      setServerEvaluatedRecords(null);
      setLiveExecutionMetrics(null);
      setHasExecutedValidation(false);
      setLiveProgressMsg(`Workflow '${chosen.name}' has not yet been conducted on investigation #${selectedIssue?.id}. Click "▶ Run Validation" to evaluate.`);
    }
  };

  const handleScanDuplicates = async () => {
    setIsScanningDuplicates(true);
    try {
      const res = await api.scanCrossTaskDuplicates();
      alert(`Cross-task duplicate scan complete: ${res.flaggedCount ?? 0} transaction collision(s) detected and updated.`);
      if (selectedIssue?.id) {
        const centralRes = await api.getCentralTransactions(selectedIssue.id);
        setCentralMasterRows(centralRes?.records || []);
      }
    } catch (err: any) {
      alert('Error running cross-task duplicate scan: ' + (err.message || err));
    } finally {
      setIsScanningDuplicates(false);
    }
  };

  const handleMoveToTask = async (txnKey: string) => {
    if (!selectedIssue?.id) return;
    if (!window.confirm(`Move transaction "${txnKey}" exclusively to Task #${selectedIssue.id}? This will purge it from other tasks.`)) {
      return;
    }
    setIsMovingOrRemoving(true);
    try {
      await api.moveTransactionToTask(txnKey, selectedIssue.id);
      const [centralRes, taskRes] = await Promise.all([
        api.getCentralTransactions(selectedIssue.id),
        api.getTaskTransactions(selectedIssue.id, 1, 5000)
      ]);
      setCentralMasterRows(centralRes?.records || []);
      if (taskRes && Array.isArray(taskRes.rows)) {
        setTaskDatasetRows(taskRes.rows);
      }
      alert(`Transaction "${txnKey}" moved exclusively to Task #${selectedIssue.id}`);
    } catch (err: any) {
      alert('Error moving transaction: ' + (err.message || err));
    } finally {
      setIsMovingOrRemoving(false);
    }
  };

  const handleRemoveFromTask = async (txnKey: string) => {
    if (!selectedIssue?.id) return;
    if (!window.confirm(`Remove transaction "${txnKey}" from Task #${selectedIssue.id}?`)) {
      return;
    }
    setIsMovingOrRemoving(true);
    try {
      await api.removeTransactionFromTask(txnKey, selectedIssue.id);
      const [centralRes, taskRes] = await Promise.all([
        api.getCentralTransactions(selectedIssue.id),
        api.getTaskTransactions(selectedIssue.id, 1, 5000)
      ]);
      setCentralMasterRows(centralRes?.records || []);
      if (taskRes && Array.isArray(taskRes.rows)) {
        setTaskDatasetRows(taskRes.rows);
      }
      alert(`Transaction "${txnKey}" removed from Task #${selectedIssue.id}`);
    } catch (err: any) {
      alert('Error removing transaction: ' + (err.message || err));
    } finally {
      setIsMovingOrRemoving(false);
    }
  };

  const [isClearingResults, setIsClearingResults] = useState(false);

  /**
   * Permanently clears ALL validation run history for the current task from
   * the backend (task_workflow_executions) and resets the UI to unvalidated state.
   */
  const handleClearResults = async () => {
    if (!selectedIssue?.id) return;
    if (!window.confirm(
      `Permanently clear all validation results for Task "${selectedIssue.title}"?\n\nThis will delete the execution history from the database and cannot be undone.`
    )) return;

    setIsClearingResults(true);
    try {
      await api.clearTaskWorkflowExecutions(selectedIssue.id);
      // Reset all local validation state
      setHasExecutedValidation(false);
      setServerEvaluatedRecords(null);
      setLiveExecutionMetrics(null);
      setLiveProgressMsg('');
      setTaskWorkflowExecutions([]);
      setManualStatusOverrides({});
    } catch (err: any) {
      alert('Failed to clear results: ' + (err.message || err));
    } finally {
      setIsClearingResults(false);
    }
  };

  const handleRunValidation = async (forceRerun: boolean = true) => {
    if (!activeWorkflow) {
      alert('Please select or create a validation workflow first.');
      return;
    }
    setIsVerifying(true);
    setLiveProgressMsg('Dispatching workflow execution to backend orchestrator...');

    try {
      // ── Derive ALL parameters configured by the user in the workflow's validation boxes
      // and filter strictly to those present in the actual uploaded file rows.
      // We NEVER fall back to hardcoded field names (e.g. transaction_id, retrieval_ref_num).
      // If present in the file, we use ALL of them — not just one.
      const sample = effectiveRows.length > 0 ? effectiveRows[0] : {};
      const { presentParams, allConfiguredParams } = getWorkflowConfiguredParamsPresentInRow(activeWorkflow, sample);

      let detectedKeyField: string | undefined;
      let activeKeyFields: string[] = [];

      if (presentParams.length > 0) {
        // Use ALL parameters that the user put in the validation box if they are present in the file
        detectedKeyField = presentParams[0];
        activeKeyFields = presentParams;
      } else if (allConfiguredParams.length > 0) {
        // Parameters were configured in the validation box, but NONE exist in the uploaded file!
        const fileCols = Object.keys(sample).filter(c => !c.startsWith('_'));
        alert(`None of the parameters configured in your validation box ([${allConfiguredParams.join(', ')}]) are present in the uploaded file columns ([${fileCols.join(', ')}]). Please verify your file headers or validation box parameters.`);
        setIsVerifying(false);
        return;
      } else if (effectiveRows.length > 0) {
        // No parameters were configured anywhere in the workflow:
        // Pick the first non-underscore populated column from the file (never a hardcoded guess)
        const fileCols = Object.keys(sample);
        const firstCol = fileCols.find(k => !k.startsWith('_') && sample[k] !== undefined && sample[k] !== null && String(sample[k]).trim() !== '');
        if (firstCol) {
          detectedKeyField = firstCol;
          activeKeyFields = [firstCol];
        }
      }

      if (!detectedKeyField || activeKeyFields.length === 0) {
        alert('Cannot determine the parameters for this workflow. Please configure at least one parameter in your validation box that is present in the file.');
        setIsVerifying(false);
        return;
      }

      const res = await api.executeUniversalWorkflow({
        workflowId: activeWorkflow.id,
        records: effectiveRows,
        sourceType: 'INVESTIGATION_PANEL',
        sourceId: selectedIssue?.id,
        keyField: detectedKeyField,
        keyFields: activeKeyFields,
        forceRerun,
        executedBy: (currentUser as any)?.displayName || currentUser?.username || 'investigator'
      });

      const serverMap: Record<string, any> = {};
      (res.records || []).forEach((r: any, idx: number) => {
        // Index by ALL configured parameters present in the file
        const candidateKeys: string[] = [];
        for (const kf of activeKeyFields) {
          if (r[kf] !== undefined && r[kf] !== null && String(r[kf]).trim() !== '') {
            candidateKeys.push(String(r[kf]));
          }
        }
        // Also index by composite tuple key of all parameters
        const tupleKey = activeKeyFields
          .map(kf => String(r[kf] ?? '').trim())
          .filter(Boolean)
          .join(':::');
        if (tupleKey && !candidateKeys.includes(tupleKey)) candidateKeys.push(tupleKey);
        candidateKeys.push(`ROW-${idx + 1}`);

        candidateKeys.forEach(k => {
          serverMap[k] = r;
        });
      });


      setServerEvaluatedRecords(serverMap);
      setLiveExecutionMetrics({
        jobId: res.jobId,
        passedCount: res.passedCount,
        failedCount: res.failedCount,
        durationMs: res.durationMs,
        cachedHits: res.cachedHits || 0,
        liveSource: res.cached ? 'Task-Workflow Lookup Table (Instant Cached)' : 'PostgreSQL Mirror (Set-Based)'
      });
      setHasExecutedValidation(true);
      setActiveSheetTab('dataset');
      setLiveProgressMsg(
        res.cached
          ? `Instant lookup hit: ${res.passedCount} Passed, ${res.failedCount} Failed (No repeated execution)`
          : `Validated in ${res.durationMs}ms: ${res.passedCount} Passed, ${res.failedCount} Failed (${res.cachedHits || 0} cached)`
      );

      if (selectedIssue?.id) {
        api.getTaskWorkflowExecutions(selectedIssue.id)
          .then((wfRes: any) => setTaskWorkflowExecutions(wfRes?.executions || []))
          .catch(() => { });
        api.getTaskTransactions(selectedIssue.id, 1, 5000)
          .then((tRes: any) => {
            if (tRes && Array.isArray(tRes.rows) && tRes.rows.length > 0) {
              setTaskDatasetRows(tRes.rows);
            }
          })
          .catch(() => { });
      }
    } catch (err: any) {
      console.warn('Backend universal execution error, falling back to preview:', err);
      setLiveProgressMsg('Evaluated via local preview engine');
      setHasExecutedValidation(true);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResumePaused = async () => {
    if (!activeWorkflow) return;
    setIsVerifying(true);
    setLiveProgressMsg('Re-probing database circuit and resuming paused transactions...');

    try {
      const sample = effectiveRows.length > 0 ? effectiveRows[0] : {};
      const { presentParams: wfParamsPresent } = getWorkflowConfiguredParamsPresentInRow(activeWorkflow, sample);
      const primaryKeyField = wfParamsPresent[0] || Object.keys(sample).find(k => !k.startsWith('_')) || 'id';

      const pausedRecords = effectiveRows.filter((r, idx) => {
        const keys = [
          ...wfParamsPresent.map(p => r[p]).filter(v => v !== undefined && v !== null && String(v).trim() !== '').map(String),
          `ROW-${idx + 1}`
        ];
        return keys.some(k => serverEvaluatedRecords?.[k]?._validation_status === 'PAUSED_DB_OFFLINE');
      });

      if (pausedRecords.length === 0) {
        alert('No paused transactions found to resume.');
        setIsVerifying(false);
        return;
      }

      const res = await api.resumePausedInvestigation({
        workflowId: activeWorkflow.id,
        records: pausedRecords,
        keyField: primaryKeyField,
        keyFields: wfParamsPresent
      });

      setServerEvaluatedRecords(prev => {
        const next = { ...(prev || {}) };
        (res.records || []).forEach((r: any, idx: number) => {
          for (const p of wfParamsPresent) {
            if (r[p] !== undefined && r[p] !== null) {
              next[String(r[p])] = r;
            }
          }
          next[`ROW-${idx + 1}`] = r;
        });
        return next;
      });

      setLiveProgressMsg(`Resumed ${res.processedRecords} records: ${res.passedCount} Passed, ${res.failedCount} Failed`);
    } catch (err: any) {
      alert(`Resume failed: ${err.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const pausedTxCount = useMemo(() => {
    if (!serverEvaluatedRecords) return 0;
    return Object.values(serverEvaluatedRecords).filter((r: any) => r._validation_status === 'PAUSED_DB_OFFLINE').length;
  }, [serverEvaluatedRecords]);

  const handleApplyWorkflow = (wf: DatabaseValidationWorkflow) => {
    setActiveWorkflow(wf);
    setShowValidationDropdown(false);
    setHasExecutedValidation(false);
    setServerEvaluatedRecords(null);
    setLiveExecutionMetrics(null);
    setLiveProgressMsg('');
  };

  const handleExportExcel = () => {
    const exportData = filteredAndSortedRows.map(r => {
      const base: Record<string, any> = {};
      base['Investigation Status'] = r.investigationStatus;
      base['Case Closed'] = r.isClosed ? 'YES' : 'NO';
      base['Pipeline Halted'] = r.isHalted ? 'YES' : 'NO';

      base['Collision Status'] = isRowDuplicate(r) ? 'DUPLICATE' : 'UNIQUE';
      visibleDatasetColumns.forEach(c => {
        base[c.label] = r.sourceRecord[c.key] ?? '';
      });
      if (activeWorkflow && !hiddenColumns.has('workflow_outcome')) {
        const evalRes = evaluateWorkflowOutcome(r, activeWorkflow);
        base['Validation Status'] = evalRes.message;
        base['Validation Status Code'] = evalRes.status;
      }
      base['Diagnostic Summary'] = r.overallSummary;
      return base;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reconciliation_Data');
    XLSX.writeFile(wb, `${sourceFileName.replace(/\.[^/.]+$/, "")}_Export.xlsx`);
  };


  // =========================================================================
  // WORKFLOW OUTCOME AGGREGATION & EVALUATION HELPERS
  // =========================================================================
  const isStepIdMatch = (a: string, b: string) => {
    if (!a || !b) return false;
    if (a === b) return true;
    const cleanA = a.replace(/^step[-_]/i, '').trim().toLowerCase();
    const cleanB = b.replace(/^step[-_]/i, '').trim().toLowerCase();
    return cleanA === cleanB;
  };

  interface OutcomeEvaluation {
    status: 'PASS' | 'FAIL' | 'PENDING';
    message: string;
    matchedRuleName?: string;
    severity?: 'CRITICAL' | 'WARNING' | 'RECONCILED';
    operator?: 'ALL' | 'ANY';
    failedStepCount: number;
    passedStepCount: number;
    totalStepCount: number;
    stepDetails: Array<{
      stepId: string;
      stepName: string;
      checkType: string;
      status: 'PASS' | 'FAIL' | 'PENDING';
      actionTaken: string;
      detail?: string;
    }>;
  }

  const evaluateWorkflowOutcome = (row: any, workflow: DatabaseValidationWorkflow | null): OutcomeEvaluation => {
    if (!workflow || !workflow.steps || workflow.steps.length === 0) {
      const rowValStatus = row?.sourceRecord?._validation_status
        || serverEvaluatedRecords?.[row?.rowId]?._validation_status
        || (row?.investigationStatus === 'RECONCILED' ? 'PASS' : row?.investigationStatus === 'FLAGGED' ? 'FAIL' : null);

      if (rowValStatus === 'PASS') {
        return {
          status: 'PASS',
          message: 'All Checks Passed',
          severity: 'RECONCILED',
          failedStepCount: 0,
          passedStepCount: 1,
          totalStepCount: 1,
          stepDetails: [{
            stepId: 'default',
            stepName: 'Validation Check',
            checkType: 'EQUALITY',
            status: 'PASS',
            actionTaken: 'CONTINUE',
            detail: 'Conducted validation passed'
          }]
        };
      }
      if (rowValStatus === 'FAIL') {
        const failMsg = row?.sourceRecord?._validation_details || 'Validation Discrepancy';
        return {
          status: 'FAIL',
          message: failMsg,
          severity: 'CRITICAL',
          failedStepCount: 1,
          passedStepCount: 0,
          totalStepCount: 1,
          stepDetails: [{
            stepId: 'default',
            stepName: 'Validation Check',
            checkType: 'EQUALITY',
            status: 'FAIL',
            actionTaken: 'FLAG',
            detail: failMsg
          }]
        };
      }

      return {
        status: 'PENDING',
        message: 'No workflow steps defined',
        failedStepCount: 0,
        passedStepCount: 0,
        totalStepCount: 0,
        stepDetails: []
      };
    }

    const rec = row?.sourceRecord || row?.canonical_data || row || {};
    const rowKeyCandidates: string[] = [
      row?.rowId,
      rec.row_number ? `ROW-${rec.row_number}` : null,
      rec._rowNumber ? `ROW-${rec._rowNumber}` : null
    ].filter(Boolean).map(String);

    for (const [k, v] of Object.entries(rec)) {
      if (!k.startsWith('_') && v !== undefined && v !== null && typeof v !== 'object') {
        const s = String(v).trim();
        if (s && !rowKeyCandidates.includes(s)) rowKeyCandidates.push(s);
      }
    }

    let serverRec: any = null;
    if (serverEvaluatedRecords) {
      for (const cand of rowKeyCandidates) {
        if (serverEvaluatedRecords[cand]) {
          serverRec = serverEvaluatedRecords[cand];
          break;
        }
      }
    }

    const isEvaluated = (serverRec && serverRec._validation_status && serverRec._validation_status !== 'PENDING')
      || (row?.sourceRecord && row.sourceRecord._validation_status && row.sourceRecord._validation_status !== 'PENDING')
      || (row?._validation_status && row._validation_status !== 'PENDING')
      || (row?.canonical_data && row.canonical_data._validation_status && row.canonical_data._validation_status !== 'PENDING')
      || (row?.sourceRecord?.canonical_data && row.sourceRecord.canonical_data._validation_status && row.sourceRecord.canonical_data._validation_status !== 'PENDING');

    const hasTargetRecordExplicit = isEvaluated && (
      (serverRec && '_target_record' in serverRec)
      || (row?.sourceRecord && '_target_record' in row.sourceRecord)
      || (row && '_target_record' in row)
      || (row?.canonical_data && '_target_record' in row.canonical_data)
      || (row?.sourceRecord?.canonical_data && '_target_record' in row.sourceRecord.canonical_data)
    );
    const targetRecord = isEvaluated ? (
      serverRec?._target_record
      ?? row?._target_record
      ?? row?.sourceRecord?._target_record
      ?? row?.canonical_data?._target_record
      ?? row?.sourceRecord?.canonical_data?._target_record
      ?? null
    ) : null;
    const targetDbName = serverRec?._target_db || row?.sourceRecord?._target_db || row?._target_db || workflow.targetDbId || 'Target DB';
    const targetTableName = serverRec?._target_table || row?.sourceRecord?._target_table || row?._target_table || workflow.targetTable || 'transactions';

    const results = row.stepResults || {};
    const hasAnyResults = Object.keys(results).length > 0;

    // Build stepDetails
    const stepDetails = workflow.steps.map(step => {
      const matchingKey = Object.keys(results).find(k => isStepIdMatch(k, step.id));
      const res = matchingKey ? results[matchingKey] : null;
      let stepStatus: 'PASS' | 'FAIL' | 'PENDING' = 'PENDING';
      let actionTaken = res?.actionTaken || 'CONTINUE';
      let detail = res?.badgeText || res?.summary;

      // CRITICAL: If target database was queried and returned 0 matching records,
      // any EXISTENCE_CHECK step MUST evaluate to FAIL:
      if (step.checkType === 'EXISTENCE_CHECK' && hasTargetRecordExplicit && !targetRecord) {
        stepStatus = 'FAIL';
        actionTaken = step.onFailAction || 'STOP';
        detail = `Record not found in target database (${targetDbName}.${targetTableName})`;
      } else if (res) {
        if (res.resultStatus === 'FAIL' || res.status === 'FAILED' || res.resultStatus === 'FAILED') {
          stepStatus = 'FAIL';
        } else if (res.resultStatus === 'PASS' || res.status === 'PASSED') {
          stepStatus = 'PASS';
        }
      }

      return {
        stepId: step.id,
        stepName: step.name,
        checkType: step.checkType,
        status: stepStatus,
        actionTaken,
        detail: detail || (stepStatus === 'PASS' ? 'Condition satisfied' : stepStatus === 'FAIL' ? 'Condition discrepancy' : 'Pending verification')
      };
    });

    if (!hasAnyResults) {
      if (hasTargetRecordExplicit && !targetRecord) {
        const failMsg = `Record not found in target database (${targetDbName}.${targetTableName})`;
        return {
          status: 'FAIL',
          message: failMsg,
          severity: 'CRITICAL',
          failedStepCount: 1,
          passedStepCount: Math.max(0, workflow.steps.length - 1),
          totalStepCount: workflow.steps.length,
          stepDetails: workflow.steps.map((s, idx) => ({
            stepId: s.id,
            stepName: s.name,
            checkType: s.checkType,
            status: (s.checkType === 'EXISTENCE_CHECK' || idx === 0) ? 'FAIL' : 'PASS',
            actionTaken: (s.checkType === 'EXISTENCE_CHECK' || idx === 0) ? (s.onFailAction || 'STOP') : 'CONTINUE',
            detail: (s.checkType === 'EXISTENCE_CHECK' || idx === 0) ? failMsg : 'Condition satisfied'
          }))
        };
      }

      // Check if this row was already evaluated in a conducted workflow from the database
      const rowValStatus = row?.sourceRecord?._validation_status
        || serverRec?._validation_status
        || (row?.investigationStatus === 'RECONCILED' ? 'PASS' : row?.investigationStatus === 'FLAGGED' ? 'FAIL' : null);

      if (rowValStatus === 'PASS') {
        return {
          status: 'PASS',
          message: 'All Checks Passed',
          severity: 'RECONCILED',
          failedStepCount: 0,
          passedStepCount: workflow.steps.length,
          totalStepCount: workflow.steps.length,
          stepDetails: workflow.steps.map(s => ({
            stepId: s.id,
            stepName: s.name,
            checkType: s.checkType,
            status: 'PASS',
            actionTaken: 'CONTINUE',
            detail: 'Verified in conducted workflow'
          }))
        };
      }

      if (rowValStatus === 'FAIL') {
        const failMsg = row?.sourceRecord?._validation_details || 'Validation Discrepancy';
        return {
          status: 'FAIL',
          message: failMsg,
          severity: 'CRITICAL',
          failedStepCount: 1,
          passedStepCount: Math.max(0, workflow.steps.length - 1),
          totalStepCount: workflow.steps.length,
          stepDetails: workflow.steps.map((s, idx) => ({
            stepId: s.id,
            stepName: s.name,
            checkType: s.checkType,
            status: idx === 0 ? 'FAIL' : 'PASS',
            actionTaken: idx === 0 ? 'FLAG' : 'CONTINUE',
            detail: idx === 0 ? failMsg : 'Condition satisfied'
          }))
        };
      }

      return {
        status: 'PENDING',
        message: 'Pending Verification',
        failedStepCount: 0,
        passedStepCount: 0,
        totalStepCount: workflow.steps.length,
        stepDetails
      };
    }

    const failedStepCount = stepDetails.filter(s => s.status === 'FAIL').length;
    const passedStepCount = stepDetails.filter(s => s.status === 'PASS').length;
    const aggregations = workflow.messageAggregations || [];

    // 1. Evaluate FAIL rules first
    const failRules = aggregations.filter(r => r.type === 'FAIL');
    for (const rule of failRules) {
      const targetStepIds = rule.validationStepIds || [];
      if (targetStepIds.length === 0) continue;

      const attachedSteps = stepDetails.filter(s =>
        targetStepIds.some(tid => isStepIdMatch(s.stepId, tid))
      );
      const failedAttached = attachedSteps.filter(s => s.status === 'FAIL');

      const operator = rule.operator || 'ANY';
      if (operator === 'ANY' && failedAttached.length > 0) {
        return {
          status: 'FAIL',
          message: rule.message || rule.name,
          matchedRuleName: rule.name,
          severity: rule.severity || 'CRITICAL',
          operator,
          failedStepCount,
          passedStepCount,
          totalStepCount: workflow.steps.length,
          stepDetails
        };
      } else if (operator === 'ALL' && failedAttached.length === targetStepIds.length && failedAttached.length > 0) {
        return {
          status: 'FAIL',
          message: rule.message || rule.name,
          matchedRuleName: rule.name,
          severity: rule.severity || 'CRITICAL',
          operator,
          failedStepCount,
          passedStepCount,
          totalStepCount: workflow.steps.length,
          stepDetails
        };
      }
    }

    // 2. Evaluate PASS rules if no fail rule triggered
    const passRules = aggregations.filter(r => r.type === 'PASS');
    for (const rule of passRules) {
      const targetStepIds = rule.validationStepIds || [];
      if (targetStepIds.length === 0) continue;

      const attachedSteps = stepDetails.filter(s =>
        targetStepIds.some(tid => isStepIdMatch(s.stepId, tid))
      );
      const passedAttached = attachedSteps.filter(s => s.status === 'PASS');

      const operator = rule.operator || 'ALL';
      if (operator === 'ALL' && passedAttached.length === targetStepIds.length && passedAttached.length > 0) {
        return {
          status: 'PASS',
          message: rule.message || rule.name,
          matchedRuleName: rule.name,
          severity: rule.severity || 'RECONCILED',
          operator,
          failedStepCount,
          passedStepCount,
          totalStepCount: workflow.steps.length,
          stepDetails
        };
      } else if (operator === 'ANY' && passedAttached.length > 0) {
        return {
          status: 'PASS',
          message: rule.message || rule.name,
          matchedRuleName: rule.name,
          severity: rule.severity || 'RECONCILED',
          operator,
          failedStepCount,
          passedStepCount,
          totalStepCount: workflow.steps.length,
          stepDetails
        };
      }
    }

    // 3. Fallback when no specific aggregation matched
    if (failedStepCount > 0) {
      return {
        status: 'FAIL',
        message: `${failedStepCount} of ${workflow.steps.length} Checks Failed`,
        severity: 'CRITICAL',
        failedStepCount,
        passedStepCount,
        totalStepCount: workflow.steps.length,
        stepDetails
      };
    }

    return {
      status: 'PASS',
      message: `All ${passedStepCount > 0 ? passedStepCount : workflow.steps.length} Checks Passed`,
      severity: 'RECONCILED',
      failedStepCount: 0,
      passedStepCount: passedStepCount > 0 ? passedStepCount : workflow.steps.length,
      totalStepCount: workflow.steps.length,
      stepDetails
    };
  };

  const renderConsolidatedWorkflowOutcome = (row: any, workflow: DatabaseValidationWorkflow | null) => {
    const outcome = evaluateWorkflowOutcome(row, workflow);

    if (outcome.status === 'PENDING') {
      return (
        <span
          onClick={() => setOutcomeDrilldownRow(row)}
          className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-slate-100 border border-slate-200 cursor-pointer hover:bg-slate-200 transition"
          title="Click to inspect validation steps"
        >
          Pending Verification
        </span>
      );
    }

    const isFail = outcome.status === 'FAIL';
    const isCritical = outcome.severity === 'CRITICAL';

    return (
      <div
        onClick={() => setOutcomeDrilldownRow(row)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition shadow-2xs hover:shadow-xs select-none ${isFail
            ? isCritical
              ? 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100'
              : 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
            : 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
          }`}
        title={`Click to inspect all ${outcome.totalStepCount} step results for this record`}
      >
        {isFail ? (
          <AlertTriangle size={13} className={isCritical ? 'text-rose-600 shrink-0' : 'text-amber-600 shrink-0'} />
        ) : (
          <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
        )}

        <span className="max-w-[260px] truncate text-[11px] font-bold">
          {outcome.message}
        </span>

        <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold shrink-0 ${isFail
            ? isCritical ? 'bg-rose-200 text-rose-900' : 'bg-amber-200 text-amber-900'
            : 'bg-emerald-200 text-emerald-900'
          }`}>
          {isFail ? `FAIL (${outcome.failedStepCount})` : 'PASS'}
        </span>
      </div>
    );
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
          {/* Workflow Execution Lookup Status */}
          {currentWorkflowExecution && (
            <div className="flex items-center gap-1.5 bg-emerald-900/90 text-emerald-100 border border-emerald-500/40 px-2.5 py-1 rounded text-[10px] font-mono shadow-xs">
              <CheckCircle2 size={12} className="text-emerald-300" />
              <span>Evaluated on Task:</span>
              <span className="font-bold text-emerald-200">
                {currentWorkflowExecution.passed_count} PASS / {currentWorkflowExecution.failed_count} FAIL
              </span>
              <span className="text-emerald-400/60">|</span>
              <button
                type="button"
                onClick={() => handleRunValidation(true)}
                disabled={isVerifying}
                className="hover:underline text-amber-300 font-bold cursor-pointer flex items-center gap-0.5"
                title="Workflow already evaluated on this task dataset. Click to force re-run."
              >
                <Zap size={10} className="fill-amber-300" />
                <span>Force Re-run</span>
              </button>
            </div>
          )}

          {/* RUN VALIDATION TRIGGER BUTTON */}
          <button
            type="button"
            onClick={() => handleRunValidation(true)}
            disabled={isVerifying || !activeWorkflow}
            className={`px-3 py-1 rounded text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer ${!activeWorkflow
                ? 'bg-white/10 text-emerald-200/50 cursor-not-allowed border border-white/10'
                : 'bg-white hover:bg-emerald-50 text-[#107c41] border border-white font-extrabold'
              }`}
            title={!activeWorkflow ? 'Select or create a workflow first' : 'Run validation rules on current dataset (queries target database and updates status in backend)'}
          >
            {isVerifying ? (
              <RotateCcw size={12} className="animate-spin" />
            ) : (
              <Play size={12} className="fill-[#107c41]" />
            )}
            <span>
              {isVerifying ? 'Evaluating...' : '▶ Run Validation'}
            </span>
          </button>

          {/* CLEAR RESULTS BUTTON — Permanently wipes execution history for this task */}
          {(hasExecutedValidation || taskWorkflowExecutions.length > 0) && (
            <button
              type="button"
              onClick={handleClearResults}
              disabled={isClearingResults || isVerifying}
              className="px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer bg-rose-700 hover:bg-rose-600 text-white border border-rose-400/40"
              title="Permanently clear all validation results for this task from the database"
            >
              {isClearingResults ? (
                <RotateCcw size={11} className="animate-spin" />
              ) : (
                <X size={11} />
              )}
              <span>{isClearingResults ? 'Clearing...' : 'Clear Results'}</span>
            </button>
          )}

          {/* Validation Execution Status Badge */}
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border font-semibold flex items-center gap-1 ${hasExecutedValidation
              ? liveExecutionMetrics
                ? 'bg-emerald-900/90 text-emerald-200 border-emerald-400/40'
                : 'bg-blue-900/90 text-blue-200 border-blue-400/40'
              : 'bg-white/10 text-emerald-100 border-white/20'
            }`}>
            {hasExecutedValidation ? (
              <>
                <CheckCircle2 size={10} className="text-emerald-300" />
                <span>{liveExecutionMetrics ? `Live Validated (${liveExecutionMetrics.durationMs}ms)` : 'Preview Validated'}</span>
              </>
            ) : (
              <span>Unvalidated</span>
            )}
          </span>

          {/* RESUME PAUSED TRANSACTIONS BUTTON (When circuit-tripped) */}
          {pausedTxCount > 0 && (
            <button
              type="button"
              onClick={handleResumePaused}
              disabled={isVerifying}
              className="px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer bg-amber-500 hover:bg-amber-400 text-slate-950 animate-pulse border border-amber-300"
              title="Target database was offline. Click to re-probe circuit and resume paused records."
            >
              <Zap size={12} className="fill-slate-950" />
              <span>Resume Paused ({pausedTxCount})</span>
            </button>
          )}

          {/* Only Mapped Columns Toggle Pill */}
          <button
            type="button"
            onClick={() => setOnlyMappedColumns(prev => !prev)}
            className={`px-2 py-1 rounded text-[11px] font-mono font-medium border flex items-center gap-1 transition cursor-pointer ${onlyMappedColumns
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
                      className={`w-full text-left p-2 rounded text-xs font-medium flex items-center justify-between transition cursor-pointer ${activeWorkflow?.id === wf.id ? 'bg-emerald-50 text-emerald-950 font-bold border border-emerald-200' : 'hover:bg-slate-50 text-slate-800'
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
              className={`px-2 py-1 rounded text-[11px] font-medium border flex items-center gap-1 transition cursor-pointer ${columnViewPreset === 'DEFAULT'
                  ? 'bg-emerald-900/90 text-white border-emerald-400/50'
                  : hiddenColumns.size > 0
                    ? 'bg-amber-400 text-slate-950 border-amber-300 font-bold'
                    : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                }`}
              title="Manage dataset column visibility (Defaults to Required + Date + Financial columns)"
            >
              <Eye size={12} />
              <span>Columns ({visibleDatasetColumns.length}/{columnDefs.length})</span>
              {columnViewPreset === 'DEFAULT' && (
                <span className="px-1 bg-emerald-700 text-emerald-100 rounded text-[9px] font-bold font-mono">
                  Default
                </span>
              )}
              {hiddenColumns.size > 0 && columnViewPreset !== 'DEFAULT' && (
                <span className="px-1 bg-amber-900 text-amber-100 rounded-full text-[9px] font-bold">
                  {hiddenColumns.size}
                </span>
              )}
              <ChevronDown size={11} />
            </button>

            {showColumnManager && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg border border-slate-300 shadow-xl p-2.5 z-40 space-y-2 text-slate-800">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                  <span className="text-[11px] font-bold text-slate-800">Column Visibility</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={resetToDefaultColumns}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-semibold cursor-pointer ${columnViewPreset === 'DEFAULT' ? 'bg-emerald-100 text-emerald-800 font-bold' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      title="Show Required + Date + Financial columns only"
                    >
                      Default
                    </button>
                    <button
                      type="button"
                      onClick={showAllColumns}
                      className={`text-[10px] px-1.5 py-0.5 rounded font-semibold cursor-pointer ${columnViewPreset === 'ALL' ? 'bg-emerald-100 text-emerald-800 font-bold' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                      Show All
                    </button>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 bg-slate-50 p-1.5 rounded border border-slate-200">
                  Default view shows <strong>Required</strong>, <strong>Date Category</strong>, and <strong>Financial Category</strong> columns.
                </div>

                <div className="relative">
                  <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={columnSearchTerm}
                    onChange={(e) => setColumnSearchTerm(e.target.value)}
                    placeholder="Search columns..."
                    className="w-full pl-6 pr-2 py-1 text-xs bg-slate-50 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1">
                  <div className="text-[9px] font-bold text-slate-400 uppercase font-mono px-1">
                    Dataset Columns ({columnDefs.length})
                  </div>
                  {columnDefs
                    .filter(col => !columnSearchTerm || col.label.toLowerCase().includes(columnSearchTerm.toLowerCase()) || col.key.toLowerCase().includes(columnSearchTerm.toLowerCase()))
                    .map(col => {
                      const isVisible = visibleDatasetColumns.some(c => c.key === col.key);
                      const isDef = isDefaultVisibleColumn(col.key);
                      return (
                        <label
                          key={col.key}
                          className="flex items-center justify-between p-1 rounded hover:bg-slate-50 text-xs text-slate-700 cursor-pointer select-none"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => toggleColumnVisibility(col.key)}
                              className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                            <span className="truncate">{col.label}</span>
                          </div>
                          {isDef && (
                            <span className="text-[9px] px-1 rounded bg-slate-100 text-slate-500 font-mono shrink-0 ml-1">
                              Default
                            </span>
                          )}
                        </label>
                      );
                    })}

                  <div className="text-[9px] font-bold text-slate-400 uppercase font-mono px-1 pt-1">Workflow Validation</div>
                  {activeWorkflow && (
                    <label className="flex items-center gap-1.5 p-1 rounded hover:bg-slate-50 text-xs text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.has('workflow_outcome')}
                        onChange={() => toggleColumnVisibility('workflow_outcome')}
                        className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span className="truncate font-semibold text-emerald-900">Validation Status</span>
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Workflow Picker from Conducted / Available Workflows */}
          <div className="flex items-center gap-1.5 text-xs text-white">
            <GitBranch className="w-3.5 h-3.5 text-emerald-200 shrink-0" />
            <select
              value={activeWorkflow?.id || ''}
              onChange={(e) => handleSelectWorkflow(e.target.value)}
              className="bg-[#084725] border border-white/30 text-white text-[11px] rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-white font-medium cursor-pointer"
              title="Pick a workflow conducted on this investigation to inspect validation status"
            >
              {availableWorkflows.length === 0 && (
                <option value="">No workflows configured</option>
              )}
              {conductedWorkflows.length > 0 && (
                <optgroup label="Conducted Workflows" className="bg-slate-900 text-white font-bold">
                  {conductedWorkflows.map(cw => (
                    <option key={cw.id} value={cw.id} className="bg-slate-900 text-white font-normal">
                      {cw.name} {cw.isLatest ? '★ (Latest)' : '✓ (Conducted)'}
                    </option>
                  ))}
                </optgroup>
              )}
              {availableWorkflows.filter(w => !conductedWorkflows.some(c => c.id === w.id)).length > 0 && (
                <optgroup label="Other Workflows" className="bg-slate-900 text-slate-400 font-bold">
                  {availableWorkflows
                    .filter(w => !conductedWorkflows.some(c => c.id === w.id))
                    .map(w => (
                      <option key={w.id} value={w.id} className="bg-slate-900 text-slate-300 font-normal">
                        {w.name}
                      </option>
                    ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Investigation Status Quick Filter */}
          <div className="flex items-center border border-white/20 rounded bg-[#0b5a2f] overflow-hidden text-[11px]">
            <span className="px-1.5 py-0.5 text-[9px] font-bold text-emerald-200 uppercase tracking-wider bg-black/25 border-r border-white/10 flex items-center gap-1 select-none">
              <ShieldCheck size={10} />
              <span>Status</span>
            </span>
            {(['ALL', 'INVESTIGATING', 'FLAGGED', 'RECONCILED', 'CLOSED'] as const).map((st, i) => (
              <button
                key={st}
                type="button"
                onClick={() => setInvestigationStatusFilter(st)}
                className={`px-2 py-0.5 transition cursor-pointer font-medium ${i > 0 ? 'border-l border-white/10' : ''} ${investigationStatusFilter === st
                    ? st === 'FLAGGED'
                      ? 'bg-rose-500 text-white font-bold'
                      : st === 'RECONCILED'
                        ? 'bg-emerald-300 text-emerald-950 font-bold'
                        : st === 'CLOSED'
                          ? 'bg-slate-300 text-slate-950 font-bold'
                          : 'bg-white text-emerald-950 font-bold'
                    : 'text-emerald-100 hover:bg-white/10'
                  }`}
                title={`Filter rows by Investigation Status: ${st}`}
              >
                {st === 'ALL' ? 'All' : st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            ))}
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
              className={`px-2 py-0.5 transition cursor-pointer ${outcomeFilter === 'ALL' ? 'bg-white text-emerald-950 font-bold' : 'text-emerald-100 hover:bg-white/10'
                }`}
            >
              All ({orchestratedRows.length})
            </button>
            <button
              type="button"
              onClick={() => setOutcomeFilter('FLAGGED')}
              className={`px-2 py-0.5 border-l border-white/10 transition cursor-pointer ${outcomeFilter === 'FLAGGED' ? 'bg-rose-500 text-white font-bold' : 'text-emerald-100 hover:bg-white/10'
                }`}
            >
              Flagged ({aggregateStats.anomaliesCount})
            </button>
            <button
              type="button"
              onClick={() => setOutcomeFilter('CLEAN')}
              className={`px-2 py-0.5 border-l border-white/10 transition cursor-pointer ${outcomeFilter === 'CLEAN' ? 'bg-emerald-300 text-emerald-950 font-bold' : 'text-emerald-100 hover:bg-white/10'
                }`}
            >
              Clean
            </button>
          </div>

          {/* Header Row Collision Filter (All / Only Duplicates / Only Unique) */}
          <div className="flex items-center border border-white/20 rounded bg-[#0b5a2f] overflow-hidden text-[11px]">
            <span className="px-1.5 py-0.5 text-[9px] font-bold text-emerald-200 uppercase tracking-wider bg-black/25 border-r border-white/10 flex items-center gap-1 select-none">
              <Filter size={10} />
              <span>Rows</span>
            </span>
            <button
              type="button"
              onClick={() => setDuplicateFilter('ALL')}
              className={`px-2 py-0.5 transition cursor-pointer font-medium ${duplicateFilter === 'ALL' ? 'bg-white text-emerald-950 font-bold' : 'text-emerald-100 hover:bg-white/10'
                }`}
              title="Show all records in this view"
            >
              All ({duplicateCounts.total})
            </button>
            <button
              type="button"
              onClick={() => setDuplicateFilter('DUPLICATES_ONLY')}
              className={`px-2 py-0.5 border-l border-white/10 transition cursor-pointer font-medium flex items-center gap-1 ${duplicateFilter === 'DUPLICATES_ONLY' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-amber-200 hover:bg-white/10'
                }`}
              title="Filter to show only cross-task duplicate records"
            >
              <AlertTriangle size={10} className={duplicateFilter === 'DUPLICATES_ONLY' ? 'text-slate-950' : 'text-amber-300'} />
              <span>Only Duplicates ({duplicateCounts.duplicates})</span>
            </button>
            <button
              type="button"
              onClick={() => setDuplicateFilter('UNIQUE_ONLY')}
              className={`px-2 py-0.5 border-l border-white/10 transition cursor-pointer font-medium flex items-center gap-1 ${duplicateFilter === 'UNIQUE_ONLY' ? 'bg-emerald-300 text-emerald-950 font-bold' : 'text-emerald-100 hover:bg-white/10'
                }`}
              title="Filter to show only unique / non-duplicate records"
            >
              <CheckCircle size={10} className={duplicateFilter === 'UNIQUE_ONLY' ? 'text-emerald-950' : 'text-emerald-300'} />
              <span>Only Unique ({duplicateCounts.unique})</span>
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
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono ${parentIssueAggregation.issueStatus === 'RESOLVED' || parentIssueAggregation.issueStatus === 'CLOSED'
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
          2. HIDDEN ITEMS RESTORE BANNER (IF COLUMNS/ROWS ARE HIDDEN OR FILTERED)
          ========================================================================= */}
      {(aggregateStats.hiddenColCount > 0 || aggregateStats.hiddenRowCount > 0 || duplicateFilter !== 'ALL') && (
        <div className="bg-amber-50/90 border-b border-amber-200 px-3 py-1 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2 flex-wrap">
            <EyeOff size={12} className="text-amber-700" />
            <span className="text-[11px]">
              {columnViewPreset === 'DEFAULT' && (
                <strong className="text-emerald-800 mr-1.5 font-mono">
                  [Default Columns Active: Required + Date + Financial ({visibleDatasetColumns.length} cols)]
                </strong>
              )}
              {aggregateStats.hiddenColCount > 0 && `${aggregateStats.hiddenColCount} non-category column(s) hidden. `}
              {aggregateStats.hiddenRowCount > 0 && `${aggregateStats.hiddenRowCount} row(s) hidden. `}
              {duplicateFilter !== 'ALL' && (
                <span className="font-semibold text-amber-950 ml-1">
                  Row Filter: <u>{duplicateFilter === 'DUPLICATES_ONLY' ? 'Only Duplicates' : 'Only Unique'}</u> ({filteredAndSortedRows.length} rows shown)
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            {columnViewPreset === 'DEFAULT' ? (
              <button
                type="button"
                onClick={showAllColumns}
                className="text-emerald-800 hover:text-emerald-950 font-bold hover:underline cursor-pointer"
              >
                Show All Columns ({columnDefs.length})
              </button>
            ) : (
              <button
                type="button"
                onClick={resetToDefaultColumns}
                className="text-emerald-800 hover:text-emerald-950 font-bold hover:underline cursor-pointer"
              >
                Reset to Default Columns
              </button>
            )}
            {duplicateFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setDuplicateFilter('ALL')}
                className="text-amber-800 hover:text-amber-950 font-bold hover:underline cursor-pointer border-l border-amber-300 pl-2"
              >
                Reset Row Filter
              </button>
            )}
            {aggregateStats.hiddenRowCount > 0 && (
              <button
                type="button"
                onClick={showAllRows}
                className="text-amber-800 hover:text-amber-950 font-bold hover:underline cursor-pointer border-l border-amber-300 pl-2"
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

      {/* Sheet Operational Ribbon */}
      <div className={`px-4 py-1.5 text-xs flex items-center justify-between border-b ${activeSheetTab === 'sheet1_central'
          ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900'
          : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
        }`}>
        <div className="flex items-center gap-2">
          {activeSheetTab === 'sheet1_central' ? (
            <>
              <Database size={14} className="text-indigo-600 shrink-0" />
              <span className="font-semibold">Central Master Ledger Cross-Check</span>
              <span className="text-slate-600 text-[11px]">— Sourced from central_transaction_repository (Strictly Immutable reference).</span>
              <button
                type="button"
                onClick={handleScanDuplicates}
                disabled={isScanningDuplicates}
                className="ml-3 px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-semibold flex items-center gap-1 shadow-xs transition cursor-pointer"
                title="Execute PostgreSQL stored procedure to detect and flag cross-task transaction collisions"
              >
                <Copy size={11} className={isScanningDuplicates ? 'animate-spin' : ''} />
                <span>{isScanningDuplicates ? 'Scanning Duplicates...' : 'Scan Cross-Task Duplicates'}</span>
              </button>
            </>
          ) : (
            <>
              <FileSpreadsheet size={14} className="text-emerald-600 shrink-0" />
              <span className="font-semibold">Task Transactions Dataset</span>
              <span className="text-slate-600 text-[11px]">— Live operational records evaluated against conducted workflows & PostgreSQL mirrors.</span>
            </>
          )}
        </div>
        <div className="text-[11px] font-mono text-slate-500">
          Task ID: <strong>{selectedIssue?.id}</strong>
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
              {/* Row Index Column Header with Duplicate/Unique Row Filter on Table Header */}
              <th className="w-14 border-r border-slate-300 bg-[#e5e7eb] font-bold p-1 text-center text-slate-600 font-mono text-[11px] select-none relative group">
                <div className="flex items-center justify-center gap-1">
                  <span>#</span>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowRowFilterDropdown(prev => !prev)}
                      className={`p-0.5 rounded transition cursor-pointer ${duplicateFilter !== 'ALL'
                          ? 'bg-amber-400 text-slate-950 shadow-xs'
                          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-300'
                        }`}
                      title={`Row Filter: ${duplicateFilter === 'ALL' ? 'All Rows' : duplicateFilter === 'DUPLICATES_ONLY' ? 'Only Duplicates' : 'Only Unique'}`}
                    >
                      <Filter size={10} className={duplicateFilter !== 'ALL' ? 'fill-slate-950' : ''} />
                    </button>

                    {showRowFilterDropdown && (
                      <div
                        className="absolute left-0 top-full mt-1 w-56 bg-white rounded-lg border border-slate-300 shadow-2xl p-2.5 z-50 text-xs font-sans text-slate-800 space-y-1.5 text-left font-normal"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase font-mono">Row Collision Filter</span>
                          {duplicateFilter !== 'ALL' && (
                            <button
                              type="button"
                              onClick={() => { setDuplicateFilter('ALL'); setShowRowFilterDropdown(false); }}
                              className="text-[10px] text-rose-600 hover:underline font-semibold"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => { setDuplicateFilter('ALL'); setShowRowFilterDropdown(false); }}
                          className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between transition cursor-pointer ${duplicateFilter === 'ALL' ? 'bg-emerald-50 text-emerald-950 font-bold border border-emerald-200' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                        >
                          <span>All Rows</span>
                          <span className="text-[10px] font-mono text-slate-500">{duplicateCounts.total}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setDuplicateFilter('DUPLICATES_ONLY'); setShowRowFilterDropdown(false); }}
                          className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between transition cursor-pointer ${duplicateFilter === 'DUPLICATES_ONLY' ? 'bg-amber-100 text-amber-950 font-bold border border-amber-300' : 'hover:bg-amber-50 text-slate-700'
                            }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle size={12} className="text-amber-600" />
                            <span>Only Duplicates</span>
                          </span>
                          <span className="text-[10px] font-mono font-bold text-amber-800 bg-amber-200/80 px-1.5 py-0.2 rounded">
                            {duplicateCounts.duplicates}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setDuplicateFilter('UNIQUE_ONLY'); setShowRowFilterDropdown(false); }}
                          className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between transition cursor-pointer ${duplicateFilter === 'UNIQUE_ONLY' ? 'bg-emerald-100 text-emerald-950 font-bold border border-emerald-300' : 'hover:bg-emerald-50 text-slate-700'
                            }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <CheckCircle size={12} className="text-emerald-600" />
                            <span>Only Unique</span>
                          </span>
                          <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-200/80 px-1.5 py-0.2 rounded">
                            {duplicateCounts.unique}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
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
                          className={`p-1 rounded transition cursor-pointer ${isFiltered
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

              {/* Consolidated Workflow Validation Status Column (with Conducted Workflows Filter & Badge) */}
              {activeWorkflow && !hiddenColumns.has('workflow_outcome') && (
                <th className="py-1.5 px-3 font-bold align-middle border-r border-slate-300 bg-gradient-to-r from-emerald-50 to-indigo-50 text-slate-800 text-[11px] select-none text-center min-w-[280px]">
                  <div className="flex flex-col items-center justify-center gap-1">
                    <div className="flex items-center justify-between w-full gap-1">
                      <div className="flex items-center gap-1 min-w-0">
                        <ShieldCheck size={13} className="text-emerald-700 shrink-0" />
                        <span className="font-bold text-slate-900 truncate">Validation Status</span>
                      </div>

                      {/* Conducted Workflows Filter Popover Trigger */}
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveFilterPopoverCol(activeFilterPopoverCol === 'validation_status_filter' ? null : 'validation_status_filter');
                          }}
                          className={`p-1 rounded transition cursor-pointer flex items-center gap-1 ${activeFilterPopoverCol === 'validation_status_filter'
                              ? 'bg-emerald-700 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-emerald-100/80'
                            }`}
                          title="Filter conducted workflows to select which validation results to view"
                        >
                          <Filter size={11} className={conductedWorkflowsCount > 0 ? 'fill-emerald-700 text-emerald-700' : ''} />
                          <span
                            className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-200 text-emerald-950 border border-emerald-300 shadow-2xs font-mono"
                          >
                            {conductedWorkflowsCount}
                          </span>
                        </button>

                        {/* Conducted Workflows Filter Popover Menu */}
                        {activeFilterPopoverCol === 'validation_status_filter' && (
                          <div
                            className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg border border-slate-300 shadow-2xl p-2.5 z-50 text-xs font-sans text-slate-800 space-y-2 text-left font-normal"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                              <div className="flex items-center gap-1.5">
                                <GitBranch size={12} className="text-emerald-700" />
                                <span className="text-[10px] font-bold text-slate-700 uppercase font-mono tracking-wide">
                                  Conducted Workflows ({conductedWorkflowsCount})
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setActiveFilterPopoverCol(null)}
                                className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer"
                              >
                                <X size={12} />
                              </button>
                            </div>

                            <p className="text-[10px] text-slate-500 leading-tight">
                              Select which workflow conducted on Task #{selectedIssue?.id} to display. By default, the latest conducted workflow is shown.
                            </p>

                            {/* List of Conducted Workflows */}
                            <div className="max-h-56 overflow-y-auto space-y-1 divide-y divide-slate-100">
                              {conductedWorkflows.length === 0 ? (
                                <div className="text-center py-3 text-[11px] text-slate-400 font-mono">
                                  No workflows conducted yet
                                </div>
                              ) : (
                                conductedWorkflows.map((cw) => {
                                  const isSelected = activeWorkflow?.id === cw.id;
                                  return (
                                    <button
                                      key={cw.id}
                                      type="button"
                                      onClick={() => {
                                        handleSelectWorkflow(cw.id);
                                        setActiveFilterPopoverCol(null);
                                      }}
                                      className={`w-full text-left p-1.5 rounded-md flex items-start justify-between gap-2 transition cursor-pointer ${isSelected
                                          ? 'bg-emerald-50 border border-emerald-300 text-emerald-950 font-bold'
                                          : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                                        }`}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1">
                                          <span className="truncate text-xs">{cw.name}</span>
                                          {cw.isLatest && (
                                            <span className="px-1 py-0.2 rounded bg-indigo-100 text-indigo-800 text-[8px] font-mono font-bold shrink-0">
                                              LATEST
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[9px] text-slate-500 font-mono mt-0.5 flex items-center gap-1.5">
                                          {cw.passedCount !== undefined && (
                                            <span className="text-emerald-700 font-semibold">{cw.passedCount} Passed</span>
                                          )}
                                          {cw.failedCount !== undefined && cw.failedCount > 0 && (
                                            <span className="text-rose-600 font-semibold">{cw.failedCount} Failed</span>
                                          )}
                                          {cw.executedAt && (
                                            <span className="text-slate-400">
                                              {new Date(cw.executedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      {isSelected && (
                                        <Check size={14} className="text-emerald-700 shrink-0 mt-0.5" />
                                      )}
                                    </button>
                                  );
                                })
                              )}
                            </div>

                            {/* Quick Reset to Latest button */}
                            {conductedWorkflows.length > 1 && conductedWorkflows[0].id !== activeWorkflow?.id && (
                              <div className="border-t border-slate-200 pt-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleSelectWorkflow(conductedWorkflows[0].id);
                                    setActiveFilterPopoverCol(null);
                                  }}
                                  className="w-full text-center py-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 rounded transition cursor-pointer"
                                >
                                  ↺ Reset to Latest Conducted ({conductedWorkflows[0].name})
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Inline Filter / Selector right on the header */}
                    <div className="w-full">
                      <select
                        value={activeWorkflow?.id || ''}
                        onChange={(e) => handleSelectWorkflow(e.target.value)}
                        className="w-full bg-white border border-slate-300 text-slate-800 text-[10px] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium cursor-pointer shadow-2xs"
                        title="Choose which conducted workflow validation to display"
                      >
                        {conductedWorkflows.length > 0 ? (
                          <optgroup label="Conducted Workflows (Task History)">
                            {conductedWorkflows.map((cw) => (
                              <option key={cw.id} value={cw.id}>
                                {cw.name} {cw.isLatest ? '★ (Latest)' : '✓ (Conducted)'}
                              </option>
                            ))}
                          </optgroup>
                        ) : (
                          <option value="">No workflows conducted</option>
                        )}
                        {availableWorkflows.filter(w => !conductedWorkflows.some(c => c.id === w.id)).length > 0 && (
                          <optgroup label="Other Workflows">
                            {availableWorkflows
                              .filter(w => !conductedWorkflows.some(c => c.id === w.id))
                              .map(w => (
                                <option key={w.id} value={w.id}>
                                  {w.name} (Not conducted)
                                </option>
                              ))}
                          </optgroup>
                        )}
                      </select>
                    </div>
                  </div>
                </th>
              )}

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
                  colSpan={Math.max(1, visibleDatasetColumns.length + (activeWorkflow && !hiddenColumns.has('workflow_outcome') ? 1 : 0) + visibleReportColumns.length + 3)}
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
                    className={`transition-colors ${isSelectedRow ? 'bg-emerald-50/30' : 'hover:bg-blue-50/20'
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
                          className={`py-2 px-3 border-r border-b border-slate-300 whitespace-nowrap cursor-cell text-xs ${isSelectedCell
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
                      <div className="flex items-center justify-center">
                        {activeSheetTab === 'sheet1_central' ? (
                          (row.sourceRecord?._isDuplicate || row.sourceRecord?.is_duplicate) ? (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs"
                              title={`Cross-task collision detected in Central Repository. Present in: ${Array.isArray(row.sourceRecord._allTaskIds) ? row.sourceRecord._allTaskIds.join(', ') : (row.sourceRecord._duplicateFromTaskId || 'Multiple tasks')}`}
                            >
                              <AlertTriangle size={11} className="text-amber-700" />
                              DUPLICATE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                              <CheckCircle2 size={11} className="text-emerald-600" />
                              UNIQUE MASTER
                            </span>
                          )
                        ) : (
                          /* Only one status pill */
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono inline-block ${row.investigationStatus === 'RECONCILED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                                row.investigationStatus === 'CLOSED' ? 'bg-slate-200 text-slate-800 border border-slate-400' :
                                  row.investigationStatus === 'FLAGGED' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                                    'bg-amber-100 text-amber-800 border border-amber-300'
                              }`}
                            title={
                              [
                                `Status: ${row.investigationStatus}`,
                                row.executionSummary?.statusFlagText ? `Note: ${row.executionSummary.statusFlagText}` : null,
                                (row.sourceRecord?._isDuplicate || row.sourceRecord?.isDuplicate) ? `Duplicate from Task #${row.sourceRecord?._duplicateFromTaskId || row.sourceRecord?._originalTaskId || 'Prior'}` : null,
                                row.sourceRecord?._batchId ? `Batch: ${row.sourceRecord._batchId}` : null
                              ].filter(Boolean).join(' | ')
                            }
                          >
                            {row.investigationStatus}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Consolidated Workflow Validation Outcome */}
                    {activeWorkflow && !hiddenColumns.has('workflow_outcome') && (
                      <td className="py-1.5 px-3 border-r border-b border-slate-300 whitespace-nowrap text-xs text-center bg-slate-50/10">
                        {renderConsolidatedWorkflowOutcome(row, activeWorkflow)}
                      </td>
                    )}

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
                      {activeSheetTab === 'sheet1_central' ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setInspectingRow(row)}
                            className="px-2 py-0.5 text-blue-700 hover:bg-blue-50 rounded text-[10px] font-semibold border border-blue-200 transition cursor-pointer"
                          >
                            Trace DB
                          </button>
                          {(row.sourceRecord?._isDuplicate || row.sourceRecord?.is_duplicate || (Array.isArray(row.sourceRecord?._allTaskIds) && row.sourceRecord._allTaskIds.length > 1)) && (
                            <button
                              type="button"
                              onClick={() => handleMoveToTask(row.sourceRecord?._transactionKey || row.rowId)}
                              disabled={isMovingOrRemoving}
                              className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold border border-indigo-300 transition cursor-pointer shadow-2xs"
                              title="Reassign sole ownership to this task and purge from other tasks"
                            >
                              Move to this task
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveFromTask(row.sourceRecord?._transactionKey || row.rowId)}
                            disabled={isMovingOrRemoving}
                            className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-[10px] font-bold border border-rose-300 transition cursor-pointer shadow-2xs"
                            title="Remove transaction from this task"
                          >
                            Remove from task
                          </button>
                        </div>
                      ) : (
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
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${row.investigationStatus === 'CLOSED'
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
                      )}
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
        {/* Unified Operational Sheet Tabs */}
        <div className="flex items-center gap-1">
          {/* Primary Tab 1: Task Dataset with Conducted Validation Verdicts (Default Landing) */}
          <button
            type="button"
            onClick={() => setActiveSheetTab('dataset')}
            className={`px-3 py-1.5 text-xs font-sans rounded-t font-semibold flex items-center gap-1.5 border-t-2 transition cursor-pointer ${activeSheetTab === 'dataset'
                ? 'bg-white text-slate-900 border-emerald-600 shadow-2xs'
                : 'text-slate-600 border-transparent hover:bg-slate-200'
              }`}
          >
            <FileSpreadsheet size={13} className="text-emerald-700" />
            <span>Task Transactions ({orchestratedRows.length})</span>
            {conductedWorkflowsCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-mono font-bold border border-emerald-200">
                {conductedWorkflowsCount} Conducted
              </span>
            )}
          </button>

          {/* Tab 2: Anomalies / Flagged Discrepancies */}
          <button
            type="button"
            onClick={() => setActiveSheetTab('anomalies')}
            className={`px-3 py-1.5 text-xs font-sans rounded-t font-semibold flex items-center gap-1.5 border-t-2 transition cursor-pointer ${activeSheetTab === 'anomalies'
                ? 'bg-white text-rose-800 border-rose-600 shadow-2xs'
                : 'text-slate-600 border-transparent hover:bg-slate-200'
              }`}
          >
            <AlertTriangle size={13} className="text-rose-600" />
            <span>Anomalies ({aggregateStats.anomaliesCount})</span>
          </button>

          {/* Tab 3: Reconciled / Clean */}
          <button
            type="button"
            onClick={() => setActiveSheetTab('reconciled')}
            className={`px-3 py-1.5 text-xs font-sans rounded-t font-semibold flex items-center gap-1.5 border-t-2 transition cursor-pointer ${activeSheetTab === 'reconciled'
                ? 'bg-white text-emerald-800 border-emerald-600 shadow-2xs'
                : 'text-slate-600 border-transparent hover:bg-slate-200'
              }`}
          >
            <CheckCircle2 size={13} className="text-emerald-600" />
            <span>Clean ({aggregateStats.reconciledCount})</span>
          </button>

          {/* Tab 4: Central Repo Master Reference */}
          <button
            type="button"
            onClick={() => setActiveSheetTab('sheet1_central')}
            className={`px-3 py-1.5 text-xs font-sans rounded-t font-semibold flex items-center gap-1.5 border-t-2 transition cursor-pointer ${activeSheetTab === 'sheet1_central'
                ? 'bg-white text-slate-900 border-indigo-600 shadow-2xs'
                : 'text-slate-600 border-transparent hover:bg-slate-200'
              }`}
          >
            <Database size={13} className="text-indigo-600" />
            <span>Central Repo Cross-Check ({centralMasterRows.length > 0 ? centralMasterRows.length : effectiveRows.length})</span>
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

      {/* Workflow Outcome Drilldown Modal */}
      {outcomeDrilldownRow && activeWorkflow && (() => {
        const evalOutcome = evaluateWorkflowOutcome(outcomeDrilldownRow, activeWorkflow);
        const inputRecord = outcomeDrilldownRow.sourceRecord || outcomeDrilldownRow.canonical_data || outcomeDrilldownRow || {};

        // Discover configured validation parameters present in this record
        const { presentParams: modalPresentParams } = getWorkflowConfiguredParamsPresentInRow(activeWorkflow, inputRecord);
        const activeModalParams = modalPresentParams.length > 0
          ? modalPresentParams
          : Object.keys(inputRecord).filter(k => !k.startsWith('_'));

        // Candidate lookup keys for correlating server evaluated records
        const modalCandidateKeys: string[] = [];
        for (const p of activeModalParams) {
          const v = inputRecord[p];
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            modalCandidateKeys.push(String(v).trim());
          }
        }
        for (const [k, v] of Object.entries(inputRecord)) {
          if (!k.startsWith('_') && v !== undefined && v !== null && typeof v !== 'object') {
            const s = String(v).trim();
            if (s && !modalCandidateKeys.includes(s)) modalCandidateKeys.push(s);
          }
        }
        if (inputRecord.row_number || inputRecord._rowNumber) {
          modalCandidateKeys.push(`ROW-${inputRecord.row_number || inputRecord._rowNumber}`);
        }
        const tupleKey = activeModalParams.map(p => String(inputRecord[p] ?? '').trim()).filter(Boolean).join(':::');
        if (tupleKey && !modalCandidateKeys.includes(tupleKey)) modalCandidateKeys.push(tupleKey);
        if (outcomeDrilldownRow.rowId) modalCandidateKeys.push(String(outcomeDrilldownRow.rowId).trim());

        let serverRec: any = null;
        if (serverEvaluatedRecords) {
          for (const cand of modalCandidateKeys) {
            if (serverEvaluatedRecords[cand]) {
              serverRec = serverEvaluatedRecords[cand];
              break;
            }
          }
        }

        const targetRecord = serverRec?._target_record
          ?? outcomeDrilldownRow._target_record
          ?? outcomeDrilldownRow.sourceRecord?._target_record
          ?? outcomeDrilldownRow.canonical_data?._target_record
          ?? outcomeDrilldownRow.sourceRecord?.canonical_data?._target_record
          ?? null;
        const targetDbName = serverRec?._target_db || outcomeDrilldownRow._target_db || outcomeDrilldownRow.sourceRecord?._target_db || activeWorkflow.targetDbId || 'Target Database';
        const targetTableName = serverRec?._target_table || outcomeDrilldownRow._target_table || outcomeDrilldownRow.sourceRecord?._target_table || activeWorkflow.targetTable || 'transactions';

        const getCaseInsensitiveVal = (obj: any, key: string) => {
          if (!obj || typeof obj !== 'object' || !key) return undefined;
          if (obj[key] !== undefined && obj[key] !== null) return obj[key];
          const lKey = key.toLowerCase();
          for (const k of Object.keys(obj)) {
            if (k.toLowerCase() === lKey) return obj[k];
          }
          return undefined;
        };

        // Format user-configured query parameters for readable display
        const queryParamPairs = activeModalParams
          .map(p => ({ param: p, val: inputRecord[p] }))
          .filter(item => item.val !== undefined && item.val !== null && String(item.val).trim() !== '');

        const displayKeyString = queryParamPairs.length > 0
          ? queryParamPairs.map(qp => `${qp.param}: ${qp.val}`).join(' | ')
          : (outcomeDrilldownRow.rowId || 'Record');

        const formatVal = (v: any) => {
          if (v === null || v === undefined || v === '') return <span className="text-slate-400 italic">null</span>;
          if (typeof v === 'object') return JSON.stringify(v);
          return String(v);
        };

        // Dynamically build comparison fields from configured parameters + all common fields present in inputRecord
        const configuredParamSet = new Set(activeModalParams.map(p => p.toLowerCase()));
        const dynamicComparisonFields: { label: string; inputKey: string; targetKey: string }[] = [];

        // 1. First priority: Configured workflow validation parameters
        for (const p of activeModalParams) {
          dynamicComparisonFields.push({
            label: p,
            inputKey: p,
            targetKey: p
          });
        }

        // 2. Additional input attributes present in the source file
        for (const col of Object.keys(inputRecord)) {
          if (!col.startsWith('_') && !configuredParamSet.has(col.toLowerCase())) {
            dynamicComparisonFields.push({
              label: col,
              inputKey: col,
              targetKey: col
            });
          }
        }

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-300 rounded-2xl max-w-4xl w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 text-slate-800 max-h-[90vh] flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-xl ${evalOutcome.status === 'FAIL' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                    {evalOutcome.status === 'FAIL' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Workflow Validation Drilldown & Manual Check</h3>
                    <p className="text-xs text-slate-500">
                      Record: <span className="font-mono font-semibold text-slate-700">{displayKeyString}</span> &bull; Workflow: <span className="font-semibold text-purple-700">{activeWorkflow.name}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOutcomeDrilldownRow(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Modal Content */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {/* Aggregated Outcome Banner */}
                <div className={`p-3.5 rounded-xl border flex items-center justify-between ${evalOutcome.status === 'FAIL'
                    ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                    : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                  }`}>
                  <div className="space-y-0.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider font-mono opacity-80">
                      Consolidated Outcome
                    </div>
                    <div className="text-sm font-bold">
                      {evalOutcome.message}
                    </div>
                    {evalOutcome.matchedRuleName && (
                      <div className="text-[11px] opacity-80 font-mono">
                        Triggered by Rule: &ldquo;{evalOutcome.matchedRuleName}&rdquo; (Condition: {evalOutcome.operator})
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${evalOutcome.status === 'FAIL' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                      }`}>
                      {evalOutcome.status}
                    </span>
                    <div className="text-[10px] text-slate-500 mt-1 font-mono">
                      {evalOutcome.failedStepCount} Failed &bull; {evalOutcome.passedStepCount} Passed
                    </div>
                  </div>
                </div>

                {/* Conducted Validation Blocks Breakdown */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Layers size={13} className="text-purple-600" />
                      Conducted Validation Blocks ({evalOutcome.stepDetails.length} checks)
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 font-normal">Executed Rules & Pipeline Actions</span>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                    {evalOutcome.stepDetails.map((step, idx) => (
                      <div key={step.stepId} className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 truncate">
                                {step.stepName}
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                                {step.checkType}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {step.detail}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${step.status === 'PASS' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                              step.status === 'FAIL' ? 'bg-rose-100 text-rose-800 border border-rose-300' :
                                'bg-slate-100 text-slate-600 border border-slate-300'
                            }`}>
                            {step.status}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${step.actionTaken === 'STOP' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'
                            }`}>
                            {step.actionTaken}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Target Database Fetched Record Section (For Manual Cross-Check) */}
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Database size={13} className="text-blue-600" />
                      Target Database Record (Manual Cross-Check)
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-semibold">
                        {targetDbName} &bull; {targetTableName}
                      </span>
                      {targetRecord ? (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold flex items-center gap-1">
                          <Check size={10} /> Fetched from Target DB
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-300 font-bold flex items-center gap-1">
                          <AlertTriangle size={10} /> Not Found in Target DB
                        </span>
                      )}
                    </div>
                  </div>

                  {targetRecord ? (
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200 font-mono text-[11px]">
                            <th className="py-2 px-3 w-1/4">Field / Parameter</th>
                            <th className="py-2 px-3 w-1/3 text-slate-900">Task Dataset Record (Input)</th>
                            <th className="py-2 px-3 w-1/3 text-blue-900">Target DB Fetched Record ({targetDbName})</th>
                            <th className="py-2 px-2 text-center w-16">Match</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {dynamicComparisonFields.map((field) => {
                            const inVal = getCaseInsensitiveVal(inputRecord, field.inputKey);
                            const tgtVal = getCaseInsensitiveVal(targetRecord, field.targetKey);

                            if (inVal === undefined && tgtVal === undefined) return null;

                            const isMatch = inVal !== undefined && tgtVal !== undefined && String(inVal).trim().toLowerCase() === String(tgtVal).trim().toLowerCase();

                            return (
                              <tr key={field.label} className="hover:bg-slate-50/70 transition">
                                <td className="py-2 px-3 font-medium text-slate-600">
                                  {field.label}
                                </td>
                                <td className="py-2 px-3 text-slate-800 font-semibold">
                                  {formatVal(inVal)}
                                </td>
                                <td className={`py-2 px-3 font-semibold ${isMatch ? 'text-blue-900' : 'text-rose-700 bg-rose-50/50'}`}>
                                  {formatVal(tgtVal)}
                                </td>
                                <td className="py-2 px-2 text-center">
                                  {isMatch ? (
                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700">
                                      <Check size={11} />
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-100 text-rose-700" title="Discrepancy detected">
                                      <AlertTriangle size={11} />
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}

                          {/* Extra fields from target record that weren't in dynamicComparisonFields */}
                          {Object.entries(targetRecord)
                            .filter(([k]) => !k.startsWith('_') && !dynamicComparisonFields.some(f => f.targetKey.toLowerCase() === k.toLowerCase()))
                            .map(([k, v]) => (
                              <tr key={`extra-${k}`} className="hover:bg-slate-50/70 transition bg-slate-50/30">
                                <td className="py-1.5 px-3 text-slate-500 font-normal">
                                  {k}
                                </td>
                                <td className="py-1.5 px-3 text-slate-400 italic">
                                  {formatVal(inputRecord[k])}
                                </td>
                                <td className="py-1.5 px-3 text-blue-900 font-semibold">
                                  {formatVal(v)}
                                </td>
                                <td className="py-1.5 px-2 text-center text-[10px] text-slate-400">
                                  —
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={`p-4 border rounded-xl flex items-start gap-3 text-xs ${evalOutcome.status === 'PENDING' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-rose-50 border-rose-200 text-rose-900'}`}>
                      <AlertTriangle size={18} className={evalOutcome.status === 'PENDING' ? 'text-amber-600 shrink-0 mt-0.5' : 'text-rose-600 shrink-0 mt-0.5'} />
                      <div>
                        {evalOutcome.status === 'PENDING' ? (
                          <>
                            <div className="font-bold text-sm text-slate-800">Validation Not Run Yet</div>
                            <p className="mt-1 text-slate-600 leading-relaxed">
                              This record has not yet been validated against target database <strong className="font-mono text-slate-900">{targetDbName}</strong> table <strong className="font-mono text-slate-900">{targetTableName}</strong>.
                            </p>
                            <p className="mt-1.5 text-[11px] text-blue-700 font-medium">
                              Click "▶ Run Validation" to query the target database with configured parameters <strong className="font-mono">{displayKeyString}</strong>.
                            </p>
                          </>
                        ) : (
                          <>
                            <div className="font-bold text-sm">No Matching Record Returned from Target Database</div>
                            <p className="mt-1 text-rose-700 leading-relaxed">
                              The query against target database <strong className="font-mono text-rose-900">{targetDbName}</strong> table <strong className="font-mono text-rose-900">{targetTableName}</strong> with parameters <strong className="font-mono text-rose-900">{displayKeyString}</strong> returned 0 records.
                            </p>
                            <p className="mt-1.5 text-[11px] text-rose-600 font-medium">
                              Suggested Manual Action: verify whether this transaction was submitted, settled, or delayed in the target settlement system.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 shrink-0">
                <div className="text-[11px] font-mono text-slate-500">
                  Target DB: <span className="font-semibold text-slate-700">{targetDbName}</span> &bull; Table: <span className="font-semibold text-slate-700">{targetTableName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOutcomeDrilldownRow(null)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-lg text-xs cursor-pointer transition shadow-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase font-mono ${inspectingRow.investigationStatus === 'RECONCILED' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
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
                className={`px-3 py-1 rounded text-xs font-bold border transition cursor-pointer ${inspectingRow.investigationStatus === 'CLOSED'
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
                      className={`p-3 rounded-lg border text-xs space-y-1 ${entry.validationResult === 'PASS' ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950' :
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
                          <span className={`px-1.5 py-0.5 rounded font-bold ${entry.validationResult === 'PASS' ? 'bg-emerald-600 text-white' :
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
