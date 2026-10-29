/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Lock, Flag, Link2, Send, ShieldCheck, Check, 
  X, ArrowRight, ShieldAlert, Clock, Users, AlertCircle, FileText
} from 'lucide-react';
import { EscalationAgreement, User, Team, Issue, HashtagPreset } from '../../types';
import { api } from '../../api/client';
import UnifiedChatInput, { InChatDirectiveType } from '../chat/UnifiedChatInput';

interface EscalationRoomViewProps {
  agreement: EscalationAgreement;
  currentUser: User;
  currentTeam?: Team | null;
  availableTeams: Team[];
  users?: User[];
  hashtags?: HashtagPreset[];
  onOpenAgreementContract: (agreement: EscalationAgreement) => void;
  onAgreementUpdated: (updated: EscalationAgreement) => void;
  onStageTask?: (issue: Issue) => void;
}

export const EscalationRoomView: React.FC<EscalationRoomViewProps> = ({
  agreement,
  currentUser,
  currentTeam,
  availableTeams,
  users = [],
  hashtags = [],
  onOpenAgreementContract,
  onAgreementUpdated,
  onStageTask
}) => {
  const [messages, setMessages] = useState<{ id: string; sender: string; time: string; text: string; role?: string }[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedChecker, setSelectedChecker] = useState('checker_ops_2');
  const [selectedTechnician, setSelectedTechnician] = useState('samuel_tech');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Determine if viewing as Escalating Team or Receiving Team
  const isEscalatingTeam = currentTeam?.id === agreement.escalatingTeamId || currentUser.username === 'manager_alex' || currentUser.username === 'kirubel_ops';
  const isReceivingTeam = currentTeam?.id === agreement.receivingTeamId || currentUser.username === 'tech_sarah' || currentUser.username === 'samuel_tech';

  const targetIssue: Issue = {
    id: agreement.issueKey || agreement.issueId || 'ISS-3854',
    title: agreement.issueTitle || 'trn test',
    description: agreement.reason || 'Settlement amount differences under 50.00 caused by fee rounding on the switch side.',
    type: 'file',
    priority: (agreement.priority as any) || 'High',
    status: 'Investigating',
    creatorId: 'kirubel_ops',
    creatorName: 'kirubel_ops',
    createdAt: agreement.createdAt || new Date().toISOString(),
    targetDb: 'Sett · MySQL',
    targetTable: 'sv_fin_tab',
    escalationAgreementId: agreement.id,
    stagedEnvironment: 'SANDBOX',
    chat: []
  };

  // Initialize room messages from ledger or defaults
  useEffect(() => {
    if (agreement.status === 'AWAITING_ESCALATING_SIGNATURE') {
      setMessages([
        {
          id: 'm1',
          sender: 'kirubel_ops',
          time: '10:41',
          text: '@manager_alex please sign so Core Operations can start.'
        }
      ]);
    } else if (agreement.status === 'AWAITING_RECEIVING_ACCEPTANCE') {
      setMessages([
        {
          id: 'm1',
          sender: 'kirubel_ops',
          time: '10:41',
          text: '@manager_alex please sign so Core Operations can start.'
        },
        {
          id: 'm2',
          sender: 'manager_alex',
          time: '10:52',
          text: `Signed. Checker is @${agreement.assignedCheckerName || 'checker_ops_2'}. Please assign a technician as soon as you accept.`
        }
      ]);
    } else {
      setMessages([
        {
          id: 'm1',
          sender: 'kirubel_ops',
          time: '10:41',
          text: '@manager_alex please sign so Core Operations can start.'
        },
        {
          id: 'm2',
          sender: 'manager_alex',
          time: '10:52',
          text: `Signed. Checker is @${agreement.assignedCheckerName || 'checker_ops_2'}. Please assign a technician as soon as you accept.`
        },
        {
          id: 'm3',
          sender: 'samuel_tech',
          time: '11:17',
          text: 'Acknowledged. Pulling secondary transaction leg from mirror DB to resolve discrepancy.'
        }
      ]);
    }
  }, [agreement.status, agreement.assignedCheckerName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const defaultUsers: User[] = [
    { id: 'u1', username: 'kirubel_ops', fullName: 'Kirubel Operations', role: 'operational' as any, status: 'active' },
    { id: 'u2', username: 'manager_alex', fullName: 'Alex Manager', role: 'manager' as any, status: 'active' },
    { id: 'u3', username: 'tech_sarah', fullName: 'Sarah Technician', role: 'tech' as any, status: 'active' },
    { id: 'u4', username: 'samuel_tech', fullName: 'Samuel Technician', role: 'tech' as any, status: 'active' },
    { id: 'u5', username: 'checker_ops_2', fullName: 'Checker Ops 2', role: 'operational' as any, status: 'active' },
    { id: 'u6', username: 'admin', fullName: 'System Administrator', role: 'admin' as any, status: 'active' }
  ];
  const effectiveUsers = users && users.length > 0 ? users : defaultUsers;

  const defaultHashtags: HashtagPreset[] = [
    { id: 'h1', tag: 'AIB_SETTLEMENT_2026', name: 'AIB Settlement 2026', description: 'Reconciliation preset for AIB' } as any,
    { id: 'h2', tag: 'SETTLEMENT_AMOUNT_ROUNDING', name: 'Settlement Amount Rounding', description: 'Fee rounding reconciliation' } as any,
    { id: 'h3', tag: 'FEE_VARIANCE_SWEEP', name: 'Fee Variance Sweep', description: 'Monthly fee tolerance sweep' } as any
  ];
  const effectiveHashtags = hashtags && hashtags.length > 0 ? hashtags : defaultHashtags;

  const handleSendRoomMessage = async (contentToSend?: string) => {
    const textContent = (contentToSend !== undefined ? contentToSend : inputText).trim();
    if (!textContent) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newMsg = {
      id: `room-msg-${Date.now()}`,
      sender: currentUser.username,
      time: timeStr,
      text: textContent
    };

    setMessages(prev => [...prev, newMsg]);
    setInputText('');

    try {
      await api.appendEscalationLedgerEvent(agreement.id, {
        event: `${currentUser.username}: ${newMsg.text}`,
        actor: `@${currentUser.username}`,
        type: 'message'
      });
    } catch (err) {
      console.error('Failed to log room event:', err);
    }
  };

  const handleExecuteDirective = (directive: InChatDirectiveType, currentContext: string) => {
    if (directive === 'create-task') {
      if (onStageTask) {
        onStageTask(targetIssue);
      }
      setInputText(`[Directive: Staged task ${targetIssue.id} for investigation]`);
    } else if (directive === 'create-escalate') {
      setInputText(`@escalate_issue to="Core Operations" reason="${agreement.reason || 'Urgent investigation escalation'}"`);
    } else if (directive === 'request-approval') {
      setInputText(`@request_approval solution="Manual settlement override" issue="${targetIssue.id}"`);
    } else if (directive === 'call-hashtag') {
      setInputText('#SETTLEMENT_AMOUNT_ROUNDING');
    } else if (directive === 'create-hashtag') {
      setInputText('/create-hashtag tag="#NEW_AUTOMATION_PRESET"');
    }
  };

  const renderFormattedMessage = (content: string) => {
    const parts = content.split(/(\s+)/);
    return parts.map((part, idx) => {
      if (part.startsWith('@@')) {
        return (
          <span key={idx} className="font-bold text-[#F27421] bg-orange-100/80 px-1.5 py-0.5 rounded text-[11px] font-mono">
            {part}
          </span>
        );
      }
      if (part.startsWith('@')) {
        return (
          <span key={idx} className="font-bold text-blue-600 bg-blue-100/80 px-1.5 py-0.5 rounded text-[11px] font-mono">
            {part}
          </span>
        );
      }
      if (part.startsWith('#')) {
        return (
          <span key={idx} className="font-bold text-purple-600 bg-purple-100/80 px-1.5 py-0.5 rounded text-[11px] font-mono">
            {part}
          </span>
        );
      }
      if (part.startsWith('/')) {
        return (
          <span key={idx} className="font-bold text-emerald-600 bg-emerald-100/80 px-1.5 py-0.5 rounded text-[11px] font-mono">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // Screen 30 Action: Escalating Lead Signs & assigns checker
  const handleSignAndSend = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      const updated = await api.signEscalatingLead(agreement.id, {
        leadId: currentUser.id,
        signature: currentUser.username,
        checkerId: 'user-checker-2',
        checkerName: selectedChecker
      });
      onAgreementUpdated(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to sign agreement');
    } finally {
      setIsProcessing(false);
    }
  };

  // Screen 31 Action: Receiving Lead Accepts, assigns technician & starts KPI clock
  const handleAcceptAndAssign = async () => {
    try {
      setIsProcessing(true);
      setError(null);
      const updated = await api.acceptReceivingLead(agreement.id, {
        leadId: currentUser.id,
        signature: currentUser.username,
        technicianId: 'user-samuel',
        technicianName: selectedTechnician
      });
      onAgreementUpdated(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to accept agreement');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecline = async () => {
    const reason = prompt('Please provide a reason for declining this escalation:');
    if (!reason) return;
    try {
      setIsProcessing(true);
      const updated = await api.declineReceivingLead(agreement.id, {
        leadId: currentUser.id,
        reason
      });
      onAgreementUpdated(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to decline');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0 bg-white font-sans overflow-hidden" id="escalation-room-view">
      {/* Center Column: Discussion Stream & Banner (Flex-1) */}
      <div className="flex-1 flex flex-col min-h-0 border-r border-slate-200/90">
        {/* Room Header */}
        <div className="px-5 py-3.5 border-b border-slate-200/90 flex items-center justify-between shrink-0 bg-white">
          <div>
            <h2 className="text-sm font-bold text-slate-900 font-sans">
              {agreement.issueKey || 'ISS-3854'} · {agreement.issueTitle || 'trn test'}
            </h2>
            <p className="text-[11px] text-slate-500 font-sans">
              Escalation room shared by both teams
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex items-center -space-x-1.5">
              <div className="w-7 h-7 rounded-full bg-[#0F142A] text-white flex items-center justify-center text-[10px] font-mono font-bold ring-2 ring-white">
                KI
              </div>
              <div className="w-7 h-7 rounded-full bg-[#F27421] text-white flex items-center justify-center text-[10px] font-mono font-bold ring-2 ring-white">
                MA
              </div>
              <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-mono font-bold ring-2 ring-white">
                TE
              </div>
            </div>
          </div>
        </div>

        {/* Permanent Record Audit Banner */}
        <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 flex items-center space-x-2 text-[11px] text-slate-500 font-sans shrink-0">
          <Lock size={12} className="text-slate-400" />
          <span>Permanent record. Messages and participants cannot be edited or removed.</span>
        </div>

        {error && (
          <div className="m-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center space-x-2 shrink-0">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0 bg-white">
          {/* Milestone Chip */}
          <div className="flex justify-center">
            <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-[10px] font-mono">
              {agreement.status === 'AWAITING_ESCALATING_SIGNATURE' 
                ? 'Escalation raised by @kirubel_ops · 10:40' 
                : 'Escalation received from Card Disputes & Chargebacks Unit · signed by @manager_alex · 10:52'}
            </span>
          </div>

          {/* Big Escalation Callout Card */}
          <div className="p-4 bg-orange-50/40 border border-orange-200 rounded-2xl space-y-2.5">
            <div className="flex items-start justify-between">
              <h3 className="text-xs font-bold text-slate-900 font-sans">
                Escalation: {agreement.escalatingTeamName || 'Card Disputes & Chargebacks Unit'} → {agreement.receivingTeamName || 'Core Operations & Settlement Division'}
              </h3>
              <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-bold font-mono">
                {agreement.priority || 'High'}
              </span>
            </div>
            <p className="text-xs text-slate-700 font-sans leading-relaxed">
              {agreement.reason}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] font-mono text-slate-700 flex items-center space-x-1">
                <Link2 size={11} className="text-slate-400" />
                <span>{agreement.workflowName || 'New Validation Pipeline'}</span>
              </span>
              <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] font-mono text-slate-600">
                {agreement.flaggedCount || 24} of {agreement.totalCount || 500} flagged
              </span>
              <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] font-mono text-slate-600">
                Respond 4h
              </span>
              <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[11px] font-mono text-slate-600">
                Resolve 24h
              </span>
            </div>
          </div>

          {/* Stage Task Action Banner matching Screen 38 Trigger */}
          {onStageTask && (
            <div className="p-4 bg-orange-50/80 border border-[#F27421]/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-[#F27421] text-white flex items-center justify-center font-bold shrink-0">
                  <Flag size={18} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900 text-xs font-mono">{agreement.issueKey || 'ISS-3854'} · {agreement.issueTitle || 'trn test'}</span>
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-bold text-[10px] font-mono">
                      {agreement.priority || 'High'}
                    </span>
                    <span className="text-[10px] text-amber-700 font-medium font-sans">
                      Respond within 38 min
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-sans mt-0.5">
                    Ready for investigation. Open the stage popup to choose Sandbox, Staging, or Production.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onStageTask(targetIssue)}
                className="px-4 py-2 bg-[#F27421] hover:bg-[#e06516] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer shrink-0"
                id="btn-stage-task-room"
              >
                <Flag size={13} />
                <span>Stage task →</span>
              </button>
            </div>
          )}

          {/* Chat Messages */}
          {messages.map(m => (
            <div key={m.id} className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-[#0F142A] text-white flex items-center justify-center text-xs font-mono font-bold shrink-0">
                {m.sender.slice(0, 2).toUpperCase()}
              </div>
              <div className="space-y-1 max-w-[85%]">
                <div className="flex items-center space-x-2 text-xs">
                  <span className="font-bold text-slate-900 font-sans">@{m.sender}</span>
                  <span className="text-slate-400 font-mono text-[10px]">{m.time}</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-xs text-xs text-slate-800 leading-relaxed font-sans">
                  {renderFormattedMessage(m.text)}
                </div>
                {onStageTask && (m.text.includes('ISS-') || m.text.toLowerCase().includes('stage')) && (
                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={() => onStageTask(targetIssue)}
                      className="px-2.5 py-1 rounded-lg bg-orange-50 hover:bg-[#F27421] text-orange-700 hover:text-white border border-orange-200 text-[10px] font-mono font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                    >
                      <Flag size={11} />
                      <span>Stage task ({targetIssue.id}) →</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Status System Chip */}
          <div className="flex justify-center pt-2">
            <span className="px-3.5 py-1.5 bg-slate-100 text-slate-600 rounded-full text-[11px] font-mono">
              {agreement.status === 'AWAITING_ESCALATING_SIGNATURE'
                ? 'Waiting for @manager_alex to assign a checker and sign'
                : agreement.status === 'AWAITING_RECEIVING_ACCEPTANCE'
                ? 'Waiting for @tech_sarah to accept and assign a technician'
                : 'Escalation agreement active · SLA clock running'}
            </span>
          </div>

          {/* If Active, show Contract Link */}
          {agreement.status === 'ACTIVE' && (
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs text-emerald-800 font-sans">
                <ShieldCheck size={16} className="text-emerald-600" />
                <span className="font-semibold">Agreement co-signed by both leads. Terms are locked.</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenAgreementContract(agreement)}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold font-mono transition-colors cursor-pointer flex items-center space-x-1"
                id="btn-view-signed-agreement"
              >
                <span>View signed agreement</span>
                <ArrowRight size={13} />
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Message Input with full @@, @, #, and / support */}
        <div className="p-3.5 border-t border-slate-200 bg-white shrink-0">
          <UnifiedChatInput
            currentUser={currentUser}
            users={effectiveUsers}
            teams={availableTeams}
            hashtags={effectiveHashtags}
            placeholder="Type a message, @ to mention user, @@ for team, / for directives..."
            value={inputText}
            onChange={setInputText}
            onSendMessage={handleSendRoomMessage}
            onExecuteDirective={handleExecuteDirective}
            quickPrompts={[
              'Acknowledged. Investigating discrepancy.',
              '@manager_alex please review and sign.',
              '@checker_ops_2 approval required for resolution.',
              '/create-task',
              '/request-approval'
            ]}
            inputId="input-escalation-room"
            buttonLabel="Send"
          />
        </div>
      </div>

      {/* Right Column: Agreement Action Sidebar (Screen 30 or Screen 31) */}
      <div className="w-full lg:w-88 bg-slate-50/50 flex flex-col justify-between p-5 overflow-y-auto shrink-0 space-y-4">
        {/* Top Agreement Terms */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-900 font-sans">
              {agreement.status === 'AWAITING_RECEIVING_ACCEPTANCE' ? 'Incoming escalation' : 'Escalation agreement'}
            </h3>
            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-mono font-semibold">
              ● {agreement.status === 'AWAITING_RECEIVING_ACCEPTANCE' ? 'Needs acceptance' : 
                  agreement.status === 'AWAITING_ESCALATING_SIGNATURE' ? 'Awaiting signature' : 'Active'}
            </span>
          </div>

          {/* From / To summary */}
          <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 text-xs font-sans">
            <div>
              <span className="text-slate-400">From </span>
              <span className="font-bold text-slate-800">{agreement.escalatingTeamName || 'Card Disputes & Chargebacks'}</span>
              <div className="text-[11px] text-slate-500 font-mono">
                {agreement.status === 'AWAITING_RECEIVING_ACCEPTANCE'
                  ? `Signed by @${agreement.escalatingLeadSignature || 'manager_alex'} 10:52 · checker @${agreement.assignedCheckerName || 'checker_ops_2'}`
                  : `(lead @manager_alex)`}
              </div>
            </div>
            {agreement.status !== 'AWAITING_RECEIVING_ACCEPTANCE' && (
              <div className="border-t border-slate-100 pt-1.5">
                <span className="text-slate-400">To </span>
                <span className="font-bold text-slate-800">{agreement.receivingTeamName || 'Core Operations & Settlement'}</span>
                <div className="text-[11px] text-slate-500 font-mono">(lead @tech_sarah)</div>
              </div>
            )}
            {agreement.status === 'AWAITING_RECEIVING_ACCEPTANCE' && (
              <div className="text-[11px] text-slate-600 font-mono pt-1">
                24 of 500 flagged on settlement amount
              </div>
            )}
          </div>

          {/* Workflow Used */}
          <div>
            <div className="text-[11px] font-semibold text-slate-600 mb-1.5 font-sans">
              {agreement.status === 'AWAITING_RECEIVING_ACCEPTANCE' ? 'Workflow they used' : 'Workflow used'}
            </div>
            <div className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono">
              <span className="flex items-center space-x-1.5 text-slate-800">
                <Link2 size={13} className="text-slate-400" />
                <span>{agreement.workflowName || 'New Validation Pipeline'}</span>
              </span>
              <span className="text-[11px] font-bold text-slate-700 hover:text-[#F27421] cursor-pointer">
                Open
              </span>
            </div>
          </div>

          {/* Agreed KPIs */}
          <div>
            <div className="text-[11px] font-semibold text-slate-600 mb-1.5 font-sans">
              {agreement.status === 'AWAITING_RECEIVING_ACCEPTANCE' ? 'KPIs you are accepting' : 'Agreed KPIs'}
            </div>
            <div className="p-3 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 text-xs font-sans space-y-2">
              <div className="flex justify-between items-center pb-1">
                <span className="text-slate-600">Time to first response</span>
                <span className="font-bold text-slate-900 font-mono">4 hours</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-600">Resolution target</span>
                <span className="font-bold text-slate-900 font-mono">24 hours</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-slate-600">Accuracy of fixes</span>
                <span className="font-bold text-slate-900 font-mono">99%</span>
              </div>
            </div>
            {agreement.status === 'AWAITING_RECEIVING_ACCEPTANCE' && (
              <div className="text-[10px] text-slate-400 italic mt-1 font-sans">
                The clock starts when you accept.
              </div>
            )}
          </div>

          {/* Role Assignment Dropdown */}
          {agreement.status === 'AWAITING_ESCALATING_SIGNATURE' && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1.5 font-sans">
                Your team lead assigns the checker
              </label>
              <select
                value={selectedChecker}
                onChange={e => setSelectedChecker(e.target.value)}
                className="w-full text-xs font-mono bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#F27421]"
                id="select-assign-checker"
              >
                <option value="checker_ops_2">@checker_ops_2 · Admin</option>
                <option value="kirubel_ops">@kirubel_ops · Operations</option>
              </select>
            </div>
          )}

          {agreement.status === 'AWAITING_RECEIVING_ACCEPTANCE' && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1.5 font-sans">
                Assign a technician
              </label>
              <select
                value={selectedTechnician}
                onChange={e => setSelectedTechnician(e.target.value)}
                className="w-full text-xs font-mono bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-[#F27421]"
                id="select-assign-technician"
              >
                <option value="samuel_tech">@samuel_tech · Technical</option>
                <option value="tech_sarah">@tech_sarah · Core Lead</option>
              </select>
            </div>
          )}

          {/* Participants (permanent) */}
          <div className="space-y-2 pt-1">
            <div className="text-[11px] font-semibold text-slate-500 font-sans">
              Participants (permanent)
            </div>
            <div className="space-y-1.5 text-xs font-mono">
              {agreement.status === 'AWAITING_ESCALATING_SIGNATURE' ? (
                <>
                  <div className="flex items-center justify-between p-1.5 bg-white border border-slate-100 rounded-lg">
                    <span className="text-slate-800">@kirubel_ops</span>
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Raised</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 bg-white border border-slate-100 rounded-lg">
                    <span className="text-slate-800">@manager_alex</span>
                    <span className="text-[10px] text-[#F27421] bg-orange-50 px-2 py-0.5 rounded font-bold">Lead · signer</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between p-1.5 bg-white border border-slate-100 rounded-lg">
                    <span className="text-slate-800">@tech_sarah</span>
                    <span className="text-[10px] text-[#F27421] bg-orange-50 px-2 py-0.5 rounded font-bold">Lead · acceptor</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 bg-white border border-slate-100 rounded-lg">
                    <span className="text-slate-800">@samuel_tech</span>
                    <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">Technician</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-3 border-t border-slate-200">
          {agreement.status === 'AWAITING_ESCALATING_SIGNATURE' && (
            <>
              <button
                type="button"
                onClick={handleSignAndSend}
                disabled={isProcessing}
                className="w-full py-2.5 bg-[#F27421] hover:bg-[#e06516] text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 flex items-center justify-center space-x-1.5 cursor-pointer"
                id="btn-sign-send-escalation"
              >
                <ShieldCheck size={14} />
                <span>{isProcessing ? 'Signing...' : 'Sign & send to Core Operations'}</span>
              </button>
              <button
                type="button"
                onClick={() => alert('Escalation withdrawn')}
                className="w-full py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-medium transition-colors cursor-pointer"
              >
                Withdraw escalation
              </button>
            </>
          )}

          {agreement.status === 'AWAITING_RECEIVING_ACCEPTANCE' && (
            <>
              <button
                type="button"
                onClick={handleAcceptAndAssign}
                disabled={isProcessing}
                className="w-full py-2.5 bg-[#F27421] hover:bg-[#e06516] text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 flex items-center justify-center space-x-1.5 cursor-pointer"
                id="btn-accept-escalation"
              >
                <Check size={14} strokeWidth={2.5} />
                <span>{isProcessing ? 'Accepting...' : 'Accept & assign technician'}</span>
              </button>
              <button
                type="button"
                onClick={handleDecline}
                className="w-full py-2 bg-white hover:bg-slate-50 border border-slate-200 text-rose-600 rounded-xl text-xs font-medium transition-colors cursor-pointer"
              >
                Decline with reason
              </button>
            </>
          )}

          {agreement.status === 'ACTIVE' && (
            <>
              {onStageTask && (
                <button
                  type="button"
                  onClick={() => onStageTask(targetIssue)}
                  className="w-full py-2.5 bg-[#F27421] hover:bg-[#e06516] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer"
                  id="btn-stage-task-sidebar"
                >
                  <Flag size={14} />
                  <span>Stage task for investigation →</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenAgreementContract(agreement)}
                className="w-full py-2.5 bg-[#0F142A] hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <FileText size={14} />
                <span>View full signed agreement</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
