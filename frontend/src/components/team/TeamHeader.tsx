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

  const initials = currentTeam.name.substring(0, 2).toUpperCase();

  return (
    <div className="w-full font-sans shrink-0 space-y-3 pb-1" id="team-workspace-header">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-1.5 text-xs text-slate-500 font-sans">
        <span className="hover:text-slate-800 transition-colors">Collaborate</span>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900 font-medium">{isSettingsOpen ? 'Team settings' : 'Team'}</span>
      </div>

      {/* Main Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Avatar + Title with Switcher Dropdown + Meta */}
        <div className="flex items-center space-x-3.5 shrink-0">
          {/* Orange Initials Avatar */}
          <div className="w-10 h-10 rounded-full bg-orange-100 text-[#F27421] font-bold text-sm flex items-center justify-center shrink-0">
            {initials}
          </div>

          <div className="space-y-1">
            {/* Title with Switcher */}
            <div className="relative" ref={switcherRef}>
              <button
                type="button"
                onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
                className="flex items-center space-x-2 text-left group cursor-pointer"
                id="btn-team-switcher"
                aria-expanded={isSwitcherOpen}
                aria-label="Switch Team"
              >
                <h1 className="font-bold text-lg text-slate-900 font-heading tracking-tight group-hover:text-slate-700 transition-colors">
                  {currentTeam.name}
                </h1>
                <ChevronDown size={15} className={`text-slate-400 group-hover:text-slate-600 transition-transform ${isSwitcherOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Switcher Dropdown Menu */}
              {isSwitcherOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden font-sans">
                  <div className="p-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-500">Your Teams ({safeVisibleTeams.length})</span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSwitcherOpen(false);
                        onCreateTeamClick();
                      }}
                      className="text-xs text-[#F27421] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={12} />
                      <span>New Team</span>
                    </button>
                  </div>

                  <div className="max-h-60 overflow-y-auto p-1.5 space-y-1">
                    {safeVisibleTeams.map(t => {
                      const isSelected = t.id === currentTeam.id;
                      const tPerm = (t.teamType || 'working') === 'permanent';

                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            onSelectTeam(t.id);
                            setIsSwitcherOpen(false);
                          }}
                          className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                            isSelected 
                              ? 'bg-orange-50 text-[#F27421] font-semibold' 
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center space-x-2 min-w-0">
                            <div className="w-6 h-6 rounded-full bg-orange-100 text-[#F27421] flex items-center justify-center font-bold text-[10px] shrink-0">
                              {t.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{t.name}</p>
                              <p className="text-[10px] text-slate-400">
                                {tPerm ? 'Permanent Unit' : 'Working Team'}
                              </p>
                            </div>
                          </div>
                          {isSelected && <Check size={14} className="text-[#F27421] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Subtitle / Metadata Badges */}
            <div className="flex items-center space-x-2 text-xs text-slate-500 font-sans">
              <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-md font-medium text-[11px]">
                {isPermanent ? 'Permanent unit' : 'Working team'}
              </span>
              <span>•</span>
              <span>
                {(currentTeam.memberIds?.length || 0) + 1} members · you are a member
              </span>
            </div>
          </div>
        </div>

        {/* Right: 3 High-Value Actions (Add Member, Settings, New Task) */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={onAddMemberClick}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-medium font-sans flex items-center space-x-1.5 transition-all shadow-2xs cursor-pointer"
            id="btn-header-add-member"
          >
            <UserPlus size={13} className="text-slate-500" />
            <span>Add member</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettingsClick}
            className={`p-2 rounded-lg text-xs flex items-center justify-center transition-all shadow-2xs cursor-pointer relative ${
              isSettingsOpen
                ? 'bg-slate-900 text-white'
                : 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-900'
            }`}
            id="btn-header-team-settings"
            title="Team Governance & Settings"
            aria-label="Team settings"
          >
            <Settings size={15} className={isSettingsOpen ? 'text-white' : 'text-slate-500'} />
            {pendingApprovalsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[8px] font-bold">
                {pendingApprovalsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onNewTaskClick}
            className="px-3.5 py-2 bg-[#F27421] hover:bg-[#e06516] text-white rounded-lg text-xs font-medium font-sans flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
            id="btn-header-new-task"
          >
            <Plus size={13} />
            <span>New task</span>
          </button>
        </div>
      </div>
    </div>
  );
};
