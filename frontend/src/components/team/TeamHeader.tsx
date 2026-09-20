import React, { useState, useRef, useEffect } from 'react';
import { Team, User } from '../../types';
import { 
  ChevronDown, Plus, UserPlus, Settings, ShieldCheck, 
  Briefcase, Crown, UserCheck, Shield, Check
} from 'lucide-react';

interface TeamHeaderProps {
  currentTeam: Team;
  visibleTeams: Team[];
  currentUser: User;
  onSelectTeam: (teamId: string) => void;
  onCreateTeamClick: () => void;
  onAddMemberClick: () => void;
  onNewTaskClick: () => void;
  onOpenSettingsClick: () => void;
  pendingApprovalsCount?: number;
  isSettingsOpen?: boolean;
}

export const TeamHeader: React.FC<TeamHeaderProps> = ({
  currentTeam,
  visibleTeams = [],
  currentUser,
  onSelectTeam,
  onCreateTeamClick,
  onAddMemberClick,
  onNewTaskClick,
  onOpenSettingsClick,
  pendingApprovalsCount = 0,
  isSettingsOpen = false
}) => {
  const safeVisibleTeams = Array.isArray(visibleTeams) ? visibleTeams : [];
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setIsSwitcherOpen(false);
      }
    };
    if (isSwitcherOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isSwitcherOpen]);

  const isPermanent = (currentTeam.teamType || 'working') === 'permanent';
  const isLead = currentTeam.managerId === currentUser.id || currentTeam.managerName === currentUser.username;

  return (
    <header 
      className="w-full bg-white border border-slate-200/90 rounded-2xl px-4 py-2.5 shadow-xs flex flex-wrap items-center justify-between gap-3 shrink-0" 
      id="team-workspace-header"
    >
      {/* Left: Unified Team Switcher + Status Badge */}
      <div className="flex items-center space-x-3 shrink-0">
        {/* Single Team Switcher Dropdown */}
        <div className="relative" ref={switcherRef}>
          <button
            type="button"
            onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-xl border border-slate-200/90 hover:border-blue-400 bg-slate-50/70 hover:bg-blue-50/40 text-slate-800 transition-all cursor-pointer shadow-2xs group"
            id="btn-team-switcher"
            aria-expanded={isSwitcherOpen}
            aria-label="Switch Team"
          >
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono font-bold text-[11px] ${
              isPermanent ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
            }`}>
              {currentTeam.name.substring(0, 2).toUpperCase()}
            </div>
            <span className="font-bold text-sm text-slate-900 font-mono tracking-tight group-hover:text-blue-700 max-w-[200px] truncate">
              {currentTeam.name}
            </span>
            <ChevronDown size={14} className={`text-slate-400 group-hover:text-blue-600 transition-transform ${isSwitcherOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Switcher Dropdown Menu */}
          {isSwitcherOpen && (
            <div className="absolute top-full left-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden font-sans">
              <div className="p-2.5 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase font-bold text-slate-500">Your Teams ({safeVisibleTeams.length})</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsSwitcherOpen(false);
                    onCreateTeamClick();
                  }}
                  className="text-[11px] font-mono text-[#155DFC] hover:underline font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={12} />
                  <span>New Team</span>
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto p-1.5 space-y-1">
                {safeVisibleTeams.map(t => {
                  const isSelected = t.id === currentTeam.id;
                  const tPerm = (t.teamType || 'working') === 'permanent';
                  const tLead = t.managerId === currentUser.id;

                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onSelectTeam(t.id);
                        setIsSwitcherOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                        isSelected 
                          ? 'bg-blue-50 text-blue-900 font-bold' 
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono font-bold text-[10px] shrink-0 ${
                          tPerm ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {t.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{t.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {tPerm ? 'Permanent Unit' : 'Working Team'} {tLead && '• Lead'}
                          </p>
                        </div>
                      </div>
                      {isSelected && <Check size={14} className="text-blue-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Primary Status Badges */}
        <div className="flex items-center space-x-1.5">
          {isPermanent ? (
            <span className="text-[11px] bg-purple-50 text-purple-700 border border-purple-200 font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-mono">
              <ShieldCheck size={12} className="text-purple-600" />
              <span>Permanent Unit</span>
            </span>
          ) : (
            <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-mono">
              <Briefcase size={12} className="text-emerald-600" />
              <span>Working Team</span>
            </span>
          )}

          {isLead ? (
            <span className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-mono">
              <Crown size={12} className="text-amber-600" />
              <span>Team Lead</span>
            </span>
          ) : (
            <span className="text-[11px] bg-slate-50 text-slate-700 border border-slate-200 font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-mono">
              <UserCheck size={12} className="text-slate-500" />
              <span>Member</span>
            </span>
          )}
        </div>
      </div>

      {/* Right: 3 High-Value Actions (Add Member, New Task, Team Settings) */}
      <div className="flex items-center space-x-2 shrink-0">
        <button
          type="button"
          onClick={onAddMemberClick}
          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-bold font-mono flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer"
          id="btn-header-add-member"
        >
          <UserPlus size={13} className="text-slate-500" />
          <span>Add Member</span>
        </button>

        <button
          type="button"
          onClick={onNewTaskClick}
          className="px-3 py-1.5 bg-[#155DFC] hover:bg-blue-700 text-white rounded-xl text-xs font-bold font-mono flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer"
          id="btn-header-new-task"
        >
          <Plus size={13} />
          <span>New Task</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettingsClick}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold font-mono flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer ${
            isSettingsOpen
              ? 'bg-slate-900 text-white'
              : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900'
          }`}
          id="btn-header-team-settings"
          title="Team Governance & Settings"
        >
          <Settings size={13} className={isSettingsOpen ? 'text-white' : 'text-slate-500'} />
          <span>Team Settings</span>
          {pendingApprovalsCount > 0 && (
            <span className="w-4 h-4 bg-amber-500 text-white rounded-full flex items-center justify-center text-[9px] font-bold">
              {pendingApprovalsCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
