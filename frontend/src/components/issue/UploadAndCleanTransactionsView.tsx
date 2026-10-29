/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  FileSpreadsheet, Check, ChevronDown, MoreHorizontal, 
  Sparkles, Trash2, ArrowRight, Save, Layers, Split, Combine, 
  RotateCcw, Sliders, CheckCircle2, AlertCircle, Database, BookOpen
} from 'lucide-react';

interface ColumnDef {
  id: string;
  name: string;
  type: 'Text' | 'Date' | 'Number';
  mapping: string;
  selected: boolean;
  unmapped?: boolean;
}

interface UploadAndCleanTransactionsViewProps {
  fileName?: string;
  sheetName?: string;
  totalRows?: number;
  onContinueToReview?: () => void;
  onBackToDetails?: () => void;
  onSaveTemplate?: () => void;
}

export const UploadAndCleanTransactionsView: React.FC<UploadAndCleanTransactionsViewProps> = ({
  fileName = 'clearing_batch_feed.xlsx',
  sheetName = 'member_reconciliation_report',
  totalRows = 40410,
  onContinueToReview,
  onBackToDetails,
  onSaveTemplate
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState('AIB settlement template');
  const [headerRow, setHeaderRow] = useState(4);
  const [fillMerged, setFillMerged] = useState(true);
  const [activeMenuColumn, setActiveMenuColumn] = useState<string | null>('terminal_id');

  const [columns, setColumns] = useState<ColumnDef[]>([
    { id: 'currency', name: 'Currency', type: 'Text', mapping: 'currency', selected: false },
    { id: 'tr_date', name: 'Transaction_Date', type: 'Date', mapping: 'tr_date', selected: false },
    { id: 'terminal_id', name: 'Terminal_ID', type: 'Text', mapping: 'terminal_id', selected: true },
    { id: 'tran_place', name: 'Transaction_Place', type: 'Text', mapping: 'tran_place', selected: true },
    { id: 'refnum_f37', name: 'Refnum_F37', type: 'Text', mapping: 'Unmapped', selected: false, unmapped: true },
    { id: 'fe_utrnno', name: 'Fe_utrnno', type: 'Number', mapping: 'fe_utrnno', selected: false },
  ]);

  const rows = [
    {
      currency: 'ETB',
      tr_date: '05.04.2026',
      terminal_id: '074\\\\BISRATEGABRIEL',
      tran_place: 'SAHLI GETANEH',
      refnum_f37: '',
      fe_utrnno: '2633613984'
    },
    {
      currency: 'ETB',
      tr_date: '22.01.2026',
      terminal_id: '142\\\\BISRATEGABRIEL',
      tran_place: 'SAHLI GETANEH',
      refnum_f37: '',
      fe_utrnno: '2579312260'
    },
    {
      currency: 'ETB',
      tr_date: '13.04.2026',
      terminal_id: '243\\\\AMAKELECH LULU TEFERA',
      tran_place: '',
      refnum_f37: '',
      fe_utrnno: '2639706114'
    },
    {
      currency: 'ETB',
      tr_date: '16.01.2026',
      terminal_id: '077\\\\BISRATEGABRIEL',
      tran_place: 'SAHLI GETANEH',
      refnum_f37: '',
      fe_utrnno: '2574255967'
    }
  ];

  const recipeSteps = [
    { num: 1, title: 'Skip 3 preamble rows', desc: 'Header at row 4' },
    { num: 2, title: 'Exclude 2 columns', desc: 'STAN_F11, Bo_utrnno' },
    { num: 3, title: 'Dictionary', desc: 'Bank names to routing codes' },
    { num: 4, title: 'Trim whitespace', desc: 'All text columns' },
    { num: 5, title: 'Convert dates', desc: 'To ISO 8601' },
  ];

  const requiredColumns = [
    { name: 'Terminal_ID', status: 'Ready' },
    { name: 'Fe_utrnno', status: 'Ready' },
    { name: 'Currency', status: 'Ready' },
    { name: 'Transaction_Date', status: 'Ready' },
    { name: 'Refnum_F37', status: 'No values' },
  ];

  const selectedCount = columns.filter(c => c.selected).length;

  const toggleColumnSelect = (colId: string) => {
    setColumns(cols => cols.map(c => c.id === colId ? { ...c, selected: !c.selected } : c));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F8FAFC] text-slate-800 font-sans overflow-hidden">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <div className="text-xs text-slate-500 font-sans mb-1">Cases / New case</div>
          <h1 className="text-xl font-bold font-heading text-slate-900 tracking-tight">Upload &amp; clean transactions</h1>
        </div>

        {/* 3-Step Wizard Stepper */}
        <div className="flex items-center space-x-6 text-xs font-sans">
          <button 
            type="button" 
            onClick={onBackToDetails}
            className="flex items-center space-x-2 text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            <span className="w-5 h-5 rounded-full border border-slate-300 flex items-center justify-center font-bold text-[11px]">1</span>
            <span className="font-medium">Details</span>
          </button>

          <div className="flex items-center space-x-2 text-slate-900 font-bold">
            <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-[11px]">2</span>
            <span>Upload &amp; clean</span>
          </div>

          <button 
            type="button" 
            onClick={onContinueToReview}
            className="flex items-center space-x-2 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <span className="w-5 h-5 rounded-full border border-slate-200 flex items-center justify-center font-bold text-[11px]">3</span>
            <span className="font-medium">Review</span>
          </button>
        </div>
      </div>

      {/* Main Content Workspace: Left Grid + Right Sidebar */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Grid Area */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white border-r border-slate-200">
          {/* Action Toolbar */}
          <div className="px-6 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Left Controls */}
            <div className="flex items-center space-x-2 flex-wrap gap-2">
              <div className="relative">
                <button 
                  type="button" 
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-medium text-slate-700 flex items-center space-x-2 shadow-2xs"
                >
                  <FileSpreadsheet size={14} className="text-slate-500" />
                  <span>{selectedTemplate}</span>
                  <ChevronDown size={13} className="text-slate-400" />
                </button>
              </div>

              <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 flex items-center space-x-1.5 shadow-2xs">
                <span>Header row</span>
                <span className="font-bold text-slate-900">{headerRow}</span>
              </div>

              <button 
                type="button"
                onClick={() => setFillMerged(v => !v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 border transition cursor-pointer shadow-2xs ${
                  fillMerged ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                <Check size={13} className={fillMerged ? 'text-slate-800' : 'text-slate-400'} />
                <span>Fill merged cells</span>
              </button>
            </div>

            {/* Right Action Buttons */}
            <div className="flex items-center space-x-2">
              <button 
                type="button" 
                className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 transition cursor-pointer shadow-2xs"
              >
                Deduplicate
              </button>
              <button 
                type="button" 
                className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 transition cursor-pointer shadow-2xs"
              >
                Remove empty rows
              </button>
              <button 
                type="button" 
                className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 transition cursor-pointer shadow-2xs"
              >
                Trim
              </button>
              <button 
                type="button" 
                className="px-3 py-1.5 bg-[#0F142A] hover:bg-[#1A2242] text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer shadow-2xs"
              >
                <Combine size={13} />
                <span>Merge columns</span>
                {selectedCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-[#F27421] text-white text-[10px] font-bold flex items-center justify-center">
                    {selectedCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Interactive Spreadsheet Grid */}
          <div className="flex-1 overflow-auto relative no-scrollbar">
            <table className="w-full border-collapse text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 sticky top-0 z-10">
                  {columns.map(col => (
                    <th key={col.id} className="p-3 border-r border-slate-200 min-w-[180px] font-normal align-top bg-slate-50">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={col.selected}
                            onChange={() => toggleColumnSelect(col.id)}
                            className="rounded border-slate-300 text-[#F27421] focus:ring-[#F27421] h-3.5 w-3.5"
                          />
                          <span className="font-bold text-slate-900 text-xs">{col.name}</span>
                        </label>

                        <button 
                          type="button"
                          onClick={() => setActiveMenuColumn(activeMenuColumn === col.id ? null : col.id)}
                          className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded transition cursor-pointer"
                        >
                          <MoreHorizontal size={13} />
                        </button>
                      </div>

                      <div className="mb-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200/80 text-slate-600">
                          {col.type}
                        </span>
                      </div>

                      <div className="relative">
                        <select 
                          value={col.mapping}
                          onChange={(e) => {
                            const val = e.target.value;
                            setColumns(cols => cols.map(c => c.id === col.id ? { ...c, mapping: val, unmapped: val === 'Unmapped' } : c));
                          }}
                          className={`w-full text-xs py-1.5 px-2 rounded-lg border appearance-none font-mono transition cursor-pointer ${
                            col.unmapped 
                              ? 'bg-amber-50/80 border-amber-300 text-amber-900 focus:ring-amber-500' 
                              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 focus:ring-blue-500'
                          }`}
                        >
                          <option value="currency">currency</option>
                          <option value="tr_date">tr_date</option>
                          <option value="terminal_id">terminal_id</option>
                          <option value="tran_place">tran_place</option>
                          <option value="fe_utrnno">fe_utrnno</option>
                          <option value="Unmapped">Unmapped</option>
                        </select>
                        <ChevronDown size={13} className="absolute right-2 top-2.5 text-slate-400 pointer-events-none" />
                      </div>

                      {/* Dropdown Context Menu for Column */}
                      {activeMenuColumn === col.id && (
                        <div className="absolute mt-1 left-2 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1.5 text-xs text-slate-700 animate-in fade-in duration-100">
                          <button 
                            type="button" 
                            onClick={() => setActiveMenuColumn(null)}
                            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center space-x-2.5 cursor-pointer"
                          >
                            <Split size={14} className="text-slate-400" />
                            <span>Split into columns</span>
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setActiveMenuColumn(null)}
                            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center space-x-2.5 cursor-pointer"
                          >
                            <Combine size={14} className="text-slate-400" />
                            <span>Merge with selected</span>
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setActiveMenuColumn(null)}
                            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center space-x-2.5 cursor-pointer"
                          >
                            <Sliders size={14} className="text-slate-400" />
                            <span>Transform values</span>
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setActiveMenuColumn(null)}
                            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center space-x-2.5 cursor-pointer"
                          >
                            <Database size={14} className="text-slate-400" />
                            <span>Compare with external database</span>
                          </button>
                          <button 
                            type="button" 
                            onClick={() => setActiveMenuColumn(null)}
                            className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center space-x-2.5 cursor-pointer"
                          >
                            <BookOpen size={14} className="text-slate-400" />
                            <span>Map to dictionary</span>
                          </button>
                          <div className="my-1 border-t border-slate-100" />
                          <button 
                            type="button" 
                            onClick={() => {
                              setColumns(cols => cols.filter(c => c.id !== col.id));
                              setActiveMenuColumn(null);
                            }}
                            className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-600 flex items-center space-x-2.5 cursor-pointer"
                          >
                            <Trash2 size={14} className="text-rose-500" />
                            <span>Exclude column</span>
                          </button>
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-700">
                {rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 border-r border-slate-100">{row.currency}</td>
                    <td className="p-3 border-r border-slate-100">{row.tr_date}</td>
                    <td className="p-3 border-r border-slate-100 truncate max-w-[220px]">{row.terminal_id}</td>
                    <td className="p-3 border-r border-slate-100">{row.tran_place}</td>
                    <td className="p-3 border-r border-slate-100 bg-amber-50/30 text-slate-400 italic">
                      {row.refnum_f37 || '—'}
                    </td>
                    <td className="p-3 border-r border-slate-100">{row.fe_utrnno}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Grid Status Bar */}
          <div className="px-6 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500 font-sans shrink-0">
            <div>
              <span className="font-medium text-slate-700">{fileName}</span>
              <span className="mx-2">·</span>
              <span>sheet {sheetName}</span>
              <span className="mx-2">·</span>
              <span>{totalRows.toLocaleString()} rows</span>
            </div>
            <div>
              Showing {rows.length} of {totalRows.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Right Sidebar: Recipe & Required Columns */}
        <div className="w-80 bg-white flex flex-col justify-between shrink-0 overflow-y-auto no-scrollbar p-6 space-y-6">
          <div className="space-y-6">
            {/* Recipe Header */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-slate-900 text-sm font-heading">Recipe</h3>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-mono font-bold">
                  {recipeSteps.length} steps
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every action is recorded and replays on the next file.
              </p>

              {/* Steps List */}
              <div className="mt-4 space-y-3">
                {recipeSteps.map((step) => (
                  <div key={step.num} className="flex items-start space-x-3">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-bold font-mono shrink-0 mt-0.5">
                      {step.num}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800">{step.title}</div>
                      <div className="text-[11px] text-slate-400">{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Required Columns Section */}
            <div>
              <h3 className="font-bold text-slate-900 text-sm font-heading mb-3">Required columns</h3>
              <div className="space-y-2.5">
                {requiredColumns.map(rc => (
                  <div key={rc.name} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-700">{rc.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      rc.status === 'Ready' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {rc.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="space-y-2 pt-4 border-t border-slate-100">
            <button 
              type="button"
              onClick={onSaveTemplate}
              className="w-full py-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center space-x-2 transition cursor-pointer shadow-2xs"
            >
              <Save size={14} className="text-slate-500" />
              <span>Save as template</span>
            </button>

            <button 
              type="button"
              onClick={onContinueToReview}
              className="w-full py-2.5 bg-[#F27421] hover:bg-[#d65f15] text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-md"
            >
              <span>Continue to review</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadAndCleanTransactionsView;
