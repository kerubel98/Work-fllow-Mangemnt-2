/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Database, Table, ArrowRight, CheckCircle2, Plus,
  Trash2, ShieldCheck, Layers, Sparkles, AlertCircle, RefreshCw,
  RotateCcw, ChevronDown
} from 'lucide-react';
import { globalMappingService } from '../../../services/globalMappingService';
import { api } from '../../../api/client';
import { GlobalTransactionSchemaField } from '../../../types';
console.log('globalFields', globalMappingService.getStandardFields());

export interface ColumnMappingItem {
  fileHeader: string;
  targetColumn: string;
  targetType: string;
  isPrimaryKey?: boolean;
  isRequired?: boolean;
  globalFieldKey?: string;
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
  const [targetDatabase] = useState('operational_workflow_db (PostgreSQL)');
  const [targetMode, setTargetMode] = useState<'AUTO_PROVISION' | 'EXISTING_TABLE'>('AUTO_PROVISION');
  const [targetTable, setTargetTable] = useState(initialTargetTable);

  const [globalFields, setGlobalFields] = useState<GlobalTransactionSchemaField[]>(() =>
    globalMappingService.getStandardFields()
  );


  const mapGlobalTypeToPostgres = (globalType?: string, fallbackType?: string): string => {
    if (fallbackType && (fallbackType.includes('NUMERIC') || fallbackType.includes('TIMESTAMP'))) {
      return fallbackType;
    }
    switch (globalType) {
      case 'number': return 'NUMERIC(18,4)';
      case 'date': return 'TIMESTAMP';
      case 'boolean': return 'BOOLEAN';
      case 'string':
      default:
        return fallbackType || 'VARCHAR(128)';
    }
  };

  const existingTablesList = [
    { name: 'mirror_sftp_settle_clearing', type: 'Unlogged Mirror Table', desc: 'Auto-managed high throughput reconciliation table' },
    { name: 'uploaded_transaction_records', type: 'System Intake Table', desc: 'General financial clearing records log' },
    { name: 'settlement_transactions', type: 'Core Ledger Table', desc: 'Settlement clearing repository' },
    { name: 'switch_interchange_records', type: 'Switch Mirror Table', desc: 'ATM and POS interchange switch feeds' }
  ];

  // Helper to build column mappings aligned with Global Standard Directory
  const buildMappings = useCallback((headers: string[], fields: GlobalTransactionSchemaField[]): ColumnMappingItem[] => {
    const autoMap = globalMappingService.autoGenerateColumnMapping(headers, fields);
    return headers.map((hdr, idx) => {
      const matchedKey = autoMap[hdr];
      const matchedField = matchedKey ? fields.find(f => f.key === matchedKey) : undefined;
      const hasMatch = Boolean(matchedKey && matchedField);
      const targetCol = hasMatch ? matchedKey : '';
      const targetType = matchedField
        ? mapGlobalTypeToPostgres(matchedField.dataType)
        : 'VARCHAR(128)';

      const isPk = idx === 0 || targetCol === 'transaction_id' || targetCol === 'refnum';

      return {
        fileHeader: hdr,
        targetColumn: targetCol,
        targetType,
        isPrimaryKey: isPk,
        isRequired: isPk || targetCol.includes('amount') || matchedField?.required,
        globalFieldKey: hasMatch ? matchedKey : undefined
      };
    });
  }, []);

  const [mappings, setMappings] = useState<ColumnMappingItem[]>(() => {
    if (initialMappings && initialMappings.length > 0) return initialMappings;
    return buildMappings(discoveredHeaders, globalFields);
  });

  // Hydrate global fields directly from PostgreSQL authoritative store on mount
  useEffect(() => {
    api.getGlobalStandardDirectory()
      .then((fields) => {
        if (Array.isArray(fields) && fields.length > 0) {
          setGlobalFields(fields);
          globalMappingService.updateStandardFields(fields);
          // Re-align default mappings with freshly fetched database fields if not manually modified
          setMappings(prev => {
            if (prev.length === 0) return buildMappings(discoveredHeaders, fields);
            const headers = prev.map(m => m.fileHeader);
            const autoMap = globalMappingService.autoGenerateColumnMapping(headers, fields);
            return prev.map((m, idx) => {
              const matchedKey = autoMap[m.fileHeader];
              if (!matchedKey) return m;
              const matchedField = fields.find(f => f.key === matchedKey);
              return {
                ...m,
                targetColumn: matchedKey,
                globalFieldKey: matchedKey,
                targetType: matchedField ? mapGlobalTypeToPostgres(matchedField.dataType, m.targetType) : m.targetType,
                isPrimaryKey: idx === 0 || matchedKey === 'transaction_id' || matchedKey === 'refnum'
              };
            });
          });
        }
      })
      .catch((err) => {
        console.warn('Could not fetch global standard directory:', err);
      });
  }, [discoveredHeaders, buildMappings]);

  const handleAutoMapAll = () => {
    if (mappings.length === 0) return;
    const headers = mappings.map(m => m.fileHeader);
    const autoMap = globalMappingService.autoGenerateColumnMapping(headers, globalFields);
    setMappings(prev => prev.map((m, idx) => {
      const matchedKey = autoMap[m.fileHeader];
      const matchedField = matchedKey ? globalFields.find(f => f.key === matchedKey) : undefined;
      const hasMatch = Boolean(matchedKey && matchedField);
      return {
        ...m,
        targetColumn: hasMatch ? matchedKey : '',
        globalFieldKey: hasMatch ? matchedKey : undefined,
        targetType: matchedField ? mapGlobalTypeToPostgres(matchedField.dataType, m.targetType) : m.targetType,
        isPrimaryKey: idx === 0 || matchedKey === 'transaction_id' || matchedKey === 'refnum'
      };
    }));
  };

  const groupedGlobalFields = useMemo(() => {
    const groups: Record<string, GlobalTransactionSchemaField[]> = {};
    const preferredOrder = [
      'Identity & Reference',
      'Financial & Amounts',
      'Card & Account',
      'Audit & Timestamps',
      'Lifecycle & Status',
      'Network & Clearing',
      'Merchant & POS',
      'Customer & Account Holder',
      'Reconciliation & Operations',
      'General'
    ];

    (globalFields || []).forEach(f => {
      let cat = f.category || 'General';
      if (/identity|ref/i.test(cat)) cat = 'Identity & Reference';
      else if (/financial|amount/i.test(cat)) cat = 'Financial & Amounts';
      else if (/card|account/i.test(cat)) cat = 'Card & Account';
      else if (/audit|timestamp|time|date/i.test(cat)) cat = 'Audit & Timestamps';
      else if (/lifecycle|status/i.test(cat)) cat = 'Lifecycle & Status';
      else if (/network|clearing|routing/i.test(cat)) cat = 'Network & Clearing';
      else if (/merchant|pos/i.test(cat)) cat = 'Merchant & POS';
      else if (/customer|holder/i.test(cat)) cat = 'Customer & Account Holder';
      else if (/recon|operation/i.test(cat)) cat = 'Reconciliation & Operations';
      else cat = 'General';

      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(f);
    });

    const orderedCategories = [
      ...preferredOrder.filter(c => groups[c] && groups[c].length > 0),
      ...Object.keys(groups).filter(c => !preferredOrder.includes(c)).sort()
    ];

    return orderedCategories.map(cat => ({
      category: cat,
      fields: groups[cat].sort((a, b) => (a.label || a.key).localeCompare(b.label || b.key))
    }));
  }, [globalFields]);

  const handleUpdateMapping = (index: number, field: keyof ColumnMappingItem, value: any) => {
    setMappings(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveMapping = (index: number) => {
    setMappings(prev => prev.filter((_, i) => i !== index));
  };

  const handleContinue = () => {
    const validMappings = mappings.filter(m => m.targetColumn && m.targetColumn.trim() !== '');
    if (validMappings.length === 0) {
      alert('Please map at least one column to a Global Field from the system directory before continuing.');
      return;
    }
    onNext({
      targetDatabase,
      targetTable,
      targetMode,
      mappings: validMappings
    });
  };

  const mappedGlobalCount = useMemo(() => {
    return mappings.filter(m => globalFields.some(f => f.key === m.targetColumn)).length;
  }, [mappings, globalFields]);

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
                  className={`p-2.5 rounded-xl border text-left text-xs font-mono transition cursor-pointer ${targetMode === 'AUTO_PROVISION'
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
                  className={`p-2.5 rounded-xl border text-left text-xs font-mono transition cursor-pointer ${targetMode === 'EXISTING_TABLE'
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
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs space-y-0">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers size={15} className="text-slate-500" />
              <span className="font-bold text-slate-900 font-mono text-xs">
                Column-to-Field Ingestion Mapping ({mappings.length} columns)
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleAutoMapAll}
                className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg text-purple-700 font-mono text-[11px] font-semibold flex items-center space-x-1 cursor-pointer transition shadow-2xs"
                title="Re-run fuzzy auto-mapping against Global Standard Directory"
              >
                <RotateCcw size={11} />
                <span>Auto-Map to Global Fields</span>
              </button>
            </div>
          </div>

          {/* Global Standard Directory Status Banner */}
          <div className="p-3 bg-gradient-to-r from-purple-50/70 via-indigo-50/30 to-slate-50 border-b border-purple-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles size={14} className="text-purple-600 shrink-0" />
              <span className="text-xs text-slate-700">
                Mapped to Global Fields:
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-100 text-purple-800 border border-purple-200">
                {mappedGlobalCount} of {mappings.length} Columns Aligned
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              PostgreSQL <code className="text-purple-700 font-semibold">global_standard_directory</code>
            </span>
          </div>

          <div className="overflow-x-auto p-4">
            <table className="w-full text-left font-mono text-xs">
              <thead className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                <tr>
                  <th className="pb-2 px-2">Discovered File Header</th>
                  <th className="pb-2 px-2 w-8 text-center">→</th>
                  <th className="pb-2 px-2 min-w-[280px]">Target Local DB Column (Global Field)</th>
                  <th className="pb-2 px-2">Data Type</th>
                  <th className="pb-2 px-2 text-center">Primary Key</th>
                  <th className="pb-2 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mappings.map((m, idx) => {
                  const matchedGlobalField = globalFields.find(f => f.key === m.targetColumn || f.key === m.globalFieldKey);
                  const isKnownGlobal = !!matchedGlobalField;

                  return (
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

                      {/* Target DB Column / Global Field */}
                      <td className="py-2.5 px-2 min-w-[280px]">
                        <div className="space-y-1.5">
                          <div className="relative">
                            <select
                              value={m.targetColumn || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (!val) {
                                  handleUpdateMapping(idx, 'targetColumn', '');
                                  handleUpdateMapping(idx, 'globalFieldKey', undefined);
                                } else {
                                  const gField = globalFields.find(f => f.key === val);
                                  setMappings(prev => {
                                    const copy = [...prev];
                                    copy[idx] = {
                                      ...copy[idx],
                                      targetColumn: val,
                                      globalFieldKey: val,
                                      targetType: gField ? mapGlobalTypeToPostgres(gField.dataType, copy[idx].targetType) : copy[idx].targetType
                                    };
                                    return copy;
                                  });
                                }
                              }}
                              className={`w-full py-1.5 pl-2.5 pr-7 border rounded-lg font-mono text-xs focus:outline-none transition appearance-none cursor-pointer ${isKnownGlobal
                                ? 'bg-purple-50/90 border-purple-300 text-purple-950 font-semibold focus:border-purple-500'
                                : 'bg-white border-amber-300 text-amber-800 focus:border-[#F97316]'
                                }`}
                            >
                              <option value="">-- Choose Global Field (Unmapped) --</option>
                              {groupedGlobalFields.map(group => (
                                <optgroup key={group.category} label={`── ${group.category} ──`}>
                                  {group.fields.map(f => (
                                    <option key={f.key} value={f.key}>
                                      {f.label ? `${f.label} (${f.key})` : f.key} {f.dataType ? `[${f.dataType}]` : ''}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            <ChevronDown size={12} className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" />
                          </div>

                          {!m.targetColumn && (
                            <div className="flex items-center space-x-1 text-[10px] text-amber-600 font-mono">
                              <span>⚠ Unmapped (Select Global Field or remove row)</span>
                            </div>
                          )}

                          {isKnownGlobal && matchedGlobalField && (
                            <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                                ✓ Global Standard: {matchedGlobalField.key}
                              </span>
                              <span className="text-[10px] text-slate-500 font-sans">
                                {matchedGlobalField.category || 'General'}
                              </span>
                            </div>
                          )}
                        </div>
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
                          <option value="NUMERIC(18,4)">NUMERIC(18,4)</option>
                          <option value="NUMERIC(18,2)">NUMERIC(18,2)</option>
                          <option value="BIGINT">BIGINT</option>
                          <option value="INTEGER">INTEGER</option>
                          <option value="TIMESTAMP">TIMESTAMP</option>
                          <option value="BOOLEAN">BOOLEAN</option>
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
                  );
                })}
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

