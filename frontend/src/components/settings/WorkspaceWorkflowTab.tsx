import React from 'react';
import { WorkspaceConfig } from '../WorkspaceSettings';
import { GitBranch, Clock, ArrowRight, Zap, PlayCircle, Tag, CheckCircle2 } from 'lucide-react';

interface WorkspaceWorkflowTabProps {
  config: WorkspaceConfig;
  onChange: (updates: Partial<WorkspaceConfig>) => void;
  onOpenWorkflowStudio: () => void;
}

export const WorkspaceWorkflowTab: React.FC<WorkspaceWorkflowTabProps> = ({
  config,
  onChange,
  onOpenWorkflowStudio
}) => {
  return (
    <div className="space-y-4 font-sans" id="workspace-workflow-tab">
      {/* 1. Dedicated Studio Quick-Access Card */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 border border-blue-800">
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2">
            <span className="p-1.5 bg-blue-500/20 text-blue-300 rounded-lg border border-blue-400/30">
              <GitBranch size={16} />
            </span>
            <h3 className="text-sm font-bold font-mono tracking-wide">Workflow Studio &amp; DAG Engine</h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/20 font-semibold">
              Full-Page Canvas
            </span>
          </div>
          <p className="text-xs text-blue-200 max-w-xl leading-relaxed">
            Design multi-stage reconciliation pipelines, validation nodes, database mirror comparisons, and automated branch routing in a dedicated visual flowchart editor.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenWorkflowStudio}
          className="inline-flex items-center space-x-2 px-4 py-2.5 bg-white text-blue-950 hover:bg-blue-50 font-bold text-xs rounded-xl shadow-sm transition-all whitespace-nowrap self-start md:self-auto cursor-pointer"
        >
          <span>Open Workflow Studio</span>
          <ArrowRight size={14} />
        </button>
      </div>

      {/* 2. Operational Automation Rules */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center space-x-3 border-b border-slate-100 pb-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-200/70">
            <Zap size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-mono">Operational Execution Policies</h3>
            <p className="text-xs text-slate-500">Automate task dispatch, compliance gates, and script-triggered reconciliation runs.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Toggle: Auto-Assign New Cases */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start justify-between space-x-3 hover:border-slate-300 transition-colors">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <CheckCircle2 size={15} className="text-[#155DFC]" />
                <span className="text-xs font-bold font-mono text-slate-900">Auto-Assign Incoming Cases</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                Automatically allocate newly ingested discrepancy rows to online back-office specialists using weighted round-robin.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={config.autoAssignNewCases}
                onChange={(e) => onChange({ autoAssignNewCases: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#155DFC]"></div>
            </label>
          </div>

          {/* Toggle: Require Hashtag For Resolution */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start justify-between space-x-3 hover:border-slate-300 transition-colors">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Tag size={15} className="text-purple-600" />
                <span className="text-xs font-bold font-mono text-slate-900">Require Hashtag for Resolution</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                Mandate that every manual discrepancy resolution binds to a registered universal #hashtag (e.g. #AIB_SETTLEMENT_2026).
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={config.requireHashtagForResolution}
                onChange={(e) => onChange({ requireHashtagForResolution: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#155DFC]"></div>
            </label>
          </div>

          {/* Toggle: Require Sandbox Simulation */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start justify-between space-x-3 hover:border-slate-300 transition-colors">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <PlayCircle size={15} className="text-amber-600" />
                <span className="text-xs font-bold font-mono text-slate-900">Require Sandbox Simulation</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                Block live rule deployments until automated pre-flight reconciliation dry-run tests finish with 0 critical syntax errors.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={config.requireSandboxSimulation}
                onChange={(e) => onChange({ requireSandboxSimulation: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#155DFC]"></div>
            </label>
          </div>

          {/* Toggle: Auto Reconcile on Script Execution */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start justify-between space-x-3 hover:border-slate-300 transition-colors">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Zap size={15} className="text-emerald-600" />
                <span className="text-xs font-bold font-mono text-slate-900">Auto Reconcile on Script Execution</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                Immediately trigger composite tuple matching against mirror tables as soon as an external batch ingestion script completes.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={config.autoReconcileOnScriptExecution}
                onChange={(e) => onChange({ autoReconcileOnScriptExecution: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#155DFC]"></div>
            </label>
          </div>
        </div>
      </div>

      {/* 3. SLA Targets Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center space-x-3 border-b border-slate-100 pb-3">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-200/70">
            <Clock size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-mono">Service Level Agreement (SLA) Targets</h3>
            <p className="text-xs text-slate-500">Maximum allowable resolution turnaround hours before automated escalation triggers.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-red-200/80 bg-red-50/30 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-bold text-red-900 uppercase">Critical Priority</label>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-100 text-red-800 font-bold">P1</span>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                min="1"
                max="168"
                value={config.slaCriticalHours}
                onChange={(e) => onChange({ slaCriticalHours: Number(e.target.value) || 1 })}
                className="w-24 bg-white border border-red-300 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-red-500 shadow-2xs"
              />
              <span className="text-xs font-mono text-slate-500">hours</span>
            </div>
            <p className="text-[11px] text-slate-600">Financial threshold breaches &gt; $50,000</p>
          </div>

          <div className="p-4 rounded-xl border border-amber-200/80 bg-amber-50/30 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-bold text-amber-900 uppercase">High Priority</label>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">P2</span>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                min="1"
                max="336"
                value={config.slaHighHours}
                onChange={(e) => onChange({ slaHighHours: Number(e.target.value) || 1 })}
                className="w-24 bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-2xs"
              />
              <span className="text-xs font-mono text-slate-500">hours</span>
            </div>
            <p className="text-[11px] text-slate-600">Cross-border settlement breaks</p>
          </div>

          <div className="p-4 rounded-xl border border-blue-200/80 bg-blue-50/30 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-bold text-[#155DFC] uppercase">Medium Priority</label>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-[#155DFC] font-bold">P3</span>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                min="1"
                max="720"
                value={config.slaMediumHours}
                onChange={(e) => onChange({ slaMediumHours: Number(e.target.value) || 1 })}
                className="w-24 bg-white border border-blue-300 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-[#155DFC] shadow-2xs"
              />
              <span className="text-xs font-mono text-slate-500">hours</span>
            </div>
            <p className="text-[11px] text-slate-600">Standard reconciliation anomalies</p>
          </div>
        </div>
      </div>
    </div>
  );
};
