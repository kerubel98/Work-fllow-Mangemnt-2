/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, Shield, Lock, AlertTriangle, Check, 
  FileText, Database, GitBranch, Flag, ArrowRight
} from 'lucide-react';
import { Issue, User } from '../../types';
import { api } from '../../api/client';

interface StageTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  issue: Issue;
  currentUser?: User;
  onStaged: (stagedIssue: Issue, environment: 'SANDBOX' | 'STAGING' | 'PRODUCTION') => void;
}

export function StageTaskModal({
  isOpen,
  onClose,
  issue,
  currentUser,
  onStaged
}: StageTaskModalProps) {
  const [environment, setEnvironment] = useState<'SANDBOX' | 'STAGING' | 'PRODUCTION'>(
    issue.stagedEnvironment || 'SANDBOX'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const flaggedRows = issue.firstLevelMappedData || [];
  const flaggedCount = flaggedRows.length > 0 ? flaggedRows.length : 24;
  const totalCount = issue.uploadedFileHeaders ? Math.max(500, flaggedCount * 4) : 500;
  const currentUserName = currentUser?.name || currentUser?.username || 'samuel_tech';
  const issueRef = issue.id.startsWith('ISS-') ? issue.id : `ISS-${issue.id.slice(0, 4)}`;

  const handleStage = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    // Rule 7 Maker-Checker / Four-Eyes check for PRODUCTION
    if (environment === 'PRODUCTION') {
      const userRole = (currentUser?.role as string) || '';
      const isAuthorized = ['administrator', 'superadmin', 'manager', 'checker', 'team_admin', 'lead', 'admin'].includes(userRole);
      if (!isAuthorized) {
        setErrorMessage('Four-Eyes Authorization: Staging directly into PRODUCTION requires Checker/Lead authorization.');
        setIsSubmitting(false);
        return;
      }
    }

    try {
      const res = await api.stageIssue(
        issue.id,
        environment,
        issue.findingsNotes || '',
        currentUser?.id,
        currentUserName
      );
      if (res.success && res.issue) {
        onStaged(res.issue, environment);
        onClose();
      } else {
        setErrorMessage(res.message || 'Failed to stage task.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while staging the task.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white border border-slate-200/80 rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col"
        style={{ zoom: 0.9 }}
      >
        {/* Header matching 38_stage_task_popup.png */}
        <div className="px-7 pt-6 pb-4 flex items-start justify-between shrink-0">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-500 border border-orange-100 flex items-center justify-center shrink-0 mt-0.5">
              <Flag size={20} className="fill-orange-500 text-orange-500" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  Stage {issueRef} · {issue.title || 'trn test'}
                </h2>
                <span className="px-2 py-0.5 text-[11px] font-semibold bg-rose-50 text-rose-600 border border-rose-200/60 rounded-md">
                  {issue.priority || 'High'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Escalated by {issue.teamId || 'Card Disputes & Chargebacks Unit'} · agreement EA-{issueRef}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5 px-3 py-1 bg-amber-50 border border-amber-200/80 rounded-full text-xs font-medium text-amber-800">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>Respond within 38 min</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Error message if any */}
        {errorMessage && (
          <div className="mx-7 my-2 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2.5 text-rose-700 text-xs">
            <AlertTriangle size={15} className="shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Body 2 Columns matching 38_stage_task_popup.png */}
        <div className="px-7 py-4 grid grid-cols-1 md:grid-cols-2 gap-8 text-xs text-slate-800">
          {/* Left Column: Everything that comes with this case */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Everything that comes with this case
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 mb-4 leading-normal">
              Copied exactly as the original team left it. You cannot change it.
            </p>

            <div className="space-y-2.5">
              {/* Card 1: Original file and ingestion recipe */}
              <div className="p-3 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between hover:border-slate-300 transition">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <FileText size={16} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-slate-900 truncate">Original file and ingestion recipe</h4>
                    <p className="text-[11px] text-slate-500 truncate">
                      {issue.uploadedFileName || 'clearing_batch_feed.xlsx'} · 500 rows · 5 cleaning steps
                    </p>
                  </div>
                </div>
                <Check size={16} className="text-emerald-500 shrink-0 ml-2" />
              </div>

              {/* Card 2: Data mapping */}
              <div className="p-3 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between hover:border-slate-300 transition">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Database size={16} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-slate-900 truncate">Data mapping</h4>
                    <p className="text-[11px] text-slate-500 truncate">
                      mirror_ftp_aib___unsettled_xls · 5 of 6 columns mapped
                    </p>
                  </div>
                </div>
                <Check size={16} className="text-emerald-500 shrink-0 ml-2" />
              </div>

              {/* Card 3: Validation workflow and results */}
              <div className="p-3 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between hover:border-slate-300 transition">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                    <GitBranch size={16} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-slate-900 truncate">Validation workflow and results</h4>
                    <p className="text-[11px] text-slate-500 truncate">
                      New Validation Pipeline v3 · {flaggedCount} of {totalCount} flagged
                    </p>
                  </div>
                </div>
                <Check size={16} className="text-emerald-500 shrink-0 ml-2" />
              </div>

              {/* Card 4: Escalation terms */}
              <div className="p-3 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between hover:border-slate-300 transition">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                    <Shield size={16} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-slate-900 truncate">Escalation terms</h4>
                    <p className="text-[11px] text-slate-500 truncate">
                      Respond in 4h · resolve in 24h · 99% accuracy
                    </p>
                  </div>
                </div>
                <Check size={16} className="text-emerald-500 shrink-0 ml-2" />
              </div>
            </div>
          </div>

          {/* Right Column: How you will work */}
          <div className="flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 tracking-tight mb-4">
                How you will work
              </h3>

              {/* Step 1 */}
              <div className="flex items-start space-x-3 mb-4">
                <div className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">Level 1 · Case as received</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    Read the full story: ingestion, mapping, validation and escalation.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start space-x-3 mb-6">
                <div className="w-5 h-5 rounded-full bg-orange-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">Level 2 · Your workspace</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    Investigate in an environment, write a solution, then post it as a hashtag.
                  </p>
                </div>
              </div>

              {/* Start in Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Start in
                </label>
                <div className="bg-slate-100 p-1 rounded-xl flex items-center text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setEnvironment('SANDBOX')}
                    className={`flex-1 py-1.5 text-center rounded-lg transition cursor-pointer ${
                      environment === 'SANDBOX'
                        ? 'bg-white text-slate-900 font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sandbox
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnvironment('STAGING')}
                    className={`flex-1 py-1.5 text-center rounded-lg transition cursor-pointer ${
                      environment === 'STAGING'
                        ? 'bg-white text-slate-900 font-bold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Staging
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnvironment('PRODUCTION')}
                    className={`flex-1 py-1.5 text-center rounded-lg transition cursor-pointer flex items-center justify-center space-x-1 ${
                      environment === 'PRODUCTION'
                        ? 'bg-white text-rose-600 font-bold shadow-xs'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Lock size={12} className="text-slate-400" />
                    <span>Production</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Sandbox is a private copy of the data. Production needs checker approval.
                </p>
              </div>

              <p className="text-[11px] text-slate-500 mt-5 leading-relaxed">
                Staging starts your response clock and assigns the case to you, @{currentUserName}.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions matching 38_stage_task_popup.png */}
        <div className="px-7 py-4 bg-slate-50/60 border-t border-slate-100 flex items-center justify-end space-x-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition cursor-pointer"
          >
            Not now
          </button>
          <button
            type="button"
            id="btn-confirm-stage-task"
            onClick={handleStage}
            disabled={isSubmitting}
            className="px-5 py-2 text-xs font-semibold text-white bg-[#F97316] hover:bg-orange-600 rounded-xl shadow-xs transition cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
          >
            <span>{isSubmitting ? 'Staging...' : 'Stage & open workspace'}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default StageTaskModal;
