/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Issue, HashtagPreset, ChatMessage, User, IssueStatus, IssuePriority, EnvironmentSystem, UserRole, QueryApprovalRequest, DatabaseConnection, Transaction, Team, AllowedQueryType } from '../types';
import GlobalTransactionSettings from './GlobalTransactionSettings';
import WorkspaceSettings from './WorkspaceSettings';
import ErrorBoundary from './ErrorBoundary';
import InvestigationWorkspace from './investigation/InvestigationWorkspace';
import { globalMappingService } from '../services/globalMappingService';
import { api } from '../api/client';
import { 
  AlertCircle, CheckCircle2, ChevronRight, MessageSquare, Terminal, Play, 
  Settings, Database, UserCheck, FileCode, Check, Send, Sparkles, Plus, Download, ShieldCheck,
  Server, ArrowUpRight, Cpu, Layers, RefreshCw, Clipboard, Upload, FileText, ToggleLeft, ToggleRight,
  Filter, User as UserIcon, ListFilter, ArrowRightLeft, DatabaseZap, CheckSquare, ListTodo, Tag, Search, Zap, Table, X, ArrowLeft,
  FileSpreadsheet, Link2, ArrowRight, Eye, EyeOff, ChevronDown, ChevronUp, CheckCircle, ShieldAlert, Trash2, Edit3, Wand2, Type, Eraser, MoreHorizontal, CheckCheck, Undo2, SlidersHorizontal, BookmarkCheck, Save, Users, Lock, Globe
} from 'lucide-react';

interface IssueDetailViewProps {
  issues: Issue[];
  hashtags: HashtagPreset[];
  currentUser: User;
  systems: EnvironmentSystem[];
  users: User[];
  teams?: Team[];
  databases?: DatabaseConnection[];
  transactions?: Transaction[];
  queryApprovals?: QueryApprovalRequest[];
  onSubmitQueryApproval?: (request: Omit<QueryApprovalRequest, 'id' | 'status' | 'requestDate'>) => void;
  onUpdateIssue: (issueId: string, updatedFields: Partial<Issue>) => void;
  onDeleteIssue?: (issueId: string) => void;
  onCreateIssue?: (newIssue: Omit<Issue, 'id' | 'createdAt' | 'creatorId' | 'creatorName' | 'status'>) => void;
  onCreateHashtagPreset: (newPreset: HashtagPreset) => void;
  onSendChatMessage: (issueId: string, messageText: string) => void;
  onUpdateCurrentUser?: (user: User) => void;
  onChangeTab?: (tab: string) => void;
  onWorkspaceSubViewChange?: (subView: 'sandbox' | 'investigation' | 'open_case') => void;
  initialSelectedIssueId?: string | null;
  activeMode?: 'my_tasks' | 'workspace' | 'hashtags' | 'create_task' | 'create_hashtag' | 'open_case' | 'txn_settings' | 'setting';
}

export default function IssueDetailView({
  issues,
  hashtags,
  currentUser,
  systems,
  users,
  teams = [],
  databases = [],
  transactions = [],
  queryApprovals = [],
  onSubmitQueryApproval,
  onUpdateIssue,
  onDeleteIssue,
  onCreateIssue,
  onCreateHashtagPreset,
  onSendChatMessage,
  onUpdateCurrentUser,
  onChangeTab,
  onWorkspaceSubViewChange,
  initialSelectedIssueId,
  activeMode
}: IssueDetailViewProps) {
  const [currentMode, setCurrentMode] = useState<'my_tasks' | 'workspace' | 'hashtags' | 'create_task' | 'create_hashtag' | 'setting'>(
    activeMode === 'open_case' ? 'workspace' : (activeMode === 'txn_settings' || activeMode === 'setting') ? 'setting' : (activeMode as any) || 'my_tasks'
  );
  const [workspaceSubView, setWorkspaceSubView] = useState<'sandbox' | 'investigation' | 'open_case'>(
    activeMode === 'open_case' ? 'open_case' : (initialSelectedIssueId ? 'investigation' : 'sandbox')
  );

  useEffect(() => {
    if (onWorkspaceSubViewChange) {
      onWorkspaceSubViewChange(workspaceSubView);
    }
  }, [workspaceSubView, onWorkspaceSubViewChange]);

  useEffect(() => {
    if (activeMode) {
      if (activeMode === 'open_case') {
        setCurrentMode('workspace');
        setWorkspaceSubView('open_case');
      } else if (activeMode === 'txn_settings' || activeMode === 'setting') {
        setCurrentMode('setting');
      } else {
        setCurrentMode(activeMode as any);
        if (activeMode === 'workspace') {
          if (initialSelectedIssueId) {
            setWorkspaceSubView('investigation');
          } else {
            setWorkspaceSubView('sandbox');
          }
        }
      }
    }
  }, [activeMode, initialSelectedIssueId]);

  const [selectedIssueId, setSelectedIssueId] = useState<string>(() => {
    if (initialSelectedIssueId && issues.some(i => i.id === initialSelectedIssueId)) {
      return initialSelectedIssueId;
    }
    return issues[0]?.id || '';
  });

  useEffect(() => {
    if (initialSelectedIssueId && issues.some(i => i.id === initialSelectedIssueId)) {
      setSelectedIssueId(initialSelectedIssueId);
    }
  }, [initialSelectedIssueId, issues]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [hashtagFilter, setHashtagFilter] = useState<string>('ALL');
  const [taskScopeFilter, setTaskScopeFilter] = useState<'ALL' | 'MINE' | 'TEAM' | 'PRIVATE' | 'ASSIGNED'>('ALL');

  // Resolve permanent team of current user
  const userPermTeam = useMemo(() => {
    if (currentUser.permanentTeamId) {
      const found = (teams || []).find(t => t.id === currentUser.permanentTeamId);
      if (found) return found;
    }
    return (teams || []).find(
      t => (t.teamType || 'working') === 'permanent' && (t.managerId === currentUser.id || (t.memberIds && t.memberIds.includes(currentUser.id)))
    ) || null;
  }, [currentUser, teams]);
  const effectivePermanentTeamId = (currentUser as any)?.permanentTeamId || userPermTeam?.id;
  const isMemberOfPermanentTeam = Boolean(effectivePermanentTeamId);
  const [shareWorkspaceWithTeam, setShareWorkspaceWithTeam] = useState<boolean>(
    currentUser.shareWorkspaceWithTeam !== false
  );
  const [isUpdatingWorkspaceSharing, setIsUpdatingWorkspaceSharing] = useState(false);
  const [workspaceSharingFeedback, setWorkspaceSharingFeedback] = useState<string | null>(null);

  const handleToggleWorkspaceSharing = async () => {
    const nextVal = !shareWorkspaceWithTeam;
    setIsUpdatingWorkspaceSharing(true);
    try {
      await api.updateWorkspaceSharing(currentUser.id, nextVal);
      setShareWorkspaceWithTeam(nextVal);
      setWorkspaceSharingFeedback(
        nextVal
          ? `Workspace access granted to permanent team (${userPermTeam?.name || 'Unit Team'}).`
          : 'Workspace access restricted to personal only.'
      );
      if (onUpdateCurrentUser) {
        onUpdateCurrentUser({ ...currentUser, shareWorkspaceWithTeam: nextVal });
      }
    } catch (err: any) {
      alert('Failed to update workspace sharing: ' + err.message);
    } finally {
      setIsUpdatingWorkspaceSharing(false);
      setTimeout(() => setWorkspaceSharingFeedback(null), 4000);
    }
  };

  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [taskDeleteSuccess, setTaskDeleteSuccess] = useState<string | null>(null);
  const [taskToDeleteConfirm, setTaskToDeleteConfirm] = useState<{ id: string; title: string } | null>(null);

  const handleDeleteTask = (issueId: string, issueTitle: string) => {
    setTaskToDeleteConfirm({ id: issueId, title: issueTitle });
  };

  const handleConfirmDeleteTask = () => {
    if (!taskToDeleteConfirm) return;
    const { id: issueId, title: issueTitle } = taskToDeleteConfirm;
    if (onDeleteIssue) {
      onDeleteIssue(issueId);
    }
    if (selectedIssueId === issueId) {
      const remaining = issues.filter(i => i.id !== issueId);
      setSelectedIssueId(remaining[0]?.id || '');
    }
    setTaskDeleteSuccess(`Task record "${issueId} - ${issueTitle}" deleted successfully.`);
    setTaskToDeleteConfirm(null);
    setTimeout(() => {
      setTaskDeleteSuccess(null);
    }, 4000);
  };

  // Single vs Batch workspace imputing state
  const [workspaceInputType, setWorkspaceInputType] = useState<'batch' | 'single'>('batch');
  const [singleTxnId, setSingleTxnId] = useState('TXN-8901');
  const [singleCardNum, setSingleCardNum] = useState('4111********9982');
  const [singleAmt, setSingleAmt] = useState('199.99');
  const [singleAuthTime, setSingleAuthTime] = useState(new Date().toISOString());
  const [singleEmail, setSingleEmail] = useState('user@example.com');
  const [singleMerchant, setSingleMerchant] = useState('MERCH-5511');

  // Interactive workspaces
  const [chatText, setChatText] = useState('');
  const [customSql, setCustomSql] = useState('');
  const [secondLevelNotes, setSecondLevelNotes] = useState('');
  
  // Script states
  const [sqlTestOutput, setSqlTestOutput] = useState<string | null>(null);
  const [sqlTestSuccess, setSqlTestSuccess] = useState<boolean | null>(null);

  // Mapping extractor simulation state
  const [isExtracting, setIsExtracting] = useState(false);
  const [sandboxSystemId, setSandboxSystemId] = useState('');
  const [sandboxFetchedRows, setSandboxFetchedRows] = useState<any[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [assignedTechUserId, setAssignedTechUserId] = useState('');
  
  // Batch solutions execution simulation
  const [isExecutingBatch, setIsExecutingBatch] = useState(false);
  const [batchExecutionLogs, setBatchExecutionLogs] = useState<string[]>([]);

  // New Hashtag Preset Creator state
  const [showHashtagModal, setShowHashtagModal] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCriteria, setNewCriteria] = useState('');
  const [newExpectedCols, setNewExpectedCols] = useState('Transaction_ID, Card_Number, Amount_USD, Auth_Time');
  const [newSqlTemplate, setNewSqlTemplate] = useState('');
  const [criteriaAuthorized, setCriteriaAuthorized] = useState(false);
  const [hashtagSearchTerm, setHashtagSearchTerm] = useState('');
  const [showInlineCreateHashtag, setShowInlineCreateHashtag] = useState(false);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [hashtagViewMode, setHashtagViewMode] = useState<'table' | 'grid'>('table');
  const [selectedHashtagTag, setSelectedHashtagTag] = useState<string | null>(null);
  const [selectedTaskToLink, setSelectedTaskToLink] = useState<string>('');
  const [batchInputMode, setBatchInputMode] = useState<'paste' | 'upload'>('paste');

  // NEW states for high-fidelity interactive Investigation Window & Multi-Database Search
  const [invSelectedDbIds, setInvSelectedDbIds] = useState<string[]>([]);
  const [invEnv, setInvEnv] = useState<'testing' | 'production'>('production');
  const [invTable, setInvTable] = useState<string>('transactions_master');
  const [invFileMapping, setInvFileMapping] = useState<Record<string, string>>({});
  const [isInvSearching, setIsInvSearching] = useState(false);
  const [invSearchResults, setInvSearchResults] = useState<any[]>([]);
  const [invSearchSummary, setInvSearchSummary] = useState<{ totalSearched: number; matched: number; notFound: number; queriedDbsCount: number } | null>(null);
  const [invSearchFilterText, setInvSearchFilterText] = useState('');
  const [invSearchStatusFilter, setInvSearchStatusFilter] = useState<'ALL' | 'MATCHED' | 'NOT_FOUND'>('ALL');
  const [invSearchDbFilter, setInvSearchDbFilter] = useState<string>('ALL');

  // Column cleaning and data transformation states for DataView
  const [isDataViewTableVisible, setIsDataViewTableVisible] = useState(true);
  const [activeColumnMenu, setActiveColumnMenu] = useState<string | null>(null);
  const [cleaningActionSuccess, setCleaningActionSuccess] = useState<string | null>(null);
  const [editingColumnKey, setEditingColumnKey] = useState<string | null>(null);
  const [newColumnHeaderName, setNewColumnHeaderName] = useState<string>('');
  const [cleaningUndoSnapshot, setCleaningUndoSnapshot] = useState<{
    headers: string[];
    rows: Record<string, any>[];
    mapping: Record<string, string>;
  } | null>(null);

  const [opQuery, setOpQuery] = useState('');
  const [opEnv, setOpEnv] = useState<'testing' | 'production'>('testing');
  const [opTable, setOpTable] = useState('');
  const [opFetchedRows, setOpFetchedRows] = useState<any[]>([]);
  const [opFilterText, setOpFilterText] = useState('');
  const [opFilterColumn, setOpFilterColumn] = useState('ALL');
  const [opLabels, setOpLabels] = useState<Record<string, string>>({});
  const [showLabelColumn, setShowLabelColumn] = useState(false);
  const [isOpRunningQuery, setIsOpRunningQuery] = useState(false);

  // Solution environment and shortcut states
  const [solutionEnv, setSolutionEnv] = useState<'testing' | 'production'>('testing');

  // Criteria-based labeling builder states
  const [criteriaCol1, setCriteriaCol1] = useState('status_state');
  const [criteriaOp1, setCriteriaOp1] = useState('=');
  const [criteriaVal1, setCriteriaVal1] = useState('');
  const [criteriaCol2, setCriteriaCol2] = useState('card_num');
  const [criteriaOp2, setCriteriaOp2] = useState('LIKE');
  const [criteriaVal2, setCriteriaVal2] = useState('');
  const [criteriaLabel, setCriteriaLabel] = useState('PENDING_RECONCILE');

  // =========================================================================
  // DEDICATED WORKSPACE SQL QUERY SANDBOX ENGINE & STATE
  // =========================================================================
  const [sandboxSelectedDbId, setSandboxSelectedDbId] = useState<string>(() => {
    return (databases && databases.length > 0) ? databases[0].id : (systems && systems.length > 0 ? systems[0].id : 'db-1');
  });
  const [sandboxEnv, setSandboxEnv] = useState<'production' | 'testing'>('production');
  const [sandboxAvailableTables, setSandboxAvailableTables] = useState<string[]>([]);
  const [sandboxTable, setSandboxTable] = useState<string>('transactions');
  const [sandboxAvailableColumns, setSandboxAvailableColumns] = useState<{ name: string; type: string }[]>([]);
  const [sandboxColumns, setSandboxColumns] = useState<string[]>([]);
  const [sandboxSql, setSandboxSql] = useState<string>('SELECT * FROM transactions LIMIT 25;');
  const [isSandboxExecuting, setIsSandboxExecuting] = useState<boolean>(false);
  const [sandboxResults, setSandboxResults] = useState<any[]>([]);
  const [sandboxError, setSandboxError] = useState<string | null>(null);
  const [sandboxExecutionStats, setSandboxExecutionStats] = useState<{
    executionTimeMs: number;
    rowCount: number;
    timestamp: string;
    status: 'SUCCESS' | 'ERROR';
    affectedCount?: number;
    isDml?: boolean;
    queryType: 'SELECT' | 'UPDATE' | 'INSERT' | 'DELETE' | 'ALTER';
    errorMessage?: string;
  } | null>(null);
  const [sandboxQueryLogs, setSandboxQueryLogs] = useState<string[]>([]);
  const [sandboxSearchFilter, setSandboxSearchFilter] = useState<string>('');
  const [sandboxShowLogs, setSandboxShowLogs] = useState<boolean>(false);
  const [sandboxCopiedSql, setSandboxCopiedSql] = useState<boolean>(false);
  const [sandboxSelectedTemplate, setSandboxSelectedTemplate] = useState<string>('select_all');
  const [isSandboxEditorCollapsed, setIsSandboxEditorCollapsed] = useState<boolean>(false);

  // Determine allowed databases based on permanent team policy
  const availableDatabasesForUser = useMemo(() => {
    if (currentUser.role === 'admin' || currentUser.role === 'superadmin' || !userPermTeam?.allowedDbIds || userPermTeam.allowedDbIds.length === 0) {
      return databases;
    }
    const filtered = databases.filter(d => userPermTeam.allowedDbIds!.includes(d.id));
    return filtered.length > 0 ? filtered : databases;
  }, [databases, currentUser, userPermTeam]);

  // Real-time SQL statement type detection & permission verification
  const detectedSandboxQueryType = useMemo((): AllowedQueryType => {
    const match = sandboxSql.match(/^\s*(SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
    return match ? (match[1].toUpperCase() as AllowedQueryType) : 'SELECT';
  }, [sandboxSql]);

  const isCurrentQueryTypePermitted = useMemo(() => {
    if (currentUser.role === 'admin' || currentUser.role === 'superadmin') return true;
    if (!userPermTeam) return false;
    const allowed = userPermTeam.allowedQueryTypes && userPermTeam.allowedQueryTypes.length > 0
      ? userPermTeam.allowedQueryTypes
      : ['SELECT' as AllowedQueryType];
    return allowed.includes(detectedSandboxQueryType);
  }, [currentUser, userPermTeam, detectedSandboxQueryType]);

  // Fetch available tables whenever selected database changes
  useEffect(() => {
    if (!sandboxSelectedDbId) return;
    let isMounted = true;

    api.getDatabaseTables(sandboxSelectedDbId)
      .then(res => {
        if (!isMounted) return;
        const tbls = res.allowedTables && res.allowedTables.length > 0
          ? res.allowedTables
          : (res.availableTables && res.availableTables.length > 0 ? res.availableTables : (res.tables || []));
        setSandboxAvailableTables(tbls);
        if (tbls.length > 0 && (!sandboxTable || !tbls.includes(sandboxTable))) {
          setSandboxTable(tbls[0]);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        const activeDb = databases.find(d => d.id === sandboxSelectedDbId);
        const tbls = activeDb?.allowedTables || activeDb?.availableTables || [];
        setSandboxAvailableTables(tbls);
        if (tbls.length > 0 && (!sandboxTable || !tbls.includes(sandboxTable))) {
          setSandboxTable(tbls[0]);
        }
      });

    return () => { isMounted = false; };
  }, [sandboxSelectedDbId]);

  // Fetch columns and tailor SQL query when database or table changes
  useEffect(() => {
    if (!sandboxSelectedDbId || !sandboxTable) return;
    let isMounted = true;

    api.getTableColumns(sandboxSelectedDbId, sandboxTable)
      .then(res => {
        if (!isMounted) return;
        const cols = res.columns || [];
        setSandboxAvailableColumns(cols);
        const colNames = cols.map(c => c.name);
        const colProjection = colNames.length > 0 && colNames.length <= 8 ? colNames.join(', ') : '*';
        const defaultSql = `SELECT ${colProjection}\nFROM ${sandboxTable}\nLIMIT 25;`;
        setSandboxSql(defaultSql);
        executeSandboxQuery(defaultSql, sandboxTable, sandboxSelectedDbId);
      })
      .catch(() => {
        if (!isMounted) return;
        setSandboxAvailableColumns([]);
        const defaultSql = `SELECT *\nFROM ${sandboxTable}\nLIMIT 25;`;
        setSandboxSql(defaultSql);
        executeSandboxQuery(defaultSql, sandboxTable, sandboxSelectedDbId);
      });

    return () => { isMounted = false; };
  }, [sandboxSelectedDbId, sandboxTable]);

  // Dynamic query templates constructed using the selected database table and columns
  const sandboxTemplates = useMemo(() => {
    const table = sandboxTable || 'transactions';
    const firstCol = sandboxAvailableColumns[0]?.name;
    const secondCol = sandboxAvailableColumns[1]?.name;
    return [
      {
        id: 'select_all',
        name: `1. Select Recent Records (${table})`,
        table,
        sql: `SELECT *\nFROM ${table}\nLIMIT 25;`
      },
      {
        id: 'filter_active',
        name: `2. Filter ${firstCol ? `by ${firstCol}` : 'Records'}`,
        table,
        sql: firstCol
          ? `SELECT *\nFROM ${table}\nWHERE ${firstCol} IS NOT NULL\nLIMIT 25;`
          : `SELECT *\nFROM ${table}\nLIMIT 25;`
      },
      {
        id: 'count_summary',
        name: `3. Total Row Count (${table})`,
        table,
        sql: `SELECT COUNT(*) AS total_records\nFROM ${table};`
      },
      {
        id: 'recent_order',
        name: `4. Sample Ordered by ${secondCol || firstCol || '1'}`,
        table,
        sql: `SELECT *\nFROM ${table}\nORDER BY ${secondCol || firstCol || '1'} DESC\nLIMIT 25;`
      }
    ];
  }, [sandboxTable, sandboxAvailableColumns]);

  const executeSandboxQuery = async (
    querySqlOverride?: string,
    tableOverride?: string,
    dbOverride?: string,
    envOverride?: string
  ) => {
    setIsSandboxExecuting(true);
    setSandboxError(null);
    const sqlToRun = (querySqlOverride !== undefined ? querySqlOverride : sandboxSql).trim();
    const currentTable = tableOverride || sandboxTable;
    const currentDbId = dbOverride || sandboxSelectedDbId;
    const currentEnv = envOverride || sandboxEnv;
    const currentDb = (databases && databases.find(d => d.id === currentDbId)) || {
      id: currentDbId || 'db-1',
      name: 'Database',
      type: 'PostgreSQL',
      host: 'localhost',
      status: 'online'
    };

    const startTime = performance.now();
    const timestamp = new Date().toLocaleTimeString();
    const upperSql = sqlToRun.toUpperCase();
    const isUpdate = /^\s*(UPDATE|DELETE|INSERT|ALTER|CREATE|DROP|TRUNCATE)/i.test(sqlToRun);
    const queryType: 'SELECT' | 'UPDATE' | 'INSERT' | 'DELETE' | 'ALTER' = isUpdate ? 'UPDATE' : 'SELECT';

    const logs = [
      `[${timestamp}] Query dispatch to ${currentDb.name} (${currentDb.type || 'PostgreSQL'}).`,
      `[${timestamp}] Host: ${currentDb.host || 'localhost'} • Environment: ${currentEnv.toUpperCase()}`,
      `[${timestamp}] Target Table: ${currentTable} • Query Type: ${queryType}`,
      `[${timestamp}] Statement: ${sqlToRun.replace(/\s+/g, ' ').slice(0, 120)}...`
    ];

    // Governance Pre-Flight Checks: Permanent Team Policy Enforcement
    if (currentUser.role !== 'admin' && currentUser.role !== 'superadmin') {
      if (!userPermTeam) {
        const errMsg = 'Access Denied: You must belong to a Permanent Team to execute queries in the Query Sandbox.';
        setSandboxError(errMsg);
        setIsSandboxExecuting(false);
        setSandboxExecutionStats({
          executionTimeMs: 0,
          rowCount: 0,
          isDml: isUpdate,
          queryType,
          timestamp: new Date().toISOString(),
          status: 'ERROR',
          errorMessage: errMsg
        });
        return;
      }

      if (userPermTeam.allowedDbIds && userPermTeam.allowedDbIds.length > 0 && !userPermTeam.allowedDbIds.includes(currentDbId)) {
        const errMsg = `Access Denied: Your permanent team "${userPermTeam.name}" is not granted access to database "${currentDb.name}".`;
        setSandboxError(errMsg);
        setIsSandboxExecuting(false);
        setSandboxExecutionStats({
          executionTimeMs: 0,
          rowCount: 0,
          isDml: isUpdate,
          queryType,
          timestamp: new Date().toISOString(),
          status: 'ERROR',
          errorMessage: errMsg
        });
        return;
      }

      const matchType = sqlToRun.match(/^\s*(SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/i);
      const stmtType = matchType ? (matchType[1].toUpperCase() as AllowedQueryType) : 'SELECT';
      const allowedTypes = userPermTeam.allowedQueryTypes && userPermTeam.allowedQueryTypes.length > 0
        ? userPermTeam.allowedQueryTypes
        : ['SELECT' as AllowedQueryType];

      if (!allowedTypes.includes(stmtType)) {
        const errMsg = `Access Denied: Query type '${stmtType}' is forbidden for your permanent team "${userPermTeam.name}". Allowed query types: [${allowedTypes.join(', ')}].`;
        setSandboxError(errMsg);
        setIsSandboxExecuting(false);
        setSandboxExecutionStats({
          executionTimeMs: 0,
          rowCount: 0,
          isDml: isUpdate,
          queryType,
          timestamp: new Date().toISOString(),
          status: 'ERROR',
          errorMessage: errMsg
        });
        return;
      }
    }

    try {
      const res = await api.executeQuery({
        userId: currentUser.id,
        username: currentUser.username,
        userRole: currentUser.role,
        dbId: currentDb.id,
        dbName: currentDb.name,
        query: sqlToRun,
        tableName: currentTable
      });

      const elapsed = res.executionTimeMs || Math.max(15, Math.round(performance.now() - startTime));

      if (isUpdate) {
        logs.push(`[${timestamp}] Write operation completed successfully on '${currentTable}'.`);
        logs.push(`[SUCCESS] DML statement executed in ${elapsed}ms. Rows affected: ${res.rowCount ?? 1}.`);
        setSandboxResults([]);
        setSandboxColumns([]);
        setSandboxExecutionStats({
          executionTimeMs: elapsed,
          rowCount: 0,
          affectedCount: res.rowCount ?? 1,
          isDml: true,
          queryType: 'UPDATE',
          timestamp: new Date().toISOString(),
          status: 'SUCCESS'
        });
      } else {
        const rawRows = Array.isArray(res.rows) ? res.rows : [];
        const cols = (res.columns && res.columns.length > 0)
          ? res.columns
          : (rawRows.length > 0 ? Object.keys(rawRows[0]) : []);

        logs.push(`[SUCCESS] Query executed in ${elapsed}ms. Returned ${rawRows.length} record(s) and ${cols.length} column(s).`);
        setSandboxResults(rawRows);
        setSandboxColumns(cols);
        setSandboxExecutionStats({
          executionTimeMs: elapsed,
          rowCount: rawRows.length,
          isDml: false,
          queryType: 'SELECT',
          timestamp: new Date().toISOString(),
          status: 'SUCCESS'
        });
      }
      setSandboxQueryLogs(logs);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || 'Database execution error';
      logs.push(`[ERROR] Execution failed: ${errorMsg}`);
      setSandboxError(errorMsg);
      setSandboxResults([]);
      setSandboxColumns([]);
      setSandboxExecutionStats({
        executionTimeMs: Math.round(performance.now() - startTime),
        rowCount: 0,
        isDml: isUpdate,
        queryType,
        timestamp: new Date().toISOString(),
        status: 'ERROR',
        errorMessage: errorMsg
      });
      setSandboxQueryLogs(logs);
    } finally {
      setIsSandboxExecuting(false);
    }
  };

  const handleExportSandboxCsv = () => {
    if (sandboxResults.length === 0) return;
    const headers = Object.keys(sandboxResults[0]);
    const csvRows = [
      headers.join(','),
      ...sandboxResults.map(row =>
        headers.map(h => {
          const val = row[h] ?? '';
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
      )
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sql_sandbox_export_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSandboxJson = () => {
    if (sandboxResults.length === 0) return;
    const blob = new Blob([JSON.stringify(sandboxResults, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sql_sandbox_export_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFormatSandboxSql = () => {
    let formatted = sandboxSql
      .replace(/\s+/g, ' ')
      .replace(/\bSELECT\b/gi, 'SELECT')
      .replace(/\bFROM\b/gi, '\nFROM')
      .replace(/\bWHERE\b/gi, '\nWHERE')
      .replace(/\bAND\b/gi, '\n  AND')
      .replace(/\bOR\b/gi, '\n  OR')
      .replace(/\bORDER BY\b/gi, '\nORDER BY')
      .replace(/\bGROUP BY\b/gi, '\nGROUP BY')
      .replace(/\bLIMIT\b/gi, '\nLIMIT')
      .replace(/\bUPDATE\b/gi, 'UPDATE')
      .replace(/\bSET\b/gi, '\nSET')
      .replace(/\bINSERT INTO\b/gi, 'INSERT INTO')
      .replace(/\bVALUES\b/gi, '\nVALUES')
      .trim();
    setSandboxSql(formatted);
  };

  const handleSelectSandboxTemplate = (templateId: string) => {
    setSandboxSelectedTemplate(templateId);
    const tmpl = sandboxTemplates.find(t => t.id === templateId);
    if (tmpl) {
      setSandboxSql(tmpl.sql);
      setSandboxTable(tmpl.table);
      executeSandboxQuery(tmpl.sql, tmpl.table);
    }
  };


  // Create Task Modal state
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showOpenCaseModal, setShowOpenCaseModal] = useState(false);
  const [caseSuccessAlert, setCaseSuccessAlert] = useState<string | null>(null);

  // Task creation fields
  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createPriority, setCreatePriority] = useState<IssuePriority>('Medium');
  const [createAssigneeId, setCreateAssigneeId] = useState(currentUser.id);
  const [createHashtag, setCreateHashtag] = useState('Untagged');
  
  // Investigation Space & Mapping states for Task Creation
  const [includeInvestigationSpace, setIncludeInvestigationSpace] = useState(true);
  const [createDbId, setCreateDbId] = useState('');
  const [createDbTable, setCreateDbTable] = useState('transactions_master');
  const [createFileName, setCreateFileName] = useState('');
  const [createRawHeaders, setCreateRawHeaders] = useState<string[]>([]);
  const [createFileMapping, setCreateFileMapping] = useState<Record<string, string>>({});
  const [createParsedRows, setCreateParsedRows] = useState<Record<string, any>[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  // Create Task Data View & Cleaning States
  const [createActiveColumnMenu, setCreateActiveColumnMenu] = useState<string | null>(null);
  const [createCleaningActionSuccess, setCreateCleaningActionSuccess] = useState<string | null>(null);
  const [createEditingColumnKey, setCreateEditingColumnKey] = useState<string | null>(null);
  const [createNewColumnHeaderName, setCreateNewColumnHeaderName] = useState<string>('');
  const [createDataSearch, setCreateDataSearch] = useState<string>('');
  const [createCleaningUndoSnapshot, setCreateCleaningUndoSnapshot] = useState<{
    headers: string[];
    rows: Record<string, any>[];
    mapping: Record<string, string>;
  } | null>(null);

  // Save Mapping Template Modal States
  const [showSaveMappingModal, setShowSaveMappingModal] = useState<boolean>(false);
  const [saveMappingTemplateName, setSaveMappingTemplateName] = useState<string>('');
  const [saveMappingTemplateDesc, setSaveMappingTemplateDesc] = useState<string>('');
  const [isSavingMapping, setIsSavingMapping] = useState<boolean>(false);

  // Mapping Template Selection State (Default: No template selected, map to Global Standard)
  const [selectedMappingId, setSelectedMappingId] = useState<string>('');
  const [mappingTemplates, setMappingTemplates] = useState<any[]>([
    { id: 'tpl-1', name: 'Standard Payment Gateway CSV', sourceType: 'csv', description: 'Maps custom export column headers into global transaction keys', sampleHeaders: ['Txn_Ref', 'Card_Pan', 'Charge_Amt', 'Cust_Email', 'Auth_Date', 'Status_Code'] },
    { id: 'tpl-2', name: 'Stripe Dispute & Chargeback Export', sourceType: 'csv', description: 'Standard Stripe chargeback export format', sampleHeaders: ['charge_id', 'card_fingerprint', 'charge_amount', 'buyer_email', 'created_date', 'dispute_status'] },
    { id: 'tpl-3', name: 'Visa ISO 8583 Settlement Clearing', sourceType: 'csv', description: 'Visa ISO 8583 settlement clearing file format', sampleHeaders: ['Ref_Number', 'PAN_Masked', 'Txn_Val_USD', 'Cardholder_Mail', 'Iso_Timestamp', 'Iso_Resp'] }
  ]);

  useEffect(() => {
    api.getTransactionSettings()
      .then(res => {
        if (res.templates && res.templates.length > 0) {
          setMappingTemplates(res.templates);
        }
      })
      .catch(e => console.warn('Could not fetch mapping templates:', e));
  }, []);

  // Initialize selected DB ID when modal opens or component mounts
  useEffect(() => {
    if (!createDbId) {
      if (databases && databases.length > 0) {
        setCreateDbId(databases[0].id);
      } else if (systems && systems.length > 0) {
        setCreateDbId(systems[0].id);
      }
    }
  }, [databases, systems, createDbId]);

  // Target standard DB columns for mapping from Global Standard Column Dictionary
  const globalStandardFields = globalMappingService.getStandardFields();
  const TARGET_DB_FIELDS = globalStandardFields.map(f => ({
    id: f.key,
    label: `${f.key} — ${f.label} (${f.dataType})${f.required ? ' *' : ''}`,
    name: f.label,
    dataType: f.dataType,
    category: f.category || 'General',
    required: f.required
  }));



  // Helper: Auto-generate column mapping based on column header keywords and Global Standard Dictionary
  const autoGenerateColumnMapping = (headers: string[]) => {
    return globalMappingService.autoGenerateColumnMapping(headers);
  };

  // Helper to capture undo snapshot before performing data cleaning or mutations
  const captureUndoSnapshot = () => {
    if (!selectedIssue) return;
    const currentHeaders = selectedIssue.uploadedFileHeaders && selectedIssue.uploadedFileHeaders.length > 0
      ? [...selectedIssue.uploadedFileHeaders]
      : (selectedIssue.firstLevelMappedData && selectedIssue.firstLevelMappedData[0] ? Object.keys(selectedIssue.firstLevelMappedData[0]) : []);
    const currentRows = (selectedIssue.firstLevelMappedData || []).map(r => ({ ...r }));
    const currentMapping = { ...invFileMapping };

    setCleaningUndoSnapshot({
      headers: currentHeaders,
      rows: currentRows,
      mapping: currentMapping
    });
  };

  // Handler: Undo last data cleaning action
  const handleUndoCleaning = () => {
    if (!cleaningUndoSnapshot || !selectedIssue) return;
    onUpdateIssue(selectedIssue.id, {
      uploadedFileHeaders: cleaningUndoSnapshot.headers,
      firstLevelMappedData: cleaningUndoSnapshot.rows,
      fileMapping: cleaningUndoSnapshot.mapping
    });
    setInvFileMapping(cleaningUndoSnapshot.mapping);
    setCleaningUndoSnapshot(null);
    setCleaningActionSuccess('Reverted last data cleaning modification.');
    setTimeout(() => setCleaningActionSuccess(null), 3500);
  };

  // Handler: Delete / Remove a Column from the uploaded data view
  const handleDeleteColumn = (colKeyToDelete: string) => {
    if (!selectedIssue || !selectedIssue.firstLevelMappedData) return;
    captureUndoSnapshot();

    const currentHeaders = selectedIssue.uploadedFileHeaders && selectedIssue.uploadedFileHeaders.length > 0
      ? selectedIssue.uploadedFileHeaders
      : Object.keys(selectedIssue.firstLevelMappedData[0] || {});

    const updatedHeaders = currentHeaders.filter(h => h !== colKeyToDelete);
    const updatedRows = selectedIssue.firstLevelMappedData.map(row => {
      const copy = { ...row };
      delete copy[colKeyToDelete];
      return copy;
    });

    const updatedMapping = { ...invFileMapping };
    delete updatedMapping[colKeyToDelete];

    onUpdateIssue(selectedIssue.id, {
      uploadedFileHeaders: updatedHeaders,
      firstLevelMappedData: updatedRows,
      fileMapping: updatedMapping
    });
    setInvFileMapping(updatedMapping);
    setActiveColumnMenu(null);
    setCleaningActionSuccess(`Removed column "${colKeyToDelete}" and cleaned dataset.`);
    setTimeout(() => setCleaningActionSuccess(null), 4000);
  };

  // Handler: Rename a Column in the uploaded data view
  const handleRenameColumn = (oldColKey: string, newColKey: string) => {
    const trimmed = newColKey.trim();
    if (!selectedIssue || !selectedIssue.firstLevelMappedData || !trimmed || trimmed === oldColKey) {
      setEditingColumnKey(null);
      return;
    }
    captureUndoSnapshot();

    const currentHeaders = selectedIssue.uploadedFileHeaders && selectedIssue.uploadedFileHeaders.length > 0
      ? selectedIssue.uploadedFileHeaders
      : Object.keys(selectedIssue.firstLevelMappedData[0] || {});

    const updatedHeaders = currentHeaders.map(h => (h === oldColKey ? trimmed : h));
    const updatedRows = selectedIssue.firstLevelMappedData.map(row => {
      const copy: Record<string, any> = {};
      Object.entries(row).forEach(([k, v]) => {
        if (k === oldColKey) {
          copy[trimmed] = v;
        } else {
          copy[k] = v;
        }
      });
      return copy;
    });

    const updatedMapping = { ...invFileMapping };
    if (updatedMapping[oldColKey]) {
      updatedMapping[trimmed] = updatedMapping[oldColKey];
      delete updatedMapping[oldColKey];
    } else {
      updatedMapping[trimmed] = 'unmapped';
    }

    onUpdateIssue(selectedIssue.id, {
      uploadedFileHeaders: updatedHeaders,
      firstLevelMappedData: updatedRows,
      fileMapping: updatedMapping
    });
    setInvFileMapping(updatedMapping);
    setEditingColumnKey(null);
    setNewColumnHeaderName('');
    setActiveColumnMenu(null);
    setCleaningActionSuccess(`Renamed column "${oldColKey}" to "${trimmed}".`);
    setTimeout(() => setCleaningActionSuccess(null), 4000);
  };

  // Handler: Transform column values (Trim whitespace, Uppercase, Lowercase, Remove Special Chars, Format Decimals, Clean Empty to Null)
  const handleTransformColumn = (
    colKey: string,
    transformType: 'trim' | 'uppercase' | 'lowercase' | 'strip_special' | 'number_clean' | 'fill_blanks' | 'mask_card'
  ) => {
    if (!selectedIssue || !selectedIssue.firstLevelMappedData) return;
    captureUndoSnapshot();

    let affectedCount = 0;
    const updatedRows = selectedIssue.firstLevelMappedData.map(row => {
      const copy = { ...row };
      const val = copy[colKey];
      if (val !== undefined && val !== null) {
        let str = String(val);
        let transformed: any = str;

        if (transformType === 'trim') {
          transformed = str.trim();
        } else if (transformType === 'uppercase') {
          transformed = str.toUpperCase().trim();
        } else if (transformType === 'lowercase') {
          transformed = str.toLowerCase().trim();
        } else if (transformType === 'strip_special') {
          // Remove non-alphanumeric except basic punctuation
          transformed = str.replace(/[^\w\s.-]/gi, '').trim();
        } else if (transformType === 'number_clean') {
          // Keep only numeric and dot
          const cleanedNum = str.replace(/[^0-9.-]/g, '');
          const num = parseFloat(cleanedNum);
          transformed = isNaN(num) ? '0.00' : num.toFixed(2);
        } else if (transformType === 'fill_blanks') {
          if (!str || str.trim() === '' || str.toLowerCase() === 'null' || str === '-') {
            transformed = 'N/A';
          }
        } else if (transformType === 'mask_card') {
          const digitsOnly = str.replace(/\D/g, '');
          if (digitsOnly.length >= 12) {
            transformed = `${digitsOnly.slice(0, 4)}********${digitsOnly.slice(-4)}`;
          }
        }

        if (transformed !== val) affectedCount++;
        copy[colKey] = transformed;
      }
      return copy;
    });

    onUpdateIssue(selectedIssue.id, {
      firstLevelMappedData: updatedRows
    });
    setActiveColumnMenu(null);
    setCleaningActionSuccess(`Cleaned ${affectedCount} values in "${colKey}" using ${transformType.replace('_', ' ')}.`);
    setTimeout(() => setCleaningActionSuccess(null), 4000);
  };

  // Handler: Global Dataset Cleaning (Trim all, strip empty rows, deduplicate)
  const handleGlobalDatasetClean = (action: 'trim_all' | 'remove_empty_rows' | 'deduplicate') => {
    if (!selectedIssue || !selectedIssue.firstLevelMappedData) return;
    captureUndoSnapshot();

    const headers = selectedIssue.uploadedFileHeaders && selectedIssue.uploadedFileHeaders.length > 0
      ? selectedIssue.uploadedFileHeaders
      : Object.keys(selectedIssue.firstLevelMappedData[0] || {});

    let cleanedRows = [...selectedIssue.firstLevelMappedData];
    let msg = '';

    if (action === 'trim_all') {
      cleanedRows = cleanedRows.map(row => {
        const copy: Record<string, any> = {};
        Object.entries(row).forEach(([k, v]) => {
          copy[k] = typeof v === 'string' ? v.trim() : v;
        });
        return copy;
      });
      msg = `Trimmed whitespace across all ${headers.length} columns and ${cleanedRows.length} rows.`;
    } else if (action === 'remove_empty_rows') {
      const initialCount = cleanedRows.length;
      cleanedRows = cleanedRows.filter(row => {
        return Object.values(row).some(v => v !== undefined && v !== null && String(v).trim() !== '' && String(v) !== '-');
      });
      const removed = initialCount - cleanedRows.length;
      msg = `Filtered dataset: Removed ${removed} completely empty rows (${cleanedRows.length} remaining).`;
    } else if (action === 'deduplicate') {
      const initialCount = cleanedRows.length;
      const seen = new Set<string>();
      cleanedRows = cleanedRows.filter(row => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const removed = initialCount - cleanedRows.length;
      msg = `Deduplicated records: Removed ${removed} duplicate rows (${cleanedRows.length} unique rows remaining).`;
    }

    onUpdateIssue(selectedIssue.id, {
      firstLevelMappedData: cleanedRows
    });
    setCleaningActionSuccess(msg);
    setTimeout(() => setCleaningActionSuccess(null), 4500);
  };

  // Quick sample loader: Chargeback Batch CSV
  const handleLoadSampleChargebacks = () => {
    const headers = ['Transaction_ID', 'Card_Number', 'Amount_USD', 'Auth_Time', 'Dispute_Reason', 'Customer_Email'];
    const rows = [
      { Transaction_ID: 'TXN-9081', Card_Number: '4111********9012', Amount_USD: 249.50, Auth_Time: new Date(Date.now() - 7200000).toISOString(), Dispute_Reason: 'UNAUTHORIZED_CHARGE', Customer_Email: 'client1@example.com' },
      { Transaction_ID: 'TXN-9082', Card_Number: '4000********1122', Amount_USD: 89.00, Auth_Time: new Date(Date.now() - 3600000).toISOString(), Dispute_Reason: 'DUPLICATE_PROCESSING', Customer_Email: 'client2@example.com' },
      { Transaction_ID: 'TXN-9083', Card_Number: '5412********8833', Amount_USD: 410.25, Auth_Time: new Date().toISOString(), Dispute_Reason: 'MERCHANDISE_NOT_RECEIVED', Customer_Email: 'client3@example.com' }
    ];
    setCreateFileName('sample_chargebacks_batch_2026.csv');
    setCreateRawHeaders(headers);
    setCreateFileMapping(autoGenerateColumnMapping(headers));
    setCreateParsedRows(rows);
  };

  // Quick sample loader: Settlement Batch CSV
  const handleLoadSampleSettlements = () => {
    const headers = ['Txn_Ref_ID', 'Card_PAN', 'Settlement_Amt', 'Posting_Date', 'Settlement_Status'];
    const rows = [
      { Txn_Ref_ID: 'SET-1001', Card_PAN: '4111********3344', Settlement_Amt: 1250.00, Posting_Date: new Date(Date.now() - 86400000).toISOString(), Settlement_Status: 'PENDING' },
      { Txn_Ref_ID: 'SET-1002', Card_PAN: '5200********9900', Settlement_Amt: 780.50, Posting_Date: new Date(Date.now() - 43200000).toISOString(), Settlement_Status: 'SETTLED' },
      { Txn_Ref_ID: 'SET-1003', Card_PAN: '4000********7711', Settlement_Amt: 340.00, Posting_Date: new Date().toISOString(), Settlement_Status: 'PENDING' }
    ];
    setCreateFileName('settlement_recon_batch_q3.csv');
    setCreateRawHeaders(headers);
    setCreateFileMapping(autoGenerateColumnMapping(headers));
    setCreateParsedRows(rows);
  };

  // Helper to capture undo snapshot for Create Task
  const captureCreateUndoSnapshot = () => {
    setCreateCleaningUndoSnapshot({
      headers: [...createRawHeaders],
      rows: createParsedRows.map(r => ({ ...r })),
      mapping: { ...createFileMapping }
    });
  };

  // Handler: Undo last data cleaning action in Create Task
  const handleCreateUndoCleaning = () => {
    if (!createCleaningUndoSnapshot) return;
    setCreateRawHeaders(createCleaningUndoSnapshot.headers);
    setCreateParsedRows(createCleaningUndoSnapshot.rows);
    setCreateFileMapping(createCleaningUndoSnapshot.mapping);
    setCreateCleaningUndoSnapshot(null);
    setCreateCleaningActionSuccess('Reverted last data cleaning modification.');
    setTimeout(() => setCreateCleaningActionSuccess(null), 3500);
  };

  // Handler: Delete Column in Create Task
  const handleCreateDeleteColumn = (colKeyToDelete: string) => {
    if (createRawHeaders.length === 0) return;
    captureCreateUndoSnapshot();

    const updatedHeaders = createRawHeaders.filter(h => h !== colKeyToDelete);
    const updatedRows = createParsedRows.map(row => {
      const copy = { ...row };
      delete copy[colKeyToDelete];
      return copy;
    });

    const updatedMapping = { ...createFileMapping };
    delete updatedMapping[colKeyToDelete];

    setCreateRawHeaders(updatedHeaders);
    setCreateParsedRows(updatedRows);
    setCreateFileMapping(updatedMapping);
    setCreateActiveColumnMenu(null);
    setCreateCleaningActionSuccess(`Removed column "${colKeyToDelete}" from dataset.`);
    setTimeout(() => setCreateCleaningActionSuccess(null), 4000);
  };

  // Handler: Rename Column in Create Task
  const handleCreateRenameColumn = (oldColKey: string, newColKey: string) => {
    const trimmed = newColKey.trim();
    if (!trimmed || trimmed === oldColKey) {
      setCreateEditingColumnKey(null);
      setCreateNewColumnHeaderName('');
      return;
    }

    if (createRawHeaders.includes(trimmed)) {
      alert(`A column named "${trimmed}" already exists.`);
      return;
    }

    captureCreateUndoSnapshot();

    const updatedHeaders = createRawHeaders.map(h => h === oldColKey ? trimmed : h);
    const updatedRows = createParsedRows.map(row => {
      const copy: Record<string, any> = {};
      Object.entries(row).forEach(([k, v]) => {
        if (k === oldColKey) {
          copy[trimmed] = v;
        } else {
          copy[k] = v;
        }
      });
      return copy;
    });

    const updatedMapping = { ...createFileMapping };
    if (updatedMapping[oldColKey]) {
      updatedMapping[trimmed] = updatedMapping[oldColKey];
      delete updatedMapping[oldColKey];
    } else {
      updatedMapping[trimmed] = 'unmapped';
    }

    setCreateRawHeaders(updatedHeaders);
    setCreateParsedRows(updatedRows);
    setCreateFileMapping(updatedMapping);
    setCreateEditingColumnKey(null);
    setCreateNewColumnHeaderName('');
    setCreateActiveColumnMenu(null);
    setCreateCleaningActionSuccess(`Renamed column "${oldColKey}" to "${trimmed}".`);
    setTimeout(() => setCreateCleaningActionSuccess(null), 4000);
  };

  // Handler: Transform Column in Create Task
  const handleCreateTransformColumn = (
    colKey: string,
    transformType: 'trim' | 'uppercase' | 'lowercase' | 'strip_special' | 'number_clean' | 'fill_blanks' | 'mask_card'
  ) => {
    if (createParsedRows.length === 0) return;
    captureCreateUndoSnapshot();

    let affectedCount = 0;
    const updatedRows = createParsedRows.map(row => {
      const copy = { ...row };
      const val = copy[colKey];
      if (val !== undefined && val !== null) {
        let str = String(val);
        let transformed: any = str;

        if (transformType === 'trim') {
          transformed = str.trim();
        } else if (transformType === 'uppercase') {
          transformed = str.toUpperCase().trim();
        } else if (transformType === 'lowercase') {
          transformed = str.toLowerCase().trim();
        } else if (transformType === 'strip_special') {
          transformed = str.replace(/[^\w\s.-]/gi, '').trim();
        } else if (transformType === 'number_clean') {
          const cleanedNum = str.replace(/[^0-9.-]/g, '');
          const num = parseFloat(cleanedNum);
          transformed = isNaN(num) ? '0.00' : num.toFixed(2);
        } else if (transformType === 'fill_blanks') {
          if (!str || str.trim() === '' || str.toLowerCase() === 'null' || str === '-') {
            transformed = 'N/A';
          }
        } else if (transformType === 'mask_card') {
          const digitsOnly = str.replace(/\D/g, '');
          if (digitsOnly.length >= 12) {
            transformed = `${digitsOnly.slice(0, 4)}********${digitsOnly.slice(-4)}`;
          }
        }

        if (transformed !== val) affectedCount++;
        copy[colKey] = transformed;
      }
      return copy;
    });

    setCreateParsedRows(updatedRows);
    setCreateActiveColumnMenu(null);
    setCreateCleaningActionSuccess(`Cleaned ${affectedCount} values in "${colKey}" using ${transformType.replace('_', ' ')}.`);
    setTimeout(() => setCreateCleaningActionSuccess(null), 4000);
  };

  // Handler: Global Dataset Clean in Create Task
  const handleCreateGlobalDatasetClean = (action: 'trim_all' | 'remove_empty_rows' | 'deduplicate') => {
    if (createParsedRows.length === 0) return;
    captureCreateUndoSnapshot();

    let cleanedRows = [...createParsedRows];
    let msg = '';

    if (action === 'trim_all') {
      cleanedRows = cleanedRows.map(row => {
        const copy: Record<string, any> = {};
        Object.entries(row).forEach(([k, v]) => {
          copy[k] = typeof v === 'string' ? v.trim() : v;
        });
        return copy;
      });
      msg = `Trimmed whitespace across all ${createRawHeaders.length} columns and ${cleanedRows.length} rows.`;
    } else if (action === 'remove_empty_rows') {
      const initialCount = cleanedRows.length;
      cleanedRows = cleanedRows.filter(row => {
        return Object.values(row).some(v => v !== undefined && v !== null && String(v).trim() !== '' && String(v) !== '-');
      });
      const removed = initialCount - cleanedRows.length;
      msg = `Filtered dataset: Removed ${removed} completely empty rows (${cleanedRows.length} remaining).`;
    } else if (action === 'deduplicate') {
      const initialCount = cleanedRows.length;
      const seen = new Set<string>();
      cleanedRows = cleanedRows.filter(row => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const removed = initialCount - cleanedRows.length;
      msg = `Deduplicated records: Removed ${removed} duplicate rows (${cleanedRows.length} unique rows remaining).`;
    }

    setCreateParsedRows(cleanedRows);
    setCreateCleaningActionSuccess(msg);
    setTimeout(() => setCreateCleaningActionSuccess(null), 4500);
  };

  // Handler: Open Save Mapping Modal
  const handleOpenSaveMappingModal = () => {
    const defaultName = createFileName
      ? `${createFileName.replace(/\.[^/.]+$/, '')} Template`
      : `Custom Mapping ${new Date().toLocaleDateString()}`;
    setSaveMappingTemplateName(defaultName);
    const mappedCount = Object.keys(createFileMapping).filter(k => createFileMapping[k] && createFileMapping[k] !== 'unmapped').length;
    setSaveMappingTemplateDesc(`Custom mapping configuration with ${mappedCount} mapped column headers.`);
    setShowSaveMappingModal(true);
  };

  // Handler: Save Current Mapping as a Template
  const handleSaveCurrentMapping = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedName = saveMappingTemplateName.trim();
    if (!trimmedName) {
      alert('Please enter a template name.');
      return;
    }

    setIsSavingMapping(true);
    try {
      const templatePayload = {
        id: `tpl-${Date.now()}`,
        name: trimmedName,
        description: saveMappingTemplateDesc.trim() || 'Custom schema mapping template',
        sourceType: 'csv',
        sampleHeaders: createRawHeaders,
        columnMappings: createFileMapping,
        updatedAt: new Date().toISOString()
      };

      // Attempt to save to API backend
      try {
        await api.saveTransactionTemplate(templatePayload);
      } catch (err) {
        console.warn('Saved template to local state (API fallback):', err);
      }

      // Update mappingTemplates state
      setMappingTemplates(prev => {
        const index = prev.findIndex(t => t.id === templatePayload.id || t.name.toLowerCase() === trimmedName.toLowerCase());
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = templatePayload;
          return updated;
        }
        return [...prev, templatePayload];
      });

      setSelectedMappingId(templatePayload.id);
      setShowSaveMappingModal(false);

      const mappedCount = Object.keys(createFileMapping).filter(k => createFileMapping[k] && createFileMapping[k] !== 'unmapped').length;
      setCreateCleaningActionSuccess(`Mapping template "${trimmedName}" saved successfully! (${mappedCount} columns mapped).`);
      setTimeout(() => setCreateCleaningActionSuccess(null), 5000);
    } catch (err: any) {
      alert('Failed to save mapping: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSavingMapping(false);
    }
  };

  // File Change Handler for Task Creation
  const handleCreateFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsProcessingFile(true);
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        let headers: string[] = [];
        let parsedRows: Record<string, any>[] = [];

        if (isExcel) {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          if (firstSheet) {
            const raw = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
            if (raw.length > 0) {
              headers = raw[0].map(h => String(h).trim());
              parsedRows = XLSX.utils.sheet_to_json(firstSheet) as Record<string, any>[];
            }
          }
        } else {
          const text = event.target?.result as string;
          const lines = text.split('\n').filter(l => l.trim().length > 0);
          if (lines.length > 0) {
            headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
            for (let i = 1; i < Math.min(lines.length, 25); i++) {
              const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
              const rowObj: Record<string, any> = {};
              headers.forEach((h, idx) => {
                rowObj[h] = values[idx] || '';
              });
              parsedRows.push(rowObj);
            }
          }
        }

        setCreateFileName(file.name);
        setCreateRawHeaders(headers);
        setCreateFileMapping(autoGenerateColumnMapping(headers));
        setCreateParsedRows(parsedRows);
      } catch (err) {
        alert('Could not parse uploaded file. Please provide a valid CSV or Excel document.');
      } finally {
        setIsProcessingFile(false);
      }
    };

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  // Submit Handler for Creating Task with Investigation Space
  const handleCreateTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim()) {
      alert('Please enter a task title.');
      return;
    }

    const assignee = users.find(u => u.id === createAssigneeId);

    const newIssuePayload = {
      title: createTitle.trim(),
      description: createDesc.trim() || 'Task created in Workspace.',
      priority: createPriority,
      type: (includeInvestigationSpace && createFileName) ? ('file' as const) : ('single' as const),
      assignedTechUserId: createAssigneeId || currentUser.id,
      assignedTechUserName: assignee ? assignee.username : currentUser.username,
      linkedHashtag: (createHashtag && createHashtag !== 'Untagged') ? createHashtag : undefined,
      uploadedFileName: includeInvestigationSpace ? createFileName : undefined,
      uploadedFileHeaders: includeInvestigationSpace ? createRawHeaders : undefined,
      fileMapping: includeInvestigationSpace ? createFileMapping : undefined,
      firstLevelMappedData: includeInvestigationSpace ? createParsedRows : undefined,
      mappingId: includeInvestigationSpace ? selectedMappingId : undefined,
      investigationEnvironment: 'production' as const
    };

    if (onCreateIssue) {
      onCreateIssue(newIssuePayload);
    }

    // Persist into Centralized Workspace Table if file data exists
    if (includeInvestigationSpace && createFileName && createParsedRows.length > 0) {
      const selectedTplObj = mappingTemplates.find(t => t.id === selectedMappingId);
      const activeTplName = selectedTplObj ? selectedTplObj.name : (selectedMappingId ? `Mapping ${selectedMappingId}` : 'Global Standard Mapping');
      const generatedTaskId = `ISSUE-${Math.floor(1000 + Math.random() * 9000)}`;

      const workspaceRecords = createParsedRows.map((row, idx) => {
        const transformedRow = globalMappingService.transformRowToGlobalSchema(row, createFileMapping);
        const rowValues = Object.values(transformedRow).map(v => String(v !== undefined && v !== null ? v : ''));

        return {
          id: `wtr-${Date.now()}-${idx + 1}-${Math.random().toString(36).substring(2, 6)}`,
          file_name: createFileName,
          user: currentUser.username || currentUser.id || 'anonymous_user',
          user_id: currentUser.id || currentUser.username,
          tag: (createHashtag && createHashtag !== 'Untagged') ? createHashtag : 'Untagged',
          task_id: generatedTaskId,
          mapping_id: selectedMappingId || 'global-standard',
          mapping_name: activeTplName,
          transformed_data: transformedRow,
          raw_data: row,
          list_of_values_from_one_row: rowValues,
          createdAt: new Date().toISOString()
        };
      });

      try {
        const savedWs = localStorage.getItem('workspace_table_records');
        const existingRecords = savedWs ? JSON.parse(savedWs) : [];
        const mergedRecords = [...workspaceRecords, ...existingRecords];
        localStorage.setItem('workspace_table_records', JSON.stringify(mergedRecords));
      } catch (err) {
        console.warn('LocalStorage save error for workspace_table_records:', err);
      }

      api.saveWorkspaceTableRecords(workspaceRecords).catch(err => {
        console.warn('Backend saveWorkspaceTableRecords error:', err);
      });
    }

    setCurrentMode('workspace');
    // Reset form fields
    setCreateTitle('');
    setCreateDesc('');
    setCreateHashtag('Untagged');
    setCreateFileName('');
    setCreateRawHeaders([]);
    setCreateFileMapping({});
    setCreateParsedRows([]);
  };

  // Handler: Remove uploaded file / data from task creation form
  const handleRemoveCreateUploadedFile = () => {
    setCreateFileName('');
    setCreateRawHeaders([]);
    setCreateParsedRows([]);
    setCreateFileMapping({});
    setCreateCleaningUndoSnapshot(null);
    setCreateCleaningActionSuccess('Uploaded dataset removed.');
    setTimeout(() => setCreateCleaningActionSuccess(null), 3000);
    setCreateDataSearch('');
    const fileInput = document.getElementById('task-create-file-upload-input') as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';
  };

  // Dedicated Open Case submit handler
  const handleOpenCaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim()) {
      alert('Please enter a case title to open.');
      return;
    }

    const assignee = users.find(u => u.id === createAssigneeId);
    const selectedTemplate = mappingTemplates.find(t => t.id === selectedMappingId);
    const templateName = selectedTemplate ? selectedTemplate.name : (selectedMappingId || 'Global Standard Mapping');
    const generatedTaskId = `CASE-${Math.floor(1000 + Math.random() * 9000)}`;

    const newIssuePayload = {
      title: createTitle.trim(),
      description: createDesc.trim() || `Case opened with file ${createFileName || 'batch_transactions.csv'} using ${selectedTemplate ? `mapping template "${templateName}"` : 'global standard schema mapping'}.`,
      priority: createPriority,
      type: createFileName ? ('file' as const) : ('single' as const),
      assignedTechUserId: createAssigneeId || currentUser.id,
      assignedTechUserName: assignee ? assignee.username : currentUser.username,
      linkedHashtag: (createHashtag && createHashtag !== 'Untagged') ? createHashtag : undefined,
      uploadedFileName: createFileName || 'batch_transactions.csv',
      uploadedFileHeaders: createRawHeaders.length > 0 ? createRawHeaders : ['Transaction_ID', 'Card_Number', 'Amount_USD', 'Auth_Time'],
      fileMapping: Object.keys(createFileMapping).length > 0 ? createFileMapping : autoGenerateColumnMapping(createRawHeaders.length > 0 ? createRawHeaders : ['Transaction_ID', 'Card_Number', 'Amount_USD', 'Auth_Time']),
      firstLevelMappedData: createParsedRows.length > 0 ? createParsedRows : undefined,
      mappingId: selectedMappingId || 'global-standard',
      investigationEnvironment: 'production' as const
    };

    if (onCreateIssue) {
      onCreateIssue(newIssuePayload);
    }

    // Persist into Centralized Workspace Table (transformed global schema fields, file_name, user, tag)
    if (createParsedRows.length > 0) {
      const workspaceRecords = createParsedRows.map((row, idx) => {
        const transformedRow = globalMappingService.transformRowToGlobalSchema(row, createFileMapping);
        const rowValues = Object.values(transformedRow).map(v => String(v !== undefined && v !== null ? v : ''));

        return {
          id: `wtr-${Date.now()}-${idx + 1}-${Math.random().toString(36).substring(2, 6)}`,
          file_name: createFileName || 'batch_transactions.csv',
          user: currentUser.username || currentUser.id || 'anonymous_user',
          user_id: currentUser.id || currentUser.username,
          tag: (createHashtag && createHashtag !== 'Untagged') ? createHashtag : 'Untagged',
          task_id: generatedTaskId,
          mapping_id: selectedMappingId || 'global-standard',
          mapping_name: templateName,
          transformed_data: transformedRow,
          raw_data: row,
          list_of_values_from_one_row: rowValues,
          createdAt: new Date().toISOString()
        };
      });

      try {
        const savedWs = localStorage.getItem('workspace_table_records');
        const existingRecords = savedWs ? JSON.parse(savedWs) : [];
        const mergedRecords = [...workspaceRecords, ...existingRecords];
        localStorage.setItem('workspace_table_records', JSON.stringify(mergedRecords));
      } catch (err) {
        console.warn('LocalStorage save error for workspace_table_records:', err);
      }

      api.saveWorkspaceTableRecords(workspaceRecords).catch(err => {
        console.warn('Backend saveWorkspaceTableRecords error:', err);
      });
    }

    setWorkspaceSubView('workspace');
    setShowOpenCaseModal(false);
    setCurrentMode('workspace');
    if (onChangeTab) onChangeTab('workspace');

    const alertMsg = `Successfully opened case "${createTitle.trim()}"! Attached file "${createFileName || 'batch_transactions.csv'}", mapped using template "${templateName}", and applied category ${createHashtag}.`;
    setCaseSuccessAlert(alertMsg);
    setTimeout(() => setCaseSuccessAlert(null), 8000);

    // Reset form fields
    setCreateTitle('');
    setCreateDesc('');
    setCreateHashtag('Untagged');
    setCreateFileName('');
    setCreateRawHeaders([]);
    setCreateFileMapping({});
    setCreateParsedRows([]);
  };

  // Send popup / dispatch states
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchTitle, setDispatchTitle] = useState('');
  const [dispatchFindings, setDispatchFindings] = useState('');
  const [dispatchStatus, setDispatchStatus] = useState<IssueStatus>('Investigating');
  const [dispatchPriority, setDispatchPriority] = useState<IssuePriority>('High');
  const [dispatchTargetTech, setDispatchTargetTech] = useState('');

  const selectedIssue = issues.find(i => i.id === selectedIssueId) || issues[0];

  // Counts for tasks
  const assignedCount = issues.filter(i => i.assignedTechUserId === currentUser.id).length;
  const myCreatedCount = issues.filter(i => i.creatorId === currentUser.id).length;
  const teamSharedCount = isMemberOfPermanentTeam 
    ? issues.filter(i => i.teamId === effectivePermanentTeamId && i.visibility === 'TEAM_PUBLIC').length 
    : 0;
  const privateCount = issues.filter(i => i.creatorId === currentUser.id && i.visibility === 'PERSONAL_PRIVATE').length;

  // Filters issues based on Search + Status + Hashtag + Task Scope
  const filteredIssues = issues.filter(issue => {
    const matchesSearch = issue.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          issue.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' ? true : issue.status === statusFilter;
    const matchesHashtag = hashtagFilter === 'ALL' ? true : issue.linkedHashtag === hashtagFilter;
    
    let matchesScope = true;
    if (taskScopeFilter === 'ASSIGNED') {
      matchesScope = issue.assignedTechUserId === currentUser.id;
    } else if (taskScopeFilter === 'MINE') {
      matchesScope = issue.creatorId === currentUser.id;
    } else if (taskScopeFilter === 'TEAM') {
      matchesScope = issue.teamId === effectivePermanentTeamId && issue.visibility === 'TEAM_PUBLIC';
    } else if (taskScopeFilter === 'PRIVATE') {
      matchesScope = issue.creatorId === currentUser.id && issue.visibility === 'PERSONAL_PRIVATE';
    }

    return matchesSearch && matchesStatus && matchesHashtag && matchesScope;
  });
  useEffect(() => {
    if (selectedIssue) {
      setCustomSql(selectedIssue.solutionScript || (selectedIssue.linkedHashtag 
        ? hashtags.find(h => h.tag === selectedIssue.linkedHashtag)?.solutionTemplate || '' 
        : ''
      ));
      setSecondLevelNotes(selectedIssue.secondLevelNotes || '');
      setSqlTestOutput(selectedIssue.solutionTestResult || null);
      setSqlTestSuccess(selectedIssue.solutionExecuted ? true : null);

      // Sync Advanced investigation parameters
      setSandboxSystemId(selectedIssue.investigationSystemId || (systems[0]?.id || ''));
      setSandboxEnv(selectedIssue.investigationEnvironment || 'testing');
      setSandboxTable(selectedIssue.investigationTable || '');
      setAssignedTechUserId(selectedIssue.assignedTechUserId || '');
      
      // Clear simulations
      setSandboxQueryLogs([]);
      setSandboxFetchedRows(selectedIssue.queryResults || []);
      setBatchExecutionLogs([]);

      // Sync new operational workspace states
      setOpQuery(selectedIssue.solutionScript || (selectedIssue.linkedHashtag 
        ? hashtags.find(h => h.tag === selectedIssue.linkedHashtag)?.solutionTemplate || '' 
        : ''
      ));
      setOpEnv(selectedIssue.investigationEnvironment || 'testing');
      
      const defaultSys = systems.find(s => s.id === (selectedIssue.investigationSystemId || systems[0]?.id)) || systems[0];
      const defaultTable = selectedIssue.investigationTable || (defaultSys ? (selectedIssue.investigationEnvironment === 'production' ? defaultSys.production.allowedTables[0] : defaultSys.testing.allowedTables[0]) : '');
      setOpTable(defaultTable || '');
      
      setOpFetchedRows(selectedIssue.queryResults || []);
      setOpLabels(selectedIssue.rowLabels || {});
      setShowLabelColumn(!!selectedIssue.addedLabelColumnName);
      setOpFilterText('');
      setOpFilterColumn('ALL');

      // Initialize Investigation External DB Search parameters with default connected databases
      const defaultDbs = (databases && databases.length > 0) 
        ? databases.map(d => d.id) 
        : (systems && systems.length > 0 ? [systems[0].id] : ['db-1']);
      setInvSelectedDbIds(defaultDbs.slice(0, 3));
      setInvEnv('production');
      setInvTable('transactions_master');

      // Initialize mapping from selectedIssue.fileMapping or auto-generate from headers
      if (selectedIssue.fileMapping && Object.keys(selectedIssue.fileMapping).length > 0) {
        setInvFileMapping(selectedIssue.fileMapping);
      } else if (selectedIssue.uploadedFileHeaders && selectedIssue.uploadedFileHeaders.length > 0) {
        setInvFileMapping(autoGenerateColumnMapping(selectedIssue.uploadedFileHeaders));
      } else if (selectedIssue.firstLevelMappedData && selectedIssue.firstLevelMappedData.length > 0) {
        setInvFileMapping(autoGenerateColumnMapping(Object.keys(selectedIssue.firstLevelMappedData[0])));
      } else {
        setInvFileMapping({});
      }

      setInvSearchResults([]);
      setInvSearchSummary(null);
      setInvSearchFilterText('');
      setInvSearchStatusFilter('ALL');

      // Dispatch modal defaults
      setDispatchTitle(selectedIssue.title || '');
      setDispatchFindings(selectedIssue?.description || '');
      setDispatchStatus(selectedIssue?.status || 'Investigating');
      setDispatchPriority(selectedIssue?.priority || 'High');
      
      const technicalUsersList = users.filter(u => u.isApproved);
      setDispatchTargetTech(selectedIssue?.assignedTechUserId || (technicalUsersList[0]?.id || ''));
    }
  }, [selectedIssueId, selectedIssue, hashtags, systems, users]);

  // Filters allowed systems for current user
  const allowedSystems = systems.filter(sys => {
    const roleMatch = sys.allowedRoles.includes(currentUser.role as any);
    const userMatch = sys.allowedUserIds.includes(currentUser.id);
    return roleMatch || userMatch;
  });

  const selectedSystem = systems.find(s => s.id === (sandboxSystemId || selectedIssue?.investigationSystemId));

  // Quick helper to seed sample reconciliation task when queue is empty
  const handleCreateQuickSampleTask = () => {
    if (onCreateIssue) {
      onCreateIssue({
        title: 'Settlement Batch Reconciliation - Terminal 01',
        description: 'Auto-generated reconciliation task with sample card transactions for testing operational workflows.',
        priority: 'Medium',
        type: 'file',
        uploadedFileName: 'batch_settlements_sample.csv',
        uploadedFileHeaders: ['Transaction_ID', 'Card_Number', 'Amount_USD', 'Auth_Time', 'Status'],
        fileMapping: {
          'Transaction_ID': 'transaction_id',
          'Card_Number': 'card_number',
          'Amount_USD': 'amount_usd',
          'Auth_Time': 'created_at',
          'Status': 'status_state'
        },
        firstLevelMappedData: [
          { 'Transaction_ID': 'TXN-9021', 'Card_Number': '4111********9982', 'Amount_USD': '149.99', 'Auth_Time': new Date().toISOString(), 'Status': 'PENDING' },
          { 'Transaction_ID': 'TXN-9022', 'Card_Number': '4111********9982', 'Amount_USD': '149.99', 'Auth_Time': new Date().toISOString(), 'Status': 'SETTLED' },
          { 'Transaction_ID': 'TXN-9023', 'Card_Number': '5500********1234', 'Amount_USD': '89.50', 'Auth_Time': new Date().toISOString(), 'Status': 'DISPUTED' }
        ],
        linkedHashtag: '#DUPLICATE_AUTH',
        chat: []
      });
      setCaseSuccessAlert('Sample reconciliation task batch loaded into workspace queue!');
      setTimeout(() => setCaseSuccessAlert(null), 4000);
    }
  };

  // Filter users for assignment routing
  const technicalUsers = users.filter(u => u.isApproved);

  // Role helper variables for permissions
  const isTechOrAdmin = true;
  const isOpsOrAdmin = true;

  // Filter fetched rows based on operational custom criteria
  const filteredFetchedData = opFetchedRows.filter(row => {
    if (!opFilterText) return true;
    if (opFilterColumn === 'ALL') {
      return String(row.txn_id || '').toLowerCase().includes(opFilterText.toLowerCase()) ||
             String(row.card_num || '').toLowerCase().includes(opFilterText.toLowerCase()) ||
             String(row.status_state || '').toLowerCase().includes(opFilterText.toLowerCase()) ||
             String(row.amount_usd || '').toLowerCase().includes(opFilterText.toLowerCase()) ||
             String(opLabels[row.txn_id] || '').toLowerCase().includes(opFilterText.toLowerCase());
    } else if (opFilterColumn === 'txn_id') {
      return String(row.txn_id || '').toLowerCase().includes(opFilterText.toLowerCase());
    } else if (opFilterColumn === 'card_num') {
      return String(row.card_num || '').toLowerCase().includes(opFilterText.toLowerCase());
    } else if (opFilterColumn === 'status_state') {
      return String(row.status_state || '').toLowerCase().includes(opFilterText.toLowerCase());
    } else if (opFilterColumn === 'amount') {
      return String(row.amount_usd || '').toLowerCase().includes(opFilterText.toLowerCase());
    }
    return true;
  });

  // 1. Column extraction simulation
  const handleExtractData = () => {
    if (!selectedIssue.fileMapping || !selectedIssue.uploadedFileHeaders) return;

    setIsExtracting(true);
    setTimeout(() => {
      const notes = `Column Extraction Auto-Execution: Mapped ${selectedIssue.uploadedFileName} according to configured schema values.\n` +
                    `- transaction_id ← extracted from Transaction_ID\n` +
                    `- card_number ← extracted from Card_Number\n` +
                    `- amount ← extracted from Amount_USD\n` +
                    `- timestamp ← extracted from Auth_Time\n\n` +
                    `Matched entry details:\n` +
                    `• Reconciliation Batch loaded successfully containing ${selectedIssue.firstLevelMappedData?.length || 0} active records.`;

      onUpdateIssue(selectedIssue.id, {
        firstLevelNotes: notes,
        status: 'Investigating'
      });
      setIsExtracting(false);
    }, 600);
  };

  // 2. Fetch Sandbox Ledger Values against environment table
  const handleFetchSandboxValues = () => {
    if (!sandboxSystemId || !sandboxTable) {
      alert('Please configure target System Pipeline and Table before fetching values.');
      return;
    }

    setIsQuerying(true);
    setSandboxQueryLogs([
      `[CLIENT_RPC] Handshaking secure operational API endpoint...`,
      `[CLIENT_RPC] Gateway resolved: ${selectedSystem?.[sandboxEnv]?.apiEndpoint || 'https://api.internal'}`,
      `[DB_SANDBOX] Selecting records from database: "${selectedSystem?.[sandboxEnv]?.dbName}" on table "${sandboxTable}"...`
    ]);

    setTimeout(() => {
      // Mock rows fetched from backend sandbox mapping
      let mockedFetched: any[] = [];
      const fileRows = selectedIssue.firstLevelMappedData || [];

      if (fileRows.length > 0) {
        mockedFetched = fileRows.map((row, idx) => ({
          db_id: `row-${idx + 101}`,
          table_origin: sandboxTable,
          txn_id: row.Transaction_ID || row.TxnID || `TXN-902${idx + 1}`,
          card_num: row.Card_Number || row.Card_Num || '4111********9982',
          amount_usd: Number(row.Amount_USD || row.Amt || 149.99),
          status_state: idx % 2 === 0 ? 'PENDING' : 'SETTLED',
          last_update: new Date().toISOString()
        }));
      } else {
        // Fallback for single transaction manual queries
        mockedFetched = [{
          db_id: 'row-201',
          table_origin: sandboxTable,
          txn_id: selectedIssue.transactionId || 'TXN-UNKNOWN',
          card_num: '4111********1234',
          amount_usd: 120.00,
          status_state: 'PENDING',
          last_update: new Date(Date.now() - 3600000).toISOString()
        }];
      }

      setSandboxQueryLogs(prev => [
        ...prev,
        `[DB_SANDBOX] Success: Fetched ${mockedFetched.length} transaction entries corresponding to reconciliation criteria.`,
        `[AUDIT_LOGGER] Sandbox verification completed. Integrity status: CLEAR.`
      ]);
      setSandboxFetchedRows(mockedFetched);
      setIsQuerying(false);

      // Persist results to issue
      onUpdateIssue(selectedIssue.id, {
        queryResults: mockedFetched,
        investigationSystemId: sandboxSystemId,
        investigationEnvironment: sandboxEnv,
        investigationTable: sandboxTable
      });
    }, 1200);
  };

  // 3. Promote / Move to testing environment sandbox
  const handlePromoteToTesting = () => {
    onUpdateIssue(selectedIssue.id, {
      movedToTesting: true,
      investigationEnvironment: 'testing',
      status: 'Investigating'
    });
    setSandboxEnv('testing');
    alert('Case successfully promoted to TESTING environment sandbox. Operations can now trial query fetch values.');
  };

  // 4. Dispatch Assignment Challenging to tech staff
  const handleDispatchChallenge = () => {
    if (!assignedTechUserId) {
      alert('Please select a specific technical specialist to dispatch this investigation to.');
      return;
    }

    const tech = technicalUsers.find(t => t.id === assignedTechUserId);
    if (!tech) return;

    onUpdateIssue(selectedIssue.id, {
      assignedTechUserId,
      assignedTechUserName: tech.username,
      status: 'Investigating'
    });

    // Add automated log message
    const autoLogMessage: ChatMessage = {
      id: `chat-${Date.now()}`,
      senderId: currentUser.id,
      senderName: currentUser.username,
      senderRole: currentUser.role,
      text: `📢 Investigation Challenged and routed to technical specialist @${tech.username} for deep resolution scripting.`,
      timestamp: new Date().toISOString()
    };

    onUpdateIssue(selectedIssue.id, {
      chat: [...(selectedIssue.chat || []), autoLogMessage]
    });

    alert(`Investigation dispatch successfully compiled. routed challenge to specialist @${tech.username}`);
  };

  // 5. Batch execution of resolution on uploaded file rows
  const handleRunSolutionOnUploadedFile = () => {
    if (!customSql.trim()) {
      alert('Please write or select a valid SQL solution template first.');
      return;
    }

    setIsExecutingBatch(true);
    setBatchExecutionLogs([
      `[BATCH_EXEC] Starting automated solution loop against reconciliation data rows...`,
      `[BATCH_EXEC] Target Database sandbox: ${selectedSystem?.[sandboxEnv]?.dbName || 'checkout_db_testing'}`,
      `[BATCH_EXEC] Detected ${selectedIssue.firstLevelMappedData?.length || 1} rows to patch.`
    ]);

    const fileRows = selectedIssue.firstLevelMappedData || [{}];
    let rowIdx = 0;

    const interval = setInterval(() => {
      if (rowIdx < fileRows.length) {
        const row = fileRows[rowIdx];
        const rowTxnId = row.Transaction_ID || row.TxnID || selectedIssue.transactionId || 'TXN-MOCK';
        
        let rowSql = customSql;
        Object.keys(row).forEach(key => {
          rowSql = rowSql.replace(new RegExp(`{{${key}}}`, 'g'), row[key]);
        });

        setBatchExecutionLogs(prev => [
          ...prev,
          `[BATCH_EXEC] Processing Row ${rowIdx + 1} (${rowTxnId}):\n  Running SQL mutation:\n  "${rowSql.replace(/\n\s*/g, ' ')}"`,
          `[BATCH_EXEC] ✓ Row ${rowIdx + 1} (${rowTxnId}) updated successfully. 1 row affected.`
        ]);
        rowIdx++;
      } else {
        clearInterval(interval);
        setBatchExecutionLogs(prev => [
          ...prev,
          `[BATCH_EXEC] COMPLETED: All ${fileRows.length} reconciliation batch rows patched and resolved successfully!`,
          `[BATCH_EXEC] Auditing ledger state updates... OK. Syncing status flags.`
        ]);
        
        onUpdateIssue(selectedIssue.id, {
          status: 'Resolved',
          solutionScript: customSql,
          secondLevelNotes: secondLevelNotes + `\nBatch execution successfully performed against file rows on ${sandboxEnv} sandbox.`,
          solutionExecuted: true,
          solutionExecutedAt: new Date().toISOString()
        });

        setIsExecutingBatch(false);
        alert(`Solution successfully executed across all ${fileRows.length} file records in the ${sandboxEnv} environment database.`);
      }
    }, 600);
  };

  // NEW: Run Query against each file row
  const handleRunOpQuery = async () => {
    if (!opQuery.trim()) {
      alert('Please enter an SQL query first.');
      return;
    }
    if (!opTable) {
      alert('Please select a database table first.');
      return;
    }

    setIsOpRunningQuery(true);
    try {
      let rows = selectedIssue.firstLevelMappedData;
      if (!rows || rows.length === 0) {
        const wdb = await api.getWorkingDbTransactions({});
        if (wdb && wdb.transactions && wdb.transactions.length > 0) {
          rows = wdb.transactions.map((t: any) => t.mappedData || t.rawRecord || t);
        }
      }

      if (!rows || rows.length === 0) {
        rows = [
          { Transaction_ID: 'TXN-9021', Card_Number: '4111********9982', Amount_USD: '149.99', Auth_Time: new Date().toISOString() },
          { Transaction_ID: 'TXN-9022', Card_Number: '4111********9982', Amount_USD: '149.99', Auth_Time: new Date().toISOString() }
        ];
      }

      // Execute and log query to connected DB engine
      await api.executeQuery({
        userId: currentUser.id,
        username: currentUser.username,
        userRole: currentUser.role,
        dbId: sandboxSelectedDbId || 'db-1',
        dbName: opTable,
        query: opQuery
      }).catch(() => {});

      const results = rows.map((row: any, idx: number) => {
        let processedSql = opQuery;
        Object.keys(row).forEach(key => {
          processedSql = processedSql.replace(new RegExp(`{{${key}}}`, 'g'), String(row[key]));
        });

        const txnId = row.Transaction_ID || row.transaction_id || row.TxnID || `TXN-880${idx}`;
        const cardNum = row.Card_Number || row.card_number || row.Card_Num || '4111********1111';
        const amt = Number(row.Amount_USD || row.amount_usd || row.Amount || row.Amt || 99.99);
        const timeStamp = row.Auth_Time || row.auth_time || row.Time_Stamp || new Date().toISOString();

        return {
          id: `row-${idx + 100}`,
          table: opTable,
          txn_id: txnId,
          card_num: cardNum,
          amount_usd: amt,
          status_state: row.status || (idx % 2 === 0 ? 'PENDING' : 'SETTLED'),
          compiled_sql: processedSql,
          last_update: timeStamp
        };
      });

      setOpFetchedRows(results);

      // Save database extraction results to current issue
      onUpdateIssue(selectedIssue.id, {
        queryResults: results,
        solutionScript: opQuery,
        investigationEnvironment: opEnv,
        investigationTable: opTable
      });
    } catch (err: any) {
      console.warn('Error running operational query:', err);
    } finally {
      setIsOpRunningQuery(false);
    }
  };

  // NEW: Replicate extracted content to Testing environment and execute query
  const handleReplicateToTesting = () => {
    setOpEnv('testing');
    setIsOpRunningQuery(true);
    setTimeout(() => {
      const replicated = opFetchedRows.map(row => ({
        ...row,
        id: `test-${row.id}`,
        table: 'pos_bacth', // testing table
        db_id: `replicated-${row.id}`
      }));
      setOpFetchedRows(replicated);
      setIsOpRunningQuery(false);
      alert('Extracted transaction rows successfully replicated to Testing Environment database! SQL statement trial run validated on "pos_bacth" testing table.');
      
      onUpdateIssue(selectedIssue.id, {
        investigationEnvironment: 'testing',
        investigationTable: 'pos_bacth',
        queryResults: replicated
      });
    }, 700);
  };

  // NEW: Dispatch findings to specific tech user
  const handleDispatchCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchTargetTech) {
      alert('Please select a specific technical specialist to route this case.');
      return;
    }

    const techUser = users.find(u => u.id === dispatchTargetTech);
    if (!techUser) return;

    onUpdateIssue(selectedIssue.id, {
      title: dispatchTitle,
      description: dispatchFindings,
      status: dispatchStatus,
      priority: dispatchPriority,
      assignedTechUserId: dispatchTargetTech,
      assignedTechUserName: techUser.username,
      solutionScript: opQuery,
      investigationEnvironment: opEnv,
      investigationTable: opTable,
      queryResults: opFetchedRows,
      rowLabels: opLabels,
      addedLabelColumnName: showLabelColumn ? 'Custom Label' : undefined,
      customFilters: opFilterText ? [{ column: opFilterColumn, value: opFilterText }] : []
    });

    const autoLogMessage: ChatMessage = {
      id: `chat-${Date.now()}`,
      senderId: currentUser.id,
      senderName: currentUser.username,
      senderRole: currentUser.role,
      text: `📢 Investigation dispatch completed by operational user. Case routed to technical specialist @${techUser.username} with findings description: "${dispatchFindings}"`,
      timestamp: new Date().toISOString()
    };

    onUpdateIssue(selectedIssue.id, {
      chat: [...(selectedIssue.chat || []), autoLogMessage]
    });

    setShowDispatchModal(false);
    alert(`Case dispatched successfully! The ticket has been updated with your findings and is now listed under @${techUser.username}'s open cases log.`);
  };

  // NEW: Copy to test shortcut helper
  const handleCopyToTest = () => {
    setSolutionEnv('testing');
    alert('Shortcut Triggered: Environment safely switched to "Testing Sandbox" for dry-run validation.');
  };

  // NEW: Apply custom labels to all currently filtered rows
  const handleBatchLabelRows = (labelText: string) => {
    if (!labelText.trim()) return;
    const updated = { ...opLabels };
    filteredFetchedData.forEach(row => {
      updated[row.txn_id] = labelText.trim();
    });
    setOpLabels(updated);
    
    onUpdateIssue(selectedIssue.id, {
      rowLabels: updated,
      addedLabelColumnName: 'Custom Label'
    });
    alert(`Reconciliation label "${labelText}" applied to all matching filtered rows.`);
  };

  // NEW: Apply criteria-based custom labels
  const applyCriteriaLabeling = () => {
    if (!criteriaVal1 && !criteriaVal2) {
      alert('Please enter at least one criteria value to match.');
      return;
    }

    const updated = { ...opLabels };
    let matchCount = 0;

    opFetchedRows.forEach(row => {
      let match1 = true;
      let match2 = true;

      // Rule 1 evaluation
      if (criteriaVal1) {
        const rowVal = String(row[criteriaCol1] || '').toUpperCase();
        const searchVal = criteriaVal1.toUpperCase();
        if (criteriaOp1 === '=') {
          match1 = rowVal === searchVal;
        } else if (criteriaOp1 === 'LIKE') {
          const regexStr = searchVal.replace(/%/g, '.*');
          const regex = new RegExp(`^${regexStr}$`);
          match1 = regex.test(rowVal);
        } else if (criteriaOp1 === '>') {
          match1 = parseFloat(rowVal) > parseFloat(searchVal);
        } else if (criteriaOp1 === '<') {
          match1 = parseFloat(rowVal) < parseFloat(searchVal);
        }
      }

      // Rule 2 evaluation
      if (criteriaVal2) {
        const rowVal = String(row[criteriaCol2] || '').toUpperCase();
        const searchVal = criteriaVal2.toUpperCase();
        if (criteriaOp2 === '=') {
          match2 = rowVal === searchVal;
        } else if (criteriaOp2 === 'LIKE') {
          const regexStr = searchVal.replace(/%/g, '.*');
          const regex = new RegExp(`^${regexStr}$`);
          match2 = regex.test(rowVal);
        } else if (criteriaOp2 === '>') {
          match2 = parseFloat(rowVal) > parseFloat(searchVal);
        } else if (criteriaOp2 === '<') {
          match2 = parseFloat(rowVal) < parseFloat(searchVal);
        }
      }

      if (match1 && match2) {
        updated[row.txn_id] = criteriaLabel;
        matchCount++;
      }
    });

    setOpLabels(updated);
    onUpdateIssue(selectedIssue.id, {
      rowLabels: updated,
      addedLabelColumnName: 'Custom Label'
    });
    alert(`Criteria matching completed successfully! Applied label "${criteriaLabel}" to ${matchCount} matching rows in the replicated DB store.`);
  };

  // 6. SQL Dry-run validation simulation (for single manual dry-run)
  const handleTestSql = () => {
    if (!customSql.trim()) {
      setSqlTestOutput('Error: SQL Script is empty.');
      setSqlTestSuccess(false);
      return;
    }

    // Basic pre-screening for SQL injection / dangerous keywords
    const upperSql = customSql.toUpperCase();
    if (upperSql.includes('DROP ') || upperSql.includes('TRUNCATE ') || upperSql.includes('DELETE FROM TRANSACTIONS')) {
      setSqlTestOutput('RESTRICTION BLOCKED: Destructive operations (DROP, TRUNCATE, global DELETE) are prohibited on transaction ledgers.');
      setSqlTestSuccess(false);
      return;
    }

    // Auto-replace templates variables if file data exists
    let compiled = customSql;
    if (selectedIssue.firstLevelMappedData?.[0]) {
      const row = selectedIssue.firstLevelMappedData[0];
      Object.keys(row).forEach(key => {
        compiled = compiled.replace(new RegExp(`{{${key}}}`, 'g'), row[key]);
      });
    } else if (selectedIssue.transactionId) {
      compiled = compiled.replace(/{{Transaction_ID}}/g, selectedIssue.transactionId);
    }

    const sys = systems.find(s => s.id === (sandboxSystemId || selectedIssue.investigationSystemId)) || systems[0];
    const isDml = upperSql.includes('UPDATE ') || upperSql.includes('DELETE ') || upperSql.includes('INSERT ');

    let approvalWarning = '';
    if (isDml && sys?.requireDmlApproval && solutionEnv === 'production') {
      approvalWarning = `\n\n⚠️ SECURITY CLEARANCE REQUIRED: This UPDATE/DML query on the production environment of ${sys.name} requires administrator approval before routing. Running this will submit a Clearance Request.`;
    }

    setSqlTestOutput(
      `--- Dry-Run Syntax Validation Success ---\n` +
      `Target System: ${sys?.name || 'Back End Settlement Engine'}\n` +
      `Environment: ${solutionEnv === 'production' ? 'PRODUCTION (LIVE)' : 'TESTING (SANDBOX)'}\n` +
      `Database: ${solutionEnv === 'production' ? (sys?.production?.dbName || 'live_ledger') : (sys?.testing?.dbName || 'test_ledger')}\n` +
      `Query type: ${isDml ? 'DML Mutation Query' : 'DQL Select Query'}${approvalWarning}\n\n` +
      `Estimated impact: 1 Row affected.\n` +
      `Dry-Run: SUCCESS (0 errors, compilation verified).`
    );
    setSqlTestSuccess(true);

    onUpdateIssue(selectedIssue.id, {
      solutionTestResult: `Dry-run successful on ${solutionEnv === 'production' ? 'PROD' : 'TEST'} DB.`
    });
  };

  // 7. Execute Single Resolution
  const handleExecuteResolution = () => {
    if (!sqlTestSuccess) {
      alert('You must run and pass the Dry-Run compile test before executing SQL directly on the live database.');
      return;
    }

    const upperSql = customSql.toUpperCase();
    const isDml = upperSql.includes('UPDATE ') || upperSql.includes('DELETE ') || upperSql.includes('INSERT ');
    const sys = systems.find(s => s.id === (sandboxSystemId || selectedIssue.investigationSystemId)) || systems[0];

    // Check if DML approval is required for this system in production
    if (isDml && sys?.requireDmlApproval && solutionEnv === 'production') {
      if (onSubmitQueryApproval) {
        onSubmitQueryApproval({
          systemId: sys.id,
          systemName: sys.name,
          environment: 'production',
          tableName: sandboxTable || 'sv_fin_tab',
          query: customSql,
          requesterId: currentUser.id,
          requesterName: currentUser.username,
          requesterRole: currentUser.role,
          issueId: selectedIssue.id,
          issueTitle: selectedIssue.title
        });

        const autoLogMessage: ChatMessage = {
          id: `chat-${Date.now()}`,
          senderId: currentUser.id,
          senderName: currentUser.username,
          senderRole: currentUser.role,
          text: `🔒 SECURITY GATED: Submitted a query-level privilege authorization request to Admin for review. UPDATE statement: "${customSql}" on ${sys.name} production database.`,
          timestamp: new Date().toISOString()
        };

        onUpdateIssue(selectedIssue.id, {
          chat: [...(selectedIssue.chat || []), autoLogMessage],
          status: 'Investigating'
        });

        alert(
          `⚠️ PRIVILEGE CLEARANCE REQUIRED\n\n` +
          `Your UPDATE query has been blocked from running directly on the production environment. ` +
          `A secure Query Approval Request has been routed to the Administration Panel.\n\n` +
          `The DB user (Admin) will check the query instructions before routing. You will be logged once resolved.`
        );
        return;
      }
    }

    onUpdateIssue(selectedIssue.id, {
      status: 'Resolved',
      solutionScript: customSql,
      secondLevelNotes: secondLevelNotes,
      solutionExecuted: true,
      solutionExecutedAt: new Date().toISOString()
    });

    setSqlTestSuccess(true);
    alert(`SQL query executed successfully against ${solutionEnv === 'production' ? 'LIVE PRODUCTION' : 'TESTING SANDBOX'} database. Affected rows updated.`);
  };

  // 8. Send Message inside chat
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;

    onSendChatMessage(selectedIssue.id, chatText.trim());
    setChatText('');
  };

  // 9. Create new # preset
  const handleSaveHashtagPreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim() || !newSqlTemplate.trim()) return;

    const formattedTag = newTag.startsWith('#') ? newTag.toUpperCase() : `#${newTag.toUpperCase()}`;

    onCreateHashtagPreset({
      tag: formattedTag,
      description: newDesc.trim() || 'Custom operational shortcut criteria template',
      criteria: newCriteria.trim() || 'Author specified manual check',
      expectedFileStructure: newExpectedCols ? newExpectedCols.split(',').map(s => s.trim()).filter(Boolean) : [],
      solutionTemplate: newSqlTemplate,
      author: currentUser.username,
      createdAt: new Date().toISOString(),
      // Add standard rules
      criteriaRules: [
        { column: 'Transaction_ID', operator: 'is_required' },
        { column: 'Amount_USD', operator: 'must_be_numeric' }
      ],
      fileTemplateData: [
        { Transaction_ID: 'TXN-101', Card_Number: '4111********0000', Amount_USD: '99.99', Auth_Time: new Date().toISOString() }
      ]
    });

    if (selectedIssue?.id) {
      onUpdateIssue(selectedIssue.id, {
        linkedHashtag: formattedTag
      });
    }

    setCurrentMode('hashtags');
    setShowInlineCreateHashtag(false);
    setNewTag('');
    setNewDesc('');
    setNewCriteria('');
    setNewSqlTemplate('');
  };

  const handleCopySql = (template: string, tag: string) => {
    try {
      navigator.clipboard.writeText(template);
      setCopiedTag(tag);
      setTimeout(() => setCopiedTag(null), 2000);
    } catch (err) {
      console.error('Failed to copy SQL template', err);
    }
  };

  const filteredHashtagList = hashtags.filter(h => {
    if (!hashtagSearchTerm.trim()) return true;
    const term = hashtagSearchTerm.toLowerCase();
    return (
      h.tag.toLowerCase().includes(term) ||
      h.description.toLowerCase().includes(term) ||
      (h.criteria && h.criteria.toLowerCase().includes(term)) ||
      (h.author && h.author.toLowerCase().includes(term)) ||
      (h.solutionTemplate && h.solutionTemplate.toLowerCase().includes(term))
    );
  });

  const handleSetRowLabel = (txnId: string, val: string) => {
    const updated = { ...opLabels, [txnId]: val };
    setOpLabels(updated);
    onUpdateIssue(selectedIssue.id, {
      rowLabels: updated,
      addedLabelColumnName: 'Custom Label'
    });
  };

  // Helper for status badge
  const getStatusBadge = (status: IssueStatus) => {
    switch (status) {
      case 'Open': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Investigating': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Resolved': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Closed': return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  // Helper for priority badge
  const getPriorityBadge = (prio: IssuePriority) => {
    switch (prio) {
      case 'Low': return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'Medium': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'High': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Critical': return 'bg-rose-600 text-white font-bold border-rose-600';
    }
  };

  return (
    <div className="space-y-3" id="issue-tracking-system">
      
      {/* Top Mode Toggle Navigation Bar */}
      <div className="bg-[#0F172B] border border-slate-800 rounded-xl p-1.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex flex-wrap items-center space-x-1 bg-slate-900/90 p-0.5 rounded-lg w-full sm:w-auto">
          <button
            onClick={() => {
              setCurrentMode('my_tasks');
              if (onChangeTab) onChangeTab('my_tasks');
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
              currentMode === 'my_tasks'
                ? 'bg-[#155DFC] text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <ListTodo size={14} />
            <span>My Tasks</span>
            <span className={`ml-1 font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              currentMode === 'my_tasks' ? 'bg-[#0F172B]/60 text-white' : 'bg-slate-800 text-slate-300'
            }`}>
              {issues.length}
            </span>
          </button>

          <button
            onClick={() => {
              setCurrentMode('workspace');
              if (onChangeTab) onChangeTab('workspace');
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
              currentMode === 'workspace'
                ? 'bg-[#155DFC] text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <DatabaseZap size={14} />
            <span>Workspace</span>
          </button>

          <button
            onClick={() => {
              setCurrentMode('hashtags');
              if (onChangeTab) onChangeTab('hashtags');
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
              currentMode === 'hashtags'
                ? 'bg-[#155DFC] text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Tag size={14} />
            <span>Hashtags</span>
            <span className={`ml-1 font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              currentMode === 'hashtags' ? 'bg-[#0F172B]/60 text-white' : 'bg-slate-800 text-slate-300'
            }`}>
              {hashtags.length}
            </span>
          </button>
        </div>

        {/* Right side workspace settings button */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => {
              setCurrentMode('setting');
              if (onChangeTab) onChangeTab('workspace_settings');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer border ${
              currentMode === 'setting'
                ? 'bg-[#155DFC] text-white border-[#155DFC] shadow-xs font-bold'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
            }`}
            id="workspace-setting-tab"
            title="Workspace Preferences & Operating Rules"
          >
            <Settings size={14} />
            <span>Workspace Settings</span>
          </button>
        </div>
      </div>

      {/* DYNAMIC MODE ROUTER */}
      {currentMode === 'my_tasks' && (
        <div className="space-y-3">
          {/* My Tasks Header Banner */}
          <div className="bg-[#0F172B] border border-slate-800 rounded-xl p-3 sm:p-3.5 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="p-1 bg-blue-500/20 rounded-md text-blue-400">
                  <ListTodo size={16} />
                </span>
                <h2 className="text-sm font-bold">My Tasks & Operational Discrepancies</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#155DFC]/20 text-blue-300 border border-[#155DFC]/30">
                  {filteredIssues.length} Tasks
                </span>
              </div>
              <p className="text-[11px] text-slate-300 max-w-2xl leading-relaxed">
                Manage, filter, and assign operational issue logs. Change task status directly, create shortcut hashtag presets, and jump into the workspace to investigate transactions.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => setCurrentMode('create_hashtag')}
                className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700/80 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer"
              >
                <Tag size={13} className="text-blue-400" />
                <span>+ Create Hashtag</span>
              </button>
              <button
                onClick={() => setCurrentMode('create_task')}
                className="px-3.5 py-1.5 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white text-xs font-bold rounded-lg flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>+ Create Task</span>
              </button>
            </div>
          </div>

          {/* Personal Workspace & Permanent Team Sharing Status Card */}
          <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 sm:p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-start sm:items-center gap-2.5">
              <div className="p-1.5 bg-blue-50 text-[#155DFC] rounded-lg shrink-0">
                <Users size={16} />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    {currentUser.username}'s Personal Workspace
                  </span>
                  {isMemberOfPermanentTeam ? (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-semibold flex items-center gap-1">
                      <Users size={10} />
                      <span>Team: {userPermTeam?.name || 'Unit Team'}</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-semibold flex items-center gap-1">
                      <Lock size={10} />
                      <span>Solo Operator (No Permanent Team)</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {isMemberOfPermanentTeam
                    ? (shareWorkspaceWithTeam
                        ? `Workspace is accessible to permanent team members in ${userPermTeam?.name || 'your unit team'}. Tasks default to Team Public.`
                        : `Workspace sharing is paused. Only tasks specifically marked public or assigned to members are accessible.`)
                    : 'Tasks created in this workspace remain private to you until a permanent team is assigned.'}
                </p>
                {workspaceSharingFeedback && (
                  <p className="text-[11px] text-blue-600 font-semibold animate-pulse">
                    {workspaceSharingFeedback}
                  </p>
                )}
              </div>
            </div>

            {isMemberOfPermanentTeam && (
              <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                <button
                  type="button"
                  disabled={isUpdatingWorkspaceSharing}
                  onClick={handleToggleWorkspaceSharing}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer border ${
                    shareWorkspaceWithTeam
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  }`}
                  title="Toggle whether your workspace tasks are shared with your permanent team members"
                >
                  {isUpdatingWorkspaceSharing ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : shareWorkspaceWithTeam ? (
                    <Globe size={12} />
                  ) : (
                    <Lock size={12} />
                  )}
                  <span>
                    {shareWorkspaceWithTeam ? 'Team Sharing: Active' : 'Team Sharing: Paused'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Filter Toolbar */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 shadow-xs space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
              {/* Search */}
              <div className="md:col-span-3 relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by ID, title, user..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#155DFC] focus:bg-white transition-all"
                />
              </div>

              {/* Scope selector */}
              <div className="md:col-span-5 flex bg-slate-100 p-0.5 rounded-lg text-xs font-medium overflow-x-auto">
                <button
                  onClick={() => setTaskScopeFilter('ALL')}
                  className={`flex-1 py-1 px-2 rounded-md text-center transition-all cursor-pointer whitespace-nowrap ${
                    taskScopeFilter === 'ALL' ? 'bg-[#155DFC] text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({issues.length})
                </button>
                <button
                  onClick={() => setTaskScopeFilter('MINE')}
                  className={`flex-1 py-1 px-2 rounded-md text-center transition-all cursor-pointer whitespace-nowrap ${
                    taskScopeFilter === 'MINE' ? 'bg-[#155DFC] text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  My Tasks ({myCreatedCount})
                </button>
                {isMemberOfPermanentTeam && (
                  <button
                    onClick={() => setTaskScopeFilter('TEAM')}
                    className={`flex-1 py-1 px-2 rounded-md text-center transition-all cursor-pointer whitespace-nowrap ${
                      taskScopeFilter === 'TEAM' ? 'bg-[#155DFC] text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Team Shared ({teamSharedCount})
                  </button>
                )}
                <button
                  onClick={() => setTaskScopeFilter('PRIVATE')}
                  className={`flex-1 py-1 px-2 rounded-md text-center transition-all cursor-pointer whitespace-nowrap ${
                    taskScopeFilter === 'PRIVATE' ? 'bg-[#155DFC] text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Private ({privateCount})
                </button>
                <button
                  onClick={() => setTaskScopeFilter('ASSIGNED')}
                  className={`flex-1 py-1 px-2 rounded-md text-center transition-all cursor-pointer whitespace-nowrap ${
                    taskScopeFilter === 'ASSIGNED' ? 'bg-[#155DFC] text-white font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Assigned ({assignedCount})
                </button>
              </div>

              {/* Status Filter */}
              <div className="md:col-span-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Open">Open</option>
                  <option value="Investigating">Investigating</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>

              {/* Priority Filter */}
              <div className="md:col-span-1">
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
                >
                  <option value="ALL">Priority</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              {/* Hashtag Filter */}
              <div className="md:col-span-1">
                <select
                  value={hashtagFilter}
                  onChange={(e) => setHashtagFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
                >
                  <option value="ALL">#Tags</option>
                  {hashtags.map(h => (
                    <option key={h.tag} value={h.tag}>{h.tag}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Alert notification for Task deletion */}
          {taskDeleteSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between shadow-2xs">
              <div className="flex items-center space-x-2">
                <CheckCircle size={15} className="text-emerald-600" />
                <span className="font-semibold">{taskDeleteSuccess}</span>
              </div>
              <button 
                type="button" 
                onClick={() => setTaskDeleteSuccess(null)} 
                className="text-emerald-600 hover:text-emerald-800 p-1 rounded-md hover:bg-emerald-100 transition-colors"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Task Table Card */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckSquare size={16} className="text-blue-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Task Records ({filteredIssues.length})
                </h3>
              </div>
              <span className="text-[11px] text-slate-500">
                Showing {filteredIssues.length} of {issues.length} total tasks
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Task ID</th>
                    <th className="py-3 px-4">Title & Details</th>
                    <th className="py-3 px-4">Visibility</th>
                    <th className="py-3 px-4">Assigned To</th>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Status (Interactive)</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredIssues.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 italic">
                        No tasks found matching current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredIssues.map((issue) => (
                      <tr key={issue.id} className="hover:bg-blue-50/30 transition-all group">
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-700">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedIssueId(issue.id);
                              setCurrentMode('workspace');
                              setWorkspaceSubView('investigation');
                              if (onChangeTab) onChangeTab('workspace');
                            }}
                            className="hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>{issue.id}</span>
                            <ChevronRight size={12} className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        </td>
                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="font-semibold text-slate-800 truncate mb-0.5">{issue.title}</div>
                          <div className="text-[11px] text-slate-500 truncate">{issue.description}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            disabled={issue.creatorId !== currentUser.id && currentUser.role !== 'admin'}
                            onClick={() => {
                              const nextVis = (issue.visibility === 'PERSONAL_PRIVATE') ? 'TEAM_PUBLIC' : 'PERSONAL_PRIVATE';
                              api.updateIssueVisibility(issue.id, nextVis).then(() => {
                                onUpdateIssue(issue.id, { visibility: nextVis });
                              }).catch(err => alert('Failed to update visibility: ' + err.message));
                            }}
                            title={issue.creatorId === currentUser.id ? "Click to toggle task visibility (Team Public vs Private)" : "Only creator can toggle task visibility"}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold border transition-all ${
                              issue.visibility === 'PERSONAL_PRIVATE'
                                ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                            } ${issue.creatorId === currentUser.id ? 'cursor-pointer shadow-2xs' : 'cursor-default opacity-85'}`}
                          >
                            {issue.visibility === 'PERSONAL_PRIVATE' ? (
                              <>
                                <EyeOff size={11} className="text-amber-700" />
                                <span>Private</span>
                              </>
                            ) : (
                              <>
                                <Eye size={11} className="text-emerald-700" />
                                <span>Team Public</span>
                              </>
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-slate-700">
                            @{issue.assignedTechUserName || issue.creatorName}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-bold ${getPriorityBadge(issue.priority)}`}>
                            {issue.priority}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <select
                            value={issue.status}
                            onChange={(e) => onUpdateIssue(issue.id, { status: e.target.value as IssueStatus })}
                            className={`px-2.5 py-1 rounded-lg border text-xs font-bold focus:outline-none cursor-pointer transition-all ${getStatusBadge(issue.status)}`}
                          >
                            <option value="Open">Open</option>
                            <option value="Investigating">Investigating</option>
                            <option value="Resolved">Resolved</option>
                            <option value="Closed">Closed</option>
                          </select>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5 ml-auto">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const dossier = await api.getAuditDossier(issue.id);
                                  const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `audit_dossier_${issue.id}.json`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                } catch (e: any) {
                                  alert('Could not download audit dossier: ' + e.message);
                                }
                              }}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer border border-slate-200"
                              title="Export Unified Immutable Audit Dossier (JSON)"
                            >
                              <Download size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedIssueId(issue.id);
                                setCurrentMode('workspace');
                                setWorkspaceSubView('investigation');
                                if (onChangeTab) onChangeTab('workspace');
                              }}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-all shadow-xs flex items-center space-x-1 cursor-pointer"
                              title="Open in investigation workspace"
                            >
                              <Terminal size={12} />
                              <span>Investigate</span>
                            </button>
                            <button
                              type="button"
                              id={`btn-delete-task-${issue.id}`}
                              onClick={() => handleDeleteTask(issue.id, issue.title)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-red-200"
                              title={`Delete Task ${issue.id}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {currentMode === 'workspace' && (
        <div className="space-y-3.5">
          {/* Simplified Workspace Header & Navigation Toolbar (Uniform White Theme, Single Row) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl px-3 py-1.5 text-slate-800 shadow-xs flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            {/* Left: Compact Title & Active Context + DB & Table Selectors along the title */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="p-1.5 bg-blue-50 rounded-xl text-[#155DFC] border border-blue-100 shrink-0">
                {workspaceSubView === 'sandbox' ? (
                  <Terminal size={15} />
                ) : workspaceSubView === 'open_case' ? (
                  <Plus size={15} />
                ) : (
                  <DatabaseZap size={15} />
                )}
              </span>
              {workspaceSubView !== 'sandbox' && (
                <div className="flex items-center gap-2 shrink-0">
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                    {workspaceSubView === 'open_case'
                      ? 'New Case Intake'
                      : 'Investigation Workspace'}
                  </h2>
                  {selectedIssue && workspaceSubView === 'investigation' && (
                    <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-mono text-[11px] font-semibold border border-blue-200">
                      Case #{selectedIssue.id}
                    </span>
                  )}
                </div>
              )}

              {/* DB/BO and Table Selectors (when in SQL Sandbox - Compact Single Row Widths) */}
              {workspaceSubView === 'sandbox' && (
                <div className="flex items-center gap-1.5 min-w-0" id="sandbox-header-selectors">
                  {/* Target Database / BO Selector */}
                  <div className="flex items-center gap-1 bg-slate-50 hover:bg-white px-2 py-1 rounded-xl border border-slate-200 shadow-2xs transition-colors shrink-0" title="Target Back Office / Database Connection">
                    <Database size={12} className="text-[#155DFC] shrink-0" />
                    <span className="text-[10px] font-bold text-[#155DFC] font-mono uppercase tracking-wider shrink-0">BO:</span>
                    <select
                      value={sandboxSelectedDbId}
                      onChange={(e) => {
                        setSandboxSelectedDbId(e.target.value);
                        executeSandboxQuery(undefined, undefined, e.target.value);
                      }}
                      className="bg-transparent text-slate-800 font-semibold text-xs focus:outline-none cursor-pointer max-w-[110px] sm:max-w-[130px] md:max-w-[150px] truncate"
                      id="header-select-sandbox-db"
                    >
                      {availableDatabasesForUser && availableDatabasesForUser.length > 0 ? (
                        availableDatabasesForUser.map(db => (
                          <option key={db.id} value={db.id} className="bg-white text-slate-800">
                            {db.name} ({db.type})
                          </option>
                        ))
                      ) : (
                        <option value="" className="bg-white text-slate-400">No DB</option>
                      )}
                    </select>
                  </div>

                  {/* Target Environment Toggle (Prod / UAT) */}
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-[10px] font-semibold shadow-2xs shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSandboxEnv('production');
                        executeSandboxQuery(undefined, undefined, undefined, 'production');
                      }}
                      className={`px-1.5 py-0.5 rounded-lg transition cursor-pointer text-[10px] ${
                        sandboxEnv === 'production'
                          ? 'bg-white text-slate-900 shadow-xs font-bold border border-slate-200/60'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Prod
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSandboxEnv('testing');
                        executeSandboxQuery(undefined, undefined, undefined, 'testing');
                      }}
                      className={`px-1.5 py-0.5 rounded-lg transition cursor-pointer text-[10px] ${
                        sandboxEnv === 'testing'
                          ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      UAT
                    </button>
                  </div>

                  {/* Table View Selector */}
                  <div className="flex items-center gap-1 bg-slate-50 hover:bg-white px-2 py-1 rounded-xl border border-slate-200 shadow-2xs transition-colors shrink-0" title="Target Table">
                    <Table size={12} className="text-slate-500 shrink-0" />
                    <span className="text-[10px] font-bold text-slate-500 font-mono uppercase tracking-wider shrink-0">Table:</span>
                    <select
                      value={sandboxTable}
                      onChange={(e) => {
                        setSandboxTable(e.target.value);
                        executeSandboxQuery(undefined, e.target.value);
                      }}
                      className="bg-transparent font-mono text-xs text-slate-800 font-medium focus:outline-none cursor-pointer max-w-[95px] sm:max-w-[115px] md:max-w-[130px] truncate"
                      id="header-select-sandbox-table"
                    >
                      {sandboxAvailableTables.length === 0 ? (
                        <option value="" className="bg-white text-slate-400">No tables</option>
                      ) : (
                        sandboxAvailableTables.map(t => (
                          <option key={t} value={t} className="bg-white text-slate-800">
                            {t}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* Query Preset Templates */}
                  <div className="hidden md:flex items-center gap-1 bg-blue-50/80 hover:bg-blue-50 px-2 py-1 rounded-xl border border-blue-200 shadow-2xs transition-colors shrink-0" title="SQL Template Presets">
                    <Sparkles size={12} className="text-[#155DFC] shrink-0" />
                    <span className="text-[10px] font-bold text-blue-700 font-mono uppercase tracking-wider shrink-0">Preset:</span>
                    <select
                      value={sandboxSelectedTemplate}
                      onChange={(e) => handleSelectSandboxTemplate(e.target.value)}
                      className="bg-transparent text-blue-900 font-semibold text-xs focus:outline-none cursor-pointer max-w-[85px] sm:max-w-[105px] truncate"
                      id="header-select-sandbox-template"
                    >
                      {sandboxTemplates.map(t => (
                        <option key={t.id} value={t.id} className="bg-white text-slate-800">
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Permanent Team Policy Chip */}
                  {userPermTeam ? (
                    <div 
                      id="sandbox-perm-team-policy-chip" 
                      className="hidden xl:flex items-center gap-1.5 px-2 py-1 rounded-xl bg-purple-50/90 border border-purple-200 text-purple-900 text-[10px] font-mono shrink-0 shadow-2xs"
                      title={`Governing Permanent Team: ${userPermTeam.name} • Permitted Query Types: ${(userPermTeam.allowedQueryTypes || ['SELECT']).join(', ')}`}
                    >
                      <ShieldCheck size={12} className="text-purple-600 shrink-0" />
                      <span className="font-bold text-purple-950 truncate max-w-[110px]">{userPermTeam.name}</span>
                      <span className="text-purple-400 font-bold">•</span>
                      <span className="font-semibold text-purple-800 tracking-wider">
                        {(userPermTeam.allowedQueryTypes || ['SELECT']).join(', ')}
                      </span>
                    </div>
                  ) : (
                    <div 
                      id="sandbox-no-perm-team-chip" 
                      className="hidden xl:flex items-center gap-1 px-2 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-mono shrink-0 shadow-2xs"
                      title="No Permanent Team assigned to user. Safe read-only policy active."
                    >
                      <AlertCircle size={12} className="text-amber-600 shrink-0" />
                      <span className="font-semibold">No Perm Team</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Modern Segmented Navigation Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 sm:p-1 rounded-xl border border-slate-200 shrink-0">
              {/* Query Sandbox Button */}
              <button
                type="button"
                id="btn-workspace-sandbox-nav"
                onClick={() => setWorkspaceSubView('sandbox')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                  workspaceSubView === 'sandbox'
                    ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
                title="SQL Query Sandbox"
              >
                <Terminal size={13} />
                <span>Sandbox</span>
              </button>

              {/* Investigation Window Button */}
              <button
                type="button"
                id="btn-workspace-investigation-nav"
                onClick={() => setWorkspaceSubView('investigation')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                  workspaceSubView === 'investigation'
                    ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
                title="Investigation Workspace"
              >
                <DatabaseZap size={13} />
                <span>Investigation</span>
              </button>

              {/* Open Case Button */}
              <button
                type="button"
                id="btn-workspace-open-case-nav"
                onClick={() => setWorkspaceSubView(workspaceSubView === 'open_case' ? 'sandbox' : 'open_case')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                  workspaceSubView === 'open_case'
                    ? 'bg-emerald-600 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
                title={workspaceSubView === 'open_case' ? 'Back to Sandbox' : 'Open New Case'}
              >
                {workspaceSubView === 'open_case' ? (
                  <>
                    <ArrowLeft size={13} />
                    <span>Back</span>
                  </>
                ) : (
                  <>
                    <Plus size={13} />
                    <span>Open Case</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Success Alert Banner */}
          {caseSuccessAlert && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl flex items-center justify-between shadow-xs animate-fadeIn">
              <div className="flex items-center space-x-2.5 text-xs font-medium">
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                <span>{caseSuccessAlert}</span>
              </div>
              <button
                type="button"
                onClick={() => setCaseSuccessAlert(null)}
                className="text-emerald-600 hover:text-emerald-800 font-bold text-xs p-1 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* WORKSPACE SUB-VIEW: OPEN CASE VS INVESTIGATION */}
          {workspaceSubView === 'open_case' ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 space-y-6 shadow-sm max-w-5xl mx-auto animate-fadeIn">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Open New Reconciliation Case</h3>
                  <p className="text-xs text-slate-500">
                    Attach batch files, connect external databases, map target headers, and configure shortcut hashtag rules.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWorkspaceSubView('workspace')}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center space-x-1"
                >
                  <ArrowLeft size={14} />
                  <span>Back</span>
                </button>
              </div>

              <form onSubmit={handleOpenCaseSubmit} className="space-y-6">
                {/* SECTION 1: Case Details */}
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">1</span>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Case Overview & Priority</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                        Case Title <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={createTitle}
                        onChange={(e) => setCreateTitle(e.target.value)}
                        placeholder="e.g., Chargeback Batch Reconciliation - August 2026"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all shadow-2xs"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                        Case Notes / Description
                      </label>
                      <textarea
                        rows={2}
                        value={createDesc}
                        onChange={(e) => setCreateDesc(e.target.value)}
                        placeholder="Describe the discrepancy, file source, or business context..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                        Assignee Specialist
                      </label>
                      <select
                        value={createAssigneeId}
                        onChange={(e) => setCreateAssigneeId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
                      >
                        {users.map(u => (
                          <option key={u.id} value={u.id}>@{u.username} ({u.role})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: Mapping Template Selection */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">2</span>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <Layers size={16} className="text-blue-600" />
                      <span>Choose Mapping Template Schema *</span>
                    </h3>
                  </div>

                  <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-bold text-slate-700 uppercase font-mono">
                        Available Mapping Templates ({mappingTemplates.length})
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Selected ID: <strong className="text-blue-600">{selectedMappingId}</strong>
                      </span>
                    </div>

                    <select
                      value={selectedMappingId}
                      onChange={(e) => {
                        const newTplId = e.target.value;
                        setSelectedMappingId(newTplId);
                        const selectedTpl = mappingTemplates.find(t => t.id === newTplId);
                        if (selectedTpl && selectedTpl.sampleHeaders && selectedTpl.sampleHeaders.length > 0 && createRawHeaders.length === 0) {
                          setCreateRawHeaders(selectedTpl.sampleHeaders);
                          setCreateFileName(`batch_${selectedTpl.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.${selectedTpl.sourceType || 'csv'}`);
                        }
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs font-sans"
                    >
                      {mappingTemplates.map(tpl => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} — [Format: {(tpl.sourceType || 'csv').toUpperCase()}] {tpl.isDefault ? '(Default Workspace Template)' : ''} (ID: {tpl.id})
                        </option>
                      ))}
                    </select>

                    {/* Selected Template Info Card */}
                    {(() => {
                      const currentTpl = mappingTemplates.find(t => t.id === selectedMappingId);
                      if (!currentTpl) return null;
                      return (
                        <div className="p-3 bg-blue-50/80 border border-blue-100 rounded-xl text-xs space-y-1.5 font-sans">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-blue-900">{currentTpl.name}</span>
                            <span className="text-[10px] bg-blue-100 text-blue-800 font-mono uppercase px-2 py-0.5 rounded font-bold">
                              {currentTpl.sourceType || 'CSV'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600">{currentTpl.description || 'Configured column mapping rules template.'}</p>
                          {currentTpl.sampleHeaders && currentTpl.sampleHeaders.length > 0 && (
                            <div className="text-[10px] font-mono text-slate-600 bg-white border border-blue-200/80 px-2.5 py-1 rounded-md mt-1">
                              Sample Headers: <span className="text-blue-950 font-semibold">{currentTpl.sampleHeaders.slice(0, 6).join(', ')}</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* SECTION 3: Hashtag Rule Preset */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">3</span>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Link Category & Shortcut Hashtag Rule</h3>
                  </div>

                  <div className="bg-slate-50 p-4 border border-slate-200 rounded-2xl space-y-3">
                    <select
                      value={createHashtag}
                      onChange={(e) => setCreateHashtag(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-mono font-bold text-blue-700 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                    >
                      {hashtags.map(h => (
                        <option key={h.tag} value={h.tag}>
                          {h.tag} - {h.description}
                        </option>
                      ))}
                    </select>

                    {(() => {
                      const currentH = hashtags.find(h => h.tag === createHashtag);
                      if (!currentH) return null;
                      return (
                        <div className="p-3.5 bg-white border border-slate-200 rounded-xl text-xs space-y-1.5 font-mono shadow-2xs">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 font-sans">
                            <span className="font-bold uppercase text-slate-700">Hashtag Specification:</span>
                            <span>Expected Cols: {(currentH.expectedHeaders || currentH.expectedFileStructure)?.join(', ')}</span>
                          </div>
                          <p className="text-[11px] text-slate-700 font-sans">{currentH.description}</p>
                          {currentH.solutionTemplate && (
                            <div className="mt-2 p-2.5 bg-slate-900 text-emerald-400 rounded-lg text-[10px] font-mono overflow-x-auto">
                              {currentH.solutionTemplate}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* SECTION 4: Batch File Attachment & Header Mapping */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">4</span>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Case Batch File Attachment & Column Mapping</h3>
                  </div>

                  <div className="bg-slate-50 p-5 border border-slate-200 rounded-2xl space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-800">
                          Batch File Name or Local File Upload
                        </label>
                        <span className="text-[10px] text-slate-500">
                          Enter file name or upload CSV/Excel to auto-extract headers and records.
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleLoadSampleChargebacks}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 transition-all cursor-pointer flex items-center space-x-1"
                        >
                          <span>📄 Load Chargebacks CSV</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleLoadSampleSettlements}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-lg border border-emerald-200 transition-all cursor-pointer flex items-center space-x-1"
                        >
                          <span>📊 Load Settlements CSV</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                        File Name
                      </label>
                      <input
                        type="text"
                        value={createFileName}
                        onChange={(e) => setCreateFileName(e.target.value)}
                        placeholder="e.g. batch_chargebacks_aug2026.csv"
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs font-mono font-semibold"
                      />
                    </div>

                    <div className="flex items-center justify-center border-2 border-dashed border-slate-300 hover:border-blue-500 bg-white hover:bg-blue-50/20 rounded-xl p-6 transition-all">
                      <label className="flex flex-col items-center cursor-pointer w-full text-center">
                        <Upload size={28} className="text-blue-600 mb-2" />
                        <span className="text-xs font-bold text-slate-800">
                          {createFileName ? `Attached: ${createFileName}` : 'Choose CSV or Excel file to upload'}
                        </span>
                        <span className="text-[10px] text-slate-500 mt-1">Drag and drop or click to browse local file (.csv, .xlsx, .xls)</span>
                        <input
                          type="file"
                          accept=".csv, .xlsx, .xls"
                          onChange={handleCreateFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {isProcessingFile && (
                      <div className="text-center text-xs text-blue-600 font-semibold animate-pulse">
                        Parsing file contents and extracting headers...
                      </div>
                    )}

                    {/* Header Mapping Table */}
                    {createRawHeaders.length > 0 && (
                      <div className="space-y-3 pt-3 border-t border-slate-200">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                            File Column Header → External DB Target Mapping ({createRawHeaders.length} headers)
                          </span>
                          <button
                            type="button"
                            onClick={() => setCreateFileMapping(autoGenerateColumnMapping(createRawHeaders))}
                            className="text-xs text-blue-700 hover:underline font-bold cursor-pointer"
                          >
                            ✨ Auto-Match Mapping
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                          {createRawHeaders.map((header) => (
                            <div key={header} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-2.5 text-xs shadow-2xs">
                              <span className="font-mono font-bold text-slate-800 text-[11px] truncate max-w-[140px]" title={header}>
                                {header}
                              </span>
                              <span className="text-slate-400 text-xs">→</span>
                              <select
                                value={createFileMapping[header] || ''}
                                onChange={(e) => setCreateFileMapping(prev => ({ ...prev, [header]: e.target.value }))}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-mono focus:outline-none focus:border-blue-500 cursor-pointer"
                              >
                                {TARGET_DB_FIELDS.map(f => (
                                  <option key={f.id} value={f.id}>{f.label}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Submit Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setWorkspaceSubView('sandbox')}
                    className="px-6 py-3 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    Cancel / Back to Sandbox
                  </button>

                  <button
                    type="submit"
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md flex items-center space-x-2"
                  >
                    <Plus size={18} />
                    <span>Open Case & Start Workspace Investigation</span>
                  </button>
                </div>
              </form>
            </div>
          ) : workspaceSubView === 'sandbox' ? (
            /* =========================================================================
               DEFAULT WORKSPACE SUBVIEW: MODERN HIGH-CONTRAST SQL CODE STUDIO
               ========================================================================= */
            <div className="space-y-3.5 animate-fadeIn" id="workspace-sql-sandbox">
              
              {/* 1. MODERN HIGH-CONTRAST SQL CODE STUDIO (GENEROUS EXPANDED SPACE & HIGH-CONTRAST CANVAS) */}
              <div className="bg-[#060A14] border-2 border-slate-800/90 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/5 text-slate-100">
                {/* Editor Header Toolbar */}
                <div className="bg-[#0A1020] px-4 py-2.5 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                    <FileCode size={14} className="text-cyan-400" />
                    <span className="font-bold text-white tracking-wide">SQL Query Sandbox</span>
                    <span className="text-slate-500 font-mono text-[10px]">query.sql</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Engine Online" />
                    <span className="text-slate-600">•</span>
                    <span className="font-semibold text-cyan-300 uppercase text-[10px] bg-cyan-950/80 border border-cyan-700/60 px-2 py-0.5 rounded-md shadow-2xs">
                      {databases?.find(d => d.id === sandboxSelectedDbId)?.type?.toUpperCase() || 'POSTGRESQL'}
                    </span>
                    <span className="text-slate-600 hidden sm:inline">•</span>
                    <span className="text-slate-300 font-mono text-[10px] hidden sm:inline">
                      Target Table: <strong className="text-cyan-300 font-bold">{sandboxTable}</strong>
                    </span>
                  </div>

                  {/* SQL Snippets & Editor Utilities */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Modern High-Contrast SQL Snippet Chips */}
                    <div className="hidden md:flex items-center gap-1 mr-2">
                      {[
                        { label: 'SELECT', val: `SELECT * FROM ${sandboxTable} LIMIT 25;`, cls: 'border-cyan-400/50 bg-cyan-950/70 text-cyan-300 hover:bg-cyan-900/60 shadow-xs' },
                        { label: 'WHERE', val: sandboxAvailableColumns.length > 0 ? `\nWHERE ${sandboxAvailableColumns[0].name} IS NOT NULL` : "\nWHERE 1=1", cls: 'border-emerald-400/50 bg-emerald-950/70 text-emerald-300 hover:bg-emerald-900/60 shadow-xs' },
                        { label: 'ORDER BY', val: sandboxAvailableColumns.length > 1 ? `\nORDER BY ${sandboxAvailableColumns[1].name} DESC` : '\nORDER BY 1 DESC', cls: 'border-amber-400/50 bg-amber-950/70 text-amber-300 hover:bg-amber-900/60 shadow-xs' },
                        { label: 'LIMIT 50', val: ' LIMIT 50', cls: 'border-purple-400/50 bg-purple-950/70 text-purple-300 hover:bg-purple-900/60 shadow-xs' }
                      ].map((snip, sIdx) => (
                        <button
                          key={sIdx}
                          type="button"
                          onClick={() => setSandboxSql(prev => prev ? `${prev} ${snip.val}` : snip.val)}
                          className={`px-2.5 py-0.5 text-[10px] font-mono font-bold rounded-lg border transition cursor-pointer ${snip.cls}`}
                        >
                          {snip.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleFormatSandboxSql}
                      className="px-2.5 py-1 bg-slate-800/90 hover:bg-slate-700 text-purple-300 hover:text-white rounded-lg text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer border border-purple-500/30 shadow-2xs"
                      title="Format SQL"
                    >
                      <Wand2 size={12} className="text-purple-400" />
                      <span>Format</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(sandboxSql);
                        setSandboxCopiedSql(true);
                        setTimeout(() => setSandboxCopiedSql(false), 2000);
                      }}
                      className="px-2.5 py-1 bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer border border-slate-700 shadow-2xs"
                      title="Copy SQL"
                    >
                      {sandboxCopiedSql ? <Check size={12} className="text-emerald-400" /> : <Clipboard size={12} />}
                      <span>{sandboxCopiedSql ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSandboxSql('')}
                      className="px-2.5 py-1 bg-slate-800/90 hover:bg-rose-950/90 text-rose-400 hover:text-rose-200 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer border border-rose-900/40 shadow-2xs"
                      title="Clear Editor"
                    >
                      <Eraser size={12} />
                      <span>Clear</span>
                    </button>

                    {/* Toggle Editor Collapse to give maximum space for results */}
                    <button
                      type="button"
                      onClick={() => setIsSandboxEditorCollapsed(prev => !prev)}
                      className="px-2.5 py-1 bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer border border-slate-700 shadow-2xs ml-1"
                      title={isSandboxEditorCollapsed ? "Expand SQL Editor" : "Collapse SQL Editor (Max Space for Results)"}
                      id="btn-toggle-sandbox-editor"
                    >
                      {isSandboxEditorCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                      <span>{isSandboxEditorCollapsed ? 'Expand Editor' : 'Collapse Editor'}</span>
                    </button>
                  </div>
                </div>

                {/* Collapsible Textarea Editor & Action Bar */}
                {!isSandboxEditorCollapsed ? (
                  <>
                    <div className="flex bg-[#030610] min-h-[240px]">
                      {/* Visual Line Numbers Gutter with High-Contrast Separator */}
                      <div className="w-11 shrink-0 text-right pr-3 select-none text-slate-500 font-mono text-xs leading-relaxed border-r border-slate-800/90 bg-[#050811] pt-3.5 pb-3.5">
                        {Array.from({ length: Math.max(sandboxSql.split('\n').length, 10) }, (_, i) => (
                          <div key={i} className="hover:text-cyan-400 transition-colors">{i + 1}</div>
                        ))}
                      </div>

                      {/* Code Textarea Canvas with High Contrast Syntax Colors */}
                      <textarea
                        rows={10}
                        value={sandboxSql}
                        onChange={(e) => setSandboxSql(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault();
                            executeSandboxQuery();
                          }
                        }}
                        placeholder="Enter SQL script (e.g. SELECT * FROM transactions_master WHERE status_state = 'PENDING')..."
                        className="w-full bg-transparent text-[#4ADE80] font-mono text-xs md:text-sm focus:outline-none leading-relaxed p-3.5 resize-y placeholder:text-slate-600 selection:bg-[#155DFC]/60 selection:text-white caret-cyan-400 font-medium"
                        spellCheck={false}
                      />
                    </div>

                    {/* Editor Bottom Run Actions & Metrics */}
                    <div className="bg-[#0A1020] px-4 py-2.5 border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
                        <span>Lines: <strong className="text-white">{sandboxSql.split('\n').length}</strong></span>
                        <span className="text-slate-700">•</span>
                        <span>Chars: <strong className="text-white">{sandboxSql.length}</strong></span>
                        <span className="text-slate-700 hidden sm:inline">•</span>
                        <span className="hidden sm:inline">
                          Shortcut: <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-cyan-300 text-[10px] shadow-2xs font-mono font-bold">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-cyan-300 text-[10px] shadow-2xs font-mono font-bold">Enter</kbd>
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        {!isCurrentQueryTypePermitted && (
                          <div id="sandbox-query-forbidden-banner" className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-950/80 border border-rose-800/80 rounded-lg text-rose-300 font-mono text-[11px] font-semibold shadow-xs">
                            <AlertCircle size={13} className="text-rose-400 shrink-0" />
                            <span>
                              {userPermTeam
                                ? `Forbidden: '${detectedSandboxQueryType}' queries not allowed for permanent team "${userPermTeam.name}". Allowed: [${(userPermTeam.allowedQueryTypes || ['SELECT']).join(', ')}]`
                                : `Forbidden: You must belong to a permanent team to execute sandbox queries.`}
                            </span>
                          </div>
                        )}

                        <button
                          type="button"
                          id="btn-run-sandbox-sql"
                          disabled={isSandboxExecuting || !sandboxSql.trim() || !isCurrentQueryTypePermitted}
                          onClick={() => executeSandboxQuery()}
                          className="px-6 py-2 bg-gradient-to-r from-blue-600 via-[#155DFC] to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-600 text-white text-xs font-mono font-bold rounded-xl transition-all shadow-lg hover:shadow-blue-500/25 flex items-center gap-2 cursor-pointer"
                          title={!isCurrentQueryTypePermitted ? `Operation '${detectedSandboxQueryType}' forbidden by permanent team policy` : 'Execute SQL Query'}
                        >
                          {isSandboxExecuting ? (
                            <>
                              <RefreshCw size={13} className="animate-spin" />
                              <span>Running Query...</span>
                            </>
                          ) : (
                            <>
                              <Play size={13} className="fill-current text-white" />
                              <span>Run SQL</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  /* Compact 1-line bar when editor is collapsed for maximum results space */
                  <div className="px-4 py-2.5 bg-[#0A1020] flex items-center justify-between text-xs border-t border-slate-800/90">
                    <div className="flex items-center gap-2 truncate max-w-xl text-slate-300 font-mono text-[11px]">
                      <span className="text-cyan-400 font-bold uppercase text-[10px] bg-cyan-950/80 border border-cyan-800/60 px-1.5 py-0.5 rounded">Active SQL</span>
                      <span className="truncate text-[#4ADE80] font-medium">{sandboxSql || 'None'}</span>
                    </div>
                    <button
                      type="button"
                      disabled={isSandboxExecuting || !sandboxSql.trim() || !isCurrentQueryTypePermitted}
                      onClick={() => executeSandboxQuery()}
                      className="px-4 py-1.5 bg-[#155DFC] hover:bg-blue-600 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs font-mono font-bold rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      {isSandboxExecuting ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} className="fill-current" />}
                      <span>Re-Run SQL</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 3. CLEAN QUERY RESULTS TABLE & EXPORT (WHITE THEME & EXPANDED MAXIMUM DATA SPACE) */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3" id="query-sandbox-results-table">
                {/* Results Header Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/90 pb-3 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-slate-900 flex items-center gap-1.5">
                      <Table size={14} className="text-[#155DFC]" />
                      <span>Results</span>
                    </span>

                    {sandboxExecutionStats && (
                      <>
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {sandboxExecutionStats.isDml
                            ? `DML: ${sandboxExecutionStats.affectedCount || 1} row(s) updated`
                            : `${sandboxResults.length} records`}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-lg text-[10px] font-mono border border-slate-200/60 font-semibold">
                          {sandboxExecutionStats.executionTimeMs}ms
                        </span>
                      </>
                    )}

                    <span className="text-[11px] text-slate-500 font-mono">
                      Target: <strong className="text-slate-800">{databases?.find(d => d.id === sandboxSelectedDbId)?.name || 'DB'}</strong>
                      {sandboxTable && (
                        <span> • Table: <strong className="text-slate-800">{sandboxTable}</strong></span>
                      )}
                    </span>
                  </div>

                  {/* Search inside results & Exports */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={sandboxSearchFilter}
                        onChange={(e) => setSandboxSearchFilter(e.target.value)}
                        placeholder="Filter rows..."
                        className="pl-7 pr-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-40 font-medium shadow-2xs"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleExportSandboxCsv}
                      className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition flex items-center gap-1 cursor-pointer shadow-2xs"
                      title="Download as CSV"
                    >
                      <Download size={12} />
                      <span>CSV</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportSandboxJson}
                      className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition flex items-center gap-1 cursor-pointer shadow-2xs"
                      title="Download as JSON"
                    >
                      <FileCode size={12} />
                      <span>JSON</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSandboxShowLogs(prev => !prev)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-xl border transition flex items-center gap-1 cursor-pointer shadow-2xs ${
                        sandboxShowLogs
                          ? 'bg-[#155DFC] text-white border-[#155DFC]'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                      title="Toggle execution logs"
                    >
                      <Terminal size={12} />
                      <span>Logs</span>
                    </button>
                  </div>
                </div>

                {/* Collapsible Execution Plan Logs (Light Slate Card) */}
                {sandboxShowLogs && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 font-mono text-xs text-slate-700 space-y-1 shadow-2xs">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pb-1.5 border-b border-slate-200 mb-1.5 flex items-center justify-between">
                      <span>Server Query Planner Execution Trace</span>
                      <span className={sandboxError ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold'}>
                        {sandboxError ? 'ERROR' : '200 OK'}
                      </span>
                    </div>
                    {sandboxQueryLogs.map((log, lIdx) => (
                      <div
                        key={lIdx}
                        className={
                          log.includes('[SUCCESS]')
                            ? 'text-emerald-700 font-semibold'
                            : log.includes('[ERROR]')
                            ? 'text-rose-700 font-semibold'
                            : 'text-slate-700'
                        }
                      >
                        {log}
                      </div>
                    ))}
                  </div>
                )}

                {/* Query Error Notification */}
                {sandboxError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-700 text-xs">
                    <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-600" />
                    <div className="space-y-0.5">
                      <div className="font-bold text-rose-800">Database Execution Error</div>
                      <div className="font-mono text-[11px] text-rose-700 whitespace-pre-wrap">{sandboxError}</div>
                    </div>
                  </div>
                )}

                {/* RESULTS DATA GRID (EXPANDED TO max-h-[640px] FOR GENEROUS DISPLAY SPACE) */}
                {(() => {
                  if (sandboxResults.length === 0) {
                    return (
                      <div className="p-12 text-center bg-slate-50/70 rounded-xl border border-slate-200 space-y-2">
                        <Database size={28} className="mx-auto text-slate-400" />
                        <h4 className="text-xs font-bold text-slate-700">0 Records Returned</h4>
                        <p className="text-[11px] text-slate-400">
                          The query executed against {databases?.find(d => d.id === sandboxSelectedDbId)?.name || 'the database'} and returned 0 rows.
                        </p>
                      </div>
                    );
                  }

                  const filteredRows = sandboxResults.filter(row => {
                    if (!sandboxSearchFilter) return true;
                    const q = sandboxSearchFilter.toLowerCase();
                    return Object.values(row).some(v => String(v).toLowerCase().includes(q));
                  });

                  if (filteredRows.length === 0) {
                    return (
                      <div className="p-12 text-center bg-slate-50/70 rounded-xl border border-slate-200 space-y-2">
                        <Search size={28} className="mx-auto text-slate-400" />
                        <h4 className="text-xs font-bold text-slate-700">No Records Match Search Filter</h4>
                        <p className="text-[11px] text-slate-400">
                          Try searching with different terms or clear the filter.
                        </p>
                      </div>
                    );
                  }

                  const headers = sandboxColumns && sandboxColumns.length > 0
                    ? sandboxColumns
                    : Object.keys(filteredRows[0] || {});

                  return (
                    <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[640px] min-h-[360px] overflow-y-auto shadow-2xs">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50/95 text-slate-700 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 sticky top-0 z-10 shadow-2xs backdrop-blur-xs font-mono">
                          <tr>
                            <th className="py-2.5 px-3 w-12 text-slate-400 text-center font-mono bg-slate-50">#</th>
                            {headers.map(h => (
                              <th key={h} className="py-2.5 px-3 font-bold whitespace-nowrap bg-slate-50">
                                {h}
                              </th>
                            ))}
                            <th className="py-2.5 px-3 text-right whitespace-nowrap bg-slate-50">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                          {filteredRows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-blue-50/30 transition-colors">
                              <td className="py-2 px-3 text-[10px] text-slate-400 text-center select-none font-sans">
                                {rIdx + 1}
                              </td>
                              {headers.map(h => {
                                const val = row[h];
                                const colLower = h.toLowerCase();
                                const isStatusCol = /status|state|verdict|result_code|respcode/i.test(colLower);

                                if (val === null || val === undefined) {
                                  return (
                                    <td key={h} className="py-2 px-3 whitespace-nowrap">
                                      <span className="text-slate-300 italic text-[10px]">NULL</span>
                                    </td>
                                  );
                                }

                                if (isStatusCol && typeof val === 'string') {
                                  const st = val.toUpperCase();
                                  const colorClass =
                                    ['SETTLED', 'SUCCESS', 'PASS', 'PAID', 'COMPLETED', '00', '000'].includes(st)
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : ['PENDING', 'IN_PROGRESS', 'PROCESSING'].includes(st)
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : ['REVERSED', 'REFUNDED'].includes(st)
                                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                                      : ['FAILED', 'ERROR', 'FAIL', 'REJECTED'].includes(st)
                                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                                      : 'bg-slate-50 text-slate-700 border-slate-200';
                                  return (
                                    <td key={h} className="py-2 px-3 whitespace-nowrap">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${colorClass}`}>
                                        {val}
                                      </span>
                                    </td>
                                  );
                                }

                                if (typeof val === 'boolean') {
                                  return (
                                    <td key={h} className="py-2 px-3 whitespace-nowrap">
                                      <span className="font-semibold text-slate-700">{val ? 'TRUE' : 'FALSE'}</span>
                                    </td>
                                  );
                                }

                                if (typeof val === 'object') {
                                  return (
                                    <td key={h} className="py-2 px-3 text-slate-600 max-w-xs truncate text-[10px]">
                                      {JSON.stringify(val)}
                                    </td>
                                  );
                                }

                                const isIdCol = /id|utrn|key|code|ref/i.test(colLower);

                                return (
                                  <td
                                    key={h}
                                    className={`py-2 px-3 whitespace-nowrap max-w-xs truncate ${
                                      isIdCol ? 'font-bold text-blue-700' : 'text-slate-700 font-sans'
                                    }`}
                                    title={String(val)}
                                  >
                                    {String(val)}
                                  </td>
                                );
                              })}
                              <td className="py-2 px-3 text-right whitespace-nowrap font-sans">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setWorkspaceSubView('investigation');
                                    }}
                                    className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold rounded border border-blue-200 transition cursor-pointer"
                                    title="Open and investigate in Investigation Window"
                                  >
                                    Investigate
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const primaryVal = row.id || row.transaction_id || row.FE_UTRNNO || Object.values(row)[0] || JSON.stringify(row);
                                      navigator.clipboard.writeText(String(primaryVal));
                                    }}
                                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition cursor-pointer"
                                    title="Copy primary key to clipboard"
                                  >
                                    <Clipboard size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

            </div>
          ) : !selectedIssue ? (
            /* INVESTIGATION WINDOW: EMPTY STATE */
            <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center space-y-6 shadow-sm animate-fadeIn">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-100 shadow-xs">
                <DatabaseZap size={32} />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="text-base font-bold text-slate-900">Workspace Operational Terminal</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  All tasks have been resolved or deleted from the operational terminal queue. You can open a new case, load sample reconciliation tasks, manage hashtag rules, or run queries in the SQL Sandbox.
                </p>
              </div>
              <div className="flex flex-wrap justify-center items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setWorkspaceSubView('sandbox')}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-2 shadow-sm transition-all cursor-pointer"
                >
                  <Terminal size={16} />
                  <span>Open SQL Query Sandbox</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceSubView('open_case')}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center space-x-1.5 border border-slate-200 transition-all cursor-pointer"
                >
                  <Plus size={14} className="text-blue-600" />
                  <span>+ Open New Case</span>
                </button>
                <button
                  type="button"
                  onClick={handleCreateQuickSampleTask}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center space-x-1.5 border border-slate-200 transition-all cursor-pointer"
                >
                  <Sparkles size={14} className="text-blue-600" />
                  <span>Load Sample Task Batch</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentMode('hashtags');
                    if (onChangeTab) onChangeTab('hashtags');
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center space-x-1.5 border border-slate-200 transition-all cursor-pointer"
                >
                  <Tag size={14} className="text-blue-600" />
                  <span>Manage Hashtags</span>
                </button>
              </div>
            </div>
          ) : (
            <ErrorBoundary
              fallbackTitle="Investigation Workspace Error"
              fallbackMessage="An unexpected error occurred while rendering the Investigation Workspace. You can retry or return to the SQL Sandbox."
            >
              <InvestigationWorkspace
                issues={issues}
                selectedIssueId={selectedIssue.id}
                onSelectIssueId={(id) => setSelectedIssueId(id)}
                currentUser={currentUser}
                users={users}
                databases={databases}
                systems={systems}
                hashtags={hashtags}
                teams={teams}
                onUpdateIssue={onUpdateIssue}
                onDeleteIssue={onDeleteIssue}
                onSendChatMessage={onSendChatMessage}
                onSubmitQueryApproval={onSubmitQueryApproval}
                onOpenNewCase={() => setWorkspaceSubView('open_case')}
              />
            </ErrorBoundary>
          )}
        </div>
      )}

      {/* =========================================================================
          HASHTAGS CATALOG & MANAGEMENT VIEW
          ========================================================================= */}
      {currentMode === 'hashtags' && selectedHashtagTag !== null && (() => {
        const detailHashtag = hashtags.find(h => h.tag === selectedHashtagTag) || hashtags[0];
        if (!detailHashtag) return null;

        const associatedTasks = issues.filter(issue => 
          issue.linkedHashtag === detailHashtag.tag || 
          (detailHashtag.tag && (
            (issue.title && issue.title.toLowerCase().includes(detailHashtag.tag.toLowerCase())) || 
            (issue.description && issue.description.toLowerCase().includes(detailHashtag.tag.toLowerCase()))
          ))
        );

        return (
          <div className="space-y-6">
            {/* Top Header & Navigation */}
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setSelectedHashtagTag(null)}
                  className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl inline-flex items-center space-x-1.5 transition-all cursor-pointer mb-1"
                >
                  <ArrowLeft size={14} />
                  <span>Back to Hashtag Table</span>
                </button>
                
                <div className="flex flex-wrap items-center gap-3">
                  <span className="px-3 py-1 rounded-xl bg-blue-500/20 text-blue-300 font-mono font-bold text-base border border-blue-500/30 flex items-center gap-1.5">
                    <Tag size={16} className="text-blue-400" />
                    <span>{detailHashtag.tag}</span>
                  </span>
                  <span className="text-xs text-slate-300 font-mono bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
                    Author: @{detailHashtag.author || 'System'}
                  </span>
                  {detailHashtag.createdAt && (
                    <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                      Created {new Date(detailHashtag.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-300 max-w-2xl font-medium">
                  {detailHashtag.description}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleCopySql(detailHashtag.solutionTemplate, detailHashtag.tag)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer"
                >
                  {copiedTag === detailHashtag.tag ? <Check size={14} className="text-emerald-400" /> : <Clipboard size={14} />}
                  <span>{copiedTag === detailHashtag.tag ? 'SQL Copied!' : 'Copy SQL Template'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedIssue?.id) {
                      onUpdateIssue(selectedIssue.id, { linkedHashtag: detailHashtag.tag });
                      alert(`Bound hashtag ${detailHashtag.tag} to active case ${selectedIssue.id}!`);
                    } else {
                      alert('Please select an active case in Workspace first to apply this hashtag.');
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Tag size={14} />
                  <span>Apply to Active Case</span>
                </button>
              </div>
            </div>

            {/* Hashtag Specifications Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Determination Criteria */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Filter size={12} className="text-blue-600" />
                  <span>Determination Criteria</span>
                </div>
                <code className="bg-slate-50 border border-slate-200 text-slate-800 p-2.5 rounded-xl font-mono block text-xs break-all leading-relaxed">
                  {detailHashtag.criteria || 'Standard manual review criteria'}
                </code>
              </div>

              {/* Expected File Columns */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Table size={12} className="text-blue-600" />
                  <span>Expected File Structure / Columns</span>
                </div>
                {detailHashtag.expectedFileStructure && detailHashtag.expectedFileStructure.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {detailHashtag.expectedFileStructure.map((col, idx) => (
                      <span key={idx} className="px-2 py-1 bg-slate-100 text-slate-700 font-mono text-xs rounded-lg border border-slate-200 font-medium">
                        {col}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400 text-xs italic">No expected column format specified.</span>
                )}
              </div>

              {/* SQL Reconciliation Template */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Terminal size={12} className="text-blue-600" />
                    <span>SQL Resolution Template</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopySql(detailHashtag.solutionTemplate, detailHashtag.tag)}
                    className="text-blue-600 hover:text-blue-700 text-[10px] font-bold cursor-pointer"
                  >
                    Copy
                  </button>
                </div>
                <pre className="bg-slate-900 border border-slate-800 text-emerald-400 p-2.5 rounded-xl font-mono text-[11px] overflow-x-auto whitespace-pre-wrap max-h-24">
                  {detailHashtag.solutionTemplate || '-- No SQL template provided'}
                </pre>
              </div>
            </div>

            {/* Associated Tasks Section */}
            <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden space-y-0">
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-2.5">
                  <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
                    <ListTodo size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      Tasks Associated with {detailHashtag.tag}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      All open and resolved issues categorized or tagged under {detailHashtag.tag}
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    {associatedTasks.length} Tasks
                  </span>
                </div>

                {/* Inline Link Task Control */}
                <div className="flex items-center space-x-2">
                  <select
                    value={selectedTaskToLink}
                    onChange={(e) => setSelectedTaskToLink(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
                  >
                    <option value="">-- Link an existing task --</option>
                    {issues.filter(i => i.linkedHashtag !== detailHashtag.tag).map(issue => (
                      <option key={issue.id} value={issue.id}>
                        {issue.id}: {issue.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedTaskToLink) {
                        alert('Please select a task from the dropdown first.');
                        return;
                      }
                      onUpdateIssue(selectedTaskToLink, { linkedHashtag: detailHashtag.tag });
                      setSelectedTaskToLink('');
                      alert(`Task ${selectedTaskToLink} linked to ${detailHashtag.tag}!`);
                    }}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap shadow-xs"
                  >
                    Link Task
                  </button>
                </div>
              </div>

              {/* Associated Tasks Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Task ID</th>
                      <th className="py-3 px-4">Title & Description</th>
                      <th className="py-3 px-4">Assigned To</th>
                      <th className="py-3 px-4">Priority</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Created Date</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {associatedTasks.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center space-y-2">
                          <CheckSquare size={32} className="mx-auto text-slate-300" />
                          <div className="text-xs font-bold text-slate-700">No Tasks Linked to {detailHashtag.tag}</div>
                          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                            There are currently no tasks categorized under this hashtag. Select a task above to link it.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      associatedTasks.map((issue) => (
                        <tr key={issue.id} className="hover:bg-blue-50/30 transition-all group">
                          <td className="py-3.5 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                            <button
                              onClick={() => {
                                setSelectedIssueId(issue.id);
                                setCurrentMode('workspace');
                                if (onChangeTab) onChangeTab('workspace');
                              }}
                              className="hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <span>{issue.id}</span>
                              <ChevronRight size={12} className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          </td>
                          <td className="py-3.5 px-4 max-w-xs">
                            <div className="font-semibold text-slate-800 truncate mb-0.5">{issue.title}</div>
                            <div className="text-[11px] text-slate-500 truncate">{issue.description}</div>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="font-medium text-slate-700">
                              @{issue.assignedTechUserName || issue.creatorName}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded border text-[10px] uppercase font-bold ${getPriorityBadge(issue.priority)}`}>
                              {issue.priority}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`px-2.5 py-0.5 rounded-lg border text-xs font-bold ${getStatusBadge(issue.status)}`}>
                              {issue.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-[11px] text-slate-500 font-mono">
                            {new Date(issue.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedIssueId(issue.id);
                                setCurrentMode('workspace');
                                if (onChangeTab) onChangeTab('workspace');
                              }}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 font-semibold rounded-lg text-xs transition-all cursor-pointer border border-slate-200"
                            >
                              Open Task
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Minimal Hashtag Table View */}
      {currentMode === 'hashtags' && selectedHashtagTag === null && (
        <div className="space-y-3">
          {/* Header Banner for Hashtags Catalog */}
          <div className="bg-[#0F172B] border border-slate-800 rounded-xl p-3 sm:p-3.5 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="p-1 bg-blue-500/20 rounded-md text-blue-400">
                  <Tag size={16} />
                </span>
                <h2 className="text-sm font-bold">Hashtags & Resolution Shortcuts Catalog</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#155DFC]/20 text-blue-300 border border-[#155DFC]/30">
                  {hashtags.length} Presets
                </span>
              </div>
              <p className="text-[11px] text-slate-300 max-w-2xl leading-relaxed">
                Search, view, and create shortcut presets for automated batch transaction reconciliation. Click any hashtag item to view its complete specifications and associated tasks.
              </p>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => setCurrentMode('create_hashtag')}
                className="px-3.5 py-1.5 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white text-xs font-bold rounded-lg flex items-center space-x-1.5 shadow-xs transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>+ Create Hashtag</span>
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1 max-w-md">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search hashtags by tag code, author, description..."
                value={hashtagSearchTerm}
                onChange={(e) => setHashtagSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
              />
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing <strong className="text-slate-800">{filteredHashtagList.length}</strong> of <strong className="text-slate-800">{hashtags.length}</strong> presets
            </div>
          </div>

          {/* Minimal Hashtag Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Tag size={16} className="text-blue-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Hashtag Shortcuts ({filteredHashtagList.length})
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                Click any row to view full hashtag details & associated tasks
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Hashtag Code</th>
                    <th className="py-3 px-4">Author</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHashtagList.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400 italic">
                        No hashtags found matching current search.
                      </td>
                    </tr>
                  ) : (
                    filteredHashtagList.map((item) => (
                      <tr 
                        key={item.tag} 
                        onClick={() => setSelectedHashtagTag(item.tag)}
                        className="hover:bg-blue-50/40 transition-all cursor-pointer group"
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200 gap-1.5 group-hover:border-blue-400 group-hover:bg-blue-100/60 transition-all">
                            <Tag size={12} className="text-blue-600" />
                            <span>{item.tag}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap text-[11px] text-slate-600">
                          <span className="font-semibold text-slate-700">@{item.author || 'System'}</span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-800 text-xs leading-snug line-clamp-2">{item.description}</div>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setSelectedHashtagTag(item.tag)}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 font-semibold rounded-lg text-xs transition-all cursor-pointer border border-blue-200 inline-flex items-center space-x-1"
                          >
                            <span>View Details</span>
                            <ChevronRight size={13} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          CREATE TASK WORKSPACE VIEW
          ========================================================================= */}
      {currentMode === 'create_task' && (
        <div className="space-y-3">
          {/* Header Banner for Create Task */}
          <div className="bg-[#0F172B] border border-slate-800 rounded-xl p-3 sm:p-3.5 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="p-1 bg-blue-500/20 rounded-md text-blue-400">
                  <Plus size={16} />
                </span>
                <h2 className="text-sm font-bold">Create Task & Open Investigation Space</h2>
              </div>
              <p className="text-[11px] text-slate-300 max-w-2xl leading-relaxed">
                Assign task, connect external database, upload files, and map columns for reconciliation directly in your workspace.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setCurrentMode('workspace')}
              className="px-3.5 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer self-start md:self-center"
            >
              <ArrowLeft size={13} />
              <span>Back to Workspace</span>
            </button>
          </div>

          {/* Form Container */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
            <form onSubmit={handleCreateTaskSubmit} className="space-y-5">
              {/* Basic Task Information */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Row 1: Task Title + Category / Hashtag Inline */}
                <div className="md:col-span-2 space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">
                    Task Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder="e.g. Chargeback Reconciliation Batch #801 or Settlement Audit"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-medium"
                  />
                </div>

                <div className="md:col-span-1 space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">
                    Category / Hashtag (#)
                  </label>
                  <select
                    value={createHashtag}
                    onChange={(e) => setCreateHashtag(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
                  >
                    <option value="Untagged">🏷️ Untagged</option>
                    {hashtags.map(h => (
                      <option key={h.tag} value={h.tag}>{h.tag} - {h.description}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Task Description / Investigation Notes
                  </label>
                  <textarea
                    rows={3}
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    placeholder="Describe the operational goal, anomaly details, or instructions..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-medium"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Assign Task To
                  </label>
                  <select
                    value={createAssigneeId}
                    onChange={(e) => setCreateAssigneeId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
                  >
                    <option value={currentUser.id}>Assign to Myself (@{currentUser.username})</option>
                    {users.filter(u => u.id !== currentUser.id && u.isApproved).map(u => (
                      <option key={u.id} value={u.id}>@{u.username} ({u.role})</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Priority
                  </label>
                  <select
                    value={createPriority}
                    onChange={(e) => setCreatePriority(e.target.value as IssuePriority)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
                  >
                    <option value="Low">Low Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="High">High Priority</option>
                    <option value="Critical">Critical Priority</option>
                  </select>
                </div>
              </div>

              {/* Investigation Space Toggle Box */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <input
                      type="checkbox"
                      id="toggle-investigation-space-inline"
                      checked={includeInvestigationSpace}
                      onChange={(e) => setIncludeInvestigationSpace(e.target.checked)}
                      className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    />
                    <label htmlFor="toggle-investigation-space-inline" className="text-xs font-bold text-slate-800 cursor-pointer flex items-center gap-1.5">
                      <Layers size={15} className="text-blue-600" />
                      <span>Attach File & Choose Mapping Template</span>
                    </label>
                  </div>
                  {includeInvestigationSpace && (
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full font-semibold">
                      Investigation Space Active
                    </span>
                  )}
                </div>

                {includeInvestigationSpace && (
                  <div className="space-y-4 pt-1">
                    {/* File Attachment & Quick Loader */}
                    <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3.5 shadow-xs">
                      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                        <div>
                          <span className="block text-[11px] font-bold text-slate-800">
                            Upload File or Load Sample Batch
                          </span>
                          <span className="text-[10px] text-slate-500">
                            Supports CSV, Excel (.xlsx). Auto-extracts column headers and populates data view.
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={handleLoadSampleChargebacks}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-semibold rounded-lg border border-blue-200 transition-all cursor-pointer"
                          >
                            📄 Chargebacks CSV
                          </button>
                          <button
                            type="button"
                            onClick={handleLoadSampleSettlements}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded-lg border border-emerald-200 transition-all cursor-pointer"
                          >
                            📊 Settlement CSV
                          </button>
                        </div>
                      </div>

                      {/* File Upload Zone / Active File Card */}
                      {createFileName ? (
                        <div className="p-3.5 bg-blue-50/50 border border-blue-200/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-150">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shrink-0">
                              <FileText size={18} />
                            </div>
                            <div className="space-y-0.5">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-slate-900">{createFileName}</span>
                                <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono font-semibold">
                                  {createParsedRows.length} Rows · {createRawHeaders.length} Cols
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-500 font-mono">
                                File ready for mapping and data preview below
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
                            <label className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs cursor-pointer transition-all flex items-center space-x-1.5">
                              <Upload size={13} className="text-slate-500" />
                              <span>Change File</span>
                              <input
                                id="task-create-file-upload-input"
                                type="file"
                                accept=".csv, .xlsx, .xls"
                                onChange={handleCreateFileChange}
                                className="hidden"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={handleRemoveCreateUploadedFile}
                              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                              title="Remove uploaded data file"
                            >
                              <Trash2 size={13} className="text-rose-600" />
                              <span>Remove Data</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-4 bg-slate-50/50 transition-all">
                          <label className="flex flex-col items-center cursor-pointer w-full">
                            <Upload size={20} className="text-blue-600 mb-1" />
                            <span className="text-xs font-semibold text-slate-700">
                              Choose CSV or Excel file
                            </span>
                            <span className="text-[9px] text-slate-400 mt-0.5">Click to browse local files or drag and drop</span>
                            <input
                              id="task-create-file-upload-input"
                              type="file"
                              accept=".csv, .xlsx, .xls"
                              onChange={handleCreateFileChange}
                              className="hidden"
                            />
                          </label>
                        </div>
                      )}

                      {isProcessingFile && (
                        <div className="text-center text-xs text-blue-600 font-semibold animate-pulse">
                          Parsing file contents and extracting headers...
                        </div>
                      )}

                      {/* Data View Table with Integrated Header Mapping & Cleaning Tools */}
                      {createRawHeaders.length > 0 && (
                        <div className="space-y-3 pt-2 border-t border-slate-100">
                          {/* Cleaning Feedback Banner */}
                          {createCleaningActionSuccess && (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between animate-in fade-in duration-200">
                              <div className="flex items-center space-x-2">
                                <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                                <span className="font-semibold">{createCleaningActionSuccess}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setCreateCleaningActionSuccess(null)}
                                className="text-emerald-600 hover:text-emerald-900 font-bold ml-2 text-xs cursor-pointer"
                              >
                                ✕
                              </button>
                            </div>
                          )}

                          {/* Data View Action & Filter Toolbar */}
                          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 space-y-2.5">
                            <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-2.5">
                              {/* Left: Quick Data Cleaning & Template Actions */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1">
                                  <Sparkles size={12} className="text-blue-500" />
                                  Tools:
                                </span>

                                <button
                                  type="button"
                                  onClick={() => handleCreateGlobalDatasetClean('trim_all')}
                                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-[10px] font-bold rounded-lg border border-slate-200 shadow-xs flex items-center space-x-1 transition-all cursor-pointer"
                                  title="Trim whitespace across all columns and rows"
                                >
                                  <Eraser size={11} className="text-amber-500" />
                                  <span>Trim All</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleCreateGlobalDatasetClean('deduplicate')}
                                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-[10px] font-bold rounded-lg border border-slate-200 shadow-xs flex items-center space-x-1 transition-all cursor-pointer"
                                  title="Remove duplicate rows"
                                >
                                  <CheckCheck size={11} className="text-emerald-500" />
                                  <span>Deduplicate</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleCreateGlobalDatasetClean('remove_empty_rows')}
                                  className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-[10px] font-bold rounded-lg border border-slate-200 shadow-xs flex items-center space-x-1 transition-all cursor-pointer"
                                  title="Remove empty rows from dataset"
                                >
                                  <ListFilter size={11} className="text-blue-500" />
                                  <span>Filter Empty</span>
                                </button>

                                {createCleaningUndoSnapshot && (
                                  <button
                                    type="button"
                                    onClick={handleCreateUndoCleaning}
                                    className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold rounded-lg border border-amber-300 shadow-xs flex items-center space-x-1 transition-all cursor-pointer animate-pulse"
                                    title="Undo last data cleaning operation"
                                  >
                                    <Undo2 size={11} className="text-amber-700" />
                                    <span>Undo</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setCreateFileMapping(autoGenerateColumnMapping(createRawHeaders))}
                                  className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold rounded-lg border border-blue-200 shadow-xs flex items-center space-x-1 transition-all cursor-pointer"
                                  title="Auto-detect and map columns against target schema"
                                >
                                  <Wand2 size={11} className="text-blue-600" />
                                  <span>Auto Map</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={handleOpenSaveMappingModal}
                                  className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-lg border border-emerald-300 shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                                  title="Save current column mapping configuration as a reusable template"
                                >
                                  <BookmarkCheck size={11} className="text-emerald-600" />
                                  <span>Save Template</span>
                                </button>

                                {/* Remove button on Data View */}
                                <button
                                  type="button"
                                  onClick={handleRemoveCreateUploadedFile}
                                  className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold rounded-lg border border-rose-200 shadow-xs flex items-center space-x-1 transition-all cursor-pointer ml-auto sm:ml-0"
                                  title="Remove uploaded data and clear table preview"
                                >
                                  <Trash2 size={11} className="text-rose-600" />
                                  <span>Remove Data</span>
                                </button>
                              </div>

                              {/* Right: Choose Mapping Template for File Upload alongside Filter preview data input field */}
                              <div className="flex flex-wrap items-center gap-2">
                                {/* Choose Mapping Template for File Upload Dropdown */}
                                <div className="flex items-center space-x-1.5">
                                  <label className="text-[10px] font-bold text-slate-700 uppercase whitespace-nowrap flex items-center gap-1 font-mono">
                                    <Layers size={12} className="text-blue-600" />
                                    <span className="hidden sm:inline">Mapping Template:</span>
                                    <span className="sm:hidden">Template:</span>
                                  </label>
                                  <select
                                    value={selectedMappingId}
                                    onChange={(e) => {
                                      const newTplId = e.target.value;
                                      setSelectedMappingId(newTplId);
                                      if (newTplId) {
                                        const selectedTpl = mappingTemplates.find(t => t.id === newTplId);
                                        if (selectedTpl) {
                                          if (selectedTpl.columnMappings && Object.keys(selectedTpl.columnMappings).length > 0) {
                                            setCreateFileMapping(selectedTpl.columnMappings);
                                          }
                                          if (selectedTpl.sampleHeaders && selectedTpl.sampleHeaders.length > 0 && createRawHeaders.length === 0) {
                                            setCreateRawHeaders(selectedTpl.sampleHeaders);
                                            setCreateFileName(`template_${selectedTpl.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.${selectedTpl.sourceType || 'csv'}`);
                                          }
                                        }
                                      } else {
                                        // Reset to standard global column mapping
                                        if (createRawHeaders.length > 0) {
                                          setCreateFileMapping(autoGenerateColumnMapping(createRawHeaders));
                                        }
                                      }
                                    }}
                                    className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 cursor-pointer max-w-[210px]"
                                    title="Choose Mapping Template for File Upload"
                                  >
                                    <option value="">-- No Template (Map to Global Standard) --</option>
                                    {mappingTemplates.map(tpl => (
                                      <option key={tpl.id} value={tpl.id}>
                                        {tpl.name} ({tpl.id})
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Filter preview data input field */}
                                <div className="relative">
                                  <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
                                  <input
                                    type="text"
                                    placeholder="Filter preview data..."
                                    value={createDataSearch}
                                    onChange={(e) => setCreateDataSearch(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg pl-7 pr-2.5 py-1 text-[10px] text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 w-36 sm:w-44"
                                  />
                                  {createDataSearch && (
                                    <button
                                      type="button"
                                      onClick={() => setCreateDataSearch('')}
                                      className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-[10px] cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>

                                <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-md shrink-0 font-medium">
                                  {createParsedRows.length} rows · {createRawHeaders.length} cols
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Data View Table with Integrated Header Mapping */}
                          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
                            <div className="overflow-x-auto max-h-96">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead className="sticky top-0 z-10 shadow-xs">
                                  {/* ROW 1: Column Headers & Quick Cleaning Dropdowns */}
                                  <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 text-[11px]">
                                    <th className="py-2.5 px-3 w-12 text-center bg-slate-200/70 border-r border-slate-200 text-[10px] text-slate-500 font-mono">
                                      #
                                    </th>
                                    {createRawHeaders.map((colKey) => (
                                      <th
                                        key={colKey}
                                        className="py-2.5 px-3 min-w-[190px] border-r border-slate-200 font-sans group relative bg-slate-100"
                                      >
                                        {createEditingColumnKey === colKey ? (
                                          <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                                            <input
                                              type="text"
                                              value={createNewColumnHeaderName}
                                              onChange={(e) => setCreateNewColumnHeaderName(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleCreateRenameColumn(colKey, createNewColumnHeaderName);
                                                if (e.key === 'Escape') {
                                                  setCreateEditingColumnKey(null);
                                                  setCreateNewColumnHeaderName('');
                                                }
                                              }}
                                              autoFocus
                                              className="w-full bg-white border border-blue-500 rounded px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => handleCreateRenameColumn(colKey, createNewColumnHeaderName)}
                                              className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 cursor-pointer"
                                              title="Save name"
                                            >
                                              <Check size={11} />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setCreateEditingColumnKey(null);
                                                setCreateNewColumnHeaderName('');
                                              }}
                                              className="p-1 bg-slate-300 text-slate-700 rounded hover:bg-slate-400 cursor-pointer"
                                              title="Cancel"
                                            >
                                              <X size={11} />
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center justify-between gap-1">
                                            <span className="font-mono font-bold text-slate-800 text-xs truncate max-w-[130px]" title={colKey}>
                                              {colKey}
                                            </span>

                                            <div className="flex items-center space-x-1 shrink-0">
                                              {/* Column Menu Button */}
                                              <div className="relative">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setCreateActiveColumnMenu(createActiveColumnMenu === colKey ? null : colKey);
                                                  }}
                                                  className="p-1 hover:bg-slate-200 rounded text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                                                  title="Column tools & cleaning menu"
                                                >
                                                  <MoreHorizontal size={13} />
                                                </button>

                                                {/* Dropdown Menu for Column */}
                                                {createActiveColumnMenu === colKey && (
                                                  <div
                                                    className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-left animate-in fade-in zoom-in-95 duration-100"
                                                    onClick={(e) => e.stopPropagation()}
                                                  >
                                                    <div className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                                      Column: {colKey}
                                                    </div>

                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        setCreateEditingColumnKey(colKey);
                                                        setCreateNewColumnHeaderName(colKey);
                                                        setCreateActiveColumnMenu(null);
                                                      }}
                                                      className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center space-x-2 cursor-pointer font-sans"
                                                    >
                                                      <Edit3 size={12} className="text-blue-500" />
                                                      <span>Rename Column Header</span>
                                                    </button>

                                                    <div className="my-1 border-t border-slate-100"></div>
                                                    <div className="px-3 py-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                                      Clean Values
                                                    </div>

                                                    <button
                                                      type="button"
                                                      onClick={() => handleCreateTransformColumn(colKey, 'trim')}
                                                      className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 cursor-pointer font-sans"
                                                    >
                                                      <Eraser size={12} className="text-amber-500" />
                                                      <span>Trim Whitespace</span>
                                                    </button>

                                                    <button
                                                      type="button"
                                                      onClick={() => handleCreateTransformColumn(colKey, 'uppercase')}
                                                      className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 cursor-pointer font-sans"
                                                    >
                                                      <Type size={12} className="text-indigo-500" />
                                                      <span>UPPERCASE (ALL CAPS)</span>
                                                    </button>

                                                    <button
                                                      type="button"
                                                      onClick={() => handleCreateTransformColumn(colKey, 'lowercase')}
                                                      className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 cursor-pointer font-sans"
                                                    >
                                                      <Type size={12} className="text-slate-400" />
                                                      <span>lowercase (all small)</span>
                                                    </button>

                                                    <button
                                                      type="button"
                                                      onClick={() => handleCreateTransformColumn(colKey, 'strip_special')}
                                                      className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 cursor-pointer font-sans"
                                                    >
                                                      <Sparkles size={12} className="text-emerald-500" />
                                                      <span>Strip Special Characters</span>
                                                    </button>

                                                    <button
                                                      type="button"
                                                      onClick={() => handleCreateTransformColumn(colKey, 'number_clean')}
                                                      className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 cursor-pointer font-sans"
                                                    >
                                                      <SlidersHorizontal size={12} className="text-blue-500" />
                                                      <span>Format Number / 2 Decimals</span>
                                                    </button>

                                                    <button
                                                      type="button"
                                                      onClick={() => handleCreateTransformColumn(colKey, 'mask_card')}
                                                      className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 cursor-pointer font-sans"
                                                    >
                                                      <ShieldCheck size={12} className="text-purple-500" />
                                                      <span>Mask Card PAN (4111****)</span>
                                                    </button>

                                                    <button
                                                      type="button"
                                                      onClick={() => handleCreateTransformColumn(colKey, 'fill_blanks')}
                                                      className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 cursor-pointer font-sans"
                                                    >
                                                      <CheckSquare size={12} className="text-slate-500" />
                                                      <span>Fill Blanks with 'N/A'</span>
                                                    </button>

                                                    <div className="my-1 border-t border-slate-100"></div>

                                                    <button
                                                      type="button"
                                                      onClick={() => handleCreateDeleteColumn(colKey)}
                                                      className="w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center space-x-2 cursor-pointer font-sans font-semibold"
                                                    >
                                                      <Trash2 size={12} className="text-red-500" />
                                                      <span>Delete Column</span>
                                                    </button>
                                                  </div>
                                                )}
                                              </div>

                                              {/* Quick Delete Column Button */}
                                              <button
                                                type="button"
                                                onClick={() => handleCreateDeleteColumn(colKey)}
                                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                                title={`Remove column ${colKey}`}
                                              >
                                                <Trash2 size={12} />
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </th>
                                    ))}
                                  </tr>

                                  {/* ROW 2: Integrated Schema Mapping Dropdown Row */}
                                  <tr className="bg-slate-50 border-b-2 border-slate-200 text-slate-600 text-[10px]">
                                    <th className="py-2 px-3 text-center bg-slate-100 border-r border-slate-200 font-mono text-[9px] text-blue-700 font-bold uppercase tracking-wider">
                                      Maps To
                                    </th>
                                    {createRawHeaders.map((colKey) => {
                                      const mappedField = createFileMapping[colKey];
                                      const isMapped = mappedField && mappedField !== 'unmapped';

                                      return (
                                        <th key={`map-${colKey}`} className="py-1.5 px-2.5 border-r border-slate-200 bg-slate-50 font-normal">
                                          <div className="flex items-center space-x-1">
                                            <span className={`w-2 h-2 rounded-full shrink-0 ${isMapped ? 'bg-blue-600' : 'bg-slate-300'}`} />
                                            <select
                                              value={mappedField || 'unmapped'}
                                              onChange={(e) => {
                                                setCreateFileMapping(prev => ({
                                                  ...prev,
                                                  [colKey]: e.target.value
                                                }));
                                              }}
                                              className={`w-full text-[11px] font-mono rounded px-2 py-1 border transition-all cursor-pointer ${
                                                isMapped
                                                  ? 'bg-blue-50/90 border-blue-300 text-blue-900 font-semibold shadow-xs'
                                                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                              }`}
                                            >
                                              <option value="unmapped">-- Skip (Unmapped) --</option>
                                              <optgroup label="Global Standard Column Dictionary">
                                                {TARGET_DB_FIELDS.map(f => (
                                                  <option key={f.id} value={f.id}>{f.label}</option>
                                                ))}
                                              </optgroup>
                                            </select>
                                          </div>
                                        </th>
                                      );
                                    })}
                                  </tr>
                                </thead>

                                <tbody className="divide-y divide-slate-100 bg-white">
                                  {(() => {
                                    const filteredRows = createParsedRows.filter(row => {
                                      if (!createDataSearch.trim()) return true;
                                      const query = createDataSearch.toLowerCase();
                                      return Object.values(row).some(val =>
                                        String(val || '').toLowerCase().includes(query)
                                      );
                                    });

                                    if (filteredRows.length === 0) {
                                      return (
                                        <tr>
                                          <td
                                            colSpan={createRawHeaders.length + 1}
                                            className="py-8 text-center text-slate-400 font-sans text-xs"
                                          >
                                            {createDataSearch ? `No records matched filter "${createDataSearch}".` : 'No parsed records found.'}
                                          </td>
                                        </tr>
                                      );
                                    }

                                    return filteredRows.map((row, idx) => (
                                      <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                        <td className="py-2 px-3 text-center text-[10px] text-slate-400 font-mono bg-slate-50/50 border-r border-slate-100">
                                          {idx + 1}
                                        </td>
                                        {createRawHeaders.map((colKey) => {
                                          const cellVal = row[colKey];
                                          return (
                                            <td
                                              key={colKey}
                                              className="py-2 px-3 text-slate-700 font-mono text-[11px] truncate max-w-[200px] border-r border-slate-100"
                                              title={cellVal !== undefined && cellVal !== null ? String(cellVal) : ''}
                                            >
                                              {cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '' ? (
                                                String(cellVal)
                                              ) : (
                                                <span className="text-slate-300">-</span>
                                              )}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    ));
                                  })()}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Form Actions */}
              <div className="flex justify-end items-center space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCurrentMode('workspace')}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center space-x-2 cursor-pointer"
                >
                  <Plus size={15} />
                  <span>Create Task & Launch Workspace</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          CREATE HASHTAG WORKSPACE VIEW
          ========================================================================= */}
      {currentMode === 'create_hashtag' && (
        <div className="space-y-3">
          {/* Header Banner for Create Hashtag */}
          <div className="bg-[#0F172B] border border-slate-800 rounded-xl p-3 sm:p-3.5 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="p-1 bg-blue-500/20 rounded-md text-blue-400">
                  <Tag size={16} />
                </span>
                <h2 className="text-sm font-bold">Create # Resolution Preset & Rule Shortcut</h2>
              </div>
              <p className="text-[11px] text-slate-300 max-w-2xl leading-relaxed">
                Define reusable determination rules, expected file structure headers, and SQL resolution scripts for batch transaction processing directly in your workspace.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setCurrentMode('hashtags')}
              className="px-3.5 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer self-start md:self-center"
            >
              <ArrowLeft size={13} />
              <span>Back to Hashtags</span>
            </button>
          </div>

          {/* Form Container */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
            <form onSubmit={handleSaveHashtagPreset} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  HASHTAG CODE (e.g. #REVERSED_FEE) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="#STUCK_TERMINAL"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 uppercase focus:outline-none focus:border-blue-500 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  SHORT DESCRIPTION <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Resolves hardware related ledger offsets"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  DETERMINATION CRITERIA RULES
                </label>
                <textarea
                  rows={2}
                  value={newCriteria}
                  onChange={(e) => setNewCriteria(e.target.value)}
                  placeholder="Amount > 500 && status == 'PENDING'"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  EXPECTED FILE COLUMN COLS (COMMA SEPARATED)
                </label>
                <input
                  type="text"
                  value={newExpectedCols}
                  onChange={(e) => setNewExpectedCols(e.target.value)}
                  placeholder="Transaction_ID, Card_Number, Amount_USD, Auth_Time"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  SQL RECONCILIATION TEMPLATE <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={newSqlTemplate}
                  onChange={(e) => setNewSqlTemplate(e.target.value)}
                  placeholder="UPDATE transactions SET status = 'SETTLED' WHERE txn_id = '{{Transaction_ID}}';"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-emerald-400 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div className="flex items-center space-x-2 border-t border-slate-100 pt-3">
                <input
                  type="checkbox"
                  id="workspace-criteria-auth"
                  checked={criteriaAuthorized}
                  onChange={(e) => setCriteriaAuthorized(e.target.checked)}
                  className="accent-blue-600 cursor-pointer w-4 h-4"
                />
                <label htmlFor="workspace-criteria-auth" className="text-xs text-slate-600 cursor-pointer">
                  Authorize rules and templates structure for automated batch consumption.
                </label>
              </div>

              <div className="flex justify-end items-center space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCurrentMode('hashtags')}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-sm flex items-center space-x-2"
                >
                  <Tag size={14} />
                  <span>Save # Shortcut Preset Template</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEDICATED INDEPENDENT WORKSPACE SETTINGS VIEW */}
      {(currentMode === 'setting' || (currentMode as any) === 'workspace_settings') && (
        <div className="space-y-4">
          <ErrorBoundary fallbackTitle="Workspace Settings Display Error">
            <WorkspaceSettings
              currentUser={currentUser}
              databases={databases}
              onNavigateToWorkspace={() => setCurrentMode('workspace')}
            />
          </ErrorBoundary>
        </div>
      )}

      {/* =========================================================================
          OPERATIONAL DISPATCH CASE POPUP MODAL
          ========================================================================= */}
      {showDispatchModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-blue-900 uppercase flex items-center gap-2">
                <Send size={14} className="text-blue-600" />
                <span>Dispatch Case to Technical Specialist</span>
              </h4>
              <button
                onClick={() => setShowDispatchModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                Close ×
              </button>
            </div>

            <form onSubmit={handleDispatchCase} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">ISSUE CASE TITLE</label>
                <input
                  type="text"
                  required
                  value={dispatchTitle}
                  onChange={(e) => setDispatchTitle(e.target.value)}
                  placeholder="Enter a title for the Operational & Technical log..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">OPERATIONAL FINDINGS & DESCRIPTIONS</label>
                <textarea
                  rows={4}
                  required
                  value={dispatchFindings}
                  onChange={(e) => setDispatchFindings(e.target.value)}
                  placeholder="Detail your database extraction results, anomalies discovered, and files loaded..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">ROUTE TO TECHNICAL SPECIALIST</label>
                  <select
                    required
                    value={dispatchTargetTech}
                    onChange={(e) => setDispatchTargetTech(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">-- Choose Specialist --</option>
                    {technicalUsers.map(u => (
                      <option key={u.id} value={u.id}>@{u.username} ({u.role})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">CASE PRIORITY</label>
                  <select
                    value={dispatchPriority}
                    onChange={(e) => setDispatchPriority(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="Low">Low Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="High">High Priority</option>
                    <option value="Critical">Critical Priority</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">TRANSITION STATUS</label>
                <select
                  value={dispatchStatus}
                  onChange={(e) => setDispatchStatus(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="Open">Open (Awaiting triage)</option>
                  <option value="Investigating">Investigating (Active investigation)</option>
                  <option value="Resolved">Resolved (Anomalies reconciled)</option>
                  <option value="Closed">Closed (Case completed)</option>
                </select>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[10px] text-slate-600 leading-relaxed font-sans">
                💡 Submitting this dispatch updates the **Operational Log** database and sends case workflows, custom labels, table extractions, and mapped headers to the selected technical specialist's workspace.
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center space-x-1.5 shadow-sm"
              >
                <Send size={12} />
                <span>Confirm Case Dispatch</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TASK RECORD DELETION CONFIRMATION MODAL */}
      {taskToDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Task Record?</h3>
                <p className="text-xs text-slate-500 font-mono">Task ID: {taskToDeleteConfirm.id}</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1">
              <div className="text-xs font-bold text-slate-800">{taskToDeleteConfirm.title}</div>
              <p className="text-[11px] text-slate-500">
                Are you sure you want to permanently delete this task record from your operational tasks? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                id="btn-cancel-delete-task"
                onClick={() => setTaskToDeleteConfirm(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-task"
                onClick={handleConfirmDeleteTask}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5"
              >
                <Trash2 size={13} />
                <span>Delete Task Record</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SAVE MAPPING TEMPLATE MODAL */}
      {showSaveMappingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <BookmarkCheck size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Save Schema Mapping Template</h3>
                  <p className="text-[11px] text-slate-500">Save your current column mappings to reuse across future tasks and datasets</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSaveMappingModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCurrentMapping} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Template Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={saveMappingTemplateName}
                  onChange={(e) => setSaveMappingTemplateName(e.target.value)}
                  placeholder="e.g. Visa Settlement CSV Mapping"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  value={saveMappingTemplateDesc}
                  onChange={(e) => setSaveMappingTemplateDesc(e.target.value)}
                  placeholder="Briefly describe the format or processor origin of this file..."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>

              {/* Mapped Columns Summary */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700 uppercase tracking-wider">
                    Mapped Column Headers ({Object.keys(createFileMapping).filter(k => createFileMapping[k] && createFileMapping[k] !== 'unmapped').length} of {createRawHeaders.length})
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Format: CSV/Excel</span>
                </div>

                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-2.5 bg-slate-50/70 space-y-1.5 text-xs">
                  {createRawHeaders.map((col) => {
                    const mapped = createFileMapping[col];
                    const isMapped = mapped && mapped !== 'unmapped';
                    return (
                      <div key={col} className="flex items-center justify-between py-1 px-2 bg-white border border-slate-200/80 rounded-lg text-[11px]">
                        <span className="font-mono font-bold text-slate-800 truncate max-w-[160px]">{col}</span>
                        <span className="text-slate-400 text-[10px]">→</span>
                        {isMapped ? (
                          <span className="font-mono text-blue-700 font-semibold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[10px]">
                            {mapped}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[10px]">unmapped (skipped)</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSaveMappingModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingMapping || !saveMappingTemplateName.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  {isSavingMapping ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Saving Template...</span>
                    </>
                  ) : (
                    <>
                      <Save size={13} />
                      <span>Save Template</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
