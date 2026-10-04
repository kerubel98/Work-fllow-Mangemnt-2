import React, { useState } from 'react';
import { ValidationBox, DatabaseValidationWorkflow } from '../../../types';
import { 
  Plus, Search, 
  Sparkles, SlidersHorizontal, ChevronDown, Check,
  Play, ArrowRightToLine, FileSpreadsheet
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
  const [triggersOpen, setTriggersOpen] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(true);
  const [reportAggregatorOpen, setReportAggregatorOpen] = useState(true);
  const [templatesOpen, setTemplatesOpen] = useState(false);

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
      className="w-72 bg-[#071318] border-r border-[#163848] flex flex-col h-full text-slate-200 select-none overflow-hidden font-sans"
      aria-label="Flow Block Catalog"
    >
      {/* 1. Catalog Header & Search */}
      <div className="p-3.5 border-b border-[#163848] space-y-2.5 bg-[#09151d] shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono">
            Flow Block Catalog
          </h3>
          <button
            type="button"
            onClick={onNewWorkflow}
            className="p-1 hover:bg-[#163848] text-cyan-400 hover:text-white rounded-lg transition cursor-pointer"
            title="Create New Blank Workflow"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Search input matching design */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-cyan-400/80" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search blocks..."
            className="w-full bg-[#071318] border border-[#163848] rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 font-sans shadow-inner transition"
          />
        </div>

        {/* Active Workflow Switcher */}
        {workflows.length > 0 && (
          <div className="pt-1">
            <select
              value={activeWorkflow?.id || ''}
              onChange={(e) => {
                const target = workflows.find(w => w.id === e.target.value);
                if (target) onSelectWorkflow(target);
              }}
              className="w-full bg-[#071318] border border-[#163848] rounded-xl px-2.5 py-1 text-[11px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-400"
            >
              {workflows.map(wf => (
                <option key={wf.id} value={wf.id}>
                  {wf.name} ({wf.category || 'General'})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 2. Scrollable Body: Triggers, Rules & Validations, Report Aggregator */}
      <div className="p-3.5 space-y-4 overflow-y-auto flex-1 min-h-0 text-xs">
        
        {/* Section 1: Flow Triggers */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setTriggersOpen(!triggersOpen)}
            className="w-full flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white transition py-0.5 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${triggersOpen ? '' : '-rotate-90'}`} />
              <span>Flow Triggers</span>
            </span>
          </button>

          {triggersOpen && (
            <div className="grid grid-cols-2 gap-2.5 pt-0.5">
              {/* Start Point Button (Replaces Settlement) */}
              <button
                type="button"
                onClick={() => onAddTerminalNode('START', 'Start Point')}
                className="p-3 rounded-xl bg-[#0c222b] border border-[#184457] hover:border-cyan-400 hover:bg-[#0e2a36] text-cyan-200 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition shadow-xs group"
                title="Add Start Point Trigger"
              >
                <div className="p-1.5 rounded-lg bg-[#072422] text-[#00e5b3] group-hover:scale-110 transition shadow-xs">
                  <Play size={16} className="fill-[#00e5b3] text-[#00e5b3]" />
                </div>
                <span className="text-xs font-medium text-slate-200 group-hover:text-white">Start Point</span>
              </button>

              {/* End Trigger Button */}
              <button
                type="button"
                onClick={() => onAddTerminalNode('END', 'End Goal')}
                className="p-3 rounded-xl bg-[#0c222b] border border-[#184457] hover:border-cyan-400 hover:bg-[#0e2a36] text-cyan-200 flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition shadow-xs group"
                title="Add Terminal End Trigger"
              >
                <div className="p-1.5 rounded-lg bg-[#0e212b] text-cyan-400 group-hover:scale-110 transition">
                  <ArrowRightToLine size={16} />
                </div>
                <span className="text-xs font-medium text-slate-200 group-hover:text-white">End Trigger</span>
              </button>
            </div>
          )}
        </div>

        {/* Section 2: Rules & Validations */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setRulesOpen(!rulesOpen)}
            className="w-full flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white transition py-0.5 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${rulesOpen ? '' : '-rotate-90'}`} />
              <span>Rules &amp; Validations</span>
            </span>
            <span className="text-[10px] font-mono text-cyan-400 px-1.5 py-0.2 rounded bg-[#0c222b] border border-[#184457]">
              {filteredBoxes.length}
            </span>
          </button>

          {rulesOpen && (
            <div className="space-y-2 pt-0.5 max-h-[340px] overflow-y-auto pr-0.5">
              {filteredBoxes.map(box => {
                const isSearch = box.boxType === 'INGESTION_SEARCH';
                return (
                  <div
                    key={box.id}
                    onClick={() => onAddBoxNode(box)}
                    className="p-2.5 rounded-xl bg-[#0a1e27] border border-[#163848] hover:border-cyan-400/80 hover:bg-[#0d2531] transition cursor-pointer flex items-start gap-2.5 shadow-xs group"
                    title={`Add "${box.name}" block to canvas`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#0c2e35] border border-[#144f56] text-[#00e5b3] flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                      {isSearch ? <Search size={14} /> : <Check size={14} strokeWidth={2.5} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-semibold text-white group-hover:text-cyan-200 truncate">
                        {box.name}
                      </h4>
                      <p className="text-[10px] text-slate-400 truncate line-clamp-1 mt-0.5">
                        {box.description || (box.targetTable ? `Table: ${box.targetTable}` : 'Attach explicit completeness, value range, duplicate, and i...')}
                      </p>
                    </div>
                  </div>
                );
              })}

              {filteredBoxes.length === 0 && (
                <div className="p-4 text-center text-slate-500 italic text-[11px] rounded-xl border border-dashed border-[#163848]">
                  No validation blocks found.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 3: Report Aggregator (Replaces Endpoints with same design card) */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setReportAggregatorOpen(!reportAggregatorOpen)}
            className="w-full flex items-center justify-between text-xs font-semibold text-slate-300 hover:text-white transition py-0.5 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${reportAggregatorOpen ? '' : '-rotate-90'}`} />
              <span>Report Aggregator</span>
            </span>
            <span className="text-[10px] font-mono text-[#00e5b3] px-2 py-0.2 rounded-full bg-[#072422] border border-[#00e5b3]/40 font-bold">
              {aggregationsCount}
            </span>
          </button>

          {reportAggregatorOpen && (
            <div className="space-y-2 pt-0.5">
              <div 
                onClick={onOpenAggregators}
                className="p-2.5 rounded-xl bg-[#0a1e27] border border-[#163848] hover:border-cyan-400/80 hover:bg-[#0d2531] transition cursor-pointer flex items-start gap-2.5 shadow-xs group"
                title="Configure Report Aggregation Rules & Outcome Messages"
              >
                <div className="w-7 h-7 rounded-lg bg-[#181c38] border border-purple-500/50 text-purple-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition shadow-xs">
                  <FileSpreadsheet size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-white group-hover:text-cyan-200 truncate">
                      Report Aggregator
                    </h4>
                    <span className="text-[9px] font-mono text-cyan-400 uppercase font-bold">Config</span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate line-clamp-1 mt-0.5">
                    Consolidated PASS/FAIL messages &amp; unified outcomes
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 4: Guided Templates */}
        <div className="space-y-1.5 pt-2 border-t border-[#163848]">
          <button
            type="button"
            onClick={() => setTemplatesOpen(!templatesOpen)}
            className="w-full flex items-center justify-between text-[11px] font-semibold text-purple-300 hover:text-purple-200 transition py-1 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-purple-400" />
              <span>Guided Templates</span>
            </span>
            <ChevronDown size={12} className={`transition-transform ${templatesOpen ? 'rotate-180' : ''}`} />
          </button>

          {templatesOpen && (
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
                    setTemplatesOpen(false);
                  }}
                  className="w-full text-left p-2 rounded-xl bg-[#13112a] hover:bg-[#1a1738] border border-[#3b2b68] text-purple-200 transition cursor-pointer space-y-0.5 shadow-2xs"
                >
                  <div className="font-bold text-[11px] font-mono">{tpl.name}</div>
                  <div className="text-[10px] text-slate-400 font-sans">{tpl.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
