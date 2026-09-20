/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Server, Database, CheckCircle2, XCircle, Clock, AlertTriangle, 
  Search, RefreshCw, Check, X, ShieldAlert, ArrowUpRight, 
  ExternalLink, Layers, Filter, Activity, Users, Send, MessageSquare
} from 'lucide-react';
import { DatabaseConnection, Team, User } from '../types';
import { api } from '../api/client';
import ErrorBoundary from './ErrorBoundary';

interface AdminTeamResourcesMonitorProps {
  currentUser: User;
  teams: Team[];
  databases: DatabaseConnection[];
  onRefreshDatabases?: () => void;
  onNavigateToWorkspace?: () => void;
}

export default function AdminTeamResourcesMonitor({
  currentUser,
  teams = [],
  databases = [],
  onRefreshDatabases,
  onNavigateToWorkspace
}: AdminTeamResourcesMonitorProps) {
  const [teamResources, setTeamResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'TEAM_ONLY'>('ALL');
  
  // Live socket ping testing states
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; pingMs: number; message: string }>>({});

  // Review modal states
  const [reviewingDb, setReviewingDb] = useState<any | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reviewNotes, setReviewNotes] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadResources = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminTeamResources();
      setTeamResources(data);
    } catch (err: any) {
      console.warn('Error loading admin team resources:', err.message);
      // Fallback: derive from databases prop
      const teamDbs = databases.filter(d => d.scope === 'team' || (d.promotionStatus && d.promotionStatus !== 'NONE'));
      const teamMap = new Map(teams.map(t => [t.id, t]));
      setTeamResources(teamDbs.map(d => ({
        ...d,
        teamName: d.teamId ? teamMap.get(d.teamId)?.name || 'Team' : 'Global',
        teamManagerName: d.teamId ? teamMap.get(d.teamId)?.managerName || 'Manager' : 'Admin'
      })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResources();
  }, [databases.length]);

  // Test single connection ping
  const handleTestConnection = async (db: any) => {
    setTestingId(db.id);
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
        [db.id]: {
          success: res.success,
          pingMs: res.pingMs,
          message: res.message
        }
      }));
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [db.id]: {
          success: false,
          pingMs: 0,
          message: err.message || 'Connection test failed'
        }
      }));
    } finally {
      setTestingId(null);
    }
  };

  // Submit promotion review (APPROVE or REJECT)
  const handleSubmitReview = async () => {
    if (!reviewingDb) return;
    setIsSubmittingReview(true);
    try {
      await api.reviewTeamDatabasePromotion(
        reviewingDb.id,
        reviewAction,
        currentUser.id,
        reviewNotes.trim() || undefined
      );

      setFeedbackMsg({
        type: 'success',
        text: `Connection "${reviewingDb.name}" successfully ${reviewAction === 'APPROVE' ? 'promoted to System-Wide Global Resource' : 'rejected'}.`
      });

      setReviewingDb(null);
      setReviewNotes('');
      await loadResources();
      if (onRefreshDatabases) onRefreshDatabases();
    } catch (err: any) {
      setFeedbackMsg({
        type: 'error',
        text: `Failed to review resource: ${err.message || err}`
      });
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Filtered resources
  const filteredResources = useMemo(() => {
    return teamResources.filter(item => {
      // Search filter
      const q = searchTerm.toLowerCase();
      const matchesSearch = 
        !q || 
        item.name?.toLowerCase().includes(q) || 
        item.teamName?.toLowerCase().includes(q) || 
        item.host?.toLowerCase().includes(q) || 
        item.databaseName?.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      // Status filter
      if (statusFilter === 'PENDING') return item.promotionStatus === 'PENDING_ADMIN_APPROVAL';
      if (statusFilter === 'APPROVED') return item.promotionStatus === 'APPROVED' || item.scope === 'global';
      if (statusFilter === 'TEAM_ONLY') return item.scope === 'team' && item.promotionStatus === 'NONE';

      return true;
    });
  }, [teamResources, searchTerm, statusFilter]);

  // KPI calculations
  const pendingCount = teamResources.filter(r => r.promotionStatus === 'PENDING_ADMIN_APPROVAL').length;
  const approvedCount = teamResources.filter(r => r.promotionStatus === 'APPROVED' || r.scope === 'global').length;
  const teamOnlyCount = teamResources.filter(r => r.scope === 'team' && r.promotionStatus === 'NONE').length;

  return (
    <ErrorBoundary fallbackTitle="Admin Team Resources Monitor Error">
      <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden font-sans">
        
        {/* Top Header Bar */}
        <div className="px-6 py-4 bg-white border-b border-slate-200/90 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#155DFC]">
              <Server size={22} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-bold text-slate-900 font-mono tracking-tight">Team Resources & Promotion Monitor</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-blue-100 text-blue-800 border border-blue-300">
                  Admin Authority
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                Monitor team-scoped external systems, review promotion requests, and approve global resources
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={loadResources}
              disabled={loading}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-mono font-medium flex items-center space-x-1.5 transition-all cursor-pointer"
              title="Refresh connection status"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div className={`mx-6 mt-3 px-3.5 py-2.5 rounded-xl border text-xs font-mono flex items-center justify-between transition-all ${
            feedbackMsg.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            <div className="flex items-center space-x-2">
              {feedbackMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span>{feedbackMsg.text}</span>
            </div>
            <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono text-slate-500 font-medium uppercase tracking-wider">Total Team Resources</p>
                <p className="text-2xl font-bold text-slate-900 font-mono mt-1">{teamResources.length}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                <Database size={18} />
              </div>
            </div>

            <div className="p-4 bg-amber-50/70 rounded-xl border border-amber-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono text-amber-700 font-bold uppercase tracking-wider">Pending Approvals</p>
                <p className="text-2xl font-bold text-amber-900 font-mono mt-1">{pendingCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700">
                <Clock size={18} />
              </div>
            </div>

            <div className="p-4 bg-emerald-50/70 rounded-xl border border-emerald-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono text-emerald-700 font-bold uppercase tracking-wider">Approved System-Wide</p>
                <p className="text-2xl font-bold text-emerald-900 font-mono mt-1">{approvedCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                <CheckCircle2 size={18} />
              </div>
            </div>

            <div className="p-4 bg-blue-50/70 rounded-xl border border-blue-200 shadow-xs flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono text-blue-700 font-bold uppercase tracking-wider">Private Team-Only</p>
                <p className="text-2xl font-bold text-blue-900 font-mono mt-1">{teamOnlyCount}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700">
                <Layers size={18} />
              </div>
            </div>

          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-white rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center space-x-2 flex-1 max-w-md">
              <div className="relative w-full">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter by connection name, team, host, or database..."
                  className="w-full pl-8.5 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-hidden focus:border-[#155DFC] focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Segmented Status Switcher */}
            <div className="flex items-center space-x-1 p-0.5 bg-slate-100 rounded-lg text-xs font-mono">
              {[
                { id: 'ALL', label: 'All' },
                { id: 'PENDING', label: `Pending (${pendingCount})` },
                { id: 'APPROVED', label: 'Approved Global' },
                { id: 'TEAM_ONLY', label: 'Private Team-Only' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id as any)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                    statusFilter === f.id
                      ? 'bg-white text-slate-900 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Resources Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-slate-400 font-mono text-xs flex flex-col items-center justify-center space-y-2">
                <RefreshCw size={20} className="animate-spin text-[#155DFC]" />
                <span>Loading team-scoped external resources...</span>
              </div>
            ) : filteredResources.length === 0 ? (
              <div className="p-12 text-center text-slate-400 font-mono text-xs flex flex-col items-center justify-center space-y-2">
                <Server size={24} className="text-slate-300" />
                <p className="font-bold text-slate-700">No team resources match your criteria</p>
                <p className="text-[11px] text-slate-400">Team-specific connections configured by team managers will appear here for admin audit.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      <th className="py-2.5 px-4">Connection & Engine</th>
                      <th className="py-2.5 px-4">Team Owner</th>
                      <th className="py-2.5 px-4">Host & Endpoint</th>
                      <th className="py-2.5 px-4">Scope & Status</th>
                      <th className="py-2.5 px-4">Promotion Lifecycle</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredResources.map((db) => {
                      const testRes = testResults[db.id];
                      const isTesting = testingId === db.id;
                      const isPending = db.promotionStatus === 'PENDING_ADMIN_APPROVAL';
                      const isApproved = db.promotionStatus === 'APPROVED' || db.scope === 'global';

                      return (
                        <tr key={db.id} className={`hover:bg-slate-50/80 transition-all ${isPending ? 'bg-amber-50/30' : ''}`}>
                          
                          {/* Connection & Engine */}
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2.5">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] ${
                                db.type === 'PostgreSQL' ? 'bg-blue-100 text-blue-800' :
                                db.type === 'MySQL' ? 'bg-orange-100 text-orange-800' :
                                db.type === 'MongoDB' ? 'bg-emerald-100 text-emerald-800' :
                                db.type === 'Oracle' ? 'bg-red-100 text-red-800' :
                                'bg-slate-100 text-slate-800'
                              }`}>
                                {db.type.substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900">{db.name}</div>
                                <div className="text-[10px] text-slate-400 font-sans">{db.description || db.type}</div>
                              </div>
                            </div>
                          </td>

                          {/* Team Owner */}
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-1.5">
                              <Users size={12} className="text-slate-400 shrink-0" />
                              <span className="font-medium text-slate-800">{db.teamName || 'Unassigned'}</span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Mgr: {db.teamManagerName || 'Admin'}
                            </div>
                          </td>

                          {/* Host & Endpoint */}
                          <td className="py-3 px-4">
                            <div className="text-slate-800 font-semibold">{db.host}:{db.port || (db.type === 'MySQL' ? 3306 : 5432)}</div>
                            <div className="text-[10px] text-slate-400">{db.databaseName || '(default db)'}</div>
                          </td>

                          {/* Scope & Status */}
                          <td className="py-3 px-4">
                            <div className="flex flex-col space-y-1">
                              <div className="flex items-center space-x-1.5">
                                <span className={`w-2 h-2 rounded-full ${
                                  testRes 
                                    ? (testRes.success ? 'bg-emerald-500' : 'bg-rose-500') 
                                    : (db.status === 'online' ? 'bg-emerald-500' : 'bg-slate-400')
                                }`} />
                                <span className="text-[11px] text-slate-700 capitalize">
                                  {testRes ? (testRes.success ? `Online (${testRes.pingMs}ms)` : 'Unreachable') : (db.status || 'offline')}
                                </span>
                              </div>
                              <span className={`inline-block px-1.5 py-0.2 text-[9px] font-bold rounded-md w-max ${
                                db.scope === 'global'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}>
                                {db.scope === 'global' ? 'Global Resource' : 'Private to Team'}
                              </span>
                            </div>
                          </td>

                          {/* Promotion Lifecycle */}
                          <td className="py-3 px-4">
                            {isPending ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  <Clock size={10} />
                                  <span>Approval Requested</span>
                                </span>
                                {db.promotionNotes && (
                                  <div className="text-[10px] text-slate-500 italic max-w-xs truncate" title={db.promotionNotes}>
                                    "{db.promotionNotes}"
                                  </div>
                                )}
                              </div>
                            ) : isApproved ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 size={10} />
                                <span>Approved Global</span>
                              </span>
                            ) : db.promotionStatus === 'REJECTED' ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                <XCircle size={10} />
                                <span>Rejected</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">Not Requested</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => handleTestConnection(db)}
                                disabled={isTesting}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[10px] font-bold flex items-center space-x-1 transition-all cursor-pointer"
                                title="Run live socket connectivity test"
                              >
                                <Activity size={11} className={isTesting ? 'animate-pulse text-[#155DFC]' : ''} />
                                <span>{isTesting ? 'Testing...' : 'Test Socket'}</span>
                              </button>

                              {isPending && (
                                <button
                                  onClick={() => {
                                    setReviewingDb(db);
                                    setReviewAction('APPROVE');
                                    setReviewNotes('');
                                  }}
                                  className="px-2.5 py-1 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white rounded-md text-[10px] font-bold flex items-center space-x-1 transition-all shadow-2xs cursor-pointer"
                                >
                                  <ShieldAlert size={11} />
                                  <span>Review Proposal</span>
                                </button>
                              )}
                            </div>
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* Review Proposal Modal */}
        {reviewingDb && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 font-sans">
              
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-[#155DFC]">
                    <ShieldAlert size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 font-mono">Review Resource Promotion Request</h3>
                    <p className="text-[11px] text-slate-500 font-mono">Evaluate proposal to promote team connection to system-wide resource</p>
                  </div>
                </div>
                <button
                  onClick={() => setReviewingDb(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Resource Info Summary */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Resource Name:</span>
                  <span className="font-bold text-slate-900">{reviewingDb.name} ({reviewingDb.type})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Originating Team:</span>
                  <span className="font-bold text-slate-900">{reviewingDb.teamName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Host Endpoint:</span>
                  <span className="font-bold text-slate-800">{reviewingDb.host}:{reviewingDb.port || 5432} / {reviewingDb.databaseName || 'default'}</span>
                </div>
                {reviewingDb.promotionNotes && (
                  <div className="pt-2 border-t border-slate-200 text-slate-600 italic">
                    <span className="font-semibold text-slate-700 not-italic">Team Justification:</span> "{reviewingDb.promotionNotes}"
                  </div>
                )}
              </div>

              {/* Action Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 font-mono">Administrative Decision</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewAction('APPROVE')}
                    className={`py-2 px-3 rounded-xl border text-xs font-mono font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                      reviewAction === 'APPROVE'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <CheckCircle2 size={14} className={reviewAction === 'APPROVE' ? 'text-emerald-600' : 'text-slate-400'} />
                    <span>Approve System-Wide</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReviewAction('REJECT')}
                    className={`py-2 px-3 rounded-xl border text-xs font-mono font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                      reviewAction === 'REJECT'
                        ? 'bg-rose-50 border-rose-500 text-rose-800 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <XCircle size={14} className={reviewAction === 'REJECT' ? 'text-rose-600' : 'text-slate-400'} />
                    <span>Reject Proposal</span>
                  </button>
                </div>
              </div>

              {/* Review Notes Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 font-mono">
                  Feedback & Audit Notes {reviewAction === 'REJECT' && <span className="text-rose-500">*</span>}
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder={
                    reviewAction === 'APPROVE'
                      ? 'Optional note (e.g. Approved for cross-departmental card settlement reconciliation)...'
                      : 'Provide explanation to the team manager regarding why promotion was rejected...'
                  }
                  rows={3}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-hidden focus:border-[#155DFC] focus:bg-white transition-all"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReviewingDb(null)}
                  className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitReview}
                  disabled={isSubmittingReview || (reviewAction === 'REJECT' && !reviewNotes.trim())}
                  className={`px-4 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs ${
                    reviewAction === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-rose-600 hover:bg-rose-700 text-white'
                  }`}
                >
                  {isSubmittingReview ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                  <span>{reviewAction === 'APPROVE' ? 'Commit Global Promotion' : 'Commit Rejection'}</span>
                </button>
              </div>

            </div>
          </div>
        )}

      </div>
    </ErrorBoundary>
  );
}
