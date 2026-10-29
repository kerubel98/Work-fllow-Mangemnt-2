/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface DataTablePaginationProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  statusBadge?: React.ReactNode;
  className?: string;
}

export const DataTablePagination: React.FC<DataTablePaginationProps> = ({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 6, 7, 8, 9, 10, 12, 14, 15, 20, 25, 50],
  statusBadge,
  className = ''
}) => {
  const safePageSize = Math.max(1, Number(pageSize) || 7);
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safeCurrentPage = Math.min(Math.max(1, Number(currentPage) || 1), totalPages);

  const [pageInput, setPageInput] = React.useState(String(safeCurrentPage));
  const [rowsInput, setRowsInput] = React.useState(String(safePageSize));

  React.useEffect(() => {
    setPageInput(String(safeCurrentPage));
  }, [safeCurrentPage]);

  React.useEffect(() => {
    setRowsInput(String(safePageSize));
  }, [safePageSize]);

  const commitPage = () => {
    const parsed = parseInt(pageInput, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= totalPages) {
      if (parsed !== safeCurrentPage) {
        onPageChange(parsed);
      }
    } else {
      setPageInput(String(safeCurrentPage));
    }
  };

  const commitRows = () => {
    const parsed = parseInt(rowsInput, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 500) {
      if (parsed !== safePageSize) {
        onPageSizeChange?.(parsed);
      }
    } else {
      setRowsInput(String(safePageSize));
    }
  };

  const resolvedOptions = React.useMemo(() => {
    const set = new Set(pageSizeOptions);
    set.add(safePageSize);
    return Array.from(set).sort((a, b) => a - b);
  }, [pageSizeOptions, safePageSize]);
  
  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * safePageSize + 1;
  const endItem = Math.min(safeCurrentPage * safePageSize, totalItems);

  const canGoPrev = safeCurrentPage > 1;
  const canGoNext = safeCurrentPage < totalPages;

  return (
    <div
      className={`p-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 font-sans select-none bg-white shrink-0 ${className}`}
    >
      {/* Left Section: Record Count & Flexible Page Size Controls */}
      <div className="flex items-center space-x-3 flex-wrap gap-y-1">
        <span>
          Showing <strong className="font-mono text-slate-800">{startItem}</strong> -{' '}
          <strong className="font-mono text-slate-800">{endItem}</strong> of{' '}
          <strong className="font-mono text-slate-800">{totalItems}</strong> records
        </span>

        {onPageSizeChange && (
          <div className="flex items-center space-x-1.5 pl-3 border-l border-slate-200">
            <span className="text-[11px] text-slate-400 font-sans">Rows:</span>
            <div className="inline-flex items-center bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg p-0.5 focus-within:border-[#F27421] focus-within:ring-1 focus-within:ring-[#F27421] transition shadow-2xs">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={rowsInput}
                onChange={(e) => setRowsInput(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commitRows();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                onBlur={commitRows}
                className="w-8 h-5 text-center font-mono font-bold text-slate-900 bg-white border border-slate-200 rounded text-xs outline-none cursor-text shadow-2xs"
                title="Type any number of rows (e.g. 7, 8, 9, 12) and press Enter"
                aria-label="Custom rows per page"
              />
              <select
                value={safePageSize}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val > 0) {
                    setRowsInput(String(val));
                    onPageSizeChange(val);
                  }
                }}
                className="bg-transparent text-slate-600 hover:text-slate-900 text-[11px] font-sans font-medium px-1.5 py-0.5 outline-none cursor-pointer border-0"
                title="Select preset or type custom number"
                aria-label="Preset rows options"
              >
                {resolvedOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt} / page
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Right Section: Pagination Controls & Optional Status Badge */}
      <div className="flex items-center space-x-3">
        {statusBadge && (
          <div className="hidden sm:block mr-1">
            {statusBadge}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="inline-flex items-center space-x-1">
          {/* First Page Button */}
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={!canGoPrev}
            className="p-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
            title="First page"
          >
            <ChevronsLeft size={13} />
          </button>

          {/* Previous Page Button */}
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, safeCurrentPage - 1))}
            disabled={!canGoPrev}
            className="p-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
            title="Previous page"
          >
            <ChevronLeft size={13} />
          </button>

          {/* Adjustable Page Number Indicator */}
          <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 text-xs font-mono font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg shadow-2xs">
            <span className="text-slate-500 font-sans text-[11px]">Page</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitPage();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onBlur={commitPage}
              className="w-9 h-5 text-center font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded focus:border-[#F27421] focus:ring-1 focus:ring-[#F27421] outline-none transition text-xs shadow-2xs cursor-text"
              title="Click or type page number and press Enter"
              aria-label="Current page number"
            />
            <span className="text-slate-500 font-sans text-[11px]">
              of <strong className="font-mono text-slate-900 text-xs">{totalPages}</strong>
            </span>
          </div>

          {/* Next Page Button */}
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, safeCurrentPage + 1))}
            disabled={!canGoNext}
            className="p-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
            title="Next page"
          >
            <ChevronRight size={13} />
          </button>

          {/* Last Page Button */}
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={!canGoNext}
            className="p-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
            title="Last page"
          >
            <ChevronsRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
