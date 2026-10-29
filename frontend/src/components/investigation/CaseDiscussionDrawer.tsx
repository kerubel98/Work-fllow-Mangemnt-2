/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  X, MessageSquare, Flag, Paperclip, FileText, Send, 
  Link2, CheckCircle2, Clock, ShieldAlert, ArrowRight, CornerDownLeft
} from 'lucide-react';
import { Issue, User, Team, EscalationAgreement, HashtagPreset } from '../../types';
import { api } from '../../api/client';
import { EscalateToTeamModal } from '../team/EscalateToTeamModal';
import UnifiedChatInput, { InChatDirectiveType } from '../chat/UnifiedChatInput';

export interface CaseDiscussionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  issue: Issue;
  currentUser?: User | null;
  currentTeam?: Team | null;
  availableTeams?: Team[];
  activeAgreement?: EscalationAgreement | null;
  onOpenEscalationRoom?: (agreement: EscalationAgreement) => void;
  onOpenEscalateModal?: () => void;
}

interface ThreadMessage {
  id: string;
  senderId: string;
  senderName: string;
  avatarText: string;
  timestamp: string;
  content: string;
  attachedSummary?: {
    flaggedCount: number;
    rulesCount: number;
  };
}

export const CaseDiscussionDrawer: React.FC<CaseDiscussionDrawerProps> = ({
  isOpen,
  onClose,
  issue,
  currentUser,
  currentTeam,
  availableTeams = [],
  activeAgreement = null,
  onOpenEscalationRoom,
  onOpenEscalateModal
}) => {
  if (!isOpen) return null;

  const [inputText, setInputText] = useState('');
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [agreement, setAgreement] = useState<EscalationAgreement | null>(activeAgreement);
  const [isLoadingAgreement, setIsLoadingAgreement] = useState(false);

  useEffect(() => {
    if (activeAgreement) {
      setAgreement(activeAgreement);
    }
  }, [activeAgreement]);

  // Thread messages state
  const [messages, setMessages] = useState<ThreadMessage[]>([
    {
      id: 'msg-init-1',
      senderId: 'kirubel_ops',
      senderName: 'kirubel_ops',
      avatarText: 'KI',
      timestamp: '10:32',
      content: 'Evaluated records against validation rules. 24 of 500 are flagged on settlement amount.',
      attachedSummary: {
        flaggedCount: 24,
        rulesCount: 3
      }
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch active escalation agreement for this issue if already created
  useEffect(() => {
    let isMounted = true;
    const fetchAgreement = async () => {
      try {
        setIsLoadingAgreement(true);
        const agreements = await api.getEscalationAgreements({ issueId: issue.id });
        if (isMounted && agreements && agreements.length > 0) {
          setAgreement(agreements[0]);
        }
      } catch (err) {
        console.error('Failed to load agreement:', err);
      } finally {
        if (isMounted) setIsLoadingAgreement(false);
      }
    };

    fetchAgreement();
    return () => { isMounted = false; };
  }, [issue.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agreement]);

  const handleSendMessage = (contentToSend?: string | React.FormEvent) => {
    let trimmed = '';
    if (typeof contentToSend === 'string') {
      trimmed = contentToSend.trim();
    } else {
      if (contentToSend) contentToSend.preventDefault();
      trimmed = inputText.trim();
    }

    if (!trimmed) return;

    if (trimmed.startsWith('/create-escalate') || trimmed === '/escalate') {
      setInputText('');
      if (onOpenEscalateModal) {
        onOpenEscalateModal();
      } else {
        setShowEscalateModal(true);
      }
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const currentUsername = currentUser?.username || 'operator';
    const currentId = currentUser?.id || 'u-anon';
    const initials = currentUsername.slice(0, 2).toUpperCase();

    setMessages(prev => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        senderId: currentId,
        senderName: currentUsername,
        avatarText: initials,
        timestamp: timeStr,
        content: trimmed
      }
    ]);

    setInputText('');
  };

  const handleExecuteDirective = (directive: InChatDirectiveType, currentContext: string) => {
    if (directive === 'create-escalate') {
      if (onOpenEscalateModal) {
        onOpenEscalateModal();
      } else {
        setShowEscalateModal(true);
      }
    } else if (directive === 'create-task') {
      setInputText(`[Directive: Staged task ${issueKey} for investigation]`);
    } else if (directive === 'request-approval') {
      setInputText(`@request_approval solution="Manual settlement override" issue="${issueKey}"`);
    } else if (directive === 'call-hashtag') {
      setInputText('#SETTLEMENT_AMOUNT_ROUNDING');
    } else if (directive === 'create-hashtag') {
      setInputText('/create-hashtag tag="#NEW_PRESET"');
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

  const handleQuickChipClick = (tag: string) => {
    setInputText(prev => prev ? `${prev} ${tag} ` : `${tag} `);
  };

  const handleEscalationCreated = (newAgreement: EscalationAgreement) => {
    setAgreement(newAgreement);
    setShowEscalateModal(false);
  };

  const issueKey = issue.key || issue.id || 'ISS-3854';
  const issueTitle = issue.title || 'trn test';
  const flaggedCount = issue.transactionCount ? Math.round(issue.transactionCount * 0.05) : 24;
  const totalCount = issue.transactionCount || 500;

  return (
    <>
      <div 
        className="fixed inset-y-0 right-0 z-40 w-full max-w-xl bg-white shadow-2xl border-l border-slate-200 flex flex-col font-sans animate-in slide-in-from-right duration-200"
        id="case-discussion-drawer"
      >
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-slate-200/90 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
              <MessageSquare size={16} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-slate-900 font-sans">Case discussion</h3>
                <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-md text-[11px] font-mono font-semibold">
                  {issueKey}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-sans">
                Discuss, mention people, and hand the case to another team
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            {/* Avatars */}
            <div className="flex items-center -space-x-1.5">
              <div className="w-7 h-7 rounded-full bg-[#0F142A] text-white flex items-center justify-center text-[10px] font-mono font-bold ring-2 ring-white">
                KI
              </div>
              <div className="w-7 h-7 rounded-full bg-[#F27421] text-white flex items-center justify-center text-[10px] font-mono font-bold ring-2 ring-white">
                MA
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Case Summary Bar */}
        <div className="px-5 py-2.5 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 text-xs">
            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-semibold text-[11px]">
              {issue.priority || 'Medium'}
            </span>
            <span className="text-slate-600 font-mono text-[11px]">
              {issueTitle} · {flaggedCount} of {totalCount} flagged
            </span>
          </div>

          <button
            onClick={() => {
              if (onOpenEscalateModal) {
                onOpenEscalateModal();
              } else {
                setShowEscalateModal(true);
              }
            }}
            className="px-3 py-1 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer"
            id="btn-drawer-escalate"
          >
            <Flag size={13} className="text-slate-600" />
            <span>Escalate</span>
          </button>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0 bg-white">
          {/* System Opened Chip */}
          <div className="flex justify-center">
            <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-[10px] font-mono">
              Discussion opened by @kirubel_ops · 23 Oct, 10:31
            </span>
          </div>

          {/* User Messages */}
          {messages.map(msg => (
            <div key={msg.id} className="flex items-start space-x-3">
              <div className="w-8 h-8 rounded-full bg-[#0F142A] text-white flex items-center justify-center text-xs font-mono font-bold shrink-0">
                {msg.avatarText}
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center space-x-2 text-xs">
                  <span className="font-bold text-slate-900 font-sans">@{msg.senderName}</span>
                  <span className="text-slate-400 font-mono text-[10px]">{msg.timestamp}</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl rounded-tl-xs text-xs text-slate-800 leading-relaxed font-sans">
                  {renderFormattedMessage(msg.content)}
                </div>

                {msg.attachedSummary && (
                  <div className="inline-flex items-center space-x-2 px-3 py-1.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-mono">
                    <FileText size={14} className="text-emerald-600" />
                    <span className="font-bold">Investigation summary</span>
                    <span className="text-emerald-600">
                      {msg.attachedSummary.flaggedCount} flagged · {msg.attachedSummary.rulesCount} rules
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Distinct Orange Escalated Callout Card (Screen 27) */}
          {agreement && (
            <div className="p-4 bg-orange-50/40 border border-orange-200 rounded-2xl space-y-3 relative">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-2.5">
                  <div className="w-6 h-6 rounded-md bg-orange-100 text-[#F27421] flex items-center justify-center shrink-0 mt-0.5">
                    <Flag size={14} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 font-sans">
                      Escalated to @@{agreement.receivingTeamName || 'Core Operations & Settlement Division'}
                    </h4>
                    <p className="text-[11px] text-slate-500 font-mono">
                      by @{agreement.raisedByUsername || 'kirubel_ops'} · 10:40
                    </p>
                  </div>
                </div>

                <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px] font-mono font-semibold">
                  {agreement.status === 'AWAITING_ESCALATING_SIGNATURE' ? 'Waiting for signature' : 
                   agreement.status === 'AWAITING_RECEIVING_ACCEPTANCE' ? 'Needs acceptance' : 'Active'}
                </span>
              </div>

              <p className="text-xs text-slate-700 font-sans leading-relaxed">
                {agreement.reason}
              </p>

              {/* Metadata chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[11px] font-mono text-slate-700 flex items-center space-x-1">
                  <Link2 size={11} className="text-slate-400" />
                  <span>{agreement.workflowName || 'New Validation Pipeline'}</span>
                </span>
                <span className="px-2 py-0.5 bg-white border border-rose-200 text-rose-600 rounded-md text-[11px] font-mono font-bold">
                  {agreement.priority || 'High'}
                </span>
                <span className="px-2 py-0.5 bg-white border border-slate-200 text-slate-600 rounded-md text-[11px] font-mono">
                  Respond 4h
                </span>
                <span className="px-2 py-0.5 bg-white border border-slate-200 text-slate-600 rounded-md text-[11px] font-mono">
                  Resolve 24h
                </span>
              </div>

              {/* Open Escalation Room Link */}
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => onOpenEscalationRoom(agreement)}
                  className="text-xs font-bold text-slate-900 hover:text-[#F27421] flex items-center space-x-1 transition-colors cursor-pointer"
                  id="link-open-escalation-room"
                >
                  <span>Open escalation room</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Composer Area */}
        <div className="p-3.5 border-t border-slate-200 bg-white space-y-2 shrink-0">
          {/* Quick Autocomplete Chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
            <span className="text-slate-400 font-sans">People</span>
            {['@admin', '@kirubel_ops', '@tech_sarah', '@manager_alex'].map(p => (
              <button
                key={p}
                type="button"
                onClick={() => handleQuickChipClick(p)}
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer transition-colors"
              >
                {p}
              </button>
            ))}

            <span className="text-slate-400 font-sans ml-2">Teams</span>
            {['@@Card Disputes', '@@Core Operations'].map(t => (
              <button
                key={t}
                type="button"
                onClick={() => handleQuickChipClick(t)}
                className="px-2 py-0.5 bg-orange-50 hover:bg-orange-100 text-[#F27421] rounded-md cursor-pointer transition-colors"
              >
                {t}
              </button>
            ))}
          </div>

          {/* Unified Chat Input with full popover triggers for @, @@, #, and / */}
          <UnifiedChatInput
            currentUser={currentUser || { id: 'u-anon', username: 'operator', fullName: 'Operator', role: 'operational' as any, status: 'active' }}
            users={[
              { id: 'u1', username: 'kirubel_ops', fullName: 'Kirubel Operations', role: 'operational' as any, status: 'active' },
              { id: 'u2', username: 'manager_alex', fullName: 'Alex Manager', role: 'manager' as any, status: 'active' },
              { id: 'u3', username: 'tech_sarah', fullName: 'Sarah Technician', role: 'tech' as any, status: 'active' },
              { id: 'u4', username: 'samuel_tech', fullName: 'Samuel Technician', role: 'tech' as any, status: 'active' },
              { id: 'u5', username: 'checker_ops_2', fullName: 'Checker Ops 2', role: 'operational' as any, status: 'active' },
              { id: 'u6', username: 'admin', fullName: 'System Administrator', role: 'admin' as any, status: 'active' }
            ]}
            teams={availableTeams.length > 0 ? availableTeams : [
              { id: 't1', name: 'Core Operations & Settlement Division', department: 'Operations' } as any,
              { id: 't2', name: 'Card Disputes & Chargebacks Unit', department: 'Disputes' } as any
            ]}
            hashtags={[
              { id: 'h1', tag: 'AIB_SETTLEMENT_2026', name: 'AIB Settlement 2026', description: 'Reconciliation preset for AIB' } as any,
              { id: 'h2', tag: 'SETTLEMENT_AMOUNT_ROUNDING', name: 'Settlement Amount Rounding', description: 'Fee rounding reconciliation' } as any
            ]}
            placeholder="Discuss, @person, @@team, #automation, / commands..."
            value={inputText}
            onChange={setInputText}
            onSendMessage={(content) => handleSendMessage(content)}
            onExecuteDirective={handleExecuteDirective}
            quickPrompts={[
              '/create-escalate',
              '@manager_alex please review',
              '/request-approval',
              '#SETTLEMENT_AMOUNT_ROUNDING'
            ]}
            inputId="input-case-discussion"
            buttonLabel="Send"
          />

          {/* Quick Action Toolbar */}
          <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => handleQuickChipClick('[Investigation Summary Attached]')}
                className="flex items-center space-x-1 text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <Paperclip size={13} />
                <span>Attach summary</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickChipClick('/request-approval Propose fix script')}
                className="flex items-center space-x-1 text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                <FileText size={13} />
                <span>Propose script</span>
              </button>
            </div>

            <div className="text-[11px] text-slate-400 font-mono">
              @ people · @@ teams · / commands
            </div>
          </div>
        </div>
      </div>

      {/* Escalate Modal (Screen 29) */}
      <EscalateToTeamModal
        isOpen={showEscalateModal}
        onClose={() => setShowEscalateModal(false)}
        issue={issue}
        currentUser={currentUser}
        currentTeam={currentTeam}
        availableTeams={availableTeams}
        onEscalationCreated={handleEscalationCreated}
      />
    </>
  );
};
