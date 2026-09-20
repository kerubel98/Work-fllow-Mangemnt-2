import React from 'react';
import { Users, CheckSquare, MessageSquare, Database, ShieldCheck, Plus } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  id?: string;
}

export const TeamEmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  id
}) => {
  return (
    <div 
      id={id}
      className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl border border-slate-200/80 shadow-xs text-center min-h-[220px]"
    >
      <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-3">
        {icon || <Users size={22} />}
      </div>
      <h4 className="text-sm font-bold text-slate-800 font-mono tracking-tight">{title}</h4>
      <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3.5 px-3.5 py-1.5 bg-[#155DFC] hover:bg-blue-700 text-white font-mono font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
        >
          <Plus size={13} />
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
};

export const NoMembersEmptyState: React.FC<{ onAddMember?: () => void }> = ({ onAddMember }) => (
  <TeamEmptyState
    id="empty-members"
    icon={<Users size={22} />}
    title="No Team Members Found"
    description="This team currently has no members assigned. Add team members to collaborate on tasks and discussions."
    actionLabel="Add Member"
    onAction={onAddMember}
  />
);

export const NoTasksEmptyState: React.FC<{ onAddTask?: () => void }> = ({ onAddTask }) => (
  <TeamEmptyState
    id="empty-tasks"
    icon={<CheckSquare size={22} />}
    title="No Tasks in Backlog"
    description="Your team task board is clear. Create a task to track operational deliverables and milestones."
    actionLabel="Create Task"
    onAction={onAddTask}
  />
);

export const NoDiscussionEmptyState: React.FC = () => (
  <TeamEmptyState
    id="empty-discussion"
    icon={<MessageSquare size={22} />}
    title="No Discussion Messages Yet"
    description="Start the conversation! Post an update, ask a question, or coordinate workflows with your team."
  />
);

export const NoResourcesEmptyState: React.FC<{ onAddResource?: () => void }> = ({ onAddResource }) => (
  <TeamEmptyState
    id="empty-resources"
    icon={<Database size={22} />}
    title="No Team Resources Assigned"
    description="No databases or technical resources have been attached to this team workspace yet."
    actionLabel="Add Team Resource"
    onAction={onAddResource}
  />
);

export const NoApprovalsEmptyState: React.FC = () => (
  <TeamEmptyState
    id="empty-approvals"
    icon={<ShieldCheck size={22} />}
    title="All Approvals Cleared"
    description="There are no pending maker proposals or workspace setting reviews requiring team authorization."
  />
);
