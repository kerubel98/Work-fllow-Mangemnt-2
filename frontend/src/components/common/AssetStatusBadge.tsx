import React from 'react';
import { ShieldCheck, FlaskConical, FileEdit, XCircle, Lock } from 'lucide-react';

export interface AssetStatusBadgeProps {
  status: 'DRAFT' | 'PENDING_CHECKER_TEST' | 'APPROVED' | 'DECLINED' | string;
  isLocked?: boolean;
  approvedByName?: string;
  className?: string;
  showText?: boolean;
}

export const AssetStatusBadge: React.FC<AssetStatusBadgeProps> = ({
  status,
  isLocked,
  approvedByName,
  className = '',
  showText = true
}) => {
  const normalizedStatus = (status || 'DRAFT').toUpperCase();

  if (normalizedStatus === 'APPROVED') {
    return (
      <span
        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 ${className}`}
        title={`Approved & locked for production ${approvedByName ? `by @${approvedByName}` : ''}`}
      >
        <ShieldCheck size={11} className="text-emerald-400 shrink-0" />
        {showText && <span>Approved</span>}
        {isLocked && <Lock size={9} className="text-emerald-300 ml-0.5 opacity-80" />}
      </span>
    );
  }

  if (normalizedStatus === 'PENDING_CHECKER_TEST') {
    return (
      <span
        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse ${className}`}
        title="Pending Checker test run in Team Resource Center"
      >
        <FlaskConical size={11} className="text-amber-400 shrink-0" />
        {showText && <span>Pending Test</span>}
      </span>
    );
  }

  if (normalizedStatus === 'DECLINED') {
    return (
      <span
        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30 ${className}`}
        title="Declined by Checker. Revisions needed."
      >
        <XCircle size={11} className="text-rose-400 shrink-0" />
        {showText && <span>Declined</span>}
      </span>
    );
  }

  // Default: DRAFT / PERSONAL
  return (
    <span
      className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide uppercase bg-slate-700/50 text-slate-300 border border-slate-600/50 ${className}`}
      title="Personal draft / Not verified for production"
    >
      <FileEdit size={11} className="text-slate-400 shrink-0" />
      {showText && <span>Draft</span>}
    </span>
  );
};
