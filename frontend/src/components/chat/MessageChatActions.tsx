/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Smile, CornerDownLeft, Forward, Plus, CheckSquare } from 'lucide-react';
import { MessageReplyInfo, MessageForwardInfo } from '../../types';

export const POPULAR_REACTIONS = ['👍', '❤️', '🚀', '👀', '⚠️', '✅'] as const;

export interface MessageActionBarProps {
  onReply?: () => void;
  onForward?: () => void;
  onToggleReaction?: (emoji: string) => void;
  onCreateTask?: () => void;
  isSelf?: boolean;
}

export const MessageActionBar: React.FC<MessageActionBarProps> = ({
  onReply,
  onForward,
  onToggleReaction,
  onCreateTask,
  isSelf = false
}) => {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  return (
    <div className={`relative flex items-center bg-white/95 backdrop-blur-xs border border-slate-200 shadow-xs rounded-lg px-1 py-0.5 space-x-0.5 z-10 transition-opacity animate-in fade-in duration-100`}>
      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div
          ref={pickerRef}
          className={`absolute bottom-full mb-1 ${isSelf ? 'right-0' : 'left-0'} flex items-center gap-1 p-1 bg-white border border-slate-200/90 shadow-lg rounded-xl z-30 animate-in fade-in zoom-in-95 duration-100`}
        >
          {POPULAR_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onToggleReaction?.(emoji);
                setShowEmojiPicker(false);
              }}
              className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 rounded-lg text-sm transition-transform hover:scale-120 cursor-pointer"
              title={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* React Button */}
      {onToggleReaction && (
        <button
          type="button"
          onClick={() => setShowEmojiPicker(prev => !prev)}
          className={`p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer ${showEmojiPicker ? 'bg-slate-100 text-slate-800' : ''}`}
          title="Add reaction"
        >
          <Smile size={13} />
        </button>
      )}

      {/* Reply Button */}
      {onReply && (
        <button
          type="button"
          onClick={onReply}
          className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
          title="Reply to message"
        >
          <CornerDownLeft size={13} />
        </button>
      )}

      {/* Forward Button */}
      {onForward && (
        <button
          type="button"
          onClick={onForward}
          className="p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors cursor-pointer"
          title="Forward message"
        >
          <Forward size={13} />
        </button>
      )}

      {/* Create Task Button */}
      {onCreateTask && (
        <button
          type="button"
          onClick={onCreateTask}
          className="p-1 text-slate-400 hover:text-[#F27421] hover:bg-orange-50 rounded transition-colors cursor-pointer"
          title="Create task from message"
        >
          <CheckSquare size={13} />
        </button>
      )}
    </div>
  );
};

export interface MessageReactionsRowProps {
  reactions?: Record<string, string[]>;
  currentUserId: string;
  onToggleReaction: (emoji: string) => void;
  isSelf?: boolean;
}

export const MessageReactionsRow: React.FC<MessageReactionsRowProps> = ({
  reactions,
  currentUserId,
  onToggleReaction,
  isSelf = false
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPicker]);

  if (!reactions || Object.keys(reactions).length === 0) {
    return null;
  }

  const reactionEntries = Object.entries(reactions).filter(([_, users]) => users && users.length > 0);
  if (reactionEntries.length === 0) return null;

  return (
    <div className={`relative flex flex-wrap items-center gap-1 mt-1 ${isSelf ? 'justify-end' : 'justify-start'}`}>
      {reactionEntries.map(([emoji, users]) => {
        const hasReacted = users.includes(currentUserId);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggleReaction(emoji)}
            className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
              hasReacted
                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 shadow-2xs font-semibold'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
            title={`Reacted by ${users.length} person${users.length > 1 ? 's' : ''}`}
          >
            <span>{emoji}</span>
            <span className="text-[10px]">{users.length}</span>
          </button>
        );
      })}

      {/* Add reaction plus button */}
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setShowPicker(prev => !prev)}
          className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-[10px] transition-colors cursor-pointer"
          title="Add another reaction"
        >
          <Plus size={10} />
        </button>

        {showPicker && (
          <div
            ref={pickerRef}
            className={`absolute bottom-full mb-1 ${isSelf ? 'right-0' : 'left-0'} flex items-center gap-1 p-1 bg-white border border-slate-200/90 shadow-lg rounded-xl z-30 animate-in fade-in zoom-in-95 duration-100`}
          >
            {POPULAR_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onToggleReaction(emoji);
                  setShowPicker(false);
                }}
                className="w-6 h-6 flex items-center justify-center hover:bg-slate-100 rounded-lg text-xs transition-transform hover:scale-120 cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export interface MessageQuotedReplyProps {
  replyTo?: MessageReplyInfo;
  isSelf?: boolean;
}

export const MessageQuotedReply: React.FC<MessageQuotedReplyProps> = ({ replyTo, isSelf = false }) => {
  if (!replyTo) return null;

  return (
    <div
      className={`mb-1.5 pl-2.5 py-1 pr-2 rounded-lg border-l-2 text-[11px] font-sans ${
        isSelf
          ? 'bg-white/15 border-white/70 text-blue-50'
          : 'bg-slate-100/90 border-blue-500 text-slate-700'
      }`}
    >
      <div className={`font-bold font-mono text-[10px] ${isSelf ? 'text-white' : 'text-blue-700'}`}>
        @{replyTo.senderName}
      </div>
      <div className={`truncate max-w-xs ${isSelf ? 'text-blue-100' : 'text-slate-600'}`}>
        {replyTo.snippet}
      </div>
    </div>
  );
};

export interface MessageForwardedHeaderProps {
  forwardedFrom?: MessageForwardInfo;
  isSelf?: boolean;
}

export const MessageForwardedHeader: React.FC<MessageForwardedHeaderProps> = ({ forwardedFrom, isSelf = false }) => {
  if (!forwardedFrom) return null;

  return (
    <div className={`flex items-center space-x-1 text-[10px] font-mono italic mb-1 ${isSelf ? 'text-blue-100' : 'text-slate-400'}`}>
      <Forward size={11} className={isSelf ? 'text-blue-200' : 'text-slate-400'} />
      <span>
        Forwarded from <span className="font-semibold">@{forwardedFrom.senderName}</span>
        {forwardedFrom.sourceTitle && ` (${forwardedFrom.sourceTitle})`}
      </span>
    </div>
  );
};

