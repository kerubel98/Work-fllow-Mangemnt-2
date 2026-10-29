/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User, AppNotification } from '../types';
import { Search, Bell, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import NotificationBellDropdown from './notifications/NotificationBellDropdown';

interface TopBarProps {
  currentUser: User | null;
  activeNavigation: string;
  activeTeamName?: string | null;
  onLogout?: () => void;
  onSelectNavigation?: (tab: string) => void;
  unreadNotificationsCount?: number;
  notifications?: AppNotification[];
  onMarkNotificationAsRead?: (id: string) => void;
  onMarkAllNotificationsAsRead?: () => void;
  onNotificationClick?: (notif: AppNotification) => void;
  onOpenNotificationCenter?: () => void;
  onOpenNotificationPreferences?: () => void;
  onTakeNotificationAction?: (notif: AppNotification) => void;
  onToggleNotifications?: () => void;
  environmentName?: string;
  customBreadcrumb?: { section: string; page: string };
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export default function TopBar({
  currentUser,
  activeNavigation,
  activeTeamName,
  onLogout,
  onSelectNavigation,
  unreadNotificationsCount = 0,
  notifications = [],
  onMarkNotificationAsRead,
  onMarkAllNotificationsAsRead,
  onNotificationClick,
  onOpenNotificationCenter,
  onOpenNotificationPreferences,
  onTakeNotificationAction,
  onToggleNotifications,
  environmentName = 'Production',
  customBreadcrumb,
  isSidebarCollapsed,
  onToggleSidebar
}: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Keyboard shortcut: Ctrl+K or Cmd+K to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('global-search-input');
        searchInput?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Compute breadcrumbs from active navigation
  const getBreadcrumb = () => {
    if (customBreadcrumb) return customBreadcrumb;

    switch (activeNavigation) {
      case 'workspace':
      case 'cases':
      case 'open_case':
        return { section: 'Cases', page: 'Investigation' };
      case 'intake':
      case 'create_case':
        return { section: 'Work', page: 'Intake' };
      case 'automations':
      case 'hashtags':
        return { section: 'Work', page: 'Automations' };
      case 'team_workspace':
        return { section: 'Collaborate', page: activeTeamName || 'Team' };
      case 'direct_chat':
      case 'messages':
        return { section: 'Collaborate', page: 'Messages' };
      case 'manager_analytics':
      case 'dashboard':
        return { section: 'Insights', page: 'Dashboard' };
      case 'workflows':
      case 'workflow_studio':
        return { section: 'Build', page: 'Workflows' };
      case 'rules':
      case 'rules_library':
        return { section: 'Build', page: 'Rules' };
      case 'query_sandbox':
      case 'sql_sandbox':
        return { section: 'Build', page: 'Query sandbox' };
      case 'user_admin':
      case 'people_access':
        return { section: 'Admin', page: 'People & access' };
      case 'connections':
      case 'db_explorer':
      case 'admin_team_resources':
        return { section: 'Admin', page: 'Connections' };
      case 'data_setup':
      case 'txn_settings':
        return { section: 'Admin', page: 'Data setup' };
      case 'authority_center':
      case 'admin_panel':
        return { section: 'Admin', page: 'Authority Center' };
      case 'approvals':
        return { section: 'Admin', page: 'Approvals' };
      case 'workspace_settings':
      case 'system_settings':
      case 'setting':
        return { section: 'Settings', page: 'Workflow & SLA' };
      default:
        return { section: 'Operations', page: 'Workspace' };
    }
  };

  const breadcrumb = getBreadcrumb();

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between shrink-0 z-20 font-sans">
      {/* 1. Left: Sidebar Toggle & Breadcrumb Navigation */}
      <div className="flex items-center space-x-3">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`p-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center ${
              isSidebarCollapsed
                ? 'text-[#F27421] bg-[#F27421]/10 hover:bg-[#F27421]/20'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
            title={isSidebarCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'}
            aria-label={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        )}

        <nav aria-label="Breadcrumb" className="flex items-center text-xs text-slate-500">
          <span className="font-normal text-slate-500 hover:text-slate-700 transition-colors cursor-pointer">
            {breadcrumb.section}
          </span>
          <span className="text-slate-300 mx-2 font-normal select-none">/</span>
          <span className="font-medium text-slate-900 font-heading">
            {breadcrumb.page}
          </span>
        </nav>
      </div>

      {/* 2. Center: Universal Search Input (Ctrl+K) */}
      <div className="flex-1 max-w-lg mx-4 md:mx-8 hidden md:block">
        <div className="relative flex items-center">
          <Search size={16} className="absolute left-3 text-slate-400 pointer-events-none" />
          <input
            id="global-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cases, tasks, #automations..."
            className="w-full pl-10 pr-12 py-2 bg-slate-50/70 hover:bg-slate-100/70 focus:bg-white text-sm text-slate-800 rounded-lg border border-slate-200 focus:border-[#F27421] focus:ring-1 focus:ring-[#F27421]/30 transition-all outline-none placeholder:text-slate-400"
          />
          <div className="absolute right-3 flex items-center pointer-events-none">
            <kbd className="px-2 py-1 text-[10px] font-mono text-slate-400 bg-white border border-slate-200 rounded shadow-xs">
              Ctrl K
            </kbd>
          </div>
        </div>
      </div>

      {/* 3. Right: Environment Pill & Notification Bell */}
      <div className="flex items-center space-x-3">
        {/* Environment status indicator pill */}
        <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 text-emerald-700 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-heading font-medium tracking-tight">
            {environmentName}
          </span>
        </div>

        {/* Notification bell button & Dropdown Popover */}
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(prev => !prev)}
            className={`relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer ${
              isDropdownOpen ? 'bg-slate-100 text-slate-900 border-slate-300' : ''
            }`}
            title={`Notifications (${unreadNotificationsCount} unread)`}
            aria-label="Notifications"
            aria-expanded={isDropdownOpen}
          >
            <Bell size={18} />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#F27421] text-white text-[10px] font-bold font-mono rounded-full flex items-center justify-center shadow-xs">
                {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
              </span>
            )}
          </button>

          <NotificationBellDropdown
            isOpen={isDropdownOpen}
            onClose={() => setIsDropdownOpen(false)}
            notifications={notifications}
            onMarkAsRead={onMarkNotificationAsRead || (() => {})}
            onMarkAllAsRead={onMarkAllNotificationsAsRead || (() => {})}
            onNotificationClick={onNotificationClick || (() => {})}
            onOpenNotificationCenter={() => {
              setIsDropdownOpen(false);
              if (onOpenNotificationCenter) onOpenNotificationCenter();
              else if (onSelectNavigation) onSelectNavigation('notifications');
            }}
            onOpenPreferences={() => {
              setIsDropdownOpen(false);
              if (onOpenNotificationPreferences) onOpenNotificationPreferences();
              else if (onSelectNavigation) onSelectNavigation('notification_preferences');
            }}
            onTakeAction={onTakeNotificationAction}
          />
        </div>
      </div>
    </header>
  );
}