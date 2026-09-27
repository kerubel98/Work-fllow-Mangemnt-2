/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Team, User, MailboxThread, MailboxMessage, MailboxAttachment, 
  SupportedMessageChannel, TaskPreFillFromMessage 
} from '../../types';
import { api } from '../../api/client';
import { 
  Mail, MessageSquare, Send, Paperclip, CheckCircle2, Clock, 
  Search, RefreshCw, PlusCircle, Reply, AlertCircle, ExternalLink, 
  FileSpreadsheet, FileText, Download, ChevronRight, User as UserIcon,
  ShieldCheck, ArrowUpRight, ArrowDownLeft, Filter, Tag, Check
} from 'lucide-react';

interface TeamMailboxTabProps {
  currentTeam: Team;
  currentUser: User;
  onNavigateToTaskCreation?: (preFill: TaskPreFillFromMessage) => void;
  onOpenIssueInWorkspace?: (issueId: string) => void;
}

export const TeamMailboxTab: React.FC<TeamMailboxTabProps> = ({
  currentTeam,
  currentUser,
  onNavigateToTaskCreation,
  onOpenIssueInWorkspace
}) => {
  const [threads, setThreads] = useState<MailboxThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'inbound' | 'outbound' | 'unassigned'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Reply composer state
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replySuccessMsg, setReplySuccessMsg] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Attachment inspection modal
  const [inspectingAttachment, setInspectingAttachment] = useState<MailboxAttachment | null>(null);

  // Fetch mailbox data
  const loadMailbox = async (isBackground = false) => {
    if (!currentTeam) return;
    if (!isBackground) setIsLoading(true);
    setFetchError(null);
    try {
      const res = await api.getTeamMailbox(currentTeam.id, filter, searchQuery.trim() || undefined);
      if (res && Array.isArray(res.threads)) {
        setThreads(res.threads);
        // Default select first thread if none selected or current selected is not in list
        if (res.threads.length > 0) {
          if (!selectedThreadId || !res.threads.some(t => t.threadId === selectedThreadId)) {
            setSelectedThreadId(res.threads[0].threadId);
          }
        } else {
          setSelectedThreadId(null);
        }
      }
    } catch (err: any) {
      console.error('Failed to load team mailbox:', err);
      setFetchError(err.message || 'Could not load team mailbox messages.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadMailbox();
  }, [currentTeam?.id, filter]);

  // Handle Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      loadMailbox(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const selectedThread = threads.find(t => t.threadId === selectedThreadId);

  // Filtered threads list
  const filteredThreads = React.useMemo(() => {
    if (filter === 'unassigned') {
      return threads.filter(t => !t.taskCreated && !t.linkedIssueId);
    }
    return threads;
  }, [threads, filter]);

  // Channel UI helper
  const getChannelBadge = (channel: SupportedMessageChannel) => {
    switch (channel) {
      case 'email':
        return { label: 'Email', icon: Mail, bg: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'teams':
        return { label: 'Teams', icon: MessageSquare, bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'whatsapp':
        return { label: 'WhatsApp', icon: MessageSquare, bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'telegram':
        return { label: 'Telegram', icon: Send, bg: 'bg-sky-50 text-sky-700 border-sky-200' };
      default:
        return { label: 'Message', icon: Mail, bg: 'bg-slate-50 text-slate-700 border-slate-200' };
    }
  };

  // Format relative time helper
  const formatTimeAgo = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  // Convert Message to Task Action
  const handleAddToTask = (thread: MailboxThread) => {
    if (!onNavigateToTaskCreation) {
      alert('Task creator navigation is not configured in this view.');
      return;
    }

    // Find first incoming message to extract sender & attachments
    const firstInbound = thread.messages.find(m => m.direction === 'inbound') || thread.messages[0];
    const sourceMessageId = firstInbound?.id || thread.threadId;

    // Collect all attachments from thread
    const allAttachments = thread.attachments || [];

    const preFill: TaskPreFillFromMessage = {
      sourceMessageId,
      threadId: thread.threadId,
      title: thread.subject,
      description: `[Ingested via ${thread.channel.toUpperCase()} from ${firstInbound?.sender_address || 'External'}]\n\n${firstInbound?.text_body || ''}`,
      teamId: currentTeam.id,
      channel: thread.channel,
      senderName: firstInbound?.sender_name,
      senderAddress: firstInbound?.sender_address,
      taskVisibility: 'TEAM_PUBLIC',
      attachments: allAttachments
    };

    onNavigateToTaskCreation(preFill);
  };

  // Send Reply Action
  const handleSendReply = async () => {
    if (!selectedThread || !replyBody.trim()) return;

    // Determine recipient: find last inbound sender, or first participant
    const lastInbound = [...selectedThread.messages].reverse().find(m => m.direction === 'inbound');
    const toAddress = lastInbound?.sender_address || selectedThread.participants[0]?.address;

    if (!toAddress) {
      setReplyError('Could not resolve external recipient address for reply.');
      return;
    }

    setIsSendingReply(true);
    setReplyError(null);
    setReplySuccessMsg(null);

    try {
      await api.replyToMessage({
        teamId: currentTeam.id,
        channel: selectedThread.channel,
        to: toAddress,
        subject: selectedThread.subject.startsWith('Re:') ? selectedThread.subject : `Re: ${selectedThread.subject}`,
        textBody: replyBody.trim(),
        conversationId: selectedThread.threadId,
        threadId: selectedThread.threadId,
        inReplyToMessageId: lastInbound?.id
      });

      setReplySuccessMsg('Reply dispatched successfully to outbox!');
      setReplyBody('');
      setShowReplyComposer(false);

      // Refresh thread
      await loadMailbox(true);
      setTimeout(() => setReplySuccessMsg(null), 4000);
    } catch (err: any) {
      console.error('Failed to send reply:', err);
      setReplyError(err.message || 'Failed to dispatch outbound reply.');
    } finally {
      setIsSendingReply(false);
    }
  };

  // Helper to download or open attachment
  const handleDownloadAttachment = (att: MailboxAttachment) => {
    if (att.rawBase64) {
      const mime = att.mimeType || 'application/octet-stream';
      const link = document.createElement('a');
      link.href = `data:${mime};base64,${att.rawBase64}`;
      link.download = att.filename;
      link.click();
    } else {
      alert(`Storage path: ${att.storagePath || 'Stored in cluster storage archive'}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full min-h-[550px] bg-slate-50/50 rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs font-sans" id="team-mailbox-container">
      {/* ========================================================
          LEFT COLUMN: THREAD LIST, SEARCH & FILTERS
         ======================================================== */}
      <div className="w-full md:w-96 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-white shrink-0">
        {/* Header & Search */}
        <div className="p-3.5 border-b border-slate-100 space-y-3 bg-slate-50/70">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <Mail size={15} />
              </div>
              <div>
                <h3 className="text-xs font-bold font-mono text-slate-800 tracking-tight">TEAM MAILBOX</h3>
                <p className="text-[10px] text-slate-500 font-mono">Consolidated Inbound & Outbound</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsRefreshing(true);
                loadMailbox(true);
              }}
              className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              title="Refresh Mailbox"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-blue-600' : ''} />
            </button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search sender, subject, keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-sans"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar pt-0.5">
            {[
              { id: 'all', label: 'All' },
              { id: 'inbound', label: 'Inbound' },
              { id: 'outbound', label: 'Outbound' },
              { id: 'unassigned', label: 'Needs Task' }
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id as any)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-all cursor-pointer whitespace-nowrap ${
                  filter === f.id
                    ? 'bg-slate-900 text-white font-bold shadow-2xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Thread List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400 text-xs font-mono flex flex-col items-center justify-center space-y-2">
              <RefreshCw size={18} className="animate-spin text-blue-500" />
              <span>Collating mailbox threads...</span>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs font-mono space-y-2">
              <Mail size={24} className="mx-auto text-slate-300" />
              <p>No messages match the current filter.</p>
              {filter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className="text-blue-600 hover:underline text-[11px]"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            filteredThreads.map(thread => {
              const isSelected = thread.threadId === selectedThreadId;
              const badge = getChannelBadge(thread.channel);
              const ChannelIcon = badge.icon;
              const firstSender = thread.participants[0]?.name || thread.participants[0]?.address || 'External';

              return (
                <div
                  key={thread.threadId}
                  onClick={() => setSelectedThreadId(thread.threadId)}
                  className={`p-3 text-left transition-all cursor-pointer relative group ${
                    isSelected 
                      ? 'bg-blue-50/80 border-l-4 border-l-blue-600' 
                      : 'hover:bg-slate-50/90 border-l-4 border-l-transparent'
                  }`}
                >
                  {/* Top line: Sender + Timestamp */}
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <div className="flex items-center space-x-1.5 min-w-0 pr-1">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono border flex items-center space-x-1 ${badge.bg}`}>
                        <ChannelIcon size={10} />
                        <span className="capitalize">{badge.label}</span>
                      </span>
                      <span className={`truncate font-semibold text-slate-900 ${thread.unread ? 'font-bold' : ''}`}>
                        {firstSender}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap shrink-0">
                      {formatTimeAgo(thread.latestMessageAt)}
                    </span>
                  </div>

                  {/* Subject */}
                  <h4 className={`text-xs text-slate-800 truncate mb-1 ${thread.unread ? 'font-bold text-slate-900' : 'font-medium'}`}>
                    {thread.subject}
                  </h4>

                  {/* Snippet */}
                  <p className="text-[11px] text-slate-500 line-clamp-1 mb-2 font-normal leading-relaxed">
                    {thread.snippet || 'No message content preview.'}
                  </p>

                  {/* Footer status chips */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {/* Anti-Duplication: Task Created Status Badge */}
                    {thread.taskCreated || thread.linkedIssueId ? (
                      <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-bold">
                        <CheckCircle2 size={11} className="text-emerald-600" />
                        <span>✓ Task #{thread.linkedIssueId || 'CREATED'}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-mono">
                        <Clock size={10} />
                        <span>Needs Task</span>
                      </span>
                    )}

                    {/* Attachments Indicator */}
                    {thread.hasAttachments && (
                      <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-mono">
                        <Paperclip size={10} />
                        <span>{thread.attachments.length}</span>
                      </span>
                    )}

                    {/* Messages in thread counter */}
                    {thread.messages.length > 1 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-slate-200/70 text-slate-600 text-[9px] font-mono ml-auto">
                        {thread.messages.length} msgs
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ========================================================
          RIGHT COLUMN: SELECTED THREAD INSPECTION & COMPOSER
         ======================================================== */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden min-w-0">
        {!selectedThread ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <Mail size={36} className="text-slate-200 mb-3" />
            <h4 className="text-sm font-bold text-slate-700 font-mono">No Thread Selected</h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              Select an email or conversation from the left to inspect contents, attachments, and collaborate with your team.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Thread Header Bar */}
            <div className="p-4 border-b border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-mono border capitalize flex items-center space-x-1 ${getChannelBadge(selectedThread.channel).bg}`}>
                    {React.createElement(getChannelBadge(selectedThread.channel).icon, { size: 11 })}
                    <span>{selectedThread.channel}</span>
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    Thread ID: {selectedThread.threadId.substring(0, 16)}
                  </span>
                </div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 font-mono truncate" title={selectedThread.subject}>
                  {selectedThread.subject}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="text-[11px] text-slate-500 font-medium">Participants:</span>
                  {selectedThread.participants.map((p, idx) => (
                    <span 
                      key={idx} 
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                        p.direction === 'inbound' 
                          ? 'bg-blue-50 text-blue-700 border-blue-200' 
                          : 'bg-purple-50 text-purple-700 border-purple-200'
                      }`}
                    >
                      {p.name || p.address} {p.direction === 'outbound' && '(Team Out)'}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Buttons: Add to Task / View Task / Respond */}
              <div className="flex items-center space-x-2 shrink-0 self-start sm:self-center">
                {/* Anti-Duplication Status Button */}
                {selectedThread.taskCreated || selectedThread.linkedIssueId ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedThread.linkedIssueId && onOpenIssueInWorkspace) {
                        onOpenIssueInWorkspace(selectedThread.linkedIssueId);
                      } else {
                        alert(`Task #${selectedThread.linkedIssueId || 'CREATED'} is already active for this conversation.`);
                      }
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-mono font-bold flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
                    title="A task has already been created from this conversation thread"
                  >
                    <CheckCircle2 size={13} />
                    <span>✓ Task #{selectedThread.linkedIssueId || 'Active'}</span>
                    <ExternalLink size={12} className="opacity-80" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAddToTask(selectedThread)}
                    className="px-3 py-1.5 bg-[#155DFC] hover:bg-blue-700 text-white rounded-xl text-xs font-mono font-bold flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer group"
                    title="Convert incoming message and attachments into a Team Public task"
                  >
                    <PlusCircle size={13} />
                    <span>Add to Task</span>
                    <span className="hidden lg:inline text-[10px] bg-blue-800/60 px-1 py-0.2 rounded font-sans font-normal">Team Public</span>
                  </button>
                )}

                {/* Reply Button */}
                <button
                  type="button"
                  onClick={() => setShowReplyComposer(!showReplyComposer)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold flex items-center space-x-1.5 transition-all cursor-pointer border ${
                    showReplyComposer 
                      ? 'bg-slate-800 text-white border-slate-800' 
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  <Reply size={13} />
                  <span>Respond</span>
                </button>
              </div>
            </div>

            {/* Anti-Duplication Warning Banner if task already exists */}
            {(selectedThread.taskCreated || selectedThread.linkedIssueId) && (
              <div className="bg-emerald-50/90 border-b border-emerald-200 px-4 py-2 flex items-center justify-between text-xs text-emerald-800 font-mono">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                  <span>
                    <strong>Task #{selectedThread.linkedIssueId || 'Active'}</strong> has already been created from this thread. Further updates and investigation should proceed in workspace.
                  </span>
                </div>
                {onOpenIssueInWorkspace && selectedThread.linkedIssueId && (
                  <button
                    type="button"
                    onClick={() => onOpenIssueInWorkspace(selectedThread.linkedIssueId!)}
                    className="text-emerald-700 underline font-bold hover:text-emerald-900 cursor-pointer shrink-0 ml-2"
                  >
                    Open Workspace Task →
                  </button>
                )}
              </div>
            )}

            {/* Reply Success Feedback */}
            {replySuccessMsg && (
              <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex items-center space-x-2 text-xs text-blue-800 font-mono">
                <Check size={14} className="text-blue-600" />
                <span>{replySuccessMsg}</span>
              </div>
            )}

            {/* Message Thread History */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/40">
              {selectedThread.messages.map((msg, index) => {
                const isInbound = msg.direction === 'inbound';
                const hasAttachments = msg.attachments && msg.attachments.length > 0;

                return (
                  <div 
                    key={msg.id || index}
                    className={`rounded-2xl border p-4 shadow-2xs transition-all ${
                      isInbound 
                        ? 'bg-white border-slate-200' 
                        : 'bg-blue-50/40 border-blue-100'
                    }`}
                  >
                    {/* Message Header */}
                    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2.5 mb-3">
                      <div className="flex items-center space-x-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                          isInbound ? 'bg-slate-100 text-slate-700' : 'bg-blue-600 text-white'
                        }`}>
                          {isInbound ? <UserIcon size={14} /> : <Send size={13} />}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-slate-900 font-mono">
                              {isInbound ? (msg.sender_name || msg.sender_address || 'Sender') : 'Team Outbound Reply'}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                              isInbound ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700 font-bold'
                            }`}>
                              {isInbound ? 'INBOUND' : 'OUTBOUND'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-mono">
                            {isInbound ? msg.sender_address : `To: ${msg.recipient_address || selectedThread.participants[0]?.address}`}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Message Body Content */}
                    <div className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans mb-3">
                      {msg.text_body || 'No text content available in payload.'}
                    </div>

                    {/* Message Attachments List */}
                    {hasAttachments && (
                      <div className="pt-2 border-t border-slate-100 space-y-2">
                        <div className="flex items-center space-x-1.5 text-[11px] font-mono font-bold text-slate-600">
                          <Paperclip size={12} />
                          <span>ATTACHMENTS ({msg.attachments!.length})</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {msg.attachments!.map(att => {
                            const isTabular = att.contentType === 'spreadsheet' || att.filename.endsWith('.xlsx') || att.filename.endsWith('.csv');

                            return (
                              <div 
                                key={att.id}
                                className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white hover:border-blue-300 transition-colors shadow-2xs group"
                              >
                                <div className="flex items-center space-x-2 min-w-0 pr-2">
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                    isTabular ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    {isTabular ? <FileSpreadsheet size={15} /> : <FileText size={15} />}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-slate-800 truncate" title={att.filename}>
                                      {att.filename}
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-mono">
                                      {att.sizeBytes ? `${Math.round(att.sizeBytes / 1024)} KB` : 'Attached file'}
                                      {att.parsedData?.rowCount ? ` • ${att.parsedData.rowCount} rows parsed` : ''}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-1 shrink-0">
                                  {/* Inspect parsed data */}
                                  {att.parsedData && (
                                    <button
                                      type="button"
                                      onClick={() => setInspectingAttachment(att)}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
                                      title="Preview parsed data"
                                    >
                                      <Tag size={13} />
                                    </button>
                                  )}

                                  {/* Download button */}
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadAttachment(att)}
                                    className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
                                    title="Download attachment"
                                  >
                                    <Download size={13} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Inline Reply Composer Drawer */}
            {showReplyComposer && (
              <div className="p-4 border-t border-slate-200 bg-white shadow-lg space-y-3 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Reply size={14} className="text-blue-600" />
                    <span className="text-xs font-bold font-mono text-slate-800">
                      REPLY VIA {selectedThread.channel.toUpperCase()}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      To: {selectedThread.participants[0]?.address}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowReplyComposer(false)}
                    className="text-xs text-slate-400 hover:text-slate-600 font-mono"
                  >
                    Cancel
                  </button>
                </div>

                {replyError && (
                  <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-mono">
                    {replyError}
                  </div>
                )}

                {/* Quick canned responses */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  <span className="text-[10px] text-slate-400 font-mono">Templates:</span>
                  {[
                    'Discrepancy received and logged into case task for technical audit.',
                    'Please furnish the raw ISO / payment ledger matching these reference IDs.',
                    'Reversal confirmed and committed in core banking settlement.'
                  ].map((tpl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setReplyBody(tpl)}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-sans truncate max-w-[200px] cursor-pointer"
                    >
                      {tpl}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={3}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Type your official team reply here..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 font-sans"
                />

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-mono">
                    Replies are queued into outbox and dispatched via official team channel credentials.
                  </span>
                  <button
                    type="button"
                    disabled={isSendingReply || !replyBody.trim()}
                    onClick={handleSendReply}
                    className="px-4 py-1.5 bg-[#155DFC] hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-mono font-bold flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
                  >
                    {isSendingReply ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Send size={13} />
                        <span>Send Reply</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================
          ATTACHMENT INSPECTION MODAL
         ======================================================== */}
      {inspectingAttachment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden font-sans">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet size={18} className="text-emerald-600" />
                <div>
                  <h4 className="text-xs font-bold font-mono text-slate-800">{inspectingAttachment.filename}</h4>
                  <p className="text-[10px] text-slate-400 font-mono">Parsed Tabular Ledger Preview</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectingAttachment(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-mono px-2 py-1 rounded"
              >
                Close
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs space-y-3">
              {inspectingAttachment.parsedData?.sampleHeaders && (
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Detected Columns:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {inspectingAttachment.parsedData.sampleHeaders.map((h, i) => (
                      <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px]">
                        {h}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {inspectingAttachment.parsedData?.sampleRows && (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="min-w-full divide-y divide-slate-200 text-[11px]">
                    <thead className="bg-slate-50">
                      <tr>
                        {(inspectingAttachment.parsedData.sampleHeaders || Object.keys(inspectingAttachment.parsedData.sampleRows[0] || {})).map((col, idx) => (
                          <th key={idx} className="px-3 py-1.5 text-left font-bold text-slate-600">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {inspectingAttachment.parsedData.sampleRows.slice(0, 8).map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50">
                          {(inspectingAttachment.parsedData!.sampleHeaders || Object.keys(row)).map((col, cIdx) => (
                            <td key={cIdx} className="px-3 py-1 text-slate-700 truncate max-w-[150px]">{String(row[col] ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleDownloadAttachment(inspectingAttachment)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-mono font-bold flex items-center space-x-1.5 cursor-pointer"
                >
                  <Download size={13} />
                  <span>Download Raw File</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
