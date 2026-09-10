/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { User } from '../types';
import { Terminal, Shield, LogOut, CheckCircle2, AlertCircle, Database, HelpCircle } from 'lucide-react';

interface TitleBarProps {
  currentUser: User | null;
  onLogout: () => void;
  onlineCount: number;
}

export default function TitleBar({ currentUser, onLogout, onlineCount }: TitleBarProps) {
  // Determine badge color for the role
  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'technical':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'operational':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'managerial':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
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

  return (
    <div className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-4 select-none shadow-sm" id="electron-title-bar">
      {/* OS Mac-style Traffic Light Buttons */}
      <div className="flex items-center space-x-2 w-1/4">
        <div className="flex space-x-1.5 mr-4">
          <div className="w-3 h-3 rounded-full bg-rose-400 hover:bg-rose-500 transition-colors cursor-pointer flex items-center justify-center text-[8px] text-rose-950 font-bold group">
            <span className="opacity-0 group-hover:opacity-100">×</span>
          </div>
          <div className="w-3 h-3 rounded-full bg-amber-400 hover:bg-amber-500 transition-colors cursor-pointer flex items-center justify-center text-[8px] text-amber-950 font-bold group">
            <span className="opacity-0 group-hover:opacity-100">-</span>
          </div>
          <div className="w-3 h-3 rounded-full bg-emerald-400 hover:bg-emerald-500 transition-colors cursor-pointer flex items-center justify-center text-[8px] text-emerald-950 font-bold group">
            <span className="opacity-0 group-hover:opacity-100">+</span>
          </div>
        </div>
        
        {/* Electron status badge */}
        <div className="hidden md:flex items-center space-x-2 text-xs text-blue-700 font-mono bg-blue-50/80 px-2.5 py-0.5 rounded-md border border-blue-100">
          <Terminal size={12} className="text-blue-600" />
          <span>app-shell v1.4.0</span>
        </div>
      </div>

      {/* Main Title Center */}
      <div className="text-sm font-medium text-slate-800 flex items-center justify-center space-x-2 w-2/4">
        <Database size={15} className="text-blue-600" />
        <span className="font-semibold tracking-tight text-blue-950">IssueTrace</span>
        <span className="text-slate-300">|</span>
        <span className="text-xs text-blue-800 font-mono bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-100">Desktop Operations Terminal</span>
      </div>

      {/* User Session & Status on the Right */}
      <div className="flex items-center justify-end space-x-3 w-1/4 text-xs">
        {currentUser ? (
          <div className="flex items-center space-x-3 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
            {/* DB Connection Status Indicator */}
            <div className="flex items-center space-x-1.5 mr-1" title={`${onlineCount} connected databases`}>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
              </span>
              <span className="text-[10px] text-blue-700 font-mono hidden lg:inline font-medium">{onlineCount} DBs Online</span>
            </div>

            {/* Profile Info */}
            <div className="flex flex-col text-right">
              <span className="text-slate-900 font-medium">{currentUser.username}</span>
              <span className={`text-[9px] uppercase tracking-wider font-mono border px-1.5 rounded-sm mt-0.5 ${getRoleBadgeClass(currentUser.role)}`}>
                {getRoleLabel(currentUser.role)}
              </span>
            </div>

            {/* Logout Button */}
            <button
              onClick={onLogout}
              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="Logout session"
              id="btn-logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-1 text-slate-600 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
            <Shield size={12} className="text-amber-500" />
            <span>Secure Handshake Pending</span>
          </div>
        )}
      </div>
    </div>
  );
}
