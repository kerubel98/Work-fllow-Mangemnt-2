import React from 'react';
import { WorkspaceConfig } from '../WorkspaceSettings';
import { Bell, Volume2, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface WorkspaceNotificationsTabProps {
  config: WorkspaceConfig;
  onChange: (updates: Partial<WorkspaceConfig>) => void;
}

export const WorkspaceNotificationsTab: React.FC<WorkspaceNotificationsTabProps> = ({
  config,
  onChange
}) => {
  return (
    <div className="space-y-4 font-sans" id="workspace-notifications-tab">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center space-x-3 border-b border-slate-100 pb-3">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-200/70">
            <Bell size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-mono">Alerts &amp; Operational Dispatch</h3>
            <p className="text-xs text-slate-500">Configure audible chimes, in-app notifications, and SLA breach escalations.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Toast Banners */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3 hover:border-slate-300 transition-colors">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-900">
                  <Bell size={16} className="text-[#155DFC]" />
                  <span className="text-xs font-bold font-mono">In-App Toasts</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={config.enableInAppToasts}
                    onChange={(e) => onChange({ enableInAppToasts: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#155DFC]"></div>
                </label>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                Display floating toast notifications for real-time validation passes, external DB synchronization, and task imports.
              </p>
            </div>
            <div className="text-[11px] font-mono text-slate-500 flex items-center space-x-1.5 pt-1">
              <span className={`w-2 h-2 rounded-full ${config.enableInAppToasts ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span>{config.enableInAppToasts ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>

          {/* Card 2: Sound Chimes */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3 hover:border-slate-300 transition-colors">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-900">
                  <Volume2 size={16} className="text-purple-600" />
                  <span className="text-xs font-bold font-mono">Audio Chimes</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={config.enableAudioChimes}
                    onChange={(e) => onChange({ enableAudioChimes: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#155DFC]"></div>
                </label>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                Emit subtle auditory cues for incoming team chat messages and discrepancy assignment alerts.
              </p>
            </div>
            <div className="text-[11px] font-mono text-slate-500 flex items-center space-x-1.5 pt-1">
              <span className={`w-2 h-2 rounded-full ${config.enableAudioChimes ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span>{config.enableAudioChimes ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>

          {/* Card 3: SLA Breach Warnings */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3 hover:border-slate-300 transition-colors">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-900">
                  <AlertTriangle size={16} className="text-red-500" />
                  <span className="text-xs font-bold font-mono">SLA Breach Warnings</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={config.enableSlaBreachAlerts}
                    onChange={(e) => onChange({ enableSlaBreachAlerts: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#155DFC]"></div>
                </label>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                Trigger persistent high-priority red alert banners when unassigned transactions cross 80% of their SLA deadline.
              </p>
            </div>
            <div className="text-[11px] font-mono text-slate-500 flex items-center space-x-1.5 pt-1">
              <span className={`w-2 h-2 rounded-full ${config.enableSlaBreachAlerts ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span>{config.enableSlaBreachAlerts ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
