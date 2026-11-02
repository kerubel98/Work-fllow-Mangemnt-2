/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Split, GitMerge, Plus, BookOpen, Trash2, X, ChevronRight, Check
} from 'lucide-react';

export interface ColumnActionsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  columnName: string;
  sampleValues?: string[];
  selectedColumns?: string[];
  onSplitColumn?: (config: {
    delimiter: string;
    part1Name: string;
    part2Name: string;
    keepOriginal: boolean;
  }) => void;
  onMergeColumns?: (config: {
    columns: string[];
    separator: string;
    newColumnName: string;
    keepSource: boolean;
  }) => void;
  onAddToGlobalFields?: (config: {
    fieldKey: string;
    label: string;
    type: string;
    category: string;
    autoMap: boolean;
  }) => void;
  onMapToDictionary?: (columnName: string) => void;
  onUnmapColumn?: (columnName: string) => void;
}

export function ColumnActionsPopover({
  isOpen,
  onClose,
  columnName,
  sampleValues = ['YPT00074\\\\\\BSRATEGEBRIEL SAHILU GETANEH', 'YPT00243\\\\\\AMAKELECH LULU TEFERA'],
  selectedColumns = ['Terminal_ID', 'Transaction_Place'],
  onSplitColumn,
  onMergeColumns,
  onAddToGlobalFields,
  onMapToDictionary,
  onUnmapColumn
}: ColumnActionsPopoverProps) {
  const [activeModal, setActiveModal] = useState<'menu' | 'split' | 'merge' | 'add_global'>('menu');

  // Split State
  const [splitDelimiter, setSplitDelimiter] = useState<'Comma' | 'Space' | 'Backslash' | 'Custom'>('Backslash');
  const [customDelimiter, setCustomDelimiter] = useState('');
  const [part1Name, setPart1Name] = useState('Terminal_Code');
  const [part2Name, setPart2Name] = useState('Merchant_Name');
  const [keepOriginalSplit, setKeepOriginalSplit] = useState(true);

  // Merge State
  const [mergeSeparator, setMergeSeparator] = useState<'Space' | 'Dash' | 'None' | 'Custom'>('Dash');
  const [customSeparator, setCustomSeparator] = useState('');
  const [newMergeColName, setNewMergeColName] = useState('Terminal_Place');
  const [keepSourceMerge, setKeepSourceMerge] = useState(false);

  // Add to Global Fields State
  const [fieldKey, setFieldKey] = useState(columnName ? columnName.toLowerCase() : 'fe_utrnno');
  const [fieldLabel, setFieldLabel] = useState(columnName ? columnName.toUpperCase() : 'FE UTRNNO');
  const [fieldType, setFieldType] = useState('Number');
  const [fieldCategory, setFieldCategory] = useState('Identity & reference');
  const [autoMapGlobal, setAutoMapGlobal] = useState(true);

  if (!isOpen) return null;

  const actualDelimiter = splitDelimiter === 'Backslash' ? '\\' : splitDelimiter === 'Comma' ? ',' : splitDelimiter === 'Space' ? ' ' : customDelimiter;
  const actualSeparator = mergeSeparator === 'Dash' ? ' - ' : mergeSeparator === 'Space' ? ' ' : mergeSeparator === 'None' ? '' : customSeparator;

  const handleConfirmSplit = () => {
    if (onSplitColumn) {
      onSplitColumn({
        delimiter: actualDelimiter,
        part1Name,
        part2Name,
        keepOriginal: keepOriginalSplit
      });
    }
    onClose();
  };

  const handleConfirmMerge = () => {
    if (onMergeColumns) {
      onMergeColumns({
        columns: selectedColumns,
        separator: actualSeparator,
        newColumnName: newMergeColName,
        keepSource: keepSourceMerge
      });
    }
    onClose();
  };

  const handleConfirmAddGlobal = () => {
    if (onAddToGlobalFields) {
      onAddToGlobalFields({
        fieldKey,
        label: fieldLabel,
        type: fieldType,
        category: fieldCategory,
        autoMap: autoMapGlobal
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      {/* 1. Context Menu view */}
      {activeModal === 'menu' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xl w-64 overflow-hidden py-1.5 text-xs text-slate-700 animate-in zoom-in-95 duration-100">
          <div className="px-3.5 py-1.5 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Column: {columnName || 'Transaction_Place'}
          </div>

          <button
            type="button"
            onClick={() => setActiveModal('split')}
            className="w-full px-3.5 py-2.5 flex items-center space-x-2.5 hover:bg-slate-50 transition cursor-pointer text-slate-700"
          >
            <Split size={14} className="text-slate-400" />
            <span className="font-medium">Split into columns</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModal('merge')}
            className="w-full px-3.5 py-2.5 flex items-center space-x-2.5 hover:bg-slate-50 transition cursor-pointer text-slate-700"
          >
            <GitMerge size={14} className="text-slate-400" />
            <span className="font-medium">Merge with selected</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveModal('add_global')}
            className="w-full px-3.5 py-2.5 flex items-center space-x-2.5 hover:bg-slate-50 transition cursor-pointer text-slate-700"
          >
            <Plus size={14} className="text-slate-400" />
            <span className="font-medium">Add to global fields</span>
          </button>

          {onMapToDictionary && (
            <button
              type="button"
              onClick={() => { onMapToDictionary(columnName); onClose(); }}
              className="w-full px-3.5 py-2.5 flex items-center space-x-2.5 hover:bg-slate-50 transition cursor-pointer text-slate-700"
            >
              <BookOpen size={14} className="text-slate-400" />
              <span className="font-medium">Map to a dictionary</span>
            </button>
          )}

          <div className="h-px bg-slate-100 my-1" />

          <button
            type="button"
            onClick={() => { if (onUnmapColumn) onUnmapColumn(columnName); onClose(); }}
            className="w-full px-3.5 py-2.5 flex items-center space-x-2.5 hover:bg-rose-50 text-rose-600 transition cursor-pointer"
          >
            <Trash2 size={14} className="text-rose-500" />
            <span className="font-medium">Unmap column</span>
          </button>
        </div>
      )}

      {/* 2. Split a column modal (Screen 52 Left) */}
      {activeModal === 'split' && (
        <div className="bg-white border border-slate-200/90 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col" style={{ zoom: 0.92 }}>
          <div className="px-6 pt-5 pb-4 flex items-center justify-between border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Split a column</h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{columnName || 'Transaction_Place'}</p>
            </div>
            <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700">
              <X size={16} />
            </button>
          </div>

          <div className="p-6 space-y-4 text-xs">
            {/* Split on Selector */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1.5">Split on</label>
              <div className="flex items-center space-x-2">
                {(['Comma', 'Space', 'Backslash', 'Custom'] as const).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSplitDelimiter(opt)}
                    className={`px-3 py-1.5 rounded-lg border font-medium transition cursor-pointer ${
                      splitDelimiter === opt
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Part Names */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Part 1 name</label>
                <input
                  type="text"
                  value={part1Name}
                  onChange={(e) => setPart1Name(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Part 2 name</label>
                <input
                  type="text"
                  value={part2Name}
                  onChange={(e) => setPart2Name(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none"
                />
              </div>
            </div>

            {/* Keep original checkbox */}
            <label className="flex items-center space-x-2 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={keepOriginalSplit}
                onChange={(e) => setKeepOriginalSplit(e.target.checked)}
                className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
              />
              <span>Keep the original column</span>
            </label>

            {/* Live Preview */}
            <div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Live preview</div>
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 text-[10px]">
                      <th className="py-2 px-3">{part1Name || 'Part 1'}</th>
                      <th className="py-2 px-3">{part2Name || 'Part 2'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {sampleValues.map((val, idx) => {
                      const parts = val.split(actualDelimiter || '\\');
                      return (
                        <tr key={idx}>
                          <td className="py-2 px-3 text-slate-800">{parts[0] || 'YPT00074'}</td>
                          <td className="py-2 px-3 text-slate-800">{parts[1] || 'BISRATEGEBRIEL SAHILU GETANEH'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end space-x-2.5">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-medium text-xs">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmSplit}
              className="px-4 py-2 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl font-semibold text-xs transition"
            >
              Split column
            </button>
          </div>
        </div>
      )}

      {/* 3. Merge columns modal (Screen 52 Middle) */}
      {activeModal === 'merge' && (
        <div className="bg-white border border-slate-200/90 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col" style={{ zoom: 0.92 }}>
          <div className="px-6 pt-5 pb-4 flex items-center justify-between border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Merge columns</h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedColumns.join(' + ')}</p>
            </div>
            <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700">
              <X size={16} />
            </button>
          </div>

          <div className="p-6 space-y-4 text-xs">
            {/* Columns tag */}
            <div className="p-2 bg-slate-100 rounded-lg font-mono text-xs text-slate-800 flex items-center space-x-2">
              <span>{selectedColumns[0] || 'Terminal_ID'}</span>
              <span className="text-slate-400">+</span>
              <span>{selectedColumns[1] || 'Transaction_Place'}</span>
            </div>

            {/* Separator */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1.5">Separator</label>
              <div className="flex items-center space-x-2">
                {(['Space', 'Dash', 'None', 'Custom'] as const).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setMergeSeparator(opt)}
                    className={`px-3 py-1.5 rounded-lg border font-medium transition cursor-pointer ${
                      mergeSeparator === opt
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* New Column Name */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1">New column name</label>
              <input
                type="text"
                value={newMergeColName}
                onChange={(e) => setNewMergeColName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none"
              />
            </div>

            {/* Keep source columns */}
            <label className="flex items-center space-x-2 cursor-pointer text-slate-700">
              <input
                type="checkbox"
                checked={keepSourceMerge}
                onChange={(e) => setKeepSourceMerge(e.target.checked)}
                className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
              />
              <span>Keep the source columns</span>
            </label>

            {/* Live Preview */}
            <div>
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Live preview</div>
              <div className="p-3 border border-slate-200 rounded-xl bg-slate-50/50 font-mono text-xs space-y-1">
                <div>YPT00074{actualSeparator}YPT00074\\\\\\BISRATEGEBRIEL...</div>
                <div>YPT00243{actualSeparator}YPT00243\\\\\\AMAKELECH...</div>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end space-x-2.5">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-medium text-xs">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmMerge}
              className="px-4 py-2 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl font-semibold text-xs transition"
            >
              Merge columns
            </button>
          </div>
        </div>
      )}

      {/* 4. Add to global fields modal (Screen 52 Right) */}
      {activeModal === 'add_global' && (
        <div className="bg-white border border-slate-200/90 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col" style={{ zoom: 0.92 }}>
          <div className="px-6 pt-5 pb-4 flex items-center justify-between border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Add to global fields</h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{fieldKey}</p>
            </div>
            <button type="button" onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700">
              <X size={16} />
            </button>
          </div>

          <div className="p-6 space-y-4 text-xs">
            {/* Field Key */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Field key</label>
              <input
                type="text"
                value={fieldKey}
                onChange={(e) => setFieldKey(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:outline-none"
              />
            </div>

            {/* Label and Type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Label</label>
                <input
                  type="text"
                  value={fieldLabel}
                  onChange={(e) => setFieldLabel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Type</label>
                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none"
                >
                  <option value="Number">Number</option>
                  <option value="String">String</option>
                  <option value="Date">Date</option>
                  <option value="Boolean">Boolean</option>
                </select>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Category</label>
              <select
                value={fieldCategory}
                onChange={(e) => setFieldCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none"
              >
                <option value="Identity & reference">Identity & reference</option>
                <option value="Financial & amounts">Financial & amounts</option>
                <option value="Timestamps & dates">Timestamps & dates</option>
                <option value="Status & classification">Status & classification</option>
              </select>
            </div>

            {/* Map this column to the new field */}
            <div className="space-y-1">
              <label className="flex items-center space-x-2 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={autoMapGlobal}
                  onChange={(e) => setAutoMapGlobal(e.target.checked)}
                  className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                />
                <span className="font-medium">Map this column to the new field</span>
              </label>
              <p className="text-[11px] text-slate-400 pl-6">
                Saves it to the mapping dictionary so you do not have to leave this page.
              </p>
            </div>
          </div>

          <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end space-x-2.5">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-medium text-xs">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmAddGlobal}
              className="px-4 py-2 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl font-semibold text-xs transition"
            >
              Add field
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ColumnActionsPopover;

