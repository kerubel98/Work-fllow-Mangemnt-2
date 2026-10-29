/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Database, Play, Terminal, Shield, 
  CheckCircle2, Clock, AlertTriangle, Layers, ChevronRight, ChevronDown,
  RefreshCw, Check, X, FileText, Send, AlertCircle, Eye, ArrowRight,
  Star, Bookmark, Trash2, Copy, Plus, Search, Share2, Download,
  SlidersHorizontal, Filter, PanelRightClose, PanelRightOpen,
  Columns, ExternalLink, Calendar, CheckSquare
} from 'lucide-react';
import { api } from '../../api/client';
import { User, SavedQuery, QueryApprovalRequest, Issue } from '../../types';
import { DataTablePagination } from '../common/DataTablePagination';

interface DatabaseItem {
  id: string;
  name: string;
  engine: string;
  status: 'online' | 'offline';
  tables: string[];
}

interface TableColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  isPrimary?: boolean;
}

interface QueryResultState {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  executionTimeMs: number;
  mirroredTable?: string | null;
  mirroredCount?: number;
}

interface QuerySandboxStandaloneViewProps {
  currentUser?: User;
}

export const QuerySandboxStandaloneView: React.FC<QuerySandboxStandaloneViewProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'editor' | 'logs' | 'approvals'>('editor');
  
  // Real database connections
  const [databases, setDatabases] = useState<DatabaseItem[]>([]);
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(true);
  const [selectedDbId, setSelectedDbId] = useState<string>('');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [isDbDropdownOpen, setIsDbDropdownOpen] = useState(false);
  const [isTableDropdownOpen, setIsTableDropdownOpen] = useState(false);
  const [tableSearchFilter, setTableSearchFilter] = useState('');

  // Table columns for quick reference
  const [tableColumns, setTableColumns] = useState<TableColumnInfo[]>([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [columnSearchQuery, setColumnSearchQuery] = useState('');
  
  // SQL Editor state
  const [sqlQuery, setSqlQuery] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [results, setResults] = useState<QueryResultState | null>(null);
  const [executionMs, setExecutionMs] = useState<number>(0);
  const [resultFilterText, setResultFilterText] = useState<string>('');

  // Results pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Consolidated Side Panel State (Saved Queries & Schema)
  const [isSidePanelOpen, setIsSidePanelOpen] = useState<boolean>(true);
  const [sidePanelTab, setSidePanelTab] = useState<'saved' | 'schema'>('saved');

  // Saved Queries state
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [isLoadingSavedQueries, setIsLoadingSavedQueries] = useState(false);
  const [savedQuerySearch, setSavedQuerySearch] = useState('');
  const [savedQueryFilter, setSavedQueryFilter] = useState<'all' | 'favorites' | 'mine' | 'shared'>('all');

  // Modals state
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveTags, setSaveTags] = useState('');
  const [saveIsFavorite, setSaveIsFavorite] = useState(false);
  const [saveIsShared, setSaveIsShared] = useState(true);
  const [isSavingQuery, setIsSavingQuery] = useState(false);

  // Stage to Case Modal State
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [stageMode, setStageMode] = useState<'existing' | 'new'>('existing');
  const [activeCases, setActiveCases] = useState<Issue[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const [newCasePriority, setNewCasePriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [stageEnvironment, setStageEnvironment] = useState<'SANDBOX' | 'STAGING' | 'PRODUCTION'>('SANDBOX');
  const [stageFindingsNotes, setStageFindingsNotes] = useState('');
  const [includeResultsSnapshot, setIncludeResultsSnapshot] = useState(true);
  const [isSubmittingStage, setIsSubmittingStage] = useState(false);

  // Approval Request Modal State (Permanent vs Temporary)
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [approvalScope, setApprovalScope] = useState<'TEMPORARY' | 'PERMANENT'>('TEMPORARY');
  const [approvalDuration, setApprovalDuration] = useState<'1_HOUR' | '4_HOURS' | '24_HOURS' | '7_DAYS' | '30_DAYS'>('24_HOURS');
  const [approvalEnvironment, setApprovalEnvironment] = useState<'testing' | 'production'>('production');
  const [approvalReason, setApprovalReason] = useState('');
  const [approvalQueryText, setApprovalQueryText] = useState('');
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);

  // Logs & Approvals state
  const [queryLogs, setQueryLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [queryApprovals, setQueryApprovals] = useState<any[]>([]);
  const [isLoadingApprovals, setIsLoadingApprovals] = useState(false);
  const [actionSuccessNotice, setActionSuccessNotice] = useState<string | null>(null);

  // Find currently active database
  const activeDb = useMemo(() => {
    return databases.find(d => d.id === selectedDbId) || databases[0] || null;
  }, [databases, selectedDbId]);

  // Load registered databases from live backend
  const loadDatabases = useCallback(async () => {
    try {
      setIsLoadingDatabases(true);
      const dbs = await api.getDatabases();
      if (Array.isArray(dbs) && dbs.length > 0) {
        const mapped: DatabaseItem[] = dbs.map(d => ({
          id: d.id,
          name: d.name,
          engine: d.type || 'SQL',
          status: (d.status === 'online' || d.status === 'offline') ? d.status : 'online',
          tables: (d.availableTables && d.availableTables.length > 0)
            ? d.availableTables
            : (d.allowedTables && d.allowedTables.length > 0)
              ? d.allowedTables
              : []
        }));

        setDatabases(mapped);

        // Select first online database or first database if none selected
        setSelectedDbId(prevId => {
          if (prevId && mapped.some(m => m.id === prevId)) return prevId;
          const firstOnline = mapped.find(m => m.status === 'online');
          return firstOnline ? firstOnline.id : mapped[0].id;
        });
      }
    } catch (err: any) {
      console.error('Failed to load databases for query sandbox:', err);
    } finally {
      setIsLoadingDatabases(false);
    }
  }, []);

  // Discover tables for active database if empty
  useEffect(() => {
    if (!activeDb) return;
    if (activeDb.tables.length === 0 && activeDb.status === 'online') {
      api.getDatabaseTables(activeDb.id)
        .then(res => {
          const fetchedTables = res.availableTables || res.allowedTables || res.tables || [];
          if (fetchedTables.length > 0) {
            setDatabases(prev => prev.map(db => 
              db.id === activeDb.id ? { ...db, tables: fetchedTables } : db
            ));
          }
        })
        .catch(err => {
          console.warn(`Could not load tables for ${activeDb.name}:`, err);
        });
    }
  }, [activeDb]);

  // Load columns when active database or selectedTable changes
  useEffect(() => {
    if (!activeDb || !selectedTable) {
      setTableColumns([]);
      return;
    }
    let isCancelled = false;
    setIsLoadingColumns(true);
    api.getTableColumns(activeDb.id, selectedTable)
      .then(res => {
        if (!isCancelled && res.columns) {
          setTableColumns(res.columns);
        }
      })
      .catch(err => {
        if (!isCancelled) {
          console.warn(`Could not load columns for ${activeDb.name}.${selectedTable}:`, err);
          setTableColumns([]);
        }
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingColumns(false);
      });

    return () => { isCancelled = true; };
  }, [activeDb?.id, selectedTable]);

  // Load Saved Queries from PostgreSQL (Rule 23)
  const loadSavedQueries = useCallback(async () => {
    try {
      setIsLoadingSavedQueries(true);
      const res = await api.getSavedQueries(currentUser?.id, selectedDbId || undefined);
      setSavedQueries(Array.isArray(res) ? res : []);
    } catch (err) {
      console.warn('Failed to load saved queries:', err);
    } finally {
      setIsLoadingSavedQueries(false);
    }
  }, [currentUser?.id, selectedDbId]);

  // Initialize selectedTable and default query when activeDb changes
  useEffect(() => {
    if (activeDb && activeDb.tables.length > 0) {
      const firstTable = activeDb.tables[0];
      setSelectedTable(firstTable);
      const initialSql = `SELECT * FROM ${firstTable} LIMIT 25;`;
      setSqlQuery(initialSql);
      // Auto-run query on initial load for immediate live data verification
      handleRunQuery(initialSql, activeDb.id, activeDb.name, firstTable);
    }
  }, [activeDb?.id]);

  // Load databases, approvals, and saved queries on mount
  useEffect(() => {
    loadDatabases();
    loadQueryApprovals();
    loadSavedQueries();
  }, [loadDatabases, loadSavedQueries]);

  // Load logs when switching to logs tab
  const loadQueryLogs = useCallback(async () => {
    try {
      setIsLoadingLogs(true);
      const logs = await api.getQueryLogs();
      setQueryLogs(Array.isArray(logs) ? logs : []);
    } catch (err) {
      console.warn('Failed to fetch query logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  // Load approvals when switching to approvals tab
  const loadQueryApprovals = useCallback(async () => {
    try {
      setIsLoadingApprovals(true);
      const approvals = await api.getQueryApprovals();
      setQueryApprovals(Array.isArray(approvals) ? approvals : []);
    } catch (err) {
      console.warn('Failed to fetch query approvals:', err);
    } finally {
      setIsLoadingApprovals(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'logs') loadQueryLogs();
    if (activeTab === 'approvals') loadQueryApprovals();
  }, [activeTab, loadQueryLogs, loadQueryApprovals]);

  // Execute live query on backend
  const handleRunQuery = async (
    customSql?: string, 
    customDbId?: string, 
    customDbName?: string, 
    customTable?: string
  ) => {
    const targetDb = databases.find(d => d.id === (customDbId || selectedDbId)) || activeDb;
    if (!targetDb) return;

    const queryToExecute = (customSql !== undefined ? customSql : sqlQuery).trim();
    if (!queryToExecute) return;

    setIsRunning(true);
    setQueryError(null);
    setCurrentPage(1); // Reset page on new query
    const startTime = Date.now();

    try {
      let tableName = customTable || selectedTable;
      if (!tableName) {
        const match = queryToExecute.match(/\bFROM\s+[`"']?([a-zA-Z0-9_.-]+)[`"']?/i);
        if (match) {
          tableName = match[1].split('.').pop() || match[1];
        }
      }

      const res = await api.executeQuery({
        userId: currentUser?.id || 'usr-admin',
        username: currentUser?.username || currentUser?.name || 'admin',
        userRole: currentUser?.role || 'admin',
        dbId: targetDb.id,
        dbName: targetDb.name,
        query: queryToExecute,
        tableName
      });

      setResults({
        columns: res.columns || (res.rows?.[0] ? Object.keys(res.rows[0]) : []),
        rows: res.rows || [],
        rowCount: res.rowCount ?? (res.rows ? res.rows.length : 0),
        executionTimeMs: res.executionTimeMs ?? (Date.now() - startTime),
        mirroredTable: res.mirroredTable,
        mirroredCount: res.mirroredCount
      });
      setExecutionMs(res.executionTimeMs ?? (Date.now() - startTime));
    } catch (err: any) {
      console.error('Query execution error:', err);
      setQueryError(err.message || 'Failed to execute query against database.');
      setResults(null);
    } finally {
      setIsRunning(false);
    }
  };

  // Keyboard shortcut listener: Ctrl+Enter to run query
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRunQuery();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sqlQuery, selectedDbId, selectedTable]);

  // Insert column name into editor
  const handleInsertColumn = (columnName: string) => {
    setSqlQuery(prev => {
      return prev ? `${prev.trimEnd()} "${columnName}" ` : `SELECT "${columnName}" FROM ${selectedTable || 'transactions'} LIMIT 25;`;
    });
  };

  // ================= SAVED QUERIES ACTIONS =================
  const handleOpenSaveModal = () => {
    setSaveTitle(selectedTable ? `${selectedTable} query` : 'Custom query');
    setSaveDescription('');
    setSaveTags(selectedTable ? `${selectedTable}, search` : 'sandbox');
    setSaveIsFavorite(false);
    setSaveIsShared(true);
    setIsSaveModalOpen(true);
  };

  const handleSaveQuery = async () => {
    if (!saveTitle.trim() || !sqlQuery.trim() || !activeDb) return;
    setIsSavingQuery(true);
    try {
      const tagsArray = saveTags.split(',').map(t => t.trim()).filter(Boolean);
      await api.createSavedQuery({
        userId: currentUser?.id || 'usr-admin',
        username: currentUser?.username || currentUser?.name || 'admin',
        title: saveTitle.trim(),
        description: saveDescription.trim(),
        dbId: activeDb.id,
        dbName: activeDb.name,
        tableName: selectedTable,
        query: sqlQuery.trim(),
        tags: tagsArray,
        isFavorite: saveIsFavorite,
        isShared: saveIsShared
      });

      setActionSuccessNotice(`Query "${saveTitle}" saved successfully.`);
      setIsSaveModalOpen(false);
      loadSavedQueries();
      setTimeout(() => setActionSuccessNotice(null), 3500);
    } catch (err: any) {
      alert(`Failed to save query: ${err.message}`);
    } finally {
      setIsSavingQuery(false);
    }
  };

  const handleToggleFavorite = async (sq: SavedQuery) => {
    try {
      await api.updateSavedQuery(sq.id, { isFavorite: !sq.isFavorite });
      setSavedQueries(prev => prev.map(q => q.id === sq.id ? { ...q, isFavorite: !q.isFavorite } : q));
    } catch (err: any) {
      console.warn('Could not update favorite status:', err);
    }
  };

  const handleDeleteSavedQuery = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete the saved query "${title}"?`)) return;
    try {
      await api.deleteSavedQuery(id);
      setSavedQueries(prev => prev.filter(q => q.id !== id));
      setActionSuccessNotice(`Deleted saved query "${title}".`);
      setTimeout(() => setActionSuccessNotice(null), 3000);
    } catch (err: any) {
      alert(`Failed to delete saved query: ${err.message}`);
    }
  };

  // Filtered Saved Queries list
  const filteredSavedQueries = useMemo(() => {
    return savedQueries.filter(sq => {
      if (savedQueryFilter === 'favorites' && !sq.isFavorite) return false;
      if (savedQueryFilter === 'mine' && sq.userId !== currentUser?.id) return false;
      if (savedQueryFilter === 'shared' && !sq.isShared) return false;
      if (savedQuerySearch.trim()) {
        const query = savedQuerySearch.toLowerCase();
        const matchesTitle = sq.title.toLowerCase().includes(query);
        const matchesDesc = (sq.description || '').toLowerCase().includes(query);
        const matchesQuery = sq.query.toLowerCase().includes(query);
        const matchesTags = sq.tags?.some(t => t.toLowerCase().includes(query));
        return matchesTitle || matchesDesc || matchesQuery || matchesTags;
      }
      return true;
    });
  }, [savedQueries, savedQueryFilter, savedQuerySearch, currentUser?.id]);

  // ================= STAGE TO CASE ACTIONS =================
  const handleOpenStageModal = async () => {
    setIsStageModalOpen(true);
    setStageFindingsNotes(`Executed on ${activeDb?.name || 'database'}.${selectedTable || 'table'}.\nRows retrieved: ${results?.rowCount || 0}`);
    try {
      setIsLoadingCases(true);
      const cases = await api.getIssues();
      setActiveCases(Array.isArray(cases) ? cases : []);
      if (cases.length > 0) {
        setSelectedCaseId(cases[0].id);
      }
    } catch (err) {
      console.warn('Could not load existing cases:', err);
    } finally {
      setIsLoadingCases(false);
    }
  };

  const handleStageQueryToCase = async () => {
    if (!sqlQuery.trim() || !activeDb) return;
    setIsSubmittingStage(true);
    try {
      let targetCase: Issue | null = null;
      if (stageMode === 'existing') {
        if (!selectedCaseId) {
          alert('Please select an active case to attach the query.');
          setIsSubmittingStage(false);
          return;
        }
        // Update existing case
        const sampleRows = (includeResultsSnapshot && results?.rows) ? results.rows.slice(0, 30) : undefined;
        await api.updateIssue(selectedCaseId, {
          solutionScript: sqlQuery.trim(),
          investigationSystemId: activeDb.id,
          investigationTable: selectedTable,
          stagedEnvironment: stageEnvironment,
          findingsNotes: stageFindingsNotes.trim(),
          queryResults: sampleRows
        });
        targetCase = activeCases.find(c => c.id === selectedCaseId) || null;
      } else {
        // Create new investigation case
        if (!newCaseTitle.trim()) {
          alert('Please enter a title for the new case.');
          setIsSubmittingStage(false);
          return;
        }
        const sampleRows = (includeResultsSnapshot && results?.rows) ? results.rows.slice(0, 30) : undefined;
        const created = await api.createIssue({
          title: newCaseTitle.trim(),
          description: `Staged investigation from Query Sandbox on ${activeDb.name}.${selectedTable || 'table'}.`,
          creatorId: currentUser?.id || 'usr-admin',
          creatorName: currentUser?.username || currentUser?.name || 'admin',
          status: 'INVESTIGATING',
          priority: newCasePriority,
          type: 'single',
          solutionScript: sqlQuery.trim(),
          investigationSystemId: activeDb.id,
          investigationTable: selectedTable,
          stagedEnvironment: stageEnvironment,
          stagedByUserId: currentUser?.id,
          stagedByUserName: currentUser?.username,
          stagedAt: new Date().toISOString(),
          findingsNotes: stageFindingsNotes.trim(),
          queryResults: sampleRows
        });
        targetCase = created;
      }

      setActionSuccessNotice(
        `Successfully staged query to Case ${targetCase?.id || ''} in ${stageEnvironment} environment!`
      );
      setIsStageModalOpen(false);
      setTimeout(() => setActionSuccessNotice(null), 5000);
    } catch (err: any) {
      alert(`Failed to stage query to case: ${err.message}`);
    } finally {
      setIsSubmittingStage(false);
    }
  };

  // ================= PERMANENT / TEMPORARY APPROVAL ACTIONS =================
  const handleOpenApprovalModal = () => {
    setApprovalQueryText(sqlQuery.trim());
    setApprovalReason('');
    setApprovalScope('TEMPORARY');
    setApprovalDuration('24_HOURS');
    setApprovalEnvironment('production');
    setIsApprovalModalOpen(true);
  };

  const handleSubmitApprovalRequest = async () => {
    if (!approvalQueryText.trim() || !activeDb) return;
    if (!approvalReason.trim()) {
      alert('Please provide a business reason / justification for this approval request.');
      return;
    }
    setIsSubmittingApproval(true);
    try {
      let tableName = selectedTable;
      if (!tableName) {
        const match = approvalQueryText.match(/\bFROM\s+[`"']?([a-zA-Z0-9_.-]+)[`"']?/i);
        if (match) tableName = match[1].split('.').pop() || match[1];
      }

      await api.createQueryApproval({
        systemId: activeDb.id,
        systemName: activeDb.name,
        environment: approvalEnvironment,
        tableName: tableName || 'transactions',
        query: approvalQueryText.trim(),
        requesterId: currentUser?.id || 'usr-3',
        requesterName: currentUser?.username || currentUser?.name || 'operator',
        requesterRole: currentUser?.role || 'technical',
        approvalType: approvalScope,
        duration: approvalScope === 'TEMPORARY' ? approvalDuration : 'PERMANENT',
        reason: approvalReason.trim()
      });

      setActionSuccessNotice(
        `Submitted ${approvalScope} approval request (${approvalScope === 'TEMPORARY' ? approvalDuration.replace('_', ' ') : 'Permanent'}). Staged in Authority Center.`
      );
      setIsApprovalModalOpen(false);
      loadQueryApprovals();
      setTimeout(() => setActionSuccessNotice(null), 5000);
    } catch (err: any) {
      alert(`Failed to submit query for approval: ${err.message}`);
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleResolveApproval = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await api.resolveQueryApproval(id, status);
      setActionSuccessNotice(`Approval request marked as ${status}.`);
      loadQueryApprovals();
      setTimeout(() => setActionSuccessNotice(null), 3000);
    } catch (err: any) {
      alert(`Failed to update approval: ${err.message}`);
    }
  };

  // Results filtering and derived columns
  const resultColumns = useMemo(() => {
    if (!results) return [];
    if (results.columns && results.columns.length > 0) return results.columns;
    if (results.rows && results.rows.length > 0) return Object.keys(results.rows[0]);
    return [];
  }, [results]);

  const filteredResultRows = useMemo(() => {
    if (!results?.rows) return [];
    if (!resultFilterText.trim()) return results.rows;
    const q = resultFilterText.toLowerCase();
    return results.rows.filter(row => {
      return Object.values(row).some(v => {
        if (v == null) return false;
        return String(v).toLowerCase().includes(q);
      });
    });
  }, [results?.rows, resultFilterText]);

  // Paginated rows slice
  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredResultRows.slice(startIndex, startIndex + pageSize);
  }, [filteredResultRows, currentPage, pageSize]);

  // CSV export helper
  const handleExportCsv = () => {
    if (!results || results.rows.length === 0) return;
    const cols = resultColumns;
    const headerRow = cols.join(',');
    const dataRows = results.rows.map(r => 
      cols.map(c => {
        const cell = r[c] ?? '';
        return `"${String(cell).replace(/"/g, '""')}"`;
      }).join(',')
    );
    const csvContent = [headerRow, ...dataRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${selectedTable || 'query_results'}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Dynamic line numbers for SQL Editor
  const lineNumbers = useMemo(() => {
    const lines = sqlQuery.split('\n').length;
    return Array.from({ length: Math.max(lines, 4) }, (_, i) => i + 1);
  }, [sqlQuery]);

  const pendingApprovalsCount = useMemo(() => {
    return queryApprovals.filter(a => a.status === 'pending').length;
  }, [queryApprovals]);

  // Discovered tables list for activeDb with search filter
  const filteredAvailableTables = useMemo(() => {
    if (!activeDb?.tables) return [];
    if (!tableSearchFilter.trim()) return activeDb.tables;
    return activeDb.tables.filter(t => t.toLowerCase().includes(tableSearchFilter.toLowerCase()));
  }, [activeDb?.tables, tableSearchFilter]);

  // Filtered table columns for schema tab
  const filteredColumnsList = useMemo(() => {
    if (!columnSearchQuery.trim()) return tableColumns;
    const q = columnSearchQuery.toLowerCase();
    return tableColumns.filter(c => c.name.toLowerCase().includes(q) || c.type.toLowerCase().includes(q));
  }, [tableColumns, columnSearchQuery]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F8FAFC] text-slate-800 font-sans overflow-hidden">
      {/* =========================================================================
          TOP TOOLBAR & CONTROLS: DB SELECTOR, TABLE SELECTOR & GLOBAL ACTIONS
          ========================================================================= */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs z-20">
        
        {/* Left Side: Brand, Breadcrumbs, Database & Table Selectors */}
        <div className="flex items-center space-x-3 flex-wrap">
          <div>
            <div className="text-[11px] text-slate-400 font-sans leading-none mb-1">Build / Query sandbox</div>
            <h1 className="text-lg font-bold font-heading text-slate-900 tracking-tight flex items-center space-x-2">
              <span>Query sandbox</span>
            </h1>
          </div>

          <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

          {/* Database Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsDbDropdownOpen(!isDbDropdownOpen);
                setIsTableDropdownOpen(false);
              }}
              className="flex items-center space-x-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 transition cursor-pointer shadow-2xs"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${activeDb?.status === 'online' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <Database size={13} className="text-slate-500" />
              <span className="font-bold text-slate-900 truncate max-w-[140px] sm:max-w-[200px]">
                {activeDb?.name || 'Select Database'}
              </span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-200 text-slate-600 uppercase">
                {activeDb?.engine || 'SQL'}
              </span>
              <ChevronDown size={13} className="text-slate-400 ml-1" />
            </button>

            {isDbDropdownOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsDbDropdownOpen(false)} />
                <div className="absolute left-0 top-full mt-1.5 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-40 space-y-1 animate-in fade-in zoom-in-95 duration-100">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1 font-mono flex items-center justify-between">
                    <span>Available Databases ({databases.length})</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        loadDatabases();
                      }}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <RefreshCw size={11} className={isLoadingDatabases ? 'animate-spin' : ''} />
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto no-scrollbar space-y-1">
                    {databases.map(db => (
                      <div
                        key={db.id}
                        onClick={() => {
                          setSelectedDbId(db.id);
                          setIsDbDropdownOpen(false);
                          if (db.tables.length > 0) {
                            setSelectedTable(db.tables[0]);
                            const newSql = `SELECT * FROM ${db.tables[0]} LIMIT 25;`;
                            setSqlQuery(newSql);
                            handleRunQuery(newSql, db.id, db.name, db.tables[0]);
                          } else {
                            setSelectedTable('');
                          }
                        }}
                        className={`flex items-center justify-between px-2.5 py-2 rounded-lg text-xs cursor-pointer transition ${
                          db.id === selectedDbId ? 'bg-blue-50 text-blue-900 font-bold' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${db.status === 'online' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          <span className="truncate">{db.name}</span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[10px] font-mono text-slate-400 uppercase">{db.engine}</span>
                          {db.id === selectedDbId && <Check size={12} className="text-blue-600" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Table Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsTableDropdownOpen(!isTableDropdownOpen);
                setIsDbDropdownOpen(false);
              }}
              disabled={!activeDb || activeDb.tables.length === 0}
              className="flex items-center space-x-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 transition cursor-pointer shadow-2xs disabled:opacity-50"
            >
              <Layers size={13} className="text-blue-600" />
              <span className="text-slate-500 font-normal">Table:</span>
              <span className="font-mono font-bold text-slate-900 truncate max-w-[130px] sm:max-w-[180px]">
                {selectedTable || (activeDb?.tables?.length ? 'Choose table' : 'No tables')}
              </span>
              <ChevronDown size={13} className="text-slate-400 ml-1" />
            </button>

            {isTableDropdownOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setIsTableDropdownOpen(false)} />
                <div className="absolute left-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-40 space-y-1.5 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-1">
                    <input
                      type="text"
                      value={tableSearchFilter}
                      onChange={(e) => setTableSearchFilter(e.target.value)}
                      placeholder="Filter tables..."
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-56 overflow-y-auto no-scrollbar space-y-0.5">
                    {filteredAvailableTables.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400 font-mono">No matching tables</div>
                    ) : (
                      filteredAvailableTables.map(tbl => (
                        <div
                          key={tbl}
                          onClick={() => {
                            setSelectedTable(tbl);
                            setIsTableDropdownOpen(false);
                            const newSql = `SELECT * FROM ${tbl} LIMIT 25;`;
                            setSqlQuery(newSql);
                            handleRunQuery(newSql, activeDb?.id, activeDb?.name, tbl);
                          }}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono cursor-pointer transition ${
                            tbl === selectedTable ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="truncate">{tbl}</span>
                          {tbl === selectedTable && <Check size={12} className="text-blue-600 shrink-0" />}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Side: View Tabs & Primary Workflow Action Buttons */}
        <div className="flex items-center space-x-2 flex-wrap">
          {/* Main Workspace Navigation Tabs */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeTab === 'editor' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Editor
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'logs' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Logs</span>
              {queryLogs.length > 0 && (
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700">
                  {queryLogs.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('approvals')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'approvals' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Approvals</span>
              <span className={`font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                pendingApprovalsCount > 0 ? 'bg-amber-100 text-amber-700 border border-amber-300' : 'bg-slate-200 text-slate-600'
              }`}>
                {pendingApprovalsCount}
              </span>
            </button>
          </div>

          <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

          {/* Workflow Action 1: Stage to Case */}
          <button
            type="button"
            onClick={handleOpenStageModal}
            title="Stage current query and findings to an investigation case"
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer shadow-2xs"
          >
            <ExternalLink size={13} className="text-purple-600" />
            <span>Stage to Case</span>
          </button>

          {/* Workflow Action 2: Request Approval (Permanent / Temporary) */}
          <button
            type="button"
            onClick={handleOpenApprovalModal}
            title="Request permanent or temporary governance approval for query execution"
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer shadow-2xs"
          >
            <Shield size={13} className="text-amber-600" />
            <span>Request Approval</span>
          </button>

          {/* Toggle Saved Queries / Schema Panel */}
          <button
            type="button"
            onClick={() => setIsSidePanelOpen(!isSidePanelOpen)}
            title={isSidePanelOpen ? 'Collapse library panel' : 'Expand library panel'}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 border transition cursor-pointer shadow-2xs ${
              isSidePanelOpen 
                ? 'bg-blue-50 text-blue-700 border-blue-200' 
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
            }`}
          >
            <Bookmark size={13} className={isSidePanelOpen ? 'text-blue-600 fill-blue-600/20' : 'text-slate-500'} />
            <span className="hidden md:inline">Saved Queries</span>
            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700">
              {savedQueries.length}
            </span>
          </button>

          {/* Primary Action: Run Query */}
          <button
            type="button"
            onClick={() => handleRunQuery()}
            disabled={isRunning || !sqlQuery.trim()}
            className="px-4 py-1.5 bg-[#F27421] hover:bg-[#d65f15] text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer shadow-md disabled:opacity-50"
          >
            <Play size={13} className="fill-white" />
            <span>{isRunning ? 'Executing...' : 'Run Query'}</span>
          </button>
        </div>
      </div>

      {/* Global Success Notice */}
      {actionSuccessNotice && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 flex items-center justify-between text-xs text-emerald-800 animate-in fade-in duration-150">
          <div className="flex items-center space-x-2">
            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
            <span className="font-medium">{actionSuccessNotice}</span>
          </div>
          <button 
            type="button"
            onClick={() => setActionSuccessNotice(null)}
            className="text-emerald-600 hover:text-emerald-900 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* =========================================================================
          TAB 1: MAIN SQL EDITOR & FULL-WIDTH RESULTS TABLE
          ========================================================================= */}
      {activeTab === 'editor' && (
        <div className="flex-1 min-h-0 flex overflow-hidden">
          
          {/* Main Query & Results Area (Expands to 100% when side panel is closed) */}
          <div className="flex-1 min-w-0 flex flex-col overflow-y-auto no-scrollbar p-6 space-y-5">
            
            {/* Query Editor Box */}
            <div className="bg-[#0F142A] rounded-2xl border border-slate-800 shadow-md overflow-hidden flex flex-col shrink-0">
              {/* Editor Top Bar */}
              <div className="px-4 py-2.5 bg-[#1A2242]/80 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-white/10 text-white font-medium flex items-center space-x-1">
                    <Database size={11} className="text-slate-400" />
                    <span>{activeDb?.name || 'No DB Selected'}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-emerald-400 font-bold">{selectedTable || 'all'}</span>
                  </span>

                  {/* Quick SQL Snippets */}
                  <div className="hidden lg:flex items-center space-x-1 ml-2">
                    <button
                      type="button"
                      onClick={() => setSqlQuery(`SELECT * FROM ${selectedTable || 'transactions'} LIMIT 50;`)}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 hover:bg-white/10 text-slate-300 transition cursor-pointer"
                    >
                      SELECT *
                    </button>
                    <button
                      type="button"
                      onClick={() => setSqlQuery(`SELECT * FROM ${selectedTable || 'transactions'} WHERE status != '1' LIMIT 50;`)}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 hover:bg-white/10 text-slate-300 transition cursor-pointer"
                    >
                      WHERE error
                    </button>
                    <button
                      type="button"
                      onClick={() => setSqlQuery(`SELECT COUNT(*) AS total FROM ${selectedTable || 'transactions'};`)}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 hover:bg-white/10 text-slate-300 transition cursor-pointer"
                    >
                      COUNT(*)
                    </button>
                  </div>
                </div>

                {/* Editor Action Tools */}
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleOpenSaveModal}
                    title="Save this query into library"
                    className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-slate-200 hover:text-white rounded-lg text-[11px] font-semibold flex items-center space-x-1 transition cursor-pointer"
                  >
                    <Bookmark size={11} />
                    <span>Save Query</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(sqlQuery);
                      setActionSuccessNotice('SQL Query copied to clipboard.');
                      setTimeout(() => setActionSuccessNotice(null), 2500);
                    }}
                    title="Copy SQL"
                    className="p-1 text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSqlQuery('')}
                    title="Clear editor"
                    className="p-1 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Editor Textarea with Line Numbers */}
              <div className="p-4 flex font-mono text-xs text-slate-200 min-h-[140px] leading-relaxed select-text">
                <div className="text-slate-600 select-none pr-4 text-right">
                  {lineNumbers.map(n => (
                    <div key={n}>{n}</div>
                  ))}
                </div>
                <textarea
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  rows={Math.max(lineNumbers.length, 5)}
                  placeholder="Enter your SQL query statement (e.g. SELECT * FROM transactions LIMIT 25)..."
                  className="w-full bg-transparent resize-none border-none focus:outline-none text-slate-100 font-mono leading-relaxed selection:bg-blue-600/40"
                  spellCheck={false}
                />
              </div>

              {/* Editor Keyboard Shortcut Hint */}
              <div className="px-4 py-1.5 bg-[#090C1A] border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>Press <kbd className="px-1 py-0.5 bg-slate-800 text-slate-200 rounded">Ctrl+Enter</kbd> to run</span>
                <span>{sqlQuery.length} characters</span>
              </div>
            </div>

            {/* Error Banner */}
            {queryError && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2.5 animate-in fade-in duration-150">
                <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold">Database Query Error</div>
                  <div className="font-mono text-[11px] break-all">{queryError}</div>
                </div>
              </div>
            )}

            {/* Live Results Table Card */}
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden flex flex-col flex-1">
              
              {/* Results Status Header */}
              <div className="px-6 py-3.5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/70 flex-wrap gap-2">
                <div className="flex items-center space-x-3">
                  <h3 className="font-bold text-slate-900 text-sm font-heading flex items-center space-x-2">
                    <span>Live Query Results</span>
                  </h3>
                  {results?.mirroredTable && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-semibold">
                      Streamed to {results.mirroredTable}
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-3">
                  {/* Results Filter Search */}
                  {results && results.rows.length > 0 && (
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={resultFilterText}
                        onChange={(e) => {
                          setResultFilterText(e.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder="Search rows..."
                        className="text-xs pl-7 pr-3 py-1 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-36 sm:w-48"
                      />
                    </div>
                  )}

                  {/* CSV Export Button */}
                  {results && results.rows.length > 0 && (
                    <button
                      type="button"
                      onClick={handleExportCsv}
                      title="Export rows as CSV"
                      className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer shadow-2xs"
                    >
                      <Download size={12} className="text-slate-500" />
                      <span className="hidden sm:inline">CSV</span>
                    </button>
                  )}

                  {isRunning && (
                    <span className="text-xs text-blue-600 flex items-center space-x-1 font-mono">
                      <RefreshCw size={11} className="animate-spin" />
                      <span>Streaming rows...</span>
                    </span>
                  )}

                  <span className="text-xs text-slate-500 font-mono">
                    {results ? `${filteredResultRows.length} of ${results.rowCount} rows` : '0 rows'} · {executionMs} ms
                  </span>
                </div>
              </div>

              {/* Dynamic Table Body */}
              <div className="overflow-x-auto min-h-[240px]">
                {results && results.rows.length > 0 ? (
                  <table className="w-full text-xs font-mono border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-sans font-semibold bg-slate-100/70 sticky top-0 z-10">
                        <th className="px-4 py-2.5 text-[11px] text-slate-400 w-12 text-center">#</th>
                        {resultColumns.map(col => (
                          <th key={col} className="px-5 py-2.5 font-semibold text-slate-700 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px] text-slate-700">
                      {paginatedRows.map((row, idx) => {
                        const globalIndex = (currentPage - 1) * pageSize + idx + 1;
                        return (
                          <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                            <td className="px-4 py-2 text-slate-400 text-center font-mono text-[10px]">
                              {globalIndex}
                            </td>
                            {resultColumns.map(col => {
                              const val = row[col];
                              return (
                                <td key={col} className="px-5 py-2 whitespace-nowrap max-w-xs truncate">
                                  {val === null || val === undefined ? (
                                    <span className="text-slate-300 italic font-sans text-[10px]">null</span>
                                  ) : typeof val === 'object' ? (
                                    <span className="text-purple-600 font-sans text-[10px]">
                                      {JSON.stringify(val)}
                                    </span>
                                  ) : (
                                    String(val)
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-16 text-center space-y-2">
                    <Terminal size={26} className="mx-auto text-slate-300" />
                    <p className="text-xs text-slate-500">
                      {isRunning ? 'Fetching live database rows...' : 'No records returned or query not yet executed.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRunQuery()}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition cursor-pointer"
                    >
                      Run query on {selectedTable || 'database'}
                    </button>
                  </div>
                )}
              </div>

              {/* Table Pagination Bar */}
              {results && results.rows.length > 0 && (
                <div className="border-t border-slate-100 bg-slate-50/50">
                  <DataTablePagination
                    currentPage={currentPage}
                    pageSize={pageSize}
                    totalItems={filteredResultRows.length}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={(newSize) => {
                      setPageSize(newSize);
                      setCurrentPage(1);
                    }}
                    pageSizeOptions={[5, 7, 10, 15, 25, 50, 100]}
                  />
                </div>
              )}
            </div>
          </div>

          {/* =========================================================================
              CONSOLIDATED RIGHT SIDE PANEL: SAVED QUERIES & SCHEMA (COLLAPSIBLE)
              ========================================================================= */}
          {isSidePanelOpen && (
            <div className="w-80 bg-white border-l border-slate-200 flex flex-col shrink-0 overflow-hidden shadow-xs animate-in slide-in-from-right duration-200">
              
              {/* Panel Header with Tabs */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50 shrink-0">
                <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setSidePanelTab('saved')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                      sidePanelTab === 'saved' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Saved ({savedQueries.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidePanelTab('schema')}
                    className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                      sidePanelTab === 'schema' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Schema ({tableColumns.length})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsSidePanelOpen(false)}
                  title="Close side panel"
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              {/* PANEL TAB 1: SAVED QUERIES LIBRARY */}
              {sidePanelTab === 'saved' && (
                <div className="flex-1 min-h-0 flex flex-col p-4 space-y-3 overflow-y-auto no-scrollbar">
                  
                  {/* Search and Category Filter */}
                  <div className="space-y-2">
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={savedQuerySearch}
                        onChange={(e) => setSavedQuerySearch(e.target.value)}
                        placeholder="Search saved queries..."
                        className="w-full text-xs pl-7 pr-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    {/* Filter chips */}
                    <div className="flex items-center space-x-1 text-[11px] overflow-x-auto no-scrollbar pb-1">
                      {(['all', 'favorites', 'mine', 'shared'] as const).map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setSavedQueryFilter(f)}
                          className={`px-2 py-0.5 rounded-full capitalize font-semibold transition cursor-pointer shrink-0 ${
                            savedQueryFilter === f 
                              ? 'bg-blue-600 text-white' 
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Add Query CTA */}
                  <button
                    type="button"
                    onClick={handleOpenSaveModal}
                    className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Save Current Query</span>
                  </button>

                  {/* Queries List */}
                  {isLoadingSavedQueries ? (
                    <div className="p-8 text-center text-xs text-slate-400 font-mono">Loading saved queries...</div>
                  ) : filteredSavedQueries.length === 0 ? (
                    <div className="p-8 text-center space-y-2 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                      <Bookmark size={20} className="mx-auto text-slate-300" />
                      <div className="text-xs font-semibold text-slate-600">No saved queries found</div>
                      <p className="text-[11px] text-slate-400">Save frequently used queries for quick one-click execution.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {filteredSavedQueries.map(sq => (
                        <div
                          key={sq.id}
                          className="p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-xs transition space-y-2 group"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div className="space-y-0.5">
                              <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition">
                                {sq.title}
                              </h4>
                              {sq.description && (
                                <p className="text-[11px] text-slate-500 line-clamp-1">{sq.description}</p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleFavorite(sq)}
                              title={sq.isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
                              className="text-slate-300 hover:text-amber-500 transition cursor-pointer p-0.5"
                            >
                              <Star size={14} className={sq.isFavorite ? 'text-amber-500 fill-amber-500' : ''} />
                            </button>
                          </div>

                          {/* Query SQL Preview */}
                          <div className="p-2 bg-slate-50 border border-slate-100 rounded-lg font-mono text-[10px] text-slate-700 line-clamp-2 select-text">
                            {sq.query}
                          </div>

                          {/* Meta & Actions */}
                          <div className="flex items-center justify-between text-[10px] pt-1">
                            <span className="font-mono text-slate-400">
                              {sq.dbName}{sq.tableName ? ` · ${sq.tableName}` : ''}
                            </span>
                            <div className="flex items-center space-x-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setSqlQuery(sq.query);
                                  handleRunQuery(sq.query, sq.dbId, sq.dbName, sq.tableName);
                                }}
                                className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold transition cursor-pointer"
                              >
                                Run
                              </button>
                              <button
                                type="button"
                                onClick={() => setSqlQuery(sq.query)}
                                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-semibold transition cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSavedQuery(sq.id, sq.title)}
                                className="p-1 text-slate-300 hover:text-rose-600 rounded transition cursor-pointer"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* PANEL TAB 2: TABLE SCHEMA QUICK REFERENCE */}
              {sidePanelTab === 'schema' && (
                <div className="flex-1 min-h-0 flex flex-col p-4 space-y-3 overflow-y-auto no-scrollbar">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 font-heading">
                      Columns in {selectedTable || 'table'}
                    </h4>
                    <p className="text-[11px] text-slate-400">Click any column name to insert it into the SQL editor.</p>
                  </div>

                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={columnSearchQuery}
                      onChange={(e) => setColumnSearchQuery(e.target.value)}
                      placeholder="Filter columns..."
                      className="w-full text-xs pl-7 pr-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {isLoadingColumns ? (
                    <div className="p-8 text-center text-xs text-slate-400 font-mono">Loading columns...</div>
                  ) : filteredColumnsList.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 font-mono">No columns found</div>
                  ) : (
                    <div className="space-y-1">
                      {filteredColumnsList.map(col => (
                        <div
                          key={col.name}
                          onClick={() => handleInsertColumn(col.name)}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 cursor-pointer transition group"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <Columns size={12} className="text-slate-400 group-hover:text-blue-600 shrink-0" />
                            <span className="font-mono text-xs font-bold text-slate-800 group-hover:text-blue-700 truncate">
                              {col.name}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1.5 shrink-0">
                            {col.isPrimary && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-100 text-amber-800">
                                PK
                              </span>
                            )}
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-200 text-slate-600 uppercase">
                              {col.type}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: HISTORICAL QUERY LOGS
          ========================================================================= */}
      {activeTab === 'logs' && (
        <div className="flex-1 min-h-0 flex flex-col p-6 overflow-y-auto no-scrollbar space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 font-heading">Historical Query Logs</h2>
              <p className="text-xs text-slate-500">
                Audited execution log of all sandbox and pipeline queries recorded in PostgreSQL.
              </p>
            </div>
            <button
              type="button"
              onClick={loadQueryLogs}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center space-x-1.5 transition cursor-pointer"
            >
              <RefreshCw size={12} className={isLoadingLogs ? 'animate-spin' : ''} />
              <span>Refresh logs</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
            {isLoadingLogs ? (
              <div className="p-12 text-center text-xs text-slate-400 font-mono">Loading query logs...</div>
            ) : queryLogs.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 font-mono">No query execution logs recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-sans font-semibold">
                      <th className="px-5 py-3">Timestamp</th>
                      <th className="px-5 py-3">User</th>
                      <th className="px-5 py-3">Database</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Query Statement</th>
                      <th className="px-5 py-3">Execution Time</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {queryLogs.map((log, idx) => (
                      <tr key={log.id || idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3 whitespace-nowrap text-slate-500 text-[11px]">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className="font-semibold text-slate-900">{log.username}</span>
                          <span className="text-[10px] text-slate-400 ml-1">({log.userRole})</span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap font-semibold text-blue-600">
                          {log.dbName}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            {log.queryType || 'SELECT'}
                          </span>
                        </td>
                        <td className="px-5 py-3 max-w-md truncate text-slate-800">
                          {log.queryStatement}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-slate-500">
                          {log.executionTimeMs} ms
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSqlQuery(log.queryStatement);
                              const matchDb = databases.find(d => d.name === log.dbName || d.id === log.dbId);
                              if (matchDb) setSelectedDbId(matchDb.id);
                              setActiveTab('editor');
                              handleRunQuery(log.queryStatement, matchDb?.id, matchDb?.name);
                            }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                          >
                            Run in Editor
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: GOVERNANCE APPROVALS QUEUE
          ========================================================================= */}
      {activeTab === 'approvals' && (
        <div className="flex-1 min-h-0 flex flex-col p-6 overflow-y-auto no-scrollbar space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 font-heading">Query Approval Requests</h2>
              <p className="text-xs text-slate-500">
                Four-Eyes Maker-Checker authorization queue for sensitive DDL, UPDATE, and INSERT operations.
              </p>
            </div>
            <button
              type="button"
              onClick={loadQueryApprovals}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 flex items-center space-x-1.5 transition cursor-pointer"
            >
              <RefreshCw size={12} className={isLoadingApprovals ? 'animate-spin' : ''} />
              <span>Refresh requests</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
            {isLoadingApprovals ? (
              <div className="p-12 text-center text-xs text-slate-400 font-mono">Loading approval requests...</div>
            ) : queryApprovals.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 font-mono">No query approval requests found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-sans font-semibold">
                      <th className="px-5 py-3">Request Date</th>
                      <th className="px-5 py-3">Requester</th>
                      <th className="px-5 py-3">Scope / Duration</th>
                      <th className="px-5 py-3">Target System / Table</th>
                      <th className="px-5 py-3">Proposed Query</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {queryApprovals.map(req => (
                      <tr key={req.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3 whitespace-nowrap text-slate-500 text-[11px]">
                          {new Date(req.requestDate).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className="font-semibold text-slate-900">{req.requesterName}</span>
                          <span className="text-[10px] text-slate-400 ml-1">({req.requesterRole})</span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            req.approvalType === 'TEMPORARY' 
                              ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                              : 'bg-purple-50 text-purple-700 border border-purple-200'
                          }`}>
                            {req.approvalType === 'TEMPORARY' ? `Temp (${(req.duration || '24h').replace('_', ' ')})` : 'Permanent'}
                          </span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className="font-semibold text-slate-900">{req.systemName}</span>
                          <span className="text-slate-400 mx-1">/</span>
                          <span className="text-blue-600">{req.tableName}</span>
                        </td>
                        <td className="px-5 py-3 max-w-xs truncate text-slate-800">
                          {req.query}
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            req.status === 'approved' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : req.status === 'rejected'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {req.status?.toUpperCase() || 'PENDING'}
                          </span>
                        </td>
                        <td className="px-5 py-3 whitespace-nowrap text-right space-x-1.5">
                          {req.status === 'pending' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleResolveApproval(req.id, 'approved')}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold transition cursor-pointer"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResolveApproval(req.id, 'rejected')}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setSqlQuery(req.query);
                                setActiveTab('editor');
                              }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition cursor-pointer"
                            >
                              View in Editor
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 1: SAVE QUERY MODAL
          ========================================================================= */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <Bookmark size={18} className="text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm font-heading">Save Query to Library</h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Query Title</label>
                <input
                  type="text"
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  placeholder="e.g. Find Unmatched Settlement Legs"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="Notes on when and how to use this query..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tags (Comma separated)</label>
                <input
                  type="text"
                  value={saveTags}
                  onChange={(e) => setSaveTags(e.target.value)}
                  placeholder="settlement, fx, reconciliation"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveIsFavorite}
                    onChange={(e) => setSaveIsFavorite(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Mark as Favorite</span>
                </label>

                <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveIsShared}
                    onChange={(e) => setSaveIsShared(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Share with Team</span>
                </label>
              </div>
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveQuery}
                disabled={isSavingQuery || !saveTitle.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isSavingQuery ? 'Saving...' : 'Save Query'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: STAGE QUERY TO CASE MODAL
          ========================================================================= */}
      {isStageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <ExternalLink size={18} className="text-purple-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm font-heading">Stage Query to Case</h3>
                  <p className="text-[11px] text-slate-500">Attach SQL logic, target database parameters, and findings to an investigation case.</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsStageModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto no-scrollbar">
              
              {/* Staging Destination Switcher */}
              <div className="flex items-center space-x-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setStageMode('existing')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    stageMode === 'existing' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Attach to Existing Case
                </button>
                <button
                  type="button"
                  onClick={() => setStageMode('new')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    stageMode === 'new' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Create New Case
                </button>
              </div>

              {stageMode === 'existing' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Select Active Case</label>
                  {isLoadingCases ? (
                    <div className="text-xs text-slate-400 font-mono py-2">Loading active cases...</div>
                  ) : activeCases.length === 0 ? (
                    <div className="text-xs text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-200">
                      No active cases found. Switch to "Create New Case" above.
                    </div>
                  ) : (
                    <select
                      value={selectedCaseId}
                      onChange={(e) => setSelectedCaseId(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {activeCases.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.id}: {c.title} ({c.status || 'INVESTIGATING'} · {c.priority})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">New Case Title</label>
                    <input
                      type="text"
                      value={newCaseTitle}
                      onChange={(e) => setNewCaseTitle(e.target.value)}
                      placeholder="e.g. Discrepancy in ATM Terminal 101 Settlement"
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                    <select
                      value={newCasePriority}
                      onChange={(e) => setNewCasePriority(e.target.value as any)}
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Target Environment */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Target Staging Environment</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['SANDBOX', 'STAGING', 'PRODUCTION'] as const).map(env => (
                    <button
                      key={env}
                      type="button"
                      onClick={() => setStageEnvironment(env)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition cursor-pointer flex flex-col items-center justify-center ${
                        stageEnvironment === env 
                          ? 'bg-purple-50 text-purple-800 border-purple-300 ring-1 ring-purple-300' 
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      <span>{env}</span>
                      <span className="text-[10px] font-normal text-slate-400">
                        {env === 'SANDBOX' ? 'Safe isolated' : env === 'STAGING' ? 'Mirror tables' : 'Requires Checker'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Findings Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Investigation Findings / Technician Notes</label>
                <textarea
                  rows={3}
                  value={stageFindingsNotes}
                  onChange={(e) => setStageFindingsNotes(e.target.value)}
                  placeholder="Record root cause or findings discovered through this query..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Include results checkbox */}
              <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={includeResultsSnapshot}
                  onChange={(e) => setIncludeResultsSnapshot(e.target.checked)}
                  className="rounded text-purple-600"
                />
                <span>Include snapshot of returned query rows ({results?.rowCount || 0} rows)</span>
              </label>
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsStageModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStageQueryToCase}
                disabled={isSubmittingStage}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isSubmittingStage ? 'Staging...' : 'Stage to Case'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: PERMANENT OR TEMPORARY APPROVAL REQUEST MODAL
          ========================================================================= */}
      {isApprovalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <Shield size={18} className="text-amber-600" />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm font-heading">Submit Query for Governance Approval</h3>
                  <p className="text-[11px] text-slate-500">Four-Eyes Maker-Checker authorization queue for sensitive operations.</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setIsApprovalModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto no-scrollbar">
              
              {/* Permanent vs Temporary Scope Picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Approval Type & Scope</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setApprovalScope('TEMPORARY')}
                    className={`p-3 rounded-xl border text-xs font-bold transition cursor-pointer text-left ${
                      approvalScope === 'TEMPORARY'
                        ? 'bg-blue-50 text-blue-900 border-blue-300 ring-1 ring-blue-300'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5">
                      <Clock size={14} className="text-blue-600" />
                      <span>Temporary Approval</span>
                    </div>
                    <p className="text-[10px] font-normal text-slate-500 mt-1">
                      Time-bounded permission that automatically expires after the selected window.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setApprovalScope('PERMANENT')}
                    className={`p-3 rounded-xl border text-xs font-bold transition cursor-pointer text-left ${
                      approvalScope === 'PERMANENT'
                        ? 'bg-purple-50 text-purple-900 border-purple-300 ring-1 ring-purple-300'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5">
                      <Shield size={14} className="text-purple-600" />
                      <span>Permanent Approval</span>
                    </div>
                    <p className="text-[10px] font-normal text-slate-500 mt-1">
                      Permanent procedural authorization for standard recurring queries.
                    </p>
                  </button>
                </div>
              </div>

              {/* Temporary Duration Picker */}
              {approvalScope === 'TEMPORARY' && (
                <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 space-y-2">
                  <label className="block text-xs font-semibold text-blue-900">Validity Duration</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {([
                      { id: '1_HOUR', label: '1 Hour' },
                      { id: '4_HOURS', label: '4 Hours' },
                      { id: '24_HOURS', label: '24 Hours' },
                      { id: '7_DAYS', label: '7 Days' },
                      { id: '30_DAYS', label: '30 Days' }
                    ] as const).map(d => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setApprovalDuration(d.id)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer text-center ${
                          approvalDuration === d.id
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Target System & Environment */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target System</label>
                  <div className="text-xs px-3 py-2 rounded-xl bg-slate-100 font-mono text-slate-800">
                    {activeDb?.name || 'database'} · {selectedTable || 'table'}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Environment</label>
                  <select
                    value={approvalEnvironment}
                    onChange={(e) => setApprovalEnvironment(e.target.value as any)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  >
                    <option value="production">Production</option>
                    <option value="testing">Testing / Staging</option>
                  </select>
                </div>
              </div>

              {/* SQL Statement Preview */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Proposed SQL Query Statement</label>
                <textarea
                  rows={4}
                  value={approvalQueryText}
                  onChange={(e) => setApprovalQueryText(e.target.value)}
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 font-mono bg-[#0F142A] text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  spellCheck={false}
                />
              </div>

              {/* Justification Reason */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Business Reason / Operational Justification <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={approvalReason}
                  onChange={(e) => setApprovalReason(e.target.value)}
                  placeholder="Explain why this query statement or privileged execution is necessary..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsApprovalModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitApprovalRequest}
                disabled={isSubmittingApproval || !approvalReason.trim()}
                className="px-4 py-2 bg-[#0F142A] hover:bg-[#1A2242] text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs disabled:opacity-50 flex items-center space-x-1.5"
              >
                <Send size={12} />
                <span>{isSubmittingApproval ? 'Submitting...' : 'Submit for Approval'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuerySandboxStandaloneView;
