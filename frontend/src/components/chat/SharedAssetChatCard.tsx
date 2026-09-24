import React, { useState } from 'react';
import { Box, Workflow, Database, Plus, Check, ArrowRight, User } from 'lucide-react';
import { api } from '../../api/client';
import { AssetStatusBadge } from '../common/AssetStatusBadge';

export interface SharedAssetChatCardProps {
  shareId?: string;
  assetType: 'WORKFLOW' | 'VALIDATION_BOX' | 'DB_CONFIG';
  assetId: string;
  senderName: string;
  message?: string;
  visualPayload: {
    title?: string;
    description?: string;
    category?: string;
    boxType?: string;
    targetDb?: string;
    targetTable?: string;
    searchParameters?: string[];
    stepsCount?: number;
    steps?: Array<{ id: string; name: string }>;
    status?: string;
    isLocked?: boolean;
  };
  onAdoptSuccess?: (newAssetId: string) => void;
}

export const SharedAssetChatCard: React.FC<SharedAssetChatCardProps> = ({
  assetType,
  assetId,
  senderName,
  message,
  visualPayload,
  onAdoptSuccess
}) => {
  const [isAdopting, setIsAdopting] = useState(false);
  const [adoptedAssetId, setAdoptedAssetId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAdopt = async () => {
    setIsAdopting(true);
    setErrorMsg(null);
    try {
      const res = await api.adoptOperationalAsset(assetType, assetId);
      setAdoptedAssetId(res.newAssetId);
      if (onAdoptSuccess) {
        onAdoptSuccess(res.newAssetId);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add to workspace');
    } finally {
      setIsAdopting(false);
    }
  };

  const getAssetIcon = () => {
    if (assetType === 'WORKFLOW') return <Workflow size={16} className="text-blue-400" />;
    if (assetType === 'VALIDATION_BOX') return <Box size={16} className="text-purple-400" />;
    return <Database size={16} className="text-emerald-400" />;
  };

  const title = visualPayload.title || `${assetType} (${assetId.slice(0, 8)})`;

  return (
    <div className="w-full max-w-md my-2.5 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-xl overflow-hidden text-left transition-all hover:border-slate-600">
      {/* Top Banner */}
      <div className="px-4 py-2.5 bg-slate-800/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-1 rounded-md bg-slate-900 border border-slate-700">
            {getAssetIcon()}
          </div>
          <span className="text-xs font-bold text-slate-200">
            {assetType === 'WORKFLOW' ? 'Interactive Workflow' : assetType === 'VALIDATION_BOX' ? 'Validation Box' : 'DB Configuration'}
          </span>
        </div>
        <AssetStatusBadge
          status={visualPayload.status || 'DRAFT'}
          isLocked={visualPayload.isLocked}
        />
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-3">
        {/* Title and Sender */}
        <div>
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white tracking-tight">{title}</h4>
          </div>
          <div className="flex items-center space-x-1.5 mt-1 text-[11px] text-slate-400">
            <User size={12} className="text-slate-500" />
            <span>Shared by <strong className="text-slate-300">@{senderName}</strong></span>
          </div>
        </div>

        {/* Message Note */}
        {message && (
          <div className="p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/40 text-xs text-slate-300 italic">
            "{message}"
          </div>
        )}

        {/* Visual Inspection Details (Never raw JSON) */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
          {assetType === 'VALIDATION_BOX' && (
            <div className="space-y-1.5 text-xs">
              {visualPayload.category && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Category:</span>
                  <span className="font-semibold text-purple-300">{visualPayload.category}</span>
                </div>
              )}
              {visualPayload.searchParameters && visualPayload.searchParameters.length > 0 && (
                <div>
                  <span className="text-[10px] text-slate-400 block mb-1">Search Parameters:</span>
                  <div className="flex flex-wrap gap-1">
                    {visualPayload.searchParameters.map((p, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {assetType === 'WORKFLOW' && (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Stages configured:</span>
                <span className="font-bold text-blue-300">{visualPayload.stepsCount || visualPayload.steps?.length || 0} stages</span>
              </div>
              {visualPayload.steps && visualPayload.steps.length > 0 && (
                <div className="flex items-center space-x-1 overflow-x-auto py-1 text-[10px]">
                  {visualPayload.steps.slice(0, 3).map((st, i) => (
                    <React.Fragment key={st.id || i}>
                      <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/20 whitespace-nowrap">
                        {st.name || `Step ${i + 1}`}
                      </span>
                      {i < Math.min(visualPayload.steps!.length, 3) - 1 && (
                        <ArrowRight size={10} className="text-slate-600 shrink-0" />
                      )}
                    </React.Fragment>
                  ))}
                  {visualPayload.steps.length > 3 && (
                    <span className="text-slate-500 text-[9px]">+{visualPayload.steps.length - 3} more</span>
                  )}
                </div>
              )}
            </div>
          )}

          {assetType === 'DB_CONFIG' && (
            <div className="text-xs text-slate-300">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Target Table:</span>
                <span className="font-mono text-emerald-300 font-semibold">{visualPayload.targetTable || visualPayload.targetDb || 'Schema'}</span>
              </div>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px]">
            {errorMsg}
          </div>
        )}

        {/* 1-Click Action */}
        <div className="pt-1">
          {adoptedAssetId ? (
            <div className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-bold">
              <Check size={14} className="text-emerald-400" />
              <span>Added to Your Workspace</span>
            </div>
          ) : (
            <button
              onClick={handleAdopt}
              disabled={isAdopting}
              className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-[#155DFC] hover:bg-[#124bcf] active:scale-[0.99] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              <Plus size={14} />
              <span>{isAdopting ? 'Adding...' : 'Add to My Workspace'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
