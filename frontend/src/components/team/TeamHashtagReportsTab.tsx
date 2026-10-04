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
  ChevronRight, BarChart3, TrendingUp, Search
} from 'lucide-react';

interface TeamHashtagReportsTabProps {
  teamId: string;
  teamName: string;
}

export function TeamHashtagReportsTab(props: TeamHashtagReportsTabProps) {
  return (
    <ErrorBoundary fallbackTitle="Hashtag Analytics & Reports Error" fallbackMessage="Could not load team hashtag performance reports.">
      <TeamHashtagReportsContent {...props} />
    </ErrorBoundary>
  );
}

function TeamHashtagReportsContent({ teamId, teamName }: TeamHashtagReportsTabProps) {
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<{
    teamId: string;
    generatedAt: string;
    hashtagMetrics: any[];
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');

  const fetchReport = async () => {
    setLoading(true);
    try {
      const data = await api.getTeamHashtagReport(teamId);
      setReportData(data);
    } catch (err: any) {
      console.error('Failed to load team hashtag report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (teamId) {
      fetchReport();
    }
  }, [teamId]);

  const metrics = reportData?.hashtagMetrics || [];

  // Aggregated totals
  const totalRuns = metrics.reduce((acc, m) => acc + (Number(m.totalRuns) || 0), 0);
  const totalScanned = metrics.reduce((acc, m) => acc + (Number(m.totalRowsScanned) || 0), 0);
  const totalAnomalies = metrics.reduce((acc, m) => acc + (Number(m.totalAnomaliesDetected) || 0), 0);
  const avgDuration = metrics.length > 0
    ? Math.round(metrics.reduce((acc, m) => acc + (Number(m.avgDurationMs) || 0), 0) / metrics.length)
    : 0;

  const filteredMetrics = metrics.filter(m => {
    const matchesSearch = !searchTerm || 
      (m.tag && m.tag.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (m.description && m.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesType = selectedTypeFilter === 'ALL' || m.hashtagType === selectedTypeFilter;
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
            <h2 className="text-sm font-bold">Team Hashtag SLA & Execution Reports</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#155DFC]/30 text-blue-300 border border-[#155DFC]/40">
              Team: {teamName}
            </span>
          </div>
          <p className="text-[11px] text-slate-300 max-w-2xl leading-relaxed">
            Real-time operational audit and velocity analytics for universal resolution presets, scanner rules, and dedicated staging tables across team pipelines.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchReport}
          disabled={loading}
          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer self-start md:self-center shrink-0"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin text-blue-400' : 'text-slate-400'} />
          <span>{loading ? 'Refreshing...' : 'Refresh Metrics'}</span>
        </button>
      </div>

      {/* KPI Stats Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Tracked Presets</span>
            <Tag size={14} className="text-indigo-600" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900">{metrics.length}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Assigned to team pipelines</div>
        </div>

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
            <span className="text-[10px] font-bold uppercase tracking-wider">Avg SLA Duration</span>
            <Clock size={14} className="text-amber-600" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900">{avgDuration}ms</div>
          <div className="text-[10px] text-slate-400 mt-0.5">End-to-end execution speed</div>
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
              Hashtag Velocity Matrix ({filteredMetrics.length})
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
                <th className="py-2.5 px-4">Classification</th>
                <th className="py-2.5 px-4 text-center">Execution Count</th>
                <th className="py-2.5 px-4 text-center">Scanned Volume</th>
                <th className="py-2.5 px-4 text-center">Anomalies Detected</th>
                <th className="py-2.5 px-4 text-center">Avg Latency</th>
                <th className="py-2.5 px-4 text-right">Target DB / Table</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredMetrics.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 italic">
                    {loading ? 'Compiling team hashtag SLA reports...' : 'No hashtag performance records found matching search.'}
                  </td>
                </tr>
              ) : (
                filteredMetrics.map((row) => (
                  <tr key={row.tag} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 font-mono font-bold text-blue-700 whitespace-nowrap">
                      <div className="flex items-center space-x-1.5">
                        <Tag size={12} className="text-blue-600" />
                        <span>{row.tag}</span>
                      </div>
                      {row.description && (
                        <div className="text-[10px] font-normal text-slate-500 font-sans truncate max-w-xs">
                          {row.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {row.hashtagType || 'FILE_INGESTION'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                      {row.totalRuns || 0}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-slate-600">
                      {(Number(row.totalRowsScanned) || 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center font-mono">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        Number(row.totalAnomaliesDetected) > 0
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {row.totalAnomaliesDetected || 0}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-slate-700">
                      {row.avgDurationMs ? `${Math.round(row.avgDurationMs)}ms` : '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-[11px] text-slate-500">
                      {row.targetTable || row.dedicatedTableName || 'default'}
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
}
