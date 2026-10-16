/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Issue, DatabaseConnection, EnvironmentSystem, HashtagPreset, QueryApprovalRequest, User, Team, SolutionProcessType,
  DatabaseValidationWorkflow, ProcessingStage, ValidationResultStatus, PipelineAction,
  TransactionInvestigationStatus, TransactionExecutionSummary, RuleExecutionAuditEntry, GlobalTransactionSchemaField,
  DatabaseColumnConfiguration
} from '../../types';
import { aggregateParentIssueStatus } from '../../services/statusAggregator';
import { createBatchPlan } from '../../services/batchPlanner';
import { executeBatchInvestigation } from '../../services/investigationEngine';
import { api } from '../../api/client';
import {
  Database, Search, Download, Terminal, Copy, Check, Filter,
  Eye, EyeOff, Plus, X, Server, ChevronRight, Play, Code2, Table,
  CheckCircle2, AlertTriangle, RefreshCw, FileSpreadsheet,
  Layers, SlidersHorizontal, ArrowUpDown, ChevronDown, ArrowUpAZ, ArrowDownZA,
  Sliders, ShieldAlert, CheckSquare, Square, RotateCcw, ShieldCheck, CheckCircle, Zap, Activity, GitBranch,
  MessageSquare, History, Undo2, Send, Bookmark, AtSign, CheckCheck, FileCode, Users, Sparkles,
  Paperclip, FileText, FileDown, ExternalLink, Tag, GitCompare, HelpCircle
} from 'lucide-react';
import { ErrorBoundary } from '../ErrorBoundary';

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
  _target_record?: any;
  _target_db?: string;
  _target_table?: string;
  returned_data?: any;
  _validation_status?: string;
  _validation_details?: any;
}


interface ColumnFilterState {
  sortDirection: 'asc' | 'desc' | null;
  selectedValues: Set<string> | null; // null means all values are selected
}

export function formatValidationDetail(detail: any, defaultText: string = 'Validation Discrepancy'): string {
  if (detail === null || detail === undefined || detail === '') return defaultText;
  if (typeof detail === 'string') return detail;
  if (typeof detail === 'object') {
    if (detail instanceof Error) return detail.message;

    // 1. Direct explicit reason or message
    if (detail.reason && typeof detail.reason === 'string') return detail.reason;
    if (detail.message && typeof detail.message === 'string') return detail.message;

    // 2. Existence check failure
    if (detail.existence === 'NOT_FOUND_IN_TARGET_DB') {
      return detail.reason || 'Record not found in target database';
    }

    // 3. Stage history failure extraction
    if (Array.isArray(detail.stageHistory)) {
      const failedStages = detail.stageHistory.filter((s: any) => s && (s.status === 'FAIL' || s.status === 'ERROR'));
      if (failedStages.length > 0) {
        const stageMsgs = failedStages.map((s: any) => {
          const r = s.details?.reason || s.details?.message || (typeof s.details === 'string' ? s.details : null);
          return r ? `${s.stageName ? `${s.stageName}: ` : ''}${r}` : `${s.stageName || 'Stage'} failed (${s.action || 'STOP'})`;
        });
        return stageMsgs.join('; ');
      }
    }

    // 4. Cardinality breach
    if (detail.cardinality?.breach || detail.cardinality?.status === 'CARDINALITY_BREACH') {
      if (detail.cardinality.reason) return detail.cardinality.reason;
      const count = detail.cardinality.count ? ` (${detail.cardinality.count} found)` : '';
      return `Cardinality breach: policy ${detail.cardinality.policy || 'STRICT_SINGLE'}${count}`;
    }

    // 5. Table rule violations
    if (detail.tableRuleViolation) {
      if (typeof detail.tableRuleViolation === 'string') return detail.tableRuleViolation;
      if (detail.tableRuleViolation.message) return detail.tableRuleViolation.message;
      if (detail.tableRuleViolation.title) return detail.tableRuleViolation.title;
    }
    if (detail.tableRuleDetails?.message) return String(detail.tableRuleDetails.message);

    // 6. Step results with failures
    if (detail.stepResults && typeof detail.stepResults === 'object') {
      const failedSteps = Object.values(detail.stepResults).filter((sr: any) => sr && (sr.resultStatus === 'FAIL' || sr.status === 'FAILED'));
      if (failedSteps.length > 0) {
        return failedSteps.map((sr: any) => sr.detail || sr.summary || sr.message || 'Check failed').join('; ');
      }
    }

    // 7. Extract from step- keys: e.g. 'step-xxx': { rule, action, passed: false, reason }
    const stepFailures = Object.entries(detail)
      .filter(([k, v]: [string, any]) => k.startsWith('step-') && v && v.passed === false)
      .map(([k, v]: [string, any]) => v.reason || v.message || `${v.rule || k} failed`);
    if (stepFailures.length > 0) return stepFailures.join('; ');

    // Fallback: look for error/summary/detail
    if (detail.error) return typeof detail.error === 'string' ? detail.error : (detail.error.message || detail.error.detail || Object.values(detail.error).join(' '));
    if (detail.detail) return typeof detail.detail === 'string' ? detail.detail : (detail.detail.message || detail.detail.reason || Object.values(detail.detail).join(' '));
    if (detail.summary) return typeof detail.summary === 'string' ? detail.summary : (detail.summary.message || detail.summary.reason || Object.values(detail.summary).join(' '));

    // Legacy fallback: shallow key extraction
    const keys = Object.keys(detail);
    if (keys.length === 0) return defaultText;
    const messages = keys.map(k => {
      const val = detail[k];
      if (typeof val === 'string') return val;
      if (val && typeof val === 'object') {
        return val.message || val.rule || val.error || val.detail || null;
      }
      return null;
    }).filter(Boolean);
    if (messages.length > 0) return messages.join('; ');
  }
  return defaultText;
}

/**
 * Safely renders any data payload as a clean HTML table or structured key-value display.
 * Eliminates raw JSON dumps across the entire inspection interface.
 */
export function renderDataAsTable(data: any, emptyMessage: string = 'No details available'): React.ReactNode {
  if (data === null || data === undefined || data === '') {
    return <span className="text-slate-400 italic font-mono text-xs">null</span>;
  }
  if (typeof data !== 'object') {
    return <span className="font-mono text-xs text-slate-800 break-words">{String(data)}</span>;
  }

  // If array of items
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-slate-400 italic text-xs font-mono">{emptyMessage}</span>;
    }
    // Array of primitives (strings, numbers)
    if (typeof data[0] !== 'object' || data[0] === null) {
      return (
        <div className="flex flex-wrap gap-1">
          {data.map((item, idx) => (
            <span key={idx} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] border border-slate-200">
              {String(item)}
            </span>
          ))}
        </div>
      );
    }
    // Array of objects -> render tabular grid with headers
    const allKeys = Array.from(new Set(data.flatMap(item => (typeof item === 'object' && item !== null) ? Object.keys(item) : []))).filter(k => !k.startsWith('_'));
    return (
      <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-60 overflow-y-auto bg-white">
        <table className="w-full text-left text-xs font-mono border-collapse">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 text-[10px] uppercase font-bold sticky top-0 z-10">
              <th className="py-1.5 px-2 text-center w-10">#</th>
              {allKeys.map(k => (
                <th key={k} className="py-1.5 px-2.5 whitespace-nowrap">{k}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {data.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-slate-50 transition">
                <td className="py-1.5 px-2 text-center text-slate-400 text-[10px]">{rIdx + 1}</td>
                {allKeys.map(k => {
                  const val = row[k];
                  return (
                    <td key={k} className="py-1.5 px-2.5 whitespace-nowrap">
                      {val === null || val === undefined ? (
                        <span className="text-slate-300 italic">—</span>
                      ) : typeof val === 'object' ? (
                        renderDataAsTable(val)
                      ) : (
                        <span>{String(val)}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Key-value object
  const entries = Object.entries(data).filter(([k]) => !k.startsWith('_'));
  if (entries.length === 0) {
    return <span className="text-slate-400 italic text-xs font-mono">{emptyMessage}</span>;
  }

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-60 overflow-y-auto bg-white">
      <table className="w-full text-left text-xs font-mono border-collapse">
        <thead>
          <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 text-[10px] uppercase font-bold sticky top-0 z-10">
            <th className="py-1.5 px-3 w-1/3">Property / Parameter</th>
            <th className="py-1.5 px-3 w-2/3">Evaluated Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-800">
          {entries.map(([k, v]) => (
            <tr key={k} className="hover:bg-slate-50 transition">
              <td className="py-1.5 px-3 font-semibold text-slate-700 whitespace-nowrap">{k}</td>
              <td className="py-1.5 px-3">
                {v === null || v === undefined ? (
                  <span className="text-slate-300 italic">—</span>
                ) : typeof v === 'object' ? (
                  renderDataAsTable(v)
                ) : (
                  <span>{String(v)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Safely format cell values for table comparison display without dumping raw objects.
 */
export function formatCellVal(val: any): string {
  if (val === undefined || val === null || val === '') return '—';
  if (typeof val === 'number') {
    return Number(val).toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  if (typeof val === 'boolean') {
    return val ? 'TRUE' : 'FALSE';
  }
  if (typeof val === 'object') {
    if (Array.isArray(val)) {
      return val.map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
    }
    return formatValidationDetail(val);
  }
  return String(val);
}

/**
 * Compare two values with epsilon tolerance for numbers and case-insensitivity for strings.
 */
export function areValuesEqual(v1: any, v2: any): boolean {
  if (v1 === undefined || v2 === undefined || v1 === null || v2 === null) return false;
  if (v1 === '' && v2 === '') return true;
  const n1 = Number(v1);
  const n2 = Number(v2);
  if (!isNaN(n1) && !isNaN(n2) && String(v1).trim() !== '' && String(v2).trim() !== '') {
    return Math.abs(n1 - n2) < 0.0001;
  }
  return String(v1).trim().toLowerCase() === String(v2).trim().toLowerCase();
}

/**
 * Human-friendly column label formatting from snake_case or camelCase.
 */
export function formatHeaderLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Case-insensitive property lookup on objects.
 */
export function getCaseInsensitiveVal(obj: any, key: string): any {
  if (!obj || typeof obj !== 'object' || !key) return undefined;
  if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  const lKey = key.toLowerCase();
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lKey) return obj[k];
  }
  return undefined;
}

/**
 * Extracts all external database response records returned for this transaction record across
 * all stages, workflows, and tables in returned_data, as well as _target_records or _target_record.
 * Guarantees that EVERY returned record is made available to the response data envelope
 * and data comparison table (one row for each).
 */
export function extractRowLegs(row: any, workflow: DatabaseValidationWorkflow | null): any[] {
  if (!row) return [];

  // If validation findings explicitly state NOT_FOUND_IN_TARGET_DB and no records are present
  const rowValDetails = row._validation_details
    || row.canonical_data?._validation_details
    || row.sourceRecord?._validation_details
    || row.sourceRecord?.canonical_data?._validation_details;
  if (rowValDetails?.existence === 'NOT_FOUND_IN_TARGET_DB' && !row.returned_data && !row.canonical_data?.returned_data && !row.sourceRecord?.returned_data) {
    return [];
  }

  const returnedData = row.returned_data
    || row.canonical_data?.returned_data
    || row.sourceRecord?.returned_data
    || row.sourceRecord?.canonical_data?.returned_data;

  const collected: any[] = [];
  const seenKeys = new Set<string>();

  const addRecord = (item: any, meta: { table?: string; wfId?: string } = {}) => {
    if (!item || typeof item !== 'object') return;
    const p = item.payload || item;
    const tblName = meta.table || item._sourceTable || item.table || workflow?.targetTable || 'external_target';
    const hisId = item.TR_HIS_ID || p.TR_HIS_ID || item.tr_his_id || p.tr_his_id;
    const uniqueKey = (tblName && hisId)
      ? `${tblName}_${hisId}`
      : (item._mirror_id || p._mirror_id || hisId
        || (p.FE_UTRNNO && p.ACCT_NUM1 ? `${p.FE_UTRNNO}_${p.ACCT_NUM1}_${p.PROC_NAME || ''}_${tblName}` : null)
        || (item.id || p.id ? String(item.id || p.id) : null));

    if (uniqueKey && seenKeys.has(uniqueKey)) return;
    if (uniqueKey) seenKeys.add(uniqueKey);

    const proc = item.PROC_NAME || p.PROC_NAME || item.proc_name || p.proc_name || item.legType || null;

    collected.push({
      ...item,
      ...(item.payload || {}),
      _sourceTable: tblName,
      _sourceWfId: meta.wfId || item._sourceWfId || workflow?.id || 'default',
      _procName: proc,
    });
  };

  if (returnedData && typeof returnedData === 'object') {
    // 1. Direct array of records
    if (Array.isArray(returnedData)) {
      returnedData.forEach(r => addRecord(r));
    } else {
      // 2. Namespaced Multi-Leg Stage Envelope: returnedData.stages
      if (returnedData.stages && typeof returnedData.stages === 'object') {
        for (const [stgKey, stgVal] of Object.entries(returnedData.stages)) {
          if (stgVal && typeof stgVal === 'object') {
            const legs = (stgVal as any).legs;
            const tbl = (stgVal as any).targetTable || stgKey;
            if (Array.isArray(legs)) {
              legs.forEach(r => addRecord(r, { table: tbl, wfId: 'stages' }));
            }
          }
        }
      }

      // 3. Workflow / table hierarchy: iterate all top-level keys
      for (const [wfOrTblKey, wfOrTblVal] of Object.entries(returnedData)) {
        if (wfOrTblKey === 'stages' || wfOrTblKey === 'audit') continue;

        if (Array.isArray(wfOrTblVal)) {
          wfOrTblVal.forEach(r => addRecord(r, { table: wfOrTblKey }));
        } else if (typeof wfOrTblVal === 'object' && wfOrTblVal !== null) {
          for (const [subKey, subVal] of Object.entries(wfOrTblVal)) {
            if (Array.isArray(subVal)) {
              subVal.forEach(r => addRecord(r, { table: subKey, wfId: wfOrTblKey }));
            } else if (typeof subVal === 'object' && subVal !== null && Object.keys(subVal).length > 0) {
              addRecord(subVal, { table: subKey, wfId: wfOrTblKey });
            }
          }
        }
      }
    }
  }

  // 4. Target records array in canonical or row
  const targetRecords = row.canonical_data?._target_records
    || row._target_records
    || row.sourceRecord?.canonical_data?._target_records
    || row.sourceRecord?._target_records;
  if (Array.isArray(targetRecords) && targetRecords.length > 0) {
    targetRecords.forEach(r => addRecord(r));
  }

  // 5. Fallback single target record
  if (collected.length === 0) {
    const singleRec = row.canonical_data?._target_record
      || row._target_record
      || row.sourceRecord?.canonical_data?._target_record
      || row.sourceRecord?._target_record;
    if (singleRec && typeof singleRec === 'object' && Object.keys(singleRec).length > 0) {
      addRecord(singleRec);
    }
  }

  return collected;
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

export function isStepIdMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const clean = (s: string) => String(s).replace(/^(step|node|stage|box)[-_]+/gi, '').trim().toLowerCase();
  const cleanA = clean(a);
  const cleanB = clean(b);
  if (cleanA && cleanB && cleanA === cleanB) return true;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
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
  teams?: Team[];
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
  teams = [],
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
    setCentralMasterRows([]);
    setAvailableBatches([]);
    setTaskWorkflowExecutions([]);
    setManualStatusOverrides({});
    setInspectingRow(null);
    setActiveSheetTab('dataset');
    setHiddenRowIds(new Set());
    setColumnFilters({});

    // Seed immediately with in-memory task data or attachment records if present
    if (selectedIssue.firstLevelMappedData && selectedIssue.firstLevelMappedData.length > 0) {
      setTaskDatasetRows(selectedIssue.firstLevelMappedData);
    } else {
      const attRows = (selectedIssue.attachments || []).flatMap((a: any) => a.parsedData?.tabularRows || a.parsedData?.sampleRows || []);
      if (attRows.length > 0) {
        setTaskDatasetRows(attRows);
      } else {
        setTaskDatasetRows([]);
      }
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
          const execSummary = latestExec.executionSummary || latestExec.execution_summary;
          if (execSummary?.results) {
            const serverMap: Record<string, any> = {};
            const resultMap = execSummary.results;
            Object.keys(resultMap).forEach(k => {
              serverMap[k] = {
                transaction_id: k,
                retrieval_ref_num: k,
                refnum: k,
                _validation_status: resultMap[k].status,
                _validation_details: resultMap[k].details,
                _target_record: resultMap[k].targetRecord ?? resultMap[k]._target_record ?? null,
                _target_db: resultMap[k].targetDb ?? resultMap[k]._target_db,
                _target_table: resultMap[k].targetTable ?? resultMap[k]._target_table,
                auditTrail: resultMap[k].auditTrail || resultMap[k]._stage_results || [],
                _stage_results: resultMap[k]._stage_results || resultMap[k].auditTrail || [],
                _validation_workflow_id: latestWfId,
                _validation_workflow_name: latestExec.workflowName || latestExec.workflow_name || matchedWf?.name
              };
            });
            setServerEvaluatedRecords(serverMap);
            setLiveExecutionMetrics({
              jobId: `lookup-${latestExec.id || latestWfId}`,
              passedCount: latestExec.passedCount ?? latestExec.passed_count ?? 0,
              failedCount: latestExec.failedCount ?? latestExec.failed_count ?? 0,
              durationMs: latestExec.durationMs ?? latestExec.duration_ms ?? 0,
              cachedHits: 1,
              liveSource: `PostgreSQL Lookup Table (task_workflow_executions) - Executed by ${latestExec.executedBy || latestExec.executed_by || 'investigator'}`
            });
            setLiveProgressMsg(`Conducted workflow [${latestExec.workflowName || latestExec.workflow_name || latestWfId}] loaded from PostgreSQL lookup table (conducted by ${latestExec.executedBy || latestExec.executed_by || 'investigator'}).`);
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
          const attRows = (selectedIssue.attachments || []).flatMap((a: any) => a.parsedData?.tabularRows || a.parsedData?.sampleRows || []);
          if (attRows.length > 0) {
            setTaskDatasetRows(attRows);
          } else {
            setTaskDatasetRows([]);
          }
        }
      })
      .catch(err => {
        console.warn('Could not fetch task dataset from backend API:', err);
        if (selectedIssue.firstLevelMappedData && selectedIssue.firstLevelMappedData.length > 0) {
          setTaskDatasetRows(selectedIssue.firstLevelMappedData);
        } else {
          const attRows = (selectedIssue.attachments || []).flatMap((a: any) => a.parsedData?.tabularRows || a.parsedData?.sampleRows || []);
          if (attRows.length > 0) {
            setTaskDatasetRows(attRows);
          } else {
            setTaskDatasetRows([]);
          }
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

  // Internal system/evaluation metadata keys that should never be appended as user data columns in the spreadsheet grid
  const isInternalMetaKey = (k: string): boolean => {
    if (!k || k.startsWith('_')) return true;
    const normalized = k.toLowerCase().replace(/[^a-z0-9_]/g, '');
    const INTERNAL_SYSTEM_KEYS = new Set([
      'audittrail',
      'stageresults',
      'canonical_data',
      'canonicaldata',
      'raw_data',
      'rawdata',
      'task_id',
      'taskid',
      'batch_id',
      'batchid',
      'is_duplicate',
      'isduplicate',
      'duplicate_from_task_id',
      'duplicatefromtaskid',
      'was_previously_closed',
      'waspreviouslyclosed',
      'duplicate_status',
      'duplicatestatus',
      'duplicate_count',
      'duplicatecount',
      'alltaskids',
      'all_task_ids',
      'validationstatus',
      'validation_status',
      'validationdetails',
      'validation_details',
      'targetrecord',
      'target_record',
      'targetdb',
      'target_db',
      'targettable',
      'target_table',
      'workflow_id',
      'workflowid',
      'workflow_name',
      'workflowname',
      'sourcerecord',
      'source_record',
      'executionsummary',
      'execution_summary',
      'stepresults',
      'step_results',
      'intermediatereports',
      'intermediate_reports'
    ]);
    return INTERNAL_SYSTEM_KEYS.has(normalized);
  };

  // Clean, Abstracted Column Definitions showing only columns with mapped/populated values from this task's data
  const columnDefs = useMemo(() => {
    const formatLabel = (key: string) => {
      return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    };

    if (effectiveRows.length > 0) {
      // Find all keys that actually have at least one non-empty value across the rows of THIS task, excluding system metadata
      const populatedKeys = new Set<string>();
      effectiveRows.forEach(row => {
        Object.entries(row).forEach(([k, v]) => {
          if (!isInternalMetaKey(k) && v !== undefined && v !== null && String(v).trim() !== '') {
            populatedKeys.add(k);
          }
        });
      });

      let keysToUse = onlyMappedColumns && populatedKeys.size > 0
        ? Array.from(populatedKeys)
        : Object.keys(effectiveRows[0]).filter(k => !isInternalMetaKey(k));

      if (keysToUse.length === 0 && effectiveRows.length > 0 && effectiveRows[0]) {
        keysToUse = Object.keys(effectiveRows[0]).filter(k => !isInternalMetaKey(k));
      }

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
    const filtered = columnDefs.filter(c => {
      if (columnViewPreset === 'DEFAULT') {
        return isDefaultVisibleColumn(c.key) && !hiddenColumns.has(c.key);
      }
      return !hiddenColumns.has(c.key);
    });
    // Fallback: If default filter matched 0 columns, show all unhidden columns so dataset content is always visible
    if (filtered.length === 0 && columnDefs.length > 0) {
      return columnDefs.filter(c => !hiddenColumns.has(c.key));
    }
    return filtered;
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

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // 250ms Debounced search prevents UI thread locking across 5,000+ items during typing
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchTerm]);
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'FLAGGED' | 'CLEAN'>('ALL');
  const [investigationStatusFilter, setInvestigationStatusFilter] = useState<'ALL' | 'INVESTIGATING' | 'RECONCILED' | 'FLAGGED' | 'CLOSED'>('ALL');
  const [showValidationDropdown, setShowValidationDropdown] = useState(false);
  const [inspectingRow, setInspectingRow] = useState<OrchestratedRow | null>(null);
  const [outcomeDrilldownRow, setOutcomeDrilldownRow] = useState<any | null>(null);
  const [drilldownLegIndex, setDrilldownLegIndex] = useState<number>(-1);
  const [inspectLegIndex, setInspectLegIndex] = useState<number>(-1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedPayloadKey, setCopiedPayloadKey] = useState<string | null>(null);
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());
  const [availableColumnConfigs, setAvailableColumnConfigs] = useState<DatabaseColumnConfiguration[]>([]);
  const [drilldownOpenAccordions, setDrilldownOpenAccordions] = useState<Record<string, boolean>>({
    data_comparison: true,
    validations_conducted: true,
    grouped_legs: true,
    inspect_data_comparison: true,
    inspect_validations_conducted: true,
    inspect_grouped_legs: true,
  });

  const handleCopyPayload = (text: string, key: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedPayloadKey(key);
        setTimeout(() => setCopiedPayloadKey(null), 2000);
      }).catch(err => console.warn('Could not copy to clipboard:', err));
    }
  };

  const toggleDrilldownAccordion = (accordionKey: string) => {
    setDrilldownOpenAccordions(prev => ({
      ...prev,
      [accordionKey]: !prev[accordionKey]
    }));
  };

  // Load registered database column configurations from PostgreSQL
  useEffect(() => {
    api.getColumnConfigurations()
      .then((res: any) => {
        const list = Array.isArray(res) ? res : (res?.data || []);
        setAvailableColumnConfigs(list);
      })
      .catch((err: any) => console.warn('Could not load database column configurations:', err));
  }, []);

  const toggleRowExpanded = (rowId: string) => {
    setExpandedRowIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

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

  const [activeSheetTab, setActiveSheetTab] = useState<'dataset' | 'sheet1_central' | 'anomalies' | 'reconciled' | 'attachments'>('dataset');
  const [selectedAttachmentIdx, setSelectedAttachmentIdx] = useState<number>(0);
  const [isPromotingAttachment, setIsPromotingAttachment] = useState<boolean>(false);
  const [attachmentSearchTerm, setAttachmentSearchTerm] = useState<string>('');
  const [attachmentSuccessMsg, setAttachmentSuccessMsg] = useState<string | null>(null);
  const [copiedAttachmentText, setCopiedAttachmentText] = useState<boolean>(false);
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

  // Process Type classification for the current task
  const currentProcessType: SolutionProcessType = (selectedIssue?.processType as SolutionProcessType) || 'INTERNAL_STAGED_FIX';

  // Automatically bind workflow from hashtag or task config on task selection
  useEffect(() => {
    if (!selectedIssue) return;
    const taskWfId = (selectedIssue as any).workflowId || (selectedIssue as any).workflow_id;
    const taskTag = selectedIssue.linkedHashtag || (selectedIssue as any).hashtag;

    if (taskWfId && availableWorkflows.length > 0) {
      const found = availableWorkflows.find(w => w.id === taskWfId);
      if (found && (!activeWorkflow || activeWorkflow.id !== found.id)) {
        setActiveWorkflow(found);
        return;
      }
    }

    if (taskTag && hashtags.length > 0 && availableWorkflows.length > 0) {
      const preset = hashtags.find(h => h.tag.toUpperCase() === taskTag.toUpperCase());
      if (preset?.workflowId) {
        const found = availableWorkflows.find(w => w.id === preset.workflowId);
        if (found && (!activeWorkflow || activeWorkflow.id !== found.id)) {
          setActiveWorkflow(found);
        }
      }
    }
  }, [selectedIssue?.id, (selectedIssue as any)?.workflowId, selectedIssue?.linkedHashtag, hashtags, availableWorkflows]);

  // In-Flight Workflow Evolution & Live Accuracy Testing
  const [accuracyMetrics, setAccuracyMetrics] = useState<{
    evaluated: number;
    cleanCount: number;
    discrepancyCount: number;
    accuracyPercent: number;
    testedAt: string;
  } | null>(null);
  const [isTestingAccuracy, setIsTestingAccuracy] = useState(false);

  const [showAddBoxModal, setShowAddBoxModal] = useState(false);
  const [showSwapWorkflowModal, setShowSwapWorkflowModal] = useState(false);
  const [newBoxStageName, setNewBoxStageName] = useState('In-Flight Verification');
  const [newBoxRuleName, setNewBoxRuleName] = useState('');
  const [newBoxTargetCol, setNewBoxTargetCol] = useState('');
  const [newBoxOperator, setNewBoxOperator] = useState<string>('NOT_NULL');
  const [newBoxExpectedVal, setNewBoxExpectedVal] = useState('');

  const handleTestAccuracy = async () => {
    if (!activeWorkflow || effectiveRows.length === 0) {
      alert('Please select a workflow and ensure the dataset has rows to test.');
      return;
    }
    setIsTestingAccuracy(true);
    try {
      const total = effectiveRows.length;
      let flagged = 0;
      effectiveRows.forEach(row => {
        const sampleKeys = Object.keys(row).filter(k => !k.startsWith('_'));
        let hasViolation = false;
        if (activeWorkflow.steps && activeWorkflow.steps.length > 0) {
          activeWorkflow.steps.forEach(step => {
            const val = row[step.inputField || sampleKeys[0]];
            if (val === undefined || val === null || String(val).trim() === '') {
              hasViolation = true;
            }
          });
        }
        if (row._validation_status === 'FAIL' || hasViolation) {
          flagged++;
        }
      });
      const clean = Math.max(0, total - flagged);
      const acc = total > 0 ? Number(((clean / total) * 100).toFixed(1)) : 100;
      setAccuracyMetrics({
        evaluated: total,
        cleanCount: clean,
        discrepancyCount: flagged,
        accuracyPercent: acc,
        testedAt: new Date().toLocaleTimeString()
      });
    } catch (err: any) {
      console.warn('Accuracy test error:', err);
    } finally {
      setIsTestingAccuracy(false);
    }
  };

  const handleAddValidationBox = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoxRuleName.trim() || !activeWorkflow) return;

    const newStep: any = {
      id: `step-${Date.now()}`,
      name: newBoxRuleName.trim(),
      stage: newBoxStageName,
      inputField: newBoxTargetCol || columnDefs[0]?.key || 'id',
      operator: newBoxOperator,
      expectedValue: newBoxExpectedVal,
      severity: 'WARNING',
      action: 'CONTINUE'
    };

    const updatedWf: DatabaseValidationWorkflow = {
      ...activeWorkflow,
      steps: [...(activeWorkflow.steps || []), newStep]
    };

    setActiveWorkflow(updatedWf);
    setShowAddBoxModal(false);
    setNewBoxRuleName('');
    setNewBoxTargetCol('');
    setNewBoxExpectedVal('');
    alert(`Validation Box "${newStep.name}" added in-flight to active investigation workflow!`);
  };

  const handleSwapWorkflow = (wf: DatabaseValidationWorkflow) => {
    setActiveWorkflow(wf);
    setShowSwapWorkflowModal(false);
    if (selectedIssue?.id) {
      onUpdateIssue(selectedIssue.id, { workflowId: wf.id } as any);
    }
  };

  const handleResetToHashtagDefault = () => {
    const taskTag = selectedIssue.linkedHashtag || (selectedIssue as any).hashtag;
    if (!taskTag) return;
    const preset = hashtags.find(h => h.tag.toUpperCase() === taskTag.toUpperCase());
    if (preset?.workflowId) {
      const defWf = availableWorkflows.find(w => w.id === preset.workflowId);
      if (defWf) {
        setActiveWorkflow(defWf);
        if (selectedIssue?.id) {
          onUpdateIssue(selectedIssue.id, { workflowId: defWf.id } as any);
        }
        alert(`Reset to hashtag default workflow "${defWf.name}".`);
      }
    }
  };

  // Universal Hashtags Dry-Run DB Scanner & Side-by-Side Diff State
  const [isDryRunningHashtag, setIsDryRunningHashtag] = useState(false);
  const [hashtagDiffResult, setHashtagDiffResult] = useState<{
    runId: string;
    rowsScanned: number;
    anomaliesDetected: number;
    anomalyRows: any[];
    verdict: string;
    executionDurationMs: number;
    errors: string[];
    tag: string;
  } | null>(null);
  const [showHashtagDiffModal, setShowHashtagDiffModal] = useState(false);

  const handleRunHashtagDryRun = async () => {
    const tag = selectedIssue?.linkedHashtag || (selectedIssue as any)?.hashtag;
    if (!tag) return;
    setIsDryRunningHashtag(true);
    try {
      const res = await api.executeHashtagScan(tag, {
        executedBy: currentUser.id,
        taskId: selectedIssue.id,
        teamId: (selectedIssue as any).teamId,
        isDryRun: true
      });
      setHashtagDiffResult({ ...res, tag });
      setShowHashtagDiffModal(true);
    } catch (err: any) {
      alert(`Dry-run scan failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsDryRunningHashtag(false);
    }
  };

  // Granular Point-in-Time Reversion (Rollback Engine)
  const [isRevertingTask, setIsRevertingTask] = useState(false);
  const [revertingRowId, setRevertingRowId] = useState<string | null>(null);
  const [reversionSuccessAlert, setReversionSuccessAlert] = useState<string | null>(null);
  const [reversionHistory, setReversionHistory] = useState<any[]>([]);
  const [showReversionHistory, setShowReversionHistory] = useState(false);

  const handleRevertEntireTask = async () => {
    if (!selectedIssue?.id) return;
    const ok = window.confirm(
      `Are you sure you want to rollback staged changes for Task #${selectedIssue.id}?\n\nAll internal extracted transactions will be restored to their pre-change state snapshot.`
    );
    if (!ok) return;

    setIsRevertingTask(true);
    try {
      const res = await api.revertTaskData(selectedIssue.id, undefined, currentUser.id);
      setReversionSuccessAlert(`Successfully rolled back Task #${selectedIssue.id} to snapshot! (${res.restoredRowsCount || 'All'} rows restored).`);
      const updated = await api.getTaskTransactions(selectedIssue.id, 1, 5000);
      if (updated?.rows) setTaskDatasetRows(updated.rows);
      setTimeout(() => setReversionSuccessAlert(null), 5000);
    } catch (err: any) {
      alert(`Revert failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsRevertingTask(false);
    }
  };

  const handleRevertSingleRecord = async (transactionId: string) => {
    if (!selectedIssue?.id) return;
    const ok = window.confirm(`Restore transaction record "${transactionId}" to its pre-change snapshot state?`);
    if (!ok) return;

    setRevertingRowId(transactionId);
    try {
      await api.revertTaskData(selectedIssue.id, transactionId, currentUser.id);
      setReversionSuccessAlert(`Transaction "${transactionId}" restored to pre-change state.`);
      const updated = await api.getTaskTransactions(selectedIssue.id, 1, 5000);
      if (updated?.rows) setTaskDatasetRows(updated.rows);
      setTimeout(() => setReversionSuccessAlert(null), 4000);
    } catch (err: any) {
      alert(`Record restore failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setRevertingRowId(null);
    }
  };

  const handlePromoteAttachment = async (attIndex: number) => {
    if (!selectedIssue?.id) return;
    setIsPromotingAttachment(true);
    setAttachmentSuccessMsg(null);
    try {
      const att = selectedIssue.attachments?.[attIndex];
      const clientRows = att?.parsedData?.tabularRows || att?.parsedData?.sampleRows || [];
      if (clientRows.length > 0) {
        setTaskDatasetRows(clientRows);
        onUpdateIssue(selectedIssue.id, {
          firstLevelMappedData: clientRows,
          uploadedFileName: att.filename,
          transactionCount: clientRows.length,
          datasetStatus: 'INGESTED'
        });
        await api.ingestTaskDataset(selectedIssue.id, {
          rows: clientRows,
          headers: att.parsedData?.tabularHeaders || Object.keys(clientRows[0])
        }).catch(() => null);
        setActiveSheetTab('dataset');
        setAttachmentSuccessMsg(`Loaded ${clientRows.length} records into investigation dataset.`);
        setTimeout(() => setAttachmentSuccessMsg(null), 4000);
        return;
      }

      // Promote via server endpoint
      const res = await api.promoteAttachmentToDataset(selectedIssue.id, attIndex);
      if (res.success) {
        const tRes = await api.getTaskTransactions(selectedIssue.id, 1, 5000).catch(() => null);
        if (tRes?.rows && tRes.rows.length > 0) {
          setTaskDatasetRows(tRes.rows);
        }
        onUpdateIssue(selectedIssue.id, {
          uploadedFileName: att?.filename,
          transactionCount: res.transactionCount,
          datasetStatus: 'INGESTED'
        });
        setActiveSheetTab('dataset');
        setAttachmentSuccessMsg(res.message);
        setTimeout(() => setAttachmentSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      alert(`Could not promote attachment: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsPromotingAttachment(false);
    }
  };

  const handleDownloadAttachment = (att: any) => {
    const raw = att.rawBase64 || att.base64;
    if (!raw) {
      alert(`Download unavailable: File is stored on server storage (${att.storagePath || 'server path'}).`);
      return;
    }
    try {
      const mime = att.mimeType || 'application/octet-stream';
      const link = document.createElement('a');
      link.href = `data:${mime};base64,${raw}`;
      link.download = att.filename || 'attachment';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e: any) {
      alert(`Could not download file: ${e.message}`);
    }
  };

  const handleViewReversionHistory = async () => {
    if (!selectedIssue?.id) return;
    try {
      const res = await api.getTaskReversions(selectedIssue.id);
      setReversionHistory(res?.snapshots || []);
      setShowReversionHistory(true);
    } catch (err: any) {
      console.warn('Could not load reversion history:', err);
    }
  };

  // Collaborative Chat Consensus & Solution Adoption
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [chatInputText, setChatInputText] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatMentions, setChatMentions] = useState<{ type: 'user' | 'team'; id: string; name: string }[]>([]);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [attachSummaryActive, setAttachSummaryActive] = useState(false);
  const [proposeScriptActive, setProposeScriptActive] = useState(false);
  const [proposedScriptCode, setProposedScriptCode] = useState('');
  const [proposedScriptProcessType, setProposedScriptProcessType] = useState<SolutionProcessType>('INTERNAL_STAGED_FIX');
  const [acceptingProposalId, setAcceptingProposalId] = useState<string | null>(null);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInputText.trim() && !proposeScriptActive) return;
    if (!selectedIssue?.id) return;

    setIsSendingChat(true);
    try {
      let summaryPayload: any = undefined;
      if (attachSummaryActive) {
        summaryPayload = {
          issueId: selectedIssue.id,
          totalRecords: effectiveRows.length,
          discrepancyCount: aggregateStats.anomaliesCount,
          keyFindings: `Evaluated ${effectiveRows.length} rows against [${activeWorkflow?.name || 'Workflow'}]. Found ${aggregateStats.anomaliesCount} anomalies.`
        };
      }

      let proposalPayload: any = undefined;
      if (proposeScriptActive && proposedScriptCode.trim()) {
        proposalPayload = {
          script: proposedScriptCode.trim(),
          processType: proposedScriptProcessType,
          proposedBy: currentUser.username || currentUser.id
        };
      }

      const msgText = chatInputText.trim() || (proposalPayload ? 'Proposed a solution script for peer consensus.' : 'Investigation update.');
      const clientMessage: any = {
        id: `msg-${Date.now()}`,
        senderId: currentUser.id,
        senderName: currentUser.username,
        senderRole: currentUser.role,
        text: msgText,
        timestamp: new Date().toISOString(),
        mentions: chatMentions.length > 0 ? chatMentions : undefined,
        attachedSummary: summaryPayload || undefined,
        solutionProposal: proposalPayload ? {
          id: `prop-${Date.now()}`,
          script: proposalPayload.script,
          processType: proposalPayload.processType,
          proposedBy: currentUser.id,
          proposedByName: currentUser.username,
          proposedAt: new Date().toISOString(),
          accepted: false
        } : undefined
      };

      // Optimistically update chat in UI
      const currentChat = selectedIssue.chat || [];
      onUpdateIssue(selectedIssue.id, { chat: [...currentChat, clientMessage] });

      const res = await api.postIssueChat(selectedIssue.id, {
        senderId: currentUser.id,
        senderName: currentUser.username,
        senderRole: currentUser.role,
        text: msgText,
        mentions: chatMentions,
        attachedSummary: summaryPayload,
        solutionProposal: proposalPayload,
        issueContext: {
          title: selectedIssue.title,
          description: selectedIssue.description,
          status: selectedIssue.status,
          priority: selectedIssue.priority,
          creatorId: selectedIssue.creatorId,
          creatorName: selectedIssue.creatorName,
          linkedHashtag: selectedIssue.linkedHashtag,
          firstLevelMappedData: selectedIssue.firstLevelMappedData
        }
      });

      if (res?.chat) {
        onUpdateIssue(selectedIssue.id, { chat: res.chat });
      }

      setChatInputText('');
      setChatMentions([]);
      setAttachSummaryActive(false);
      setProposeScriptActive(false);
      setProposedScriptCode('');
    } catch (err: any) {
      console.warn('Backend chat sync note:', err?.message);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleAcceptSolutionProposal = async (msgId: string) => {
    if (!selectedIssue?.id) return;
    setAcceptingProposalId(msgId);
    try {
      const res = await api.acceptChatSolution(
        selectedIssue.id,
        msgId,
        currentUser.id,
        currentUser.username
      );
      if (res?.chat) {
        onUpdateIssue(selectedIssue.id, {
          chat: res.chat,
          solutionScript: res.solutionScript,
          processType: res.processType
        });
      }
      alert('Solution script accepted by consensus! Staged execution has been locked in.');
    } catch (err: any) {
      alert(`Could not accept solution script: ${err?.message || 'Unknown error'}`);
    } finally {
      setAcceptingProposalId(null);
    }
  };

  // Compute Orchestrated Row Results using the Centralized Shared Investigation Engine
  // Compute Orchestrated Row Results using the Centralized Shared Investigation Engine
  const orchestratedRows: OrchestratedRow[] = useMemo(() => {
    const isTaskValidated = Boolean(
      hasExecutedValidation
      || (activeWorkflow && taskWorkflowExecutions.some(x => (x.workflow_id || x.workflowId) === activeWorkflow.id))
      || (activeWorkflow && effectiveRows.some(r => r._validation_workflow_id === activeWorkflow.id || r.canonical_data?._validation_workflow_id === activeWorkflow.id))
      || effectiveRows.some(r => (r._validation_status && r._validation_status !== 'PENDING') || (r.canonical_data?._validation_status && r.canonical_data._validation_status !== 'PENDING'))
    );

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
      const rowNum = row._rowNumber ?? row._row_number ?? (rowIdx + 1);
      keys.push(`ROW-${rowNum}`);
      keys.push(String(rowNum));
      return keys;
    };

    if (!isTaskValidated || !activeWorkflow) {
      return effectiveRows.map((row, rowIdx) => {
        const rowId = getRowCandidateKeys(row, rowIdx)[0] || `ROW-${rowIdx + 1}`;
        const overriddenStatus = manualStatusOverrides[rowId];
        const isThisWf = activeWorkflow && (
          row._validation_workflow_id === activeWorkflow.id ||
          row.canonical_data?._validation_workflow_id === activeWorkflow.id ||
          serverEvaluatedRecords?.[rowId]?._validation_workflow_id === activeWorkflow.id
        );
        const rowValStatus = isThisWf ? (serverEvaluatedRecords?.[rowId]?._validation_status || row._validation_status) : null;
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
              detail: formatValidationDetail(row._validation_details, rowValStatus === 'PASS' ? 'Verified in conducted workflow' : 'Discrepancy detected in conducted workflow'),
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
          isHalted: false,
          returned_data: row.returned_data || row.canonical_data?.returned_data,
          _validation_status: rowValStatus || undefined,
          _validation_details: row._validation_details || row.canonical_data?._validation_details
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

      const isServerRecMatch = Boolean(
        serverRec && serverRec._validation_status && serverRec._validation_status !== 'PENDING' &&
        (!serverRec._validation_workflow_id || !activeWorkflow || serverRec._validation_workflow_id === activeWorkflow.id)
      );
      const isRowWfMatch = Boolean(
        !activeWorkflow ||
        row._validation_workflow_id === activeWorkflow.id ||
        row.canonical_data?._validation_workflow_id === activeWorkflow.id ||
        row.sourceRecord?._validation_workflow_id === activeWorkflow.id
      );

      const rawTargetRecord =
        (isServerRecMatch && serverRec?._target_record)
        ?? serverRec?._target_record
        ?? row?._target_record
        ?? row?.sourceRecord?._target_record
        ?? row?.canonical_data?._target_record
        ?? row?.sourceRecord?.canonical_data?._target_record
        ?? row?._mirrorData
        ?? row?.sourceRecord?._mirrorData
        ?? row?._externalData
        ?? row?.sourceRecord?._externalData
        ?? (row?.returned_data && activeWorkflow?.targetTable ? row.returned_data[activeWorkflow.targetTable] : null)
        ?? (row?.sourceRecord?.returned_data && activeWorkflow?.targetTable ? row.sourceRecord.returned_data[activeWorkflow.targetTable] : null)
        ?? null;

      const hasRowPersistedValidation = Boolean(
        (row.sourceRecord && row.sourceRecord._validation_status && row.sourceRecord._validation_status !== 'PENDING') ||
        (row._validation_status && row._validation_status !== 'PENDING') ||
        (row.canonical_data && row.canonical_data._validation_status && row.canonical_data._validation_status !== 'PENDING')
      );

      const isRowEvaluated = isTaskValidated && (isServerRecMatch || hasRowPersistedValidation);
      const hasTargetRecordExplicit = isRowEvaluated && Boolean(
        rawTargetRecord ||
        (serverRec && '_target_record' in serverRec) ||
        ('_target_record' in row) ||
        (row.canonical_data && '_target_record' in row.canonical_data) ||
        (row.sourceRecord && '_target_record' in row.sourceRecord) ||
        ('_mirrorData' in row) ||
        ('_externalData' in row)
      );
      const targetRecord = isRowEvaluated ? rawTargetRecord : null;
      const targetDbName = (isServerRecMatch && serverRec?._target_db) || row._target_db || row.sourceRecord?._target_db || activeWorkflow?.targetDbId || 'Target DB';
      const targetTableName = (isServerRecMatch && serverRec?._target_table) || row._target_table || row.sourceRecord?._target_table || activeWorkflow?.targetTable || 'transactions';

      return {
        ...row,
        ...(isServerRecMatch ? serverRec : {}),
        ...(hasTargetRecordExplicit ? { _target_record: targetRecord } : {}),
        _target_db: targetDbName,
        _target_table: targetTableName
      };
    });

    const batchSummaries = typeof executeBatchInvestigation === 'function' && activeWorkflow
      ? executeBatchInvestigation(mergedEffectiveRows, activeWorkflow)
      : {};

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

      const isServerRecMatch = Boolean(
        serverRec && serverRec._validation_status && serverRec._validation_status !== 'PENDING' &&
        (!serverRec._validation_workflow_id || !activeWorkflow || serverRec._validation_workflow_id === activeWorkflow.id)
      );
      const isRowWfMatch = Boolean(
        !activeWorkflow ||
        row._validation_workflow_id === activeWorkflow.id ||
        row.canonical_data?._validation_workflow_id === activeWorkflow.id ||
        row.sourceRecord?._validation_workflow_id === activeWorkflow.id
      );

      const summary = batchSummaries[rowId] || (rowKeyCandidates[1] ? batchSummaries[rowKeyCandidates[1]] : undefined);
      const rawTargetRecord =
        (isServerRecMatch && serverRec?._target_record)
        ?? serverRec?._target_record
        ?? row?._target_record
        ?? row?.sourceRecord?._target_record
        ?? row?.canonical_data?._target_record
        ?? row?.sourceRecord?.canonical_data?._target_record
        ?? row?._mirrorData
        ?? row?.sourceRecord?._mirrorData
        ?? row?._externalData
        ?? row?.sourceRecord?._externalData
        ?? (row?.returned_data && activeWorkflow?.targetTable ? row.returned_data[activeWorkflow.targetTable] : null)
        ?? (row?.sourceRecord?.returned_data && activeWorkflow?.targetTable ? row.sourceRecord.returned_data[activeWorkflow.targetTable] : null)
        ?? null;

      const hasRowPersistedValidation = Boolean(
        (row.sourceRecord && row.sourceRecord._validation_status && row.sourceRecord._validation_status !== 'PENDING') ||
        (row._validation_status && row._validation_status !== 'PENDING') ||
        (row.canonical_data && row.canonical_data._validation_status && row.canonical_data._validation_status !== 'PENDING')
      );

      const isRowEvaluated = isTaskValidated && (isServerRecMatch || hasRowPersistedValidation);
      const hasTargetRecordExplicit = isRowEvaluated && Boolean(
        rawTargetRecord ||
        (serverRec && '_target_record' in serverRec) ||
        ('_target_record' in row) ||
        (row.canonical_data && '_target_record' in row.canonical_data) ||
        (row.sourceRecord && '_target_record' in row.sourceRecord) ||
        ('_mirrorData' in row) ||
        ('_externalData' in row)
      );
      const targetRecord = isRowEvaluated ? rawTargetRecord : null;
      const targetDbName = (isServerRecMatch && serverRec?._target_db) || row._target_db || row.sourceRecord?._target_db || activeWorkflow?.targetDbId || 'Target DB';
      const targetTableName = (isServerRecMatch && serverRec?._target_table) || row._target_table || row.sourceRecord?._target_table || activeWorkflow?.targetTable || 'transactions';

      let serverStatus: TransactionInvestigationStatus | undefined;
      const rowValStatus = isServerRecMatch
        ? serverRec._validation_status
        : (row._validation_status || row.canonical_data?._validation_status || row.sourceRecord?._validation_status || undefined);

      const rowValDetails = isServerRecMatch
        ? (serverRec?._validation_details || serverRec?.details)
        : (row._validation_details || row.canonical_data?._validation_details || row.sourceRecord?._validation_details || row.sourceRecord?.canonical_data?._validation_details || undefined);

      if (rowValStatus && rowValStatus !== 'PENDING') {
        if (rowValStatus === 'FAIL' || (hasTargetRecordExplicit && !targetRecord)) serverStatus = 'FLAGGED';
        else if (rowValStatus === 'PASS') serverStatus = 'RECONCILED';
        else if (rowValStatus === 'PAUSED_DB_OFFLINE') serverStatus = 'INVESTIGATING';
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

      // Map audit trail to stepResults for UI display, strictly isolating to activeWorkflow
      const stepResults: Record<string, StepExecutionResult> = {};
      const recordAuditTrail = (
        (isServerRecMatch && Array.isArray(serverRec?.auditTrail) ? serverRec.auditTrail : null) ||
        (isRowWfMatch && Array.isArray(row?.auditTrail) ? row.auditTrail : null) ||
        (isRowWfMatch && Array.isArray(row?.canonical_data?.auditTrail) ? row.canonical_data.auditTrail : null) ||
        (isRowWfMatch && Array.isArray(row?.sourceRecord?.auditTrail) ? row.sourceRecord.auditTrail : null) ||
        (isServerRecMatch && Array.isArray(serverRec?._validation_details?.stageResults) ? serverRec._validation_details.stageResults : null) ||
        (isRowWfMatch && Array.isArray(row?.canonical_data?._validation_details?.stageResults) ? row.canonical_data._validation_details.stageResults : null) ||
        (isRowWfMatch && Array.isArray(row?.sourceRecord?._validation_details?.stageResults) ? row.sourceRecord._validation_details.stageResults : null) ||
        (Array.isArray(summary?.auditTrail) ? summary.auditTrail : null) ||
        []
      );
      recordAuditTrail.forEach((entry: any) => {
        if (!entry || !entry.ruleId) return;
        // Strictly filter to rules belonging to activeWorkflow to avoid mixing previous workflow steps
        const matchesStep = activeWorkflow?.steps?.some(s => isStepIdMatch(s.id, entry.ruleId));
        if (!matchesStep) return;

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
      if (Object.keys(stepResults).length === 0 && rowValStatus && activeWorkflow?.steps) {
        activeWorkflow.steps.forEach(step => {
          stepResults[step.id] = {
            stepId: step.id,
            status: rowValStatus === 'PASS' ? 'PASSED' : 'FAILED',
            badgeText: rowValStatus,
            detail: (hasTargetRecordExplicit && !targetRecord)
              ? `Record not found in target database (${targetDbName}.${targetTableName})`
              : formatValidationDetail(rowValDetails, rowValStatus === 'PASS' ? 'Condition satisfied' : 'Discrepancy detected in conducted workflow'),
            resultStatus: rowValStatus === 'PASS' ? 'PASS' : 'FAIL',
            actionTaken: rowValStatus === 'PASS' ? 'CONTINUE' : 'FLAG'
          };
        });
      }

      const rowReturnedData =
        (isServerRecMatch && serverRec?.returned_data)
        || row.returned_data
        || row.canonical_data?.returned_data
        || row.sourceRecord?.returned_data;

      const mergedSource = {
        ...row,
        ...(isServerRecMatch ? serverRec : {}),
        ...(targetRecord ? { _target_record: targetRecord } : {}),
        _target_db: targetDbName,
        _target_table: targetTableName,
        returned_data: rowReturnedData
      };

      return {
        rowId,
        sourceRecord: mergedSource,
        _target_record: targetRecord,
        _target_db: targetDbName,
        _target_table: targetTableName,
        returned_data: rowReturnedData,
        stepResults,
        overallSeverity: rowSeverity,
        overallSummary: summary?.auditTrail.map(a => `${a.ruleName}: [${a.validationResult}] ${a.pipelineAction}`).join(' | ') || (isServerRecMatch ? `Evaluated via ${activeWorkflow?.name}: [${serverRec._validation_status}]` : rowValStatus ? `Conducted verdict: [${rowValStatus}]` : activeWorkflow ? `Ready to validate against [${activeWorkflow.name}]` : 'Passed multi-stage validation'),
        remedySql: summary?.remedySql,
        executionSummary: {
          ...(summary || {}),
          auditTrail: recordAuditTrail.filter((entry: any) => activeWorkflow?.steps?.some(s => isStepIdMatch(s.id, entry.ruleId)))
        },
        investigationStatus: finalStatus,
        isClosed,
        isHalted,
        _validation_status: rowValStatus || undefined,
        _validation_details: rowValDetails
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

    // Global search term (debounced to avoid blocking UI thread during typing)
    if (debouncedSearchTerm.trim()) {
      const q = debouncedSearchTerm.toLowerCase();
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
  }, [orchestratedRows, hiddenRowIds, activeSheetTab, outcomeFilter, investigationStatusFilter, duplicateFilter, debouncedSearchTerm, columnFilters, centralMasterRows, effectiveRows]);

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
    return taskWorkflowExecutions.find((e: any) => (e.workflow_id || e.workflowId) === activeWorkflow.id) || null;
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

    // Also include workflows stamped on the rows themselves
    (effectiveRows || []).forEach((r: any) => {
      const id = r._validation_workflow_id || r.canonical_data?._validation_workflow_id;
      const name = r._validation_workflow_name || r.canonical_data?._validation_workflow_name || availableWorkflows.find(w => w.id === id)?.name || id;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        list.push({
          id,
          name,
          isLatest: list.length === 0
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
  }, [taskWorkflowExecutions, effectiveRows, availableWorkflows, hasExecutedValidation, activeWorkflow]);

  const conductedWorkflowsCount = conductedWorkflows.length;

  const handleSelectWorkflow = (chosenId: string) => {
    const chosen = availableWorkflows.find(w => w.id === chosenId);
    if (!chosen) return;
    setActiveWorkflow(chosen);

    const conductedExec = taskWorkflowExecutions.find((x: any) => (x.workflow_id || x.workflowId) === chosenId);
    if (conductedExec) {
      const execSummary = conductedExec.executionSummary || conductedExec.execution_summary;
      if (execSummary?.results) {
        const serverMap: Record<string, any> = {};
        const resultMap = execSummary.results;
        Object.keys(resultMap).forEach(k => {
          serverMap[k] = {
            transaction_id: k,
            retrieval_ref_num: k,
            refnum: k,
            _validation_status: resultMap[k].status,
            _validation_details: resultMap[k].details,
            _target_record: resultMap[k].targetRecord ?? resultMap[k]._target_record ?? null,
            _target_db: resultMap[k].targetDb ?? resultMap[k]._target_db,
            _target_table: resultMap[k].targetTable ?? resultMap[k]._target_table,
            auditTrail: resultMap[k].auditTrail || resultMap[k]._stage_results || [],
            _stage_results: resultMap[k]._stage_results || resultMap[k].auditTrail || [],
            _validation_workflow_id: chosenId,
            _validation_workflow_name: conductedExec.workflowName || conductedExec.workflow_name || chosen.name
          };
        });
        setServerEvaluatedRecords(serverMap);
        setLiveExecutionMetrics({
          jobId: `lookup-${conductedExec.id || conductedExec.workflow_id || conductedExec.workflowId}`,
          passedCount: conductedExec.passedCount ?? conductedExec.passed_count ?? 0,
          failedCount: conductedExec.failedCount ?? conductedExec.failed_count ?? 0,
          durationMs: conductedExec.durationMs ?? conductedExec.duration_ms ?? 0,
          cachedHits: 1,
          liveSource: `PostgreSQL Lookup Table (task_workflow_executions) - Executed by ${conductedExec.executedBy || conductedExec.executed_by || 'investigator'}`
        });
        setLiveProgressMsg(`Loaded conducted validation for [${conductedExec.workflowName || conductedExec.workflow_name || chosen.name}] from PostgreSQL lookup table.`);
      }
      setHasExecutedValidation(true);
    } else {
      setServerEvaluatedRecords({});
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
  const [isVerifying, setIsVerifying] = useState(false);

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
        const rowNum = r._rowNumber ?? r._row_number ?? (idx + 1);
        candidateKeys.push(`ROW-${rowNum}`);
        candidateKeys.push(String(rowNum));

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

      // 1. Immediately update local dataset rows so UI updates instantly without requiring page reload
      if (res.records && Array.isArray(res.records) && res.records.length > 0) {
        if (selectedBatchId !== 'ALL') {
          // If a specific batch is selected, update matching records in-place so other batches are preserved
          setTaskDatasetRows(prev => {
            const next = [...prev];
            const candidateKeyMap = new Map<string, any>();
            res.records.forEach((r: any, idx: number) => {
              const rNum = r._rowNumber ?? r.row_number;
              if (rNum !== undefined) candidateKeyMap.set(`ROW-${rNum}`, r);
              activeKeyFields.forEach(kf => {
                if (r[kf] !== undefined && r[kf] !== null) candidateKeyMap.set(String(r[kf]), r);
              });
              candidateKeyMap.set(`ROW-${idx + 1}`, r);
            });

            return next.map((row, idx) => {
              const rNum = row._rowNumber ?? row.row_number;
              if (rNum !== undefined && candidateKeyMap.has(`ROW-${rNum}`)) {
                return { ...row, ...candidateKeyMap.get(`ROW-${rNum}`) };
              }
              for (const kf of activeKeyFields) {
                const val = row[kf] !== undefined && row[kf] !== null ? String(row[kf]) : '';
                if (val && candidateKeyMap.has(val)) {
                  return { ...row, ...candidateKeyMap.get(val) };
                }
              }
              return row;
            });
          });
        } else {
          setTaskDatasetRows(res.records);
        }
      }

      // 2. Immediately sync parent issue state so parent workspace and badges update instantly
      if (selectedIssue?.id) {
        onUpdateIssue(selectedIssue.id, {
          firstLevelMappedData: selectedBatchId === 'ALL' ? (res.records || effectiveRows) : undefined,
          validationStatus: res.failedCount > 0 ? 'FAIL' : 'PASS'
        });
      }

      // 3. Refresh lookup executions and dataset from PostgreSQL in the background
      if (selectedIssue?.id) {
        try {
          const [wfRes, tRes] = await Promise.all([
            api.getTaskWorkflowExecutions(selectedIssue.id).catch(() => null),
            api.getTaskTransactions(selectedIssue.id, 1, 5000).catch(() => null)
          ]);
          if (wfRes?.executions) {
            setTaskWorkflowExecutions(wfRes.executions);
          }
          if (tRes?.rows && Array.isArray(tRes.rows) && tRes.rows.length > 0) {
            setTaskDatasetRows(tRes.rows);
          }
        } catch { }
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

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
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
    } catch (err) {
      console.error('Failed to export Excel report:', err);
    }
  };


  // =========================================================================
  // WORKFLOW OUTCOME AGGREGATION & EVALUATION HELPERS
  // =========================================================================

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
        const failMsg = formatValidationDetail(row?.sourceRecord?._validation_details, 'Validation Discrepancy');
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

    const isServerRecMatch = Boolean(
      serverRec && serverRec._validation_status && serverRec._validation_status !== 'PENDING' &&
      (!serverRec._validation_workflow_id || !workflow || serverRec._validation_workflow_id === workflow.id)
    );
    const isRowWfMatch = Boolean(
      !workflow ||
      row?._validation_workflow_id === workflow.id ||
      row?.sourceRecord?._validation_workflow_id === workflow.id ||
      rec._validation_workflow_id === workflow.id ||
      rec.canonical_data?._validation_workflow_id === workflow.id
    );

    const hasRowPersistedValidation = Boolean(
      (row?.sourceRecord && row.sourceRecord._validation_status && row.sourceRecord._validation_status !== 'PENDING') ||
      (row?._validation_status && row._validation_status !== 'PENDING') ||
      (row?.canonical_data && row.canonical_data._validation_status && row.canonical_data._validation_status !== 'PENDING')
    );

    const isEvaluated = hasExecutedValidation || isServerRecMatch || hasRowPersistedValidation;

    if (!isEvaluated) {
      return {
        status: 'PENDING',
        message: 'Pending Verification',
        failedStepCount: 0,
        passedStepCount: 0,
        totalStepCount: workflow.steps.length,
        stepDetails: workflow.steps.map(s => ({
          stepId: s.id,
          stepName: s.name,
          checkType: s.checkType,
          status: 'PENDING',
          actionTaken: 'CONTINUE',
          detail: 'Pending verification'
        }))
      };
    }

    const rawTargetRecord =
      (isServerRecMatch && serverRec?._target_record)
      ?? serverRec?._target_record
      ?? row?._target_record
      ?? row?.sourceRecord?._target_record
      ?? row?.canonical_data?._target_record
      ?? row?.sourceRecord?.canonical_data?._target_record
      ?? row?._mirrorData
      ?? row?.sourceRecord?._mirrorData
      ?? row?._externalData
      ?? row?.sourceRecord?._externalData
      ?? (row?.returned_data && workflow?.targetTable ? row.returned_data[workflow.targetTable] : null)
      ?? (row?.sourceRecord?.returned_data && workflow?.targetTable ? row.sourceRecord.returned_data[workflow.targetTable] : null)
      ?? null;

    const hasTargetRecordExplicit = isEvaluated && Boolean(
      rawTargetRecord
      || (serverRec && '_target_record' in serverRec)
      || (row?.sourceRecord && ('_target_record' in row.sourceRecord || '_mirrorData' in row.sourceRecord || '_externalData' in row.sourceRecord))
      || (row && ('_target_record' in row || '_mirrorData' in row || '_externalData' in row))
      || (row?.canonical_data && ('_target_record' in row.canonical_data || '_mirrorData' in row.canonical_data))
      || (row?.sourceRecord?.canonical_data && ('_target_record' in row.sourceRecord.canonical_data || '_mirrorData' in row.sourceRecord.canonical_data))
    );
    const targetRecord = isEvaluated ? rawTargetRecord : null;
    const targetDbName = (isServerRecMatch && serverRec?._target_db) || row?.sourceRecord?._target_db || row?._target_db || workflow.targetDbId || 'Target DB';
    const targetTableName = (isServerRecMatch && serverRec?._target_table) || row?.sourceRecord?._target_table || row?._target_table || workflow.targetTable || 'transactions';

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
      // or workflow requires a target table and targetRecord is not present,
      // any EXISTENCE_CHECK step MUST evaluate to FAIL:
      const isMissingInTarget = !targetRecord && (Boolean(workflow.targetTable) || step.checkType === 'EXISTENCE_CHECK');
      if (isMissingInTarget && isEvaluated) {
        stepStatus = 'FAIL';
        actionTaken = step.onFailAction || 'STOP';
        detail = `Record not found in target database (${targetDbName}.${targetTableName})`;
      } else if (res) {
        if (res.resultStatus === 'FAIL' || res.status === 'FAILED' || res.resultStatus === 'FAILED') {
          stepStatus = 'FAIL';
        } else if (res.resultStatus === 'PASS' || res.status === 'PASSED') {
          stepStatus = 'PASS';
        }
      } else if (step.checkType === 'EXISTENCE_CHECK' && targetRecord) {
        stepStatus = 'PASS';
        actionTaken = step.onPassAction || 'CONTINUE';
        detail = 'Record verified present in target database';
      }

      return {
        stepId: step.id,
        stepName: step.name,
        checkType: step.checkType,
        status: stepStatus,
        actionTaken,
        detail: formatValidationDetail(detail || (stepStatus === 'PASS' ? 'Condition satisfied' : stepStatus === 'FAIL' ? 'Condition discrepancy' : 'Pending verification'))
      };
    });

    if (!hasAnyResults) {
      const isMissingInTarget = !targetRecord && (Boolean(workflow.targetTable) || workflow.steps.some(s => s.checkType === 'EXISTENCE_CHECK'));
      if (isMissingInTarget && isEvaluated) {
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
      const rowValStatus = isServerRecMatch
        ? serverRec._validation_status
        : (row?.sourceRecord?._validation_status || row?._validation_status || row?.canonical_data?._validation_status || null);

      if (rowValStatus === 'PASS' && (!workflow.targetTable || targetRecord)) {
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
        const valDetails = (isServerRecMatch && serverRec?._validation_details)
          || row?._validation_details
          || row?.canonical_data?._validation_details
          || row?.sourceRecord?._validation_details
          || row?.sourceRecord?.canonical_data?._validation_details
          || {};

        const cardinalityBreach = Boolean(valDetails.cardinality?.breach || valDetails.cardinality?.status === 'CARDINALITY_BREACH' || valDetails.cardinality?.reason);
        const stageHistory = Array.isArray(valDetails.stageHistory) ? valDetails.stageHistory : [];
        const failedStages = stageHistory.filter((st: any) => st && (st.status === 'FAIL' || st.status === 'ERROR'));
        const tableRuleViolation = valDetails.tableRuleViolation || valDetails.tableRuleDetails;
        const notFoundInTarget = valDetails.existence === 'NOT_FOUND_IN_TARGET_DB' || (!targetRecord && Boolean(workflow.targetTable));

        const mappedSteps = workflow.steps.map((s, idx) => {
          const sBoxType = (s as any).boxType;
          // Check if this step matches a stage in stageHistory
          const matchingStage = stageHistory.find((st: any) =>
            isStepIdMatch(st.stageId, s.id) ||
            (st.stageName && s.name && st.stageName.toLowerCase() === s.name.toLowerCase()) ||
            (st.stageName && workflow.targetTable && st.stageName.toLowerCase() === workflow.targetTable.toLowerCase() && (s.checkType === 'EXISTENCE_CHECK' || sBoxType === 'INGESTION_SEARCH' || idx === 0))
          );

          // Check if step-level result exists in valDetails: e.g. valDetails['step-' + s.id]
          const stepKey = Object.keys(valDetails).find(k => isStepIdMatch(k, s.id) || isStepIdMatch(k.replace(/^step-/, ''), s.id));
          const stepObj = stepKey ? valDetails[stepKey] : null;

          let sStatus: 'PASS' | 'FAIL' | 'PENDING' = 'PASS';
          let sAction = 'CONTINUE';
          let sDetail = 'Condition satisfied';

          if (matchingStage) {
            if (matchingStage.status === 'FAIL' || matchingStage.status === 'ERROR') {
              sStatus = 'FAIL';
              sAction = matchingStage.action || s.onFailAction || 'STOP';
              sDetail = matchingStage.details?.reason || matchingStage.details?.message || formatValidationDetail(matchingStage.details, `${s.name} check failed`);
            } else if (matchingStage.status === 'PASS') {
              sStatus = 'PASS';
              sAction = 'CONTINUE';
              sDetail = 'Condition verified in external stage';
            }
          } else if (stepObj && typeof stepObj === 'object') {
            if (stepObj.passed === false || stepObj.status === 'FAIL') {
              sStatus = 'FAIL';
              sAction = stepObj.action || s.onFailAction || 'STOP';
              sDetail = stepObj.reason || stepObj.message || `${s.name} check failed`;
            } else if (stepObj.passed === true || stepObj.status === 'PASS') {
              sStatus = 'PASS';
              sAction = 'CONTINUE';
              sDetail = 'Condition verified';
            }
          } else if (cardinalityBreach && (s.checkType === 'EXISTENCE_CHECK' || sBoxType === 'INGESTION_SEARCH' || idx === 0 || s.name.toLowerCase().includes('cardinality') || s.name.toLowerCase().includes('search'))) {
            sStatus = 'FAIL';
            sAction = s.onFailAction || 'STOP';
            sDetail = valDetails.cardinality?.reason || `Cardinality breach: found ${valDetails.cardinality?.count || 'multiple'} matching records (Policy: ${valDetails.cardinality?.policy || 'STRICT_SINGLE'})`;
          } else if (tableRuleViolation && (s.checkType === 'DUAL_SOURCE_COMPARISON' || s.checkType === 'FIELD_COMPARATOR' || sBoxType === 'RECONCILIATION' || sBoxType === 'CONDITION_CHECK' || s.name.toLowerCase().includes('duplicate') || s.name.toLowerCase().includes('rule'))) {
            sStatus = 'FAIL';
            sAction = s.onFailAction || 'FLAG';
            sDetail = typeof tableRuleViolation === 'string' ? tableRuleViolation : (tableRuleViolation.message || tableRuleViolation.title || 'Table column rule violation');
          } else if (notFoundInTarget && (s.checkType === 'EXISTENCE_CHECK' || sBoxType === 'INGESTION_SEARCH' || idx === 0)) {
            sStatus = 'FAIL';
            sAction = s.onFailAction || 'STOP';
            sDetail = valDetails.reason || `Record not found in target database (${targetDbName}.${targetTableName})`;
          } else if (failedStages.length > 0 && idx > 0) {
            const hasPriorStop = stageHistory.some((st: any) => st && (st.status === 'FAIL' || st.status === 'ERROR') && st.action === 'STOP');
            if (hasPriorStop) {
              sStatus = 'PENDING';
              sAction = 'STOP';
              sDetail = 'Skipped due to upstream stage termination';
            }
          }

          return {
            stepId: s.id,
            stepName: s.name,
            checkType: s.checkType,
            status: sStatus,
            actionTaken: sAction,
            detail: formatValidationDetail(sDetail)
          };
        });

        // Ensure at least one step is marked FAIL if row is FAIL
        const failingSteps = mappedSteps.filter(s => s.status === 'FAIL');
        if (failingSteps.length === 0 && mappedSteps.length > 0) {
          mappedSteps[0].status = 'FAIL';
          mappedSteps[0].actionTaken = mappedSteps[0].actionTaken || 'STOP';
          mappedSteps[0].detail = formatValidationDetail(valDetails, 'Validation Discrepancy');
        }

        const activeFailing = mappedSteps.find(s => s.status === 'FAIL') || mappedSteps[0];
        const failMsg = activeFailing?.detail || formatValidationDetail(valDetails, 'Validation Discrepancy');

        return {
          status: 'FAIL',
          message: failMsg,
          matchedRuleName: activeFailing?.stepName || workflow.steps[0]?.name || 'Validation Rule',
          severity: 'CRITICAL',
          failedStepCount: Math.max(1, mappedSteps.filter(s => s.status === 'FAIL').length),
          passedStepCount: mappedSteps.filter(s => s.status === 'PASS').length,
          totalStepCount: workflow.steps.length,
          stepDetails: mappedSteps
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

    const rowValStatus = isServerRecMatch
      ? serverRec._validation_status
      : (row?.sourceRecord?._validation_status || row?._validation_status || row?.canonical_data?._validation_status || null);

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
      const firstFailing = stepDetails.find(s => s.status === 'FAIL');
      return {
        status: 'FAIL',
        message: firstFailing?.detail || `${failedStepCount} of ${workflow.steps.length} Checks Failed`,
        matchedRuleName: firstFailing?.stepName || workflow.steps[0]?.name,
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

    const reconStatus = row.sourceRecord?.reconciliation_status 
      || row.canonical_data?.reconciliation_status 
      || row.reconciliation_status;

    const returnedLegs = extractRowLegs(row, workflow);
    const legCount = returnedLegs.length;

    if (outcome.status === 'PENDING') {
      return (
        <span
          onClick={() => { setDrilldownLegIndex(-1); setOutcomeDrilldownRow(row); }}
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
        onClick={() => { setDrilldownLegIndex(-1); setOutcomeDrilldownRow(row); }}
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

        <span className="max-w-[180px] truncate text-[11px] font-bold">
          {typeof outcome.message === 'string' ? outcome.message : formatValidationDetail(outcome.message, 'Validation Discrepancy')}
        </span>

        {/* Level 1 Reconciliation Presence Badge */}
        {reconStatus && (
          <span className={`px-1 py-0.2 rounded text-[8px] font-mono font-bold shrink-0 ${
            reconStatus === 'PASS' ? 'bg-teal-100 text-teal-800 border border-teal-300' : 'bg-rose-100 text-rose-800 border border-rose-300'
          }`} title="Level 1 Mirror Presence Discovery">
            R:{reconStatus}
          </span>
        )}

        {/* Multi-Leg Count Badge */}
        {legCount > 1 && (
          <span className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-300 shrink-0" title={`${legCount} Multi-Leg records discovered in external ledger`}>
            {legCount} Legs
          </span>
        )}

        {/* Level 2 Business Validation Status Badge */}
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

  const renderAttachmentInspector = () => {
    const attachments = selectedIssue?.attachments || [];
    if (attachments.length === 0) {
      return (
        <div className="p-16 text-center space-y-3 bg-white min-h-[500px] flex flex-col items-center justify-center font-sans">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-200 shadow-xs">
            <Paperclip size={26} />
          </div>
          <div className="text-base font-bold text-slate-800">No Attachments for #{selectedIssue?.id}</div>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            This task was created directly or manually without attached spreadsheet or document files.
          </p>
          <button
            type="button"
            onClick={() => setActiveSheetTab('dataset')}
            className="mt-2 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-300 transition cursor-pointer"
          >
            ← Back to Transactions Data Grid
          </button>
        </div>
      );
    }

    const activeAtt = attachments[selectedAttachmentIdx] || attachments[0];
    const tabularRows: Record<string, any>[] = activeAtt.parsedData?.tabularRows || activeAtt.parsedData?.sampleRows || [];
    const tabularHeaders: string[] = activeAtt.parsedData?.tabularHeaders || activeAtt.parsedData?.sampleHeaders || (tabularRows.length > 0 ? Object.keys(tabularRows[0]) : []);
    const textContent: string = activeAtt.parsedData?.textContent || activeAtt.parsedText || '';

    return (
      <div className="bg-slate-50 flex-1 min-h-0 flex flex-col font-sans overflow-hidden">
        {/* Top File Selection Bar & Controls */}
        <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-3 overflow-x-auto shadow-2xs">
          <div className="flex items-center gap-2 overflow-x-auto py-0.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase font-mono tracking-wider mr-1 shrink-0">Attached Files:</span>
            {attachments.map((att: any, idx: number) => {
              const isSelected = selectedAttachmentIdx === idx;
              const isSpreadsheet = att.contentType === 'spreadsheet' || att.filename?.endsWith('.csv') || att.filename?.endsWith('.xlsx') || att.filename?.endsWith('.xls');
              return (
                <button
                  key={att.id || idx}
                  type="button"
                  onClick={() => setSelectedAttachmentIdx(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition cursor-pointer border shrink-0 ${
                    isSelected
                      ? 'bg-blue-50 text-blue-900 border-blue-400 font-bold shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {isSpreadsheet ? (
                    <FileSpreadsheet size={13} className={isSelected ? 'text-emerald-600' : 'text-slate-500'} />
                  ) : (
                    <FileText size={13} className={isSelected ? 'text-blue-600' : 'text-slate-500'} />
                  )}
                  <span className="truncate max-w-[180px]">{att.filename}</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {att.sizeBytes ? `${(att.sizeBytes / 1024).toFixed(1)} KB` : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Action Tools for Currently Inspected File */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handlePromoteAttachment(selectedAttachmentIdx)}
              disabled={isPromotingAttachment}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
              title="Promote records from this attachment into the main investigation grid"
            >
              <Zap size={13} className={isPromotingAttachment ? 'animate-spin' : ''} />
              <span>{isPromotingAttachment ? 'Promoting...' : 'Promote to Investigation Dataset'}</span>
            </button>

            {(activeAtt.rawBase64 || activeAtt.base64) && (
              <button
                type="button"
                onClick={() => handleDownloadAttachment(activeAtt)}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1 border border-slate-300 transition cursor-pointer"
              >
                <Download size={13} />
                <span>Download</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveSheetTab('dataset')}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium border border-slate-300 transition cursor-pointer"
            >
              Close View
            </button>
          </div>
        </div>

        {/* Feedback Alert Banner */}
        {attachmentSuccessMsg && (
          <div className="mx-4 mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2 font-mono">
            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
            <span className="font-semibold">{attachmentSuccessMsg}</span>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {tabularRows.length > 0 ? (
            <div className="space-y-3">
              {/* Table Metrics & Search Filter */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 font-mono text-sm">{activeAtt.filename}</span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-mono text-[11px] font-bold border border-emerald-200">
                    {tabularRows.length} extracted records
                  </span>
                  <span className="text-slate-500 font-mono text-[11px]">
                    ({tabularHeaders.length} columns)
                  </span>
                </div>
                <div className="relative w-72">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search in attachment records..."
                    value={attachmentSearchTerm}
                    onChange={(e) => setAttachmentSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans shadow-2xs"
                  />
                </div>
              </div>

              {/* Data Table */}
              <div className="border border-slate-300 rounded-xl overflow-x-auto bg-white shadow-xs max-h-[460px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#f8f9fa] sticky top-0 z-10 border-b border-slate-300">
                    <tr>
                      <th className="w-12 p-2 text-center text-slate-500 font-mono font-bold text-[11px] border-r border-slate-200 bg-slate-100">#</th>
                      {tabularHeaders.map((h: string) => (
                        <th key={h} className="p-2 font-bold text-slate-700 border-r border-slate-200 whitespace-nowrap text-[11px] select-none font-mono">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {tabularRows
                      .filter((r: any) => {
                        if (!attachmentSearchTerm.trim()) return true;
                        return Object.values(r).some(v => String(v ?? '').toLowerCase().includes(attachmentSearchTerm.toLowerCase()));
                      })
                      .slice(0, 100)
                      .map((r: any, rIdx: number) => (
                        <tr key={rIdx} className="hover:bg-blue-50/20 transition-colors">
                          <td className="p-2 text-center font-mono text-slate-400 text-[11px] border-r border-slate-200 bg-slate-50/50">
                            {rIdx + 1}
                          </td>
                          {tabularHeaders.map((h: string) => (
                            <td key={h} className="p-2 border-r border-slate-200 text-slate-800 whitespace-nowrap font-mono text-[11px]">
                              {String(r[h] ?? '') || <span className="text-slate-300 italic">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {tabularRows.length > 100 && (
                <div className="text-[11px] text-slate-500 text-center font-mono">
                  Displaying first 100 rows in preview. Click "Promote to Investigation Dataset" to load the entire {tabularRows.length}-record set into the active workspace.
                </div>
              )}
            </div>
          ) : textContent ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 font-mono">{activeAtt.filename}</span>
                  <span className="text-[11px] text-slate-500">Text Content Preview</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(textContent);
                    setCopiedAttachmentText(true);
                    setTimeout(() => setCopiedAttachmentText(false), 2000);
                  }}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-mono flex items-center gap-1 transition cursor-pointer"
                >
                  {copiedAttachmentText ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  <span>{copiedAttachmentText ? 'Copied' : 'Copy Text'}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-900 text-emerald-400 font-mono text-xs rounded-xl overflow-auto max-h-[460px] leading-relaxed border border-slate-800 select-text">
                {textContent}
              </pre>
            </div>
          ) : (
            <div className="p-12 text-center space-y-4 max-w-md mx-auto bg-white rounded-2xl border border-slate-200 shadow-xs my-6">
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-200">
                <FileText size={28} />
              </div>
              <div>
                <div className="font-bold text-slate-900 text-base">{activeAtt.filename}</div>
                <p className="text-xs text-slate-500 mt-1 font-mono">
                  {activeAtt.mimeType || 'application/octet-stream'} • {activeAtt.sizeBytes ? `${(activeAtt.sizeBytes / 1024).toFixed(1)} KB` : 'Unknown size'}
                </p>
                <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                  This file is stored in server attachment repository. Click below to promote and ingest its records directly into this task.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handlePromoteAttachment(selectedAttachmentIdx)}
                disabled={isPromotingAttachment}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition flex items-center justify-center gap-2 mx-auto cursor-pointer"
              >
                <Zap size={14} className={isPromotingAttachment ? 'animate-spin' : ''} />
                <span>{isPromotingAttachment ? 'Extracting Records...' : 'Promote & Ingest into Dataset'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

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

          {/* Attached Files Count Pill */}
          {selectedIssue?.attachments && selectedIssue.attachments.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveSheetTab('attachments')}
              className="text-[11px] bg-blue-900/90 hover:bg-blue-800 text-blue-100 px-2 py-0.5 rounded font-mono font-semibold border border-blue-400/30 flex items-center gap-1 cursor-pointer transition shadow-2xs"
              title={`Attached Message Files:\n${selectedIssue.attachments.map((a: any) => `• ${a.filename} (${a.contentType || 'file'})`).join('\n')}\n\nClick to inspect attachment content!`}
            >
              <Paperclip size={11} className="text-blue-300" />
              <span>{selectedIssue.attachments.length} attached</span>
              <span className="text-[10px] text-blue-300 underline font-sans ml-0.5">view</span>
            </button>
          )}

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
          {/* Staged Execution & Process Type Classification Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold font-mono border shadow-2xs ${
              currentProcessType === 'CAUTIOUS_PROCESS'
                ? 'bg-amber-500/20 text-amber-200 border-amber-400/50'
                : currentProcessType === 'READ_ONLY_AUDIT'
                  ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50'
                  : 'bg-blue-500/20 text-blue-200 border-blue-400/50'
            }`}
            title={
              currentProcessType === 'CAUTIOUS_PROCESS'
                ? 'Cautious Process: High-impact external database synchronization. Pre-change snapshot and Maker-Checker review required.'
                : currentProcessType === 'READ_ONLY_AUDIT'
                  ? 'Read-Only Audit: Diagnostic checks only, zero data modification.'
                  : 'Internal Staged Fix: Modifications apply strictly to internal working tables (external production DB shielded).'
            }
          >
            <ShieldAlert size={11} className={currentProcessType === 'CAUTIOUS_PROCESS' ? 'text-amber-300' : 'text-blue-300'} />
            <span>
              {currentProcessType === 'CAUTIOUS_PROCESS'
                ? 'CAUTIOUS (MAKER-CHECKER)'
                : currentProcessType === 'READ_ONLY_AUDIT'
                  ? 'READ-ONLY AUDIT'
                  : 'INTERNAL STAGING (PROTECTED)'}
            </span>
          </div>

          {/* Test Accuracy Button & Metric Pill */}
          <button
            type="button"
            onClick={handleTestAccuracy}
            disabled={isTestingAccuracy || !activeWorkflow}
            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-emerald-100 border border-emerald-400/30 rounded text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
            title="Evaluate validation box accuracy against extracted dataset rows in memory"
          >
            <ShieldCheck size={12} className={isTestingAccuracy ? 'animate-spin text-emerald-300' : 'text-emerald-300'} />
            <span>{isTestingAccuracy ? 'Testing...' : 'Test Accuracy'}</span>
            {accuracyMetrics && (
              <span className="ml-1 bg-emerald-700/90 text-white px-1.5 py-0.2 rounded font-mono text-[9px]">
                {accuracyMetrics.accuracyPercent}%
              </span>
            )}
          </button>

          {/* Workflow In-Flight Evolution Controls */}
          <div className="flex items-center bg-white/10 border border-white/20 rounded overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAddBoxModal(true)}
              className="px-2 py-1 text-emerald-100 hover:bg-white/15 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
              title="Add an in-flight validation box to the active investigation pipeline"
            >
              <Plus size={11} className="text-emerald-300" />
              <span>+ Box</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSwapWorkflowModal(true)}
              className="px-2 py-1 border-l border-white/15 text-emerald-100 hover:bg-white/15 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
              title="Swap to an alternative validation workflow definition"
            >
              <GitBranch size={11} className="text-emerald-300" />
              <span>Swap WF</span>
            </button>
            {(selectedIssue.linkedHashtag || (selectedIssue as any).hashtag) && (
              <button
                type="button"
                onClick={handleResetToHashtagDefault}
                className="px-2 py-1 border-l border-white/15 text-emerald-100 hover:bg-white/15 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                title="Reset workflow to hashtag preset default"
              >
                <RotateCcw size={10} className="text-amber-300" />
              </button>
            )}
          </div>

          {/* Universal Hashtag Directive Badge & Dry-Run Scan Trigger (GAP-10) */}
          {(selectedIssue.linkedHashtag || (selectedIssue as any).hashtag) && (() => {
            const tag = selectedIssue.linkedHashtag || (selectedIssue as any).hashtag;
            const preset = hashtags.find(h => h.tag.toUpperCase() === tag.toUpperCase());
            return (
              <div className="flex items-center gap-1.5 ml-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 text-[11px] font-mono font-bold">
                  <Tag size={11} className="text-indigo-300" />
                  <span>{tag}</span>
                  {preset?.hashtagType && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                      {preset.hashtagType === 'DATABASE_DIRECT_SCANNER' ? 'DB-SCAN' : preset.hashtagType === 'EXTRACTION_STAGING' ? 'STAGING' : preset.hashtagType === 'AUDITING_GOVERNANCE' ? 'AUDIT' : 'INGEST'}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleRunHashtagDryRun}
                  disabled={isDryRunningHashtag}
                  className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 rounded text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                  title="Execute dry-run hashtag rules & external database scan with side-by-side diff"
                >
                  <Play size={10} className={isDryRunningHashtag ? 'animate-spin' : 'text-amber-300'} />
                  <span>{isDryRunningHashtag ? 'Checking DB...' : 'Test DB Checks (Dry-Run)'}</span>
                </button>
              </div>
            );
          })()}

          {/* Revert Staged Fixes & History */}
          <div className="flex items-center bg-rose-950/60 border border-rose-500/40 rounded overflow-hidden">
            <button
              type="button"
              onClick={handleRevertEntireTask}
              disabled={isRevertingTask}
              className="px-2.5 py-1 text-rose-200 hover:bg-rose-900/50 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
              title="Revert all staged changes on this task dataset back to pre-change snapshot"
            >
              <RotateCcw size={11} className={isRevertingTask ? 'animate-spin' : ''} />
              <span>{isRevertingTask ? 'Reverting...' : 'Revert Task'}</span>
            </button>
            <button
              type="button"
              onClick={handleViewReversionHistory}
              className="px-1.5 py-1 border-l border-rose-500/30 text-rose-300 hover:bg-rose-900/50 text-[11px] cursor-pointer"
              title="View task reversion snapshot history"
            >
              <History size={11} />
            </button>
          </div>

          {/* Collaborative Chat & Script Consensus Drawer Button */}
          <button
            type="button"
            onClick={() => setShowChatDrawer(true)}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs border border-indigo-400/40"
            title="Open Collaborative Discussion: tag operators, attach investigation summary, and accept solution scripts"
          >
            <MessageSquare size={12} />
            <span>Discussion</span>
            {(selectedIssue.chat || []).length > 0 && (
              <span className="bg-white/20 text-white px-1.5 py-0.2 rounded-full text-[9px] font-mono">
                {(selectedIssue.chat || []).length}
              </span>
            )}
          </button>

          {/* Workflow Execution Lookup Status */}
          {currentWorkflowExecution && (
            <div className="flex items-center gap-1.5 bg-emerald-900/90 text-emerald-100 border border-emerald-500/40 px-2.5 py-1 rounded text-[10px] font-mono shadow-xs">
              <CheckCircle2 size={12} className="text-emerald-300" />
              <span>Evaluated on Task:</span>
              <span className="font-bold text-emerald-200">
                {currentWorkflowExecution.passedCount ?? currentWorkflowExecution.passed_count ?? 0} PASS / {currentWorkflowExecution.failedCount ?? currentWorkflowExecution.failed_count ?? 0} FAIL
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
      <div className={`px-4 py-1.5 text-xs flex items-center justify-between border-b ${
        activeSheetTab === 'attachments'
          ? 'bg-amber-50/70 border-amber-200 text-amber-900'
          : activeSheetTab === 'sheet1_central'
          ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900'
          : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
        }`}>
        <div className="flex items-center gap-2">
          {activeSheetTab === 'attachments' ? (
            <>
              <Paperclip size={14} className="text-amber-600 shrink-0" />
              <span className="font-semibold">Attached Source Files & Spreadsheets</span>
              <span className="text-slate-600 text-[11px]">— Raw file content and tabular previews attached to this case.</span>
            </>
          ) : activeSheetTab === 'sheet1_central' ? (
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
      {activeSheetTab === 'attachments' ? (
        renderAttachmentInspector()
      ) : (
        <div className="overflow-x-auto flex-1 min-h-0 relative">
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
                          {selectedIssue?.attachments && selectedIssue.attachments.length > 0
                            ? `This task has ${selectedIssue.attachments.length} attached file(s) that can be inspected and promoted into the investigation dataset.`
                            : 'This task does not contain any uploaded transaction records yet. Upload a batch reconciliation file or ingest records into this task to view and run validation.'}
                        </p>
                      </div>
                      <div className="flex items-center justify-center gap-2 pt-1">
                        {selectedIssue?.attachments && selectedIssue.attachments.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setActiveSheetTab('attachments')}
                            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                          >
                            <Paperclip size={13} />
                            <span>View Attached Files ({selectedIssue.attachments.length})</span>
                          </button>
                        )}
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

                const rowLegs = extractRowLegs(row, activeWorkflow);
                const isRowExpanded = expandedRowIds.has(row.rowId || String(rowIdx));
                const totalTableColumns = visibleDatasetColumns.length + (activeWorkflow && !hiddenColumns.has('workflow_outcome') ? 1 : 0) + visibleReportColumns.length + 3;

                return (
                  <React.Fragment key={row.rowId || rowIdx}>
                  <tr
                    key={row.rowId}
                    className={`transition-colors ${isSelectedRow ? 'bg-emerald-50/30' : 'hover:bg-blue-50/20'
                      }`}
                  >
                    {/* Row Index with Multi-Leg Expand Button */}
                    <td className="p-1.5 text-center font-mono text-[11px] text-slate-500 bg-[#f8f9fa] border-r border-b border-slate-300 select-none font-semibold">
                      <div className="flex items-center justify-center gap-1">
                        <span>{rowIdx + 1}</span>
                        {rowLegs.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRowExpanded(row.rowId || String(rowIdx));
                            }}
                            className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-mono font-bold transition cursor-pointer select-none ${
                              isRowExpanded
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                            }`}
                            title={isRowExpanded ? "Collapse multi-leg external coordinates" : `Expand ${rowLegs.length} external ledger legs`}
                          >
                            {isRowExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                            <span>{rowLegs.length}L</span>
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Data Cells */}
                    {visibleDatasetColumns.map((col) => {
                      const src = row.sourceRecord || row.canonical_data || row || {};
                      const rawVal = src[col.key];
                      const val = typeof rawVal === 'object' && rawVal !== null ? JSON.stringify(rawVal) : String(rawVal ?? '');
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
                              title={`Cross-task collision detected in Central Repository. Present in: ${Array.isArray(row.sourceRecord?._allTaskIds) ? row.sourceRecord._allTaskIds.join(', ') : (row.sourceRecord?._duplicateFromTaskId || 'Multiple tasks')}`}
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
                                `Status: ${String(row.investigationStatus || 'PENDING')}`,
                                row.executionSummary?.statusFlagText ? `Note: ${row.executionSummary.statusFlagText}` : null,
                                (row.sourceRecord?._isDuplicate || row.sourceRecord?.isDuplicate) ? `Duplicate from Task #${row.sourceRecord?._duplicateFromTaskId || row.sourceRecord?._originalTaskId || 'Prior'}` : null,
                                row.sourceRecord?._batchId ? `Batch: ${row.sourceRecord._batchId}` : null
                              ].filter(Boolean).join(' | ')
                            }
                          >
                            {typeof row.investigationStatus === 'string' ? row.investigationStatus : String(row.investigationStatus || 'PENDING')}
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
                      const reportVal = row.sourceRecord?.[`_report_${rc.key}`]
                        ?? row.executionSummary?.intermediateReports?.[rc.key]
                        ?? (rc.sourceField && row.sourceRecord ? row.sourceRecord[rc.sourceField] : null)
                        ?? '';
                      return (
                        <td
                          key={`report_${rc.key}`}
                          className="py-1.5 px-2.5 border-r border-b border-slate-300 whitespace-nowrap text-xs bg-purple-50/20 font-mono text-purple-950 font-medium"
                        >
                          {reportVal ? (
                            <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-900 px-1.5 py-0.5 rounded border border-purple-200 text-[11px]">
                              {typeof reportVal === 'object' ? formatValidationDetail(reportVal) : String(reportVal)}
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
                            onClick={() => {
                              setInspectLegIndex(-1);
                              setInspectingRow(row);
                            }}
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
                            onClick={() => {
                              setInspectLegIndex(-1);
                              setInspectingRow(row);
                            }}
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
                          <button
                            type="button"
                            onClick={() => handleRevertSingleRecord(row.sourceRecord?.transaction_id || row.sourceRecord?.refnum || row.rowId)}
                            disabled={revertingRowId === (row.sourceRecord?.transaction_id || row.sourceRecord?.refnum || row.rowId)}
                            className="px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200"
                            title="Restore this individual record to its pre-change snapshot state"
                          >
                            {revertingRowId === (row.sourceRecord?.transaction_id || row.sourceRecord?.refnum || row.rowId) ? '...' : 'Revert'}
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

                  {/* Multi-Leg Expandable Accordion Subtable */}
                  {isRowExpanded && rowLegs.length > 0 && (
                    <tr key={`expanded-${row.rowId || rowIdx}`} className="bg-slate-50/95 border-b-2 border-indigo-300 animate-in fade-in-50">
                      <td colSpan={totalTableColumns} className="p-3 pl-10 bg-gradient-to-r from-indigo-50/50 via-purple-50/20 to-slate-50/60 font-sans">
                        <div className="border border-indigo-200/90 rounded-xl bg-white shadow-xs overflow-hidden space-y-2.5 p-3.5">
                          {/* Header Bar */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
                                <Layers size={15} />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-xs text-slate-900">
                                    External Ledger Multi-Leg Breakdown
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                    {rowLegs.length} Legs Detected
                                  </span>
                                  <span className="text-[11px] font-mono text-slate-500">
                                    Target Table: <strong className="text-slate-800">{activeWorkflow?.targetTable || 'tran_log_tab'}</strong>
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                  Full mirror coordinates aggregated via PostgreSQL JSONB. Reversal records (<code className="text-purple-700 font-bold font-mono">RVS</code>) and active settlement legs are tracked independently.
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {(() => {
                                const getLegFieldVal = (leg: any, f: string) => {
                                  const obj = leg?.payload || leg || {};
                                  if (obj[f] !== undefined && obj[f] !== null) return obj[f];
                                  const lf = f.toLowerCase();
                                  for (const k of Object.keys(obj)) {
                                    if (k.toLowerCase() === lf) return obj[k];
                                  }
                                  return null;
                                };
                                const reversalLegs = rowLegs.filter(l => String(getLegFieldVal(l, 'PROC_NAME') || '').toUpperCase() === 'RVS');
                                const settlementLegs = rowLegs.filter(l => String(getLegFieldVal(l, 'PROC_NAME') || '').toUpperCase() !== 'RVS');
                                const isDupBreach = settlementLegs.length > 1;

                                return (
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                      {settlementLegs.length} Settlement &bull; {reversalLegs.length} Reversals (RVS)
                                    </span>
                                    {isDupBreach ? (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                                        <AlertTriangle size={10} /> Duplicate Violation ({settlementLegs.length} &gt; 1)
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                        <CheckCircle2 size={10} /> Unique Leg Verified
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Sub-table */}
                          <div className="overflow-x-auto rounded-lg border border-slate-200">
                            <table className="w-full text-left text-xs font-mono">
                              <thead>
                                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[10px] uppercase font-bold tracking-wider">
                                  <th className="py-2 px-3 w-14 text-center">Leg #</th>
                                  <th className="py-2 px-3">BO_TYPE</th>
                                  <th className="py-2 px-3">PROC_NAME</th>
                                  <th className="py-2 px-3">Amount</th>
                                  <th className="py-2 px-3">TR_GROUP_ID</th>
                                  <th className="py-2 px-3">FE_UTRNNO</th>
                                  <th className="py-2 px-3">Value Date</th>
                                  <th className="py-2 px-3">Institutions</th>
                                  <th className="py-2 px-3">Accounts</th>
                                  <th className="py-2 px-3 text-center">Cross-Check</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-[11px]">
                                {rowLegs.map((leg, lIdx) => {
                                  const legObj = leg?.payload || leg || {};
                                  const getF = (f: string) => {
                                    if (legObj[f] !== undefined && legObj[f] !== null) return legObj[f];
                                    const lf = f.toLowerCase();
                                    for (const k of Object.keys(legObj)) {
                                      if (k.toLowerCase() === lf) return legObj[k];
                                    }
                                    return null;
                                  };

                                  const boType = getF('BO_TYPE') || '-';
                                  const procName = getF('PROC_NAME') || '-';
                                  const isRvs = String(procName).toUpperCase() === 'RVS';
                                  const amnt = getF('AMNT1') || getF('amount') || '-';
                                  const trGroupId = getF('TR_GROUP_ID') || '-';
                                  const feUtrnno = getF('FE_UTRNNO') || getF('utrnno') || '-';
                                  const valDate = getF('VALUE_DATE') || getF('value_date') || '-';
                                  const inst1 = getF('INSTITUTION1') || '-';
                                  const inst2 = getF('INSTITUTION2') || '-';
                                  const acct1 = getF('ACCT_NUM1') || '-';
                                  const acct2 = getF('ACCT_NUM2') || '-';

                                  return (
                                    <tr key={`subleg-${lIdx}`} className={`hover:bg-slate-50/80 transition ${isRvs ? 'bg-amber-50/20' : ''}`}>
                                      <td className="py-2 px-3 text-center font-bold text-slate-500">
                                        Leg #{lIdx + 1}
                                      </td>
                                      <td className="py-2 px-3 font-semibold text-slate-800">
                                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[10px]">
                                          {String(boType)}
                                        </span>
                                      </td>
                                      <td className="py-2 px-3 font-semibold">
                                        {isRvs ? (
                                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                                            RVS (Reversal)
                                          </span>
                                        ) : (
                                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-bold">
                                            {procName === '-' ? 'PRIMARY' : String(procName)}
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2 px-3 font-bold text-emerald-800">
                                        {String(amnt)}
                                      </td>
                                      <td className="py-2 px-3 font-semibold text-indigo-900">
                                        {String(trGroupId)}
                                      </td>
                                      <td className="py-2 px-3 text-slate-600 truncate max-w-[140px]" title={String(feUtrnno)}>
                                        {String(feUtrnno)}
                                      </td>
                                      <td className="py-2 px-3 text-slate-500 text-[10px]">
                                        {String(valDate).slice(0, 19).replace('T', ' ')}
                                      </td>
                                      <td className="py-2 px-3 text-slate-600 text-[10px] truncate max-w-[140px]" title={`${inst1} ➔ ${inst2}`}>
                                        {inst1} ➔ {inst2}
                                      </td>
                                      <td className="py-2 px-3 text-slate-500 text-[10px] truncate max-w-[140px]" title={`${acct1} ➔ ${acct2}`}>
                                        {acct1} / {acct2}
                                      </td>
                                      <td className="py-2 px-3 text-center">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setDrilldownLegIndex(lIdx);
                                            setOutcomeDrilldownRow(row);
                                          }}
                                          className="px-2 py-0.5 rounded text-[10px] font-bold font-sans bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition cursor-pointer"
                                          title="Inspect this specific leg in manual cross-check modal"
                                        >
                                          Inspect
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      )}

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

          {/* Tab 5: Attached Source Files */}
          {selectedIssue?.attachments && selectedIssue.attachments.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveSheetTab('attachments')}
              className={`px-3 py-1.5 text-xs font-sans rounded-t font-semibold flex items-center gap-1.5 border-t-2 transition cursor-pointer ${activeSheetTab === 'attachments'
                  ? 'bg-white text-amber-900 border-amber-600 shadow-2xs'
                  : 'text-slate-600 border-transparent hover:bg-slate-200'
                }`}
            >
              <Paperclip size={13} className="text-amber-600" />
              <span>Attachments ({selectedIssue.attachments.length})</span>
            </button>
          )}
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
      {outcomeDrilldownRow && activeWorkflow && (
        <ErrorBoundary fallbackTitle="Outcome Drilldown Error" fallbackMessage="Could not render outcome drilldown record view.">
          {(() => {
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

        const isServerRecMatch = Boolean(
          serverRec && (!serverRec._validation_workflow_id || serverRec._validation_workflow_id === activeWorkflow.id)
        );
        const isRowWfMatch = Boolean(
          outcomeDrilldownRow._validation_workflow_id === activeWorkflow.id ||
          outcomeDrilldownRow.sourceRecord?._validation_workflow_id === activeWorkflow.id ||
          outcomeDrilldownRow.canonical_data?._validation_workflow_id === activeWorkflow.id
        );

        const targetDbName = (isServerRecMatch && serverRec?._target_db) || outcomeDrilldownRow._target_db || outcomeDrilldownRow.sourceRecord?._target_db || activeWorkflow.targetDbId || 'Target Database';
        const targetTableName = (isServerRecMatch && serverRec?._target_table) || outcomeDrilldownRow._target_table || outcomeDrilldownRow.sourceRecord?._target_table || activeWorkflow.targetTable || 'transactions';

        // Extract multi-leg array from returned_data in task_dataset_transactions
        const modalReturnedData = outcomeDrilldownRow.returned_data
          || outcomeDrilldownRow.canonical_data?.returned_data
          || outcomeDrilldownRow.sourceRecord?.returned_data
          || outcomeDrilldownRow.sourceRecord?.canonical_data?.returned_data
          || {};
        const modalWfData = modalReturnedData[activeWorkflow.id] || modalReturnedData;
        const modalRawLegs = modalWfData[targetTableName] || modalWfData[activeWorkflow.targetTable || ''] || modalReturnedData[targetTableName] || modalReturnedData[activeWorkflow.targetTable || ''];
        const fallbackLegs: any[] = Array.isArray(modalRawLegs) ? modalRawLegs : (modalRawLegs ? [modalRawLegs] : []);
        const extractedLegs = extractRowLegs(outcomeDrilldownRow, activeWorkflow);
        const returnedLegs: any[] = extractedLegs.length > 0 ? extractedLegs : fallbackLegs;

        const isNotFoundInDb = Boolean(
          outcomeDrilldownRow._validation_details?.existence === 'NOT_FOUND_IN_TARGET_DB' ||
          outcomeDrilldownRow.canonical_data?._validation_details?.existence === 'NOT_FOUND_IN_TARGET_DB' ||
          outcomeDrilldownRow.sourceRecord?._validation_details?.existence === 'NOT_FOUND_IN_TARGET_DB' ||
          (isServerRecMatch && serverRec?._validation_details?.existence === 'NOT_FOUND_IN_TARGET_DB') ||
          (returnedLegs.length === 0 && (outcomeDrilldownRow.reconciliation_status === 'FAIL' || outcomeDrilldownRow.canonical_data?.reconciliation_status === 'FAIL'))
        );

        // Selected Leg Candidate (respects drilldownLegIndex when an individual leg is picked)
        const selectedLegCandidate = (drilldownLegIndex >= 0 && returnedLegs[drilldownLegIndex])
          ? (returnedLegs[drilldownLegIndex]?.payload || returnedLegs[drilldownLegIndex])
          : null;

        const rawTargetCandidate = selectedLegCandidate
          ?? ((isServerRecMatch && serverRec?._target_record)
            ?? serverRec?._target_record
            ?? outcomeDrilldownRow._target_record
            ?? outcomeDrilldownRow.sourceRecord?._target_record
            ?? outcomeDrilldownRow.canonical_data?._target_record
            ?? outcomeDrilldownRow.sourceRecord?.canonical_data?._target_record
            ?? outcomeDrilldownRow._mirrorData
            ?? outcomeDrilldownRow.sourceRecord?._mirrorData
            ?? outcomeDrilldownRow._externalData
            ?? outcomeDrilldownRow.sourceRecord?._externalData
            ?? (returnedLegs.length > 0 ? (returnedLegs[0]?.payload || returnedLegs[0]) : null));

        const targetRecord = (isNotFoundInDb || !rawTargetCandidate || (typeof rawTargetCandidate === 'object' && Object.keys(rawTargetCandidate).length === 0))
          ? null
          : rawTargetCandidate;

        // Format user-configured query parameters for readable display
        const queryParamPairs = activeModalParams
          .map(p => ({ param: p, val: inputRecord[p] }))
          .filter(item => item.val !== undefined && item.val !== null && String(item.val).trim() !== '');

        const displayKeyString = queryParamPairs.length > 0
          ? queryParamPairs.map(qp => `${qp.param}: ${qp.val}`).join(' | ')
          : (outcomeDrilldownRow.rowId || 'Record');

        // Discover DB column configurations attached to this workflow or its target table
        const rowValDetails = (isServerRecMatch && serverRec?._validation_details)
          || outcomeDrilldownRow._validation_details
          || outcomeDrilldownRow.sourceRecord?._validation_details
          || outcomeDrilldownRow.canonical_data?._validation_details
          || {};

        const activeDbConfigs: DatabaseColumnConfiguration[] = [];
        const seenDbConfigIds = new Set<string>();

        // 1. Attached to active workflow
        if (Array.isArray(activeWorkflow.attachedDbConfigIds)) {
          activeWorkflow.attachedDbConfigIds.forEach(id => {
            const found = availableColumnConfigs.find(c => c.id === id);
            if (found && !seenDbConfigIds.has(found.id)) {
              seenDbConfigIds.add(found.id);
              activeDbConfigs.push(found);
            }
          });
        }

        // 2. Attached to steps
        if (Array.isArray(activeWorkflow.steps)) {
          activeWorkflow.steps.forEach(s => {
            if (Array.isArray(s.columnConfigurations)) {
              s.columnConfigurations.forEach(c => {
                if (c && !seenDbConfigIds.has(c.id)) {
                  seenDbConfigIds.add(c.id);
                  activeDbConfigs.push(c);
                }
              });
            }
            if (Array.isArray(s.attachedDbConfigIds)) {
              s.attachedDbConfigIds.forEach(id => {
                const found = availableColumnConfigs.find(c => c.id === id);
                if (found && !seenDbConfigIds.has(found.id)) {
                  seenDbConfigIds.add(found.id);
                  activeDbConfigs.push(found);
                }
              });
            }
          });
        }

        // 3. Matched by target table from availableColumnConfigs
        if (targetTableName) {
          const tblLower = targetTableName.toLowerCase();
          availableColumnConfigs.forEach(c => {
            if (c.tableName && c.tableName.toLowerCase() === tblLower && !seenDbConfigIds.has(c.id)) {
              if (!activeWorkflow.targetDbId || c.dbId === activeWorkflow.targetDbId) {
                seenDbConfigIds.add(c.id);
                activeDbConfigs.push(c);
              }
            }
          });
        }

        // 4. Synthesized DB Config if tableRuleDetails or tableRuleViolation is present from server
        const tableRuleInfo = rowValDetails.tableRuleDetails || rowValDetails.tableRuleViolation;
        if (tableRuleInfo && typeof tableRuleInfo === 'object' && tableRuleInfo.rule) {
          const synthId = `server-rule-${tableRuleInfo.rule}`;
          if (!seenDbConfigIds.has(synthId) && !activeDbConfigs.some(c => c.name === tableRuleInfo.rule)) {
            seenDbConfigIds.add(synthId);
            activeDbConfigs.push({
              id: synthId,
              name: tableRuleInfo.rule,
              dbId: targetDbName,
              tableName: targetTableName,
              ruleType: (tableRuleInfo.ruleType as any) || 'DUPLICATE_CHECK',
              description: tableRuleInfo.message || 'Evaluated Table Validation Rule',
              columns: tableRuleInfo.identifierColumn ? [{ columnName: tableRuleInfo.identifierColumn, priority: 1 }] : [],
              violationAction: (tableRuleInfo.action as any) || 'FLAG',
              severity: 'CRITICAL',
              isActive: true,
              filterConditions: tableRuleInfo.filterConditions || [],
              aggregationRules: tableRuleInfo.threshold ? [{ function: 'COUNT', operator: '<=', value: tableRuleInfo.threshold }] : []
            });
          }
        }

        // Evaluate each DB configuration against the transaction
        const evaluatedDbConfigs = activeDbConfigs.map(cfg => {
          const tableViolation = rowValDetails.tableRuleViolation || rowValDetails.tableRuleDetails;
          const isServerViolation = Boolean(
            tableViolation && (
              (typeof tableViolation === 'string' && tableViolation.includes(cfg.name)) ||
              (typeof tableViolation === 'object' && (tableViolation.rule === cfg.name || tableViolation.ruleType === cfg.ruleType || tableViolation.stepId === cfg.id))
            )
          );

          if (isServerViolation) {
            const violationMsg = typeof tableViolation === 'string'
              ? tableViolation
              : (tableViolation.message || cfg.violationMessage || `Rule violation detected on table ${cfg.tableName}`);
            return {
              config: cfg,
              status: 'FAIL' as const,
              action: cfg.violationAction || 'FLAG',
              verdictMessage: violationMsg,
              evaluatedDetails: typeof tableViolation === 'object' ? tableViolation : { message: violationMsg },
              evaluatedLegs: (typeof tableViolation === 'object' && Array.isArray(tableViolation.matchingLegs)) ? tableViolation.matchingLegs : returnedLegs
            };
          }

          if (cfg.ruleType === 'DUPLICATE_CHECK' || cfg.ruleType === 'UNIQUE_CONSTRAINT') {
            let filtered = returnedLegs;
            if (Array.isArray(cfg.filterConditions) && cfg.filterConditions.length > 0) {
              filtered = returnedLegs.filter(leg => {
                const legObj = leg?.payload || leg || {};
                return cfg.filterConditions!.every(fc => {
                  const rawVal = getCaseInsensitiveVal(legObj, fc.columnName);
                  const sVal = rawVal !== undefined && rawVal !== null ? String(rawVal).trim().toLowerCase() : '';
                  const condVal = String(fc.value ?? '').trim().toLowerCase();
                  switch (fc.operator) {
                    case '=': return sVal === condVal;
                    case '!=': return sVal !== condVal;
                    case 'LIKE': return sVal.includes(condVal);
                    case 'STARTS_WITH': return sVal.startsWith(condVal);
                    case '>': return Number(sVal) > Number(condVal);
                    case '>=': return Number(sVal) >= Number(condVal);
                    case '<': return Number(sVal) < Number(condVal);
                    case '<=': return Number(sVal) <= Number(condVal);
                    case 'IN': return condVal.split(',').map(s => s.trim()).includes(sVal);
                    case 'NOT_IN': return !condVal.split(',').map(s => s.trim()).includes(sVal);
                    default: return sVal === condVal;
                  }
                });
              });
            }

            const op = String(cfg.aggregationRules?.[0]?.operator || '>').trim();
            const threshold = Number(cfg.aggregationRules?.[0]?.value ?? 1);
            const count = filtered.length;

            let isViolation = false;
            if (count <= 1) {
              if ((op === '=' || op === '==') && threshold === 1) isViolation = false;
              else if (op === '>' || op === '>=') isViolation = false;
              else if (count === 0 && (op === '=' || op === '==') && threshold > 0) isViolation = false;
            } else {
              if (op === '=' || op === '==') isViolation = (count !== threshold);
              else if (op === '>') isViolation = (count > threshold);
              else if (op === '>=') isViolation = (count >= threshold);
              else isViolation = (count > 1);
            }

            if (isViolation) {
              return {
                config: cfg,
                status: 'FAIL' as const,
                action: cfg.violationAction || 'FLAG',
                verdictMessage: cfg.violationMessage || `Duplicate check breach: detected ${count} matching legs exceeding threshold ${threshold} for table ${cfg.tableName}.`,
                evaluatedDetails: {
                  filterConditions: cfg.filterConditions,
                  evaluatedCount: count,
                  threshold,
                  totalLegsCount: returnedLegs.length
                },
                evaluatedLegs: filtered
              };
            } else {
              return {
                config: cfg,
                status: (returnedLegs.length > 0 ? 'PASS' : 'PENDING') as 'PASS' | 'PENDING',
                action: 'CONTINUE' as const,
                verdictMessage: returnedLegs.length > 0
                  ? `Condition satisfied: ${count} matching leg(s) evaluated within threshold (${threshold})`
                  : 'Pending evaluation against target records',
                evaluatedDetails: {
                  filterConditions: cfg.filterConditions,
                  evaluatedCount: count,
                  threshold
                },
                evaluatedLegs: filtered
              };
            }
          }

          if (cfg.ruleType === 'COMPLETENESS_CHECK') {
            const missing: string[] = [];
            const checkTarget = returnedLegs[0] || inputRecord;
            const obj = checkTarget?.payload || checkTarget || {};
            for (const col of (cfg.columns || [])) {
              const v = getCaseInsensitiveVal(obj, col.columnName);
              if (v === undefined || v === null || String(v).trim() === '') {
                missing.push(col.columnName);
              }
            }
            if (missing.length > 0 && returnedLegs.length > 0) {
              return {
                config: cfg,
                status: 'FAIL' as const,
                action: cfg.violationAction || 'FLAG',
                verdictMessage: cfg.violationMessage || `Completeness check breach: missing required column(s) [${missing.join(', ')}]`,
                evaluatedDetails: { missingColumns: missing, requiredColumns: cfg.columns?.map(c => c.columnName) },
                evaluatedLegs: returnedLegs
              };
            }
            return {
              config: cfg,
              status: (returnedLegs.length > 0 ? 'PASS' : 'PENDING') as 'PASS' | 'PENDING',
              action: 'CONTINUE' as const,
              verdictMessage: returnedLegs.length > 0 ? 'All mandatory columns populated' : 'Pending evaluation',
              evaluatedDetails: { requiredColumns: cfg.columns?.map(c => c.columnName) },
              evaluatedLegs: returnedLegs
            };
          }

          const fallbackStatus = evalOutcome.status === 'FAIL' ? 'FAIL' : (returnedLegs.length > 0 ? 'PASS' : 'PENDING');
          return {
            config: cfg,
            status: fallbackStatus as 'PASS' | 'FAIL' | 'PENDING',
            action: fallbackStatus === 'FAIL' ? (cfg.violationAction || 'FLAG') : 'CONTINUE',
            verdictMessage: cfg.description || `Rule evaluated on table ${cfg.tableName}`,
            evaluatedDetails: { ruleType: cfg.ruleType, tableName: cfg.tableName },
            evaluatedLegs: returnedLegs
          };
        });

        // Grouped legs classification
        const getLegFieldVal = (leg: any, f: string) => {
          const obj = leg?.payload || leg || {};
          if (obj[f] !== undefined && obj[f] !== null) return obj[f];
          const lf = f.toLowerCase();
          for (const k of Object.keys(obj)) {
            if (k.toLowerCase() === lf) return obj[k];
          }
          return null;
        };

        const reversalLegs = returnedLegs.filter(l => String(getLegFieldVal(l, 'PROC_NAME') || '').toUpperCase() === 'RVS');
        const settlementLegs = returnedLegs.filter(l => String(getLegFieldVal(l, 'PROC_NAME') || '').toUpperCase() !== 'RVS');
        const isDupLegBreach = settlementLegs.length > 1;

        // Extract multi-leg response envelope data & metrics
        let activeStageEnvelope: any = null;
        if (modalReturnedData?.stages && typeof modalReturnedData.stages === 'object') {
          const targetTbl = activeWorkflow?.targetTable?.toLowerCase();
          for (const [stgKey, stgVal] of Object.entries(modalReturnedData.stages)) {
            if (stgVal && typeof stgVal === 'object') {
              const stgTbl = String((stgVal as any).targetTable || stgKey).toLowerCase();
              if (targetTbl && stgTbl === targetTbl) {
                activeStageEnvelope = stgVal;
                break;
              }
            }
          }
          if (!activeStageEnvelope) {
            activeStageEnvelope = Object.values(modalReturnedData.stages)[0] || null;
          }
        }

        const auditMetadata = modalReturnedData?.audit || null;
        const aggregatedMetrics = activeStageEnvelope?.aggregatedMetrics || null;
        const hasReversal = reversalLegs.length > 0 || Boolean(aggregatedMetrics?.hasReversal);

        let computedTotalAmount = 0;
        let computedFeeAmount = 0;
        let currencyFound: string | null = aggregatedMetrics?.currency || null;

        returnedLegs.forEach((l: any) => {
          const obj = l?.payload || l || {};
          const amtVal = getCaseInsensitiveVal(obj, 'reqamt') ?? getCaseInsensitiveVal(obj, 'amount');
          const feeVal = getCaseInsensitiveVal(obj, 'client_billingfee') ?? getCaseInsensitiveVal(obj, 'transfeeamt1') ?? getCaseInsensitiveVal(obj, 'fee');
          const currVal = getCaseInsensitiveVal(obj, 'currency') ?? getCaseInsensitiveVal(obj, 'curr');
          if (currVal && !currencyFound) currencyFound = String(currVal);
          if (amtVal !== undefined && amtVal !== null && !isNaN(Number(amtVal))) {
            computedTotalAmount += Number(amtVal);
          }
          if (feeVal !== undefined && feeVal !== null && !isNaN(Number(feeVal))) {
            computedFeeAmount += Number(feeVal);
          }
        });

        const displayNetAmt = aggregatedMetrics?.netAmount ?? (computedTotalAmount - computedFeeAmount);
        const displayTotalAmt = aggregatedMetrics?.totalAmount ?? computedTotalAmount;
        const displayFeeAmt = aggregatedMetrics?.feeAmount ?? computedFeeAmount;

        const isAccordionOpen = (key: string, defaultOpen: boolean = false) => {
          if (drilldownOpenAccordions[key] !== undefined) {
            return drilldownOpenAccordions[key];
          }
          return defaultOpen;
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

        const cleanInputRecord: Record<string, any> = {};
        for (const [k, v] of Object.entries(inputRecord)) {
          if (!k.startsWith('_')) {
            cleanInputRecord[k] = v;
          }
        }

        const activeModalParamsLower = new Set(activeModalParams.map(p => p.toLowerCase()));
        const comparisonColSet = new Set<string>();
        const comparisonColumns: { key: string; label: string; isKeyParam: boolean }[] = [];

        const registerCol = (key?: string) => {
          if (!key) return;
          const trimmed = key.trim();
          if (!trimmed || trimmed.startsWith('_')) return;
          const lk = trimmed.toLowerCase();
          if (isInternalMetaKey(lk)) return;
          if (!comparisonColSet.has(lk)) {
            comparisonColSet.add(lk);
            comparisonColumns.push({
              key: trimmed,
              label: formatHeaderLabel(trimmed),
              isKeyParam: activeModalParamsLower.has(lk)
            });
          }
        };

        // 1. Configured validation parameters first
        activeModalParams.forEach(p => registerCol(p));

        // 2. High priority financial/identifier columns
        ['transaction_id', 'retrieval_ref_num', 'refnum', 'rrn', 'account_number', 'acct_num', 'amount', 'reqamt', 'currency', 'value_date', 'ttime', 'terminal_id', 'proc_name', 'bo_type'].forEach(p => registerCol(p));

        // 3. Remaining input columns
        Object.keys(cleanInputRecord).forEach(k => registerCol(k));

        // 4. Columns from returned legs / target record
        returnedLegs.forEach(leg => {
          const legObj = leg?.payload || leg || {};
          Object.keys(legObj).forEach(k => registerCol(k));
        });
        if (targetRecord) {
          const tObj = targetRecord.payload || targetRecord;
          Object.keys(tObj).forEach(k => registerCol(k));
        }

        // Construct multi-stage execution results with returned data for each stage
        const pipelineStages: Array<{
          stageId: string;
          stageName: string;
          status: 'PASS' | 'FAIL' | 'PENDING' | 'ERROR';
          action: string;
          message: string;
          returnedData: any;
        }> = [];

        // 1. Target DB Existence Lookup Stage
        const existPass = Boolean(targetRecord);
        pipelineStages.push({
          stageId: 'existence_lookup',
          stageName: `Target DB Ingestion Lookup (${targetTableName})`,
          status: existPass ? 'PASS' : 'FAIL',
          action: existPass ? 'CONTINUE' : 'STOP',
          message: existPass
            ? `Located ${returnedLegs.length || 1} record(s) matching criteria in target table ${targetDbName}.${targetTableName}`
            : `Record not found in target database ${targetDbName}.${targetTableName}`,
          returnedData: {
            targetDatabase: targetDbName,
            targetTable: targetTableName,
            recordsReturnedCount: returnedLegs.length,
            lookupParameters: queryParamPairs.reduce((acc: any, q) => ({ ...acc, [q.param]: q.val }), {}),
            status: existPass ? 'RECORD_FOUND' : 'NOT_FOUND_IN_TARGET_DB'
          }
        });

        // 2. Cardinality & Multi-Leg Stage (if multiple legs or cardinality check)
        if (rowValDetails?.cardinality || returnedLegs.length > 1) {
          const cardPolicy = rowValDetails?.cardinality?.policy || (returnedLegs.length > 1 ? 'EXACT_ONE' : 'ALL_MATCH');
          const cardStatus = (rowValDetails?.cardinality?.status === 'FAIL' || isDupLegBreach) ? 'FAIL' : 'PASS';
          pipelineStages.push({
            stageId: 'cardinality_policy',
            stageName: `Multi-Leg Cardinality Check (${cardPolicy})`,
            status: cardStatus,
            action: cardStatus === 'FAIL' ? 'STOP' : 'CONTINUE',
            message: cardStatus === 'FAIL'
              ? `Multi-leg cardinality breach: expected 1 unique record, but received ${settlementLegs.length} active settlement legs in ${targetTableName}`
              : `Cardinality policy satisfied: evaluated ${returnedLegs.length} returned record(s) in external ledger`,
            returnedData: {
              policy: cardPolicy,
              totalReturnedRecords: returnedLegs.length,
              activeSettlementLegs: settlementLegs.length,
              reversalLegsFiltered: reversalLegs.length,
              reason: rowValDetails?.cardinality?.reason || (isDupLegBreach ? 'Multiple active settlement legs detected' : 'Unique record verified'),
              returnedRecords: returnedLegs
            }
          });
        }

        // 3. Stage History from ExecutablePipeline
        if (Array.isArray(rowValDetails?.stageHistory) && rowValDetails.stageHistory.length > 0) {
          rowValDetails.stageHistory.forEach((sh: any, sIdx: number) => {
            const existingIdx = pipelineStages.findIndex(ps => ps.stageId === sh.stageId || ps.stageName === sh.stageName);
            const stItem = {
              stageId: sh.stageId || `pipeline_stage_${sIdx}`,
              stageName: sh.stageName || `Pipeline Stage ${sIdx + 1}`,
              status: (sh.status || (sh.recordsFound > 0 ? 'PASS' : 'FAIL')) as any,
              action: sh.action || (sh.status === 'FAIL' ? 'STOP' : 'CONTINUE'),
              message: sh.message || (sh.recordsFound != null ? `Processed stage. Records found: ${sh.recordsFound}` : 'Stage execution completed'),
              returnedData: sh.details || sh.returned_data || (sh.recordsFound != null ? { recordsFound: sh.recordsFound, targetTable: sh.targetTable } : { stageName: sh.stageName, status: sh.status })
            };
            if (existingIdx >= 0) {
              pipelineStages[existingIdx] = stItem;
            } else {
              pipelineStages.push(stItem);
            }
          });
        }

        // 4. DB Table Column Configurations & Table Rules
        evaluatedDbConfigs.forEach(d => {
          pipelineStages.push({
            stageId: `dbcfg_${d.config.id}`,
            stageName: `DB Table Rule: ${d.config.name} (${d.config.ruleType})`,
            status: d.status,
            action: d.action,
            message: d.verdictMessage,
            returnedData: {
              ruleName: d.config.name,
              ruleType: d.config.ruleType,
              targetTable: d.config.tableName,
              keyColumns: d.config.columns?.map(c => c.columnName).join(', ') || d.config.primaryKeyColumn || '—',
              filterConditions: d.config.filterConditions || [],
              threshold: d.config.aggregationRules?.[0]?.value || 1,
              actionOnViolation: d.config.violationAction || 'FLAG',
              ruleDiagnostics: d.evaluatedDetails,
              evaluatedLegs: d.evaluatedLegs
            }
          });
        });

        // 5. Validation Check Steps from Workflow
        evalOutcome.stepDetails.forEach(s => {
          if (!pipelineStages.some(ps => ps.stageId === `step_${s.stepId}` || ps.stageId === s.stepId)) {
            const stepParamComparisons = activeModalParams.map(param => {
              const inVal = getCaseInsensitiveVal(inputRecord, param);
              const tgtVal = targetRecord ? getCaseInsensitiveVal(targetRecord, param) : undefined;
              const isMatch = inVal !== undefined && tgtVal !== undefined && String(inVal).trim().toLowerCase() === String(tgtVal).trim().toLowerCase();
              return {
                parameter: param,
                inputValue: inVal ?? null,
                targetDbValue: tgtVal ?? null,
                verdict: isMatch ? 'MATCH' : tgtVal === undefined ? 'NOT_IN_DB' : 'MISMATCH'
              };
            });

            pipelineStages.push({
              stageId: `step_${s.stepId}`,
              stageName: `Validation Step: ${s.stepName} (${s.checkType})`,
              status: s.status,
              action: s.actionTaken,
              message: typeof s.detail === 'string' ? s.detail : formatValidationDetail(s.detail, 'Step verification completed'),
              returnedData: {
                stepId: s.stepId,
                stepName: s.stepName,
                checkType: s.checkType,
                status: s.status,
                actionTaken: s.actionTaken,
                fieldComparisons: stepParamComparisons
              }
            });
          }
        });

        const handleSetAllAccordions = (open: boolean) => {
          setDrilldownOpenAccordions(prev => ({
            ...prev,
            data_comparison: open,
            validations_conducted: open,
            grouped_legs: open,
          }));
        };

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-300 rounded-2xl max-w-5xl w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 text-slate-800 max-h-[92vh] flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl ${evalOutcome.status === 'FAIL' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {evalOutcome.status === 'FAIL' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">
                      Workflow Validation Drilldown & Investigation
                    </h3>
                    <p className="text-xs text-slate-500">
                      Record: <span className="font-mono font-semibold text-slate-700">{displayKeyString}</span> &bull; Workflow: <span className="font-semibold text-purple-700">{activeWorkflow.name}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-0.5 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => handleSetAllAccordions(true)}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold text-slate-700 hover:bg-white hover:shadow-2xs transition cursor-pointer"
                    >
                      Expand All
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetAllAccordions(false)}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold text-slate-700 hover:bg-white hover:shadow-2xs transition cursor-pointer"
                    >
                      Collapse All
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOutcomeDrilldownRow(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Scrollable Modal Content */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {/* Aggregated Outcome Banner */}
                <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
                  evalOutcome.status === 'FAIL'
                    ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                    : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                }`}>
                  <div className="space-y-0.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider font-mono opacity-80">
                      Consolidated Validation Outcome
                    </div>
                    <div className="text-sm font-bold">
                      {typeof evalOutcome.message === 'string' ? evalOutcome.message : formatValidationDetail(evalOutcome.message, 'Validation Discrepancy')}
                    </div>
                    {evalOutcome.matchedRuleName && (
                      <div className="text-[11px] opacity-80 font-mono">
                        Triggered by Rule: &ldquo;{evalOutcome.matchedRuleName}&rdquo; (Condition: {evalOutcome.operator})
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
                      evalOutcome.status === 'FAIL' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
                    }`}>
                      {evalOutcome.status}
                    </span>
                    <div className="text-[10px] text-slate-500 mt-1 font-mono">
                      {evalOutcome.failedStepCount} Failed &bull; {evalOutcome.passedStepCount} Passed
                    </div>
                  </div>
                </div>

                {/* Failure Diagnostics & Violated Rule Box */}
                {evalOutcome.status === 'FAIL' && (
                  <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl space-y-2 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-rose-900 text-xs font-mono uppercase tracking-wider">
                        <AlertTriangle size={15} className="text-rose-600 shrink-0" />
                        <span>Root Cause & Violated Rule:</span>
                        <span className="px-2 py-0.5 rounded bg-rose-200 text-rose-900 text-[10px] font-bold">
                          {evalOutcome.matchedRuleName || 'Validation Rule'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-rose-700 bg-white px-2 py-0.5 rounded border border-rose-300">
                        Action: STOP (Pipeline Halted)
                      </span>
                    </div>

                    <div className="p-2.5 bg-white rounded-lg border border-rose-200 text-xs text-rose-950 font-mono space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-rose-800 font-sans">
                        <span>Discrepancy Detail:</span>
                      </div>
                      <p className="text-[11px] text-slate-800 leading-relaxed font-sans">
                        {typeof evalOutcome.message === 'string' ? evalOutcome.message : formatValidationDetail(evalOutcome.message, 'Validation Discrepancy')}
                      </p>
                    </div>

                    {returnedLegs.length > 1 && (
                      <div className="pt-0.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-rose-900 font-mono">
                        <span className="bg-rose-100 px-2 py-0.5 rounded border border-rose-300 font-bold">
                          Multi-Leg Response: {returnedLegs.length} Returned Records in {targetTableName}
                        </span>
                        <span className="text-slate-600 font-sans text-[11px]">
                          Expand the Data Comparison accordion below to view one row for each returned record compared against input values.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* =========================================================================
                    ACCORDION 1: DATA COMPARISON (INPUT DATA & RETURNED DB DATA IN ONE REAL TABLE)
                    ========================================================================= */}
                <div className="border border-blue-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => toggleDrilldownAccordion('data_comparison')}
                    className="w-full p-3.5 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white hover:bg-blue-50/90 transition flex items-center justify-between text-left cursor-pointer border-b border-blue-100"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="text-blue-600 transition-transform duration-200">
                        {isAccordionOpen('data_comparison', true) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                      <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700 shrink-0">
                        <Table size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-900 uppercase font-mono tracking-wider">
                            Data Comparison: Input Data &amp; Returned DB Data
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            {comparisonColumns.length} Columns
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            1 Input Row &bull; {returnedLegs.length > 0 ? (drilldownLegIndex >= 0 ? `Focused Record #${drilldownLegIndex + 1} of ${returnedLegs.length}` : `${returnedLegs.length} Returned DB Records`) : targetRecord ? '1 DB Row' : '0 DB Records'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate font-mono">
                          Unified horizontal table comparing task input values against external database mirror ledger ({targetDbName}.{targetTableName})
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {targetRecord ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                          <CheckCircle2 size={11} /> DB Records Found ({returnedLegs.length || 1})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                          <AlertTriangle size={11} /> 0 Records in DB
                        </span>
                      )}
                    </div>
                  </button>

                  {isAccordionOpen('data_comparison', true) && (
                    <div className="p-3.5 space-y-3 bg-white animate-in fade-in-50 duration-150">
                      {/* Integrated Multi-Leg Response Envelope Banner & Switcher Tabs */}
                      {returnedLegs.length > 0 ? (
                        <div className="p-3 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 rounded-xl border border-indigo-200 text-slate-800 text-xs space-y-2.5 shadow-2xs">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2">
                            <div className="flex items-center gap-2">
                              <div className="p-1 rounded-md bg-indigo-100 text-indigo-700">
                                <Layers size={14} />
                              </div>
                              <span className="font-bold text-xs text-indigo-950 font-mono uppercase tracking-wider">
                                Returned Data Response Envelope: {returnedLegs.length} Returned DB Record{returnedLegs.length > 1 ? 's' : ''}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-200 text-indigo-900 border border-indigo-300">
                                {targetDbName}.{targetTableName}
                              </span>
                              {activeStageEnvelope?.queriedAt && (
                                <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                                  &bull; Queried: {String(activeStageEnvelope.queriedAt).replace('T', ' ').slice(0, 19)}
                                </span>
                              )}
                              {auditMetadata?.statusVersion != null && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-semibold">
                                  v{auditMetadata.statusVersion}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px]">
                              {displayTotalAmt > 0 && (
                                <span className="px-2 py-0.5 rounded bg-white text-slate-800 border border-slate-300 font-bold">
                                  Gross: {currencyFound ? `${currencyFound} ` : ''}{displayTotalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              )}
                              {displayFeeAmt > 0 && (
                                <span className="px-2 py-0.5 rounded bg-white text-amber-800 border border-amber-300 font-bold">
                                  Fees: {currencyFound ? `${currencyFound} ` : ''}{displayFeeAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              )}
                              {displayTotalAmt > 0 && (
                                <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 border border-indigo-300 font-bold">
                                  Net: {currencyFound ? `${currencyFound} ` : ''}{displayNetAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              )}
                              {hasReversal && (
                                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold flex items-center gap-1">
                                  <AlertTriangle size={10} className="text-amber-700" /> Reversal Present
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Interactive Multi-Leg Switcher Tabs */}
                          {returnedLegs.length > 1 && (
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                              <span className="text-[10px] font-bold text-slate-500 uppercase font-mono mr-1">Filter View:</span>
                              <button
                                type="button"
                                onClick={() => setDrilldownLegIndex(-1)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                  drilldownLegIndex === -1
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                                }`}
                              >
                                <Table size={12} />
                                <span>All Response Data ({returnedLegs.length})</span>
                              </button>

                              {returnedLegs.map((leg: any, idx: number) => {
                                const legObj = leg?.payload || leg || {};
                                const proc = getCaseInsensitiveVal(legObj, 'PROC_NAME') || leg.legType || leg._procName || `Record #${idx + 1}`;
                                const isRvs = String(proc).toUpperCase() === 'RVS';
                                const legAmt = getCaseInsensitiveVal(legObj, 'reqamt') ?? getCaseInsensitiveVal(legObj, 'amount') ?? getCaseInsensitiveVal(legObj, 'amnt1');
                                const legTbl = leg._sourceTable || targetTableName;
                                const isSelected = drilldownLegIndex === idx;

                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setDrilldownLegIndex(idx)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer border ${
                                      isSelected
                                        ? isRvs
                                          ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                                          : 'bg-blue-600 text-white border-blue-700 shadow-xs'
                                        : isRvs
                                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                                          : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
                                    }`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : isRvs ? 'bg-amber-500' : 'bg-blue-500'}`} />
                                    <span>#{idx + 1}: {String(proc)} ({legTbl})</span>
                                    {legAmt !== undefined && legAmt !== null && (
                                      <span className={`text-[10px] px-1 py-0.2 rounded font-semibold ${
                                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                                      }`}>
                                        {formatCellVal(legAmt)}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : isNotFoundInDb ? (
                        <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs flex items-center justify-between shadow-2xs">
                          <div className="flex items-center gap-2">
                            <AlertTriangle size={15} className="text-rose-600" />
                            <span className="font-bold text-rose-900 font-mono">External Target Ledger: 0 Mirror Records Returned</span>
                            <span className="text-[11px] text-rose-700">({targetDbName}.{targetTableName})</span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-200 text-rose-900 border border-rose-300">
                            NOT FOUND IN TARGET DB
                          </span>
                        </div>
                      ) : null}

                      {/* Sub-header banner if viewing focused record */}
                      {drilldownLegIndex >= 0 && returnedLegs[drilldownLegIndex] && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-indigo-50 border border-indigo-200 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-indigo-900 font-mono">
                              Focused on Record #{drilldownLegIndex + 1} of {returnedLegs.length}:
                            </span>
                            <span className="px-2 py-0.5 rounded bg-indigo-200 text-indigo-900 font-mono font-bold text-[10px]">
                              {String(getCaseInsensitiveVal(returnedLegs[drilldownLegIndex]?.payload || returnedLegs[drilldownLegIndex], 'PROC_NAME') || `Record #${drilldownLegIndex + 1}`)}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                              (Highlighted in comparison table below &bull; One row for each returned record)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDrilldownLegIndex(-1)}
                            className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-indigo-700 font-bold border border-indigo-300 text-[10px] cursor-pointer"
                          >
                            Clear Focus
                          </button>
                        </div>
                      )}

                      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs max-h-[420px] overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-mono text-[10px] uppercase font-bold sticky top-0 z-20 border-b border-slate-200">
                              <th className="py-2.5 px-3.5 whitespace-nowrap bg-slate-200/90 text-slate-800 border-r border-slate-300 sticky left-0 z-30 min-w-[200px] shadow-xs">
                                Data Record Source
                              </th>
                              {comparisonColumns.map(col => (
                                <th key={col.key} className="py-2.5 px-3 whitespace-nowrap border-r border-slate-200">
                                  <div className="flex items-center gap-1">
                                    <span>{col.label}</span>
                                    {col.isKeyParam && (
                                      <span className="text-[8px] px-1 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200 font-mono">KEY</span>
                                    )}
                                  </div>
                                </th>
                              ))}
                              <th className="py-2.5 px-3 text-center whitespace-nowrap bg-slate-100 w-28">
                                Comparison
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-xs">
                            {/* ROW 1: INPUT DATA */}
                            <tr className="hover:bg-blue-50/30 transition bg-blue-50/15">
                              <td className="py-2.5 px-3.5 whitespace-nowrap bg-blue-50/95 font-bold border-r border-blue-200 text-blue-950 sticky left-0 z-10 shadow-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <FileSpreadsheet size={13} className="text-blue-600 shrink-0" />
                                    <span>Input Data</span>
                                  </div>
                                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-200 text-blue-800 border border-blue-300 font-bold">TASK DATASET</span>
                                </div>
                              </td>
                              {comparisonColumns.map(col => {
                                const inVal = getCaseInsensitiveVal(cleanInputRecord, col.key);
                                return (
                                  <td key={col.key} className="py-2.5 px-3 whitespace-nowrap border-r border-slate-100 text-slate-900 font-semibold bg-white">
                                    {formatCellVal(inVal)}
                                  </td>
                                );
                              })}
                              <td className="py-2.5 px-3 whitespace-nowrap text-center text-[10px] font-bold text-blue-800 bg-blue-50/40">
                                BASELINE
                              </td>
                            </tr>

                            {/* ROWS 2+: RETURNED DB DATA - ONE ROW FOR EACH */}
                            {returnedLegs.length > 0 ? (
                              returnedLegs.map((leg, legIdx) => {
                                const isFocused = drilldownLegIndex === legIdx;
                                const legObj = leg?.payload || leg || {};
                                const proc = getCaseInsensitiveVal(legObj, 'PROC_NAME') || leg.legType || `Record #${legIdx + 1}`;
                                const isRvs = String(proc || '').toUpperCase() === 'RVS';
                                const legRrn = getCaseInsensitiveVal(legObj, 'refnum') ?? getCaseInsensitiveVal(legObj, 'rrn') ?? getCaseInsensitiveVal(legObj, 'retrieval_ref_num');

                                // Calculate diffs between input and this leg
                                let diffCount = 0;
                                let evaluatedCols = 0;
                                comparisonColumns.forEach(col => {
                                  const inVal = getCaseInsensitiveVal(cleanInputRecord, col.key);
                                  const tgtVal = getCaseInsensitiveVal(legObj, col.key);
                                  if (inVal !== undefined && tgtVal !== undefined) {
                                    evaluatedCols++;
                                    if (!areValuesEqual(inVal, tgtVal)) {
                                      diffCount++;
                                    }
                                  }
                                });

                                return (
                                  <tr
                                    key={legIdx}
                                    className={`hover:bg-indigo-50/30 transition ${
                                      isFocused
                                        ? 'ring-2 ring-indigo-500 bg-indigo-50/60'
                                        : isRvs
                                          ? 'bg-amber-50/20'
                                          : legIdx % 2 === 0
                                            ? 'bg-white'
                                            : 'bg-slate-50/30'
                                    }`}
                                  >
                                    <td className={`py-2.5 px-3.5 whitespace-nowrap font-bold border-r border-indigo-200 text-indigo-950 sticky left-0 z-10 shadow-xs ${isFocused ? 'bg-indigo-100' : isRvs ? 'bg-amber-50/95' : 'bg-indigo-50/95'}`}>
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <Database size={13} className={isRvs ? 'text-amber-700 shrink-0' : 'text-indigo-600 shrink-0'} />
                                          <span className="truncate">
                                            Returned Record #{legIdx + 1}
                                          </span>
                                          {isFocused && (
                                            <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-600 text-white font-mono font-bold">
                                              FOCUSED
                                            </span>
                                          )}
                                          {legRrn && (
                                            <span className="text-[10px] text-slate-500 font-mono font-normal hidden lg:inline">
                                              ({String(legRrn)})
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${isRvs ? 'bg-amber-200 text-amber-900 border-amber-300' : 'bg-blue-200 text-blue-900 border-blue-300'}`}>
                                            {String(proc).toUpperCase()}
                                          </span>
                                          <span className="px-1 py-0.2 rounded text-[8px] bg-slate-100 text-slate-600 border border-slate-200 font-normal">
                                            {leg._sourceTable || targetTableName}
                                          </span>
                                        </div>
                                      </div>
                                    </td>

                                    {comparisonColumns.map(col => {
                                      const inVal = getCaseInsensitiveVal(cleanInputRecord, col.key);
                                      const tgtVal = getCaseInsensitiveVal(legObj, col.key);

                                      if (inVal !== undefined && tgtVal !== undefined) {
                                        const isMatch = areValuesEqual(inVal, tgtVal);
                                        return (
                                          <td
                                            key={col.key}
                                            className={`py-2.5 px-3 whitespace-nowrap border-r ${
                                              isMatch
                                                ? 'border-slate-100 text-emerald-950 bg-emerald-50/25'
                                                : 'border-rose-200 text-rose-950 bg-rose-50/80 font-bold'
                                            }`}
                                            title={isMatch ? 'Matches input value' : `Mismatch: Input='${inVal}' vs DB='${tgtVal}'`}
                                          >
                                            {isMatch ? (
                                              <span className="font-semibold">{formatCellVal(tgtVal)}</span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded border border-rose-300">
                                                {formatCellVal(tgtVal)}
                                              </span>
                                            )}
                                          </td>
                                        );
                                      }

                                      if (tgtVal !== undefined) {
                                        return (
                                          <td key={col.key} className="py-2.5 px-3 whitespace-nowrap border-r border-slate-100 text-slate-700 bg-white">
                                            {formatCellVal(tgtVal)}
                                          </td>
                                        );
                                      }

                                      return (
                                        <td key={col.key} className="py-2.5 px-3 whitespace-nowrap border-r border-slate-100 text-slate-300 italic bg-white">
                                          —
                                        </td>
                                      );
                                    })}

                                    <td className="py-2.5 px-3 whitespace-nowrap text-center">
                                      <div className="flex items-center justify-center gap-1.5">
                                        {diffCount === 0 && evaluatedCols > 0 ? (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                            <Check size={10} /> MATCH
                                          </span>
                                        ) : diffCount > 0 ? (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]">
                                            <AlertTriangle size={10} /> {diffCount} DIFF
                                          </span>
                                        ) : (
                                          <span className="text-[10px] text-slate-400 italic">EVALUATED</span>
                                        )}
                                        {returnedLegs.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => setDrilldownLegIndex(drilldownLegIndex === legIdx ? -1 : legIdx)}
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition cursor-pointer border ${
                                              drilldownLegIndex === legIdx
                                                ? 'bg-indigo-600 text-white border-indigo-700'
                                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                                            }`}
                                            title={drilldownLegIndex === legIdx ? 'Reset to all legs' : 'Isolate this leg in table'}
                                          >
                                            {drilldownLegIndex === legIdx ? 'Focused ✓' : 'Focus'}
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            ) : targetRecord ? (
                              <tr className="hover:bg-indigo-50/30 transition bg-white">
                                <td className="py-2.5 px-3.5 whitespace-nowrap font-bold border-r border-indigo-200 text-indigo-950 sticky left-0 z-10 shadow-xs bg-indigo-50/95">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                      <Database size={13} className="text-indigo-600 shrink-0" />
                                      <span>Returned DB Data</span>
                                    </div>
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-200 text-indigo-900 border border-indigo-300">
                                      {targetTableName}
                                    </span>
                                  </div>
                                </td>
                                {comparisonColumns.map(col => {
                                  const inVal = getCaseInsensitiveVal(cleanInputRecord, col.key);
                                  const tgtVal = getCaseInsensitiveVal(targetRecord, col.key);

                                  if (inVal !== undefined && tgtVal !== undefined) {
                                    const isMatch = areValuesEqual(inVal, tgtVal);
                                    return (
                                      <td
                                        key={col.key}
                                        className={`py-2.5 px-3 whitespace-nowrap border-r ${
                                          isMatch ? 'border-slate-100 text-emerald-950 bg-emerald-50/25' : 'border-rose-200 text-rose-950 bg-rose-50/80 font-bold'
                                        }`}
                                      >
                                        {isMatch ? (
                                          <span className="font-semibold">{formatCellVal(tgtVal)}</span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded border border-rose-300">
                                            {formatCellVal(tgtVal)}
                                          </span>
                                        )}
                                      </td>
                                    );
                                  }
                                  return (
                                    <td key={col.key} className="py-2.5 px-3 whitespace-nowrap border-r border-slate-100 text-slate-700 bg-white">
                                      {formatCellVal(tgtVal)}
                                    </td>
                                  );
                                })}
                                <td className="py-2.5 px-3 whitespace-nowrap text-center">
                                  <span className="text-[10px] text-slate-400 italic">EVALUATED</span>
                                </td>
                              </tr>
                            ) : (
                              <tr>
                                <td className="py-3 px-3.5 whitespace-nowrap bg-rose-50 font-bold border-r border-rose-200 text-rose-950 sticky left-0 z-10 shadow-xs">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                      <Database size={13} className="text-rose-600 shrink-0" />
                                      <span>Returned DB Data</span>
                                    </div>
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-200 text-rose-900 border border-rose-300">0 ROWS</span>
                                  </div>
                                </td>
                                <td colSpan={comparisonColumns.length + 1} className="py-3 px-4 text-rose-700 font-mono text-xs bg-rose-50/30">
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle size={14} className="text-rose-600 shrink-0" />
                                    <span>No records returned from external target table {targetDbName}.{targetTableName} matching query lookup parameters.</span>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Embedded Returned Legs Detail Cards & Raw Payloads */}
                      {returnedLegs.length > 0 && (
                        <div className="pt-2 border-t border-slate-200 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider flex items-center gap-1.5">
                              <Layers size={13} className="text-indigo-600" />
                              Returned DB Records Payload Inspection ({returnedLegs.length} Record{returnedLegs.length > 1 ? 's' : ''})
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              All {returnedLegs.length} external database response records returned from query lookup
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-2.5">
                            {returnedLegs.map((leg: any, idx: number) => {
                              const legObj = leg?.payload || leg || {};
                              const proc = getCaseInsensitiveVal(legObj, 'PROC_NAME') || leg.legType || 'TRANSACTION_LEG';
                              const isRvs = String(proc).toUpperCase() === 'RVS';
                              const legAmt = getCaseInsensitiveVal(legObj, 'reqamt') ?? getCaseInsensitiveVal(legObj, 'amount');
                              const legCurr = getCaseInsensitiveVal(legObj, 'currency') ?? getCaseInsensitiveVal(legObj, 'curr') ?? 'USD';
                              const legRef = getCaseInsensitiveVal(legObj, 'refnum') ?? getCaseInsensitiveVal(legObj, 'rrn') ?? getCaseInsensitiveVal(legObj, 'retrieval_ref_num');
                              const legTime = getCaseInsensitiveVal(legObj, 'ttime') ?? getCaseInsensitiveVal(legObj, 'value_date') ?? getCaseInsensitiveVal(legObj, 'created_at');
                              const isFocused = drilldownLegIndex === idx;

                              const attributes: { key: string; value: any }[] = [];
                              for (const [k, v] of Object.entries(legObj)) {
                                if (!k.startsWith('_') && v !== undefined && v !== null && typeof v !== 'object') {
                                  attributes.push({ key: k, value: v });
                                }
                              }

                              const payloadJson = JSON.stringify(legObj, null, 2);
                              const copyKey = `drilldown_leg_${idx}`;

                              return (
                                <div
                                  key={idx}
                                  className={`rounded-xl border transition p-3 space-y-2.5 bg-slate-50/50 shadow-2xs ${
                                    isFocused
                                      ? 'border-indigo-400 ring-2 ring-indigo-200 bg-indigo-50/20'
                                      : isRvs
                                        ? 'border-amber-300'
                                        : 'border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  {/* Leg Sub-header */}
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                        isRvs ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                                      }`}>
                                        RECORD #{idx + 1}
                                      </span>
                                      <span className="font-bold text-xs text-slate-900 font-mono">
                                        PROC: {String(proc)}
                                      </span>
                                      {legRef && (
                                        <span className="text-[11px] font-mono text-slate-500">
                                          &bull; RRN: <strong className="text-slate-700">{String(legRef)}</strong>
                                        </span>
                                      )}
                                      {legTime && (
                                        <span className="text-[11px] font-mono text-slate-500">
                                          &bull; Time: {String(legTime).replace('T', ' ').slice(0, 19)}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      {legAmt !== undefined && legAmt !== null && (
                                        <span className={`px-2 py-0.5 rounded font-mono text-xs font-bold ${
                                          isRvs ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                        }`}>
                                          {String(legCurr)} {formatCellVal(legAmt)}
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => setDrilldownLegIndex(isFocused ? -1 : idx)}
                                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer border ${
                                          isFocused
                                            ? 'bg-indigo-600 text-white border-indigo-700'
                                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                                        }`}
                                      >
                                        {isFocused ? 'Viewing in Comparison ✓' : 'Focus in Comparison'}
                                      </button>
                                    </div>
                                  </div>

                                  {/* Attributes grid */}
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-[11px] font-mono">
                                    {attributes.slice(0, 16).map(attr => (
                                      <div key={attr.key} className="bg-white p-2 rounded-lg border border-slate-100 space-y-0.5 shadow-3xs">
                                        <span className="text-[10px] text-slate-500 uppercase font-semibold block truncate" title={attr.key}>
                                          {formatHeaderLabel(attr.key)}
                                        </span>
                                        <span className="font-bold text-slate-800 block truncate" title={String(attr.value)}>
                                          {formatCellVal(attr.value)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Raw JSON toggle */}
                                  <details className="text-[11px] font-mono group">
                                    <summary className="cursor-pointer text-indigo-600 hover:text-indigo-800 font-semibold select-none flex items-center justify-between">
                                      <span>View Raw Record JSON Payload</span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          handleCopyPayload(payloadJson, copyKey);
                                        }}
                                        className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 text-[10px] font-mono border border-slate-300 cursor-pointer"
                                      >
                                        {copiedPayloadKey === copyKey ? 'Copied!' : 'Copy JSON'}
                                      </button>
                                    </summary>
                                    <pre className="mt-2 p-2.5 bg-slate-900 text-emerald-400 rounded-lg overflow-x-auto text-[10px] whitespace-pre-wrap max-h-48 overflow-y-auto">
                                      {payloadJson}
                                    </pre>
                                  </details>
                                </div>
                              );
                            })}
                          </div>

                          {/* Full Stage Response Envelope JSON Viewer */}
                          {modalReturnedData && typeof modalReturnedData === 'object' && Object.keys(modalReturnedData).length > 0 && (
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-700 font-mono uppercase tracking-wider">
                                  Full Stage Response Data Envelope (JSONB)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyPayload(JSON.stringify(modalReturnedData, null, 2), 'drilldown_stage_envelope')}
                                  className="px-2.5 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 text-[10px] font-mono border border-slate-300 cursor-pointer"
                                >
                                  {copiedPayloadKey === 'drilldown_stage_envelope' ? 'Copied Envelope!' : 'Copy Full Envelope'}
                                </button>
                              </div>
                              <pre className="p-2.5 bg-slate-950 text-emerald-400 rounded-lg overflow-x-auto text-[10px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                                {JSON.stringify(modalReturnedData, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* =========================================================================
                    ACCORDION 2: VALIDATIONS CONDUCTED (ALL STAGES & STEPS IN ONE REAL TABLE)
                    ========================================================================= */}
                <div className="border border-purple-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => toggleDrilldownAccordion('validations_conducted')}
                    className="w-full p-3.5 bg-gradient-to-r from-purple-50/70 via-slate-50/50 to-white hover:bg-purple-50/90 transition flex items-center justify-between text-left cursor-pointer border-b border-purple-100"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="text-purple-600 transition-transform duration-200">
                        {isAccordionOpen('validations_conducted', true) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                      <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700 shrink-0">
                        <GitCompare size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-900 uppercase font-mono tracking-wider">
                            Validations Conducted: Multi-Stage Evaluation Steps
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                            evalOutcome.status === 'PASS' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}>
                            Overall Verdict: {evalOutcome.status}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {pipelineStages.length} Stages/Steps &bull; {pipelineStages.filter(s => s.status === 'PASS').length} Passed &bull; {pipelineStages.filter(s => s.status === 'FAIL' || s.status === 'ERROR').length} Failed
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate font-mono">
                          Sequential execution checklist and verification findings for workflow &ldquo;{activeWorkflow.name}&rdquo;
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                        evalOutcome.status === 'PASS' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                      }`}>
                        {evalOutcome.status}
                      </span>
                    </div>
                  </button>

                  {isAccordionOpen('validations_conducted', true) && (
                    <div className="p-3.5 space-y-3 bg-white animate-in fade-in-50 duration-150">
                      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-mono text-[10px] uppercase font-bold border-b border-slate-200">
                              <th className="py-2.5 px-3 text-center w-12">#</th>
                              <th className="py-2.5 px-3 min-w-[220px]">Validation Stage / Rule Name</th>
                              <th className="py-2.5 px-3 min-w-[140px]">Check Type</th>
                              <th className="py-2.5 px-3 text-center w-28">Status</th>
                              <th className="py-2.5 px-3 text-center w-28">Action</th>
                              <th className="py-2.5 px-4 min-w-[280px]">Evaluation Findings &amp; Discrepancy Record</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-xs">
                            {pipelineStages.map((stage, sIdx) => {
                              const isPass = stage.status === 'PASS';
                              const isFail = stage.status === 'FAIL' || stage.status === 'ERROR';
                              const checkType = stage.returnedData?.checkType || stage.returnedData?.ruleType || (
                                stage.stageId === 'existence_lookup' ? 'INGESTION_SEARCH' :
                                stage.stageId === 'cardinality_policy' ? 'CARDINALITY' :
                                stage.stageId.startsWith('dbcfg_') ? 'TABLE_RULE' :
                                'EQUALITY_MATCH'
                              );

                              return (
                                <tr
                                  key={stage.stageId || sIdx}
                                  className={`hover:bg-slate-50/70 transition ${
                                    isFail ? 'bg-rose-50/30' : sIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/20'
                                  }`}
                                >
                                  <td className="py-2.5 px-3 text-center font-bold text-slate-500">
                                    {sIdx + 1}
                                  </td>
                                  <td className="py-2.5 px-3 font-semibold text-slate-900">
                                    <div className="flex items-center gap-1.5">
                                      {isPass ? (
                                        <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                                      ) : isFail ? (
                                        <AlertTriangle size={13} className="text-rose-600 shrink-0" />
                                      ) : (
                                        <HelpCircle size={13} className="text-slate-400 shrink-0" />
                                      )}
                                      <span>{stage.stageName}</span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600">
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200">
                                      {String(checkType)}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      isPass
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : isFail
                                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                        : 'bg-slate-100 text-slate-700 border border-slate-300'
                                    }`}>
                                      {stage.status}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                      isFail
                                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                                        : 'bg-slate-50 text-slate-700 border-slate-200'
                                    }`}>
                                      ➔ {stage.action}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-4 font-sans text-xs">
                                    <div className="space-y-1">
                                      <div className={`leading-relaxed ${isFail ? 'font-semibold text-rose-900' : 'text-slate-700'}`}>
                                        {stage.message}
                                      </div>

                                      {/* If specific field comparison mismatches exist, show clean badges */}
                                      {Array.isArray(stage.returnedData?.fieldComparisons) &&
                                        stage.returnedData.fieldComparisons.some((fc: any) => fc.verdict === 'MISMATCH') && (
                                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 font-mono text-[10px]">
                                            {stage.returnedData.fieldComparisons
                                              .filter((fc: any) => fc.verdict === 'MISMATCH')
                                              .map((fc: any, fcIdx: number) => (
                                                <span key={fcIdx} className="bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded border border-rose-300">
                                                  <strong>{fc.parameter}</strong>: Input &lsquo;{formatCellVal(fc.inputValue)}&rsquo; ≠ DB &lsquo;{formatCellVal(fc.targetDbValue)}&rsquo;
                                                </span>
                                              ))}
                                          </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
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
        </ErrorBoundary>
      )}

      {/* =========================================================================
          7. DATABASE RECORD INSPECTOR MODAL
          ========================================================================= */}
      {inspectingRow && (
        <ErrorBoundary fallbackTitle="Database Record Inspector Error" fallbackMessage="Could not render record inspection details.">
          {(() => {
        const rowValDetails = inspectingRow._validation_details || inspectingRow.sourceRecord?._validation_details;
        const inspectorLegs = extractRowLegs(inspectingRow, activeWorkflow);
        const cleanInputRecord: Record<string, any> = {};
        const rawInput = inspectingRow.sourceRecord || inspectingRow.canonical_data || inspectingRow || {};
        for (const [k, v] of Object.entries(rawInput)) {
          if (!k.startsWith('_')) {
            cleanInputRecord[k] = v;
          }
        }
        const inspectIsNotFoundInDb = Boolean(
          rowValDetails?.existence === 'NOT_FOUND_IN_TARGET_DB' ||
          inspectingRow._validation_details?.existence === 'NOT_FOUND_IN_TARGET_DB' ||
          inspectingRow.sourceRecord?._validation_details?.existence === 'NOT_FOUND_IN_TARGET_DB' ||
          (inspectorLegs.length === 0 && (inspectingRow.reconciliation_status === 'FAIL' || (inspectingRow.sourceRecord as any)?.reconciliation_status === 'FAIL'))
        );

        // Focused Record (respects inspectLegIndex when an individual record is picked)
        const focusedInspectRecord = (inspectLegIndex >= 0 && inspectorLegs[inspectLegIndex])
          ? (inspectorLegs[inspectLegIndex]?.payload || inspectorLegs[inspectLegIndex])
          : null;

        const rawInspectRecord = focusedInspectRecord
          || inspectingRow._target_record
          || inspectingRow.sourceRecord?._target_record
          || (inspectorLegs.length > 0 ? (inspectorLegs[0]?.payload || inspectorLegs[0]) : null);

        const inspectTargetRecord = (inspectIsNotFoundInDb || !rawInspectRecord || (typeof rawInspectRecord === 'object' && Object.keys(rawInspectRecord).length === 0))
          ? null
          : rawInspectRecord;
        const inspectTargetDb = inspectingRow._target_db || activeWorkflow?.targetDbId || 'Target DB';
        const inspectTargetTable = inspectingRow._target_table || activeWorkflow?.targetTable || 'tran_log_tab';

        // Extract multi-leg response envelope data & metrics
        const rawReturnedData = inspectingRow.returned_data
          || (inspectingRow.sourceRecord as any)?.returned_data
          || (inspectingRow as any).canonical_data?.returned_data
          || (inspectingRow.sourceRecord as any)?.canonical_data?.returned_data;

        let activeStageEnvelope: any = null;
        if (rawReturnedData?.stages && typeof rawReturnedData.stages === 'object') {
          const targetTbl = activeWorkflow?.targetTable?.toLowerCase();
          for (const [stgKey, stgVal] of Object.entries(rawReturnedData.stages)) {
            if (stgVal && typeof stgVal === 'object') {
              const stgTbl = String((stgVal as any).targetTable || stgKey).toLowerCase();
              if (targetTbl && stgTbl === targetTbl) {
                activeStageEnvelope = stgVal;
                break;
              }
            }
          }
          if (!activeStageEnvelope) {
            activeStageEnvelope = Object.values(rawReturnedData.stages)[0] || null;
          }
        }

        const auditMetadata = rawReturnedData?.audit || null;
        const aggregatedMetrics = activeStageEnvelope?.aggregatedMetrics || null;

        const reversalLegs = inspectorLegs.filter((l: any) => {
          const obj = l?.payload || l || {};
          return String(getCaseInsensitiveVal(obj, 'PROC_NAME') || '').toUpperCase() === 'RVS';
        });
        const settlementLegs = inspectorLegs.filter((l: any) => {
          const obj = l?.payload || l || {};
          return String(getCaseInsensitiveVal(obj, 'PROC_NAME') || '').toUpperCase() !== 'RVS';
        });
        const hasReversal = reversalLegs.length > 0 || Boolean(aggregatedMetrics?.hasReversal);

        let computedTotalAmount = 0;
        let computedFeeAmount = 0;
        let currencyFound: string | null = aggregatedMetrics?.currency || null;

        inspectorLegs.forEach((l: any) => {
          const obj = l?.payload || l || {};
          const amtVal = getCaseInsensitiveVal(obj, 'reqamt') ?? getCaseInsensitiveVal(obj, 'amount');
          const feeVal = getCaseInsensitiveVal(obj, 'client_billingfee') ?? getCaseInsensitiveVal(obj, 'transfeeamt1') ?? getCaseInsensitiveVal(obj, 'fee');
          const currVal = getCaseInsensitiveVal(obj, 'currency') ?? getCaseInsensitiveVal(obj, 'curr');
          if (currVal && !currencyFound) currencyFound = String(currVal);
          if (amtVal !== undefined && amtVal !== null && !isNaN(Number(amtVal))) {
            computedTotalAmount += Number(amtVal);
          }
          if (feeVal !== undefined && feeVal !== null && !isNaN(Number(feeVal))) {
            computedFeeAmount += Number(feeVal);
          }
        });

        const displayNetAmt = aggregatedMetrics?.netAmount ?? (computedTotalAmount - computedFeeAmount);
        const displayTotalAmt = aggregatedMetrics?.totalAmount ?? computedTotalAmount;
        const displayFeeAmt = aggregatedMetrics?.feeAmount ?? computedFeeAmount;

        const inspectParams = activeWorkflow?.steps?.map(s => s.parameter).filter(Boolean) || [];
        const inspectParamsLower = new Set(inspectParams.map(p => p.toLowerCase()));
        const inspectColSet = new Set<string>();
        const inspectComparisonColumns: { key: string; label: string; isKeyParam: boolean }[] = [];
        const registerInspectCol = (key?: string) => {
          if (!key) return;
          const trimmed = key.trim();
          if (!trimmed || trimmed.startsWith('_')) return;
          const lk = trimmed.toLowerCase();
          if (isInternalMetaKey(lk)) return;
          if (!inspectColSet.has(lk)) {
            inspectColSet.add(lk);
            inspectComparisonColumns.push({
              key: trimmed,
              label: formatHeaderLabel(trimmed),
              isKeyParam: inspectParamsLower.has(lk)
            });
          }
        };

        inspectParams.forEach(p => registerInspectCol(p));
        ['transaction_id', 'retrieval_ref_num', 'refnum', 'rrn', 'account_number', 'acct_num', 'amount', 'reqamt', 'currency', 'value_date', 'ttime', 'terminal_id', 'proc_name', 'bo_type'].forEach(p => registerInspectCol(p));
        Object.keys(cleanInputRecord).forEach(k => registerInspectCol(k));
        inspectorLegs.forEach((leg: any) => {
          const legObj = leg?.payload || leg || {};
          Object.keys(legObj).forEach(k => registerInspectCol(k));
        });
        if (inspectTargetRecord) {
          const tObj = inspectTargetRecord.payload || inspectTargetRecord;
          Object.keys(tObj).forEach(k => registerInspectCol(k));
        }

        const isFailRecord = inspectingRow.validationResult === 'FAIL' ||
          inspectingRow.investigationStatus === 'FLAGGED' ||
          (inspectingRow as any).status === 'FLAGGED' ||
          (inspectingRow as any).status === 'ERROR' ||
          rowValDetails?.status === 'FAIL' ||
          rowValDetails?.cardinality?.status === 'FAIL' ||
          !!rowValDetails?.tableRuleViolation ||
          rowValDetails?.existence?.status === 'FAIL';

        const handleSetAllInspectAccordions = (open: boolean) => {
          setDrilldownOpenAccordions(prev => ({
            ...prev,
            inspect_data_comparison: open,
            inspect_validations_conducted: open,
            inspect_grouped_legs: open,
          }));
        };

        const isAccordionOpen = (key: string, defaultOpen: boolean = false) => {
          if (drilldownOpenAccordions[key] !== undefined) {
            return drilldownOpenAccordions[key];
          }
          return defaultOpen;
        };

        const synthesizedTrail: any[] = [];

        // 1. Stage history from _validation_details
        if (Array.isArray(rowValDetails?.stageHistory)) {
          rowValDetails.stageHistory.forEach((sh: any) => {
            synthesizedTrail.push({
              ruleId: sh.stageId || `stage_${sh.stageName}`,
              ruleName: sh.stageName ? `Stage: ${sh.stageName}` : 'Pipeline Stage',
              stageName: sh.stageName || 'Pipeline Stage',
              validationResult: sh.status || (sh.recordsFound > 0 ? 'PASS' : 'FAIL'),
              pipelineAction: sh.status === 'FAIL' ? 'STOP' : 'CONTINUE',
              message: sh.message || (sh.recordsFound != null ? `Found ${sh.recordsFound} record(s) in target table` : 'Stage execution completed'),
              errorDetail: sh.error || null,
              durationMs: sh.durationMs || 0
            });
          });
        }

        // 2. Cardinality check entry
        if (rowValDetails?.cardinality) {
          synthesizedTrail.push({
            ruleId: 'cardinality_policy',
            ruleName: `Cardinality Check (${rowValDetails.cardinality.policy || 'EXACT_ONE'})`,
            stageName: 'Multi-Leg Validation',
            validationResult: rowValDetails.cardinality.status || 'FAIL',
            pipelineAction: rowValDetails.cardinality.status === 'FAIL' ? 'STOP' : 'CONTINUE',
            message: `Evaluated ${rowValDetails.cardinality.actualCount ?? inspectorLegs.length} matched legs against policy ${rowValDetails.cardinality.policy || 'EXACT_ONE'}. ${rowValDetails.cardinality.reason || ''}`,
            errorDetail: rowValDetails.cardinality.status === 'FAIL' ? `Actual count: ${rowValDetails.cardinality.actualCount ?? inspectorLegs.length}, Expected: 1` : null,
            durationMs: 0
          });
        }

        // 3. Table rule violation entry
        if (rowValDetails?.tableRuleViolation) {
          synthesizedTrail.push({
            ruleId: rowValDetails.tableRuleViolation.stepId || 'table_rule_violation',
            ruleName: rowValDetails.tableRuleViolation.ruleName || 'Table-Level Validation Check',
            stageName: rowValDetails.tableRuleViolation.stageName || 'Table Evaluation',
            validationResult: 'FAIL',
            pipelineAction: 'STOP',
            message: rowValDetails.tableRuleViolation.message || rowValDetails.tableRuleViolation.detail || 'Rule criteria violated',
            errorDetail: rowValDetails.tableRuleViolation,
            durationMs: 0
          });
        }

        // 4. Target DB existence
        if (rowValDetails?.existence) {
          synthesizedTrail.push({
            ruleId: 'existence_lookup',
            ruleName: 'Target DB Existence Verification',
            stageName: 'Ingestion Lookup',
            validationResult: rowValDetails.existence.status === 'PASS' ? 'PASS' : 'FAIL',
            pipelineAction: rowValDetails.existence.status === 'PASS' ? 'CONTINUE' : 'STOP',
            message: rowValDetails.existence.status === 'PASS' ? 'Target records located in mirror ledger' : 'NOT_FOUND_IN_TARGET_DB: No matching rows in target table',
            errorDetail: `Target Table: ${rowValDetails.existence.targetTable || activeWorkflow?.targetTable || 'target_table'}`,
            durationMs: 0
          });
        }

        // 5. Existing auditTrail or stepResults
        if (Array.isArray(inspectingRow.executionSummary?.auditTrail) && inspectingRow.executionSummary.auditTrail.length > 0) {
          inspectingRow.executionSummary.auditTrail.forEach((at: any) => synthesizedTrail.push(at));
        } else if (inspectingRow.stepResults && Object.keys(inspectingRow.stepResults).length > 0) {
          Object.values(inspectingRow.stepResults).forEach((sr: any) => {
            synthesizedTrail.push({
              ruleId: sr.stepId,
              ruleName: activeWorkflow?.steps?.find((s: any) => isStepIdMatch(s.id, sr.stepId))?.name || (sr as any).ruleName || 'Validation Step',
              stageName: sr.stageName || 'Validation Stage',
              validationResult: sr.resultStatus || (sr.status === 'PASSED' ? 'PASS' : 'FAIL'),
              pipelineAction: sr.actionTaken || (sr.status === 'PASSED' ? 'CONTINUE' : 'STOP'),
              message: sr.detail || sr.badgeText,
              errorDetail: sr.dbValue,
              durationMs: 0
            });
          });
        } else if (Array.isArray(inspectingRow.sourceRecord?.auditTrail)) {
          inspectingRow.sourceRecord.auditTrail.forEach((at: any) => synthesizedTrail.push(at));
        } else if (Array.isArray(inspectingRow.sourceRecord?.canonical_data?.auditTrail)) {
          inspectingRow.sourceRecord.canonical_data.auditTrail.forEach((at: any) => synthesizedTrail.push(at));
        } else if (Array.isArray(serverEvaluatedRecords?.[inspectingRow.rowId]?.auditTrail)) {
          serverEvaluatedRecords[inspectingRow.rowId].auditTrail.forEach((at: any) => synthesizedTrail.push(at));
        }

        // De-duplicate synthesizedTrail by ruleId + validationResult + stageName
        const seenKey = new Set<string>();
        const deduplicatedTrail = synthesizedTrail.filter((e) => {
          const k = `${e.ruleId}_${e.validationResult}_${e.stageName}`;
          if (seenKey.has(k)) return false;
          seenKey.add(k);
          return true;
        });

        // Filter by activeWorkflow.steps if matching, otherwise fall back to full deduplicatedTrail
        const filtered = deduplicatedTrail.filter((entry: any) => {
          if (!entry || !entry.ruleId) return false;
          if (activeWorkflow?.steps && activeWorkflow.steps.length > 0) {
            return activeWorkflow.steps.some((s: any) => isStepIdMatch(s.id, entry.ruleId));
          }
          return true;
        });
        const modalAuditTrail = filtered.length > 0 ? filtered : deduplicatedTrail;

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl border border-slate-300 max-w-5xl w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 max-h-[92vh] flex flex-col text-slate-800">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
                    <Database size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-sm font-mono uppercase tracking-wider">
                        Transaction Investigation: {inspectingRow.rowId}
                      </h3>
                      {activeWorkflow && (
                        <span className="text-[10px] font-mono text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          Workflow: {activeWorkflow.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Multi-Stage Rule Trajectory &bull; Target Ledger Mirror Coordinates &bull; Root Cause Diagnostics
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-0.5 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => handleSetAllInspectAccordions(true)}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold text-slate-700 hover:bg-white hover:shadow-2xs transition cursor-pointer"
                    >
                      Expand All
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetAllInspectAccordions(false)}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold text-slate-700 hover:bg-white hover:shadow-2xs transition cursor-pointer"
                    >
                      Collapse All
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInspectingRow(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Lifecycle Status Pill and Individual Transaction Closure Button */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
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

                <div className="flex items-center gap-2">
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
                    className={`px-3 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${inspectingRow.investigationStatus === 'CLOSED'
                        ? 'bg-slate-200 hover:bg-slate-300 text-slate-800 border-slate-400'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-700 shadow-xs'
                      }`}
                  >
                    {inspectingRow.investigationStatus === 'CLOSED' ? 'Reopen Transaction' : 'Close Transaction Case'}
                  </button>
                </div>
              </div>



              {/* Failure Root Cause & Violated Rule Diagnostics Card */}
              {isFailRecord && (
                <div className="p-4 bg-rose-50/80 rounded-xl border border-rose-300 text-rose-950 text-xs space-y-2.5 shadow-2xs shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-200/80 pb-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={17} className="text-rose-600 shrink-0" />
                      <span className="font-bold text-rose-900 font-mono text-xs uppercase tracking-wider">
                        Failure Diagnostics & Violated Rule Box
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[10px]">
                      <span className="px-2 py-0.5 rounded font-bold bg-rose-600 text-white">
                        VERDICT: {rowValDetails?.status || inspectingRow.validationResult || 'FAIL'}
                      </span>
                      <span className="px-2 py-0.5 rounded font-bold bg-white text-rose-800 border border-rose-300">
                        PIPELINE ACTION: STOP
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-0.5 text-[11px]">
                    <div className="bg-white/90 p-2.5 rounded-lg border border-rose-200 space-y-1">
                      <div className="text-slate-500 font-mono text-[10px] font-semibold uppercase">Failing Rule / Step:</div>
                      <div className="font-bold text-slate-900">
                        {rowValDetails?.tableRuleViolation?.ruleName ||
                          rowValDetails?.tableRuleViolation?.stepId ||
                          (rowValDetails?.cardinality?.status === 'FAIL' ? `Cardinality Check (${rowValDetails.cardinality.policy || 'EXACT_ONE'})` : null) ||
                          (rowValDetails?.existence?.status === 'FAIL' ? 'Target DB Record Existence' : null) ||
                          inspectingRow.executionSummary?.failingRule ||
                          activeWorkflow?.steps?.[0]?.name ||
                          'Validation Step Evaluation'}
                      </div>
                    </div>
                    <div className="bg-white/90 p-2.5 rounded-lg border border-rose-200 space-y-1">
                      <div className="text-slate-500 font-mono text-[10px] font-semibold uppercase">Failing Stage:</div>
                      <div className="font-bold text-slate-900">
                        {rowValDetails?.tableRuleViolation?.stageName ||
                          (Array.isArray(rowValDetails?.stageHistory) ? (rowValDetails.stageHistory.find((s: any) => s.status === 'FAIL')?.stageName || rowValDetails.stageHistory[0]?.stageName) : null) ||
                          inspectingRow.executionSummary?.failingStage ||
                          activeWorkflow?.stages?.[0]?.name ||
                          'Validation Stage'}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white/90 p-3 rounded-lg border border-rose-200 space-y-1.5 text-[11px]">
                    <div className="text-slate-500 font-mono text-[10px] font-semibold uppercase">Root Cause & Violated Condition:</div>
                    <div className="font-medium text-rose-900 leading-relaxed">
                      {rowValDetails?.cardinality?.status === 'FAIL' ? (
                        <>
                          Multi-leg cardinality policy breach: expected <strong>{rowValDetails.cardinality.policy === 'EXACT_ONE' ? 'exactly 1 record' : rowValDetails.cardinality.policy}</strong>, but external query returned <strong>{rowValDetails.cardinality.actualCount ?? inspectorLegs.length} returned records</strong>. Reason: {rowValDetails.cardinality.reason || 'Multiple settlement records found'}.
                        </>
                      ) : rowValDetails?.tableRuleViolation ? (
                        <>
                          Table validation rule violation: <strong>{rowValDetails.tableRuleViolation.ruleName || rowValDetails.tableRuleViolation.stepId}</strong>. {rowValDetails.tableRuleViolation.message || rowValDetails.tableRuleViolation.detail || 'Condition not satisfied by target ledger records'}.
                        </>
                      ) : rowValDetails?.existence?.status === 'FAIL' ? (
                        <>
                          Record not found in target database: Target query returned 0 rows in table <strong className="font-mono text-rose-950">{rowValDetails.existence.targetTable || activeWorkflow?.targetTable || 'target_table'}</strong>.
                        </>
                      ) : (
                        formatValidationDetail(inspectingRow.validationDetail, 'Validation criteria failed during multi-stage pipeline execution.')
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Central Repository Lineage & Cross-Task Duplicate Detection Card */}
              {(inspectingRow.sourceRecord?._isDuplicate || inspectingRow.sourceRecord?.isDuplicate) ? (
                <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-purple-950 text-xs space-y-1.5 shadow-2xs shrink-0">
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
                </div>
              ) : null}

              {/* Scrollable Container for Accordions */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {/* =========================================================================
                    ACCORDION 1: DATA COMPARISON (INPUT DATA & RETURNED DB DATA IN ONE REAL TABLE)
                    ========================================================================= */}
                <div className="border border-blue-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => toggleDrilldownAccordion('inspect_data_comparison')}
                    className="w-full p-3.5 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white hover:bg-blue-50/90 transition flex items-center justify-between text-left cursor-pointer border-b border-blue-100"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="text-blue-600 transition-transform duration-200">
                        {isAccordionOpen('inspect_data_comparison', true) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                      <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700 shrink-0">
                        <Table size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-900 uppercase font-mono tracking-wider">
                            Data Comparison: Input Data &amp; Returned DB Data
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            {inspectComparisonColumns.length} Columns
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            1 Input Row &bull; {inspectorLegs.length > 0 ? (inspectLegIndex >= 0 ? `Focused Record #${inspectLegIndex + 1} of ${inspectorLegs.length}` : `${inspectorLegs.length} Returned DB Records`) : inspectTargetRecord ? '1 DB Row' : '0 DB Records'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate font-mono">
                          Unified horizontal table comparing task input values against external database mirror ledger ({inspectTargetDb}.{inspectTargetTable})
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {inspectTargetRecord ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                          <CheckCircle2 size={11} /> DB Records Found ({inspectorLegs.length || 1})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                          <AlertTriangle size={11} /> 0 Records in DB
                        </span>
                      )}
                    </div>
                  </button>

                  {isAccordionOpen('inspect_data_comparison', true) && (
                    <div className="p-3.5 space-y-3 bg-white animate-in fade-in-50 duration-150">
                      {/* Integrated Multi-Leg Response Envelope Banner & Switcher Tabs */}
                      {inspectorLegs.length > 0 ? (
                        <div className="p-3 bg-gradient-to-r from-slate-50 via-indigo-50/40 to-slate-50 rounded-xl border border-indigo-200 text-slate-800 text-xs space-y-2.5 shadow-2xs">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2">
                            <div className="flex items-center gap-2">
                              <div className="p-1 rounded-md bg-indigo-100 text-indigo-700">
                                <Layers size={14} />
                              </div>
                              <span className="font-bold text-xs text-indigo-950 font-mono uppercase tracking-wider">
                                Returned Data Response Envelope: {inspectorLegs.length} Returned DB Record{inspectorLegs.length > 1 ? 's' : ''}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-200 text-indigo-900 border border-indigo-300">
                                {inspectTargetDb}.{inspectTargetTable}
                              </span>
                              {activeStageEnvelope?.queriedAt && (
                                <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                                  &bull; Queried: {String(activeStageEnvelope.queriedAt).replace('T', ' ').slice(0, 19)}
                                </span>
                              )}
                              {auditMetadata?.statusVersion != null && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-semibold">
                                  v{auditMetadata.statusVersion}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px]">
                              {displayTotalAmt > 0 && (
                                <span className="px-2 py-0.5 rounded bg-white text-slate-800 border border-slate-300 font-bold">
                                  Gross: {currencyFound ? `${currencyFound} ` : ''}{displayTotalAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              )}
                              {displayFeeAmt > 0 && (
                                <span className="px-2 py-0.5 rounded bg-white text-amber-800 border border-amber-300 font-bold">
                                  Fees: {currencyFound ? `${currencyFound} ` : ''}{displayFeeAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              )}
                              {displayTotalAmt > 0 && (
                                <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 border border-indigo-300 font-bold">
                                  Net: {currencyFound ? `${currencyFound} ` : ''}{displayNetAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              )}
                              {hasReversal && (
                                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold flex items-center gap-1">
                                  <AlertTriangle size={10} className="text-amber-700" /> Reversal Present
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Interactive Multi-Leg Switcher Tabs */}
                          {inspectorLegs.length > 1 && (
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                              <span className="text-[10px] font-bold text-slate-500 uppercase font-mono mr-1">Filter View:</span>
                              <button
                                type="button"
                                onClick={() => setInspectLegIndex(-1)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                  inspectLegIndex === -1
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                                }`}
                              >
                                <Table size={12} />
                                <span>All Response Data ({inspectorLegs.length})</span>
                              </button>

                              {inspectorLegs.map((leg: any, idx: number) => {
                                const legObj = leg?.payload || leg || {};
                                const proc = getCaseInsensitiveVal(legObj, 'PROC_NAME') || leg.legType || leg._procName || `Record #${idx + 1}`;
                                const isRvs = String(proc).toUpperCase() === 'RVS';
                                const legAmt = getCaseInsensitiveVal(legObj, 'reqamt') ?? getCaseInsensitiveVal(legObj, 'amount') ?? getCaseInsensitiveVal(legObj, 'amnt1');
                                const legTbl = leg._sourceTable || inspectTargetTable;
                                const isSelected = inspectLegIndex === idx;

                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setInspectLegIndex(idx)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer border ${
                                      isSelected
                                        ? isRvs
                                          ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                                          : 'bg-blue-600 text-white border-blue-700 shadow-xs'
                                        : isRvs
                                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                                          : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
                                    }`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : isRvs ? 'bg-amber-500' : 'bg-blue-500'}`} />
                                    <span>#{idx + 1}: {String(proc)} ({legTbl})</span>
                                    {legAmt !== undefined && legAmt !== null && (
                                      <span className={`text-[10px] px-1 py-0.2 rounded font-semibold ${
                                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                                      }`}>
                                        {formatCellVal(legAmt)}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : inspectIsNotFoundInDb ? (
                        <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-xs flex items-center justify-between shadow-2xs">
                          <div className="flex items-center gap-2">
                            <AlertTriangle size={15} className="text-rose-600" />
                            <span className="font-bold text-rose-900 font-mono">External Target Ledger: 0 Mirror Records Returned</span>
                            <span className="text-[11px] text-rose-700">({inspectTargetDb}.{inspectTargetTable})</span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-200 text-rose-900 border border-rose-300">
                            NOT FOUND IN TARGET DB
                          </span>
                        </div>
                      ) : null}

                      {/* Sub-header banner if viewing focused record */}
                      {inspectLegIndex >= 0 && inspectorLegs[inspectLegIndex] && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-indigo-50 border border-indigo-200 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-indigo-900 font-mono">
                              Focused on Record #{inspectLegIndex + 1} of {inspectorLegs.length}:
                            </span>
                            <span className="px-2 py-0.5 rounded bg-indigo-200 text-indigo-900 font-mono font-bold text-[10px]">
                              {String(getCaseInsensitiveVal(inspectorLegs[inspectLegIndex]?.payload || inspectorLegs[inspectLegIndex], 'PROC_NAME') || `Record #${inspectLegIndex + 1}`)}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                              (Highlighted in comparison table below &bull; One row for each returned record)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setInspectLegIndex(-1)}
                            className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-indigo-700 font-bold border border-indigo-300 text-[10px] cursor-pointer"
                          >
                            Clear Focus
                          </button>
                        </div>
                      )}

                      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs max-h-[420px] overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-mono text-[10px] uppercase font-bold sticky top-0 z-20 border-b border-slate-200">
                              <th className="py-2.5 px-3.5 whitespace-nowrap bg-slate-200/90 text-slate-800 border-r border-slate-300 sticky left-0 z-30 min-w-[200px] shadow-xs">
                                Data Record Source
                              </th>
                              {inspectComparisonColumns.map(col => (
                                <th key={col.key} className="py-2.5 px-3 whitespace-nowrap border-r border-slate-200">
                                  <div className="flex items-center gap-1">
                                    <span>{col.label}</span>
                                    {col.isKeyParam && (
                                      <span className="text-[8px] px-1 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200 font-mono">KEY</span>
                                    )}
                                  </div>
                                </th>
                              ))}
                              <th className="py-2.5 px-3 text-center whitespace-nowrap bg-slate-100 w-28">
                                Comparison
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-xs">
                            {/* ROW 1: INPUT DATA */}
                            <tr className="hover:bg-blue-50/30 transition bg-blue-50/15">
                              <td className="py-2.5 px-3.5 whitespace-nowrap bg-blue-50/95 font-bold border-r border-blue-200 text-blue-950 sticky left-0 z-10 shadow-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <FileSpreadsheet size={13} className="text-blue-600 shrink-0" />
                                    <span>Input Data</span>
                                  </div>
                                  <span className="px-1.5 py-0.2 rounded text-[9px] bg-blue-200 text-blue-800 border border-blue-300 font-bold">TASK DATASET</span>
                                </div>
                              </td>
                              {inspectComparisonColumns.map(col => {
                                const inVal = getCaseInsensitiveVal(cleanInputRecord, col.key);
                                return (
                                  <td key={col.key} className="py-2.5 px-3 whitespace-nowrap border-r border-slate-100 text-slate-900 font-semibold bg-white">
                                    {formatCellVal(inVal)}
                                  </td>
                                );
                              })}
                              <td className="py-2.5 px-3 whitespace-nowrap text-center text-[10px] font-bold text-blue-800 bg-blue-50/40">
                                BASELINE
                              </td>
                            </tr>

                            {/* ROWS 2+: RETURNED DB DATA - ONE ROW FOR EACH */}
                            {inspectorLegs.length > 0 ? (
                              inspectorLegs.map((leg, legIdx) => {
                                const isFocused = inspectLegIndex === legIdx;
                                const legObj = leg?.payload || leg || {};
                                const proc = getCaseInsensitiveVal(legObj, 'PROC_NAME') || leg.legType || `Record #${legIdx + 1}`;
                                const isRvs = String(proc || '').toUpperCase() === 'RVS';
                                const legRrn = getCaseInsensitiveVal(legObj, 'refnum') ?? getCaseInsensitiveVal(legObj, 'rrn') ?? getCaseInsensitiveVal(legObj, 'retrieval_ref_num');

                                // Calculate diffs between input and this leg
                                let diffCount = 0;
                                let evaluatedCols = 0;
                                inspectComparisonColumns.forEach(col => {
                                  const inVal = getCaseInsensitiveVal(cleanInputRecord, col.key);
                                  const tgtVal = getCaseInsensitiveVal(legObj, col.key);
                                  if (inVal !== undefined && tgtVal !== undefined) {
                                    evaluatedCols++;
                                    if (!areValuesEqual(inVal, tgtVal)) {
                                      diffCount++;
                                    }
                                  }
                                });

                                return (
                                  <tr
                                    key={legIdx}
                                    className={`hover:bg-indigo-50/30 transition ${
                                      isFocused
                                        ? 'ring-2 ring-indigo-500 bg-indigo-50/60'
                                        : isRvs
                                          ? 'bg-amber-50/20'
                                          : legIdx % 2 === 0
                                            ? 'bg-white'
                                            : 'bg-slate-50/30'
                                    }`}
                                  >
                                    <td className={`py-2.5 px-3.5 whitespace-nowrap font-bold border-r border-indigo-200 text-indigo-950 sticky left-0 z-10 shadow-xs ${isFocused ? 'bg-indigo-100' : isRvs ? 'bg-amber-50/95' : 'bg-indigo-50/95'}`}>
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <Database size={13} className={isRvs ? 'text-amber-700 shrink-0' : 'text-indigo-600 shrink-0'} />
                                          <span className="truncate">
                                            Returned Record #{legIdx + 1}
                                          </span>
                                          {isFocused && (
                                            <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-600 text-white font-mono font-bold">
                                              FOCUSED
                                            </span>
                                          )}
                                          {legRrn && (
                                            <span className="text-[10px] text-slate-500 font-mono font-normal hidden lg:inline">
                                              ({String(legRrn)})
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${isRvs ? 'bg-amber-200 text-amber-900 border-amber-300' : 'bg-blue-200 text-blue-900 border-blue-300'}`}>
                                            {String(proc).toUpperCase()}
                                          </span>
                                          <span className="px-1 py-0.2 rounded text-[8px] bg-slate-100 text-slate-600 border border-slate-200 font-normal">
                                            {leg._sourceTable || inspectTargetTable}
                                          </span>
                                        </div>
                                      </div>
                                    </td>

                                    {inspectComparisonColumns.map(col => {
                                      const inVal = getCaseInsensitiveVal(cleanInputRecord, col.key);
                                      const tgtVal = getCaseInsensitiveVal(legObj, col.key);

                                      if (inVal !== undefined && tgtVal !== undefined) {
                                        const isMatch = areValuesEqual(inVal, tgtVal);
                                        return (
                                          <td
                                            key={col.key}
                                            className={`py-2.5 px-3 whitespace-nowrap border-r ${
                                              isMatch
                                                ? 'border-slate-100 text-emerald-950 bg-emerald-50/25'
                                                : 'border-rose-200 text-rose-950 bg-rose-50/80 font-bold'
                                            }`}
                                            title={isMatch ? 'Matches input value' : `Mismatch: Input='${inVal}' vs DB='${tgtVal}'`}
                                          >
                                            {isMatch ? (
                                              <span className="font-semibold">{formatCellVal(tgtVal)}</span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded border border-rose-300">
                                                {formatCellVal(tgtVal)}
                                              </span>
                                            )}
                                          </td>
                                        );
                                      }

                                      if (tgtVal !== undefined) {
                                        return (
                                          <td key={col.key} className="py-2.5 px-3 whitespace-nowrap border-r border-slate-100 text-slate-700 bg-white">
                                            {formatCellVal(tgtVal)}
                                          </td>
                                        );
                                      }

                                      return (
                                        <td key={col.key} className="py-2.5 px-3 whitespace-nowrap border-r border-slate-100 text-slate-300 italic bg-white">
                                          —
                                        </td>
                                      );
                                    })}

                                    <td className="py-2.5 px-3 whitespace-nowrap text-center">
                                      <div className="flex items-center justify-center gap-1.5">
                                        {diffCount === 0 && evaluatedCols > 0 ? (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                            <Check size={10} /> MATCH
                                          </span>
                                        ) : diffCount > 0 ? (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]">
                                            <AlertTriangle size={10} /> {diffCount} DIFF
                                          </span>
                                        ) : (
                                          <span className="text-[10px] text-slate-400 italic">EVALUATED</span>
                                        )}
                                        {inspectorLegs.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => setInspectLegIndex(inspectLegIndex === legIdx ? -1 : legIdx)}
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold transition cursor-pointer border ${
                                              inspectLegIndex === legIdx
                                                ? 'bg-indigo-600 text-white border-indigo-700'
                                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                                            }`}
                                            title={inspectLegIndex === legIdx ? 'Reset to all records' : 'Focus this record in comparison'}
                                          >
                                            {inspectLegIndex === legIdx ? 'Focused ✓' : 'Focus'}
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            ) : inspectTargetRecord ? (
                              <tr className="hover:bg-indigo-50/30 transition bg-white">
                                <td className="py-2.5 px-3.5 whitespace-nowrap font-bold border-r border-indigo-200 text-indigo-950 sticky left-0 z-10 shadow-xs bg-indigo-50/95">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                      <Database size={13} className="text-indigo-600 shrink-0" />
                                      <span>Returned DB Data</span>
                                    </div>
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-200 text-indigo-900 border border-indigo-300">
                                      {inspectTargetTable}
                                    </span>
                                  </div>
                                </td>
                                {inspectComparisonColumns.map(col => {
                                  const inVal = getCaseInsensitiveVal(cleanInputRecord, col.key);
                                  const tgtVal = getCaseInsensitiveVal(inspectTargetRecord, col.key);

                                  if (inVal !== undefined && tgtVal !== undefined) {
                                    const isMatch = areValuesEqual(inVal, tgtVal);
                                    return (
                                      <td
                                        key={col.key}
                                        className={`py-2.5 px-3 whitespace-nowrap border-r ${
                                          isMatch ? 'border-slate-100 text-emerald-950 bg-emerald-50/25' : 'border-rose-200 text-rose-950 bg-rose-50/80 font-bold'
                                        }`}
                                      >
                                        {isMatch ? (
                                          <span className="font-semibold">{formatCellVal(tgtVal)}</span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded border border-rose-300">
                                            {formatCellVal(tgtVal)}
                                          </span>
                                        )}
                                      </td>
                                    );
                                  }
                                  return (
                                    <td key={col.key} className="py-2.5 px-3 whitespace-nowrap border-r border-slate-100 text-slate-700 bg-white">
                                      {formatCellVal(tgtVal)}
                                    </td>
                                  );
                                })}
                                <td className="py-2.5 px-3 whitespace-nowrap text-center">
                                  <span className="text-[10px] text-slate-400 italic">EVALUATED</span>
                                </td>
                              </tr>
                            ) : (
                              <tr>
                                <td className="py-3 px-3.5 whitespace-nowrap bg-rose-50 font-bold border-r border-rose-200 text-rose-950 sticky left-0 z-10 shadow-xs">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                      <Database size={13} className="text-rose-600 shrink-0" />
                                      <span>Returned DB Data</span>
                                    </div>
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-200 text-rose-900 border border-rose-300">0 ROWS</span>
                                  </div>
                                </td>
                                <td colSpan={inspectComparisonColumns.length + 1} className="py-3 px-4 text-rose-700 font-mono text-xs bg-rose-50/30">
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle size={14} className="text-rose-600 shrink-0" />
                                    <span>No records returned from external target table {inspectTargetDb}.{inspectTargetTable} matching query lookup parameters.</span>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Embedded Returned Records Detail Cards & Raw Payloads */}
                      {inspectorLegs.length > 0 && (
                        <div className="pt-2 border-t border-slate-200 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider flex items-center gap-1.5">
                              <Layers size={13} className="text-indigo-600" />
                              Returned DB Records Payload Inspection ({inspectorLegs.length} Record{inspectorLegs.length > 1 ? 's' : ''})
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              All {inspectorLegs.length} external database response records returned from query lookup
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-2.5">
                            {inspectorLegs.map((leg: any, idx: number) => {
                              const legObj = leg?.payload || leg || {};
                              const proc = getCaseInsensitiveVal(legObj, 'PROC_NAME') || leg.legType || 'TRANSACTION_RECORD';
                              const isRvs = String(proc).toUpperCase() === 'RVS';
                              const legAmt = getCaseInsensitiveVal(legObj, 'reqamt') ?? getCaseInsensitiveVal(legObj, 'amount');
                              const legCurr = getCaseInsensitiveVal(legObj, 'currency') ?? getCaseInsensitiveVal(legObj, 'curr') ?? 'USD';
                              const legRef = getCaseInsensitiveVal(legObj, 'refnum') ?? getCaseInsensitiveVal(legObj, 'rrn') ?? getCaseInsensitiveVal(legObj, 'retrieval_ref_num');
                              const legTime = getCaseInsensitiveVal(legObj, 'ttime') ?? getCaseInsensitiveVal(legObj, 'value_date') ?? getCaseInsensitiveVal(legObj, 'created_at');
                              const isFocused = inspectLegIndex === idx;

                              const attributes: { key: string; value: any }[] = [];
                              for (const [k, v] of Object.entries(legObj)) {
                                if (!k.startsWith('_') && v !== undefined && v !== null && typeof v !== 'object') {
                                  attributes.push({ key: k, value: v });
                                }
                              }

                              const payloadJson = JSON.stringify(legObj, null, 2);
                              const copyKey = `inspect_leg_${idx}`;

                              return (
                                <div
                                  key={idx}
                                  className={`rounded-xl border transition p-3 space-y-2.5 bg-slate-50/50 shadow-2xs ${
                                    isFocused
                                      ? 'border-indigo-400 ring-2 ring-indigo-200 bg-indigo-50/20'
                                      : isRvs
                                        ? 'border-amber-300'
                                        : 'border-slate-200 hover:border-slate-300'
                                  }`}
                                >
                                  {/* Sub-header */}
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                                        isRvs ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                                      }`}>
                                        RECORD #{idx + 1}
                                      </span>
                                      <span className="font-bold text-xs text-slate-900 font-mono">
                                        PROC: {String(proc)}
                                      </span>
                                      {legRef && (
                                        <span className="text-[11px] font-mono text-slate-500">
                                          &bull; RRN: <strong className="text-slate-700">{String(legRef)}</strong>
                                        </span>
                                      )}
                                      {legTime && (
                                        <span className="text-[11px] font-mono text-slate-500">
                                          &bull; Time: {String(legTime).replace('T', ' ').slice(0, 19)}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      {legAmt !== undefined && legAmt !== null && (
                                        <span className={`px-2 py-0.5 rounded font-mono text-xs font-bold ${
                                          isRvs ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                        }`}>
                                          {String(legCurr)} {formatCellVal(legAmt)}
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => setInspectLegIndex(isFocused ? -1 : idx)}
                                        className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer border ${
                                          isFocused
                                            ? 'bg-indigo-600 text-white border-indigo-700'
                                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                                        }`}
                                      >
                                        {isFocused ? 'Viewing in Comparison ✓' : 'Focus in Comparison'}
                                      </button>
                                    </div>
                                  </div>

                                  {/* Attributes grid */}
                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-[11px] font-mono">
                                    {attributes.slice(0, 16).map(attr => (
                                      <div key={attr.key} className="bg-white p-2 rounded-lg border border-slate-100 space-y-0.5 shadow-3xs">
                                        <span className="text-[10px] text-slate-500 uppercase font-semibold block truncate" title={attr.key}>
                                          {formatHeaderLabel(attr.key)}
                                        </span>
                                        <span className="font-bold text-slate-800 block truncate" title={String(attr.value)}>
                                          {formatCellVal(attr.value)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Raw JSON toggle */}
                                  <details className="text-[11px] font-mono group">
                                    <summary className="cursor-pointer text-indigo-600 hover:text-indigo-800 font-semibold select-none flex items-center justify-between">
                                      <span>View Raw Record JSON Payload</span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          handleCopyPayload(payloadJson, copyKey);
                                        }}
                                        className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 text-[10px] font-mono border border-slate-300 cursor-pointer"
                                      >
                                        {copiedPayloadKey === copyKey ? 'Copied!' : 'Copy JSON'}
                                      </button>
                                    </summary>
                                    <pre className="mt-2 p-2.5 bg-slate-900 text-emerald-400 rounded-lg overflow-x-auto text-[10px] whitespace-pre-wrap max-h-48 overflow-y-auto">
                                      {payloadJson}
                                    </pre>
                                  </details>
                                </div>
                              );
                            })}
                          </div>

                          {/* Full Stage Response Envelope JSON Viewer */}
                          {rawReturnedData && typeof rawReturnedData === 'object' && Object.keys(rawReturnedData).length > 0 && (
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-700 font-mono uppercase tracking-wider">
                                  Full Stage Response Data Envelope (JSONB)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyPayload(JSON.stringify(rawReturnedData, null, 2), 'inspect_stage_envelope')}
                                  className="px-2.5 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 text-[10px] font-mono border border-slate-300 cursor-pointer"
                                >
                                  {copiedPayloadKey === 'inspect_stage_envelope' ? 'Copied Envelope!' : 'Copy Full Envelope'}
                                </button>
                              </div>
                              <pre className="p-2.5 bg-slate-950 text-emerald-400 rounded-lg overflow-x-auto text-[10px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                                {JSON.stringify(rawReturnedData, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* =========================================================================
                    ACCORDION 2: VALIDATIONS CONDUCTED (ALL STAGES & STEPS IN ONE REAL TABLE)
                    ========================================================================= */}
                <div className="border border-purple-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  <button
                    type="button"
                    onClick={() => toggleDrilldownAccordion('inspect_validations_conducted')}
                    className="w-full p-3.5 bg-gradient-to-r from-purple-50/70 via-slate-50/50 to-white hover:bg-purple-50/90 transition flex items-center justify-between text-left cursor-pointer border-b border-purple-100"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="text-purple-600 transition-transform duration-200">
                        {isAccordionOpen('inspect_validations_conducted', true) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                      <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700 shrink-0">
                        <GitCompare size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-900 uppercase font-mono tracking-wider">
                            Validations Conducted: Multi-Stage Evaluation Steps
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {modalAuditTrail.length} Steps Recorded &bull; {modalAuditTrail.filter((s: any) => s.validationResult === 'PASS').length} Passed &bull; {modalAuditTrail.filter((s: any) => s.validationResult === 'FAIL').length} Failed
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 truncate font-mono">
                          Sequential execution checklist and verification findings for transaction {inspectingRow.rowId}
                        </p>
                      </div>
                    </div>
                  </button>

                  {isAccordionOpen('inspect_validations_conducted', true) && (
                    <div className="p-3.5 space-y-3 bg-white animate-in fade-in-50 duration-150">
                      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 text-slate-700 font-mono text-[10px] uppercase font-bold border-b border-slate-200">
                              <th className="py-2.5 px-3 text-center w-12">#</th>
                              <th className="py-2.5 px-3 min-w-[220px]">Validation Stage / Rule Name</th>
                              <th className="py-2.5 px-3 min-w-[140px]">Check Type</th>
                              <th className="py-2.5 px-3 text-center w-28">Status</th>
                              <th className="py-2.5 px-3 text-center w-28">Action</th>
                              <th className="py-2.5 px-4 min-w-[280px]">Evaluation Findings &amp; Discrepancy Record</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-xs">
                            {modalAuditTrail.map((entry: any, sIdx: number) => {
                              const isPass = entry.validationResult === 'PASS';
                              const isFail = entry.validationResult === 'FAIL';

                              return (
                                <tr key={sIdx} className={`hover:bg-slate-50/70 transition ${isFail ? 'bg-rose-50/30' : sIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/20'}`}>
                                  <td className="py-2.5 px-3 text-center font-bold text-slate-500">{sIdx + 1}</td>
                                  <td className="py-2.5 px-3 font-semibold text-slate-900">
                                    <div className="flex items-center gap-1.5">
                                      {isPass ? (
                                        <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                                      ) : isFail ? (
                                        <AlertTriangle size={13} className="text-rose-600 shrink-0" />
                                      ) : (
                                        <HelpCircle size={13} className="text-slate-400 shrink-0" />
                                      )}
                                      <span>{entry.ruleName || entry.stageName}</span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600">
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200">
                                      {String(entry.stageName || 'CHECK')}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      isPass
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : isFail
                                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                        : 'bg-slate-100 text-slate-700 border border-slate-300'
                                    }`}>
                                      {entry.validationResult}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                      isFail
                                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                                        : 'bg-slate-50 text-slate-700 border-slate-200'
                                    }`}>
                                      ➔ {entry.pipelineAction}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-4 font-sans text-xs">
                                    <div className="space-y-1">
                                      <div className={`leading-relaxed ${isFail ? 'font-semibold text-rose-900' : 'text-slate-700'}`}>
                                        {typeof entry.message === 'string'
                                          ? entry.message
                                          : formatValidationDetail(entry.message, 'Evaluation complete')}
                                      </div>
                                      {entry.errorDetail && typeof entry.errorDetail === 'string' && (
                                        <div className="text-[10px] font-mono text-rose-700 bg-rose-50 p-1.5 rounded border border-rose-200">
                                          {entry.errorDetail}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>


              </div>

              {/* Suggested Remedy SQL */}
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

              <div className="flex justify-end pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setInspectingRow(null)}
                  className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs cursor-pointer transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
        </ErrorBoundary>
      )}

      {/* Toast Alert for Reversion Success */}
      {reversionSuccessAlert && (
        <div className="fixed bottom-12 right-6 z-50 bg-slate-900 text-white border border-emerald-500/50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCheck size={18} />
          </div>
          <div>
            <div className="text-xs font-bold text-emerald-300 font-mono">Point-in-Time Rollback Success</div>
            <p className="text-[11px] text-slate-300">{reversionSuccessAlert}</p>
          </div>
          <button
            type="button"
            onClick={() => setReversionSuccessAlert(null)}
            className="text-slate-400 hover:text-white p-1 ml-2 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* REVERSION HISTORY MODAL */}
      {showReversionHistory && (
        <ErrorBoundary fallbackTitle="Reversion History Error" fallbackMessage="Could not render reversion audit history.">
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-xl w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <History size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Task Snapshot & Reversion History</h3>
                  <p className="text-[11px] text-slate-500 font-mono">Task #{selectedIssue.id} Audit Snapshots</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReversionHistory(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {reversionHistory.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No previous snapshots recorded for this task. Snapshots are captured automatically when running staged fixes.
                </div>
              ) : (
                reversionHistory.map((snap, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="font-bold text-slate-800">
                        {snap.transactionId ? `Record #${snap.transactionId}` : 'Full Batch Snapshot'}
                      </span>
                      <span className="text-slate-500">{new Date(snap.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono">
                      <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded font-bold">
                        {snap.processType}
                      </span>
                      <span className="text-slate-500">Captured by: {snap.createdBy || 'operator'}</span>
                      {snap.revertedAt && (
                        <span className="px-1.5 py-0.2 bg-rose-100 text-rose-800 rounded font-bold">
                          Reverted {new Date(snap.revertedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowReversionHistory(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        </ErrorBoundary>
      )}

      {/* ADD IN-FLIGHT VALIDATION BOX MODAL */}
      {showAddBoxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Plus size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Add In-Flight Validation Box</h3>
                  <p className="text-[11px] text-slate-500">Attach an additional verification stage to this investigation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddBoxModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddValidationBox} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Validation Box Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. In-Flight Authorization Code Check"
                  value={newBoxRuleName}
                  onChange={e => setNewBoxRuleName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-emerald-600 font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Target Column
                  </label>
                  <select
                    value={newBoxTargetCol}
                    onChange={e => setNewBoxTargetCol(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-emerald-600 font-mono text-xs cursor-pointer"
                  >
                    {columnDefs.map(c => (
                      <option key={c.key} value={c.key}>{c.label} ({c.key})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Operator
                  </label>
                  <select
                    value={newBoxOperator}
                    onChange={e => setNewBoxOperator(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-emerald-600 font-mono text-xs cursor-pointer"
                  >
                    <option value="NOT_NULL">NOT NULL / EXISTS</option>
                    <option value="EQUALS">EQUALS</option>
                    <option value="GREATER_THAN">GREATER THAN</option>
                    <option value="NUMERIC">MUST BE NUMERIC</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Expected Value (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. SETTLED or 0.00"
                  value={newBoxExpectedVal}
                  onChange={e => setNewBoxExpectedVal(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-emerald-600 font-sans"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddBoxModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newBoxRuleName.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  Attach to Pipeline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SWAP WORKFLOW MODAL */}
      {showSwapWorkflowModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <GitBranch size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Swap Investigation Workflow</h3>
                  <p className="text-[11px] text-slate-500">Switch active validation rules pipeline for Task #{selectedIssue.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSwapWorkflowModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {availableWorkflows.map(wf => (
                <div
                  key={wf.id}
                  onClick={() => handleSwapWorkflow(wf)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    activeWorkflow?.id === wf.id
                      ? 'bg-blue-50 border-blue-400 text-blue-950 font-bold'
                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900">{wf.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {(wf.stages || []).length} Stages • {wf.steps?.length || 0} Rules • Category: {wf.category}
                    </div>
                  </div>
                  {activeWorkflow?.id === wf.id ? (
                    <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold">Active</span>
                  ) : (
                    <button
                      type="button"
                      className="px-2 py-1 bg-slate-100 hover:bg-blue-600 hover:text-white rounded text-[10px] font-semibold text-slate-700 transition"
                    >
                      Select
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSwapWorkflowModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COLLABORATIVE CHAT & SOLUTION SCRIPT CONSENSUS DRAWER */}
      {showChatDrawer && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[480px] bg-white border-l border-slate-300 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          {/* Drawer Header */}
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <MessageSquare size={16} />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-xs font-bold text-white">Team Consensus & Solution Hub</h3>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-blue-500/30 text-blue-300 rounded font-bold">
                    #{selectedIssue.id}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">Collaborate, mention teammates, and stage agreed scripts</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowChatDrawer(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Drawer Message List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
            {(selectedIssue.chat || []).length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs space-y-2">
                <MessageSquare size={24} className="mx-auto text-slate-300" />
                <p>No messages posted for this task yet.</p>
                <p className="text-[11px] text-slate-500">Mention peers with @, attach the investigation summary, or propose a solution script.</p>
              </div>
            ) : (
              (selectedIssue.chat || []).map((msg: any) => {
                const isMe = msg.senderId === currentUser.id;
                return (
                  <div key={msg.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono px-1">
                      <span className="font-bold text-slate-800">
                        {msg.senderName} ({msg.senderRole || 'operator'})
                      </span>
                      <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                    </div>

                    <div className={`p-3 rounded-2xl text-xs space-y-2 border ${
                      isMe ? 'bg-blue-50/80 border-blue-200 text-slate-800' : 'bg-white border-slate-200 text-slate-800'
                    }`}>
                      {/* Mentions badges */}
                      {Array.isArray(msg.mentions) && msg.mentions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {msg.mentions.map((m: any, mIdx: number) => (
                            <span key={mIdx} className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                              @{m.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Text */}
                      {msg.text && <p className="leading-relaxed">{msg.text}</p>}

                      {/* Attached Investigation Summary Card */}
                      {msg.attachedSummary && (
                        <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200 space-y-1 text-[11px]">
                          <div className="font-bold text-slate-700 flex items-center gap-1 font-mono uppercase text-[10px]">
                            <ShieldCheck size={12} className="text-emerald-600" />
                            <span>Attached Investigation Summary</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-600">
                            <div>Total Records: <strong>{msg.attachedSummary.totalRecords}</strong></div>
                            <div>Discrepancies: <strong className="text-rose-600">{msg.attachedSummary.discrepancyCount}</strong></div>
                          </div>
                          {msg.attachedSummary.keyFindings && (
                            <p className="text-[10px] text-slate-600 italic font-sans">{msg.attachedSummary.keyFindings}</p>
                          )}
                        </div>
                      )}

                      {/* Proposed Solution Script Card */}
                      {msg.solutionProposal && (
                        <div className="p-3 bg-slate-900 text-slate-100 rounded-xl space-y-2 border border-slate-800">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="font-bold text-emerald-400 flex items-center gap-1">
                              <FileCode size={11} />
                              <span>Proposed Solution Script</span>
                            </span>
                            <span className="px-1.5 py-0.2 bg-blue-500/30 text-blue-300 rounded font-bold">
                              {msg.solutionProposal.processType || 'INTERNAL_STAGED_FIX'}
                            </span>
                          </div>

                          <pre className="bg-black/50 p-2 rounded text-[11px] font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap max-h-32">
                            {msg.solutionProposal.script}
                          </pre>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-slate-400 font-mono">
                              By: {msg.solutionProposal.proposedBy}
                            </span>
                            {msg.solutionProposal.accepted ? (
                              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded text-[10px] font-bold flex items-center gap-1">
                                <CheckCheck size={11} />
                                <span>Accepted by {msg.solutionProposal.acceptedBy || 'consensus'}</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={acceptingProposalId === msg.id}
                                onClick={() => handleAcceptSolutionProposal(msg.id)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold shadow-xs cursor-pointer flex items-center gap-1 transition"
                              >
                                <CheckCircle size={11} />
                                <span>{acceptingProposalId === msg.id ? 'Accepting...' : 'Accept Solution Script'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Drawer Input Form */}
          <div className="p-3 bg-white border-t border-slate-200 space-y-2.5">
            {/* Quick Mentions Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto text-[10px] pb-1">
              <span className="text-slate-400 font-mono font-bold uppercase text-[9px] shrink-0">Mention:</span>
              {(users || []).slice(0, 4).map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    if (!chatMentions.some(m => m.id === u.id)) {
                      setChatMentions(prev => [...prev, { type: 'user', id: u.id, name: u.username }]);
                    }
                  }}
                  className="px-1.5 py-0.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded border border-slate-200 shrink-0 cursor-pointer"
                >
                  @{u.username}
                </button>
              ))}
              {(teams || []).map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    if (!chatMentions.some(m => m.id === t.id)) {
                      setChatMentions(prev => [...prev, { type: 'team', id: t.id, name: t.name }]);
                    }
                  }}
                  className="px-1.5 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded border border-purple-200 shrink-0 cursor-pointer font-bold"
                >
                  @{t.name}
                </button>
              ))}
            </div>

            {/* Selected Mentions Tag Pills */}
            {chatMentions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                {chatMentions.map((m, mIdx) => (
                  <span key={mIdx} className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full text-[10px] font-bold flex items-center gap-1">
                    <span>@{m.name}</span>
                    <button
                      type="button"
                      onClick={() => setChatMentions(prev => prev.filter((_, i) => i !== mIdx))}
                      className="hover:text-rose-600 cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Script Proposer Box */}
            {proposeScriptActive && (
              <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between text-white font-mono text-[10px]">
                  <span className="font-bold text-emerald-400">Propose Solution Script</span>
                  <select
                    value={proposedScriptProcessType}
                    onChange={e => setProposedScriptProcessType(e.target.value as SolutionProcessType)}
                    className="bg-slate-800 text-white rounded px-2 py-0.5 border border-slate-700 text-[10px]"
                  >
                    <option value="INTERNAL_STAGED_FIX">INTERNAL_STAGED_FIX</option>
                    <option value="CAUTIOUS_PROCESS">CAUTIOUS_PROCESS</option>
                    <option value="READ_ONLY_AUDIT">READ_ONLY_AUDIT</option>
                  </select>
                </div>
                <textarea
                  rows={3}
                  value={proposedScriptCode}
                  onChange={e => setProposedScriptCode(e.target.value)}
                  placeholder="UPDATE task_dataset_transactions SET status = 'RECONCILED' WHERE ..."
                  className="w-full bg-black/60 text-emerald-300 font-mono text-xs p-2 rounded border border-slate-800 focus:outline-none"
                />
              </div>
            )}

            {/* Actions Bar & Message Input */}
            <form onSubmit={handleSendChat} className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInputText}
                  onChange={e => setChatInputText(e.target.value)}
                  placeholder="Type a message or discuss solution..."
                  className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-600"
                />
                <button
                  type="submit"
                  disabled={isSendingChat || (!chatInputText.trim() && !proposeScriptActive)}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs cursor-pointer shadow-xs flex items-center gap-1"
                >
                  <Send size={13} />
                  <span>Send</span>
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAttachSummaryActive(prev => !prev)}
                    className={`px-2 py-1 rounded-lg border text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition ${
                      attachSummaryActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <ShieldCheck size={11} />
                    <span>{attachSummaryActive ? 'Summary Attached ✓' : 'Attach Summary'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setProposeScriptActive(prev => !prev)}
                    className={`px-2 py-1 rounded-lg border text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition ${
                      proposeScriptActive
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <FileCode size={11} />
                    <span>{proposeScriptActive ? 'Script Editor Active' : 'Propose Script'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Universal Hashtags Result Diff Modal Drawer (GAP-10) */}
      {showHashtagDiffModal && hashtagDiffResult && (
        <ErrorBoundary fallbackTitle="Hashtag Comparison Error" fallbackMessage="Could not render hashtag diff modal.">
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in duration-200">
            {/* Modal Header */}
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <span className="p-1.5 bg-amber-500/20 text-amber-300 rounded-lg">
                  <Play size={16} />
                </span>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold text-white">
                      Hashtag DB Scan & Result Diff: <span className="font-mono text-indigo-400">{hashtagDiffResult.tag}</span>
                    </h3>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      hashtagDiffResult.verdict === 'PASS'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : hashtagDiffResult.verdict === 'FLAG' || hashtagDiffResult.verdict === 'FAIL'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}>
                      {hashtagDiffResult.verdict}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Execution Run ID: <span className="font-mono">{hashtagDiffResult.runId}</span> • Duration: {hashtagDiffResult.executionDurationMs}ms
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowHashtagDiffModal(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Metrics Ribbon */}
            <div className="grid grid-cols-3 divide-x divide-slate-800 bg-slate-900/80 border-b border-slate-800 text-center py-2.5">
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold block">Rows Scanned</span>
                <span className="text-sm font-bold font-mono text-white">{hashtagDiffResult.rowsScanned}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold block">Discrepancies / Anomalies</span>
                <span className={`text-sm font-bold font-mono ${hashtagDiffResult.anomaliesDetected > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {hashtagDiffResult.anomaliesDetected}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold block">Status Verdict</span>
                <span className="text-sm font-bold font-mono text-indigo-300">{hashtagDiffResult.verdict}</span>
              </div>
            </div>

            {/* Modal Body: Side-by-Side Diff Table */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {hashtagDiffResult.errors && hashtagDiffResult.errors.length > 0 && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-rose-300 text-xs">
                  <div className="font-bold flex items-center gap-1.5 mb-1">
                    <AlertTriangle size={14} />
                    <span>Scan Warnings & Errors</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {hashtagDiffResult.errors.map((e, idx) => <li key={idx}>{e}</li>)}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-bold uppercase tracking-wider text-[10px]">
                    Side-by-Side Comparative Diff: Task Input vs. External DB Mirror
                  </span>
                  <span className="text-[11px]">
                    {hashtagDiffResult.anomalyRows.length} flagged comparison row(s)
                  </span>
                </div>

                {hashtagDiffResult.anomalyRows.length === 0 ? (
                  <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-xs">
                    <CheckCircle2 size={24} className="text-emerald-400 mx-auto mb-2" />
                    <p className="font-semibold text-white">No Discrepancies Found in Dry-Run Scan</p>
                    <p className="text-[11px] text-slate-500 mt-1">All scanned database records match the criteria expectations.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {hashtagDiffResult.anomalyRows.map((row, idx) => (
                      <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden text-xs">
                        <div className="bg-slate-900 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-[11px]">
                          <span className="font-mono text-slate-300 font-bold">
                            Record #{idx + 1} {row.id ? `(ID: ${row.id})` : ''}
                          </span>
                          <span className="text-rose-400 text-[10px] font-bold uppercase bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/40">
                            Discrepancy Detected
                          </span>
                        </div>
                        <div className="grid grid-cols-2 divide-x divide-slate-800">
                          {/* Task / Input Side */}
                          <div className="p-3 space-y-1.5 bg-blue-950/10">
                            <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider block">
                              Task Ingested Record (Source)
                            </span>
                            <div className="space-y-1 font-mono text-[11px]">
                              {Object.entries(row)
                                .filter(([k]) => !k.startsWith('_mirror_') && k !== '_discrepancies')
                                .slice(0, 8)
                                .map(([k, v]) => (
                                  <div key={k} className="flex justify-between border-b border-slate-800/60 pb-0.5">
                                    <span className="text-slate-400">{k}:</span>
                                    <span className="text-slate-200 font-semibold">{String(v ?? 'null')}</span>
                                  </div>
                                ))}
                            </div>
                          </div>

                          {/* External DB Mirror Side */}
                          <div className="p-3 space-y-1.5 bg-amber-950/10">
                            <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider block">
                              External DB Mirror (Target)
                            </span>
                            <div className="space-y-1 font-mono text-[11px]">
                              {Object.entries(row)
                                .filter(([k]) => !k.startsWith('_mirror_') && k !== '_discrepancies')
                                .slice(0, 8)
                                .map(([k, v]) => {
                                  const mirrorVal = (row as any)[`_mirror_${k}`] ?? (row as any)[k];
                                  const isDiff = mirrorVal !== undefined && String(mirrorVal) !== String(v);
                                  return (
                                    <div key={k} className={`flex justify-between border-b border-slate-800/60 pb-0.5 ${isDiff ? 'bg-rose-950/40 text-rose-300 px-1 rounded' : ''}`}>
                                      <span className="text-slate-400">{k}:</span>
                                      <span className={isDiff ? 'text-rose-400 font-bold' : 'text-slate-200'}>
                                        {String(mirrorVal ?? 'null')}
                                      </span>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Dry-run results are observational and do not mutate production database records.
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowHashtagDiffModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold cursor-pointer transition"
                >
                  Close Diff
                </button>
              </div>
            </div>
          </div>
        </div>
        </ErrorBoundary>
      )}

    </div>
  );
}
