import React, { useState, useEffect } from 'react';
import { User, Team, AppNotification, NotificationType } from '../types';
import { 
  BarChart3, Settings, Search,
  Layers, ShieldCheck, Users, Bell, CheckSquare, 
  MessageSquare, AlertCircle, X, CheckCheck, Trash2, ArrowRight, DatabaseZap, Plus, Sliders,
  PanelLeftClose, PanelLeftOpen, Server
} from 'lucide-react';
import { canAccessTab, isAuthorizedTabForUser } from '../utils/navigationPermissions';
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
  onMarkNotificationAsRead?: (id: string) => void;
  onMarkAllNotificationsAsRead?: () => void;
  onClearNotifications?: () => void;
  onNotificationClick?: (notif: AppNotification) => void;
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
  onMarkNotificationAsRead,
  onMarkAllNotificationsAsRead,
  onClearNotifications,
  onNotificationClick,
}: SideNavProps) {
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'chat' | 'task_assigned' | 'team_added' | 'system'>('all');

  // Sidebar toggle state: defaults to ribbon-like compact mode (true)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('it_sidebar_collapsed');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('it_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
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

  return (
    <aside 
      className={`bg-[#0F172B] border-r border-slate-800 flex flex-col justify-between shadow-sm relative transition-all duration-200 ease-in-out shrink-0 text-slate-300 ${
        isCollapsed ? 'w-full lg:w-14' : 'min-w-[220px] w-full lg:w-56'
      }`} 
      id="app-sidebar"
    >
      <div className={`${isCollapsed ? 'p-1.5 space-y-1.5' : 'p-2.5 space-y-2'}`}>
        
        {/* App Meta Info & Toggle Header */}
        {isCollapsed ? (
          <div className="hidden lg:flex flex-col items-center justify-center pt-0.5 pb-1 border-b border-slate-800">
            <button
              onClick={toggleCollapsed}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-lg transition-all cursor-pointer"
              title="Expand Sidebar (Ctrl+B)"
              id="btn-sidebar-expand"
            >
              <PanelLeftOpen size={16} />
            </button>
          </div>
        ) : (
          <div className="hidden lg:flex items-center justify-between px-1 pb-1.5 border-b border-slate-800">
            <div className="flex items-center space-x-1.5">
              <ShieldCheck className="text-[#155DFC]" size={15} />
              <span className="text-[9.5px] uppercase font-bold text-slate-300 tracking-wider font-mono">
                Operational Core
              </span>
            </div>
            <button
              onClick={toggleCollapsed}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-md transition-colors cursor-pointer"
              title="Collapse to Ribbon (Ctrl+B)"
              id="btn-sidebar-collapse"
            >
              <PanelLeftClose size={15} />
            </button>
          </div>
        )}

        {/* Mobile Header */}
        <div className="flex lg:hidden items-center justify-between px-2 pb-1.5 border-b border-slate-800">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck className="text-[#155DFC]" size={15} />
            <span className="text-[9.5px] uppercase font-bold text-slate-300 tracking-wider font-mono">
              Operational Core
            </span>
          </div>
          <button
            onClick={toggleCollapsed}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>

        {/* Sidebar Tabs */}
        <nav className="space-y-0.5">
          
          {/* 0. Notifications */}
          {isCollapsed ? (
            <button
              onClick={() => setShowNotificationPanel(!showNotificationPanel)}
              className={`relative flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                showNotificationPanel
                  ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                  : unreadCount > 0
                  ? 'text-white bg-slate-800 border border-[#155DFC]/60 hover:bg-slate-700'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
              }`}
              id="nav-notifications"
              title={`Notifications (${unreadCount} unread)`}
            >
              <Bell size={16} className={showNotificationPanel ? 'text-white' : unreadCount > 0 ? 'text-[#155DFC]' : 'text-slate-400'} />
              {unreadCount > 0 && (
                <span className={`absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 text-[8.5px] font-bold rounded-full font-mono flex items-center justify-center border border-[#0F172B] shadow-xs ${
                  showNotificationPanel ? 'bg-amber-400 text-slate-900' : 'bg-red-500 text-white'
                }`}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          ) : (
            <button
              onClick={() => setShowNotificationPanel(!showNotificationPanel)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                showNotificationPanel
                  ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                  : unreadCount > 0
                  ? 'text-white bg-slate-800/90 border border-[#155DFC]/60 hover:bg-slate-700'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
              id="nav-notifications"
              title="Access chat messages, assigned tasks, and team updates"
            >
              <div className="flex items-center space-x-2.5">
                <div className="relative flex items-center justify-center">
                  <Bell size={14} className={showNotificationPanel ? 'text-white' : unreadCount > 0 ? 'text-[#155DFC]' : 'text-slate-400'} />
                  {unreadCount > 0 && !showNotificationPanel && (
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  )}
                </div>
                <span>Notifications</span>
              </div>

              {unreadCount > 0 ? (
                <span className={`px-1.5 py-0.2 text-[9px] font-bold rounded-full font-mono transition-all ${
                  showNotificationPanel 
                    ? 'bg-white text-blue-900' 
                    : 'bg-red-500 text-white shadow-2xs'
                }`}>
                  {unreadCount}
                </span>
              ) : (
                <span className="text-[9px] text-slate-500 font-mono">0</span>
              )}
            </button>
          )}

          {/* WORKSPACE */}
          {isCollapsed ? (
            <button
              onClick={() => {
                setShowNotificationPanel(false);
                onSelectNavigation('workspace');
              }}
              className={`flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                (activeNavigation === 'workspace' || activeNavigation === 'my_tasks' || activeNavigation === 'open_case' || activeNavigation === 'create_case') && !showNotificationPanel
                  ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
              }`}
              id="nav-workspace"
              title="Workspace & Cases"
            >
              <DatabaseZap size={16} />
            </button>
          ) : (
            <button
              onClick={() => {
                setShowNotificationPanel(false);
                onSelectNavigation('workspace');
              }}
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                (activeNavigation === 'workspace' || activeNavigation === 'my_tasks' || activeNavigation === 'open_case' || activeNavigation === 'create_case') && !showNotificationPanel
                  ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
              }`}
              id="nav-workspace"
            >
              <DatabaseZap size={14} />
              <span>Workspace</span>
            </button>
          )}

          {/* TEAM & COLLABORATION SECTION */}
          {(checkAuthorized('team_workspace') || checkAuthorized('direct_chat')) && (
            isCollapsed ? (
              <div className="space-y-1 pt-1 border-t border-slate-800/80 flex flex-col items-center">
                {checkAuthorized('team_workspace') && (
                  <button
                    onClick={() => {
                      setShowNotificationPanel(false);
                      onSelectNavigation('team_workspace');
                    }}
                    className={`flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                      activeNavigation === 'team_workspace' && !showNotificationPanel
                        ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                    }`}
                    id="nav-my-team"
                    title="My Team"
                  >
                    <Users size={16} />
                  </button>
                )}

                {checkAuthorized('direct_chat') && (
                  <button
                    onClick={() => {
                      setShowNotificationPanel(false);
                      onSelectNavigation('direct_chat');
                    }}
                    className={`relative flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                      activeNavigation === 'direct_chat' && !showNotificationPanel
                        ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                    }`}
                    id="nav-personal-chat"
                    title={`Personal Chat ${unreadDirectMessageCount > 0 ? `(${unreadDirectMessageCount} unread)` : ''}`}
                  >
                    <MessageSquare size={16} />
                    {unreadDirectMessageCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 bg-[#155DFC] text-white text-[8.5px] font-bold rounded-full flex items-center justify-center font-mono border border-[#0F172B] shadow-xs">
                        {unreadDirectMessageCount > 9 ? '9+' : unreadDirectMessageCount}
                      </span>
                    )}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-0.5 pt-1.5 border-t border-slate-800/80">
                <div className="px-2 py-0.5 flex items-center justify-between text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  <span>Team & Chat</span>
                  <Users size={11} className="text-[#155DFC]" />
                </div>

                {/* 1. My Team */}
                {checkAuthorized('team_workspace') && (
                  <button
                    onClick={() => {
                      setShowNotificationPanel(false);
                      onSelectNavigation('team_workspace');
                    }}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                      activeNavigation === 'team_workspace' && !showNotificationPanel
                        ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                    id="nav-my-team"
                  >
                    <Users size={14} />
                    <span>My Team</span>
                  </button>
                )}

                {/* 2. Personal Chat */}
                {checkAuthorized('direct_chat') && (
                  <button
                    onClick={() => {
                      setShowNotificationPanel(false);
                      onSelectNavigation('direct_chat');
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                      activeNavigation === 'direct_chat' && !showNotificationPanel
                        ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                    id="nav-personal-chat"
                  >
                    <div className="flex items-center space-x-2.5">
                      <MessageSquare size={14} />
                      <span>Personal Chat</span>
                    </div>
                    {unreadDirectMessageCount > 0 && (
                      <span className={`px-1.5 py-0.2 text-[9px] font-bold rounded-full font-mono transition-all ${
                        activeNavigation === 'direct_chat' && !showNotificationPanel
                          ? 'bg-white text-blue-900'
                          : 'bg-[#155DFC] text-white shadow-2xs'
                      }`}>
                        {unreadDirectMessageCount}
                      </span>
                    )}
                  </button>
                )}
              </div>
            )
          )}

          {/* ANALYTICS SECTION */}
          {checkAuthorized('manager_analytics') && (
            isCollapsed ? (
              <div className="space-y-1 pt-1 border-t border-slate-800/80 flex flex-col items-center">
                <button
                  onClick={() => {
                    setShowNotificationPanel(false);
                    onSelectNavigation('manager_analytics');
                  }}
                  className={`flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                    activeNavigation === 'manager_analytics' && !showNotificationPanel
                      ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`}
                  id="nav-analytics"
                  title="Dashboard & Analytics"
                >
                  <BarChart3 size={16} />
                </button>
              </div>
            ) : (
              <div className="space-y-0.5 pt-1.5 border-t border-slate-800/80">
                <div className="px-2 py-0.5 flex items-center justify-between text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  <span>Analytics</span>
                  <BarChart3 size={11} className="text-[#155DFC]" />
                </div>
                <button
                  onClick={() => {
                    setShowNotificationPanel(false);
                    onSelectNavigation('manager_analytics');
                  }}
                  className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                    activeNavigation === 'manager_analytics' && !showNotificationPanel
                      ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                  id="nav-analytics"
                >
                  <BarChart3 size={14} />
                  <span>Dashboard</span>
                </button>
              </div>
            )
          )}

          {/* 5. System Administration Section Header & Sub-Items (Strictly Admin) */}
          {(checkAuthorized('admin_panel') || checkAuthorized('user_admin') || checkAuthorized('system_settings') || checkAuthorized('admin_team_resources')) && (
            isCollapsed ? (
              <div className="space-y-1 pt-1 border-t border-slate-800/80 flex flex-col items-center">
                {checkAuthorized('admin_panel') && (
                  <button
                    onClick={() => {
                      setShowNotificationPanel(false);
                      onSelectNavigation('admin_panel', 'analytics');
                    }}
                    className={`flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                      activeNavigation === 'admin_panel' && activeAdminSubTab === 'analytics' && !showNotificationPanel
                        ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                    }`}
                    id="nav-admin"
                    title="Admin Hub & Analytics"
                  >
                    <Settings size={16} />
                  </button>
                )}

                {(checkAuthorized('admin_panel') || checkAuthorized('user_admin')) && (
                  <button
                    onClick={() => {
                      setShowNotificationPanel(false);
                      onSelectNavigation('admin_panel', 'user_admin');
                    }}
                    className={`flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                      activeNavigation === 'admin_panel' && activeAdminSubTab === 'user_admin' && !showNotificationPanel
                        ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                    }`}
                    id="nav-user-admin"
                    title="User Administration"
                  >
                    <Users size={16} />
                  </button>
                )}

                {checkAuthorized('system_settings') && (
                  <button
                    onClick={() => {
                      setShowNotificationPanel(false);
                      onSelectNavigation('system_settings');
                    }}
                    className={`flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                      activeNavigation === 'system_settings' && !showNotificationPanel
                        ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                    }`}
                    id="nav-system-settings"
                    title="System Settings"
                  >
                    <Sliders size={16} />
                  </button>
                )}

                {checkAuthorized('admin_team_resources') && (
                  <button
                    onClick={() => {
                      setShowNotificationPanel(false);
                      onSelectNavigation('admin_team_resources');
                    }}
                    className={`flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                      activeNavigation === 'admin_team_resources' && !showNotificationPanel
                        ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                    }`}
                    id="nav-admin-team-resources"
                    title="Team Resources Monitor"
                  >
                    <Server size={16} />
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-0.5 pt-1.5 border-t border-slate-800/80 mt-1">
                <div className="px-2 py-0.5 flex items-center justify-between text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  <span>System Admin</span>
                  <Settings size={11} className="text-slate-500" />
                </div>

                {/* Main System Administration Hub */}
                {checkAuthorized('admin_panel') && (
                  <button
                    onClick={() => {
                      setShowNotificationPanel(false);
                      onSelectNavigation('admin_panel', 'analytics');
                    }}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                      activeNavigation === 'admin_panel' && activeAdminSubTab === 'analytics' && !showNotificationPanel
                        ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                    id="nav-admin"
                  >
                    <Settings size={14} />
                    <span>Admin Hub</span>
                  </button>
                )}

                {/* User Administration */}
                {(checkAuthorized('admin_panel') || checkAuthorized('user_admin')) && (
                  <button
                    onClick={() => {
                      setShowNotificationPanel(false);
                      onSelectNavigation('admin_panel', 'user_admin');
                    }}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 pl-5 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                      activeNavigation === 'admin_panel' && activeAdminSubTab === 'user_admin' && !showNotificationPanel
                        ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                    }`}
                    id="nav-user-admin"
                  >
                    <Users size={13} />
                    <span>Users</span>
                  </button>
                )}

                {/* Team Resources Monitor (Admin Route) */}
                {checkAuthorized('admin_team_resources') && (
                  <button
                    onClick={() => {
                      setShowNotificationPanel(false);
                      onSelectNavigation('admin_team_resources');
                    }}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 pl-5 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                      activeNavigation === 'admin_team_resources' && !showNotificationPanel
                        ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                    }`}
                    id="nav-admin-team-resources"
                    title="Monitor team-scoped connections and review promotion requests"
                  >
                    <Server size={13} />
                    <span>Team Resources</span>
                  </button>
                )}

                {/* System Settings (Administrator View Only) */}
                {checkAuthorized('system_settings') && (
                  <button
                    onClick={() => {
                      setShowNotificationPanel(false);
                      onSelectNavigation('system_settings');
                    }}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 pl-5 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                      activeNavigation === 'system_settings' && !showNotificationPanel
                        ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                    }`}
                    id="nav-system-settings"
                    title="System Settings: Global Column Dictionary, Database Connections, and Environment Table Mappings"
                  >
                    <Sliders size={13} />
                    <span>Settings</span>
                  </button>
                )}
              </div>
            )
          )}

        </nav>
      </div>

      {/* Footer / Scope Card */}
      {isCollapsed ? (
        <div className="p-1.5 border-t border-slate-800 hidden lg:flex flex-col items-center justify-center text-slate-500">
          <button
            onClick={toggleCollapsed}
            className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
            title="Expand Sidebar (Ctrl+B)"
          >
            <PanelLeftOpen size={16} />
          </button>
        </div>
      ) : (
        <div className="p-2 border-t border-slate-800 text-[9px] bg-slate-900/40 hidden lg:block font-mono text-slate-400">
          <div className="flex items-center justify-between">
            <span className="text-[#155DFC] font-bold block">SCOPE: ACTIVE</span>
            <button
              onClick={toggleCollapsed}
              className="text-slate-400 hover:text-white p-0.5 rounded transition-colors cursor-pointer"
              title="Collapse to Ribbon (Ctrl+B)"
            >
              <PanelLeftClose size={13} />
            </button>
          </div>
          <p className="leading-tight mt-0.5 text-slate-500 truncate">Enterprise Operations</p>
        </div>
      )}

      {/* Notification Center Popover Drawer Panel */}
      {showNotificationPanel && (
        <div className={`fixed inset-y-0 left-0 ${isCollapsed ? 'sm:left-14' : 'sm:left-56'} z-50 w-full sm:w-88 bg-white border-r border-slate-200 shadow-2xl flex flex-col justify-between animate-in slide-in-from-left duration-200`}>
          
          {/* Panel Header */}
          <div className="p-3 border-b border-slate-800 bg-[#0F172B] text-white flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bell size={16} className="text-[#155DFC]" />
              <div>
                <h3 className="text-xs font-bold tracking-tight">Notifications</h3>
                <p className="text-[9.5px] text-slate-400 font-mono">Chat & team alerts</p>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              {unreadCount > 0 && onMarkAllNotificationsAsRead && (
                <button
                  onClick={onMarkAllNotificationsAsRead}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-mono rounded flex items-center space-x-1 transition-colors cursor-pointer"
                  title="Mark all as read"
                >
                  <CheckCheck size={12} className="text-emerald-400" />
                  <span className="hidden sm:inline">Read all</span>
                </button>
              )}

              {userNotifications.length > 0 && onClearNotifications && (
                <button
                  onClick={onClearNotifications}
                  className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                  title="Clear all notifications"
                >
                  <Trash2 size={14} />
                </button>
              )}

              <button
                onClick={() => setShowNotificationPanel(false)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
                title="Close panel"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 flex items-center space-x-1 overflow-x-auto no-scrollbar text-[10px] font-mono">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                activeFilter === 'all'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              All ({userNotifications.length})
            </button>

            <button
              onClick={() => setActiveFilter('unread')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                activeFilter === 'unread'
                  ? 'bg-red-600 text-white font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              Unread ({unreadCount})
            </button>

            <button
              onClick={() => setActiveFilter('chat')}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1 ${
                activeFilter === 'chat'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <MessageSquare size={10} />
              <span>Chat</span>
            </button>

            <button
              onClick={() => setActiveFilter('task_assigned')}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1 ${
                activeFilter === 'task_assigned'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <CheckSquare size={10} />
              <span>Tasks</span>
            </button>

            <button
              onClick={() => setActiveFilter('team_added')}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1 ${
                activeFilter === 'team_added'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <Users size={10} />
              <span>Teams</span>
            </button>
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50/50">
            {filteredNotifications.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <Bell size={28} className="mx-auto text-slate-300 stroke-[1.5]" />
                <p className="text-xs font-medium text-slate-600">No notifications found</p>
                <p className="text-[10px] text-slate-400 font-mono">You're all caught up with chat, tasks, and team updates.</p>
              </div>
            ) : (
              filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer group relative flex flex-col justify-between ${
                    !notif.isRead
                      ? 'bg-white border-blue-200 shadow-2xs hover:border-blue-400'
                      : 'bg-slate-50 border-slate-200 opacity-80 hover:opacity-100 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start space-x-2.5">
                      <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                        notif.type === 'chat' 
                          ? 'bg-blue-50 border border-blue-100' 
                          : notif.type === 'task_assigned' 
                          ? 'bg-amber-50 border border-amber-100' 
                          : notif.type === 'team_added'
                          ? 'bg-emerald-50 border border-emerald-100'
                          : 'bg-purple-50 border border-purple-100'
                      }`}>
                        {getCategoryIcon(notif.type)}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center space-x-1.5">
                          <span className={`text-xs font-bold leading-tight ${
                            !notif.isRead ? 'text-slate-900' : 'text-slate-700'
                          }`}>
                            {notif.title}
                          </span>
                          {!notif.isRead && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                          )}
                        </div>

                        <p className="text-[11px] text-slate-600 leading-snug line-clamp-2 font-normal">
                          {notif.message}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span className="flex items-center space-x-1">
                      {notif.actorName && (
                        <span className="text-blue-700 font-bold bg-blue-50 px-1.5 py-0.2 rounded border border-blue-100">
                          @{notif.actorName}
                        </span>
                      )}
                      <span>{formatTimeAgo(notif.timestamp)}</span>
                    </span>

                    <span className="text-blue-600 group-hover:translate-x-0.5 transition-transform font-bold flex items-center space-x-1">
                      <span>Access</span>
                      <ArrowRight size={10} />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-slate-200 bg-white text-[10px] font-mono text-slate-500 flex items-center justify-between">
            <span>{unreadCount} unread alert{unreadCount !== 1 ? 's' : ''}</span>
            <button
              onClick={() => setShowNotificationPanel(false)}
              className="text-blue-600 hover:underline font-bold"
            >
              Close
            </button>
          </div>

        </div>
      )}

    </aside>
  );
}
