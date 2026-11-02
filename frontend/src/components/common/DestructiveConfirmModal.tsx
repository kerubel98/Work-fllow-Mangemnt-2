/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertTriangle, Download, PowerOff, X } from 'lucide-react';

export type DestructiveActionType = 'workflow' | 'fields' | 'database' | 'custom';

export interface DestructiveConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: DestructiveActionType;
  targetName: string;
  targetSubtitle?: string;
  expectedConfirmationText: string;
  inUseSummary?: string;
  systemCount?: number;
  userCreatedCount?: number;
  affectedSummary?: string;
  onConfirm: () => void;
  onExportBackup?: () => void;
  onDeleteSystemOnly?: () => void;
  onSetOffline?: () => void;
  confirmButtonLabel?: string;
  isSubmitting?: boolean;
}

export function DestructiveConfirmModal({
  isOpen,
  onClose,
  type,
  targetName,
  targetSubtitle,
  expectedConfirmationText,
  inUseSummary = '2 hashtags · 1 team bundle · 1 open case',
  systemCount = 480,
  userCreatedCount = 19,
  affectedSummary = '1 staging feed (paused) · 0 teams with access',
  onConfirm,
  onExportBackup,
  onDeleteSystemOnly,
  onSetOffline,
  confirmButtonLabel,
  isSubmitting = false
}: DestructiveConfirmModalProps) {
  const [typedInput, setTypedInput] = useState('');

  if (!isOpen) return null;

  const isConfirmed = typedInput.trim() === expectedConfirmationText.trim();

  const getTitle = () => {
    switch (type) {
      case 'workflow':
        return `Delete "${targetName}"?`;
      case 'fields':
        return `Delete ${targetName || '499 mapping fields'}?`;
      case 'database':
        return `Remove database "${targetName}"?`;
      default:
        return `Delete ${targetName}?`;
    }
  };

  const getSubtitle = () => {
    if (targetSubtitle) return targetSubtitle;
    switch (type) {
      case 'workflow':
        return 'This removes the workflow and its steps.';
      case 'fields':
        return 'Rules and mappings that use these fields will stop working.';
      case 'database':
        return 'Credentials are removed. Data already staged is kept.';
      default:
        return 'This action cannot be undone.';
    }
  };

  const getConfirmButtonText = () => {
    if (confirmButtonLabel) return confirmButtonLabel;
    switch (type) {
      case 'workflow':
        return 'Delete workflow';
      case 'fields':
        return `Delete all ${targetName || '499'}`;
      case 'database':
        return 'Delete connection';
      default:
        return 'Confirm Delete';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white border border-slate-200/90 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
        style={{ zoom: 0.92 }}
      >
        <div className="p-6">
          {/* Warning Icon Badge */}
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-500 border border-rose-100 flex items-center justify-center mb-4">
            <AlertTriangle size={20} className="text-rose-500" />
          </div>

          {/* Title & Subtitle */}
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            {getTitle()}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {getSubtitle()}
          </p>

          {/* Workflow Variant: In use banner */}
          {type === 'workflow' && (
            <div className="mt-4 p-3.5 bg-amber-50/80 border border-amber-200/70 rounded-xl text-xs text-amber-900">
              <span className="font-semibold text-amber-950">In use by:</span>
              <div className="mt-0.5 text-amber-800">{inUseSummary}</div>
            </div>
          )}

          {/* Fields Variant: System vs User counts & Alternative actions */}
          {type === 'fields' && (
            <div className="mt-4 space-y-3">
              <div className="border border-slate-200/80 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                <div className="px-3.5 py-2.5 flex items-center justify-between text-slate-700 bg-white">
                  <span>Discovered by the system</span>
                  <span className="font-bold text-slate-900 font-mono">{systemCount}</span>
                </div>
                <div className="px-3.5 py-2.5 flex items-center justify-between text-slate-700 bg-white">
                  <span>Created by people</span>
                  <span className="font-bold text-slate-900 font-mono">{userCreatedCount}</span>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {onExportBackup && (
                  <button
                    type="button"
                    onClick={onExportBackup}
                    className="flex-1 py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition cursor-pointer"
                  >
                    <Download size={13} className="text-slate-500" />
                    <span>Export backup first</span>
                  </button>
                )}
                {onDeleteSystemOnly && (
                  <button
                    type="button"
                    onClick={onDeleteSystemOnly}
                    className="flex-1 py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition cursor-pointer"
                  >
                    <span>Delete system-discovered only</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Database Variant: Affected items & Set offline option */}
          {type === 'database' && (
            <div className="mt-4 space-y-3">
              <div className="p-3.5 bg-amber-50/80 border border-amber-200/70 rounded-xl text-xs text-amber-900">
                <span className="font-semibold text-amber-950">Affected:</span>
                <div className="mt-0.5 text-amber-800">{affectedSummary}</div>
              </div>

              {onSetOffline && (
                <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-slate-800">Not ready to remove it?</div>
                    <div className="text-slate-500 text-[11px] mt-0.5">Set it offline instead. Nothing is deleted.</div>
                  </div>
                  <button
                    type="button"
                    onClick={onSetOffline}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg font-semibold text-xs transition cursor-pointer flex items-center space-x-1"
                  >
                    <PowerOff size={12} className="text-slate-500" />
                    <span>Set offline</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Confirmation Input */}
          <div className="mt-5 space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">
              Type <code className="bg-slate-100 px-1 py-0.5 rounded text-rose-600 font-bold">{expectedConfirmationText}</code> to confirm
            </label>
            <input
              type="text"
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              placeholder={expectedConfirmationText}
              className={`w-full px-3 py-2 text-xs rounded-xl border font-mono transition focus:outline-none ${
                isConfirmed
                  ? 'border-emerald-500 bg-emerald-50/20 text-slate-900'
                  : typedInput.length > 0
                  ? 'border-rose-300 bg-rose-50/10 text-rose-700'
                  : 'border-slate-200 bg-white text-slate-800'
              }`}
            />
          </div>

          {/* Retention notice for workflows */}
          {type === 'workflow' && (
            <p className="text-[11px] text-slate-400 mt-2">
              Kept for 30 days in Deleted items, so it can be restored.
            </p>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end space-x-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isConfirmed || isSubmitting}
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-xl transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Deleting...' : getConfirmButtonText()}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DestructiveConfirmModal;

