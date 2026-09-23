import React from 'react';
import { FlowchartNode, FlowchartConnection, FlowchartOutputAction, ValidationBox } from '../../../types';
import { 
  Sliders, Link2, X, Trash2, CheckCircle2, 
  FileSpreadsheet, ArrowRight, Unlink, ShieldCheck, Database, Info
} from 'lucide-react';
import { globalMappingService } from '../../../services/globalMappingService';

interface WorkflowInspectorProps {
  selectedNode: FlowchartNode | null;
  onUpdateNode: (updated: FlowchartNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onCloseNode: () => void;

  selectedConnection: FlowchartConnection | null;
  onUpdateConnection: (updated: FlowchartConnection) => void;
  onDeleteConnection: (connectionId: string) => void;
  onCloseConnection: () => void;

  validationBoxes: ValidationBox[];
}

export const WorkflowInspector: React.FC<WorkflowInspectorProps> = ({
  selectedNode,
  onUpdateNode,
  onDeleteNode,
  onCloseNode,
  selectedConnection,
  onUpdateConnection,
  onDeleteConnection,
  onCloseConnection,
  validationBoxes
}) => {
  // Case 1: Inspecting a Node
  if (selectedNode) {
    const boundBox = validationBoxes.find(b => b.id === selectedNode.boxId);
    const isTerminal = selectedNode.type === 'START' || selectedNode.type === 'END';

    return (
      <aside 
        className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full text-slate-200 overflow-y-auto font-sans"
        aria-label="Node Inspector"
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 sticky top-0 z-10">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-purple-950/80 border border-purple-500/40 text-purple-300 rounded-lg">
              <Sliders size={16} />
            </div>
            <div>
              <h3 className="text-xs font-bold font-mono text-white uppercase tracking-wider">
                Node Inspector
              </h3>
              <p className="text-[10px] text-slate-400 font-mono truncate max-w-[170px]">
                {selectedNode.name || selectedNode.id}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseNode}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            title="Close Inspector"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs flex-1">
          {/* Node Identity */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-mono text-slate-400 font-bold uppercase">
              Block Label
            </label>
            <input
              type="text"
              value={selectedNode.name || ''}
              onChange={(e) => onUpdateNode({ ...selectedNode, name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-sans text-white focus:outline-none focus:border-purple-500 shadow-2xs"
            />
          </div>

          {/* Node Type & Binding */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">Node Type:</span>
              <span className="font-bold text-purple-300">{selectedNode.type}</span>
            </div>
            {boundBox && (
              <>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400">Validation Box:</span>
                  <span className="font-bold text-white truncate max-w-[140px]">{boundBox.name}</span>
                </div>
                {boundBox.targetTable && (
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-400">Target Table:</span>
                    <span className="text-emerald-400 font-mono truncate max-w-[140px]">{boundBox.targetTable}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Pipeline Routing Outcomes (PASS & FAIL) */}
          {!isTerminal && (
            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
              <span className="font-bold text-slate-300 flex items-center space-x-1.5 text-[11px] font-mono uppercase">
                <Sliders size={13} className="text-blue-400" />
                <span>Routing Outcomes</span>
              </span>

              <div className="space-y-2.5">
                <div>
                  <label className="block text-[10px] font-mono text-emerald-400 mb-1 font-bold">
                    On PASS Action:
                  </label>
                  <select
                    value={selectedNode.onPassAction || 'CONTINUE'}
                    onChange={(e) => onUpdateNode({ ...selectedNode, onPassAction: e.target.value as FlowchartOutputAction })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none font-mono text-emerald-300 focus:border-emerald-500"
                  >
                    <option value="CONTINUE">CONTINUE (Advance Downstream)</option>
                    <option value="STOP">STOP (Halt Pipeline)</option>
                    <option value="REPORT">REPORT (Add Intermediate Col)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-rose-400 mb-1 font-bold">
                    On FAIL Action:
                  </label>
                  <select
                    value={selectedNode.onFailAction || 'STOP'}
                    onChange={(e) => onUpdateNode({ ...selectedNode, onFailAction: e.target.value as FlowchartOutputAction })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none font-mono text-rose-300 focus:border-rose-500"
                  >
                    <option value="STOP">STOP (Halt Pipeline)</option>
                    <option value="CONTINUE">CONTINUE (Advance Downstream)</option>
                    <option value="REPORT">REPORT (Add Intermediate Col)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Intermediate Report Column Configuration */}
          {(selectedNode.onPassAction === 'REPORT' || selectedNode.onFailAction === 'REPORT') && (
            <div className="p-3 bg-purple-950/40 border border-purple-800/80 rounded-xl space-y-2.5 text-purple-200">
              <span className="font-bold flex items-center space-x-1.5 text-[11px] font-mono text-purple-300">
                <FileSpreadsheet size={13} />
                <span>Intermediate Report Column</span>
              </span>
              <div>
                <label className="block text-[10px] font-mono text-slate-300 mb-1">
                  Grid Header Title:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Auth Response Code"
                  value={selectedNode.reportColumnName || ''}
                  onChange={(e) => onUpdateNode({ ...selectedNode, reportColumnName: e.target.value })}
                  className="w-full bg-slate-900 border border-purple-700/60 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-300 mb-1">
                  Projected Column / Field:
                </label>
                <select
                  value={selectedNode.reportField || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const std = globalMappingService.getStandardFields().find(f => f.key === val);
                    onUpdateNode({
                      ...selectedNode,
                      reportField: val,
                      reportColumnName: (!selectedNode.reportColumnName || selectedNode.reportColumnName === 'Result') && std
                        ? std.label
                        : selectedNode.reportColumnName
                    });
                  }}
                  className="w-full bg-slate-900 border border-purple-700/60 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-400 font-mono shadow-inner"
                >
                  <option value="">-- Select Standard Field --</option>
                  {globalMappingService.getStandardFields().map(f => (
                    <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
                  ))}
                  {selectedNode.reportField && !globalMappingService.getStandardFields().some(f => f.key === selectedNode.reportField) && (
                    <option value={selectedNode.reportField}>{selectedNode.reportField} (Custom)</option>
                  )}
                </select>
              </div>
            </div>
          )}

          {/* Attached Database Table Column Rules */}
          {((selectedNode.columnConfigurations && selectedNode.columnConfigurations.length > 0) || (selectedNode.columnConfigurationIds && selectedNode.columnConfigurationIds.length > 0)) && (
            <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-400 flex items-center space-x-1.5 text-[11px] font-mono uppercase">
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  <span>Attached Table Rules ({selectedNode.columnConfigurations?.length || selectedNode.columnConfigurationIds?.length})</span>
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Active completeness, range, and pattern rules configured on the target database table:
              </p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {(selectedNode.columnConfigurations || []).map((cfg) => (
                  <div key={cfg.id} className="p-1.5 bg-slate-900 border border-slate-800 rounded-lg text-[11px] flex items-center justify-between">
                    <div className="flex items-center space-x-1">
                      <span className="font-mono text-emerald-300 font-semibold">{cfg.column_name}</span>
                      <span className="text-slate-500 text-[9px]">({cfg.data_type || 'text'})</span>
                    </div>
                    <div className="flex space-x-1 text-[8px] font-mono">
                      {cfg.completeness_rule?.enabled && <span className="px-1 py-0.2 bg-emerald-900/60 text-emerald-300 rounded border border-emerald-700/50">Complete</span>}
                      {cfg.value_range_rule?.enabled && <span className="px-1 py-0.2 bg-blue-900/60 text-blue-300 rounded border border-blue-700/50">Range</span>}
                      {cfg.pattern_rule?.enabled && <span className="px-1 py-0.2 bg-purple-900/60 text-purple-300 rounded border border-purple-700/50">Pattern</span>}
                      {cfg.value_label_rule?.enabled && <span className="px-1 py-0.2 bg-amber-900/60 text-amber-300 rounded border border-amber-700/50">Labels</span>}
                      {cfg.duplicate_rule?.is_duplicate_key && <span className="px-1 py-0.2 bg-rose-900/60 text-rose-300 rounded border border-rose-700/50">Duplicate</span>}
                    </div>
                  </div>
                ))}
                {(!selectedNode.columnConfigurations || selectedNode.columnConfigurations.length === 0) && selectedNode.columnConfigurationIds && (
                  <div className="text-[11px] text-slate-400 font-mono">
                    {selectedNode.columnConfigurationIds.length} column rule(s) linked to this box.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Delete Action */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 sticky bottom-0">
          <button
            type="button"
            onClick={() => onDeleteNode(selectedNode.id)}
            className="w-full py-2 px-3 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-xl text-xs font-mono font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-xs"
          >
            <Trash2 size={13} />
            <span>Delete Block</span>
          </button>
        </div>
      </aside>
    );
  }

  // Case 2: Inspecting a Connection Wire
  if (selectedConnection) {
    return (
      <aside 
        className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full text-slate-200 overflow-y-auto font-sans"
        aria-label="Connection Wire Inspector"
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 sticky top-0 z-10">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 bg-blue-950/80 border border-blue-500/40 text-blue-300 rounded-lg">
              <Link2 size={16} />
            </div>
            <div>
              <h3 className="text-xs font-bold font-mono text-white uppercase tracking-wider">
                Wire Outcome
              </h3>
              <p className="text-[10px] text-slate-400 font-mono">
                Port: {selectedConnection.fromPort.toUpperCase()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseConnection}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            title="Close Inspector"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs flex-1">
          <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
            Configure transaction routing behavior when evaluation traverses this wire:
          </p>

          <div className="space-y-2">
            {[
              {
                id: 'CONTINUE' as const,
                label: 'Continue Downstream',
                desc: 'Progress directly to the connected downstream node.',
                badge: '🟢 PASS'
              },
              {
                id: 'STOP' as const,
                label: 'Stop Pipeline',
                desc: 'Halt transaction execution here and mark as FLAGGED.',
                badge: '🔴 HALT'
              },
              {
                id: 'REPORT' as const,
                label: 'Report & Continue',
                desc: 'Project this stage result as an extra column in Investigation Grid.',
                badge: '📊 REPORT'
              }
            ].map(opt => {
              const isSelected = selectedConnection.action === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => onUpdateConnection({ ...selectedConnection, action: opt.id, label: opt.label })}
                  className={`p-3 rounded-xl border transition cursor-pointer space-y-1 ${
                    isSelected
                      ? 'bg-purple-950/60 border-purple-500 text-white shadow-2xs'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white">{opt.label}</span>
                    <span className="text-[10px] font-mono font-bold text-slate-400">{opt.badge}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">{opt.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/60 sticky bottom-0">
          <button
            type="button"
            onClick={() => onDeleteConnection(selectedConnection.id)}
            className="w-full py-2 px-3 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-xl text-xs font-mono font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-xs"
          >
            <Unlink size={13} />
            <span>Delete Wire</span>
          </button>
        </div>
      </aside>
    );
  }

  // Case 3: Empty State (no node or wire selected)
  return (
    <aside 
      className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col items-center justify-center p-6 text-center text-slate-400 font-sans"
      aria-label="Inspector Empty State"
    >
      <div className="w-10 h-10 rounded-2xl bg-slate-800/70 border border-slate-700 flex items-center justify-center text-slate-400 mb-3 shadow-inner">
        <Info size={20} />
      </div>
      <h4 className="text-xs font-bold font-mono text-slate-200 mb-1">Properties Inspector</h4>
      <p className="text-[11px] text-slate-400 max-w-[200px] leading-relaxed">
        Click any validation block or connection wire on the flowchart canvas to view and configure properties.
      </p>
    </aside>
  );
};
