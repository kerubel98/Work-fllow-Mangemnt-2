/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, Shield, Lock, Check, AlertTriangle, 
  FileText, Database, GitBranch, Flag, Play, 
  RotateCcw, CheckCircle2, Clock, ChevronRight, ChevronLeft,
  MessageSquare
} from 'lucide-react';
import { Issue, User, HashtagPreset } from '../../types';
import { api } from '../../api/client';
import { PostAsHashtagModal } from './PostAsHashtagModal';

interface TechnicianInvestigationWorkspaceProps {
  issue: Issue;
  currentUser?: User;
  onBack: () => void;
  onOpenRoom?: () => void;
  onUpdateIssue?: (issueId: string, updates: Partial<Issue>) => void;
  onPostHashtagSuccess?: (preset: HashtagPreset) => void;
}

export function TechnicianInvestigationWorkspace({
  issue,
  currentUser,
  onBack,
  onOpenRoom,
  onUpdateIssue,
  onPostHashtagSuccess
}: TechnicianInvestigationWorkspaceProps) {
  // Step indicator: 1 = Investigate (Screen 39), 2 = Solution (Screen 40), 3 = Post (Screen 41)
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [environment, setEnvironment] = useState<'SANDBOX' | 'STAGING' | 'PRODUCTION'>(
    issue.stagedEnvironment || 'SANDBOX'
  );

  const issueRef = issue.id.startsWith('ISS-') ? issue.id : `ISS-${issue.id.slice(0, 4)}`;

  // -------------------------------------------------------------------------
  // LEVEL 1: Flagged rows data & pagination (User rule: pagination > scroll)
  // -------------------------------------------------------------------------
  const flaggedRows = useMemo(() => {
    if (issue.firstLevelMappedData && issue.firstLevelMappedData.length > 0) {
      return issue.firstLevelMappedData;
    }
    return [
      { transaction: 'TXN-9001', uploaded: '1,500.00', database: '1,450.00' },
      { transaction: 'TXN-9013', uploaded: '820.00', database: '800.00' },
      { transaction: 'TXN-9027', uploaded: '2,010.50', database: '2,000.00' },
      { transaction: 'TXN-9031', uploaded: '640.00', database: '600.00' },
      { transaction: 'TXN-9044', uploaded: '95.00', database: '90.00' },
      { transaction: 'TXN-9052', uploaded: '340.00', database: '300.00' },
      { transaction: 'TXN-9065', uploaded: '1,120.00', database: '1,100.00' },
      { transaction: 'TXN-9071', uploaded: '560.00', database: '520.00' },
      { transaction: 'TXN-9088', uploaded: '780.00', database: '750.00' },
      { transaction: 'TXN-9099', uploaded: '430.00', database: '400.00' },
      { transaction: 'TXN-9104', uploaded: '990.00', database: '950.00' },
      { transaction: 'TXN-9118', uploaded: '1,800.00', database: '1,760.00' },
      { transaction: 'TXN-9122', uploaded: '210.00', database: '190.00' },
      { transaction: 'TXN-9135', uploaded: '670.00', database: '640.00' },
      { transaction: 'TXN-9149', uploaded: '890.00', database: '850.00' },
      { transaction: 'TXN-9154', uploaded: '1,340.00', database: '1,300.00' },
      { transaction: 'TXN-9160', uploaded: '450.00', database: '420.00' },
      { transaction: 'TXN-9175', uploaded: '2,500.00', database: '2,460.00' },
      { transaction: 'TXN-9189', uploaded: '710.00', database: '680.00' },
      { transaction: 'TXN-9192', uploaded: '315.00', database: '300.00' },
      { transaction: 'TXN-9201', uploaded: '840.00', database: '800.00' },
      { transaction: 'TXN-9214', uploaded: '1,650.00', database: '1,610.00' },
      { transaction: 'TXN-9220', uploaded: '590.00', database: '550.00' },
      { transaction: 'TXN-9233', uploaded: '420.00', database: '380.00' }
    ];
  }, [issue.firstLevelMappedData]);

  const [lvl1Page, setLvl1Page] = useState(1);
  const lvl1PageSize = 5;
  const lvl1TotalPages = Math.ceil(flaggedRows.length / lvl1PageSize);
  const lvl1VisibleRows = useMemo(() => {
    const start = (lvl1Page - 1) * lvl1PageSize;
    return flaggedRows.slice(start, start + lvl1PageSize);
  }, [flaggedRows, lvl1Page]);

  // -------------------------------------------------------------------------
  // LEVEL 2 (Step 1): SQL Editor, Query Execution & Results pagination
  // -------------------------------------------------------------------------
  const [sqlQuery, setSqlQuery] = useState(
    `SELECT s.refnum, s.reqamt, s.conamt, (s.conamt - s.reqamt) AS diff\nFROM sv_fin_tab s\nWHERE s.refnum IN (flagged_rows)\nAND ABS(s.conamt - s.reqamt) > 0;`
  );
  const [whatYouFound, setWhatYouFound] = useState(
    issue.findingsNotes || 'All 24 differences are under 50.00 and match fee rounding on the switch side.'
  );

  const rawQueryResults = useMemo(() => [
    { refnum: '826415297741', reqamt: '1,500.00', conamt: '1,450.00', diff: '-50.00' },
    { refnum: '826415297790', reqamt: '820.00', conamt: '800.00', diff: '-20.00' },
    { refnum: '826415297802', reqamt: '2,010.50', conamt: '2,000.00', diff: '-10.50' },
    { refnum: '826415297815', reqamt: '640.00', conamt: '600.00', diff: '-40.00' },
    { refnum: '826415297829', reqamt: '95.00', conamt: '90.00', diff: '-5.00' },
    { refnum: '826415297833', reqamt: '340.00', conamt: '300.00', diff: '-40.00' },
    { refnum: '826415297841', reqamt: '1,120.00', conamt: '1,100.00', diff: '-20.00' },
    { refnum: '826415297855', reqamt: '560.00', conamt: '520.00', diff: '-40.00' },
    { refnum: '826415297862', reqamt: '780.00', conamt: '750.00', diff: '-30.00' },
    { refnum: '826415297879', reqamt: '430.00', conamt: '400.00', diff: '-30.00' },
    { refnum: '826415297884', reqamt: '990.00', conamt: '950.00', diff: '-40.00' },
    { refnum: '826415297891', reqamt: '1,800.00', conamt: '1,760.00', diff: '-40.00' },
    { refnum: '826415297902', reqamt: '210.00', conamt: '190.00', diff: '-20.00' },
    { refnum: '826415297918', reqamt: '670.00', conamt: '640.00', diff: '-30.00' },
    { refnum: '826415297925', reqamt: '890.00', conamt: '850.00', diff: '-40.00' },
    { refnum: '826415297939', reqamt: '1,340.00', conamt: '1,300.00', diff: '-40.00' },
    { refnum: '826415297944', reqamt: '450.00', conamt: '420.00', diff: '-30.00' },
    { refnum: '826415297951', reqamt: '2,500.00', conamt: '2,460.00', diff: '-40.00' },
    { refnum: '826415297968', reqamt: '710.00', conamt: '680.00', diff: '-30.00' },
    { refnum: '826415297972', reqamt: '315.00', conamt: '300.00', diff: '-15.00' },
    { refnum: '826415297985', reqamt: '840.00', conamt: '800.00', diff: '-40.00' },
    { refnum: '826415297990', reqamt: '1,650.00', conamt: '1,610.00', diff: '-40.00' },
    { refnum: '826415298001', reqamt: '590.00', conamt: '550.00', diff: '-40.00' },
    { refnum: '826415298014', reqamt: '420.00', conamt: '380.00', diff: '-40.00' }
  ], []);

  const [resPage, setResPage] = useState(1);
  const resPageSize = 4;
  const resTotalPages = Math.ceil(rawQueryResults.length / resPageSize);
  const visibleQueryResults = useMemo(() => {
    const start = (resPage - 1) * resPageSize;
    return rawQueryResults.slice(start, start + resPageSize);
  }, [rawQueryResults, resPage]);

  // -------------------------------------------------------------------------
  // LEVEL 2 (Step 2): Solution Script, Dry-Run & Pagination
  // -------------------------------------------------------------------------
  const [solutionType, setSolutionType] = useState<'TEMPORARY' | 'SYSTEM_FIX'>('TEMPORARY');
  const [solutionScript, setSolutionScript] = useState(
    issue.solutionScript ||
    `UPDATE sv_fin_tab\nSET conamt = {{Amount}}, resolution_code = 'FEE_ROUNDING_FIX'\nWHERE refnum = '{{Refnum}}'\nAND ABS(conamt - {{Amount}}) <= 50.00;`
  );

  const dryRunRows = useMemo(() => [
    { refnum: '826415297741', before: '1,450.00', after: '1,500.00' },
    { refnum: '826415297790', before: '800.00', after: '820.00' },
    { refnum: '826415297802', before: '2,000.00', after: '2,010.50' },
    { refnum: '826415297815', before: '600.00', after: '640.00' },
    { refnum: '826415297829', before: '90.00', after: '95.00' },
    { refnum: '826415297833', before: '300.00', after: '340.00' },
    { refnum: '826415297841', before: '1,100.00', after: '1,120.00' },
    { refnum: '826415297855', before: '520.00', after: '560.00' },
    { refnum: '826415297862', before: '750.00', after: '780.00' },
    { refnum: '826415297879', before: '400.00', after: '430.00' },
    { refnum: '826415297884', before: '950.00', after: '990.00' },
    { refnum: '826415297891', before: '1,760.00', after: '1,800.00' },
    { refnum: '826415297902', before: '190.00', after: '210.00' },
    { refnum: '826415297918', before: '640.00', after: '670.00' },
    { refnum: '826415297925', before: '850.00', after: '890.00' },
    { refnum: '826415297939', before: '1,300.00', after: '1,340.00' },
    { refnum: '826415297944', before: '420.00', after: '450.00' },
    { refnum: '826415297951', before: '2,460.00', after: '2,500.00' },
    { refnum: '826415297968', before: '680.00', after: '710.00' },
    { refnum: '826415297972', before: '300.00', after: '315.00' },
    { refnum: '826415297985', before: '800.00', after: '840.00' },
    { refnum: '826415297990', before: '1,610.00', after: '1,650.00' },
    { refnum: '826415298001', before: '550.00', after: '590.00' },
    { refnum: '826415298014', before: '380.00', after: '420.00' }
  ], []);

  const [dryPage, setDryPage] = useState(1);
  const dryPageSize = 3;
  const dryTotalPages = Math.ceil(dryRunRows.length / dryPageSize);
  const visibleDryRows = useMemo(() => {
    const start = (dryPage - 1) * dryPageSize;
    return dryRunRows.slice(start, start + dryPageSize);
  }, [dryRunRows, dryPage]);

  // Modal State
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);

  const insertToken = (token: string) => {
    setSolutionScript(prev => `${prev} {{${token}}}`);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 text-slate-800" style={{ zoom: 0.85 }}>
      {/* Top Breadcrumb & Title Bar matching 39_case_two_levels_investigate.png */}
      <div className="px-8 pt-5 pb-3 bg-white border-b border-slate-200/80 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 text-xs text-slate-500">
              <span className="hover:text-slate-700 cursor-pointer" onClick={onBack}>Collaborate</span>
              <span>/</span>
              <span className="text-slate-800 font-medium">{issueRef} workspace</span>
            </div>

            {/* Badges row */}
            <div className="flex items-center space-x-2 mt-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200/60 flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                <span>Staged by you</span>
              </span>
              <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                {issueRef}
              </span>
              <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                Environment: {environment === 'SANDBOX' ? 'Sandbox' : environment}
              </span>
            </div>

            <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">
              {issue.title || 'trn test'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Escalated from Card Disputes & Chargebacks Unit · respond by 11:17 · resolve by tomorrow 10:52
            </p>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={() => {
                if (onOpenRoom) onOpenRoom();
                else onBack();
              }}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer shadow-2xs"
            >
              <MessageSquare size={13} className="text-slate-500" />
              <span>Room</span>
            </button>
            <button
              type="button"
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer shadow-2xs"
            >
              <Shield size={13} className="text-slate-500" />
              <span>Agreement</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Two-Card Content */}
      <div className="flex-1 p-6 overflow-hidden flex space-x-5 min-h-0">
        {/* =================================================================== */}
        {/* LEFT CARD: LEVEL 1 · Case as received (Read-only baseline)           */}
        {/* =================================================================== */}
        <div className="w-[340px] xl:w-[380px] bg-white border border-slate-200/90 rounded-2xl shadow-sm flex flex-col overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <span className="text-[11px] font-bold text-orange-600 tracking-wider uppercase block">
                LEVEL 1
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Case as received
              </h2>
            </div>
            <span className="px-2.5 py-0.5 bg-slate-100 text-slate-500 text-[11px] font-medium rounded-full flex items-center space-x-1">
              <Lock size={11} />
              <span>Read only</span>
            </span>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between overflow-hidden text-xs">
            {/* 4 Metadata rows matching 39_case_two_levels_investigate.png */}
            <div className="space-y-3.5">
              <div className="flex items-start space-x-2.5">
                <FileText size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 text-xs">Ingestion</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    clearing_batch_feed.xlsx · 500 rows · 5 cleaning steps
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-2.5">
                <Database size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 text-xs">Data mapping</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    mirror_ftp_aib___unsettled_xls · 5 of 6 mapped
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-2.5">
                <GitBranch size={15} className="text-teal-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 text-xs">Validation workflow</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    New Validation Pipeline v3 · 24 of 500 flagged
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-2.5">
                <Flag size={15} className="text-teal-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 text-xs">Escalation</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    From Card Disputes · respond 4h, resolve 24h
                  </div>
                </div>
              </div>
            </div>

            {/* Flagged Transactions Table with PAGINATION (No vertical scroll!) */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col flex-1 min-h-0">
              <div className="flex items-center space-x-2 mb-2 shrink-0">
                <span className="font-bold text-slate-900 text-xs">Flagged transactions</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                  {flaggedRows.length}
                </span>
              </div>

              <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white flex flex-col flex-1 min-h-0">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold text-[11px]">
                      <th className="py-2 px-3 font-medium">Transaction</th>
                      <th className="py-2 px-3 font-medium text-right">Uploaded</th>
                      <th className="py-2 px-3 font-medium text-right">Database</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {lvl1VisibleRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-bold text-slate-800">{row.transaction}</td>
                        <td className="py-2 px-3 text-right text-slate-900">{row.uploaded}</td>
                        <td className="py-2 px-3 text-right text-rose-600 font-bold">{row.database}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Clean Pagination Footer */}
                <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 mt-auto shrink-0">
                  <span>
                    {(lvl1Page - 1) * lvl1PageSize + 1}–{Math.min(lvl1Page * lvl1PageSize, flaggedRows.length)} of {flaggedRows.length}
                  </span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      disabled={lvl1Page <= 1}
                      onClick={() => setLvl1Page(p => Math.max(1, p - 1))}
                      className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    <span className="font-semibold px-1">{lvl1Page} / {lvl1TotalPages}</span>
                    <button
                      type="button"
                      disabled={lvl1Page >= lvl1TotalPages}
                      onClick={() => setLvl1Page(p => Math.min(lvl1TotalPages, p + 1))}
                      className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* RIGHT CARD: LEVEL 2 · Your workspace                                */}
        {/* =================================================================== */}
        <div className="flex-1 bg-white border border-slate-200/90 rounded-2xl shadow-sm flex flex-col overflow-hidden min-w-0">
          {/* Header matching Screen 39 & Screen 40 */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <span className="text-[11px] font-bold text-orange-600 tracking-wider uppercase block">
                LEVEL 2
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Your workspace
              </h2>
            </div>

            {/* 3 Steps indicator matching designs */}
            <div className="flex items-center space-x-4 text-xs font-semibold">
              {/* Step 1 */}
              <div 
                onClick={() => setCurrentStep(1)}
                className={`flex items-center space-x-1.5 cursor-pointer ${
                  currentStep === 1 ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                  currentStep === 1 ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  1
                </span>
                <span>Investigate</span>
              </div>

              {/* Step 2 */}
              <div 
                onClick={() => setCurrentStep(2)}
                className={`flex items-center space-x-1.5 cursor-pointer ${
                  currentStep === 2 ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                  currentStep === 2 ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  2
                </span>
                <span>Solution</span>
              </div>

              {/* Step 3 (Post) */}
              <div 
                onClick={() => setIsPostModalOpen(true)}
                className="flex items-center space-x-1.5 cursor-pointer text-slate-400 hover:text-slate-600"
              >
                <span className="w-5 h-5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-600 flex items-center justify-center">
                  3
                </span>
                <span>Post</span>
              </div>
            </div>
          </div>

          {/* --------------------------------------------------------------- */}
          {/* STEP 1: INVESTIGATION (Screen 39)                                */}
          {/* --------------------------------------------------------------- */}
          {currentStep === 1 && (
            <div className="p-6 flex-1 flex flex-col justify-between overflow-hidden text-xs">
              <div className="space-y-4 flex-1 flex flex-col overflow-hidden min-h-0">
                {/* Environment Selector 3 Cards */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                    Environment
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {/* Sandbox */}
                    <div 
                      onClick={() => setEnvironment('SANDBOX')}
                      className={`p-3 rounded-xl border-2 transition cursor-pointer relative ${
                        environment === 'SANDBOX' 
                          ? 'border-orange-500 bg-white shadow-2xs' 
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-xs">Sandbox</span>
                        {environment === 'SANDBOX' && <Check size={14} className="text-orange-500 stroke-[3]" />}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">Private copy of the data. Safe to change.</p>
                    </div>

                    {/* Staging */}
                    <div 
                      onClick={() => setEnvironment('STAGING')}
                      className={`p-3 rounded-xl border transition cursor-pointer relative ${
                        environment === 'STAGING' 
                          ? 'border-orange-500 bg-white shadow-2xs' 
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-xs">Staging</span>
                        {environment === 'STAGING' && <Check size={14} className="text-orange-500 stroke-[3]" />}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">Dry run on the live structure.</p>
                    </div>

                    {/* Production */}
                    <div 
                      onClick={() => setEnvironment('PRODUCTION')}
                      className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/60 cursor-pointer relative flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-700 text-xs">Production</span>
                        <Lock size={13} className="text-slate-400" />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">Needs checker approval.</p>
                    </div>
                  </div>
                </div>

                {/* Sub-toolbar row */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                      Sett · MySQL
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                      Sandbox copy
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-500">
                      SELECT only until you post
                    </span>
                  </div>

                  <button
                    type="button"
                    className="px-3.5 py-1.5 bg-[#0F172B] hover:bg-slate-800 text-white rounded-lg font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5 shadow-2xs"
                  >
                    <Play size={12} className="fill-white" />
                    <span>Run query</span>
                  </button>
                </div>

                {/* Dark Code Editor */}
                <div className="bg-[#0B1120] rounded-xl p-3.5 font-mono text-xs text-white border border-slate-800 shadow-inner shrink-0">
                  <div className="flex space-x-3">
                    <div className="text-slate-500 select-none text-right pr-2 border-r border-slate-800 space-y-1">
                      <div>1</div>
                      <div>2</div>
                      <div>3</div>
                      <div>4</div>
                    </div>
                    <textarea
                      rows={4}
                      value={sqlQuery}
                      onChange={(e) => setSqlQuery(e.target.value)}
                      className="w-full bg-transparent text-slate-200 font-mono text-xs focus:outline-none resize-none leading-relaxed"
                    />
                  </div>
                </div>

                {/* Results Section with PAGINATION */}
                <div className="flex flex-col flex-1 min-h-0 border border-slate-200/80 rounded-xl overflow-hidden bg-white">
                  <div className="px-4 py-2 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between shrink-0">
                    <span className="font-bold text-slate-900 text-xs">Results</span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {rawQueryResults.length} rows · 21 ms · sandbox
                    </span>
                  </div>

                  <table className="w-full text-left text-xs border-collapse font-mono">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-medium text-[11px]">
                        <th className="py-2 px-4">refnum</th>
                        <th className="py-2 px-4 text-right">reqamt</th>
                        <th className="py-2 px-4 text-right">conamt</th>
                        <th className="py-2 px-4 text-right">diff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px]">
                      {visibleQueryResults.map((r, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2 px-4 text-slate-800">{r.refnum}</td>
                          <td className="py-2 px-4 text-right text-slate-900">{r.reqamt}</td>
                          <td className="py-2 px-4 text-right text-slate-900">{r.conamt}</td>
                          <td className="py-2 px-4 text-right text-rose-600 font-bold">{r.diff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Clean Pagination Footer */}
                  <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 mt-auto shrink-0">
                    <span>
                      Showing {(resPage - 1) * resPageSize + 1}–{Math.min(resPage * resPageSize, rawQueryResults.length)} of {rawQueryResults.length}
                    </span>
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        disabled={resPage <= 1}
                        onClick={() => setResPage(p => Math.max(1, p - 1))}
                        className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <ChevronLeft size={13} />
                      </button>
                      <span className="font-semibold px-1">{resPage} / {resTotalPages}</span>
                      <button
                        type="button"
                        disabled={resPage >= resTotalPages}
                        onClick={() => setResPage(p => Math.min(resTotalPages, p + 1))}
                        className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* What you found Box */}
                <div className="shrink-0">
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    What you found
                  </label>
                  <textarea
                    rows={2}
                    value={whatYouFound}
                    onChange={(e) => setWhatYouFound(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-slate-300"
                  />
                </div>
              </div>

              {/* Bottom Continue Button */}
              <div className="pt-4 flex justify-end shrink-0 border-t border-slate-100">
                <button
                  type="button"
                  id="btn-continue-to-solution"
                  onClick={() => setCurrentStep(2)}
                  className="px-5 py-2 bg-[#0F172B] hover:bg-slate-800 text-white rounded-xl font-semibold text-xs shadow-xs transition cursor-pointer flex items-center space-x-1.5"
                >
                  <span>Continue to solution</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* --------------------------------------------------------------- */}
          {/* STEP 2: SOLUTION SCRIPT & DRY RUN (Screen 40)                    */}
          {/* --------------------------------------------------------------- */}
          {currentStep === 2 && (
            <div className="p-6 flex-1 flex flex-col justify-between overflow-hidden text-xs">
              <div className="space-y-4 flex-1 flex flex-col overflow-hidden min-h-0">
                {/* Solution type selector 2 Cards */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                    Solution type
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Temporary solution */}
                    <div 
                      onClick={() => setSolutionType('TEMPORARY')}
                      className={`p-3.5 rounded-xl border-2 transition cursor-pointer relative ${
                        solutionType === 'TEMPORARY' 
                          ? 'border-orange-500 bg-white shadow-2xs' 
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-xs">Temporary solution</span>
                        {solutionType === 'TEMPORARY' && <Check size={14} className="text-orange-500 stroke-[3]" />}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Fixes the rows with a script. Expires in 30 days or when a system fix lands.
                      </p>
                    </div>

                    {/* System fix */}
                    <div 
                      onClick={() => setSolutionType('SYSTEM_FIX')}
                      className={`p-3.5 rounded-xl border transition cursor-pointer relative ${
                        solutionType === 'SYSTEM_FIX' 
                          ? 'border-orange-500 bg-white shadow-2xs' 
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-xs">System fix</span>
                        {solutionType === 'SYSTEM_FIX' && <Check size={14} className="text-orange-500 stroke-[3]" />}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Raises a change request to the owning system and tracks it until verified.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Split Row: Script (Left) vs Dry Run (Right) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
                  {/* Left: Solution Script with tokens */}
                  <div className="flex flex-col space-y-2 min-h-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">Solution script</span>
                      <span className="text-[11px] text-slate-400">Placeholders fill from the mapped columns</span>
                    </div>

                    <div className="bg-[#0B1120] rounded-xl p-3.5 font-mono text-xs text-white border border-slate-800 shadow-inner flex-1 flex space-x-3 overflow-hidden">
                      <div className="text-slate-500 select-none text-right pr-2 border-r border-slate-800 space-y-1">
                        <div>1</div>
                        <div>2</div>
                        <div>3</div>
                        <div>4</div>
                      </div>
                      <textarea
                        value={solutionScript}
                        onChange={(e) => setSolutionScript(e.target.value)}
                        className="w-full bg-transparent text-slate-200 font-mono text-xs focus:outline-none resize-none leading-relaxed"
                      />
                    </div>

                    {/* Token chips */}
                    <div className="flex items-center space-x-2 pt-1">
                      {['Amount', 'Refnum', 'Transaction_ID'].map(token => (
                        <button
                          key={token}
                          type="button"
                          onClick={() => insertToken(token)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg font-mono transition cursor-pointer"
                        >
                          {`{{${token}}}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right: Dry run in sandbox with PAGINATION */}
                  <div className="flex flex-col space-y-2 min-h-0">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">Dry run in sandbox</span>
                      <button
                        type="button"
                        className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center space-x-1 cursor-pointer"
                      >
                        <RotateCcw size={12} />
                        <span>Run again</span>
                      </button>
                    </div>

                    {/* Green notification banner */}
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200/80 rounded-xl text-emerald-800 text-xs font-semibold flex items-center space-x-2">
                      <CheckCircle2 size={15} className="text-emerald-600" />
                      <span>24 rows would change · 0 errors</span>
                    </div>

                    {/* Diff Table with PAGINATION */}
                    <div className="border border-slate-200/80 rounded-xl overflow-hidden bg-white flex flex-col flex-1 min-h-0">
                      <table className="w-full text-left text-xs border-collapse font-mono">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-400 font-medium text-[11px]">
                            <th className="py-2 px-3">refnum</th>
                            <th className="py-2 px-3 text-right">Before</th>
                            <th className="py-2 px-3 text-right">After</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-[11px]">
                          {visibleDryRows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="py-2 px-3 text-slate-800">{row.refnum}</td>
                              <td className="py-2 px-3 text-right text-rose-600 font-bold">{row.before}</td>
                              <td className="py-2 px-3 text-right text-emerald-600 font-bold">{row.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Clean Pagination Footer */}
                      <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 mt-auto shrink-0">
                        <span>
                          {(dryPage - 1) * dryPageSize + 1}–{Math.min(dryPage * dryPageSize, dryRunRows.length)} of {dryRunRows.length}
                        </span>
                        <div className="flex items-center space-x-1">
                          <button
                            type="button"
                            disabled={dryPage <= 1}
                            onClick={() => setDryPage(p => Math.max(1, p - 1))}
                            className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <ChevronLeft size={13} />
                          </button>
                          <span className="font-semibold px-1">{dryPage} / {dryTotalPages}</span>
                          <button
                            type="button"
                            disabled={dryPage >= dryTotalPages}
                            onClick={() => setDryPage(p => Math.min(dryTotalPages, p + 1))}
                            className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <ChevronRight size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Before you post Card */}
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 shrink-0">
                  <h4 className="font-bold text-slate-900 text-xs">Before you post</h4>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center space-x-2 text-slate-700">
                      <CheckCircle2 size={15} className="text-emerald-600" />
                      <span>Sandbox dry run passed</span>
                    </div>
                    <div className="flex items-center space-x-2 text-slate-700">
                      <CheckCircle2 size={15} className="text-emerald-600" />
                      <span>Rollback snapshot saved</span>
                    </div>
                    <div className="flex items-center space-x-2 text-slate-500">
                      <Clock size={15} className="text-slate-400" />
                      <span>Checker approval before production (@checker_ops_2)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-4 flex items-center justify-between shrink-0 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs transition cursor-pointer"
                >
                  &lt; Back to investigate
                </button>

                <button
                  type="button"
                  id="btn-post-as-hashtag"
                  onClick={() => setIsPostModalOpen(true)}
                  className="px-5 py-2 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl font-semibold text-xs shadow-xs transition cursor-pointer flex items-center space-x-1.5"
                >
                  <span>Post as hashtag</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Screen 41 Post as Hashtag Modal */}
      <PostAsHashtagModal
        isOpen={isPostModalOpen}
        onClose={() => setIsPostModalOpen(false)}
        issue={issue}
        solutionScript={solutionScript}
        solutionType={solutionType}
        currentUser={currentUser}
        onPosted={(preset) => {
          setIsPostModalOpen(false);
          if (onPostHashtagSuccess) onPostHashtagSuccess(preset);
        }}
      />
    </div>
  );
}

export default TechnicianInvestigationWorkspace;
