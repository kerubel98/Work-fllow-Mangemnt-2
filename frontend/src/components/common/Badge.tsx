/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export type BadgeVariant =
  | 'open'
  | 'investigating'
  | 'resolved'
  | 'closed'
  | 'critical'
  | 'paused'
  | 'pending'
  | 'pass'
  | 'fail'
  | 'admin'
  | 'technical'
  | 'operational'
  | 'managerial'
  | 'default'
  | 'neutral';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant | string;
  size?: 'xs' | 'sm' | 'md';
  pulse?: boolean;
  dot?: boolean;
  icon?: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'sm',
  pulse = false,
  dot = false,
  icon,
  className = '',
  ...props
}) => {
  const normalizedVariant = (variant || '').toLowerCase();

  const getVariantStyles = (): { badge: string; dotColor: string } => {
    switch (normalizedVariant) {
      case 'open':
      case 'open_case':
      case 'p2':
      case 'medium':
        return {
          badge: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
          dotColor: 'bg-blue-500',
        };
      case 'investigating':
      case 'p1':
      case 'high':
      case 'warning':
        return {
          badge: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
          dotColor: 'bg-amber-500',
        };
      case 'resolved':
      case 'pass':
      case 'success':
        return {
          badge: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
          dotColor: 'bg-emerald-500',
        };
      case 'closed':
      case 'p3':
      case 'low':
        return {
          badge: 'bg-slate-100 text-slate-600 border-slate-200',
          dotColor: 'bg-slate-400',
        };
      case 'critical':
      case 'p0':
      case 'fail':
      case 'error':
        return {
          badge: 'bg-rose-500/10 text-rose-700 border-rose-500/25',
          dotColor: 'bg-rose-500',
        };
      case 'paused':
      case 'paused_db_offline':
        return {
          badge: 'bg-purple-500/10 text-purple-700 border-purple-500/20',
          dotColor: 'bg-purple-500',
        };
      case 'pending':
      case 'pending_checker_review':
        return {
          badge: 'bg-sky-500/10 text-sky-700 border-sky-500/20',
          dotColor: 'bg-sky-500',
        };
      case 'admin':
        return {
          badge: 'bg-rose-500/15 text-rose-600 border-rose-500/30',
          dotColor: 'bg-rose-500',
        };
      case 'technical':
        return {
          badge: 'bg-[#3b6cff]/15 text-[#3b6cff] border-[#3b6cff]/30',
          dotColor: 'bg-[#3b6cff]',
        };
      case 'operational':
        return {
          badge: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
          dotColor: 'bg-emerald-500',
        };
      case 'managerial':
        return {
          badge: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
          dotColor: 'bg-amber-500',
        };
      default:
        return {
          badge: 'bg-slate-100 text-slate-700 border-slate-200',
          dotColor: 'bg-slate-400',
        };
    }
  };

  const { badge, dotColor } = getVariantStyles();

  const sizeClasses = {
    xs: 'text-[9.5px] px-1.5 py-0.5 gap-1',
    sm: 'text-[11px] px-2 py-0.5 gap-1.5',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  }[size];

  const shouldPulse =
    pulse || normalizedVariant === 'critical' || normalizedVariant === 'investigating';
  const showDot = dot || shouldPulse;

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border transition-colors select-none ${sizeClasses} ${badge} ${className}`}
      {...props}
    >
      {showDot && (
        <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
          {shouldPulse && (
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor}`}
            />
          )}
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotColor}`} />
        </span>
      )}
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span className="capitalize">{children || variant}</span>
    </span>
  );
};

export default Badge;
