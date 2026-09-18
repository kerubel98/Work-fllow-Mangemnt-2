/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { User, Team, TeamTask, TeamInsight, TeamDiscussionMessage, TeamRelationship, TeamRelationshipType } from '../types';
import { 
  Users, MessageSquare, CheckSquare, Lightbulb, Plus, Send, 
  ShieldCheck, UserCheck, Briefcase, Tag, Trash2, Clock, 
  CheckCircle2, AlertCircle, Sparkles, Filter, ChevronRight, UserPlus, X, Check,
  ArrowLeft, Crown, Calendar, TrendingUp, BarChart2, Target, Flag,
  Network, GitFork, ArrowUpRight, ArrowDownLeft, Share2, Layers
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
  initialActiveTab?: 'members' | 'discussion' | 'tasks' | 'timeline' | 'dashboard' | 'insights' | 'relationships' | null;
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

  // Active sub-tab state inside Team Workspace
  const [activeTab, setActiveTab] = useState<
    'members' | 'discussion' | 'tasks' | 'timeline' | 'dashboard' | 'insights' | 'approvals' | 'grants' | 'ai-strategy' | 'relationships'
  >(
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
  const currentTeamId = currentTeam ? currentTeam.id : '';
  const teamTasks = tasks.filter(t => t.teamId === currentTeamId);
  const teamInsights = insights.filter(i => i.teamId === currentTeamId);
  const teamMessages = messages.filter(m => m.teamId === currentTeamId);

  // Users in current team
  const currentTeamMemberIds = currentTeam ? [currentTeam.managerId, ...(currentTeam.memberIds || [])] : [];
  const currentTeamUsers = users.filter(u => currentTeamMemberIds.includes(u.id));

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

  // Maker-Checker & Team Governance State
  const [pendingResolutions, setPendingResolutions] = useState<any[]>([]);
  const [teamKpis, setTeamKpis] = useState<any>(null);
  const [visibilityGrants, setVisibilityGrants] = useState<any[]>([]);
  const [aiObjectives, setAiObjectives] = useState<any[]>([]);
  const [reviewReason, setReviewReason] = useState<Record<string, string>>({});

  // Team Relationships State
  const [teamRelationships, setTeamRelationships] = useState<TeamRelationship[]>([]);
  const [isLoadingRelationships, setIsLoadingRelationships] = useState(false);
  const [showDefineRelModal, setShowDefineRelModal] = useState(false);
  const [targetTeamIdForRel, setTargetTeamIdForRel] = useState('');
  const [relType, setRelType] = useState<TeamRelationshipType>('PARENT_UNIT');
  const [relDescription, setRelDescription] = useState('');
  const [relError, setRelError] = useState<string | null>(null);
  const [isSubmittingRel, setIsSubmittingRel] = useState(false);

  // Org Hierarchy Directory View State
  const [directoryViewMode, setDirectoryViewMode] = useState<'cards' | 'hierarchy'>('cards');
  const [orgHierarchyData, setOrgHierarchyData] = useState<any>(null);
  const [isLoadingHierarchy, setIsLoadingHierarchy] = useState(false);

  // Fetch Team Relationships
  const loadTeamRelationships = React.useCallback(async () => {
    if (!currentTeamId) return;
    setIsLoadingRelationships(true);
    try {
      const res = await fetch(`/api/teams/relationships?teamId=${encodeURIComponent(currentTeamId)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setTeamRelationships(data);
        }
      }
    } catch (err: any) {
      console.warn('Failed to load team relationships:', err);
    } finally {
      setIsLoadingRelationships(false);
    }
  }, [currentTeamId]);

  // Fetch Org Hierarchy
  const loadOrgHierarchy = React.useCallback(async () => {
    setIsLoadingHierarchy(true);
    try {
      const res = await fetch('/api/teams/hierarchy');
      if (res.ok) {
        const data = await res.json();
        setOrgHierarchyData(data);
      }
    } catch (err: any) {
      console.warn('Failed to load org hierarchy:', err);
    } finally {
      setIsLoadingHierarchy(false);
    }
  }, []);

  React.useEffect(() => {
    loadTeamRelationships();
  }, [loadTeamRelationships]);

  React.useEffect(() => {
    if (directoryViewMode === 'hierarchy' || !selectedTeamId) {
      loadOrgHierarchy();
    }
  }, [directoryViewMode, selectedTeamId, loadOrgHierarchy]);

  // Handler for defining a new relationship
  const handleDefineRelationshipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTeamId || !targetTeamIdForRel || !relType) {
      setRelError('Please select a target team and relationship type.');
      return;
    }
    if (currentTeamId === targetTeamIdForRel) {
      setRelError('A team cannot define a relationship to itself.');
      return;
    }
    setIsSubmittingRel(true);
    setRelError(null);
    try {
      const res = await fetch('/api/teams/relationships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceTeamId: currentTeamId,
          targetTeamId: targetTeamIdForRel,
          relationshipType: relType,
          description: relDescription.trim() || undefined,
          createdBy: currentUser.username
        })
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to define relationship');
      }
      setShowDefineRelModal(false);
      setTargetTeamIdForRel('');
      setRelType('PARENT_UNIT');
      setRelDescription('');
      await loadTeamRelationships();
      await loadOrgHierarchy();
    } catch (err: any) {
      setRelError(err.message || 'Error defining relationship');
    } finally {
      setIsSubmittingRel(false);
    }
  };

  // Handler for deleting a relationship
  const handleDeleteRelationship = async (relId: string) => {
    if (!confirm('Are you sure you want to remove this team relationship?')) return;
    try {
      const res = await fetch(`/api/teams/relationships/${encodeURIComponent(relId)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await loadTeamRelationships();
        await loadOrgHierarchy();
      } else {
        const body = await res.json();
        alert(`Failed to delete relationship: ${body.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error deleting relationship: ${err.message}`);
    }
  };

  // Fetch Team Governance Data
  const loadGovernanceData = React.useCallback(async () => {
    try {
      const [resPending, resKpis, resGrants, resAi] = await Promise.all([
        fetch(`/api/resolutions/pending?teamId=${currentTeamId || 'team-cards'}`).then(r => r.json()),
        fetch(`/api/teams/kpis?teamId=${currentTeamId || 'team-cards'}`).then(r => r.json()),
        fetch(`/api/teams/grants?teamId=${currentTeamId || 'team-cards'}`).then(r => r.json()),
        fetch('/api/teams/ai-objectives').then(r => r.json())
      ]);

      if (Array.isArray(resPending)) setPendingResolutions(resPending);
      if (resKpis && resKpis.inflow) setTeamKpis(resKpis);
      if (Array.isArray(resGrants)) setVisibilityGrants(resGrants);
      if (Array.isArray(resAi)) setAiObjectives(resAi);
    } catch (err: any) {
      console.warn('Failed to load team governance data:', err);
    }
  }, [currentTeamId]);

  React.useEffect(() => {
    loadGovernanceData();
  }, [loadGovernanceData]);

  // Handler for reviewing a Maker-Checker proposal (Checker Approval/Rejection)
  const handleReviewProposal = async (requestId: string, action: 'APPROVE' | 'REJECT') => {
    try {
      const res = await fetch('/api/resolutions/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          checkerId: currentUser.id,
          checkerName: currentUser.username,
          checkerTeamId: currentTeamId || 'team-cards',
          action,
          rejectionReason: reviewReason[requestId] || (action === 'REJECT' ? 'Rejected by supervisor' : undefined)
        })
      });

      const body = await res.json();
      if (!res.ok) {
        alert(`Review failed: ${body.error || 'Action failed'}`);
        return;
      }

      alert(`Proposal ${action === 'APPROVE' ? 'Approved & Committed' : 'Rejected & Returned to Maker'}!`);
      loadGovernanceData();
    } catch (err: any) {
      alert(`Error reviewing proposal: ${err.message}`);
    }
  };

  // Handler for creating a new visibility grant
  const handleCreateGrant = async (targetTeamId: string, accessLevel: 'FULL' | 'PARTIAL_KPI') => {
    try {
      const res = await fetch('/api/teams/grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grantorTeamId: currentTeamId || 'team-cards',
          granteeTeamId: targetTeamId,
          accessLevel,
          grantedBy: currentUser.username
        })
      });
      if (res.ok) {
        loadGovernanceData();
      }
    } catch (err: any) {
      console.warn('Failed to grant visibility:', err);
    }
  };


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
      <div className="space-y-3.5" id="team-workspace-directory">
        {/* Top Banner */}
        <div className="bg-[#0F172B] text-white rounded-xl p-3 sm:p-3.5 shadow-sm border border-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] rounded-full font-mono font-bold uppercase tracking-wider">
                  Team Directory
                </span>
                <span className="text-slate-400 text-xs font-mono">
                  Logged in as <strong className="text-white">@{currentUser.username}</strong> ({currentUser.role})
                </span>
              </div>
              <h1 className="text-base font-bold tracking-tight text-white flex items-center space-x-2">
                <Users className="text-blue-400" size={18} />
                <span>My Teams & Workspaces</span>
              </h1>
              <p className="text-[11px] text-slate-300 max-w-2xl leading-relaxed">
                Select a team below to open its workspace. Permanent Unit Teams are managed by unit leaders, while Working Teams can be created by anyone for specific task forces.
              </p>
            </div>

            <button
              onClick={() => setShowCreateTeamModal(true)}
              className="px-3.5 py-1.5 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-mono font-bold text-xs rounded-lg flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer border border-[#155DFC]/30 shrink-0 self-start md:self-auto"
              id="create-team-directory-btn"
            >
              <Plus size={14} />
              <span>Create Team</span>
            </button>
          </div>
        </div>

        {/* Filter Bar & Directory List */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-2 border border-slate-200/90 rounded-xl shadow-2xs">
            <div className="flex items-center space-x-1 bg-slate-100/90 p-0.5 rounded-lg">
              <button
                onClick={() => setDirectoryFilter('all')}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold transition-all cursor-pointer ${
                  directoryFilter === 'all'
                    ? 'bg-[#155DFC] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Teams ({teams.length})
              </button>
              <button
                onClick={() => setDirectoryFilter('permanent')}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                  directoryFilter === 'permanent'
                    ? 'bg-[#155DFC] text-white shadow-xs'
                    : 'text-slate-600 hover:text-purple-700'
                }`}
              >
                <ShieldCheck size={12} />
                <span>Permanent Units ({permanentTeams.length})</span>
              </button>
              <button
                onClick={() => setDirectoryFilter('working')}
                className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                  directoryFilter === 'working'
                    ? 'bg-[#155DFC] text-white shadow-xs'
                    : 'text-slate-600 hover:text-emerald-700'
                }`}
              >
                <Briefcase size={12} />
                <span>Working Teams ({workingTeams.length})</span>
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1 bg-slate-100/90 p-0.5 rounded-lg">
                <button
                  onClick={() => setDirectoryViewMode('cards')}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                    directoryViewMode === 'cards'
                      ? 'bg-[#155DFC] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  id="dir-view-cards-btn"
                >
                  <Users size={12} />
                  <span>Cards Grid</span>
                </button>
                <button
                  onClick={() => setDirectoryViewMode('hierarchy')}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                    directoryViewMode === 'hierarchy'
                      ? 'bg-[#155DFC] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  id="dir-view-hierarchy-btn"
                >
                  <Network size={12} />
                  <span>Org Structure Tree</span>
                </button>
              </div>

              <p className="text-[11px] font-mono text-slate-500 px-1 hidden md:block">
                Showing <strong className="text-slate-800">{displayedTeams.length}</strong> team{displayedTeams.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {directoryViewMode === 'hierarchy' ? (
            <div className="space-y-4">
              {/* Hierarchy Summary Banner */}
              <div className="bg-[#0F172B] border border-slate-800 rounded-2xl p-4 text-white font-mono text-xs shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-[#155DFC]/20 text-blue-400 border border-[#155DFC]/30 rounded-xl">
                    <Network size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Organizational Structure & Team Graph
                    </h3>
                    <p className="text-[11px] text-slate-300 font-sans mt-0.5">
                      Hierarchical mapping of Permanent Unit Teams, child sub-units, functional squads, and inter-team operational dependencies.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-[11px]">
                  <div className="px-3 py-1.5 bg-slate-800/80 border border-slate-700/80 rounded-lg flex items-center space-x-1.5">
                    <ShieldCheck size={13} className="text-purple-400" />
                    <span>{permanentTeams.length} Permanent Units</span>
                  </div>
                  <div className="px-3 py-1.5 bg-slate-800/80 border border-slate-700/80 rounded-lg flex items-center space-x-1.5">
                    <Briefcase size={13} className="text-emerald-400" />
                    <span>{workingTeams.length} Working Squads</span>
                  </div>
                  <div className="px-3 py-1.5 bg-slate-800/80 border border-slate-700/80 rounded-lg flex items-center space-x-1.5">
                    <GitFork size={13} className="text-blue-400" />
                    <span>{orgHierarchyData?.totalRelationships || 0} Relationships</span>
                  </div>
                </div>
              </div>

              {/* Hierarchy Tree Content */}
              {isLoadingHierarchy ? (
                <div className="p-12 text-center text-slate-500 font-mono text-xs bg-white rounded-2xl border border-slate-200">
                  Loading organizational hierarchy...
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Root Permanent Units */}
                  {orgHierarchyData?.rootUnits && orgHierarchyData.rootUnits.length > 0 ? (
                    <div className="space-y-4">
                      {orgHierarchyData.rootUnits.map((rootTeam: any) => (
                        <div
                          key={rootTeam.id}
                          className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4 transition-all hover:border-blue-300"
                        >
                          {/* Unit Header */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-200 text-purple-700 flex items-center justify-center font-bold">
                                <ShieldCheck size={20} />
                              </div>
                              <div>
                                <div className="flex items-center space-x-2">
                                  <h4 className="text-sm font-bold text-slate-900 font-mono">{rootTeam.name}</h4>
                                  <span className="text-[9px] bg-purple-100 text-purple-800 border border-purple-200 font-bold px-2 py-0.5 rounded-full font-mono">
                                    Parent Unit / Department
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 font-mono">
                                  Lead: @{rootTeam.managerName} • {rootTeam.memberIds?.length || 0} members
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={() => setSelectedTeamId(rootTeam.id)}
                              className="px-3 py-1.5 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-mono font-bold text-xs rounded-lg flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer self-start sm:self-auto"
                            >
                              <span>Open Workspace</span>
                              <ChevronRight size={14} />
                            </button>
                          </div>

                          {rootTeam.description && (
                            <p className="text-xs text-slate-600 font-sans">{rootTeam.description}</p>
                          )}

                          {/* Sub-Units Under this Unit */}
                          {rootTeam.subUnits && rootTeam.subUnits.length > 0 && (
                            <div className="space-y-2 pl-4 border-l-2 border-purple-200">
                              <span className="text-[10px] uppercase font-bold text-purple-700 font-mono flex items-center space-x-1">
                                <GitFork size={12} />
                                <span>Child Sub-Units ({rootTeam.subUnits.length})</span>
                              </span>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                {rootTeam.subUnits.map((sub: any) => (
                                  <div
                                    key={sub.id}
                                    onClick={() => setSelectedTeamId(sub.team.id)}
                                    className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl hover:border-purple-300 transition-all cursor-pointer group"
                                  >
                                    <div className="flex items-start justify-between">
                                      <div>
                                        <div className="font-bold text-xs text-slate-900 group-hover:text-purple-700 font-mono">
                                          {sub.team.name}
                                        </div>
                                        <span className="text-[10px] text-slate-500 font-mono">
                                          Lead: @{sub.team.managerName}
                                        </span>
                                      </div>
                                      <span className="text-[9px] bg-purple-200/60 text-purple-800 px-1.5 py-0.5 rounded font-mono font-bold">
                                        Sub-Unit
                                      </span>
                                    </div>
                                    {sub.description && (
                                      <p className="text-[10px] text-slate-600 font-sans mt-1.5 line-clamp-1">
                                        {sub.description}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Escalation, Downstream, and Peers for this unit */}
                          {(rootTeam.escalationTargets?.length > 0 || rootTeam.downstream?.length > 0 || rootTeam.peers?.length > 0) && (
                            <div className="flex flex-wrap gap-3 pt-2 text-[11px] font-mono text-slate-600 border-t border-slate-100">
                              {rootTeam.escalationTargets?.length > 0 && (
                                <div className="flex items-center space-x-1 bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1 rounded-md">
                                  <AlertCircle size={12} className="text-amber-600" />
                                  <span>Escalates to: {rootTeam.escalationTargets.map((e: any) => e.team.name).join(', ')}</span>
                                </div>
                              )}
                              {rootTeam.downstream?.length > 0 && (
                                <div className="flex items-center space-x-1 bg-teal-50 border border-teal-200 text-teal-900 px-2 py-1 rounded-md">
                                  <ArrowDownLeft size={12} className="text-teal-600" />
                                  <span>Downstream: {rootTeam.downstream.map((d: any) => d.team.name).join(', ')}</span>
                                </div>
                              )}
                              {rootTeam.peers?.length > 0 && (
                                <div className="flex items-center space-x-1 bg-blue-50 border border-blue-200 text-blue-900 px-2 py-1 rounded-md">
                                  <Share2 size={12} className="text-blue-600" />
                                  <span>Peers: {rootTeam.peers.map((p: any) => p.team.name).join(', ')}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500 font-mono text-xs">
                      No permanent parent units configured yet. Permanent units provide structure to the hierarchy.
                    </div>
                  )}

                  {/* Working Teams Section */}
                  {orgHierarchyData?.workingTeams && orgHierarchyData.workingTeams.length > 0 && (
                    <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-5 space-y-3 font-mono">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-emerald-800 font-bold text-xs uppercase tracking-wider">
                          <Briefcase size={15} />
                          <span>Functional & Working Project Squads ({orgHierarchyData.workingTeams.length})</span>
                        </div>
                        <span className="text-[10px] text-slate-500">
                          Cross-functional teams linked to operational goals
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {orgHierarchyData.workingTeams.map((wTeam: any) => (
                          <div
                            key={wTeam.id}
                            onClick={() => setSelectedTeamId(wTeam.id)}
                            className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-emerald-400 hover:shadow-xs transition-all cursor-pointer group"
                          >
                            <div className="flex items-start justify-between">
                              <div className="font-bold text-xs text-slate-900 group-hover:text-emerald-700">
                                {wTeam.name}
                              </div>
                              <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                                Working Squad
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1 font-sans line-clamp-2">
                              {wTeam.description || 'No description'}
                            </p>
                            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                              <span>Lead: @{wTeam.managerName}</span>
                              <span className="text-blue-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center">
                                Open <ChevronRight size={12} />
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            displayedTeams.length === 0 ? (
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {displayedTeams.map(team => {
                  const isPermanent = (team.teamType || 'working') === 'permanent';
                  const isManager = team.managerId === currentUser.id;
                  const isMember = (team.memberIds || []).includes(currentUser.id);
                  const memberCount = (team.memberIds || []).length + (team.managerId ? 1 : 0);
                  const teamTaskCount = tasks.filter(t => t.teamId === team.id).length;
                  const teamInsightCount = insights.filter(i => i.teamId === team.id).length;
                  const teamMsgCount = messages.filter(m => m.teamId === team.id).length;

                  return (
                    <div
                      key={team.id}
                      onClick={() => setSelectedTeamId(team.id)}
                      className="bg-white border border-slate-200/80 hover:border-blue-400/80 rounded-2xl p-4 transition-all hover:shadow-md cursor-pointer flex flex-col justify-between space-y-3 group"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 font-mono transition-colors">
                              {team.name}
                            </h3>
                            <span className="text-[10px] text-slate-500 font-mono block">
                              Lead: @{team.managerName}
                            </span>
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
            )
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
    <div className="space-y-3" id="team-workspace-container">
      
      {/* Top Action Bar: Back to All Teams & Create Team Aligned Horizontally */}
      <div className="flex items-center justify-between gap-3 font-mono">
        <button
          onClick={() => setSelectedTeamId(null)}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-bold transition-all cursor-pointer border border-slate-700/80 shadow-xs"
          id="back-to-all-teams-btn"
        >
          <ArrowLeft size={13} />
          <span>Back to All Teams</span>
        </button>

        <button
          onClick={() => setShowCreateTeamModal(true)}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-bold text-xs rounded-lg transition-all shadow-xs cursor-pointer border border-[#155DFC]/30"
          id="create-my-own-team-btn"
        >
          <Plus size={14} />
          <span>Create Team</span>
        </button>
      </div>

      {/* Team Header Banner */}
      <div className="bg-[#0F172B] text-white rounded-xl p-3 sm:p-3.5 shadow-sm border border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] rounded-full font-mono font-bold uppercase tracking-wider">
              Team Collaboration Core
            </span>
            <span className="text-slate-400 text-xs font-mono">
              Logged in as <strong className="text-white">@{currentUser.username}</strong> ({currentUser.role})
            </span>
          </div>
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <h1 className="text-base font-bold tracking-tight text-white flex items-center space-x-2">
              <Users className="text-blue-400" size={18} />
              <span>{currentTeam.name}</span>
            </h1>
            {(currentTeam.teamType || 'working') === 'permanent' ? (
              <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-400/40 font-bold px-2 py-0.5 rounded-full font-mono flex items-center space-x-1">
                <ShieldCheck size={11} />
                <span>Permanent Unit Team</span>
              </span>
            ) : (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-bold px-2 py-0.5 rounded-full font-mono flex items-center space-x-1">
                <Briefcase size={11} />
                <span>Working Team</span>
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-300 max-w-2xl leading-relaxed">
            {currentTeam.description || 'Collaborate with team members, share operational tasks, communicate in real time, and share database query insights.'}
          </p>
        </div>

        {/* Navigation Sub-Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2.5 mt-2 border-t border-slate-800/80 text-xs font-mono">
          <button
            onClick={() => setActiveTab('members')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'members'
                ? 'bg-[#155DFC] text-white font-bold shadow-xs'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <Users size={14} />
            <span>Team Members</span>
            <span className="ml-1 text-[10px] bg-[#0F172B]/60 text-white px-1.5 py-0.2 rounded-full font-mono">
              {currentTeamMemberIds.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('discussion')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'discussion'
                ? 'bg-[#155DFC] text-white font-bold shadow-xs'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <MessageSquare size={14} />
            <span>Team Discussion</span>
            <span className="ml-1 text-[10px] bg-[#0F172B]/60 text-white px-1.5 py-0.2 rounded-full font-mono">
              {teamMessages.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('tasks')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'tasks'
                ? 'bg-[#155DFC] text-white font-bold shadow-xs'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <CheckSquare size={14} />
            <span>Shared Tasks</span>
            <span className="ml-1 text-[10px] bg-[#0F172B]/60 text-white px-1.5 py-0.2 rounded-full font-mono">
              {teamTasks.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'timeline'
                ? 'bg-[#155DFC] text-white font-bold shadow-xs'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <Calendar size={14} />
            <span>Timeline & Roadmap</span>
          </button>

          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-[#155DFC] text-white font-bold shadow-xs'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <BarChart2 size={14} />
            <span>Lead Follow-Up Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('insights')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'insights'
                ? 'bg-[#155DFC] text-white font-bold shadow-xs'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <Lightbulb size={14} />
            <span>Shared Insights</span>
            <span className="ml-1 text-[10px] bg-[#0F172B]/60 text-white px-1.5 py-0.2 rounded-full font-mono">
              {teamInsights.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('approvals')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'approvals'
                ? 'bg-[#155DFC] text-white font-bold shadow-xs'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <ShieldCheck size={14} />
            <span>Maker-Checker Approvals</span>
            <span className="ml-1 text-[10px] bg-[#0F172B]/60 text-white px-1.5 py-0.2 rounded-full font-mono">
              {pendingResolutions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('grants')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'grants'
                ? 'bg-[#155DFC] text-white font-bold shadow-xs'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <Users size={14} />
            <span>Cross-Team Visibility</span>
            <span className="ml-1 text-[10px] bg-[#0F172B]/60 text-white px-1.5 py-0.2 rounded-full font-mono">
              {visibilityGrants.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ai-strategy')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'ai-strategy'
                ? 'bg-[#155DFC] text-white font-bold shadow-xs'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <Sparkles size={14} />
            <span>AI Strategic Objectives</span>
            <span className="ml-1 text-[10px] bg-[#0F172B]/60 text-white px-1.5 py-0.2 rounded-full font-mono">
              {aiObjectives.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('relationships')}
            className={`px-2.5 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer ${
              activeTab === 'relationships'
                ? 'bg-[#155DFC] text-white font-bold shadow-xs'
                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-300'
            }`}
            id="tab-team-relationships-btn"
          >
            <Network size={14} />
            <span>Org Structure & Relationships</span>
            <span className="ml-1 text-[10px] bg-[#0F172B]/60 text-white px-1.5 py-0.2 rounded-full font-mono">
              {teamRelationships.length}
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

      {/* TAB 7: MAKER-CHECKER DUAL AUTHORIZATION APPROVALS QUEUE */}
      {activeTab === 'approvals' && (
        <div className="space-y-5 font-mono text-xs">
          <div className="bg-purple-950 border border-purple-900 rounded-2xl p-5 text-white space-y-2 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-xl">
                <ShieldCheck size={22} />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold tracking-tight text-white uppercase">
                    Maker-Checker Resolution Review Queue
                  </h3>
                  <span className="text-[9px] bg-purple-500/20 text-purple-300 border border-purple-400/40 px-2 py-0.5 rounded-full font-bold">
                    Four-Eyes Principle
                  </span>
                </div>
                <p className="text-[11px] text-purple-200 font-sans mt-0.5">
                  Supervisor approval queue for flagged transaction discrepancy resolutions. Dual authorization prevents self-approval.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs flex items-center gap-2">
              <ShieldCheck className="text-purple-600" size={16} />
              <span>Pending Review Proposals ({pendingResolutions.length})</span>
            </h4>

            {pendingResolutions.length === 0 ? (
              <div className="p-10 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <ShieldCheck size={36} className="mx-auto text-slate-300" />
                <h5 className="font-bold text-slate-700">No pending approval requests</h5>
                <p className="text-[11px] text-slate-500">All resolution proposals have been reviewed and processed.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingResolutions.map((proposal) => {
                  const isSelfMaker = proposal.makerId === currentUser.id;
                  return (
                    <div key={proposal.id} className="p-4 bg-slate-50 border border-purple-200 rounded-xl space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-800 font-bold rounded text-[10px]">
                            {proposal.proposedAction}
                          </span>
                          <span className="text-slate-800 font-bold">Task: {proposal.taskId}</span>
                          <span className="text-slate-500 text-[10px]">Txn: {proposal.transactionId}</span>
                        </div>
                        <span className="text-slate-400 text-[10px]">
                          Submitted: {new Date(proposal.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-700">
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase font-bold block">Maker Analyst</span>
                          <span className="font-bold text-slate-900">@{proposal.makerName}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase font-bold block">Proposed Status</span>
                          <span className="font-bold text-emerald-700">{proposal.proposedStatus}</span>
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-slate-200 text-slate-800">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Justification Note</span>
                        <p className="text-xs font-sans whitespace-pre-wrap">{proposal.justificationNote}</p>
                      </div>

                      {/* Anti-Self-Approval Enforcement Warning */}
                      {isSelfMaker ? (
                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] flex items-center gap-2">
                          <AlertCircle size={14} className="text-amber-600 shrink-0" />
                          <span>Anti-Self-Approval Enforcement: You are the Maker of this proposal and cannot approve your own submission.</span>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-200">
                          <input
                            type="text"
                            placeholder="Optional feedback / rejection reason..."
                            value={reviewReason[proposal.id] || ''}
                            onChange={(e) => setReviewReason(prev => ({ ...prev, [proposal.id]: e.target.value }))}
                            className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                          />
                          <div className="flex items-center space-x-2 shrink-0">
                            <button
                              onClick={() => handleReviewProposal(proposal.id, 'REJECT')}
                              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg font-bold transition cursor-pointer"
                            >
                              Reject Proposal
                            </button>
                            <button
                              onClick={() => handleReviewProposal(proposal.id, 'APPROVE')}
                              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition shadow-2xs cursor-pointer flex items-center space-x-1"
                            >
                              <CheckCircle2 size={13} />
                              <span>Approve & Commit</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 8: CROSS-TEAM VISIBILITY GRANTS */}
      {activeTab === 'grants' && (
        <div className="space-y-5 font-mono text-xs">
          <div className="bg-indigo-950 border border-indigo-900 rounded-2xl p-5 text-white space-y-2 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
                <Users size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight text-white uppercase">
                  Cross-Team Visibility & KPI Sharing
                </h3>
                <p className="text-[11px] text-indigo-200 font-sans mt-0.5">
                  Manage partial (KPI-only) or full dashboard access grants shared with other department teams.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs">Active Access Grants</h4>
              <button
                onClick={() => {
                  const target = prompt('Enter Team ID to grant access (e.g. team-audit, team-cbs):');
                  if (target) handleCreateGrant(target, 'PARTIAL_KPI');
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition cursor-pointer"
              >
                + Grant Visibility to Team
              </button>
            </div>

            {visibilityGrants.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl text-slate-500">
                No cross-team dashboard visibility grants configured yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {visibilityGrants.map(grant => (
                  <div key={grant.id} className="py-3 flex items-center justify-between text-slate-800">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold">Grantor: {grant.grantorTeamId}</span>
                        <span>→</span>
                        <span className="font-bold text-indigo-700">Grantee: {grant.granteeTeamId}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 block">Granted by @{grant.grantedBy} on {new Date(grant.createdAt).toLocaleDateString()}</span>
                    </div>
                    <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 font-bold rounded text-[10px]">
                      {grant.accessLevel}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 9: AI STRATEGIC OBJECTIVES */}
      {activeTab === 'ai-strategy' && (
        <div className="space-y-5 font-mono text-xs">
          <div className="bg-emerald-950 border border-emerald-900 rounded-2xl p-5 text-white space-y-2 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl">
                <Sparkles size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight text-white uppercase">
                  AI Strategic Alignment Scaffolding
                </h3>
                <p className="text-[11px] text-emerald-200 font-sans mt-0.5">
                  Monitors organizational strategy document objectives against live team task resolution velocity.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aiObjectives.map(obj => (
              <div key={obj.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-slate-900 text-xs">{obj.title}</h4>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px]">
                    {obj.targetMetric}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-sans">{obj.description}</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                    <span>Progress</span>
                    <span>{obj.currentValue} / {obj.targetValue}</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full rounded-full"
                      style={{ width: `${Math.min(100, (obj.currentValue / Math.max(1, obj.targetValue)) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-1.5 flex-wrap pt-1">
                  {obj.linkedHashtags?.map((tag: string, idx: number) => (
                    <span key={idx} className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[9px] font-bold">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 10: ORG STRUCTURE & TEAM RELATIONSHIPS */}
      {activeTab === 'relationships' && (
        <div className="space-y-4" id="team-relationships-panel">
          {/* Header Card */}
          <div className="bg-[#0F172B] border border-slate-800 rounded-2xl p-4 text-white font-mono text-xs shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-[#155DFC]/20 text-blue-400 border border-[#155DFC]/30 rounded-xl">
                <Network size={20} />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    {currentTeam?.name} — Org Structure & Inter-Team Relationships
                  </h3>
                  {(currentTeam?.teamType || 'working') === 'permanent' ? (
                    <span className="text-[9px] bg-purple-500/20 text-purple-300 border border-purple-400/40 font-bold px-2 py-0.5 rounded-full font-mono flex items-center space-x-1">
                      <ShieldCheck size={10} />
                      <span>Permanent Unit</span>
                    </span>
                  ) : (
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 font-bold px-2 py-0.5 rounded-full font-mono flex items-center space-x-1">
                      <Briefcase size={10} />
                      <span>Working Team</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 font-sans">
                  {(currentTeam?.teamType || 'working') === 'permanent'
                    ? 'Permanent teams represent core organizational departments. Define hierarchical reporting, subordinate units, escalation targets, and operational data dependencies.'
                    : 'Working teams represent project-based squads. Define which department you report into, lateral peers, upstream data sources, and settlement consumers.'}
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setTargetTeamIdForRel('');
                setRelType('PARENT_UNIT');
                setRelDescription('');
                setRelError(null);
                setShowDefineRelModal(true);
              }}
              className="px-3.5 py-1.5 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-mono font-bold text-xs rounded-lg flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer border border-[#155DFC]/30 shrink-0 self-start md:self-auto"
              id="define-relationship-btn"
            >
              <Plus size={14} />
              <span>Define Relationship</span>
            </button>
          </div>

          {/* Quick Stats Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
            {/* Hierarchy Links */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase">
                <span>Hierarchy Links</span>
                <GitFork size={13} className="text-purple-600" />
              </div>
              <div className="text-lg font-bold text-slate-900">
                {teamRelationships.filter(r => r.relationshipType === 'PARENT_UNIT' || r.relationshipType === 'SUB_UNIT').length}
              </div>
              <p className="text-[10px] text-slate-400">Parent & Sub-Units</p>
            </div>

            {/* Escalations & Audits */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase">
                <span>Escalation / Audit</span>
                <AlertCircle size={13} className="text-amber-600" />
              </div>
              <div className="text-lg font-bold text-slate-900">
                {teamRelationships.filter(r => r.relationshipType === 'ESCALATION_TARGET' || r.relationshipType === 'AUDIT_COMPLIANCE_REVIEWER').length}
              </div>
              <p className="text-[10px] text-slate-400">Disputes & Oversight</p>
            </div>

            {/* Pipeline Dataflow */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase">
                <span>Data Pipelines</span>
                <Layers size={13} className="text-teal-600" />
              </div>
              <div className="text-lg font-bold text-slate-900">
                {teamRelationships.filter(r => r.relationshipType === 'UPSTREAM_PROVIDER' || r.relationshipType === 'DOWNSTREAM_CONSUMER').length}
              </div>
              <p className="text-[10px] text-slate-400">Upstream / Downstream</p>
            </div>

            {/* Peer Collaborators */}
            <div className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-slate-500 text-[10px] font-bold uppercase">
                <span>Peer Units</span>
                <Share2 size={13} className="text-blue-600" />
              </div>
              <div className="text-lg font-bold text-slate-900">
                {teamRelationships.filter(r => r.relationshipType === 'PEER_COLLABORATOR').length}
              </div>
              <p className="text-[10px] text-slate-400">Lateral Collaborators</p>
            </div>
          </div>

          {/* Relationship List */}
          {isLoadingRelationships ? (
            <div className="p-12 text-center text-slate-500 font-mono text-xs bg-white rounded-2xl border border-slate-200">
              Loading team relationships...
            </div>
          ) : teamRelationships.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3 shadow-sm font-mono">
              <div className="w-12 h-12 bg-blue-50 text-[#155DFC] rounded-full flex items-center justify-center mx-auto">
                <Network size={22} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-800">No Inter-Team Relationships Defined Yet</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto font-sans">
                  Define your team's parent department, subordinate units, escalation targets, or pipeline dataflow links to integrate into the organizational structure.
                </p>
              </div>
              <button
                onClick={() => {
                  setTargetTeamIdForRel('');
                  setRelType('PARENT_UNIT');
                  setRelDescription('');
                  setRelError(null);
                  setShowDefineRelModal(true);
                }}
                className="px-4 py-2 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white font-bold text-xs rounded-xl inline-flex items-center space-x-2 transition-all cursor-pointer shadow-xs"
              >
                <Plus size={14} />
                <span>Define First Relationship</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {teamRelationships.map(rel => {
                const isSource = rel.sourceTeamId === currentTeamId;
                const otherTeamId = isSource ? rel.targetTeamId : rel.sourceTeamId;
                const otherTeamName = isSource ? (rel.targetTeamName || 'Unknown Team') : (rel.sourceTeamName || 'Unknown Team');
                const otherTeamType = isSource ? rel.targetTeamType : rel.sourceTeamType;
                const otherTeam = teams.find(t => t.id === otherTeamId);

                // Badge styling & icon per relationship type
                let typeBadgeBg = 'bg-blue-100 text-blue-800 border-blue-200';
                let typeLabel = 'Peer Collaborator';
                let typeIcon = <Share2 size={13} className="text-blue-600" />;

                if (rel.relationshipType === 'PARENT_UNIT') {
                  typeBadgeBg = 'bg-purple-100 text-purple-900 border-purple-300';
                  typeLabel = isSource ? 'Parent Department / Unit' : 'Subordinate Child Unit';
                  typeIcon = <ShieldCheck size={13} className="text-purple-600" />;
                } else if (rel.relationshipType === 'SUB_UNIT') {
                  typeBadgeBg = 'bg-indigo-100 text-indigo-900 border-indigo-300';
                  typeLabel = isSource ? 'Subordinate Sub-Unit' : 'Parent Department';
                  typeIcon = <GitFork size={13} className="text-indigo-600" />;
                } else if (rel.relationshipType === 'ESCALATION_TARGET') {
                  typeBadgeBg = 'bg-amber-100 text-amber-900 border-amber-300';
                  typeLabel = isSource ? 'Escalation Target' : 'Escalation Source';
                  typeIcon = <AlertCircle size={13} className="text-amber-600" />;
                } else if (rel.relationshipType === 'AUDIT_COMPLIANCE_REVIEWER') {
                  typeBadgeBg = 'bg-violet-100 text-violet-900 border-violet-300';
                  typeLabel = isSource ? 'Audit & Compliance Reviewer' : 'Audited Unit';
                  typeIcon = <ShieldCheck size={13} className="text-violet-600" />;
                } else if (rel.relationshipType === 'UPSTREAM_PROVIDER') {
                  typeBadgeBg = 'bg-cyan-100 text-cyan-900 border-cyan-300';
                  typeLabel = isSource ? 'Upstream Batch Provider' : 'Downstream Consumer';
                  typeIcon = <ArrowUpRight size={13} className="text-cyan-600" />;
                } else if (rel.relationshipType === 'DOWNSTREAM_CONSUMER') {
                  typeBadgeBg = 'bg-teal-100 text-teal-900 border-teal-300';
                  typeLabel = isSource ? 'Downstream Settlement Consumer' : 'Upstream Provider';
                  typeIcon = <ArrowDownLeft size={13} className="text-teal-600" />;
                }

                return (
                  <div
                    key={rel.id}
                    className="bg-white border border-slate-200/90 hover:border-blue-300 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2.5">
                      {/* Top Row: Type Badge & Direction */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border font-mono flex items-center space-x-1 ${typeBadgeBg}`}>
                            {typeIcon}
                            <span>{typeLabel}</span>
                          </span>
                          <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {isSource ? 'Outgoing Link' : 'Incoming Link'}
                          </span>
                        </div>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDeleteRelationship(rel.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Remove relationship"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Connected Team Info */}
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <button
                            onClick={() => setSelectedTeamId(otherTeamId)}
                            className="font-bold text-sm text-slate-900 hover:text-[#155DFC] font-mono transition-colors flex items-center space-x-1 text-left"
                          >
                            <span>{otherTeamName}</span>
                            <ChevronRight size={14} className="text-slate-400" />
                          </button>
                          <span className="text-[10px] text-slate-500 font-mono block">
                            {otherTeam ? `Lead: @${otherTeam.managerName} • ${otherTeam.memberIds?.length || 0} members` : 'Connected Team'}
                          </span>
                        </div>

                        {(otherTeamType || otherTeam?.teamType || 'working') === 'permanent' ? (
                          <span className="text-[9px] bg-purple-100 text-purple-800 border border-purple-200 font-bold px-2 py-0.5 rounded-full font-mono flex items-center space-x-1 shrink-0">
                            <ShieldCheck size={10} />
                            <span>Permanent Unit</span>
                          </span>
                        ) : (
                          <span className="text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold px-2 py-0.5 rounded-full font-mono flex items-center space-x-1 shrink-0">
                            <Briefcase size={10} />
                            <span>Working Team</span>
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      {rel.description ? (
                        <p className="text-xs text-slate-600 font-sans leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          {rel.description}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic font-sans">
                          No specific SLA or context notes provided.
                        </p>
                      )}
                    </div>

                    {/* Footer / Meta */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>By @{rel.createdBy || 'system'}</span>
                      <span>{new Date(rel.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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

      {/* MODAL: DEFINE RELATIONSHIP */}
      {showDefineRelModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Network size={18} className="text-[#155DFC]" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Define Inter-Team Relationship</h3>
                  <p className="text-[10px] text-slate-500">
                    Connecting <strong className="text-slate-800">{currentTeam?.name}</strong> to another operational unit.
                  </p>
                </div>
              </div>
              <button onClick={() => setShowDefineRelModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            {relError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2 rounded-lg text-[11px] flex items-center space-x-2">
                <AlertCircle size={14} className="shrink-0 text-rose-600" />
                <span>{relError}</span>
              </div>
            )}

            <form onSubmit={handleDefineRelationshipSubmit} className="space-y-4">
              {/* Target Team Selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Target Team *
                </label>
                <select
                  required
                  value={targetTeamIdForRel}
                  onChange={e => setTargetTeamIdForRel(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs"
                >
                  <option value="">-- Select Target Team --</option>
                  {teams
                    .filter(t => t.id !== currentTeamId)
                    .map(t => {
                      const isPerm = (t.teamType || 'working') === 'permanent';
                      return (
                        <option key={t.id} value={t.id}>
                          {t.name} [{isPerm ? 'Permanent Unit' : 'Working Squad'}] (Lead: @{t.managerName})
                        </option>
                      );
                    })}
                </select>
              </div>

              {/* Relationship Type Selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1.5">
                  Relationship Type *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                  {[
                    {
                      type: 'PARENT_UNIT',
                      label: 'Parent Department',
                      desc: 'Target is our parent division / department unit in the organizational hierarchy.',
                      icon: ShieldCheck,
                      color: 'text-purple-700'
                    },
                    {
                      type: 'SUB_UNIT',
                      label: 'Child Sub-Unit',
                      desc: 'Target is a subordinate operational unit operating under this team.',
                      icon: GitFork,
                      color: 'text-indigo-700'
                    },
                    {
                      type: 'ESCALATION_TARGET',
                      label: 'Escalation Target',
                      desc: 'Target team handles escalated disputes, transaction exceptions & variances.',
                      icon: AlertCircle,
                      color: 'text-amber-700'
                    },
                    {
                      type: 'PEER_COLLABORATOR',
                      label: 'Peer Collaborator',
                      desc: 'Lateral operational partner for dual-control maker-checker & daily reconciliation.',
                      icon: Share2,
                      color: 'text-blue-700'
                    },
                    {
                      type: 'UPSTREAM_PROVIDER',
                      label: 'Upstream Batch Provider',
                      desc: 'Target team produces or imports raw transaction batches consumed by this team.',
                      icon: ArrowUpRight,
                      color: 'text-cyan-700'
                    },
                    {
                      type: 'DOWNSTREAM_CONSUMER',
                      label: 'Downstream Consumer',
                      desc: 'Target team consumes our validated settlement feeds & reconciliation sign-offs.',
                      icon: ArrowDownLeft,
                      color: 'text-teal-700'
                    },
                    {
                      type: 'AUDIT_COMPLIANCE_REVIEWER',
                      label: 'Compliance Reviewer',
                      desc: 'Target team performs independent regulatory audit and compliance verification.',
                      icon: ShieldCheck,
                      color: 'text-violet-700'
                    }
                  ].map(opt => {
                    const isSelected = relType === opt.type;
                    const IconComp = opt.icon;
                    return (
                      <div
                        key={opt.type}
                        onClick={() => setRelType(opt.type as TeamRelationshipType)}
                        className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-blue-50/90 border-[#155DFC] ring-1 ring-[#155DFC]'
                            : 'bg-slate-50/80 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center space-x-1.5 font-bold text-xs mb-0.5">
                          <IconComp size={13} className={opt.color} />
                          <span className={isSelected ? 'text-[#155DFC]' : 'text-slate-800'}>{opt.label}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-sans leading-tight">
                          {opt.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Description / Notes */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Operational Context / SLA Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Daily settlement batches handed over by 18:00 UTC; escalations reviewed within 4 hours..."
                  value={relDescription}
                  onChange={e => setRelDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDefineRelModal(false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!targetTeamIdForRel || isSubmittingRel}
                  className="px-4 py-2 bg-[#155DFC] hover:bg-[#155DFC]/90 disabled:opacity-50 text-white font-bold rounded-lg transition-all shadow-xs cursor-pointer"
                >
                  {isSubmittingRel ? 'Saving...' : 'Save Relationship'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
