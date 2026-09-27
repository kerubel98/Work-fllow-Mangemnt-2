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
  FileSpreadsheet, ArrowRightLeft, Sparkles, Copy, Check
} from 'lucide-react';

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

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear all Centralized Uploaded Data records?')) return;
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
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
          {s}
        </span>
      );
    }
    if (s.includes('DECLIN') || s.includes('FAIL') || s.includes('REVERS') || s.includes('ERROR')) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1" />
          {s}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1" />
        {s || 'PENDING'}
      </span>
    );
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
                    <th className="py-3.5 px-4 min-w-[160px]">
                      <div className="flex items-center space-x-1.5 text-blue-700">
                        <FileText size={13} />
                        <span>File Name</span>
                      </div>
                    </th>
                  )}

                  {visibleColumns.user && (
                    <th className="py-3.5 px-4 min-w-[120px]">
                      <div className="flex items-center space-x-1.5 text-amber-700">
                        <UserIcon size={13} />
                        <span>User</span>
                      </div>
                    </th>
                  )}

                  {visibleColumns.tag && (
                    <th className="py-3.5 px-4 min-w-[130px]">
                      <div className="flex items-center space-x-1.5 text-indigo-700">
                        <Tag size={13} />
                        <span>Tag</span>
                      </div>
                    </th>
                  )}

                  {visibleColumns.task_id && (
                    <th className="py-3.5 px-4 min-w-[110px]">
                      <div className="flex items-center space-x-1.5 text-sky-700">
                        <CheckSquare size={13} />
                        <span>Task ID</span>
                      </div>
                    </th>
                  )}

                  {/* GLOBAL STANDARD SCHEMA COLUMNS */}
                  {standardFields.map(field => {
                    if (visibleColumns[field.key] === false) return null;
                    return (
                      <th key={field.key} className="py-3.5 px-4 min-w-[140px]" title={field.description}>
                        <div className="flex items-center space-x-1.5 text-slate-700">
                          {field.key === 'transaction_id' && <Hash size={13} className="text-blue-600" />}
                          {field.key === 'card_number' && <ShieldCheck size={13} className="text-purple-600" />}
                          {field.key === 'amount_usd' && <DollarSign size={13} className="text-emerald-600" />}
                          {field.key === 'status_state' && <CheckCircle2 size={13} className="text-teal-600" />}
                          {field.key === 'created_at' && <Calendar size={13} className="text-orange-600" />}
                          {field.key === 'user_email' && <Mail size={13} className="text-pink-600" />}
                          {field.key === 'merchant_id' && <Store size={13} className="text-amber-600" />}
                          <span>{field.label}</span>
                        </div>
                      </th>
                    );
                  })}

                  <th className="py-3.5 px-4 text-right min-w-[100px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans text-slate-800">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="py-16 text-center text-slate-400">
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                        <Table size={28} />
                      </div>
                      <p className="font-bold text-slate-700 text-sm">No Centralized Records Found</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                        {searchTerm || tagFilter !== 'all' || userFilter !== 'all'
                          ? 'No records match your active search and filter parameters.'
                          : 'Upload a batch file when creating a task to automatically populate this centralized collection table with transformed global schema columns.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((rec) => {
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

          {/* Footer Bar */}
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
            <span className="font-mono">
              Showing <strong>{filteredRecords.length}</strong> of <strong>{records.length}</strong> centralized records
            </span>
            <div className="flex items-center space-x-2 text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Transformed via Global Column Dictionary</span>
            </div>
          </div>
        </div>
      )}

      {/* Detail Inspection Modal */}
      {selectedRecordForDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  <Database size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Transaction Record Inspector</h3>
                  <p className="text-[11px] text-slate-500 font-mono">ID: {selectedRecordForDetail.id}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecordForDetail(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Metadata Summary Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Source File</span>
                <span className="font-mono font-semibold text-slate-800 truncate block" title={selectedRecordForDetail.file_name}>
                  {selectedRecordForDetail.file_name}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Uploaded User</span>
                <span className="font-mono font-semibold text-slate-800">
                  @{selectedRecordForDetail.user || selectedRecordForDetail.user_id}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Category Tag</span>
                <div>{renderTagBadge(selectedRecordForDetail.tag)}</div>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Associated Task</span>
                <span className="font-mono font-bold text-blue-700">{selectedRecordForDetail.task_id}</span>
              </div>
            </div>

            {/* Side-by-side Transformed vs Raw View */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Transformed Global Schema Values */}
              <div className="space-y-2">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-indigo-700">
                  <Sparkles size={14} />
                  <span>Transformed Global Schema Fields</span>
                </div>
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 space-y-2 text-xs max-h-72 overflow-y-auto">
                  {Object.entries(selectedRecordForDetail.transformed_data || {}).map(([key, val]) => (
                    <div key={key} className="flex justify-between items-center py-1 border-b border-indigo-100/60 last:border-0 font-mono text-[11px]">
                      <span className="text-slate-600 font-semibold">{key}:</span>
                      <span className="font-bold text-slate-900 max-w-[200px] truncate" title={String(val)}>
                        {String(val || '')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Raw Uploaded Row Values */}
              <div className="space-y-2">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700">
                  <FileText size={14} />
                  <span>Original Raw Uploaded Row</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-xs max-h-72 overflow-y-auto">
                  {Object.entries(selectedRecordForDetail.raw_data || {}).length > 0 ? (
                    Object.entries(selectedRecordForDetail.raw_data || {}).map(([key, val]) => (
                      <div key={key} className="flex justify-between items-center py-1 border-b border-slate-200/60 last:border-0 font-mono text-[11px]">
                        <span className="text-slate-500">{key}:</span>
                        <span className="text-slate-800 max-w-[200px] truncate" title={String(val)}>
                          {String(val || '')}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400 italic text-[11px] py-4 text-center">
                      No raw row snapshot preserved.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedRecordForDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
