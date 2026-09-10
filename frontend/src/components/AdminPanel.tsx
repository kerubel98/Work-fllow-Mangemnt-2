/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, DatabaseConnection, Plugin, EnvironmentSystem, UserRole, QueryApprovalRequest, DbAccessRequest, ConnectionUsageLog } from '../types';
import { 
  BarChart2, Database, Users, ShieldAlert, 
  Server, Shield, Settings2
} from 'lucide-react';
import AdminAnalytics from './admin/AdminAnalytics';
import AdminUserManagement from './admin/AdminUserManagement';
import AdminQueryApprovals from './admin/AdminQueryApprovals';
import AdminSystemSettings from './admin/AdminSystemSettings';

interface AdminPanelProps {
  currentUser?: User;
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
  const [internalSubTab, setInternalSubTab] = useState<'analytics' | 'connection_settings' | 'user_admin' | 'systems' | 'plugins'>('analytics');
  
  const currentTab = activeSubTab || internalSubTab;
  const setActiveTab = (tab: 'analytics' | 'connection_settings' | 'user_admin' | 'systems' | 'plugins') => {
    if (onSelectSubTab) {
      onSelectSubTab(tab);
    } else {
      setInternalSubTab(tab);
    }
  };

  const pendingApprovalsCount = queryApprovals.filter(q => q.status === 'pending').length + dbAccessRequests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Top Main Navigation Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-1.5 flex items-center gap-1.5 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition whitespace-nowrap ${
            currentTab === 'analytics'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          <span>System Analytics & Health</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('user_admin')}
          className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition whitespace-nowrap ${
            currentTab === 'user_admin'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Access & Permissions</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('systems')}
          className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition whitespace-nowrap relative ${
            currentTab === 'systems'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>Systems & Plugins</span>
          {pendingApprovalsCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
              {pendingApprovalsCount}
            </span>
          )}
        </button>
      </div>

      {/* Sub-View Renderers */}
      {(currentTab === 'analytics' || currentTab === 'connection_settings') && (
        <AdminAnalytics
          users={users}
          databases={databases}
          systems={systems}
          connectionUsageLogs={connectionUsageLogs}
          queryApprovals={queryApprovals}
        />
      )}

      {currentTab === 'user_admin' && (
        <AdminUserManagement
          users={users}
          onApproveUser={onApproveUser}
          onDeleteUser={onDeleteUser}
          onUpdateUserPrivileges={onUpdateUserPrivileges}
        />
      )}

      {currentTab === 'systems' && (
        <div className="space-y-6">
          <AdminQueryApprovals
            queryApprovals={queryApprovals}
            dbAccessRequests={dbAccessRequests}
            onResolveQueryApproval={onResolveQueryApproval}
            onResolveDbAccessRequest={onResolveDbAccessRequest}
          />
          <AdminSystemSettings
            systems={systems}
            plugins={plugins}
            onTogglePlugin={onTogglePlugin}
            onAddSystem={onAddSystem}
            onDeleteSystem={onDeleteSystem}
          />
        </div>
      )}
    </div>
  );
}
