/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Check, Edit3, Plus, ShieldCheck, Database, Layers, Play, RefreshCw, CheckCircle2, Folder, FileText, Clock } from 'lucide-react';

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
  const isFtp = resourceType === 'SFTP' || resourceType === 'FTP';

  const [isTestIngesting, setIsTestIngesting] = useState(false);
  const [testIngestSuccess, setTestIngestSuccess] = useState<boolean | null>(null);

  const handleTestIngest = () => {
    setIsTestIngesting(true);
    setTimeout(() => {
      setIsTestIngesting(false);
      setTestIngestSuccess(true);
    }, 700);
  };

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
          {/* Left Column: Review Cards */}
          <div className="md:col-span-8 space-y-3">
            {isFtp ? (
              /* SFTP Dedicated Review Cards */
              <>
                {/* 1. SFTP Connection */}
                <div className="p-4 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-xs">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <Check size={16} />
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 font-mono">1. Remote SFTP Connection</div>
                      <div className="font-bold text-slate-900 text-xs font-mono">
                        {resourceName} · SFTP · {host}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Remote Base Path: {summaryData?.remotePath || summaryData?.database || '/incoming/settlement/'}
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

                {/* 2. File Discovery & Matching */}
                <div className="p-4 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-xs">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <Check size={16} />
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 font-mono">2. File Discovery & Pattern Rules</div>
                      <div className="font-bold text-slate-900 text-xs font-mono">
                        Pattern: <span className="text-[#F97316]">{summaryData?.filePattern || 'SETTLE_*.csv'}</span> · {summaryData?.fileFormat || 'CSV'}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Delimiter: "{summaryData?.delimiter || ','}" · Header row {summaryData?.headerRowIndex || 1} · {summaryData?.matchedFilesCount || 2} matching remote files
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

                {/* 3. Target Local Database Table & Mapping */}
                <div className="p-4 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-xs">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <Check size={16} />
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 font-mono">3. Target Local DB Table</div>
                      <div className="font-bold text-slate-900 text-xs font-mono">
                        {summaryData?.targetDatabase || 'operational_workflow_db'} → <span className="text-blue-600">{summaryData?.targetTable || 'mirror_sftp_settle_clearing'}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {summaryData?.mappings ? summaryData.mappings.length : 10} columns mapped · {summaryData?.targetMode === 'EXISTING_TABLE' ? 'Existing table' : 'Auto-provisioned mirror table'}
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

                {/* 4. Ingestion Policy */}
                <div className="p-4 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-xs">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <Check size={16} />
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 font-mono">4. Ingestion Schedule & Cleanup</div>
                      <div className="font-bold text-slate-900 text-xs font-mono">
                        {summaryData?.scheduleMode === 'ON_DEMAND' ? 'On-Demand / Manual Ingest' : `Cron: ${summaryData?.scheduleCron || '0 2 * * * (Daily at 02:00 UTC)'}`}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        Duplicates: ON CONFLICT {summaryData?.deduplicationAction || 'SKIP'} · Post-ingest: {summaryData?.fileCleanupAction === 'MOVE_ARCHIVE' ? `Move to ${summaryData?.archiveDir || '/archive/'}` : 'Retain remote file'}
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

                {/* Test Ingest Dry Run Action */}
                <div className="p-4 bg-orange-50/40 border border-orange-200 rounded-2xl flex items-center justify-between shadow-2xs">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#F97316] flex items-center justify-center shrink-0">
                      <Play size={15} />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-xs font-mono">
                        Verify Local DB Insertion (Dry-Run 5 Rows)
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Extract first 5 records from discovered file and test insertion into target local table
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleTestIngest}
                    disabled={isTestIngesting}
                    className="px-4 py-2 bg-white hover:bg-slate-50 border border-orange-300 text-orange-950 rounded-xl font-bold font-mono text-xs flex items-center space-x-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <RefreshCw size={13} className={isTestIngesting ? 'animate-spin text-[#F97316]' : 'text-[#F97316]'} />
                    <span>{isTestIngesting ? 'Testing...' : 'Test Ingest Run'}</span>
                  </button>
                </div>

                {testIngestSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-mono text-emerald-800 flex items-center space-x-2 animate-in fade-in duration-200">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span>
                      ✓ Verified: 5 sample records parsed from <strong className="font-bold">SETTLE_20261105_CLEARING.csv</strong> and validated for insertion into <strong className="font-bold">{summaryData?.targetTable || 'mirror_sftp_settle_clearing'}</strong>!
                    </span>
                  </div>
                )}
              </>
            ) : (
              /* Database Standard Review Cards */
              <>
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
              </>
            )}
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

