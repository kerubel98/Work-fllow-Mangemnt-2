import React, { useState, useEffect } from 'react';
import { User, DatabaseConnection, Plugin, EnvironmentSystem, UserRole, QueryApprovalRequest, DbAccessRequest, ConnectionUsageLog, Team } from '../types';
import { 
  BarChart2, Database, Users, ShieldAlert, 
  Server, Shield, Settings2, Lock
} from 'lucide-react';
import AdminAnalytics from './admin/AdminAnalytics';
import AdminUserManagement from './admin/AdminUserManagement';
import AdminQueryApprovals from './admin/AdminQueryApprovals';
import AdminSystemSettings from './admin/AdminSystemSettings';
import { getUserAdminCapabilities } from '../utils/adminCapabilities';

interface AdminPanelProps {
  currentUser?: User;
  teams?: Team[];
  users: User[];
  databases: DatabaseConnection[];
  plugins: Plugin[];
  systems: EnvironmentSystem[];
  queryApprovals: QueryApprovalRequest[];
  dbAccessRequests: DbAccessRequest[];
  connectionUsageLogs: ConnectionUsageLog[];
  onResolveQueryApproval: (id: string, status: 'approved' | 'rejected') => void;
  onResolveDbAccessRequest: (id: string, status: 'approved' | 'rejected') => void;
  onApproveUser: (userId: string) => void;
  onDeleteUser: (userId: string) => void;
  onTogglePlugin: (pluginId: string) => void;
  onAddDatabase: (newDb: Omit<DatabaseConnection, 'id'>) => void;
  onToggleDbStatus: (dbId: string) => void;
  onDeleteDb: (dbId: string) => void;
  onUpdateDb?: (dbId: string, updates: Partial<DatabaseConnection>) => void;
  onAddSystem: (newSys: EnvironmentSystem) => void;
  onDeleteSystem: (sysId: string) => void;
  onUpdateSystem: (updatedSys: EnvironmentSystem) => void;
  onUpdateUserPrivileges?: (
    userId: string, 
    updates: { 
      canExecuteSelect?: boolean; 
      canExecuteUpdate?: boolean; 
      role?: UserRole;
      allowedDbIds?: string[];
    }
  ) => void;
  activeSubTab?: 'analytics' | 'connection_settings' | 'user_admin' | 'systems' | 'plugins';
  onSelectSubTab?: (tab: 'analytics' | 'connection_settings' | 'user_admin' | 'systems' | 'plugins') => void;
}

export default function AdminPanel({
  currentUser,
  teams = [],
  users,
  databases,
  plugins,
  systems,
  queryApprovals,
  dbAccessRequests,
  connectionUsageLogs,
  onResolveQueryApproval,
  onResolveDbAccessRequest,
  onApproveUser,
  onDeleteUser,
  onTogglePlugin,
  onAddDatabase,
  onToggleDbStatus,
  onDeleteDb,
  onUpdateDb,
  onAddSystem,
  onDeleteSystem,
  onUpdateSystem,
  onUpdateUserPrivileges,
  activeSubTab,
  onSelectSubTab
}: AdminPanelProps) {
  const caps = getUserAdminCapabilities(currentUser, teams);

  // Available tabs based on capability
  const availableTabs: Array<{ id: 'analytics' | 'user_admin' | 'systems'; label: string; icon: any }> = [];
  if (caps.canViewMonitoring) {
    availableTabs.push({ id: 'analytics', label: 'System Analytics & Health', icon: BarChart2 });
  }
  if (caps.canManageUsers) {
    availableTabs.push({ id: 'user_admin', label: 'User Access & Permissions', icon: Users });
  }
  if (caps.canManageAccessRequests || caps.isGlobalAdmin) {
    availableTabs.push({ id: 'systems', label: 'Systems & Approvals', icon: Server });
  }

  const defaultTab = availableTabs[0]?.id || 'analytics';
  const [internalSubTab, setInternalSubTab] = useState<'analytics' | 'connection_settings' | 'user_admin' | 'systems' | 'plugins'>(defaultTab);
  
  const currentTab = activeSubTab || internalSubTab;

  useEffect(() => {
    // If current tab is not accessible, switch to default accessible tab
    if (availableTabs.length > 0 && !availableTabs.some(t => t.id === currentTab)) {
      if (onSelectSubTab) {
        onSelectSubTab(availableTabs[0].id);
      } else {
        setInternalSubTab(availableTabs[0].id);
      }
    }
  }, [availableTabs, currentTab, onSelectSubTab]);

  const setActiveTab = (tab: 'analytics' | 'connection_settings' | 'user_admin' | 'systems' | 'plugins') => {
    if (onSelectSubTab) {
      onSelectSubTab(tab);
    } else {
      setInternalSubTab(tab);
    }
  };

  const pendingApprovalsCount = queryApprovals.filter(q => q.status === 'pending').length + dbAccessRequests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-3.5">
      {/* Top Main Navigation Tabs */}
      <div className="bg-[#0F172B] rounded-xl border border-slate-800 shadow-xs p-1 flex items-center gap-1 overflow-x-auto">
        {caps.canViewMonitoring && (
          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap ${
              currentTab === 'analytics' || currentTab === 'connection_settings'
                ? 'bg-[#155DFC] text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>System Analytics & Health</span>
          </button>
        )}

        {caps.canManageUsers && (
          <button
            type="button"
            onClick={() => setActiveTab('user_admin')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap ${
              currentTab === 'user_admin'
                ? 'bg-[#155DFC] text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>User Access & Permissions</span>
          </button>
        )}

        {(caps.canManageAccessRequests || caps.isGlobalAdmin) && (
          <button
            type="button"
            onClick={() => setActiveTab('systems')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap relative ${
              currentTab === 'systems'
                ? 'bg-[#155DFC] text-white shadow-xs'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>{caps.isGlobalAdmin ? 'Systems & Plugins' : 'Access & Approvals'}</span>
            {pendingApprovalsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                {pendingApprovalsCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Sub-View Renderers */}
      {(currentTab === 'analytics' || currentTab === 'connection_settings') && caps.canViewMonitoring && (
        <AdminAnalytics
          users={users}
          databases={databases}
          systems={systems}
          connectionUsageLogs={connectionUsageLogs}
          queryApprovals={queryApprovals}
        />
      )}

      {currentTab === 'user_admin' && caps.canManageUsers && (
        <AdminUserManagement
          users={users}
          onApproveUser={onApproveUser}
          onDeleteUser={onDeleteUser}
          onUpdateUserPrivileges={onUpdateUserPrivileges}
        />
      )}

      {currentTab === 'systems' && (caps.canManageAccessRequests || caps.isGlobalAdmin) && (
        <div className="space-y-6">
          <AdminQueryApprovals
            queryApprovals={queryApprovals}
            dbAccessRequests={dbAccessRequests}
            onResolveQueryApproval={onResolveQueryApproval}
            onResolveDbAccessRequest={onResolveDbAccessRequest}
          />
          {caps.isGlobalAdmin && (
            <AdminSystemSettings
              systems={systems}
              plugins={plugins}
              onTogglePlugin={onTogglePlugin}
              onAddSystem={onAddSystem}
              onDeleteSystem={onDeleteSystem}
            />
          )}
        </div>
      )}
    </div>
  );
}
