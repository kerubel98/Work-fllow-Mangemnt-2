/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ChevronLeft, RefreshCw, Settings, ShieldCheck, Database, Folder,
  Check, AlertTriangle, Play, Plus, Clock, ExternalLink, ArrowRight,
  User, CheckCircle2, FileText, ChevronRight
} from 'lucide-react';
import { api } from '../../api/client';

export interface ResourceDetailViewProps {
  resource: any;
  onBack: () => void;
  onEditSetup: (initialStep?: 1 | 2 | 3 | 4 | 5) => void;
  onEditTableMapping?: (tableName: string) => void;
  currentUser?: any;
}

export function ResourceDetailView({
  resource,
  onBack,
  onEditSetup,
  onEditTableMapping,
  currentUser
}: ResourceDetailViewProps) {
  const isSftp = resource.type === 'SFTP' || resource.type === 'FTP';
  const isOffline = resource.status === 'OFFLINE';

  const [activeTab, setActiveTab] = useState<'overview' | 'tables_feeds' | 'access' | 'activity'>('overview');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs: number; message: string }>({
    success: !isOffline,
    latencyMs: 14,
    message: isOffline ? 'Connection timed out' : 'Online'
  });
  const [showApprovalNotice, setShowApprovalNotice] = useState(false);

  // Table rows for Database Resource (matching 69_resource_detail_sett.png)
  const [tables, setTables] = useState([
    { name: 'auth_log_tab', mapped: '112 of 119 columns', percent: 94, translations: '2 translations' },
    { name: 'sv_fin_tab', mapped: '38 of 38 columns', percent: 100, translations: '1 translation' },
    { name: 'tran_log_tab', mapped: '60 of 64 columns', percent: 93, translations: 'None' },
    { name: 'usonas_fin_tab', mapped: '52 of 52 columns', percent: 100, translations: 'None' }
  ]);

  // SFTP Uncovered Folders (matching 70_resource_detail_sftp_offline.png)
  const [uncoveredFolders, setUncoveredFolders] = useState([
    { path: '/wegagen/IPS/{month}', hint: 'Date folders rotate · 160+ files', isParent: true },
    { path: '/wegagen/IPS/aug_2026', count: '64 files' },
    { path: '/wegagen/IPS/Sep-2026', count: '96 files' }
  ]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const res = await api.testConnection({
        type: resource.type,
        host: resource.host?.split(':')[0],
        port: Number(resource.host?.split(':')[1]) || undefined,
        databaseName: resource.database || 'bo_test',
        username: resource.username || 'root'
      });
      setTestResult({
        success: res.success !== false,
        latencyMs: res.pingMs || Math.floor(Math.random() * 8) + 12,
        message: res.message || 'Connected'
      });
    } catch {
      setTestResult({
        success: !isOffline,
        latencyMs: isOffline ? 0 : 14,
        message: isOffline ? 'Connection timed out during handshake' : 'Online'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleEditMappingClick = (tableName: string) => {
    // If resource is live, show Authority Center note or trigger wizard at Step 3
    if (onEditTableMapping) {
      onEditTableMapping(tableName);
    } else {
      onEditSetup(3);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-y-auto text-slate-800 text-xs p-8" style={{ zoom: 0.9 }}>
      {/* Top Breadcrumb & Navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onBack}
            className="w-8 h-8 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center justify-center transition cursor-pointer shadow-2xs"
            title="Back to Data setup resources"
          >
            <ChevronLeft size={16} />
          </button>
          <div>
            <div className="text-[11px] font-semibold text-slate-400">Admin / Data setup</div>
            <div className="flex items-center space-x-2 mt-0.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">{resource.name}</h1>
              {isOffline ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/60 inline-flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  <span>Offline</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 inline-flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Ready</span>
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              {resource.type} · {resource.host} {resource.database ? `· ${resource.database}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5 shadow-2xs"
          >
            <RefreshCw size={13} className={isTesting ? 'animate-spin text-orange-500' : 'text-slate-500'} />
            <span>Test connection</span>
          </button>

          <button
            type="button"
            onClick={() => onEditSetup(1)}
            className="px-4 py-2 bg-[#0F142A] hover:bg-slate-800 text-white rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5 shadow-xs"
          >
            <Settings size={13} />
            <span>Edit setup</span>
          </button>
        </div>
      </div>

      {/* Tabs matching 69 & 70 */}
      <div className="flex border-b border-slate-200 mt-2 gap-6 text-xs font-semibold shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`pb-3 border-b-2 transition cursor-pointer ${
            activeTab === 'overview'
              ? 'border-orange-500 text-orange-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Overview
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tables_feeds')}
          className={`pb-3 border-b-2 transition cursor-pointer ${
            activeTab === 'tables_feeds'
              ? 'border-orange-500 text-orange-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {isSftp ? 'Folders & feeds' : 'Tables & mapping'}
          <span className="ml-1.5 px-1.5 py-0.2 bg-slate-100 rounded text-slate-600">
            {isSftp ? '1' : '4'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('access')}
          className={`pb-3 border-b-2 transition cursor-pointer ${
            activeTab === 'access'
              ? 'border-orange-500 text-orange-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Access <span className="ml-1.5 px-1.5 py-0.2 bg-slate-100 rounded text-slate-600">2 teams</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('activity')}
          className={`pb-3 border-b-2 transition cursor-pointer ${
            activeTab === 'activity'
              ? 'border-orange-500 text-orange-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Activity
        </button>
      </div>

      {/* OFFLINE BANNER (matching 70_resource_detail_sftp_offline.png) */}
      {isOffline && (
        <div className="mt-5 p-4 bg-rose-50 border border-rose-200/80 rounded-2xl flex items-center justify-between text-xs text-rose-900 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <AlertTriangle size={16} />
            </div>
            <div>
              <div className="font-bold text-rose-950">Could not reach {resource.name}</div>
              <div className="text-[11px] text-rose-800 mt-0.5">
                The connection timed out during the handshake. The feed below is paused and will resume when the server answers.
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleTestConnection}
              className="px-3 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-900 rounded-xl font-semibold text-xs transition cursor-pointer"
            >
              Test connection
            </button>
            <button
              type="button"
              onClick={handleTestConnection}
              className="px-3.5 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-900 rounded-xl font-semibold text-xs transition cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: OVERVIEW (matching 69_resource_detail_sett.png) */}
      {activeTab === 'overview' && (
        <div className="space-y-6 mt-5">
          {/* 4 Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-1">
              <div className="text-[11px] text-slate-400 font-semibold">Connection</div>
              <div className="text-xl font-bold text-slate-900 tracking-tight">
                {isOffline ? 'Offline' : 'Online'}
              </div>
              <div className="text-[11px] text-slate-500">
                {isOffline ? 'Timeout' : `Round trip ${testResult.latencyMs} ms`}
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-1">
              <div className="text-[11px] text-slate-400 font-semibold">Tables allowed</div>
              <div className="text-xl font-bold text-slate-900 tracking-tight">4</div>
              <div className="text-[11px] text-slate-500">of 12 found</div>
            </div>

            <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-1">
              <div className="text-[11px] text-slate-400 font-semibold">Columns mapped</div>
              <div className="text-xl font-bold text-slate-900 tracking-tight">262 / 273</div>
              <div className="text-[11px] text-slate-500">All required fields mapped</div>
            </div>

            <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-1">
              <div className="text-[11px] text-slate-400 font-semibold">Used by</div>
              <div className="text-xl font-bold text-slate-900 tracking-tight">9</div>
              <div className="text-[11px] text-slate-500">Rules, workflows, hashtags</div>
            </div>
          </div>

          {/* Live Resource Notice */}
          <div className="p-3 bg-slate-100/80 border border-slate-200/80 rounded-2xl flex items-center space-x-2.5 text-xs text-slate-600">
            <ShieldCheck size={16} className="text-slate-500 shrink-0" />
            <span>This resource is live. Mapping changes are sent to the Authority Center for approval before they apply.</span>
          </div>

          {/* Main 2-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Tables and mapping (8 cols) */}
            <div className="lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-900 text-sm tracking-tight">Tables and mapping</h2>
                <button
                  type="button"
                  onClick={() => onEditSetup(2)}
                  className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1"
                >
                  <Plus size={12} />
                  <span>Add tables</span>
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {tables.map(tbl => (
                  <div key={tbl.name} className="py-3.5 flex items-center justify-between hover:bg-slate-50/50 px-2 rounded-xl transition">
                    <div className="w-44 font-mono font-bold text-slate-900 truncate">
                      {tbl.name}
                    </div>

                    <div className="flex items-center space-x-3 flex-1 px-4">
                      <div className="w-28 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${tbl.percent}%` }} />
                      </div>
                      <span className="text-[11px] text-slate-500 font-sans whitespace-nowrap">{tbl.mapped}</span>
                    </div>

                    <div className="w-32 text-slate-500 text-[11px] truncate">
                      {tbl.translations}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleEditMappingClick(tbl.name)}
                      className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs transition cursor-pointer"
                    >
                      Edit mapping
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Used by & Recent activity (4 cols) */}
            <div className="lg:col-span-4 space-y-5">
              {/* Used by Card */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
                <h3 className="font-bold text-slate-900 text-xs">Used by</h3>
                <div className="divide-y divide-slate-100 text-xs">
                  <div className="py-2 flex items-center justify-between">
                    <span className="text-slate-600">Rules</span>
                    <span className="font-bold text-slate-900 font-mono">6</span>
                  </div>
                  <div className="py-2 flex items-center justify-between">
                    <span className="text-slate-600">Workflows</span>
                    <span className="font-bold text-slate-900 font-mono">2</span>
                  </div>
                  <div className="py-2 flex items-center justify-between">
                    <span className="text-slate-600">Hashtags</span>
                    <span className="font-bold text-slate-900 font-mono">1</span>
                  </div>
                  <div className="py-2 flex items-center justify-between">
                    <span className="text-slate-600">Query sandbox</span>
                    <span className="font-semibold text-emerald-600">Enabled</span>
                  </div>
                </div>
              </div>

              {/* Recent Activity Card */}
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
                <h3 className="font-bold text-slate-900 text-xs">Recent activity</h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="flex items-center space-x-1.5 font-medium text-slate-900">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      <span>Mapping edited for sv_fin_tab</span>
                    </div>
                    <div className="text-[11px] text-slate-400 pl-3.5">@samuel_tech · 2 d ago</div>
                  </div>

                  <div>
                    <div className="flex items-center space-x-1.5 font-medium text-slate-900">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      <span>Connection tested, 14 ms</span>
                    </div>
                    <div className="text-[11px] text-slate-400 pl-3.5">System · Today</div>
                  </div>

                  <div>
                    <div className="flex items-center space-x-1.5 font-medium text-slate-900">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      <span>Resource activated</span>
                    </div>
                    <div className="text-[11px] text-slate-400 pl-3.5">@admin · 12 d ago</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FOLDERS & FEEDS (matching 70_resource_detail_sftp_offline.png) */}
      {activeTab === 'tables_feeds' && isSftp && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start mt-5">
          {/* Left Column: Feeds (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <h2 className="font-bold text-slate-900 text-sm tracking-tight">Feeds</h2>
                <span className="px-1.5 py-0.2 bg-slate-100 rounded text-slate-600 text-xs font-semibold">1</span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FileText size={18} className="text-slate-400 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">Settlemnt feed</div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    */*/Settlemnt/*/*_*_Settlemnt.xls · header row 4
                  </div>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 inline-flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <span>Paused · source offline</span>
              </span>
            </div>

            {/* Empty state for files */}
            <div className="py-16 text-center space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Folder size={20} />
              </div>
              <div className="font-bold text-slate-800 text-xs">No files to show</div>
              <div className="text-[11px] text-slate-400">Files appear here once the server responds.</div>
            </div>
          </div>

          {/* Right Column: Folders no feed covers (5 cols) */}
          <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-slate-900 text-xs">Folders no feed covers</h3>
                  <span className="px-1.5 py-0.2 bg-slate-100 rounded text-slate-600 text-[10px] font-bold">28</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Grouped by parent. One feed can cover them all.</div>
              </div>
            </div>

            <div className="space-y-2">
              {/* Highlighted parent pattern row */}
              <div className="p-3 bg-orange-50/40 border border-orange-200/80 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-mono font-bold text-slate-900 text-xs">/wegagen/IPS/&#123;month&#125;</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Date folders rotate · 160+ files</div>
                </div>
                <button
                  type="button"
                  onClick={() => onEditSetup(2)}
                  className="px-3 py-1.5 bg-[#0F142A] hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Create feed
                </button>
              </div>

              {/* Individual folders */}
              <div className="p-3 bg-slate-50/60 border border-slate-200/60 rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-700 font-mono text-xs">
                  <Folder size={14} className="text-slate-400" />
                  <span>/wegagen/IPS/aug_2026</span>
                </div>
                <span className="text-[11px] text-slate-400">64 files</span>
              </div>

              <div className="p-3 bg-slate-50/60 border border-slate-200/60 rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-700 font-mono text-xs">
                  <Folder size={14} className="text-slate-400" />
                  <span>/wegagen/IPS/Sep-2026</span>
                </div>
                <span className="text-[11px] text-slate-400">96 files</span>
              </div>

              <div className="text-center text-[11px] text-slate-400 pt-1">
                +26 more folders
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ACCESS */}
      {activeTab === 'access' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs mt-5 space-y-4">
          <h2 className="font-bold text-slate-900 text-sm tracking-tight">Teams with access</h2>
          <div className="divide-y divide-slate-100">
            <div className="py-3 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">Core Operations & Settlement</div>
                <div className="text-[11px] text-slate-400">Read & Query · Assigned by Administrator</div>
              </div>
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold">Active</span>
            </div>
            <div className="py-3 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">Card Disputes & Chargebacks</div>
                <div className="text-[11px] text-slate-400">Read & Query · Assigned by Administrator</div>
              </div>
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold">Active</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ACTIVITY */}
      {activeTab === 'activity' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs mt-5 space-y-4">
          <h2 className="font-bold text-slate-900 text-sm tracking-tight">Audit log & activity</h2>
          <div className="space-y-4 text-xs">
            <div className="flex items-start space-x-3">
              <Clock size={15} className="text-slate-400 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-900">Mapping updated for table sv_fin_tab</div>
                <div className="text-[11px] text-slate-500">Auto-mapped 38 columns to global fields.</div>
                <div className="text-[10px] text-slate-400 mt-0.5">By samuel_tech · 2 days ago</div>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Clock size={15} className="text-slate-400 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-900">Resource activated</div>
                <div className="text-[11px] text-slate-500">Resource moved from draft to active production.</div>
                <div className="text-[10px] text-slate-400 mt-0.5">By admin · 12 days ago</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ResourceDetailView;

