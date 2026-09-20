import React, { useState, useRef, useEffect } from 'react';
import { Team, TeamDiscussionMessage, User } from '../../types';
import { 
  MessageSquare, Send, Pin, Tag, Sparkles, 
  CornerDownRight, CheckCheck, Smile
} from 'lucide-react';
import { NoDiscussionEmptyState } from './TeamEmptyStates';

interface TeamDiscussionTabProps {
  currentTeam: Team;
  messages: TeamDiscussionMessage[];
  currentUser: User;
  onSendMessage: (msg: Omit<TeamDiscussionMessage, 'id' | 'timestamp'>) => void;
}

export const TeamDiscussionTab: React.FC<TeamDiscussionTabProps> = ({
  currentTeam,
  messages = [],
  currentUser,
  onSendMessage
}) => {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [safeMessages]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !currentTeam || !currentUser) return;

    onSendMessage({
      teamId: currentTeam.id,
      senderId: currentUser.id,
      senderName: currentUser.username,
      content: inputText.trim()
    });
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)] min-h-[480px] bg-slate-50/50 border border-slate-200/90 rounded-2xl overflow-hidden font-sans shadow-xs" id="team-discussion-tab">
      {/* Discussion Header */}
      <div className="bg-white border-b border-slate-200/90 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <MessageSquare size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-mono">Team Discussion</h3>
            <p className="text-[11px] text-slate-500 font-mono">
              Live collaboration for #{currentTeam?.name ? currentTeam.name.toLowerCase().replace(/\s+/g, '-') : 'general'}
            </p>
          </div>
        </div>

        <span className="text-xs font-mono font-bold text-slate-500 px-2.5 py-1 bg-white border border-slate-200 rounded-lg">
          {safeMessages.length} messages
        </span>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {safeMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <NoDiscussionEmptyState />
          </div>
        ) : (
          safeMessages.map(msg => {
            const isSelf = currentUser && (msg.senderId === currentUser.id || msg.senderName === currentUser.username);
            const initials = msg.senderName?.substring(0, 2).toUpperCase() || 'TM';
            const timestamp = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return (
              <div 
                key={msg.id}
                className={`flex items-start space-x-2.5 ${isSelf ? 'flex-row-reverse space-x-reverse' : ''}`}
              >
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                  isSelf 
                    ? 'bg-blue-600 text-white shadow-2xs' 
                    : 'bg-purple-100 text-purple-900 border border-purple-200 shadow-2xs'
                }`}>
                  {initials}
                </div>

                {/* Message Body */}
                <div className={`max-w-[80%] sm:max-w-[70%] space-y-1 ${isSelf ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-center space-x-2 text-[10px] font-mono ${isSelf ? 'justify-end' : ''}`}>
                    <span className="font-bold text-slate-800">
                      @{msg.senderName} {isSelf && '(You)'}
                    </span>
                    <span className="text-slate-400">{timestamp}</span>
                  </div>

                  <div className={`p-3 rounded-2xl text-xs leading-relaxed ${
                    isSelf 
                      ? 'bg-[#155DFC] text-white rounded-tr-xs shadow-xs' 
                      : 'bg-slate-100 text-slate-800 rounded-tl-xs'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Box */}
      <form onSubmit={handleSend} className="p-3 border-t border-slate-200/80 bg-white rounded-b-2xl flex items-center gap-2">
        <input
          type="text"
          placeholder="Type a message, mention with @, or tag with #..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:border-blue-500 text-slate-800"
          id="input-team-discussion"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="px-4 py-2 bg-[#155DFC] hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none text-white font-mono font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer shrink-0"
          id="btn-send-discussion"
        >
          <Send size={13} />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
};
