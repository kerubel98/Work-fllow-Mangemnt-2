/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, Team, AppNotification, NotificationType } from '../types';
import {
  Briefcase, Inbox, Hash, Users, MessageSquare, BarChart3,
  GitFork, Layers, UserCheck, Database, Sliders, ShieldCheck,
  Settings, PanelLeftClose, PanelLeftOpen, Bell, ArrowRight,
  CheckSquare, AlertCircle, X, CheckCheck, Trash2
} from 'lucide-react';
import { isAuthorizedTabForUser } from '../utils/navigationPermissions';
import { useGovernance } from '../context/GovernanceContext';
import UserProfileModal from './user/UserProfileModal';

export { isAuthorizedTabForUser };

interface SideNavProps {
  currentUser: User;
  teams?: Team[];
  activeNavigation: string;
  activeAdminSubTab?: 'analytics' | 'connection_settings' | 'user_admin' | 'systems' | 'plugins';
  onSelectNavigation: (tab: string, subTab?: 'analytics' | 'connection_settings' | 'user_admin' | 'systems' | 'plugins') => void;
  isAuthorizedTab?: (tab: string) => boolean;
  onCreateTeamClick?: () => void;
  notifications?: AppNotification[];
  unreadDirectMessageCount?: number;
  pendingProposalsCount?: number;
  openIssuesCount?: number;
  intakeCount?: number;
  automationsCount?: number;
  onlineDatabasesCount?: number;
  totalDatabasesCount?: number;
  onMarkNotificationAsRead?: (id: string) => void;
  onMarkAllNotificationsAsRead?: () => void;
  onClearNotifications?: () => void;
  onNotificationClick?: (notif: AppNotification) => void;
  onUserUpdated?: (updatedUser: User) => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export default function SideNav({
  currentUser,
  teams = [],
  activeNavigation,
  activeAdminSubTab = 'analytics',
  onSelectNavigation,
  isAuthorizedTab,
  onCreateTeamClick,
  notifications = [],
  unreadDirectMessageCount = 0,
  pendingProposalsCount = 0,
  openIssuesCount = 237,
  intakeCount = 60,
  automationsCount = 7,
  onlineDatabasesCount = 3,
  totalDatabasesCount = 4,
  onMarkNotificationAsRead,
  onMarkAllNotificationsAsRead,
  onClearNotifications,
  onNotificationClick,
  onUserUpdated,
  isCollapsed: propIsCollapsed,
  onToggleCollapsed: propOnToggleCollapsed,
}: SideNavProps) {
  let contextPendingCount = 0;
  try {
    const gov = useGovernance();
    contextPendingCount = gov.pendingCount;
  } catch {
    contextPendingCount = 0;
  }
  const effectivePendingProposalsCount = pendingProposalsCount || contextPendingCount;

  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'chat' | 'task_assigned' | 'team_added' | 'system'>('all');

  // Sidebar collapsed state: supports parent controlled prop or local state fallback
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('it_sidebar_collapsed');
      return saved !== null ? saved === 'true' : false;
    } catch {
      return false;
    }
  });

  const isCollapsed = propIsCollapsed !== undefined ? propIsCollapsed : internalCollapsed;

  const toggleCollapsed = () => {
    if (propOnToggleCollapsed) {
      propOnToggleCollapsed();
    } else {
      setInternalCollapsed(prev => {
        const next = !prev;
        try {
          localStorage.setItem('it_sidebar_collapsed', String(next));
        } catch { }
        return next;
      });
    }
  };

  // Keyboard shortcut: Ctrl+B or Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const checkAuthorized = (tab: string) => {
    if (isAuthorizedTab) return isAuthorizedTab(tab);
    return isAuthorizedTabForUser(currentUser, tab, teams);
  };

  // Filter notifications relevant to current user
  const userNotifications = notifications.filter(n => n.userId === currentUser.id || n.userId === 'all');
  const unreadCount = userNotifications.filter(n => !n.isRead).length;

  const filteredNotifications = userNotifications.filter(n => {
    if (activeFilter === 'unread') return !n.isRead;
    if (activeFilter === 'chat') return n.type === 'chat';
    if (activeFilter === 'task_assigned') return n.type === 'task_assigned';
    if (activeFilter === 'team_added') return n.type === 'team_added';
    if (activeFilter === 'system') return n.type === 'system';
    return true;
  });

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
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return 'Recently';
    }
  };

  const getCategoryIcon = (type: NotificationType) => {
    switch (type) {
      case 'chat':
        return <MessageSquare size={13} className="text-blue-500" />;
      case 'task_assigned':
        return <CheckSquare size={13} className="text-amber-500" />;
      case 'team_added':
        return <Users size={13} className="text-emerald-500" />;
      case 'issue_assigned':
      case 'system':
      default:
        return <AlertCircle size={13} className="text-purple-500" />;
    }
  };

  const handleNotificationClick = (notif: AppNotification) => {
    if (!notif.isRead && onMarkNotificationAsRead) {
      onMarkNotificationAsRead(notif.id);
    }
    setShowNotificationPanel(false);
    if (onNotificationClick) {
      onNotificationClick(notif);
    } else if (notif.linkTab) {
      onSelectNavigation(notif.linkTab);
    } else {
      onSelectNavigation('team_workspace');
    }
  };

  // Helper for active styling
  const isItemActive = (keys: string[]) => {
    return keys.includes(activeNavigation);
  };

  const navItemClass = (keys: string[]) => {
    const active = isItemActive(keys);
    if (active) {
      return 'bg-white/10 text-white font-medium border-l-2 border-[#F27421] shadow-2xs';
    }
    return 'text-slate-400 hover:text-white hover:bg-white/5 transition-colors';
  };

  const navButton = (
    keys: string[],
    targetTab: string,
    label: string,
    icon: React.ReactNode,
    badge?: number | string | null,
    subTab?: any
  ) => {
    const active = isItemActive(keys);

    if (isCollapsed) {
      return (
        <button
          onClick={() => onSelectNavigation(targetTab, subTab)}
          className={`relative flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-all cursor-pointer ${
            active ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
          title={`${label}${badge !== undefined && badge !== null ? ` (${badge})` : ''}`}
        >
          {icon}
          {active && (
            <span className="absolute left-0 top-2 bottom-2 w-1 bg-[#F27421] rounded-r" />
          )}
          {badge !== undefined && badge !== null && Number(badge) > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 bg-white/20 text-white text-[9px] font-mono font-bold rounded-full flex items-center justify-center">
              {Number(badge) > 99 ? '99+' : badge}
            </span>
          )}
        </button>
      );
    }

    return (
      <button
        data-nav={targetTab}
        onClick={() => onSelectNavigation(targetTab, subTab)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-sans transition-all cursor-pointer ${navItemClass(
          keys
        )}`}
      >
        <div className="flex items-center space-x-2.5">
          <span className={active ? 'text-white' : 'text-slate-400'}>{icon}</span>
          <span className="truncate">{label}</span>
        </div>
        {badge !== undefined && badge !== null && (
          <span
            className={`px-1.5 py-0.5 text-[10px] font-mono font-medium rounded-full ${
              active
                ? 'bg-white/20 text-white'
                : 'bg-white/10 text-slate-400'
            }`}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  const groupHeader = (label: string) => {
    if (isCollapsed) return <div className="my-2 border-t border-slate-800" />;
    return (
      <div className="px-3 pt-4 pb-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
        {label}
      </div>
    );
  };

  const userInitials = currentUser?.username
    ? currentUser.username.slice(0, 2).toUpperCase()
    : 'AD';

  return (
    <aside
      className={`bg-[#0F142A] border-r border-slate-800/80 flex flex-col justify-between shadow-md relative transition-all duration-200 ease-in-out shrink-0 text-slate-300 font-sans z-30 select-none ${
        isCollapsed ? 'w-14' : 'w-56'
      }`}
      id="app-sidebar"
    >
      {/* Top Section: Brand Logo & Navigation */}
      <div className="flex flex-col flex-1 overflow-y-auto no-scrollbar">
        {/* Brand Header */}
        <div className="h-14 px-3 flex items-center justify-between border-b border-slate-800/80 shrink-0">
          {!isCollapsed ? (
            <>
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#F27421] text-white flex items-center justify-center font-heading font-black text-base shadow-sm shrink-0">
                  I
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-heading font-bold text-white text-sm tracking-tight leading-none truncate">
                    IssueTrace
                  </span>
                  <span className="text-[10px] text-slate-400 font-sans tracking-wide truncate">
                    by EthioPay
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={toggleCollapsed}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-md transition-colors cursor-pointer shrink-0"
                title="Collapse Sidebar (Ctrl+B)"
                aria-label="Collapse Sidebar"
              >
                <PanelLeftClose size={16} />
              </button>
            </>
          ) : (
            <div className="w-full flex items-center justify-center">
              <button
                type="button"
                onClick={toggleCollapsed}
                className="w-9 h-9 rounded-lg bg-[#F27421]/15 hover:bg-[#F27421] text-[#F27421] hover:text-white border border-[#F27421]/30 flex items-center justify-center transition-all cursor-pointer group shadow-xs"
                title="Expand Sidebar (Ctrl+B)"
                aria-label="Expand Sidebar"
              >
                <PanelLeftOpen size={18} className="group-hover:scale-110 transition-transform" />
              </button>
            </div>
          )}
        </div>

        {/* Navigation Groups */}
        <nav className="p-2 space-y-0.5">
          {/* GROUP 1: WORK */}
          {groupHeader('WORK')}
          {navButton(
            ['workspace', 'cases', 'open_case'],
            'workspace',
            'Cases',
            <Briefcase size={15} />,
            openIssuesCount
          )}
          {navButton(
            ['intake', 'create_case'],
            'intake',
            'Intake',
            <Inbox size={15} />,
            intakeCount
          )}
          {navButton(
            ['automations', 'hashtags'],
            'automations',
            'Automations',
            <Hash size={15} />,
            automationsCount
          )}

          {/* GROUP 2: COLLABORATE */}
          {groupHeader('COLLABORATE')}
          {checkAuthorized('team_workspace') &&
            navButton(
              ['team_workspace'],
              'team_workspace',
              'Team',
              <Users size={15} />
            )}
          {checkAuthorized('direct_chat') &&
            navButton(
              ['direct_chat', 'messages'],
              'direct_chat',
              'Messages',
              <MessageSquare size={15} />,
              unreadDirectMessageCount > 0 ? unreadDirectMessageCount : undefined
            )}

          {/* GROUP 3: INSIGHTS */}
          {groupHeader('INSIGHTS')}
          {checkAuthorized('manager_analytics') &&
            navButton(
              ['manager_analytics', 'dashboard'],
              'manager_analytics',
              'Dashboard',
              <BarChart3 size={15} />
            )}

          {/* GROUP 4: BUILD */}
          {groupHeader('BUILD')}
          {navButton(
            ['workflows', 'workflow_studio'],
            'workflows',
            'Workflows',
            <GitFork size={15} />
          )}
          {navButton(
            ['rules', 'rules_library'],
            'rules',
            'Rules',
            <Layers size={15} />
          )}

          {/* GROUP 5: ADMIN */}
          {groupHeader('ADMIN')}
          {checkAuthorized('user_admin') &&
            navButton(
              ['user_admin', 'people_access'],
              'user_admin',
              'People & access',
              <UserCheck size={15} />,
              undefined,
              'user_admin'
            )}
          {checkAuthorized('admin_panel') &&
            navButton(
              ['connections', 'db_explorer', 'admin_team_resources'],
              'connections',
              'Connections',
              <Database size={15} />,
              undefined,
              'connection_settings'
            )}
          {checkAuthorized('system_settings') &&
            navButton(
              ['data_setup', 'txn_settings'],
              'data_setup',
              'Data setup',
              <Sliders size={15} />
            )}
          {checkAuthorized('admin_panel') &&
            navButton(
              ['approvals'],
              'approvals',
              'Approvals',
              <ShieldCheck size={15} />,
              effectivePendingProposalsCount > 0 ? effectivePendingProposalsCount : undefined,
              'analytics'
            )}
        </nav>
      </div>

      {/* Bottom Dock: Settings, User Profile, Database Health Status */}
      <div className="p-2 border-t border-slate-800/80 shrink-0 space-y-1">
        {/* Settings button */}
        {navButton(
          ['workspace_settings', 'system_settings', 'setting'],
          'workspace_settings',
          'Settings',
          <Settings size={15} />
        )}

        {/* User Profile Pill */}
        {!isCollapsed ? (
          <div
            onClick={() => setShowProfileModal(true)}
            className="flex items-center space-x-2.5 p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-full bg-[#F27421]/20 border border-[#F27421]/50 text-[#F27421] flex items-center justify-center font-heading font-bold text-xs uppercase shrink-0">
              {userInitials}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-heading font-semibold text-white text-xs truncate group-hover:text-[#F27421] transition-colors">
                {currentUser?.username || 'admin'}
              </span>
              <span className="text-[10px] text-slate-400 truncate capitalize font-sans">
                {currentUser?.role === 'admin' ? 'Administrator' : currentUser?.role || 'Operator'}
              </span>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowProfileModal(true)}
            className="w-8 h-8 mx-auto rounded-full bg-[#F27421]/20 border border-[#F27421]/50 text-[#F27421] flex items-center justify-center font-heading font-bold text-xs uppercase cursor-pointer"
            title={`${currentUser?.username || 'admin'} (${currentUser?.role || 'Administrator'})`}
          >
            {userInitials}
          </button>
        {/* Bottom Expand / Collapse Toggle Button */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer my-1 ${
            isCollapsed ? 'justify-center' : ''
          }`}
          title={isCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'}
          aria-label={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? (
            <PanelLeftOpen size={16} className="text-[#F27421]" />
          ) : (
            <>
              <PanelLeftClose size={15} />
              <span className="text-[11px] font-medium font-sans">Collapse sidebar</span>
            </>
          )}
        </button>

        {/* Database Online Status Indicator */}
        {!isCollapsed ? (
          <div className="px-2 pt-1 pb-1 flex items-center space-x-1.5 text-[10px] text-slate-400 font-sans">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="truncate">
              {onlineDatabasesCount} of {totalDatabasesCount} databases online
            </span>
          </div>
        ) : (
          <div className="flex justify-center py-1">
            <span
              className="w-2 h-2 rounded-full bg-emerald-500"
              title={`${onlineDatabasesCount} of ${totalDatabasesCount} databases online`}
            />
          </div>
        )}
      </div>

      {/* Floating Notifications Drawer / Modal (if triggered from SideNav) */}
      {showNotificationPanel && (
        <div className="fixed inset-y-0 left-0 w-80 bg-white shadow-2xl z-50 flex flex-col border-r border-slate-200">
          <div className="p-3 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-heading font-bold text-sm text-slate-800">Notifications</h3>
            <button
              onClick={() => setShowNotificationPanel(false)}
              className="p-1 text-slate-400 hover:text-slate-600 rounded"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredNotifications.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">No notifications</p>
            ) : (
              filteredNotifications.map(notif => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-2.5 rounded-lg border text-xs cursor-pointer ${
                    notif.isRead ? 'bg-slate-50 border-slate-200' : 'bg-white border-blue-200 font-medium'
                  }`}
                >
                  <p className="font-semibold text-slate-800">{notif.title}</p>
                  <p className="text-slate-600 text-[11px] mt-0.5">{notif.message}</p>
                  <span className="text-[10px] text-slate-400 mt-1 block font-mono">
                    {formatTimeAgo(notif.timestamp)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* User Profile Modal */}
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        currentUser={currentUser}
        onUserUpdated={onUserUpdated}
      />
    </aside>
  );
}
