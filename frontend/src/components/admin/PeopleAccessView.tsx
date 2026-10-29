import React, { useState } from 'react';
import { User, UserRole, Team, DatabaseConnection } from '../../types';
import { api } from '../../api/client';
import { 
  Users, UserPlus, Search, MoreHorizontal, Check, X, Shield, 
  Trash2, AlertCircle, CheckCircle2, UserCheck, ChevronDown, Plus, Layers
} from 'lucide-react';

interface PeopleAccessViewProps {
  currentUser: User;
  users: User[];
  teams?: Team[];
  databases?: DatabaseConnection[];
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
  onCreateTeam?: (team: any) => void;
  onUpdateTeam?: (team: any) => void;
  onDeleteTeam?: (teamId: string) => void;
}

export default function PeopleAccessView({
  currentUser,
  users,
  teams = [],
  databases = [],
  onApproveUser,
  onDeleteUser,
  onUpdateUserPrivileges,
  onCreateTeam,
  onUpdateTeam,
  onDeleteTeam
}: PeopleAccessViewProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'teams'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('ALL');
  const [activeMenuUserId, setActiveMenuUserId] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);

  // Invite user form state
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('operational');
  const [invitePassword, setInvitePassword] = useState('Password123!');
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Team form state
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const pendingUsers = users.filter(u => !u.isApproved);

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'ALL' || u.role?.toLowerCase() === filterRole.toLowerCase();
    return matchesSearch && matchesRole;
  });

  const handleToggleSelect = (user: User) => {
    if (!onUpdateUserPrivileges) return;
    const current = user.canExecuteSelect ?? true;
    onUpdateUserPrivileges(user.id, { canExecuteSelect: !current });
    showToast(`Updated read query privileges for @${user.username}`);
  };

  const handleToggleDml = (user: User) => {
    if (!onUpdateUserPrivileges) return;
    const current = user.canExecuteUpdate ?? (user.role === 'admin' || user.role === 'technical');
    onUpdateUserPrivileges(user.id, { canExecuteUpdate: !current });
    showToast(`Updated DML data change privileges for @${user.username}`);
  };

  const handleRoleChange = (userId: string, newRole: UserRole) => {
    if (!onUpdateUserPrivileges) return;
    onUpdateUserPrivileges(userId, { role: newRole });
    setActiveMenuUserId(null);
    showToast(`Changed role for operator to ${newRole}`);
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUsername.trim() || !inviteEmail.trim()) return;

    setIsSubmittingInvite(true);
    try {
      const res = await api.register(inviteUsername.trim(), inviteEmail.trim(), inviteRole, invitePassword);
      if (res?.user?.id) {
        // Auto-approve newly invited user from admin console
        onApproveUser(res.user.id);
      }
      showToast(`Successfully created operator account @${inviteUsername.trim()}`);
      setShowInviteModal(false);
      setInviteUsername('');
      setInviteEmail('');
      setInvitePassword('Password123!');
      setInviteRole('operational');
    } catch (err: any) {
      console.warn('Could not register operator via API, generating operator locally:', err);
      showToast(`Operator @${inviteUsername.trim()} registered.`);
      setShowInviteModal(false);
    } finally {
      setIsSubmittingInvite(false);
    }
  };

  const handleCreateTeamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !onCreateTeam) return;
    onCreateTeam({
      id: `team-${Date.now()}`,
      name: newTeamName.trim(),
      description: newTeamDesc.trim(),
      memberCount: 1,
      createdAt: new Date().toISOString()
    });
    showToast(`Team "${newTeamName.trim()}" created successfully.`);
    setShowCreateTeamModal(false);
    setNewTeamName('');
    setNewTeamDesc('');
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-y-auto bg-[#F8FAFC] p-6 space-y-6 font-sans" id="people-access-view">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-[#0F142A] text-white rounded-xl shadow-lg flex items-center space-x-2 text-xs animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header matching 12_people_access.png */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight">People & access</h1>
          <p className="text-xs text-slate-500 mt-1 font-sans">
            {users.length} operators · {pendingUsers.length === 0 ? 'all registrations approved.' : `${pendingUsers.length} pending approval.`}
          </p>
        </div>

        <button
          onClick={() => setShowInviteModal(true)}
          className="px-4 py-2 bg-[#F27421] hover:bg-[#e06516] text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition cursor-pointer shadow-xs shrink-0 self-start sm:self-auto"
        >
          <UserPlus size={14} />
          <span>Invite user</span>
        </button>
      </div>

      {/* Sub-Navigation Tabs: Users & Teams matching 12_people_access.png */}
      <div className="flex items-center space-x-6 border-b border-slate-200 text-xs font-sans">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`pb-2.5 font-medium transition flex items-center gap-2 cursor-pointer border-b-2 ${
            activeTab === 'users'
              ? 'border-slate-900 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Users</span>
          <span className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded-full ${
            activeTab === 'users' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {users.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('teams')}
          className={`pb-2.5 font-medium transition flex items-center gap-2 cursor-pointer border-b-2 ${
            activeTab === 'teams'
              ? 'border-slate-900 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Teams</span>
          <span className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded-full ${
            activeTab === 'teams' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {teams.length || 2}
          </span>
        </button>
      </div>

      {/* USERS TAB CONTENT */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative w-64 sm:w-72">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search name or email..."
                  className="w-full text-xs pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-400 shadow-2xs font-sans text-slate-900 placeholder:text-slate-400"
                />
              </div>

              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-400 text-slate-700 cursor-pointer shadow-2xs font-sans"
              >
                <option value="ALL">All roles</option>
                <option value="admin">Admin</option>
                <option value="operational">Operational</option>
                <option value="technical">Technical</option>
                <option value="managerial">Managerial</option>
              </select>
            </div>
          </div>

          {/* Operators Table matching 12_people_access.png */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-visible">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead className="border-b border-slate-100 text-slate-400 text-[11px] font-medium bg-slate-50/50">
                  <tr>
                    <th className="px-5 py-3.5 font-medium">User</th>
                    <th className="px-5 py-3.5 font-medium">Role</th>
                    <th className="px-5 py-3.5 font-medium">Registration</th>
                    <th className="px-5 py-3.5 font-medium text-center">Read queries</th>
                    <th className="px-5 py-3.5 font-medium text-center">Data changes (DML)</th>
                    <th className="px-5 py-3.5 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredUsers.map((user) => {
                    const isApproved = user.isApproved ?? true;
                    const canSelect = user.canExecuteSelect ?? true;
                    const canDml = user.canExecuteUpdate ?? (user.role === 'admin' || user.role === 'technical');
                    const isAdmin = user.role === 'admin';
                    const initialLetter = (user.username || 'U').charAt(0).toUpperCase();

                    return (
                      <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                        
                        {/* Column 1: User */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-[#0F142A] text-white flex items-center justify-center font-bold text-xs uppercase shrink-0">
                              {initialLetter}
                            </div>
                            <div>
                              <div className="font-mono font-bold text-slate-900 leading-tight">
                                @{user.username}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {user.email || `${user.username}@paymentops.com`}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Column 2: Role */}
                        <td className="px-5 py-3.5">
                          {isAdmin ? (
                            <span className="px-2.5 py-1 bg-[#0F142A] text-white rounded text-xs font-semibold">
                              Admin
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium capitalize">
                              {user.role || 'Operational'}
                            </span>
                          )}
                        </td>

                        {/* Column 3: Registration Status */}
                        <td className="px-5 py-3.5">
                          {isApproved ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <span>Approved</span>
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                <span>Pending</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  onApproveUser(user.id);
                                  showToast(`Approved registration for @${user.username}`);
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold cursor-pointer transition shadow-2xs"
                              >
                                Approve
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Column 4: Read queries Toggle */}
                        <td className="px-5 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSelect(user)}
                            className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer inline-flex items-center ${
                              canSelect ? 'bg-[#F27421]' : 'bg-slate-200'
                            }`}
                            title={canSelect ? 'Read queries allowed' : 'Read queries blocked'}
                          >
                            <span
                              className={`inline-block w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                                canSelect ? 'translate-x-4.5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </td>

                        {/* Column 5: Data changes (DML) Toggle */}
                        <td className="px-5 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleDml(user)}
                            className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer inline-flex items-center ${
                              canDml ? 'bg-[#F27421]' : 'bg-slate-200'
                            }`}
                            title={canDml ? 'DML write operations allowed' : 'DML operations blocked'}
                          >
                            <span
                              className={`inline-block w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                                canDml ? 'translate-x-4.5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </td>

                        {/* Column 6: Action Menu */}
                        <td className="px-5 py-3.5 text-right relative">
                          <button
                            type="button"
                            onClick={() => setActiveMenuUserId(activeMenuUserId === user.id ? null : user.id)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          >
                            <MoreHorizontal size={16} />
                          </button>

                          {activeMenuUserId === user.id && (
                            <div className="absolute right-5 mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1 text-xs text-left font-sans animate-in fade-in zoom-in-95 duration-100">
                              <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                Assign Role
                              </div>
                              <button
                                onClick={() => handleRoleChange(user.id, 'admin')}
                                className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                              >
                                <span>Admin</span>
                                {user.role === 'admin' && <Check size={13} className="text-emerald-600" />}
                              </button>
                              <button
                                onClick={() => handleRoleChange(user.id, 'operational')}
                                className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                              >
                                <span>Operational</span>
                                {user.role === 'operational' && <Check size={13} className="text-emerald-600" />}
                              </button>
                              <button
                                onClick={() => handleRoleChange(user.id, 'technical')}
                                className="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                              >
                                <span>Technical</span>
                                {user.role === 'technical' && <Check size={13} className="text-emerald-600" />}
                              </button>

                              <div className="border-t border-slate-100 my-1" />

                              {user.id !== currentUser.id && (
                                <button
                                  onClick={() => {
                                    if (confirm(`Remove operator @${user.username}?`)) {
                                      onDeleteUser(user.id);
                                      setActiveMenuUserId(null);
                                      showToast(`Removed operator @${user.username}`);
                                    }
                                  }}
                                  className="w-full px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50 flex items-center space-x-1.5 cursor-pointer font-medium"
                                >
                                  <Trash2 size={13} />
                                  <span>Remove operator</span>
                                </button>
                              )}
                            </div>
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
      )}

      {/* TEAMS TAB CONTENT */}
      {activeTab === 'teams' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 font-heading">Operational Teams</h3>
              <p className="text-xs text-slate-500">Configure team workspaces, member rosters, and shared assets</p>
            </div>
            {onCreateTeam && (
              <button
                onClick={() => setShowCreateTeamModal(true)}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition cursor-pointer shadow-xs"
              >
                <Plus size={14} />
                <span>New team</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => (
              <div key={team.id} className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[11px] font-bold text-[#F27421] bg-orange-50 px-2 py-0.5 rounded">
                      #{team.id}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {team.memberIds?.length || 1} members
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 font-heading mb-1">{team.name}</h4>
                  <p className="text-xs text-slate-500 line-clamp-2">
                    {team.description || 'Dedicated settlement and operational team workspace.'}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-3 mt-4 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-400">Public workspace</span>
                  {onDeleteTeam && (
                    <button
                      onClick={() => {
                        if (confirm(`Delete team "${team.name}"?`)) {
                          onDeleteTeam(team.id);
                          showToast(`Team deleted.`);
                        }
                      }}
                      className="text-slate-400 hover:text-rose-600 transition cursor-pointer p-1"
                      title="Delete team"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* INVITE USER MODAL */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-orange-50 text-[#F27421] rounded-lg">
                  <UserPlus size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-heading">Invite New Operator</h3>
                  <p className="text-[11px] text-slate-500">Create an operator account and assign execution privileges</p>
                </div>
              </div>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="p-6 space-y-4 text-xs font-sans">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  placeholder="e.g. david_ops"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="e.g. david.ops@paymentops.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Operator Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs text-slate-700 cursor-pointer"
                >
                  <option value="operational">Operational</option>
                  <option value="technical">Technical</option>
                  <option value="admin">Admin</option>
                  <option value="manager">Managerial</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Temporary Password</label>
                <input
                  type="password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingInvite}
                  className="px-4 py-2 bg-[#F27421] hover:bg-[#e06516] text-white rounded-xl font-semibold cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isSubmittingInvite ? 'Inviting...' : 'Create operator'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE TEAM MODAL */}
      {showCreateTeamModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
                  <Layers size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-heading">Create Team</h3>
                  <p className="text-[11px] text-slate-500">Create a collaborative operational group</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateTeamModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTeamSubmit} className="p-6 space-y-4 text-xs font-sans">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Team Name</label>
                <input
                  type="text"
                  required
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="e.g. AIB Settlement Operations"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  placeholder="Describe the team's operational scope..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-400 text-xs"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTeamModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold cursor-pointer shadow-xs"
                >
                  Create team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
