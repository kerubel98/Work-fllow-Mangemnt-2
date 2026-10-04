/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  /** Shows a spinner and disables the button (prevents duplicate submits). */
  loading?: boolean;
  /** @deprecated use `loading` */
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const BASE =
  'inline-flex items-center justify-center font-medium rounded-ds-md cursor-pointer select-none ' +
  'transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed';

const SIZES = {
  sm: 'text-xs px-2.5 gap-1.5 min-h-8',
  md: 'text-sm px-3.5 gap-2 min-h-9',
  lg: 'text-sm px-5 gap-2.5 min-h-11',
} as const;

const VARIANTS = {
  primary: 'bg-ds-primary text-ds-on-primary hover:bg-ds-primary-hover shadow-ds-sm',
  secondary: 'bg-ds-elevated text-ds-text border border-ds-border hover:border-ds-border-strong',
  outline: 'bg-transparent text-ds-primary border border-ds-primary/50 hover:bg-ds-primary/10',
  ghost: 'bg-transparent text-ds-muted hover:text-ds-text hover:bg-ds-elevated',
  danger: 'bg-ds-danger text-white hover:brightness-110 shadow-ds-sm',
} as const;

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading,
  isLoading,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  type = 'button',
  ...props
}) => {
  const busy = Boolean(loading ?? isLoading);

  return (
    <button
      type={type}
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? (
        <Loader2 size={size === 'sm' ? 12 : 15} className="animate-spin" aria-hidden="true" />
      ) : (
        leftIcon && <span className="flex-shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!busy && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
    </button>
  );
};

export default Button;
