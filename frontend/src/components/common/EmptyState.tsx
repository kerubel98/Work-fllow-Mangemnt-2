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
      role="status"
      className={`flex flex-col items-center justify-center p-8 text-center rounded-ds-lg bg-ds-surface/60 border border-dashed border-ds-border ${className}`}
    >
      <div className="w-12 h-12 rounded-ds-lg bg-ds-elevated flex items-center justify-center text-ds-muted mb-3">
        {icon || <Inbox size={22} aria-hidden="true" />}
      </div>
      <h3 className="text-sm font-semibold text-ds-text mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-ds-muted max-w-sm mb-4 leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
};

export default EmptyState;
