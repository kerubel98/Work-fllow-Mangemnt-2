/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'elevated' | 'flat' | 'glass' | 'dark';
  topAccent?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'none';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'elevated',
  topAccent = 'none',
  padding = 'md',
  interactive = false,
  className = '',
  ...props
}) => {
  const baseClasses = 'relative rounded-xl transition-all duration-150 overflow-hidden';

  const variantClasses = {
    elevated:
      'bg-white border border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_8px_rgba(0,0,0,0.02)]',
    flat: 'bg-white border border-slate-200',
    glass:
      'backdrop-blur-xl bg-white/8 border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.12)] text-white',
    dark: 'bg-slate-900 border border-slate-800 text-slate-100 shadow-md',
  }[variant];

  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-6',
  }[padding];

  const interactiveClasses = interactive
    ? 'hover:border-slate-300 hover:shadow-md cursor-pointer hover:-translate-y-0.5'
    : '';

  const topAccentClasses = {
    none: '',
    blue: 'border-t-3 border-t-[#3b6cff]',
    green: 'border-t-3 border-t-emerald-500',
    amber: 'border-t-3 border-t-amber-500',
    red: 'border-t-3 border-t-rose-500',
    purple: 'border-t-3 border-t-purple-500',
  }[topAccent];

  return (
    <div
      className={`${baseClasses} ${variantClasses} ${paddingClasses} ${interactiveClasses} ${topAccentClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default Card;
