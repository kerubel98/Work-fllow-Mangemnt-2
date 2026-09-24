import React from 'react';
import { User, WorkspaceSettingProposal } from '../../types';
import { 
  ShieldCheck, Database, Boxes, ArrowRight, ArrowUpRight,
  Lock, CheckCircle2, ShieldAlert
} from 'lucide-react';

interface WorkspaceGovernanceTabProps {
  currentUser: User;
  proposals?: WorkspaceSettingProposal[];
  loadingProposals?: boolean;
  proposalFilter?: string;
  setProposalFilter?: (filter: any) => void;
  proposalFeedbackMsg?: { type: 'success' | 'error'; text: string } | null;
  reviewNotes?: Record<string, string>;
  setReviewNotes?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  reviewSubmittingId?: string | null;
  onReviewProposal?: (proposal: WorkspaceSettingProposal, action: 'APPROVE' | 'REJECT') => void;
  onEscalateProposal?: (proposal: WorkspaceSettingProposal) => void;
  onOpenSubmitProposal?: () => void;
  onOpenDbConfig?: () => void;
  onOpenValidationBox?: () => void;
}

export const WorkspaceGovernanceTab: React.FC<WorkspaceGovernanceTabProps> = ({
  currentUser,
  proposalFeedbackMsg,
  onOpenDbConfig,
  onOpenValidationBox
}) => {
  return (
    <div className="space-y-5 font-sans" id="workspace-governance-tab">
      {/* 1. Centralized Authority Callout Banner */}
      <div className="bg-gradient-to-r from-blue-900/10 via-slate-900/5 to-slate-900/10 border border-blue-200/80 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-start space-x-4">
          <div className="p-3 bg-blue-50 text-[#155DFC] rounded-xl border border-blue-200 shrink-0 mt-0.5">
            <ShieldCheck size={24} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-slate-900 font-mono">Centralized Operational Authority</h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold border border-blue-300">
                Segregated Governance
              </span>
            </div>
            <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
              In accordance with production governance architecture, dual-authorization review queues for <strong>Financial Ledger Overrides</strong> and <strong>Composite Workflow Bundles</strong> are hosted centrally in the <strong>Operational Authority Center</strong>.
            </p>
          </div>
        </div>

        <a
          href="#/governance"
          className="inline-flex items-center space-x-2 px-4 py-2.5 bg-[#155DFC] hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow-xs transition-all whitespace-nowrap self-start md:self-auto cursor-pointer"
        >
          <span>Open Authority Center</span>
          <ArrowUpRight size={15} />
        </a>
      </div>

      {/* 2. Advanced Tools / Operational Components */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* DB Config Studio */}
        <div className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex flex-col justify-between space-y-3 shadow-2xs">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-900">
                <Database size={18} className="text-[#155DFC]" />
                <h4 className="text-xs font-bold font-mono">DB Mirror Configuration</h4>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-[#155DFC] font-bold border border-blue-200">
                PostgreSQL UNLOGGED
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              Manage physical database connections, external mirror tables, column role definitions, and reconciliation keys.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenDbConfig}
            className="inline-flex items-center space-x-1.5 text-xs font-bold font-mono text-[#155DFC] hover:text-blue-700 cursor-pointer pt-1"
          >
            <span>Open DB Mirror Studio</span>
            <ArrowRight size={13} />
          </button>
        </div>

        {/* Validation Box Studio */}
        <div className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex flex-col justify-between space-y-3 shadow-2xs">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-900">
                <Boxes size={18} className="text-purple-600" />
                <h4 className="text-xs font-bold font-mono">Validation Box Rule Builder</h4>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-bold border border-purple-200">
                Stage Rules
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              Configure SQL validation criteria, mandatory columns, tolerance thresholds, and automated discrepancy filters.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenValidationBox}
            className="inline-flex items-center space-x-1.5 text-xs font-bold font-mono text-purple-600 hover:text-purple-700 cursor-pointer pt-1"
          >
            <span>Open Validation Box Manager</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {/* 3. Feedback Banner */}
      {proposalFeedbackMsg && (
        <div className={`p-3.5 rounded-xl border text-xs font-mono font-medium flex items-center space-x-2 ${
          proposalFeedbackMsg.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {proposalFeedbackMsg.type === 'success' ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
          <span>{proposalFeedbackMsg.text}</span>
        </div>
      )}

      {/* 4. Policy Clarification Notice */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 flex items-start space-x-3">
        <Lock size={16} className="text-slate-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-800">Production Governance Boundary:</span> Personal layout preferences, themes, and notification triggers save directly without maker-checker queues. Only high-risk ledger adjustments and operational workflow promotions require Four-Eyes review.
        </div>
      </div>
    </div>
  );
};
