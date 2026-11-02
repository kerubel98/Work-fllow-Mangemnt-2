/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Search, Lock, Check } from 'lucide-react';

export interface Step2ChooseTablesProps {
  initialTables?: string[];
  onNext: (selectedTables: string[]) => void;
  onBack: () => void;
}

export function Step2ChooseTables({ initialTables = ['auth_log_tab', 'sv_fin_tab', 'tran_log_tab', 'usonas_fin_tab'], onNext, onBack }: Step2ChooseTablesProps) {
  const [selectedTables, setSelectedTables] = useState<string[]>(initialTables);
  const [searchQuery, setSearchQuery] = useState('');

  const allTables = useMemo(() => [
    { name: 'auth_log_tab', size: '119 columns', rows: '2.4M rows' },
    { name: 'sv_fin_tab', size: '38 columns', rows: '860K rows' },
    { name: 'tran_log_tab', size: '64 columns', rows: '1.9M rows' },
    { name: 'usonas_fin_tab', size: '52 columns', rows: '410K rows' },
    { name: 'audit_tmp', size: '12 columns', rows: '8K rows' },
    { name: '_migrations', size: '4 columns', rows: '31 rows' }
  ], []);

  const filteredTables = useMemo(() => {
    if (!searchQuery.trim()) return allTables;
    return allTables.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [allTables, searchQuery]);

  const toggleTable = (name: string) => {
    setSelectedTables(prev => 
      prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]
    );
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-8 text-xs text-slate-800">
      <div className="max-w-4xl space-y-5">
        {/* Header & Filter */}
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Choose the tables IssueTrace may read
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Found 12 tables in bo_test. Only the ones you pick can be searched or queried.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter tables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs w-48 focus:outline-none"
              />
            </div>
            <span className="px-2.5 py-1 bg-slate-100 rounded-lg font-medium text-slate-700 text-xs">
              {selectedTables.length} selected
            </span>
          </div>
        </div>

        {/* Tables List matching 63_step2_choose_tables.png */}
        <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 text-[11px] bg-slate-50/50">
                <th className="py-2.5 px-4 w-10"></th>
                <th className="py-2.5 px-4">Table</th>
                <th className="py-2.5 px-4">Size</th>
                <th className="py-2.5 px-4">Rows</th>
                <th className="py-2.5 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-xs">
              {filteredTables.map(tbl => {
                const isChecked = selectedTables.includes(tbl.name);
                return (
                  <tr 
                    key={tbl.name} 
                    onClick={() => toggleTable(tbl.name)}
                    className="hover:bg-slate-50/60 transition cursor-pointer select-none"
                  >
                    <td className="py-3 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="rounded border-slate-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">{tbl.name}</td>
                    <td className="py-3 px-4 text-slate-500 font-sans">{tbl.size}</td>
                    <td className="py-3 px-4 text-slate-500 font-sans">{tbl.rows}</td>
                    <td className="py-3 px-4 text-right font-sans">
                      {isChecked ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          Allowed
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[11px] text-slate-400">
                          Not selected
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Read-only Security Notice */}
        <div className="flex items-center space-x-2 text-slate-500 text-xs">
          <Lock size={13} className="text-slate-400" />
          <span>Read only. IssueTrace never changes data in this database from here.</span>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-medium text-xs transition cursor-pointer"
        >
          Back
        </button>

        <div className="text-[11px] text-slate-400">
          {selectedTables.length} tables chosen. Next, map their columns.
        </div>

        <button
          type="button"
          disabled={selectedTables.length === 0}
          onClick={() => onNext(selectedTables)}
          className="px-5 py-2 bg-[#F97316] hover:bg-orange-600 disabled:opacity-40 text-white rounded-xl font-semibold text-xs transition cursor-pointer shadow-xs"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

export default Step2ChooseTables;

