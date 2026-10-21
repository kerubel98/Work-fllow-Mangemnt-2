import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, User, Issue, Team, HashtagPreset } from '../../types';
import { MessageSquare, Send, Sparkles, UserCheck, ShieldCheck, User as UserIcon } from 'lucide-react';
import UnifiedChatInput, { InChatDirectiveType } from '../chat/UnifiedChatInput';

interface IssueChatPanelProps {
  issue: Issue;
  currentUser: User;
  users?: User[];
  teams?: Team[];
  hashtags?: HashtagPreset[];
  onSendMessage: (issueId: string, text: string) => void;
  onExecuteDirective?: (directive: InChatDirectiveType, context: string) => void;
}

export default function IssueChatPanel({
  issue,
  currentUser,
  users = [],
  teams = [],
  hashtags = [],
  onSendMessage,
  onExecuteDirective
}: IssueChatPanelProps) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [issue.chat]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(issue.id, inputText.trim());
    setInputText('');
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">Admin</span>;
      case 'technical':
        return <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200">Technical</span>;
      case 'operational':
        return <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">Operational</span>;
      case 'managerial':
        return <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">Manager</span>;
      default:
        return <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">{role}</span>;
    }
  };

  const quickTemplates = [
    'Investigating discrepancy logs on CBS database.',
    'Applied #DUPLICATE_AUTH resolution script in Testing.',
    'Ready for production deployment and DML approval.',
    'Discrepancy confirmed resolved and reconciled.'
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">Resolution Discussion & Notes</h3>
            <p className="text-xs text-slate-500">Real-time collaboration for Case #{issue.id}</p>
          </div>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium border border-slate-200">
          {issue.chat?.length || 0} messages
        </span>
      </div>

      {/* Messages List */}
      <div className="flex-grow overflow-y-auto p-4 space-y-3 min-h-[260px] max-h-[420px] bg-slate-50/50">
        {(!issue.chat || issue.chat.length === 0) ? (
          <div className="flex flex-col items-center justify-center h-48 text-center p-4">
            <div className="p-3 bg-slate-100 rounded-full text-slate-400 mb-2">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-slate-600">No discussion notes yet</p>
            <p className="text-xs text-slate-400 max-w-xs mt-1">
              Share troubleshooting steps, query verification notes, or coordination updates with assigned engineers.
            </p>
          </div>
        ) : (
          issue.chat.map((msg: ChatMessage) => {
            const isMe = msg.senderId === currentUser.id;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className="text-xs font-semibold text-slate-700">
                    {msg.senderName} {isMe && '(You)'}
                  </span>
                  {getRoleBadge(msg.senderRole)}
                  <span className="text-[10px] text-slate-400">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm leading-relaxed ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-br-none shadow-sm'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Snippets */}
      <div className="px-3 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto text-xs">
        <span className="text-slate-400 flex items-center gap-1 font-medium whitespace-nowrap text-[11px]">
          <Sparkles className="w-3 h-3 text-amber-500" /> Quick:
        </span>
        {quickTemplates.map((tmpl, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setInputText(tmpl)}
            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 transition whitespace-nowrap text-[11px] border border-slate-200"
          >
            {tmpl.length > 28 ? tmpl.slice(0, 28) + '...' : tmpl}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <div className="p-3 bg-white border-t border-slate-200">
        <UnifiedChatInput
          currentUser={currentUser}
          users={users}
          teams={teams}
          hashtags={hashtags}
          placeholder={`Add a note, @ to mention, @@ for team, / for directives...`}
          value={inputText}
          onChange={setInputText}
          onSendMessage={(content) => {
            onSendMessage(issue.id, content);
            setInputText('');
          }}
          onExecuteDirective={onExecuteDirective}
          inputId={`input-issue-${issue.id}-chat`}
        />
      </div>
    </div>
  );
}
