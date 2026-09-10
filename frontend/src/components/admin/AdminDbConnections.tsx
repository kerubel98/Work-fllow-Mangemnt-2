import React, { useState } from 'react';
import { DatabaseConnection } from '../../types';
import { 
  Database, Wifi, WifiOff, Plus, Trash2, Edit3, 
  CheckCircle, Play, X, RefreshCw, Server, Key,
  Table, CheckSquare, Square, ShieldCheck, FolderDown, FileSpreadsheet
} from 'lucide-react';
import { api } from '../../api/client';

interface AdminDbConnectionsProps {
  databases?: DatabaseConnection[];
  onAddDatabase: (newDb: Omit<DatabaseConnection, 'id'>) => void;
  onToggleDbStatus: (dbId: string) => void;
  onDeleteDb: (dbId: string) => void;
  onUpdateDb?: (dbId: string, updates: Partial<DatabaseConnection>) => void;
  onOpenFtpStaging?: (dbId: string) => void;
}

export default function AdminDbConnections({
  databases = [],
  onAddDatabase,
  onToggleDbStatus,
  onDeleteDb,
  onUpdateDb,
  onOpenFtpStaging
}: AdminDbConnectionsProps) {
  const dbList = Array.isArray(databases) ? databases : [];
  const [isAdding, setIsAdding] = useState(false);
  const [testingDbId, setTestingDbId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string; pingMs?: number }>>({});

  // New DB Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<DatabaseConnection['type']>('PostgreSQL');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState(5432);
  const [databaseName, setDatabaseName] = useState('cbs_master');
  const [username, setUsername] = useState('postgres');
  const [password, setPassword] = useState('');
  const [connString, setConnString] = useState('');

  const handleTypeChange = (newType: DatabaseConnection['type']) => {
    setType(newType);
    if (newType === 'PostgreSQL') {
      setPort(5432);
      if (databaseName === '/' || databaseName.startsWith('/')) setDatabaseName('cbs_master');
      if (username === 'anonymous' || username === 'root') setUsername('postgres');
    } else if (newType === 'MySQL') {
      setPort(3306);
      if (databaseName === '/' || databaseName.startsWith('/')) setDatabaseName('payment_switch');
      if (username === 'anonymous' || username === 'postgres') setUsername('root');
    } else if (newType === 'Oracle') {
      setPort(1521);
      if (databaseName === '/' || databaseName.startsWith('/')) setDatabaseName('ORCL');
      if (username === 'anonymous') setUsername('system');
    } else if (newType === 'MongoDB') {
      setPort(27017);
      if (databaseName === '/' || databaseName.startsWith('/')) setDatabaseName('operational_workflow_db');
    } else if (newType === 'FTP') {
      setPort(21);
      setDatabaseName('/');
      if (username === 'postgres' || username === 'root') setUsername('anonymous');
    } else if (newType === 'SFTP') {
      setPort(22);
      setDatabaseName('/');
      if (username === 'postgres' || username === 'root') setUsername('sftp_user');
    }
  };

  // Table Management Modal state
  const [managingTablesDb, setManagingTablesDb] = useState<DatabaseConnection | null>(null);
  const [discoveredTables, setDiscoveredTables] = useState<string[]>([]);
  const [selectedAllowedTables, setSelectedAllowedTables] = useState<string[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isSavingTables, setIsSavingTables] = useState(false);
  const [tableActionMessage, setTableActionMessage] = useState<string | null>(null);

  const handleOpenTableManager = async (db: DatabaseConnection) => {
    setManagingTablesDb(db);
    setSelectedAllowedTables(db.allowedTables || []);
    setDiscoveredTables(db.availableTables || db.allowedTables || []);
    setTableActionMessage(null);
    try {
      const res = await api.getDatabaseTables(db.id);
      if (res && res.availableTables) {
        setDiscoveredTables(res.availableTables);
        setSelectedAllowedTables(res.allowedTables || []);
      }
    } catch {
      // ignore
    }
  };

  const handleDiscoverTables = async () => {
    if (!managingTablesDb) return;
    setIsDiscovering(true);
    setTableActionMessage(null);
    try {
      const res = await api.discoverDatabaseTables(managingTablesDb.id);
      if (res.success && res.availableTables) {
        setDiscoveredTables(res.availableTables);
        if (res.allowedTables && res.allowedTables.length > 0) {
          setSelectedAllowedTables(res.allowedTables);
        }
        setTableActionMessage(`Found ${res.availableTables.length} tables in ${managingTablesDb.name}.`);
      }
    } catch (err: any) {
      setTableActionMessage(`Discovery warning: ${err.message}`);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleToggleTableAllowed = (tableName: string) => {
    setSelectedAllowedTables(prev => 
      prev.includes(tableName) ? prev.filter(t => t !== tableName) : [...prev, tableName]
    );
  };

  const handleSaveAllowedTables = async () => {
    if (!managingTablesDb) return;
    setIsSavingTables(true);
    try {
      await api.updateDatabaseAllowedTables(managingTablesDb.id, selectedAllowedTables);
      onUpdateDb?.(managingTablesDb.id, {
        allowedTables: selectedAllowedTables,
        availableTables: discoveredTables
      });
      setTableActionMessage('Allowed tables saved successfully!');
      setTimeout(() => {
        setManagingTablesDb(null);
        setTableActionMessage(null);
      }, 1200);
    } catch (err: any) {
      setTableActionMessage(`Save error: ${err.message}`);
    } finally {
      setIsSavingTables(false);
    }
  };

  const handleTestConnection = async (db: DatabaseConnection) => {
    setTestingDbId(db.id);
    try {
      const res = await api.testConnection({
        dbId: db.id,
        type: db.type,
        host: db.host,
        port: db.port,
        connectionString: db.connectionString,
        databaseName: db.databaseName,
        username: db.username
      });
      setTestResults(prev => ({
        ...prev,
        [db.id]: { success: res.success, message: res.message, pingMs: res.pingMs }
      }));
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [db.id]: { success: false, message: err.message || 'Connection test failed' }
      }));
    } finally {
      setTestingDbId(null);
    }
  };

  const handleCreateDb = (e: React.FormEvent) => {
    e.preventDefault();
    onAddDatabase({
      name,
      type,
      host,
      port: Number(port),
      databaseName,
      username,
      password,
      connectionString: connString,
      status: 'online',
      apiEndpoint: `https://api.paymentops.internal/db/${name.toLowerCase().replace(/\s+/g, '-')}`,
      createdByAdmin: true,
      requiresAccessApproval: false,
      lastTestedAt: new Date().toISOString(),
      lastTestStatus: 'success',
      pingMs: 15
    });

    setIsAdding(false);
    setName('');
    setPassword('');
  };

  return (
    <div className="space-y-6">
      {/* Header & Add Action */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Database Connection Endpoints</h2>
          <p className="text-xs text-slate-500">Configure connection pools, socket timeouts, and operational privileges</p>
        </div>

        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Register New Database</span>
        </button>
      </div>

      {/* Database Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {dbList.map((db) => {
          const testRes = testResults[db.id];
          const isOnline = db.status === 'online';
          const isFtp = db.type === 'FTP' || db.type === 'SFTP';

          return (
            <div
              key={db.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col justify-between hover:border-slate-300 transition"
            >
              <div>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${isFtp ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-600'}`}>
                      {isFtp ? <FolderDown className="w-5 h-5" /> : <Database className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm leading-snug">{db.name}</h3>
                      <span className="text-[11px] font-semibold text-slate-500 font-mono">
                        {db.type} • {db.host}:{db.port || (isFtp ? (db.type === 'SFTP' ? 22 : 21) : 5432)}
                      </span>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                    isOnline ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-rose-100 text-rose-700 border border-rose-200'
                  }`}>
                    {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {db.status}
                  </span>
                </div>

                <div className="space-y-1 my-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-mono text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{isFtp ? 'Directory:' : 'Database:'}</span>
                    <span className="font-semibold text-slate-800">{db.databaseName || (isFtp ? '/' : 'master')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">User:</span>
                    <span className="text-slate-800">@{db.username || (isFtp ? 'anonymous' : 'postgres')}</span>
                  </div>
                </div>

                {testRes && (
                  <div className={`p-2 rounded text-[11px] font-mono leading-tight mb-3 ${
                    testRes.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}>
                    {testRes.success ? `Connected (${testRes.pingMs}ms latency)` : testRes.message}
                  </div>
                )}

                {/* Workspace Tables or File Staging Row */}
                {isFtp ? (
                  <div className="flex items-center justify-between my-2 p-2 bg-purple-50/80 rounded-lg border border-purple-200 text-xs">
                    <div className="flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-purple-700" />
                      <span className="text-[11px] font-semibold text-purple-900">File Staging:</span>
                      <span className="px-1.5 py-0.2 bg-purple-200/70 text-purple-800 rounded font-mono text-[10px] font-bold">
                        Parser Ready
                      </span>
                    </div>
                    {onOpenFtpStaging ? (
                      <button
                        type="button"
                        onClick={() => onOpenFtpStaging(db.id)}
                        className="text-[11px] px-2 py-1 bg-purple-700 hover:bg-purple-800 text-white rounded font-bold transition cursor-pointer shadow-xs flex items-center gap-1"
                      >
                        <span>Configure Staging</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenTableManager(db)}
                        className="text-[11px] px-2 py-1 bg-white hover:bg-purple-100 text-purple-800 border border-purple-200 rounded font-bold transition cursor-pointer"
                      >
                        Files / Tables
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between my-2 p-2 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Table className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-[11px] font-semibold text-slate-700">Workspace Tables:</span>
                      <span className="px-1.5 py-0.2 bg-blue-100/70 text-blue-800 rounded font-mono text-[10px] font-bold">
                        {db.allowedTables?.length || 0} Allowed
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenTableManager(db)}
                      className="text-[11px] px-2 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded font-bold transition cursor-pointer shadow-2xs"
                    >
                      Manage Tables
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleTestConnection(db)}
                  disabled={testingDbId === db.id}
                  className="text-xs px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold flex items-center gap-1 transition"
                >
                  <RefreshCw className={`w-3 h-3 ${testingDbId === db.id ? 'animate-spin' : ''}`} />
                  <span>Test Ping</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onToggleDbStatus(db.id)}
                    className="text-xs px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition"
                  >
                    {isOnline ? 'Set Offline' : 'Set Online'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Delete database endpoint ${db.name}?`)) {
                        onDeleteDb(db.id);
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Register Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                <span>Register Database Endpoint</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDb} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Core Retail Banking DB"
                  required
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Engine / Protocol Type</label>
                  <select
                    value={type}
                    onChange={(e) => handleTypeChange(e.target.value as any)}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="PostgreSQL">PostgreSQL</option>
                    <option value="MySQL">MySQL</option>
                    <option value="Oracle">Oracle</option>
                    <option value="MongoDB">MongoDB</option>
                    <option value="FTP">FTP Server (File Transfer Protocol)</option>
                    <option value="SFTP">SFTP Server (SSH File Transfer Protocol)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Host / IP / Domain</label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder={type === 'FTP' || type === 'SFTP' ? 'e.g. ftp.bankclearing.internal' : '127.0.0.1'}
                    required
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Port</label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    required
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {type === 'FTP' || type === 'SFTP' ? 'Remote Directory / Path' : 'Database Name'}
                  </label>
                  <input
                    type="text"
                    value={databaseName}
                    onChange={(e) => setDatabaseName(e.target.value)}
                    placeholder={type === 'FTP' || type === 'SFTP' ? 'e.g. /clearing_feeds or /' : 'e.g. cbs_master'}
                    required
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                >
                  Register Database
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table Management & Allowlisting Modal */}
      {managingTablesDb && (() => {
        const isFtpModal = managingTablesDb.type === 'FTP' || managingTablesDb.type === 'SFTP';
        return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  {isFtpModal ? <FolderDown className="w-5 h-5 text-amber-600" /> : <Table className="w-5 h-5 text-blue-600" />}
                  <span>{isFtpModal ? 'Allowed Remote Data Files' : 'Allowed Workspace Tables'}</span>
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {managingTablesDb.name} ({managingTablesDb.type})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManagingTablesDb(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              {isFtpModal
                ? 'Query the connected FTP/SFTP server for available settlement clearing data files (.csv, .tsv, .json) and select which files are allowed for workspace investigations.'
                : 'Query the connected database for available tables and select which tables are allowed to be added for workspace investigations and rule execution.'}
            </p>

            {tableActionMessage && (
              <div className="p-2.5 bg-blue-50 border border-blue-200 text-blue-800 text-xs rounded-lg font-medium flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{tableActionMessage}</span>
              </div>
            )}

            {/* Top action bar: Discover & Select all */}
            <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={handleDiscoverTables}
                disabled={isDiscovering}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isDiscovering ? 'animate-spin' : ''}`} />
                <span>{isDiscovering ? 'Inspecting...' : (isFtpModal ? 'Query / Discover Remote Files' : 'Query / Discover DB Tables')}</span>
              </button>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedAllowedTables([...discoveredTables])}
                  className="text-blue-700 hover:underline font-semibold text-[11px] cursor-pointer"
                >
                  Allow All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedAllowedTables([])}
                  className="text-slate-500 hover:underline font-semibold text-[11px] cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Tables / Files checklist */}
            <div className="space-y-1 max-h-60 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-white">
              {discoveredTables.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 space-y-2">
                  {isFtpModal ? <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto" /> : <Table className="w-8 h-8 text-slate-300 mx-auto" />}
                  <p>{isFtpModal ? 'No remote files discovered yet.' : 'No tables discovered yet.'}</p>
                  <p className="text-[11px] text-slate-500">
                    Click &ldquo;{isFtpModal ? 'Query / Discover Remote Files' : 'Query / Discover DB Tables'}&rdquo; above to inspect the {isFtpModal ? 'FTP directory' : 'database'}.
                  </p>
                </div>
              ) : (
                discoveredTables.map(tName => {
                  const isChecked = selectedAllowedTables.includes(tName);
                  return (
                    <label
                      key={tName}
                      className={`flex items-center justify-between p-2 rounded-lg text-xs transition cursor-pointer border ${
                        isChecked
                          ? 'bg-blue-50/70 border-blue-200 text-blue-900 font-semibold'
                          : 'bg-white border-transparent text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleTableAllowed(tName)}
                          className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="font-mono text-xs">{tName}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase font-mono ${
                        isChecked
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {isChecked ? 'Allowed' : 'Hidden'}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-xs text-slate-500 font-medium">
                {selectedAllowedTables.length} of {discoveredTables.length} {isFtpModal ? 'files allowed' : 'tables allowed'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setManagingTablesDb(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAllowedTables}
                  disabled={isSavingTables}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSavingTables ? 'Saving...' : (isFtpModal ? 'Save Allowed Files' : 'Save Allowed Tables')}
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
