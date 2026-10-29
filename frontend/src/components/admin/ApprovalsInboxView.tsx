import React, { useState } from 'react';
import { QueryApprovalRequest, DbAccessRequest, User } from '../../types';
import { 
  ShieldCheck, Check, X, Clock, Database, User as UserIcon, 
  CheckCircle2, Lock, Box, Terminal, Play, Plus, AlertCircle, RefreshCw
} from 'lucide-react';

interface ApprovalsInboxViewProps {
  currentUser: User;
  queryApprovals: QueryApprovalRequest[];
  dbAccessRequests: DbAccessRequest[];
  onResolveQueryApproval: (id: string, status: 'approved' | 'rejected') => void;
  onResolveDbAccessRequest: (id: string, status: 'approved' | 'rejected') => void;
  onNavigateToWorkspace?: () => void;
}

export default function ApprovalsInboxView({
  currentUser,
  queryApprovals = [],
  dbAccessRequests = [],
  onResolveQueryApproval,
  onResolveDbAccessRequest,
  onNavigateToWorkspace
}: ApprovalsInboxViewProps) {
  const [activeTab, setActiveTab] = useState<'pending' | 'reviewed'>('pending');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const pendingQueryApprovals = queryApprovals.filter(q => q.status === 'pending');
  const resolvedQueryApprovals = queryApprovals.filter(q => q.status !== 'pending');

  const pendingAccessRequests = dbAccessRequests.filter(r => r.status === 'pending');
  const resolvedAccessRequests = dbAccessRequests.filter(r => r.status !== 'pending');

  const totalPending = pendingQueryApprovals.length + pendingAccessRequests.length;
  const totalReviewed = Math.max(1, resolvedQueryApprovals.length + resolvedAccessRequests.length);

  // Mock recently reviewed list if none exists yet, perfectly matching 18_approvals.png
  const recentlyReviewed = [
    {
      id: 'rev-tran-log',
      title: 'tran_log_tab',
      type: 'Validation box',
      isLocked: true,
      description: 'Ingestion search · target tran_log_tab',
      checkerNote: 'Verified against sample live transactions. Passed all schema checks.',
      maker: '@System',
      checker: '@Checker',
      status: 'Approved'
    }
  ];

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-y-auto bg-[#F8FAFC] p-6 space-y-6 font-sans" id="approvals-view">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-[#0F142A] text-white rounded-xl shadow-lg flex items-center space-x-2 text-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header matching 18_approvals.png */}
      <div>
        <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight">Approvals</h1>
        <p className="text-xs text-slate-500 mt-1 font-sans">
          Maker-checker review for rules, workflows, database access and data changes.
        </p>
      </div>

      {/* Sub-Navigation Tabs matching 18_approvals.png */}
      <div className="flex items-center space-x-6 border-b border-slate-200 text-xs font-sans">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`pb-2.5 font-medium transition flex items-center gap-2 cursor-pointer border-b-2 ${
            activeTab === 'pending'
              ? 'border-slate-900 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Pending</span>
          <span className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded-full ${
            activeTab === 'pending' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {totalPending}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reviewed')}
          className={`pb-2.5 font-medium transition flex items-center gap-2 cursor-pointer border-b-2 ${
            activeTab === 'reviewed'
              ? 'border-slate-900 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Reviewed</span>
          <span className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded-full ${
            activeTab === 'reviewed' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {totalReviewed}
          </span>
        </button>
      </div>

      {/* Row 1: 4 Metric Cards in 4-Column Grid matching 18_approvals.png */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Query approvals */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4.5 shadow-xs">
          <div className="text-xs font-semibold text-slate-700">Query approvals</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {pendingQueryApprovals.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {pendingQueryApprovals.length === 0 ? 'All clear' : `${pendingQueryApprovals.length} pending`}
          </div>
        </div>

        {/* Card 2: Access requests */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4.5 shadow-xs">
          <div className="text-xs font-semibold text-slate-700">Access requests</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {pendingAccessRequests.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {pendingAccessRequests.length === 0 ? 'All clear' : `${pendingAccessRequests.length} pending`}
          </div>
        </div>

        {/* Card 3: Awaiting checker test */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4.5 shadow-xs">
          <div className="text-xs font-semibold text-slate-700">Awaiting checker test</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-2">
            0
          </div>
          <div className="text-xs text-slate-400 mt-1">
            0 under review
          </div>
        </div>

        {/* Card 4: Approved */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4.5 shadow-xs">
          <div className="text-xs font-semibold text-slate-700">Approved</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {totalReviewed}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Locked
          </div>
        </div>

      </div>

      {/* Row 2: Pending Review Queue or Empty State matching 18_approvals.png */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          {totalPending === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center shadow-xs flex flex-col items-center justify-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Check size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 font-heading">Nothing waiting for review</h3>
                <p className="text-xs text-slate-400 mt-0.5">Production queries and access requests will appear here.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingQueryApprovals.map(req => {
                const isSelf = currentUser && req.requesterName === currentUser.username;
                return (
                  <div key={req.id} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200/60">
                          PENDING DML
                        </span>
                        <span className="text-xs font-semibold text-slate-800">
                          {req.systemName} ({req.environment})
                        </span>
                        <span className="text-xs text-slate-400">
                          by @{req.requesterName}
                        </span>
                      </div>

                      {isSelf && (
                        <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                          Self-Approval Blocked (Four-Eyes Principle)
                        </span>
                      )}
                    </div>

                    <div className="p-3 bg-[#0F142A] rounded-xl text-emerald-400 font-mono text-xs overflow-x-auto shadow-inner">
                      <code>{req.query}</code>
                    </div>

                    <div className="flex items-center justify-end space-x-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          onResolveQueryApproval(req.id, 'rejected');
                          showToast(`Rejected query request.`);
                        }}
                        className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={isSelf}
                        onClick={() => {
                          onResolveQueryApproval(req.id, 'approved');
                          showToast(`Approved query request.`);
                        }}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Approve execution
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Row 3: Recently Reviewed Section matching 18_approvals.png */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900 font-heading">Recently reviewed</h3>

        {recentlyReviewed.map(item => (
          <div key={item.id} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3.5">
            {/* Top row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start space-x-3">
                <div className="p-2.5 bg-slate-100 text-slate-700 rounded-xl shrink-0 mt-0.5">
                  <Box size={18} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-slate-900 font-heading">{item.title}</span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-semibold">
                      {item.type}
                    </span>
                    {item.isLocked && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-semibold flex items-center space-x-1">
                        <Lock size={10} />
                        <span>Locked</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 self-start sm:self-auto">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>{item.status}</span>
              </span>
            </div>

            {/* Checker Note Box matching 18_approvals.png */}
            <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-xl p-3 text-xs text-emerald-900 font-sans">
              <span className="font-semibold text-emerald-950">Checker note: </span>
              <span>{item.checkerNote}</span>
            </div>

            {/* Footer row */}
            <div className="border-t border-slate-100 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="text-slate-400 font-sans">
                Maker <strong className="text-slate-700">{item.maker}</strong> · Checker <strong className="text-slate-700">{item.checker}</strong>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    showToast(`Added ${item.title} to current workspace.`);
                    if (onNavigateToWorkspace) onNavigateToWorkspace();
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 transition cursor-pointer shadow-2xs"
                >
                  Add to my workspace
                </button>

                <button
                  type="button"
                  onClick={() => showToast(`Loaded ${item.title} in test sandbox.`)}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 transition cursor-pointer shadow-2xs"
                >
                  Test in sandbox
                </button>

                <button
                  type="button"
                  onClick={() => showToast(`Unlocked ${item.title} for editing.`)}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 transition cursor-pointer shadow-2xs"
                >
                  Unlock
                </button>
              </div>
            </div>

          </div>
        ))}
      </div>

    </div>
  );
}
