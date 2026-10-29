/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Bell,
  Settings,
  Flag,
  MessageSquare,
  Clock,
  ShieldCheck,
  Server,
  Box,
  ArrowRight,
  Check,
  Sparkles
} from 'lucide-react';
import { AppNotification, NotificationType } from '../../types';

interface NotificationBellDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onNotificationClick: (notif: AppNotification) => void;
  onOpenNotificationCenter: () => void;
  onOpenPreferences: () => void;
  onTakeAction?: (notif: AppNotification) => void;
}

type DropdownTab = 'all' | 'unread' | 'mentions' | 'todo';

function formatCompactTime(timestampStr?: string): string {
  if (!timestampStr) return 'Just now';
  try {
    const date = new Date(timestampStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 45) return 'Just now';
    if (diffSec < 3600) {
      const mins = Math.max(1, Math.floor(diffSec / 60));
      return `${mins} min`;
    }
    if (diffSec < 86400) {
      const hours = Math.floor(diffSec / 3600);
      return `${hours} h`;
    }
    const days = Math.floor(diffSec / 86400);
    return `${days} d`;
  } catch {
    return 'Recently';
  }
}

function getIconForNotification(notif: AppNotification) {
  const cat = notif.category;
  const type = notif.type;

  if (cat === 'escalation' || type === 'task_assigned' || type === 'issue_assigned') {
    return {
      icon: Flag,
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      text: 'text-[#F27421]'
    };
  }
  if (cat === 'mention' || type === 'chat') {
    return {
      icon: MessageSquare,
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-600'
    };
  }
  if (cat === 'sla') {
    return {
      icon: Clock,
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-600'
    };
  }
  if (cat === 'approval' || cat === 'hashtag') {
    return {
      icon: ShieldCheck,
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-600'
    };
  }
  if (cat === 'investigation') {
    return {
      icon: Box,
      bg: 'bg-indigo-50',
      border: 'border-indigo-200',
      text: 'text-indigo-600'
    };
  }
  return {
    icon: Server,
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-600'
  };
}

export default function NotificationBellDropdown({
  isOpen,
  onClose,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onNotificationClick,
  onOpenNotificationCenter,
  onOpenPreferences,
  onTakeAction
}: NotificationBellDropdownProps) {
  const [activeTab, setActiveTab] = useState<DropdownTab>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);
  const todoCount = useMemo(() => {
    return notifications.filter(n =>
      n.status === 'needs_action' ||
      n.priority === 'needs_action' ||
      n.actionLabel !== undefined
    ).length;
  }, [notifications]);

  const filteredList = useMemo(() => {
    return notifications.filter(n => {
      if (activeTab === 'unread') return !n.isRead;
      if (activeTab === 'mentions') return n.type === 'chat' || n.category === 'mention';
      if (activeTab === 'todo') {
        return n.status === 'needs_action' || n.priority === 'needs_action' || n.actionLabel !== undefined;
      }
      return true;
    });
  }, [notifications, activeTab]);

  const displayedNotifications = filteredList.slice(0, 6);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-full mt-2 w-[400px] sm:w-[420px] bg-white rounded-2xl shadow-2xl border border-slate-200/90 z-50 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      style={{ boxShadow: '0 20px 40px -10px rgba(15, 20, 42, 0.22), 0 0 1px 1px rgba(15, 20, 42, 0.05)' }}
    >
      {/* 1. Header */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-slate-100">
        <h3 className="font-heading font-bold text-sm text-slate-900 tracking-tight">
          Notifications
        </h3>
        <div className="flex items-center space-x-3">
          <button
            onClick={onMarkAllAsRead}
            disabled={unreadCount === 0}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Mark all read
          </button>
          <button
            onClick={() => {
              onClose();
              onOpenPreferences();
            }}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Notification preferences"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>

      {/* 2. Segmented Navigation Tabs */}
      <div className="px-4 py-2 bg-slate-50/70 border-b border-slate-100">
        <div className="flex items-center space-x-1 p-0.5 bg-slate-200/60 rounded-xl">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All
          </button>

          <button
            onClick={() => setActiveTab('unread')}
            className={`flex-1 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center justify-center space-x-1 ${
              activeTab === 'unread'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Unread</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-mono text-slate-500 font-semibold">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('mentions')}
            className={`flex-1 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              activeTab === 'mentions'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mentions
          </button>

          <button
            onClick={() => setActiveTab('todo')}
            className={`flex-1 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center justify-center space-x-1 ${
              activeTab === 'todo'
                ? 'bg-white text-[#F27421] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>To do</span>
            {todoCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-orange-100 text-[#F27421] font-bold">
                {todoCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 3. Notification List Items */}
      <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
        <div className="px-5 pt-3 pb-1">
          <span className="text-[11px] font-medium text-slate-400">Today</span>
        </div>

        {displayedNotifications.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <p className="text-xs text-slate-400 font-medium">No notifications in this view</p>
          </div>
        ) : (
          displayedNotifications.map(notif => {
            const visual = getIconForNotification(notif);
            const Icon = visual.icon;
            const actionText = notif.actionLabel ||
              (notif.type === 'task_assigned' ? 'Stage task' :
              (notif.type === 'chat' ? 'Reply' : 'Open case'));

            return (
              <div
                key={notif.id}
                onClick={() => {
                  onNotificationClick(notif);
                  onClose();
                }}
                className={`group px-4 py-3 flex items-start space-x-3 transition-colors cursor-pointer ${
                  notif.isRead ? 'hover:bg-slate-50' : 'bg-orange-50/20 hover:bg-orange-50/40'
                }`}
              >
                {/* Unread indicator dot */}
                <div className="w-2 flex justify-center pt-2 shrink-0">
                  {!notif.isRead ? (
                    <span className="w-2 h-2 rounded-full bg-[#F27421]" />
                  ) : (
                    <span className="w-2 h-2" />
                  )}
                </div>

                {/* Category Icon */}
                <div className={`w-8 h-8 rounded-lg ${visual.bg} ${visual.border} border flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon size={15} className={visual.text} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-baseline justify-between">
                    <h4 className="text-xs font-heading font-semibold text-slate-900 truncate pr-2 group-hover:text-[#F27421] transition-colors">
                      {notif.title}
                    </h4>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {formatCompactTime(notif.timestamp)}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 font-sans mt-0.5 line-clamp-1">
                    {notif.message}
                  </p>

                  {/* 1-tap quick action button */}
                  <div className="mt-2 flex items-center">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (onTakeAction) {
                          onTakeAction(notif);
                        } else {
                          onNotificationClick(notif);
                        }
                        onClose();
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
                    >
                      {actionText}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Dropdown Footer */}
      <div className="px-5 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span className="text-[11px] font-mono text-slate-400">
          Showing {displayedNotifications.length} of {notifications.length}
        </span>
        <button
          onClick={() => {
            onClose();
            onOpenNotificationCenter();
          }}
          className="inline-flex items-center space-x-1 text-xs font-semibold text-[#0F142A] hover:text-[#F27421] transition-colors cursor-pointer"
        >
          <span>Open notification center</span>
          <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
