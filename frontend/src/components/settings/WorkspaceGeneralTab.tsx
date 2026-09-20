import React from 'react';
import { WorkspaceConfig } from '../WorkspaceSettings';
import { Sliders, Globe, Layout, ShieldCheck, Server, AlertCircle } from 'lucide-react';

interface WorkspaceGeneralTabProps {
  config: WorkspaceConfig;
  onChange: (updates: Partial<WorkspaceConfig>) => void;
}

export const WorkspaceGeneralTab: React.FC<WorkspaceGeneralTabProps> = ({
  config,
  onChange
}) => {
  return (
    <div className="space-y-4 font-sans" id="workspace-general-tab">
      {/* 1. Workspace Identity Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center space-x-3 border-b border-slate-100 pb-3">
          <div className="p-2 bg-blue-50 text-[#155DFC] rounded-xl border border-blue-200/70">
            <Sliders size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-mono">Workspace Identity</h3>
            <p className="text-xs text-slate-500">Name and tenant organization attributes for this operations node.</p>
          </div>
        </div>

        <div className="space-y-3 max-w-xl">
          <div>
            <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
              Workspace Name
            </label>
            <input
              type="text"
              value={config.workspaceName}
              onChange={(e) => onChange({ workspaceName: e.target.value })}
              placeholder="e.g. Global Payment Operations Hub"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-sans text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC] focus:bg-white transition-all shadow-2xs"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Displayed on headers, audit logs, and external discrepancy export certificates.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Environment Mode Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center space-x-3 border-b border-slate-100 pb-3">
          <div className="p-2 bg-purple-50 text-purple-600 rounded-xl border border-purple-200/70">
            <Globe size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-mono">Environment &amp; Deployment Tier</h3>
            <p className="text-xs text-slate-500">Dictates execution strictness, database isolation, and simulated mirror tables.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              id: 'Production' as const,
              label: 'Production Mode',
              desc: 'Live execution against production mirrors with mandatory maker-checker dual controls.',
              badge: 'Strict Governance',
              color: 'emerald'
            },
            {
              id: 'Staging' as const,
              label: 'Staging Mode',
              desc: 'Pre-flight dry-runs and automated verification before deploying rules live.',
              badge: 'Pre-Flight',
              color: 'blue'
            },
            {
              id: 'Sandbox' as const,
              label: 'Sandbox Mode',
              desc: 'Isolated test environment for building SQL templates and training operators.',
              badge: 'Zero Risk',
              color: 'amber'
            }
          ].map(env => {
            const isSelected = config.environmentMode === env.id;
            return (
              <div
                key={env.id}
                onClick={() => onChange({ environmentMode: env.id })}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                  isSelected
                    ? 'border-[#155DFC] bg-blue-50/40 ring-1 ring-[#155DFC]/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs font-mono text-slate-900">{env.label}</span>
                    <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                      env.color === 'emerald' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      env.color === 'blue' ? 'bg-blue-50 text-[#155DFC] border-blue-200' :
                      'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {env.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed font-sans">{env.desc}</p>
                </div>
                <div className="flex items-center space-x-1.5 text-[11px] font-mono text-slate-500">
                  <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-[#155DFC]' : 'bg-slate-300'}`} />
                  <span className={isSelected ? 'font-bold text-[#155DFC]' : 'text-slate-500'}>
                    {isSelected ? 'Active Environment' : 'Select'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Default Landing View Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center space-x-3 border-b border-slate-100 pb-3">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200/70">
            <Layout size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-mono">Default Workspace View</h3>
            <p className="text-xs text-slate-500">Initial operational screen presented when logging into this node.</p>
          </div>
        </div>

        <div className="max-w-xl">
          <select
            value={config.defaultLandingView}
            onChange={(e) => onChange({ defaultLandingView: e.target.value as any })}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC] focus:bg-white shadow-2xs"
          >
            <option value="workspace">Investigation Workspace (Main Discrepancy Queue)</option>
            <option value="my_tasks">My Assigned Tasks (Kanban Board)</option>
            <option value="hashtags">Hashtag Preset &amp; Knowledge Library</option>
          </select>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Operators can always switch views dynamically via the top navigation rail.
          </p>
        </div>
      </div>
    </div>
  );
};
