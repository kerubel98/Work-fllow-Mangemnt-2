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
  workspaceSubView = 'sandbox'
}: TitleBarProps) {
  // Determine badge color for the role in dark theme
  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-500/20 text-red-300 border-red-500/40';
      case 'technical':
        return 'bg-[#155DFC]/20 text-blue-300 border-[#155DFC]/40';
      case 'operational':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'managerial':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'System Administrator';
      case 'technical': return 'Technical Engineer';
      case 'operational': return 'Ops Operator';
      case 'managerial': return 'Manager / Auditor';
      default: return 'User';
    }
  };

  // Dynamic page title mapping
  const getPageInfo = () => {
    switch (activeNavigation) {
      case 'team_workspace':
        return {
          icon: <Users size={13} className="text-[#155DFC]" />,
          title: 'My Teams & Workspaces',
          subtitle: activeTeamName || null
        };
      case 'workspace':
        if (workspaceSubView === 'sandbox') {
          return {
            icon: <Terminal size={13} className="text-cyan-400" />,
            title: 'SQL Query Sandbox',
            subtitle: 'Live Multi-DB Explorer'
          };
        }
        if (workspaceSubView === 'open_case') {
          return {
            icon: <PlusCircle size={13} className="text-blue-400" />,
            title: 'New Case Intake',
            subtitle: 'Case Registration'
          };
        }
        return {
          icon: <DatabaseZap size={13} className="text-[#155DFC]" />,
          title: 'Reconciliation Workspace',
          subtitle: 'Audit & Workflows'
        };
      case 'my_tasks':
        return {
          icon: <CheckSquare size={13} className="text-emerald-400" />,
          title: 'My Assigned Tasks',
          subtitle: 'Personal Queue'
        };
      case 'hashtags':
        return {
          icon: <Tag size={13} className="text-amber-400" />,
          title: 'Universal Hashtags',
          subtitle: 'Cross-System Registry'
        };
      case 'open_case':
      case 'create_case':
        return {
          icon: <PlusCircle size={13} className="text-blue-400" />,
          title: 'Operational Case Creator',
          subtitle: 'Ticket Intake'
        };
      case 'direct_chat':
        return {
          icon: <MessageSquare size={13} className="text-sky-400" />,
          title: 'Personal Chat',
          subtitle: 'Direct Messaging'
        };
      case 'db_explorer':
        return {
          icon: <Database size={13} className="text-indigo-400" />,
          title: 'Database Query Tool',
          subtitle: 'Live SQL Explorer'
        };
      case 'manager_analytics':
        return {
          icon: <BarChart3 size={13} className="text-purple-400" />,
          title: 'Managerial Analytics',
          subtitle: 'SLA & Performance'
        };
      case 'admin_panel':
      case 'user_admin':
        return {
          icon: <ShieldCheck size={13} className="text-rose-400" />,
          title: 'System Administration',
          subtitle: 'Security & Access'
        };
      case 'workspace_settings':
      case 'txn_settings':
        return {
          icon: <Settings size={13} className="text-cyan-400" />,
          title: 'Workspace Settings',
          subtitle: 'Governance & Rules'
        };
      case 'system_settings':
        return {
          icon: <Sliders size={13} className="text-teal-400" />,
          title: 'System Configuration',
          subtitle: 'Engine Parameters'
        };
      default:
        return {
          icon: <Database size={13} className="text-[#155DFC]" />,
          title: 'IssueTrace',
          subtitle: 'Desktop Operations Terminal'
        };
    }
  };

  const pageInfo = getPageInfo();

  return (
    <div className="h-9 bg-[#0F172B] border-b border-slate-800 flex items-center justify-between px-3 select-none text-xs text-slate-200 shadow-xs z-30" id="electron-title-bar">
      {/* OS Mac-style Traffic Light Buttons */}
      <div className="flex items-center space-x-2 w-1/4">
        <div className="flex space-x-1.5 mr-3">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/90 hover:bg-rose-600 transition-colors cursor-pointer flex items-center justify-center text-[7px] text-rose-950 font-bold group">
            <span className="opacity-0 group-hover:opacity-100">×</span>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/90 hover:bg-amber-600 transition-colors cursor-pointer flex items-center justify-center text-[7px] text-amber-950 font-bold group">
            <span className="opacity-0 group-hover:opacity-100">-</span>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/90 hover:bg-emerald-600 transition-colors cursor-pointer flex items-center justify-center text-[7px] text-emerald-950 font-bold group">
            <span className="opacity-0 group-hover:opacity-100">+</span>
          </div>
        </div>
        
        {/* Electron status badge */}
        <div className="hidden md:flex items-center space-x-1.5 text-[11px] text-slate-300 font-mono bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/70">
          <Terminal size={11} className="text-[#155DFC]" />
          <span>app-shell v1.4.0</span>
        </div>
      </div>

      {/* Main Dynamic Title Center */}
      <div className="text-xs font-medium text-slate-200 flex items-center justify-center space-x-2 w-2/4 truncate">
        {pageInfo.icon}
        <span className="font-semibold tracking-tight text-white font-mono">{pageInfo.title}</span>
        {pageInfo.subtitle && (
          <>
            <span className="text-slate-600">/</span>
            <span className="text-[11px] text-blue-300 font-mono bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/60 truncate max-w-[240px]" title={pageInfo.subtitle}>
              {pageInfo.subtitle}
            </span>
          </>
        )}
      </div>

      {/* User Session & Status on the Right */}
      <div className="flex items-center justify-end space-x-2 w-1/4 text-xs">
        {currentUser ? (
          <div className="flex items-center space-x-2.5 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/70">
            {/* DB Connection Status Indicator */}
            <div className="flex items-center space-x-1.5 mr-1" title={`${onlineCount} connected databases`}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#155DFC] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#155DFC]"></span>
              </span>
              <span className="text-[10px] text-slate-300 font-mono hidden lg:inline font-medium">{onlineCount} DBs Online</span>
            </div>

            {/* Profile Info */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-200 font-medium text-xs">{currentUser.username}</span>
              <span className={`text-[8.5px] uppercase tracking-wider font-mono border px-1 py-0.2 rounded-xs ${getRoleBadgeClass(currentUser.role)}`}>
                {currentUser.role}
              </span>
            </div>

            {/* Logout Button */}
            <button
              onClick={onLogout}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded transition-colors cursor-pointer"
              title="Logout session"
              id="btn-logout"
            >
              <LogOut size={12} />
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-1 text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/70 text-[11px]">
            <Shield size={11} className="text-amber-400" />
            <span>Secure Handshake Pending</span>
          </div>
        )}
      </div>
    </div>
  );
}
