/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { User, Team, TeamTask, TeamInsight, TeamDiscussionMessage } from '../types';
import { 
  Users, MessageSquare, CheckSquare, Lightbulb, Plus, Send, 
  ShieldCheck, UserCheck, Briefcase, Tag, Trash2, Clock, 
  CheckCircle2, AlertCircle, Sparkles, Filter, ChevronRight, UserPlus, X, Check,
  ArrowLeft, Crown, Calendar, TrendingUp, BarChart2, Target, Flag
} from 'lucide-react';

interface TeamWorkspaceProps {
  currentUser: User;
  users: User[];
  teams: Team[];
  tasks: TeamTask[];
  insights: TeamInsight[];
  messages: TeamDiscussionMessage[];
  onCreateTeam?: (team: Omit<Team, 'id' | 'createdAt'>) => void;
  onUpdateTeam?: (id: string, updates: Partial<Team>) => void;
  onAddTask: (task: Omit<TeamTask, 'id' | 'createdAt'>) => void;
  onUpdateTaskStatus: (taskId: string, status: 'To Do' | 'In Progress' | 'Done') => void;
  onDeleteTask: (taskId: string) => void;
  onAddInsight: (insight: Omit<TeamInsight, 'id' | 'createdAt'>) => void;
  onDeleteInsight: (insightId: string) => void;
  onSendMessage: (msg: Omit<TeamDiscussionMessage, 'id' | 'timestamp'>) => void;
  openCreateModalSignal?: number;
  initialSelectedTeamId?: string | null;
  initialActiveTab?: 'members' | 'discussion' | 'tasks' | 'timeline' | 'dashboard' | 'insights' | null;
  initialSelectedTaskId?: string | null;
  onOpenPersonalChat?: (userId: string) => void;
}

export default function TeamWorkspace({
  currentUser,
  users = [],
  teams = [],
  tasks = [],
  insights = [],
  messages = [],
  onCreateTeam,
  onUpdateTeam,
  onAddTask,
  onUpdateTaskStatus,
  onDeleteTask,
  onAddInsight,
  onDeleteInsight,
  onSendMessage,
  openCreateModalSignal,
  initialSelectedTeamId,
  initialActiveTab,
  initialSelectedTaskId,
  onOpenPersonalChat
}: TeamWorkspaceProps) {

  // Active sub-tab state inside Team Workspace: 'members' | 'discussion' | 'tasks' | 'timeline' | 'dashboard' | 'insights'
  const [activeTab, setActiveTab] = useState<'members' | 'discussion' | 'tasks' | 'timeline' | 'dashboard' | 'insights'>(
    initialActiveTab || 'members'
  );

  // Selected active team ID (null = showing all teams list)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    initialSelectedTeamId !== undefined ? initialSelectedTeamId : (teams[0]?.id || null)
  );

  React.useEffect(() => {
    if (initialSelectedTeamId !== undefined) {
      setSelectedTeamId(initialSelectedTeamId);
    }
  }, [initialSelectedTeamId]);

  React.useEffect(() => {
    if (initialActiveTab) {
      setActiveTab(initialActiveTab);
    }
  }, [initialActiveTab]);

  const currentTeam = selectedTeamId ? teams.find(t => t.id === selectedTeamId) : null;

  // Modals state
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showAddInsightModal, setShowAddInsightModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);

  React.useEffect(() => {
    if (openCreateModalSignal && openCreateModalSignal > 0) {
      setShowCreateTeamModal(true);
    }
  }, [openCreateModalSignal]);

  // Directory filter state: 'all' | 'permanent' | 'working'
  const [directoryFilter, setDirectoryFilter] = useState<'all' | 'permanent' | 'working'>('all');

  // Form state for Create Team
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [newTeamType, setNewTeamType] = useState<'permanent' | 'working'>('working');
  const [newTeamMemberIds, setNewTeamMemberIds] = useState<string[]>([]);

  // Form states for New Task
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState(currentUser.id);
  const [newTaskPriority, setNewTaskPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [newTaskStartDate, setNewTaskStartDate] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskMilestone, setNewTaskMilestone] = useState('');

  // Form states for New Insight
  const [newInsightTitle, setNewInsightTitle] = useState('');
  const [newInsightContent, setNewInsightContent] = useState('');
  const [newInsightTags, setNewInsightTags] = useState('BestPractices, OpsTip');

  // Form states for Chat
  const [chatInput, setChatInput] = useState('');
  const chatInputRef = useRef<HTMLInputElement>(null);

  const handleStartChatWithMember = (username: string) => {
    setActiveTab('discussion');
    if (currentUser.username !== username) {
      setChatInput(`@${username} `);
    }
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 100);
  };

  // Form state for Add Member
  const [selectedUserIdToAdd, setSelectedUserIdToAdd] = useState('');

  // Task filter
  const [taskFilterStatus, setTaskFilterStatus] = useState<string>('All');

  // Filtered lists for current team
  const currentTeamId = currentTeam ? currentTeam.id : '';
  const teamTasks = tasks.filter(t => t.teamId === currentTeamId);
  const teamInsights = insights.filter(i => i.teamId === currentTeamId);
  const teamMessages = messages.filter(m => m.teamId === currentTeamId);

  // Users in current team
  const currentTeamMemberIds = currentTeam ? [currentTeam.managerId, ...currentTeam.memberIds] : [];
  const currentTeamUsers = users.filter(u => currentTeamMemberIds.includes(u.id));

  // Handler for sending a chat message
  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !currentTeamId) return;

    onSendMessage({
      teamId: currentTeamId,
      senderId: currentUser.id,
      senderName: currentUser.username,
      senderRole: currentUser.role,
      content: chatInput.trim()
    });

    setChatInput('');
  };

  // Handler for creating a new Task
  const handleCreateTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !currentTeamId) return;

    const assignee = users.find(u => u.id === newTaskAssigneeId) || currentUser;

    onAddTask({
      teamId: currentTeamId,
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
      assigneeId: assignee.id,
      assigneeName: assignee.username,
      creatorId: currentUser.id,
      creatorName: currentUser.username,
      status: 'To Do',
      priority: newTaskPriority,
      startDate: newTaskStartDate || undefined,
      dueDate: newTaskDueDate || undefined,
      milestone: newTaskMilestone.trim() || undefined
    });

    setNewTaskTitle('');
    setNewTaskDesc('');
    setNewTaskStartDate('');
    setNewTaskDueDate('');
    setNewTaskMilestone('');
    setShowAddTaskModal(false);
  };

  // Handler for creating a new Insight
  const handleCreateInsightSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInsightTitle.trim() || !newInsightContent.trim() || !currentTeamId) return;

    const tagsArray = newInsightTags
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    onAddInsight({
      teamId: currentTeamId,
      title: newInsightTitle.trim(),
      content: newInsightContent.trim(),
      authorId: currentUser.id,
      authorName: currentUser.username,
      authorRole: currentUser.role,
      tags: tagsArray.length > 0 ? tagsArray : ['General']
    });

    setNewInsightTitle('');
    setNewInsightContent('');
    setNewInsightTags('BestPractices, OpsTip');
    setShowAddInsightModal(false);
  };

  // Handler for creating a brand new Team
  const isManagerOrAdmin = true;

  const handleCreateTeamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim() || !onCreateTeam) return;

    onCreateTeam({
      name: newTeamName.trim(),
      description: newTeamDesc.trim(),
      teamType: isManagerOrAdmin ? newTeamType : 'working',
      managerId: currentUser.id,
      managerName: currentUser.username,
      memberIds: newTeamMemberIds
    });

    setNewTeamName('');
    setNewTeamDesc('');
    setNewTeamType('working');
    setNewTeamMemberIds([]);
    setShowCreateTeamModal(false);
  };

  // Handler for adding a user to current team
  const handleAddMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserIdToAdd || !currentTeam || !onUpdateTeam) return;

    const updatedMembers = Array.from(new Set([...currentTeam.memberIds, selectedUserIdToAdd]));
    onUpdateTeam(currentTeam.id, { memberIds: updatedMembers });

    setSelectedUserIdToAdd('');
    setShowAddMemberModal(false);
  };

  const handleRemoveMember = (memberId: string) => {
    if (!currentTeam || !onUpdateTeam) return;
    const updatedMembers = currentTeam.memberIds.filter(id => id !== memberId);
    onUpdateTeam(currentTeam.id, { memberIds: updatedMembers });
  };

  // Non-team members that can be added
  const availableUsersToAdd = users.filter(u => !currentTeamMemberIds.includes(u.id));

  // Filter tasks for task list
  const filteredTasks = teamTasks.filter(t => {
    if (taskFilterStatus === 'All') return true;
    return t.status === taskFilterStatus;
  });

  // Filter teams directory by type
  const permanentTeams = teams.filter(t => (t.teamType || 'working') === 'permanent');
  const workingTeams = teams.filter(t => (t.teamType || 'working') === 'working');

  const displayedTeams = teams.filter(t => {
    const tType = t.teamType || 'working';
    if (directoryFilter === 'permanent') return tType === 'permanent';
    if (directoryFilter === 'working') return tType === 'working';
    return true;
  });

  // ----------------------------------------------------
  // 1. IF NO TEAM SELECTED: RENDER ALL TEAMS DIRECTORY
  // ----------------------------------------------------
  if (!selectedTeamId || !currentTeam) {
    return (
      <div className="space-y-6" id="team-workspace-directory">
        {/* Top Banner */}
        <div className="bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-sm border border-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center space-x-2">
                <span className="px-2.5 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] rounded-full font-mono font-bold uppercase tracking-wider">
                  Team Directory
                </span>
                <span className="text-slate-400 text-xs font-mono">
                  Logged in as <strong className="text-white">@{currentUser.username}</strong> ({currentUser.role})
                </span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2">
                <Users className="text-blue-400" size={24} />
                <span>My Teams & Workspaces</span>
              </h1>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                Select a team below to open its workspace. Permanent Unit Teams are managed by unit leaders, while Working Teams can be created by anyone for specific task forces.
              </p>
            </div>

            <button
              onClick={() => setShowCreateTeamModal(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-mono font-bold text-xs rounded-xl flex items-center space-x-2 transition-all shadow-sm cursor-pointer border border-blue-400/30 shrink-0"
              id="create-team-directory-btn"
            >
              <Plus size={16} />
              <span>Create Team</span>
            </button>
          </div>
        </div>

        {/* Filter Bar & Directory List */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 border border-slate-200/90 rounded-2xl shadow-2xs">
            <div className="flex items-center space-x-1 bg-slate-100/90 p-1 rounded-xl">
              <button
                onClick={() => setDirectoryFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                  directoryFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Teams ({teams.length})
              </button>
              <button
                onClick={() => setDirectoryFilter('permanent')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                  directoryFilter === 'permanent'
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-purple-700'
                }`}
              >
                <ShieldCheck size={13} />
                <span>Permanent Units ({permanentTeams.length})</span>
              </button>
              <button
                onClick={() => setDirectoryFilter('working')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center space-x-1.5 cursor-pointer ${
                  directoryFilter === 'working'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-emerald-700'
                }`}
              >
                <Briefcase size={13} />
                <span>Working Teams ({workingTeams.length})</span>
              </button>
            </div>

            <p className="text-[11px] font-mono text-slate-500 px-1">
              Showing <strong className="text-slate-800">{displayedTeams.length}</strong> team{displayedTeams.length !== 1 ? 's' : ''}
            </p>
          </div>

          {displayedTeams.length === 0 ? (
            <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center space-y-4 shadow-sm">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                <Users size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800">No Teams Found in this Filter</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {directoryFilter === 'permanent'
                    ? 'No Permanent Unit Teams created yet by Managers.'
                    : directoryFilter === 'working'
                    ? 'No Working Teams created for specific project purposes.'
                    : 'Create a team to start collaborating.'}
                </p>
              </div>
              <button
                onClick={() => setShowCreateTeamModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl inline-flex items-center space-x-2 transition-colors cursor-pointer"
              >
                <Plus size={14} />
                <span>Create Team</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {displayedTeams.map(team => {
                const memberCount = (team.memberIds ? team.memberIds.length : 0) + 1;
                const teamTaskCount = tasks.filter(t => t.teamId === team.id).length;
                const teamInsightCount = insights.filter(i => i.teamId === team.id).length;
                const teamMsgCount = messages.filter(m => m.teamId === team.id).length;

                const isManager = team.managerId === currentUser.id;
                const isMember = team.memberIds?.includes(currentUser.id);
                const isPermanent = (team.teamType || 'working') === 'permanent';

                return (
                  <div
                    key={team.id}
                    onClick={() => setSelectedTeamId(team.id)}
                    className="bg-white border border-slate-200/90 hover:border-blue-500/80 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {team.name}
                          </h3>
                          <p className="text-[11px] font-mono text-slate-500">
                            Lead/Manager: <strong className="text-slate-700">@{team.managerName || 'manager'}</strong>
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {isPermanent ? (
                            <span className="text-[9px] bg-purple-100 text-purple-800 border border-purple-200 font-bold px-2 py-0.5 rounded-full font-mono flex items-center space-x-1">
                              <ShieldCheck size={10} />
                              <span>Permanent Unit</span>
                            </span>
                          ) : (
                            <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold px-2 py-0.5 rounded-full font-mono flex items-center space-x-1">
                              <Briefcase size={10} />
                              <span>Working Team</span>
                            </span>
                          )}

                          {isManager ? (
                            <span className="text-[9px] bg-amber-100 text-amber-800 border border-amber-300 font-bold px-2 py-0.5 rounded-full font-mono">
                              Lead/Manager
                            </span>
                          ) : isMember ? (
                            <span className="text-[9px] bg-blue-100 text-blue-800 border border-blue-200 font-bold px-2 py-0.5 rounded-full font-mono">
                              Member
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed min-h-[2.5rem]">
                        {team.description || 'No description provided for this team.'}
                      </p>

                      <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] font-mono border-t border-slate-100">
                        <div className="flex items-center space-x-1.5 text-slate-600">
                          <Users size={13} className="text-blue-500" />
                          <span>{memberCount} Members</span>
                        </div>
                        <div className="flex items-center space-x-1.5 text-slate-600">
                          <MessageSquare size={13} className="text-indigo-500" />
                          <span>{teamMsgCount} Discussions</span>
                        </div>
                        <div className="flex items-center space-x-1.5 text-slate-600">
                          <CheckSquare size={13} className="text-emerald-500" />
                          <span>{teamTaskCount} Tasks</span>
                        </div>
                        <div className="flex items-center space-x-1.5 text-slate-600">
                          <Lightbulb size={13} className="text-amber-500" />
                          <span>{teamInsightCount} Insights</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-xs font-mono font-bold text-blue-600 group-hover:text-blue-700">
                      <span>Open Team Workspace</span>
                      <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Create Team Modal */}
        {showCreateTeamModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <Users size={18} className="text-blue-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Create New Team</h3>
                    <p className="text-[10px] text-slate-500">You will be assigned as Lead/Manager for this team.</p>
                  </div>
                </div>
                <button onClick={() => setShowCreateTeamModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateTeamSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1.5">Team Type *</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div
                      onClick={() => setNewTeamType('working')}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        newTeamType === 'working'
                          ? 'bg-emerald-50/80 border-emerald-500 ring-1 ring-emerald-500'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center space-x-2 text-emerald-800 font-bold text-xs mb-1">
                        <Briefcase size={14} />
                        <span>Working Team</span>
                      </div>
                      <p className="text-[10px] text-slate-600 leading-normal font-sans">
                        Created by anyone for specific project goals, temporary task forces, or operational tasks.
                      </p>
                    </div>

                    <div
                      onClick={() => {
                        if (isManagerOrAdmin) {
                          setNewTeamType('permanent');
                        }
                      }}
                      className={`p-3 rounded-xl border transition-all ${
                        !isManagerOrAdmin
                          ? 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
                          : newTeamType === 'permanent'
                          ? 'bg-purple-50/80 border-purple-500 ring-1 ring-purple-500 cursor-pointer'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center space-x-2 text-purple-800 font-bold text-xs mb-1">
                        <ShieldCheck size={14} />
                        <span>Permanent Unit Team</span>
                      </div>
                      <p className="text-[10px] text-slate-600 leading-normal font-sans">
                        Created by Managers for permanent department unit members.
                      </p>
                      {!isManagerOrAdmin && (
                        <span className="inline-block mt-1 text-[9px] text-amber-700 font-semibold font-sans">
                          (Requires Manager role)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Team Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Reconciliation Ops Squad, Data Integrity Team"
                    value={newTeamName}
                    onChange={e => setNewTeamName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Team Description</label>
                  <textarea
                    rows={2}
                    placeholder="Brief summary of your team's operational scope..."
                    value={newTeamDesc}
                    onChange={e => setNewTeamDesc(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1.5">Select Team Members</label>
                  <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1 bg-slate-50">
                    {users.filter(u => u.id !== currentUser.id).length === 0 ? (
                      <p className="text-[11px] text-slate-400 p-2">No other users in system yet.</p>
                    ) : (
                      users.filter(u => u.id !== currentUser.id).map(user => {
                        const isSelected = newTeamMemberIds.includes(user.id);
                        return (
                          <label
                            key={user.id}
                            className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                              isSelected ? 'bg-blue-100/70 border border-blue-300 font-bold text-blue-900' : 'hover:bg-slate-100 text-slate-700'
                            }`}
                          >
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setNewTeamMemberIds(prev => [...prev, user.id]);
                                  } else {
                                    setNewTeamMemberIds(prev => prev.filter(id => id !== user.id));
                                  }
                                }}
                                className="rounded text-blue-600 focus:ring-blue-500"
                              />
                              <span>@{user.username}</span>
                            </div>
                            <span className="text-[10px] uppercase text-slate-500 font-mono">({user.role})</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowCreateTeamModal(false)}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newTeamName.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg"
                  >
                    Create Team
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ----------------------------------------------------
  // 2. SPECIFIC TEAM SELECTED WORKSPACE
  // ----------------------------------------------------
  return (
    <div className="space-y-4" id="team-workspace-container">
      
      {/* Top Action Bar: Back to All Teams & Create Team Aligned Horizontally */}
      <div className="flex items-center justify-between gap-3 font-mono">
        <button
          onClick={() => setSelectedTeamId(null)}
          className="inline-flex items-center space-x-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-700/80 shadow-xs"
          id="back-to-all-teams-btn"
        >
          <ArrowLeft size={14} />
          <span>Back to All Teams</span>
        </button>

        <button
          onClick={() => setShowCreateTeamModal(true)}
          className="inline-flex items-center space-x-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer border border-blue-400/30"
          id="create-my-own-team-btn"
        >
          <Plus size={15} />
          <span>Create Team</span>
        </button>
      </div>

      {/* Team Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-sm border border-slate-800">
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] rounded-full font-mono font-bold uppercase tracking-wider">
              Team Collaboration Core
            </span>
            <span className="text-slate-400 text-xs font-mono">
              Logged in as <strong className="text-white">@{currentUser.username}</strong> ({currentUser.role})
            </span>
          </div>
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2">
              <Users className="text-blue-400" size={24} />
              <span>{currentTeam.name}</span>
            </h1>
            {(currentTeam.teamType || 'working') === 'permanent' ? (
              <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-400/40 font-bold px-2.5 py-0.5 rounded-full font-mono flex items-center space-x-1">
                <ShieldCheck size={11} />
                <span>Permanent Unit Team</span>
              </span>
            ) : (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-bold px-2.5 py-0.5 rounded-full font-mono flex items-center space-x-1">
                <Briefcase size={11} />
                <span>Working Team</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
            {currentTeam.description || 'Collaborate with team members, share operational tasks, communicate in real time, and share database query insights.'}
          </p>
        </div>

        {/* Navigation Sub-Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-6 mt-2 border-t border-slate-800 text-xs font-mono">
          <button
            onClick={() => setActiveTab('members')}
            className={`px-4 py-2 rounded-xl flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'members'
                ? 'bg-blue-600 text-white font-bold shadow-sm'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <Users size={15} />
            <span>Team Members</span>
            <span className="ml-1 text-[10px] bg-blue-900/60 text-blue-200 px-2 py-0.5 rounded-full">
              {currentTeamMemberIds.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('discussion')}
            className={`px-4 py-2 rounded-xl flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'discussion'
                ? 'bg-blue-600 text-white font-bold shadow-sm'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <MessageSquare size={15} />
            <span>Team Discussion</span>
            <span className="ml-1 text-[10px] bg-blue-900/60 text-blue-200 px-2 py-0.5 rounded-full">
              {teamMessages.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-4 py-2 rounded-xl flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'tasks'
                ? 'bg-blue-600 text-white font-bold shadow-sm'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <CheckSquare size={15} />
            <span>Shared Tasks</span>
            <span className="ml-1 text-[10px] bg-blue-900/60 text-blue-200 px-2 py-0.5 rounded-full">
              {teamTasks.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-4 py-2 rounded-xl flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'timeline'
                ? 'bg-blue-600 text-white font-bold shadow-sm'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <Calendar size={15} />
            <span>Timeline & Roadmap</span>
          </button>

          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-xl flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-amber-600 text-white font-bold shadow-sm'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <BarChart2 size={15} className="text-amber-300" />
            <span>Lead Follow-Up Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('insights')}
            className={`px-4 py-2 rounded-xl flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'insights'
                ? 'bg-blue-600 text-white font-bold shadow-sm'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <Lightbulb size={15} />
            <span>Shared Insights</span>
            <span className="ml-1 text-[10px] bg-blue-900/60 text-blue-200 px-2 py-0.5 rounded-full">
              {teamInsights.length}
            </span>
          </button>
        </div>
      </div>

      {/* TAB 1: TEAM MEMBERS */}
      {activeTab === 'members' && (
        <div className="space-y-5">
          {/* Team Lead Rights Notice */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start space-x-3 text-xs font-mono">
            <Crown size={20} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-bold text-amber-300 uppercase tracking-wider text-[11px]">
                Team Structure & Team Lead Authority
              </h4>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                In <strong className="text-white">{currentTeam?.name}</strong> ({(currentTeam?.teamType || 'working') === 'permanent' ? 'Permanent Unit Team' : 'Working Team'}), 
                <strong className="text-amber-300"> @{currentTeam?.managerName}</strong> is assigned as the <strong className="text-white">Team Lead</strong>.
                The Team Lead has full authority to create tasks, assign team members, set project timelines, and monitor completion progress via the Lead Dashboard.
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider">
                  Team Roster & Roles
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Members belonging to <strong className="text-slate-800">{currentTeam?.name || 'this team'}</strong>.
                </p>
              </div>

              {(currentUser.id === currentTeam?.managerId || true) && (
                <button
                  onClick={() => setShowAddMemberModal(true)}
                  disabled={availableUsersToAdd.length === 0}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <UserPlus size={14} />
                  <span>Add Member to Team</span>
                </button>
              )}
            </div>

            {/* Team Members Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentTeamUsers.map(member => {
                const isLead = currentTeam && member.id === currentTeam.managerId;
                const isSelf = member.id === currentUser.id;
                const memberTasks = teamTasks.filter(t => t.assigneeId === member.id);
                const completedTasks = memberTasks.filter(t => t.status === 'Done').length;

                return (
                  <div 
                    key={member.id} 
                    onClick={() => handleStartChatWithMember(member.username)}
                    className={`p-4 rounded-xl border transition-all flex flex-col justify-between cursor-pointer group ${
                      isSelf 
                        ? 'bg-blue-50/50 border-blue-200 hover:border-blue-400 shadow-2xs' 
                        : 'bg-slate-50/70 border-slate-200 hover:border-blue-300 hover:shadow-xs'
                    }`}
                    title={`Click to start chat with @${member.username}`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center space-x-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm font-mono border ${
                            isLead ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-blue-100 text-blue-800 border-blue-300'
                          }`}>
                            {member.username.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span className="text-xs font-bold text-slate-900 group-hover:text-blue-600 font-mono transition-colors">@{member.username}</span>
                              {isSelf && (
                                <span className="text-[9px] bg-blue-600 text-white font-bold px-1.5 py-0.2 rounded font-mono">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono block">{member.email}</span>
                          </div>
                        </div>

                        {/* Team-Specific Role Badge */}
                        {isLead ? (
                          <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded-full font-mono flex items-center space-x-1 shrink-0">
                            <Crown size={11} className="text-amber-600" />
                            <span>Team Lead</span>
                          </span>
                        ) : (
                          <span className="text-[9px] bg-blue-100 text-blue-900 border border-blue-200 font-bold px-2 py-0.5 rounded-full font-mono flex items-center space-x-1 shrink-0">
                            <UserCheck size={11} className="text-blue-600" />
                            <span>Member</span>
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-slate-200/60 font-mono text-[11px]">
                        <div className="flex items-center justify-between text-slate-500">
                          <span>Team Specific Role:</span>
                          <span className="font-bold text-slate-800">
                            {isLead 
                              ? ((currentTeam?.teamType || 'working') === 'permanent' ? 'Permanent Unit Lead' : 'Working Team Lead') 
                              : 'Team Member'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-500">
                          <span>System Role:</span>
                          <span className="font-bold px-2 py-0.5 rounded uppercase text-[10px] bg-blue-100 text-blue-700">
                            {member.role}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-500">
                          <span>Assigned Tasks:</span>
                          <span className="font-bold text-slate-800">
                            {completedTasks} / {memberTasks.length} Completed
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Footer / Controls */}
                    <div className="pt-3 mt-3 border-t border-slate-200/60 flex justify-between items-center text-[10px] font-mono text-slate-500">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartChatWithMember(member.username);
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-bold font-mono flex items-center space-x-1.5 transition-all cursor-pointer shadow-2xs shrink-0"
                        title={`Start chat with @${member.username}`}
                      >
                        <MessageSquare size={13} />
                        <span>Start Chat</span>
                      </button>

                      <div className="flex items-center space-x-2">
                        <span className="flex items-center space-x-1 text-emerald-600 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span>Active</span>
                        </span>

                        {!isLead && !isSelf && (currentUser.id === currentTeam?.managerId || true) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveMember(member.id);
                            }}
                            className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                            title="Remove member from team"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TEAM DISCUSSION / COMMUNICATION */}
      {activeTab === 'discussion' && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4 flex flex-col h-[520px]">
          <div className="border-b border-slate-100 pb-3 flex justify-between items-center shrink-0">
            <div className="flex items-center space-x-2.5">
              <MessageSquare size={18} className="text-blue-600" />
              <div>
                <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider">
                  Team Communication Stream
                </h3>
                <p className="text-[11px] text-slate-500">
                  Shared discussion channel for team members of <strong className="text-slate-800">{currentTeam?.name}</strong>.
                </p>
              </div>
            </div>
            <span className="text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full font-bold">
              {teamMessages.length} Messages
            </span>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto space-y-3.5 pr-2 font-mono text-xs">
            {teamMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center space-y-2">
                <MessageSquare size={32} className="text-slate-300" />
                <p className="text-xs font-medium">No messages in team stream yet.</p>
                <p className="text-[11px] text-slate-400 max-w-xs">Start the conversation below to coordinate with team members.</p>
              </div>
            ) : (
              teamMessages.map(msg => {
                const isMe = msg.senderId === currentUser.id;

                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center space-x-1.5 mb-1 text-[10px] text-slate-500">
                      <span className="font-bold text-slate-800">@{msg.senderName}</span>
                      <span className="uppercase text-[9px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded font-mono">
                        {msg.senderRole}
                      </span>
                      <span>•</span>
                      <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <div className={`max-w-xl p-3.5 rounded-2xl leading-relaxed text-xs font-sans ${
                      isMe 
                        ? 'bg-blue-600 text-white rounded-tr-none shadow-2xs' 
                        : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200/70'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Send Message Form */}
          <form onSubmit={handleChatSubmit} className="pt-3 border-t border-slate-100 flex items-center space-x-2 shrink-0">
            <input
              ref={chatInputRef}
              type="text"
              placeholder={`Message @${currentTeam?.name || 'team'}...`}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-xl px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0 shadow-2xs"
            >
              <Send size={14} />
              <span>Send</span>
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: SHARED TASKS */}
      {activeTab === 'tasks' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider">
                  Team Task Board & Assignments
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Track operational actions, database checks, and discrepancy reconciliation sub-tasks.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                {/* Filter */}
                <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl text-xs font-mono">
                  <Filter size={13} className="text-slate-500 ml-1.5" />
                  {['All', 'To Do', 'In Progress', 'Done'].map(st => (
                    <button
                      key={st}
                      onClick={() => setTaskFilterStatus(st)}
                      className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        taskFilterStatus === st ? 'bg-white text-blue-700 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowAddTaskModal(true)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0"
                >
                  <Plus size={15} />
                  <span>New Task</span>
                </button>
              </div>
            </div>

            {/* Tasks List */}
            {filteredTasks.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <CheckSquare size={32} className="mx-auto text-slate-300" />
                <h4 className="text-xs font-bold text-slate-700 font-mono">No tasks found</h4>
                <p className="text-[11px] text-slate-500">Create a new task to assign operational work items to team members.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTasks.map(task => {
                  const isDone = task.status === 'Done';
                  const isInProgress = task.status === 'In Progress';

                  return (
                    <div 
                      key={task.id} 
                      className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 transition-all ${
                        isDone 
                          ? 'bg-slate-50/80 border-slate-200 opacity-80' 
                          : isInProgress
                          ? 'bg-blue-50/30 border-blue-200 shadow-2xs'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                            task.priority === 'High' ? 'bg-amber-100 text-amber-700' :
                            task.priority === 'Medium' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {task.priority} Priority
                          </span>

                          <button
                            onClick={() => onDeleteTask(task.id)}
                            className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                            title="Delete task"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <h4 className={`text-xs font-bold font-sans ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                          {task.title}
                        </h4>

                        {task.description && (
                          <p className="text-[11px] text-slate-600 leading-relaxed font-sans">
                            {task.description}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-100 space-y-2 text-[10px] font-mono">
                        <div className="flex justify-between items-center text-slate-500">
                          <span>Assignee:</span>
                          <span className="font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded">
                            @{task.assigneeName}
                          </span>
                        </div>

                        {task.dueDate && (
                          <div className="flex justify-between items-center text-slate-500">
                            <span>Due Date:</span>
                            <span className="font-medium text-slate-700 flex items-center space-x-1">
                              <Clock size={11} />
                              <span>{task.dueDate}</span>
                            </span>
                          </div>
                        )}

                        {/* Status Switcher Button */}
                        <div className="pt-1 flex items-center justify-between">
                          <span className="text-slate-400">Status:</span>
                          <button
                            onClick={() => {
                              const nextStatus = task.status === 'To Do' ? 'In Progress' : task.status === 'In Progress' ? 'Done' : 'To Do';
                              onUpdateTaskStatus(task.id, nextStatus);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono flex items-center space-x-1 transition-all cursor-pointer ${
                              isDone ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' :
                              isInProgress ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' :
                              'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                          >
                            {isDone ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                            <span>{task.status} (Click to toggle)</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: TIMELINE & ROADMAP */}
      {activeTab === 'timeline' && (
        <div className="space-y-5 font-mono text-xs">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center space-x-2">
                  <Calendar className="text-blue-600" size={18} />
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Team Project Timeline & Milestones
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 font-sans">
                  Visual roadmap created by Team Lead <strong className="text-slate-800">@{currentTeam?.managerName}</strong> to schedule operational deliverables and track milestones.
                </p>
              </div>

              <button
                onClick={() => setShowAddTaskModal(true)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0"
              >
                <Plus size={15} />
                <span>Add Milestone / Task</span>
              </button>
            </div>

            {/* Timeline Milestones Roadmap */}
            {teamTasks.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2 font-mono">
                <Calendar size={32} className="mx-auto text-slate-300" />
                <h4 className="text-xs font-bold text-slate-700">No milestone tasks defined</h4>
                <p className="text-[11px] text-slate-500 font-sans">
                  The Team Lead can create tasks with start dates, due dates, and milestone phases to build a project timeline.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Milestone Phases Breakdown */}
                {(() => {
                  const milestonesMap: { [key: string]: TeamTask[] } = {};
                  teamTasks.forEach(task => {
                    const key = task.milestone || 'General Deliverables';
                    if (!milestonesMap[key]) milestonesMap[key] = [];
                    milestonesMap[key].push(task);
                  });

                  return Object.entries(milestonesMap).map(([mName, mTasks]) => {
                    const doneCount = mTasks.filter(t => t.status === 'Done').length;
                    const percent = Math.round((doneCount / mTasks.length) * 100);

                    return (
                      <div key={mName} className="border border-slate-200 rounded-xl p-5 bg-slate-50/50 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                          <div className="flex items-center space-x-2">
                            <Flag size={16} className="text-blue-600" />
                            <h4 className="font-bold text-slate-900 text-xs">{mName}</h4>
                            <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">
                              {mTasks.length} {mTasks.length === 1 ? 'task' : 'tasks'}
                            </span>
                          </div>

                          <div className="flex items-center space-x-3 text-[11px]">
                            <span className="text-slate-500">Milestone Progress:</span>
                            <div className="w-28 bg-slate-200 h-2 rounded-full overflow-hidden">
                              <div 
                                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            <span className="font-bold text-slate-800">{percent}%</span>
                          </div>
                        </div>

                        {/* Task items in this milestone */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {mTasks.map(task => {
                            const isDone = task.status === 'Done';
                            const isInProg = task.status === 'In Progress';

                            return (
                              <div 
                                key={task.id}
                                className={`p-3.5 rounded-lg border bg-white space-y-2 flex flex-col justify-between ${
                                  isDone ? 'border-emerald-200 bg-emerald-50/30' : isInProg ? 'border-blue-300 shadow-2xs' : 'border-slate-200'
                                }`}
                              >
                                <div>
                                  <div className="flex justify-between items-start">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                      task.priority === 'High' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                                    }`}>
                                      {task.priority} Priority
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                      isDone ? 'bg-emerald-100 text-emerald-800' :
                                      isInProg ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'
                                    }`}>
                                      {task.status}
                                    </span>
                                  </div>

                                  <h5 className={`font-bold text-xs mt-1 font-sans ${isDone ? 'line-through text-slate-500' : 'text-slate-900'}`}>
                                    {task.title}
                                  </h5>
                                  {task.description && (
                                    <p className="text-[11px] text-slate-600 font-sans mt-0.5 line-clamp-2">
                                      {task.description}
                                    </p>
                                  )}
                                </div>

                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                                  <span>Assignee: <strong className="text-slate-800">@{task.assigneeName}</strong></span>
                                  <div className="flex items-center space-x-1 text-slate-600">
                                    <Clock size={11} />
                                    <span>
                                      {task.startDate ? `${task.startDate} → ` : ''}{task.dueDate || 'No due date'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: LEAD MANAGERIAL DASHBOARD (TASK COMPLETION FOLLOW-UP) */}
      {activeTab === 'dashboard' && (
        <div className="space-y-5 font-mono text-xs">
          {/* Header Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white space-y-2 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl">
                  <BarChart2 size={22} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold tracking-tight text-white uppercase">
                      Team Lead Managerial Dashboard
                    </h3>
                    <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded-full font-bold">
                      Completion Follow-Up
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 font-sans mt-0.5">
                    Real-time operational tracking for Team Lead <strong className="text-amber-300">@{currentTeam?.managerName}</strong> to follow up on assigned task completion across team members.
                  </p>
                </div>
              </div>

              <div className="shrink-0 flex items-center space-x-2">
                <button
                  onClick={() => setShowAddTaskModal(true)}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Assign New Task</span>
                </button>
              </div>
            </div>
          </div>

          {/* Top KPI Metrics Cards */}
          {(() => {
            const total = teamTasks.length;
            const completed = teamTasks.filter(t => t.status === 'Done').length;
            const inProgress = teamTasks.filter(t => t.status === 'In Progress').length;
            const toDo = teamTasks.filter(t => t.status === 'To Do').length;
            const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

            const todayStr = new Date().toISOString().split('T')[0];
            const overdueTasks = teamTasks.filter(t => t.status !== 'Done' && t.dueDate && t.dueDate < todayStr);

            return (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Tasks</span>
                  <div className="text-xl font-bold text-slate-900">{total}</div>
                  <span className="text-[10px] text-slate-400 block font-sans">Assigned in Team</span>
                </div>

                <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl shadow-2xs space-y-1">
                  <span className="text-[10px] text-emerald-700 font-bold uppercase block">Completed</span>
                  <div className="text-xl font-bold text-emerald-800">{completed} ({completionRate}%)</div>
                  <div className="w-full bg-emerald-200 h-1.5 rounded-full overflow-hidden mt-1">
                    <div className="bg-emerald-600 h-full rounded-full" style={{ width: `${completionRate}%` }} />
                  </div>
                </div>

                <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl shadow-2xs space-y-1">
                  <span className="text-[10px] text-blue-700 font-bold uppercase block">In Progress</span>
                  <div className="text-xl font-bold text-blue-800">{inProgress}</div>
                  <span className="text-[10px] text-blue-600 block font-sans">Active Work</span>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl shadow-2xs space-y-1">
                  <span className="text-[10px] text-slate-600 font-bold uppercase block">To Do / Pending</span>
                  <div className="text-xl font-bold text-slate-800">{toDo}</div>
                  <span className="text-[10px] text-slate-500 block font-sans">Not Started</span>
                </div>

                <div className={`p-4 rounded-xl border shadow-2xs space-y-1 ${
                  overdueTasks.length > 0 ? 'bg-red-50 border-red-200 text-red-900' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <span className="text-[10px] font-bold uppercase block flex items-center justify-between">
                    <span>Overdue</span>
                    {overdueTasks.length > 0 && <AlertCircle size={12} className="text-red-600" />}
                  </span>
                  <div className={`text-xl font-bold ${overdueTasks.length > 0 ? 'text-red-700' : 'text-slate-800'}`}>
                    {overdueTasks.length}
                  </div>
                  <span className="text-[10px] opacity-80 block font-sans">
                    {overdueTasks.length > 0 ? 'Requires Follow-Up' : 'On Schedule'}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Member Workload & Completion Breakdown */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Users className="text-blue-600" size={16} />
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs">
                  Team Member Completion & Workload Matrix
                </h4>
              </div>
              <span className="text-[10px] text-slate-500 font-sans">
                Follow up on individual completion progress
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentTeamUsers.map(member => {
                const isLead = currentTeam && member.id === currentTeam.managerId;
                const mTasks = teamTasks.filter(t => t.assigneeId === member.id);
                const mCompleted = mTasks.filter(t => t.status === 'Done').length;
                const mInProg = mTasks.filter(t => t.status === 'In Progress').length;
                const mToDo = mTasks.filter(t => t.status === 'To Do').length;
                const mRate = mTasks.length > 0 ? Math.round((mCompleted / mTasks.length) * 100) : 0;

                return (
                  <div key={member.id} className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs font-mono border ${
                          isLead ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-blue-100 text-blue-800 border-blue-300'
                        }`}>
                          {member.username.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <span className="font-bold text-slate-900 text-xs">@{member.username}</span>
                            {isLead && (
                              <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded font-bold">
                                Team Lead
                              </span>
                            )}
                            <button
                              onClick={() => handleStartChatWithMember(member.username)}
                              className="px-1.5 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded text-[9px] font-bold font-mono transition-colors cursor-pointer flex items-center space-x-1 ml-1"
                              title={`Start chat with @${member.username}`}
                            >
                              <MessageSquare size={10} />
                              <span>Chat</span>
                            </button>
                          </div>
                          <span className="text-[10px] text-slate-500 block">{member.email}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-800 block">{mRate}% Done</span>
                        <span className="text-[10px] text-slate-500">{mCompleted} of {mTasks.length} tasks</span>
                      </div>
                    </div>

                    {/* Completion Bar */}
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          mRate === 100 ? 'bg-emerald-500' : mRate > 0 ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                        style={{ width: `${mRate}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-600 pt-1 border-t border-slate-200/60">
                      <span>In Progress: <strong className="text-blue-700">{mInProg}</strong></span>
                      <span>To Do: <strong className="text-slate-700">{mToDo}</strong></span>
                      <span>Done: <strong className="text-emerald-700">{mCompleted}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actionable Tasks Completion Follow-Up Table */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Target className="text-blue-600" size={16} />
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs">
                  Managerial Follow-Up & Action Table
                </h4>
              </div>
              <span className="text-[10px] text-slate-500 font-sans">
                Team Lead direct status update controls
              </span>
            </div>

            {teamTasks.length === 0 ? (
              <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl">
                No active tasks to display in follow-up table.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase">
                      <th className="pb-2.5 font-bold">Task Title</th>
                      <th className="pb-2.5 font-bold">Assignee</th>
                      <th className="pb-2.5 font-bold">Milestone</th>
                      <th className="pb-2.5 font-bold">Due Date</th>
                      <th className="pb-2.5 font-bold">Priority</th>
                      <th className="pb-2.5 font-bold">Completion Status</th>
                      <th className="pb-2.5 font-bold text-right">Lead Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {teamTasks.map(task => {
                      const isDone = task.status === 'Done';
                      const isInProg = task.status === 'In Progress';
                      const todayStr = new Date().toISOString().split('T')[0];
                      const isOverdue = !isDone && task.dueDate && task.dueDate < todayStr;

                      return (
                        <tr key={task.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 pr-3 font-sans font-bold text-slate-900">
                            <div>
                              <span className={isDone ? 'line-through text-slate-400' : ''}>{task.title}</span>
                              {isOverdue && (
                                <span className="ml-2 text-[9px] bg-red-100 text-red-800 border border-red-200 font-bold px-1.5 py-0.2 rounded">
                                  OVERDUE
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 pr-3 font-bold text-slate-800">
                            @{task.assigneeName}
                          </td>

                          <td className="py-3 pr-3 text-slate-600">
                            {task.milestone || 'General'}
                          </td>

                          <td className="py-3 pr-3 text-slate-600">
                            {task.dueDate || 'Unscheduled'}
                          </td>

                          <td className="py-3 pr-3">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                              task.priority === 'High' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {task.priority}
                            </span>
                          </td>

                          <td className="py-3 pr-3">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold inline-flex items-center space-x-1 ${
                              isDone ? 'bg-emerald-100 text-emerald-800' :
                              isInProg ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {isDone ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                              <span>{task.status}</span>
                            </span>
                          </td>

                          <td className="py-3 text-right">
                            <button
                              onClick={() => {
                                const nextStatus = task.status === 'To Do' ? 'In Progress' : task.status === 'In Progress' ? 'Done' : 'To Do';
                                onUpdateTaskStatus(task.id, nextStatus);
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                            >
                              Toggle Status
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: SHARED INSIGHTS & KNOWLEDGE */}
      {activeTab === 'insights' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider">
                  Team Knowledge & Query Insights
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Share query shortcuts, database safety rules, operational tips, and past resolution learnings.
                </p>
              </div>

              <button
                onClick={() => setShowAddInsightModal(true)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer shrink-0"
              >
                <Lightbulb size={15} />
                <span>Share New Insight</span>
              </button>
            </div>

            {/* Insights List */}
            {teamInsights.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <Lightbulb size={32} className="mx-auto text-slate-300" />
                <h4 className="text-xs font-bold text-slate-700 font-mono">No insights published yet</h4>
                <p className="text-[11px] text-slate-500">Publish your operational learnings or query shortcuts to help team members.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {teamInsights.map(insight => (
                  <div key={insight.id} className="p-5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3 flex flex-col justify-between hover:border-slate-300 transition-colors">
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <h4 className="text-xs font-bold text-slate-900 font-mono leading-snug">
                          {insight.title}
                        </h4>

                        <button
                          onClick={() => onDeleteInsight(insight.id)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                          title="Delete insight"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      <p className="text-xs text-slate-700 leading-relaxed font-sans bg-white p-3 rounded-lg border border-slate-200/80">
                        {insight.content}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                      <div className="flex items-center space-x-1.5 text-slate-500">
                        <span className="font-semibold text-slate-800">@{insight.authorName}</span>
                        <span className="uppercase text-[9px] bg-slate-200 text-slate-700 px-1 py-0.2 rounded">
                          {insight.authorRole}
                        </span>
                        <span>•</span>
                        <span>{new Date(insight.createdAt).toLocaleDateString()}</span>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {insight.tags.map((tag, idx) => (
                          <span key={idx} className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-bold">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: ADD TASK */}
      {showAddTaskModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <CheckSquare size={16} className="text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Create Team Task</h3>
              </div>
              <button onClick={() => setShowAddTaskModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTaskSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Audit Payment Gateway #4021 Discrepancies"
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Details or specific instructions for assignee..."
                  value={newTaskDesc}
                  onChange={e => setNewTaskDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Assignee</label>
                  <select
                    value={newTaskAssigneeId}
                    onChange={e => setNewTaskAssigneeId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {currentTeamUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        @{u.username} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={e => setNewTaskPriority(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newTaskStartDate}
                    onChange={e => setNewTaskStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Target Due Date</label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={e => setNewTaskDueDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Milestone / Timeline Phase</label>
                <input
                  type="text"
                  placeholder="e.g. Phase 1 - Reconciliation, Sprint 1, Final Audit"
                  value={newTaskMilestone}
                  onChange={e => setNewTaskMilestone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddTaskModal(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTaskTitle.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SHARE INSIGHT */}
      {showAddInsightModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Lightbulb size={16} className="text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Share Operational Insight</h3>
              </div>
              <button onClick={() => setShowAddInsightModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateInsightSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Insight Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Always Dry-Run UPDATE queries before execution"
                  value={newInsightTitle}
                  onChange={e => setNewInsightTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Insight Content / Explanation *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Detail the operational learning, query shortcut, or safety step..."
                  value={newInsightContent}
                  onChange={e => setNewInsightContent(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Tags (comma separated)</label>
                <input
                  type="text"
                  placeholder="e.g. BestPractices, SQLSafety, Reconciliation"
                  value={newInsightTags}
                  onChange={e => setNewInsightTags(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddInsightModal(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newInsightTitle.trim() || !newInsightContent.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg"
                >
                  Publish Insight
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD MEMBER */}
      {showAddMemberModal && currentTeam && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <UserPlus size={16} className="text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Add Member to {currentTeam.name}</h3>
              </div>
              <button onClick={() => setShowAddMemberModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddMemberSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Select User to Add</label>
                <select
                  value={selectedUserIdToAdd}
                  onChange={e => setSelectedUserIdToAdd(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Choose user from organization --</option>
                  {availableUsersToAdd.map(u => (
                    <option key={u.id} value={u.id}>
                      @{u.username} ({u.role} - {u.email})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedUserIdToAdd}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg"
                >
                  Add Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE BRAND NEW TEAM */}
      {showCreateTeamModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Users size={18} className="text-blue-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Create New Team</h3>
                  <p className="text-[10px] text-slate-500">You will be assigned as Lead/Manager for this team.</p>
                </div>
              </div>
              <button onClick={() => setShowCreateTeamModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTeamSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Team Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Reconciliation Ops Squad, Data Integrity Team"
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Team Description</label>
                <textarea
                  rows={2}
                  placeholder="Brief summary of your team's operational scope..."
                  value={newTeamDesc}
                  onChange={e => setNewTeamDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1.5">Select Team Members</label>
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1 bg-slate-50">
                  {users.filter(u => u.id !== currentUser.id).length === 0 ? (
                    <p className="text-[11px] text-slate-400 p-2">No other users in system yet.</p>
                  ) : (
                    users.filter(u => u.id !== currentUser.id).map(user => {
                      const isSelected = newTeamMemberIds.includes(user.id);
                      return (
                        <label
                          key={user.id}
                          className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-100/70 border border-blue-300 font-bold text-blue-900' : 'hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={e => {
                                if (e.target.checked) {
                                  setNewTeamMemberIds(prev => [...prev, user.id]);
                                } else {
                                  setNewTeamMemberIds(prev => prev.filter(id => id !== user.id));
                                }
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span>@{user.username}</span>
                          </div>
                          <span className="text-[10px] uppercase text-slate-500 font-mono">({user.role})</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateTeamModal(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTeamName.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg"
                >
                  Create Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
