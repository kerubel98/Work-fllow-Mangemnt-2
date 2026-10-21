/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Issue, TransactionInvestigationStatus } from '../../types';
import { X, Play, RotateCcw, Database, CheckCircle2, AlertCircle, Clock, Check, ChevronRight } from 'lucide-react';

interface TransactionInvestigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: any | null;
  caseItem?: Issue | null;
  onUpdateInvestigationStatus?: (rowId: string, status: TransactionInvestigationStatus) => void;
  onCloseTransaction?: (rowId: string, note: string) => void;
  onTraceInDatabase?: (transaction: any) => void;
  onRevertTransaction?: (transaction: any) => void;
}

export default function TransactionInvestigationDrawer({
  isOpen,
  onClose,
  transaction,
  caseItem,
  onUpdateInvestigationStatus,
  onCloseTransaction,
  onTraceInDatabase,
  onRevertTransaction
}: TransactionInvestigationDrawerProps) {
  const [resolutionNote, setResolutionNote] = useState('');
  const [currentStatus, setCurrentStatus] = useState<TransactionInvestigationStatus>('UNINVESTIGATED');

  useEffect(() => {
    if (transaction) {
      setCurrentStatus(transaction.investigationStatus || 'UNINVESTIGATED');
      setResolutionNote(transaction.resolutionNote || '');
    }
  }, [transaction]);

  if (!isOpen || !transaction) return null;

  const txnId = transaction.transaction_id || transaction.tx_id || transaction.id || transaction.FE_UTRNNO || 'TXN-9001';
  const amount = transaction.amount || transaction.amount_usd || transaction.REQAMT || transaction.AMNT1 || '1,500.00';
  const currency = transaction.currency || transaction.currency_code || 'USD';
  const financialStatus = transaction.status || transaction.status_state || 'Success';

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

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/30 backdrop-blur-2xs z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer (380px - 480px) */}
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
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>{financialStatus}</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 font-sans">
              {Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency} · Case {caseItem?.id || 'ISS-1792258589203-7468'}
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
              {/* Step 1: Ingress */}
              <div className="flex items-start space-x-3.5">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Play size={13} className="fill-emerald-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-slate-900 font-heading block">
                    Ingress received
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Transaction loaded from {caseItem?.title || 'clearing_batch_feed.xlsx'}.
                  </p>
                </div>
              </div>

              {/* Step 2: Condition check */}
              <div className="flex items-start space-x-3.5">
                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <Clock size={13} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-slate-900 font-heading block">
                    Condition check · tran_logtab
                  </span>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Not run yet. Run validation to see the result.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Resolution Note */}
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

          {/* 4. Action Buttons */}
          <div className="flex items-center space-x-2 pt-1">
            <button
              type="button"
              onClick={() => onTraceInDatabase && onTraceInDatabase(transaction)}
              className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 transition-colors cursor-pointer"
            >
              <Database size={13} className="text-slate-500" />
              <span>Trace in database</span>
            </button>
            <button
              type="button"
              onClick={() => onRevertTransaction && onRevertTransaction(transaction)}
              className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 transition-colors cursor-pointer"
            >
              <RotateCcw size={13} className="text-slate-500" />
              <span>Revert</span>
            </button>
          </div>
        </div>

        {/* Bottom Sticky Action Bar */}
        <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-sans max-w-[200px] leading-tight">
            Closing this transaction does not close the case.
          </span>
          <button
            type="button"
            onClick={handleCloseTxn}
            className="px-4 py-2 bg-[#F27421] hover:bg-[#E06310] text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer flex items-center space-x-1.5 transition-colors"
          >
            <span>Close transaction</span>
          </button>
        </div>
      </aside>
    </>
  );
}
