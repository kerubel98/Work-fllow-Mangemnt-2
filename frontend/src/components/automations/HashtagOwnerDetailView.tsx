/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Lock, Edit3, ChevronRight, ChevronLeft, User as UserIcon,
  FileText, Database, GitBranch, Zap, Send, ArrowRight,
  Upload, Search, RefreshCw, CheckCircle2, AlertTriangle, AlertCircle
} from 'lucide-react';
import { HashtagPreset, HashtagCollectedTransaction, User as UserType } from '../../types';
import { api } from '../../api/client';
import { HashtagFileUploadModal } from './HashtagFileUploadModal';

interface HashtagOwnerDetailViewProps {
  hashtagTag: string;
  currentUser?: UserType;
  onBack?: () => void;
  onEditSolution?: () => void;
}

export function HashtagOwnerDetailView({
  hashtagTag,
  currentUser,
  onBack,
  onEditSolution
}: HashtagOwnerDetailViewProps) {
  const cleanTag = hashtagTag?.trim().startsWith('#') 
    ? hashtagTag.trim() 
    : (hashtagTag ? `#${hashtagTag.trim()}` : '#SETTLEMENT_AMOUNT_ROUNDING');

  const [filter, setFilter] = useState<'ALL' | 'FIXED' | 'FAILED' | 'WAITING'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [preset, setPreset] = useState<HashtagPreset | null>(null);
  const [loading, setLoading] = useState(true);

  // Live stats matching Screen 42
  const [stats, setStats] = useState<{ total: number; fixed: number; failed: number; waiting: number }>({
    total: 312,
    fixed: 289,
    failed: 6,
    waiting: 17
  });

  // Collected transactions state
  const [transactions, setTransactions] = useState<{
    id?: string;
    transaction: string;
    caseId: string;
    result: 'Fixed' | 'Failed' | 'Waiting';
    when: string;
    rawPayload?: any;
  }[]>([]);

  // Baseline records for initial baseline
  const baselineTransactions = useMemo(() => [
    { transaction: 'TXN-9001', caseId: 'ISS-3854', result: 'Fixed' as const, when: '23 Oct 11:40' },
    { transaction: 'TXN-9013', caseId: 'ISS-3854', result: 'Fixed' as const, when: '23 Oct 11:40' },
    { transaction: 'TXN-9027', caseId: 'ISS-3854', result: 'Fixed' as const, when: '23 Oct 11:40' },
    { transaction: 'TXN-10412', caseId: 'ISS-4107', result: 'Waiting' as const, when: '24 Oct 09:12' },
    { transaction: 'TXN-10455', caseId: 'ISS-4107', result: 'Failed' as const, when: '24 Oct 09:12' },
    { transaction: 'TXN-10501', caseId: 'ISS-4120', result: 'Fixed' as const, when: '24 Oct 14:03' },
    { transaction: 'TXN-10515', caseId: 'ISS-4120', result: 'Fixed' as const, when: '24 Oct 14:05' },
    { transaction: 'TXN-10522', caseId: 'ISS-4122', result: 'Waiting' as const, when: '24 Oct 14:10' },
    { transaction: 'TXN-10530', caseId: 'ISS-4125', result: 'Failed' as const, when: '24 Oct 14:15' },
    { transaction: 'TXN-10544', caseId: 'ISS-4128', result: 'Fixed' as const, when: '24 Oct 14:22' },
    { transaction: 'TXN-10559', caseId: 'ISS-4130', result: 'Fixed' as const, when: '24 Oct 14:30' },
    { transaction: 'TXN-10568', caseId: 'ISS-4131', result: 'Fixed' as const, when: '24 Oct 14:35' }
  ], []);

  const loadHashtagData = async () => {
    setLoading(true);
    try {
      const [presetRes, collectedRes] = await Promise.allSettled([
        api.getHashtagByTag(cleanTag),
        api.getHashtagCollectedTransactions(cleanTag, 'ALL', 150)
      ]);

      if (presetRes.status === 'fulfilled' && presetRes.value) {
        setPreset(presetRes.value);
      }

      if (collectedRes.status === 'fulfilled' && collectedRes.value) {
        const data = collectedRes.value;
        if (data.stats && (data.stats.total > 0 || data.transactions?.length > 0)) {
          setStats(data.stats);
        }

        if (Array.isArray(data.transactions) && data.transactions.length > 0) {
          const mapped = data.transactions.map((tx: any) => ({
            id: tx.id,
            transaction: tx.transactionKey || tx.id,
            caseId: tx.issueId || 'ISS-3854',
            result: (tx.status === 'FIXED' ? 'Fixed' : tx.status === 'FAILED' ? 'Failed' : 'Waiting') as 'Fixed' | 'Failed' | 'Waiting',
            when: tx.collectedAt ? new Date(tx.collectedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Just now',
            rawPayload: tx.beforePayload
          }));
          setTransactions(mapped);
        } else {
          setTransactions(baselineTransactions);
        }
      } else {
        setTransactions(baselineTransactions);
      }
    } catch (err) {
      console.warn('Error loading hashtag details:', err);
      setTransactions(baselineTransactions);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHashtagData();
  }, [cleanTag]);

  const filteredTransactions = useMemo(() => {
    let list = transactions.length > 0 ? transactions : baselineTransactions;
    if (filter === 'FIXED') list = list.filter(t => t.result === 'Fixed');
    if (filter === 'FAILED') list = list.filter(t => t.result === 'Failed');
    if (filter === 'WAITING') list = list.filter(t => t.result === 'Waiting');
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t => t.transaction.toLowerCase().includes(q) || t.caseId.toLowerCase().includes(q));
    }
    return list;
  }, [transactions, baselineTransactions, filter, searchQuery]);

  // Clean Pagination state (10 rows per page)
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalCount = Math.max(stats.total, filteredTransactions.length);
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));

  const visibleTransactions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, page]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden text-slate-800 text-xs">
      
      {/* Top Breadcrumb & Header matching 42_hashtag_owner_view.png */}
      <div className="px-8 pt-5 pb-4 bg-white border-b border-slate-200/80 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 text-xs text-slate-500">
              <span className="hover:text-slate-700 cursor-pointer" onClick={onBack}>Work</span>
              <span>/</span>
              <span className="text-slate-800 font-medium cursor-pointer" onClick={onBack}>Automations</span>
              <span>/</span>
              <span className="text-slate-900 font-semibold">{cleanTag}</span>
            </div>

            {/* Badges row */}
            <div className="flex items-center space-x-2 mt-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 flex items-center space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Active</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200/60">
                Temporary solution
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 flex items-center space-x-1">
                <UserIcon size={12} className="text-slate-500" />
                <span>Owned by {preset?.author ? `@${preset.author}` : (currentUser?.name ? `@${currentUser.name}` : 'you')}</span>
              </span>
            </div>

            <h1 className="text-2xl font-bold font-mono text-slate-900 mt-1 tracking-tight">
              {cleanTag}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {preset?.description || 'Fixes settlement amount differences under 50.00 caused by fee rounding. Reports to Card Disputes & Chargebacks Unit.'}
            </p>
          </div>

          <div className="flex items-center space-x-2.5">
            {/* Primary Upload & Run Button */}
            <button
              type="button"
              id="btn-hashtag-upload-run"
              onClick={() => setIsUploadModalOpen(true)}
              className="px-4 py-2 bg-[#F27421] hover:bg-[#E06310] text-white rounded-xl text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
            >
              <Upload size={14} />
              <span>Upload & Run File</span>
            </button>

            <button
              type="button"
              className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              <span>Pause</span>
            </button>

            <button
              type="button"
              className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              <span>New version</span>
            </button>

            <button
              type="button"
              onClick={onEditSolution}
              className="px-3.5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer shadow-xs"
            >
              <Edit3 size={13} />
              <span>Edit solution</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 p-6 overflow-hidden flex flex-col space-y-4 min-h-0">
        
        {/* 5-Step Pipeline Strip matching 42_hashtag_owner_view.png */}
        <div className="grid grid-cols-5 gap-3 shrink-0 items-center">
          {/* 1. Ingest */}
          <div className="p-3 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-2xs">
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 text-slate-800 font-bold text-xs">
                <FileText size={13} className="text-slate-400" />
                <span>Ingest</span>
              </div>
              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                {preset?.mappingTemplateName || 'AIB settlement template'}
              </div>
            </div>
            <Lock size={12} className="text-slate-300 shrink-0 ml-1" />
          </div>

          {/* 2. Map */}
          <div className="p-3 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-2xs">
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 text-slate-800 font-bold text-xs">
                <Database size={13} className="text-slate-400" />
                <span>Map</span>
              </div>
              <div className="text-[11px] text-slate-500 truncate mt-0.5">5 of 6 columns</div>
            </div>
            <Lock size={12} className="text-slate-300 shrink-0 ml-1" />
          </div>

          {/* 3. Validate */}
          <div className="p-3 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-2xs">
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 text-slate-800 font-bold text-xs">
                <GitBranch size={13} className="text-slate-400" />
                <span>Validate</span>
              </div>
              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                {preset?.workflowName || 'New Validation Pipeline v3'}
              </div>
            </div>
            <Lock size={12} className="text-slate-300 shrink-0 ml-1" />
          </div>

          {/* 4. Solution (Editable by Owner) */}
          <div className="p-3 bg-white border-2 border-orange-500 rounded-2xl flex items-center justify-between relative shadow-2xs">
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 text-slate-900 font-bold text-xs">
                <Zap size={13} className="text-orange-500" />
                <span>Solution</span>
              </div>
              <div className="text-[11px] text-slate-500 truncate mt-0.5">Temporary · 30 days</div>
            </div>
            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded shrink-0">
              Owner edits
            </span>
          </div>

          {/* 5. Report */}
          <div className="p-3 bg-white border border-slate-200/80 rounded-2xl flex items-center justify-between shadow-2xs">
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 text-slate-800 font-bold text-xs">
                <Send size={13} className="text-slate-400" />
                <span>Report</span>
              </div>
              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                {preset?.reportingTeam || 'Card Disputes & Chargebacks'}
              </div>
            </div>
            <Lock size={12} className="text-slate-300 shrink-0 ml-1" />
          </div>
        </div>

        {/* Operational Ingestion Directive Banner */}
        <div className="px-4 py-3 bg-white border border-slate-200/80 rounded-2xl shadow-2xs flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#F27421] flex items-center justify-center shrink-0">
              <Upload size={15} />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900">Run incoming settlement files against this directive</span>
              <p className="text-[11px] text-slate-500">
                Drop your raw transaction batch (.xlsx, .csv) to auto-remediate discrepancies, or let scheduled background FTP triggers feed it.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsUploadModalOpen(true)}
            className="px-3.5 py-1.5 bg-orange-50 hover:bg-orange-100 text-[#F27421] border border-orange-200 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer shrink-0"
          >
            <Upload size={12} />
            <span>Upload file now</span>
          </button>
        </div>

        {/* 4 KPI Cards matching 42_hashtag_owner_view.png */}
        <div className="grid grid-cols-4 gap-4 shrink-0">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-1">
            <span className="text-xs font-semibold text-slate-600">Transactions collected</span>
            <div className="text-3xl font-bold text-slate-900">{stats.total}</div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-1">
            <span className="text-xs font-semibold text-slate-600">Fixed automatically</span>
            <div className="text-3xl font-bold text-emerald-600">{stats.fixed}</div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-1">
            <span className="text-xs font-semibold text-slate-600">Failed</span>
            <div className="text-3xl font-bold text-rose-600">{stats.failed}</div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-1">
            <span className="text-xs font-semibold text-slate-600">Waiting</span>
            <div className="text-3xl font-bold text-amber-500">{stats.waiting}</div>
          </div>
        </div>

        {/* Split Two Columns: Left Table with Pagination, Right Metadata Cards */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 min-h-0 overflow-hidden">
          
          {/* Left Column: Collected transactions Table with PAGINATION */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-2xs flex flex-col overflow-hidden min-h-0">
            
            {/* Header + Search + Tabs */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0 gap-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Collected transactions</h3>
                <p className="text-[11px] text-slate-400">Every transaction processed under this hashtag</p>
              </div>

              <div className="flex items-center space-x-2">
                {/* Search */}
                <div className="relative w-44">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search txn / case..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#F27421]"
                  />
                </div>

                {/* Filter tabs */}
                <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
                  {(['ALL', 'FIXED', 'FAILED', 'WAITING'] as const).map(tabKey => (
                    <button
                      key={tabKey}
                      type="button"
                      onClick={() => { setFilter(tabKey); setPage(1); }}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition cursor-pointer capitalize ${
                        filter === tabKey
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tabKey === 'ALL' ? 'All' : tabKey.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 flex flex-col justify-between overflow-hidden">
              <div className="overflow-y-auto min-h-0 flex-1">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-100 text-slate-400 font-medium text-[11px]">
                      <th className="py-2.5 px-5">Transaction</th>
                      <th className="py-2.5 px-5">Case</th>
                      <th className="py-2.5 px-5">Result</th>
                      <th className="py-2.5 px-5">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {visibleTransactions.map((tx, idx) => (
                      <tr key={tx.id || idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-5 font-bold font-mono text-slate-900">{tx.transaction}</td>
                        <td className="py-2.5 px-5 font-medium text-slate-700">{tx.caseId}</td>
                        <td className="py-2.5 px-5">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center space-x-1.5 w-max ${
                            tx.result === 'Fixed'
                              ? 'bg-emerald-50 text-emerald-700'
                              : tx.result === 'Failed'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              tx.result === 'Fixed' ? 'bg-emerald-500' : tx.result === 'Failed' ? 'bg-rose-500' : 'bg-amber-500'
                            }`} />
                            <span>{tx.result}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-5 text-slate-500">{tx.when}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Clean Pagination Footer */}
              <div className="px-5 py-3 border-t border-slate-100 bg-white flex items-center justify-between text-xs text-slate-500 shrink-0">
                <span>
                  Showing {filteredTransactions.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredTransactions.length)} of {filteredTransactions.length}
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <span className="font-semibold text-slate-700">Page {page} of {totalPages}</span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Context Cards matching 42_hashtag_owner_view.png */}
          <div className="space-y-4 overflow-y-auto">
            {/* Card 1: Reports to */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-2">
              <h4 className="font-bold text-slate-900 text-xs">Reports to</h4>
              <div className="flex items-center space-x-3 pt-1">
                <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 font-bold text-xs flex items-center justify-center shrink-0">
                  CA
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-xs">Card Disputes & Chargebacks Unit</div>
                  <div className="text-[11px] text-slate-400">Last report 24 Oct 08:00 · weekly digest</div>
                </div>
              </div>
            </div>

            {/* Card 2: Who can change it */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-2.5">
              <h4 className="font-bold text-slate-900 text-xs">Who can change it</h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Owner</span>
                  <span className="font-semibold text-slate-900">@samuel_tech (you)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Original team</span>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600">
                    View only
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Approved by</span>
                  <span className="font-medium text-slate-700">@checker_ops_2</span>
                </div>
              </div>
            </div>

            {/* Card 3: Versions */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs space-y-2.5">
              <h4 className="font-bold text-slate-900 text-xs">Versions</h4>
              <div className="flex items-center justify-between pt-1 text-xs">
                <div>
                  <span className="font-bold text-slate-900">v1</span>
                  <span className="text-slate-400 text-[11px] ml-2">Posted 23 Oct · approved 23 Oct</span>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  Live
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* File Ingestion Modal */}
      {isUploadModalOpen && (
        <HashtagFileUploadModal
          hashtagTag={cleanTag}
          preset={preset}
          currentUser={currentUser}
          onClose={() => setIsUploadModalOpen(false)}
          onSuccess={(runData) => {
            loadHashtagData();
          }}
        />
      )}
    </div>
  );
}

export default HashtagOwnerDetailView;
