import React, { useState, useEffect } from 'react';
import { User, Team, AppNotification, NotificationType } from '../types';
import { 
  BarChart3, Settings, Search,
  Layers, ShieldCheck, Users, Bell, CheckSquare, 
  MessageSquare, AlertCircle, X, CheckCheck, Trash2, ArrowRight, DatabaseZap, Plus, Sliders,
  PanelLeftClose, PanelLeftOpen, Server
} from 'lucide-react';
import { canAccessTab, isAuthorizedTabForUser } from '../utils/navigationPermissions';
import { useGovernance } from '../context/GovernanceContext';
import { Tooltip } from './common/Tooltip';
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
  pendingProposalsCount = 0,
  onMarkNotificationAsRead,
  onMarkAllNotificationsAsRead,
  onClearNotifications,
  onNotificationClick,
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
        return <MessageSquare size={13} className="text-blue-400" />;
      case 'task_assigned':
        return <CheckSquare size={13} className="text-amber-400" />;
      case 'team_added':
        return <Users size={13} className="text-emerald-400" />;
      case 'issue_assigned':
      case 'system':
      default:
        return <AlertCircle size={13} className="text-purple-400" />;
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

  const getNavItemClass = (isActive: boolean, hasSubItems = false) => {
    if (isActive) {
      return 'border-l-2 border-[#3b6cff] bg-[#3b6cff]/15 text-white font-semibold shadow-xs';
    }
    return 'text-slate-300 hover:text-white hover:bg-white/5 border-l-2 border-transparent';
  };

  const getCollapsedItemClass = (isActive: boolean) => {
    if (isActive) {
      return 'border-l-2 border-[#3b6cff] bg-[#3b6cff]/20 text-[#3b6cff] font-bold shadow-xs';
    }
    return 'text-slate-400 hover:text-white hover:bg-white/5 border-l-2 border-transparent';
  };

  return (
    <aside 
      className={`bg-gradient-to-b from-[#0d1424] via-[#090d18] to-[#07080f] border-r border-white/8 flex flex-col justify-between shadow-lg relative transition-all duration-200 ease-in-out shrink-0 text-slate-300 ${
        isCollapsed ? 'w-full lg:w-14' : 'min-w-[220px] w-full lg:w-56'
      }`} 
      id="app-sidebar"
    >
      <div className={`${isCollapsed ? 'p-1.5 space-y-1.5' : 'p-2.5 space-y-2'}`}>
        
        {/* App Meta Info & Toggle Header */}
        {isCollapsed ? (
          <div className="hidden lg:flex flex-col items-center justify-center pt-0.5 pb-1 border-b border-white/8">
            <Tooltip content="Expand Sidebar" shortcut="Ctrl+B">
              <button
                onClick={toggleCollapsed}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-all cursor-pointer"
                id="btn-sidebar-expand"
              >
                <PanelLeftOpen size={16} />
              </button>
            </Tooltip>
          </div>
        ) : (
          <div className="hidden lg:flex items-center justify-between px-1 pb-1.5 border-b border-white/8">
            <div className="flex items-center space-x-1.5">
              <ShieldCheck className="text-[#3b6cff]" size={15} />
              <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider font-mono">
                Operational Core
              </span>
            </div>
            <Tooltip content="Collapse Sidebar" shortcut="Ctrl+B">
              <button
                onClick={toggleCollapsed}
                className="p-1 text-slate-400 hover:text-white hover:bg-white/5 rounded-md transition-colors cursor-pointer"
                id="btn-sidebar-collapse"
              >
                <PanelLeftClose size={15} />
              </button>
            </Tooltip>
          </div>
        )}

        {/* Mobile Header */}
        <div className="flex lg:hidden items-center justify-between px-2 pb-1.5 border-b border-white/8">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck className="text-[#3b6cff]" size={15} />
            <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider font-mono">
              Operational Core
            </span>
          </div>
          <button
            onClick={toggleCollapsed}
            className="p-1 text-slate-400 hover:text-white hover:bg-white/5 rounded-md"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>

        {/* Sidebar Tabs */}
        <nav className="space-y-0.5">
          
          {/* 0. Notifications */}
          {isCollapsed ? (
            <Tooltip content={`Notifications (${unreadCount} unread)`}>
              <button
                onClick={() => setShowNotificationPanel(!showNotificationPanel)}
                className={`relative flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                  showNotificationPanel
                    ? 'border-l-2 border-[#3b6cff] bg-[#3b6cff]/20 text-[#3b6cff] shadow-xs'
                    : unreadCount > 0
                    ? 'text-white bg-slate-800/80 border-l-2 border-amber-400 hover:bg-slate-700'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border-l-2 border-transparent'
                }`}
                id="nav-notifications"
              >
                <Bell size={16} className={showNotificationPanel ? 'text-[#3b6cff]' : unreadCount > 0 ? 'text-amber-400' : 'text-slate-400'} />
                {unreadCount > 0 && (
                  <span className={`absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 text-[8.5px] font-bold rounded-full font-mono flex items-center justify-center border border-[#07080f] shadow-xs ${
                    showNotificationPanel ? 'bg-amber-400 text-slate-900' : 'bg-red-500 text-white'
                  }`}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </Tooltip>
          ) : (
            <button
              onClick={() => setShowNotificationPanel(!showNotificationPanel)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                showNotificationPanel
                  ? 'border-l-2 border-[#3b6cff] bg-[#3b6cff]/15 text-white font-semibold shadow-xs'
                  : unreadCount > 0
                  ? 'text-white bg-slate-800/60 border-l-2 border-amber-400 hover:bg-slate-800'
                  : 'text-slate-300 hover:text-white hover:bg-white/5 border-l-2 border-transparent'
              }`}
              id="nav-notifications"
            >
              <div className="flex items-center space-x-2.5">
                <div className="relative flex items-center justify-center">
                  <Bell size={14} className={showNotificationPanel ? 'text-[#3b6cff]' : unreadCount > 0 ? 'text-amber-400' : 'text-slate-400'} />
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
            <Tooltip content="Workspace & Cases">
              <button
                onClick={() => {
                  setShowNotificationPanel(false);
                  onSelectNavigation('workspace');
                }}
                className={`flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                  getCollapsedItemClass((activeNavigation === 'workspace' || activeNavigation === 'my_tasks' || activeNavigation === 'open_case' || activeNavigation === 'create_case') && !showNotificationPanel)
                }`}
                id="nav-workspace"
              >
                <DatabaseZap size={16} />
              </button>
            </Tooltip>
          ) : (
            <button
              onClick={() => {
                setShowNotificationPanel(false);
                onSelectNavigation('workspace');
              }}
              className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                getNavItemClass((activeNavigation === 'workspace' || activeNavigation === 'my_tasks' || activeNavigation === 'open_case' || activeNavigation === 'create_case') && !showNotificationPanel)
              }`}
              id="nav-workspace"
            >
              <DatabaseZap size={14} />
              <span>Workspace</span>
            </button>
          )}

          {/* WORKSPACE PREFERENCES */}
          {checkAuthorized('workspace_settings') && (
            isCollapsed ? (
              <Tooltip content="Workspace Preferences">
                <button
                  onClick={() => {
                    setShowNotificationPanel(false);
                    onSelectNavigation('workspace_settings');
                  }}
                  className={`flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                    getCollapsedItemClass((activeNavigation === 'workspace_settings' || activeNavigation === 'setting') && !showNotificationPanel)
                  }`}
                  id="nav-workspace-settings"
                >
                  <Sliders size={16} />
                </button>
              </Tooltip>
            ) : (
              <button
                onClick={() => {
                  setShowNotificationPanel(false);
                  onSelectNavigation('workspace_settings');
                }}
                className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                  getNavItemClass((activeNavigation === 'workspace_settings' || activeNavigation === 'setting') && !showNotificationPanel)
                }`}
                id="nav-workspace-settings"
              >
                <Sliders size={14} />
                <span>Preferences</span>
              </button>
            )
          )}

          {/* TEAM & COLLABORATION SECTION */}
          {(checkAuthorized('team_workspace') || checkAuthorized('direct_chat')) && (
            isCollapsed ? (
              <div className="space-y-1 pt-1.5 border-t border-white/8 flex flex-col items-center">
                {checkAuthorized('team_workspace') && (
                  <Tooltip content="My Team">
                    <button
                      onClick={() => {
                        setShowNotificationPanel(false);
                        onSelectNavigation('team_workspace');
                      }}
                      className={`flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                        getCollapsedItemClass(activeNavigation === 'team_workspace' && !showNotificationPanel)
                      }`}
                      id="nav-my-team"
                    >
                      <Users size={16} />
                    </button>
                  </Tooltip>
                )}

                {checkAuthorized('direct_chat') && (
                  <Tooltip content={`Personal Chat ${unreadDirectMessageCount > 0 ? `(${unreadDirectMessageCount} unread)` : ''}`}>
                    <button
                      onClick={() => {
                        setShowNotificationPanel(false);
                        onSelectNavigation('direct_chat');
                      }}
                      className={`relative flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                        getCollapsedItemClass(activeNavigation === 'direct_chat' && !showNotificationPanel)
                      }`}
                      id="nav-personal-chat"
                    >
                      <MessageSquare size={16} />
                      {unreadDirectMessageCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 bg-[#3b6cff] text-white text-[8.5px] font-bold rounded-full flex items-center justify-center font-mono border border-[#07080f] shadow-xs">
                          {unreadDirectMessageCount > 9 ? '9+' : unreadDirectMessageCount}
                        </span>
                      )}
                    </button>
                  </Tooltip>
                )}
              </div>
            ) : (
              <div className="space-y-0.5 pt-2 border-t border-white/8 mt-1.5">
                <div className="px-2 py-0.5 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">
                  <span>Team & Chat</span>
                  <Users size={11} className="text-[#3b6cff]" />
                </div>

                {/* 1. My Team */}
                {checkAuthorized('team_workspace') && (
                  <button
                    onClick={() => {
                      setShowNotificationPanel(false);
                      onSelectNavigation('team_workspace');
                    }}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                      getNavItemClass(activeNavigation === 'team_workspace' && !showNotificationPanel)
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
                      getNavItemClass(activeNavigation === 'direct_chat' && !showNotificationPanel)
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
                          : 'bg-[#3b6cff] text-white shadow-2xs'
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
              <div className="space-y-1 pt-1.5 border-t border-white/8 flex flex-col items-center">
                <Tooltip content="Dashboard & Analytics">
                  <button
                    onClick={() => {
                      setShowNotificationPanel(false);
                      onSelectNavigation('manager_analytics');
                    }}
                    className={`flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                      getCollapsedItemClass(activeNavigation === 'manager_analytics' && !showNotificationPanel)
                    }`}
                    id="nav-analytics"
                  >
                    <BarChart3 size={16} />
                  </button>
                </Tooltip>
              </div>
            ) : (
              <div className="space-y-0.5 pt-2 border-t border-white/8 mt-1.5">
                <div className="px-2 py-0.5 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">
                  <span>Analytics</span>
                  <BarChart3 size={11} className="text-purple-400" />
                </div>
                <button
                  onClick={() => {
                    setShowNotificationPanel(false);
                    onSelectNavigation('manager_analytics');
                  }}
                  className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                    getNavItemClass(activeNavigation === 'manager_analytics' && !showNotificationPanel)
                  }`}
                  id="nav-analytics"
                >
                  <BarChart3 size={14} />
                  <span>Dashboard</span>
                </button>
              </div>
            )
          )}

          {/* System Administration Section Header & Sub-Items (Strictly Admin) */}
          {(checkAuthorized('admin_panel') || checkAuthorized('user_admin') || checkAuthorized('system_settings') || checkAuthorized('admin_team_resources')) && (
            isCollapsed ? (
              <div className="space-y-1 pt-1.5 border-t border-white/8 flex flex-col items-center">
                {checkAuthorized('admin_panel') && (
                  <Tooltip content="Admin Hub">
                    <button
                      onClick={() => {
                        setShowNotificationPanel(false);
                        onSelectNavigation('admin_panel', 'analytics');
                      }}
                      className={`flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                        getCollapsedItemClass(activeNavigation === 'admin_panel' && activeAdminSubTab === 'analytics' && !showNotificationPanel)
                      }`}
                      id="nav-admin"
                    >
                      <Settings size={16} />
                    </button>
                  </Tooltip>
                )}

                {(checkAuthorized('admin_panel') || checkAuthorized('user_admin')) && (
                  <Tooltip content="User Administration">
                    <button
                      onClick={() => {
                        setShowNotificationPanel(false);
                        onSelectNavigation('admin_panel', 'user_admin');
                      }}
                      className={`flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                        getCollapsedItemClass(activeNavigation === 'admin_panel' && activeAdminSubTab === 'user_admin' && !showNotificationPanel)
                      }`}
                      id="nav-user-admin"
                    >
                      <Users size={16} />
                    </button>
                  </Tooltip>
                )}

                {checkAuthorized('system_settings') && (
                  <Tooltip content="System Settings">
                    <button
                      onClick={() => {
                        setShowNotificationPanel(false);
                        onSelectNavigation('system_settings');
                      }}
                      className={`flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                        getCollapsedItemClass(activeNavigation === 'system_settings' && !showNotificationPanel)
                      }`}
                      id="nav-system-settings"
                    >
                      <Sliders size={16} />
                    </button>
                  </Tooltip>
                )}

                {checkAuthorized('admin_team_resources') && (
                  <Tooltip content="Team Resources Monitor">
                    <button
                      onClick={() => {
                        setShowNotificationPanel(false);
                        onSelectNavigation('admin_team_resources');
                      }}
                      className={`flex items-center justify-center w-9 h-9 mx-auto rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                        getCollapsedItemClass(activeNavigation === 'admin_team_resources' && !showNotificationPanel)
                      }`}
                      id="nav-admin-team-resources"
                    >
                      <Server size={16} />
                    </button>
                  </Tooltip>
                )}
              </div>
            ) : (
              <div className="space-y-0.5 pt-2 border-t border-white/8 mt-1.5">
                <div className="px-2 py-0.5 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">
                  <span>System Admin</span>
                  <Settings size={11} className="text-rose-400" />
                </div>

                {/* Main System Administration Hub */}
                {checkAuthorized('admin_panel') && (
                  <button
                    onClick={() => {
                      setShowNotificationPanel(false);
                      onSelectNavigation('admin_panel', 'analytics');
                    }}
                    className={`w-full flex items-center space-x-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer ${
                      getNavItemClass(activeNavigation === 'admin_panel' && activeAdminSubTab === 'analytics' && !showNotificationPanel)
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
                      getNavItemClass(activeNavigation === 'admin_panel' && activeAdminSubTab === 'user_admin' && !showNotificationPanel)
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
                      getNavItemClass(activeNavigation === 'admin_team_resources' && !showNotificationPanel)
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
                      getNavItemClass(activeNavigation === 'system_settings' && !showNotificationPanel)
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
        <div className="p-1.5 border-t border-white/8 hidden lg:flex flex-col items-center justify-center text-slate-500">
          <Tooltip content="Expand Sidebar" shortcut="Ctrl+B">
            <button
              onClick={toggleCollapsed}
              className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
            >
              <PanelLeftOpen size={16} />
            </button>
          </Tooltip>
        </div>
      ) : (
        <div className="p-2.5 border-t border-white/8 bg-slate-950/60 hidden lg:block text-slate-400">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center space-x-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-emerald-400 font-semibold text-[10.5px] tracking-wide font-mono">SCOPE: ACTIVE</span>
            </div>
            <button
              onClick={toggleCollapsed}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-white/5 transition-colors cursor-pointer"
              title="Collapse to Ribbon (Ctrl+B)"
            >
              <PanelLeftClose size={13} />
            </button>
          </div>
          <p className="text-[10px] text-slate-400 truncate font-sans">Enterprise Operations</p>
        </div>
      )}

      {/* Notification Center Popover Drawer Panel */}
      {showNotificationPanel && (
        <div className={`fixed inset-y-0 left-0 ${isCollapsed ? 'sm:left-14' : 'sm:left-56'} z-50 w-full sm:w-88 bg-slate-900/95 backdrop-blur-xl border-r border-white/10 shadow-2xl flex flex-col justify-between animate-in slide-in-from-left duration-200 text-slate-100`}>
          
          {/* Panel Header */}
          <div className="p-3 border-b border-white/10 bg-[#0d1424] text-white flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bell size={16} className="text-[#3b6cff]" />
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
          <div className="px-3 py-2 border-b border-white/8 bg-slate-950/60 flex items-center space-x-1 overflow-x-auto no-scrollbar text-[10px] font-mono">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                activeFilter === 'all'
                  ? 'bg-[#3b6cff] text-white font-bold'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-white/5'
              }`}
            >
              All ({userNotifications.length})
            </button>

            <button
              onClick={() => setActiveFilter('unread')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                activeFilter === 'unread'
                  ? 'bg-rose-600 text-white font-bold'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-white/5'
              }`}
            >
              Unread ({unreadCount})
            </button>

            <button
              onClick={() => setActiveFilter('chat')}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1 ${
                activeFilter === 'chat'
                  ? 'bg-[#3b6cff] text-white font-bold'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-white/5'
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
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-white/5'
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
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-white/5'
              }`}
            >
              <Users size={10} />
              <span>Teams</span>
            </button>
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-950/40">
            {filteredNotifications.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <Bell size={28} className="mx-auto text-slate-500 stroke-[1.5]" />
                <p className="text-xs font-medium text-slate-300">No notifications found</p>
                <p className="text-[10px] text-slate-500 font-mono">You're all caught up with chat, tasks, and team updates.</p>
              </div>
            ) : (
              filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer group relative flex flex-col justify-between ${
                    !notif.isRead
                      ? 'bg-slate-800/90 border-[#3b6cff]/40 text-slate-100 shadow-sm hover:border-[#3b6cff]'
                      : 'bg-slate-900/60 border-white/5 text-slate-300 opacity-80 hover:opacity-100 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start space-x-2.5">
                      <div className={`p-1.5 rounded-lg shrink-0 mt-0.5 ${
                        notif.type === 'chat' 
                          ? 'bg-blue-500/15 border border-blue-500/25' 
                          : notif.type === 'task_assigned' 
                          ? 'bg-amber-500/15 border border-amber-500/25' 
                          : notif.type === 'team_added'
                          ? 'bg-emerald-500/15 border border-emerald-500/25'
                          : 'bg-purple-500/15 border border-purple-500/25'
                      }`}>
                        {getCategoryIcon(notif.type)}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center space-x-1.5">
                          <span className={`text-xs font-bold leading-tight ${
                            !notif.isRead ? 'text-white' : 'text-slate-200'
                          }`}>
                            {notif.title}
                          </span>
                          {!notif.isRead && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#3b6cff] shrink-0 animate-pulse" />
                          )}
                        </div>

                        <p className="text-[11px] text-slate-400 leading-snug line-clamp-2 font-normal">
                          {notif.message}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-white/8 flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span className="flex items-center space-x-1">
                      {notif.actorName && (
                        <span className="text-blue-300 font-bold bg-blue-500/15 px-1.5 py-0.2 rounded border border-blue-500/25">
                          @{notif.actorName}
                        </span>
                      )}
                      <span>{formatTimeAgo(notif.timestamp)}</span>
                    </span>

                    <span className="text-[#3b6cff] group-hover:translate-x-0.5 transition-transform font-bold flex items-center space-x-1">
                      <span>Access</span>
                      <ArrowRight size={10} />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-white/10 bg-[#0d1424] text-[10px] font-mono text-slate-400 flex items-center justify-between">
            <span>{unreadCount} unread alert{unreadCount !== 1 ? 's' : ''}</span>
            <button
              onClick={() => setShowNotificationPanel(false)}
              className="text-[#3b6cff] hover:underline font-bold"
            >
              Close
            </button>
          </div>

        </div>
      )}

    </aside>
  );
}
