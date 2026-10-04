/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Escape-to-close, Tab focus trap, body scroll lock and focus restore for overlays. */
function useOverlayBehavior(open: boolean, onClose: () => void, panelRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const head = items[0] as HTMLElement;
      const tail = items[items.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Rendered in a sticky footer (e.g. action buttons). */
  footer?: React.ReactNode;
  /** Clicking the backdrop closes the dialog. Disable for forms with unsaved input. */
  closeOnBackdrop?: boolean;
  children?: React.ReactNode;
}

const MODAL_WIDTH = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  closeOnBackdrop = true,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useOverlayBehavior(open, onClose, panelRef);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[var(--ds-overlay)] backdrop-blur-sm ds-fade-in"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`relative w-full ${MODAL_WIDTH[size]} max-h-[90vh] flex flex-col rounded-ds-lg border border-ds-border bg-ds-surface text-ds-text shadow-ds-overlay ds-pop-in`}
      >
        <header className="shrink-0 flex items-start justify-between gap-4 px-5 py-4 border-b border-ds-border">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold truncate">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-sm text-ds-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="shrink-0 p-1.5 rounded-ds-sm text-ds-muted hover:text-ds-text hover:bg-ds-elevated transition-colors"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-ds-border">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
};

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  width?: 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

const DRAWER_WIDTH = { md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-3xl' } as const;

export const Drawer: React.FC<DrawerProps> = ({
  open,
  onClose,
  title,
  description,
  width = 'lg',
  footer,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlayBehavior(open, onClose, panelRef);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-[var(--ds-overlay)] backdrop-blur-sm ds-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative h-full w-full ${DRAWER_WIDTH[width]} flex flex-col border-l border-ds-border bg-ds-surface text-ds-text shadow-ds-overlay ds-slide-in-right`}
      >
        <header className="shrink-0 flex items-start justify-between gap-4 px-5 py-4 border-b border-ds-border">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold truncate">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-ds-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="shrink-0 p-1.5 rounded-ds-sm text-ds-muted hover:text-ds-text hover:bg-ds-elevated transition-colors"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-ds-border">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
};
