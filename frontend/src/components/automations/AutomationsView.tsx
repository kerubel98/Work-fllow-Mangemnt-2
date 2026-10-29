import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, Clock, RefreshCw, Zap, Play, CheckCircle2, AlertCircle, 
  Trash2, Edit3, X, ArrowRight, ShieldCheck, Database, Calendar, Settings, Tag, Layers
} from 'lucide-react';
import { api } from '../../api/client';
import { DatabaseValidationWorkflow } from '../../types';
import { HashtagOwnerDetailView } from './HashtagOwnerDetailView';
import { EndToEndFlowDiagram } from './EndToEndFlowDiagram';


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
  const [activeMainTab, setActiveMainTab] = useState<'AUTOMATIONS' | 'HASHTAG_OWNER' | 'FLOW_DIAGRAM'>('AUTOMATIONS');
  const [selectedHashtagTag, setSelectedHashtagTag] = useState<string>('#AIB_SETTLEMENT_2026');


  const loadData = async () => {
    setLoading(true);
    try {
      const [wfs, ftpConfigs] = await Promise.allSettled([
        api.getWorkflows(),
        api.getFtpStagingConfigs()
      ]);

      const loadedWfs: DatabaseValidationWorkflow[] = wfs.status === 'fulfilled' ? wfs.value : [];
      setWorkflows(loadedWfs);

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
  }, []);

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

  const handleToggleActive = (id: string) => {
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a));
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
        onBack={() => setActiveMainTab('AUTOMATIONS')}
        onOpenFlowDiagram={() => setActiveMainTab('FLOW_DIAGRAM')}
      />
    );
  }

  if (activeMainTab === 'FLOW_DIAGRAM') {
    return (
      <EndToEndFlowDiagram onBack={() => setActiveMainTab('AUTOMATIONS')} />
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 overflow-y-auto p-6 space-y-6 font-sans bg-[#F8FAFC]">
      {/* 1. Header matching 06_automations.png */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight">Automations</h1>
          <p className="text-xs text-slate-500 mt-1 font-sans">
            Reusable #directives that detect recurring issues and fix them with approved SQL.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveMainTab('AUTOMATIONS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeMainTab === 'AUTOMATIONS'
                  ? 'bg-[#0F172B] text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Crons & Triggers
            </button>
            <button
              type="button"
              id="tab-hashtag-owner-view"
              onClick={() => setActiveMainTab('HASHTAG_OWNER')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1 ${
                activeMainTab === 'HASHTAG_OWNER'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Tag size={12} />
              <span>Hashtag Owner View</span>
            </button>
            <button
              type="button"
              id="tab-e2e-flow-diagram"
              onClick={() => setActiveMainTab('FLOW_DIAGRAM')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1 ${
                activeMainTab === 'FLOW_DIAGRAM'
                  ? 'bg-purple-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Layers size={12} />
              <span>E2E Architecture</span>
            </button>
          </div>

          <button
            id="btn-new-automation"
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#F27421] hover:bg-[#E06310] text-white rounded-lg font-semibold text-xs transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ New automation</span>
          </button>
        </div>
      </div>


      {/* 2. Filter Pills & Search */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
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
                {type === 'ALL' && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search automations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#F27421] transition-all shadow-2xs"
          />
        </div>
      </div>

      {/* 3. Master-Detail Split Pane */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 animate-pulse font-medium">Loading automation triggers...</div>
      ) : filteredAutomations.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200/80 rounded-xl shadow-xs">
          <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-800">No automations found</h3>
          <p className="text-xs text-slate-500 mt-1">Create an automation to schedule nightly reconciliations or poll FTP staging folders.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Automation List */}
          <div className="lg:col-span-4 space-y-3">
            {filteredAutomations.map(auto => {
              const isSelected = (selectedAuto?.id || filteredAutomations[0]?.id) === auto.id;
              const hashtagName = auto.name.startsWith('#') ? auto.name : `#${auto.name.toUpperCase().replace(/\s+/g, '_').slice(0, 16)}`;
              return (
                <div
                  key={auto.id}
                  onClick={() => setSelectedId(auto.id)}
                  className={`bg-white rounded-xl p-4 shadow-xs transition-all cursor-pointer ${
                    isSelected
                      ? 'border-2 border-[#F27421]'
                      : 'border border-slate-200/80 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold font-mono text-xs text-slate-900 tracking-tight">
                      {hashtagName}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-slate-100 text-slate-600">
                      {auto.isActive ? 'Active' : 'Draft'}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-3">
                    {auto.description}
                  </p>

                  <div className="flex items-center justify-between text-xs">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">
                      {auto.triggerType === 'FTP_POLL' ? 'File ingestion' : auto.triggerType === 'CRON' ? 'DB scanner' : 'ETL staging'}
                    </span>
                    <span className="text-slate-400 font-mono text-xs">
                      @tech_sarah
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Selected Automation Detail Panel */}
          {selectedAuto && (
            <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200/80 p-6 shadow-xs space-y-6">
              {/* Top Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-bold font-mono text-slate-900">
                      {selectedAuto.name.startsWith('#') ? selectedAuto.name : `#${selectedAuto.name.toUpperCase().replace(/\s+/g, '_').slice(0, 16)}`}
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                      {selectedAuto.triggerType === 'FTP_POLL' ? 'File ingestion' : selectedAuto.triggerType === 'CRON' ? 'DB scanner' : 'ETL staging'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    {selectedAuto.description}
                  </p>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRunAutomation(selectedAuto)}
                    disabled={runningId === selectedAuto.id}
                    className="flex items-center space-x-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={runningId === selectedAuto.id ? 'animate-spin' : ''} />
                    <span>Pre-flight test</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer shadow-2xs"
                  >
                    <Edit3 size={12} />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    className="p-1.5 border border-slate-200 hover:bg-slate-50 text-slate-400 rounded-lg transition-colors cursor-pointer"
                  >
                    <Settings size={14} />
                  </button>
                </div>
              </div>

              {/* Linked Workflow Banner */}
              <div className="p-4 border border-slate-200/80 rounded-xl bg-slate-50/50 flex items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                    <Database size={15} />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                      Linked workflow
                    </span>
                    <span className="text-xs font-bold text-slate-900 font-heading">
                      {selectedAuto.workflowName || 'End-to-End Multi-Stage Transaction Reconciliation'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 text-xs font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>Draft · awaiting approval</span>
                  </span>

                  <button
                    type="button"
                    className="px-3.5 py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    Submit for approval
                  </button>
                </div>
              </div>

              {/* Detection Criteria & Required Columns */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-7 space-y-2">
                  <h3 className="text-xs font-bold font-heading text-slate-900">Detection criteria</h3>
                  <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl text-xs text-slate-700 leading-relaxed font-sans">
                    Amount match, card number match, transaction time window under 300 seconds, response code 00 (success).
                  </div>
                </div>

                <div className="md:col-span-5 space-y-2">
                  <h3 className="text-xs font-bold font-heading text-slate-900">Required columns</h3>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {['Transaction_ID', 'Card_Number', 'Amount_USD', 'Auth_Time'].map(col => (
                      <span key={col} className="px-2.5 py-1 bg-slate-100 text-slate-700 font-mono text-[11px] rounded-md border border-slate-200/60">
                        {col}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 font-sans pt-1">
                    No dictionary lookups configured
                  </p>
                </div>
              </div>

              {/* SQL Remediation Block */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold font-heading text-slate-900">SQL remediation</h3>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText("UPDATE transactions SET status = 'REVERSED', resolution_code = 'DUP_AUTH_CLEANUP' WHERE txn_id = '{{Transaction_ID}}' AND card_number = '{{Card_Number}}';")}
                    className="flex items-center space-x-1 px-2.5 py-1 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  >
                    <span>Copy</span>
                  </button>
                </div>

                <div className="bg-[#0F142A] text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto leading-relaxed border border-slate-800">
                  <span className="text-amber-400">UPDATE</span> transactions <span className="text-amber-400">SET</span> status = <span className="text-emerald-400">'REVERSED'</span>, resolution_code = <span className="text-emerald-400">'DUP_AUTH_CLEANUP'</span><br />
                  <span className="text-amber-400">WHERE</span> txn_id = <span className="text-sky-300">'&#123;&#123;Transaction_ID&#125;&#125;'</span> <span className="text-amber-400">AND</span> card_number = <span className="text-sky-300">'&#123;&#123;Card_Number&#125;&#125;'</span> ...
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Create Automation Modal matching 07_create_automation_modal.png */}
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

            <form onSubmit={handleCreateAutomation} className="p-5 space-y-4">
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

              {formType === 'CRON' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">Cron Expression</label>
                    <div className="flex gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => { setFormSchedule('0 * * * *'); setFormPreset('hourly'); }}
                        className={`px-1.5 py-0.5 rounded cursor-pointer ${formPreset === 'hourly' ? 'bg-[#F27421] text-white' : 'bg-slate-100 text-slate-600'}`}
                      >
                        Hourly
                      </button>
                      <button
                        type="button"
                        onClick={() => { setFormSchedule('0 2 * * *'); setFormPreset('daily'); }}
                        className={`px-1.5 py-0.5 rounded cursor-pointer ${formPreset === 'daily' ? 'bg-[#F27421] text-white' : 'bg-slate-100 text-slate-600'}`}
                      >
                        Daily 2am
                      </button>
                      <button
                        type="button"
                        onClick={() => { setFormSchedule('*/15 * * * *'); setFormPreset('15min'); }}
                        className={`px-1.5 py-0.5 rounded cursor-pointer ${formPreset === '15min' ? 'bg-[#F27421] text-white' : 'bg-slate-100 text-slate-600'}`}
                      >
                        15 Min
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    required
                    value={formSchedule}
                    onChange={e => setFormSchedule(e.target.value)}
                    className="w-full font-mono bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#F27421]"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  id="btn-cancel-automation"
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
