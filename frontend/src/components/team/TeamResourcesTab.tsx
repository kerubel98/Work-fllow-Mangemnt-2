import React, { useState } from 'react';
import { DatabaseConnection, Team, User } from '../../types';
import { 
  Database, Plus, RefreshCw, Activity, Copy, 
  Check, Table, Server, Key, ExternalLink, Code2, Layers, Search
} from 'lucide-react';
import { NoResourcesEmptyState } from './TeamEmptyStates';
import { TeamStagedAssetsConsole } from './TeamStagedAssetsConsole';
import { Boxes, ShieldCheck } from 'lucide-react';

interface LibraryTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  sql: string;
  targetDb: string;
  authorName: string;
  createdAt: string;
}

interface TeamResourcesTabProps {
  currentTeam: Team;
  teamDatabases: DatabaseConnection[];
  libraryTemplates: LibraryTemplate[];
  currentUser: User;
  onAddDatabaseClick?: () => void;
  onTestConnection?: (db: DatabaseConnection) => void;
  onInspectTables?: (db: DatabaseConnection) => void;
  monitoringDbs?: Record<string, { testing: boolean; pingMs?: number; success?: boolean; message?: string }>;
}

export const TeamResourcesTab: React.FC<TeamResourcesTabProps> = ({
  currentTeam,
  teamDatabases = [],
  libraryTemplates = [],
  currentUser,
  onAddDatabaseClick,
  onTestConnection,
  onInspectTables,
  monitoringDbs = {}
}) => {
  const safeDatabases = Array.isArray(teamDatabases) ? teamDatabases : [];
  const safeTemplates = Array.isArray(libraryTemplates) ? libraryTemplates : [];
  const [subView, setSubView] = useState<'databases' | 'library' | 'staged'>('databases');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleCopySql = (id: string, sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredDatabases = safeDatabases.filter(d => 
    (d.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.type || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.host || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTemplates = safeTemplates.filter(t => 
    (t.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.category || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.sql || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4 font-sans" id="team-resources-tab">
      {/* Top Controls Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Layers size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-mono">Scoped Resources & Data</h3>
            <p className="text-[11px] text-slate-500 font-mono">
              Databases and query templates allocated to @{currentTeam?.name || 'team'}
            </p>
          </div>
        </div>

        {/* Sub-view switcher & Action */}
        <div className="flex items-center space-x-2.5">
          <div className="flex bg-slate-100 p-1 rounded-xl font-mono text-xs">
            <button
              type="button"
              onClick={() => setSubView('databases')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                subView === 'databases' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Databases ({safeDatabases.length})
            </button>
            <button
              type="button"
              onClick={() => setSubView('library')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                subView === 'library' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Query Library ({safeTemplates.length})
            </button>
            <button
              type="button"
              onClick={() => setSubView('staged')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                subView === 'staged' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Staged Assets &amp; Verification
            </button>
          </div>

          {onAddDatabaseClick && subView === 'databases' && (
            <button
              type="button"
              onClick={onAddDatabaseClick}
              className="px-3 py-1.5 bg-[#155DFC] hover:bg-blue-700 text-white font-mono font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Plus size={13} />
              <span>Attach Database</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder={subView === 'databases' ? 'Search databases...' : 'Search query templates...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500 shadow-2xs"
        />
      </div>

      {/* Sub-View: Databases (Summary + Drill-In Pattern) */}
      {subView === 'databases' && (
        filteredDatabases.length === 0 ? (
          <NoResourcesEmptyState onAddResource={onAddDatabaseClick} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredDatabases.map(db => {
              const monitor = monitoringDbs[db.id];
              const isTesting = monitor?.testing;

              return (
                <div 
                  key={db.id}
                  className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-mono font-bold text-xs shrink-0">
                        <Server size={16} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 font-mono text-xs truncate">{db.name}</h4>
                        <p className="text-[11px] text-slate-400 font-mono truncate">{db.type || 'PostgreSQL'} • {db.host}:{db.port || 5432}</p>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0 ${
                      monitor?.success !== false && db.status !== 'offline'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        monitor?.success !== false && db.status !== 'offline' ? 'bg-emerald-500' : 'bg-red-500'
                      }`} />
                      <span>{monitor?.pingMs ? `${monitor.pingMs}ms` : (db.status || 'Active')}</span>
                    </span>
                  </div>

                  {db.database && (
                    <div className="text-[11px] font-mono text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-100 flex items-center justify-between">
                      <span>Database: <strong className="text-slate-800">{db.database}</strong></span>
                      <span className="text-slate-400">{db.user || 'admin'}</span>
                    </div>
                  )}

                  {/* Actions: Test Connection + Drill-in Inspect */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    {onTestConnection && (
                      <button
                        type="button"
                        onClick={() => onTestConnection(db)}
                        disabled={isTesting}
                        className="text-[11px] font-mono font-bold text-slate-600 hover:text-blue-600 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw size={12} className={isTesting ? 'animate-spin' : ''} />
                        <span>{isTesting ? 'Testing...' : 'Live Ping'}</span>
                      </button>
                    )}

                    {onInspectTables && (
                      <button
                        type="button"
                        onClick={() => onInspectTables(db)}
                        className="text-[11px] font-mono font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Table size={12} />
                        <span>Inspect Tables</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Sub-View: Query Library */}
      {subView === 'library' && (
        filteredTemplates.length === 0 ? (
          <div className="p-8 bg-white rounded-2xl border border-slate-200 text-center text-slate-400 font-mono text-xs">
            No query templates found matching your search.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredTemplates.map(tmpl => {
              const isCopied = copiedId === tmpl.id;

              return (
                <div 
                  key={tmpl.id}
                  className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-2.5 flex flex-col justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-xs text-slate-900 font-mono">{tmpl.title}</h4>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 shrink-0">
                        {tmpl.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">{tmpl.description}</p>
                  </div>

                  {/* SQL Code Block */}
                  <div className="relative bg-slate-900 text-slate-100 p-2.5 rounded-xl font-mono text-[11px] overflow-x-auto">
                    <code>{tmpl.sql}</code>
                    <button
                      type="button"
                      onClick={() => handleCopySql(tmpl.id, tmpl.sql)}
                      className="absolute top-2 right-2 p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors cursor-pointer"
                      title="Copy SQL"
                    >
                      {isCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1">
                    <span>Target: {tmpl.targetDb}</span>
                    <span>By: @{tmpl.authorName}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Sub-View: Staged Assets & Verification */}
      {subView === 'staged' && (
        <TeamStagedAssetsConsole currentTeam={currentTeam} currentUser={currentUser} />
      )}
    </div>
  );
};
