/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Team, User, TeamTask, TeamDiscussionMessage, DatabaseConnection, Issue } from '../../types';
import { 
  Users, CheckSquare, MessageSquare, Database, ArrowRight, 
  Clock, CheckCircle2, AlertCircle, Calendar, MessageCircle, Crown, Shield,
  TrendingUp, AlertTriangle, Briefcase, Zap, Check, ArrowUpRight, BarChart2, 
  Activity, Filter, Flag, ShieldCheck, Mail, Sparkles, Plus, ExternalLink, ChevronRight,
  PieChart, Layers
} from 'lucide-react';

interface TeamOverviewTabProps {
  currentTeam: Team;
  teamUsers: User[];
  teamTasks: TeamTask[];
  teamMessages: TeamDiscussionMessage[];
  teamDatabases: DatabaseConnection[];
  issues?: Issue[];
  currentUser: User;
  onNavigateTab: (tab: 'members' | 'tasks' | 'discussion' | 'resources' | 'mailbox' | 'reports') => void;
  onOpenPersonalChat?: (userId: string) => void;
  onUpdateTaskStatus?: (taskId: string, status: 'To Do' | 'In Progress' | 'Done') => void;
  onOpenIssueInWorkspace?: (issueId: string) => void;
  onAddTaskClick?: () => void;
}

export const TeamOverviewTab: React.FC<TeamOverviewTabProps> = ({
  currentTeam,
  teamUsers = [],
  teamTasks = [],
  teamMessages = [],
  teamDatabases = [],
  issues = [],
  currentUser,
  onNavigateTab,
  onOpenPersonalChat,
  onUpdateTaskStatus,
  onOpenIssueInWorkspace,
  onAddTaskClick
}) => {
  const safeUsers = Array.isArray(teamUsers) ? teamUsers : [];
  const safeTasks = Array.isArray(teamTasks) ? teamTasks : [];
  const safeMessages = Array.isArray(teamMessages) ? teamMessages : [];
  const safeDatabases = Array.isArray(teamDatabases) ? teamDatabases : [];
  const safeIssues = Array.isArray(issues) ? issues : [];

  const [taskFilter, setTaskFilter] = useState<'ALL' | 'ACTIVE' | 'HIGH_PRIORITY'>('ACTIVE');

  // Compute Task Velocity & Metrics
  const todoTasks = safeTasks.filter(t => t.status === 'To Do');
  const inProgressTasks = safeTasks.filter(t => t.status === 'In Progress');
  const doneTasks = safeTasks.filter(t => t.status === 'Done');
  const openTasks = [...inProgressTasks, ...todoTasks];
  const completionRate = safeTasks.length > 0 ? Math.round((doneTasks.length / safeTasks.length) * 100) : 0;

  // Filter tasks for the active deliverables queue
  const displayTasks = useMemo(() => {
    if (taskFilter === 'HIGH_PRIORITY') {
      return safeTasks.filter(t => t.status !== 'Done' && (t.priority === 'Critical' || t.priority === 'High'));
    }
    if (taskFilter === 'ACTIVE') {
      return openTasks;
    }
    return safeTasks;
  }, [safeTasks, openTasks, taskFilter]);

  // Operational Issues / Cases bound or escalated to this team
  const teamIssues = useMemo(() => {
    return safeIssues.filter(iss => 
      iss.escalationTargetTeamId === currentTeam.id ||
      iss.assigneeId === currentTeam.id ||
      iss.title.toLowerCase().includes(currentTeam.name.toLowerCase().slice(0, 8)) ||
      (iss.status !== 'Resolved' && iss.status !== 'Closed')
    ).slice(0, 4);
  }, [safeIssues, currentTeam]);

  // 7-Day Resolution Velocity data (Mon-Sun)
  const weeklyThroughput = [
    { day: 'Mon', settled: 312, flagged: 18, pct: '94.5%' },
    { day: 'Tue', settled: 420, flagged: 14, pct: '96.8%' },
    { day: 'Wed', settled: 388, flagged: 22, pct: '94.6%' },
    { day: 'Thu', settled: 465, flagged: 9, pct: '98.1%' },
    { day: 'Fri', settled: 512, flagged: 15, pct: '97.1%' },
    { day: 'Sat', settled: 280, flagged: 6, pct: '97.9%' },
    { day: 'Sun', settled: 195, flagged: 4, pct: '98.0%' }
  ];

  // Discrepancy Category Breakdown
  const discrepancyCategories = [
    { label: 'Fee Rounding (< 50.00)', count: 142, amount: '$1,143.20', pct: 48, color: 'bg-blue-600', text: 'text-blue-600' },
    { label: 'Duplicate Auth Charges', count: 84, amount: '$695.80', pct: 28, color: 'bg-orange-500', text: 'text-orange-600' },
    { label: 'Timeout 99 / Stuck Pending', count: 48, amount: '$447.30', pct: 16, color: 'bg-purple-600', text: 'text-purple-600' },
    { label: 'Unmatched Account Number', count: 24, amount: '$198.70', pct: 8, color: 'bg-rose-500', text: 'text-rose-600' }
  ];

  return (
    <div className="space-y-6 font-sans pb-10" id="team-overview-tab">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. Core Operational KPI Metric Tiles                                */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Financial Settlement Volume */}
        <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-2 hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-mono uppercase font-bold text-slate-500 tracking-wider">Settlement Volume</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">$2,485,300</div>
            <p className="text-[11px] text-slate-400 mt-0.5">24 settlement batches verified today</p>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-emerald-600 font-bold font-mono">+12.4% vs last cycle</span>
            <span className="text-slate-400 font-mono">ETB / USD</span>
          </div>
        </div>

        {/* Metric 2: Discrepancy Resolution Rate */}
        <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-2 hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-mono uppercase font-bold text-slate-500 tracking-wider">Resolution Rate</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Zap size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">97.2%</div>
            <p className="text-[11px] text-slate-400 mt-0.5">142 auto-fixed · 6 awaiting checker</p>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>SLA Compliant</span>
            </span>
            <span className="text-slate-400 font-mono">Avg 14 min</span>
          </div>
        </div>

        {/* Metric 3: Task Delivery & Velocity */}
        <div 
          onClick={() => onNavigateTab('tasks')}
          className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-2 hover:border-orange-300 transition cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-mono uppercase font-bold text-slate-500 tracking-wider">Task Velocity</span>
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#F27421] flex items-center justify-center group-hover:bg-[#F27421] group-hover:text-white transition-colors">
              <CheckSquare size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">{openTasks.length} Deliverables</div>
            <p className="text-[11px] text-slate-400 mt-0.5">{inProgressTasks.length} in flight · {todoTasks.length} queued</p>
          </div>
          <div className="pt-2 border-t border-slate-100 space-y-1">
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-slate-500">Completion</span>
              <span className="text-slate-800 font-bold">{completionRate}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-[#F27421] h-1.5 rounded-full transition-all duration-300" 
                style={{ width: `${completionRate}%` }} 
              />
            </div>
          </div>
        </div>

        {/* Metric 4: Escalations & Incident Health */}
        <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-2 hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-mono uppercase font-bold text-slate-500 tracking-wider">Escalated Cases</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <AlertTriangle size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black font-mono text-slate-900">{teamIssues.length} Active</div>
            <p className="text-[11px] text-slate-400 mt-0.5">0 critical breaches · 1 under sandbox review</p>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-purple-600 font-semibold font-mono">Low Escalation Risk</span>
            <span className="text-slate-400 font-mono">SLA 100%</span>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. Operational Purpose Analytics: Discrepancy Split & Velocity     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Column (7 cols): Discrepancy & Dispute Breakdown */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-2">
                <PieChart size={16} className="text-[#F27421]" />
                <h3 className="text-xs font-bold font-mono uppercase text-slate-900 tracking-wider">
                  Discrepancy & Variance Breakdown
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">Total $2,485.00 flagged</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Categorization of financial variances intercepted by this team's validation pipelines.
            </p>
          </div>

          {/* Progress bar visual distribution */}
          <div className="space-y-3 pt-2">
            <div className="w-full flex h-3 rounded-full overflow-hidden bg-slate-100 shadow-inner">
              {discrepancyCategories.map((cat, idx) => (
                <div 
                  key={idx}
                  className={`${cat.color} transition-all`} 
                  style={{ width: `${cat.pct}%` }}
                  title={`${cat.label}: ${cat.pct}%`}
                />
              ))}
            </div>

            {/* Detailed Category Rows */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {discrepancyCategories.map((cat, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-1.5">
                      <span className={`w-2 h-2 rounded-full ${cat.color}`} />
                      <span className="text-xs font-bold text-slate-800">{cat.label}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 block pl-3.5">
                      {cat.count} cases · {cat.pct}% of total
                    </span>
                  </div>
                  <span className={`text-xs font-mono font-bold ${cat.text}`}>
                    {cat.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Governance Notice */}
          <div className="p-3 bg-orange-50/60 border border-orange-200/70 rounded-xl text-[11px] text-orange-900 flex items-center justify-between mt-2">
            <span className="font-medium">
              💡 <strong>76% automated:</strong> Fee rounding under $50.00 is resolved automatically via <code className="font-mono bg-white px-1.5 py-0.5 rounded text-orange-700">#SETTLEMENT_AMOUNT_ROUNDING</code>.
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('reports')}
              className="text-[#F27421] hover:underline font-bold text-xs shrink-0 pl-2 cursor-pointer"
            >
              Inspect
            </button>
          </div>
        </div>

        {/* Right Column (5 cols): 7-Day Resolution Velocity & Throughput */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-2">
                <BarChart2 size={16} className="text-blue-600" />
                <h3 className="text-xs font-bold font-mono uppercase text-slate-900 tracking-wider">
                  7-Day Settlement Velocity
                </h3>
              </div>
              <span className="text-[11px] font-mono font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Avg 96.7% Clean
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Daily transaction volume cleared vs. discrepancies flagged.
            </p>
          </div>

          {/* Interactive weekly bar columns */}
          <div className="grid grid-cols-7 gap-2 items-end h-40 pt-4 px-1">
            {weeklyThroughput.map((item, idx) => {
              const maxVal = 550;
              const barHeightPct = Math.min(100, Math.round((item.settled / maxVal) * 100));

              return (
                <div key={idx} className="flex flex-col items-center gap-1.5 group cursor-pointer">
                  {/* Tooltip on hover */}
                  <span className="text-[9px] font-mono font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.settled}
                  </span>
                  
                  {/* Bar */}
                  <div className="w-full bg-slate-100 rounded-t-lg h-28 flex flex-col justify-end p-0.5">
                    <div 
                      className="w-full bg-blue-600 hover:bg-blue-700 rounded-t-md transition-all group-hover:bg-[#F27421]" 
                      style={{ height: `${barHeightPct}%` }}
                    />
                  </div>

                  {/* Day label */}
                  <span className="text-[10px] font-mono font-semibold text-slate-600">
                    {item.day}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Peak Day: <strong>Friday (512 txns)</strong></span>
            <span className="font-mono text-slate-400">Total 2,501 Verified</span>
          </div>
        </div>

      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. Active Operational Deliverables & Escalated Cases                */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left: Active Deliverables (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <CheckSquare size={16} className="text-emerald-600" />
              <h3 className="text-xs font-bold font-mono uppercase text-slate-900 tracking-wider">
                Team Operational Deliverables ({safeTasks.length})
              </h3>
            </div>

            {/* Filter segmented buttons */}
            <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-[11px]">
              <button
                type="button"
                onClick={() => setTaskFilter('ACTIVE')}
                className={`px-2.5 py-0.5 rounded-lg font-semibold transition cursor-pointer ${
                  taskFilter === 'ACTIVE' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Active ({openTasks.length})
              </button>
              <button
                type="button"
                onClick={() => setTaskFilter('HIGH_PRIORITY')}
                className={`px-2.5 py-0.5 rounded-lg font-semibold transition cursor-pointer ${
                  taskFilter === 'HIGH_PRIORITY' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Urgent
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('tasks')}
                className="px-2.5 py-0.5 text-blue-600 hover:underline font-semibold cursor-pointer"
              >
                Board &rarr;
              </button>
            </div>
          </div>

          {displayTasks.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2 opacity-80" />
              <p className="text-xs font-semibold text-slate-700">No pending deliverables</p>
              <p className="text-[11px] text-slate-400 mt-0.5">All scheduled tasks for this operational cycle are complete.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayTasks.slice(0, 4).map(task => {
                const isUrgent = task.priority === 'Critical' || task.priority === 'High';

                return (
                  <div 
                    key={task.id}
                    className="p-3 rounded-xl border border-slate-200/80 hover:border-slate-300 bg-white flex items-center justify-between gap-3 shadow-2xs transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-md ${
                          task.status === 'In Progress' 
                            ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                            : task.status === 'Done'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {task.status}
                        </span>

                        <span className={`text-[10px] font-mono font-bold flex items-center gap-1 ${
                          isUrgent ? 'text-rose-600' : 'text-slate-500'
                        }`}>
                          {isUrgent && <AlertTriangle size={11} />}
                          <span>{task.priority || 'Normal'}</span>
                        </span>
                      </div>

                      <p className="text-xs font-bold text-slate-800 mt-1 truncate">{task.title}</p>
                      
                      <div className="flex items-center space-x-3 mt-1 text-[10px] text-slate-400 font-mono">
                        {task.assigneeName && (
                          <span>Assigned: @{task.assigneeName}</span>
                        )}
                        {task.dueDate && (
                          <span className="flex items-center gap-1">
                            <Calendar size={10} />
                            <span>Due: {new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {onUpdateTaskStatus && (
                      <div className="flex items-center space-x-1.5 shrink-0">
                        {task.status === 'To Do' && (
                          <button
                            type="button"
                            onClick={() => onUpdateTaskStatus(task.id, 'In Progress')}
                            className="px-2.5 py-1 text-[11px] font-mono font-bold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition cursor-pointer"
                          >
                            Start
                          </button>
                        )}
                        {task.status === 'In Progress' && (
                          <button
                            type="button"
                            onClick={() => onUpdateTaskStatus(task.id, 'Done')}
                            className="px-2.5 py-1 text-[11px] font-mono font-bold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition cursor-pointer flex items-center gap-1"
                          >
                            <Check size={11} />
                            <span>Complete</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Escalated Cases & Operational Queue (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <AlertTriangle size={16} className="text-purple-600" />
              <h3 className="text-xs font-bold font-mono uppercase text-slate-900 tracking-wider">
                Escalated Cases Queue
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              {teamIssues.length} open
            </span>
          </div>

          {teamIssues.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <ShieldCheck size={32} className="text-purple-500 mx-auto mb-2 opacity-80" />
              <p className="text-xs font-semibold text-slate-700">No escalated cases</p>
              <p className="text-[11px] text-slate-400 mt-0.5">All escalated disputes have been resolved.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {teamIssues.map(iss => (
                <div 
                  key={iss.id} 
                  className="p-3 rounded-xl border border-slate-200/70 hover:border-slate-300 bg-slate-50/60 flex items-center justify-between gap-3 shadow-2xs transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-bold font-mono text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {iss.id}
                      </span>
                      <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full ${
                        iss.priority === 'CRITICAL' || iss.priority === 'HIGH'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {iss.priority}
                      </span>
                    </div>

                    <p className="text-xs font-bold text-slate-800 mt-1 truncate">{iss.title}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      Escalated by @{iss.creatorName || 'operator'} · Status: {iss.status}
                    </p>
                  </div>

                  {onOpenIssueInWorkspace && (
                    <button
                      type="button"
                      onClick={() => onOpenIssueInWorkspace(iss.id)}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs shrink-0 flex items-center gap-1"
                      title="Inspect case in workspace"
                    >
                      <span>Inspect</span>
                      <ArrowRight size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 5. Team Operational Roster & On-Duty Shift                          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Users size={16} className="text-blue-600" />
            <h3 className="text-xs font-bold font-mono uppercase text-slate-900 tracking-wider">
              On-Duty Operational Roster ({safeUsers.length} Members)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('members')}
            className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Manage Team Roster</span>
            <ChevronRight size={13} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {safeUsers.map(member => {
            const isLead = currentTeam?.managerId === member.id;
            const isSelf = currentUser && member.id === currentUser.id;
            const memberTasks = safeTasks.filter(t => t.assigneeId === member.id && t.status !== 'Done');

            return (
              <div 
                key={member.id} 
                className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 flex items-center justify-between transition"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                    isLead 
                      ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                      : isSelf
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-200 text-slate-700'
                  }`}>
                    {member.username.substring(0, 2).toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-bold text-slate-900 truncate font-mono">
                        @{member.username}
                      </span>
                      {isLead && (
                        <Crown size={12} className="text-amber-600 shrink-0" title="Team Lead" />
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono block truncate">
                      {isLead ? 'Lead Supervisor' : (member.role ? member.role.replace('_', ' ') : 'Operator')}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {memberTasks.length} active tasks
                    </span>
                  </div>
                </div>

                {!isSelf && onOpenPersonalChat && (
                  <button
                    type="button"
                    onClick={() => onOpenPersonalChat(member.id)}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer shrink-0"
                    title={`Direct message @${member.username}`}
                  >
                    <MessageCircle size={15} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 6. Recent Discussion Activity Stream                                */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <MessageSquare size={16} className="text-purple-600" />
            <h3 className="text-xs font-bold font-mono uppercase text-slate-900 tracking-wider">
              Recent Team Discussions & Directives
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('discussion')}
            className="text-xs font-bold text-purple-600 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Open Team Discussion Room</span>
            <ChevronRight size={13} />
          </button>
        </div>

        {safeMessages.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No discussion messages recorded in this operational room yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[...safeMessages].reverse().slice(0, 3).map(msg => (
              <div key={msg.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 font-mono text-xs">@{msg.senderName}</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-slate-700 text-xs line-clamp-3 leading-relaxed">
                  {msg.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

export default TeamOverviewTab;
