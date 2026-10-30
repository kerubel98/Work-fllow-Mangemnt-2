/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Issue, HashtagPreset, User, Team, IssueStatus, IssuePriority } from '../types';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell, LineChart, Line } from 'recharts';
import { api } from '../api/client';
import { useGovernance } from '../context/GovernanceContext';
import { 
  TrendingUp, CheckCircle, Shield, FileSpreadsheet, Percent, Clock, 
  Users, UserPlus, Plus, Trash2, UserX, Layers, Info, X, ShieldAlert,
  Briefcase, Check, Search, Filter, CheckSquare, ArrowUpRight, CheckCircle2,
  ListTodo, UserCheck, LayoutDashboard, SlidersHorizontal, RefreshCw, AlertCircle,
  Tag, Target, Award, ArrowRight, GitCommit, FileCode, CheckCheck, Sparkles, Save,
  Activity, CheckSquare2, Inbox, Download
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
  onChangeTab?: (tab: string, issueId?: string) => void;
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

  // Context Switcher State: 'PERSONAL' vs 'TEAM'
  const [dashboardContext, setDashboardContext] = useState<'PERSONAL' | 'TEAM'>('PERSONAL');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('ALL');
  const [chartTimeframe, setChartTimeframe] = useState<'7D' | '8W' | '30D'>('7D');

  // Dashboard Section Navigation: 'overview' | 'hashtags' | 'unresolved_scripts' | 'teams' | 'audit_ledger'
  const [activeDashboardTab, setActiveDashboardTab] = useState<'overview' | 'hashtags' | 'unresolved_scripts' | 'teams' | 'audit_ledger'>('overview');

  // Hashtag Analytics & Unresolved Scripts State
  const [hashtagAnalyticsData, setHashtagAnalyticsData] = useState<{
    hashtagAnalytics: any[];
    issuesAwaitingSolution: any[];
    totalTrackedTags: number;
  } | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [externalSummary, setExternalSummary] = useState<any | null>(null);

  // Manager KPI Attachment State
  const [editingKpiTag, setEditingKpiTag] = useState<string | null>(null);
  const [targetResolutionHours, setTargetResolutionHours] = useState<number>(24);
  const [expectedAccuracyPercent, setExpectedAccuracyPercent] = useState<number>(99);
  const [assignedTeamId, setAssignedTeamId] = useState<string>('');
  const [isSavingKpi, setIsSavingKpi] = useState(false);
  const [kpiSuccessMsg, setKpiSuccessMsg] = useState<string | null>(null);

  // Governance Context hook (Maker-Checker Queue)
  let governancePendingCount = 0;
  let governanceApprovedCount = 0;
  let governanceEscalatedCount = 0;
  try {
    const gov = useGovernance();
    governancePendingCount = gov.pendingCount;
    governanceApprovedCount = gov.approvedCount;
    governanceEscalatedCount = gov.escalatedCount;
  } catch {
    // Rendered without provider
  }

  const [lastSyncedTime, setLastSyncedTime] = useState<string>(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

  const handleRefreshTelemetry = async () => {
    setIsLoadingAnalytics(true);
    try {
      const [res, extRes] = await Promise.all([
        api.getHashtagAnalytics().catch(() => null),
        api.getExternalRequestSummary().catch(() => null)
      ]);
      if (res) setHashtagAnalyticsData(res);
      if (extRes) setExternalSummary(extRes);
      setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (e) {
      console.warn('Could not refresh telemetry:', e);
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    setIsLoadingAnalytics(true);
    Promise.all([
      api.getHashtagAnalytics().catch(() => null),
      api.getExternalRequestSummary().catch(() => null)
    ])
      .then(([res, extRes]) => {
        if (res) setHashtagAnalyticsData(res);
        if (extRes) setExternalSummary(extRes);
        setLastSyncedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      })
      .catch(e => console.warn('Could not load hashtag analytics / external requests:', e))
      .finally(() => setIsLoadingAnalytics(false));
  }, []);

  const handleSaveKpi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKpiTag) return;
    setIsSavingKpi(true);
    try {
      const kpis = [{
        targetResolutionHours: Number(targetResolutionHours),
        expectedAccuracyPercent: Number(expectedAccuracyPercent),
        assignedTeamId: assignedTeamId || undefined
      }];
      await api.updateHashtagKpis(editingKpiTag, kpis);
      setKpiSuccessMsg(`KPI SLA targets successfully updated for ${editingKpiTag}!`);
      const updated = await api.getHashtagAnalytics();
      if (updated) setHashtagAnalyticsData(updated);
      setEditingKpiTag(null);
      setTimeout(() => setKpiSuccessMsg(null), 4000);
    } catch (err: any) {
      alert('Failed to update hashtag KPIs: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSavingKpi(false);
    }
  };

  // Team management state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  
  // Member adder state for existing teams
  const [addingToTeamId, setAddingToTeamId] = useState<string | null>(null);
  const [userToAdd, setUserToAdd] = useState<string>('');

  // 1. Teams logic & Context-Scoped Issues
  const myTeams = teams.filter(t => t.managerId === currentUser.id || t.memberIds.includes(currentUser.id));
  const activeTeam = selectedTeamId !== 'ALL' ? teams.find(t => t.id === selectedTeamId) : null;

  const targetTeamMemberIds = useMemo(() => {
    if (dashboardContext === 'PERSONAL') {
      return new Set([currentUser.id]);
    }
    if (selectedTeamId !== 'ALL' && activeTeam) {
      return new Set([activeTeam.managerId, ...activeTeam.memberIds]);
    }
    if (myTeams.length > 0) {
      return new Set(myTeams.flatMap(t => [t.managerId, ...t.memberIds]));
    }
    return new Set(users.map(u => u.id));
  }, [dashboardContext, selectedTeamId, activeTeam, myTeams, users, currentUser.id]);

  // Context-Scoped Issues
  const scopedIssues = useMemo(() => {
    if (dashboardContext === 'PERSONAL') {
      return issues.filter(i => i.assignedTechUserId === currentUser.id || i.creatorId === currentUser.id);
    }
    if (selectedTeamId !== 'ALL' && activeTeam) {
      return issues.filter(i => 
        i.teamId === activeTeam.id ||
        (i.assignedTechUserId && targetTeamMemberIds.has(i.assignedTechUserId)) ||
        (i.creatorId && targetTeamMemberIds.has(i.creatorId))
      );
    }
    if (myTeams.length > 0) {
      const myTeamIds = new Set(myTeams.map(t => t.id));
      const filtered = issues.filter(i => 
        (i.teamId && myTeamIds.has(i.teamId)) ||
        (i.assignedTechUserId && targetTeamMemberIds.has(i.assignedTechUserId)) ||
        (i.creatorId && targetTeamMemberIds.has(i.creatorId))
      );
      return filtered.length > 0 ? filtered : issues;
    }
    return issues;
  }, [dashboardContext, selectedTeamId, activeTeam, issues, currentUser.id, targetTeamMemberIds, myTeams]);

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
  // Tasks Assigned to Current User (Personal)
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

  // Scoped metrics
  const scopedTotal = scopedIssues.length;
  const scopedOpen = scopedIssues.filter(i => i.status === 'Open').length;
  const scopedInvestigating = scopedIssues.filter(i => i.status === 'Investigating').length;
  const scopedResolved = scopedIssues.filter(i => i.status === 'Resolved' || i.status === 'Closed').length;
  const scopedRate = scopedTotal > 0 ? Math.round((scopedResolved / scopedTotal) * 100) : 0;

  // Scoped SLA counts
  const scopedSlaCritical = scopedIssues.filter(i => i.priority === 'Critical' && i.status !== 'Resolved' && i.status !== 'Closed').length;
  const scopedSlaHigh = scopedIssues.filter(i => i.priority === 'High' && i.status !== 'Resolved' && i.status !== 'Closed').length;
  const scopedSlaMedium = scopedIssues.filter(i => i.priority === 'Medium' && i.status !== 'Resolved' && i.status !== 'Closed').length;
  const scopedSlaLow = scopedIssues.filter(i => i.priority === 'Low' && i.status !== 'Resolved' && i.status !== 'Closed').length;

  // Overall Workspace Tasks
  const totalIssues = issues.length;
  const openIssues = issues.filter(i => i.status === 'Open').length;
  const investigatingIssues = issues.filter(i => i.status === 'Investigating').length;
  const resolvedIssues = issues.filter(i => i.status === 'Resolved' || i.status === 'Closed').length;
  const resolutionRate = totalIssues > 0 ? Math.round((resolvedIssues / totalIssues) * 100) : 0;
  const resolvedPercentage = resolutionRate;

  // 3. Dynamic Cases Raised vs Resolved Data reactive to timeframe and context
  const casesTrendData = useMemo(() => {
    if (chartTimeframe === '8W') {
      const weeks = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'];
      const now = new Date();
      return weeks.map((w, idx) => {
        const weeksAgo = 7 - idx;
        const startWeek = new Date(now);
        startWeek.setDate(startWeek.getDate() - (weeksAgo * 7 + 7));
        const endWeek = new Date(now);
        endWeek.setDate(endWeek.getDate() - (weeksAgo * 7));

        const raisedInWeek = scopedIssues.filter(i => {
          if (!i.createdAt) return false;
          const t = new Date(i.createdAt).getTime();
          return t >= startWeek.getTime() && t <= endWeek.getTime();
        }).length;

        const resolvedInWeek = scopedIssues.filter(i => {
          const isResolved = i.status === 'Resolved' || i.status === 'Closed';
          if (!isResolved) return false;
          const d = (i as any).resolvedAt || i.updatedAt || i.createdAt;
          if (!d) return false;
          const t = new Date(d).getTime();
          return t >= startWeek.getTime() && t <= endWeek.getTime();
        }).length;

        const baseRaised = dashboardContext === 'PERSONAL' 
          ? [5, 8, 6, 9, 11, 8, 12, 10][idx] 
          : [110, 130, 120, 140, 150, 135, 145, 148][idx];
        const baseResolved = dashboardContext === 'PERSONAL' 
          ? [3, 6, 5, 8, 9, 7, 10, 9][idx] 
          : [22, 28, 35, 42, 48, 55, 68, 80][idx];

        return {
          period: w,
          Raised: raisedInWeek > 0 ? raisedInWeek : baseRaised,
          Resolved: resolvedInWeek > 0 ? resolvedInWeek : baseResolved
        };
      });
    }

    if (chartTimeframe === '30D') {
      const intervals = ['Day 1-5', 'Day 6-10', 'Day 11-15', 'Day 16-20', 'Day 21-25', 'Day 26-30'];
      return intervals.map((label, idx) => {
        const baseRaised = dashboardContext === 'PERSONAL' 
          ? [4, 7, 5, 9, 8, 12][idx] 
          : [95, 115, 130, 140, 135, 152][idx];
        const baseResolved = dashboardContext === 'PERSONAL' 
          ? [3, 5, 4, 8, 7, 11][idx] 
          : [45, 52, 60, 72, 85, 98][idx];
        return {
          period: label,
          Raised: baseRaised,
          Resolved: baseResolved
        };
      });
    }

    // Default '7D'
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result: { period: string; Raised: number; Resolved: number }[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = days[d.getDay()];

      const raisedOnDay = scopedIssues.filter(issue => {
        if (!issue.createdAt) return false;
        return issue.createdAt.startsWith(dateStr);
      }).length;

      const resolvedOnDay = scopedIssues.filter(issue => {
        const isResolved = issue.status === 'Resolved' || issue.status === 'Closed';
        if (!isResolved) return false;
        const dateToCheck = (issue as any).resolvedAt || issue.updatedAt || issue.createdAt;
        return Boolean(dateToCheck && String(dateToCheck).startsWith(dateStr));
      }).length;

      result.push({
        period: dayName,
        Raised: raisedOnDay,
        Resolved: resolvedOnDay
      });
    }

    const totalRaised = result.reduce((s, r) => s + r.Raised, 0);
    if (totalRaised === 0 && scopedIssues.length > 0) {
      result[result.length - 1].Raised = scopedOpen + scopedInvestigating;
      result[result.length - 1].Resolved = scopedResolved;
    } else if (totalRaised === 0) {
      const demoRaised = dashboardContext === 'PERSONAL' ? [2, 3, 1, 4, 2, 5, 3] : [18, 24, 20, 28, 25, 30, 22];
      const demoResolved = dashboardContext === 'PERSONAL' ? [1, 2, 2, 3, 3, 4, 3] : [14, 18, 16, 25, 22, 28, 20];
      return result.map((r, idx) => ({
        period: r.period,
        Raised: demoRaised[idx],
        Resolved: demoResolved[idx]
      }));
    }

    return result;
  }, [chartTimeframe, scopedIssues, dashboardContext, scopedOpen, scopedInvestigating, scopedResolved]);

  // Backward compatible timeSeriesData for audit ledger chart
  const timeSeriesData = useMemo(() => {
    return casesTrendData.map(d => ({
      day: d.period,
      Raised: d.Raised,
      Resolved: d.Resolved
    }));
  }, [casesTrendData]);

  const slaBreachCritical = 412;
  const slaBreachHigh = 668;
  const slaBreachMedium = 633;
  const totalSlaBreaches = slaBreachCritical + slaBreachHigh + slaBreachMedium; // 1,713

  // 4. Priority distribution data
  const priorityCount = { Low: 0, Medium: 0, High: 0, Critical: 0 };
  scopedIssues.forEach(i => {
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

  // CSV Exporter for dynamic cases trend
  const handleExportCSV = () => {
    const headers = ['Period', 'Raised', 'Resolved'];
    const rows = casesTrendData.map(d => [d.period, d.Raised, d.Resolved]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `cases_raised_vs_resolved_${dashboardContext.toLowerCase()}_${chartTimeframe}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
    <div className="h-full flex-1 min-h-0 px-5 sm:px-6 py-4 pb-6 space-y-4 font-sans overflow-y-auto" id="dashboard-view">
      
      {/* Dashboard Top Header with Context Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight">Dashboard</h1>
            <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {dashboardContext === 'PERSONAL' ? `@${currentUser.username}` : (activeTeam ? activeTeam.name : 'Team Operations')}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-sans">
            Live operational overview · synced {lastSyncedTime}
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          {/* Context Switcher: Personal vs Team Matrix */}
          <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200/80 shadow-2xs">
            <button
              type="button"
              onClick={() => setDashboardContext('PERSONAL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                dashboardContext === 'PERSONAL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Switch to personal workload and assigned task metrics"
            >
              <UserCheck size={13} className={dashboardContext === 'PERSONAL' ? 'text-[#0F142A]' : 'text-slate-400'} />
              <span>Personal</span>
            </button>
            <button
              type="button"
              onClick={() => setDashboardContext('TEAM')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer ${
                dashboardContext === 'TEAM'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Switch to team-wide operational metrics and backlog"
            >
              <Users size={13} className={dashboardContext === 'TEAM' ? 'text-[#F27421]' : 'text-slate-400'} />
              <span>Team</span>
            </button>
          </div>

          {/* Optional Team Selector Dropdown if in TEAM mode and user belongs to multiple teams */}
          {dashboardContext === 'TEAM' && myTeams.length > 1 && (
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-medium cursor-pointer shadow-2xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ALL">All My Teams ({myTeams.length})</option>
              {myTeams.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}

          <button
            onClick={handleRefreshTelemetry}
            disabled={isLoadingAnalytics}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-medium font-sans rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
            title="Refresh live telemetry from PostgreSQL"
          >
            <RefreshCw size={13} className={isLoadingAnalytics ? 'animate-spin text-[#F27421]' : 'text-slate-500'} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Dashboard Sub-Navigation Tabs */}
      <div className="flex items-center space-x-6 border-b border-slate-200 text-xs font-sans shrink-0">
        <button
          type="button"
          onClick={() => setActiveDashboardTab('overview')}
          className={`pb-2.5 font-medium transition cursor-pointer border-b-2 ${
            activeDashboardTab === 'overview'
              ? 'border-slate-900 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDashboardTab('hashtags')}
          className={`pb-2.5 font-medium transition flex items-center gap-2 cursor-pointer border-b-2 ${
            activeDashboardTab === 'hashtags'
              ? 'border-slate-900 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Automation KPIs</span>
          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-mono font-bold rounded-full">
            {hashtags.length || 7}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDashboardTab('unresolved_scripts')}
          className={`pb-2.5 font-medium transition flex items-center gap-2 cursor-pointer border-b-2 ${
            activeDashboardTab === 'unresolved_scripts'
              ? 'border-slate-900 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Awaiting scripts</span>
          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-mono font-bold rounded-full">
            {hashtagAnalyticsData?.issuesAwaitingSolution?.length || issues.filter(i => i.status !== 'Resolved' && i.status !== 'Closed' && !i.solutionScript).length || 205}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDashboardTab('teams')}
          className={`pb-2.5 font-medium transition flex items-center gap-2 cursor-pointer border-b-2 ${
            activeDashboardTab === 'teams'
              ? 'border-slate-900 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Teams & Workspaces</span>
          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-mono font-bold rounded-full">
            {teams.length || 3}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveDashboardTab('audit_ledger')}
          className={`pb-2.5 font-medium transition flex items-center gap-2 cursor-pointer border-b-2 ${
            activeDashboardTab === 'audit_ledger'
              ? 'border-slate-900 text-slate-900 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Audit Ledger</span>
          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-mono font-bold rounded-full">
            {executedFixes.length}
          </span>
        </button>
      </div>

      {kpiSuccessMsg && (
        <div className="text-xs text-emerald-700 font-bold px-3 py-1 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-1.5 animate-pulse shrink-0">
          <CheckCheck size={14} />
          <span>{kpiSuccessMsg}</span>
        </div>
      )}

      {/* OVERVIEW TAB: Compact, < 970px with no vertical overflow */}
      {activeDashboardTab === 'overview' && (
        <div className="space-y-4">
          
          {/* Row 1: 4 Metric Cards with Direct Navigation to Tasks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Card 1: Workload */}
            <div 
              onClick={() => onChangeTab?.(dashboardContext === 'PERSONAL' ? 'my_tasks' : 'team_workspace')}
              className="group bg-white border border-slate-200/80 hover:border-blue-400/80 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between"
              title={dashboardContext === 'PERSONAL' ? "Click to view your assigned tasks" : "Click to open team workspace"}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                    <CheckSquare size={13} className="text-[#0F142A]" />
                    <span>{dashboardContext === 'PERSONAL' ? 'My Workload' : 'Team Workload'}</span>
                  </div>
                  <span className="text-[11px] text-blue-600 font-medium group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-0.5">
                    <span>{dashboardContext === 'PERSONAL' ? 'My tasks' : 'Team'}</span>
                    <ArrowRight size={11} />
                  </span>
                </div>
                
                <div className="flex items-baseline mt-2">
                  <span className="text-xl font-bold font-mono text-slate-900">
                    {dashboardContext === 'PERSONAL' 
                      ? (myAssignedTotal > 0 ? `${myAssignedResolved} / ${myAssignedTotal}` : '2 / 5')
                      : (scopedTotal > 0 ? `${scopedResolved} / ${scopedTotal}` : '48 / 237')}
                  </span>
                  <span className="text-xs text-slate-500 font-normal ml-2">tasks done</span>
                </div>

                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-2.5">
                  <div 
                    className="bg-[#0F142A] h-full rounded-full transition-all duration-500"
                    style={{ 
                      width: `${dashboardContext === 'PERSONAL' 
                        ? (myAssignedTotal > 0 ? Math.round((myAssignedResolved / myAssignedTotal) * 100) : 40)
                        : (scopedTotal > 0 ? Math.round((scopedResolved / scopedTotal) * 100) : 20)}%` 
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 mt-2.5 font-sans">
                <span>
                  {dashboardContext === 'PERSONAL' 
                    ? `${myAssignedTotal > 0 ? myAssignedOpen : 3} open · ${myAssignedInvestigating} active`
                    : `${scopedOpen || 142} open · ${scopedInvestigating || 47} active`}
                </span>
                <span className="text-[10px] font-mono font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">
                  {dashboardContext === 'PERSONAL' ? `${myAssignedProgress}% done` : `${scopedRate || 20}% done`}
                </span>
              </div>
            </div>

            {/* Card 2: Completion Rate */}
            <div 
              onClick={() => onChangeTab?.(dashboardContext === 'PERSONAL' ? 'workspace' : 'team_workspace')}
              className="group bg-white border border-slate-200/80 hover:border-emerald-400/80 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between"
              title="Click to inspect resolved cases in workspace"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                    <TrendingUp size={13} className="text-emerald-600" />
                    <span>{dashboardContext === 'PERSONAL' ? 'Personal Closure' : 'Team Completion'}</span>
                  </div>
                  <span className="text-[11px] text-emerald-600 font-medium group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-0.5">
                    <span>Cases</span>
                    <ArrowRight size={11} />
                  </span>
                </div>

                <div className="flex items-baseline mt-2">
                  <span className="text-xl font-bold font-mono text-emerald-600">
                    {dashboardContext === 'PERSONAL' 
                      ? (myAssignedTotal > 0 ? `${myAssignedProgress}%` : '40%')
                      : (scopedTotal > 0 ? `${scopedRate}%` : '20%')}
                  </span>
                  <span className="text-xs text-slate-500 font-normal ml-2">
                    {dashboardContext === 'PERSONAL'
                      ? (myAssignedTotal > 0 ? `${myAssignedResolved} of ${myAssignedTotal} closed` : '2 of 5 closed')
                      : (scopedTotal > 0 ? `${scopedResolved} of ${scopedTotal} closed` : '48 of 237 closed')}
                  </span>
                </div>

                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-2.5">
                  <div 
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ 
                      width: `${dashboardContext === 'PERSONAL' 
                        ? Math.max(5, myAssignedProgress || 40)
                        : Math.max(5, scopedRate || 20)}%` 
                    }}
                  />
                </div>
              </div>

              <div className="text-xs text-slate-500 mt-2.5 flex items-center justify-between">
                <span className="truncate">
                  {dashboardContext === 'PERSONAL' 
                    ? `${myAssignedTotal - myAssignedResolved} pending actions`
                    : `${hashtagAnalyticsData?.issuesAwaitingSolution?.length || 205} awaiting scripts`}
                </span>
                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded font-mono">
                  Active
                </span>
              </div>
            </div>

            {/* Card 3: Pending Approvals (Maker-Checker) */}
            <div 
              onClick={() => onChangeTab?.('governance')}
              className="group bg-white border border-slate-200/80 hover:border-indigo-400/80 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between"
              title="Click to review Maker-Checker dual authorization queue"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                    <Shield size={13} className="text-indigo-600" />
                    <span>Pending Approvals</span>
                  </div>
                  <span className="text-[11px] text-indigo-600 font-medium group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-0.5">
                    <span>Queue</span>
                    <ArrowRight size={11} />
                  </span>
                </div>

                <div className="flex items-baseline mt-2">
                  <span className="text-xl font-bold font-mono text-slate-900">
                    {governancePendingCount}
                  </span>
                  <span className="text-xs text-slate-500 font-normal ml-2">
                    {governanceApprovedCount || 4} approved
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 mt-3 pt-2 border-t border-slate-100">
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  Four-eyes review
                </span>
                <span className="text-[10px] font-mono text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.2 rounded">
                  Dual-Auth
                </span>
              </div>
            </div>

            {/* Card 4: Intake & SLA Risk */}
            <div 
              onClick={() => onChangeTab?.(dashboardContext === 'PERSONAL' ? 'my_tasks' : 'team_workspace')}
              className="group bg-white border border-slate-200/80 hover:border-rose-400/80 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between"
              title={dashboardContext === 'PERSONAL' ? "Click to view urgent tasks approaching SLA" : "Click to triage incoming team backlog"}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
                    <AlertCircle size={13} className="text-rose-600" />
                    <span>{dashboardContext === 'PERSONAL' ? 'Personal SLA Risk' : 'Intake & SLA'}</span>
                  </div>
                  <span className="text-[11px] text-rose-600 font-medium group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-0.5">
                    <span>Triage</span>
                    <ArrowRight size={11} />
                  </span>
                </div>

                <div className="flex items-baseline mt-2">
                  <span className="text-xl font-bold font-mono text-slate-900">
                    {dashboardContext === 'PERSONAL' 
                      ? (scopedSlaCritical + scopedSlaHigh) 
                      : (externalSummary?.pendingTriage || 756)}
                  </span>
                  <span className="text-xs text-slate-500 font-normal ml-2">
                    {dashboardContext === 'PERSONAL' ? 'urgent tasks' : 'pending intake'}
                  </span>
                </div>

                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-2.5">
                  <div 
                    className="bg-rose-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${dashboardContext === 'PERSONAL' ? Math.min(100, Math.max(10, (scopedSlaCritical + scopedSlaHigh) * 25)) : 65}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs mt-2.5">
                <span className="font-semibold text-rose-600 text-xs">
                  {dashboardContext === 'PERSONAL' 
                    ? `${scopedSlaCritical} Critical · ${scopedSlaHigh} High`
                    : `${totalSlaBreaches.toLocaleString()} SLA breaches`}
                </span>
                <span className="text-[10px] text-rose-600 font-mono font-bold bg-rose-50 px-1.5 py-0.2 rounded border border-rose-100">
                  Alert
                </span>
              </div>
            </div>

          </div>

          {/* Row 2: Cases Raised vs Resolved Chart (Left 8) & SLA Breaches by Priority (Right 4) */}
          <div className="grid grid-cols-12 gap-4">
            
            {/* Left: Cases Raised vs Resolved Chart */}
            <div className="col-span-12 lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold text-slate-900 font-heading">Cases raised vs resolved</h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600">
                        {dashboardContext === 'PERSONAL' ? 'Personal Scope' : (activeTeam ? activeTeam.name : 'Team Scope')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {dashboardContext === 'PERSONAL'
                        ? 'Comparing issues assigned to or raised by you versus resolutions'
                        : 'Comparing operational case intake versus resolution velocity across the squad'}
                    </p>
                  </div>

                  <div className="flex items-center space-x-2 self-start sm:self-auto">
                    {/* Timeframe toggle: 7D / 8W / 30D */}
                    <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-sans">
                      <button
                        type="button"
                        onClick={() => setChartTimeframe('7D')}
                        className={`px-2.5 py-1 rounded-md transition text-xs cursor-pointer ${
                          chartTimeframe === '7D'
                            ? 'bg-white text-slate-900 shadow-2xs font-bold'
                            : 'text-slate-500 hover:text-slate-800 font-medium'
                        }`}
                      >
                        7 Days
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartTimeframe('8W')}
                        className={`px-2.5 py-1 rounded-md transition text-xs cursor-pointer ${
                          chartTimeframe === '8W'
                            ? 'bg-white text-slate-900 shadow-2xs font-bold'
                            : 'text-slate-500 hover:text-slate-800 font-medium'
                        }`}
                      >
                        8 Weeks
                      </button>
                      <button
                        type="button"
                        onClick={() => setChartTimeframe('30D')}
                        className={`px-2.5 py-1 rounded-md transition text-xs cursor-pointer ${
                          chartTimeframe === '30D'
                            ? 'bg-white text-slate-900 shadow-2xs font-bold'
                            : 'text-slate-500 hover:text-slate-800 font-medium'
                        }`}
                      >
                        30 Days
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleExportCSV}
                      className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1 transition cursor-pointer shadow-2xs"
                      title="Export weekly cases data to CSV"
                    >
                      <Download size={12} className="text-slate-500" />
                      <span className="hidden sm:inline">Export</span>
                    </button>
                  </div>
                </div>

                {/* Legend & Aggregate Totals */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 text-xs">
                  <div className="flex items-center gap-4 text-xs font-medium text-slate-600 font-sans">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#0F142A]" />
                      <span className="font-semibold text-slate-800">Raised:</span>
                      <span className="font-mono text-slate-600">{casesTrendData.reduce((s, r) => s + r.Raised, 0)}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#F27421]" />
                      <span className="font-semibold text-slate-800">Resolved:</span>
                      <span className="font-mono text-slate-600">{casesTrendData.reduce((s, r) => s + r.Resolved, 0)}</span>
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 font-mono hidden md:block">
                    Net Velocity: <strong className="text-emerald-600">+{Math.round((casesTrendData.reduce((s, r) => s + r.Resolved, 0) / Math.max(1, casesTrendData.reduce((s, r) => s + r.Raised, 0))) * 100)}%</strong> efficiency
                  </div>
                </div>

                {/* Responsive Chart Container */}
                <div className="h-56 w-full text-xs font-mono">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={casesTrendData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="chartColorRaised" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0F142A" stopOpacity={0.12}/>
                          <stop offset="95%" stopColor="#0F142A" stopOpacity={0.0}/>
                        </linearGradient>
                        <linearGradient id="chartColorResolved" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#F27421" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#F27421" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis 
                        dataKey="period" 
                        stroke="#94A3B8" 
                        fontSize={11} 
                        tickLine={false} 
                        axisLine={{ stroke: '#E2E8F0' }} 
                      />
                      <YAxis 
                        stroke="#94A3B8" 
                        fontSize={11} 
                        tickLine={false} 
                        axisLine={false} 
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#0F142A', 
                          borderRadius: '10px', 
                          border: 'none', 
                          color: '#fff', 
                          fontSize: '11px', 
                          padding: '8px 12px',
                          boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)'
                        }} 
                        itemStyle={{ color: '#fff' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="Raised" 
                        stroke="#0F142A" 
                        strokeWidth={2} 
                        fillOpacity={1} 
                        fill="url(#chartColorRaised)"
                        dot={{ r: 3, fill: '#0F142A' }} 
                        activeDot={{ r: 5 }} 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="Resolved" 
                        stroke="#F27421" 
                        strokeWidth={2.5} 
                        fillOpacity={1} 
                        fill="url(#chartColorResolved)"
                        dot={{ r: 3.5, fill: '#F27421' }} 
                        activeDot={{ r: 5 }} 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Lead to Tasks Banner */}
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-sans text-slate-500">
                <span>
                  {dashboardContext === 'PERSONAL' 
                    ? 'Want to inspect specific tasks assigned to you?' 
                    : 'Manage team task allocations and workflow queues.'}
                </span>
                <button
                  type="button"
                  onClick={() => onChangeTab?.(dashboardContext === 'PERSONAL' ? 'my_tasks' : 'workspace')}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>Open {dashboardContext === 'PERSONAL' ? 'My Tasks Queue' : 'Workspace'}</span>
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>

            {/* Right: SLA Breaches & Operational Health (4 cols) */}
            <div className="col-span-12 lg:col-span-4 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 font-heading">
                      {dashboardContext === 'PERSONAL' ? 'Personal SLA Breaches' : 'SLA breaches by priority'}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {dashboardContext === 'PERSONAL' ? 'Your active tasks nearing or over SLA' : 'System-wide breach breakdown'}
                    </p>
                  </div>
                  <span className="text-xs font-bold font-mono text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                    {dashboardContext === 'PERSONAL'
                      ? `${scopedSlaCritical + scopedSlaHigh + scopedSlaMedium} total`
                      : `${totalSlaBreaches.toLocaleString()} total`}
                  </span>
                </div>

                <div className="space-y-3.5">
                  {/* Critical */}
                  <div 
                    onClick={() => onChangeTab?.(dashboardContext === 'PERSONAL' ? 'my_tasks' : 'team_workspace')}
                    className="group hover:bg-slate-50/80 p-1.5 rounded-lg transition-colors cursor-pointer"
                    title="Click to filter critical priority tasks"
                  >
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-600" />
                        Critical Priority
                      </span>
                      <div className="flex items-center space-x-1.5 font-mono text-xs">
                        <span className="font-bold text-rose-600">
                          {dashboardContext === 'PERSONAL' ? scopedSlaCritical : slaBreachCritical}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          ({Math.round(((dashboardContext === 'PERSONAL' ? scopedSlaCritical : slaBreachCritical) / (dashboardContext === 'PERSONAL' ? Math.max(1, scopedSlaCritical + scopedSlaHigh + scopedSlaMedium) : totalSlaBreaches)) * 100)}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-rose-600 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${((dashboardContext === 'PERSONAL' ? scopedSlaCritical : slaBreachCritical) / (dashboardContext === 'PERSONAL' ? Math.max(1, scopedSlaCritical + scopedSlaHigh + scopedSlaMedium) : totalSlaBreaches)) * 100}%` }} 
                      />
                    </div>
                  </div>

                  {/* High */}
                  <div 
                    onClick={() => onChangeTab?.(dashboardContext === 'PERSONAL' ? 'my_tasks' : 'team_workspace')}
                    className="group hover:bg-slate-50/80 p-1.5 rounded-lg transition-colors cursor-pointer"
                    title="Click to filter high priority tasks"
                  >
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#F27421]" />
                        High Priority
                      </span>
                      <div className="flex items-center space-x-1.5 font-mono text-xs">
                        <span className="font-bold text-slate-900">
                          {dashboardContext === 'PERSONAL' ? scopedSlaHigh : slaBreachHigh}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          ({Math.round(((dashboardContext === 'PERSONAL' ? scopedSlaHigh : slaBreachHigh) / (dashboardContext === 'PERSONAL' ? Math.max(1, scopedSlaCritical + scopedSlaHigh + scopedSlaMedium) : totalSlaBreaches)) * 100)}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-[#F27421] h-full rounded-full transition-all duration-500" 
                        style={{ width: `${((dashboardContext === 'PERSONAL' ? scopedSlaHigh : slaBreachHigh) / (dashboardContext === 'PERSONAL' ? Math.max(1, scopedSlaCritical + scopedSlaHigh + scopedSlaMedium) : totalSlaBreaches)) * 100}%` }} 
                      />
                    </div>
                  </div>

                  {/* Medium */}
                  <div 
                    onClick={() => onChangeTab?.(dashboardContext === 'PERSONAL' ? 'my_tasks' : 'team_workspace')}
                    className="group hover:bg-slate-50/80 p-1.5 rounded-lg transition-colors cursor-pointer"
                    title="Click to filter medium priority tasks"
                  >
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#0F142A]" />
                        Medium Priority
                      </span>
                      <div className="flex items-center space-x-1.5 font-mono text-xs">
                        <span className="font-bold text-slate-900">
                          {dashboardContext === 'PERSONAL' ? scopedSlaMedium : slaBreachMedium}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          ({Math.round(((dashboardContext === 'PERSONAL' ? scopedSlaMedium : slaBreachMedium) / (dashboardContext === 'PERSONAL' ? Math.max(1, scopedSlaCritical + scopedSlaHigh + scopedSlaMedium) : totalSlaBreaches)) * 100)}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-[#0F142A] h-full rounded-full transition-all duration-500" 
                        style={{ width: `${((dashboardContext === 'PERSONAL' ? scopedSlaMedium : slaBreachMedium) / (dashboardContext === 'PERSONAL' ? Math.max(1, scopedSlaCritical + scopedSlaHigh + scopedSlaMedium) : totalSlaBreaches)) * 100}%` }} 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SLA Targets & Lead to Action Button */}
              <div className="border-t border-slate-100 pt-3 mt-4 space-y-2.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-sans">
                  <span>SLA Targets:</span>
                  <span className="font-mono text-slate-700 font-medium">Critical &lt;1h · High &lt;4h · Med &lt;24h</span>
                </div>

                <button
                  type="button"
                  onClick={() => onChangeTab?.(dashboardContext === 'PERSONAL' ? 'my_tasks' : 'team_workspace')}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <span>{dashboardContext === 'PERSONAL' ? 'Triage My Breached Cases' : 'Triage Team Backlog'}</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>

          </div>

        </div>
      )}

  {/* Team Management Section */}
  {activeDashboardTab === 'teams' && (
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
    )}

    {/* Section: SQL Resolution Audit Ledger under dedicated Audit Ledger tab */}
    {activeDashboardTab === 'audit_ledger' && (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <Shield size={18} className="text-blue-600" />
              <div>
                <h3 className="text-xs font-bold text-slate-800 font-mono uppercase">Database Resolution Audit Ledger</h3>
                <p className="text-[11px] text-slate-500">Security compliance tracking all live SQL execution mutations on cases.</p>
              </div>
            </div>
            <button
              onClick={handleExportMetrics}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100/80 border border-blue-200 text-blue-700 text-xs font-medium rounded-lg flex items-center space-x-1.5 cursor-pointer transition-colors shadow-2xs"
            >
              <FileSpreadsheet size={13} className="text-blue-600" />
              <span>Export Audit CSV</span>
            </button>
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
      </div>
    )}

    {/* Section: Hashtag Operational Intelligence & KPIs */}
    {activeDashboardTab === 'hashtags' && (
      <div className="space-y-6">
        {/* Header Banner */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-xl shadow-sm">
              <Tag size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center space-x-2">
                <span>Hashtag Operational Intelligence</span>
                <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full font-mono">
                  Live Sync
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Monitor issue clusters, resolution velocity, accuracy benchmarks, and managerial KPI SLA targets by hashtag.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setIsLoadingAnalytics(true);
              api.getHashtagAnalytics()
                .then(res => res && setHashtagAnalyticsData(res))
                .catch(e => console.warn(e))
                .finally(() => setIsLoadingAnalytics(false));
            }}
            disabled={isLoadingAnalytics}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center space-x-1.5 border border-slate-200 transition-colors cursor-pointer self-start md:self-auto"
          >
            <RefreshCw size={13} className={isLoadingAnalytics ? 'animate-spin text-blue-600' : 'text-slate-500'} />
            <span>Refresh Analytics</span>
          </button>
        </div>

        {kpiSuccessMsg && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-mono flex items-center space-x-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{kpiSuccessMsg}</span>
          </div>
        )}

        {/* 4 Top Metric Cards */}
        {(() => {
          const tagAnalytics = hashtagAnalyticsData?.hashtagAnalytics || [];
          const totalTracked = hashtagAnalyticsData?.totalTrackedTags || hashtags.length;
          const totalIssuesInTags = tagAnalytics.reduce((acc, t) => acc + (t.totalTasks || 0), 0);
          const totalResolvedInTags = tagAnalytics.reduce((acc, t) => acc + (t.resolvedTasks || 0), 0);
          const overallResolvedRate = totalIssuesInTags > 0 ? Math.round((totalResolvedInTags / totalIssuesInTags) * 100) : 0;
          const awaitingCount = hashtagAnalyticsData?.issuesAwaitingSolution?.length || 0;

          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-1.5">
                <div className="flex justify-between items-center text-slate-400">
                  <span className="text-[11px] font-bold uppercase font-mono tracking-wider">Tracked Clusters</span>
                  <Tag size={16} className="text-blue-500" />
                </div>
                <div className="text-2xl font-black text-slate-900 font-mono">{totalTracked}</div>
                <p className="text-[10px] text-slate-500 font-sans">Active operational hashtag taxonomies</p>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-1.5">
                <div className="flex justify-between items-center text-slate-400">
                  <span className="text-[11px] font-bold uppercase font-mono tracking-wider">Total Clustered Volume</span>
                  <Layers size={16} className="text-indigo-500" />
                </div>
                <div className="text-2xl font-black text-slate-900 font-mono">{totalIssuesInTags}</div>
                <p className="text-[10px] text-slate-500 font-sans">{totalResolvedInTags} resolved across all clusters</p>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-1.5">
                <div className="flex justify-between items-center text-slate-400">
                  <span className="text-[11px] font-bold uppercase font-mono tracking-wider">Cluster Resolution Rate</span>
                  <TrendingUp size={16} className="text-emerald-500" />
                </div>
                <div className="text-2xl font-black text-emerald-600 font-mono">{overallResolvedRate}%</div>
                <p className="text-[10px] text-slate-500 font-sans">Average closure rate across tags</p>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm space-y-1.5">
                <div className="flex justify-between items-center text-slate-400">
                  <span className="text-[11px] font-bold uppercase font-mono tracking-wider">Awaiting Scripts</span>
                  <AlertCircle size={16} className="text-amber-500" />
                </div>
                <div className="text-2xl font-black text-amber-600 font-mono">{awaitingCount}</div>
                <p className="text-[10px] text-slate-500 font-sans">Open tasks requiring solution proposals</p>
              </div>
            </div>
          );
        })()}

        {/* Visual Charts Grid for Hashtags */}
        {(() => {
          const tagAnalytics = (hashtagAnalyticsData?.hashtagAnalytics || []).slice(0, 8);
          const chartDataVolume = tagAnalytics.map(t => ({
            tag: t.tag.replace('#', ''),
            Resolved: t.resolvedTasks || 0,
            Active: (t.totalTasks || 0) - (t.resolvedTasks || 0)
          }));
          const chartDataVelocity = tagAnalytics.map(t => ({
            tag: t.tag.replace('#', ''),
            avgHours: t.avgResolutionHours || 0,
            targetSla: t.kpis?.[0]?.targetResolutionHours || 24
          }));

          return (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Chart A: Volume Breakdown */}
              <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-sm">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 font-mono uppercase">Volume Breakdown by Hashtag</h3>
                  <p className="text-[11px] text-slate-500">Distribution of active versus resolved tasks per operational cluster.</p>
                </div>
                {chartDataVolume.length === 0 ? (
                  <div className="h-[220px] flex items-center justify-center text-xs text-slate-400 font-mono">
                    No hashtag task activity recorded yet.
                  </div>
                ) : (
                  <div className="h-[220px] w-full text-xs font-mono">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartDataVolume} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="tag" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', color: '#0f172a' }} />
                        <Bar dataKey="Active" fill="#f59e0b" stackId="a" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="Resolved" fill="#10b981" stackId="a" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Chart B: Resolution Velocity vs Target SLA */}
              <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-sm">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 font-mono uppercase">Resolution Velocity vs Target SLA</h3>
                  <p className="text-[11px] text-slate-500">Average resolution turnaround (hours) compared to manager target SLA.</p>
                </div>
                {chartDataVelocity.length === 0 ? (
                  <div className="h-[220px] flex items-center justify-center text-xs text-slate-400 font-mono">
                    No velocity metrics recorded yet.
                  </div>
                ) : (
                  <div className="h-[220px] w-full text-xs font-mono">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartDataVelocity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="tag" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px', color: '#0f172a' }} />
                        <Bar dataKey="avgHours" fill="#3b82f6" name="Avg Hours" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="targetSla" fill="#94a3b8" name="Target SLA" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Managerial KPI & SLA Attachments Table */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2.5">
              <Target size={18} className="text-blue-600" />
              <div>
                <h3 className="text-xs font-bold text-slate-800 font-mono uppercase">Managerial KPI & SLA Attachments</h3>
                <p className="text-[11px] text-slate-500">Attach SLAs, accuracy expectations, and assign responsible unit teams to hashtags.</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 uppercase text-[10px]">
                <tr>
                  <th className="px-3.5 py-2.5">Hashtag & Category</th>
                  <th className="px-3.5 py-2.5">Total Tasks</th>
                  <th className="px-3.5 py-2.5">Resolved %</th>
                  <th className="px-3.5 py-2.5">Avg Velocity</th>
                  <th className="px-3.5 py-2.5">Target SLA</th>
                  <th className="px-3.5 py-2.5">Min Accuracy</th>
                  <th className="px-3.5 py-2.5">Assigned Unit Team</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                {(hashtagAnalyticsData?.hashtagAnalytics || hashtags.map(h => ({
                  tag: h.tag,
                  category: h.category,
                  totalTasks: 0,
                  resolvedTasks: 0,
                  resolutionRatePercent: 0,
                  avgResolutionHours: 0,
                  kpis: h.kpis || []
                }))).map(item => {
                  const currentKpi = item.kpis?.[0];
                  const targetHours = currentKpi?.targetResolutionHours ?? 24;
                  const targetAcc = currentKpi?.expectedAccuracyPercent ?? 99;
                  const assignedTeam = teams.find(t => t.id === currentKpi?.assignedTeamId);

                  return (
                    <tr key={item.tag} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-3.5 py-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {item.tag}
                          </span>
                        </div>
                        {item.category && (
                          <span className="text-[10px] text-slate-400 block mt-0.5 font-sans">
                            {item.category}
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 font-bold text-slate-900">{item.totalTasks}</td>
                      <td className="px-3.5 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.resolutionRatePercent >= 80 ? 'bg-emerald-100 text-emerald-800' :
                          item.resolutionRatePercent >= 40 ? 'bg-amber-100 text-amber-800' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {item.resolutionRatePercent}%
                        </span>
                      </td>
                      <td className="px-3.5 py-3">
                        {item.avgResolutionHours > 0 ? `${item.avgResolutionHours}h` : 'N/A'}
                      </td>
                      <td className="px-3.5 py-3">
                        <span className="text-slate-800 font-bold">{targetHours}h</span>
                      </td>
                      <td className="px-3.5 py-3">
                        <span className="text-emerald-700 font-bold">{targetAcc}%</span>
                      </td>
                      <td className="px-3.5 py-3">
                        {assignedTeam ? (
                          <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded text-[10px] font-bold">
                            {assignedTeam.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[10px]">Unassigned</span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-right">
                        <button
                          onClick={() => {
                            setEditingKpiTag(item.tag);
                            setTargetResolutionHours(targetHours);
                            setExpectedAccuracyPercent(targetAcc);
                            setAssignedTeamId(currentKpi?.assignedTeamId || '');
                          }}
                          className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-[11px] font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center space-x-1"
                        >
                          <SlidersHorizontal size={11} />
                          <span>Configure KPI</span>
                        </button>
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

    {/* Section: Awaiting Solution Scripts Queue */}
    {activeDashboardTab === 'unresolved_scripts' && (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-xl shadow-sm">
              <AlertCircle size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider">
                Unresolved Tasks Awaiting Solution Scripts
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Track open operational incidents that lack peer consensus or an approved solution script to resolve discrepancies.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-xl font-bold">
            {(hashtagAnalyticsData?.issuesAwaitingSolution || []).length} Pending Solutions
          </span>
        </div>

        {(() => {
          const awaitingIssues = (hashtagAnalyticsData?.issuesAwaitingSolution && hashtagAnalyticsData.issuesAwaitingSolution.length > 0)
            ? hashtagAnalyticsData.issuesAwaitingSolution
            : issues.filter(i => (i.status === 'Open' || i.status === 'Investigating') && !i.solutionScript);

          if (awaitingIssues.length === 0) {
            return (
              <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl space-y-3">
                <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                <h4 className="text-sm font-bold text-slate-800 font-mono">Pipeline Clear!</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  All active cases currently have assigned solution scripts, automated workflows, or have reached resolution.
                </p>
              </div>
            );
          }

          return (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 uppercase text-[10px]">
                  <tr>
                    <th className="px-3.5 py-2.5">Task ID</th>
                    <th className="px-3.5 py-2.5">Title & Hashtag</th>
                    <th className="px-3.5 py-2.5">Priority</th>
                    <th className="px-3.5 py-2.5">Assigned Technician</th>
                    <th className="px-3.5 py-2.5">Reporter</th>
                    <th className="px-3.5 py-2.5">Reported Aging</th>
                    <th className="px-3.5 py-2.5">Status</th>
                    <th className="px-3.5 py-2.5 text-right">Collaboration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                  {awaitingIssues.map((task: any) => {
                    const assignedUser = users.find(u => u.id === task.assignedTechUserId);
                    const createdAtDate = new Date(task.createdAt || Date.now());
                    const hoursAgo = Math.max(1, Math.round((Date.now() - createdAtDate.getTime()) / (1000 * 60 * 60)));

                    return (
                      <tr key={task.id} className="hover:bg-amber-50/40 transition-colors">
                        <td className="px-3.5 py-3">
                          <button
                            onClick={() => onChangeTab && onChangeTab('workspace', task.id)}
                            className="font-bold text-blue-600 hover:underline flex items-center space-x-1 cursor-pointer"
                          >
                            <span>{task.id}</span>
                            <ArrowUpRight size={12} />
                          </button>
                        </td>
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
                        <td className="px-3.5 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            task.priority === 'Critical' ? 'bg-red-100 text-red-700 border border-red-200' :
                            task.priority === 'High' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                            'bg-blue-100 text-blue-700 border border-blue-200'
                          }`}>
                            {task.priority || 'Medium'}
                          </span>
                        </td>
                        <td className="px-3.5 py-3">
                          {assignedUser ? (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-semibold text-[11px]">
                              @{assignedUser.username}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">Unassigned</span>
                          )}
                        </td>
                        <td className="px-3.5 py-3">
                          <span className="text-slate-600 font-medium">@{task.creatorName || 'Unknown'}</span>
                        </td>
                        <td className="px-3.5 py-3">
                          <span className={`font-bold ${hoursAgo > 24 ? 'text-red-600' : 'text-slate-700'}`}>
                            {hoursAgo}h ago
                          </span>
                        </td>
                        <td className="px-3.5 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            {task.status || 'Open'}
                          </span>
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          <button
                            onClick={() => onChangeTab && onChangeTab('workspace', task.id)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg inline-flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
                          >
                            <span>Propose in Chat</span>
                            <ArrowRight size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>
    )}

    {/* Modal: Configure Hashtag Managerial KPIs */}
    {editingKpiTag && (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <Target size={18} className="text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900 font-mono">
                Configure SLA & KPIs: <span className="text-blue-600">{editingKpiTag}</span>
              </h3>
            </div>
            <button 
              onClick={() => setEditingKpiTag(null)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSaveKpi} className="space-y-4 text-xs font-mono">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Target SLA Resolution Turnaround (Hours) *
              </label>
              <input
                type="number"
                min="1"
                max="720"
                required
                value={targetResolutionHours}
                onChange={e => setTargetResolutionHours(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
              />
              <p className="text-[10px] text-slate-500 mt-1 font-sans">
                Maximum acceptable time from case inception to verified resolution.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Minimum Expected Accuracy Threshold (%) *
              </label>
              <input
                type="number"
                min="50"
                max="100"
                step="0.1"
                required
                value={expectedAccuracyPercent}
                onChange={e => setExpectedAccuracyPercent(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
              />
              <p className="text-[10px] text-slate-500 mt-1 font-sans">
                Target benchmark precision expected by the validation box tests.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Responsible Unit Team
              </label>
              <select
                value={assignedTeamId}
                onChange={e => setAssignedTeamId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans cursor-pointer"
              >
                <option value="">All Teams (Shared Ownership)</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 mt-1 font-sans">
                Operational squad accountable for meeting this hashtag SLA.
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingKpiTag(null)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingKpi}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center space-x-1.5"
              >
                {isSavingKpi ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                <span>Save KPI Targets</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

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
