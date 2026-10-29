/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Plus, Check, ChevronDown, Layers, Database, 
  ArrowDown, Sliders, Code, Info, ArrowRight 
} from 'lucide-react';
import { MultiRowCardinalityPolicy } from '../../../types';

interface StageItem {
  id: string;
  order: number;
  name: string;
  enabled: boolean;
  dbBadge: string;
  tableBadge: string;
  database: string;
  table: string;
  businessMeaning: string;
  passedKeysFromPrev?: string;
  cardinalityPolicy: MultiRowCardinalityPolicy;
  combineRowsWith: string;
  orderBy: string;
  columnsToFetch: string[];
  rules: string[];
}

interface WorkflowStagesViewProps {
  workflowName?: string;
  onSave?: () => void;
}

export const WorkflowStagesView: React.FC<WorkflowStagesViewProps> = ({
  workflowName = 'New Validation Pipeline',
  onSave
}) => {
  const [stages, setStages] = useState<StageItem[]>([
    {
      id: 'stage-1',
      order: 1,
      name: 'Primary ingress',
      enabled: true,
      dbBadge: 'Sett',
      tableBadge: 'auth_log_tab',
      database: 'Sett (MySQL)',
      table: 'auth_log_tab',
      businessMeaning: 'ingress switch logs',
      cardinalityPolicy: 'STRICT_SINGLE',
      combineRowsWith: 'None',
      orderBy: 'tr_date DESC',
      columnsToFetch: ['transaction_id', 'amount', 'currency', 'status'],
      rules: ['Authorization Ingress Existence Check']
    },
    {
      id: 'stage-2',
      order: 2,
      name: 'Settlement clearing',
      enabled: true,
      dbBadge: 'Sett',
      tableBadge: 'sv_fin_tab',
      database: 'Sett (MySQL)',
      table: 'sv_fin_tab',
      businessMeaning: 'clearing ledger',
      passedKeysFromPrev: 'passed keys: transaction_id → settlement_id',
      cardinalityPolicy: 'ONE_TO_MANY',
      combineRowsWith: 'None',
      orderBy: 'Not needed',
      columnsToFetch: ['settlement_id', 'conamt', 'reqamt', 'status_state', 'tr_date'],
      rules: ['Settlement Amount Balancing', 'ISO-8583 Approval Code Verification']
    },
    {
      id: 'stage-3',
      order: 3,
      name: 'Ledger verification',
      enabled: false,
      dbBadge: 'Core DB',
      tableBadge: 'gl_entries',
      database: 'Core DB (PostgreSQL)',
      table: 'gl_entries',
      businessMeaning: 'general ledger verification',
      passedKeysFromPrev: 'passed keys: settlement_id → account_id',
      cardinalityPolicy: 'EXPLICIT_LATEST',
      combineRowsWith: 'None',
      orderBy: 'posting_date DESC',
      columnsToFetch: ['account_id', 'debit', 'credit', 'posting_date'],
      rules: ['Balance Sheet Balancing Rule']
    }
  ]);

  const [selectedStageId, setSelectedStageId] = useState<string>('stage-2');
  const [newColInput, setNewColInput] = useState<string>('');
  const [showAddCol, setShowAddCol] = useState<boolean>(false);

  const selectedStage = stages.find(s => s.id === selectedStageId) || stages[0];

  const cardinalityOptions: { key: MultiRowCardinalityPolicy; label: string }[] = [
    { key: 'STRICT_SINGLE', label: 'Strict Single' },
    { key: 'ONE_TO_MANY', label: 'One To Many' },
    { key: 'EXPLICIT_LATEST', label: 'Explicit Latest' },
    { key: 'EXPLICIT_FIRST', label: 'Explicit First' },
    { key: 'ALL_ROWS', label: 'All Rows' },
  ];

  const updateSelectedStage = (updates: Partial<StageItem>) => {
    setStages(prev => prev.map(s => s.id === selectedStage.id ? { ...s, ...updates } : s));
  };

  const handleAddColumn = () => {
    if (!newColInput.trim()) return;
    const colName = newColInput.trim();
    if (!selectedStage.columnsToFetch.includes(colName)) {
      updateSelectedStage({
        columnsToFetch: [...selectedStage.columnsToFetch, colName]
      });
    }
    setNewColInput('');
    setShowAddCol(false);
  };

  const handleRemoveColumn = (colName: string) => {
    updateSelectedStage({
      columnsToFetch: selectedStage.columnsToFetch.filter(c => c !== colName)
    });
  };

  const toggleStageEnabled = (stageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStages(prev => prev.map(s => s.id === stageId ? { ...s, enabled: !s.enabled } : s));
  };

  // Live Compiled Parameterized SQL preview with ANSI identifiers (Rule 11)
  const queryPreviewSql = `SELECT ${selectedStage.columnsToFetch.join(', ')}\nFROM "${selectedStage.table}"\nWHERE "${selectedStage.columnsToFetch[0] || 'id'}" IN ($1, $2, ... $100) -- chunk of 100 keys`;

  return (
    <div className="flex-1 flex overflow-hidden bg-[#F8FAFC]">
      {/* Left Column: Stages Pipeline (w-96) */}
      <div className="w-88 bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto no-scrollbar p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm font-heading">Stages</h3>
          <button 
            type="button"
            onClick={() => {
              const newNum = stages.length + 1;
              const newStage: StageItem = {
                id: `stage-${newNum}`,
                order: newNum,
                name: `Stage ${newNum}`,
                enabled: true,
                dbBadge: 'Sett',
                tableBadge: 'new_table',
                database: 'Sett (MySQL)',
                table: 'new_table',
                businessMeaning: 'additional stage',
                passedKeysFromPrev: 'passed keys: id → next_id',
                cardinalityPolicy: 'ONE_TO_MANY',
                combineRowsWith: 'None',
                orderBy: 'Not needed',
                columnsToFetch: ['id', 'amount', 'status'],
                rules: []
              };
              setStages([...stages, newStage]);
              setSelectedStageId(newStage.id);
            }}
            className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 shadow-2xs flex items-center space-x-1 cursor-pointer"
          >
            <Plus size={12} />
            <span>Add</span>
          </button>
        </div>

        {/* Stages List with Key Passing Connectors */}
        <div className="space-y-3">
          {stages.map((stage, idx) => {
            const isSelected = stage.id === selectedStage.id;

            return (
              <React.Fragment key={stage.id}>
                {/* Connector between stages */}
                {idx > 0 && (
                  <div className="flex flex-col items-center my-1">
                    <div className="h-3 w-px bg-slate-300" />
                    <div className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-500 shadow-2xs">
                      ∨ {stage.passedKeysFromPrev || 'passed keys: id → id'}
                    </div>
                    <div className="h-3 w-px bg-slate-300" />
                  </div>
                )}

                {/* Stage Card */}
                <div
                  onClick={() => setSelectedStageId(stage.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xs ${
                    isSelected
                      ? 'border-[#F27421] bg-white ring-1 ring-[#F27421]'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2.5">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold font-mono ${
                        isSelected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {stage.order}
                      </span>
                      <span className="font-bold text-slate-900 text-xs font-sans">
                        {stage.name}
                      </span>
                    </div>

                    {/* Toggle Switch */}
                    <button
                      type="button"
                      onClick={(e) => toggleStageEnabled(stage.id, e)}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                        stage.enabled ? 'bg-[#F27421]' : 'bg-slate-200'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        stage.enabled ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center space-x-2 mt-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-600">
                      {stage.dbBadge}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-600">
                      {stage.tableBadge}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Right Column: Stage Configuration Editor */}
      <div className="flex-1 min-w-0 overflow-y-auto no-scrollbar p-8 space-y-6">
        {/* Stage Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-sans mb-1">Stage {selectedStage.order}</div>
            <h2 className="text-xl font-bold font-heading text-slate-900 tracking-tight">
              {selectedStage.name}
            </h2>
          </div>

          <span className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-sans text-slate-600">
            Business meaning: {selectedStage.businessMeaning}
          </span>
        </div>

        {/* Database & Table Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Database</label>
            <div className="relative">
              <select
                value={selectedStage.database}
                onChange={(e) => updateSelectedStage({ database: e.target.value })}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white appearance-none font-sans text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer"
              >
                <option value="Sett (MySQL)">Sett (MySQL)</option>
                <option value="Core DB (PostgreSQL)">Core DB (PostgreSQL)</option>
                <option value="LocalFTP (SFTP)">LocalFTP (SFTP)</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Table</label>
            <div className="relative">
              <select
                value={selectedStage.table}
                onChange={(e) => updateSelectedStage({ table: e.target.value, tableBadge: e.target.value })}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white appearance-none font-sans text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer"
              >
                <option value="sv_fin_tab">sv_fin_tab</option>
                <option value="auth_log_tab">auth_log_tab</option>
                <option value="tran_log_tab">tran_log_tab</option>
                <option value="gl_entries">gl_entries</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Cardinality Policy: When a key matches several rows */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-2">
            When a key matches several rows
          </label>
          <div className="flex flex-wrap gap-2">
            {cardinalityOptions.map(opt => {
              const isSelected = selectedStage.cardinalityPolicy === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => updateSelectedStage({ cardinalityPolicy: opt.key })}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white border border-slate-200 hover:border-slate-300 text-slate-700 shadow-2xs'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Combine rows & Order by Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Combine rows with</label>
            <div className="relative">
              <select
                value={selectedStage.combineRowsWith}
                onChange={(e) => updateSelectedStage({ combineRowsWith: e.target.value })}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white appearance-none font-sans text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer"
              >
                <option value="None">None</option>
                <option value="SUM">Sum amount</option>
                <option value="AVG">Average</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Order by</label>
            <div className="relative">
              <select
                value={selectedStage.orderBy}
                onChange={(e) => updateSelectedStage({ orderBy: e.target.value })}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white appearance-none font-sans text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer"
              >
                <option value="Not needed">Not needed</option>
                <option value="tr_date DESC">tr_date DESC</option>
                <option value="settlement_id ASC">settlement_id ASC</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Columns to fetch */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-700">Columns to fetch</label>
            <span className="text-xs text-slate-400">Only these are queried</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedStage.columnsToFetch.map(col => (
              <span
                key={col}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono bg-white border border-slate-200 text-slate-800 shadow-2xs"
              >
                <span>{col}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveColumn(col)}
                  className="text-slate-400 hover:text-rose-500 ml-1 cursor-pointer"
                >
                  ×
                </button>
              </span>
            ))}

            {showAddCol ? (
              <div className="flex items-center space-x-1">
                <input
                  type="text"
                  value={newColInput}
                  onChange={(e) => setNewColInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddColumn();
                    if (e.key === 'Escape') setShowAddCol(false);
                  }}
                  autoFocus
                  placeholder="Column name"
                  className="px-2.5 py-1 text-xs font-mono rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddColumn}
                  className="px-2 py-1 bg-slate-900 text-white rounded-lg text-xs font-bold"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddCol(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 hover:border-slate-300 text-slate-700 shadow-2xs flex items-center space-x-1 cursor-pointer"
              >
                <Plus size={12} />
                <span>Add</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Query Preview Section */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-2">Query preview</label>
          <div className="bg-[#0F142A] text-slate-200 font-mono text-xs p-4 rounded-2xl shadow-inner overflow-x-auto leading-relaxed border border-slate-800">
            <pre className="whitespace-pre-wrap">{queryPreviewSql}</pre>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5 font-sans">
            Identifiers are quoted and values are bound as parameters.
          </p>
        </div>

        {/* Rules run on this stage */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-2">Rules run on this stage</label>
          <div className="flex flex-wrap gap-2">
            {selectedStage.rules.map(rule => (
              <span
                key={rule}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium bg-white border border-slate-200 text-slate-800 shadow-2xs"
              >
                {rule}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowStagesView;
