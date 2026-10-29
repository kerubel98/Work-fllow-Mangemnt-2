/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { 
  Lock, CheckCircle2, ChevronRight, ChevronLeft, 
  ArrowRight, ShieldCheck, Clock
} from 'lucide-react';

interface TeamHashtagReportsTabProps {
  teamId: string;
  teamName: string;
  currentUser?: any;
}

export function TeamHashtagReportsTab(props: TeamHashtagReportsTabProps) {
  return (
    <ErrorBoundary fallbackTitle="Hashtag Analytics & Reports Error" fallbackMessage="Could not load team hashtag performance reports.">
      <TeamHashtagReportsContent {...props} />
    </ErrorBoundary>
  );
}

function TeamHashtagReportsContent({ teamId, teamName, currentUser }: TeamHashtagReportsTabProps) {
  const [filterType, setFilterType] = useState<'ALL' | 'FILE_INGESTION' | 'DB_SCANNER'>('ALL');
  const [isChangeModalOpen, setIsChangeModalOpen] = useState(false);
  const [changeNotes, setChangeNotes] = useState('');
  const [changeSuccess, setChangeSuccess] = useState(false);

  // Hashtag Velocity & SLA table data matching 43_hashtag_team_report.png
  const hashtagVelocityRows = useMemo(() => [
    {
      hashtag: '#SETTLEMENT_AMOUNT_ROUNDING',
      type: 'Temporary',
      owner: '@samuel_tech',
      ownerInitials: 'SA',
      runs: 18,
      volume: 312,
      anomalies: 23,
      mttr: '1.8h',
      lastRun: '24 Oct 14:03'
    },
    {
      hashtag: '#CBE_ACCOUNT_LOOKUP_FIX',
      type: 'Temporary',
      owner: '@samuel_tech',
      ownerInitials: 'SA',
      runs: 45,
      volume: 890,
      anomalies: 12,
      mttr: '1.2h',
      lastRun: '24 Oct 13:50'
    },
    {
      hashtag: '#AIB_ISO_DECLINE_REMAP',
      type: 'Temporary',
      owner: '@samuel_tech',
      ownerInitials: 'SA',
      runs: 62,
      volume: 1240,
      anomalies: 34,
      mttr: '0.9h',
      lastRun: '24 Oct 11:20'
    }
  ], []);

  // Filtered rows
  const filteredHashtags = useMemo(() => {
    if (filterType === 'ALL') return hashtagVelocityRows;
    return hashtagVelocityRows;
  }, [hashtagVelocityRows, filterType]);

  // Clean Pagination state (User Rule: pagination over vertical scroll)
  const [htPage, setHtPage] = useState(1);
  const htPageSize = 2;
  const htTotalPages = Math.ceil(filteredHashtags.length / htPageSize);
  const visibleHashtags = useMemo(() => {
    const start = (htPage - 1) * htPageSize;
    return filteredHashtags.slice(start, start + htPageSize);
  }, [filteredHashtags, htPage]);

  // Escalation agreement terms matching 43_hashtag_team_report.png
  const agreementTerms = useMemo(() => [
    {
      term: 'Time to first response',
      target: '4 hours',
      actual: '1h 12m',
      progressPct: 30,
      progressColor: 'bg-emerald-500',
      status: 'Met',
      statusBadge: 'bg-emerald-50 text-emerald-700'
    },
    {
      term: 'Resolution target',
      target: '24 hours',
      actual: '6h elapsed',
      progressPct: 25,
      progressColor: 'bg-orange-500',
      status: 'Running',
      statusBadge: 'bg-orange-50 text-orange-700'
    },
    {
      term: 'Accuracy of fixes',
      target: '99%',
      actual: '99.2%',
      progressPct: 99,
      progressColor: 'bg-emerald-500',
      status: 'Met',
      statusBadge: 'bg-emerald-50 text-emerald-700'
    }
  ], []);

  const [agrPage, setAgrPage] = useState(1);
  const agrPageSize = 3;
  const agrTotalPages = Math.ceil(agreementTerms.length / agrPageSize);
  const visibleAgreementTerms = useMemo(() => {
    const start = (agrPage - 1) * agrPageSize;
    return agreementTerms.slice(start, start + agrPageSize);
  }, [agreementTerms, agrPage]);

  const handleSendChangeRequest = () => {
    setChangeSuccess(true);
    setTimeout(() => {
      setChangeSuccess(false);
      setIsChangeModalOpen(false);
      setChangeNotes('');
    }, 1500);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden text-slate-800 text-xs space-y-4" style={{ zoom: 0.85 }}>
      {/* Lock Banner matching 43_hashtag_team_report.png */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-3.5 px-4 shadow-2xs flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2 text-slate-700 text-xs">
          <Lock size={14} className="text-slate-400 shrink-0" />
          <span>
            <strong>#SETTLEMENT_AMOUNT_ROUNDING</strong> from Core Operations reports to your team. Only its owner, @samuel_tech, can change it.
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsChangeModalOpen(true)}
          className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs transition cursor-pointer shrink-0"
        >
          Request a change
        </button>
      </div>

      {/* 4 Metric Cards matching 43_hashtag_team_report.png */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-1">
          <span className="text-xs font-semibold text-slate-500">Executed runs</span>
          <div className="text-3xl font-bold text-slate-900">18</div>
          <p className="text-[11px] text-slate-400">Automated pipeline triggers</p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-1">
          <span className="text-xs font-semibold text-slate-500">Rows scanned</span>
          <div className="text-3xl font-bold text-slate-900">312</div>
          <p className="text-[11px] text-slate-400">23 anomalies flagged</p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-1">
          <span className="text-xs font-semibold text-slate-500">Mean detection (MTTD)</span>
          <div className="text-3xl font-bold text-slate-900">0.4h</div>
          <p className="text-[11px] text-slate-400">Time from issue to detection</p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-1">
          <span className="text-xs font-semibold text-slate-500">Mean remediation (MTTR)</span>
          <div className="text-3xl font-bold text-slate-900">1.8h</div>
          <p className="text-[11px] text-slate-400">Detection to fixed</p>
        </div>
      </div>

      {/* Section 1: Hashtag velocity & SLA table with PAGINATION */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-2xs flex flex-col shrink-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-sm text-slate-900">Hashtag velocity & SLA</h3>

          {/* Filter Pills */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => { setFilterType('ALL'); setHtPage(1); }}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                filterType === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => { setFilterType('FILE_INGESTION'); setHtPage(1); }}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                filterType === 'FILE_INGESTION' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              File Ingestion
            </button>
            <button
              type="button"
              onClick={() => { setFilterType('DB_SCANNER'); setHtPage(1); }}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                filterType === 'DB_SCANNER' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              DB scanner
            </button>
          </div>
        </div>

        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400 font-medium text-[11px]">
              <th className="py-2.5 px-5">Hashtag</th>
              <th className="py-2.5 px-5">Owner</th>
              <th className="py-2.5 px-5 text-right">Runs</th>
              <th className="py-2.5 px-5 text-right">Volume</th>
              <th className="py-2.5 px-5 text-right">Anomalies</th>
              <th className="py-2.5 px-5 text-right">MTTR</th>
              <th className="py-2.5 px-5">Last run</th>
              <th className="py-2.5 px-5 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-[11px]">
            {visibleHashtags.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50">
                <td className="py-3 px-5">
                  <div className="font-bold font-mono text-slate-900">{row.hashtag}</div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-700">
                    {row.type}
                  </span>
                </td>
                <td className="py-3 px-5">
                  <div className="flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center">
                      {row.ownerInitials}
                    </span>
                    <span className="font-medium text-slate-800">{row.owner}</span>
                  </div>
                </td>
                <td className="py-3 px-5 text-right font-semibold text-slate-800">{row.runs}</td>
                <td className="py-3 px-5 text-right font-semibold text-slate-800">{row.volume}</td>
                <td className="py-3 px-5 text-right font-semibold text-slate-800">{row.anomalies}</td>
                <td className="py-3 px-5 text-right font-semibold text-slate-800">{row.mttr}</td>
                <td className="py-3 px-5 text-slate-500">{row.lastRun}</td>
                <td className="py-3 px-5 text-right">
                  <span className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-[11px] font-medium inline-flex items-center space-x-1">
                    <Lock size={11} />
                    <span>View only</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Clean Pagination Footer */}
        <div className="px-5 py-2.5 border-t border-slate-100 bg-white flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>
            Showing {(htPage - 1) * htPageSize + 1}–{Math.min(htPage * htPageSize, filteredHashtags.length)} of {filteredHashtags.length}
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={htPage <= 1}
              onClick={() => setHtPage(p => Math.max(1, p - 1))}
              className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="font-semibold text-slate-700">{htPage} / {htTotalPages}</span>
            <button
              type="button"
              disabled={htPage >= htTotalPages}
              onClick={() => setHtPage(p => Math.min(htTotalPages, p + 1))}
              className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Section 2: Escalation agreement · ISS-3854 table with PAGINATION */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-2xs flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-sm text-slate-900">Escalation agreement · ISS-3854</h3>
          <button
            type="button"
            className="text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center space-x-1 cursor-pointer"
          >
            <span>Open agreement</span>
            <ArrowRight size={13} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col justify-between">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-medium text-[11px]">
                <th className="py-2.5 px-5">Term</th>
                <th className="py-2.5 px-5">Target</th>
                <th className="py-2.5 px-5">Actual</th>
                <th className="py-2.5 px-5 w-48">Progress</th>
                <th className="py-2.5 px-5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-[11px]">
              {visibleAgreementTerms.map((term, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="py-3 px-5 font-semibold text-slate-900">{term.term}</td>
                  <td className="py-3 px-5 text-slate-700">{term.target}</td>
                  <td className="py-3 px-5 text-slate-700 font-medium">{term.actual}</td>
                  <td className="py-3 px-5">
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-full ${term.progressColor}`} style={{ width: `${term.progressPct}%` }} />
                    </div>
                  </td>
                  <td className="py-3 px-5 text-right">
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${term.statusBadge}`}>
                      {term.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Clean Pagination Footer */}
          <div className="px-5 py-2.5 border-t border-slate-100 bg-white flex items-center justify-between text-xs text-slate-500 shrink-0">
            <span>
              Showing {(agrPage - 1) * agrPageSize + 1}–{Math.min(agrPage * agrPageSize, agreementTerms.length)} of {agreementTerms.length}
            </span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                disabled={agrPage <= 1}
                onClick={() => setAgrPage(p => Math.max(1, p - 1))}
                className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="font-semibold text-slate-700">{agrPage} / {agrTotalPages}</span>
              <button
                type="button"
                disabled={agrPage >= agrTotalPages}
                onClick={() => setAgrPage(p => Math.min(agrTotalPages, p + 1))}
                className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Request a Change Modal */}
      {isChangeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div>
              <h3 className="font-bold text-base text-slate-900">Request a Change to #SETTLEMENT_AMOUNT_ROUNDING</h3>
              <p className="text-xs text-slate-500 mt-1">
                Your proposal will be sent directly to @samuel_tech (Technician Owner) and logged in the team audit trail.
              </p>
            </div>

            {changeSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center space-x-2">
                <CheckCircle2 size={15} className="text-emerald-600" />
                <span>Change request submitted to owner successfully!</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Change description / suggested adjustment</label>
              <textarea
                rows={4}
                value={changeNotes}
                onChange={(e) => setChangeNotes(e.target.value)}
                placeholder="e.g. Please update tolerance threshold from 50.00 to 75.00 for new foreign card clearing feed..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-slate-300"
              />
            </div>

            <div className="flex items-center justify-end space-x-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsChangeModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendChangeRequest}
                disabled={!changeNotes.trim() || changeSuccess}
                className="px-5 py-2 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TeamHashtagReportsTab;
