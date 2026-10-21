/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { Search, Bell, ChevronRight, LogOut, PanelLeftOpen, PanelLeftClose } from 'lucide-react';

interface TopBarProps {
  currentUser: User | null;
  activeNavigation: string;
  activeTeamName?: string | null;
  onLogout?: () => void;
  onSelectNavigation?: (tab: string) => void;
  unreadNotificationsCount?: number;
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
  onToggleNotifications,
  environmentName = 'Production',
  customBreadcrumb,
  isSidebarCollapsed,
  onToggleSidebar
}: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);

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
        return { section: 'Workflows', page: 'Studio' };
      case 'rules':
      case 'rules_library':
        return { section: 'Build', page: 'Rules' };
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
      case 'approvals':
      case 'admin_panel':
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
    <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 z-20 font-sans">
      {/* 1. Left: Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center text-xs text-slate-500">
        <span className="font-normal text-slate-500 hover:text-slate-700 transition-colors">
          {breadcrumb.section}
        </span>
        <span className="text-slate-300 mx-2 font-normal select-none">/</span>
        <span className="font-medium text-slate-900 font-heading">
          {breadcrumb.page}
        </span>
      </nav>

      {/* 2. Center: Universal Search Input (Ctrl+K) */}
      <div className="flex-1 max-w-md mx-6 hidden md:block">
        <div className="relative flex items-center">
          <Search size={14} className="absolute left-3 text-slate-400 pointer-events-none" />
          <input
            id="global-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search cases, tasks, #automations..."
            className="w-full pl-9 pr-14 py-1.5 bg-slate-50/70 hover:bg-slate-100/70 focus:bg-white text-xs text-slate-800 rounded-lg border border-slate-200 focus:border-[#F27421] focus:ring-1 focus:ring-[#F27421]/30 transition-all outline-none"
          />
          <div className="absolute right-2.5 flex items-center pointer-events-none">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white border border-slate-200 rounded shadow-2xs">
              Ctrl K
            </kbd>
          </div>
        </div>
      </div>

      {/* 3. Right: Environment Pill, Notification Bell */}
      <div className="flex items-center space-x-3">
        {/* Environment status indicator pill */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 text-emerald-700 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-heading font-medium tracking-tight">
            {environmentName}
          </span>
        </div>

        {/* Notification bell button */}
        <button
          onClick={onToggleNotifications}
          className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
          title={`Notifications (${unreadNotificationsCount} unread)`}
          aria-label="Notifications"
        >
          <Bell size={15} />
          {unreadNotificationsCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 bg-[#F27421] text-white text-[9px] font-bold font-mono rounded-full flex items-center justify-center shadow-xs">
              {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
