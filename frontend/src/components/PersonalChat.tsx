/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { User, DirectMessage, UserRole } from '../types';
import { 
  Send, Search, User as UserIcon, MessageSquare, Clock, 
  CheckCheck, ShieldCheck, Sparkles, AlertCircle, ArrowLeft,
  Circle, Filter, Users, ChevronRight, Check
} from 'lucide-react';

interface PersonalChatProps {
  currentUser: User;
  users: User[];
  directMessages: DirectMessage[];
  initialSelectedUserId?: string | null;
  onSendDirectMessage: (receiverId: string, content: string) => void;
  onMarkDirectMessagesRead: (senderId: string) => void;
  onNavigateToTeamWorkspace?: () => void;
}

export default function PersonalChat({
  currentUser,
  users = [],
  directMessages = [],
  initialSelectedUserId,
  onSendDirectMessage,
  onMarkDirectMessagesRead,
  onNavigateToTeamWorkspace,
}: PersonalChatProps) {
  // Exclude current user from contact list
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync initialSelectedUserId when changed externally (deep linking)
  useEffect(() => {
    if (initialSelectedUserId && availableContacts.some(u => u.id === initialSelectedUserId)) {
      setSelectedUserId(initialSelectedUserId);
    }
  }, [initialSelectedUserId]);

  const selectedContact = users.find(u => u.id === selectedUserId);

  // Filter messages between currentUser and selectedUser
  const currentConversation = directMessages.filter(
    m => (m.senderId === currentUser.id && m.receiverId === selectedUserId) ||
         (m.senderId === selectedUserId && m.receiverId === currentUser.id)
  ).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Mark unread messages as read when viewing conversation
  useEffect(() => {
    if (selectedUserId) {
      const hasUnread = directMessages.some(
        m => m.senderId === selectedUserId && m.receiverId === currentUser.id && !m.isRead
      );
      if (hasUnread) {
        onMarkDirectMessagesRead(selectedUserId);
      }
    }
  }, [selectedUserId, directMessages, currentUser.id]);

  // Auto scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentConversation.length, selectedUserId]);

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageInput.trim() || !selectedUserId) return;

    onSendDirectMessage(selectedUserId, messageInput.trim());
    setMessageInput('');
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
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

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col space-y-2.5" id="personal-chat-workspace">
      
      {/* Header Banner */}
      <div className="bg-[#0F172B] border border-slate-800 rounded-xl p-2.5 sm:p-3 text-white shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg">
            <MessageSquare size={16} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-bold text-white tracking-tight">Direct Messages</h1>
              <span className="text-[10px] font-mono bg-[#155DFC]/20 text-blue-300 border border-[#155DFC]/30 px-2 py-0.5 rounded-full font-semibold">
                1-on-1 Personal Chat
              </span>
            </div>
            <p className="text-[11px] text-slate-300 font-mono">
              Secure internal team messaging for direct operational & technical coordination
            </p>
          </div>
        </div>

        {onNavigateToTeamWorkspace && (
          <button
            onClick={onNavigateToTeamWorkspace}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-semibold rounded-lg font-mono flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Users size={13} />
            <span>Open Team Workspace</span>
          </button>
        )}
      </div>

      {/* Main Chat Interface Grid */}
      <div className="flex-1 bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden flex flex-col lg:flex-row min-h-0">
        
        {/* Left Sidebar: Contact Directory */}
        <div className="w-full lg:w-80 border-r border-slate-200 bg-slate-50/50 flex flex-col shrink-0">
          
          {/* Search & Filter Header */}
          <div className="p-2.5 border-b border-slate-200 bg-white space-y-1.5">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search colleagues..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#155DFC] font-mono"
              />
            </div>

            {/* Role Filter Pills */}
            <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar text-[10px] font-mono">
              <button
                onClick={() => setRoleFilter('ALL')}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  roleFilter === 'ALL' ? 'bg-[#155DFC] text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setRoleFilter('operational')}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  roleFilter === 'operational' ? 'bg-[#155DFC] text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Ops
              </button>
              <button
                onClick={() => setRoleFilter('technical')}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  roleFilter === 'technical' ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tech
              </button>
              <button
                onClick={() => setRoleFilter('managerial')}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  roleFilter === 'managerial' ? 'bg-amber-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Manager
              </button>
              <button
                onClick={() => setRoleFilter('admin')}
                className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  roleFilter === 'admin' ? 'bg-purple-600 text-white font-bold' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Admin
              </button>
            </div>
          </div>

          {/* Contacts List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredContacts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 font-mono">
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

                return (
                  <button
                    key={contact.id}
                    onClick={() => setSelectedUserId(contact.id)}
                    className={`w-full p-3 text-left transition-all flex items-start space-x-3 cursor-pointer ${
                      isSelected 
                        ? 'bg-blue-50/90 border-l-4 border-blue-600' 
                        : 'hover:bg-slate-100/70'
                    }`}
                  >
                    {/* User Avatar */}
                    <div className="relative shrink-0">
                      <div className={`w-9 h-9 rounded-full font-bold flex items-center justify-center text-xs border ${
                        isSelected ? 'bg-blue-600 text-white border-blue-700' : 'bg-slate-200 text-slate-700 border-slate-300'
                      }`}>
                        {contact.username.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
                    </div>

                    {/* Content preview */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold font-mono truncate ${
                          isSelected ? 'text-blue-900' : 'text-slate-900'
                        }`}>
                          @{contact.username}
                        </span>
                        {lastMsg && (
                          <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-1">
                            {formatTimeAgo(lastMsg.timestamp)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[11px] text-slate-500 truncate font-normal leading-tight">
                          {lastMsg ? (
                            lastMsg.senderId === currentUser.id ? `You: ${lastMsg.content}` : lastMsg.content
                          ) : (
                            <span className="italic text-slate-400">Start a conversation</span>
                          )}
                        </p>

                        {unreadCount > 0 && (
                          <span className="px-1.5 py-0.2 bg-blue-600 text-white text-[9px] font-bold rounded-full font-mono shrink-0">
                            {unreadCount}
                          </span>
                        )}
                      </div>

                      <span className={`inline-block text-[9px] font-mono px-1.5 py-0.2 rounded border font-semibold ${getRoleBadgeColor(contact.role)}`}>
                        {contact.role.toUpperCase()}
                      </span>
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
              <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-2xs">
                      {selectedContact.username.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                  </div>

                  <div>
                    <div className="flex items-center space-x-2">
                      <h2 className="text-sm font-bold text-slate-900 font-mono">@{selectedContact.username}</h2>
                      <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded border font-bold ${getRoleBadgeColor(selectedContact.role)}`}>
                        {selectedContact.role.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono flex items-center space-x-2">
                      <span>{selectedContact.email}</span>
                      <span>•</span>
                      <span className="text-emerald-600 font-semibold flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>Online</span>
                      </span>
                    </p>
                  </div>
                </div>

                <div className="text-right text-[10px] text-slate-400 font-mono hidden sm:block">
                  <span>Direct Communication Channel</span>
                </div>
              </div>

              {/* Message Feed */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                {currentConversation.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 space-y-2">
                    <MessageSquare size={32} className="mx-auto text-slate-300 stroke-[1.5]" />
                    <p className="text-xs font-semibold text-slate-700">No message history yet</p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      Send a message to start direct chat with @{selectedContact.username}
                    </p>
                  </div>
                ) : (
                  currentConversation.map((msg) => {
                    const isSelf = msg.senderId === currentUser.id;

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center space-x-1.5 mb-1 text-[10px] font-mono text-slate-400">
                          <span className="font-bold text-slate-700">
                            {isSelf ? 'You' : `@${msg.senderName}`}
                          </span>
                          <span>•</span>
                          <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>

                        <div className={`p-3 rounded-2xl max-w-lg text-xs leading-relaxed shadow-2xs group relative ${
                          isSelf
                            ? 'bg-blue-600 text-white rounded-tr-none'
                            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                          <div className="mt-1.5 pt-1 border-t border-slate-200/30 flex items-center justify-between opacity-80 group-hover:opacity-100 transition-opacity">
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
                              className="text-[9px] font-mono flex items-center space-x-1 hover:underline cursor-pointer"
                            >
                              <ShieldCheck size={10} />
                              <span>Submit as Maker Proposal</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompt Chips */}
              <div className="px-4 py-1.5 bg-slate-50/80 border-t border-slate-100 flex items-center space-x-2 overflow-x-auto no-scrollbar text-[10px] font-mono shrink-0">
                <span className="text-slate-400 font-bold shrink-0">Quick prompts:</span>
                <button
                  onClick={() => setMessageInput(`Hey @${selectedContact.username}, do you have a moment to review this task?`)}
                  className="px-2 py-0.5 bg-white border border-slate-200 text-slate-600 rounded hover:bg-blue-50 hover:text-blue-600 transition-colors cursor-pointer shrink-0"
                >
                  Task review?
                </button>
                <button
                  onClick={() => setMessageInput(`Could you check the settlement database connection for DB-001?`)}
                  className="px-2 py-0.5 bg-white border border-slate-200 text-slate-600 rounded hover:bg-blue-50 hover:text-blue-600 transition-colors cursor-pointer shrink-0"
                >
                  Check DB access
                </button>
                <button
                  onClick={() => setMessageInput(`SQL dry-run execution completed. Please verify the audit log.`)}
                  className="px-2 py-0.5 bg-white border border-slate-200 text-slate-600 rounded hover:bg-blue-50 hover:text-blue-600 transition-colors cursor-pointer shrink-0"
                >
                  SQL dry-run status
                </button>
              </div>

              {/* Message Input Form */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 bg-white flex items-center space-x-2 shrink-0">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={`Message @${selectedContact.username}...`}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <button
                  type="submit"
                  disabled={!messageInput.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold font-mono flex items-center space-x-1.5 transition-all cursor-pointer shadow-2xs shrink-0"
                >
                  <Send size={13} />
                  <span>Send</span>
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400 font-mono text-xs">
              Select a colleague from the left directory to open a direct message channel
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
