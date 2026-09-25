/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-xl bg-slate-50/50 border border-dashed border-slate-200 ${className}`}
    >
      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3 shadow-inner">
        {icon || <Inbox size={22} className="text-slate-400" />}
      </div>
      <h3 className="text-sm font-semibold text-slate-800 mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-slate-500 max-w-sm mb-4 leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
};

export default EmptyState;
