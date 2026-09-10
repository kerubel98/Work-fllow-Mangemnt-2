import React, { useState } from 'react';
import { User, UserRole } from '../../types';
import { 
  Users, UserCheck, Trash2, Search, Filter, 
  ShieldAlert, ShieldCheck, CheckCircle2, XCircle, Key 
} from 'lucide-react';

interface AdminUserManagementProps {
  users: User[];
  onApproveUser: (userId: string) => void;
  onDeleteUser: (userId: string) => void;
  onUpdateUserPrivileges?: (
    userId: string, 
    updates: { 
      canExecuteSelect?: boolean; 
      canExecuteUpdate?: boolean; 
      role?: UserRole;
      allowedDbIds?: string[];
    }
  ) => void;
}

export default function AdminUserManagement({
  users,
  onApproveUser,
  onDeleteUser,
  onUpdateUserPrivileges
}: AdminUserManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('ALL');

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'ALL' || u.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-100 text-purple-700 border border-purple-200">Admin</span>;
      case 'technical':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700 border border-indigo-200">Technical</span>;
      case 'operational':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-700 border border-blue-200">Operational</span>;
      case 'managerial':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 border border-emerald-200">Manager</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-700">{role}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">User Access & Role Privileges</h2>
          <p className="text-xs text-slate-500">Manage user accounts, approve registrations, and configure query execution rights</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search user or email..."
              className="text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
            />
          </div>

          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="text-xs px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Roles</option>
            <option value="admin">Admins</option>
            <option value="technical">Technical</option>
            <option value="operational">Operational</option>
            <option value="managerial">Managerial</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Registration Status</th>
                <th className="px-4 py-3 text-center">SELECT Access</th>
                <th className="px-4 py-3 text-center">UPDATE / DML</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/80 transition">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 font-mono">@{user.username}</p>
                        <p className="text-[11px] text-slate-400">{user.email}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => onUpdateUserPrivileges && onUpdateUserPrivileges(user.id, { role: e.target.value as UserRole })}
                      className="text-xs font-semibold px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      <option value="admin">admin</option>
                      <option value="technical">technical</option>
                      <option value="operational">operational</option>
                      <option value="managerial">managerial</option>
                    </select>
                  </td>

                  <td className="px-4 py-3">
                    {user.isApproved ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Approved
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" /> Pending Approval
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={user.canExecuteSelect ?? true}
                      onChange={(e) => onUpdateUserPrivileges && onUpdateUserPrivileges(user.id, { canExecuteSelect: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                  </td>

                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={user.canExecuteUpdate ?? (user.role === 'admin' || user.role === 'technical')}
                      onChange={(e) => onUpdateUserPrivileges && onUpdateUserPrivileges(user.id, { canExecuteUpdate: e.target.checked })}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                  </td>

                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {!user.isApproved && (
                        <button
                          type="button"
                          onClick={() => onApproveUser(user.id)}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                        >
                          Approve
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Remove user @${user.username}?`)) {
                            onDeleteUser(user.id);
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
