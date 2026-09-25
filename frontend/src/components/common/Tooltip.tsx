/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';

export interface TooltipProps {
  content: React.ReactNode;
  shortcut?: string;
  position?: 'right' | 'top' | 'bottom' | 'left';
  delayMs?: number;
  children: React.ReactNode;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  shortcut,
  position = 'right',
  delayMs = 250,
  children,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delayMs);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  const positionClasses = {
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  }[position];

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <div
          className={`absolute z-50 pointer-events-none whitespace-nowrap px-2 py-1 bg-slate-900/95 text-slate-100 text-[11px] font-medium rounded-md shadow-lg border border-slate-700/60 flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-100 ${positionClasses}`}
        >
          <span>{content}</span>
          {shortcut && (
            <kbd className="px-1 py-0.2 bg-slate-800 text-slate-400 rounded text-[9.5px] font-mono border border-slate-700">
              {shortcut}
            </kbd>
          )}
        </div>
      )}
    </div>
  );
};

export default Tooltip;
