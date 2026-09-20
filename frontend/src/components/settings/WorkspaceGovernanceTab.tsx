import React from 'react';
import { User, WorkspaceSettingProposal } from '../../types';
import { 
  ShieldCheck, ShieldAlert, Clock, CheckCircle2, XCircle, 
  ArrowUpRight, FileCheck, Database, Boxes, ArrowRight, Filter
} from 'lucide-react';

interface WorkspaceGovernanceTabProps {
  currentUser: User;
  proposals: WorkspaceSettingProposal[];
  loadingProposals: boolean;
  proposalFilter: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED';
  setProposalFilter: (filter: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED') => void;
  proposalFeedbackMsg: { type: 'success' | 'error'; text: string } | null;
  reviewNotes: Record<string, string>;
  setReviewNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  reviewSubmittingId: string | null;
  onReviewProposal: (proposal: WorkspaceSettingProposal, action: 'APPROVE' | 'REJECT') => void;
  onEscalateProposal: (proposal: WorkspaceSettingProposal) => void;
  onOpenSubmitProposal: () => void;
  onOpenDbConfig: () => void;
  onOpenValidationBox: () => void;
}

export const WorkspaceGovernanceTab: React.FC<WorkspaceGovernanceTabProps> = ({
  currentUser,
  proposals,
  loadingProposals,
  proposalFilter,
  setProposalFilter,
  proposalFeedbackMsg,
  reviewNotes,
  setReviewNotes,
  reviewSubmittingId,
  onReviewProposal,
  onEscalateProposal,
  onOpenSubmitProposal,
  onOpenDbConfig,
  onOpenValidationBox
}) => {
  const pendingCount = proposals.filter(p => p.status === 'PENDING_TEAM_APPROVAL' || p.status === 'PENDING_CHECKER_REVIEW').length;
  const approvedCount = proposals.filter(p => p.status === 'APPROVED').length;
  const rejectedCount = proposals.filter(p => p.status === 'REJECTED').length;
  const escalatedCount = proposals.filter(p => p.status === 'ESCALATED_TO_TARGET_TEAM' || p.status === 'ESCALATED').length;

  const filters = [
    { id: 'ALL' as const, label: 'All Proposals', count: proposals.length },
    { id: 'PENDING' as const, label: 'Pending Review', count: pendingCount },
    { id: 'APPROVED' as const, label: 'Approved', count: approvedCount },
    { id: 'REJECTED' as const, label: 'Rejected', count: rejectedCount },
    { id: 'ESCALATED' as const, label: 'Escalated', count: escalatedCount },
  ];

  const filteredProposals = proposals.filter(p => {
    if (proposalFilter === 'PENDING') return p.status === 'PENDING_TEAM_APPROVAL' || p.status === 'PENDING_CHECKER_REVIEW';
    if (proposalFilter === 'APPROVED') return p.status === 'APPROVED';
    if (proposalFilter === 'REJECTED') return p.status === 'REJECTED';
    if (proposalFilter === 'ESCALATED') return p.status === 'ESCALATED_TO_TARGET_TEAM' || p.status === 'ESCALATED';
    return true;
  });

  return (
    <div className="space-y-5 font-sans" id="workspace-governance-tab">
      {/* 1. Governance & Dual Authorization Overview */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200/80 shrink-0 mt-0.5">
            <ShieldCheck size={20} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-slate-900 font-mono">Maker-Checker Dual Authorization</h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                Enforced (Four-Eyes)
              </span>
            </div>
            <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
              Configuration and rule modifications require a formal Maker proposal. Strict Anti-Self-Approval ensures operators cannot authorize their own submissions.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenSubmitProposal}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-[#155DFC] hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow-xs transition-all whitespace-nowrap self-start md:self-auto cursor-pointer"
        >
          <span>Submit New Proposal</span>
          <ArrowRight size={14} />
        </button>
      </div>

      {/* 2. Secondary Full-Page Modules (Dedicated Screens) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* DB Config Studio */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex flex-col justify-between space-y-3 shadow-2xs">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-900">
                <Database size={16} className="text-[#155DFC]" />
                <h4 className="text-xs font-bold font-mono">DB Mirror Configuration</h4>
              </div>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-blue-50 text-[#155DFC] border border-blue-200 font-bold">
                Dedicated View
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
              Define typed unlogged mirror tables, column types, composite reconciliation keys, and query extraction bounds.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenDbConfig}
            className="inline-flex items-center space-x-1.5 text-xs font-bold font-mono text-[#155DFC] hover:text-blue-700 cursor-pointer pt-1"
          >
            <span>Open DB Config Studio</span>
            <ArrowRight size={13} />
          </button>
        </div>

        {/* Validation Box Studio */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex flex-col justify-between space-y-3 shadow-2xs">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-900">
                <Boxes size={16} className="text-purple-600" />
                <h4 className="text-xs font-bold font-mono">Validation Box Rules</h4>
              </div>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-bold">
                Dedicated View
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
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

      {/* 4. Proposals Queue & Approval History */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-mono">Setting Proposals &amp; Change Governance</h3>
            <p className="text-xs text-slate-500">Track, approve, reject, or escalate operational workspace adjustments.</p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
            {filters.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setProposalFilter(f.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center space-x-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  proposalFilter === f.id
                    ? 'bg-[#155DFC] text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <span>{f.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  proposalFilter === f.id ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Proposals List */}
        {loadingProposals ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
            <div className="w-6 h-6 border-2 border-[#155DFC] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-mono">Loading governance proposals...</span>
          </div>
        ) : filteredProposals.length === 0 ? (
          <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <FileCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold font-mono">No proposals found for filter "{proposalFilter}"</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Submit a proposal using the header action to initiate the Maker-Checker workflow.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProposals.map(p => {
              const isPending = p.status === 'PENDING_TEAM_APPROVAL' || p.status === 'PENDING_CHECKER_REVIEW';
              const isEscalated = p.status === 'ESCALATED_TO_TARGET_TEAM' || p.status === 'ESCALATED';
              const isApproved = p.status === 'APPROVED';
              const isRejected = p.status === 'REJECTED';
              const isMaker = currentUser.id === p.makerId;

              return (
                <div
                  key={p.id}
                  className={`p-4 rounded-xl border transition-all shadow-2xs space-y-3 ${
                    isPending
                      ? 'bg-amber-50/20 border-amber-200'
                      : isEscalated
                      ? 'bg-purple-50/20 border-purple-200'
                      : isApproved
                      ? 'bg-emerald-50/20 border-emerald-200'
                      : 'bg-rose-50/20 border-rose-200'
                  }`}
                >
                  {/* Top Meta */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 border ${
                          isPending
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : isEscalated
                            ? 'bg-purple-100 text-purple-800 border-purple-300'
                            : isApproved
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-rose-100 text-rose-800 border-rose-300'
                        }`}>
                          {isPending && <Clock className="w-3 h-3" />}
                          {isEscalated && <ArrowUpRight className="w-3 h-3" />}
                          {isApproved && <CheckCircle2 className="w-3 h-3" />}
                          {isRejected && <XCircle className="w-3 h-3" />}
                          <span>{p.status}</span>
                        </span>

                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          {p.settingType}
                        </span>

                        <code className="text-[11px] bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono font-medium">
                          {p.settingKey}
                        </code>
                      </div>
                      <h4 className="text-xs font-bold text-slate-900 font-mono">{p.title}</h4>
                      <div className="text-[11px] text-slate-500 font-sans">
                        Maker: <span className="font-semibold text-slate-700">{p.makerName || p.makerId}</span> (#{p.teamId}) • {new Date(p.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Justification */}
                  <div className="text-xs bg-slate-50 border-l-3 border-[#155DFC] pl-3 py-1.5 text-slate-700 italic rounded-r font-sans">
                    <span className="font-semibold not-italic text-slate-600 mr-1.5">Business Justification:</span>
                    "{p.justification}"
                  </div>

                  {/* Escalation Traceability */}
                  {(isEscalated || p.escalatedTeamId || p.targetTeamId) && (
                    <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-900 flex items-start gap-2">
                      <ArrowUpRight className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Escalated to #{p.escalatedTeamId || p.targetTeamId}</span>
                        {p.escalatedByName && <span className="text-purple-700"> by {p.escalatedByName}</span>}
                        {p.escalationReason && (
                          <div className="text-[11px] text-purple-800 mt-0.5">
                            Reason: {p.escalationReason}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Review Details */}
                  {(isApproved || isRejected) && (p.checkerId || p.reviewedBy) && (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-sans">
                      <span className="font-bold">{isApproved ? 'Approved & Applied' : 'Rejected'}</span> by{' '}
                      <span className="font-semibold">{p.checkerName || p.reviewedBy}</span>
                      {(p.appliedAt || p.reviewedAt) && <span> on {new Date(p.appliedAt || p.reviewedAt).toLocaleString()}</span>}
                      {(p.checkerFeedback || p.reviewFeedback) && (
                        <div className="text-[11px] text-slate-600 mt-0.5 italic">
                          Checker Feedback: "{p.checkerFeedback || p.reviewFeedback}"
                        </div>
                      )}
                    </div>
                  )}

                  {/* Proposed Changes Code Snippet */}
                  <details className="group">
                    <summary className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer select-none flex items-center gap-1.5 py-1">
                      <span>View Proposed Changes Payload</span>
                    </summary>
                    <pre className="mt-1 p-3 bg-[#060A14] border border-slate-800 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-52">
                      {JSON.stringify(p.proposedChanges, null, 2)}
                    </pre>
                  </details>

                  {/* Action Bar (Maker-Checker & Escalation) */}
                  {(isPending || isEscalated) && (
                    <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-200/80">
                      {isMaker ? (
                        <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs font-medium">
                          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>Anti-Self-Approval Active: As Maker, you cannot approve your own proposal. A separate team Checker must review it.</span>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-[240px]">
                          <input
                            type="text"
                            placeholder="Checker review notes / conditions..."
                            value={reviewNotes[p.id] || ''}
                            onChange={(e) => setReviewNotes({ ...reviewNotes, [p.id]: e.target.value })}
                            className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#155DFC] bg-white"
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        {!isMaker && (
                          <>
                            <button
                              type="button"
                              onClick={() => onReviewProposal(p, 'APPROVE')}
                              disabled={reviewSubmittingId === p.id}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-2xs cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Approve &amp; Apply</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onReviewProposal(p, 'REJECT')}
                              disabled={reviewSubmittingId === p.id}
                              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-2xs cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => onEscalateProposal(p)}
                          className="px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                          title="Escalate setting proposal strictly along team escalation matrix"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5 text-purple-700" />
                          <span>Escalate</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
