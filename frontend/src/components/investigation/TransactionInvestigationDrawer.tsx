/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Issue, TransactionInvestigationStatus } from '../../types';
import {
  X, Play, RotateCcw, Database, CheckCircle2, AlertCircle, Clock, Check,
  ChevronRight, ShieldAlert, Sparkles, CheckCheck, ArrowRight, CornerDownRight
} from 'lucide-react';
import { extractRowData } from '../../utils/transactionFormatters';

interface TransactionInvestigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: any | null;
  caseItem?: Issue | null;
  onUpdateInvestigationStatus?: (rowId: string, status: TransactionInvestigationStatus) => void;
  onCloseTransaction?: (rowId: string, note: string) => void;
  onTraceInDatabase?: (transaction: any) => void;
  onRevertTransaction?: (transaction: any) => void;
  onOpenCompareResolve?: (transaction: any) => void;
}

export default function TransactionInvestigationDrawer({
  isOpen,
  onClose,
  transaction,
  caseItem,
  onUpdateInvestigationStatus,
  onCloseTransaction,
  onTraceInDatabase,
  onRevertTransaction,
  onOpenCompareResolve
}: TransactionInvestigationDrawerProps) {
  const [resolutionNote, setResolutionNote] = useState('');
  const [currentStatus, setCurrentStatus] = useState<TransactionInvestigationStatus>('UNINVESTIGATED');
  const [isTracing, setIsTracing] = useState(false);
  const [traceResult, setTraceResult] = useState<any | null>(null);
  const [revertedToast, setRevertedToast] = useState(false);

  useEffect(() => {
    if (transaction) {
      const extracted = extractRowData(transaction);
      setCurrentStatus((transaction.investigationStatus || extracted.investigationStatus || 'UNINVESTIGATED') as TransactionInvestigationStatus);
      setResolutionNote(transaction.resolutionNote || extracted.resolutionNote || '');
      setIsTracing(false);
      setTraceResult(null);
      setRevertedToast(false);
    }
  }, [transaction]);

  if (!isOpen || !transaction) return null;

  const extracted = extractRowData(transaction);
  const txnId = extracted.txnId;
  const amount = extracted.amount;
  const currency = extracted.currency;
  const financialStatus = extracted.status;
  const validationStatus = extracted.validationStatus;

  const statuses: { key: TransactionInvestigationStatus; label: string }[] = [
    { key: 'UNINVESTIGATED', label: 'Pending' },
    { key: 'IN_PROGRESS', label: 'Investigating' },
    { key: 'FLAGGED_DISCREPANCY', label: 'Flagged' },
    { key: 'VERIFIED_MATCH', label: 'Reconciled' },
    { key: 'CLOSED', label: 'Closed' }
  ];

  const handleStatusChange = (newStatus: TransactionInvestigationStatus) => {
    setCurrentStatus(newStatus);
    if (onUpdateInvestigationStatus) {
      onUpdateInvestigationStatus(transaction.id || txnId, newStatus);
    }
  };

  const handleCloseTxn = () => {
    if (onCloseTransaction) {
      onCloseTransaction(transaction.id || txnId, resolutionNote);
    }
    onClose();
  };

  const handleTraceClick = () => {
    setIsTracing(true);
    if (onTraceInDatabase) {
      onTraceInDatabase(transaction);
    }
    setTimeout(() => {
      setTraceResult({
        database: transaction._target_db || 'operational_workflow_db (PostgreSQL)',
        table: transaction._target_table || 'tran_logtab / mirror_reconciliation',
        keySearched: txnId,
        matchCount: 1,
        ledgerStatus: financialStatus === 'Success' || validationStatus === 'PASS' ? 'RECONCILED' : 'PENDING_MIRROR_SYNC',
        timestamp: new Date().toLocaleTimeString()
      });
      setIsTracing(false);
    }, 400);
  };

  const handleRevertClick = () => {
    handleStatusChange('UNINVESTIGATED');
    setResolutionNote('');
    setRevertedToast(true);
    if (onRevertTransaction) {
      onRevertTransaction(transaction);
    }
    setTimeout(() => setRevertedToast(false), 3000);
  };

  // Compile synthesized rule trail
  const stepEntries = transaction.stepResults ? Object.values(transaction.stepResults) : [];
  const trailSteps = stepEntries.length > 0 ? [
    {
      title: 'Ingress received',
      desc: `Transaction loaded from ${caseItem?.uploadedFileName || caseItem?.title || 'Batch Feed'}.`,
      icon: <Play size={13} className="fill-emerald-600 text-emerald-600" />,
      bg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      status: 'Ready'
    },
    ...stepEntries.map((st: any) => ({
      title: st.stageName || st.stepId || 'Validation Check',
      desc: st.detail || (st.status === 'PASSED' ? 'Check verified against target ledger' : 'Validation check flagged a discrepancy'),
      icon: st.status === 'PASSED' 
        ? <Check size={13} className="text-emerald-600 font-bold" />
        : <AlertCircle size={13} className="text-rose-600" />,
      bg: st.status === 'PASSED'
        ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
        : 'bg-rose-50 text-rose-600 border-rose-100',
      status: st.badgeText || st.status || 'Verified'
    }))
  ] : [
    {
      title: 'Ingress received',
      desc: `Transaction loaded from ${caseItem?.uploadedFileName || caseItem?.title || 'Batch Feed'}.`,
      icon: <Play size={13} className="fill-emerald-600 text-emerald-600" />,
      bg: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      status: 'Ready'
    },
    {
      title: `Condition check · ${transaction._target_table || 'tran_logtab'}`,
      desc: validationStatus === 'PASS' 
        ? 'Condition check passed. Target ledger records verified.'
        : validationStatus === 'FAIL'
        ? 'Validation discrepancy detected against mirror table.'
        : 'Not run yet. Run validation to see the result.',
      icon: validationStatus === 'PASS' 
        ? <Check size={13} className="text-emerald-600 font-bold" />
        : validationStatus === 'FAIL'
        ? <AlertCircle size={13} className="text-rose-600" />
        : <Clock size={13} className="text-slate-400" />,
      bg: validationStatus === 'PASS'
        ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
        : validationStatus === 'FAIL'
        ? 'bg-rose-50 text-rose-600 border-rose-100'
        : 'bg-slate-100 text-slate-400 border-slate-200',
      status: validationStatus || 'Not run'
    }
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/30 backdrop-blur-2xs z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer (440px wide) */}
      <aside
        className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col justify-between border-l border-slate-200 animate-in slide-in-from-right duration-200 font-sans"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        {/* Top Header */}
        <div className="p-5 border-b border-slate-100 flex items-start justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium block mb-1">
              Transaction Investigation
            </span>
            <div className="flex items-center space-x-2">
              <h2 id="drawer-title" className="text-xl font-bold font-mono text-slate-900">
                {txnId}
              </h2>
              <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                String(financialStatus).toLowerCase() === 'success' || String(financialStatus).toLowerCase() === 'settled'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                  : 'bg-amber-50 text-amber-700 border border-amber-200/60'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  String(financialStatus).toLowerCase() === 'success' || String(financialStatus).toLowerCase() === 'settled'
                    ? 'bg-emerald-500'
                    : 'bg-amber-500'
                }`} />
                <span>{financialStatus}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 font-sans">
              {Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}{caseItem?.id ? ` · Case ${caseItem.id}` : ''}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Close drawer (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Revert Feedback Notification */}
          {revertedToast && (
            <div className="p-3 bg-slate-900 text-white text-xs rounded-xl flex items-center space-x-2 animate-in fade-in">
              <RotateCcw size={13} className="text-emerald-400" />
              <span>Transaction status reverted to Pending.</span>
            </div>
          )}

          {/* 1. Investigation Status Segmented Toggle */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-2 font-heading">
              Investigation status
            </label>
            <div className="grid grid-cols-5 p-1 bg-slate-100 rounded-xl text-[11px] font-medium text-slate-600 gap-0.5">
              {statuses.map(s => {
                const isActive = currentStatus === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => handleStatusChange(s.key)}
                    className={`py-1.5 px-0.5 rounded-lg text-center transition-all cursor-pointer truncate ${
                      isActive
                        ? 'bg-white text-slate-900 font-bold shadow-xs'
                        : 'hover:text-slate-900 hover:bg-white/50'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Rule Trail */}
          <div>
            <h3 className="text-xs font-semibold text-slate-900 font-heading mb-3">
              Rule trail
            </h3>
            <div className="space-y-4">
              {trailSteps.map((step, sIdx) => (
                <div key={sIdx} className="flex items-start space-x-3.5">
                  <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${step.bg}`}>
                    {step.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 font-heading block">
                        {step.title}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">{step.status}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Real-time Database Trace Card (if activated) */}
          {traceResult && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-slate-700 font-semibold">
                  <Database size={13} className="text-[#155DFC]" />
                  <span>Database Trace Evidence</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">{traceResult.timestamp}</span>
              </div>
              <div className="space-y-1 font-mono text-[11px] text-slate-600">
                <div>Source: <span className="text-slate-900 font-medium">{traceResult.database}</span></div>
                <div>Table: <span className="text-slate-900 font-medium">{traceResult.table}</span></div>
                <div>Match Key: <span className="text-slate-900 font-medium">{traceResult.keySearched}</span></div>
                <div className="pt-1">
                  Status:{' '}
                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                    {traceResult.ledgerStatus}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 4. Resolution Note */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-2 font-heading">
              Resolution note
            </label>
            <textarea
              rows={4}
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder="Add context for the next reviewer..."
              className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:border-[#F27421] focus:ring-1 focus:ring-[#F27421]/30 transition-all outline-none resize-none"
            />
            <div className="flex items-center space-x-1.5 mt-1.5 text-[11px] text-slate-400 font-mono">
              <span className="text-slate-400">#</span>
              <span>Resolution must be linked to an automation tag</span>
            </div>
          </div>

          {/* 5. Action Buttons (Trace & Revert) */}
          <div className="flex items-center space-x-2 pt-1">
            <button
              type="button"
              onClick={handleTraceClick}
              disabled={isTracing}
              className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Database size={13} className={`text-slate-500 ${isTracing ? 'animate-spin' : ''}`} />
              <span>{isTracing ? 'Tracing...' : 'Trace in database'}</span>
            </button>
            <button
              type="button"
              onClick={handleRevertClick}
              className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 transition-colors cursor-pointer"
            >
              <RotateCcw size={13} className="text-slate-500" />
              <span>Revert</span>
            </button>
          </div>
        </div>

        {/* Bottom Sticky Action Bar */}
        <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between gap-2">
          {onOpenCompareResolve && (
            <button
              type="button"
              onClick={() => onOpenCompareResolve(transaction)}
              className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              Compare &amp; Resolve
            </button>
          )}
          <button
            type="button"
            onClick={handleCloseTxn}
            className="px-4 py-2 bg-[#F27421] hover:bg-[#E06310] text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer flex items-center space-x-1.5 transition-colors ml-auto"
          >
            <span>Close transaction</span>
          </button>
        </div>
      </aside>
    </>
  );
}
