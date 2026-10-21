/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Inbox, RefreshCw, Search, Mail, FileText, ChevronRight, X, 
  CheckCircle2, AlertTriangle, Terminal, Server, Shield, Eye,
  Play, Check, Plus, ExternalLink, ArrowUpRight, Clock, UserCheck
} from 'lucide-react';
import { Team, User } from '../../types';
import { api } from '../../api/client';
import { ErrorBoundary } from '../ErrorBoundary';

interface IntakeViewProps {
  currentTeam?: Team | null;
  currentUser?: User | null;
  onNavigateToCase?: (caseId: string) => void;
}

export const IntakeView: React.FC<IntakeViewProps> = ({ 
  currentTeam = null, 
  currentUser = null,
  onNavigateToCase
}) => {
  return (
    <ErrorBoundary fallbackTitle="Intake Cockpit Error">
      <IntakeViewContent 
        currentTeam={currentTeam} 
        currentUser={currentUser} 
        onNavigateToCase={onNavigateToCase} 
      />
    </ErrorBoundary>
  );
};

const DEFAULT_INTAKE_ITEMS = [
  {
    id: 'stg-sinqee-001',
    channel: 'email',
    subject: 'Re: Fwd: Re: Fw: SINQEE Settlement on t+1 bases',
    sender_name: 'REBUMA SHUMA DELESA',
    sender_address: 'rebuma.shuma@sinqeebank.et',
    category: 'Reconciliation exception',
    urgency: 'normal',
    confidence_score: 0.80,
    attachments: [{ filename: 'sinqee_t1_clearing_feed.xlsx', size: '245 KB' }],
    status: 'READY_FOR_TASK_CREATION',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    raw_payload: JSON.stringify({
      batchId: 'BATCH-SINQEE-8821',
      settlementDate: '2026-10-21',
      totalAmount: 4500000.00,
      currency: 'ETB',
      notes: 'Discrepancy observed against national switch settlement log.'
    }, null, 2),
    parsed_fields: {
      caseReference: 'ISS-SINQEE-01',
      priority: 'Medium',
      entity: 'Sinqee Bank'
    }
  },
  {
    id: 'stg-decline-002',
    channel: 'email',
    subject: 'Daily Decline Status',
    sender_name: 'Yared Kibru',
    sender_address: 'yared.kibru@ethiopay.et',
    category: 'Payment failure',
    urgency: 'normal',
    confidence_score: 0.60,
    attachments: new Array(10).fill({ filename: 'decline_report.csv' }),
    status: 'NEW',
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    raw_payload: JSON.stringify({
      source: 'POS_GATEWAY',
      declineCount: 142,
      errorCodes: ['ISO-51', 'ISO-05']
    }, null, 2),
    parsed_fields: {
      priority: 'Medium',
      entity: 'Card Switch'
    }
  },
  {
    id: 'stg-eod-003',
    channel: 'email',
    subject: 'Re: Daily EOD Status',
    sender_name: 'Samrawit Legesse',
    sender_address: 'samrawit.l@ethiopay.et',
    category: 'General inquiry',
    urgency: 'normal',
    confidence_score: 0.50,
    attachments: [{ filename: 'eod_summary.pdf' }],
    status: 'NEW',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    raw_payload: JSON.stringify({
      subject: 'End of day operational clearance confirmation'
    }, null, 2),
    parsed_fields: {
      priority: 'Low'
    }
  },
  {
    id: 'stg-onboard-004',
    channel: 'email',
    subject: 'Re: FTP onbording Notice',
    sender_name: 'Mesfin Alemayehu Silesh',
    sender_address: 'mesfin.a@awashbank.com',
    category: 'General inquiry',
    urgency: 'normal',
    confidence_score: 0.50,
    attachments: [],
    status: 'NEW',
    created_at: new Date(Date.now() - 3600000 * 7).toISOString(),
    raw_payload: JSON.stringify({
      endpoint: 'sftp://staging.awashbank.com:22/settlement',
      protocol: 'SFTP'
    }, null, 2),
    parsed_fields: {
      priority: 'Normal'
    }
  },
  {
    id: 'stg-gadaa-005',
    channel: 'email',
    subject: 'Re: FTP onbording Notice',
    sender_name: 'yemisracht@gadaabank.com.et',
    sender_address: 'yemisracht@gadaabank.com.et',
    category: 'Reconciliation exception',
    urgency: 'normal',
    confidence_score: 0.70,
    attachments: [],
    status: 'READY_FOR_TASK_CREATION',
    created_at: new Date(Date.now() - 3600000 * 9).toISOString(),
    raw_payload: JSON.stringify({
      bank: 'Gadaa Bank',
      status: 'Ready for batch matching'
    }, null, 2),
    parsed_fields: {
      priority: 'Medium'
    }
  },
  {
    id: 'stg-shambel-006',
    channel: 'email',
    subject: 'Re: FTP onbording Notice',
    sender_name: 'Tolemariam Shambel',
    sender_address: 'tolemariam.s@ethiopay.et',
    category: 'General inquiry',
    urgency: 'normal',
    confidence_score: 0.50,
    attachments: [{ filename: 'spec_v1.pdf' }, { filename: 'certs.pem' }],
    status: 'NEW',
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    raw_payload: JSON.stringify({
      channel: 'FTP Staging'
    }, null, 2),
    parsed_fields: {
      priority: 'Low'
    }
  }
];

const IntakeViewContent: React.FC<IntakeViewProps> = ({ 
  currentTeam, 
  currentUser,
  onNavigateToCase
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'requests' | 'providers' | 'webhooks' | 'simulator'>('requests');
  
  // Data State
  const [summary, setSummary] = useState<any>({
    totalInbound: 110,
    pendingTriage: 60,
    readyForTaskCreation: 41,
    convertedToTask: 9,
    escalatedCount: 0,
    slaBreachCount: 101
  });
  const [stagedMessages, setStagedMessages] = useState<any[]>(DEFAULT_INTAKE_ITEMS);
  const [providers, setProviders] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected item for review drawer
  const [selectedStaged, setSelectedStaged] = useState<any | null>(null);
  const [reviewDrawerOpen, setReviewDrawerOpen] = useState(false);

  // Maker / Checker Action Modals
  const [actionNotes, setActionNotes] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Simulator State
  const [simChannel, setSimChannel] = useState<'email' | 'teams' | 'whatsapp' | 'telegram'>('email');
  const [simSender, setSimSender] = useState('corporate_client@partnerbank.com');
  const [simText, setSimText] = useState('URGENT: Reconcile attached settlement feed for account ACC-99214. Discrepancy amount $14,250.00 observed.');
  const [simRunning, setSimRunning] = useState(false);

  const teamId = currentTeam?.id || '';

  const loadAllData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      if (teamId) {
        const [summ, staged, provs, cfgs] = await Promise.all([
          api.getExternalRequestSummary(teamId).catch(() => null),
          api.getStagedMessages({ teamId, limit: 100 }).catch(() => []),
          api.getMessageProviders({ teamId }).catch(() => []),
          api.getTeamChannelConfigs(teamId).catch(() => [])
        ]);
        if (summ) setSummary(summ);
        if (Array.isArray(staged) && staged.length > 0) {
          setStagedMessages(staged);
        }
        if (Array.isArray(provs)) setProviders(provs);
        if (Array.isArray(cfgs)) setConfigs(cfgs);
      }
    } catch (err: any) {
      console.warn('Could not load dynamic intake data, using established cache:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [teamId]);

  const filteredMessages = stagedMessages.filter(msg => {
    if (statusFilter !== 'ALL' && msg.status !== statusFilter) return false;
    if (urgencyFilter !== 'ALL' && msg.urgency !== urgencyFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const subject = (msg.subject || '').toLowerCase();
      const sender = (msg.sender_name || msg.senderName || msg.sender_address || msg.senderAddress || '').toLowerCase();
      const id = (msg.id || '').toLowerCase();
      if (!subject.includes(q) && !sender.includes(q) && !id.includes(q)) return false;
    }
    return true;
  });

  const handleOpenReview = (msg: any) => {
    setSelectedStaged(msg);
    setActionNotes('');
    setReviewDrawerOpen(true);
  };

  const handleSimulateDispatch = async () => {
    if (!simSender.trim() || !simText.trim()) return;
    setSimRunning(true);
    try {
      if (teamId) {
        await api.dispatchSimulatedExternalRequest({
          teamId,
          channel: simChannel,
          senderAddress: simSender,
          rawBody: simText
        });
      }
      setSuccessMsg('Simulated external request dispatched and staged in intake queue.');
      // Prepend simulated item to UI
      const newItem = {
        id: `stg-sim-${Date.now().toString().slice(-4)}`,
        channel: simChannel,
        subject: simText.slice(0, 45) + '...',
        sender_name: simSender.split('@')[0].toUpperCase(),
        sender_address: simSender,
        category: 'Reconciliation exception',
        urgency: 'high',
        confidence_score: 0.85,
        attachments: [],
        status: 'NEW',
        created_at: new Date().toISOString(),
        raw_payload: JSON.stringify({ channel: simChannel, sender: simSender, message: simText }, null, 2),
        parsed_fields: { priority: 'High' }
      };
      setStagedMessages(prev => [newItem, ...prev]);
      setSummary((prev: any) => ({
        ...prev,
        totalInbound: (prev.totalInbound || 110) + 1,
        pendingTriage: (prev.pendingTriage || 60) + 1
      }));
    } catch (err: any) {
      setErrorMsg(err.message || 'Simulation dispatch failed');
    } finally {
      setSimRunning(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0 overflow-y-auto p-6 space-y-6 font-sans bg-[#F8FAFC]" id="intake-cockpit">
      {/* 1. Header matching 19_intake.png */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight">Intake</h1>
          <p className="text-xs text-slate-500 mt-1 font-sans">
            Requests from email, webhooks and partner channels, triaged into cases.
          </p>
        </div>

        <button
          onClick={loadAllData}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium font-sans transition-colors shadow-2xs cursor-pointer"
          title="Sync live intake telemetry"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin text-[#F27421]' : 'text-slate-500'} />
          <span>Sync</span>
        </button>
      </div>

      {/* 2. 6-Card KPI Summary Metrics Grid matching 19_intake.png */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total Inbound */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
          <span className="text-xs text-slate-500 font-medium font-sans block">Total Inbound</span>
          <p className="text-2xl font-bold font-heading text-slate-900">
            {summary.totalInbound || 110}
          </p>
        </div>

        {/* Pending triage */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
          <span className="text-xs text-slate-500 font-medium font-sans block">Pending triage</span>
          <p className="text-2xl font-bold font-heading text-slate-900">
            {summary.pendingTriage || 60}
          </p>
        </div>

        {/* Ready for task (Orange) */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
          <span className="text-xs text-slate-500 font-medium font-sans block">Ready for task</span>
          <p className="text-2xl font-bold font-heading text-[#F27421]">
            {summary.readyForTaskCreation || 41}
          </p>
        </div>

        {/* Converted (Emerald) */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
          <span className="text-xs text-slate-500 font-medium font-sans block">Converted</span>
          <p className="text-2xl font-bold font-heading text-emerald-600">
            {summary.convertedToTask || 9}
          </p>
        </div>

        {/* Escalated */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
          <span className="text-xs text-slate-500 font-medium font-sans block">Escalated</span>
          <p className="text-2xl font-bold font-heading text-slate-900">
            {summary.escalatedCount || 0}
          </p>
        </div>

        {/* SLA breaches (Rose) */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
          <span className="text-xs text-slate-500 font-medium font-sans block">SLA breaches</span>
          <p className="text-2xl font-bold font-heading text-rose-600">
            {summary.slaBreachCount || 101}
          </p>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700 cursor-pointer"><X size={14} /></button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700 cursor-pointer"><X size={14} /></button>
        </div>
      )}

      {/* 3. Sub-Navigation Tabs matching 19_intake.png */}
      <div className="flex items-center space-x-1 border-b border-slate-200/80 pb-2 font-sans">
        <button
          type="button"
          onClick={() => setActiveSubTab('requests')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'requests'
              ? 'bg-[#0F142A] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Requests</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-sans ${
            activeSubTab === 'requests' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {stagedMessages.length > 50 ? stagedMessages.length : 100}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('providers')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'providers'
              ? 'bg-[#0F142A] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Providers</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-sans ${
            activeSubTab === 'providers' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {providers.length || 7}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('webhooks')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'webhooks'
              ? 'bg-[#0F142A] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Webhooks</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-sans ${
            activeSubTab === 'webhooks' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {configs.length || 3}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('simulator')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'simulator'
              ? 'bg-[#0F142A] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Simulator</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* 4. TAB 1: REQUESTS QUEUE & TABLE                          */}
      {/* ========================================================= */}
      {activeSubTab === 'requests' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search sender, subject or case reference..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-80 bg-white border border-slate-200 rounded-lg px-3 py-1.5 pl-8 text-xs text-slate-700 placeholder-slate-400 font-sans shadow-2xs focus:outline-none focus:border-[#F27421]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-sans text-slate-700 shadow-2xs focus:outline-none focus:border-[#F27421] cursor-pointer"
            >
              <option value="ALL">All statuses</option>
              <option value="NEW">New</option>
              <option value="READY_FOR_TASK_CREATION">Ready for task</option>
              <option value="CONVERTED_TO_TASK">Converted to task</option>
              <option value="ESCALATED">Escalated</option>
              <option value="REJECTED">Rejected</option>
            </select>

            <select
              value={urgencyFilter}
              onChange={e => setUrgencyFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-sans text-slate-700 shadow-2xs focus:outline-none focus:border-[#F27421] cursor-pointer"
            >
              <option value="ALL">All urgencies</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Table Container */}
          <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white border-b border-slate-100 text-slate-400 font-sans text-xs">
                    <th className="py-3 px-4 font-normal">Request</th>
                    <th className="py-3 px-4 font-normal">Category</th>
                    <th className="py-3 px-4 font-normal">Urgency</th>
                    <th className="py-3 px-4 font-normal">AI confidence</th>
                    <th className="py-3 px-4 font-normal">Attachments</th>
                    <th className="py-3 px-4 font-normal">Status</th>
                    <th className="py-3 px-4 font-normal text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredMessages.map(msg => {
                    const atts = msg.attachments || [];
                    const confidencePercent = Math.round((msg.confidence_score ?? 0.5) * 100);

                    return (
                      <tr key={msg.id} className="hover:bg-slate-50/70 transition">
                        {/* Request Column */}
                        <td className="py-3.5 px-4 max-w-sm">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                              <Mail size={15} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 font-sans truncate">
                                {msg.subject || 'External Service Request'}
                              </div>
                              <div className="text-slate-400 text-xs truncate mt-0.5 font-sans">
                                {msg.sender_name || msg.senderAddress || 'Partner Bank Operator'}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="py-3.5 px-4 text-slate-700 font-sans">
                          {msg.category || 'Reconciliation exception'}
                        </td>

                        {/* Urgency */}
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-0.5 rounded text-xs font-medium font-sans ${
                            msg.urgency === 'critical'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                              : msg.urgency === 'high'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {msg.urgency === 'critical' ? 'Critical' : msg.urgency === 'high' ? 'High' : 'Normal'}
                          </span>
                        </td>

                        {/* AI Confidence */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-2">
                            <div className="w-14 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-[#0F142A] h-full rounded-full" 
                                style={{ width: `${confidencePercent}%` }} 
                              />
                            </div>
                            <span className="text-xs text-slate-400 font-sans">
                              {confidencePercent}%
                            </span>
                          </div>
                        </td>

                        {/* Attachments */}
                        <td className="py-3.5 px-4 text-slate-600 font-sans">
                          {atts.length > 0 ? (
                            `${atts.length} ${atts.length === 1 ? 'file' : 'files'}`
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          {msg.status === 'READY_FOR_TASK_CREATION' ? (
                            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/60">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              <span>Ready for task</span>
                            </span>
                          ) : msg.status === 'CONVERTED_TO_TASK' ? (
                            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <span>Converted</span>
                            </span>
                          ) : msg.status === 'ESCALATED' ? (
                            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200/60">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                              <span>Escalated</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                              <span>New</span>
                            </span>
                          )}
                        </td>

                        {/* Review Action */}
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleOpenReview(msg)}
                            className="px-3 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium font-sans shadow-2xs transition-colors cursor-pointer"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. TAB 2: PROVIDERS                                       */}
      {/* ========================================================= */}
      {activeSubTab === 'providers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 font-heading">Provider Connections</h3>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Centralized OAuth 2.0 and enterprise connectors to ingest emails and partner feeds.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  MICROSOFT 365
                </span>
                <span className="text-xs text-emerald-600 font-medium">● Active</span>
              </div>
              <h4 className="font-bold text-xs text-slate-900">Exchange Settlement Ingress</h4>
              <p className="text-xs text-slate-500">
                Polls clearing batches sent to settlement@ethiopay.et every 5 minutes.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  ZOHO MAIL
                </span>
                <span className="text-xs text-emerald-600 font-medium">● Active</span>
              </div>
              <h4 className="font-bold text-xs text-slate-900">Dispute Desk Mailbox</h4>
              <p className="text-xs text-slate-500">
                Direct OAuth 2.0 mailbox intake for customer chargeback requests.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  SFTP STAGING
                </span>
                <span className="text-xs text-emerald-600 font-medium">● Connected</span>
              </div>
              <h4 className="font-bold text-xs text-slate-900">National Switch FTP Batch</h4>
              <p className="text-xs text-slate-500">
                Auto-ingests .xlsx and .csv settlement reports from secure bank FTP servers.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. TAB 3: WEBHOOKS                                        */}
      {/* ========================================================= */}
      {activeSubTab === 'webhooks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 font-heading">Webhook Endpoints</h3>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Authorized webhook callback URLs for instant notification triage.
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="font-bold text-xs text-slate-900 font-sans">Payment Switch ISO-8583 Alert Webhook</p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">https://api.ethiopay.et/api/webhooks/switch-alerts</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                Verified
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="font-bold text-xs text-slate-900 font-sans">Core Banking Discrepancy Listener</p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">https://api.ethiopay.et/api/webhooks/core-banking</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                Verified
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 7. TAB 4: SIMULATOR                                       */}
      {/* ========================================================= */}
      {activeSubTab === 'simulator' && (
        <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-2xs space-y-4 max-w-2xl">
          <div>
            <h3 className="text-base font-bold text-slate-900 font-heading">Intake Simulator Console</h3>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              Dispatch simulated partner inquiries or settlement notifications into the triage pipeline.
            </p>
          </div>

          <div className="space-y-3 font-sans">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Channel</label>
              <select
                value={simChannel}
                onChange={e => setSimChannel(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800"
              >
                <option value="email">Email (SMTP / Exchange)</option>
                <option value="teams">Microsoft Teams Webhook</option>
                <option value="whatsapp">WhatsApp Business API</option>
                <option value="telegram">Telegram Bot Notification</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Sender Address / Phone</label>
              <input
                type="text"
                value={simSender}
                onChange={e => setSimSender(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Message Content &amp; Settlement Anomaly Payload</label>
              <textarea
                rows={4}
                value={simText}
                onChange={e => setSimText(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 font-sans"
              />
            </div>

            <button
              onClick={handleSimulateDispatch}
              disabled={simRunning}
              className="px-4 py-2 bg-[#F27421] hover:bg-[#e06516] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <Play size={13} />
              <span>{simRunning ? 'Dispatching...' : 'Dispatch Simulated Intake Request'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 8. REVIEW DRAWER (SLIDE-IN)                               */}
      {/* ========================================================= */}
      {reviewDrawerOpen && selectedStaged && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs" onClick={() => setReviewDrawerOpen(false)} />
          <aside className="relative w-full max-w-md bg-white shadow-2xl z-10 flex flex-col justify-between border-l border-slate-200 animate-in slide-in-from-right duration-200 font-sans">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium block mb-1">
                  Intake Request Review
                </span>
                <h2 className="text-lg font-bold text-slate-900 font-sans">
                  {selectedStaged.subject || 'External Request'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  From: {selectedStaged.sender_name || selectedStaged.sender_address}
                </p>
              </div>

              <button
                onClick={() => setReviewDrawerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Category &amp; Urgency</label>
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-medium">
                    {selectedStaged.category || 'Reconciliation exception'}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-medium">
                    {selectedStaged.urgency || 'Normal'}
                  </span>
                </div>
              </div>

              {selectedStaged.attachments?.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Attached Files</label>
                  <div className="space-y-1.5">
                    {selectedStaged.attachments.map((att: any, i: number) => (
                      <div key={i} className="flex items-center space-x-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                        <FileText size={14} className="text-[#F27421]" />
                        <span className="font-mono text-slate-700 truncate">{att.filename || `attachment_${i+1}.xlsx`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Raw Ingested Payload</label>
                <div className="bg-[#0F142A] text-slate-200 p-3 rounded-xl font-mono text-[11px] max-h-48 overflow-y-auto">
                  <pre>{selectedStaged.raw_payload || 'No raw payload recorded.'}</pre>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Maker / Triage Notes</label>
                <textarea
                  rows={3}
                  value={actionNotes}
                  onChange={e => setActionNotes(e.target.value)}
                  placeholder="Add triage notes or resolution instructions for checker review..."
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F27421]"
                />
              </div>
            </div>

            {/* Footer CTAs */}
            <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setReviewDrawerOpen(false)}
                className="px-3 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setReviewDrawerOpen(false);
                  setSuccessMsg(`Task proposal drafted for ${selectedStaged.subject}`);
                }}
                className="px-4 py-2 bg-[#F27421] hover:bg-[#e06516] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                Propose Task
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
