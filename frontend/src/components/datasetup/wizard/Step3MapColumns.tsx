/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Sparkles, GitMerge, AlertCircle, CheckCircle2, ChevronDown, 
  ArrowRight, FileSpreadsheet, Play, Check, MoreHorizontal
} from 'lucide-react';

export interface Step3MapColumnsProps {
  resourceType?: string;
  selectedTables?: string[];
  initialMappings?: Record<string, any>;
  onNext: (mappings: any) => void;
  onBack: () => void;
  onOpenMergeColumns?: () => void;
  onOpenColumnActions?: (columnName: string) => void;
}

export function Step3MapColumns({
  resourceType = 'MySQL',
  selectedTables = ['auth_log_tab', 'sv_fin_tab', 'tran_log_tab', 'usonas_fin_tab'],
  initialMappings,
  onNext,
  onBack,
  onOpenMergeColumns,
  onOpenColumnActions
}: Step3MapColumnsProps) {
  const isSftp = resourceType === 'SFTP' || resourceType === 'FTP';

  // SFTP Parsing Configuration State (matching 68_sftp_parse_and_map.png)
  const [sftpSheet, setSftpSheet] = useState('member_reconciliation_report');
  const [sftpHeaderRow, setSftpHeaderRow] = useState(4);
  const [sftpHeaderSpan, setSftpHeaderSpan] = useState(1);
  const [sftpDataRow, setSftpDataRow] = useState(5);
  const [fillMerged, setFillMerged] = useState(true);

  // Active Table for DB Mode (matching 64_step3_map_columns.png)
  const [activeTable, setActiveTable] = useState(selectedTables[0] || 'auth_log_tab');

  // Mapping state: store mapped global field for each column
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({
    pos_data_code: 'pos_data_code',
    posting_fileno: 'posting_fileno',
    posting_recno: 'posting_recno',
    settlement_type: 'settlement_type',
    record_state: 'record_state',
    terminal_id: 'terminal_id',
    reqamt: 'reqamt',
    // refnum initially left unmapped to showcase validation guard (Screen 64 & 67)
    currency: 'currency',
    tr_date: 'tr_date',
    tran_place: 'tran_place',
    fe_utrnno: 'fe_utrnno'
  });

  const globalFields = [
    { key: 'terminal_id', label: 'TERMINAL ID', required: true },
    { key: 'refnum', label: 'REFNUM / RRN', required: true },
    { key: 'reqamt', label: 'REQAMT / AMOUNT', required: true },
    { key: 'pos_data_code', label: 'POS DATA CODE (pos_data_code)', required: false },
    { key: 'posting_fileno', label: 'POSTING FILENO', required: false },
    { key: 'posting_recno', label: 'POSTING RECNO', required: false },
    { key: 'settlement_type', label: 'SETTLEMENT TYPE', required: false },
    { key: 'record_state', label: 'RECORD STATE', required: false },
    { key: 'currency', label: 'CURRENCY', required: false },
    { key: 'tr_date', label: 'TRANSACTION DATE', required: false },
    { key: 'tran_place', label: 'TRANSACTION PLACE', required: false },
    { key: 'fe_utrnno', label: 'FE UTRNNO', required: false }
  ];

  // Database Columns for activeTable
  const dbColumns = [
    { name: 'pos_data_code', type: 'varchar', required: false },
    { name: 'posting_fileno', type: 'varchar', required: false },
    { name: 'posting_recno', type: 'varchar', required: false },
    { name: 'settlement_type', type: 'varchar', required: false },
    { name: 'record_state', type: 'int', required: false },
    { name: 'terminal_id', type: 'varchar', required: true },
    { name: 'refnum', type: 'varchar', required: true },
    { name: 'reqamt', type: 'decimal', required: true }
  ];

  // SFTP File Columns (Screen 68)
  const sftpColumns = [
    { name: 'Currency', sample: 'ETB', field: 'currency', required: false },
    { name: 'Transaction_Date', sample: '05.04.2026', field: 'tr_date', required: false },
    { name: 'Terminal_ID', sample: 'YPT00074', field: 'terminal_id', required: true },
    { name: 'Transaction_Place', sample: 'YPT00074\\\\\\BISRATE...', field: 'tran_place', required: false },
    { name: 'Refnum_F37', sample: '(empty)', field: 'refnum', required: true },
    { name: 'Fe_utrnno', sample: '2633613984', field: 'fe_utrnno', required: false }
  ];

  // Check required fields completeness
  const isRefnumMapped = !!columnMappings['refnum'] || !!columnMappings['Refnum_F37'];
  const hasUnmappedRequired = !isRefnumMapped;

  const handleAutoMap = () => {
    setColumnMappings(prev => ({
      ...prev,
      refnum: 'refnum',
      Refnum_F37: 'refnum'
    }));
  };

  const handleFieldChange = (colName: string, targetKey: string) => {
    setColumnMappings(prev => ({
      ...prev,
      [colName]: targetKey
    }));
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-8 text-xs text-slate-800">
      <div className="max-w-4xl space-y-6">
        {/* Header matching 64 & 68 */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              {isSftp ? 'Read the file, then map its columns' : 'Map columns to global fields'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isSftp
                ? 'AIB_2026.08.29_Settlemnt.xls · 16.5 MB · sample file for pattern */*/*_*_Settlemnt.xls'
                : 'This is what lets rules work the same way on every database.'}
            </p>
          </div>

          <div className="flex items-center space-x-2.5">
            {isSftp ? (
              <button
                type="button"
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5"
              >
                <Play size={12} className="fill-white" />
                <span>Run test & extract headers</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleAutoMap}
                  className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5"
                >
                  <Sparkles size={13} className="text-orange-500" />
                  <span>Auto-map by name</span>
                </button>
                {onOpenMergeColumns && (
                  <button
                    type="button"
                    onClick={onOpenMergeColumns}
                    className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5"
                  >
                    <GitMerge size={13} className="text-slate-500" />
                    <span>Merge columns</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* SFTP File Parse Options (Screen 68) */}
        {isSftp && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Sheet</label>
                <input
                  type="text"
                  value={sftpSheet}
                  onChange={(e) => setSftpSheet(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Header row</label>
                <input
                  type="number"
                  value={sftpHeaderRow}
                  onChange={(e) => setSftpHeaderRow(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Header rows spanned</label>
                <input
                  type="number"
                  value={sftpHeaderSpan}
                  onChange={(e) => setSftpHeaderSpan(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-700 block mb-1">Data starts at row</label>
                <input
                  type="number"
                  value={sftpDataRow}
                  onChange={(e) => setSftpDataRow(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-mono"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3 pt-1">
              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/60 rounded text-[11px] font-medium flex items-center space-x-1">
                <Check size={12} />
                <span>Fill merged cells</span>
              </span>
              <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-medium text-slate-700">
                16 columns found
              </span>
              <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-medium text-slate-700">
                40,410 rows
              </span>
            </div>
          </div>
        )}

        {/* Database Mode Layout (Screen 64) */}
        {!isSftp ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Left Column: Tables list */}
            <div className="md:col-span-3 space-y-3">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Tables</div>
              <div className="space-y-1.5">
                {[
                  { name: 'auth_log_tab', count: '112 of 119' },
                  { name: 'sv_fin_tab', count: '38 of 38' },
                  { name: 'tran_log_tab', count: '60 of 64' },
                  { name: 'usonas_fin_tab', count: '52 of 52' }
                ].map(tbl => (
                  <button
                    key={tbl.name}
                    type="button"
                    onClick={() => setActiveTable(tbl.name)}
                    className={`w-full px-3 py-2 rounded-xl text-left font-mono text-xs flex items-center justify-between transition cursor-pointer ${
                      activeTable === tbl.name
                        ? 'bg-orange-50/50 text-[#F97316] font-bold border border-orange-200/60'
                        : 'text-slate-600 hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <span className="truncate">{tbl.name}</span>
                    <span className="text-[10px] text-slate-400 font-sans ml-1">{tbl.count}</span>
                  </button>
                ))}
              </div>

              {/* Warning box if required missing */}
              {hasUnmappedRequired && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start space-x-2">
                  <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">1 required field</span> is not mapped: <code className="font-mono font-bold">refnum</code>.
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Column mapping rows */}
            <div className="md:col-span-9 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
                <span className="font-mono font-bold text-slate-900">{activeTable}</span>
                <span className="text-[11px]">104 mapped automatically · showing 8 of 119</span>
              </div>

              <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-xs divide-y divide-slate-100">
                {dbColumns.map(col => {
                  const mappedKey = columnMappings[col.name];
                  const isMapped = !!mappedKey;
                  const isRequiredUnmapped = col.required && !isMapped;

                  return (
                    <div 
                      key={col.name}
                      className={`p-3.5 flex items-center justify-between text-xs transition ${
                        isRequiredUnmapped ? 'bg-rose-50/40' : 'hover:bg-slate-50/40'
                      }`}
                    >
                      <div className="w-48 flex items-center space-x-2">
                        <div>
                          <div className="font-mono font-bold text-slate-900">{col.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{col.type}</div>
                        </div>
                        {col.required && (
                          <span className="px-1.5 py-0.2 bg-rose-50 text-rose-600 border border-rose-200/60 rounded text-[9px] font-bold">
                            Required
                          </span>
                        )}
                      </div>

                      <ArrowRight size={13} className="text-slate-300 shrink-0" />

                      <div className="flex-1 max-w-sm ml-4 flex items-center space-x-2">
                        <select
                          value={mappedKey || ''}
                          onChange={(e) => handleFieldChange(col.name, e.target.value)}
                          className={`w-full px-3 py-1.5 border rounded-xl text-xs bg-white focus:outline-none ${
                            isRequiredUnmapped
                              ? 'border-rose-300 text-rose-600 font-semibold'
                              : 'border-slate-200 text-slate-800'
                          }`}
                        >
                          <option value="">{isRequiredUnmapped ? 'Choose a global field' : '-- Unmapped --'}</option>
                          {globalFields.map(f => (
                            <option key={f.key} value={f.key}>{f.label}</option>
                          ))}
                        </select>

                        {isMapped ? (
                          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                        ) : isRequiredUnmapped ? (
                          <AlertCircle size={16} className="text-rose-500 shrink-0" />
                        ) : null}

                        <button
                          type="button"
                          onClick={() => onOpenColumnActions && onOpenColumnActions(col.name)}
                          className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                          title="More column actions (split, merge, add to global)"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* SFTP Columns List (Screen 68) */
          <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-xs divide-y divide-slate-100">
            {sftpColumns.map(col => {
              const mappedKey = columnMappings[col.name] || (col.name === 'Refnum_F37' ? columnMappings['refnum'] : undefined);
              const isMapped = !!mappedKey;
              const isWarning = col.name === 'Refnum_F37' && !isMapped;

              return (
                <div 
                  key={col.name}
                  className={`p-3.5 flex items-center justify-between text-xs transition ${
                    isWarning ? 'bg-amber-50/40' : 'hover:bg-slate-50/40'
                  }`}
                >
                  <div className="w-48 font-mono font-bold text-slate-900">{col.name}</div>
                  <div className="w-40 text-slate-500 font-mono text-[11px] truncate">{col.sample}</div>
                  <ArrowRight size={13} className="text-slate-300 shrink-0" />

                  <div className="flex-1 max-w-sm ml-4 flex items-center space-x-2">
                    <select
                      value={mappedKey || ''}
                      onChange={(e) => handleFieldChange(col.name, e.target.value)}
                      className={`w-full px-3 py-1.5 border rounded-xl text-xs bg-white focus:outline-none ${
                        isWarning
                          ? 'border-amber-300 text-amber-700 font-semibold'
                          : 'border-slate-200 text-slate-800'
                      }`}
                    >
                      <option value="">{isWarning ? 'Choose a global field' : '-- Unmapped --'}</option>
                      {globalFields.map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>

                    {isMapped ? (
                      <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                    ) : isWarning ? (
                      <AlertCircle size={16} className="text-amber-500 shrink-0" />
                    ) : null}

                    <button
                      type="button"
                      onClick={() => onOpenColumnActions && onOpenColumnActions(col.name)}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                      title="More column actions (split, merge, add to global)"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Navigation */}
      <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-medium text-xs transition cursor-pointer"
        >
          Back
        </button>

        <div className="text-[11px]">
          {hasUnmappedRequired ? (
            <span className="text-rose-600 font-semibold">Map the required field refnum to continue.</span>
          ) : (
            <span className="text-slate-400">All required fields mapped. Continue to add translations.</span>
          )}
        </div>

        <button
          type="button"
          disabled={hasUnmappedRequired}
          onClick={() => onNext(columnMappings)}
          className="px-5 py-2 bg-[#F97316] hover:bg-orange-600 disabled:opacity-40 text-white rounded-xl font-semibold text-xs transition cursor-pointer shadow-xs"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

export default Step3MapColumns;

