/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { ErrorBoundary } from '../ErrorBoundary';
import { 
  Tag, RefreshCw, Activity, CheckCircle2, AlertTriangle, 
  Database, Layers, ShieldCheck, FileText, Clock, Play,
  ChevronRight, BarChart3, TrendingUp, Search, UserCheck
} from 'lucide-react';

interface TeamHashtagReportsTabProps {
  teamId: string;
  teamName: string;
  currentUser?: any;
}

export function TeamHashtagReportsTab(props: TeamHashtagReportsTabProps) {
  return (
    <ErrorBoundary fallbackTitle="Hashtag Analytics & Reports Error" fallbackMessage="Could not load team hashtag performance reports.">
      <TeamHashtagReportsContent {...props} />
    </ErrorBoundary>
  );
}

function TeamHashtagReportsContent({ teamId, teamName, currentUser }: TeamHashtagReportsTabProps) {
  const [loading, setLoading] = useState(true);
  const [activeScope, setActiveScope] = useState<'TEAM' | 'PERSONAL'>('TEAM');
  const [reportData, setReportData] = useState<{
    teamId: string;
    generatedAt: string;
    hashtagMetrics: any[];
  } | null>(null);
  const [personalReportData, setPersonalReportData] = useState<{
    userId: string;
    generatedAt: string;
    hashtagMetrics: any[];
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');

  const userId = currentUser?.id || currentUser?.username || 'me';

  const fetchReport = async () => {
    setLoading(true);
    try {
      if (activeScope === 'TEAM') {
        const data = await api.getTeamHashtagReport(teamId);
        setReportData(data);
      } else {
        const data = await api.getPersonalHashtagReport(userId);
        setPersonalReportData(data);
      }
    } catch (err: any) {
      console.error('Failed to load hashtag report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [teamId, activeScope]);

  const activeMetrics = activeScope === 'TEAM'
    ? (reportData?.hashtagMetrics || [])
    : (personalReportData?.hashtagMetrics || []);

  // Aggregated totals
  const totalRuns = activeMetrics.reduce((acc, m) => acc + (Number(m.total_runs || m.totalRuns) || 0), 0);
  const totalScanned = activeMetrics.reduce((acc, m) => acc + (Number(m.total_rows_scanned || m.totalRowsScanned) || 0), 0);
  const totalAnomalies = activeMetrics.reduce((acc, m) => acc + (Number(m.total_anomalies || m.totalAnomaliesDetected) || 0), 0);
  const avgMttd = activeMetrics.length > 0
    ? (activeMetrics.reduce((acc, m) => acc + (Number(m.mttd_hours) || 0), 0) / activeMetrics.length).toFixed(1)
    : '0.0';
  const avgMttr = activeMetrics.length > 0
    ? (activeMetrics.reduce((acc, m) => acc + (Number(m.mttr_hours) || 0), 0) / activeMetrics.length).toFixed(1)
    : '0.0';

  const filteredMetrics = activeMetrics.filter(m => {
    const tag = m.hashtag_tag || m.tag || '';
    const desc = m.description || '';
    const matchesSearch = !searchTerm || 
      tag.toLowerCase().includes(searchTerm.toLowerCase()) ||
      desc.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedTypeFilter === 'ALL' || (m.hashtagType || m.hashtag_type) === selectedTypeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="h-full flex-1 min-h-0 flex flex-col p-4 space-y-4 overflow-y-auto">
      {/* Header Banner */}
      <div className="bg-[#0F172B] border border-slate-800 rounded-2xl p-4 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="p-1.5 bg-[#155DFC]/20 rounded-lg text-blue-400">
              <Tag size={16} />
            </span>
            <h2 className="text-sm font-bold">
              {activeScope === 'TEAM' ? 'Team Hashtag SLA & Execution Reports' : 'My Personal Hashtag Automations'}
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#155DFC]/30 text-blue-300 border border-[#155DFC]/40">
              {activeScope === 'TEAM' ? `Team: ${teamName}` : `Operator: ${currentUser?.username || userId}`}
            </span>
          </div>
          <p className="text-[11px] text-slate-300 max-w-2xl leading-relaxed">
            Real-time operational audit and velocity analytics for universal resolution presets, scanner rules, and dedicated staging tables across team pipelines.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-center shrink-0">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-1 flex items-center space-x-1">
            <button
              type="button"
              onClick={() => setActiveScope('TEAM')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeScope === 'TEAM' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Team Velocity
            </button>
            <button
              type="button"
              onClick={() => setActiveScope('PERSONAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                activeScope === 'PERSONAL' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserCheck size={12} />
              <span>My Automations</span>
            </button>
          </div>

          <button
            type="button"
            onClick={fetchReport}
            disabled={loading}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-blue-400' : 'text-slate-400'} />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Executed Runs</span>
            <Play size={14} className="text-emerald-600" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900">{totalRuns}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Automated pipeline triggers</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Rows Scanned</span>
            <Layers size={14} className="text-blue-600" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900">{totalScanned.toLocaleString()}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{totalAnomalies} anomalies flagged</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Mean Detection (MTTD)</span>
            <Clock size={14} className="text-amber-600" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900">{avgMttd}h</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Detection latency from issue birth</div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Mean Remediation (MTTR)</span>
            <TrendingUp size={14} className="text-indigo-600" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900">{avgMttr}h</div>
          <div className="text-[10px] text-slate-400 mt-0.5">End-to-end resolution speed</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search hashtag SLA reports..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto">
          {[
            { id: 'ALL', label: 'All Types' },
            { id: 'FILE_INGESTION', label: 'File Ingest' },
            { id: 'DATABASE_DIRECT_SCANNER', label: 'DB Scanner' },
            { id: 'EXTRACTION_STAGING', label: 'Staging' },
            { id: 'AUDITING_GOVERNANCE', label: 'Audit' }
          ].map(type => (
            <button
              key={type.id}
              type="button"
              onClick={() => setSelectedTypeFilter(type.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                selectedTypeFilter === type.id
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hashtag Performance Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="p-3.5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <BarChart3 size={15} className="text-blue-600" />
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              {activeScope === 'TEAM' ? 'Hashtag Velocity & SLA Matrix' : 'My Triggered Runs'} ({filteredMetrics.length})
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            {reportData?.generatedAt ? new Date(reportData.generatedAt).toLocaleTimeString() : ''}
          </span>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 px-4">Hashtag Preset</th>
                <th className="py-2.5 px-4 text-center">Runs</th>
                <th className="py-2.5 px-4 text-center">Volume Scanned</th>
                <th className="py-2.5 px-4 text-center">Anomalies</th>
                <th className="py-2.5 px-4 text-center">MTTD (Detection)</th>
                <th className="py-2.5 px-4 text-center">MTTR (Resolution)</th>
                <th className="py-2.5 px-4 text-right">Last Execution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredMetrics.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 italic">
                    {loading ? 'Compiling hashtag SLA reports...' : 'No hashtag performance records found matching search.'}
                  </td>
                </tr>
              ) : (
                filteredMetrics.map((row, idx) => {
                  const tag = row.hashtag_tag || row.tag || `#TAG_${idx}`;
                  const runs = Number(row.total_runs || row.totalRuns) || 0;
                  const scanned = Number(row.total_rows_scanned || row.totalRowsScanned) || 0;
                  const anomalies = Number(row.total_anomalies || row.totalAnomaliesDetected) || 0;
                  const mttd = row.mttd_hours != null ? `${row.mttd_hours}h` : (row.avg_run_interval_hours ? `${row.avg_run_interval_hours}h` : '-');
                  const mttr = row.mttr_hours != null ? `${row.mttr_hours}h` : '-';
                  const lastRun = row.last_run_at || row.lastRunAt;

                  return (
                    <tr key={tag} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5">
                          <Tag size={12} className="text-blue-600" />
                          <span>{tag}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                        {runs}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-slate-600">
                        {scanned.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-center font-mono">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          anomalies > 0
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {anomalies}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-amber-700">
                        {mttd}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-bold text-indigo-700">
                        {mttr}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-[11px] text-slate-500">
                        {lastRun ? new Date(lastRun).toLocaleString() : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
