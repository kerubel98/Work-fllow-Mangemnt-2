/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, Mail, Send, CheckCircle2, AlertTriangle, 
  RefreshCw, Plus, Shield, Terminal, Hash, PhoneCall, Bot,
  Inbox, FileText, Check, X, ArrowUpRight, Clock, UserCheck,
  ChevronRight, Filter, Search, Layers, Server, Play, Eye
} from 'lucide-react';
import { Team, User } from '../../types';
import { api } from '../../api/client';
import { ErrorBoundary } from '../ErrorBoundary';

interface TeamChannelsTabProps {
  currentTeam: Team | null;
  currentUser: User;
}

export const TeamChannelsTab: React.FC<TeamChannelsTabProps> = ({ currentTeam, currentUser }) => {
  return (
    <ErrorBoundary fallbackTitle="External Requests & Messaging Module Failed">
      <TeamChannelsTabContent currentTeam={currentTeam} currentUser={currentUser} />
    </ErrorBoundary>
  );
};

const TeamChannelsTabContent: React.FC<TeamChannelsTabProps> = ({ currentTeam, currentUser }) => {
  const [activeSubTab, setActiveSubTab] = useState<'requests' | 'providers' | 'identities' | 'simulator'>('requests');
  
  // Data State
  const [summary, setSummary] = useState<any | null>(null);
  const [stagedMessages, setStagedMessages] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [inboxLogs, setInboxLogs] = useState<any[]>([]);
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
  const [proposeTitle, setProposeTitle] = useState('');
  const [proposePriority, setProposePriority] = useState('Medium');
  const [escalateTargetTeam, setEscalateTargetTeam] = useState('team-cards-01');
  const [activeActionModal, setActiveActionModal] = useState<'propose' | 'approve' | 'reject' | 'escalate' | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Provider Connection Form
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [providerChannel, setProviderChannel] = useState<'email' | 'teams' | 'whatsapp' | 'telegram'>('email');
  const [providerDisplayName, setProviderDisplayName] = useState('');
  const [providerHost, setProviderHost] = useState('');
  const [providerUser, setProviderUser] = useState('');
  const [providerToken, setProviderToken] = useState('');
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [fetchingProviderId, setFetchingProviderId] = useState<string | null>(null);
  const [providerTestResult, setProviderTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  // Identity Form
  const [identChannelType, setIdentChannelType] = useState<'email' | 'teams' | 'whatsapp' | 'telegram'>('email');
  const [identDisplayName, setIdentDisplayName] = useState('');
  const [identAddress, setIdentAddress] = useState('');
  const [identIsPrimary, setIdentIsPrimary] = useState(false);
  const [isSavingIdent, setIsSavingIdent] = useState(false);

  // Simulator
  const [simChannel, setSimChannel] = useState<'email' | 'teams' | 'whatsapp' | 'telegram'>('email');
  const [simSender, setSimSender] = useState('corporate_client@partnerbank.com');
  const [simText, setSimText] = useState('URGENT: Reconcile attached settlement feed for account ACC-99214. Discrepancy amount $14,250.00 observed.');
  const [simRunning, setSimRunning] = useState(false);
  const [simOutput, setSimOutput] = useState<any | null>(null);

  const teamId = currentTeam?.id || '';

  const loadAllData = async () => {
    if (!teamId) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [summ, staged, provs, cfgs, msgs] = await Promise.all([
        api.getExternalRequestSummary(teamId).catch(() => null),
        api.getStagedMessages({ teamId, limit: 100 }).catch(() => []),
        api.getMessageProviders({ teamId }).catch(() => []),
        api.getTeamChannelConfigs(teamId).catch(() => []),
        api.getIncomingMessages({ teamId, limit: 20 }).catch(() => [])
      ]);
      setSummary(summ);
      setStagedMessages(staged || []);
      setProviders(provs || []);
      setConfigs(cfgs || []);
      setInboxLogs(msgs || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load external requests data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [teamId]);

  // Provider Connection Handlers
  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !providerDisplayName.trim()) return;

    try {
      const config: Record<string, any> = {
        host: providerHost.trim(),
        user: providerUser.trim(),
        token: providerToken.trim(),
        botToken: providerToken.trim(),
        accessToken: providerToken.trim()
      };

      await api.createMessageProvider({
        teamId,
        channel: providerChannel,
        displayName: providerDisplayName.trim(),
        config,
        status: 'ACTIVE',
        createdBy: currentUser.username || currentUser.id
      });

      setSuccessMsg(`Provider "${providerDisplayName}" saved successfully.`);
      setShowAddProviderModal(false);
      setProviderDisplayName('');
      setProviderHost('');
      setProviderUser('');
      setProviderToken('');
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save provider connection');
    }
  };

  const handleTestProvider = async (provId: string) => {
    setTestingProviderId(provId);
    setProviderTestResult(null);
    try {
      const res = await api.testMessageProvider(provId);
      setProviderTestResult({ id: provId, success: res.success, message: res.message });
      await loadAllData();
    } catch (err: any) {
      setProviderTestResult({ id: provId, success: false, message: err.message || 'Test failed' });
    } finally {
      setTestingProviderId(null);
    }
  };

  const handleFetchMessages = async (provId: string) => {
    setFetchingProviderId(provId);
    setErrorMsg(null);
    try {
      const res = await api.fetchProviderMessages(provId);
      setSuccessMsg(`Fetch complete! ${res.stagedCount} message(s) ingested into staging queue.`);
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Fetch failed');
    } finally {
      setFetchingProviderId(null);
    }
  };

  // Identity Registration Handlers
  const handleSaveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !identAddress.trim()) return;

    setIsSavingIdent(true);
    setErrorMsg(null);
    try {
      await api.saveTeamChannelConfig({
        teamId,
        channel: identChannelType,
        displayName: identDisplayName.trim() || `${identChannelType.toUpperCase()} Inbox`,
        address: identAddress.trim(),
        isPrimary: identIsPrimary,
        createdBy: currentUser.username || currentUser.id
      });
      setSuccessMsg(`Channel '${identChannelType.toUpperCase()}' registered successfully.`);
      setIdentDisplayName('');
      setIdentAddress('');
      setIdentIsPrimary(false);
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save channel identity');
    } finally {
      setIsSavingIdent(false);
    }
  };

  // Simulator Handler
  const handleRunSimulator = async () => {
    if (!simSender.trim() || !simText.trim()) return;

    setSimRunning(true);
    setSimOutput(null);
    try {
      const res = await api.simulateInboundMessage({
        channel: simChannel,
        senderAddress: simSender.trim(),
        senderName: 'Simulator Client Requester',
        text: simText.trim()
      });
      setSimOutput(res);
      setSuccessMsg('Simulated message dispatched. Staged in external intake pipeline.');
      await loadAllData();
    } catch (err: any) {
      setSimOutput({ error: err.message || 'Simulator failed' });
    } finally {
      setSimRunning(false);
    }
  };

  // Maker-Checker Triage Actions
  const handleOpenReview = (staged: any) => {
    setSelectedStaged(staged);
    setProposeTitle(staged.subject || `External ${staged.category.replace(/_/g, ' ')}`);
    setProposePriority(staged.urgency === 'critical' ? 'Critical' : (staged.urgency === 'high' ? 'High' : 'Medium'));
    setReviewDrawerOpen(true);
  };

  const handleExecuteMakerProposal = async () => {
    if (!selectedStaged) return;
    setIsProcessingAction(true);
    setErrorMsg(null);

    try {
      await api.proposeStagedMessageConversion(selectedStaged.id, {
        makerId: currentUser.id,
        makerName: currentUser.name || currentUser.username,
        title: proposeTitle,
        priority: proposePriority,
        notes: actionNotes
      });
      setSuccessMsg(`Task creation proposed by Maker '${currentUser.name}'. Ready for Checker approval.`);
      setActiveActionModal(null);
      setReviewDrawerOpen(false);
      setActionNotes('');
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to propose task conversion');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleExecuteCheckerApproval = async () => {
    if (!selectedStaged) return;

    // Client-side anti-self-approval pre-check (Rule 7)
    if (selectedStaged.maker_id && selectedStaged.maker_id === currentUser.id) {
      setErrorMsg(`Anti-Self-Approval Restriction: You are the Maker of this proposal and cannot approve it. A different supervisor must sign off (Four-Eyes Principle).`);
      return;
    }

    setIsProcessingAction(true);
    setErrorMsg(null);

    try {
      const res = await api.approveStagedMessage(selectedStaged.id, {
        checkerId: currentUser.id,
        checkerName: currentUser.name || currentUser.username,
        reviewNotes: actionNotes || 'Approved by Checker'
      });
      setSuccessMsg(`Approved! Task #${res.issue?.id} created successfully.`);
      setActiveActionModal(null);
      setReviewDrawerOpen(false);
      setActionNotes('');
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Approval failed');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleExecuteReject = async () => {
    if (!selectedStaged || !actionNotes.trim()) return;
    setIsProcessingAction(true);
    setErrorMsg(null);

    try {
      await api.rejectStagedMessage(selectedStaged.id, {
        actorId: currentUser.id,
        actorName: currentUser.name || currentUser.username,
        reason: actionNotes.trim()
      });
      setSuccessMsg(`Request #${selectedStaged.id} rejected.`);
      setActiveActionModal(null);
      setReviewDrawerOpen(false);
      setActionNotes('');
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reject message');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleExecuteEscalate = async () => {
    if (!selectedStaged) return;
    setIsProcessingAction(true);
    setErrorMsg(null);

    try {
      await api.escalateStagedMessage(selectedStaged.id, {
        targetTeamId: escalateTargetTeam,
        actorId: currentUser.id,
        actorName: currentUser.name || currentUser.username,
        reason: actionNotes || 'Escalated from triage console'
      });
      setSuccessMsg(`Request escalated to ${escalateTargetTeam}.`);
      setActiveActionModal(null);
      setReviewDrawerOpen(false);
      setActionNotes('');
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Escalation failed');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Helper icons
  const getChannelIcon = (c: string) => {
    switch (c) {
      case 'email': return <Mail size={16} className="text-sky-600" />;
      case 'teams': return <MessageSquare size={16} className="text-indigo-600" />;
      case 'whatsapp': return <PhoneCall size={16} className="text-emerald-600" />;
      case 'telegram': return <Bot size={16} className="text-blue-500" />;
      default: return <MessageSquare size={16} />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'NEW':
        return <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold rounded-md">NEW</span>;
      case 'READY_FOR_TASK_CREATION':
        return <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold rounded-md">READY FOR TASK</span>;
      case 'CONVERTED_TO_TASK':
        return <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold rounded-md">TASK CONVERTED</span>;
      case 'ESCALATED':
        return <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold rounded-md">ESCALATED</span>;
      case 'REJECTED':
        return <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold rounded-md">REJECTED</span>;
      default:
        return <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-md">{status}</span>;
    }
  };

  // Filtered Staged Messages
  const filteredMessages = stagedMessages.filter(msg => {
    if (statusFilter !== 'ALL' && msg.status !== statusFilter) return false;
    if (urgencyFilter !== 'ALL' && msg.urgency !== urgencyFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSender = (msg.sender_address || msg.senderAddress || '').toLowerCase().includes(q);
      const matchSubject = (msg.subject || '').toLowerCase().includes(q);
      const matchRef = (msg.parsed_fields?.caseReference || msg.parsedFields?.caseReference || '').toLowerCase().includes(q);
      const matchId = (msg.id || '').toLowerCase().includes(q);
      if (!matchSender && !matchSubject && !matchRef && !matchId) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6 font-sans text-xs" id="external-requests-cockpit">
      {/* Top Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Inbox size={20} />
            </span>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">External Request Intake &amp; Provider Connectors</h3>
              <p className="text-slate-500 text-xs">
                Inbound multi-channel triage, attachment parsing, Maker-Checker authorization, and operational task dispatch.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            onClick={loadAllData}
            disabled={isLoading}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5"
            title="Refresh All Channels"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Metrics Bar */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Inbound</div>
            <div className="text-lg font-black text-slate-800 mt-1">{summary.totalInbound || 0}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
            <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Pending Triage</div>
            <div className="text-lg font-black text-blue-700 mt-1">{summary.pendingTriage || 0}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
            <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Ready for Task</div>
            <div className="text-lg font-black text-amber-700 mt-1">{summary.readyForTaskCreation || 0}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Task Converted</div>
            <div className="text-lg font-black text-emerald-700 mt-1">{summary.convertedToTask || 0}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
            <div className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Escalated</div>
            <div className="text-lg font-black text-purple-700 mt-1">{summary.escalatedCount || 0}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs">
            <div className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">SLA Breaches</div>
            <div className="text-lg font-black text-rose-700 mt-1">{summary.slaBreachCount || 0}</div>
          </div>
        </div>
      )}

      {/* Global Alerts */}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700"><X size={14} /></button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700"><X size={14} /></button>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-6 font-semibold text-xs">
        <button
          onClick={() => setActiveSubTab('requests')}
          className={`pb-3 flex items-center gap-2 transition cursor-pointer border-b-2 ${
            activeSubTab === 'requests'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Inbox size={15} />
          <span>Staged Requests ({stagedMessages.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('providers')}
          className={`pb-3 flex items-center gap-2 transition cursor-pointer border-b-2 ${
            activeSubTab === 'providers'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Server size={15} />
          <span>Provider Connections ({providers.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('identities')}
          className={`pb-3 flex items-center gap-2 transition cursor-pointer border-b-2 ${
            activeSubTab === 'identities'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Shield size={15} />
          <span>Webhook Identities ({configs.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('simulator')}
          className={`pb-3 flex items-center gap-2 transition cursor-pointer border-b-2 ${
            activeSubTab === 'simulator'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Terminal size={15} />
          <span>Intake Simulator</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* 1. STAGED EXTERNAL REQUESTS TRIAGE QUEUE                  */}
      {/* ========================================================= */}
      {activeSubTab === 'requests' && (
        <div className="space-y-4">
          {/* Controls & Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search size={14} className="text-slate-400" />
              <input
                type="text"
                placeholder="Search by sender, subject, case reference (#ISS-...), or ID..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-800 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500">Status:</span>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="NEW">New</option>
                  <option value="READY_FOR_TASK_CREATION">Ready For Task</option>
                  <option value="CONVERTED_TO_TASK">Converted to Task</option>
                  <option value="ESCALATED">Escalated</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500">Urgency:</span>
                <select
                  value={urgencyFilter}
                  onChange={e => setUrgencyFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700"
                >
                  <option value="ALL">All Urgencies</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table / List View */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            {filteredMessages.length === 0 ? (
              <div className="p-10 text-center text-slate-400 bg-slate-50/50">
                <Inbox size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-600">No staged external requests match criteria.</p>
                <p className="text-slate-400 text-xs mt-1">
                  Use the Simulator or configure a live Provider Connection to ingest external messages.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-4">Channel</th>
                      <th className="py-3 px-4">Sender &amp; Subject</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Urgency</th>
                      <th className="py-3 px-4">Confidence</th>
                      <th className="py-3 px-4">Attachments</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMessages.map(msg => {
                      const fields = msg.parsed_fields || msg.parsedFields || {};
                      const atts = msg.attachments || [];
                      const isTaskCreated = msg.status === 'CONVERTED_TO_TASK';

                      return (
                        <tr key={msg.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-slate-100 rounded-lg">
                                {getChannelIcon(msg.channel)}
                              </div>
                              <span className="font-bold uppercase text-[10px] text-slate-700">{msg.channel}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <div className="font-bold text-slate-900 truncate">
                              {msg.subject || 'External Service Request'}
                            </div>
                            <div className="text-slate-500 text-[11px] truncate flex items-center gap-1.5">
                              <span>{msg.sender_name || msg.senderName || msg.sender_address || msg.senderAddress}</span>
                              {fields.caseReference && (
                                <span className="px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded font-mono text-[10px]">
                                  {fields.caseReference}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono text-[11px] text-slate-700">
                              {msg.category?.replace(/_/g, ' ') || 'GENERAL'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              msg.urgency === 'critical' ? 'bg-rose-100 text-rose-800' :
                              msg.urgency === 'high' ? 'bg-amber-100 text-amber-800' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {msg.urgency || 'normal'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <div className="w-12 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className="bg-blue-600 h-full rounded-full" 
                                  style={{ width: `${Math.round((msg.confidence_score || msg.confidenceScore || 0.5) * 100)}%` }} 
                                />
                              </div>
                              <span className="font-mono text-[10px] text-slate-600">
                                {Math.round((msg.confidence_score || msg.confidenceScore || 0.5) * 100)}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {atts.length > 0 ? (
                              <span className="inline-flex items-center gap-1 text-slate-700 font-semibold bg-slate-100 px-2 py-0.5 rounded-md text-[10px]">
                                <FileText size={12} className="text-blue-600" />
                                <span>{atts.length} file(s)</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {getStatusBadge(msg.status)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenReview(msg)}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 text-[11px]"
                              >
                                <Eye size={12} />
                                <span>Review</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. PROVIDER CONNECTIONS & ACTIVE FETCH CONTROLS           */}
      {/* ========================================================= */}
      {activeSubTab === 'providers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wide flex items-center gap-2">
              <Server size={15} className="text-blue-600" />
              <span>Registered Message Provider Connectors</span>
            </h4>
            <button
              onClick={() => setShowAddProviderModal(true)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition cursor-pointer flex items-center gap-1.5"
            >
              <Plus size={14} />
              <span>Add Provider Connection</span>
            </button>
          </div>

          {providers.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
              <Server size={28} className="mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-600">No active external provider connections configured.</p>
              <p className="text-slate-400 text-xs mt-1">Connect corporate IMAP email, Teams Bot, WhatsApp Cloud, or Telegram.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {providers.map(prov => (
                <div key={prov.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                        {getChannelIcon(prov.channel)}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                          <span>{prov.displayName}</span>
                          <span className={`px-2 py-0.2 rounded text-[9px] font-bold uppercase ${
                            prov.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {prov.status}
                          </span>
                        </div>
                        <div className="text-slate-500 font-mono text-[11px] truncate mt-0.5">
                          Channel: <span className="uppercase">{prov.channel}</span> | ID: {prov.id}
                        </div>
                      </div>
                    </div>
                  </div>

                  {prov.lastError && (
                    <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-[10px]">
                      {prov.lastError}
                    </div>
                  )}

                  {providerTestResult && providerTestResult.id === prov.id && (
                    <div className={`p-2 rounded-lg text-[10px] ${
                      providerTestResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      {providerTestResult.message}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-3">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      <span>Last Fetch: {prov.lastFetchAt ? new Date(prov.lastFetchAt).toLocaleTimeString() : 'Never'}</span>
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTestProvider(prov.id)}
                        disabled={testingProviderId === prov.id}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition cursor-pointer text-[10px]"
                      >
                        {testingProviderId === prov.id ? 'Testing...' : 'Test Connection'}
                      </button>
                      <button
                        onClick={() => handleFetchMessages(prov.id)}
                        disabled={fetchingProviderId === prov.id}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 text-[10px]"
                      >
                        <Play size={10} />
                        <span>{fetchingProviderId === prov.id ? 'Fetching...' : 'Fetch Now'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. REGISTERED WEBHOOK IDENTITIES & LOGS                   */}
      {/* ========================================================= */}
      {activeSubTab === 'identities' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configured Identities */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wide flex items-center gap-2">
              <Shield size={14} className="text-blue-600" />
              <span>Configured Identities for {currentTeam?.name}</span>
            </h5>

            {configs.length === 0 ? (
              <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 font-mono">
                No webhook channel identities registered yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {configs.map(cfg => (
                  <div key={cfg.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg shadow-2xs border border-slate-200">
                        {getChannelIcon(cfg.channel)}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{cfg.displayName}</span>
                          {cfg.isPrimary && (
                            <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 text-[10px] font-bold rounded">PRIMARY</span>
                          )}
                        </div>
                        <div className="text-slate-500 font-mono text-[11px] truncate max-w-xs">{cfg.address}</div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded">ACTIVE</span>
                  </div>
                ))}
              </div>
            )}

            {/* Add Channel Form */}
            <div className="border-t border-slate-100 pt-4">
              <h6 className="font-bold text-slate-700 text-xs mb-3 flex items-center gap-1.5">
                <Plus size={13} className="text-blue-600" />
                <span>Register New Webhook Receptor</span>
              </h6>

              <form onSubmit={handleSaveIdentity} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Channel Type</label>
                    <select
                      value={identChannelType}
                      onChange={e => setIdentChannelType(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
                    >
                      <option value="email">Email Inbox</option>
                      <option value="teams">Microsoft Teams</option>
                      <option value="whatsapp">WhatsApp Business</option>
                      <option value="telegram">Telegram Bot</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Display Label</label>
                    <input
                      type="text"
                      placeholder="e.g. Settlement Shared Inbox"
                      value={identDisplayName}
                      onChange={e => setIdentDisplayName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Address / ID / Handle *</label>
                  <input
                    type="text"
                    required
                    placeholder="settlement-ops@bank.com, or Teams Channel ID"
                    value={identAddress}
                    onChange={e => setIdentAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-mono"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="chk-primary-channel"
                    checked={identIsPrimary}
                    onChange={e => setIdentIsPrimary(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <label htmlFor="chk-primary-channel" className="text-slate-700 text-xs">Set as Primary Outbound Channel</label>
                </div>

                <button
                  type="submit"
                  disabled={isSavingIdent}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSavingIdent ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                  <span>Register Webhook Receptor</span>
                </button>
              </form>
            </div>
          </div>

          {/* Raw Inbound Log */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wide flex items-center gap-2">
              <Mail size={14} className="text-blue-600" />
              <span>Recent Webhook Messages Delivered</span>
            </h5>

            {inboxLogs.length === 0 ? (
              <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 font-mono">
                No recent webhook deliveries recorded.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {inboxLogs.map(m => (
                  <div key={m.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-bold text-slate-800 uppercase flex items-center gap-1">
                        {getChannelIcon(m.channel)}
                        <span>{m.channel}</span>
                      </span>
                      <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-slate-700 truncate mt-1">{m.text_body}</div>
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                      <span>Sender: {m.sender_address}</span>
                      <span className="text-blue-600 font-semibold">{m.intent}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. INTAKE SIMULATOR CONSOLE                               */}
      {/* ========================================================= */}
      {activeSubTab === 'simulator' && (
        <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-blue-400 font-bold uppercase text-xs">
              <Terminal size={16} />
              <span>Enterprise Channel Inbound Simulator</span>
            </div>
            <span className="text-slate-400 text-xs font-mono">64-Bit Advisory Locking &amp; Parsing Active</span>
          </div>

          <p className="text-slate-400 text-xs">
            Test inbound customer requests and multi-format attachment parsing without external vendor credentials.
            Triggers the staging pipeline, structured field extraction, and Maker-Checker triage.
          </p>

          <div className="space-y-3 font-mono">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Source Channel</label>
                <select
                  value={simChannel}
                  onChange={e => setSimChannel(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200"
                >
                  <option value="email">Email</option>
                  <option value="teams">MS Teams</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="telegram">Telegram</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Sender Address</label>
                <input
                  type="text"
                  value={simSender}
                  onChange={e => setSimSender(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Message Content / Service Request</label>
              <textarea
                rows={3}
                value={simText}
                onChange={e => setSimText(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-slate-200 text-xs focus:outline-none"
                placeholder="Include reference IDs, amounts, accounts, or action commands..."
              />
            </div>

            <button
              type="button"
              onClick={handleRunSimulator}
              disabled={simRunning}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
            >
              {simRunning ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              <span>Dispatch Simulated Intake Request</span>
            </button>
          </div>

          {simOutput && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-[11px] text-slate-300 overflow-x-auto max-h-48 mt-3">
              <span className="text-emerald-400 font-bold block mb-1">Execution Output:</span>
              <pre>{JSON.stringify(simOutput, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* REVIEW DRAWER / MODAL FOR STAGED REQUEST                  */}
      {/* ========================================================= */}
      {reviewDrawerOpen && selectedStaged && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-end">
          <div className="w-full max-w-xl h-full bg-white shadow-2xl p-6 overflow-y-auto space-y-6 flex flex-col justify-between">
            <div className="space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    {getChannelIcon(selectedStaged.channel)}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Review Staged External Request</h4>
                    <div className="text-slate-500 font-mono text-[11px]">ID: {selectedStaged.id}</div>
                  </div>
                </div>
                <button
                  onClick={() => setReviewDrawerOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Status & Urgency Badges */}
              <div className="flex flex-wrap items-center gap-2">
                {getStatusBadge(selectedStaged.status)}
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  selectedStaged.urgency === 'critical' ? 'bg-rose-100 text-rose-800' :
                  selectedStaged.urgency === 'high' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                }`}>
                  Urgency: {selectedStaged.urgency}
                </span>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-bold">
                  Confidence: {Math.round((selectedStaged.confidence_score || selectedStaged.confidenceScore || 0.5) * 100)}%
                </span>
              </div>

              {/* Requester & Routing Details */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Requester Profile</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Sender:</span>{' '}
                    <span className="font-semibold text-slate-800">{selectedStaged.sender_name || selectedStaged.senderName || 'External Customer'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Address:</span>{' '}
                    <span className="font-mono text-slate-700">{selectedStaged.sender_address || selectedStaged.senderAddress}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Target Team:</span>{' '}
                    <span className="font-semibold text-slate-800">{selectedStaged.team_id || selectedStaged.teamId || 'team-settlement-01'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Received At:</span>{' '}
                    <span className="text-slate-700">{new Date(selectedStaged.created_at || selectedStaged.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Request Subject & Body */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Message Subject &amp; Body</div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="font-bold text-slate-900 text-xs">{selectedStaged.subject}</div>
                  <div className="text-slate-700 text-xs whitespace-pre-wrap font-sans max-h-40 overflow-y-auto">
                    {selectedStaged.text_body || selectedStaged.textBody}
                  </div>
                </div>
              </div>

              {/* Extracted Structured Entities */}
              {selectedStaged.parsed_fields && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Parsed Business Entities</div>
                  <div className="grid grid-cols-2 gap-2 bg-blue-50/50 border border-blue-100 rounded-xl p-3 text-xs">
                    {selectedStaged.parsed_fields.caseReference && (
                      <div>
                        <span className="text-blue-600 font-bold">Case Reference:</span>{' '}
                        <span className="font-mono text-slate-800">{selectedStaged.parsed_fields.caseReference}</span>
                      </div>
                    )}
                    {selectedStaged.parsed_fields.customerAccount && (
                      <div>
                        <span className="text-blue-600 font-bold">Account:</span>{' '}
                        <span className="font-mono text-slate-800">{selectedStaged.parsed_fields.customerAccount}</span>
                      </div>
                    )}
                    {selectedStaged.parsed_fields.amount && (
                      <div>
                        <span className="text-blue-600 font-bold">Amount:</span>{' '}
                        <span className="font-semibold text-slate-800">
                          {selectedStaged.parsed_fields.amount} {selectedStaged.parsed_fields.currency || 'USD'}
                        </span>
                      </div>
                    )}
                    {selectedStaged.parsed_fields.slaHours && (
                      <div>
                        <span className="text-blue-600 font-bold">SLA Target:</span>{' '}
                        <span className="text-slate-800">{selectedStaged.parsed_fields.slaHours} hours</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Attachments List */}
              {selectedStaged.attachments && selectedStaged.attachments.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">
                    Staged Evidence Attachments ({selectedStaged.attachments.length})
                  </div>
                  <div className="space-y-2">
                    {selectedStaged.attachments.map((att: any) => (
                      <div key={att.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText size={16} className="text-blue-600" />
                          <div>
                            <div className="font-bold text-slate-800">{att.filename}</div>
                            <div className="text-slate-400 text-[10px]">
                              {att.content_type || att.contentType} • {att.parsing_status || att.parsingStatus}
                            </div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded">
                          PARSED
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="border-t border-slate-200 pt-4 space-y-3">
              {selectedStaged.status === 'CONVERTED_TO_TASK' ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <span>Already converted to Task #{selectedStaged.created_issue_id || selectedStaged.createdIssueId}.</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {/* Maker Proposal Button */}
                  <button
                    onClick={() => setActiveActionModal('propose')}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <UserCheck size={14} />
                    <span>Maker: Propose Task</span>
                  </button>

                  {/* Checker Approval Button */}
                  <button
                    onClick={() => setActiveActionModal('approve')}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Check size={14} />
                    <span>Checker: Approve</span>
                  </button>

                  {/* Escalate Button */}
                  <button
                    onClick={() => setActiveActionModal('escalate')}
                    className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-xl transition cursor-pointer flex items-center gap-1"
                  >
                    <ArrowUpRight size={14} />
                    <span>Escalate</span>
                  </button>

                  {/* Reject Button */}
                  <button
                    onClick={() => setActiveActionModal('reject')}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl transition cursor-pointer flex items-center gap-1"
                  >
                    <X size={14} />
                    <span>Reject</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Modal (Maker Propose / Checker Approve / Reject / Escalate) */}
      {activeActionModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h4 className="font-bold text-slate-900 text-sm capitalize">
              {activeActionModal === 'propose' && 'Maker: Propose Task Creation'}
              {activeActionModal === 'approve' && 'Checker: Authorize & Convert Task'}
              {activeActionModal === 'reject' && 'Reject Staged External Request'}
              {activeActionModal === 'escalate' && 'Escalate Request to Team'}
            </h4>

            {activeActionModal === 'propose' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Task Title</label>
                  <input
                    type="text"
                    value={proposeTitle}
                    onChange={e => setProposeTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Priority</label>
                  <select
                    value={proposePriority}
                    onChange={e => setProposePriority(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>
            )}

            {activeActionModal === 'escalate' && (
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Target Department Team</label>
                <select
                  value={escalateTargetTeam}
                  onChange={e => setEscalateTargetTeam(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
                >
                  <option value="team-cards-01">Cards &amp; Dispute Management</option>
                  <option value="team-settlement-01">Settlement Operations</option>
                  <option value="team-core-switch">Core Banking Switch Team</option>
                  <option value="team-audit-01">Compliance &amp; Audit</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                {activeActionModal === 'reject' ? 'Rejection Reason *' : 'Review & Justification Notes'}
              </label>
              <textarea
                rows={3}
                required={activeActionModal === 'reject'}
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
                placeholder="Add operational justification or notes..."
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 text-xs focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveActionModal(null);
                  setActionNotes('');
                }}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isProcessingAction}
                onClick={() => {
                  if (activeActionModal === 'propose') handleExecuteMakerProposal();
                  if (activeActionModal === 'approve') handleExecuteCheckerApproval();
                  if (activeActionModal === 'reject') handleExecuteReject();
                  if (activeActionModal === 'escalate') handleExecuteEscalate();
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
              >
                {isProcessingAction ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                <span>Confirm</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Provider Modal */}
      {showAddProviderModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Server size={16} className="text-blue-600" />
                <span>Configure New Message Provider Connector</span>
              </h4>
              <button onClick={() => setShowAddProviderModal(false)} className="text-slate-400 hover:text-slate-700">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveProvider} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Channel Type</label>
                <select
                  value={providerChannel}
                  onChange={e => setProviderChannel(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
                >
                  <option value="email">IMAP / Corporate Email</option>
                  <option value="teams">Microsoft Teams Graph API</option>
                  <option value="whatsapp">Meta WhatsApp Cloud API</option>
                  <option value="telegram">Telegram Bot</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Display Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Enterprise Shared Mailbox"
                  value={providerDisplayName}
                  onChange={e => setProviderDisplayName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Server Host / Endpoint / Tenant ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. imap.corp.bank.com, or Tenant UUID"
                  value={providerHost}
                  onChange={e => setProviderHost(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Username / Client ID / Phone ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. settlement-ops, or App Client ID"
                  value={providerUser}
                  onChange={e => setProviderUser(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Access Token / Client Secret / Bot Token
                </label>
                <input
                  type="password"
                  placeholder="Enter secure credential or token..."
                  value={providerToken}
                  onChange={e => setProviderToken(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddProviderModal(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition"
                >
                  Save Provider Connection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
