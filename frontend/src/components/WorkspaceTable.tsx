/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { WorkspaceTableRecord, User, GlobalTransactionSchemaField } from '../types';
import { api } from '../api/client';
import { globalMappingService } from '../services/globalMappingService';
import { 
  Table, Database, FileText, Search, Trash2, RefreshCw, 
  Layers, User as UserIcon, CheckSquare, Filter, ArrowLeft, Download, ShieldCheck,
  Eye, EyeOff, ChevronDown, ChevronUp, Tag, DollarSign, Calendar, Mail, 
  Store, Hash, CheckCircle2, AlertCircle, X, ExternalLink, SlidersHorizontal,
  FileSpreadsheet, ArrowRightLeft, Sparkles, Copy, Check,
  ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { Button } from './common/Button';
import { Badge } from './common/Badge';
import { Modal } from './common/Overlay';
import { ConfirmDialog } from './common/Feedback';
import { EmptyState } from './common/EmptyState';

interface WorkspaceTableProps {
  currentUser?: User;
  onNavigateToWorkspace?: () => void;
  onNavigateToCase?: (issueId: string) => void;
}

export default function WorkspaceTable({
  currentUser,
  onNavigateToWorkspace,
  onNavigateToCase
}: WorkspaceTableProps) {
  const [standardFields, setStandardFields] = useState<GlobalTransactionSchemaField[]>(() => {
    return globalMappingService.getStandardFields();
  });

  const [records, setRecords] = useState<WorkspaceTableRecord[]>(() => {
    const saved = localStorage.getItem('workspace_table_records');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.warn('Failed to parse saved workspace_table_records from localStorage', e);
      }
    }
    return [];
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [tagFilter, setTagFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [fileFilter, setFileFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isTableVisible, setIsTableVisible] = useState(true);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<WorkspaceTableRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteAlert, setDeleteAlert] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const handleToggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Column visibility state for global schema columns
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    file_name: true,
    user: true,
    tag: true,
    task_id: true,
    transaction_id: true,
    card_number: true,
    amount_usd: true,
    status_state: true,
    created_at: true,
    user_email: true,
    merchant_id: true,
    response_code: false,
    currency: false,
    terminal_id: false,
    dispute_reason: false,
    batch_seq_num: false
  });

  // Sync from backend if available
  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      const data = await api.getWorkspaceTableRecords();
      if (Array.isArray(data)) {
        setRecords(data);
        localStorage.setItem('workspace_table_records', JSON.stringify(data));
      }
      setStandardFields(globalMappingService.getStandardFields());
    } catch (e) {
      console.warn('Backend workspace-table fetch offline, using local state', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const handleDeleteRecord = async (id: string) => {
    const updated = records.filter(r => r.id !== id);
    setRecords(updated);
    localStorage.setItem('workspace_table_records', JSON.stringify(updated));
    setDeleteAlert('Record removed from centralized collection table.');
    setTimeout(() => setDeleteAlert(null), 3500);
    try {
      await api.deleteWorkspaceTableRecord(id);
    } catch (e) {
      console.warn('Backend delete error:', e);
    }
  };

  const executeClearAll = async () => {
    setConfirmClearOpen(false);
    setRecords([]);
    localStorage.removeItem('workspace_table_records');
    setDeleteAlert('All centralized collection records have been cleared.');
    setTimeout(() => setDeleteAlert(null), 3500);
    try {
      await api.clearWorkspaceTableRecords();
    } catch (e) {
      console.warn('Backend clear workspace table error:', e);
    }
  };

  const handleClearAll = () => {
    setConfirmClearOpen(true);
  };

  const handleCopyValue = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (filteredRecords.length === 0) {
      alert('No records available to export.');
      return;
    }

    const headers = [
      'File Name',
      'User',
      'Tag',
      'Task ID',
      'Upload Date',
      ...standardFields.map(f => f.label)
    ];

    const rows = filteredRecords.map(rec => {
      const trans = rec.transformed_data || {};
      return [
        `"${rec.file_name}"`,
        `"${rec.user || rec.user_id}"`,
        `"${rec.tag || 'Untagged'}"`,
        `"${rec.task_id}"`,
        `"${rec.createdAt || ''}"`,
        ...standardFields.map(f => {
          const val = trans[f.key] !== undefined && trans[f.key] !== null ? String(trans[f.key]) : '';
          return `"${val.replace(/"/g, '""')}"`;
        })
      ].join(',');
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `centralized_uploaded_data_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to JSON
  const handleExportJson = () => {
    if (filteredRecords.length === 0) {
      alert('No records available to export.');
      return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredRecords, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `centralized_uploaded_data_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Distinct filter options
  const uniqueTags = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (r.tag) set.add(r.tag);
    });
    return Array.from(set);
  }, [records]);

  const uniqueUsers = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      const u = r.user || r.user_id;
      if (u) set.add(u);
    });
    return Array.from(set);
  }, [records]);

  const uniqueFiles = useMemo(() => {
    const set = new Set<string>();
    records.forEach(r => {
      if (r.file_name) set.add(r.file_name);
    });
    return Array.from(set);
  }, [records]);

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return records.filter(rec => {
      const trans = rec.transformed_data || {};
      const searchLower = searchTerm.toLowerCase();

      // Search across metadata and all transformed global fields
      const matchesSearch = !searchTerm || (
        rec.file_name.toLowerCase().includes(searchLower) ||
        (rec.user && rec.user.toLowerCase().includes(searchLower)) ||
        rec.user_id.toLowerCase().includes(searchLower) ||
        (rec.tag && rec.tag.toLowerCase().includes(searchLower)) ||
        rec.task_id.toLowerCase().includes(searchLower) ||
        Object.values(trans).some(v => String(v).toLowerCase().includes(searchLower))
      );

      const matchesTag = tagFilter === 'all' || rec.tag === tagFilter;
      const matchesUser = userFilter === 'all' || (rec.user === userFilter || rec.user_id === userFilter);
      const matchesFile = fileFilter === 'all' || rec.file_name === fileFilter;
      
      const recordStatus = String(trans.status_state || trans.status || '').toUpperCase();
      const matchesStatus = statusFilter === 'all' || recordStatus === statusFilter.toUpperCase();

      return matchesSearch && matchesTag && matchesUser && matchesFile && matchesStatus;
    });
  }, [records, searchTerm, tagFilter, userFilter, fileFilter, statusFilter]);

  // Reset page on filter or sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, tagFilter, userFilter, fileFilter, statusFilter, sortField, sortDirection]);

  // Sorted Records
  const sortedRecords = useMemo(() => {
    if (!sortField) return filteredRecords;
    return [...filteredRecords].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (valA === undefined && a.transformed_data) {
        valA = a.transformed_data[sortField];
      }
      if (valB === undefined && b.transformed_data) {
        valB = b.transformed_data[sortField];
      }
      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      const numA = Number(valA);
      const numB = Number(valB);
      if (!isNaN(numA) && !isNaN(numB) && typeof valA !== 'boolean') {
        return sortDirection === 'asc' ? numA - numB : numB - numA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortDirection === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredRecords, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedRecords.slice(start, start + pageSize);
  }, [sortedRecords, currentPage, pageSize]);

  // Aggregate Stats
  const totalVolume = useMemo(() => {
    return filteredRecords.reduce((sum, r) => {
      const amt = Number(r.transformed_data?.amount_usd || 0);
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);
  }, [filteredRecords]);

  // Helper for Status Badge styling
  const renderStatusBadge = (status: string) => {
    const s = String(status || 'PENDING').toUpperCase();
    if (s.includes('AUTH') || s.includes('SETTLE') || s.includes('SUCCESS') || s.includes('CLEAR')) {
      return <Badge variant="pass" size="sm">{s}</Badge>;
    }
    if (s.includes('DECLIN') || s.includes('FAIL') || s.includes('REVERS') || s.includes('ERROR')) {
      return <Badge variant="critical" size="sm">{s}</Badge>;
    }
    return <Badge variant="investigating" size="sm">{s || 'PENDING'}</Badge>;
  };

  // Helper for Tag Badge styling
  const renderTagBadge = (tag: string) => {
    const formatted = tag ? (tag.startsWith('#') ? tag : `#${tag}`) : '#Untagged';
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
        <Tag size={10} className="mr-1 text-indigo-500" />
        {formatted}
      </span>
    );
  };


  const renderSortIndicator = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown size={11} className="text-slate-400 opacity-40 group-hover:opacity-100 transition-opacity" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp size={11} className="text-ds-primary" />
    ) : (
      <ArrowDown size={11} className="text-ds-primary" />
    );
  };

  return (
    <div className="space-y-3.5 font-sans">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 sm:p-3.5 bg-[#0F172B] rounded-xl text-white shadow-sm border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-blue-500/20 rounded-lg text-blue-400 border border-blue-500/30">
              <Table size={16} />
            </div>
            <h2 className="text-sm font-bold tracking-tight">Centralized Uploaded Data Master Table</h2>
            <span className="text-[10px] bg-[#155DFC]/20 text-blue-300 border border-[#155DFC]/30 px-2 py-0.5 rounded-full font-mono font-bold">
              {records.length} Transactions Collected
            </span>
          </div>
          <p className="text-[11px] text-slate-300 max-w-3xl leading-relaxed">
            Central repository capturing all uploaded transaction batches upon task creation, transformed into the <strong>Global Standard Schema</strong> columns with source file names, uploaders, and assigned category tags.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onNavigateToWorkspace && (
            <button
              type="button"
              onClick={onNavigateToWorkspace}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer border border-white/10"
            >
              <ArrowLeft size={13} />
              <span>Back to Workspace</span>
            </button>
          )}
          <button
            type="button"
            onClick={fetchRecords}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh Table</span>
          </button>
        </div>
      </div>

      {/* Alert Notification */}
      {deleteAlert && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between shadow-2xs animate-fadeIn">
          <div className="flex items-center space-x-2">
            <CheckCircle2 size={15} className="text-emerald-600" />
            <span className="font-semibold">{deleteAlert}</span>
          </div>
          <button type="button" onClick={() => setDeleteAlert(null)} className="text-emerald-600 hover:text-emerald-900">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Quick KPI / Summary Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Centralized Records</span>
            <span className="text-xl font-bold text-slate-900 font-mono">{filteredRecords.length}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">of {records.length} total</span>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
            <Layers size={18} />
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Distinct Files</span>
            <span className="text-xl font-bold text-slate-900 font-mono">{uniqueFiles.length}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">batch uploads</span>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
            <FileSpreadsheet size={18} />
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Total USD Volume</span>
            <span className="text-xl font-bold text-emerald-700 font-mono">
              ${totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">calculated volume</span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
            <DollarSign size={18} />
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Contributing Users</span>
            <span className="text-xl font-bold text-slate-900 font-mono">{uniqueUsers.length}</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">{uniqueTags.length} distinct tags</span>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
            <UserIcon size={18} />
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3.5">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3.5 top-3 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search by transaction ID, card PAN, email, merchant, file, tag, or user..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 font-sans shadow-2xs"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle Table Visibility */}
            <button
              type="button"
              onClick={() => setIsTableVisible(prev => !prev)}
              className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                isTableVisible
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700 shadow-xs'
              }`}
              title={isTableVisible ? "Hide table records" : "Show table records"}
            >
              {isTableVisible ? (
                <>
                  <EyeOff size={13} className="text-slate-600" />
                  <span>Hide Table</span>
                </>
              ) : (
                <>
                  <Eye size={13} className="text-white" />
                  <span>Show Table</span>
                </>
              )}
            </button>

            {/* Column Selector Toggle */}
            <button
              type="button"
              onClick={() => setShowColumnSelector(prev => !prev)}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                showColumnSelector
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              <SlidersHorizontal size={13} className="text-slate-500" />
              <span>Columns</span>
              <ChevronDown size={13} className={showColumnSelector ? 'rotate-180 transition-transform' : ''} />
            </button>

            {/* Export Buttons */}
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                title="Export filtered records to CSV"
              >
                <Download size={13} className="text-slate-500" />
                <span>CSV</span>
              </button>

              <button
                type="button"
                onClick={handleExportJson}
                className="px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
                title="Export filtered records to JSON"
              >
                <Download size={13} className="text-slate-500" />
                <span>JSON</span>
              </button>
            </div>

            {/* Clear Table Button */}
            {records.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="px-3 py-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center space-x-1 shadow-2xs"
                title="Clear all records in the centralized collection"
              >
                <Trash2 size={13} />
                <span>Clear All</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Dropdowns Row */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center space-x-1 text-slate-400 font-semibold text-[11px] uppercase mr-1">
            <Filter size={12} />
            <span>Filters:</span>
          </div>

          {/* Tag Filter */}
          <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Tag:</span>
            <select
              value={tagFilter}
              onChange={e => setTagFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="all">All Tags ({uniqueTags.length})</option>
              {uniqueTags.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* User Filter */}
          <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg">
            <span className="text-[10px] font-bold text-slate-500 uppercase">User:</span>
            <select
              value={userFilter}
              onChange={e => setUserFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="all">All Users ({uniqueUsers.length})</option>
              {uniqueUsers.map(u => (
                <option key={u} value={u}>@{u}</option>
              ))}
            </select>
          </div>

          {/* File Filter */}
          <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg">
            <span className="text-[10px] font-bold text-slate-500 uppercase">File:</span>
            <select
              value={fileFilter}
              onChange={e => setFileFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[160px] truncate"
            >
              <option value="all">All Files ({uniqueFiles.length})</option>
              {uniqueFiles.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Status:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="AUTHORIZED">AUTHORIZED</option>
              <option value="SETTLED">SETTLED</option>
              <option value="PENDING">PENDING</option>
              <option value="DECLINED">DECLINED</option>
            </select>
          </div>

          {/* Reset Filters button if any active */}
          {(tagFilter !== 'all' || userFilter !== 'all' || fileFilter !== 'all' || statusFilter !== 'all' || searchTerm) && (
            <button
              type="button"
              onClick={() => {
                setTagFilter('all');
                setUserFilter('all');
                setFileFilter('all');
                setStatusFilter('all');
                setSearchTerm('');
              }}
              className="px-2 py-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Column Visibility Selector Panel */}
        {showColumnSelector && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 animate-fadeIn">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <SlidersHorizontal size={14} className="text-indigo-600" />
                Customize Visible Global Schema Columns
              </span>
              <div className="space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const allTrue: Record<string, boolean> = {
                      file_name: true, user: true, tag: true, task_id: true
                    };
                    standardFields.forEach(f => { allTrue[f.key] = true; });
                    setVisibleColumns(allTrue);
                  }}
                  className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => {
                    const defaults: Record<string, boolean> = {
                      file_name: true, user: true, tag: true, task_id: true,
                      transaction_id: true, card_number: true, amount_usd: true,
                      status_state: true, created_at: true, user_email: true
                    };
                    setVisibleColumns(defaults);
                  }}
                  className="text-[11px] font-bold text-slate-600 hover:underline cursor-pointer"
                >
                  Restore Defaults
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
              {/* Metadata Columns */}
              <label className="flex items-center space-x-2 p-1.5 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={!!visibleColumns.file_name}
                  onChange={e => setVisibleColumns(prev => ({ ...prev, file_name: e.target.checked }))}
                  className="rounded text-blue-600 focus:ring-0"
                />
                <span className="font-semibold text-slate-800">File Name</span>
              </label>

              <label className="flex items-center space-x-2 p-1.5 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={!!visibleColumns.user}
                  onChange={e => setVisibleColumns(prev => ({ ...prev, user: e.target.checked }))}
                  className="rounded text-blue-600 focus:ring-0"
                />
                <span className="font-semibold text-slate-800">User</span>
              </label>

              <label className="flex items-center space-x-2 p-1.5 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={!!visibleColumns.tag}
                  onChange={e => setVisibleColumns(prev => ({ ...prev, tag: e.target.checked }))}
                  className="rounded text-blue-600 focus:ring-0"
                />
                <span className="font-semibold text-slate-800">Tag</span>
              </label>

              <label className="flex items-center space-x-2 p-1.5 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={!!visibleColumns.task_id}
                  onChange={e => setVisibleColumns(prev => ({ ...prev, task_id: e.target.checked }))}
                  className="rounded text-blue-600 focus:ring-0"
                />
                <span className="font-semibold text-slate-800">Task ID</span>
              </label>

              {/* Global Standard Columns */}
              {standardFields.map(field => (
                <label 
                  key={field.key} 
                  className="flex items-center space-x-2 p-1.5 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50"
                  title={field.description}
                >
                  <input
                    type="checkbox"
                    checked={visibleColumns[field.key] !== false}
                    onChange={e => setVisibleColumns(prev => ({ ...prev, [field.key]: e.target.checked }))}
                    className="rounded text-blue-600 focus:ring-0"
                  />
                  <span className="font-semibold text-slate-800 truncate" title={field.label}>
                    {field.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Collapsed State Banner when Table is Hidden */}
      {!isTableVisible && (
        <div 
          onClick={() => setIsTableVisible(true)}
          className="p-5 bg-slate-50 hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 rounded-2xl flex items-center justify-between cursor-pointer transition-all shadow-2xs group"
        >
          <div className="flex items-center space-x-3.5">
            <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Table size={20} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-800">Centralized Data Table is Collapsed</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  {filteredRecords.length} records in collection
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Click anywhere on this banner to expand and view the records transformed into global schema fields.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-1.5 text-xs font-bold text-blue-600 group-hover:text-blue-700 bg-white border border-blue-200 px-3.5 py-2 rounded-xl shadow-2xs">
            <Eye size={14} />
            <span>Show Table</span>
            <ChevronDown size={14} />
          </div>
        </div>
      )}

      {/* Main Table Display */}
      {isTableVisible && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider font-mono">
                  {/* METADATA COLUMNS */}
                  {visibleColumns.file_name && (
                    <th 
                      onClick={() => handleToggleSort('file_name')}
                      className="py-3.5 px-4 min-w-[160px] cursor-pointer select-none hover:bg-slate-100/80 transition-colors group"
                    >
                      <div className="flex items-center justify-between space-x-1.5 text-blue-700">
                        <div className="flex items-center space-x-1.5">
                          <FileText size={13} />
                          <span>File Name</span>
                        </div>
                        {renderSortIndicator('file_name')}
                      </div>
                    </th>
                  )}

                  {visibleColumns.user && (
                    <th 
                      onClick={() => handleToggleSort('user')}
                      className="py-3.5 px-4 min-w-[120px] cursor-pointer select-none hover:bg-slate-100/80 transition-colors group"
                    >
                      <div className="flex items-center justify-between space-x-1.5 text-amber-700">
                        <div className="flex items-center space-x-1.5">
                          <UserIcon size={13} />
                          <span>User</span>
                        </div>
                        {renderSortIndicator('user')}
                      </div>
                    </th>
                  )}

                  {visibleColumns.tag && (
                    <th 
                      onClick={() => handleToggleSort('tag')}
                      className="py-3.5 px-4 min-w-[130px] cursor-pointer select-none hover:bg-slate-100/80 transition-colors group"
                    >
                      <div className="flex items-center justify-between space-x-1.5 text-indigo-700">
                        <div className="flex items-center space-x-1.5">
                          <Tag size={13} />
                          <span>Tag</span>
                        </div>
                        {renderSortIndicator('tag')}
                      </div>
                    </th>
                  )}

                  {visibleColumns.task_id && (
                    <th 
                      onClick={() => handleToggleSort('task_id')}
                      className="py-3.5 px-4 min-w-[110px] cursor-pointer select-none hover:bg-slate-100/80 transition-colors group"
                    >
                      <div className="flex items-center justify-between space-x-1.5 text-sky-700">
                        <div className="flex items-center space-x-1.5">
                          <CheckSquare size={13} />
                          <span>Task ID</span>
                        </div>
                        {renderSortIndicator('task_id')}
                      </div>
                    </th>
                  )}

                  {/* GLOBAL STANDARD SCHEMA COLUMNS */}
                  {standardFields.map(field => {
                    if (visibleColumns[field.key] === false) return null;
                    return (
                      <th 
                        key={field.key} 
                        onClick={() => handleToggleSort(field.key)}
                        className="py-3.5 px-4 min-w-[140px] cursor-pointer select-none hover:bg-slate-100/80 transition-colors group" 
                        title={field.description}
                      >
                        <div className="flex items-center justify-between space-x-1.5 text-slate-700">
                          <div className="flex items-center space-x-1.5">
                            {field.key === 'transaction_id' && <Hash size={13} className="text-blue-600" />}
                            {field.key === 'card_number' && <ShieldCheck size={13} className="text-purple-600" />}
                            {field.key === 'amount_usd' && <DollarSign size={13} className="text-emerald-600" />}
                            {field.key === 'status_state' && <CheckCircle2 size={13} className="text-teal-600" />}
                            {field.key === 'created_at' && <Calendar size={13} className="text-orange-600" />}
                            {field.key === 'user_email' && <Mail size={13} className="text-pink-600" />}
                            {field.key === 'merchant_id' && <Store size={13} className="text-amber-600" />}
                            <span>{field.label}</span>
                          </div>
                          {renderSortIndicator(field.key)}
                        </div>
                      </th>
                    );
                  })}

                  <th className="py-3.5 px-4 text-right min-w-[100px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans text-slate-800">
                {sortedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="p-8">
                      <EmptyState
                        title="No Centralized Records Found"
                        description={
                          searchTerm || tagFilter !== 'all' || userFilter !== 'all' || fileFilter !== 'all' || statusFilter !== 'all'
                            ? "No records match your active search and filter criteria."
                            : "Upload a batch file when creating a task to automatically populate this centralized collection table with transformed global schema columns."
                        }
                        action={
                          (searchTerm || tagFilter !== 'all' || userFilter !== 'all' || fileFilter !== 'all' || statusFilter !== 'all') ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setSearchTerm('');
                                setTagFilter('all');
                                setUserFilter('all');
                                setFileFilter('all');
                                setStatusFilter('all');
                              }}
                            >
                              Clear All Filters
                            </Button>
                          ) : undefined
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  paginatedRecords.map((rec) => {
                    const trans = rec.transformed_data || {};
                    const raw = rec.raw_data || {};

                    return (
                      <tr key={rec.id} className="hover:bg-blue-50/40 transition-colors group">
                        {/* 1. File Name */}
                        {visibleColumns.file_name && (
                          <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                            <div className="flex items-center space-x-2">
                              <FileText size={14} className="text-blue-500 shrink-0" />
                              <span className="truncate max-w-[180px]" title={rec.file_name}>
                                {rec.file_name}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* 2. User */}
                        {visibleColumns.user && (
                          <td className="py-3.5 px-4 font-mono text-slate-700">
                            <div className="flex items-center space-x-1.5">
                              <UserIcon size={13} className="text-amber-500 shrink-0" />
                              <span className="font-semibold text-slate-800">@{rec.user || rec.user_id}</span>
                            </div>
                          </td>
                        )}

                        {/* 3. Tag */}
                        {visibleColumns.tag && (
                          <td className="py-3.5 px-4">
                            {renderTagBadge(rec.tag)}
                          </td>
                        )}

                        {/* 4. Task ID */}
                        {visibleColumns.task_id && (
                          <td className="py-3.5 px-4 font-mono">
                            {onNavigateToCase ? (
                              <button
                                type="button"
                                onClick={() => onNavigateToCase(rec.task_id)}
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-bold transition-all cursor-pointer"
                                title={`Open Task ${rec.task_id}`}
                              >
                                <span>{rec.task_id}</span>
                                <ExternalLink size={11} className="text-blue-500" />
                              </button>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold">
                                {rec.task_id}
                              </span>
                            )}
                          </td>
                        )}

                        {/* 5. GLOBAL STANDARD SCHEMA COLUMNS */}
                        {standardFields.map(field => {
                          if (visibleColumns[field.key] === false) return null;
                          const val = trans[field.key];
                          const strVal = val !== undefined && val !== null ? String(val) : '';

                          // Format specific fields for premium look & feel
                          if (field.key === 'transaction_id') {
                            return (
                              <td key={field.key} className="py-3.5 px-4 font-mono font-bold text-slate-900">
                                <div className="flex items-center space-x-1">
                                  <span>{strVal || '-'}</span>
                                  {strVal && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopyValue(strVal, `${rec.id}-${field.key}`)}
                                      className="text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                                      title="Copy Transaction ID"
                                    >
                                      {copiedId === `${rec.id}-${field.key}` ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                    </button>
                                  )}
                                </div>
                              </td>
                            );
                          }

                          if (field.key === 'card_number') {
                            return (
                              <td key={field.key} className="py-3.5 px-4 font-mono text-slate-700">
                                <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px]">
                                  {strVal || '-'}
                                </span>
                              </td>
                            );
                          }

                          if (field.key === 'amount_usd') {
                            const num = parseFloat(strVal);
                            return (
                              <td key={field.key} className="py-3.5 px-4 font-mono font-bold text-emerald-700">
                                {!isNaN(num) ? `$${num.toFixed(2)}` : (strVal || '-')}
                              </td>
                            );
                          }

                          if (field.key === 'status_state') {
                            return (
                              <td key={field.key} className="py-3.5 px-4">
                                {renderStatusBadge(strVal)}
                              </td>
                            );
                          }

                          if (field.key === 'created_at') {
                            return (
                              <td key={field.key} className="py-3.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                                {strVal ? new Date(strVal).toLocaleString() : '-'}
                              </td>
                            );
                          }

                          if (field.key === 'user_email') {
                            return (
                              <td key={field.key} className="py-3.5 px-4 text-slate-700 truncate max-w-[170px]" title={strVal}>
                                {strVal ? (
                                  <span className="flex items-center space-x-1">
                                    <Mail size={12} className="text-slate-400 shrink-0" />
                                    <span className="truncate">{strVal}</span>
                                  </span>
                                ) : '-'}
                              </td>
                            );
                          }

                          return (
                            <td key={field.key} className="py-3.5 px-4 font-mono text-slate-700 truncate max-w-[160px]" title={strVal}>
                              {strVal || <span className="text-slate-300 italic">-</span>}
                            </td>
                          );
                        })}

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {/* Inspect Row Details */}
                            <button
                              type="button"
                              onClick={() => setSelectedRecordForDetail(rec)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="Inspect Transformed vs Raw Data"
                            >
                              <Eye size={14} />
                            </button>

                            {/* Delete Entry */}
                            <button
                              type="button"
                              onClick={() => handleDeleteRecord(rec.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash2 size={14} />
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

          {/* Footer Bar with Full Pagination Controls */}
          <div className="p-3.5 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-600 gap-3">
            <div className="flex items-center space-x-4">
              <span className="font-mono text-[11px]">
                Showing <strong>{sortedRecords.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}</strong> - <strong>{Math.min(currentPage * pageSize, sortedRecords.length)}</strong> of <strong>{sortedRecords.length}</strong> records
                {records.length !== sortedRecords.length && <span className="text-slate-400 ml-1">({records.length} total)</span>}
              </span>

              <div className="flex items-center space-x-1.5 text-[11px]">
                <span className="text-slate-500">Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
                  className="bg-white border border-slate-200 rounded-md px-2 py-0.5 text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {/* Pagination Buttons */}
            <div className="flex items-center space-x-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                leftIcon={<ChevronLeft size={13} />}
              >
                Previous
              </Button>

              <span className="px-2 font-mono text-xs text-slate-700 font-semibold">
                Page {currentPage} of {totalPages}
              </span>

              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                rightIcon={<ChevronRight size={13} />}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Inspection Modal using accessible shared Modal */}
      {selectedRecordForDetail && (
        <Modal
          open={Boolean(selectedRecordForDetail)}
          onClose={() => setSelectedRecordForDetail(null)}
          title="Transaction Record Inspector"
          description={`Record ID: ${selectedRecordForDetail.id}`}
          size="lg"
          footer={
            <Button variant="secondary" onClick={() => setSelectedRecordForDetail(null)}>
              Close Inspector
            </Button>
          }
        >
          <div className="space-y-4">
            {/* Metadata Summary Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-ds-surface-elevated/40 p-3.5 rounded-ds-md border border-ds-border text-xs">
              <div>
                <span className="text-[10px] font-bold text-ds-muted uppercase block">Source File</span>
                <span className="font-mono font-semibold text-ds-text truncate block" title={selectedRecordForDetail.file_name}>
                  {selectedRecordForDetail.file_name}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-ds-muted uppercase block">Uploaded User</span>
                <span className="font-mono font-semibold text-ds-text">
                  @{selectedRecordForDetail.user || selectedRecordForDetail.user_id}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-ds-muted uppercase block">Category Tag</span>
                <div>{renderTagBadge(selectedRecordForDetail.tag)}</div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-ds-muted uppercase block">Associated Task</span>
                <span className="font-mono font-bold text-ds-primary">{selectedRecordForDetail.task_id}</span>
              </div>
            </div>

            {/* Side-by-side Transformed vs Raw View */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Transformed Global Schema Values */}
              <div className="space-y-2">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-ds-primary">
                  <Sparkles size={14} />
                  <span>Transformed Global Schema Fields</span>
                </div>
                <div className="bg-ds-surface-elevated/30 border border-ds-border rounded-ds-md p-3 space-y-2 text-xs max-h-72 overflow-y-auto">
                  {Object.entries(selectedRecordForDetail.transformed_data || {}).map(([key, val]) => (
                    <div key={key} className="flex justify-between items-center py-1 border-b border-ds-border/60 last:border-0 font-mono text-[11px]">
                      <span className="text-ds-muted font-semibold">{key}:</span>
                      <span className="font-bold text-ds-text max-w-[200px] truncate" title={String(val)}>
                        {String(val || '')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Raw Uploaded Row Values */}
              <div className="space-y-2">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-ds-muted">
                  <FileText size={14} />
                  <span>Original Raw Uploaded Row</span>
                </div>
                <div className="bg-ds-surface-elevated/30 border border-ds-border rounded-ds-md p-3 space-y-2 text-xs max-h-72 overflow-y-auto">
                  {Object.entries(selectedRecordForDetail.raw_data || {}).length > 0 ? (
                    Object.entries(selectedRecordForDetail.raw_data || {}).map(([key, val]) => (
                      <div key={key} className="flex justify-between items-center py-1 border-b border-ds-border/60 last:border-0 font-mono text-[11px]">
                        <span className="text-ds-muted">{key}:</span>
                        <span className="text-ds-text max-w-[200px] truncate" title={String(val)}>
                          {String(val || '')}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-ds-muted italic text-[11px] py-4 text-center">
                      No raw row snapshot preserved.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Accessible Confirm Dialog for Clear All */}
      <ConfirmDialog
        open={confirmClearOpen}
        title="Clear Centralized Records"
        message="Are you sure you want to clear all Centralized Uploaded Data records? This action cannot be undone."
        confirmLabel="Clear All Records"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={executeClearAll}
        onCancel={() => setConfirmClearOpen(false)}
      />
    </div>
  );
}
