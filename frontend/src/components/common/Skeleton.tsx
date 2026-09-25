/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`shimmer-effect rounded-md ${className}`} />
);

export const SkeletonCard: React.FC = () => (
  <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs flex flex-col space-y-3">
    <div className="flex items-center justify-between">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-8 rounded-lg" />
    </div>
    <Skeleton className="h-8 w-20" />
    <div className="flex items-center gap-2 pt-1">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-24" />
    </div>
  </div>
);

export const SkeletonRow: React.FC<{ cols?: number }> = ({ cols = 5 }) => (
  <tr className="border-b border-slate-100 animate-pulse">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="px-4 py-3.5">
        <Skeleton className="h-3.5 w-full max-w-[120px]" />
      </td>
    ))}
  </tr>
);

export const SkeletonTable: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 5,
}) => (
  <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-xs">
    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-8 w-48 rounded-lg" />
    </div>
    <table className="w-full">
      <thead>
        <tr className="border-b border-slate-100 bg-slate-50/50">
          {Array.from({ length: cols }).map((_, i) => (
            <th key={i} className="px-4 py-3">
              <Skeleton className="h-3 w-20" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} cols={cols} />
        ))}
      </tbody>
    </table>
  </div>
);

export default Skeleton;
