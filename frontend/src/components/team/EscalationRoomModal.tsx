/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  X, Send, ShieldAlert, Sparkles, Terminal, ArrowRight, 
  CheckCircle2, AlertTriangle, Hash, Clock, Users, Play,
  FileCheck, Shield, RefreshCw, Tag
} from 'lucide-react';
import { User, Team, Issue } from '../../types';
import { api } from '../../api/client';
import { useGovernance } from '../../context/GovernanceContext';
import { EscalationWorkflowAutonomyBar } from './EscalationWorkflowAutonomyBar';
import UnifiedChatInput, { InChatDirectiveType } from '../chat/UnifiedChatInput';

export interface EscalationMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderTeam?: string;
  content: string;
  timestamp: string;
  isCommand?: boolean;
  commandType?: 'escalate_issue' | 'run_sandbox' | 'request_approval' | 'create_hashtag' | 'unknown';
  commandArgs?: Record<string, string>;
  commandStatus?: 'staged' | 'executed' | 'failed';
  commandOutput?: string;
  idempotencyKey?: string;
}

interface EscalationRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  issue: Issue | null;
  currentUser: User;
  currentTeam?: Team | null;
  availableTeams?: Team[];
  onExecuteSandbox?: (workflowId: string, issueId: string) => void;
  onIssueUpdated?: (updatedIssue: Issue) => void;
}

// Simple fast deterministic 64-bit hash for idempotency keys
function computeIdempotencyKey(...parts: (string | number | undefined | null)[]): string {
  const str = parts.filter(Boolean).join('::');
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `idemp_${part1}${part2}`;
}

export const EscalationRoomModal: React.FC<EscalationRoomModalProps> = ({
  isOpen,
  onClose,
  issue,
  currentUser,
  currentTeam,
  availableTeams = [],
  onExecuteSandbox,
  onIssueUpdated
}) => {
  const { refetchProposals } = useGovernance();
  const [messages, setMessages] = useState<EscalationMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessingCommand, setIsProcessingCommand] = useState(false);
  const [commandFeedback, setCommandFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Set of executed command idempotency keys to strictly guard against duplicates
  const executedCommandKeys = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const issueHashtag = useMemo(() => {
    if (!issue) return '#GENERAL_SETTLEMENT';
    if (issue.hashtag) return issue.hashtag.startsWith('#') ? issue.hashtag : `#${issue.hashtag}`;
    if (issue.key) return `#${issue.key.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}`;
    return '#SETTLEMENT_2026';
  }, [issue]);

  // Initial welcome / system message when opening an issue escalation room
  useEffect(() => {
    if (isOpen && issue) {
      const roomKey = `esc_room_${issue.id}`;
      // In-memory initial seed
      setMessages([
        {
          id: `sys_init_${issue.id}`,
          senderId: 'SYSTEM',
          senderName: 'Incident Orchestrator',
          content: `Operational Escalation Room initialized for ${issue.key} [${issueHashtag}]. Collaborative commands (@escalate_issue, @run_sandbox, @request_approval) are active with Maker-Checker dual authorization.`,
          timestamp: new Date().toISOString(),
          isCommand: false
        }
      ]);
      setCommandFeedback(null);
    }
  }, [isOpen, issue?.id, issueHashtag]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen || !issue) return null;

  // Command parser with slash and at directives
  const parseCommand = (text: string): { 
    isCommand: boolean; 
    type?: 'escalate_issue' | 'run_sandbox' | 'request_approval' | 'create_hashtag' | 'unknown'; 
    args: Record<string, string>;
  } => {
    const trimmed = text.trim();
    if (!trimmed.startsWith('@') && !trimmed.startsWith('/')) {
      return { isCommand: false, args: {} };
    }

    const tokens = trimmed.split(/\s+/);
    const commandTrigger = tokens[0].toLowerCase();

    if (commandTrigger === '@escalate_issue' || commandTrigger === '/escalate' || commandTrigger === '@escalate') {
      const targetTeam = tokens[1] || '';
      const reason = tokens.slice(2).join(' ') || 'Operational escalation requested via Escalation Room';
      return {
        isCommand: true,
        type: 'escalate_issue',
        args: { targetTeam, reason }
      };
    }

    if (commandTrigger === '@run_sandbox' || commandTrigger === '/run_sandbox' || commandTrigger === '/sandbox') {
      const workflowId = tokens[1] || (issue.workflowId || 'default_workflow');
      return {
        isCommand: true,
        type: 'run_sandbox',
        args: { workflowId }
      };
    }

    if (commandTrigger === '@request_approval' || commandTrigger === '/request_approval' || commandTrigger === '/approve') {
      const solution = tokens.slice(1).join(' ') || 'Resolution proposal requested via chat';
      return {
        isCommand: true,
        type: 'request_approval',
        args: { solution }
      };
    }

    if (commandTrigger === '/create-hashtag' || commandTrigger === '@create-hashtag' || commandTrigger === '/create_hashtag' || commandTrigger === '/hashtag') {
      const rawTag = tokens[1] || (issue.linkedHashtag || issue.hashtag || '#AD_HOC_FIX');
      const tag = rawTag.startsWith('#') ? rawTag.toUpperCase() : `#${rawTag.toUpperCase()}`;
      const description = tokens.slice(2).join(' ') || `Resolution preset automatically registered from team escalation for ${issue.key}`;
      return {
        isCommand: true,
        type: 'create_hashtag',
        args: { tag, description }
      };
    }

    return {
      isCommand: true,
      type: 'unknown',
      args: { raw: trimmed }
    };
  };

  const handleSendMessage = async (eOrText?: React.FormEvent | string) => {
    if (eOrText && typeof eOrText !== 'string' && 'preventDefault' in eOrText) {
      eOrText.preventDefault();
    }
    const content = (typeof eOrText === 'string' ? eOrText : inputText).trim();
    if (!content || isProcessingCommand) return;

    setInputText('');
    setCommandFeedback(null);

    const parsed = parseCommand(content);
    const newMsgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    if (!parsed.isCommand) {
      // Normal discussion message
      setMessages(prev => [
        ...prev,
        {
          id: newMsgId,
          senderId: currentUser.id,
          senderName: currentUser.username,
          senderTeam: currentTeam?.name || 'General',
          content,
          timestamp: nowIso
        }
      ]);
      return;
    }

    // Command handling with idempotency guard
    const idempotencyKey = computeIdempotencyKey(
      issue.id,
      parsed.type,
      parsed.args.targetTeam || parsed.args.workflowId || parsed.args.solution,
      issue.status
    );

    if (executedCommandKeys.current.has(idempotencyKey)) {
      setCommandFeedback({
        type: 'error',
        message: `Command duplicate suppressed! An identical action was already executed for this state.`
      });
      return;
    }

    // Add command to chat as staged
    const stagedMessage: EscalationMessage = {
      id: newMsgId,
      senderId: currentUser.id,
      senderName: currentUser.username,
      senderTeam: currentTeam?.name || 'General',
      content,
      timestamp: nowIso,
      isCommand: true,
      commandType: parsed.type,
      commandArgs: parsed.args,
      commandStatus: 'staged',
      idempotencyKey
    };

    setMessages(prev => [...prev, stagedMessage]);
    setIsProcessingCommand(true);

    try {
      if (parsed.type === 'escalate_issue') {
        const targetTeamName = parsed.args.targetTeam;
        const matchedTeam = availableTeams.find(
          t => t.name.toLowerCase() === targetTeamName.toLowerCase() || t.id === targetTeamName
        );

        const targetTeamId = matchedTeam ? matchedTeam.id : targetTeamName;
        const escalationReason = parsed.args.reason;

        // Call backend API to update issue escalation
        const updated = await api.updateIssue(issue.id, {
          escalatedToTeamId: targetTeamId,
          escalationReason: escalationReason,
          status: 'IN_PROGRESS'
        });

        executedCommandKeys.current.add(idempotencyKey);

        setMessages(prev => prev.map(m => m.id === newMsgId ? {
          ...m,
          commandStatus: 'executed',
          commandOutput: `Issue successfully escalated to team [${matchedTeam?.name || targetTeamId}]. Reason: "${escalationReason}"`
        } : m));

        setCommandFeedback({
          type: 'success',
          message: `Escalation confirmed for ${issue.key} -> ${matchedTeam?.name || targetTeamId}`
        });

        if (onIssueUpdated && updated) {
          onIssueUpdated(updated);
        }
      } else if (parsed.type === 'run_sandbox') {
        const wfId = parsed.args.workflowId;
        executedCommandKeys.current.add(idempotencyKey);

        setMessages(prev => prev.map(m => m.id === newMsgId ? {
          ...m,
          commandStatus: 'executed',
          commandOutput: `Triggered sandbox simulation on workflow [${wfId}] for ${issue.key}`
        } : m));

        if (onExecuteSandbox) {
          onExecuteSandbox(wfId, issue.id);
        }

        setCommandFeedback({
          type: 'success',
          message: `Sandbox simulation started with workflow ${wfId}`
        });
      } else if (parsed.type === 'request_approval') {
        // Stage a Maker proposal adhering to Four-Eyes Principle
        const solutionText = parsed.args.solution;
        
        await api.createWorkspaceSettingProposal({
          title: `Resolution for ${issue.key}`,
          settingKey: `issue_resolution_${issue.id}`,
          settingType: 'WORKSPACE_CONFIG',
          currentSnapshot: { issueId: issue.id, status: issue.status },
          proposedChanges: { 
            issueId: issue.id, 
            status: 'RESOLVED',
            action: 'MANUAL_OVERRIDE',
            solution: solutionText,
            hashtag: issueHashtag
          },
          makerId: currentUser.id,
          makerName: currentUser.username,
          teamId: currentTeam?.id || 'general',
          teamName: currentTeam?.name || 'General Team',
          justification: `Escalation Room proposal for ${issue.key} [${issueHashtag}]: ${solutionText}`
        });

        executedCommandKeys.current.add(idempotencyKey);
        await refetchProposals();

        setMessages(prev => prev.map(m => m.id === newMsgId ? {
          ...m,
          commandStatus: 'executed',
          commandOutput: `Maker proposal registered in Governance Center. Awaiting Checker review with Anti-Self-Approval guard.`
        } : m));

        setCommandFeedback({
          type: 'success',
          message: `Maker proposal staged! Available in Governance Center for dual approval.`
        });
      } else if (parsed.type === 'create_hashtag') {
        const tag = parsed.args.tag || '#AUTO_RESOLUTION';
        const description = parsed.args.description || `Solution created from task ${issue.key}`;
        
        await api.createHashtag({
          tag,
          description,
          criteria: 'status == "DISCREPANCY"',
          expectedFileStructure: ['transaction_id', 'bank_code', 'amount', 'status'],
          solutionTemplate: issue.remedySql || `UPDATE transactions SET status = 'RESOLVED' WHERE id = '{{id}}';`,
          author: currentUser.username,
          createdAt: new Date().toISOString(),
          hashtagType: 'FILE_INGESTION',
          workflowId: issue.workflowId,
          minimumRequiredColumns: ['transaction_id', 'amount'],
          dictionaryLookupMappings: {
            bank_code: { sourceCol: 'bank_code', targetCol: 'bank_name', lookupTable: 'global_banks' }
          }
        });

        executedCommandKeys.current.add(idempotencyKey);
        setMessages(prev => prev.map(m => m.id === newMsgId ? {
          ...m,
          commandStatus: 'executed',
          commandOutput: `Universal Hashtag preset [${tag}] created and staged into registry with dictionary resolution and column validation rules.`
        } : m));

        setCommandFeedback({
          type: 'success',
          message: `Hashtag ${tag} created! Accessible across workspace pipelines.`
        });
      } else {
        setMessages(prev => prev.map(m => m.id === newMsgId ? {
          ...m,
          commandStatus: 'failed',
          commandOutput: `Unrecognized command. Valid commands: /escalate [team] [reason], /sandbox [workflowId], /approve [solution], /create-hashtag [tag] [desc]`
        } : m));
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === newMsgId ? {
        ...m,
        commandStatus: 'failed',
        commandOutput: `Execution failed: ${err.message || 'Unknown network error'}`
      } : m));
      setCommandFeedback({
        type: 'error',
        message: err.message || 'Failed to process command'
      });
    } finally {
      setIsProcessingCommand(false);
    }
  };

  const insertCommandTemplate = (template: string) => {
    setInputText(template);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div 
        className="w-full max-w-4xl h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden font-sans"
        id="escalation-room-modal"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl">
              <ShieldAlert size={20} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-sm font-bold tracking-wide text-white">{issue.key}</span>
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded text-xs font-mono font-bold flex items-center gap-1">
                  <Hash size={12} />
                  {issueHashtag.replace(/^#/, '')}
                </span>
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[11px] font-mono font-bold">
                  {issue.status}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-mono mt-0.5 truncate max-w-md">
                {issue.title || 'Operational Discrepancy Escalation'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Close Room"
              id="btn-close-escalation-room"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Command Bar quick links */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex items-center justify-between text-xs font-mono text-slate-600">
          <div className="flex items-center space-x-2">
            <Terminal size={14} className="text-slate-500" />
            <span className="font-bold text-slate-700">Quick Commands:</span>
            <button
              onClick={() => insertCommandTemplate(`/escalate ${availableTeams[0]?.name || 'Settlements'} Discrepancy re-investigation`)}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded text-[11px] transition-colors cursor-pointer flex items-center gap-1"
            >
              <Users size={12} className="text-blue-600" />
              /escalate
            </button>
            <button
              onClick={() => insertCommandTemplate(`@run_sandbox ${issue.workflowId || 'wf_settlement'}`)}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded text-[11px] transition-colors cursor-pointer flex items-center gap-1"
            >
              <Play size={12} className="text-emerald-600" />
              /sandbox
            </button>
            <button
              onClick={() => insertCommandTemplate(`/approve Force match approved based on bank statement audit`)}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded text-[11px] transition-colors cursor-pointer flex items-center gap-1"
            >
              <Shield size={12} className="text-purple-600" />
              /approve
            </button>
            <button
              onClick={() => insertCommandTemplate(`/create-hashtag #${(issue.key || 'TASK').replace(/-/g, '_')}_RESOLVED Automated resolution preset from escalation room`)}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-indigo-200 text-indigo-700 rounded text-[11px] transition-colors cursor-pointer flex items-center gap-1"
            >
              <Tag size={12} className="text-indigo-600" />
              /create-hashtag
            </button>
          </div>

          <span className="text-[11px] text-slate-400">
            Maker: <span className="text-slate-700 font-bold">{currentUser.username}</span>
          </span>
        </div>

        {/* Feedback alert banner */}
        {commandFeedback && (
          <div className={`px-5 py-2 text-xs font-mono flex items-center space-x-2 border-b ${
            commandFeedback.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            {commandFeedback.type === 'success' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            <span>{commandFeedback.message}</span>
          </div>
        )}

        {/* Workflow Autonomy Bar for Technical Handlers */}
        <EscalationWorkflowAutonomyBar
          issue={issue}
          currentUser={currentUser}
          onUpdateIssue={onIssueUpdated}
          onRequestRevisions={(note) => {
            const newMsgId = `rev_${Date.now()}`;
            setMessages(prev => [
              ...prev,
              {
                id: newMsgId,
                senderId: currentUser.id,
                senderName: `${currentUser.username} (Technical Reviewer)`,
                senderTeam: currentTeam?.name || 'Technical',
                content: `⚠️ WORKFLOW REVISION REQUESTED: ${note}`,
                timestamp: new Date().toISOString()
              }
            ]);
          }}
          onExecuteSandbox={onExecuteSandbox}
        />

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/40">
          {messages.map(msg => {
            const isSelf = msg.senderId === currentUser.id;
            const isSystem = msg.senderId === 'SYSTEM';

            if (isSystem) {
              return (
                <div key={msg.id} className="flex items-center space-x-2 p-3 bg-blue-50/80 border border-blue-200/80 rounded-xl text-blue-900 text-xs font-mono">
                  <Sparkles size={16} className="text-blue-600 shrink-0" />
                  <div className="flex-1">
                    <span className="font-bold">{msg.senderName}: </span>
                    {msg.content}
                  </div>
                </div>
              );
            }

            return (
              <div 
                key={msg.id} 
                className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} space-y-1`}
              >
                <div className="flex items-center space-x-2 text-[11px] font-mono text-slate-400">
                  <span className="font-bold text-slate-700">{msg.senderName}</span>
                  {msg.senderName?.includes('(EMAIL)') && (
                    <span className="px-1.5 py-0.5 bg-sky-100 text-sky-700 rounded text-[10px] font-bold border border-sky-200">EMAIL</span>
                  )}
                  {msg.senderName?.includes('(WHATSAPP)') && (
                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold border border-emerald-200">WHATSAPP</span>
                  )}
                  {msg.senderName?.includes('(TEAMS)') && (
                    <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold border border-indigo-200">TEAMS</span>
                  )}
                  {msg.senderName?.includes('(TELEGRAM)') && (
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold border border-blue-200">TELEGRAM</span>
                  )}
                  {msg.senderTeam && (
                    <span className="px-1.5 py-0.2 bg-slate-200 text-slate-600 rounded text-[10px]">
                      {msg.senderTeam}
                    </span>
                  )}
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                {msg.isCommand ? (
                  <div className="w-full max-w-xl bg-slate-900 text-white rounded-xl p-3.5 border border-slate-800 shadow-md font-mono text-xs space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div className="flex items-center space-x-1.5 text-blue-400 font-bold">
                        <Terminal size={14} />
                        <span>COMMAND: {msg.commandType?.toUpperCase()}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        msg.commandStatus === 'executed' ? 'bg-emerald-500/20 text-emerald-400' :
                        msg.commandStatus === 'failed' ? 'bg-rose-500/20 text-rose-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {msg.commandStatus?.toUpperCase()}
                      </span>
                    </div>

                    <div className="text-slate-300 text-xs bg-slate-950 p-2 rounded border border-slate-800/80 break-all">
                      <code>{msg.content}</code>
                    </div>

                    {msg.commandOutput && (
                      <div className="text-[11px] text-slate-300 flex items-start space-x-1.5 pt-1">
                        <ArrowRight size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                        <span>{msg.commandOutput}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`p-3 rounded-2xl text-xs max-w-lg leading-relaxed shadow-2xs ${
                    isSelf 
                      ? 'bg-blue-600 text-white rounded-tr-xs' 
                      : 'bg-white text-slate-800 border border-slate-200 rounded-tl-xs'
                  }`}>
                    {msg.content}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input box */}
        <div className="p-4 border-t border-slate-200 bg-white">
          <UnifiedChatInput
            currentUser={currentUser}
            users={[
              { id: 'u1', username: 'kirubel_ops', fullName: 'Kirubel Operations', role: 'operational' as any, status: 'active' },
              { id: 'u2', username: 'manager_alex', fullName: 'Alex Manager', role: 'manager' as any, status: 'active' },
              { id: 'u3', username: 'tech_sarah', fullName: 'Sarah Technician', role: 'tech' as any, status: 'active' },
              { id: 'u4', username: 'samuel_tech', fullName: 'Samuel Technician', role: 'tech' as any, status: 'active' },
              { id: 'u5', username: 'checker_ops_2', fullName: 'Checker Ops 2', role: 'operational' as any, status: 'active' },
              { id: 'u6', username: 'admin', fullName: 'System Administrator', role: 'admin' as any, status: 'active' }
            ]}
            teams={availableTeams}
            hashtags={[
              { id: 'h1', tag: 'AIB_SETTLEMENT_2026', name: 'AIB Settlement 2026', description: 'Reconciliation preset for AIB' } as any,
              { id: 'h2', tag: 'SETTLEMENT_AMOUNT_ROUNDING', name: 'Settlement Amount Rounding', description: 'Fee rounding reconciliation' } as any,
              { id: 'h3', tag: 'FEE_VARIANCE_SWEEP', name: 'Fee Variance Sweep', description: 'Monthly fee tolerance sweep' } as any
            ]}
            placeholder="Type a message, @ to mention user, @@ for team, / for directives..."
            value={inputText}
            onChange={setInputText}
            disabled={isProcessingCommand}
            onSendMessage={(content) => {
              handleSendMessage(content);
            }}
            onExecuteDirective={(directive) => {
              if (directive === 'create-escalate') {
                setInputText('@escalate_issue to="Core Operations" reason="Urgent escalation"');
              } else if (directive === 'request-approval') {
                setInputText('@request_approval solution="Manual settlement override"');
              } else if (directive === 'create-task') {
                setInputText(`/create-task issue="${issue?.id || 'ISS-3854'}"`);
              } else if (directive === 'call-hashtag') {
                setInputText('#SETTLEMENT_AMOUNT_ROUNDING');
              }
            }}
            inputId="input-escalation-chat"
            buttonLabel={isProcessingCommand ? 'Processing...' : 'Send'}
          />
        </div>
      </div>
    </div>
  );
};
