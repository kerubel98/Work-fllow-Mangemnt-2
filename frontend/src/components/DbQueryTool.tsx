/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { DatabaseConnection, Transaction, User, DbAccessRequest, ConnectionUsageLog } from '../types';
import { 
  Database, Search, Activity, Play, CheckCircle2, AlertTriangle, 
  Terminal, ArrowRight, Plus, Key, Shield, Wifi, WifiOff, Lock, Unlock, Zap,
  Loader2, X, Layers, Table, RefreshCw, Copy, Check, Filter, Clock
} from 'lucide-react';
import { api } from '../api/client';

interface DbQueryToolProps {
  databases: DatabaseConnection[];
  transactions: Transaction[];
  currentUser: User;
  onAddDatabase: (newDb: Omit<DatabaseConnection, 'id'>) => void;
  onRequestDbAccess?: (req: Omit<DbAccessRequest, 'id' | 'status' | 'requestDate'>) => void;
  onLogQueryExecution?: (log: Omit<ConnectionUsageLog, 'id' | 'timestamp'>) => void;
  onImportToIssue?: (txn: Transaction) => void;
}

export default function DbQueryTool({ 
  databases, 
  transactions, 
  currentUser,
  onAddDatabase,
  onRequestDbAccess,
  onLogQueryExecution,
  onImportToIssue 
}: DbQueryToolProps) {
  const [selectedDb, setSelectedDb] = useState<string>(databases[0]?.id || '');
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [loadingTables, setLoadingTables] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [customSql, setCustomSql] = useState<string>('');
  const [queryColumns, setQueryColumns] = useState<string[]>([]);
  const [queryRows, setQueryRows] = useState<Record<string, any>[]>([]);
  const [mirroredTable, setMirroredTable] = useState<string | null>(null);
  const [mirroredCount, setMirroredCount] = useState<number>(0);
  const [executionMs, setExecutionMs] = useState<number>(0);
  const [queryLog, setQueryLog] = useState<string[]>([]);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);

  // Validation Workflow Integration State
  const [showValidationModal, setShowValidationModal] = useState<boolean>(false);
  const [availableWorkflows, setAvailableWorkflows] = useState<any[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationJobResult, setValidationJobResult] = useState<any | null>(null);

  // Admin New Connection Form State
  const [showAddDbModal, setShowAddDbModal] = useState<boolean>(false);
  const [newDbName, setNewDbName] = useState<string>('');
  const [newDbType, setNewDbType] = useState<'PostgreSQL' | 'Oracle' | 'MySQL' | 'MongoDB'>('PostgreSQL');
  const [newDbHost, setNewDbHost] = useState<string>('');
  const [newConnStr, setNewConnStr] = useState<string>('');
  const [newDbEndpoint, setNewDbEndpoint] = useState<string>('');
  const [newDbDesc, setNewDbDesc] = useState<string>('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; pingMs?: number } | null>(null);
  const [isTestingConn, setIsTestingConn] = useState<boolean>(false);

  // Request Access State
  const [showRequestAccessModal, setShowRequestAccessModal] = useState<boolean>(false);
  const [requestedPrivilege, setRequestedPrivilege] = useState<'SELECT' | 'UPDATE' | 'FULL'>('SELECT');
  const [accessReason, setAccessReason] = useState<string>('');
  const [accessMsg, setAccessMsg] = useState<string | null>(null);

  const currentDb = databases.find(db => db.id === selectedDb) || databases[0];

  // User privileges check
  const isAdmin = currentUser.role === 'admin';
  const userAllowedDbs = currentUser.allowedDbIds || databases.map(d => d.id);
  const hasDbAccess = isAdmin || userAllowedDbs.includes(currentDb?.id || '');
  const canSelect = isAdmin || (currentUser.canExecuteSelect !== false);
  const canUpdate = isAdmin || (currentUser.canExecuteUpdate ?? true);

  // Automatically discover and load tables whenever selected database changes
  useEffect(() => {
    if (!selectedDb) return;
    let isMounted = true;
    setLoadingTables(true);
    setMirroredTable(null);
    setMirroredCount(0);

    api.getDatabaseTables(selectedDb)
      .then(res => {
        if (!isMounted) return;
        const tbls = res.tables || [];
        setAvailableTables(tbls);
        if (tbls.length > 0) {
          setSelectedTable(tbls[0]);
          setCustomSql(`SELECT * FROM ${tbls[0]} LIMIT 25;`);
        } else {
          setSelectedTable('');
          setCustomSql(`SELECT 1;`);
        }
      })
      .catch(err => {
        if (!isMounted) return;
        console.warn('[DbQueryTool] Live table fetch failed, using fallback:', err.message);
        const targetDb = databases.find(d => d.id === selectedDb);
        const fallback = targetDb?.allowedTables || targetDb?.availableTables || [];
        setAvailableTables(fallback);
        if (fallback.length > 0) {
          setSelectedTable(fallback[0]);
          setCustomSql(`SELECT * FROM ${fallback[0]} LIMIT 25;`);
        } else {
          setSelectedTable('');
          setCustomSql(`SELECT 1;`);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingTables(false);
      });

    return () => { isMounted = false; };
  }, [selectedDb]);

  // When user selects a different table from dropdown, auto-generate query
  const handleSelectTable = (tbl: string) => {
    setSelectedTable(tbl);
    if (tbl) {
      setCustomSql(`SELECT * FROM ${tbl} LIMIT 25;`);
    }
  };

  // Quick Query Presets
  const handleQuickPreset = (preset: 'preview' | 'count' | 'recent') => {
    if (!selectedTable) return;
    let sql = '';
    if (preset === 'preview') {
      sql = `SELECT * FROM ${selectedTable} LIMIT 25;`;
    } else if (preset === 'count') {
      sql = `SELECT COUNT(*) AS total_records FROM ${selectedTable};`;
    } else if (preset === 'recent') {
      sql = `SELECT * FROM ${selectedTable} ORDER BY 1 DESC LIMIT 25;`;
    }
    setCustomSql(sql);
    handleExecuteRawSql(sql);
  };

  // Execute SQL statement with live mirror streaming
  const handleExecuteRawSql = async (overrideSql?: string) => {
    const sql = (overrideSql || customSql).trim();
    if (!currentDb || !sql) return;

    const trimmedUpper = sql.toUpperCase();
    const isUpdateOrDml = trimmedUpper.startsWith('UPDATE') || 
                          trimmedUpper.startsWith('INSERT') || 
                          trimmedUpper.startsWith('DELETE') || 
                          trimmedUpper.startsWith('DROP') || 
                          trimmedUpper.startsWith('ALTER') || 
                          trimmedUpper.startsWith('CREATE') || 
                          trimmedUpper.startsWith('TRUNCATE');

    if (isUpdateOrDml && !canUpdate) {
      alert('Access Denied: You do not have permission to execute UPDATE / DML statements.');
      return;
    }
    if (!isUpdateOrDml && !canSelect) {
      alert('Access Denied: You do not have permission to execute SELECT statements.');
      return;
    }

    setIsLoading(true);
    setQueryColumns([]);
    setQueryRows([]);
    setMirroredTable(null);
    setMirroredCount(0);

    const timestamp = new Date().toLocaleTimeString();
    const queryType = isUpdateOrDml ? 'UPDATE' : 'SELECT';

    const logs = [
      `[${timestamp}] Connection pipeline active: ${currentDb.name} (${currentDb.type || 'SQL Engine'})`,
      `[${timestamp}] Host: ${currentDb.host} • Table: ${selectedTable || 'Direct Query'}`,
      `[${timestamp}] SQL Payload (${queryType}): "${sql}"`
    ];

    try {
      if (currentDb.status === 'offline') {
        logs.push(`[ERROR] Direct TCP pipeline failure. Host ${currentDb.host} is offline or unreachable.`);
        setQueryLog(logs);
        setIsLoading(false);
        return;
      }

      logs.push(`[${timestamp}] Executing AST query planner against target database node...`);

      const res = await api.executeQuery({
        userId: currentUser.id,
        username: currentUser.username,
        userRole: currentUser.role,
        dbId: currentDb.id,
        dbName: currentDb.name,
        query: sql,
        tableName: selectedTable || undefined
      });

      const cols = res.columns || (res.rows && res.rows.length > 0 ? Object.keys(res.rows[0]) : []);
      const rows = res.rows || [];

      setQueryColumns(cols);
      setQueryRows(rows);
      setExecutionMs(res.executionTimeMs || 0);

      logs.push(`[${timestamp}] Query planner: Query executed in ${res.executionTimeMs || 0}ms.`);
      logs.push(`[SUCCESS] Returned ${rows.length} row(s) across ${cols.length} column(s).`);

      if (res.mirroredTable) {
        setMirroredTable(res.mirroredTable);
        setMirroredCount(res.mirroredCount || rows.length);
        logs.push(`[MIRROR SYNC] ✓ Successfully streamed ${res.mirroredCount || rows.length} row(s) into PostgreSQL UNLOGGED mirror table '${res.mirroredTable}'.`);
      }

      setQueryLog(logs);

      // Record query log
      if (onLogQueryExecution) {
        onLogQueryExecution({
          userId: currentUser.id,
          username: currentUser.username,
          userRole: currentUser.role,
          dbId: currentDb.id,
          dbName: currentDb.name,
          queryType,
          queryStatement: sql,
          executionTimeMs: res.executionTimeMs || 0
        });
      }
    } catch (err: any) {
      logs.push(`[ERROR] SQL execution error: ${err.message || 'Syntax or connection failure'}`);
      setQueryLog(logs);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyValue = (val: any, cellId: string) => {
    navigator.clipboard.writeText(String(val));
    setCopiedCell(cellId);
    setTimeout(() => setCopiedCell(null), 2000);
  };

  const handleLinkCaseFromRow = (row: Record<string, any>, idx: number) => {
    if (!onImportToIssue) return;
    const txn: Transaction = {
      id: String(row.id || row.fe_utrnno || row.utrnno || row.transaction_id || row.ref_num || `TXN-${idx + 1}`),
      cardNumber: String(row.hpan || row.card_number || row.pan || '—'),
      amount: parseFloat(row.amount || row.req_amt || row.tran_amount || '0') || 0,
      currency: String(row.currency || row.curr_code || 'USD'),
      responseCode: String(row.response_code || row.responce_code || '00'),
      merchant: String(row.terminal_id || row.merchant_id || row.merchant || selectedTable || 'EXTERNAL-DB'),
      timestamp: String(row.timestamp || row.tran_date || row.auth_time || new Date().toISOString()),
      status: (row.status_state || row.status || 'SETTLED').toUpperCase() as any,
      dbOrigin: currentDb?.name || 'External DB'
    };
    onImportToIssue(txn);
  };

  const handleOpenValidationModal = async () => {
    setShowValidationModal(true);
    setValidationJobResult(null);
    try {
      const wfs = await api.getWorkflows();
      setAvailableWorkflows(wfs || []);
      if (wfs && wfs.length > 0) {
        setSelectedWorkflowId(wfs[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load workflows:', err);
    }
  };

  const handleRunValidationWorkflow = async () => {
    if (!selectedWorkflowId || queryRows.length === 0) return;
    setIsValidating(true);
    try {
      const formattedRecords = queryRows.map((r, idx) => ({
        id: String(r.id || r.fe_utrnno || r.utrnno || r.transaction_id || r.ref_num || `REC-${idx + 1}`),
        retrieval_ref_num: String(r.fe_utrnno || r.utrnno || r.ref_num || r.id || ''),
        transaction_id: String(r.transaction_id || r.fe_utrnno || r.id || ''),
        card_number: String(r.hpan || r.card_number || r.pan || ''),
        amount: parseFloat(r.amount || r.req_amt || r.tran_amount || '0') || 0,
        currency: String(r.currency || r.curr_code || 'USD'),
        status: String(r.status_state || r.status || 'SUCCESS'),
        merchant_id: String(r.terminal_id || r.merchant_id || r.merchant || ''),
        ...r
      }));

      const res = await api.executeUniversalWorkflow({
        workflowId: selectedWorkflowId,
        records: formattedRecords,
        sourceType: 'QUERY_SANDBOX',
        sourceId: currentDb?.id
      });
      setValidationJobResult(res);
    } catch (err: any) {
      alert('Validation execution failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsValidating(false);
    }
  };

  const handleTestConnInDbQueryTool = async () => {
    setIsTestingConn(true);
    setTestResult(null);
    try {
      const res = await api.testConnection({
        type: newDbType,
        host: newDbHost,
        connectionString: newConnStr
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Network test failed' });
    } finally {
      setIsTestingConn(false);
    }
  };

  const handleCreateDatabaseConnection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDbName.trim()) return;

    onAddDatabase({
      name: newDbName.trim(),
      type: newDbType,
      host: newDbHost.trim() || 'localhost',
      status: 'online',
      apiEndpoint: newDbEndpoint.trim() || `/api/db/${newDbName.toLowerCase().replace(/\s+/g, '-')}`,
      description: newDbDesc.trim() || 'Internal Database',
      connectionString: newConnStr.trim() || undefined
    });

    setShowAddDbModal(false);
    setNewDbName('');
    setNewDbHost('');
    setNewConnStr('');
    setNewDbEndpoint('');
    setNewDbDesc('');
    setTestResult(null);
  };

  const handleSendAccessRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDb || !onRequestDbAccess) return;

    onRequestDbAccess({
      userId: currentUser.id,
      username: currentUser.username,
      userRole: currentUser.role,
      dbId: currentDb.id,
      dbName: currentDb.name,
      requestedPrivilege,
      reason: accessReason || 'Required for operational discrepancy investigation.'
    });

    setShowRequestAccessModal(false);
    setAccessReason('');
    setAccessMsg(`Access request to connection '${currentDb.name}' submitted to System Admin.`);
    setTimeout(() => setAccessMsg(null), 4000);
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 sm:p-4 space-y-3.5 shadow-sm" id="db-query-tool">
      
      {/* Tool Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2.5 gap-2.5">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-blue-50 text-[#155DFC] rounded-xl border border-blue-100">
            <Database size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">SQL Sandbox & Multi-Database Explorer</h3>
            <p className="text-[11px] text-slate-500">Query live physical databases with automatic PostgreSQL UNLOGGED mirror syncing.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Admin Add Connection Button */}
          {isAdmin && (
            <button
              onClick={() => setShowAddDbModal(true)}
              className="px-3 py-1.5 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-semibold rounded-lg text-xs flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
              id="btn-create-connection"
            >
              <Plus size={14} />
              <span>Create Connection</span>
            </button>
          )}

          {/* Request DB Access button if non-admin */}
          {!isAdmin && onRequestDbAccess && (
            <button
              onClick={() => setShowRequestAccessModal(true)}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100/80 text-[#155DFC] border border-blue-200 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <Key size={13} />
              <span>Request DB Access</span>
            </button>
          )}
        </div>
      </div>

      {accessMsg && (
        <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center gap-2 font-medium">
          <CheckCircle2 size={15} className="text-[#155DFC]" />
          <span>{accessMsg}</span>
        </div>
      )}

      {/* Connection Selector Tabs (Clean White Shades) */}
      <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
        <span className="text-[10px] font-bold text-slate-500 uppercase font-mono mr-1">ACTIVE DATABASES:</span>
        {databases.map(db => {
          const isAllowed = isAdmin || userAllowedDbs.includes(db.id);
          return (
            <button
              key={db.id}
              onClick={() => { 
                setSelectedDb(db.id); 
                setQueryColumns([]); 
                setQueryRows([]); 
                setQueryLog([]); 
                setMirroredTable(null);
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 border cursor-pointer ${
                selectedDb === db.id
                  ? 'bg-[#155DFC] text-white border-[#155DFC] shadow-xs font-bold'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900 shadow-2xs'
              }`}
              id={`tab-db-${db.id}`}
            >
              <span className={`w-2 h-2 rounded-full ${db.status === 'online' ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
              <span>{db.name}</span>
              <span className="text-[10px] opacity-75 font-mono">({db.type})</span>
              {!isAllowed && <Lock size={11} className="text-amber-500 ml-1" title="Access Permission Required" />}
            </button>
          );
        })}
      </div>

      {/* Main Query Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Side: Target Table & SQL Console */}
        <div className="lg:col-span-4 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
          
          <div className="flex justify-between items-center pb-2 border-b border-slate-200">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Table size={14} className="text-blue-600" />
              <span>Target Table & SQL Console</span>
            </h4>
            <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold border ${
              canSelect ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}>
              {canSelect ? 'SELECT ENABLED' : 'SELECT LOCKED'}
            </span>
          </div>

          {/* Database & Table Selectors */}
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1 font-mono">
                Selected Database Connection
              </label>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database size={13} className="text-blue-600" />
                  <span className="font-bold">{currentDb?.name}</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-500 font-mono text-[11px]">{currentDb?.type}</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">{currentDb?.host}</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider font-mono">
                  Select Table to Query
                </label>
                {loadingTables && (
                  <span className="text-[10px] text-blue-600 flex items-center gap-1">
                    <Loader2 size={10} className="animate-spin" />
                    <span>Harvesting tables...</span>
                  </span>
                )}
              </div>

              <select
                value={selectedTable}
                onChange={(e) => handleSelectTable(e.target.value)}
                disabled={loadingTables || availableTables.length === 0}
                className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
                id="select-sandbox-table"
              >
                {availableTables.length === 0 ? (
                  <option value="">{loadingTables ? 'Loading tables...' : 'No tables detected'}</option>
                ) : (
                  availableTables.map(tbl => (
                    <option key={tbl} value={tbl}>{tbl}</option>
                  ))
                )}
              </select>
              <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
                <span>{availableTables.length} tables available</span>
                {selectedTable && (
                  <span className="font-mono text-blue-600">Mirror: mirror_{currentDb?.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_{selectedTable.toLowerCase().replace(/[^a-z0-9]/g, '_')}</span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Query Presets */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider font-mono block">
              Quick Query Presets
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => handleQuickPreset('preview')}
                disabled={!selectedTable || isLoading}
                className="px-2 py-1.5 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 rounded-md text-[10px] font-semibold transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                title={`SELECT * FROM ${selectedTable} LIMIT 25`}
              >
                <Play size={10} className="text-blue-600" />
                <span>Preview 25</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('count')}
                disabled={!selectedTable || isLoading}
                className="px-2 py-1.5 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 rounded-md text-[10px] font-semibold transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                title={`SELECT COUNT(*) FROM ${selectedTable}`}
              >
                <Activity size={10} className="text-indigo-600" />
                <span>Count Total</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('recent')}
                disabled={!selectedTable || isLoading}
                className="px-2 py-1.5 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-200 rounded-md text-[10px] font-semibold transition flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                title={`SELECT * FROM ${selectedTable} ORDER BY 1 DESC LIMIT 25`}
              >
                <Clock size={10} className="text-amber-600" />
                <span>Recent 25</span>
              </button>
            </div>
          </div>

          {/* Raw SQL Editor (Modern High-Contrast Code Studio) */}
          <div className="border-t border-slate-200 pt-3 space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <FileCode size={13} className="text-[#155DFC]" />
                <span>SQL Statement Studio</span>
              </span>
              <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold border ${
                canUpdate ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}>
                {canUpdate ? 'DML PERMITTED' : 'DML RESTRICTED'}
              </span>
            </div>

            <div className="bg-[#060A14] border-2 border-slate-800/90 rounded-xl overflow-hidden shadow-xl ring-1 ring-white/5">
              <div className="bg-[#0A1020] px-3 py-1.5 border-b border-slate-800/90 flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span className="text-cyan-400 font-bold text-[10px]">query.sql</span>
                <span className="text-slate-500 text-[9px]">Ctrl + Enter to run</span>
              </div>
              <div className="flex min-h-[140px]">
                <div className="w-8 shrink-0 text-right pr-2 select-none text-slate-600 font-mono text-[11px] leading-relaxed border-r border-slate-800/90 bg-[#050811] pt-2.5">
                  {Array.from({ length: Math.max(customSql.split('\n').length, 5) }, (_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <textarea
                  rows={6}
                  value={customSql}
                  onChange={(e) => setCustomSql(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleExecuteRawSql();
                    }
                  }}
                  placeholder="SELECT * FROM table_name LIMIT 25;"
                  className="w-full bg-transparent p-2.5 text-xs font-mono text-[#4ADE80] focus:outline-none leading-relaxed placeholder:text-slate-600 caret-cyan-400 font-medium resize-y"
                  id="textarea-sandbox-sql"
                  spellCheck={false}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleExecuteRawSql()}
              disabled={isLoading || !customSql.trim()}
              className="w-full bg-gradient-to-r from-blue-600 to-[#155DFC] hover:from-blue-500 hover:to-blue-600 text-white font-mono py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-40 font-bold shadow-md hover:shadow-blue-500/20"
              id="btn-execute-sandbox-sql"
            >
              {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} className="fill-current text-white" />}
              <span>{isLoading ? 'Executing & Mirroring...' : 'Execute SQL Statement'}</span>
            </button>
          </div>

          {/* Mirroring Architecture Notice */}
          <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-lg text-[11px] text-emerald-900 leading-relaxed space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-emerald-800 font-mono">
              <Shield size={13} className="text-emerald-600" />
              <span>Automatic PostgreSQL Mirror Sync</span>
            </div>
            <p className="text-[10px] text-emerald-700">
              When a SELECT query executes, rows are dynamically ingested into typed PostgreSQL UNLOGGED mirror tables (<code className="font-mono font-bold text-emerald-800">mirror_{'{db}_{table}'}</code>) for microsecond set-based joins.
            </p>
          </div>
        </div>

        {/* Right Side: Log Feed & Dynamic Results Table */}
        <div className="lg:col-span-8 flex flex-col space-y-4">
          
          {/* Query Live Console (Clean White Shades) */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 font-mono text-[10px] text-slate-700 space-y-1.5 shadow-2xs">
            <div className="flex items-center space-x-1.5 text-blue-700 border-b border-slate-200 pb-1.5 mb-1.5 font-bold">
              <Terminal size={12} className="text-[#155DFC]" />
              <span>Query Execution & Mirror Pipeline Console ({currentDb?.name})</span>
            </div>
            {queryLog.length === 0 ? (
              <span className="text-slate-400">Console idle. Select a table or execute an SQL statement to view pipeline telemetry...</span>
            ) : (
              queryLog.map((log, index) => (
                <div
                  key={index}
                  className={
                    log.includes('[ERROR]') ? 'text-rose-600 font-bold' :
                    log.includes('[MIRROR SYNC]') ? 'text-emerald-700 font-bold' :
                    log.includes('[SUCCESS]') ? 'text-emerald-700 font-semibold' :
                    'text-slate-600'
                  }
                >
                  {log}
                </div>
              ))
            )}
          </div>

          {/* Dynamic Results Table */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex-grow shadow-sm flex flex-col">
            
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center space-x-2.5 flex-wrap">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Table size={14} className="text-blue-600" />
                  <span>Query Results Grid:</span>
                  <span className="font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                    {selectedTable || currentDb?.name}
                  </span>
                </span>
                
                <span className="text-[10px] text-slate-500 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                  {queryRows.length} Rows • {queryColumns.length} Cols • {executionMs}ms
                </span>

                {mirroredTable && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-in fade-in" id="badge-mirror-synced">
                    <CheckCircle2 size={11} className="text-emerald-600" />
                    <span>Mirrored to PostgreSQL: <strong>{mirroredTable}</strong> ({mirroredCount} rows)</span>
                  </span>
                )}
              </div>

              {queryRows.length > 0 && (
                <button
                  type="button"
                  onClick={handleOpenValidationModal}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
                  id="btn-run-validation-workflow"
                >
                  <Zap size={13} className="text-amber-300" />
                  <span>Run Validation Workflow</span>
                </button>
              )}
            </div>

            {queryRows.length === 0 ? (
              <div className="p-16 text-center text-slate-400 space-y-3">
                <Table size={32} className="mx-auto text-slate-300" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-600">No query results loaded yet.</p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    Select a table from the left dropdown or click <strong className="text-slate-600">&quot;Preview 25&quot;</strong> to view real physical records and stream them into PostgreSQL.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[640px] min-h-[350px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-100 z-10 border-b border-slate-200">
                    <tr className="text-[10px] font-mono text-slate-600 font-bold uppercase tracking-wider">
                      <th className="p-3 text-center w-12 bg-slate-100">#</th>
                      {queryColumns.map(col => (
                        <th key={col} className="p-3 whitespace-nowrap bg-slate-100">
                          {col}
                        </th>
                      ))}
                      {onImportToIssue && (
                        <th className="p-3 text-center whitespace-nowrap bg-slate-100">ACTION</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {queryRows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-blue-50/30 transition-colors">
                        <td className="p-3 text-center text-slate-400 text-[10px]">
                          {rowIdx + 1}
                        </td>
                        {queryColumns.map(col => {
                          const val = row[col];
                          const cellId = `${rowIdx}-${col}`;
                          const isCopied = copiedCell === cellId;
                          const isNull = val === null || val === undefined;
                          const isNumber = typeof val === 'number';
                          const displayStr = isNull ? '—' : String(val);

                          return (
                            <td 
                              key={col} 
                              className={`p-3 whitespace-nowrap max-w-[240px] truncate ${
                                isNull ? 'text-slate-300 italic' : 
                                isNumber ? 'text-indigo-900 font-semibold text-right' : 
                                'text-slate-800'
                              }`}
                              title={String(val ?? '')}
                              onClick={() => !isNull && handleCopyValue(val, cellId)}
                            >
                              <div className="flex items-center justify-between gap-1 group">
                                <span className="truncate">{displayStr}</span>
                                {!isNull && (
                                  <span className="opacity-0 group-hover:opacity-100 transition text-slate-400 cursor-pointer">
                                    {isCopied ? <Check size={10} className="text-emerald-600" /> : <Copy size={10} />}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        {onImportToIssue && (
                          <td className="p-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleLinkCaseFromRow(row, rowIdx)}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-600 hover:text-white border border-blue-200 text-blue-700 text-[10px] rounded-md font-medium transition-all flex items-center space-x-1 mx-auto cursor-pointer"
                              title="Link row to an investigation issue"
                            >
                              <ArrowRight size={10} />
                              <span>Link Case</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Validation Workflow Execution Modal */}
      {showValidationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30">
                  <Zap size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">Run Workflow Validation on Query Results</h3>
                  <p className="text-[11px] text-slate-400">
                    Dispatches {queryRows.length} physical records from {selectedTable || currentDb?.name} into the validation engine.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowValidationModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-grow text-xs">
              {/* Workflow Picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                  <Layers size={13} className="text-blue-500" />
                  <span>Select Active Validation Workflow:</span>
                </label>
                <select
                  value={selectedWorkflowId}
                  onChange={(e) => setSelectedWorkflowId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  id="select-validation-workflow"
                >
                  {availableWorkflows.map(wf => (
                    <option key={wf.id} value={wf.id}>{wf.name} ({wf.type || 'RECONCILIATION'})</option>
                  ))}
                </select>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleRunValidationWorkflow}
                  disabled={isValidating || !selectedWorkflowId}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center space-x-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  id="btn-execute-universal-validation"
                >
                  {isValidating ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-white" />
                      <span>Executing Universal Validation Flow...</span>
                    </>
                  ) : (
                    <>
                      <Play size={13} />
                      <span>Execute Workflow Validation on {queryRows.length} Rows</span>
                    </>
                  )}
                </button>
              </div>

              {/* Validation Results Report */}
              {validationJobResult && (
                <div className="space-y-3 pt-3 border-t border-slate-200 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Validation Execution Verdict</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      validationJobResult.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {validationJobResult.status}
                    </span>
                  </div>

                  {/* Summary Metric Counters */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="text-[10px] text-slate-500 font-medium">Total Rows</div>
                      <div className="text-sm font-bold text-slate-800 font-mono">{validationJobResult.totalRecords}</div>
                    </div>
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <div className="text-[10px] text-emerald-700 font-medium">Passed</div>
                      <div className="text-sm font-bold text-emerald-700 font-mono">{validationJobResult.passedCount}</div>
                    </div>
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl">
                      <div className="text-[10px] text-rose-700 font-medium">Failed</div>
                      <div className="text-sm font-bold text-rose-700 font-mono">{validationJobResult.failedCount}</div>
                    </div>
                    <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-xl">
                      <div className="text-[10px] text-sky-700 font-medium">Cache Hits</div>
                      <div className="text-sm font-bold text-sky-700 font-mono">{validationJobResult.cachedHits || 0}</div>
                    </div>
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                      <div className="text-[10px] text-amber-700 font-medium">Duration</div>
                      <div className="text-sm font-bold text-amber-800 font-mono">{validationJobResult.durationMs}ms</div>
                    </div>
                  </div>

                  {/* Validated Records Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-slate-50 text-slate-500 font-mono border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="p-2">RECORD ID</th>
                          <th className="p-2">AMOUNT</th>
                          <th className="p-2 text-center">VERDICT</th>
                          <th className="p-2">DETAILS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {(validationJobResult.records || []).slice(0, 50).map((r: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50/60">
                            <td className="p-2 font-bold text-slate-800">
                              {r.retrieval_ref_num || r.transaction_id || r.id || `REC-${idx + 1}`}
                            </td>
                            <td className="p-2 text-slate-600">
                              ${Number(r.amount || 0).toFixed(2)}
                            </td>
                            <td className="p-2 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                r._validation_status === 'PASS'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}>
                                {r._validation_status || 'PENDING'}
                              </span>
                            </td>
                            <td className="p-2 text-slate-500 truncate max-w-xs text-[10px]">
                              {r._validation_details ? JSON.stringify(r._validation_details) : 'Rule criteria verified'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowValidationModal(false)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal: Admin Add Database Connection */}
      {showAddDbModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Database className="text-blue-600" size={18} />
                <span>Create Database Connection for Users</span>
              </h4>
              <button onClick={() => setShowAddDbModal(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>

            <form onSubmit={handleCreateDatabaseConnection} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 font-mono mb-1">CONNECTION NAME</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Core Banking Prod Oracle"
                  value={newDbName}
                  onChange={(e) => setNewDbName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 font-mono mb-1">DB ENGINE</label>
                  <select
                    value={newDbType}
                    onChange={(e) => setNewDbType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-mono"
                  >
                    <option value="PostgreSQL">PostgreSQL</option>
                    <option value="MySQL">MySQL</option>
                    <option value="MongoDB">MongoDB</option>
                    <option value="Oracle">Oracle (Mock)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 font-mono mb-1">HOST / IP</label>
                  <input
                    type="text"
                    placeholder="localhost or 10.0.0.5"
                    value={newDbHost}
                    onChange={(e) => setNewDbHost(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 font-mono mb-1">CONNECTION STRING / URI (OPTIONAL)</label>
                <input
                  type="text"
                  placeholder="postgresql://user:pass@host:5432/dbname"
                  value={newConnStr}
                  onChange={(e) => setNewConnStr(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono text-[11px]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 font-mono mb-1">DESCRIPTION</label>
                <textarea
                  rows={2}
                  placeholder="Short explanation for users..."
                  value={newDbDesc}
                  onChange={(e) => setNewDbDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {testResult && (
                <div className={`p-2.5 rounded-lg text-xs font-mono space-y-1 ${
                  testResult.success ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'
                }`}>
                  <div className="flex items-center justify-between font-bold">
                    <span>{testResult.success ? '✓ Connection Succeeded' : '✗ Connection Failed'}</span>
                    {testResult.pingMs ? <span>{testResult.pingMs}ms</span> : null}
                  </div>
                  <p className="text-[11px] leading-tight">{testResult.message}</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleTestConnInDbQueryTool}
                  disabled={isTestingConn}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Zap size={12} className={isTestingConn ? 'animate-spin text-amber-400' : 'text-amber-400'} />
                  <span>{isTestingConn ? 'Testing...' : 'Test Connection'}</span>
                </button>

                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAddDbModal(false)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-sm"
                  >
                    Create Connection
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Request Access to DB */}
      {showRequestAccessModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Key className="text-blue-600" size={18} />
                <span>Request Connection Access: {currentDb?.name}</span>
              </h4>
              <button onClick={() => setShowRequestAccessModal(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>

            <form onSubmit={handleSendAccessRequest} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 font-mono mb-1">REQUESTED PRIVILEGE LEVEL</label>
                <select
                  value={requestedPrivilege}
                  onChange={(e) => setRequestedPrivilege(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono"
                >
                  <option value="SELECT">SELECT Read Access Only</option>
                  <option value="UPDATE">UPDATE / DML Execution Privilege</option>
                  <option value="FULL">FULL Administrative Access</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 font-mono mb-1">BUSINESS JUSTIFICATION</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain why you need access to this database connection..."
                  value={accessReason}
                  onChange={(e) => setAccessReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRequestAccessModal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs cursor-pointer shadow-sm"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
