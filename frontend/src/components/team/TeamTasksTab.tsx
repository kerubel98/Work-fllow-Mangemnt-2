import React, { useState } from 'react';
import { Team, TeamTask, User } from '../../types';
import { 
  CheckSquare, Plus, Search, Filter, Calendar, 
  Trash2, User as UserIcon, ArrowRight, CheckCircle2, Clock
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
}

export const TeamTasksTab: React.FC<TeamTasksTabProps> = ({
  currentTeam,
  tasks = [],
  teamUsers = [],
  currentUser,
  onAddTaskClick,
  onUpdateTaskStatus,
  onDeleteTask
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

  const columns: Array<{ id: 'To Do' | 'In Progress' | 'Done'; label: string; icon: any; color: string }> = [
    { id: 'To Do', label: 'To Do', icon: Clock, color: 'text-slate-600 bg-slate-100' },
    { id: 'In Progress', label: 'In Progress', icon: ArrowRight, color: 'text-blue-600 bg-blue-50' },
    { id: 'Done', label: 'Done', icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' }
  ];

  return (
    <div className="space-y-4 font-sans" id="team-tasks-tab">
      {/* Top Filter and Action Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <CheckSquare size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-mono">Tasks & Deliverables</h3>
            <p className="text-[11px] text-slate-500 font-mono">
              {safeTasks.length} total tasks • {safeTasks.filter(t => t.status === 'Done').length} completed
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter tasks..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-blue-500 w-36 sm:w-44 text-slate-800"
            />
          </div>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Assignees</option>
            {safeUsers.map(u => (
              <option key={u.id} value={u.id}>@{u.username}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={onAddTaskClick}
            className="px-3.5 py-1.5 bg-[#155DFC] hover:bg-blue-700 text-white font-mono font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
          >
            <Plus size={13} />
            <span>Create Task</span>
          </button>
        </div>
      </div>

      {safeTasks.length === 0 ? (
        <NoTasksEmptyState onAddTask={onAddTaskClick} />
      ) : (
        /* Kanban Columns */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          {columns.map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.id);
            const IconComp = col.icon;

            return (
              <div 
                key={col.id} 
                className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-3 flex flex-col min-h-[300px]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200/60">
                  <div className="flex items-center space-x-2">
                    <span className={`p-1 rounded-md ${col.color}`}>
                      <IconComp size={13} />
                    </span>
                    <h4 className="text-xs font-bold font-mono text-slate-800 uppercase">{col.label}</h4>
                  </div>
                  <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                    {colTasks.length}
                  </span>
                </div>

                {/* Column Tasks */}
                <div className="space-y-2.5 flex-1">
                  {colTasks.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-xs font-mono">
                      No tasks in this lane
                    </div>
                  ) : (
                    colTasks.map(task => {
                      const isCritical = task.priority === 'Critical' || task.priority === 'High';

                      return (
                        <div 
                          key={task.id}
                          className="bg-white border border-slate-200/90 rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-xs text-slate-900 leading-snug">
                              {task.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => onDeleteTask(task.id)}
                              className="text-slate-300 hover:text-red-500 transition-colors p-1 cursor-pointer shrink-0"
                              title="Delete task"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>

                          {task.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-2">
                              {task.description}
                            </p>
                          )}

                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] font-mono">
                            <div className="flex items-center space-x-1.5">
                              {task.priority && (
                                <span className={`px-1.5 py-0.5 rounded font-bold ${
                                  isCritical 
                                    ? 'bg-red-50 text-red-700 border border-red-200' 
                                    : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {task.priority}
                                </span>
                              )}
                              {task.assigneeName && (
                                <span className="text-slate-500 truncate max-w-[100px]">
                                  @{task.assigneeName}
                                </span>
                              )}
                            </div>

                            {/* Move Status Buttons */}
                            <div className="flex items-center space-x-1">
                              {col.id !== 'To Do' && (
                                <button
                                  type="button"
                                  onClick={() => onUpdateTaskStatus(task.id, col.id === 'Done' ? 'In Progress' : 'To Do')}
                                  className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
                                  title="Move Left"
                                >
                                  ←
                                </button>
                              )}
                              {col.id !== 'Done' && (
                                <button
                                  type="button"
                                  onClick={() => onUpdateTaskStatus(task.id, col.id === 'To Do' ? 'In Progress' : 'Done')}
                                  className="px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold"
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
