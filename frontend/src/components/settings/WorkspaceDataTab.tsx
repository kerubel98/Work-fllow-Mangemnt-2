import React from 'react';
import { WorkspaceConfig } from '../WorkspaceSettings';
import { Database, FileSpreadsheet, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface WorkspaceDataTabProps {
  config: WorkspaceConfig;
  onChange: (updates: Partial<WorkspaceConfig>) => void;
}

export const WorkspaceDataTab: React.FC<WorkspaceDataTabProps> = ({
  config,
  onChange
}) => {
  return (
    <div className="space-y-4 font-sans" id="workspace-data-tab">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center space-x-3 border-b border-slate-100 pb-3">
          <div className="p-2 bg-blue-50 text-[#155DFC] rounded-xl border border-blue-200/70">
            <Database size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-mono">Data Processing &amp; Display Preferences</h3>
            <p className="text-xs text-slate-500">Configure pagination density, default file export formats, and sensitive card masking.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Records Per Page */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-mono font-bold text-slate-900 uppercase">
                Records Per Page
              </label>
              <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                Number of discrepancy rows displayed simultaneously in the investigation table before pagination splits.
              </p>
            </div>
            <select
              value={config.defaultRowsPerPage}
              onChange={(e) => onChange({ defaultRowsPerPage: Number(e.target.value) || 50 })}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC] shadow-2xs"
            >
              <option value="25">25 rows (Compact)</option>
              <option value="50">50 rows (Standard)</option>
              <option value="100">100 rows (High Density)</option>
              <option value="200">200 rows (Max Performance)</option>
            </select>
          </div>

          {/* Card 2: Default Export Format */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-mono font-bold text-slate-900 uppercase">
                Default Export Format
              </label>
              <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                File format applied automatically when operators click one-click Discrepancy Export.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['xlsx', 'csv', 'json'] as const).map((fmt) => {
                const isSelected = config.defaultExportFormat === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => onChange({ defaultExportFormat: fmt })}
                    className={`py-2 px-2 text-xs font-mono font-bold rounded-xl border transition-all text-center cursor-pointer ${
                      isSelected
                        ? 'bg-[#155DFC] text-white border-[#155DFC] shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    .{fmt.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card 3: Card Masking */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3 hover:border-slate-300 transition-colors">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-slate-900">
                  <ShieldAlert size={16} className="text-purple-600" />
                  <span className="text-xs font-bold font-mono">PAN / Card Masking</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={config.maskSensitiveCardNumbers}
                    onChange={(e) => onChange({ maskSensitiveCardNumbers: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#155DFC]"></div>
                </label>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                PCI-DSS masking: renders primary account numbers as <code className="bg-slate-200 text-slate-800 px-1 py-0.2 rounded font-mono text-[10px]">4111********1111</code> across all grid views and exports.
              </p>
            </div>
            <div className="text-[11px] font-mono text-slate-500 flex items-center space-x-1.5 pt-1">
              <span className={`w-2 h-2 rounded-full ${config.maskSensitiveCardNumbers ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span>{config.maskSensitiveCardNumbers ? 'PCI Masked' : 'Raw Display'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
