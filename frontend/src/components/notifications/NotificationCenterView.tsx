/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Inbox,
  AlertCircle,
  Mail,
  MessageSquare,
  Clock,
  ShieldCheck,
  Server,
  Box,
  Hash,
  Archive,
  Search,
  Check,
  CheckCheck,
  Settings,
  ChevronDown,
  ExternalLink,
  Flame,
  Flag,
  FileCheck2,
  Calendar,
  AlertTriangle,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { AppNotification, NotificationType, NotificationCategory } from '../../types';

interface NotificationCenterViewProps {
  notifications: AppNotification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onSnoozeNotification?: (id: string, snoozeUntil: string) => void;
  onArchiveNotification?: (id: string) => void;
  onTakeAction?: (notif: AppNotification) => void;
  onNavigateToTarget?: (notif: AppNotification) => void;
  onOpenPreferences: () => void;
}

type RailFilter =
  | 'inbox'
  | 'needs_action'
  | 'unread'
  | 'mentions'
  | 'escalations'
  | 'approvals'
  | 'sla'
  | 'investigations'
  | 'hashtags'
  | 'system'
  | 'snoozed'
  | 'archived';

function formatDetailTime(timestampStr?: string): string {
  if (!timestampStr) return 'Just now';
  try {
    const date = new Date(timestampStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 45) return 'Just now';
    if (diffSec < 3600) {
      const mins = Math.max(1, Math.floor(diffSec / 60));
      return `${mins} min ago`;
    }
    if (diffSec < 86400) {
      const hours = Math.floor(diffSec / 3600);
      return `${hours} h ago`;
    }
    const days = Math.floor(diffSec / 86400);
    return `${days} d ago`;
  } catch {
    return 'Recently';
  }
}

export default function NotificationCenterView({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onSnoozeNotification,
  onArchiveNotification,
  onTakeAction,
  onNavigateToTarget,
  onOpenPreferences
}: NotificationCenterViewProps) {
  const [activeFilter, setActiveFilter] = useState<RailFilter>('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);

  // Group counts
  const counts = useMemo(() => {
    return {
      inbox: notifications.filter(n => n.status !== 'archived').length,
      needs_action: notifications.filter(n => n.status === 'needs_action' || n.priority === 'needs_action').length,
      unread: notifications.filter(n => !n.isRead && n.status !== 'archived').length,
      mentions: notifications.filter(n => n.type === 'chat' || n.category === 'mention').length,
      escalations: notifications.filter(n => n.category === 'escalation' || n.type === 'task_assigned').length,
      approvals: notifications.filter(n => n.category === 'approval').length,
      sla: notifications.filter(n => n.category === 'sla').length,
      investigations: notifications.filter(n => n.category === 'investigation').length,
      hashtags: notifications.filter(n => n.category === 'hashtag').length,
      system: notifications.filter(n => n.category === 'system' || n.type === 'system').length,
      snoozed: notifications.filter(n => n.status === 'snoozed').length,
      archived: notifications.filter(n => n.status === 'archived').length,
    };
  }, [notifications]);

  // Filtered notifications list
  const filteredList = useMemo(() => {
    return notifications.filter(n => {
      // Unread only toggle
      if (unreadOnly && n.isRead) return false;

      // Rail filter
      switch (activeFilter) {
        case 'needs_action':
          if (n.status !== 'needs_action' && n.priority !== 'needs_action') return false;
          break;
        case 'unread':
          if (n.isRead) return false;
          break;
        case 'mentions':
          if (n.type !== 'chat' && n.category !== 'mention') return false;
          break;
        case 'escalations':
          if (n.category !== 'escalation' && n.type !== 'task_assigned') return false;
          break;
        case 'approvals':
          if (n.category !== 'approval') return false;
          break;
        case 'sla':
          if (n.category !== 'sla') return false;
          break;
        case 'investigations':
          if (n.category !== 'investigation') return false;
          break;
        case 'hashtags':
          if (n.category !== 'hashtag') return false;
          break;
        case 'system':
          if (n.category !== 'system' && n.type !== 'system') return false;
          break;
        case 'snoozed':
          if (n.status !== 'snoozed') return false;
          break;
        case 'archived':
          if (n.status !== 'archived') return false;
          break;
        case 'inbox':
        default:
          if (n.status === 'archived') return false;
          break;
      }

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = n.title.toLowerCase().includes(q);
        const matchesMsg = n.message.toLowerCase().includes(q);
        const matchesActor = n.actorName?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesMsg && !matchesActor) return false;
      }

      return true;
    });
  }, [notifications, activeFilter, unreadOnly, searchQuery]);

  // Auto-select first item if none selected or if selected item is filtered out
  useEffect(() => {
    if (filteredList.length > 0) {
      if (!selectedNotificationId || !filteredList.some(n => n.id === selectedNotificationId)) {
        setSelectedNotificationId(filteredList[0].id);
      }
    } else {
      setSelectedNotificationId(null);
    }
  }, [filteredList, selectedNotificationId]);

  const selectedNotification = useMemo(() => {
    return notifications.find(n => n.id === selectedNotificationId) || null;
  }, [notifications, selectedNotificationId]);

  // Partition list into: Needs Action, Earlier today, and Yesterday
  const { needsActionItems, todayItems, olderItems } = useMemo(() => {
    const needsAction: AppNotification[] = [];
    const today: AppNotification[] = [];
    const older: AppNotification[] = [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    filteredList.forEach(item => {
      const itemTime = new Date(item.timestamp).getTime();
      const isNeedsAction = item.status === 'needs_action' || item.priority === 'needs_action';

      if (isNeedsAction && activeFilter === 'inbox') {
        needsAction.push(item);
      } else if (itemTime >= startOfToday) {
        today.push(item);
      } else {
        older.push(item);
      }
    });

    return { needsActionItems: needsAction, todayItems: today, olderItems: older };
  }, [filteredList, activeFilter]);

  const handleSelectCard = (notif: AppNotification) => {
    setSelectedNotificationId(notif.id);
    if (!notif.isRead) {
      onMarkAsRead(notif.id);
    }
  };

  const handleSnooze = (durationMinutes: number) => {
    if (!selectedNotification || !onSnoozeNotification) return;
    const snoozeDate = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
    onSnoozeNotification(selectedNotification.id, snoozeDate);
    setShowSnoozeMenu(false);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#F8FAFC]">
      {/* 1. Page Header */}
      <div className="px-8 py-5 bg-white border-b border-slate-200/80 flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center space-x-2 text-xs text-slate-400 font-sans">
            <span>Workspace</span>
            <span>/</span>
            <span className="text-slate-700 font-medium">Notifications</span>
          </div>
          <h1 className="text-xl font-heading font-bold text-slate-900 tracking-tight mt-1">
            Notifications
          </h1>
          <p className="text-xs text-slate-500 font-sans mt-0.5">
            Everything that needs you, in one place.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onMarkAllAsRead}
            disabled={counts.unread === 0}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:text-slate-900 shadow-2xs transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <CheckCheck size={14} className="text-slate-500" />
            <span>Mark all read</span>
          </button>

          <button
            onClick={onOpenPreferences}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer border border-slate-200"
            title="Notification preferences"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* 2. Main 3-Column / Rail + List + Preview Viewport */}
      <div className="flex-1 min-h-0 flex overflow-hidden p-6 gap-6">

        {/* Rail: Left Categories & Filters */}
        <div className="w-60 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col p-3 shrink-0 overflow-y-auto">
          <div className="space-y-1">
            <button
              onClick={() => setActiveFilter('inbox')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeFilter === 'inbox'
                  ? 'bg-[#0F142A] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Inbox size={15} />
                <span>Inbox</span>
              </div>
              <span className={`px-2 py-0.5 text-[10px] font-mono rounded-full font-bold ${
                activeFilter === 'inbox' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {counts.inbox}
              </span>
            </button>

            <button
              onClick={() => setActiveFilter('needs_action')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeFilter === 'needs_action'
                  ? 'bg-[#F27421] text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Flag size={15} />
                <span>Needs my action</span>
              </div>
              {counts.needs_action > 0 && (
                <span className={`px-2 py-0.5 text-[10px] font-mono rounded-full font-bold ${
                  activeFilter === 'needs_action' ? 'bg-white/25 text-white' : 'bg-orange-100 text-[#F27421]'
                }`}>
                  {counts.needs_action}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveFilter('unread')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeFilter === 'unread'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Mail size={15} />
                <span>Unread</span>
              </div>
              {counts.unread > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-slate-100 text-slate-600 font-bold">
                  {counts.unread}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveFilter('mentions')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeFilter === 'mentions'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <MessageSquare size={15} />
                <span>Mentions</span>
              </div>
              {counts.mentions > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-slate-100 text-slate-600 font-bold">
                  {counts.mentions}
                </span>
              )}
            </button>
          </div>

          {/* Categories Divider */}
          <div className="pt-4 pb-2 px-3">
            <span className="text-[11px] font-semibold text-slate-400 font-mono tracking-wider uppercase">
              Categories
            </span>
          </div>

          <div className="space-y-1">
            <button
              onClick={() => setActiveFilter('escalations')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeFilter === 'escalations' ? 'bg-orange-50 text-[#F27421] font-bold' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Flag size={14} className="text-orange-500" />
                <span>Escalations</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">{counts.escalations}</span>
            </button>

            <button
              onClick={() => setActiveFilter('approvals')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeFilter === 'approvals' ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <ShieldCheck size={14} className="text-emerald-500" />
                <span>Approvals</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">{counts.approvals}</span>
            </button>

            <button
              onClick={() => setActiveFilter('sla')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeFilter === 'sla' ? 'bg-amber-50 text-amber-700 font-bold' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Clock size={14} className="text-amber-500" />
                <span>SLA & deadlines</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">{counts.sla}</span>
            </button>

            <button
              onClick={() => setActiveFilter('investigations')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeFilter === 'investigations' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Box size={14} className="text-indigo-500" />
                <span>Investigations</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">{counts.investigations}</span>
            </button>

            <button
              onClick={() => setActiveFilter('hashtags')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeFilter === 'hashtags' ? 'bg-purple-50 text-purple-700 font-bold' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Hash size={14} className="text-purple-500" />
                <span>Hashtags</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">{counts.hashtags}</span>
            </button>

            <button
              onClick={() => setActiveFilter('system')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeFilter === 'system' ? 'bg-rose-50 text-rose-700 font-bold' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Server size={14} className="text-rose-500" />
                <span>System & data</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">{counts.system}</span>
            </button>
          </div>

          {/* Lifecycle Divider */}
          <div className="pt-5 mt-auto border-t border-slate-100 space-y-1">
            <button
              onClick={() => setActiveFilter('snoozed')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeFilter === 'snoozed' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Clock size={14} className="text-slate-400" />
                <span>Snoozed</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">{counts.snoozed}</span>
            </button>

            <button
              onClick={() => setActiveFilter('archived')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeFilter === 'archived' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Archive size={14} className="text-slate-400" />
                <span>Archived</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">{counts.archived}</span>
            </button>
          </div>
        </div>

        {/* Middle: Notification List */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col overflow-hidden min-w-[360px]">
          {/* List Search & All/Unread Toggle */}
          <div className="p-4 border-b border-slate-100 flex items-center space-x-3 shrink-0">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search notifications..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 text-xs text-slate-800 rounded-xl border border-slate-200 focus:bg-white focus:border-[#F27421] focus:ring-1 focus:ring-[#F27421]/30 transition-all outline-none"
              />
            </div>

            <div className="flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200/60 shrink-0">
              <button
                onClick={() => setUnreadOnly(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  !unreadOnly ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setUnreadOnly(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  unreadOnly ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Unread
              </button>
            </div>
          </div>

          {/* List Items Container */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-20 px-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-3">
                  <CheckCheck size={24} />
                </div>
                <h3 className="font-heading font-semibold text-sm text-slate-800">You are all caught up</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  New notifications appear here and in the bell dropdown.
                </p>
              </div>
            ) : (
              <>
                {/* 1. Needs your action Group (Pinned at top of inbox) */}
                {needsActionItems.length > 0 && (
                  <div>
                    <div className="px-5 py-2.5 bg-orange-50/60 border-b border-orange-100 flex items-center justify-between">
                      <span className="text-xs font-heading font-bold text-[#F27421]">
                        Needs your action · {needsActionItems.length}
                      </span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {needsActionItems.map(item => renderNotificationCard(item))}
                    </div>
                  </div>
                )}

                {/* 2. Earlier Today */}
                {todayItems.length > 0 && (
                  <div>
                    <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                      <span className="text-[11px] font-medium text-slate-400">Earlier today</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {todayItems.map(item => renderNotificationCard(item))}
                    </div>
                  </div>
                )}

                {/* 3. Older / Yesterday */}
                {olderItems.length > 0 && (
                  <div>
                    <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                      <span className="text-[11px] font-medium text-slate-400">Yesterday</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {olderItems.map(item => renderNotificationCard(item))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right Preview / Action Panel */}
        <div className="w-[420px] bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col overflow-hidden shrink-0">
          {selectedNotification ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Preview Header */}
              <div className="p-6 border-b border-slate-100 flex flex-col space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider font-mono bg-orange-50 text-[#F27421] border border-orange-200">
                    {selectedNotification.category || selectedNotification.type}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    {formatDetailTime(selectedNotification.timestamp)}
                  </span>
                </div>

                <h2 className="text-base font-heading font-bold text-slate-900 leading-snug">
                  {selectedNotification.title}
                </h2>

                <p className="text-xs text-slate-500 font-sans leading-relaxed">
                  {selectedNotification.message}
                </p>
              </div>

              {/* SLA Countdown Banner (if SLA or critical) */}
              {(selectedNotification.category === 'sla' || selectedNotification.priority === 'needs_action' || selectedNotification.metadata?.slaRemainingMin) && (
                <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
                  <div className="flex items-center space-x-2">
                    <Clock size={16} className="text-amber-600" />
                    <span className="font-semibold">
                      Respond within {selectedNotification.metadata?.slaRemainingMin || 38} min
                    </span>
                  </div>
                  <span className="font-mono text-amber-700 font-medium">
                    Due {selectedNotification.metadata?.slaDueTime || '11:17'}
                  </span>
                </div>
              )}

              {/* Metadata Key-Value Grid */}
              <div className="p-6 space-y-3 text-xs flex-1 overflow-y-auto">
                <div className="grid grid-cols-2 gap-y-3 py-2 border-y border-slate-100">
                  <div>
                    <span className="text-slate-400 font-sans block text-[11px]">Priority</span>
                    <span className="font-semibold text-rose-600 mt-0.5 inline-block px-2 py-0.5 rounded bg-rose-50 border border-rose-100 text-[11px]">
                      {selectedNotification.priority === 'needs_action' ? 'High' : (selectedNotification.priority || 'Normal')}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 font-sans block text-[11px]">Workflow</span>
                    <span className="font-semibold text-slate-800 mt-0.5 block truncate">
                      {selectedNotification.metadata?.workflowName || 'New Validation Pipeline v3'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 font-sans block text-[11px]">Flagged</span>
                    <span className="font-semibold text-slate-800 mt-0.5 block font-mono">
                      {selectedNotification.metadata?.flaggedCount || '24 of 500'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 font-sans block text-[11px]">Terms</span>
                    <span className="font-semibold text-slate-800 mt-0.5 block">
                      {selectedNotification.metadata?.terms || 'Respond 4h · resolve 24h'}
                    </span>
                  </div>
                </div>

                {/* What Happens Next Guidance */}
                <div className="pt-2">
                  <h4 className="font-heading font-semibold text-xs text-slate-900 mb-1">
                    What happens next
                  </h4>
                  <p className="text-xs text-slate-500 font-sans leading-relaxed">
                    {selectedNotification.metadata?.whatHappensNext ||
                      'Stage the task to start your response clock and open your sandbox workspace. This notification clears when you do.'}
                  </p>
                </div>
              </div>

              {/* Sticky Action Footer */}
              <div className="p-5 bg-slate-50/80 border-t border-slate-100 flex items-center space-x-2 shrink-0">
                <button
                  onClick={() => {
                    if (onTakeAction) onTakeAction(selectedNotification);
                    else if (onNavigateToTarget) onNavigateToTarget(selectedNotification);
                  }}
                  className="flex-1 py-2 px-4 rounded-xl bg-[#F27421] hover:bg-[#d96215] text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center space-x-1.5"
                >
                  <span>{selectedNotification.actionLabel || 'Stage task'}</span>
                </button>

                <button
                  onClick={() => {
                    if (onNavigateToTarget) onNavigateToTarget(selectedNotification);
                  }}
                  className="py-2 px-3 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:text-slate-900 shadow-2xs transition-all cursor-pointer"
                >
                  {selectedNotification.secondaryActionLabel || 'Open room'}
                </button>

                {/* Snooze Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowSnoozeMenu(prev => !prev)}
                    className="py-2 px-3 rounded-xl border border-slate-200 hover:border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:text-slate-900 shadow-2xs transition-all cursor-pointer flex items-center space-x-1"
                  >
                    <Clock size={13} className="text-slate-400" />
                    <span>Snooze</span>
                    <ChevronDown size={12} />
                  </button>

                  {showSnoozeMenu && (
                    <div className="absolute right-0 bottom-full mb-1.5 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                      <button
                        onClick={() => handleSnooze(30)}
                        className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        For 30 minutes
                      </button>
                      <button
                        onClick={() => handleSnooze(120)}
                        className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        For 2 hours
                      </button>
                      <button
                        onClick={() => handleSnooze(1440)}
                        className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Tomorrow morning
                      </button>
                      {onArchiveNotification && (
                        <div className="border-t border-slate-100 mt-1 pt-1">
                          <button
                            onClick={() => {
                              onArchiveNotification(selectedNotification.id);
                              setShowSnoozeMenu(false);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 cursor-pointer"
                          >
                            Archive notification
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300 mb-3">
                <Inbox size={22} />
              </div>
              <h3 className="font-heading font-medium text-xs text-slate-600">Select a notification</h3>
              <p className="text-[11px] text-slate-400 mt-1">View SLA status, context, and immediate actions</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );

  function renderNotificationCard(item: AppNotification) {
    const isSelected = item.id === selectedNotificationId;
    const isNeedsAction = item.status === 'needs_action' || item.priority === 'needs_action';

    return (
      <div
        key={item.id}
        onClick={() => handleSelectCard(item)}
        className={`px-5 py-3.5 flex items-start space-x-3 transition-colors cursor-pointer relative ${
          isSelected
            ? 'bg-slate-50 ring-1 ring-inset ring-slate-200'
            : isNeedsAction
            ? 'bg-orange-50/20 hover:bg-orange-50/40'
            : item.isRead
            ? 'hover:bg-slate-50/60'
            : 'bg-white hover:bg-slate-50'
        }`}
      >
        {/* Left priority border indicator */}
        {isNeedsAction && (
          <span className="absolute left-0 top-0 bottom-0 w-1 bg-[#F27421]" />
        )}

        {/* Orange Unread Dot */}
        <div className="w-2 flex justify-center pt-2 shrink-0">
          {!item.isRead ? (
            <span className="w-2 h-2 rounded-full bg-[#F27421]" />
          ) : (
            <span className="w-2 h-2" />
          )}
        </div>

        {/* Icon */}
        <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200/80 flex items-center justify-center text-[#F27421] shrink-0 mt-0.5">
          <Flag size={15} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-baseline justify-between">
            <h4 className="text-xs font-heading font-semibold text-slate-900 truncate pr-2">
              {item.title}
            </h4>
            <span className="text-[10px] font-mono text-slate-400 shrink-0">
              {formatDetailTime(item.timestamp)}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 font-sans mt-0.5 line-clamp-1">
            {item.message}
          </p>

          {/* Chips & Inline Action Button */}
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center space-x-1.5 flex-wrap">
              <span className="px-2 py-0.2 rounded text-[10px] font-medium font-mono bg-orange-50 text-[#F27421] border border-orange-200">
                {item.category || item.type}
              </span>
              {item.targetIssueId && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-100 text-slate-600 border border-slate-200">
                  {item.targetIssueId}
                </span>
              )}
            </div>

            <button
              onClick={e => {
                e.stopPropagation();
                if (onTakeAction) onTakeAction(item);
                else if (onNavigateToTarget) onNavigateToTarget(item);
              }}
              className="px-2.5 py-1 text-[11px] font-semibold bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              {item.actionLabel || 'Stage task'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
