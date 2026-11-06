/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Database, Table, ArrowRight, CheckCircle2, Plus, 
  Trash2, ShieldCheck, Layers, Sparkles, AlertCircle, RefreshCw
} from 'lucide-react';

export interface ColumnMappingItem {
  fileHeader: string;
  targetColumn: string;
  targetType: string;
  isPrimaryKey?: boolean;
  isRequired?: boolean;
}

export interface Step3TargetLocalTableProps {
  discoveredHeaders?: string[];
  initialTargetTable?: string;
  initialMappings?: ColumnMappingItem[];
  onNext: (data: {
    targetDatabase: string;
    targetTable: string;
    targetMode: 'AUTO_PROVISION' | 'EXISTING_TABLE';
    mappings: ColumnMappingItem[];
  }) => void;
  onBack: () => void;
}

export function Step3TargetLocalTable({
  discoveredHeaders = [
    'trans_id', 'source_account', 'destination_account', 'amount', 
    'currency', 'channel', 'rrn', 'auth_code', 'status', 'settlement_date'
  ],
  initialTargetTable = 'mirror_sftp_settle_clearing',
  initialMappings,
  onNext,
  onBack
}: Step3TargetLocalTableProps) {
  const [targetDatabase, setTargetDatabase] = useState('operational_workflow_db (PostgreSQL)');
  const [targetMode, setTargetMode] = useState<'AUTO_PROVISION' | 'EXISTING_TABLE'>('AUTO_PROVISION');
  const [targetTable, setTargetTable] = useState(initialTargetTable);

  const existingTablesList = [
    { name: 'mirror_sftp_settle_clearing', type: 'Unlogged Mirror Table', desc: 'Auto-managed high throughput reconciliation table' },
    { name: 'uploaded_transaction_records', type: 'System Intake Table', desc: 'General financial clearing records log' },
    { name: 'settlement_transactions', type: 'Core Ledger Table', desc: 'Settlement clearing repository' },
    { name: 'switch_interchange_records', type: 'Switch Mirror Table', desc: 'ATM and POS interchange switch feeds' }
  ];

  // Initialize or auto-generate mappings
  const defaultMappings: ColumnMappingItem[] = useMemo(() => {
    if (initialMappings && initialMappings.length > 0) return initialMappings;
    return discoveredHeaders.map(hdr => {
      let targetCol = hdr.toLowerCase();
      let targetType = 'VARCHAR(64)';
      let isPk = false;

      if (hdr.includes('id') || hdr.includes('code') || hdr.includes('rrn')) {
        targetCol = hdr === 'trans_id' ? 'transaction_id' : hdr;
        targetType = 'VARCHAR(64)';
        if (hdr === 'trans_id') isPk = true;
      } else if (hdr.includes('amount') || hdr.includes('fee') || hdr.includes('bal')) {
        targetType = 'NUMERIC(18,2)';
      } else if (hdr.includes('date') || hdr.includes('time')) {
        targetType = 'TIMESTAMP';
      } else if (hdr.includes('status')) {
        targetType = 'VARCHAR(32)';
      }

      return {
        fileHeader: hdr,
        targetColumn: targetCol,
        targetType,
        isPrimaryKey: isPk,
        isRequired: isPk || hdr.includes('amount')
      };
    });
  }, [discoveredHeaders, initialMappings]);

  const [mappings, setMappings] = useState<ColumnMappingItem[]>(defaultMappings);

  const handleUpdateMapping = (index: number, field: keyof ColumnMappingItem, value: any) => {
    setMappings(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleAddCustomColumn = () => {
    setMappings(prev => [
      ...prev,
      {
        fileHeader: `custom_field_${prev.length + 1}`,
        targetColumn: `col_${prev.length + 1}`,
        targetType: 'VARCHAR(64)',
        isRequired: false
      }
    ]);
  };

  const handleRemoveMapping = (index: number) => {
    setMappings(prev => prev.filter((_, i) => i !== index));
  };

  const handleContinue = () => {
    onNext({
      targetDatabase,
      targetTable,
      targetMode,
      mappings
    });
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-8 text-xs text-slate-800 overflow-y-auto">
      <div className="max-w-4xl space-y-6">
        <div>
          <h2 className="text-sm font-bold text-slate-900 font-mono">
            Target Local Database Table & Field Insertion Mapping
          </h2>
          <p className="text-slate-500 mt-1 leading-relaxed">
            Select the local PostgreSQL database table where records extracted from discovered SFTP files will be inserted. Map discovered file fields into typed table columns.
          </p>
        </div>

        {/* Target Local Database & Table Mode */}
        <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-mono font-bold text-slate-700 block mb-1">
                Target Local Database
              </label>
              <div className="flex items-center space-x-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <Database size={16} className="text-blue-600 shrink-0" />
                <span className="font-mono text-xs font-semibold text-slate-800">
                  {targetDatabase}
                </span>
                <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 text-blue-800">
                  Primary
                </span>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-mono font-bold text-slate-700 block mb-1">
                Local Table Provisioning Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTargetMode('AUTO_PROVISION');
                    setTargetTable('mirror_sftp_settle_clearing');
                  }}
                  className={`p-2.5 rounded-xl border text-left text-xs font-mono transition cursor-pointer ${
                    targetMode === 'AUTO_PROVISION'
                      ? 'border-[#F97316] bg-orange-50/30 text-orange-950 font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <Sparkles size={12} className={targetMode === 'AUTO_PROVISION' ? 'text-[#F97316]' : 'text-slate-400'} />
                    <span>Auto Mirror Table</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5 truncate">
                    Dedicated unlogged table
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTargetMode('EXISTING_TABLE');
                    setTargetTable('uploaded_transaction_records');
                  }}
                  className={`p-2.5 rounded-xl border text-left text-xs font-mono transition cursor-pointer ${
                    targetMode === 'EXISTING_TABLE'
                      ? 'border-[#F97316] bg-orange-50/30 text-orange-950 font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <Table size={12} className={targetMode === 'EXISTING_TABLE' ? 'text-[#F97316]' : 'text-slate-400'} />
                    <span>Existing Table</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5 truncate">
                    Insert into current schema
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-mono font-bold text-slate-700 block mb-1">
              Destination Table Name
            </label>
            {targetMode === 'AUTO_PROVISION' ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={targetTable}
                  onChange={(e) => setTargetTable(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#F97316]"
                />
                <span className="text-[11px] font-mono text-emerald-600 bg-emerald-50 px-2.5 py-1.5 rounded-xl border border-emerald-200 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  <span>Auto-provisions with ANSI quotes & indexed PK</span>
                </span>
              </div>
            ) : (
              <select
                value={targetTable}
                onChange={(e) => setTargetTable(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 focus:outline-none focus:bg-white cursor-pointer"
              >
                {existingTablesList.map(t => (
                  <option key={t.name} value={t.name}>
                    {t.name} · {t.type} ({t.desc})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Column Mapping Table */}
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs space-y-2">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers size={15} className="text-slate-500" />
              <span className="font-bold text-slate-900 font-mono text-xs">
                Column-to-Field Ingestion Mapping ({mappings.length} columns)
              </span>
            </div>

            <button
              type="button"
              onClick={handleAddCustomColumn}
              className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-mono text-[11px] font-semibold flex items-center space-x-1 cursor-pointer transition shadow-2xs"
            >
              <Plus size={12} />
              <span>Add Custom Column</span>
            </button>
          </div>

          <div className="overflow-x-auto p-4">
            <table className="w-full text-left font-mono text-xs">
              <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                <tr>
                  <th className="pb-2 px-2">Discovered File Header</th>
                  <th className="pb-2 px-2 w-8 text-center">→</th>
                  <th className="pb-2 px-2">Target Local DB Column</th>
                  <th className="pb-2 px-2">Data Type</th>
                  <th className="pb-2 px-2 text-center">Primary Key</th>
                  <th className="pb-2 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mappings.map((m, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60">
                    {/* Source File Header */}
                    <td className="py-2.5 px-2">
                      <input
                        type="text"
                        value={m.fileHeader}
                        onChange={(e) => handleUpdateMapping(idx, 'fileHeader', e.target.value)}
                        className="w-full px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-mono text-xs"
                      />
                    </td>

                    {/* Arrow */}
                    <td className="py-2.5 px-2 text-center text-slate-400">
                      →
                    </td>

                    {/* Target DB Column */}
                    <td className="py-2.5 px-2">
                      <input
                        type="text"
                        value={m.targetColumn}
                        onChange={(e) => handleUpdateMapping(idx, 'targetColumn', e.target.value)}
                        className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-900 font-mono text-xs font-bold focus:border-[#F97316] focus:outline-none"
                      />
                    </td>

                    {/* Target Column Type */}
                    <td className="py-2.5 px-2">
                      <select
                        value={m.targetType}
                        onChange={(e) => handleUpdateMapping(idx, 'targetType', e.target.value)}
                        className="w-full px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-slate-700 font-mono text-xs cursor-pointer focus:outline-none"
                      >
                        <option value="VARCHAR(64)">VARCHAR(64)</option>
                        <option value="VARCHAR(128)">VARCHAR(128)</option>
                        <option value="VARCHAR(255)">VARCHAR(255)</option>
                        <option value="NUMERIC(18,2)">NUMERIC(18,2)</option>
                        <option value="BIGINT">BIGINT</option>
                        <option value="INTEGER">INTEGER</option>
                        <option value="TIMESTAMP">TIMESTAMP</option>
                        <option value="DATE">DATE</option>
                        <option value="TEXT">TEXT</option>
                      </select>
                    </td>

                    {/* Primary Key Check */}
                    <td className="py-2.5 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(m.isPrimaryKey)}
                        onChange={(e) => handleUpdateMapping(idx, 'isPrimaryKey', e.target.checked)}
                        className="w-4 h-4 rounded text-[#F97316] focus:ring-0 cursor-pointer"
                        title="Deduplication reconciliation key"
                      />
                    </td>

                    {/* Delete */}
                    <td className="py-2.5 px-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveMapping(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                        title="Remove mapping"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="pt-6 border-t border-slate-200 flex items-center justify-between bg-white shrink-0 mt-6">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl font-semibold text-xs transition cursor-pointer"
        >
          Back
        </button>

        <button
          type="button"
          onClick={handleContinue}
          className="px-5 py-2 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl font-bold font-mono text-xs flex items-center space-x-1.5 transition cursor-pointer shadow-xs"
        >
          <span>Continue to Ingestion Policy</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

