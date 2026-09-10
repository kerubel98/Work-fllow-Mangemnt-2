/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Issue, HashtagPreset, User, Team, IssueStatus, IssuePriority } from '../types';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell } from 'recharts';
import { 
  TrendingUp, CheckCircle, Shield, FileSpreadsheet, Percent, Clock, 
  Users, UserPlus, Plus, Trash2, UserX, Layers, Info, X, ShieldAlert,
  Briefcase, Check, Search, Filter, CheckSquare, ArrowUpRight, CheckCircle2,
  ListTodo, UserCheck, LayoutDashboard, SlidersHorizontal, RefreshCw, AlertCircle
} from 'lucide-react';

interface ManagerialDashboardProps {
  issues: Issue[];
  hashtags: HashtagPreset[];
  currentUser: User;
  users?: User[];
  teams?: Team[];
  onCreateTeam?: (team: Omit<Team, 'id' | 'createdAt'>) => void;
  onUpdateTeam?: (id: string, updates: Partial<Team>) => void;
  onDeleteTeam?: (id: string) => void;
  onUpdateIssue?: (issueId: string, updatedFields: Partial<Issue>) => void;
  onChangeTab?: (tab: string) => void;
}

export default function ManagerialDashboard({ 
  issues, 
  hashtags,
  currentUser,
  users = [],
  teams = [],
  onCreateTeam,
  onUpdateTeam,
  onDeleteTeam,
  onUpdateIssue,
  onChangeTab
}: ManagerialDashboardProps) {

  // Task List Filter & Scope States
  const [dashboardTaskScope, setDashboardTaskScope] = useState<'MY_ASSIGNED' | 'MY_CREATED' | 'ALL'>('MY_ASSIGNED');
  const [taskSearchTerm, setTaskSearchTerm] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<'ALL' | 'Open' | 'Investigating' | 'Resolved' | 'Closed'>('ALL');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<'ALL' | 'Low' | 'Medium' | 'High' | 'Critical'>('ALL');

  // Team management state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  
  // Member adder state for existing teams
  const [addingToTeamId, setAddingToTeamId] = useState<string | null>(null);
  const [userToAdd, setUserToAdd] = useState<string>('');

  // 1. Teams logic
  const myTeams = teams.filter(t => t.managerId === currentUser.id || t.memberIds.includes(currentUser.id));

  const myTeamMemberIds = new Set<string>([
    currentUser.id,
    ...myTeams.flatMap(t => t.memberIds)
  ]);

  const teamMemberUsers = users.filter(u => myTeamMemberIds.has(u.id));

  const getAvailableUsersForTeam = (team: Team) => {
    return users.filter(u => !team.memberIds.includes(u.id) && u.id !== currentUser.id);
  };

  const availableUsersForNewTeam = users.filter(u => u.id !== currentUser.id);

  // 2. Task Progress Calculations
  // Tasks Assigned to Current User
  const myAssignedTasks = issues.filter(i => i.assignedTechUserId === currentUser.id);
  const myAssignedTotal = myAssignedTasks.length;
  const myAssignedResolved = myAssignedTasks.filter(i => i.status === 'Resolved' || i.status === 'Closed').length;
  const myAssignedProgress = myAssignedTotal > 0 ? Math.round((myAssignedResolved / myAssignedTotal) * 100) : 0;
  const myAssignedOpen = myAssignedTasks.filter(i => i.status === 'Open').length;
  const myAssignedInvestigating = myAssignedTasks.filter(i => i.status === 'Investigating').length;

  // Tasks Created by Current User
  const myCreatedTasks = issues.filter(i => i.creatorId === currentUser.id);
  const myCreatedTotal = myCreatedTasks.length;
  const myCreatedResolved = myCreatedTasks.filter(i => i.status === 'Resolved' || i.status === 'Closed').length;
  const myCreatedProgress = myCreatedTotal > 0 ? Math.round((myCreatedResolved / myCreatedTotal) * 100) : 0;
  const myCreatedOpen = myCreatedTasks.filter(i => i.status === 'Open').length;
  const myCreatedInvestigating = myCreatedTasks.filter(i => i.status === 'Investigating').length;

  // Overall Workspace Tasks
  const totalIssues = issues.length;
  const openIssues = issues.filter(i => i.status === 'Open').length;
  const investigatingIssues = issues.filter(i => i.status === 'Investigating').length;
  const resolvedIssues = issues.filter(i => i.status === 'Resolved' || i.status === 'Closed').length;
  const resolutionRate = totalIssues > 0 ? Math.round((resolvedIssues / totalIssues) * 100) : 0;

  // Filtered Tasks for Task Management Ledger
  const filteredDashboardTasks = issues.filter(issue => {
    let matchesScope = true;
    if (dashboardTaskScope === 'MY_ASSIGNED') {
      matchesScope = issue.assignedTechUserId === currentUser.id;
    } else if (dashboardTaskScope === 'MY_CREATED') {
      matchesScope = issue.creatorId === currentUser.id;
    }

    const matchesSearch = issue.title.toLowerCase().includes(taskSearchTerm.toLowerCase()) ||
                          issue.id.toLowerCase().includes(taskSearchTerm.toLowerCase()) ||
                          (issue.linkedHashtag && issue.linkedHashtag.toLowerCase().includes(taskSearchTerm.toLowerCase())) ||
                          (issue.creatorName && issue.creatorName.toLowerCase().includes(taskSearchTerm.toLowerCase()));

    const matchesStatus = taskStatusFilter === 'ALL' ? true : issue.status === taskStatusFilter;
    const matchesPriority = taskPriorityFilter === 'ALL' ? true : issue.priority === taskPriorityFilter;

    return matchesScope && matchesSearch && matchesStatus && matchesPriority;
  });

  // 3. Prepare Recharts time series data
  const timeSeriesData = [
    { day: 'Mon', Raised: 2, Resolved: 1 },
    { day: 'Tue', Raised: 4, Resolved: 3 },
    { day: 'Wed', Raised: 1, Resolved: 2 },
    { day: 'Thu', Raised: 5, Resolved: 4 },
    { day: 'Fri', Raised: 3, Resolved: 2 },
    { day: 'Sat', Raised: openIssues + investigatingIssues, Resolved: resolvedIssues },
  ];

  // 4. Priority distribution data
  const priorityCount = { Low: 0, Medium: 0, High: 0, Critical: 0 };
  issues.forEach(i => {
    priorityCount[i.priority] = (priorityCount[i.priority] || 0) + 1;
  });

  const priorityData = [
    { name: 'Low', count: priorityCount.Low, color: '#94a3b8' },
    { name: 'Medium', count: priorityCount.Medium, color: '#3b82f6' },
    { name: 'High', count: priorityCount.High, color: '#f59e0b' },
    { name: 'Critical', count: priorityCount.Critical, color: '#ef4444' },
  ].filter(p => p.count > 0);

  // 5. SQL Audit log of executed fixes
  const executedFixes = issues.filter(i => i.solutionExecuted && i.solutionScript);

  // Handlers for Team actions
  const handleCreateTeamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;

    if (onCreateTeam) {
      onCreateTeam({
        name: newTeamName.trim(),
        description: newTeamDesc.trim() || 'Operational Team',
        managerId: currentUser.id,
        managerName: currentUser.username,
        memberIds: selectedMemberIds
      });
    }

    setNewTeamName('');
    setNewTeamDesc('');
    setSelectedMemberIds([]);
    setShowCreateModal(false);
  };

  const handleAddMemberToTeam = (team: Team) => {
    if (!userToAdd || !onUpdateTeam) return;
    const updatedMembers = Array.from(new Set([...team.memberIds, userToAdd]));
    onUpdateTeam(team.id, { memberIds: updatedMembers });
    setAddingToTeamId(null);
    setUserToAdd('');
  };

  const handleRemoveMemberFromTeam = (team: Team, memberId: string) => {
    if (!onUpdateTeam) return;
    const updatedMembers = team.memberIds.filter(id => id !== memberId);
    onUpdateTeam(team.id, { memberIds: updatedMembers });
  };

  const toggleNewTeamMemberSelection = (userId: string) => {
    setSelectedMemberIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleExportMetrics = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Case ID,Title,Priority,Status,Creator,Created At,Resolved At\n"
      + issues.map(i => `${i.id},"${i.title.replace(/"/g, '""')}",${i.priority},${i.status},${i.creatorName},${i.createdAt},${i.solutionExecutedAt || 'N/A'}`).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `dashboard_metrics_report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getTaskProgressPercent = (status: IssueStatus) => {
    switch (status) {
      case 'Resolved':
      case 'Closed':
        return 100;
      case 'Investigating':
        return 50;
      case 'Open':
      default:
        return 15;
    }
  };

  return (
    <div className="space-y-6" id="dashboard-view">
      
      {/* Dashboard Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white rounded-2xl p-5 shadow-sm border border-slate-700/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-400/30 mt-0.5 shrink-0">
              <LayoutDashboard size={22} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-widest text-blue-400 font-mono">Unified Operational Level Active</span>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full font-mono font-medium">
                  Full Administrative Access
                </span>
              </div>
              <h2 className="text-base font-bold text-white mt-1">Operational & Task Dashboard</h2>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed max-w-3xl">
                All users operate at an equal level with full privileges. Track task completion progress, monitor tasks assigned to you or created by you, manage operational teams, and execute database fixes.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
              id="btn-create-team-dashboard"
            >
              <Plus size={15} />
              <span>Create Team</span>
            </button>
            {onChangeTab && (
              <button
                onClick={() => onChangeTab('workspace')}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium rounded-xl flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
              >
                <ArrowUpRight size={15} />
                <span>Go to Workspace</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Task Progress KPI Cards Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Card 1: Tasks Assigned to Me */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-3 shadow-sm hover:border-blue-300 transition-all">
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-2.5">
              <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                <CheckSquare size={18} />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">My Task Assignment</span>
                <h4 className="text-sm font-bold text-slate-900">Assigned To Me</h4>
              </div>
            </div>
            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {myAssignedProgress}% Done
            </span>
          </div>

          <div>
            <div className="flex justify-between items-baseline mb-1 font-mono text-xs">
              <span className="text-slate-500 text-[11px]">Resolution Progress</span>
              <span className="font-bold text-slate-800">{myAssignedResolved} / {myAssignedTotal} Resolved</span>
            </div>
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${myAssignedProgress}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 pt-1 text-[10px] font-mono text-center">
            <div className="bg-amber-50 text-amber-800 border border-amber-100 p-1.5 rounded-lg">
              <span className="block font-bold text-xs">{myAssignedOpen}</span>
              <span className="text-slate-500">Open</span>
            </div>
            <div className="bg-sky-50 text-sky-800 border border-sky-100 p-1.5 rounded-lg">
              <span className="block font-bold text-xs">{myAssignedInvestigating}</span>
              <span className="text-slate-500">In Progress</span>
            </div>
            <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 p-1.5 rounded-lg">
              <span className="block font-bold text-xs">{myAssignedResolved}</span>
              <span className="text-slate-500">Resolved</span>
            </div>
          </div>
        </div>

        {/* Card 2: Tasks Created by Me */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-3 shadow-sm hover:border-emerald-300 transition-all">
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-2.5">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
                <UserCheck size={18} />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">My Submitted Tasks</span>
                <h4 className="text-sm font-bold text-slate-900">Created By Me</h4>
              </div>
            </div>
            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              {myCreatedProgress}% Done
            </span>
          </div>

          <div>
            <div className="flex justify-between items-baseline mb-1 font-mono text-xs">
              <span className="text-slate-500 text-[11px]">Resolution Progress</span>
              <span className="font-bold text-slate-800">{myCreatedResolved} / {myCreatedTotal} Resolved</span>
            </div>
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-emerald-500 to-teal-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${myCreatedProgress}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 pt-1 text-[10px] font-mono text-center">
            <div className="bg-amber-50 text-amber-800 border border-amber-100 p-1.5 rounded-lg">
              <span className="block font-bold text-xs">{myCreatedOpen}</span>
              <span className="text-slate-500">Open</span>
            </div>
            <div className="bg-sky-50 text-sky-800 border border-sky-100 p-1.5 rounded-lg">
              <span className="block font-bold text-xs">{myCreatedInvestigating}</span>
              <span className="text-slate-500">In Progress</span>
            </div>
            <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 p-1.5 rounded-lg">
              <span className="block font-bold text-xs">{myCreatedResolved}</span>
              <span className="text-slate-500">Resolved</span>
            </div>
          </div>
        </div>

        {/* Card 3: Overall Workspace Completion SLA */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 space-y-3 shadow-sm hover:border-purple-300 transition-all">
          <div className="flex justify-between items-start">
            <div className="flex items-center space-x-2.5">
              <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl border border-purple-100">
                <TrendingUp size={18} />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">Workspace Velocity</span>
                <h4 className="text-sm font-bold text-slate-900">Overall Completion Rate</h4>
              </div>
            </div>
            <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
              {resolutionRate}% SLA
            </span>
          </div>

          <div>
            <div className="flex justify-between items-baseline mb-1 font-mono text-xs">
              <span className="text-slate-500 text-[11px]">Total Case Completion</span>
              <span className="font-bold text-slate-800">{resolvedIssues} / {totalIssues} Closed</span>
            </div>
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
              <div 
                className="bg-gradient-to-r from-purple-500 to-violet-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${resolutionRate}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 pt-1 text-[10px] font-mono text-center">
            <div className="bg-amber-50 text-amber-800 border border-amber-100 p-1.5 rounded-lg">
              <span className="block font-bold text-xs">{openIssues}</span>
              <span className="text-slate-500">Open</span>
            </div>
            <div className="bg-sky-50 text-sky-800 border border-sky-100 p-1.5 rounded-lg">
              <span className="block font-bold text-xs">{investigatingIssues}</span>
              <span className="text-slate-500">In Progress</span>
            </div>
            <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 p-1.5 rounded-lg">
              <span className="block font-bold text-xs">{resolvedIssues}</span>
              <span className="text-slate-500">Resolved</span>
            </div>
          </div>
        </div>

      </div>

      {/* Primary Task Progress & List Tracker Component */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-5 shadow-sm" id="dashboard-tasks-tracker">
        
        {/* Ledger Header & Scope Switcher */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <ListTodo size={20} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 font-mono uppercase tracking-wide">Tasks Assigned To Me & Created By Me</h3>
              <p className="text-[11px] text-slate-500">Directly manage task statuses, track progress bars, and filter cases.</p>
            </div>
          </div>

          {/* Tab Switcher Buttons */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl font-mono text-xs space-x-1 shrink-0">
            <button
              onClick={() => setDashboardTaskScope('MY_ASSIGNED')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                dashboardTaskScope === 'MY_ASSIGNED'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <CheckSquare size={13} />
              <span>Assigned To Me ({myAssignedTotal})</span>
            </button>

            <button
              onClick={() => setDashboardTaskScope('MY_CREATED')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                dashboardTaskScope === 'MY_CREATED'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <UserCheck size={13} />
              <span>Created By Me ({myCreatedTotal})</span>
            </button>

            <button
              onClick={() => setDashboardTaskScope('ALL')}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                dashboardTaskScope === 'ALL'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Layers size={13} />
              <span>All Tasks ({totalIssues})</span>
            </button>
          </div>
        </div>

        {/* Task Search & Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between font-mono text-xs">
          
          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search tasks by ID, title, tag..."
              value={taskSearchTerm}
              onChange={e => setTaskSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
            />
          </div>

          {/* Filter Dropdowns */}
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-xl text-[11px]">
              <Filter size={12} className="text-slate-400" />
              <span className="text-slate-500">Status:</span>
              <select
                value={taskStatusFilter}
                onChange={e => setTaskStatusFilter(e.target.value as any)}
                className="bg-transparent text-slate-800 font-bold focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="Open">Open</option>
                <option value="Investigating">Investigating</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-xl text-[11px]">
              <SlidersHorizontal size={12} className="text-slate-400" />
              <span className="text-slate-500">Priority:</span>
              <select
                value={taskPriorityFilter}
                onChange={e => setTaskPriorityFilter(e.target.value as any)}
                className="bg-transparent text-slate-800 font-bold focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Priorities</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

        </div>

        {/* Task Progress Table */}
        {filteredDashboardTasks.length === 0 ? (
          <div className="py-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
            <AlertCircle size={28} className="mx-auto text-slate-400" />
            <h4 className="text-xs font-bold text-slate-700 font-mono">No matching tasks found</h4>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto font-sans">
              No tasks matched your current filter scope or search query. Adjust the filters or switch tabs above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 uppercase text-[10px]">
                <tr>
                  <th className="px-3.5 py-2.5">Task ID</th>
                  <th className="px-3.5 py-2.5">Title & Category</th>
                  <th className="px-3.5 py-2.5">Assigned To</th>
                  <th className="px-3.5 py-2.5">Created By</th>
                  <th className="px-3.5 py-2.5">Priority</th>
                  <th className="px-3.5 py-2.5">Completion Progress</th>
                  <th className="px-3.5 py-2.5">Status & Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                {filteredDashboardTasks.map(task => {
                  const assignedUserObj = users.find(u => u.id === task.assignedTechUserId);
                  const progressPct = getTaskProgressPercent(task.status);

                  return (
                    <tr key={task.id} className="hover:bg-blue-50/40 transition-colors">
                      {/* Task ID */}
                      <td className="px-3.5 py-3">
                        <button
                          onClick={() => onChangeTab && onChangeTab('workspace')}
                          className="font-bold text-blue-600 hover:underline flex items-center space-x-1 cursor-pointer"
                          title="Open Task in Workspace"
                        >
                          <span>{task.id}</span>
                          <ArrowUpRight size={12} />
                        </button>
                      </td>

                      {/* Title & Tag */}
                      <td className="px-3.5 py-3 max-w-xs">
                        <div className="font-bold text-slate-900 truncate font-sans text-xs">
                          {task.title}
                        </div>
                        {task.linkedHashtag && (
                          <span className="inline-block bg-blue-50 text-blue-700 font-bold px-1.5 py-0.2 rounded text-[9px] mt-0.5 border border-blue-100">
                            {task.linkedHashtag}
                          </span>
                        )}
                      </td>

                      {/* Assigned To */}
                      <td className="px-3.5 py-3">
                        {assignedUserObj ? (
                          <span className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                            assignedUserObj.id === currentUser.id 
                              ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            @{assignedUserObj.username}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[10px]">Unassigned</span>
                        )}
                      </td>

                      {/* Created By */}
                      <td className="px-3.5 py-3">
                        <span className={`px-2 py-0.5 rounded font-semibold text-[11px] ${
                          task.creatorId === currentUser.id 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          @{task.creatorName || 'Unknown'}
                        </span>
                      </td>

                      {/* Priority */}
                      <td className="px-3.5 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          task.priority === 'Critical' ? 'bg-red-100 text-red-700 border border-red-200' :
                          task.priority === 'High' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                          task.priority === 'Medium' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {task.priority}
                        </span>
                      </td>

                      {/* Completion Progress Bar */}
                      <td className="px-3.5 py-3 w-36">
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-slate-500 font-mono">{task.status}</span>
                            <span className="font-bold text-slate-800">{progressPct}%</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${
                                progressPct === 100 ? 'bg-emerald-500' :
                                progressPct === 50 ? 'bg-sky-500' : 'bg-amber-400'
                              }`}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Inline Status Changer & Workspace Jump */}
                      <td className="px-3.5 py-3">
                        <div className="flex items-center space-x-2">
                          <select
                            value={task.status}
                            onChange={e => onUpdateIssue && onUpdateIssue(task.id, { status: e.target.value as IssueStatus })}
                            className={`text-[11px] font-bold rounded-lg px-2 py-1 border focus:outline-none cursor-pointer ${
                              task.status === 'Resolved' || task.status === 'Closed' 
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800' 
                                : task.status === 'Investigating' 
                                ? 'bg-sky-50 border-sky-300 text-sky-800' 
                                : 'bg-amber-50 border-amber-300 text-amber-800'
                            }`}
                          >
                            <option value="Open">Open</option>
                            <option value="Investigating">Investigating</option>
                            <option value="Resolved">Resolved</option>
                            <option value="Closed">Closed</option>
                          </select>

                          {onChangeTab && (
                            <button
                              onClick={() => onChangeTab('workspace')}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                              title="Open full case detail"
                            >
                              <ArrowUpRight size={14} />
                            </button>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* Team Management Section */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-5 shadow-sm" id="team-management-panel">
        <div className="flex justify-between items-center border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
              <Users size={18} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800 font-mono uppercase">Team & Member Access Control</h3>
              <p className="text-[11px] text-slate-500">Manage operational teams and member assignments across your workspace.</p>
            </div>
          </div>
          <span className="text-[11px] text-slate-500 font-mono bg-slate-100 px-2.5 py-1 rounded-md">
            Active User: <strong className="text-slate-800">@{currentUser.username}</strong>
          </span>
        </div>

        {myTeams.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-3">
            <Briefcase size={32} className="mx-auto text-slate-400" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-slate-700">No Teams Created Yet</h4>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                Create a team to add operational or technical members. You will automatically monitor tasks and requests across your assigned team members.
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg inline-flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>Create Team Now</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myTeams.map(team => {
              const teamMembers = users.filter(u => team.memberIds.includes(u.id));
              const availableUsers = getAvailableUsersForTeam(team);

              return (
                <div key={team.id} className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 space-y-3.5 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="text-xs font-bold text-slate-900 font-mono">{team.name}</h4>
                          <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full font-mono">
                            {team.memberIds.length} {team.memberIds.length === 1 ? 'Member' : 'Members'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">{team.description}</p>
                      </div>

                      {onDeleteTeam && (
                        <button
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete team "${team.name}"?`)) {
                              onDeleteTeam(team.id);
                            }
                          }}
                          className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                          title="Delete Team"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    {/* Members List */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-bold text-slate-500 font-mono uppercase block">Assigned Members:</span>
                      {teamMembers.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic">No members assigned yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {teamMembers.map(member => (
                            <div 
                              key={member.id} 
                              className="inline-flex items-center space-x-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-[11px] font-mono shadow-2xs"
                            >
                              <span className="font-semibold text-slate-800">@{member.username}</span>
                              <span className="text-[9px] uppercase px-1 py-0.2 bg-slate-100 text-slate-600 rounded">
                                {member.role}
                              </span>
                              <button
                                onClick={() => handleRemoveMemberFromTeam(team, member.id)}
                                className="text-slate-400 hover:text-red-600 ml-1 transition-colors cursor-pointer"
                                title="Remove member from team"
                              >
                                <UserX size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Add Member inline control */}
                  <div className="pt-2 border-t border-slate-200/80">
                    {addingToTeamId === team.id ? (
                      <div className="flex items-center space-x-2">
                        <select
                          value={userToAdd}
                          onChange={e => setUserToAdd(e.target.value)}
                          className="flex-grow bg-white border border-slate-300 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                        >
                          <option value="">-- Select user to add --</option>
                          {availableUsers.map(u => (
                            <option key={u.id} value={u.id}>
                              @{u.username} ({u.role} - {u.email})
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAddMemberToTeam(team)}
                          disabled={!userToAdd}
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
                        >
                          <Check size={13} />
                          <span>Add</span>
                        </button>
                        <button
                          onClick={() => {
                            setAddingToTeamId(null);
                            setUserToAdd('');
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingToTeamId(team.id)}
                        disabled={availableUsers.length === 0}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <UserPlus size={13} />
                        <span>{availableUsers.length > 0 ? '+ Add Member to Team' : 'All available users already in team'}</span>
                      </button>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Chart A: Line Chart trend over time (8 cols) */}
        <div className="lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-xs font-bold text-slate-800 font-mono uppercase">Case Reconciliation Trend</h3>
              <p className="text-[11px] text-slate-500">Weekly breakdown comparing raised tasks versus resolutions.</p>
            </div>
            <button
              onClick={handleExportMetrics}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100/80 border border-blue-200 text-blue-700 text-xs font-medium rounded-lg flex items-center space-x-1.5 cursor-pointer transition-colors shadow-sm"
            >
              <FileSpreadsheet size={13} className="text-blue-600" />
              <span>Export Audit CSV</span>
            </button>
          </div>

          <div className="h-[230px] w-full text-xs font-mono">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRaised" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', color: '#0f172a', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }} />
                <Area type="monotone" dataKey="Raised" stroke="#ef4444" fillOpacity={1} fill="url(#colorRaised)" strokeWidth={2} />
                <Area type="monotone" dataKey="Resolved" stroke="#2563eb" fillOpacity={1} fill="url(#colorResolved)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart B: Bar distribution by criticalities (4 cols) */}
        <div className="lg:col-span-4 bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-sm">
          <div>
            <h3 className="text-xs font-bold text-slate-800 font-mono uppercase">Priority Distribution</h3>
            <p className="text-[11px] text-slate-500">Breakdown of reported issues by urgency weight.</p>
          </div>

          {priorityData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-xs text-slate-400 font-mono">
              0 active requests recorded.
            </div>
          ) : (
            <div className="h-[230px] w-full text-xs font-mono">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityData} layout="vertical" margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', color: '#0f172a' }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0, 6, 6, 0]}>
                    {priorityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>

      {/* SQL Resolution Audit Ledger */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="border-b border-slate-100 pb-3 flex items-center space-x-2.5">
          <Shield size={18} className="text-blue-600" />
          <div>
            <h3 className="text-xs font-bold text-slate-800 font-mono uppercase">Database Resolution Audit Ledger</h3>
            <p className="text-[11px] text-slate-500">Security compliance tracking all live SQL execution mutations on cases.</p>
          </div>
        </div>

        {executedFixes.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono">
            Ledger clear. No live SQL execution mutations recorded.
          </div>
        ) : (
          <div className="space-y-3.5">
            {executedFixes.map(issue => (
              <div key={issue.id} className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl font-mono text-xs space-y-2.5">
                <div className="flex justify-between items-center text-[10px] border-b border-slate-200 pb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">SUCCESS</span>
                    <span className="text-slate-600 font-bold">CASE: {issue.id}</span>
                  </div>
                  <span className="text-slate-500">
                    Timestamp: {issue.solutionExecutedAt ? new Date(issue.solutionExecutedAt).toLocaleString() : 'Unknown'}
                  </span>
                </div>
                
                <div>
                  <span className="text-slate-500 block text-[9px] uppercase font-bold">Executed Statement:</span>
                  <pre className="bg-slate-900 p-2.5 rounded-lg text-[10px] text-sky-300 font-mono overflow-x-auto border border-slate-800 shadow-inner mt-1">
                    {issue.solutionScript}
                  </pre>
                </div>

                <div className="grid grid-cols-2 gap-4 text-[10px] pt-1">
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">REPORTER:</span>
                    <span className="text-slate-700 font-medium">@{issue.creatorName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Dry-run verification:</span>
                    <span className="text-slate-700 font-medium font-mono">Verified safe execution</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Create New Team */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Users size={18} className="text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900 font-mono">Create Operational Team</h3>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTeamSubmit} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Team Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Payment Reconciliation Squad"
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Operational scope or department responsibilities..."
                  value={newTeamDesc}
                  onChange={e => setNewTeamDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Assign Team Members ({selectedMemberIds.length} selected)
                </label>
                <p className="text-[10px] text-slate-500 mb-2 font-sans">
                  Members added to this team will have their requests monitored and managed under your account.
                </p>

                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1 bg-slate-50/50">
                  {availableUsersForNewTeam.length === 0 ? (
                    <p className="text-[11px] text-slate-400 py-2 text-center">No other users found in system.</p>
                  ) : (
                    availableUsersForNewTeam.map(u => {
                      const isSelected = selectedMemberIds.includes(u.id);
                      return (
                        <div
                          key={u.id}
                          onClick={() => toggleNewTeamMemberSelection(u.id)}
                          className={`p-2 rounded-md flex items-center justify-between cursor-pointer border transition-colors ${
                            isSelected 
                              ? 'bg-blue-50 border-blue-300 text-blue-900 font-semibold' 
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // handled by div click
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span>@{u.username}</span>
                          </div>
                          <div className="flex items-center space-x-2 text-[10px] text-slate-500">
                            <span className="uppercase px-1.5 py-0.5 bg-slate-200 rounded font-mono">{u.role}</span>
                            <span>{u.email}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newTeamName.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg transition-colors cursor-pointer"
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
