/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { User } from '../types';
import { 
  Terminal, Shield, LogOut, CheckCircle2, AlertCircle, Database, HelpCircle,
  Users, Layers, CheckSquare, Tag, MessageSquare, DatabaseZap, BarChart3, 
  ShieldCheck, Settings, Sliders, PlusCircle 
} from 'lucide-react';
import { Badge } from './common/Badge';
import { Tooltip } from './common/Tooltip';

interface TitleBarProps {
  currentUser: User | null;
  onLogout: () => void;
  onlineCount: number;
  activeNavigation?: string;
  activeTeamName?: string | null;
  workspaceSubView?: 'sandbox' | 'investigation' | 'open_case';
}

export default function TitleBar({ 
  currentUser, 
  onLogout, 
  onlineCount, 
  activeNavigation = 'workspace', 
  activeTeamName,
  workspaceSubView = 'investigation'
}: TitleBarProps) {

  // Dynamic page title mapping
  const getPageInfo = () => {
    switch (activeNavigation) {
      case 'team_workspace':
        return {
          icon: <Users size={14} className="text-[#3b6cff]" />,
          title: 'My Teams & Workspaces',
          subtitle: activeTeamName || null
        };
      case 'workspace':
        if (workspaceSubView === 'sandbox') {
          return {
            icon: <Terminal size={14} className="text-cyan-400" />,
            title: 'SQL Query Sandbox',
            subtitle: 'Live Multi-DB Explorer'
          };
        }
        if (workspaceSubView === 'open_case') {
          return {
            icon: <PlusCircle size={14} className="text-blue-400" />,
            title: 'New Case Intake',
            subtitle: 'Case Registration'
          };
        }
        return {
          icon: <DatabaseZap size={14} className="text-[#3b6cff]" />,
          title: 'Reconciliation Workspace',
          subtitle: 'Audit & Workflows'
        };
      case 'my_tasks':
        return {
          icon: <CheckSquare size={14} className="text-emerald-400" />,
          title: 'My Assigned Tasks',
          subtitle: 'Personal Queue'
        };
      case 'hashtags':
        return {
          icon: <Tag size={14} className="text-amber-400" />,
          title: 'Universal Hashtags',
          subtitle: 'Cross-System Registry'
        };
      case 'open_case':
      case 'create_case':
        return {
          icon: <PlusCircle size={14} className="text-blue-400" />,
          title: 'Operational Case Creator',
          subtitle: 'Ticket Intake'
        };
      case 'direct_chat':
        return {
          icon: <MessageSquare size={14} className="text-sky-400" />,
          title: 'Personal Chat',
          subtitle: 'Direct Messaging'
        };
      case 'db_explorer':
        return {
          icon: <Database size={14} className="text-indigo-400" />,
          title: 'Database Query Tool',
          subtitle: 'Live SQL Explorer'
        };
      case 'manager_analytics':
        return {
          icon: <BarChart3 size={14} className="text-purple-400" />,
          title: 'Managerial Analytics',
          subtitle: 'SLA & Performance'
        };
      case 'admin_panel':
      case 'user_admin':
        return {
          icon: <ShieldCheck size={14} className="text-rose-400" />,
          title: 'System Administration',
          subtitle: 'Security & Access'
        };
      case 'workspace_settings':
      case 'txn_settings':
        return {
          icon: <Settings size={14} className="text-cyan-400" />,
          title: 'Workspace Settings',
          subtitle: 'Governance & Rules'
        };
      case 'system_settings':
        return {
          icon: <Sliders size={14} className="text-teal-400" />,
          title: 'System Configuration',
          subtitle: 'Engine Parameters'
        };
      default:
        return {
          icon: <Database size={14} className="text-[#3b6cff]" />,
          title: 'IssueTrace',
          subtitle: 'Operations Cockpit'
        };
    }
  };

  const pageInfo = getPageInfo();

  return (
    <div className="h-11 bg-gradient-to-r from-[#0d1424] via-[#07080f] to-[#0d1424] border-b border-white/8 flex items-center justify-between px-4 select-none text-xs text-slate-200 shadow-sm z-30" id="electron-title-bar">
      
      {/* Brand & Product Wordmark on the Left */}
      <div className="flex items-center space-x-3 w-1/4">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#3b6cff] to-[#1e40af] flex items-center justify-center shadow-[0_0_12px_rgba(59,108,255,0.35)]">
            <ShieldCheck size={16} className="text-white" />
          </div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-sm tracking-tight text-white font-sans">IssueTrace</span>
            <span className="hidden sm:inline-block text-[9.5px] font-semibold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20 font-mono">
              Ops OS
            </span>
          </div>
        </div>
      </div>

      {/* Main Dynamic Breadcrumb Center */}
      <div className="text-xs text-slate-200 flex items-center justify-center w-2/4 truncate">
        <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-white/4 border border-white/8 text-slate-300 backdrop-blur-xs">
          {pageInfo.icon}
          <span className="font-medium text-slate-200 tracking-tight">{pageInfo.title}</span>
          {pageInfo.subtitle && (
            <>
              <span className="text-slate-600 font-light">/</span>
              <span className="text-[11px] text-blue-300 bg-blue-500/10 px-2 py-0.2 rounded border border-blue-500/20 truncate max-w-[220px]" title={pageInfo.subtitle}>
                {pageInfo.subtitle}
              </span>
            </>
          )}
        </div>
      </div>

      {/* User Session & Status on the Right */}
      <div className="flex items-center justify-end space-x-2.5 w-1/4 text-xs">
        {currentUser ? (
          <div className="flex items-center space-x-2.5 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-700/60 shadow-xs">
            {/* DB Connection Status Indicator */}
            <Tooltip content={`${onlineCount} connected databases active`} position="bottom">
              <div className="flex items-center space-x-1.5 px-1 py-0.5 cursor-default">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10.5px] text-slate-300 font-medium hidden lg:inline">{onlineCount} DBs Online</span>
              </div>
            </Tooltip>

            <div className="h-3.5 w-px bg-slate-700/60" />

            {/* Profile Info */}
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-bold text-[10px] flex items-center justify-center shadow-xs">
                {currentUser.username.charAt(0).toUpperCase()}
              </div>
              <span className="text-slate-200 font-medium text-xs hidden sm:inline">{currentUser.username}</span>
              <Badge variant={currentUser.role} size="xs" />
            </div>

            <div className="h-3.5 w-px bg-slate-700/60" />

            {/* Logout Button */}
            <Tooltip content="Sign out of session" position="bottom">
              <button
                onClick={onLogout}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
                title="Logout session"
                id="btn-logout"
              >
                <LogOut size={13} />
              </button>
            </Tooltip>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-700/60 text-[11px]">
            <Shield size={12} className="text-amber-400" />
            <span>Secure Handshake Pending</span>
          </div>
        )}
      </div>
    </div>
  );
}
