/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { User, DirectMessage, UserRole, Team, HashtagPreset } from '../types';
import {
  Send, Search, User as UserIcon, MessageSquare, Clock,
  CheckCheck, ShieldCheck, Sparkles, AlertCircle, ArrowLeft,
  Circle, Filter, Users, ChevronRight, Check, Mail, Inbox,
  Paperclip, RefreshCw, ExternalLink, Download, FileText,
  FileSpreadsheet, CornerDownLeft, Shield, Eye
} from 'lucide-react';
import { api } from '../api/client';
import { SharedAssetChatCard } from './chat/SharedAssetChatCard';
import UnifiedChatInput, { InChatDirectiveType } from './chat/UnifiedChatInput';

interface PersonalChatProps {
  currentUser: User;
  users: User[];
  teams?: Team[];
  hashtags?: HashtagPreset[];
  directMessages: DirectMessage[];
  initialSelectedUserId?: string | null;
  onSendDirectMessage: (receiverId: string, content: string) => void;
  onMarkDirectMessagesRead: (senderId: string) => void;
  onNavigateToTeamWorkspace?: () => void;
  onNavigateToTaskCreation?: (initialData?: any) => void;
}

export default function PersonalChat({
  currentUser,
  users = [],
  teams = [],
  hashtags = [],
  directMessages = [],
  initialSelectedUserId,
  onSendDirectMessage,
  onMarkDirectMessagesRead,
  onNavigateToTeamWorkspace,
  onNavigateToTaskCreation,
}: PersonalChatProps) {
  // Navigation mode: 1-on-1 Direct Chat vs Personal OAuth 2.0 Mailbox
  const [activeMode, setActiveMode] = useState<'chat' | 'mailbox'>('chat');

  // ================= Direct Messages State =================
  const availableContacts = users.filter(u => u.id !== currentUser.id);

  const [selectedUserId, setSelectedUserId] = useState<string>(() => {
    if (initialSelectedUserId && availableContacts.some(u => u.id === initialSelectedUserId)) {
      return initialSelectedUserId;
    }
    return availableContacts[0]?.id || '';
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [messageInput, setMessageInput] = useState('');
  const [directShares, setDirectShares] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ================= Personal Mailbox State =================
  const [mailboxThreads, setMailboxThreads] = useState<any[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [mailboxFilter, setMailboxFilter] = useState<'all' | 'inbound' | 'outbound' | 'unassigned'>('all');
  const [mailboxSearch, setMailboxSearch] = useState('');
  const [loadingMailbox, setLoadingMailbox] = useState(false);
  const [mailboxReplyText, setMailboxReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [mailboxFeedback, setMailboxFeedback] = useState<string | null>(null);
  const [mailboxStats, setMailboxStats] = useState({ total: 0, unread: 0 });

  // Fetch direct operational asset shares
  useEffect(() => {
    window.scrollTo(0, 0);
    if (currentUser?.id) {
      api.getDirectShares(currentUser.id).then(res => {
        if (res?.shares) setDirectShares(res.shares);
      }).catch(console.warn);
    }
  }, [currentUser?.id]);

  // Sync initialSelectedUserId when changed externally (deep linking)
  useEffect(() => {
    if (initialSelectedUserId && availableContacts.some(u => u.id === initialSelectedUserId)) {
      setSelectedUserId(initialSelectedUserId);
      setActiveMode('chat');
    }
  }, [initialSelectedUserId]);

  // Fetch personal mailbox data
  const loadPersonalMailbox = () => {
    if (!currentUser?.id) return;
    setLoadingMailbox(true);
    api.getPersonalMailbox(currentUser.id, mailboxFilter, mailboxSearch)
      .then(res => {
        const threads = res?.threads || [];
        setMailboxThreads(threads);
        setMailboxStats({
          total: res?.totalThreads || threads.length,
          unread: res?.unreadCount || 0
        });
        if (!selectedThreadId && threads.length > 0) {
          setSelectedThreadId(threads[0].threadId);
        } else if (selectedThreadId && !threads.some(t => t.threadId === selectedThreadId) && threads.length > 0) {
          setSelectedThreadId(threads[0].threadId);
        }
      })
      .catch(err => {
        console.warn('[PersonalChat] Error fetching personal mailbox:', err);
      })
      .finally(() => {
        setLoadingMailbox(false);
      });
  };

  useEffect(() => {
    if (activeMode === 'mailbox') {
      loadPersonalMailbox();
    }
  }, [activeMode, currentUser?.id, mailboxFilter, mailboxSearch]);

  const selectedContact = users.find(u => u.id === selectedUserId);

  // Filter messages between currentUser and selectedUser
  const currentConversation = directMessages.filter(
    m => (m.senderId === currentUser.id && m.receiverId === selectedUserId) ||
      (m.senderId === selectedUserId && m.receiverId === currentUser.id)
  ).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Mark unread messages as read when viewing conversation
  useEffect(() => {
    if (selectedUserId && activeMode === 'chat') {
      const hasUnread = directMessages.some(
        m => m.senderId === selectedUserId && m.receiverId === currentUser.id && !m.isRead
      );
      if (hasUnread) {
        onMarkDirectMessagesRead(selectedUserId);
      }
    }
  }, [selectedUserId, directMessages, currentUser.id, activeMode]);

  // Auto scroll to bottom of direct chat
  useEffect(() => {
    if (activeMode === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentConversation.length, selectedUserId, activeMode]);

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageInput.trim() || !selectedUserId) return;

    onSendDirectMessage(selectedUserId, messageInput.trim());
    setMessageInput('');
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Dispatch email reply from Personal Mailbox
  const handleSendMailboxReply = async (thread: any) => {
    if (!mailboxReplyText.trim() || !thread) return;
    setIsSendingReply(true);
    setMailboxFeedback(null);
    try {
      const recipient = thread.participants?.find((p: any) => p.direction === 'inbound')?.address ||
        thread.messages?.[0]?.sender_address ||
        'operations@bank.com';

      const lastMsg = thread.messages?.[thread.messages.length - 1];

      await api.replyToMessage({
        userId: currentUser.id,
        channel: thread.channel || 'email',
        to: recipient,
        subject: thread.subject.startsWith('Re: ') ? thread.subject : `Re: ${thread.subject}`,
        textBody: mailboxReplyText.trim(),
        conversationId: thread.threadId,
        threadId: thread.threadId,
        inReplyToMessageId: lastMsg?.id,
        senderAddress: currentUser.messageProviderSettings?.userEmail || currentUser.email
      });

      setMailboxReplyText('');
      setMailboxFeedback('Reply dispatched successfully via personal OAuth 2.0 connection!');
      loadPersonalMailbox();
    } catch (err: any) {
      setMailboxFeedback(`Failed to send reply: ${err.message}`);
    } finally {
      setIsSendingReply(false);
    }
  };

  const getRoleBadgeColor = (_role: UserRole) => {
    return 'bg-blue-100 text-blue-800 border-blue-200';
  };

  const formatTimeAgo = (isoDate: string) => {
    try {
      const date = new Date(isoDate);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const filteredContacts = availableContacts.filter(u => {
    const matchesSearch = u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const activeMailboxThread = mailboxThreads.find(t => t.threadId === selectedThreadId);

  const handleExecuteChatDirective = (directive: InChatDirectiveType, currentContext: string) => {
    if (directive === 'create-task') {
      if (onNavigateToTaskCreation) {
        onNavigateToTaskCreation({
          title: `Task from Direct Chat with ${selectedContact?.displayName || selectedContact?.username || 'colleague'}`,
          description: currentContext || `Operational coordination notes: ${currentContext}`,
          source: 'DIRECT_CHAT'
        });
      } else {
        alert(`Task Direct Action: Creating task from discussion with @${selectedContact?.username || 'colleague'}.`);
      }
    } else if (directive === 'create-escalate') {
      if (onNavigateToTeamWorkspace) {
        onNavigateToTeamWorkspace();
      } else {
        alert('Incident Escalation: Navigating to Team Escalation Room.');
      }
    } else if (directive === 'create-hashtag' || directive === 'call-hashtag') {
      // Directives automatically insert token
    } else if (directive === 'request-approval') {
      alert('Maker-Checker Proposal: Staged proposal prompt. Enter discrepancy resolution details in this thread.');
    }
  };

  // Helper for rendering circular user avatar
  const renderCircularAvatar = (avatarUrl?: string, name?: string, sizeClass = 'w-8 h-8', borderClass = 'border border-slate-200') => {
    const initials = (name || 'User').trim().substring(0, 2).toUpperCase();
    return (
      <div className={`relative shrink-0 rounded-full overflow-hidden ${sizeClass} ${borderClass} bg-slate-100 flex items-center justify-center shadow-2xs`}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={name || 'Avatar'} className="w-full h-full object-cover rounded-full" />
        ) : (
          <div className="w-full h-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center text-white text-[10px] font-bold font-mono">
            {initials}
          </div>
        )}
      </div>
    );
  };

  const isOAuthConnected = currentUser.messageProviderSettings?.status === 'ACTIVE';
  const personalEmailAddress = currentUser.messageProviderSettings?.userEmail || currentUser.email;

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col p-6 overflow-hidden bg-slate-50/50" id="personal-chat-workspace">

      {/* Header: Title, Description & Direct Chat / Mailbox Toggle */}
      <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Messages</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Direct chat with colleagues and your personal OAuth mailbox.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveMode('chat')}
            className={`px-3.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ${
              activeMode === 'chat'
                ? 'bg-white border-slate-300 text-slate-900 font-semibold shadow-xs'
                : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
            }`}
          >
            <MessageSquare size={13} className={activeMode === 'chat' ? 'text-[#F27421]' : 'text-slate-400'} />
            <span>Direct chat</span>
          </button>

          <button
            onClick={() => setActiveMode('mailbox')}
            className={`px-3.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ${
              activeMode === 'mailbox'
                ? 'bg-white border-slate-300 text-slate-900 font-semibold shadow-xs'
                : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
            }`}
          >
            <Mail size={13} className={activeMode === 'mailbox' ? 'text-[#F27421]' : 'text-slate-400'} />
            <span>Personal mailbox</span>
            {mailboxStats.unread > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-500 text-white text-[9px] font-bold rounded-full">
                {mailboxStats.unread}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ================= MODE 1: DIRECT MESSAGES ================= */}
      {activeMode === 'chat' && (
        <div className="flex-1 bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden flex flex-col lg:flex-row min-h-0">

          {/* Left Sidebar: Contact Directory */}
          <div className="w-full lg:w-80 border-r border-slate-200 bg-white flex flex-col shrink-0 min-h-0">

            {/* Search & Filter Header */}
            <div className="p-3 border-b border-slate-100 space-y-2.5">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search colleagues..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50/60 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#F27421] text-slate-800 placeholder-slate-400 transition"
                />
              </div>

              {/* Role Filter Pills */}
              <div className="flex items-center gap-1.5 text-xs">
                {([
                  { key: 'ALL', label: 'All' },
                  { key: 'operational', label: 'Ops' },
                  { key: 'technical', label: 'Tech' },
                  { key: 'managerial', label: 'Manager' },
                  { key: 'admin', label: 'Admin' },
                ] as const).map(({ key, label }) => {
                  const active = roleFilter === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setRoleFilter(key as any)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#0F142A] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Contacts List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredContacts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No colleagues found
                </div>
              ) : (
                filteredContacts.map((contact) => {
                  const isSelected = contact.id === selectedUserId;

                  // Get last message in conversation
                  const conversation = directMessages.filter(
                    m => (m.senderId === currentUser.id && m.receiverId === contact.id) ||
                      (m.senderId === contact.id && m.receiverId === currentUser.id)
                  ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

                  const lastMsg = conversation[0];

                  const unreadCount = directMessages.filter(
                    m => m.senderId === contact.id && m.receiverId === currentUser.id && !m.isRead
                  ).length;

                  const initials = (contact.displayName || contact.username).slice(0, 2).toUpperCase();

                  return (
                    <button
                      key={contact.id}
                      onClick={() => setSelectedUserId(contact.id)}
                      className={`w-full p-3 px-3.5 text-left transition-all flex items-start space-x-3 cursor-pointer ${
                        isSelected
                          ? 'bg-slate-50/90 border-l-4 border-[#F27421]'
                          : 'hover:bg-slate-50/60'
                      }`}
                    >
                      {/* Circular Avatar */}
                      <div className="relative shrink-0">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shadow-2xs ${
                          isSelected ? 'bg-[#0F142A] text-white' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {initials}
                        </div>
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
                      </div>

                      {/* Content preview */}
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold truncate ${isSelected ? 'text-slate-900 font-bold' : 'text-slate-900'}`}>
                            {contact.displayName || contact.username}
                          </span>
                          {lastMsg && (
                            <span className="text-[11px] text-slate-400 font-normal shrink-0 ml-1">
                              {formatTimeAgo(lastMsg.timestamp)}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs text-slate-500 truncate leading-tight">
                            {lastMsg ? (
                              lastMsg.senderId === currentUser.id ? `You: ${lastMsg.content}` : lastMsg.content
                            ) : (
                              <span className="text-slate-400">Start a conversation</span>
                            )}
                          </p>

                          {unreadCount > 0 && (
                            <span className="px-1.5 py-0.2 bg-[#F27421] text-white text-[9px] font-bold rounded-full font-mono shrink-0">
                              {unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Area: Active 1-on-1 Chat Window */}
          <div className="flex-1 flex flex-col bg-white min-w-0">

            {selectedContact ? (
              <>
                {/* Active User Header */}
                <div className="p-3.5 px-5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-[#0F142A] text-white flex items-center justify-center font-bold text-sm shadow-2xs">
                        {(selectedContact.displayName || selectedContact.username).slice(0, 2).toUpperCase()}
                      </div>
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <h2 className="text-sm font-bold text-slate-900">
                          {selectedContact.displayName || selectedContact.username}
                        </h2>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 capitalize">
                          {selectedContact.role === 'operational' ? 'Operational' : selectedContact.role === 'technical' ? 'Technical' : selectedContact.role === 'managerial' ? 'Managerial' : 'Admin'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center space-x-1.5">
                        <span className="text-emerald-600 font-medium">Online</span>
                        <span>·</span>
                        <span>{selectedContact.email}</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Message Feed */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-white">
                  {currentConversation.length === 0 ? (
                    <div className="py-16 text-center text-slate-400 space-y-2">
                      <MessageSquare size={32} className="mx-auto text-slate-300 stroke-[1.5]" />
                      <p className="text-xs font-semibold text-slate-700">No message history yet</p>
                      <p className="text-xs text-slate-500">
                        Send a message to start direct chat with @{selectedContact.username}
                      </p>
                    </div>
                  ) : (
                    currentConversation.map((msg) => {
                      const isSelf = msg.senderId === currentUser.id;
                      const senderName = isSelf ? 'You' : (selectedContact.displayName || selectedContact.username);
                      const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col my-2.5 ${isSelf ? 'items-end' : 'items-start'}`}
                        >
                          {/* Metadata line above bubble */}
                          <div className={`text-[11px] font-medium text-slate-400 mb-1 ${isSelf ? 'text-right mr-1' : 'text-left ml-1'}`}>
                            {senderName} · {timeStr}
                          </div>

                          {/* Message Bubble */}
                          <div className={`p-3.5 rounded-2xl text-xs leading-relaxed max-w-lg shadow-2xs group relative ${
                            isSelf
                              ? 'bg-[#0F142A] text-white rounded-tr-xs'
                              : 'bg-slate-100 text-slate-800 border border-slate-200/60 rounded-tl-xs'
                          }`}>
                            <p className="whitespace-pre-wrap">{msg.content}</p>

                            {/* Submit as Maker Proposal action */}
                            <div className={`mt-2.5 pt-2 border-t flex items-center ${
                              isSelf ? 'border-slate-800' : 'border-slate-200'
                            }`}>
                              <button
                                onClick={async () => {
                                  try {
                                    await fetch('/api/resolutions/propose-from-chat', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        chatMessageId: msg.id,
                                        messageContent: msg.content,
                                        taskId: 'TASK-CHAT-01',
                                        transactionId: `TXN-CHAT-${Date.now()}`,
                                        teamId: 'team-cards',
                                        makerId: currentUser.id,
                                        makerName: currentUser.username
                                      })
                                    });
                                    alert('Message submitted as Maker Proposal to Team Lead!');
                                  } catch (err: any) {
                                    alert(`Submission error: ${err.message}`);
                                  }
                                }}
                                className="text-xs text-[#F27421] hover:text-orange-400 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <ShieldCheck size={13} className="text-[#F27421]" />
                                <span>Submit as maker proposal</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Shared Operational Assets (Workflows, Validation Boxes, DB Configs) */}
                  {directShares
                    .filter(
                      s => (s.senderId === currentUser.id && s.targetId === selectedUserId) ||
                        (s.senderId === selectedUserId && s.targetId === currentUser.id)
                    )
                    .map(share => {
                      const isSelf = share.senderId === currentUser.id;
                      return (
                        <div
                          key={share.id}
                          className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} my-2`}
                        >
                          <div className="flex items-center space-x-1.5 mb-1 text-[10px] text-slate-400">
                            <span className="font-bold text-slate-700">
                              {isSelf ? 'You (Shared Asset)' : `@${share.senderName} (Shared Asset)`}
                            </span>
                            <span>•</span>
                            <span>{share.createdAt ? new Date(share.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>
                          <SharedAssetChatCard
                            shareId={share.id}
                            assetType={share.assetType}
                            assetId={share.assetId}
                            senderName={share.senderName}
                            message={share.message}
                            visualPayload={share.visualPayload || {}}
                          />
                        </div>
                      );
                    })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Unified Message Input Form */}
                <div className="p-3 border-t border-slate-200 bg-white shrink-0">
                  <UnifiedChatInput
                    currentUser={currentUser}
                    users={users}
                    teams={teams}
                    hashtags={hashtags}
                    placeholder={`Message @${selectedContact.username}...`}
                    value={messageInput}
                    onChange={setMessageInput}
                    onSendMessage={() => {
                      if (!messageInput.trim()) return;
                      onSendDirectMessage(selectedUserId, messageInput.trim());
                      setMessageInput('');
                    }}
                    onExecuteDirective={handleExecuteChatDirective}
                    quickPrompts={[
                      'Task review?',
                      'Check DB access',
                      'SQL dry-run status'
                    ]}
                    inputId="input-direct-chat"
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400 text-xs">
                Select a colleague from the left directory to open a direct message channel
              </div>
            )}

          </div>

        </div>
      )}

      {/* ================= MODE 2: PERSONAL MAILBOX (OAUTH 2.0) ================= */}
      {activeMode === 'mailbox' && (
        <div className="flex-1 bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden flex flex-col lg:flex-row min-h-0">

          {/* Left Column: Personal Mailbox Thread Directory */}
          <div className="w-full lg:w-84 border-r border-slate-200 bg-slate-50/50 flex flex-col shrink-0 min-h-0">

            {/* Mailbox Header & Search */}
            <div className="p-3 border-b border-slate-200 bg-white space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold text-slate-800">Personal Inbox & Outbox</span>
                  <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 font-mono text-[9px] rounded font-bold">
                    OAuth 2.0
                  </span>
                </div>
                <button
                  onClick={loadPersonalMailbox}
                  className="p-1 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                  title="Refresh Mailbox"
                >
                  <RefreshCw size={13} className={loadingMailbox ? 'animate-spin text-blue-600' : ''} />
                </button>
              </div>

              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search personal emails..."
                  value={mailboxSearch}
                  onChange={e => setMailboxSearch(e.target.value)}
                  className="w-full pl-7 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-hidden focus:border-blue-500"
                />
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar text-[10px] font-mono">
                <button
                  onClick={() => setMailboxFilter('all')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${mailboxFilter === 'all' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  All ({mailboxStats.total})
                </button>
                <button
                  onClick={() => setMailboxFilter('inbound')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${mailboxFilter === 'inbound' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  Inbox
                </button>
                <button
                  onClick={() => setMailboxFilter('outbound')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${mailboxFilter === 'outbound' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  Sent
                </button>
                <button
                  onClick={() => setMailboxFilter('unassigned')}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${mailboxFilter === 'unassigned' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  Unlinked
                </button>
              </div>
            </div>

            {/* Thread List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {loadingMailbox ? (
                <div className="p-8 text-center text-xs text-slate-400 font-mono flex items-center justify-center space-x-2">
                  <RefreshCw size={14} className="animate-spin text-blue-600" />
                  <span>Loading personal mailbox...</span>
                </div>
              ) : mailboxThreads.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 font-mono space-y-2">
                  <Mail size={24} className="mx-auto text-slate-300 stroke-[1.5]" />
                  <p className="font-semibold text-slate-600">No emails found</p>
                  <p className="text-[11px] text-slate-400">
                    {isOAuthConnected
                      ? 'No messages in this view yet.'
                      : 'Please authorize your personal mailbox in Profile Settings.'}
                  </p>
                </div>
              ) : (
                mailboxThreads.map((thread) => {
                  const isSelected = thread.threadId === selectedThreadId;
                  const sender = thread.participants?.find((p: any) => p.direction === 'inbound') || thread.participants?.[0];

                  return (
                    <div
                      key={thread.threadId}
                      onClick={() => setSelectedThreadId(thread.threadId)}
                      className={`p-3 text-left transition-all cursor-pointer space-y-1.5 ${isSelected
                        ? 'bg-blue-50/90 border-l-4 border-blue-600'
                        : 'hover:bg-slate-100/70'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs font-bold truncate ${isSelected ? 'text-blue-950 font-mono' : 'text-slate-900 font-mono'
                          }`}>
                          {sender?.name || sender?.address || 'External Contact'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {formatTimeAgo(thread.latestMessageAt)}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1.5">
                        <p className={`text-xs truncate ${isSelected ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>
                          {thread.subject}
                        </p>
                        {thread.unread && (
                          <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" title="Unread" />
                        )}
                      </div>

                      <p className="text-[11px] text-slate-500 truncate font-normal leading-tight">
                        {thread.snippet || 'No message preview'}
                      </p>

                      <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 pt-0.5">
                        <span className="px-1.5 py-0.2 rounded bg-slate-200/60 text-slate-700 font-semibold uppercase">
                          {thread.channel || 'EMAIL'}
                        </span>

                        <div className="flex items-center space-x-2">
                          {thread.hasAttachments && (
                            <span className="flex items-center space-x-0.5 text-blue-600 font-semibold" title={`${thread.attachments?.length} attachment(s)`}>
                              <Paperclip size={10} />
                              <span>{thread.attachments?.length}</span>
                            </span>
                          )}
                          <span className="text-slate-500 font-semibold">
                            {thread.messages?.length} {thread.messages?.length === 1 ? 'msg' : 'msgs'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Selected Thread Message Viewer & Composer */}
          <div className="flex-1 flex flex-col bg-white min-w-0">
            {activeMailboxThread ? (
              <>
                {/* Thread Header Banner */}
                <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <h2 className="text-sm font-bold text-slate-900 truncate">
                        {activeMailboxThread.subject}
                      </h2>
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono font-bold shrink-0">
                        OAuth 2.0 Email
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">
                      Participants: {activeMailboxThread.participants?.map((p: any) => p.name || p.address).join(', ')}
                    </p>
                  </div>

                  {activeMailboxThread.linkedIssueId ? (
                    <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-mono font-bold shrink-0 flex items-center space-x-1">
                      <ShieldCheck size={13} />
                      <span>Task: {activeMailboxThread.linkedIssueId}</span>
                    </span>
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          const firstMsg = activeMailboxThread.messages?.[0];
                          if (firstMsg?.id) {
                            await api.linkMessageToIssue(firstMsg.id, `TASK-${Date.now().toString().slice(-6)}`);
                            alert('Thread linked to task!');
                            loadPersonalMailbox();
                          }
                        } catch (err: any) {
                          alert(`Could not link task: ${err.message}`);
                        }
                      }}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-mono font-semibold flex items-center space-x-1 transition-colors cursor-pointer shrink-0 shadow-2xs"
                    >
                      <Shield size={12} />
                      <span>Create Task</span>
                    </button>
                  )}
                </div>

                {/* Messages in Thread */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30">
                  {activeMailboxThread.messages?.map((msg: any, idx: number) => {
                    const isOutbound = msg.direction === 'outbound';
                    const senderDisplay = isOutbound ? 'You' : (msg.sender_name || msg.sender_address);
                    const senderAvatar = isOutbound ? currentUser.avatarUrl : undefined;

                    return (
                      <div
                        key={msg.id || idx}
                        className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3"
                      >
                        {/* Message Metadata Header with Circular Profile Picture */}
                        <div className="flex items-start justify-between border-b border-slate-100 pb-2.5">
                          <div className="flex items-center space-x-3">
                            {renderCircularAvatar(senderAvatar, senderDisplay, 'w-9 h-9', isOutbound ? 'border-blue-300' : 'border-slate-300')}
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-xs font-bold text-slate-900 font-mono">
                                  {senderDisplay}
                                </span>
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${isOutbound ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                                  }`}>
                                  {isOutbound ? 'OUTBOUND' : 'INBOUND'}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 font-mono">
                                From: {msg.sender_address || personalEmailAddress} • To: {msg.recipient_address || personalEmailAddress}
                              </p>
                            </div>
                          </div>

                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(msg.created_at || msg.sent_at).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>

                        {/* Full Message Body Content */}
                        <div className="text-xs text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">
                          {msg.html_body ? (
                            <div
                              className="prose prose-xs max-w-none text-slate-800"
                              dangerouslySetInnerHTML={{ __html: msg.html_body }}
                            />
                          ) : (
                            <p>{msg.text_body || 'Empty message content'}</p>
                          )}
                        </div>

                        {/* File Attachments List */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="pt-2 border-t border-slate-100 space-y-2">
                            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase flex items-center space-x-1">
                              <Paperclip size={11} className="text-blue-600" />
                              <span>Attachments ({msg.attachments.length})</span>
                            </span>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {msg.attachments.map((att: any, attIdx: number) => {
                                const isSpreadsheet = att.filename?.endsWith('.csv') || att.filename?.endsWith('.xlsx') || att.filename?.endsWith('.xls');
                                const sizeFormatted = att.sizeBytes ? `${Math.round(att.sizeBytes / 1024)} KB` : 'Unknown size';

                                return (
                                  <div
                                    key={att.id || attIdx}
                                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between hover:bg-slate-100 transition-colors shadow-2xs"
                                  >
                                    <div className="flex items-center space-x-2 min-w-0">
                                      <div className="p-1.5 rounded bg-blue-50 text-blue-600 shrink-0">
                                        {isSpreadsheet ? <FileSpreadsheet size={15} /> : <FileText size={15} />}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-xs font-semibold text-slate-800 truncate font-mono">
                                          {att.filename}
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-mono">
                                          {sizeFormatted} • {att.mimeType || 'Document'}
                                        </p>
                                      </div>
                                    </div>

                                    <button
                                      onClick={() => {
                                        alert(`Attachment "${att.filename}" is available for inspection and local processing.`);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer shrink-0"
                                      title="Download / View Attachment"
                                    >
                                      <Download size={13} />
                                    </button>
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

                {/* Feedback Alert */}
                {mailboxFeedback && (
                  <div className="px-4 py-2 bg-emerald-50 border-t border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
                    <span>{mailboxFeedback}</span>
                    <button onClick={() => setMailboxFeedback(null)} className="text-emerald-700 font-bold">×</button>
                  </div>
                )}

                {/* Quick Reply & Compose Bar */}
                <div className="p-3 border-t border-slate-200 bg-white space-y-2 shrink-0">
                  <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-500">
                    <CornerDownLeft size={12} className="text-blue-600" />
                    <span>Replying to thread via personal OAuth 2.0 ({personalEmailAddress})</span>
                  </div>

                  <UnifiedChatInput
                    currentUser={currentUser}
                    users={users}
                    teams={teams}
                    hashtags={hashtags}
                    placeholder={`Reply to ${activeMailboxThread.subject || 'thread'}...`}
                    value={mailboxReplyText}
                    onChange={setMailboxReplyText}
                    onSendMessage={() => handleSendMailboxReply(activeMailboxThread)}
                    onExecuteDirective={handleExecuteChatDirective}
                    disabled={isSendingReply}
                    inputId="input-mailbox-reply"
                    buttonLabel={isSendingReply ? 'Sending...' : 'Send'}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400 font-mono text-xs">
                Select an email conversation from the left to read its full message content and attachments
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
