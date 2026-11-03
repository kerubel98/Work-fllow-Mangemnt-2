/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Search, Plus, Sparkles, Upload, Download, MoreHorizontal,
  Check, AlertTriangle, ChevronLeft, ChevronRight, X, Filter
} from 'lucide-react';
import { globalMappingService } from '../../services/globalMappingService';
import { GlobalTransactionSchemaField } from '../../types';

export interface MappingDictionaryViewProps {
  onAddFieldClick?: () => void;
}

export function MappingDictionaryView({ onAddFieldClick }: MappingDictionaryViewProps) {
  const [fields, setFields] = useState<GlobalTransactionSchemaField[]>(() =>
    globalMappingService.getStandardFields()
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [filterMode, setFilterMode] = useState<'ALL' | 'REQUIRED' | 'UNCLASSIFIED'>('ALL');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [isAutoClassifying, setIsAutoClassifying] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Pagination State - 10 rows per page default
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Add Field Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState('string');
  const [newCategory, setNewCategory] = useState('Audit & timestamps');
  const [newRequired, setNewRequired] = useState(false);

  const categories = useMemo(() => {
    return [
      'ALL',
      'Audit & timestamps',
      'Financial & amounts',
      'Identity & reference',
      'Merchant & POS',
      'Card & Auth',
      'Network & Routing',
      'Unclassified'
    ];
  }, []);

  // Filtered and Searched fields
  const filteredFields = useMemo(() => {
    return fields.filter(f => {
      // Search
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        f.key.toLowerCase().includes(q) ||
        f.label.toLowerCase().includes(q) ||
        (f.description && f.description.toLowerCase().includes(q));

      // Category Dropdown
      const cat = f.category || 'Unclassified';
      const matchesCat = selectedCategory === 'ALL' || cat === selectedCategory;

      // Filter Mode Pills
      let matchesMode = true;
      if (filterMode === 'REQUIRED') matchesMode = !!f.required;
      if (filterMode === 'UNCLASSIFIED') matchesMode = !f.category || f.category === 'Unclassified';

      return matchesSearch && matchesCat && matchesMode;
    });
  }, [fields, searchQuery, selectedCategory, filterMode]);

  // Paginated fields
  const paginatedFields = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredFields.slice(start, start + pageSize);
  }, [filteredFields, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredFields.length / pageSize) || 1;

  // Unclassified count
  const unclassifiedCount = useMemo(() => {
    return fields.filter(f => !f.category || f.category === 'Unclassified').length;
  }, [fields]);

  const toggleSelectRow = (key: string) => {
    setSelectedKeys(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleSelectAllOnPage = () => {
    const pageKeys = paginatedFields.map(f => f.key);
    const allSelected = pageKeys.every(k => selectedKeys.includes(k));
    if (allSelected) {
      setSelectedKeys(prev => prev.filter(k => !pageKeys.includes(k)));
    } else {
      setSelectedKeys(prev => Array.from(new Set([...prev, ...pageKeys])));
    }
  };

  const handleAutoClassify = () => {
    setIsAutoClassifying(true);
    setTimeout(() => {
      setFields(prev =>
        prev.map(f => {
          if (!f.category || f.category === 'Unclassified') {
            const k = f.key.toLowerCase();
            let cat = 'General';
            if (k.includes('date') || k.includes('time') || k.includes('stamp')) cat = 'Audit & timestamps';
            else if (k.includes('amt') || k.includes('amount') || k.includes('fee') || k.includes('rate')) cat = 'Financial & amounts';
            else if (k.includes('ref') || k.includes('id') || k.includes('trace') || k.includes('num')) cat = 'Identity & reference';
            else if (k.includes('merch') || k.includes('pos') || k.includes('terminal')) cat = 'Merchant & POS';
            return { ...f, category: cat };
          }
          return f;
        })
      );
      setIsAutoClassifying(false);
      setBannerDismissed(true);
    }, 600);
  };

  const handleBulkSetCategory = (cat: string) => {
    setFields(prev =>
      prev.map(f => (selectedKeys.includes(f.key) ? { ...f, category: cat } : f))
    );
    setSelectedKeys([]);
  };

  const handleBulkMarkRequired = () => {
    setFields(prev =>
      prev.map(f => (selectedKeys.includes(f.key) ? { ...f, required: true } : f))
    );
    setSelectedKeys([]);
  };

  const handleCreateField = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return;

    const newField: GlobalTransactionSchemaField = {
      id: `gsd-${Date.now()}`,
      key: newKey.trim().toLowerCase(),
      label: newLabel.trim() || newKey.trim().toUpperCase(),
      dataType: newType as any,
      category: newCategory,
      required: newRequired,
      description: 'Custom global standard field'
    };

    globalMappingService.addStandardField(newField);
    setFields(prev => [newField, ...prev]);
    setShowAddModal(false);
    setNewKey('');
    setNewLabel('');
  };

  return (
    <div className="space-y-4 text-xs text-slate-800">
      {/* Warning Banner: Some fields have no category (matching 71_mapping_dictionary.png) */}
      {!bannerDismissed && unclassifiedCount > 0 && (
        <div className="p-3.5 bg-amber-50/90 border border-amber-200/90 rounded-2xl flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle size={15} className="text-amber-600 shrink-0" />
            <span className="text-amber-900 font-medium">
              Some fields have no category. Group them automatically.
            </span>
          </div>

          <button
            type="button"
            onClick={handleAutoClassify}
            disabled={isAutoClassifying}
            className="px-3.5 py-1.5 bg-white border border-amber-200 hover:bg-amber-50 text-amber-900 rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5 shadow-2xs"
          >
            <Sparkles size={13} className="text-orange-500" />
            <span>{isAutoClassifying ? 'Classifying...' : 'Auto-classify'}</span>
          </button>
        </div>
      )}

      {/* Filter Toolbar matching 71_mapping_dictionary.png */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3 flex-1 flex-wrap">
          {/* Search Field */}
          <div className="relative min-w-[240px]">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search field key or label..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs w-full focus:outline-none shadow-2xs"
            />
          </div>

          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none cursor-pointer shadow-2xs"
          >
            {categories.map(c => (
              <option key={c} value={c}>{c === 'ALL' ? 'All categories' : c}</option>
            ))}
          </select>

          {/* Filter Pills */}
          <div className="inline-flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/60 shadow-2xs">
            <button
              type="button"
              onClick={() => { setFilterMode('ALL'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-semibold text-xs transition cursor-pointer ${
                filterMode === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => { setFilterMode('REQUIRED'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-semibold text-xs transition cursor-pointer ${
                filterMode === 'REQUIRED' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Required
            </button>
            <button
              type="button"
              onClick={() => { setFilterMode('UNCLASSIFIED'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-semibold text-xs transition cursor-pointer ${
                filterMode === 'UNCLASSIFIED' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Unclassified
            </button>
          </div>
        </div>

        {/* Right Action Buttons matching 71 */}
        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={handleAutoClassify}
            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5 shadow-2xs"
            title="Discover fields automatically from database catalogs"
          >
            <Sparkles size={13} className="text-slate-500" />
            <span>Discover from resources</span>
          </button>

          <button
            type="button"
            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5 shadow-2xs"
          >
            <Upload size={13} className="text-slate-500" />
            <span>Import</span>
          </button>

          <button
            type="button"
            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5 shadow-2xs"
          >
            <Download size={13} className="text-slate-500" />
            <span>Export</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-1.5 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1 shadow-xs"
          >
            <Plus size={14} />
            <span>Add field</span>
          </button>
        </div>
      </div>

      {/* Bulk Selection Bar (matching 71_mapping_dictionary.png) */}
      {selectedKeys.length > 0 && (
        <div className="p-2.5 bg-[#0F142A] text-white rounded-2xl flex items-center justify-between shadow-lg animate-in fade-in duration-150">
          <div className="flex items-center space-x-3 px-2">
            <span className="font-bold text-xs">{selectedKeys.length} selected</span>
          </div>

          <div className="flex items-center space-x-2">
            <select
              onChange={(e) => {
                if (e.target.value) handleBulkSetCategory(e.target.value);
              }}
              defaultValue=""
              className="px-3 py-1 bg-slate-800 text-white text-xs rounded-xl border border-slate-700 focus:outline-none cursor-pointer"
            >
              <option value="" disabled>Set category...</option>
              {categories.filter(c => c !== 'ALL').map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleBulkMarkRequired}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold text-xs transition cursor-pointer"
            >
              Mark required
            </button>

            <button
              type="button"
              onClick={() => setSelectedKeys([])}
              className="p-1 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
              title="Clear selection"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Fields Table matching 71_mapping_dictionary.png */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-100 text-slate-400 font-medium text-[11px] bg-slate-50/50">
              <th className="py-3 px-4 w-10 text-center">
                <input
                  type="checkbox"
                  checked={paginatedFields.length > 0 && paginatedFields.every(f => selectedKeys.includes(f.key))}
                  onChange={handleSelectAllOnPage}
                  className="rounded border-slate-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
                />
              </th>
              <th className="py-3 px-4">Field key</th>
              <th className="py-3 px-4">Label</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4">Used in</th>
              <th className="py-3 px-4 text-right w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {paginatedFields.map(field => {
              const isSelected = selectedKeys.includes(field.key);
              const isUnclassified = !field.category || field.category === 'Unclassified';

              return (
                <tr
                  key={field.key}
                  className={`hover:bg-slate-50/60 transition ${isSelected ? 'bg-orange-50/20' : ''}`}
                >
                  <td className="py-3 px-4 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectRow(field.key)}
                      className="rounded border-slate-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
                    />
                  </td>

                  {/* Field key + Resource note */}
                  <td className="py-3 px-4">
                    <div className="font-mono font-bold text-slate-900">{field.key}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      Sett · auth_log_tab
                    </div>
                  </td>

                  {/* Display Label */}
                  <td className="py-3 px-4 font-semibold text-slate-700">
                    {field.label}
                  </td>

                  {/* Data Type Badge */}
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 bg-slate-100 rounded-md text-[10px] font-mono font-medium text-slate-600">
                      {field.dataType ? field.dataType.charAt(0).toUpperCase() + field.dataType.slice(1) : 'String'}
                    </span>
                  </td>

                  {/* Category Badge */}
                  <td className="py-3 px-4">
                    {isUnclassified ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        Unclassified
                      </span>
                    ) : (
                      <span className="text-slate-600 font-medium">
                        {field.category}
                      </span>
                    )}
                  </td>

                  {/* Used in */}
                  <td className="py-3 px-4 text-slate-500">
                    1 table
                  </td>

                  {/* Row Actions */}
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination Footer matching 71_mapping_dictionary.png */}
        <div className="p-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing {filteredFields.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredFields.length)} of {filteredFields.length} fields
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1.5">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="border border-slate-200 rounded-lg px-2 py-0.5 bg-white text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center space-x-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="p-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="font-mono text-xs px-2">Page {currentPage} of {totalPages}</span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="p-1 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add Field Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Add global standard field</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleCreateField} className="space-y-3">
              <div>
                <label className="font-semibold text-slate-700 text-xs block mb-1">Standard Field Key</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. auth_code"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 text-xs block mb-1">Display Label</label>
                <input
                  type="text"
                  placeholder="e.g. Authorization Code"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 text-xs block mb-1">Data Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none"
                  >
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="boolean">Boolean</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 text-xs block mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none"
                  >
                    {categories.filter(c => c !== 'ALL' && c !== 'Unclassified').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="Unclassified">Unclassified</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="field-required-chk"
                  checked={newRequired}
                  onChange={(e) => setNewRequired(e.target.checked)}
                  className="rounded border-slate-300 text-orange-500 focus:ring-orange-500 cursor-pointer"
                />
                <label htmlFor="field-required-chk" className="text-slate-700 text-xs cursor-pointer select-none">
                  Required field (validation rules require this mapped)
                </label>
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-medium text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl font-semibold text-xs cursor-pointer shadow-xs"
                >
                  Save field
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default MappingDictionaryView;

