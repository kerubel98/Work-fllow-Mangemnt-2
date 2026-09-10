/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, UserRole, DatabaseConnection } from '../types';
import { 
  Users, UserCheck, Trash2, Shield, CheckCircle2, 
  XCircle, ToggleLeft, ToggleRight, Database, Key, Search, Sparkles
} from 'lucide-react';

interface UserAdminPanelProps {
  currentUser: User;
  users: User[];
  databases: DatabaseConnection[];
  onApproveUser: (userId: string) => void;
  onDeleteUser: (userId: string) => void;
  onUpdateUserPrivileges: (
    userId: string, 
    updates: { 
      canExecuteSelect?: boolean; 
      canExecuteUpdate?: boolean; 
      role?: UserRole;
      allowedDbIds?: string[];
    }
  ) => void;
}

export default function UserAdminPanel({
  currentUser,
  users,
  databases,
  onApproveUser,
  onDeleteUser,
  onUpdateUserPrivileges
}: UserAdminPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const pendingUsers = users.filter(u => !u.isApproved);
  const approvedUsers = users.filter(u => u.isApproved);

  const filteredUsers = approvedUsers.filter(u => {
    const matchesSearch = u.username.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const showNotification = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const handleToggleDbAccess = (user: User, dbId: string) => {
    const currentAllowed = user.allowedDbIds || databases.map(d => d.id);
    const hasDb = currentAllowed.includes(dbId);
    const newAllowed = hasDb 
      ? currentAllowed.filter(id => id !== dbId)
      : [...currentAllowed, dbId];

    onUpdateUserPrivileges(user.id, { allowedDbIds: newAllowed });
    showNotification(`Updated connection access privileges for @${user.username}`);
  };

  return (
    <div className="space-y-6" id="user-admin-panel">
      
      {/* Header Banner */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
            <Users size={24} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">User Administration & Statement Privilege Center</h2>
            <p className="text-xs text-slate-500">Approve pending registrations and configure user execution privileges for SELECT or UPDATE SQL statements.</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 font-mono text-xs">
          <span className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium">
            Total Users: <strong className="text-blue-700">{users.length}</strong>
          </span>
          {pendingUsers.length > 0 && (
            <span className="px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 font-bold rounded-xl animate-pulse">
              {pendingUsers.length} Pending Approval
            </span>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2 font-medium">
          <CheckCircle2 size={16} className="text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 1. REGISTRATION APPROVAL QUEUE */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-sm" id="registration-approvals">
        <div className="flex justify-between items-center border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <UserCheck className="text-amber-500" size={16} />
              <span>Pending Account Registrations</span>
            </h3>
            <p className="text-xs text-slate-500">Newly registered staff requesting system access and operational role clearance.</p>
          </div>
          <span className="text-xs font-mono bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200 font-bold">
            {pendingUsers.length} Awaiting Authorization
          </span>
        </div>

        {pendingUsers.length === 0 ? (
          <div className="p-6 text-center text-slate-400 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono">
            All user registration requests have been cleared. Zero pending accounts in queue.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingUsers.map(u => (
              <div key={u.id} className="p-4 bg-slate-50 border border-amber-200 rounded-xl space-y-3 relative">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">@{u.username}</h4>
                    <p className="text-[10px] text-slate-500 font-mono">{u.email}</p>
                  </div>
                  <span className="text-[9px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono uppercase font-bold border border-blue-200">
                    {u.role}
                  </span>
                </div>

                <div className="text-[10px] text-slate-400 font-mono">
                  Requested on: {new Date(u.createdAt).toLocaleDateString()}
                </div>

                <div className="flex space-x-2 pt-1">
                  <button
                    onClick={() => {
                      onApproveUser(u.id);
                      showNotification(`Approved registration for @${u.username}. Default privileges applied.`);
                    }}
                    className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-xs flex items-center justify-center space-x-1 cursor-pointer transition-colors shadow-sm"
                  >
                    <UserCheck size={13} />
                    <span>Approve User</span>
                  </button>
                  <button
                    onClick={() => {
                      onDeleteUser(u.id);
                      showNotification(`Rejected registration for @${u.username}.`);
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded text-xs font-medium cursor-pointer transition-colors"
                    title="Reject Registration"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. USER PRIVILEGE MATRIX & STATEMENT PERMISSIONS */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-sm" id="user-privileges-matrix">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Key className="text-blue-600" size={16} />
              <span>User Execution Privileges Matrix (SELECT & UPDATE Controls)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Directly grant or revoke privileges for users to execute SELECT read queries or UPDATE / DML mutation statements across database connections.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter users..."
                className="bg-slate-50 border border-slate-200 rounded-lg py-1 pl-2.5 pr-7 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
              <Search size={12} className="absolute right-2 top-2 text-slate-400" />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg py-1 px-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
            </select>
          </div>
        </div>

        {/* Privileges Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-mono text-slate-500 bg-slate-50 uppercase">
                  <th className="p-3">User & Email</th>
                  <th className="p-3">Role</th>
                  <th className="p-3 text-center">SELECT Statement Privilege</th>
                  <th className="p-3 text-center">UPDATE / DML Statement Privilege</th>
                  <th className="p-3">Allowed Connections</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredUsers.map((user) => {
                  const canSelect = user.canExecuteSelect !== false; // default true unless explicitly false
                  const canUpdate = user.canExecuteUpdate ?? true;
                  const userAllowedDbs = user.allowedDbIds || databases.map(d => d.id);

                  return (
                    <tr key={user.id} className="hover:bg-blue-50/30 transition-colors">
                      
                      {/* User name & email */}
                      <td className="p-3">
                        <div className="font-semibold text-slate-900 flex items-center space-x-1.5">
                          <span>@{user.username}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono block">{user.email}</span>
                      </td>

                      {/* Role selection dropdown */}
                      <td className="p-3">
                        {user.username === 'admin' ? (
                          <span className="text-[10px] font-mono text-blue-700 font-bold uppercase">
                            Administrator
                          </span>
                        ) : (
                          <select
                            value={user.role}
                            onChange={(e) => {
                              onUpdateUserPrivileges(user.id, { role: e.target.value as UserRole });
                              showNotification(`Role for @${user.username} changed to ${e.target.value}`);
                            }}
                            className="bg-slate-50 border border-slate-200 rounded py-1 px-2 text-xs text-slate-800 font-mono focus:outline-none focus:border-blue-500"
                          >
                            <option value="user">user</option>
                            <option value="admin">admin</option>
                          </select>
                        )}
                      </td>

                      {/* SELECT Privilege Toggle */}
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            const newStatus = !canSelect;
                            onUpdateUserPrivileges(user.id, { canExecuteSelect: newStatus });
                            showNotification(`${newStatus ? 'Granted' : 'Revoked'} SELECT statement privilege for @${user.username}`);
                          }}
                          className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-mono transition-all border cursor-pointer ${
                            canSelect 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' 
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                        >
                          {canSelect ? <CheckCircle2 size={12} className="text-emerald-600" /> : <XCircle size={12} className="text-slate-400" />}
                          <span>{canSelect ? 'SELECT ALLOWED' : 'SELECT DENIED'}</span>
                        </button>
                      </td>

                      {/* UPDATE / DML Privilege Toggle */}
                      <td className="p-3 text-center">
                        {user.username === 'admin' ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                            <CheckCircle2 size={12} />
                            <span>FULL UPDATE ALLOWED</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const newStatus = !canUpdate;
                              onUpdateUserPrivileges(user.id, { canExecuteUpdate: newStatus });
                              showNotification(`${newStatus ? 'Granted' : 'Revoked'} UPDATE/DML privilege for @${user.username}`);
                            }}
                            className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-mono transition-all border cursor-pointer ${
                              canUpdate 
                                ? 'bg-amber-50 text-amber-700 border-amber-200 font-bold' 
                                : 'bg-slate-50 text-slate-400 border-slate-200'
                            }`}
                          >
                            {canUpdate ? <CheckCircle2 size={12} className="text-amber-600" /> : <XCircle size={12} className="text-slate-400" />}
                            <span>{canUpdate ? 'UPDATE ALLOWED' : 'UPDATE DENIED'}</span>
                          </button>
                        )}
                      </td>

                      {/* Allowed Connections list with checkboxes */}
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {databases.map((db) => {
                            const isAllowed = userAllowedDbs.includes(db.id);
                            return (
                              <button
                                key={db.id}
                                type="button"
                                onClick={() => handleToggleDbAccess(user, db.id)}
                                className={`px-2 py-0.5 rounded text-[9px] font-mono border transition-all cursor-pointer ${
                                  isAllowed
                                    ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold'
                                    : 'bg-slate-50 text-slate-400 border-slate-200 opacity-60'
                                }`}
                                title={`Click to toggle access to ${db.name}`}
                              >
                                {db.name} {isAllowed ? '✓' : '×'}
                              </button>
                            );
                          })}
                        </div>
                      </td>

                      {/* Action buttons */}
                      <td className="p-3 text-right">
                        {user.username !== 'admin' ? (
                          <button
                            onClick={() => {
                              if (window.confirm(`Are you sure you want to deactivate and remove user @${user.username}?`)) {
                                onDeleteUser(user.id);
                                showNotification(`Deactivated user @${user.username}`);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Deactivate Account"
                          >
                            <Trash2 size={14} />
                          </button>
                        ) : (
                          <span className="text-[10px] text-blue-700 font-mono font-bold">SUPERUSER</span>
                        )}
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
}
