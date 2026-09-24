import React, { useMemo } from 'react';
import {
  Boxes,
  Database,
  CheckCircle2,
  Layers,
  Cpu,
  Edit2,
  Trash2,
  Share2,
  Play,
  X,
  Sliders,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Code,
  Tag
} from 'lucide-react';
import { ValidationBox, DatabaseConnection } from '../../../types';

interface ValidationBoxDetailInspectorProps {
  box: ValidationBox | null;
  databases: DatabaseConnection[];
  onClose: () => void;
  onEdit: (box: ValidationBox) => void;
  onTest: (box: ValidationBox) => void;
  onShare: (box: ValidationBox) => void;
  onDelete: (id: string, name: string) => void;
}

export const ValidationBoxDetailInspector: React.FC<ValidationBoxDetailInspectorProps> = ({
  box,
  databases,
  onClose,
  onEdit,
  onTest,
  onShare,
  onDelete
}) => {
  if (!box) return null;

  const targetDb = useMemo(() => {
    return databases.find(d => d.id === box.targetDbId);
  }, [databases, box.targetDbId]);

  const mirrorTableName = useMemo(() => {
    if (!box.targetDbId || !box.targetTable) return null;
    const dbName = targetDb?.name || 'db';
    const cleanDb = dbName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const cleanTbl = box.targetTable.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return `mirror_${cleanDb}_${cleanTbl}`;
  }, [box.targetDbId, box.targetTable, targetDb]);

  const archetypeConfig = useMemo(() => {
    switch (box.boxType) {
      case 'INGESTION_SEARCH':
        return {
          icon: Database,
          label: 'Ingestion Search',
          border: 'border-emerald-500/30',
          badge: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40',
          text: 'text-emerald-400'
        };
      case 'CONDITION_CHECK':
        return {
          icon: CheckCircle2,
          label: 'Condition Check',
          border: 'border-blue-500/30',
          badge: 'bg-blue-950/60 text-blue-400 border-blue-800/40',
          text: 'text-blue-400'
        };
      case 'RECONCILIATION':
        return {
          icon: Layers,
          label: 'Reconciliation',
          border: 'border-cyan-500/30',
          badge: 'bg-cyan-950/60 text-cyan-400 border-cyan-800/40',
          text: 'text-cyan-400'
        };
      case 'REPORT':
        return {
          icon: Cpu,
          label: 'Report Output',
          border: 'border-purple-500/30',
          badge: 'bg-purple-950/60 text-purple-400 border-purple-800/40',
          text: 'text-purple-400'
        };
      default:
        return {
          icon: Boxes,
          label: box.boxType,
          border: 'border-slate-700',
          badge: 'bg-slate-800 text-slate-300 border-slate-700',
          text: 'text-slate-300'
        };
    }
  }, [box.boxType]);

  const Icon = archetypeConfig.icon;

  return (
    <div className="w-80 md:w-96 shrink-0 bg-slate-950/80 border-l border-slate-800/80 h-full flex flex-col z-10 animate-in slide-in-from-right duration-150">
      
      {/* Inspector Header */}
      <div className="px-5 py-4 border-b border-slate-800/80 flex items-start justify-between bg-slate-900/40 shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`p-2 rounded-xl bg-slate-900 border ${archetypeConfig.border} ${archetypeConfig.text} shrink-0 mt-0.5`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${archetypeConfig.badge}`}>
                {archetypeConfig.label}
              </span>
              {box.category && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-medium">
                  {box.category}
                </span>
              )}
            </div>
            <h3 className="text-sm font-bold text-white truncate mt-1" title={box.name}>
              {box.name}
            </h3>
            {box.description && (
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                {box.description}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Action Toolbar */}
      <div className="px-5 py-2.5 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between gap-1 shrink-0">
        <button
          onClick={() => onTest(box)}
          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" /> Test Block
        </button>
        <button
          onClick={() => onEdit(box)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
        >
          <Edit2 className="w-3.5 h-3.5 text-blue-400" /> Edit
        </button>
        <button
          onClick={() => onShare(box)}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
          title="Share with Team"
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(box.id, box.name)}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 text-slate-400 text-xs transition cursor-pointer"
          title="Delete Box"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Inspector Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
        
        {/* Database & Table Scope */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Target Database Scope</span>
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Database Engine:</span>
              <span className="font-semibold text-white">
                {targetDb?.name || box.targetDbId || 'Unassigned'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Physical Table:</span>
              <span className="font-mono text-emerald-400 font-semibold">
                {box.targetTable || 'N/A'}
              </span>
            </div>
            {mirrorTableName && (
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                <span className="text-slate-500 text-[11px]">Unlogged Mirror:</span>
                <span className="font-mono text-cyan-300 text-[11px] bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/40">
                  {mirrorTableName}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Execution Policy */}
        {box.checkStep && (
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Execution Policy</span>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-2.5">
                <span className="text-[10px] text-slate-500 block">Severity</span>
                <span className={`font-semibold text-xs ${
                  box.checkStep.severityOnFailure === 'CRITICAL' ? 'text-rose-400' : 'text-amber-400'
                }`}>
                  {box.checkStep.severityOnFailure || 'CRITICAL'}
                </span>
              </div>
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-2.5">
                <span className="text-[10px] text-slate-500 block">Action on Pass</span>
                <span className="font-semibold text-xs text-emerald-400">
                  {box.checkStep.actionOnSuccess || box.checkStep.onPassAction || 'CONTINUE'}
                </span>
              </div>
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-2.5 col-span-2 flex items-center justify-between">
                <span className="text-slate-400">Action on Failure:</span>
                <span className="font-semibold font-mono text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/40">
                  {box.checkStep.actionOnFailure || box.checkStep.onFailAction || 'FLAG'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Type-Specific Logic Details */}
        {box.boxType === 'INGESTION_SEARCH' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Search Parameters ({box.searchParameters?.length || 0})
              </span>
            </div>
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl divide-y divide-slate-800/80 max-h-52 overflow-y-auto">
              {(box.searchParameters || []).map((p, idx) => (
                <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="text-white font-medium">{p.inputField}</span>
                    <ArrowRight className="w-3 h-3 text-slate-600" />
                    <span className="text-emerald-400">{p.targetColumn}</span>
                  </div>
                  {p.required && (
                    <span className="text-[9px] font-semibold px-1 rounded bg-rose-950 text-rose-300 border border-rose-800">
                      Req
                    </span>
                  )}
                </div>
              ))}
              {(!box.searchParameters || box.searchParameters.length === 0) && (
                <div className="p-3 text-center text-slate-500 text-xs">No search parameters defined</div>
              )}
            </div>
          </div>
        )}

        {box.boxType === 'CONDITION_CHECK' && (
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Condition Evaluation</span>
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 space-y-2 font-mono text-xs">
              {box.dualSourceCondition ? (
                <>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Source A:</span>
                    <span className="text-blue-300">
                      [{box.dualSourceCondition.sourceA?.origin}] {box.dualSourceCondition.sourceA?.field}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Operator:</span>
                    <span className="text-amber-400 font-bold">{box.dualSourceCondition.comparator}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Source B:</span>
                    <span className="text-cyan-300">
                      [{box.dualSourceCondition.sourceB?.origin}] {box.dualSourceCondition.sourceB?.field}
                    </span>
                  </div>
                  {box.dualSourceCondition.toleranceMargin !== undefined && (
                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Tolerance Margin:</span>
                      <span className="text-slate-300">±{box.dualSourceCondition.toleranceMargin}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-blue-300">{box.checkStep?.sourceField || box.checkStep?.canonicalField}</span>
                  <span className="text-amber-400 font-bold">{box.checkStep?.operator}</span>
                  <span className="text-white">{box.checkStep?.expectedValue || 'N/A'}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {box.boxType === 'RECONCILIATION' && (
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reconciliation Logic</span>
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Input Key:</span>
                <span className="text-emerald-400 font-semibold">{box.matchKeyInput || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">External Key:</span>
                <span className="text-cyan-400 font-semibold">{box.matchKeyExternal || 'N/A'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Multi-Row Policy:</span>
                <span className="text-slate-300">{box.multiRowPolicy || 'COMPOSITE_BUNDLE'}</span>
              </div>
              {box.groupConfig && (
                <div className="pt-2 border-t border-slate-800 space-y-1 text-[11px]">
                  <span className="text-cyan-300 font-semibold block">Multi-Leg Grouping Active</span>
                  <div className="text-slate-400">Group ID: <span className="text-white">{box.groupConfig.groupIdField}</span></div>
                  <div className="text-slate-400">Phase Col: <span className="text-white">{box.groupConfig.eventPhaseField}</span></div>
                </div>
              )}
            </div>
          </div>
        )}

        {box.boxType === 'REPORT' && (
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Output Projections ({box.outputColumns?.length || 0})
            </span>
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl divide-y divide-slate-800/80 max-h-48 overflow-y-auto">
              {(box.outputColumns || []).map((col, idx) => (
                <div key={idx} className="p-2.5 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-300">{col.headerAlias}</span>
                  <span className="text-purple-400 text-[11px]">[{col.source}] {col.field}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Table Column Rules Attached */}
        {(box.columnConfigurationIds?.length || box.checkStep?.columnConfigurationIds?.length) ? (
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Linked Table Rules</span>
            <div className="p-3 bg-indigo-950/30 border border-indigo-800/50 rounded-xl text-xs flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-300">
                <Sliders className="w-4 h-4 shrink-0" />
                <span>
                  <strong>{box.columnConfigurationIds?.length || box.checkStep?.columnConfigurationIds?.length}</strong> Quality Constraints Linked
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Metadata Footer */}
        <div className="pt-3 border-t border-slate-800/80 space-y-1 text-[10px] font-mono text-slate-500">
          <div>ID: <span className="text-slate-400">{box.id}</span></div>
          {box.updatedAt && (
            <div>Updated: <span className="text-slate-400">{new Date(box.updatedAt).toLocaleString()}</span></div>
          )}
        </div>

      </div>
    </div>
  );
};
