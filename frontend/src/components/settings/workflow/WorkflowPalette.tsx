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
      className="w-72 bg-white border-r border-slate-200 flex flex-col h-full text-slate-800 select-none overflow-hidden font-sans"
      aria-label="Flow Block Catalog"
    >
      {/* 1. Catalog Header & Search */}
      <div className="p-3.5 border-b border-slate-200 space-y-2.5 bg-slate-50/60 shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 font-mono">
            Flow Block Catalog
          </h3>
          <button
            type="button"
            onClick={onNewWorkflow}
            className="p-1 hover:bg-slate-200/70 text-slate-600 hover:text-slate-900 rounded-lg transition cursor-pointer"
            title="Create New Blank Workflow"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Search input matching design */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search blocks..."
            className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#F27421] focus:ring-1 focus:ring-[#F27421]/20 font-sans shadow-2xs transition"
          />
        </div>

        {/* Active Workflow Switcher */}
        {workflows.length > 0 && (
          <div className="pt-0.5">
            <select
              value={activeWorkflow?.id || ''}
              onChange={(e) => {
                const target = workflows.find(w => w.id === e.target.value);
                if (target) onSelectWorkflow(target);
              }}
              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-[11px] text-slate-700 font-mono focus:outline-none focus:border-[#F27421]"
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
            className="w-full flex items-center justify-between text-xs font-bold text-slate-700 hover:text-slate-900 transition py-0.5 cursor-pointer uppercase tracking-wider text-[11px]"
          >
            <span className="flex items-center gap-1.5">
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${triggersOpen ? '' : '-rotate-90'}`} />
              <span>Triggers</span>
            </span>
          </button>

          {triggersOpen && (
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              {/* Start Point Button */}
              <button
                type="button"
                onClick={() => onAddTerminalNode('START', 'Start Point')}
                className="p-2.5 rounded-xl bg-white border border-slate-200 hover:border-[#F27421] hover:bg-orange-50/20 text-slate-700 flex items-center justify-between cursor-pointer transition shadow-2xs group"
                title="Add Start Point Trigger"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-[#0F142A] text-[#F27421] flex items-center justify-center shrink-0 group-hover:scale-105 transition shadow-2xs">
                    <Play size={11} className="fill-[#F27421] text-[#F27421] ml-0.5" />
                  </div>
                  <span className="text-xs font-semibold text-slate-800 group-hover:text-slate-900 truncate">Start</span>
                </div>
                <div className="w-5 h-5 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-[#F27421] group-hover:border-[#F27421] transition shrink-0 ml-1">
                  <Plus size={11} />
                </div>
              </button>

              {/* End Trigger Button */}
              <button
                type="button"
                onClick={() => onAddTerminalNode('END', 'End Goal')}
                className="p-2.5 rounded-xl bg-white border border-slate-200 hover:border-[#F27421] hover:bg-orange-50/20 text-slate-700 flex items-center justify-between cursor-pointer transition shadow-2xs group"
                title="Add Terminal End Trigger"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                    <ArrowRightToLine size={12} />
                  </div>
                  <span className="text-xs font-semibold text-slate-800 group-hover:text-slate-900 truncate">End</span>
                </div>
                <div className="w-5 h-5 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-[#F27421] group-hover:border-[#F27421] transition shrink-0 ml-1">
                  <Plus size={11} />
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Section 2: Categorized Validation Blocks */}
        {(() => {
          const ingestionBoxes = filteredBoxes.filter(b => b.boxType === 'INGESTION_SEARCH');
          const reconcilBoxes = filteredBoxes.filter(b => b.boxType === 'RECONCILIATION');
          const conditionBoxes = filteredBoxes.filter(b => b.boxType !== 'INGESTION_SEARCH' && b.boxType !== 'RECONCILIATION' && b.boxType !== 'REPORT');
          const reportBoxes = filteredBoxes.filter(b => b.boxType === 'REPORT');

          const renderBlockList = (title: string, list: ValidationBox[], countLabel?: string) => {
            if (list.length === 0) return null;
            return (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider px-0.5">
                  <span>{title}</span>
                  <span className="text-[10px] font-mono text-slate-400">{list.length}</span>
                </div>
                <div className="space-y-1.5">
                  {list.map(box => (
                    <div
                      key={box.id}
                      onClick={() => onAddBoxNode(box)}
                      className="p-2.5 rounded-xl bg-white border border-slate-200 hover:border-[#F27421] hover:shadow-xs transition cursor-pointer flex items-center justify-between group shadow-2xs"
                      title={`Add "${box.name}" block to canvas`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <h4 className="text-xs font-semibold text-slate-900 group-hover:text-[#F27421] truncate">
                          {box.name}
                        </h4>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">
                          {box.targetTable ? `Table: ${box.targetTable}` : (box.description || 'Validation block')}
                        </p>
                      </div>
                      <div className="w-6 h-6 rounded-full border border-slate-200 bg-slate-50 group-hover:bg-[#F27421] group-hover:border-[#F27421] text-slate-400 group-hover:text-white flex items-center justify-center shrink-0 transition">
                        <Plus size={12} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          };

          return (
            <div className="space-y-3.5">
              {renderBlockList('Search & Ingest', ingestionBoxes)}
              {renderBlockList('Reconciliation', reconcilBoxes)}
              {renderBlockList('Condition', conditionBoxes)}
              {renderBlockList('Custom Report Blocks', reportBoxes)}
            </div>
          );
        })()}

        {filteredBoxes.length === 0 && (
          <div className="p-4 text-center text-slate-400 italic text-[11px] rounded-xl border border-dashed border-slate-200">
            No validation blocks found.
          </div>
        )}

        {/* Section 3: Report Aggregator */}
        <div className="space-y-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={() => setReportAggregatorOpen(!reportAggregatorOpen)}
            className="w-full flex items-center justify-between text-xs font-bold text-slate-700 hover:text-slate-900 transition py-0.5 cursor-pointer uppercase tracking-wider text-[11px]"
          >
            <span className="flex items-center gap-1.5">
              <ChevronDown size={14} className={`text-slate-400 transition-transform ${reportAggregatorOpen ? '' : '-rotate-90'}`} />
              <span>Report</span>
            </span>
            <span className="text-[10px] font-mono text-[#F27421] px-2 py-0.2 rounded-full bg-orange-50 border border-orange-200 font-bold">
              {aggregationsCount}
            </span>
          </button>

          {reportAggregatorOpen && (
            <div className="space-y-1.5 pt-0.5">
              <div 
                onClick={onOpenAggregators}
                className="p-2.5 rounded-xl bg-white border border-slate-200 hover:border-[#F27421] hover:shadow-xs transition cursor-pointer flex items-center justify-between group shadow-2xs"
                title="Configure Report Aggregation Rules & Outcome Messages"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-slate-900 group-hover:text-[#F27421] truncate">
                      Report Aggregator
                    </h4>
                    <span className="text-[9px] font-mono text-[#F27421] uppercase font-bold">Config</span>
                  </div>
                  <p className="text-[10px] text-slate-500 truncate mt-0.5">
                    Consolidated PASS/FAIL messages &amp; unified outcomes
                  </p>
                </div>
                <div className="w-6 h-6 rounded-full border border-slate-200 bg-slate-50 group-hover:bg-[#F27421] group-hover:border-[#F27421] text-slate-400 group-hover:text-white flex items-center justify-center shrink-0 transition">
                  <FileSpreadsheet size={12} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Section 4: Guided Templates */}
        <div className="space-y-1.5 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={() => setTemplatesOpen(!templatesOpen)}
            className="w-full flex items-center justify-between text-[11px] font-bold text-indigo-700 hover:text-indigo-900 transition py-1 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-indigo-500" />
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
                  className="w-full text-left p-2 rounded-xl bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100 text-indigo-900 transition cursor-pointer space-y-0.5 shadow-2xs"
                >
                  <div className="font-bold text-[11px] font-mono">{tpl.name}</div>
                  <div className="text-[10px] text-slate-500 font-sans">{tpl.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
