/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Issue, HashtagPreset, User, TransactionInvestigationStatus, GlobalTransactionSchemaField } from '../../types';
import {
  Play, Download, MessageSquare, MoreHorizontal, Clock, Tag,
  Search, SlidersHorizontal, RotateCcw, ChevronRight, ChevronLeft, ChevronDown, CheckCircle2,
  AlertCircle, Link2, Check, FileSpreadsheet, Paperclip, Plus, X,
  Grid, FileText, CheckCheck, CircleDot, FolderOpen, Activity, Database, Terminal
} from 'lucide-react';
import TransactionInvestigationDrawer from './TransactionInvestigationDrawer';
import { DataTablePagination } from '../common/DataTablePagination';
import InvestigationRunningView from './InvestigationRunningView';
import CompareAndResolveModal from './CompareAndResolveModal';
import { CaseDiscussionDrawer } from './CaseDiscussionDrawer';
import { EscalateToTeamModal } from '../team/EscalateToTeamModal';
import { StageTaskModal } from './StageTaskModal';
import { TechnicianInvestigationWorkspace } from './TechnicianInvestigationWorkspace';
import { api } from '../../api/client';

import { extractRowData, formatTimeAgo } from '../../utils/transactionFormatters';
import { globalMappingService } from '../../services/globalMappingService';

export interface WorkspaceColumnDef {
  id: string;
  key: string;
  label: string;
  dataType?: string;
  isOperational?: boolean;
  required?: boolean;
}

interface CasesWorkspaceViewProps {
  issue?: Issue;
  issues?: Issue[];
  selectedIssueId?: string;
  onSelectIssueId?: (id: string) => void;
  currentUser?: User;
  taskDatasetRows?: any[];
  sourceRecords?: any[];
  centralMasterRows?: any[];
  attachments?: any[];
  workflow?: any;
  workflows?: any[];
  onSelectWorkflow?: (workflow: any) => void;
  onRunValidation: () => void;
  isValidating?: boolean;
  onRevertCase?: () => void;
  onUpdateIssue?: (issueId: string, updates: Partial<Issue>) => void;
  onOpenNewCase?: () => void;
  onChangeWorkflow?: () => void;
  onOpenDiscussion?: () => void;
  onExport?: () => void;
  onSwitchToAdvancedGrid?: () => void;
  hashtags?: HashtagPreset[];
}

export default function CasesWorkspaceView({
  issue,
  issues = [],
  selectedIssueId,
  onSelectIssueId,
  currentUser,
  taskDatasetRows = [],
  sourceRecords = [],
  centralMasterRows = [],
  attachments = [],
  workflow,
  workflows = [],
  onSelectWorkflow,
  onRunValidation,
  isValidating = false,
  onRevertCase,
  onUpdateIssue,
  onOpenNewCase,
  onChangeWorkflow,
  onOpenDiscussion,
  onExport,
  onSwitchToAdvancedGrid,
  hashtags = []
}: CasesWorkspaceViewProps) {
  const currentIssue = issue || (issues || []).find(i => i.id === selectedIssueId) || (issues || [])[0] || null;
  const [activeTab, setActiveTab] = useState<'transactions' | 'cross_check' | 'attachments'>('transactions');
  const [filterMode, setFilterMode] = useState<'all' | 'duplicates' | 'unique'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(7);
  const [crossCheckPage, setCrossCheckPage] = useState(1);
  const [crossCheckPageSize, setCrossCheckPageSize] = useState(7);

  // Autonomous state if props were not provided with rows
  const [internalTaskRows, setInternalTaskRows] = useState<any[]>([]);
  const [internalCentralRows, setInternalCentralRows] = useState<any[]>([]);
  const [isLoadingInternal, setIsLoadingInternal] = useState(false);
  const [isDiscussionDrawerOpen, setIsDiscussionDrawerOpen] = useState(false);
  const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [isLevel2WorkspaceOpen, setIsLevel2WorkspaceOpen] = useState(false);


  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterMode, currentIssue?.id]);

  useEffect(() => {
    if (!currentIssue?.id) {
      setInternalTaskRows([]);
      setInternalCentralRows([]);
      return;
    }
    // Fetch directly from PostgreSQL if no rows passed via props
    if ((!taskDatasetRows || taskDatasetRows.length === 0) && (!sourceRecords || sourceRecords.length === 0)) {
      setIsLoadingInternal(true);
      Promise.all([
        api.getTaskTransactions(currentIssue.id, 1, 5000),
        api.getCentralTransactions(currentIssue.id)
      ])
        .then(([txnRes, centralRes]: [any, any]) => {
          if (txnRes && Array.isArray(txnRes.rows)) {
            setInternalTaskRows(txnRes.rows);
          }
          if (centralRes && Array.isArray(centralRes.records)) {
            setInternalCentralRows(centralRes.records);
          }
        })
        .catch(err => {
          console.warn('CasesWorkspaceView autonomous fetch warning:', err);
        })
        .finally(() => {
          setIsLoadingInternal(false);
        });
    }
  }, [currentIssue?.id, taskDatasetRows?.length, sourceRecords?.length]);

  const [investigatingTxn, setInvestigatingTxn] = useState<any | null>(null);
  const [showRunningView, setShowRunningView] = useState(false);
  const [compareResolveTxn, setCompareResolveTxn] = useState<any | null>(null);
  const [rowOverrides, setRowOverrides] = useState<Record<string, { investigationStatus?: string; investigationLabel?: string; isClosed?: boolean; resolutionNote?: string }>>({});

  // Popover / Modal States
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);

  // Column Management & Mapping Service Integration
  const [directoryFields, setDirectoryFields] = useState<GlobalTransactionSchemaField[]>([]);
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const [columnSearchQuery, setColumnSearchQuery] = useState('');
  const columnFilterRef = useRef<HTMLDivElement>(null);

  // Close column filter on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnFilterRef.current && !columnFilterRef.current.contains(e.target as Node)) {
        setShowColumnFilter(false);
      }
    };
    if (showColumnFilter) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showColumnFilter]);

  // Authoritative hydration from mapping service & PostgreSQL
  useEffect(() => {
    const cached = globalMappingService.getStandardFields();
    if (cached && cached.length > 0) {
      const filtered = cached.filter(f => (f.key || '').toLowerCase() !== 'currency');
      setDirectoryFields(filtered);
    }

    api.getGlobalStandardDirectory()
      .then((fields) => {
        if (Array.isArray(fields) && fields.length > 0) {
          const filtered = fields.filter(f => (f.key || (f as any).field_name || '').toLowerCase() !== 'currency');
          setDirectoryFields(filtered);
          globalMappingService.updateStandardFields(fields);
        }
      })
      .catch((err) => {
        console.warn('CasesWorkspaceView could not fetch global standard directory:', err);
      });
  }, []);

  const availableColumns = useMemo<WorkspaceColumnDef[]>(() => {
    const colMap = new Map<string, WorkspaceColumnDef>();

    directoryFields.forEach(f => {
      const k = f.key || (f as any).field_name || '';
      if (!k || k.toLowerCase() === 'currency') return;
      colMap.set(k, {
        id: k,
        key: k,
        label: f.label || (f as any).display_name || f.description || k.toUpperCase(),
        dataType: f.dataType || (f as any).data_type,
        required: f.required || (f as any).is_required
      });
    });

    // Ensure core mapped columns exist with authoritative labels from mapping service:
    const reqAmtField = directoryFields.find(f => f.key === 'reqamt' || f.key === 'amount');
    const statusField = directoryFields.find(f => f.key === 'status' || f.key === 'trans_status');
    const txnField = directoryFields.find(f => f.key === 'fe_utrnno' || f.key === 'transaction_id' || f.key === 'refnum');
    const termField = directoryFields.find(f => f.key === 'terminal_id');

    if (!colMap.has('reqamt')) {
      colMap.set('reqamt', {
        id: 'reqamt',
        key: 'reqamt',
        label: reqAmtField?.label || (reqAmtField as any)?.display_name || 'Amount',
        dataType: 'number'
      });
    }
    if (!colMap.has('status')) {
      colMap.set('status', {
        id: 'status',
        key: 'status',
        label: statusField?.label || (statusField as any)?.display_name || 'Status',
        dataType: 'string'
      });
    }
    if (!colMap.has('fe_utrnno')) {
      colMap.set('fe_utrnno', {
        id: 'fe_utrnno',
        key: 'fe_utrnno',
        label: txnField?.label || (txnField as any)?.display_name || 'Transaction ID',
        dataType: 'string'
      });
    }
    if (!colMap.has('terminal_id')) {
      colMap.set('terminal_id', {
        id: 'terminal_id',
        key: 'terminal_id',
        label: termField?.label || (termField as any)?.display_name || 'Terminal ID',
        dataType: 'string'
      });
    }

    // Operational lifecycle columns
    if (!colMap.has('investigation')) {
      colMap.set('investigation', {
        id: 'investigation',
        key: 'investigation',
        label: 'Investigation',
        isOperational: true
      });
    }
    if (!colMap.has('validation')) {
      colMap.set('validation', {
        id: 'validation',
        key: 'validation',
        label: 'Validation',
        isOperational: true
      });
    }

    return Array.from(colMap.values());
  }, [directoryFields]);

  // Default 6 important columns derived strictly from mapping service (excluding currency)
  const defaultColumnIds = useMemo(() => {
    const amtKey = directoryFields.find(f => f.key === 'reqamt' || f.key === 'amount')?.key || 'reqamt';
    const statusKey = directoryFields.find(f => f.key === 'status' || f.key === 'trans_status')?.key || 'status';
    const txnKey = directoryFields.find(f => f.key === 'fe_utrnno' || f.key === 'transaction_id' || f.key === 'refnum')?.key || 'fe_utrnno';
    const termKey = directoryFields.find(f => f.key === 'terminal_id')?.key || 'terminal_id';

    // Exactly 6 important columns
    return [amtKey, statusKey, txnKey, termKey, 'investigation', 'validation'];
  }, [directoryFields]);

  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>([]);

  useEffect(() => {
    if (visibleColumnIds.length === 0 && defaultColumnIds.length > 0) {
      setVisibleColumnIds(defaultColumnIds);
    }
  }, [defaultColumnIds]);

  const activeVisibleColumnIds = visibleColumnIds.length > 0 ? visibleColumnIds : defaultColumnIds;

  const activeColumns = useMemo(() => {
    const map = new Map(availableColumns.map(c => [c.id, c]));
    return activeVisibleColumnIds.map(id => map.get(id)).filter(Boolean) as WorkspaceColumnDef[];
  }, [activeVisibleColumnIds, availableColumns]);

  const toggleColumn = (colId: string) => {
    setVisibleColumnIds(prev => {
      const current = prev.length > 0 ? prev : defaultColumnIds;
      if (current.includes(colId)) {
        if (current.length <= 1) return current; // Keep at least one column
        return current.filter(id => id !== colId);
      } else {
        return [...current, colId];
      }
    });
  };

  const filteredAvailableColumns = useMemo(() => {
    if (!columnSearchQuery.trim()) return availableColumns;
    const q = columnSearchQuery.toLowerCase();
    return availableColumns.filter(c => 
      c.label.toLowerCase().includes(q) || 
      c.key.toLowerCase().includes(q)
    );
  }, [availableColumns, columnSearchQuery]);

  const renderCellContent = (row: any, colId: string, _col: WorkspaceColumnDef) => {
    // 1. Amount
    if (colId === 'amount' || colId === 'reqamt') {
      const rawVal = row.amount ?? row.reqamt ?? row._extracted?.amount ?? 0;
      const num = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal).replace(/[^0-9.-]/g, '')) || 0;
      return (
        <span className="font-bold font-heading text-slate-900 whitespace-nowrap">
          {num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      );
    }

    // 2. Status
    if (colId === 'status' || colId === 'trans_status') {
      const st = String(row.status || row.trans_status || 'Pending');
      const isSuccess = st.toLowerCase() === 'success' || st.toLowerCase() === 'settled';
      return (
        <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
          isSuccess
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
            : 'bg-amber-50 text-amber-700 border border-amber-200/60'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isSuccess ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span>{st}</span>
        </span>
      );
    }

    // 3. Transaction ID / UTRNNO
    if (colId === 'transaction_id' || colId === 'fe_utrnno' || colId === 'refnum') {
      const val = String(row.transaction_id || row.fe_utrnno || row.refnum || row._extracted?.txnId || '-');
      return (
        <span className="font-mono text-slate-700 max-w-[170px] truncate whitespace-nowrap block" title={val}>
          {val}
        </span>
      );
    }

    // 4. Terminal ID
    if (colId === 'terminal_id') {
      const val = String(row.terminal_id || row._extracted?.terminalId || row.termid || '-');
      return (
        <span className="font-mono text-slate-600 max-w-[130px] truncate whitespace-nowrap block" title={val}>
          {val}
        </span>
      );
    }

    // 5. Investigation
    if (colId === 'investigation') {
      return (
        <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
          row.investigationLabel === 'Reconciled'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
            : row.investigationLabel === 'Flagged'
            ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
            : 'bg-amber-50 text-amber-700 border border-amber-200/60'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            row.investigationLabel === 'Reconciled'
              ? 'bg-emerald-500'
              : row.investigationLabel === 'Flagged'
              ? 'bg-rose-500'
              : 'bg-amber-500'
          }`} />
          <span>{row.investigationLabel || 'Pending'}</span>
        </span>
      );
    }

    // 6. Validation
    if (colId === 'validation') {
      return (
        <span className="text-slate-500 font-sans max-w-[240px] truncate whitespace-nowrap block" title={row.validationText}>
          {row.validationText || '-'}
        </span>
      );
    }

    // Generic fallback for any other column from mapping service
    const rawVal = row[colId] ??
                   row.sourceRecord?.[colId] ??
                   row.canonical_data?.[colId] ??
                   row._extracted?.rawData?.[colId] ??
                   '-';

    if (rawVal === null || rawVal === undefined || rawVal === '') {
      return <span className="text-slate-300">-</span>;
    }
    if (typeof rawVal === 'object') {
      return (
        <span className="font-mono text-slate-500 text-[11px] truncate block max-w-[150px]">
          {JSON.stringify(rawVal)}
        </span>
      );
    }
    return (
      <span className="text-slate-600 font-sans max-w-[160px] truncate whitespace-nowrap block" title={String(rawVal)}>
        {String(rawVal)}
      </span>
    );
  };

  // Task Switcher State
  const [isTaskSwitcherOpen, setIsTaskSwitcherOpen] = useState(false);
  const [taskSwitcherQuery, setTaskSwitcherQuery] = useState('');
  const [taskSwitcherStatusFilter, setTaskSwitcherStatusFilter] = useState<'ALL' | 'Open' | 'In Progress' | 'Closed'>('ALL');

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

  const currentIndex = (issues || []).findIndex(i => i.id === currentIssue?.id);
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < (issues || []).length - 1;

  const handlePrevTask = () => {
    if (canGoPrev && onSelectIssueId && issues) {
      onSelectIssueId(issues[currentIndex - 1].id);
    }
  };

  const handleNextTask = () => {
    if (canGoNext && onSelectIssueId && issues) {
      onSelectIssueId(issues[currentIndex + 1].id);
    }
  };

  // Resolve effective rows from all legitimate data sources strictly
  const effectiveTaskRows = useMemo(() => {
    if (sourceRecords && sourceRecords.length > 0) return sourceRecords;
    if (taskDatasetRows && taskDatasetRows.length > 0) return taskDatasetRows;
    if (internalTaskRows.length > 0) return internalTaskRows;
    if (currentIssue?.firstLevelMappedData && currentIssue.firstLevelMappedData.length > 0) return currentIssue.firstLevelMappedData;
    const attRows = (currentIssue?.attachments || []).flatMap((a: any) => a.parsedData?.tabularRows || a.parsedData?.sampleRows || []);
    if (attRows.length > 0) return attRows;
    return [];
  }, [sourceRecords, taskDatasetRows, internalTaskRows, currentIssue]);

  // Compute 4 KPI values based strictly on real transaction data
  const kpis = useMemo(() => {
    const totalRecords = effectiveTaskRows.length;
    let totalAmt = 0;
    let duplicateCount = 0;

    effectiveTaskRows.forEach((r, idx) => {
      const ext = extractRowData(r, idx);
      totalAmt += ext.amount;
      if (ext.isDuplicate) duplicateCount++;
    });

    const avgAmt = totalRecords > 0 ? totalAmt / totalRecords : 0;

    return {
      records: totalRecords,
      totalAmount: totalAmt,
      avgAmount: avgAmt,
      duplicates: duplicateCount
    };
  }, [effectiveTaskRows]);

  // Dynamic tags list
  const issueTags = useMemo(() => {
    const set = new Set<string>();
    if (currentIssue?.linkedHashtag) set.add(currentIssue.linkedHashtag);
    if ((currentIssue as any)?.hashtag) set.add((currentIssue as any).hashtag);
    if (Array.isArray((currentIssue as any)?.hashtags)) {
      (currentIssue as any).hashtags.forEach((t: string) => set.add(t));
    }
    if (set.size === 0) {
      set.add('#AIB_SETTLEMENT_2026');
      set.add('#CARD_SETTLEMENT_2026');
    }
    return Array.from(set);
  }, [currentIssue]);

  // Handle adding hashtag to case
  const handleAddHashtag = () => {
    if (!newTagInput.trim() || !currentIssue) return;
    const cleanTag = newTagInput.startsWith('#') ? newTagInput.toUpperCase() : `#${newTagInput.toUpperCase()}`;
    const nextTags = Array.from(new Set([...issueTags, cleanTag]));
    if (onUpdateIssue) {
      onUpdateIssue(currentIssue.id, {
        linkedHashtag: cleanTag,
        hashtags: nextTags
      } as any);
    }
    setNewTagInput('');
    setShowAddTag(false);
  };

  // Normalize rows for table display strictly from real records
  const displayRows = useMemo(() => {
    let rows = effectiveTaskRows.map((r, idx) => {
      const ext = extractRowData(r, idx);
      const rowNum = r._rowNumber ?? r.row_number ?? (idx + 1);
      const rowId = `txn-row-${rowNum}-${ext.txnId}-${idx}`;
      const txnKey = ext.txnId;
      const override = rowOverrides[rowId] || rowOverrides[txnKey] || rowOverrides[ext.rowId];
      const invStatus = override?.investigationStatus || ext.investigationStatus;
      const invLabel = override?.investigationLabel || (
        invStatus === 'VERIFIED_MATCH' ? 'Reconciled' :
        invStatus === 'FLAGGED_DISCREPANCY' ? 'Flagged' :
        invStatus === 'CLOSED' ? 'Closed' :
        invStatus === 'IN_PROGRESS' ? 'Investigating' : 'Pending'
      );

      const src = r.sourceRecord || r.canonical_data || r;

      return {
        ...src,
        ...r,
        id: rowId,
        rowNum: rowNum,
        amount: ext.amount,
        reqamt: ext.amount,
        currency: ext.currency,
        status: ext.status,
        trans_status: ext.status,
        transaction_id: txnKey,
        fe_utrnno: txnKey,
        refnum: txnKey,
        terminal_id: ext.terminalId || src.terminal_id || r.terminal_id || '',
        investigationStatus: invStatus,
        investigationLabel: invLabel,
        validationText: ext.validationText,
        isDuplicate: ext.isDuplicate,
        isClosed: override?.isClosed ?? ext.isClosed,
        resolutionNote: override?.resolutionNote ?? ext.resolutionNote,
        _extracted: ext
      };
    });

    if (filterMode === 'duplicates') {
      rows = rows.filter(r => r.isDuplicate);
    } else if (filterMode === 'unique') {
      rows = rows.filter(r => !r.isDuplicate);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r => 
        String(r.transaction_id || '').toLowerCase().includes(q) ||
        String(r.amount || '').includes(q) ||
        String(r.currency || '').toLowerCase().includes(q) ||
        String(r.status || '').toLowerCase().includes(q)
      );
    }

    return rows;
  }, [effectiveTaskRows, filterMode, searchQuery, rowOverrides]);

  const totalPages = Math.max(1, Math.ceil(displayRows.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedRows = useMemo(() => {
    const safePage = Math.min(Math.max(1, currentPage), Math.max(1, Math.ceil(displayRows.length / pageSize)));
    const start = (safePage - 1) * pageSize;
    return displayRows.slice(start, start + pageSize);
  }, [displayRows, currentPage, pageSize]);

  const effectiveCentralRows = useMemo(() => {
    if (centralMasterRows && centralMasterRows.length > 0) return centralMasterRows;
    if (internalCentralRows.length > 0) return internalCentralRows;
    return [];
  }, [centralMasterRows, internalCentralRows]);

  // Central cross-check rows from real ledger records
  const crossCheckRows = useMemo(() => {
    return effectiveCentralRows.map((r, idx) => {
      const ext = extractRowData(r, idx);
      const isMatched = r._validation_status === 'PASS' || r.match_status === 'MATCHED';
      const rowNum = r.row_number ?? r._rowNumber ?? (idx + 1);
      return {
        ...r,
        id: `central-${rowNum}-${ext.txnId}-${idx}`,
        rowNum: rowNum,
        amount: ext.amount,
        currency: ext.currency,
        status: ext.status || 'Settled',
        transaction_id: ext.txnId,
        ledger: r.ledger_name || r.source_table || 'PostgreSQL Core Ledger',
        matchStatus: isMatched ? 'MATCHED' : 'DISCREPANCY'
      };
    });
  }, [effectiveCentralRows]);

  const totalCrossCheckPages = Math.max(1, Math.ceil(crossCheckRows.length / crossCheckPageSize));
  const safeCrossCheckPage = Math.min(Math.max(1, crossCheckPage), totalCrossCheckPages);

  const paginatedCrossCheckRows = useMemo(() => {
    const safePage = Math.min(Math.max(1, crossCheckPage), Math.max(1, Math.ceil(crossCheckRows.length / crossCheckPageSize)));
    const start = (safePage - 1) * crossCheckPageSize;
    return crossCheckRows.slice(start, start + crossCheckPageSize);
  }, [crossCheckRows, crossCheckPage, crossCheckPageSize]);

  // Attachments list
  const effectiveAttachments = useMemo(() => {
    if (attachments && attachments.length > 0) return attachments;
    if (currentIssue?.attachments && currentIssue.attachments.length > 0) return currentIssue.attachments;
    if (currentIssue?.uploadedFileName) {
      return [
        {
          filename: currentIssue.uploadedFileName,
          size: 'Ingested Dataset',
          uploadedAt: formatTimeAgo(currentIssue.createdAt),
          contentType: 'application/octet-stream'
        }
      ];
    }
    return [];
  }, [attachments, currentIssue]);
 
  if (isValidating || showRunningView) {
    return (
      <InvestigationRunningView
        caseId={currentIssue?.id || ''}
        caseTitle={currentIssue?.title || 'Case Investigation'}
        workflowName={workflow?.name || 'Validation Pipeline'}
        onPause={() => {}}
        onCancel={() => setShowRunningView(false)}
        onCloseView={() => setShowRunningView(false)}
        onSelectTransaction={(txnId) => {
          setCompareResolveTxn({ id: txnId, transaction_id: txnId });
        }}
      />
    );
  }

  if (isLevel2WorkspaceOpen && currentIssue) {
    return (
      <TechnicianInvestigationWorkspace
        issue={currentIssue}
        currentUser={currentUser}
        onBack={() => setIsLevel2WorkspaceOpen(false)}
        onUpdateIssue={onUpdateIssue}
        onPostHashtagSuccess={(preset) => {
          setIsLevel2WorkspaceOpen(false);
          if (onUpdateIssue) {
            onUpdateIssue(currentIssue.id, { linkedHashtag: preset.tag, status: 'Resolved' });
          }
        }}
      />
    );
  }

  return (

    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#F8FAFC] font-sans p-4 sm:p-5 pb-4">
      {/* 1. Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-2">
          {/* Status Badges Row + Interactive Task Switcher */}
          <div className="flex items-center space-x-2 text-xs flex-wrap gap-y-1">
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>{currentIssue?.status || 'Open'}</span>
            </span>

            {/* Task Switcher Dropdown */}
            <div className="relative">
              <div className="inline-flex items-center border border-slate-200 rounded-lg shadow-2xs bg-white">
                {/* Prev Task Button */}
                <button
                  type="button"
                  onClick={handlePrevTask}
                  disabled={!canGoPrev}
                  className="px-1.5 py-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400 border-r border-slate-100 transition cursor-pointer"
                  title="Previous task"
                >
                  <ChevronLeft size={13} />
                </button>

                {/* Main Switcher Trigger */}
                <button
                  type="button"
                  id="btn-task-switcher"
                  onClick={() => setIsTaskSwitcherOpen(!isTaskSwitcherOpen)}
                  className="inline-flex items-center space-x-1.5 px-2.5 py-1 hover:bg-slate-50 transition cursor-pointer text-xs"
                >
                  <FolderOpen size={13} className="text-[#F27421]" />
                  <span className="font-mono text-slate-900 font-bold">
                    {currentIssue?.id || 'Select Task'}
                  </span>
                  <ChevronDown size={13} className="text-slate-400" />
                </button>

                {/* Next Task Button */}
                <button
                  type="button"
                  onClick={handleNextTask}
                  disabled={!canGoNext}
                  className="px-1.5 py-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:hover:text-slate-400 border-l border-slate-100 transition cursor-pointer"
                  title="Next task"
                >
                  <ChevronRight size={13} />
                </button>
              </div>

              {/* Task Switcher Popover */}
              {isTaskSwitcherOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-3 space-y-3 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                    <div className="flex items-center space-x-1.5">
                      <FolderOpen size={14} className="text-[#F27421]" />
                      <span className="font-bold text-slate-900 text-xs">Switch Task</span>
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">
                        {(issues || []).length}
                      </span>
                    </div>
                    {onOpenNewCase && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsTaskSwitcherOpen(false);
                          onOpenNewCase();
                        }}
                        className="text-[11px] font-semibold text-[#F27421] hover:text-[#d65f15] flex items-center space-x-1 cursor-pointer"
                      >
                        <Plus size={11} />
                        <span>New task</span>
                      </button>
                    )}
                  </div>

                  {/* Search Input */}
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search tasks by title or ID..."
                      value={taskSwitcherQuery}
                      onChange={e => setTaskSwitcherQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:border-[#F27421]"
                      autoFocus
                    />
                  </div>

                  {/* Status Filter Chips */}
                  <div className="flex items-center space-x-1 overflow-x-auto pb-0.5">
                    {(['ALL', 'Open', 'In Progress', 'Closed'] as const).map(st => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setTaskSwitcherStatusFilter(st)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition cursor-pointer whitespace-nowrap ${
                          taskSwitcherStatusFilter === st
                            ? 'bg-[#0F142A] text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {st === 'ALL' ? 'All' : st}
                      </button>
                    ))}
                  </div>

                  {/* Tasks List */}
                  <div className="max-h-64 overflow-y-auto space-y-1.5 pr-0.5">
                    {availableTasks.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 text-xs font-sans">
                        No tasks match your search.
                      </div>
                    ) : (
                      availableTasks.map(t => {
                        const isSelected = t.id === currentIssue?.id;
                        return (
                          <div
                            key={t.id}
                            onClick={() => {
                              if (onSelectIssueId) {
                                onSelectIssueId(t.id);
                              }
                              setIsTaskSwitcherOpen(false);
                            }}
                            className={`p-2.5 rounded-xl border transition cursor-pointer text-left space-y-1 ${
                              isSelected
                                ? 'bg-[#F27421]/5 border-[#F27421] shadow-2xs'
                                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-mono font-bold text-slate-900">{t.id}</span>
                              <div className="flex items-center space-x-1.5">
                                <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${
                                  t.status === 'Closed'
                                    ? 'bg-slate-100 text-slate-600'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                }`}>
                                  {t.status || 'Open'}
                                </span>
                                {t.priority && (
                                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium ${
                                    t.priority === 'Critical' || t.priority === 'High'
                                      ? 'bg-rose-50 text-rose-700'
                                      : 'bg-amber-50 text-amber-700'
                                  }`}>
                                    {t.priority}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-xs font-bold text-slate-800 truncate">
                              {t.title || 'Untitled Case'}
                            </div>
                            {t.description && (
                              <div className="text-[11px] text-slate-500 line-clamp-1">
                                {t.description}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {(() => {
              const createdAt = currentIssue?.createdAt ? new Date(currentIssue.createdAt).getTime() : Date.now();
              const elapsedHours = (Date.now() - createdAt) / (1000 * 60 * 60);
              const isOverdue = elapsedHours > 24 && currentIssue?.status !== 'Closed';
              if (isOverdue) {
                const overHours = Math.floor(elapsedHours - 24);
                return (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/60 text-[11px] font-medium">
                    <Clock size={11} className="text-rose-600" />
                    <span>SLA overdue ({overHours > 0 ? `${overHours}h over` : 'overdue'})</span>
                  </span>
                );
              }
              return (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-[11px] font-medium">
                  <Clock size={11} className="text-emerald-600" />
                  <span>SLA on target</span>
                </span>
              );
            })()}
          </div>

          {/* H1 Title */}
          <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight">
            {currentIssue?.title || 'Case Investigation'}
          </h1>

          {/* Subtitle */}
          <p className="text-xs text-slate-500 font-sans">
            {currentIssue?.uploadedFileName || (currentIssue as any)?.fileName || (effectiveAttachments[0]?.filename) || 'Direct Ingestion Dataset'} · {effectiveTaskRows.length} {effectiveTaskRows.length === 1 ? 'record' : 'records'} · Reported {formatTimeAgo(currentIssue?.createdAt)} by @{currentIssue?.creatorName || currentIssue?.assignedTechUserName || currentUser?.name || 'Operator'}
          </p>

          {/* Hashtags Row */}
          <div className="flex items-center space-x-2 pt-1 flex-wrap gap-y-1">
            {issueTags.map(tag => (
              <span key={tag} className="px-2 py-0.5 text-[11px] font-mono text-slate-600 bg-white border border-slate-200 rounded-md shadow-2xs">
                {tag}
              </span>
            ))}
            
            {showAddTag ? (
              <div className="inline-flex items-center space-x-1 bg-white border border-[#F27421] rounded-md px-1.5 py-0.5">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddHashtag();
                    if (e.key === 'Escape') setShowAddTag(false);
                  }}
                  placeholder="#TAG_NAME"
                  className="text-[11px] font-mono text-slate-800 outline-none w-28 uppercase"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleAddHashtag}
                  className="text-emerald-600 hover:text-emerald-700 text-xs font-bold px-1"
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddTag(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs px-1"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddTag(true)}
                className="px-2 py-0.5 text-[11px] font-sans text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-dashed border-slate-300 rounded-md transition-colors cursor-pointer"
              >
                + Add tag
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons Top Right */}
        <div className="flex items-center space-x-2 shrink-0 relative">
          {/* Technician Staging & Level 2 Investigation Action */}
          {currentIssue?.stagedEnvironment ? (
            <button
              type="button"
              id="btn-open-level-2-investigation"
              onClick={() => setIsLevel2WorkspaceOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Terminal size={13} />
              <span>Level 2 ({currentIssue.stagedEnvironment})</span>
            </button>
          ) : (
            <button
              type="button"
              id="btn-stage-task-investigation"
              onClick={() => setIsStageModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Play size={13} className="text-blue-400" />
              <span>Stage Task & Investigate</span>
            </button>
          )}

          <button
            type="button"
            id="btn-case-discussion-drawer"
            onClick={() => {
              setIsDiscussionDrawerOpen(true);
              if (onOpenDiscussion) onOpenDiscussion();
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 shadow-2xs transition-colors cursor-pointer"
          >

            <MessageSquare size={13} className="text-slate-500" />
            <span>Discussion</span>
            <span className="px-1.5 py-0.2 bg-slate-900 text-white text-[10px] font-mono font-bold rounded-full">
              1
            </span>
          </button>

          <button
            type="button"
            onClick={onExport}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 shadow-2xs transition-colors cursor-pointer"
          >
            <Download size={13} className="text-slate-500" />
            <span>Export</span>
          </button>

          {/* More options menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-1.5 bg-white hover:bg-slate-50 text-slate-500 rounded-lg border border-slate-200 shadow-2xs transition-colors cursor-pointer"
              title="More options"
            >
              <MoreHorizontal size={14} />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 text-xs font-sans">
                {onSwitchToAdvancedGrid && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onSwitchToAdvancedGrid();
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700 cursor-pointer"
                  >
                    <Grid size={13} className="text-slate-400" />
                    <span>Switch to Data Grid</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowRunningView(true);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700 cursor-pointer"
                >
                  <Activity size={13} className="text-amber-500" />
                  <span>View Running Investigation</span>
                </button>
                {onOpenNewCase && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onOpenNewCase();
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700 cursor-pointer"
                  >
                    <Plus size={13} className="text-slate-400" />
                    <span>Open New Case</span>
                  </button>
                )}
                {onRevertCase && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onRevertCase();
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center space-x-2 text-rose-600 cursor-pointer"
                  >
                    <RotateCcw size={13} className="text-rose-500" />
                    <span>Revert to Validated State</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Primary Action Button (EthioPay Orange) */}
          <button
            type="button"
            onClick={onRunValidation}
            disabled={isValidating}
            className="bg-[#F27421] hover:bg-[#E06310] text-white flex items-center space-x-2 px-4 py-1.5 text-xs font-semibold rounded-lg shadow-xs cursor-pointer disabled:opacity-50 transition-colors"
          >
            <Play size={12} className={`fill-white ${isValidating ? 'animate-spin' : ''}`} />
            <span>{isValidating ? 'Running validation...' : 'Run validation'}</span>
          </button>
        </div>
      </div>

      {/* 2. Main Workspace: Left (Cards + Table) & Right (Pipeline & Details) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-1 min-h-0">
        {/* Left 3 Columns: KPI Cards Strip + Table Workspace */}
        <div className="lg:col-span-3 space-y-3 flex-1 min-h-0 flex flex-col">
          {/* Compact 4 KPI Metric Cards pushed to left */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="px-3.5 py-2.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <span className="text-[11px] text-slate-500 font-sans font-medium block">Records</span>
              <span className="text-lg font-bold font-mono text-slate-900 mt-0.5">{kpis.records}</span>
            </div>

            <div className="px-3.5 py-2.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <span className="text-[11px] text-slate-500 font-sans font-medium block">Total amount</span>
              <span className="text-lg font-bold font-mono text-slate-900 mt-0.5 truncate">
                {kpis.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="px-3.5 py-2.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <span className="text-[11px] text-slate-500 font-sans font-medium block">Average</span>
              <span className="text-lg font-bold font-mono text-slate-900 mt-0.5 truncate">
                {kpis.avgAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="px-3.5 py-2.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <span className="text-[11px] text-slate-500 font-sans font-medium block">Duplicates</span>
              <span className="text-lg font-bold font-mono text-slate-900 mt-0.5">{kpis.duplicates}</span>
            </div>
          </div>

          {/* Table Workspace Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col h-full min-h-0">
          {/* Tabs Row */}
          <div className="border-b border-slate-200 px-5 flex items-center space-x-6">
            <button
              onClick={() => setActiveTab('transactions')}
              className={`py-3.5 text-xs font-semibold font-heading flex items-center space-x-2 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'transactions'
                  ? 'border-[#F27421] text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Task transactions</span>
              <span className={`px-1.5 py-0.2 text-[10px] font-mono font-bold rounded-full ${
                activeTab === 'transactions' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {displayRows.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('cross_check')}
              className={`py-3.5 text-xs font-semibold font-heading flex items-center space-x-2 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'cross_check'
                  ? 'border-[#F27421] text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Central repo cross-check</span>
              <span className={`px-1.5 py-0.2 text-[10px] font-mono font-bold rounded-full ${
                activeTab === 'cross_check' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {crossCheckRows.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('attachments')}
              className={`py-3.5 text-xs font-semibold font-heading flex items-center space-x-2 border-b-2 transition-colors cursor-pointer ${
                activeTab === 'attachments'
                  ? 'border-[#F27421] text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Attachments</span>
              <span className={`px-1.5 py-0.2 text-[10px] font-mono font-bold rounded-full ${
                activeTab === 'attachments' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
              }`}>
                {effectiveAttachments.length}
              </span>
            </button>
          </div>

          {/* View 1: Task Transactions */}
          {activeTab === 'transactions' && (
            <>
              {/* Table Toolbar */}
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center space-x-2 flex-1 max-w-sm">
                  <div className="relative flex-1">
                    <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Find in transactions..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 outline-none focus:border-[#F27421] transition-all"
                    />
                  </div>

                  {/* Filter pills */}
                  <div className="flex items-center p-0.5 bg-slate-100 rounded-lg text-xs font-medium text-slate-600">
                    <button
                      onClick={() => setFilterMode('all')}
                      className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                        filterMode === 'all' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setFilterMode('duplicates')}
                      className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                        filterMode === 'duplicates' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
                      }`}
                    >
                      Duplicates {kpis.duplicates}
                    </button>
                    <button
                      onClick={() => setFilterMode('unique')}
                      className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                        filterMode === 'unique' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
                      }`}
                    >
                      Unique {kpis.records - kpis.duplicates}
                    </button>
                  </div>
                </div>

                <div className="flex items-center space-x-3 text-xs text-slate-500">
                  <span>
                    Showing <strong className="font-mono text-slate-800">{activeColumns.length}</strong> of{' '}
                    <strong className="font-mono text-slate-800">{availableColumns.length}</strong> columns
                  </span>

                  <div className="relative" ref={columnFilterRef}>
                    <button
                      type="button"
                      onClick={() => setShowColumnFilter(!showColumnFilter)}
                      className={`flex items-center space-x-1.5 px-2.5 py-1.5 border rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        showColumnFilter
                          ? 'border-[#F27421] bg-orange-50 text-[#F27421]'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                      title="Customize table columns"
                      aria-expanded={showColumnFilter}
                    >
                      <SlidersHorizontal size={12} className={showColumnFilter ? 'text-[#F27421]' : 'text-slate-500'} />
                      <span>Columns</span>
                      <span className="ml-1 px-1.5 py-0.2 text-[10px] font-mono font-bold rounded-full bg-slate-100 text-slate-600">
                        {activeColumns.length}
                      </span>
                    </button>

                    {showColumnFilter && (
                      <div className="absolute right-0 top-full mt-1.5 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-3 space-y-2.5 text-xs select-none animate-in fade-in zoom-in-95 duration-100">
                        {/* Popover Header */}
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <div>
                            <span className="font-bold text-slate-800 font-heading">Display Columns</span>
                            <span className="text-[11px] text-slate-400 block">
                              {activeColumns.length} of {availableColumns.length} columns active
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => setVisibleColumnIds(defaultColumnIds)}
                              className="px-2 py-0.5 text-[11px] text-[#F27421] hover:bg-orange-50 rounded font-medium transition cursor-pointer"
                              title="Reset to 6 important default columns"
                            >
                              Reset (6)
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowColumnFilter(false)}
                              className="p-1 text-slate-400 hover:text-slate-600 rounded transition cursor-pointer"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Search Columns */}
                        <div className="relative">
                          <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
                          <input
                            type="text"
                            value={columnSearchQuery}
                            onChange={(e) => setColumnSearchQuery(e.target.value)}
                            placeholder="Filter columns by name or key..."
                            className="w-full pl-7 pr-7 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 outline-none focus:border-[#F27421] transition"
                          />
                          {columnSearchQuery && (
                            <button
                              type="button"
                              onClick={() => setColumnSearchQuery('')}
                              className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>

                        {/* Column Checkboxes List */}
                        <div className="max-h-60 overflow-y-auto space-y-0.5 pr-1 divide-y divide-slate-50">
                          {filteredAvailableColumns.map(col => {
                            const isChecked = activeVisibleColumnIds.includes(col.id);
                            return (
                              <label
                                key={col.id}
                                className="flex items-center justify-between p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer transition text-xs"
                              >
                                <div className="flex items-center space-x-2 min-w-0 flex-1">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleColumn(col.id)}
                                    className="rounded border-slate-300 text-[#F27421] focus:ring-[#F27421] h-3.5 w-3.5 cursor-pointer"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <span className={`block truncate ${isChecked ? 'font-medium text-slate-800' : 'text-slate-600'}`}>
                                      {col.label}
                                    </span>
                                    <span className="text-[10px] font-mono text-slate-400 block truncate">
                                      {col.key}
                                    </span>
                                  </div>
                                </div>
                                {col.isOperational && (
                                  <span className="text-[9px] px-1 py-0.2 bg-purple-50 text-purple-600 rounded border border-purple-200/60 font-mono ml-2 shrink-0">
                                    SYSTEM
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>

                        {/* Footer Controls */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                          <button
                            type="button"
                            onClick={() => setVisibleColumnIds(availableColumns.map(c => c.id))}
                            className="text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                          >
                            Select All
                          </button>
                          <button
                            type="button"
                            onClick={() => setVisibleColumnIds(defaultColumnIds)}
                            className="text-[#F27421] hover:underline font-medium cursor-pointer"
                          >
                            Default (6)
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="flex-1 min-h-0 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-white text-slate-400 font-sans text-xs border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4 font-normal w-12 text-slate-400">#</th>
                      {activeColumns.map(col => (
                        <th key={col.id} className="py-3 px-4 font-normal whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                      <th className="py-3 px-4 font-normal text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedRows.length === 0 ? (
                      <tr>
                        <td colSpan={activeColumns.length + 2} className="py-12 text-center text-slate-400 font-sans">
                          <FileSpreadsheet size={32} className="mx-auto mb-2 text-slate-300" />
                          <p className="text-sm font-semibold text-slate-700">No transactions found</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {searchQuery ? 'No transactions match your search filter.' : 'No transactions have been ingested for this case yet.'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      <>
                        {paginatedRows.map((row, rIdx) => {
                          const displayNum = (safeCurrentPage - 1) * pageSize + rIdx + 1;
                          return (
                            <tr key={row.id} className="hover:bg-slate-50/60 transition-colors h-11 max-h-11 border-b border-slate-100">
                              <td className="py-2.5 px-4 font-sans text-slate-400 w-12 whitespace-nowrap">{displayNum}</td>
                              {activeColumns.map(col => (
                                <td key={col.id} className="py-2.5 px-4 whitespace-nowrap">
                                  {renderCellContent(row, col.id, col)}
                                </td>
                              ))}
                              <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setInvestigatingTxn(row)}
                                  className="inline-flex items-center space-x-1 px-3 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium shadow-2xs transition-colors cursor-pointer"
                                >
                                  <span>Investigate</span>
                                  <ChevronRight size={12} className="text-slate-400" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {/* Constant Height Empty Slots Filler (stabilizes chosen screen height budget) */}
                        {Array.from({ length: Math.max(0, (pageSize <= 15 ? pageSize : 7) - paginatedRows.length) }).map((_, padIdx) => (
                          <tr key={`empty-pad-${padIdx}`} className="h-11 max-h-11 border-b border-slate-50/80 bg-slate-50/10 select-none">
                            <td className="py-2.5 px-4 font-mono text-slate-200 text-xs w-12">-</td>
                            {activeColumns.map(col => (
                              <td key={col.id} className="py-2.5 px-4 font-mono text-slate-200 text-xs whitespace-nowrap">-</td>
                            ))}
                            <td className="py-2.5 px-4 text-right text-slate-200 text-xs"></td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Footer with Active Pagination */}
              <DataTablePagination
                currentPage={safeCurrentPage}
                totalItems={displayRows.length}
                pageSize={pageSize}
                pageSizeOptions={[5, 6, 7, 8, 9, 10, 12, 14, 15, 20, 25, 50]}
                statusBadge={<span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-medium">Ready</span>}
                onPageChange={(p) => setCurrentPage(p)}
                onPageSizeChange={(newSize) => {
                  setPageSize(newSize);
                  setCurrentPage(1);
                }}
              />
            </>
          )}

          {/* View 2: Central Repo Cross-Check */}
          {activeTab === 'cross_check' && (
            <div className="p-5 space-y-4 flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Cross-referencing task batch records against Central Settlement Ledger</span>
                <span className="font-mono">{crossCheckRows.length} records verified</span>
              </div>
              <div className="flex-1 min-h-0 overflow-auto border border-slate-100 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 border-b border-slate-100 font-medium">
                    <tr>
                      <th className="py-2.5 px-4">#</th>
                      <th className="py-2.5 px-4">Transaction ID</th>
                      <th className="py-2.5 px-4">Amount</th>
                      <th className="py-2.5 px-4">Ledger Source</th>
                      <th className="py-2.5 px-4">Cross-Check Verdict</th>
                      <th className="py-2.5 px-4 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedCrossCheckRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400 font-sans">
                          <Database size={32} className="mx-auto mb-2 text-slate-300" />
                          <p className="text-sm font-semibold text-slate-700">No cross-check records found</p>
                          <p className="text-xs text-slate-400 mt-1">
                            No central repository records have been linked or synchronized with this case yet.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      <>
                        {paginatedCrossCheckRows.map((r, rIdx) => {
                          const displayNum = (safeCrossCheckPage - 1) * crossCheckPageSize + rIdx + 1;
                          return (
                            <tr key={r.id} className="hover:bg-slate-50/50 h-11 max-h-11 border-b border-slate-100">
                              <td className="py-2.5 px-4 text-slate-400 w-12 whitespace-nowrap">{displayNum}</td>
                            <td className="py-2.5 px-4 font-mono font-medium text-slate-800 max-w-[180px] truncate whitespace-nowrap" title={r.transaction_id}>{r.transaction_id}</td>
                            <td className="py-2.5 px-4 font-bold text-slate-900 whitespace-nowrap">{r.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {r.currency}</td>
                            <td className="py-2.5 px-4 text-slate-600 max-w-[200px] truncate whitespace-nowrap" title={r.ledger}>{r.ledger}</td>
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                r.matchStatus === 'MATCHED'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}>
                                <span>{r.matchStatus === 'MATCHED' ? '✓ Matched in Ledger' : '⚠ Discrepancy Found'}</span>
                              </span>
                            </td>
                              <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => setInvestigatingTxn({
                                    ...r,
                                    transaction_id: r.transaction_id,
                                    amount: r.amount,
                                    currency: r.currency,
                                    status: r.status,
                                    investigationStatus: r.matchStatus === 'MATCHED' ? 'VERIFIED_MATCH' : 'FLAGGED_DISCREPANCY',
                                    investigationLabel: r.matchStatus === 'MATCHED' ? 'Reconciled' : 'Flagged'
                                  })}
                                  className="inline-flex items-center space-x-1 px-3 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium shadow-2xs transition-colors cursor-pointer"
                                >
                                  <span>Investigate</span>
                                  <ChevronRight size={12} className="text-slate-400" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {/* Constant Height Empty Slots Filler (stabilizes chosen screen height budget) */}
                        {Array.from({ length: Math.max(0, (crossCheckPageSize <= 15 ? crossCheckPageSize : 7) - paginatedCrossCheckRows.length) }).map((_, padIdx) => (
                          <tr key={`empty-cc-pad-${padIdx}`} className="h-11 max-h-11 border-b border-slate-50/80 bg-slate-50/10 select-none">
                            <td className="py-2.5 px-4 font-mono text-slate-200 text-xs w-12">-</td>
                            <td className="py-2.5 px-4 font-mono text-slate-200 text-xs">-</td>
                            <td className="py-2.5 px-4 font-mono text-slate-200 text-xs">-</td>
                            <td className="py-2.5 px-4 text-slate-200 text-xs">-</td>
                            <td className="py-2.5 px-4 text-slate-200 text-xs">-</td>
                            <td className="py-2.5 px-4 text-right text-slate-200 text-xs"></td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Cross-Check Table Pagination */}
              <DataTablePagination
                currentPage={safeCrossCheckPage}
                totalItems={crossCheckRows.length}
                pageSize={crossCheckPageSize}
                pageSizeOptions={[5, 6, 7, 8, 9, 10, 12, 14, 15, 20, 25, 50]}
                onPageChange={(p) => setCrossCheckPage(p)}
                onPageSizeChange={(newSize) => {
                  setCrossCheckPageSize(newSize);
                  setCrossCheckPage(1);
                }}
              />
            </div>
          )}

          {/* View 3: Attachments */}
          {activeTab === 'attachments' && (
            <div className="p-6 space-y-4 flex-1 min-h-0 flex flex-col">
              <h4 className="text-xs font-bold text-slate-900 font-heading">Attached Ingestion Files</h4>
              {effectiveAttachments.length === 0 ? (
                <div className="py-12 text-center text-slate-400 font-sans border border-dashed border-slate-200 rounded-xl">
                  <Paperclip size={32} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-700">No attached files</p>
                  <p className="text-xs text-slate-400 mt-1">This case does not have any attached files or batch feeds.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {effectiveAttachments.map((att: any, idx: number) => (
                    <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <div className="p-2.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg">
                          <FileSpreadsheet size={20} />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">{att.filename || 'dataset_feed.xlsx'}</span>
                          <span className="text-[11px] text-slate-500 font-mono block mt-0.5">{att.size || 'Ingested Feed'} · {att.uploadedAt || 'recently'}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={onExport}
                        className="px-2.5 py-1 text-xs font-medium bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-700 shadow-2xs transition cursor-pointer"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>

        {/* Right 1 Column: Cards (Workflow, Details, Revert) */}
        <div className="space-y-4 flex-1 min-h-0 flex flex-col overflow-y-auto">
          {/* Card 1: Workflow */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold font-heading text-slate-900">Workflow</h3>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-mono font-medium truncate max-w-[150px]">
                {workflow?.name || 'Active Pipeline'}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between text-slate-700">
                <div className="flex items-center space-x-2">
                  <Play size={12} className="text-emerald-500 fill-emerald-500" />
                  <span className="font-medium">Transaction ingress</span>
                </div>
                <span className="text-[10px] text-emerald-600 font-mono font-medium">
                  {effectiveTaskRows.length > 0 ? `${effectiveTaskRows.length} loaded` : 'Ready'}
                </span>
              </div>

              {workflow?.steps && workflow.steps.length > 0 ? (
                workflow.steps.slice(0, 3).map((step: any, sIdx: number) => (
                  <div key={step.id || sIdx} className="flex items-center justify-between text-slate-700">
                    <div className="flex items-center space-x-2 truncate">
                      <CircleDot size={12} className="text-slate-400 shrink-0" />
                      <span className="font-medium truncate">{step.name || step.ruleName || `Step ${sIdx + 1}`}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {step.checkType || 'Active'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-between text-slate-700">
                  <div className="flex items-center space-x-2">
                    <CircleDot size={12} className="text-slate-400" />
                    <span className="font-medium">Condition check · {workflow?.targetTable || 'tran_logtab'}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Configured</span>
                </div>
              )}

              <div className="flex items-center justify-between text-slate-500 text-[11px] pt-1 border-t border-slate-100">
                <div className="flex items-center space-x-1.5 text-emerald-600">
                  <Check size={11} />
                  <span>Pass: {displayRows.filter(r => r.investigationStatus === 'VERIFIED_MATCH').length}</span>
                </div>
                <div className="flex items-center space-x-1.5 text-rose-600">
                  <X size={11} />
                  <span>Flagged: {displayRows.filter(r => r.investigationStatus === 'FLAGGED_DISCREPANCY').length}</span>
                </div>
                <div className="flex items-center space-x-1.5 text-slate-400">
                  <span>Pending: {displayRows.filter(r => r.investigationStatus !== 'VERIFIED_MATCH' && r.investigationStatus !== 'FLAGGED_DISCREPANCY').length}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (workflows && workflows.length > 0) {
                  setShowWorkflowModal(true);
                } else if (onChangeWorkflow) {
                  onChangeWorkflow();
                }
              }}
              className="w-full flex items-center justify-center space-x-1.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer mt-1"
            >
              <Link2 size={12} className="text-slate-500" />
              <span>Change workflow</span>
            </button>
          </div>

          {/* Card 2: Details */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold font-heading text-slate-900">Details</h3>
            
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-normal">Priority</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize border ${
                  currentIssue?.priority === 'Critical' || currentIssue?.priority === 'High'
                    ? 'bg-rose-50 text-rose-700 border-rose-200/60'
                    : 'bg-amber-50 text-amber-700 border-amber-200/60'
                }`}>
                  {currentIssue?.priority || 'Medium'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-normal">Assignee</span>
                <span className="text-slate-700 font-medium">
                  {currentIssue?.assignedTechUserName || (currentIssue as any)?.assigneeName || 'Unassigned'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-normal">Reporter</span>
                <span className="text-slate-700 font-medium">
                  @{currentIssue?.creatorName || currentUser?.name || 'Operator'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-normal">SLA target</span>
                <span className={(() => {
                  const createdAt = currentIssue?.createdAt ? new Date(currentIssue.createdAt).getTime() : Date.now();
                  const elapsedHours = (Date.now() - createdAt) / (1000 * 60 * 60);
                  const isOverdue = elapsedHours > 24 && currentIssue?.status !== 'Closed';
                  return isOverdue ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium';
                })()}>
                  {(() => {
                    const createdAt = currentIssue?.createdAt ? new Date(currentIssue.createdAt).getTime() : Date.now();
                    const elapsedHours = (Date.now() - createdAt) / (1000 * 60 * 60);
                    if (elapsedHours > 24 && currentIssue?.status !== 'Closed') {
                      return `24h · ${Math.floor(elapsedHours - 24)}h over`;
                    }
                    return '24h · On track';
                  })()}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-normal">Batch</span>
                <span className="font-mono text-slate-700">
                  {(currentIssue as any)?.batchId || (currentIssue as any)?.batchNumber || (effectiveTaskRows[0]?.batch_id) || 'BATCH-001'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Revert */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex items-center justify-between">
            <span className="text-xs text-slate-600 font-sans">
              Revert case to last validated state
            </span>
            <button
              type="button"
              onClick={onRevertCase}
              className="flex items-center space-x-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 transition-colors cursor-pointer shadow-2xs"
            >
              <RotateCcw size={12} className="text-slate-500" />
              <span>Revert</span>
            </button>
          </div>
        </div>
      </div>

      {/* Workflow Selection Modal */}
      {showWorkflowModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold font-heading text-slate-900">Select Validation Pipeline</h3>
              <button
                type="button"
                onClick={() => setShowWorkflowModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {workflows.map((wf) => {
                const isSelected = workflow?.id === wf.id;
                return (
                  <button
                    key={wf.id}
                    type="button"
                    onClick={() => {
                      if (onSelectWorkflow) onSelectWorkflow(wf);
                      setShowWorkflowModal(false);
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-[#F27421] bg-orange-50/40 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">{wf.name}</span>
                      <span className="text-[11px] text-slate-500 font-mono mt-0.5 block">{wf.targetTable || 'tran_logtab'} · {wf.steps?.length || 0} steps</span>
                    </div>
                    {isSelected && (
                      <CheckCircle2 size={16} className="text-[#F27421]" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowWorkflowModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Transaction Investigation Drawer */}
      <TransactionInvestigationDrawer
        isOpen={Boolean(investigatingTxn)}
        onClose={() => setInvestigatingTxn(null)}
        transaction={investigatingTxn}
        caseItem={currentIssue}
        onUpdateInvestigationStatus={(rowId, status) => {
          const label = status === 'VERIFIED_MATCH' ? 'Reconciled' : status === 'FLAGGED_DISCREPANCY' ? 'Flagged' : status === 'CLOSED' ? 'Closed' : status === 'IN_PROGRESS' ? 'Investigating' : 'Pending';
          setRowOverrides(prev => ({
            ...prev,
            [rowId]: { ...(prev[rowId] || {}), investigationStatus: status, investigationLabel: label }
          }));
          if (investigatingTxn) {
            setInvestigatingTxn({ ...investigatingTxn, investigationStatus: status, investigationLabel: label });
          }
          if (onUpdateIssue && currentIssue) {
            const currentData = currentIssue.firstLevelMappedData || [];
            const updatedData = currentData.map((r: any) => {
              if (r.id === rowId || r.transaction_id === rowId || r.tx_id === rowId) {
                return { ...r, investigationStatus: status };
              }
              return r;
            });
            onUpdateIssue(currentIssue.id, { firstLevelMappedData: updatedData });
          }
        }}
        onCloseTransaction={(rowId, note) => {
          setRowOverrides(prev => ({
            ...prev,
            [rowId]: { ...(prev[rowId] || {}), investigationStatus: 'CLOSED', investigationLabel: 'Closed', isClosed: true, resolutionNote: note }
          }));
          if (investigatingTxn) {
            setInvestigatingTxn({ ...investigatingTxn, investigationStatus: 'CLOSED', investigationLabel: 'Closed', isClosed: true, resolutionNote: note });
          }
          if (onUpdateIssue && currentIssue) {
            const currentData = currentIssue.firstLevelMappedData || [];
            const updatedData = currentData.map((r: any) => {
              if (r.id === rowId || r.transaction_id === rowId || r.tx_id === rowId) {
                return { ...r, investigationStatus: 'CLOSED', isClosed: true, resolutionNote: note };
              }
              return r;
            });
            onUpdateIssue(currentIssue.id, { firstLevelMappedData: updatedData });
          }
        }}
        onTraceInDatabase={(txn) => {
          console.log('Tracing transaction:', txn);
        }}
        onRevertTransaction={(txn) => {
          const rowId = txn?.id || txn?.transaction_id || investigatingTxn?.id;
          if (rowId) {
            setRowOverrides(prev => ({
              ...prev,
              [rowId]: { ...(prev[rowId] || {}), investigationStatus: 'UNINVESTIGATED', investigationLabel: 'Pending', isClosed: false }
            }));
          }
          if (investigatingTxn) {
            setInvestigatingTxn({ ...investigatingTxn, investigationStatus: 'UNINVESTIGATED', investigationLabel: 'Pending', isClosed: false });
          }
        }}
        onOpenCompareResolve={(txn) => {
          setCompareResolveTxn(txn);
        }}
      />

      {/* Screen 23: Compare & Resolve Modal */}
      {compareResolveTxn && (
        <CompareAndResolveModal
          isOpen={Boolean(compareResolveTxn)}
          onClose={() => setCompareResolveTxn(null)}
          transaction={compareResolveTxn}
          caseId={currentIssue?.id || 'ISS-1792258589203-7468'}
          stageName="Stage 2 Settlement clearing"
          sourceDatabase="Sett"
          sourceTable="auth_log_tab"
          currentUserId={currentUser?.id}
          currentUserName={currentUser?.username}
          onSubmitSuccess={(prop) => {
            console.log('Resolution proposed successfully:', prop);
          }}
        />
      )}

      {/* Screen 27: Case Discussion Drawer */}
      {isDiscussionDrawerOpen && currentIssue && (
        <CaseDiscussionDrawer
          isOpen={isDiscussionDrawerOpen}
          onClose={() => setIsDiscussionDrawerOpen(false)}
          issue={currentIssue}
          currentUser={currentUser}
          onOpenEscalateModal={() => setIsEscalateModalOpen(true)}
        />
      )}

      {/* Screen 29: Escalate to Team Modal */}
      {isEscalateModalOpen && currentIssue && (
        <EscalateToTeamModal
          isOpen={isEscalateModalOpen}
          onClose={() => setIsEscalateModalOpen(false)}
          currentUser={currentUser}
          activeIssue={currentIssue}
          availableTeams={[]}
          onAgreementCreated={(newAgreement) => {
            setIsEscalateModalOpen(false);
            if (onUpdateIssue) {
              onUpdateIssue(currentIssue.id, {
                status: 'ESCALATED',
                escalatedToTeamId: newAgreement.receivingTeamId,
                escalationReason: newAgreement.escalationReason,
                escalatedAt: newAgreement.createdAt
              });
            }
          }}
        />
      )}

      {/* Screen 38: Stage Task Modal */}
      {isStageModalOpen && currentIssue && (
        <StageTaskModal
          isOpen={isStageModalOpen}
          onClose={() => setIsStageModalOpen(false)}
          issue={currentIssue}
          currentUser={currentUser}
          onStaged={(stagedIssue) => {
            if (onUpdateIssue) {
              onUpdateIssue(stagedIssue.id, stagedIssue);
            }
            setIsLevel2WorkspaceOpen(true);
          }}
        />
      )}
    </div>
  );
}

