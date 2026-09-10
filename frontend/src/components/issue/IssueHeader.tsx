import React from 'react';
import { Issue, IssueStatus, IssuePriority, User, UserRole } from '../../types';
import { 
  AlertCircle, CheckCircle2, Clock, UserCheck, ShieldAlert, 
  Trash2, ArrowLeft, Tag, Calendar, User as UserIcon, CheckCircle
} from 'lucide-react';

interface IssueHeaderProps {
  issue: Issue;
  currentUser: User;
  users: User[];
  onUpdateIssue: (issueId: string, updates: Partial<Issue>) => void;
  onDeleteIssue?: (issueId: string) => void;
  onBackToList?: () => void;
}

export default function IssueHeader({
  issue,
  currentUser,
  users,
  onUpdateIssue,
  onDeleteIssue,
  onBackToList
}: IssueHeaderProps) {
  const technicalUsers = users.filter(u => u.role === 'technical' || u.role === 'admin');

  const getStatusColor = (status: IssueStatus) => {
    switch (status) {
      case 'Open':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'Investigating':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Resolved':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'Closed':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getPriorityColor = (priority: IssuePriority) => {
    switch (priority) {
      case 'Critical':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'High':
        return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'Medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'Low':
        return 'bg-green-100 text-green-700 border-green-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const handleStatusChange = (newStatus: IssueStatus) => {
    onUpdateIssue(issue.id, { status: newStatus });
  };

  const handlePriorityChange = (newPriority: IssuePriority) => {
    onUpdateIssue(issue.id, { priority: newPriority });
  };

  const handleAssigneeChange = (userId: string) => {
    const selected = users.find(u => u.id === userId);
    onUpdateIssue(issue.id, {
      assignedTechUserId: userId,
      assignedTechUserName: selected?.username || ''
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 lg:p-6 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left Side: Navigation Back + Title + Meta */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {onBackToList && (
              <button
                onClick={onBackToList}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
                title="Back to all cases"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <span className="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-800 text-white shadow-sm">
              #{issue.id}
            </span>
            {issue.linkedHashtag && (
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                <Tag className="w-3 h-3" />
                {issue.linkedHashtag}
              </span>
            )}
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(issue.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <UserIcon className="w-3 h-3" />
              Creator: <strong className="text-slate-600 font-medium">@{issue.creatorName}</strong>
            </span>
          </div>

          <h1 className="text-xl lg:text-2xl font-bold text-slate-900 leading-snug">
            {issue.title}
          </h1>

          {issue.description && (
            <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
              {issue.description}
            </p>
          )}
        </div>

        {/* Right Side: Selectors & Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status Dropdown */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Status
            </label>
            <select
              value={issue.status}
              onChange={(e) => handleStatusChange(e.target.value as IssueStatus)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm ${getStatusColor(issue.status)}`}
            >
              <option value="Open">Open</option>
              <option value="Investigating">Investigating</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          {/* Priority Dropdown */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Priority
            </label>
            <select
              value={issue.priority}
              onChange={(e) => handlePriorityChange(e.target.value as IssuePriority)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm ${getPriorityColor(issue.priority)}`}
            >
              <option value="Low">Low Priority</option>
              <option value="Medium">Medium Priority</option>
              <option value="High">High Priority</option>
              <option value="Critical">Critical</option>
            </select>
          </div>

          {/* Assigned Tech Resolver */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Assigned Resolver
            </label>
            <select
              value={issue.assignedTechUserId || ''}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm"
            >
              <option value="">Unassigned</option>
              {technicalUsers.map(u => (
                <option key={u.id} value={u.id}>
                  @{u.username} ({u.role})
                </option>
              ))}
            </select>
          </div>

          {/* Delete Action (Admin only) */}
          {(currentUser.role === 'admin' || currentUser.username === 'admin') && onDeleteIssue && (
            <div className="self-end">
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Are you sure you want to delete Case #${issue.id}?`)) {
                    onDeleteIssue(issue.id);
                  }
                }}
                className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition"
                title="Delete Case"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
