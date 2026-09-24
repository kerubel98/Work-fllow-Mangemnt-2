/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  X, Send, ShieldAlert, Sparkles, Terminal, ArrowRight, 
  CheckCircle2, AlertTriangle, Hash, Clock, Users, Play,
  FileCheck, Shield, RefreshCw
} from 'lucide-react';
import { User, Team, Issue } from '../../types';
import { api } from '../../api/client';
import { useGovernance } from '../../context/GovernanceContext';
import { EscalationWorkflowAutonomyBar } from './EscalationWorkflowAutonomyBar';

export interface EscalationMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderTeam?: string;
  content: string;
  timestamp: string;
  isCommand?: boolean;
  commandType?: 'escalate_issue' | 'run_sandbox' | 'request_approval' | 'unknown';
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
  const { refreshProposals } = useGovernance();
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

  // Command parser
  const parseCommand = (text: string): { 
    isCommand: boolean; 
    type?: 'escalate_issue' | 'run_sandbox' | 'request_approval' | 'unknown'; 
    args: Record<string, string>;
  } => {
    const trimmed = text.trim();
    if (!trimmed.startsWith('@')) {
      return { isCommand: false, args: {} };
    }

    const tokens = trimmed.split(/\s+/);
    const commandTrigger = tokens[0].toLowerCase();

    if (commandTrigger === '@escalate_issue') {
      const targetTeam = tokens[1] || '';
      const reason = tokens.slice(2).join(' ') || 'Operational escalation requested via Escalation Room';
      return {
        isCommand: true,
        type: 'escalate_issue',
        args: { targetTeam, reason }
      };
    }

    if (commandTrigger === '@run_sandbox') {
      const workflowId = tokens[1] || (issue.workflowId || 'default_workflow');
      return {
        isCommand: true,
        type: 'run_sandbox',
        args: { workflowId }
      };
    }

    if (commandTrigger === '@request_approval') {
      const solution = tokens.slice(1).join(' ') || 'Resolution proposal requested via chat';
      return {
        isCommand: true,
        type: 'request_approval',
        args: { solution }
      };
    }

    return {
      isCommand: true,
      type: 'unknown',
      args: { raw: trimmed }
    };
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const content = inputText.trim();
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
          settingKey: `issue_resolution_${issue.id}`,
          settingType: 'SYSTEM_CONFIG',
          currentValue: { issueId: issue.id, status: issue.status },
          proposedValue: { 
            issueId: issue.id, 
            status: 'RESOLVED',
            action: 'MANUAL_OVERRIDE',
            solution: solutionText,
            hashtag: issueHashtag
          },
          makerId: currentUser.id,
          makerName: currentUser.username,
          makerTeamId: currentTeam?.id || 'general',
          makerTeamName: currentTeam?.name || 'General Team',
          rationale: `Escalation Room proposal for ${issue.key} [${issueHashtag}]: ${solutionText}`
        });

        executedCommandKeys.current.add(idempotencyKey);
        await refreshProposals();

        setMessages(prev => prev.map(m => m.id === newMsgId ? {
          ...m,
          commandStatus: 'executed',
          commandOutput: `Maker proposal registered in Governance Center. Awaiting Checker review with Anti-Self-Approval guard.`
        } : m));

        setCommandFeedback({
          type: 'success',
          message: `Maker proposal staged! Available in Governance Center for dual approval.`
        });
      } else {
        setMessages(prev => prev.map(m => m.id === newMsgId ? {
          ...m,
          commandStatus: 'failed',
          commandOutput: `Unrecognized command. Valid commands: @escalate_issue [team] [reason], @run_sandbox [workflowId], @request_approval [solution]`
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
              onClick={() => insertCommandTemplate(`@escalate_issue ${availableTeams[0]?.name || 'Settlements'} Re-reconciliation discrepancy`)}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded text-[11px] transition-colors cursor-pointer flex items-center gap-1"
            >
              <Users size={12} className="text-blue-600" />
              @escalate_issue
            </button>
            <button
              onClick={() => insertCommandTemplate(`@run_sandbox ${issue.workflowId || 'wf_settlement'}`)}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded text-[11px] transition-colors cursor-pointer flex items-center gap-1"
            >
              <Play size={12} className="text-emerald-600" />
              @run_sandbox
            </button>
            <button
              onClick={() => insertCommandTemplate(`@request_approval Force match approved based on bank statement audit`)}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded text-[11px] transition-colors cursor-pointer flex items-center gap-1"
            >
              <Shield size={12} className="text-purple-600" />
              @request_approval
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
        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 bg-white flex items-center space-x-2">
          <input
            type="text"
            placeholder="Type a message or command (@escalate_issue, @run_sandbox, @request_approval)..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isProcessingCommand}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-mono focus:outline-none focus:border-blue-500 text-slate-800 disabled:opacity-60"
            id="input-escalation-chat"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isProcessingCommand}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-mono font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0"
            id="btn-send-escalation"
          >
            {isProcessingCommand ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            <span>{isProcessingCommand ? 'Processing...' : 'Send'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
