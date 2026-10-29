/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Bell,
  CheckCheck,
  Trash2,
  Filter,
  Search,
  Briefcase,
  MessageSquare,
  Users,
  AlertCircle,
  ExternalLink,
  Check,
  CheckCircle2,
  Clock,
  Sparkles
} from 'lucide-react';
import { AppNotification, NotificationType } from '../../types';

interface NotificationViewerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onDeleteNotification?: (id: string) => void;
  onNotificationClick: (notif: AppNotification) => void;
}

type FilterCategory = 'all' | 'unread' | 'tasks' | 'chat' | 'system';

/**
 * Format timestamp into human-readable relative string.
 */
function formatTimeAgo(timestampStr?: string): string {
  if (!timestampStr) return 'Just now';
  try {
    const date = new Date(timestampStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 45) return 'Just now';
    if (diffSec < 3600) {
      const mins = Math.max(1, Math.floor(diffSec / 60));
      return `${mins}m ago`;
    }
    if (diffSec < 86400) {
      const hours = Math.floor(diffSec / 3600);
      return `${hours}h ago`;
    }
    if (diffSec < 604800) {
      const days = Math.floor(diffSec / 86400);
      return `${days}d ago`;
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
}

/**
 * Visual styling configuration for notification types.
 */
function getNotificationVisuals(type: NotificationType) {
  switch (type) {
    case 'task_assigned':
    case 'issue_assigned':
      return {
        icon: Briefcase,
        bg: 'bg-orange-50',
        text: 'text-[#F27421]',
        border: 'border-orange-200',
        badge: 'Task',
        badgeBg: 'bg-orange-100 text-[#F27421]'
      };
    case 'chat':
      return {
        icon: MessageSquare,
        bg: 'bg-blue-50',
        text: 'text-blue-600',
        border: 'border-blue-200',
        badge: 'Discussion',
        badgeBg: 'bg-blue-100 text-blue-700'
      };
    case 'team_added':
      return {
        icon: Users,
        bg: 'bg-emerald-50',
        text: 'text-emerald-600',
        border: 'border-emerald-200',
        badge: 'Team',
        badgeBg: 'bg-emerald-100 text-emerald-700'
      };
    case 'system':
    default:
      return {
        icon: AlertCircle,
        bg: 'bg-indigo-50',
        text: 'text-indigo-600',
        border: 'border-indigo-200',
        badge: 'System',
        badgeBg: 'bg-indigo-100 text-indigo-700'
      };
  }
}

export default function NotificationViewerDrawer({
  isOpen,
  onClose,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  onDeleteNotification,
  onNotificationClick
}: NotificationViewerDrawerProps) {
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Derived counts
  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);
  const taskCount = useMemo(() => notifications.filter(n => n.type === 'task_assigned' || n.type === 'issue_assigned').length, [notifications]);
  const chatCount = useMemo(() => notifications.filter(n => n.type === 'chat').length, [notifications]);
  const systemCount = useMemo(() => notifications.filter(n => n.type === 'system' || n.type === 'team_added').length, [notifications]);

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter(notif => {
      // Category filter
      if (activeCategory === 'unread' && notif.isRead) return false;
      if (activeCategory === 'tasks' && notif.type !== 'task_assigned' && notif.type !== 'issue_assigned') return false;
      if (activeCategory === 'chat' && notif.type !== 'chat') return false;
      if (activeCategory === 'system' && notif.type !== 'system' && notif.type !== 'team_added') return false;

      // Text search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = notif.title.toLowerCase().includes(query);
        const matchesMessage = notif.message.toLowerCase().includes(query);
        const matchesActor = notif.actorName?.toLowerCase().includes(query);
        if (!matchesTitle && !matchesMessage && !matchesActor) return false;
      }

      return true;
    });
  }, [notifications, activeCategory, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="notification-drawer-title">
      {/* 1. Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 2. Slide-over Panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md sm:max-w-lg bg-white shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-250 ease-out">
          
          {/* Drawer Header */}
          <div className="px-6 py-5 bg-[#0F142A] text-white flex flex-col space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-[#F27421]/20 border border-[#F27421]/40 flex items-center justify-center text-[#F27421]">
                  <Bell size={20} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 id="notification-drawer-title" className="font-heading font-bold text-base text-white tracking-tight">
                      Notifications
                    </h2>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 text-[11px] font-bold font-mono rounded-full bg-[#F27421] text-white shadow-xs">
                        {unreadCount} unread
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-sans mt-0.5">
                    Operational updates, assignments & system events
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                title="Close drawer (Esc)"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Header Actions: Mark All Read & Clear All */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
              <div className="flex items-center space-x-2">
                <button
                  onClick={onMarkAllAsRead}
                  disabled={unreadCount === 0}
                  className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/15 text-slate-200 hover:text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Mark all as read"
                >
                  <CheckCheck size={14} className="text-[#F27421]" />
                  <span>Mark all read</span>
                </button>

                <button
                  onClick={onClearAll}
                  disabled={notifications.length === 0}
                  className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-200 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Clear all notifications"
                >
                  <Trash2 size={13} />
                  <span>Clear all</span>
                </button>
              </div>

              <span className="text-[11px] font-mono text-slate-400">
                {notifications.length} total
              </span>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2 shrink-0">
            {/* Search Input */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search notifications..."
                className="w-full pl-9 pr-8 py-1.5 bg-white text-xs text-slate-800 rounded-lg border border-slate-200 focus:border-[#F27421] focus:ring-1 focus:ring-[#F27421]/30 transition-all outline-none placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Filter Category Tabs */}
            <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar py-0.5">
              <button
                onClick={() => setActiveCategory('all')}
                className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeCategory === 'all'
                    ? 'bg-[#0F142A] text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                All ({notifications.length})
              </button>

              <button
                onClick={() => setActiveCategory('unread')}
                className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeCategory === 'unread'
                    ? 'bg-[#F27421] text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                Unread ({unreadCount})
              </button>

              <button
                onClick={() => setActiveCategory('tasks')}
                className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeCategory === 'tasks'
                    ? 'bg-[#0F142A] text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                Tasks ({taskCount})
              </button>

              <button
                onClick={() => setActiveCategory('chat')}
                className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeCategory === 'chat'
                    ? 'bg-[#0F142A] text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                Chat ({chatCount})
              </button>

              <button
                onClick={() => setActiveCategory('system')}
                className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  activeCategory === 'system'
                    ? 'bg-[#0F142A] text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                System ({systemCount})
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-[#F8FAFC]">
            {filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 px-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-400 mb-3">
                  <CheckCircle2 size={28} className="text-emerald-500" />
                </div>
                <h3 className="font-heading font-semibold text-sm text-slate-800">
                  {notifications.length === 0 ? 'No notifications yet' : 'No matching notifications'}
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  {notifications.length === 0
                    ? "You're all caught up! New tasks, team messages, and system alerts will appear here."
                    : 'Try clearing your search or switching to another filter tab.'}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="mt-3 px-3 py-1 text-xs font-medium text-[#F27421] hover:underline"
                  >
                    Clear search query
                  </button>
                )}
              </div>
            ) : (
              filteredNotifications.map(notif => {
                const visual = getNotificationVisuals(notif.type);
                const IconComponent = visual.icon;

                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      onNotificationClick(notif);
                      onClose();
                    }}
                    className={`group relative p-3.5 rounded-xl border transition-all cursor-pointer ${
                      notif.isRead
                        ? 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-xs'
                        : 'bg-white border-amber-200/90 shadow-xs ring-1 ring-[#F27421]/15 hover:border-[#F27421]/50'
                    }`}
                  >
                    {/* Unread indicator dot */}
                    {!notif.isRead && (
                      <span className="absolute top-3.5 right-3.5 w-2.5 h-2.5 rounded-full bg-[#F27421] ring-4 ring-orange-100" />
                    )}

                    <div className="flex items-start space-x-3">
                      {/* Type Icon Badge */}
                      <div className={`w-9 h-9 rounded-lg ${visual.bg} ${visual.border} border flex items-center justify-center shrink-0 mt-0.5`}>
                        <IconComponent size={18} className={visual.text} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase font-mono ${visual.badgeBg}`}>
                            {visual.badge}
                          </span>
                          {notif.actorName && (
                            <span className="text-[11px] font-medium text-slate-500">
                              by {notif.actorName}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400 font-mono flex items-center space-x-1 ml-auto">
                            <Clock size={11} className="mr-0.5 inline" />
                            {formatTimeAgo(notif.timestamp)}
                          </span>
                        </div>

                        <h4 className={`text-xs font-heading font-semibold mt-1 text-slate-900 group-hover:text-[#F27421] transition-colors ${
                          !notif.isRead ? 'font-bold' : ''
                        }`}>
                          {notif.title}
                        </h4>

                        <p className="text-xs text-slate-600 font-sans mt-0.5 line-clamp-2 leading-relaxed">
                          {notif.message}
                        </p>

                        {/* Navigation hint chip */}
                        <div className="mt-2.5 flex items-center justify-between">
                          <span className="inline-flex items-center space-x-1 text-[11px] font-medium text-[#F27421] group-hover:underline">
                            <span>Open details</span>
                            <ExternalLink size={11} />
                          </span>

                          {/* Quick action buttons on hover */}
                          <div
                            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1"
                            onClick={e => e.stopPropagation()}
                          >
                            {!notif.isRead && (
                              <button
                                onClick={() => onMarkAsRead(notif.id)}
                                className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                title="Mark as read"
                              >
                                <Check size={13} />
                              </button>
                            )}
                            {onDeleteNotification && (
                              <button
                                onClick={() => onDeleteNotification(notif.id)}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="Delete notification"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Drawer Footer: Status & Live indicator */}
          <div className="px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-sans">Live Activity Stream (SSE Active)</span>
            </div>
            <button
              onClick={onClose}
              className="text-xs text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
            >
              Close
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
