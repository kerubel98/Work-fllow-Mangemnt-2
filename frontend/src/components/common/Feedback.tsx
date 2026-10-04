/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Modal } from './Overlay';
import { Button } from './Button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  /** May be async; the dialog stays open and shows a spinner until it settles. */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}) => {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      size="sm"
      closeOnBackdrop={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={handleConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3 text-sm text-ds-muted">
        {tone === 'danger' && (
          <AlertTriangle size={18} className="shrink-0 text-ds-danger mt-0.5" aria-hidden="true" />
        )}
        <div>{message}</div>
      </div>
    </Modal>
  );
};

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  description?: string;
  error?: string;
  children: React.ReactNode;
}

/** Label + helper text + inline error, wired with htmlFor. Pass the input an id equal to `htmlFor`. */
export const FormField: React.FC<FormFieldProps> = ({ label, htmlFor, required, description, error, children }) => (
  <div className="space-y-1.5">
    <label htmlFor={htmlFor} className="block text-sm font-medium text-ds-text">
      {label}
      {required && (
        <span className="ml-0.5 text-ds-danger" aria-hidden="true">
          *
        </span>
      )}
      {required && <span className="sr-only"> (required)</span>}
    </label>
    {children}
    {description && !error && <p className="text-xs text-ds-muted">{description}</p>}
    {error && (
      <p role="alert" className="text-xs text-ds-danger">
        {error}
      </p>
    )}
  </div>
);

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/** What happened + what to do next. Keep raw technical errors out of `message`. */
export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message = 'The request could not be completed. Your data has not been changed.',
  onRetry,
  className = '',
}) => (
  <div
    role="alert"
    className={`flex flex-col items-center justify-center p-8 text-center rounded-ds-lg border border-ds-danger/30 bg-ds-danger/5 ${className}`}
  >
    <AlertTriangle size={22} className="text-ds-danger mb-2" aria-hidden="true" />
    <h3 className="text-sm font-semibold text-ds-text mb-1">{title}</h3>
    <p className="text-xs text-ds-muted max-w-sm mb-3">{message}</p>
    {onRetry && (
      <Button size="sm" variant="secondary" leftIcon={<RefreshCw size={12} aria-hidden="true" />} onClick={onRetry}>
        Try again
      </Button>
    )}
  </div>
);
