/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-all duration-150 rounded-lg cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98]';

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5 h-7',
    md: 'text-sm px-3.5 py-2 gap-2 h-9',
    lg: 'text-sm px-5 py-2.5 gap-2.5 h-11',
  }[size];

  const variantClasses = {
    primary:
      'bg-gradient-to-r from-[#3b6cff] to-[#2a5aee] text-white shadow-sm hover:shadow-[0_4px_16px_rgba(59,108,255,0.35)] hover:from-[#4374ff] hover:to-[#3161f3] focus:ring-[#3b6cff]/40 border-0',
    secondary:
      'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 focus:ring-slate-300',
    outline:
      'bg-transparent hover:bg-[#3b6cff]/10 text-[#3b6cff] border border-[#3b6cff]/40 focus:ring-[#3b6cff]/30',
    ghost:
      'bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900 border-0 focus:ring-slate-200',
    danger:
      'bg-gradient-to-r from-[#ef4444] to-[#dc2626] text-white shadow-sm hover:shadow-[0_4px_16px_rgba(239,68,68,0.35)] hover:from-[#f85151] hover:to-[#e02e2e] focus:ring-[#ef4444]/40 border-0',
  }[variant];

  return (
    <button
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 size={size === 'sm' ? 12 : 15} className="animate-spin" />
      ) : (
        leftIcon && <span className="flex-shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
    </button>
  );
};

export default Button;
