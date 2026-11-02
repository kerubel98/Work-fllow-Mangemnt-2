/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Check, Edit3, Plus, ShieldCheck, Database, Layers } from 'lucide-react';

export interface Step5ReviewActivateProps {
  summaryData?: any;
  onEditStep: (stepNumber: 1 | 2 | 3 | 4) => void;
  onActivate: () => void;
  onBack: () => void;
  isActivating?: boolean;
}

export function Step5ReviewActivate({
  summaryData,
  onEditStep,
  onActivate,
  onBack,
  isActivating = false
}: Step5ReviewActivateProps) {
  const resourceName = summaryData?.name || 'Sett';
  const resourceType = summaryData?.type || 'MySQL';
  const host = summaryData?.host || '127.0.0.1:3306';

  return (
    <div className="flex-1 flex flex-col justify-between p-8 text-xs text-slate-800">
      <div className="max-w-4xl space-y-6">
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">Review and activate</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Everything required is done. Check the summary, then activate.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Left Column: 4 Review Cards matching 66_step5_review_activate.png */}
          <div className="md:col-span-8 space-y-3">
            {/* 1. Connection */}
            <div className="p-4 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-3.5">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Check size={16} />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Connection</div>
                  <div className="font-bold text-slate-900 text-xs">
                    {resourceName} · {resourceType} · {host}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Connected · 14 ms
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onEditStep(1)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition cursor-pointer"
              >
                Edit
              </button>
            </div>

            {/* 2. Tables */}
            <div className="p-4 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-3.5">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Check size={16} />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Tables</div>
                  <div className="font-bold text-slate-900 text-xs">
                    4 tables allowed
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    auth_log_tab, sv_fin_tab, tran_log_tab, usonas_fin_tab
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onEditStep(2)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition cursor-pointer"
              >
                Edit
              </button>
            </div>

            {/* 3. Mapping */}
            <div className="p-4 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-3.5">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Check size={16} />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Mapping</div>
                  <div className="font-bold text-slate-900 text-xs">
                    262 of 273 columns mapped
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    All required fields mapped · 11 left unmapped on purpose
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onEditStep(3)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition cursor-pointer"
              >
                Edit
              </button>
            </div>

            {/* 4. Translations */}
            <div className="p-4 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-3.5">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Check size={16} />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Translations</div>
                  <div className="font-bold text-slate-900 text-xs">
                    2 dictionaries applied
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Institution IDs, transaction status
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onEditStep(4)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition cursor-pointer"
              >
                Edit
              </button>
            </div>
          </div>

          {/* Right Column: After you activate card */}
          <div className="md:col-span-4 p-5 bg-white border border-slate-200/80 rounded-3xl shadow-xs space-y-4">
            <h3 className="font-bold text-slate-900 text-xs">After you activate</h3>

            <div className="space-y-2 text-slate-600 text-xs">
              <div>• It appears in Rules and Workflows.</div>
              <div>• It can be queried in the Query sandbox.</div>
              <div>• Your team can pick its tables.</div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <div className="text-[11px] font-semibold text-slate-400 mb-2">Teams that can use it</div>
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700 text-xs font-medium">
                  Core Operations & Settlement
                </span>
                <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700 text-xs font-medium">
                  Card Disputes & Chargebacks
                </span>
                <button
                  type="button"
                  className="px-2 py-1 border border-dashed border-slate-300 rounded-lg text-slate-500 hover:text-slate-700 text-xs flex items-center space-x-1 cursor-pointer"
                >
                  <Plus size={11} />
                  <span>Add team</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-medium text-xs transition cursor-pointer"
        >
          Back
        </button>

        <div className="text-[11px] text-slate-400">
          Ready to activate.
        </div>

        <button
          type="button"
          disabled={isActivating}
          onClick={onActivate}
          className="px-5 py-2 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl font-semibold text-xs transition cursor-pointer shadow-xs disabled:opacity-50"
        >
          {isActivating ? 'Activating...' : 'Activate resource →'}
        </button>
      </div>
    </div>
  );
}

export default Step5ReviewActivate;

