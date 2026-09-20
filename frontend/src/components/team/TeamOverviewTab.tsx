import React from 'react';
import { Team, User, TeamTask, TeamDiscussionMessage, DatabaseConnection } from '../../types';
import { 
  Users, CheckSquare, MessageSquare, Database, ArrowRight, 
  Clock, CheckCircle2, AlertCircle, Calendar, MessageCircle, Crown, Shield
} from 'lucide-react';

interface TeamOverviewTabProps {
  currentTeam: Team;
  teamUsers: User[];
  teamTasks: TeamTask[];
  teamMessages: TeamDiscussionMessage[];
  teamDatabases: DatabaseConnection[];
  currentUser: User;
  onNavigateTab: (tab: 'members' | 'tasks' | 'discussion' | 'resources') => void;
  onOpenPersonalChat?: (userId: string) => void;
  onUpdateTaskStatus?: (taskId: string, status: 'To Do' | 'In Progress' | 'Done') => void;
}

export const TeamOverviewTab: React.FC<TeamOverviewTabProps> = ({
  currentTeam,
  teamUsers = [],
  teamTasks = [],
  teamMessages = [],
  teamDatabases = [],
  currentUser,
  onNavigateTab,
  onOpenPersonalChat,
  onUpdateTaskStatus
}) => {
  const safeUsers = Array.isArray(teamUsers) ? teamUsers : [];
  const safeTasks = Array.isArray(teamTasks) ? teamTasks : [];
  const safeMessages = Array.isArray(teamMessages) ? teamMessages : [];
  const safeDatabases = Array.isArray(teamDatabases) ? teamDatabases : [];

  const todoTasks = safeTasks.filter(t => t.status === 'To Do');
  const inProgressTasks = safeTasks.filter(t => t.status === 'In Progress');
  const doneTasks = safeTasks.filter(t => t.status === 'Done');
  const completionRate = safeTasks.length > 0 ? Math.round((doneTasks.length / safeTasks.length) * 100) : 0;
  const recentMessages = [...safeMessages].reverse().slice(0, 3);
  const activeTasks = [...inProgressTasks, ...todoTasks].slice(0, 4);

  return (
    <div className="space-y-4 font-sans" id="team-overview-tab">
      {/* 1. Top 4 Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Members Card */}
        <div 
          onClick={() => onNavigateTab('members')}
          className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs hover:border-blue-400 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-mono uppercase font-bold text-slate-500">Team Members</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Users size={14} />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-slate-900">{safeUsers.length}</span>
            <span className="text-xs text-slate-400 font-mono">active</span>
          </div>
          <div className="mt-2 text-[11px] text-blue-600 font-medium flex items-center gap-1 group-hover:underline">
            <span>View Roster</span>
            <ArrowRight size={11} />
          </div>
        </div>

        {/* Tasks Card */}
        <div 
          onClick={() => onNavigateTab('tasks')}
          className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs hover:border-emerald-400 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-mono uppercase font-bold text-slate-500">Task Velocity</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <CheckSquare size={14} />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-slate-900">{inProgressTasks.length + todoTasks.length}</span>
            <span className="text-xs text-slate-400 font-mono">open ({completionRate}% done)</span>
          </div>
          <div className="mt-2 text-[11px] text-emerald-600 font-medium flex items-center gap-1 group-hover:underline">
            <span>Open Task Board</span>
            <ArrowRight size={11} />
          </div>
        </div>

        {/* Discussions Card */}
        <div 
          onClick={() => onNavigateTab('discussion')}
          className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs hover:border-purple-400 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-mono uppercase font-bold text-slate-500">Discussion</span>
            <div className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <MessageSquare size={14} />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-slate-900">{safeMessages.length}</span>
            <span className="text-xs text-slate-400 font-mono">messages</span>
          </div>
          <div className="mt-2 text-[11px] text-purple-600 font-medium flex items-center gap-1 group-hover:underline">
            <span>Join Conversation</span>
            <ArrowRight size={11} />
          </div>
        </div>

        {/* Resources Card */}
        <div 
          onClick={() => onNavigateTab('resources')}
          className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs hover:border-amber-400 hover:shadow-sm transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-mono uppercase font-bold text-slate-500">Resources</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <Database size={14} />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-slate-900">{safeDatabases.length}</span>
            <span className="text-xs text-slate-400 font-mono">connections</span>
          </div>
          <div className="mt-2 text-[11px] text-amber-600 font-medium flex items-center gap-1 group-hover:underline">
            <span>Inspect Resources</span>
            <ArrowRight size={11} />
          </div>
        </div>
      </div>

      {/* 2. Middle Section: Quick Roster + Recent Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick Roster (1 Column) */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
            <div className="flex items-center space-x-2">
              <Users size={15} className="text-blue-600" />
              <h3 className="text-xs font-bold font-mono uppercase text-slate-800">Team Roster</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('members')}
              className="text-[11px] text-[#155DFC] hover:underline font-bold"
            >
              All ({safeUsers.length})
            </button>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-72">
            {safeUsers.slice(0, 5).map(member => {
              const isLead = currentTeam?.managerId === member.id;
              const isSelf = currentUser && member.id === currentUser.id;

              return (
                <div 
                  key={member.id} 
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-50/70 hover:bg-slate-100/80 transition-colors"
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                      isLead 
                        ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                        : isSelf
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}>
                      {member.username.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="text-xs font-bold text-slate-800 truncate font-mono">
                          @{member.username}
                        </span>
                        {isLead && (
                          <Crown size={11} className="text-amber-600 shrink-0" title="Team Lead" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 truncate">{member.email}</p>
                    </div>
                  </div>

                  {!isSelf && onOpenPersonalChat && (
                    <button
                      type="button"
                      onClick={() => onOpenPersonalChat(member.id)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer shrink-0"
                      title={`Chat with @${member.username}`}
                    >
                      <MessageCircle size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Tasks (2 Columns) */}
        <div className="lg:col-span-2 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
            <div className="flex items-center space-x-2">
              <CheckSquare size={15} className="text-emerald-600" />
              <h3 className="text-xs font-bold font-mono uppercase text-slate-800">Active Deliverables</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('tasks')}
              className="text-[11px] text-[#155DFC] hover:underline font-bold"
            >
              View Board
            </button>
          </div>

          {activeTasks.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400">
              <CheckCircle2 size={24} className="text-emerald-500 mb-1" />
              <p className="text-xs font-medium">All deliverables completed!</p>
            </div>
          ) : (
            <div className="space-y-2 flex-1 overflow-y-auto max-h-72">
              {activeTasks.map(task => {
                const isUrgent = task.priority === 'Critical' || task.priority === 'High';

                return (
                  <div 
                    key={task.id}
                    className="p-2.5 rounded-xl border border-slate-200/80 hover:border-slate-300 bg-white flex items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-md ${
                          task.status === 'In Progress' 
                            ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {task.status}
                        </span>
                        <span className={`text-[10px] font-mono font-bold ${
                          isUrgent ? 'text-red-600' : 'text-slate-500'
                        }`}>
                          {task.priority || 'Normal'}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-800 mt-1 truncate">{task.title}</p>
                      {task.assigneeName && (
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">Assigned to: @{task.assigneeName}</p>
                      )}
                    </div>

                    {onUpdateTaskStatus && (
                      <div className="flex items-center space-x-1 shrink-0">
                        {task.status !== 'Done' && (
                          <button
                            type="button"
                            onClick={() => onUpdateTaskStatus(task.id, task.status === 'To Do' ? 'In Progress' : 'Done')}
                            className="px-2 py-1 text-[10px] font-mono font-bold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700"
                          >
                            {task.status === 'To Do' ? 'Start' : 'Complete'}
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
      </div>

      {/* 3. Bottom Section: Recent Discussion Stream */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
        <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
          <div className="flex items-center space-x-2">
            <MessageSquare size={15} className="text-purple-600" />
            <h3 className="text-xs font-bold font-mono uppercase text-slate-800">Recent Discussion Activity</h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('discussion')}
            className="text-[11px] text-[#155DFC] hover:underline font-bold"
          >
            Open Chat
          </button>
        </div>

        {recentMessages.length === 0 ? (
          <p className="text-xs text-slate-400 py-3 text-center">No discussion messages yet.</p>
        ) : (
          <div className="space-y-2.5">
            {recentMessages.map(msg => (
              <div key={msg.id} className="p-2.5 rounded-xl bg-slate-50/70 flex items-start space-x-2.5 text-xs">
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-800 font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                  {msg.senderName?.substring(0, 2).toUpperCase() || 'TM'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-900 font-mono text-xs">@{msg.senderName}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-slate-700 mt-0.5 text-xs line-clamp-2">{msg.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
