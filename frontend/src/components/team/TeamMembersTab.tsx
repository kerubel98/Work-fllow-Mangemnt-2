import React, { useState } from 'react';
import { Team, User, MemberPrivilege } from '../../types';
import { 
  Users, UserPlus, Search, Crown, Shield, MessageCircle, 
  Trash2, Mail, CheckCircle2, ShieldCheck, Check
} from 'lucide-react';
import { NoMembersEmptyState } from './TeamEmptyStates';

interface TeamMembersTabProps {
  currentTeam: Team;
  teamUsers: User[];
  currentUser: User;
  onAddMemberClick: () => void;
  onRemoveMember?: (userId: string) => void;
  onOpenPersonalChat?: (userId: string) => void;
}

export const TeamMembersTab: React.FC<TeamMembersTabProps> = ({
  currentTeam,
  teamUsers = [],
  currentUser,
  onAddMemberClick,
  onRemoveMember,
  onOpenPersonalChat
}) => {
  const safeUsers = Array.isArray(teamUsers) ? teamUsers : [];
  const [searchQuery, setSearchQuery] = useState('');
  const isLead = currentUser && currentTeam && (currentTeam.managerId === currentUser.id || currentTeam.managerName === currentUser.username);
  const isGlobalAdmin = currentUser && (currentUser.role === 'admin' || (currentUser as any).role === 'superadmin');
  const canManageMembers = Boolean(isLead || isGlobalAdmin);

  const filteredMembers = safeUsers.filter(u => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (u.username || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.role || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 font-sans" id="team-members-tab">
      {/* Top Controls Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-mono">Team Roster</h3>
            <p className="text-[11px] text-slate-500 font-mono">
              {safeUsers.length} authorized {safeUsers.length === 1 ? 'member' : 'members'} in this workspace
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          {/* Search Input */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search roster..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-blue-500 w-48 text-slate-800"
            />
          </div>

          <button
            type="button"
            onClick={onAddMemberClick}
            className="px-3.5 py-1.5 bg-[#155DFC] hover:bg-blue-700 text-white font-mono font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
          >
            <UserPlus size={13} />
            <span>Add Member</span>
          </button>
        </div>
      </div>

      {/* Members Grid */}
      {filteredMembers.length === 0 ? (
        <NoMembersEmptyState onAddMember={onAddMemberClick} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredMembers.map(member => {
            const isMemberLead = currentTeam.managerId === member.id;
            const isSelf = member.id === currentUser.id;
            const initials = member.username.substring(0, 2).toUpperCase();

            return (
              <div 
                key={member.id}
                className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                      isMemberLead 
                        ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs' 
                        : isSelf
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-slate-900 font-mono text-xs truncate">
                          @{member.username}
                        </span>
                        {isSelf && (
                          <span className="text-[10px] text-blue-600 font-mono font-bold">(You)</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{member.email}</p>
                    </div>
                  </div>

                  {/* Visible Role Tag */}
                  {isMemberLead ? (
                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center gap-1 shrink-0">
                      <Crown size={10} className="text-amber-600" />
                      <span>Lead</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200 inline-flex items-center gap-1 shrink-0">
                      <span>Member</span>
                    </span>
                  )}
                </div>

                {/* Visible Info Badges (Roles & Units) */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono">
                  <div className="flex items-center space-x-1.5 text-slate-500">
                    <Shield size={12} className="text-slate-400" />
                    <span className="uppercase text-[10px] font-bold">{member.role}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-1">
                    {!isSelf && onOpenPersonalChat && (
                      <button
                        type="button"
                        onClick={() => onOpenPersonalChat(member.id)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title={`Chat with @${member.username}`}
                      >
                        <MessageCircle size={14} />
                      </button>
                    )}

                    {canManageMembers && !isMemberLead && onRemoveMember && (
                      <button
                        type="button"
                        onClick={() => onRemoveMember(member.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title={`Remove @${member.username} from team`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
