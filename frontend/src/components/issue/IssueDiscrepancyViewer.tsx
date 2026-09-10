import React, { useState } from 'react';
import { Issue } from '../../types';
import { 
  Table, FileSpreadsheet, Download, Search, Filter, 
  Layers, ArrowRightLeft, Tag, Eye, EyeOff 
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface IssueDiscrepancyViewerProps {
  issue: Issue;
  onUpdateLabels?: (rowLabels: Record<string, string>) => void;
}

export default function IssueDiscrepancyViewer({
  issue,
  onUpdateLabels
}: IssueDiscrepancyViewerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showRawJson, setShowRawJson] = useState(false);

  const mappedRows = issue.firstLevelMappedData || [];
  const columns = mappedRows.length > 0
    ? Object.keys(mappedRows[0])
    : (issue.uploadedFileHeaders || []);

  const filteredRows = mappedRows.filter(row => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return Object.values(row).some(val => 
      String(val || '').toLowerCase().includes(term)
    );
  });

  const handleExportCsv = () => {
    if (mappedRows.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(mappedRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Discrepancy_Data');
    XLSX.writeFile(wb, `Case_${issue.id}_Discrepancy_Export.xlsx`);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
      {/* Header & Controls */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
            <Table className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">Discrepancy Dataset & Mapping</h3>
            <p className="text-xs text-slate-500">
              {issue.uploadedFileName ? `Source File: ${issue.uploadedFileName}` : 'Mapped Transaction Records'} ({mappedRows.length} rows)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Search Field */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search in records..."
              className="text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
            />
          </div>

          {/* Toggle Raw JSON */}
          <button
            type="button"
            onClick={() => setShowRawJson(prev => !prev)}
            className="text-xs px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 font-medium flex items-center gap-1 transition"
          >
            {showRawJson ? <EyeOff className="w-3.5 h-3.5 text-slate-500" /> : <Eye className="w-3.5 h-3.5 text-slate-500" />}
            <span>{showRawJson ? 'Hide JSON' : 'Raw JSON'}</span>
          </button>

          {/* Export Excel */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={mappedRows.length === 0}
            className="text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg font-medium flex items-center gap-1.5 transition shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Raw JSON View */}
      {showRawJson && (
        <div className="p-4 bg-slate-900 border-b border-slate-800 text-emerald-400 font-mono text-xs max-h-64 overflow-y-auto">
          <pre>{JSON.stringify(mappedRows, null, 2)}</pre>
        </div>
      )}

      {/* Tabular Grid */}
      {mappedRows.length === 0 ? (
        <div className="p-8 text-center bg-white">
          <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600">No structured transaction rows mapped for this issue</p>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            Single-transaction issues or legacy tickets might only have descriptive notes.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/80 text-slate-700 font-bold sticky top-0 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 w-12 text-center text-slate-400">#</th>
                {columns.map(col => (
                  <th key={col} className="px-3 py-2.5 whitespace-nowrap">
                    {col.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
              {filteredRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-blue-50/50 transition">
                  <td className="px-3 py-2 text-center text-slate-400 font-sans text-[11px]">{idx + 1}</td>
                  {columns.map(col => {
                    const val = row[col];
                    const isStatus = col.toLowerCase().includes('status');
                    const isAmount = col.toLowerCase().includes('amount');

                    return (
                      <td key={col} className="px-3 py-2 whitespace-nowrap">
                        {isStatus ? (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            String(val).toUpperCase() === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                            String(val).toUpperCase() === 'SETTLED' ? 'bg-emerald-100 text-emerald-700' :
                            String(val).toUpperCase() === 'REVERSED' ? 'bg-purple-100 text-purple-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {String(val || 'N/A')}
                          </span>
                        ) : isAmount ? (
                          <span className="font-semibold text-slate-900">
                            ${Number(val || 0).toFixed(2)}
                          </span>
                        ) : (
                          <span>{String(val ?? '—')}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
