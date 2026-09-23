import React, { useState } from 'react';
import { ValidationBox, DatabaseValidationWorkflow } from '../../../types';
import { 
  GitFork, Boxes, Plus, Search, ShieldCheck, 
  Sparkles, Layers, SlidersHorizontal, ChevronDown, Check 
} from 'lucide-react';

interface WorkflowPaletteProps {
  workflows: DatabaseValidationWorkflow[];
  activeWorkflow: DatabaseValidationWorkflow | null;
  onSelectWorkflow: (wf: DatabaseValidationWorkflow) => void;
  onNewWorkflow: () => void;
  validationBoxes: ValidationBox[];
  onAddTerminalNode: (type: 'START' | 'END', label: string) => void;
  onAddBoxNode: (box: ValidationBox) => void;
  onApplyTemplate: (templateType: 'two_stage' | 'ingress_audit' | 'threeway_match') => void;
  onOpenAggregators: () => void;
  aggregationsCount: number;
}

export const WorkflowPalette: React.FC<WorkflowPaletteProps> = ({
  workflows,
  activeWorkflow,
  onSelectWorkflow,
  onNewWorkflow,
  validationBoxes,
  onAddTerminalNode,
  onAddBoxNode,
  onApplyTemplate,
  onOpenAggregators,
  aggregationsCount
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false);

  const filteredBoxes = validationBoxes.filter(b => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (b.name && b.name.toLowerCase().includes(term)) ||
      (b.targetTable && b.targetTable.toLowerCase().includes(term)) ||
      (b.category && b.category.toLowerCase().includes(term))
    );
  });

  return (
    <aside 
      className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col h-full text-slate-200 font-sans"
      aria-label="Workflow Palette"
    >
      {/* 1. Header & Active Workflow Selector */}
      <div className="p-3.5 border-b border-slate-800 bg-slate-950/60 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-white">
            <div className="p-1.5 bg-blue-950/80 border border-blue-500/40 text-[#155DFC] rounded-lg">
              <GitFork size={15} />
            </div>
            <span className="font-bold text-xs font-mono uppercase tracking-wider">Pipelines</span>
          </div>
          <button
            type="button"
            onClick={onNewWorkflow}
            className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[10px] font-mono font-bold flex items-center space-x-1 cursor-pointer transition shadow-xs"
            title="Create fresh workflow pipeline"
          >
            <Plus size={11} />
            <span>New</span>
          </button>
        </div>

        {/* Workflow Dropdown */}
        <select
          value={activeWorkflow?.id || ''}
          onChange={(e) => {
            const found = workflows.find(w => w.id === e.target.value);
            if (found) onSelectWorkflow(found);
          }}
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 font-mono shadow-2xs"
        >
          {workflows.map(wf => (
            <option key={wf.id} value={wf.id}>
              {wf.name} ({wf.category || 'General'})
            </option>
          ))}
          {workflows.length === 0 && <option value="">No Workflows Found</option>}
        </select>
      </div>

      {/* 2. Scrollable Body: Templates + Terminals + Validation Boxes */}
      <div className="p-3.5 space-y-4 overflow-y-auto flex-1 text-xs">
        {/* Guided Templates Section */}
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowTemplatesDropdown(!showTemplatesDropdown)}
            className="w-full flex items-center justify-between text-[10px] font-bold text-purple-300 font-mono uppercase tracking-wider py-1 px-1.5 rounded hover:bg-slate-800 transition"
          >
            <div className="flex items-center space-x-1.5">
              <Sparkles size={12} className="text-purple-400" />
              <span>Guided Templates</span>
            </div>
            <ChevronDown size={12} className={`transition-transform ${showTemplatesDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showTemplatesDropdown && (
            <div className="space-y-1.5 pt-1">
              {[
                { id: 'two_stage' as const, name: 'Two-Stage Reconciliation', desc: 'Search Auth + Tolerance Check' },
                { id: 'ingress_audit' as const, name: 'Ingress & Audit Lookup', desc: 'Direct DB Mirror Verification' },
                { id: 'threeway_match' as const, name: '3-Way Match & Multi-Currency', desc: 'Gateway, Mirror, & Core Bank' }
              ].map(tpl => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    onApplyTemplate(tpl.id);
                    setShowTemplatesDropdown(false);
                  }}
                  className="w-full text-left p-2 rounded-xl bg-purple-950/30 hover:bg-purple-900/40 border border-purple-800/40 text-purple-200 transition cursor-pointer space-y-0.5 shadow-2xs"
                >
                  <div className="font-bold text-[11px] font-mono">{tpl.name}</div>
                  <div className="text-[10px] text-slate-400 font-sans">{tpl.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Flow Control Terminals */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider block">
            Terminals
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onAddTerminalNode('START', 'Transaction Ingress')}
              className="p-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 text-left transition cursor-pointer flex items-center space-x-1.5 text-xs font-mono font-semibold"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></div>
              <span className="truncate">Start Point</span>
            </button>

            <button
              type="button"
              onClick={() => onAddTerminalNode('END', 'Reconciliation Goal')}
              className="p-2 rounded-xl border border-slate-700 bg-slate-950/50 hover:bg-slate-800 text-slate-300 text-left transition cursor-pointer flex items-center space-x-1.5 text-xs font-mono font-semibold"
            >
              <ShieldCheck size={13} className="text-slate-400 shrink-0" />
              <span className="truncate">End Goal</span>
            </button>
          </div>
        </div>

        {/* Searchable Validation Blocks */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-wider">
              Validation Blocks
            </span>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-mono">
              {filteredBoxes.length}
            </span>
          </div>

          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search blocks..."
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-purple-500 font-sans shadow-inner"
            />
          </div>

          <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-0.5">
            {filteredBoxes.map(box => (
              <div
                key={box.id}
                onClick={() => onAddBoxNode(box)}
                className="p-2.5 bg-slate-950/60 hover:bg-purple-950/40 rounded-xl border border-slate-800 hover:border-purple-500/50 transition cursor-pointer group shadow-2xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${
                    box.boxType === 'INGESTION_SEARCH' 
                      ? 'bg-blue-950 text-blue-300 border border-blue-800' 
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  }`}>
                    {box.boxType === 'INGESTION_SEARCH' ? 'Search' : 'Check'}
                  </span>
                  <Plus size={13} className="text-slate-400 group-hover:text-purple-400 transition" />
                </div>
                <h4 className="text-xs font-bold text-slate-200 group-hover:text-white truncate font-sans">
                  {box.name}
                </h4>
                {box.targetTable && (
                  <p className="text-[10px] text-slate-400 font-mono truncate">
                    {box.targetTable}
                  </p>
                )}
              </div>
            ))}

            {filteredBoxes.length === 0 && (
              <div className="p-3 text-center text-slate-500 italic text-[11px]">
                No validation blocks found.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Footer: Message Aggregation Trigger */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/80">
        <button
          type="button"
          onClick={onOpenAggregators}
          className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-300 flex items-center justify-between cursor-pointer transition shadow-xs"
        >
          <div className="flex items-center space-x-2">
            <SlidersHorizontal size={13} className="text-purple-400" />
            <span>Aggregation Rules</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.2 bg-purple-900/60 text-purple-200 border border-purple-700/60 rounded-full font-mono">
            {aggregationsCount}
          </span>
        </button>
      </div>
    </aside>
  );
};
