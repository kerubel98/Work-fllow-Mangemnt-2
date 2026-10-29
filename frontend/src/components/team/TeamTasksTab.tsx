import React, { useState } from 'react';
import { Team, TeamTask, User, Issue } from '../../types';
import { 
  CheckSquare, Plus, Search, Filter, Calendar, 
  Trash2, User as UserIcon, ArrowRight, CheckCircle2, Clock,
  ExternalLink, Globe, List, Activity, Flag
} from 'lucide-react';
import { NoTasksEmptyState } from './TeamEmptyStates';

interface TeamTasksTabProps {
  currentTeam: Team;
  tasks: TeamTask[];
  teamUsers: User[];
  currentUser: User;
  onAddTaskClick: () => void;
  onUpdateTaskStatus: (taskId: string, status: 'To Do' | 'In Progress' | 'Done') => void;
  onDeleteTask: (taskId: string) => void;
  onOpenIssueInWorkspace?: (issueId: string) => void;
  onStageTask?: (issue: Issue) => void;
}

export const TeamTasksTab: React.FC<TeamTasksTabProps> = ({
  currentTeam,
  tasks = [],
  teamUsers = [],
  currentUser,
  onAddTaskClick,
  onUpdateTaskStatus,
  onDeleteTask,
  onOpenIssueInWorkspace,
  onStageTask
}) => {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeUsers = Array.isArray(teamUsers) ? teamUsers : [];
  const [searchKeyword, setSearchKeyword] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');

  const filteredTasks = safeTasks.filter(t => {
    if (searchKeyword.trim()) {
      const q = searchKeyword.toLowerCase();
      const matchTitle = (t.title || '').toLowerCase().includes(q);
      const matchDesc = (t.description || '').toLowerCase().includes(q);
      if (!matchTitle && !matchDesc) return false;
    }
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (assigneeFilter !== 'all' && t.assigneeId !== assigneeFilter) return false;
    return true;
  });

  const columns: Array<{ id: 'To Do' | 'In Progress' | 'Done'; label: string; icon: any }> = [
    { id: 'To Do', label: 'To do', icon: List },
    { id: 'In Progress', label: 'In progress', icon: Activity },
    { id: 'Done', label: 'Done', icon: CheckCircle2 }
  ];

  return (
    <div className="h-full min-h-0 flex flex-col space-y-4 font-sans px-0" id="team-tasks-tab">
      {/* Top Filter Bar matching 08_team_tasks.png */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter tasks..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-sans focus:outline-none focus:border-[#F27421] w-48 sm:w-56 text-slate-800 shadow-2xs"
            />
          </div>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-sans text-slate-700 focus:outline-none focus:border-[#F27421] shadow-2xs cursor-pointer"
          >
            <option value="all">All priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-sans text-slate-700 focus:outline-none focus:border-[#F27421] shadow-2xs cursor-pointer"
          >
            <option value="all">All assignees</option>
            {safeUsers.map(u => (
              <option key={u.id} value={u.id}>@{u.username}</option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-400 font-sans">
          {safeTasks.length} tasks · {safeTasks.filter(t => t.status === 'Done').length} completed
        </div>
      </div>

      {safeTasks.length === 0 ? (
        <NoTasksEmptyState onAddTask={onAddTaskClick} />
      ) : (
        /* Kanban Columns */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full min-h-0">
          {columns.map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.id);
            const IconComp = col.icon;

            return (
              <div
                key={col.id}
                className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-3.5 flex flex-col h-full min-h-[420px] overflow-hidden"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/60">
                  <div className="flex items-center space-x-2">
                    <IconComp size={14} className="text-slate-600" />
                    <h4 className="text-xs font-bold text-slate-800 font-sans">{col.label}</h4>
                  </div>
                  <span className="text-xs font-medium text-slate-500 font-sans">
                    {colTasks.length}
                  </span>
                </div>

                {/* Column Tasks */}
                <div className="space-y-2.5 flex-1 flex flex-col overflow-y-auto no-scrollbar pr-0.5">
                  {colTasks.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center p-6 text-center text-slate-400 text-xs font-sans">
                      No tasks yet
                    </div>
                  ) : (
                    colTasks.map(task => {
                      const isCritical = task.priority === 'Critical' || task.priority === 'High';
                      const sourceIssueId = (task as any).sourceIssueId;
                      const isOperationalPublic = (task as any).isOperationalPublicTask;
                      const isDoneCol = col.id === 'Done';

                      return (
                        <div 
                          key={task.id}
                          className="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-2xs hover:shadow-xs transition-all space-y-2 font-sans"
                        >
                          {/* Top row: ID and Priority / Done Badge */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono text-slate-400">
                              {sourceIssueId 
                                ? (sourceIssueId.startsWith('ISS-') ? sourceIssueId : `ISS-${sourceIssueId}`)
                                : (task.id.startsWith('task-') ? `ISS-${task.id.slice(5, 11)}` : task.id)}
                            </span>
                            <div className="flex items-center space-x-1">
                              {isDoneCol ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium font-sans bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                  Done
                                </span>
                              ) : task.priority ? (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium font-sans ${
                                  isCritical 
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200/60' 
                                    : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                                }`}>
                                  {task.priority}
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => onDeleteTask(task.id)}
                                className="text-slate-300 hover:text-red-500 transition-colors p-0.5 cursor-pointer"
                                title="Delete task"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>

                          {/* Title and Description */}
                          <div>
                            <h5 className="font-bold text-xs text-slate-900 leading-snug">
                              {task.title}
                            </h5>
                            {task.description && (
                              <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                                {task.description}
                              </p>
                            )}
                          </div>

                          {/* Bottom row: Assignee Avatar + Team public badge + Move controls */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                            <div className="flex items-center space-x-1.5">
                              <div className="w-5 h-5 rounded-full bg-[#0F142A] text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                {(task.assigneeName || currentUser.username || 'AD').slice(0, 2).toUpperCase()}
                              </div>
                              <span className="text-xs text-slate-500 font-sans">
                                @{task.assigneeName || currentUser.username}
                              </span>
                            </div>

                            <div className="flex items-center space-x-1.5">
                              {(isOperationalPublic || sourceIssueId) && (
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium font-sans">
                                  Team public
                                </span>
                              )}
                              {onStageTask && (sourceIssueId || task.priority === 'High' || task.priority === 'Critical') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const issueKey = sourceIssueId || (task.id.startsWith('task-') ? `ISS-${task.id.slice(5, 11)}` : task.id);
                                    const target: Issue = {
                                      id: issueKey,
                                      title: task.title || 'trn test',
                                      description: task.description || 'Settlement amount differences under 50.00 caused by fee rounding on the switch side.',
                                      priority: (task.priority as any) || 'High',
                                      status: 'Investigating',
                                      creatorId: task.creatorId || currentUser.id,
                                      creatorName: task.creatorName || currentUser.username,
                                      createdAt: task.createdAt || new Date().toISOString(),
                                      type: 'file',
                                      targetDb: 'Sett · MySQL',
                                      targetTable: 'sv_fin_tab',
                                      stagedEnvironment: 'SANDBOX' as any,
                                      chat: []
                                    };
                                    onStageTask(target);
                                  }}
                                  className="px-2 py-0.5 rounded-md bg-orange-50 hover:bg-[#F27421] text-orange-700 hover:text-white border border-orange-200 text-[10px] font-bold font-mono transition-all flex items-center space-x-1 cursor-pointer"
                                  title="Stage task into Level 2 Technician Investigation Workspace"
                                >
                                  <Flag size={10} />
                                  <span>Stage task →</span>
                                </button>
                              )}
                              {sourceIssueId && onOpenIssueInWorkspace && (
                                <button
                                  type="button"
                                  onClick={() => onOpenIssueInWorkspace(sourceIssueId)}
                                  className="text-slate-400 hover:text-blue-600 p-0.5 transition-colors cursor-pointer"
                                  title="Open in Workspace"
                                >
                                  <ExternalLink size={11} />
                                </button>
                              )}
                              {/* Move Controls */}
                              {col.id !== 'To Do' && (
                                <button
                                  type="button"
                                  onClick={() => onUpdateTaskStatus(task.id, col.id === 'Done' ? 'In Progress' : 'To Do')}
                                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold"
                                  title="Move Left"
                                >
                                  ←
                                </button>
                              )}
                              {col.id !== 'Done' && (
                                <button
                                  type="button"
                                  onClick={() => onUpdateTaskStatus(task.id, col.id === 'To Do' ? 'In Progress' : 'Done')}
                                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
                                  title="Move Right"
                                >
                                  →
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
