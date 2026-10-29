/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, Lock, FileText, Database, GitBranch, Shield, Zap, User as UserIcon, AlertTriangle
} from 'lucide-react';
import { Issue, User, HashtagPreset } from '../../types';
import { api } from '../../api/client';

interface PostAsHashtagModalProps {
  isOpen: boolean;
  onClose: () => void;
  issue: Issue;
  solutionScript: string;
  solutionType: 'TEMPORARY' | 'SYSTEM_FIX';
  dryRunResults?: any;
  currentUser?: User;
  onPosted: (preset: HashtagPreset) => void;
}

export function PostAsHashtagModal({
  isOpen,
  onClose,
  issue,
  solutionScript,
  solutionType,
  dryRunResults,
  currentUser,
  onPosted
}: PostAsHashtagModalProps) {
  const defaultTag = '#SETTLEMENT_AMOUNT_ROUNDING';

  const [tag, setTag] = useState(defaultTag);
  const [description, setDescription] = useState(
    'Settlement amount differences under 50.00 caused by fee rounding on the switch side.'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentUserName = currentUser?.name || currentUser?.username || 'samuel_tech';

  const handlePost = async () => {
    if (!tag.trim()) {
      setErrorMessage('Hashtag name is required');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const cleanTag = tag.trim().startsWith('#') ? tag.trim().toUpperCase() : `#${tag.trim().toUpperCase()}`;

    try {
      const payload = {
        tag: cleanTag,
        description,
        issueId: issue.id,
        solutionScript,
        solutionType,
        expiresAt: solutionType === 'TEMPORARY' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : undefined,
        lockedProcess: {
          fileSchemaName: 'AIB settlement template · 5 steps',
          mappingRecipeName: 'mirror_ftp_aib___unsettled_xls · 5 of 6 mapped',
          validationStageName: 'New Validation Pipeline v3',
          slaTerms: `EA-${issue.id.slice(0, 8)} · respond 4h, resolve 24h`,
          workflowId: issue.workflowId,
          workflowName: issue.workflowName
        },
        dryRunResults: dryRunResults || undefined,
        reportingTeamId: issue.teamId,
        authorUserId: currentUser?.id || 'tech-user',
        authorName: currentUserName
      };

      const res = await api.postHashtagSolution(payload);
      if (res.success && res.preset) {
        onPosted(res.preset);
        onClose();
      } else {
        setErrorMessage(res.message || 'Failed to post hashtag solution.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to publish hashtag solution.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white border border-slate-200/80 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col"
        style={{ zoom: 0.9 }}
      >
        {/* Header matching 41_post_as_hashtag.png */}
        <div className="px-7 pt-6 pb-4 flex items-start justify-between shrink-0">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-50 text-orange-500 border border-orange-100 flex items-center justify-center font-bold text-xl shrink-0">
              #
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Post as hashtag
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Turn this case into an automated end-to-end workflow
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {errorMessage && (
          <div className="mx-7 my-2 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-rose-700 text-xs">
            <AlertTriangle size={15} className="shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Two Columns Body matching 41_post_as_hashtag.png */}
        <div className="px-7 py-4 grid grid-cols-1 md:grid-cols-2 gap-8 text-xs text-slate-800">
          {/* Left Column: Form Inputs & Owner Scope */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Hashtag
              </label>
              <input
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="#SETTLEMENT_AMOUNT_ROUNDING"
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-slate-400 uppercase"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                What it fixes
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 leading-relaxed focus:outline-none focus:border-slate-400"
              />
            </div>

            {/* Badges row */}
            <div className="flex items-center space-x-2">
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                Type A · File ingestion
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200/60">
                Temporary solution · 30 days
              </span>
            </div>

            {/* Reports to Card */}
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Reports to
              </label>
              <div className="p-3 bg-white border border-slate-200/80 rounded-xl flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 font-bold text-xs flex items-center justify-center shrink-0">
                  CA
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">
                    Card Disputes & Chargebacks Unit
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Original team · weekly digest and on every failure
                  </p>
                </div>
              </div>
            </div>

            {/* Owner Note */}
            <div className="flex items-center space-x-2 text-[11px] text-slate-500 pt-1">
              <UserIcon size={14} className="text-slate-400 shrink-0" />
              <span>
                Only you (@{currentUserName}) can edit this hashtag. Everyone else sees it read only.
              </span>
            </div>
          </div>

          {/* Right Column: Attached Process Cards & Approval Notice */}
          <div className="space-y-4 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-xs">
                The original process is attached
              </h3>
              <p className="text-[11px] text-slate-400 mb-3">
                Every future transaction runs through the same steps.
              </p>

              <div className="space-y-2">
                {/* 1. Ingestion recipe */}
                <div className="p-2.5 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <FileText size={15} className="text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 text-xs">Ingestion recipe</div>
                      <div className="text-[11px] text-slate-500 truncate">AIB settlement template · 5 steps</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-500 flex items-center space-x-1 shrink-0">
                    <Lock size={10} />
                    <span>Locked</span>
                  </span>
                </div>

                {/* 2. Data mapping */}
                <div className="p-2.5 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Database size={15} className="text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 text-xs">Data mapping</div>
                      <div className="text-[11px] text-slate-500 truncate">mirror_ftp_aib___unsettled_xls · 5 of 6 mapped</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-500 flex items-center space-x-1 shrink-0">
                    <Lock size={10} />
                    <span>Locked</span>
                  </span>
                </div>

                {/* 3. Validation workflow */}
                <div className="p-2.5 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <GitBranch size={15} className="text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 text-xs">Validation workflow</div>
                      <div className="text-[11px] text-slate-500 truncate">New Validation Pipeline v3</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-500 flex items-center space-x-1 shrink-0">
                    <Lock size={10} />
                    <span>Locked</span>
                  </span>
                </div>

                {/* 4. Escalation agreement */}
                <div className="p-2.5 bg-white border border-slate-200/80 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Shield size={15} className="text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 text-xs">Escalation agreement</div>
                      <div className="text-[11px] text-slate-500 truncate">EA-ISS-3854 · respond 4h, resolve 24h</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-500 flex items-center space-x-1 shrink-0">
                    <Lock size={10} />
                    <span>Locked</span>
                  </span>
                </div>

                {/* 5. Your solution script (Editable by you) */}
                <div className="p-2.5 bg-orange-50/40 border border-orange-200/70 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Zap size={15} className="text-orange-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 text-xs">Your solution script</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        UPDATE sv_fin_tab ... (dry run: 24 rows, 0 errors)
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 shrink-0">
                    Editable by you
                  </span>
                </div>
              </div>
            </div>

            {/* Approval Notice Box */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-[11px] text-slate-600 leading-relaxed">
              <strong>Goes live after approval.</strong> @checker_ops_2 from Card Disputes & Chargebacks checks it first. The 24 transactions in this case are collected under it now.
            </div>
          </div>
        </div>

        {/* Footer Buttons matching 41_post_as_hashtag.png */}
        <div className="px-7 py-4 bg-slate-50/60 border-t border-slate-100 flex items-center justify-end space-x-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition cursor-pointer"
          >
            Back
          </button>
          <button
            type="button"
            id="btn-confirm-post-hashtag"
            onClick={handlePost}
            disabled={isSubmitting}
            className="px-5 py-2 text-xs font-semibold text-white bg-[#F97316] hover:bg-orange-600 rounded-xl shadow-xs transition cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
          >
            <span>{isSubmitting ? 'Posting...' : 'Post hashtag for approval'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default PostAsHashtagModal;
