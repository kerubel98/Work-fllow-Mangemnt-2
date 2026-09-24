/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { User, Team, WorkflowBundle } from '../../types';
import { api } from '../../api/client';
import { 
  ShieldCheck, ShieldAlert, ArrowLeft, CheckCircle2, 
  XCircle, AlertCircle, RefreshCw, FileText, Boxes, 
  GitFork, ArrowUpRight, Search, Clock, Sliders, 
  ExternalLink, ChevronDown, ChevronRight, Check, X, Eye,
  Lock, AlertTriangle, Layers, Database
} from 'lucide-react';
import ErrorBoundary from '../ErrorBoundary';

export interface OperationalAuthorityCenterProps {
  currentUser: User;
  onNavigateToWorkspace?: () => void;
  teams?: Team[];
}

export interface TransactionApprovalItem {
  id: string;
  transactionId: string;
  sourceTable: string;
  discrepancyType: string;
  proposedAction: 'FORCE_MATCH' | 'WRITE_OFF' | 'MANUAL_REVERSAL';
  amount?: number;
  currency?: string;
  makerId: string;
  makerName: string;
  makerTeamId?: string;
  justification: string;
  evidenceSnapshot?: {
    inputData?: Record<string, any>;
    mirrorData?: Record<string, any>;
    discrepancyFields?: string[];
    [key: string]: any;
  };
  createdAt: string;
  status: 'PENDING_CHECKER_REVIEW' | 'APPROVED' | 'REJECTED';
}

export default function OperationalAuthorityCenter({
  currentUser,
  onNavigateToWorkspace,
  teams = []
}: OperationalAuthorityCenterProps) {
  const [activeTab, setActiveTab] = useState<'transactions' | 'bundles'>('transactions');

  // Transactions State
  const [transactionApprovals, setTransactionApprovals] = useState<TransactionApprovalItem[]>([]);
  const [isLoadingTxns, setIsLoadingTxns] = useState(false);
  const [txnSearchQuery, setTxnSearchQuery] = useState('');
  const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null);
  const [checkerNotes, setCheckerNotes] = useState<Record<string, string>>({});
  const [processingTxnId, setProcessingTxnId] = useState<string | null>(null);

  // Workflow Bundles State
  const [bundleApprovals, setBundleApprovals] = useState<WorkflowBundle[]>([]);
  const [isLoadingBundles, setIsLoadingBundles] = useState(false);
  const [bundleSearchQuery, setBundleSearchQuery] = useState('');
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [bundleFeedback, setBundleFeedback] = useState<Record<string, string>>({});
  const [processingBundleId, setProcessingBundleId] = useState<string | null>(null);

  // Feedback Notification Banner
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error' | 'warning'; message: string } | null>(null);

  const showNotice = (type: 'success' | 'error' | 'warning', message: string) => {
    setActionNotice({ type, message });
    setTimeout(() => setActionNotice(null), 5000);
  };

  // Fetch Transactions
  const fetchTransactions = useCallback(async () => {
    setIsLoadingTxns(true);
    try {
      const data = await api.getTransactionApprovals();
      const list = Array.isArray(data) ? data : [];
      setTransactionApprovals(list);
      if (list.length > 0 && !selectedTxnId) {
        setSelectedTxnId(list[0].id);
      }
    } catch (err: any) {
      console.warn('Failed to fetch transaction approvals:', err);
    } finally {
      setIsLoadingTxns(false);
    }
  }, [selectedTxnId]);

  // Fetch Workflow Bundles
  const fetchBundles = useCallback(async () => {
    setIsLoadingBundles(true);
    try {
      const data = await api.getWorkflowBundleApprovals();
      const list = Array.isArray(data) ? data : [];
      setBundleApprovals(list);
      if (list.length > 0 && !selectedBundleId) {
        setSelectedBundleId(list[0].id);
      }
    } catch (err: any) {
      console.warn('Failed to fetch workflow bundle approvals:', err);
    } finally {
      setIsLoadingBundles(false);
    }
  }, [selectedBundleId]);

  useEffect(() => {
    fetchTransactions();
    fetchBundles();
  }, [fetchTransactions, fetchBundles]);

  // Handle Transaction Approve / Reject
  const handleReviewTransaction = async (item: TransactionApprovalItem, action: 'APPROVE' | 'REJECT') => {
    if (currentUser.id === item.makerId) {
      showNotice('error', 'Anti-Self-Approval Violation: As the Maker of this proposal, you cannot authorize or reject it. A separate Checker is required under Four-Eyes governance.');
      return;
    }

    const notes = (checkerNotes[item.id] || '').trim();
    if (action === 'REJECT' && !notes) {
      showNotice('warning', 'Auditable justification notes are mandatory when rejecting a transaction resolution.');
      return;
    }

    setProcessingTxnId(item.id);
    try {
      if (action === 'APPROVE') {
        await api.approveTransactionResolution(item.id, currentUser.id, currentUser.name || currentUser.username, notes);
        showNotice('success', `Transaction resolution ${item.transactionId} APPROVED and committed into the operational ledger.`);
      } else {
        await api.rejectTransactionResolution(item.id, currentUser.id, currentUser.name || currentUser.username, notes);
        showNotice('success', `Transaction resolution ${item.transactionId} REJECTED and returned to Maker with feedback.`);
      }
      await fetchTransactions();
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to complete transaction review.');
    } finally {
      setProcessingTxnId(null);
    }
  };

  // Handle Workflow Bundle Approve / Reject
  const handleReviewBundle = async (bundle: WorkflowBundle, action: 'APPROVE' | 'REJECT') => {
    if (currentUser.id === bundle.makerId) {
      showNotice('error', 'Anti-Self-Approval Violation: As the Maker of this bundle promotion, you cannot approve your own submission. A separate Checker is required.');
      return;
    }

    const feedback = (bundleFeedback[bundle.id] || '').trim();
    if (action === 'REJECT' && !feedback) {
      showNotice('warning', 'Feedback is mandatory when rejecting a bundle promotion to guide the author.');
      return;
    }

    setProcessingBundleId(bundle.id);
    try {
      await api.reviewWorkflowBundlePromotion(bundle.id, action, currentUser.id, currentUser.name || currentUser.username, feedback);
      showNotice('success', `Bundle ${bundle.bundleCode} (${bundle.name}) has been ${action === 'APPROVE' ? 'APPROVED and promoted' : 'REJECTED'}.`);
      await fetchBundles();
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to review workflow bundle promotion.');
    } finally {
      setProcessingBundleId(null);
    }
  };

  // Filtered Lists
  const filteredTxns = transactionApprovals.filter(t => {
    if (!txnSearchQuery.trim()) return true;
    const q = txnSearchQuery.toLowerCase();
    return (
      (t.transactionId && t.transactionId.toLowerCase().includes(q)) ||
      (t.makerName && t.makerName.toLowerCase().includes(q)) ||
      (t.discrepancyType && t.discrepancyType.toLowerCase().includes(q)) ||
      (t.proposedAction && t.proposedAction.toLowerCase().includes(q))
    );
  });

  const filteredBundles = bundleApprovals.filter(b => {
    if (!bundleSearchQuery.trim()) return true;
    const q = bundleSearchQuery.toLowerCase();
    return (
      (b.bundleCode && b.bundleCode.toLowerCase().includes(q)) ||
      (b.name && b.name.toLowerCase().includes(q)) ||
      (b.makerName && b.makerName.toLowerCase().includes(q)) ||
      (b.scope && b.scope.toLowerCase().includes(q))
    );
  });

  const selectedTxn = transactionApprovals.find(t => t.id === selectedTxnId) || filteredTxns[0] || null;
  const selectedBundle = bundleApprovals.find(b => b.id === selectedBundleId) || filteredBundles[0] || null;

  return (
    <div className="space-y-4 max-w-7xl mx-auto" id="operational-authority-center">
      {/* 1. Header with Operational Context & Role Governance */}
      <header className="bg-white border border-slate-200/90 rounded-2xl px-5 py-3.5 text-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          {onNavigateToWorkspace && (
            <button
              type="button"
              onClick={onNavigateToWorkspace}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer border border-slate-200 shrink-0"
              title="Return to Workspace"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="p-2.5 bg-blue-50 text-[#155DFC] rounded-xl border border-blue-200/60 shrink-0">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight font-mono">
                Operational Authority Center
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-purple-50 text-purple-700 border border-purple-200">
                Four-Eyes Governance
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Dedicated Maker-Checker dual authorization queue for high-risk financial overrides and composite workflow promotions.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              fetchTransactions();
              fetchBundles();
            }}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-mono font-bold flex items-center space-x-1.5 transition cursor-pointer border border-slate-200 shadow-2xs"
            title="Refresh Pending Authorizations"
          >
            <RefreshCw size={13} className={isLoadingTxns || isLoadingBundles ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div className={`p-3.5 rounded-2xl border text-xs font-mono font-medium flex items-center justify-between gap-2 shadow-xs transition-all ${
          actionNotice.type === 'success' ? 'bg-emerald-50 text-emerald-900 border-emerald-200' :
          actionNotice.type === 'error' ? 'bg-rose-50 text-rose-900 border-rose-200' :
          'bg-amber-50 text-amber-900 border-amber-200'
        }`}>
          <div className="flex items-center space-x-2.5">
            {actionNotice.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0" /> :
             actionNotice.type === 'error' ? <XCircle size={16} className="text-rose-600 shrink-0" /> :
             <AlertTriangle size={16} className="text-amber-600 shrink-0" />}
            <span>{actionNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="p-1 hover:bg-black/5 rounded-lg transition cursor-pointer text-slate-500"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. Segregated Operational Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto no-scrollbar" id="authority-tabs">
        <button
          type="button"
          onClick={() => setActiveTab('transactions')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer shrink-0 ${
            activeTab === 'transactions'
              ? 'bg-[#155DFC] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/80'
          }`}
        >
          <FileText size={15} />
          <span>Financial &amp; Transaction Resolutions</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
            activeTab === 'transactions' ? 'bg-blue-800 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {transactionApprovals.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('bundles')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition cursor-pointer shrink-0 ${
            activeTab === 'bundles'
              ? 'bg-[#155DFC] text-white shadow-xs'
              : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-slate-200/80'
          }`}
        >
          <Boxes size={15} />
          <span>Operational Workflow Bundles</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
            activeTab === 'bundles' ? 'bg-blue-800 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {bundleApprovals.length}
          </span>
        </button>
      </div>

      {/* 3. TAB 1: FINANCIAL & TRANSACTION RESOLUTIONS */}
      {activeTab === 'transactions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start" id="authority-transactions-view">
          {/* Left Column: Proposals Queue (col-span-5) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-xs text-slate-700 uppercase tracking-wider">
                  Pending Overrides Queue
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  {filteredTxns.length} of {transactionApprovals.length}
                </span>
              </div>

              {/* Search Box */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by txn id, maker, action..."
                  value={txnSearchQuery}
                  onChange={(e) => setTxnSearchQuery(e.target.value)}
                  className="w-full text-xs font-mono pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* List of items */}
            {filteredTxns.length === 0 ? (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center space-y-2 shadow-xs">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
                <h4 className="font-bold text-slate-800 text-sm">No Pending Overrides</h4>
                <p className="text-xs text-slate-500 font-sans">
                  All high-risk financial transaction resolutions have been audited and resolved.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTxns.map(item => {
                  const isSelected = item.id === (selectedTxn ? selectedTxn.id : null);
                  const isMaker = currentUser.id === item.makerId;

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedTxnId(item.id)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                        isSelected
                          ? 'bg-blue-50/70 border-blue-300 shadow-xs'
                          : 'bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-xs text-slate-900">
                              {item.transactionId || 'TXN-UNKNOWN'}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-[9px] ${
                              item.proposedAction === 'FORCE_MATCH' ? 'bg-amber-100 text-amber-900 border border-amber-200' :
                              item.proposedAction === 'WRITE_OFF' ? 'bg-purple-100 text-purple-900 border border-purple-200' :
                              'bg-blue-100 text-blue-900 border border-blue-200'
                            }`}>
                              {item.proposedAction}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                            Discrepancy: <strong className="text-slate-700">{item.discrepancyType || 'LEDGER_MISMATCH'}</strong>
                          </p>
                        </div>

                        {isMaker && (
                          <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-mono font-bold shrink-0">
                            Your Proposal
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-100">
                        <span>Maker: <strong>{item.makerName || item.makerId}</strong></span>
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Evidence Inspector & Checker Authorization Panel (col-span-7) */}
          <div className="lg:col-span-7">
            {selectedTxn ? (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-mono font-bold text-sm text-slate-900">
                        {selectedTxn.transactionId}
                      </h3>
                      <span className="px-2 py-0.5 rounded-md font-mono font-bold text-[10px] bg-blue-100 text-[#155DFC]">
                        {selectedTxn.proposedAction}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      Proposed by <strong className="text-slate-700">{selectedTxn.makerName}</strong> &bull; {new Date(selectedTxn.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full font-mono font-bold text-[10px] shrink-0">
                    AWAITING CHECKER REVIEW
                  </span>
                </div>

                {/* Maker Business Justification */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1">
                  <span className="text-[10px] font-mono uppercase font-bold text-slate-500 tracking-wider">
                    Maker Auditable Justification
                  </span>
                  <p className="text-xs text-slate-800 font-sans">
                    {selectedTxn.justification || 'No justification text provided by maker.'}
                  </p>
                </div>

                {/* Evidence Snapshot (Original vs Mirror Reconciliation) */}
                <div className="space-y-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-slate-500 tracking-wider">
                    Reconciliation Evidence Snapshot (Immutable)
                  </span>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Input Data / Original Transaction */}
                    <div className="bg-[#0B132B] text-slate-200 rounded-xl p-3 border border-slate-800 overflow-x-auto shadow-inner text-[11px] font-mono">
                      <div className="text-blue-400 font-bold mb-1 flex items-center space-x-1">
                        <FileText size={12} />
                        <span>Input Record Snapshot</span>
                      </div>
                      <pre className="text-slate-300">
                        {JSON.stringify(selectedTxn.evidenceSnapshot?.inputData || selectedTxn.evidenceSnapshot || {}, null, 2)}
                      </pre>
                    </div>

                    {/* Mirror Data / Reconciliation Record */}
                    <div className="bg-[#0B132B] text-slate-200 rounded-xl p-3 border border-slate-800 overflow-x-auto shadow-inner text-[11px] font-mono">
                      <div className="text-purple-400 font-bold mb-1 flex items-center space-x-1">
                        <Database size={12} />
                        <span>Mirror Reconciliation Record</span>
                      </div>
                      <pre className="text-slate-300">
                        {JSON.stringify(selectedTxn.evidenceSnapshot?.mirrorData || {}, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>

                {/* Anti-Self-Approval Enforcement Box */}
                {currentUser.id === selectedTxn.makerId ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center space-x-3 text-amber-900 text-xs">
                    <ShieldAlert size={20} className="text-amber-600 shrink-0" />
                    <div>
                      <strong className="block font-bold">Anti-Self-Approval Restriction</strong>
                      <span>You proposed this transaction resolution. The Four-Eyes Principle strictly mandates that a separate Checker authorizes this record.</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-700 mb-1">
                        Checker Auditable Remarks &amp; Feedback
                      </label>
                      <input
                        type="text"
                        placeholder="Enter checker remarks (mandatory if rejecting)..."
                        value={checkerNotes[selectedTxn.id] || ''}
                        onChange={(e) => setCheckerNotes(prev => ({ ...prev, [selectedTxn.id]: e.target.value }))}
                        className="w-full text-xs font-mono p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-end space-x-2 pt-1">
                      <button
                        type="button"
                        disabled={processingTxnId === selectedTxn.id}
                        onClick={() => handleReviewTransaction(selectedTxn, 'REJECT')}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center space-x-1.5 shadow-xs disabled:opacity-50"
                      >
                        <XCircle size={14} />
                        <span>Reject &amp; Return</span>
                      </button>

                      <button
                        type="button"
                        disabled={processingTxnId === selectedTxn.id}
                        onClick={() => handleReviewTransaction(selectedTxn, 'APPROVE')}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center space-x-1.5 shadow-xs disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} />
                        <span>Authorize &amp; Commit Resolution</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center text-slate-400 font-mono text-xs shadow-xs">
                Select a transaction resolution proposal from the queue to inspect evidence and execute dual authorization.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. TAB 2: OPERATIONAL WORKFLOW BUNDLES */}
      {activeTab === 'bundles' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start" id="authority-bundles-view">
          {/* Left Column: Bundles Queue (col-span-5) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-xs text-slate-700 uppercase tracking-wider">
                  Pending Bundle Promotions
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  {filteredBundles.length} of {bundleApprovals.length}
                </span>
              </div>

              {/* Search Box */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by bundle code, name, maker..."
                  value={bundleSearchQuery}
                  onChange={(e) => setBundleSearchQuery(e.target.value)}
                  className="w-full text-xs font-mono pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* List of Bundles */}
            {filteredBundles.length === 0 ? (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-8 text-center space-y-2 shadow-xs">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
                <h4 className="font-bold text-slate-800 text-sm">No Pending Bundle Promotions</h4>
                <p className="text-xs text-slate-500 font-sans">
                  All composite workflow bundle promotion requests have been reviewed and published.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredBundles.map(bundle => {
                  const isSelected = bundle.id === (selectedBundle ? selectedBundle.id : null);
                  const isMaker = currentUser.id === bundle.makerId;

                  return (
                    <div
                      key={bundle.id}
                      onClick={() => setSelectedBundleId(bundle.id)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                        isSelected
                          ? 'bg-blue-50/70 border-blue-300 shadow-xs'
                          : 'bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-xs text-slate-900">
                              {bundle.bundleCode}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 font-bold">
                              v{bundle.version}
                            </span>
                          </div>
                          <h4 className="font-bold text-slate-900 text-xs mt-0.5">{bundle.name}</h4>
                        </div>

                        <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                          {bundle.scope}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-100">
                        <span>Maker: <strong>{bundle.makerName}</strong></span>
                        <span>Boxes: <strong>{bundle.validationBoxIds?.length || 0}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Bundle Inspector Drawer & Checker Actions (col-span-7) */}
          <div className="lg:col-span-7">
            {selectedBundle ? (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-mono font-bold text-sm text-slate-900">
                        {selectedBundle.bundleCode} — {selectedBundle.name}
                      </h3>
                      <span className="px-2 py-0.5 rounded-md font-mono font-bold text-[10px] bg-blue-100 text-[#155DFC]">
                        v{selectedBundle.version}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      Proposed for <strong className="text-slate-700">{selectedBundle.scope}</strong> promotion by <strong className="text-slate-700">{selectedBundle.makerName}</strong>
                    </p>
                  </div>

                  <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full font-mono font-bold text-[10px] shrink-0">
                    PENDING CHECKER
                  </span>
                </div>

                {selectedBundle.description && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 font-sans">
                    {selectedBundle.description}
                  </div>
                )}

                {/* Composite Bundle Components Breakdown */}
                <div className="space-y-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-slate-500 tracking-wider">
                    Bundle Components &amp; Linked Assets
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="flex items-center space-x-1.5 text-blue-700 font-bold">
                        <GitFork size={14} />
                        <span>Workflow DAG</span>
                      </div>
                      <div className="text-[11px] text-slate-600 truncate">
                        ID: {selectedBundle.workflowId}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="flex items-center space-x-1.5 text-purple-700 font-bold">
                        <Boxes size={14} />
                        <span>Validation Boxes</span>
                      </div>
                      <div className="text-[11px] text-slate-600 font-bold">
                        {selectedBundle.validationBoxIds?.length || 0} Rule Boxes
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="flex items-center space-x-1.5 text-emerald-700 font-bold">
                        <Database size={14} />
                        <span>DB Table Checks</span>
                      </div>
                      <div className="text-[11px] text-slate-600 font-bold">
                        {selectedBundle.dbCheckIds?.length || 0} Table Checks
                      </div>
                    </div>
                  </div>
                </div>

                {/* Evidence Snapshot (DAG & Boxes at Proposal Time) */}
                {selectedBundle.evidenceSnapshot && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-mono uppercase font-bold text-slate-500 tracking-wider">
                      Immutable Proposal Snapshot
                    </span>
                    <div className="bg-[#0B132B] text-slate-200 rounded-xl p-3.5 border border-slate-800 overflow-x-auto max-h-60 text-[11px] font-mono shadow-inner">
                      <pre className="text-slate-300">
                        {JSON.stringify(selectedBundle.evidenceSnapshot, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Anti-Self-Approval Enforcement Box */}
                {currentUser.id === selectedBundle.makerId ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center space-x-3 text-amber-900 text-xs">
                    <ShieldAlert size={20} className="text-amber-600 shrink-0" />
                    <div>
                      <strong className="block font-bold">Anti-Self-Approval Guard</strong>
                      <span>You created this workflow bundle. Dual authorization requires a separate Checker or Team Lead to authorize promotion to {selectedBundle.scope}.</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-700 mb-1">
                        Checker Promotion Feedback &amp; Review Notes
                      </label>
                      <input
                        type="text"
                        placeholder="Provide auditable promotion notes (mandatory if rejecting)..."
                        value={bundleFeedback[selectedBundle.id] || ''}
                        onChange={(e) => setBundleFeedback(prev => ({ ...prev, [selectedBundle.id]: e.target.value }))}
                        className="w-full text-xs font-mono p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center justify-end space-x-2 pt-1">
                      <button
                        type="button"
                        disabled={processingBundleId === selectedBundle.id}
                        onClick={() => handleReviewBundle(selectedBundle, 'REJECT')}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center space-x-1.5 shadow-xs disabled:opacity-50"
                      >
                        <XCircle size={14} />
                        <span>Reject Promotion</span>
                      </button>

                      <button
                        type="button"
                        disabled={processingBundleId === selectedBundle.id}
                        onClick={() => handleReviewBundle(selectedBundle, 'APPROVE')}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-mono font-bold transition cursor-pointer flex items-center space-x-1.5 shadow-xs disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} />
                        <span>Authorize Promotion to {selectedBundle.scope}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border border-slate-200/90 rounded-2xl p-12 text-center text-slate-400 font-mono text-xs shadow-xs">
                Select a workflow bundle promotion proposal to inspect attached DAG assets and execute Checker review.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
