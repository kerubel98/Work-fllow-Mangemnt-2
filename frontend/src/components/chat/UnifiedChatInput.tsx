/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { User, Team, HashtagPreset } from '../../types';
import { 
  Send, Sparkles, CheckSquare, ShieldAlert, Tag, 
  Hash, ShieldCheck, Users, CornerDownLeft, Command,
  AlertCircle, ChevronRight, X
} from 'lucide-react';

export type InChatDirectiveType = 
  | 'create-task' 
  | 'create-escalate' 
  | 'create-hashtag' 
  | 'call-hashtag' 
  | 'request-approval';

export interface InChatDirectiveItem {
  id: InChatDirectiveType;
  label: string;
  description: string;
  category: 'Task' | 'Incident' | 'Hashtag' | 'Governance';
  icon: React.ReactNode;
  badge: string;
}

export interface UnifiedChatInputProps {
  currentUser: User;
  users?: User[];
  teams?: Team[];
  hashtags?: HashtagPreset[];
  placeholder?: string;
  value?: string;
  onChange?: (val: string) => void;
  onSendMessage: (content: string) => void;
  onExecuteDirective?: (directive: InChatDirectiveType, currentContext: string) => void;
  quickPrompts?: string[];
  disabled?: boolean;
  inputId?: string;
  className?: string;
  buttonLabel?: string;
  showAttachmentButton?: boolean;
  onAttachmentClick?: () => void;
}

export const STANDARD_DIRECTIVES: InChatDirectiveItem[] = [
  {
    id: 'create-task',
    label: '/create-task',
    description: 'Create an operational investigation task from this thread',
    category: 'Task',
    icon: <CheckSquare size={14} className="text-blue-500" />,
    badge: 'Task action'
  },
  {
    id: 'create-escalate',
    label: '/create-escalate',
    description: 'Hand this case to another team under a signed agreement',
    category: 'Incident',
    icon: <ShieldAlert size={14} className="text-[#F27421]" />,
    badge: 'Escalate to team'
  },
  {
    id: 'create-hashtag',
    label: '/create-hashtag',
    description: 'Define a new universal hashtag automation preset',
    category: 'Hashtag',
    icon: <Tag size={14} className="text-emerald-500" />,
    badge: 'Automation'
  },
  {
    id: 'call-hashtag',
    label: '/call-hashtag',
    description: 'Search and attach an existing registered #hashtag rule',
    category: 'Hashtag',
    icon: <Hash size={14} className="text-indigo-500" />,
    badge: 'Workflow'
  },
  {
    id: 'request-approval',
    label: '/request-approval',
    description: 'Stage a Maker-Checker discrepancy resolution proposal',
    category: 'Governance',
    icon: <ShieldCheck size={14} className="text-amber-500" />,
    badge: 'Four-Eyes Principle'
  }
];

type TriggerMode = 'directive' | 'user' | 'team' | 'hashtag';

interface ActiveTriggerState {
  mode: TriggerMode;
  query: string;
  startIndex: number;
  endIndex: number;
}

export const UnifiedChatInput: React.FC<UnifiedChatInputProps> = ({
  currentUser,
  users = [],
  teams = [],
  hashtags = [],
  placeholder = 'Type a message, @ for user, @@ for team, / for directives...',
  value: controlledValue,
  onChange: controlledOnChange,
  onSendMessage,
  onExecuteDirective,
  quickPrompts,
  disabled = false,
  inputId = 'unified-chat-input',
  className = '',
  buttonLabel = 'Send',
  showAttachmentButton = false,
  onAttachmentClick
}) => {
  const [internalText, setInternalText] = useState('');
  const text = controlledValue !== undefined ? controlledValue : internalText;
  const setText = (val: string) => {
    if (controlledOnChange) {
      controlledOnChange(val);
    } else {
      setInternalText(val);
    }
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [activeTrigger, setActiveTrigger] = useState<ActiveTriggerState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Parse text at cursor position to detect active trigger token
  const evaluateTrigger = (currentText: string, cursorPosition: number) => {
    const textBeforeCursor = currentText.slice(0, cursorPosition);
    
    // Check Team trigger: @@...
    const teamMatch = textBeforeCursor.match(/(?:^|\s)@@([a-zA-Z0-9_-]*)$/);
    if (teamMatch) {
      const matchText = teamMatch[0];
      const startIndex = teamMatch.index! + (matchText.startsWith(' ') ? 1 : 0);
      setActiveTrigger({
        mode: 'team',
        query: teamMatch[1] || '',
        startIndex,
        endIndex: cursorPosition
      });
      setSelectedIndex(0);
      return;
    }

    // Check User trigger: @...
    const userMatch = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_-]*)$/);
    if (userMatch) {
      const matchText = userMatch[0];
      const startIndex = userMatch.index! + (matchText.startsWith(' ') ? 1 : 0);
      setActiveTrigger({
        mode: 'user',
        query: userMatch[1] || '',
        startIndex,
        endIndex: cursorPosition
      });
      setSelectedIndex(0);
      return;
    }

    // Check Directive trigger: /...
    const directiveMatch = textBeforeCursor.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);
    if (directiveMatch) {
      const matchText = directiveMatch[0];
      const startIndex = directiveMatch.index! + (matchText.startsWith(' ') ? 1 : 0);
      setActiveTrigger({
        mode: 'directive',
        query: directiveMatch[1] || '',
        startIndex,
        endIndex: cursorPosition
      });
      setSelectedIndex(0);
      return;
    }

    // Check Hashtag trigger: #...
    const hashtagMatch = textBeforeCursor.match(/(?:^|\s)#([a-zA-Z0-9_-]*)$/);
    if (hashtagMatch) {
      const matchText = hashtagMatch[0];
      const startIndex = hashtagMatch.index! + (matchText.startsWith(' ') ? 1 : 0);
      setActiveTrigger({
        mode: 'hashtag',
        query: hashtagMatch[1] || '',
        startIndex,
        endIndex: cursorPosition
      });
      setSelectedIndex(0);
      return;
    }

    // No active trigger
    setActiveTrigger(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;
    const cursor = e.target.selectionStart || newText.length;
    setText(newText);
    evaluateTrigger(newText, cursor);
  };

  const handleInputKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // If arrow keys inside input (not navigating dropdown), update active trigger
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      const cursor = inputRef.current?.selectionStart || text.length;
      evaluateTrigger(text, cursor);
    }
  };

  // Filter suggestion list according to active mode and query
  const filteredSuggestions = useMemo(() => {
    if (!activeTrigger) return [];
    const q = activeTrigger.query.toLowerCase().trim();

    if (activeTrigger.mode === 'directive') {
      return STANDARD_DIRECTIVES.filter(d => 
        d.id.toLowerCase().includes(q) || 
        d.label.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q)
      );
    }

    if (activeTrigger.mode === 'user') {
      return users
        .filter(u => 
          u.username.toLowerCase().includes(q) || 
          (u.displayName && u.displayName.toLowerCase().includes(q)) ||
          (u.email && u.email.toLowerCase().includes(q))
        )
        .slice(0, 10);
    }

    if (activeTrigger.mode === 'team') {
      return teams
        .filter(t => 
          t.name.toLowerCase().includes(q) || 
          (t.description && t.description.toLowerCase().includes(q))
        )
        .slice(0, 8);
    }

    if (activeTrigger.mode === 'hashtag') {
      return hashtags
        .filter(h => 
          h.tag.toLowerCase().includes(q) || 
          (h.description && h.description.toLowerCase().includes(q))
        )
        .slice(0, 10);
    }

    return [];
  }, [activeTrigger, users, teams, hashtags]);

  // Insert mention or execute directive
  const handleSelectSuggestion = (item: any) => {
    if (!activeTrigger) return;

    let insertion = '';
    const beforeTrigger = text.slice(0, activeTrigger.startIndex);
    const afterTrigger = text.slice(activeTrigger.endIndex);

    if (activeTrigger.mode === 'directive') {
      const directive = item as InChatDirectiveItem;
      // If the directive needs arguments (like hashtag name), keep it in input for the user to complete
      if (directive.id === 'create-hashtag' || directive.id === 'call-hashtag') {
        insertion = `${directive.label} `;
        const updated = beforeTrigger + insertion + afterTrigger;
        setText(updated);
        setActiveTrigger(null);
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            const nextCursor = beforeTrigger.length + insertion.length;
            inputRef.current.setSelectionRange(nextCursor, nextCursor);
          }
        }, 10);
        return;
      }

      // For direct action directives (create-task, create-escalate, request-approval), execute immediately!
      if (onExecuteDirective) {
        onExecuteDirective(directive.id, beforeTrigger + afterTrigger);
      }
      setText('');
      setActiveTrigger(null);
      return;
    } else if (activeTrigger.mode === 'user') {
      const u = item as User;
      insertion = `@${u.username} `;
    } else if (activeTrigger.mode === 'team') {
      const t = item as Team;
      insertion = `@@${t.name} `;
    } else if (activeTrigger.mode === 'hashtag') {
      const h = item as HashtagPreset;
      const cleanTag = h.tag.startsWith('#') ? h.tag : `#${h.tag}`;
      insertion = `${cleanTag} `;
    }

    const updated = beforeTrigger + insertion + afterTrigger;
    setText(updated);
    setActiveTrigger(null);

    // Set cursor position right after insertion
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const nextCursor = beforeTrigger.length + insertion.length;
        inputRef.current.setSelectionRange(nextCursor, nextCursor);
      }
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (activeTrigger && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectSuggestion(filteredSuggestions[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setActiveTrigger(null);
        return;
      }
    }

    // Standard Enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    const trimmed = text.trim();
    // Intercept in-chat directives if typed directly into the input
    if (trimmed.startsWith('/')) {
      const parts = trimmed.split(/\s+/);
      const command = parts[0].slice(1).toLowerCase();
      const argument = parts.slice(1).join(' ');
      const matched = STANDARD_DIRECTIVES.find(d => d.id.toLowerCase() === command || d.label.toLowerCase() === parts[0].toLowerCase());
      if (matched && onExecuteDirective) {
        onExecuteDirective(matched.id, argument);
        setText('');
        setActiveTrigger(null);
        return;
      }
    }
    onSendMessage(trimmed);
    setText('');
    setActiveTrigger(null);
  };

  // Click outside to dismiss popover
  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(ev.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(ev.target as Node)
      ) {
        setActiveTrigger(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative flex flex-col ${className}`}>
      
      {/* ================= FLOATING AUTOCOMPLETE POPOVER ================= */}
      {activeTrigger && filteredSuggestions.length > 0 && (
        <div
          ref={popoverRef}
          id="chat-directive-popover"
          className="absolute bottom-full mb-2 left-0 right-0 max-h-72 bg-white border border-slate-200/90 rounded-2xl shadow-xl overflow-hidden z-50 flex flex-col backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {/* Popover Header Badge */}
          <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] font-mono">
            <div className="flex items-center space-x-1.5 font-bold text-slate-700">
              {activeTrigger.mode === 'directive' && (
                <>
                  <Command size={13} className="text-blue-600" />
                  <span>COMMAND DIRECTIVES</span>
                  <span className="text-[10px] text-slate-400 font-normal">Type / to filter</span>
                </>
              )}
              {activeTrigger.mode === 'user' && (
                <>
                  <Users size={13} className="text-blue-600" />
                  <span>COLLEAGUE MENTIONS</span>
                  <span className="text-[10px] text-slate-400 font-normal">Type @ to filter</span>
                </>
              )}
              {activeTrigger.mode === 'team' && (
                <>
                  <Users size={13} className="text-purple-600" />
                  <span>TEAM MENTIONS</span>
                  <span className="text-[10px] text-slate-400 font-normal">Type @@ to filter</span>
                </>
              )}
              {activeTrigger.mode === 'hashtag' && (
                <>
                  <Hash size={13} className="text-emerald-600" />
                  <span>UNIVERSAL HASHTAGS</span>
                  <span className="text-[10px] text-slate-400 font-normal">Type # to filter</span>
                </>
              )}
            </div>
            
            <div className="flex items-center space-x-2 text-[10px] text-slate-400">
              <span>↑↓ to navigate</span>
              <span>•</span>
              <span>↵ to select</span>
              <span>•</span>
              <span>esc to close</span>
              <button 
                type="button" 
                onClick={() => setActiveTrigger(null)} 
                className="hover:text-slate-600 p-0.5 rounded cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* Suggestions List */}
          <div className="overflow-y-auto divide-y divide-slate-100 max-h-56">
            
            {/* DIRECTIVES */}
            {activeTrigger.mode === 'directive' && (
              (filteredSuggestions as InChatDirectiveItem[]).map((directive, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={directive.id}
                    type="button"
                    onClick={() => handleSelectSuggestion(directive)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected ? 'bg-blue-50/90 text-blue-950' : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className={`p-1.5 rounded-lg shrink-0 ${isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                        {directive.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold font-mono text-slate-900">{directive.label}</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
                            {directive.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{directive.description}</p>
                      </div>
                    </div>
                    <ChevronRight size={14} className={isSelected ? 'text-blue-600' : 'text-slate-300'} />
                  </button>
                );
              })
            )}

            {/* USER MENTIONS */}
            {activeTrigger.mode === 'user' && (
              (filteredSuggestions as User[]).map((user, index) => {
                const isSelected = index === selectedIndex;
                const initials = (user.displayName || user.username).substring(0, 2).toUpperCase();
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleSelectSuggestion(user)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full px-3.5 py-2 text-left flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected ? 'bg-blue-50/90 text-blue-950' : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="relative shrink-0 w-7 h-7 rounded-full overflow-hidden bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold font-mono">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover rounded-full" />
                        ) : (
                          initials
                        )}
                        <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-bold text-slate-900">{user.displayName || user.username}</span>
                          <span className="text-[11px] font-mono text-blue-600">@{user.username}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{user.email || 'Internal Team Member'}</p>
                      </div>
                    </div>

                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                      {user.role}
                    </span>
                  </button>
                );
              })
            )}

            {/* TEAM MENTIONS */}
            {activeTrigger.mode === 'team' && (
              (filteredSuggestions as Team[]).map((team, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => handleSelectSuggestion(team)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full px-3.5 py-2 text-left flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected ? 'bg-purple-50/90 text-purple-950' : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 border border-purple-200 flex items-center justify-center font-bold font-mono text-xs shrink-0">
                        <Users size={14} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-bold text-slate-900">{team.name}</span>
                          <span className="text-[11px] font-mono text-purple-600">@@{team.name}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">{team.description || (team.teamType ? `${team.teamType} team` : 'Operational Unit')}</p>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
                      {team.memberIds?.length || 0} members
                    </span>
                  </button>
                );
              })
            )}

            {/* HASHTAGS */}
            {activeTrigger.mode === 'hashtag' && (
              (filteredSuggestions as HashtagPreset[]).map((ht, index) => {
                const isSelected = index === selectedIndex;
                const cleanTag = ht.tag.startsWith('#') ? ht.tag : `#${ht.tag}`;
                return (
                  <button
                    key={ht.tag}
                    type="button"
                    onClick={() => handleSelectSuggestion(ht)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full px-3.5 py-2 text-left flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected ? 'bg-emerald-50/90 text-emerald-950' : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <Hash size={13} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-bold font-mono text-emerald-800">{cleanTag}</span>
                        {ht.description && (
                          <p className="text-[10px] text-slate-400 truncate">{ht.description}</p>
                        )}
                      </div>
                    </div>

                    {ht.hashtagType && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-100/70 text-emerald-800 border border-emerald-200 shrink-0">
                        {ht.hashtagType}
                      </span>
                    )}
                  </button>
                );
              })
            )}

          </div>
        </div>
      )}

      {/* ================= QUICK PROMPT CHIPS (OPTIONAL) ================= */}
      {quickPrompts && quickPrompts.length > 0 && (
        <div className="px-3.5 py-1.5 bg-white border-t border-slate-100 flex items-center space-x-2 overflow-x-auto no-scrollbar text-xs shrink-0">
          <span className="text-slate-400 font-normal shrink-0 text-xs">
            Quick prompts
          </span>
          {quickPrompts.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setText(prompt);
                inputRef.current?.focus();
              }}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full text-xs font-medium transition-colors cursor-pointer shrink-0 border border-slate-200/50"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* ================= MAIN CHAT INPUT FORM ================= */}
      <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center space-x-2 w-full">
        <div className="relative flex-1 flex items-center">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            placeholder={placeholder}
            value={text}
            onChange={handleInputChange}
            onKeyUp={handleInputKeyUp}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            autoComplete="off"
            className="w-full px-3.5 py-2.5 bg-white hover:bg-white focus:bg-white border border-slate-200 focus:border-[#F27421] rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-[#F27421]/20 transition-all shadow-2xs"
          />

          {/* Inline Trigger Indicators helper */}
          {!text && (
            <div className="absolute right-3 flex items-center space-x-1.5 pointer-events-none text-[10px] font-mono text-slate-400">
              <span className="px-1 py-0.2 bg-slate-200/60 rounded text-slate-500 font-bold">/</span>
              <span className="px-1 py-0.2 bg-slate-200/60 rounded text-slate-500 font-bold">@</span>
              <span className="px-1 py-0.2 bg-slate-200/60 rounded text-slate-500 font-bold">@@</span>
            </div>
          )}
        </div>

        {/* Optional Action / Attachment Button */}
        {showAttachmentButton && onAttachmentClick && (
          <button
            type="button"
            onClick={onAttachmentClick}
            className="p-2.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
            title="Attach File or Evidence"
          >
            <Tag size={15} />
          </button>
        )}

        {/* Send Button */}
        <button
          type="submit"
          disabled={!text.trim() || disabled}
          className="px-4 py-2.5 bg-[#F27421] hover:bg-[#e06310] disabled:opacity-50 disabled:pointer-events-none text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer shrink-0"
          id={`btn-${inputId}-send`}
        >
          <Send size={13} />
          <span>{buttonLabel}</span>
        </button>
      </form>
    </div>
  );
};

export default UnifiedChatInput;
