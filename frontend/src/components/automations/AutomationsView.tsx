/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Search, Clock, RefreshCw, Zap, Play, CheckCircle2, AlertCircle, 
  Trash2, Edit3, X, ArrowRight, ShieldCheck, Database, Calendar, Settings, 
  Tag, Layers, Upload, ChevronDown, FileText, GitBranch, Send, MessageSquare, 
  Briefcase, Check, ArrowUpRight
} from 'lucide-react';
import { api } from '../../api/client';
import { DatabaseValidationWorkflow, HashtagPreset } from '../../types';
import { HashtagOwnerDetailView } from './HashtagOwnerDetailView';
import { HashtagFileUploadModal } from './HashtagFileUploadModal';

interface AutomationItem {
  id: string;
  name: string;
  description: string;
  triggerType: 'CRON' | 'FTP_POLL' | 'EVENT';
  schedule: string;
  workflowId: string;
  workflowName: string;
  targetDb: string;
  isActive: boolean;
  lastRunTime?: string;
  lastRunStatus?: 'SUCCESS' | 'FAILED' | 'PENDING';
  duration?: string;
}

export default function AutomationsView() {
  const [automations, setAutomations] = useState<AutomationItem[]>([]);
  const [workflows, setWorkflows] = useState<DatabaseValidationWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CRON' | 'FTP_POLL' | 'EVENT'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  // Form State for 07_create_automation_modal.png
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState<'CRON' | 'FTP_POLL' | 'EVENT'>('CRON');
  const [formSchedule, setFormSchedule] = useState('0 2 * * *');
  const [formWorkflowId, setFormWorkflowId] = useState('');
  const [formPreset, setFormPreset] = useState('daily');

  // Navigation tabs: Default to HASHTAG_HUB (Screen 53)
  const [activeMainTab, setActiveMainTab] = useState<'HASHTAG_HUB' | 'HASHTAG_OWNER' | 'CRONS_SCHEDULES'>('HASHTAG_HUB');
  const [selectedHashtagTag, setSelectedHashtagTag] = useState<string>('#SETTLEMENT_AMOUNT_ROUNDING');
  const [activeAssetFilter, setActiveAssetFilter] = useState<'ALL' | 'WORKFLOWS' | 'TEMPLATES' | 'DATABASES' | 'CASES' | 'MESSAGES'>('ALL');
  const [hashtagSearch, setHashtagSearch] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Live stats for selected hashtag
  const [hashtagStats, setHashtagStats] = useState<{ total: number; fixed: number; failed: number; waiting: number }>({
    total: 312,
    fixed: 289,
    failed: 6,
    waiting: 17
  });

  // Hashtags list
  const availableHashtags = [
    { tag: '#SETTLEMENT_AMOUNT_ROUNDING', label: '#SETTLEMENT_AMOUNT_ROUNDING (Active)' },
    { tag: '#DUPLICATE_AUTH', label: '#DUPLICATE_AUTH (Active)' },
    { tag: '#AIB_SETTLEMENT_2026', label: '#AIB_SETTLEMENT_2026 (Active)' },
    { tag: '#STUCK_PENDING', label: '#STUCK_PENDING (Draft)' }
  ];

  const loadData = async () => {
    setLoading(true);
    try {
      const [wfs, ftpConfigs, hashtagRes] = await Promise.allSettled([
        api.getWorkflows(),
        api.getFtpStagingConfigs(),
        api.getHashtagCollectedTransactions(selectedHashtagTag, 'ALL', 10)
      ]);

      const loadedWfs: DatabaseValidationWorkflow[] = wfs.status === 'fulfilled' ? wfs.value : [];
      setWorkflows(loadedWfs);

      if (hashtagRes.status === 'fulfilled' && hashtagRes.value?.stats) {
        if (hashtagRes.value.stats.total > 0) {
          setHashtagStats(hashtagRes.value.stats);
        }
      }

      // Generate automations from FTP configs and default core crons
      const baseAutomations: AutomationItem[] = [
        {
          id: 'auto-cbe-nightly',
          name: 'Nightly CBE Settlement Reconciler',
          description: 'Triggers every night at 2:00 AM EAT to reconcile CBE core banking transactions with switch settlement logs',
          triggerType: 'CRON',
          schedule: '0 2 * * *',
          workflowId: loadedWfs[0]?.id || 'wf-1',
          workflowName: loadedWfs[0]?.name || 'CBE Core Settlement Pipeline',
          targetDb: 'cbe_production_db',
          isActive: true,
          lastRunTime: 'Today, 02:00 AM',
          lastRunStatus: 'SUCCESS',
          duration: '3.2s'
        },
        {
          id: 'auto-telebirr-hourly',
          name: 'Telebirr Hourly Ingress Scanner',
          description: 'Polls incoming Telebirr switch transaction batches every hour to verify ISO status and flag duplicates',
          triggerType: 'CRON',
          schedule: '0 * * * *',
          workflowId: loadedWfs[1]?.id || loadedWfs[0]?.id || 'wf-2',
          workflowName: loadedWfs[1]?.name || 'Telebirr Wallet Validation',
          targetDb: 'telebirr_switch_db',
          isActive: true,
          lastRunTime: '1 hour ago',
          lastRunStatus: 'SUCCESS',
          duration: '1.4s'
        },
        {
          id: 'auto-aib-reversal-sync',
          name: 'Awash Bank Reversal Sync',
          description: 'Detects pending unconfirmed financial requests and executes auto-reversal validation rule checks',
          triggerType: 'EVENT',
          schedule: 'On Event / Webhook',
          workflowId: loadedWfs[0]?.id || 'wf-1',
          workflowName: 'Reversal Integrity Verification',
          targetDb: 'aib_host_db',
          isActive: false,
          lastRunTime: 'Yesterday, 18:30',
          lastRunStatus: 'SUCCESS',
          duration: '850ms'
        }
      ];

      if (ftpConfigs.status === 'fulfilled' && Array.isArray(ftpConfigs.value)) {
        ftpConfigs.value.forEach((fc: any) => {
          baseAutomations.push({
            id: `ftp-auto-${fc.id}`,
            name: `FTP Auto-Ingest: ${fc.remoteDirectory || 'Staged Logs'}`,
            description: `Automated staging of files from folder "${fc.remoteDirectory}" matching regex "${fc.filePattern || '*'}"`,
            triggerType: 'FTP_POLL',
            schedule: fc.pollingIntervalCron || '*/15 * * * *',
            workflowId: fc.attachedWorkflowId || loadedWfs[0]?.id || 'wf-ftp',
            workflowName: loadedWfs.find(w => w.id === fc.attachedWorkflowId)?.name || 'FTP File Staging Ingest',
            targetDb: 'staging_unlogged_mirror',
            isActive: fc.autoProcessEnabled !== false,
            lastRunTime: fc.lastPolledAt ? new Date(fc.lastPolledAt).toLocaleTimeString() : 'Never',
            lastRunStatus: 'SUCCESS',
            duration: '2.1s'
          });
        });
      }

      setAutomations(baseAutomations);
    } catch (err) {
      console.warn('Error loading automations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedHashtagTag]);

  const handleRunAutomation = async (auto: AutomationItem) => {
    setRunningId(auto.id);
    try {
      if (auto.triggerType === 'FTP_POLL') {
        await api.runScheduledFtpStaging();
      } else {
        await new Promise(r => setTimeout(r, 1200));
      }
      setAutomations(prev => prev.map(a => a.id === auto.id ? {
        ...a,
        lastRunTime: 'Just now',
        lastRunStatus: 'SUCCESS'
      } : a));
    } catch (err) {
      console.error(err);
    } finally {
      setRunningId(null);
    }
  };

  const handleCreateAutomation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const matchedWf = workflows.find(w => w.id === formWorkflowId) || workflows[0];
    const newAuto: AutomationItem = {
      id: `auto-${Date.now()}`,
      name: formName.trim(),
      description: formDesc.trim() || 'Automated background execution pipeline',
      triggerType: formType,
      schedule: formSchedule,
      workflowId: matchedWf?.id || 'wf-custom',
      workflowName: matchedWf?.name || 'Standard Validation Pipeline',
      targetDb: 'operational_workflow_db',
      isActive: true,
      lastRunTime: 'Never',
      lastRunStatus: 'PENDING'
    };

    setAutomations(prev => [newAuto, ...prev]);
    setIsModalOpen(false);
    setFormName('');
    setFormDesc('');
  };

  const filteredAutomations = automations.filter(a => {
    const matchesType = typeFilter === 'ALL' || a.triggerType === typeFilter;
    const matchesSearch = !searchQuery.trim() || 
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.workflowName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const [selectedId, setSelectedId] = useState<string>('auto-cbe-nightly');
  const selectedAuto = automations.find(a => a.id === selectedId) || automations[0] || null;

  if (activeMainTab === 'HASHTAG_OWNER') {
    return (
      <HashtagOwnerDetailView
        hashtagTag={selectedHashtagTag}
        onBack={() => setActiveMainTab('HASHTAG_HUB')}
      />
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 overflow-y-auto p-6 space-y-6 font-sans bg-[#F8FAFC]">
      
      {/* View Switcher Header Bar */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2 text-xs text-slate-500 font-sans">
          <span>Work</span>
          <span>/</span>
          <span className="font-semibold text-slate-900">Automations</span>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            <button
              type="button"
              id="tab-hashtag-hub"
              onClick={() => setActiveMainTab('HASHTAG_HUB')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                activeMainTab === 'HASHTAG_HUB'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Tag size={13} />
              <span>Hashtag Hub (Screen 53)</span>
            </button>

            <button
              type="button"
              id="tab-hashtag-owner-view"
              onClick={() => setActiveMainTab('HASHTAG_OWNER')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                activeMainTab === 'HASHTAG_OWNER'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <CheckCircle2 size={13} />
              <span>Hashtag Owner View (Screen 42)</span>
            </button>

            <button
              type="button"
              id="tab-crons-schedules"
              onClick={() => setActiveMainTab('CRONS_SCHEDULES')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 ${
                activeMainTab === 'CRONS_SCHEDULES'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Clock size={13} />
              <span>Crons & Schedules</span>
            </button>
          </div>

          <button
            id="btn-new-automation"
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl font-semibold text-xs transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ New automation</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODE 1: SCREEN 53 HASHTAG HUB (53_hashtag_hub.png)                 */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeMainTab === 'HASHTAG_HUB' && (
        <div className="space-y-6">
          {/* Top Title, Badges & Actions */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              {/* Badges row matching 53_hashtag_hub.png */}
              <div className="flex items-center space-x-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 flex items-center space-x-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Active</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200/80">
                  Temporary solution
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  Type A: File Ingestion
                </span>
              </div>

              {/* Hashtag Title with Selector */}
              <div className="flex items-center space-x-3">
                <h1 className="text-3xl font-extrabold font-mono text-slate-900 tracking-tight">
                  {selectedHashtagTag}
                </h1>
                
                <select
                  value={selectedHashtagTag}
                  onChange={(e) => setSelectedHashtagTag(e.target.value)}
                  className="bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-mono px-2 py-1 shadow-2xs cursor-pointer focus:outline-none focus:border-[#F27421]"
                >
                  {availableHashtags.map(h => (
                    <option key={h.tag} value={h.tag}>{h.label}</option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-slate-500 mt-1 font-sans">
                Everything linked to this hashtag in one place. Drop files directly to remediate transactions.
              </p>
            </div>

            {/* Right-hand Search & Action Buttons matching 53_hashtag_hub.png */}
            <div className="flex items-center space-x-2.5 shrink-0">
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search inside this hashtag..."
                  value={hashtagSearch}
                  onChange={(e) => setHashtagSearch(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#F27421] transition-all shadow-2xs"
                />
              </div>

              {/* PROMINENT UPLOAD & RUN FILE BUTTON */}
              <button
                type="button"
                id="btn-hub-upload-run"
                onClick={() => setIsUploadModalOpen(true)}
                className="px-4 py-2 bg-[#F27421] hover:bg-[#E06310] text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
              >
                <Upload size={14} />
                <span>Upload & Run File</span>
              </button>

              <button
                type="button"
                id="btn-open-automation"
                onClick={() => setActiveMainTab('HASHTAG_OWNER')}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-xs font-semibold shadow-2xs flex items-center space-x-1.5 transition cursor-pointer"
              >
                <span>Open automation</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>

          {/* 4 Info / Metric Cards in a single row matching 53_hashtag_hub.png */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* 1. Owner */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Owner</span>
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  SA
                </div>
                <span className="text-xs font-bold text-slate-900">@samuel_tech</span>
              </div>
            </div>

            {/* 2. Reports to */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Reports to</span>
              <div className="text-xs font-bold text-slate-900 truncate">
                Card Disputes & Chargebacks Unit
              </div>
            </div>

            {/* 3. Collected */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Collected</span>
              <div className="text-2xl font-black font-mono text-slate-900">
                {hashtagStats.total} transactions
              </div>
            </div>

            {/* 4. Last run */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Last run</span>
              <div className="text-sm font-bold text-slate-900 pt-1">
                24 Oct, 14:03
              </div>
            </div>
          </div>

          {/* Filter Tabs matching 53_hashtag_hub.png */}
          <div className="border-b border-slate-200/80 flex items-center space-x-6 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveAssetFilter('ALL')}
              className={`pb-2.5 cursor-pointer transition flex items-center space-x-1.5 ${
                activeAssetFilter === 'ALL'
                  ? 'border-b-2 border-[#F27421] text-[#F27421]'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>All</span>
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-mono">14</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveAssetFilter('WORKFLOWS')}
              className={`pb-2.5 cursor-pointer transition flex items-center space-x-1.5 ${
                activeAssetFilter === 'WORKFLOWS'
                  ? 'border-b-2 border-[#F27421] text-[#F27421]'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Workflows</span>
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-mono">1</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveAssetFilter('TEMPLATES')}
              className={`pb-2.5 cursor-pointer transition flex items-center space-x-1.5 ${
                activeAssetFilter === 'TEMPLATES'
                  ? 'border-b-2 border-[#F27421] text-[#F27421]'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Templates</span>
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-mono">1</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveAssetFilter('DATABASES')}
              className={`pb-2.5 cursor-pointer transition flex items-center space-x-1.5 ${
                activeAssetFilter === 'DATABASES'
                  ? 'border-b-2 border-[#F27421] text-[#F27421]'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Databases</span>
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-mono">2</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveAssetFilter('CASES')}
              className={`pb-2.5 cursor-pointer transition flex items-center space-x-1.5 ${
                activeAssetFilter === 'CASES'
                  ? 'border-b-2 border-[#F27421] text-[#F27421]'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Cases</span>
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-mono">3</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveAssetFilter('MESSAGES')}
              className={`pb-2.5 cursor-pointer transition flex items-center space-x-1.5 ${
                activeAssetFilter === 'MESSAGES'
                  ? 'border-b-2 border-[#F27421] text-[#F27421]'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Messages</span>
              <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-mono">7</span>
            </button>
          </div>

          {/* 6 Connected Asset Cards Grid matching 53_hashtag_hub.png */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            
            {/* Card 1: Workflows */}
            {(activeAssetFilter === 'ALL' || activeAssetFilter === 'WORKFLOWS') && (
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <GitBranch size={16} />
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 font-heading">Workflows</h3>
                  </div>
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-bold flex items-center justify-center">
                    1
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="p-3 bg-slate-50/70 border border-slate-200/60 rounded-xl flex items-center justify-between hover:bg-slate-100/60 transition cursor-pointer">
                    <span className="text-xs font-medium text-slate-800">
                      New Validation Pipeline v3
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-slate-200 text-slate-700">
                      Draft · locked
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Card 2: Ingestion Templates */}
            {(activeAssetFilter === 'ALL' || activeAssetFilter === 'TEMPLATES') && (
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#F27421] flex items-center justify-center">
                      <FileText size={16} />
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 font-heading">Ingestion templates</h3>
                  </div>
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-bold flex items-center justify-center">
                    1
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="p-3 bg-slate-50/70 border border-slate-200/60 rounded-xl flex items-center justify-between hover:bg-slate-100/60 transition cursor-pointer">
                    <span className="text-xs font-medium text-slate-800">
                      AIB settlement template
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      5 steps · locked
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Card 3: Databases and tables */}
            {(activeAssetFilter === 'ALL' || activeAssetFilter === 'DATABASES') && (
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <Database size={16} />
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 font-heading">Databases and tables</h3>
                  </div>
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-bold flex items-center justify-center">
                    2
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="p-3 bg-slate-50/70 border border-slate-200/60 rounded-xl flex items-center justify-between hover:bg-slate-100/60 transition cursor-pointer">
                    <span className="text-xs font-mono font-medium text-slate-800">
                      Sett · sv_fin_tab
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      MySQL
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50/70 border border-slate-200/60 rounded-xl flex items-center justify-between hover:bg-slate-100/60 transition cursor-pointer">
                    <span className="text-xs font-mono font-medium text-slate-800">
                      Sett · auth_log_tab
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      MySQL
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Card 4: Cases and tasks */}
            {(activeAssetFilter === 'ALL' || activeAssetFilter === 'CASES') && (
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                      <Briefcase size={16} />
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 font-heading">Cases and tasks</h3>
                  </div>
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-bold flex items-center justify-center">
                    3
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="p-2.5 bg-slate-50/70 border border-slate-200/60 rounded-xl flex items-center justify-between hover:bg-slate-100/60 transition cursor-pointer">
                    <span className="text-xs font-medium text-slate-800">ISS-3854 · trn test</span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                      Resolved
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50/70 border border-slate-200/60 rounded-xl flex items-center justify-between hover:bg-slate-100/60 transition cursor-pointer">
                    <span className="text-xs font-medium text-slate-800">ISS-4107</span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-700">
                      Waiting
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50/70 border border-slate-200/60 rounded-xl flex items-center justify-between hover:bg-slate-100/60 transition cursor-pointer">
                    <span className="text-xs font-medium text-slate-800">ISS-4120</span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                      Fixed
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Card 5: Chat messages */}
            {(activeAssetFilter === 'ALL' || activeAssetFilter === 'MESSAGES') && (
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                      <MessageSquare size={16} />
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 font-heading">Chat messages</h3>
                  </div>
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-bold flex items-center justify-center">
                    7
                  </span>
                </div>

                <div className="space-y-2 pt-1 text-xs">
                  <div className="p-2.5 bg-slate-50/70 border border-slate-200/60 rounded-xl flex items-center justify-between hover:bg-slate-100/60 transition cursor-pointer">
                    <span className="text-slate-700 truncate pr-2">
                      <strong className="text-slate-900">@kirubel_ops:</strong> Can you check the fee rounding...
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-200 text-slate-700 shrink-0">
                      ISS-3854
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50/70 border border-slate-200/60 rounded-xl flex items-center justify-between hover:bg-slate-100/60 transition cursor-pointer">
                    <span className="text-slate-700 truncate pr-2">
                      <strong className="text-slate-900">@samuel_tech:</strong> All 24 differences are under 50.00
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-200 text-slate-700 shrink-0">
                      ISS-3854
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50/70 border border-slate-200/60 rounded-xl flex items-center justify-between hover:bg-slate-100/60 transition cursor-pointer">
                    <span className="text-slate-700 truncate pr-2">
                      <strong className="text-slate-900">@manager_alex:</strong> Signed, checker is @checker_ops_2
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-200 text-slate-700 shrink-0">
                      Room
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Card 6: Solution script */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Zap size={16} />
                  </div>
                  <h3 className="font-bold text-sm text-slate-900 font-heading">Solution script</h3>
                </div>
                <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-bold flex items-center justify-center">
                  1
                </span>
              </div>

              <div className="space-y-2 pt-1 text-xs">
                <div className="p-2.5 bg-slate-50/70 border border-slate-200/60 rounded-xl flex items-center justify-between hover:bg-slate-100/60 transition cursor-pointer">
                  <span className="font-mono text-slate-800 text-[11px] truncate pr-2">
                    UPDATE sv_fin_tab SET conamt ...
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-orange-50 text-orange-700 border border-orange-200 shrink-0">
                    Owner edits
                  </span>
                </div>

                <div className="p-2.5 bg-slate-50/70 border border-slate-200/60 rounded-xl flex items-center justify-between hover:bg-slate-100/60 transition cursor-pointer">
                  <span className="text-slate-700 text-[11px] truncate pr-2">
                    Escalation agreement EA-ISS-3854
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 shrink-0">
                    Locked
                  </span>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODE 2: CRONS & SCHEDULES LIST                                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeMainTab === 'CRONS_SCHEDULES' && (
        <div className="space-y-6">
          {/* Header + Filter Pills */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold font-heading text-slate-900">Scheduled Automation Triggers</h2>
              <p className="text-xs text-slate-500 mt-0.5">Recurring CRON schedules and FTP folder pollers</p>
            </div>

            <div className="flex items-center gap-2">
              {(['ALL', 'CRON', 'FTP_POLL', 'EVENT'] as const).map(type => {
                const active = typeFilter === type;
                const count = type === 'ALL' ? automations.length : automations.filter(a => a.triggerType === type).length;
                const label = type === 'ALL' ? 'All' : type === 'CRON' ? 'File Ingestion' : type === 'FTP_POLL' ? 'DB scanner' : 'ETL staging';
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTypeFilter(type)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-white text-slate-900 border border-slate-200 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                    }`}
                  >
                    <span>{label}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAutomations.map(auto => (
              <div
                key={auto.id}
                className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-3 hover:border-slate-300 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900 font-heading">
                    {auto.name}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-slate-100 text-slate-600">
                    {auto.isActive ? 'Active' : 'Draft'}
                  </span>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                  {auto.description}
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">
                    {auto.triggerType}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRunAutomation(auto)}
                    disabled={runningId === auto.id}
                    className="text-[#F27421] hover:underline font-semibold text-xs flex items-center space-x-1 cursor-pointer"
                  >
                    <Play size={11} />
                    <span>Run now</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File Ingestion Modal */}
      {isUploadModalOpen && (
        <HashtagFileUploadModal
          hashtagTag={selectedHashtagTag}
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={(runData) => {
            loadData();
          }}
        />
      )}

      {/* Create Automation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-50 text-[#F27421] rounded-xl border border-orange-200">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Create New Automation</h3>
                  <p className="text-[11px] text-slate-500">Trigger validation pipelines on schedule or event</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAutomation} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Automation Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Nightly CBE Reversal Sweep"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#F27421]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief explanation of what this automation executes..."
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#F27421]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Trigger Type</label>
                  <select
                    value={formType}
                    onChange={(e: any) => setFormType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#F27421] cursor-pointer"
                  >
                    <option value="CRON">Scheduled CRON</option>
                    <option value="FTP_POLL">FTP File Polling</option>
                    <option value="EVENT">Real-time Event / Webhook</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Pipeline</label>
                  <select
                    value={formWorkflowId}
                    onChange={e => setFormWorkflowId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#F27421] cursor-pointer"
                  >
                    {workflows.map(wf => (
                      <option key={wf.id} value={wf.id}>{wf.name}</option>
                    ))}
                    {workflows.length === 0 && <option value="wf-default">CBE Core Settlement Pipeline</option>}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#F27421] hover:bg-[#d65f15] text-white rounded-xl text-xs font-semibold shadow-xs hover:shadow transition cursor-pointer"
                >
                  Create Automation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
