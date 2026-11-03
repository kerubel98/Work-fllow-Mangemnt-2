/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Search, Plus, Upload, Trash2, Check, ArrowRight, Sparkles, BookOpen,
  ChevronDown, X, Save
} from 'lucide-react';
import { api } from '../../api/client';

export interface DictionaryItem {
  id: string;
  name: string;
  group: 'Institutions' | 'Statuses' | 'Response codes' | 'Channels & currency';
  appliedTo: string;
  direction: 'FORWARD' | 'REVERSE' | 'BOTH';
  ignoreCase: boolean;
  trim: boolean;
  noMatchPolicy: 'KEEP_ORIGINAL' | 'BLANK' | 'FALLBACK';
  pairs: { code: string; name: string; short?: string }[];
  missingPairs?: { code: string; count: number }[];
}

export function ValueDictionariesView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>('dict-inst');
  const [tryInput, setTryInput] = useState('02');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);

  // New Dictionary Form
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState<'Institutions' | 'Statuses' | 'Response codes' | 'Channels & currency'>('Institutions');

  // Dictionaries state matching 72_value_dictionaries.png
  const [dictionaries, setDictionaries] = useState<DictionaryItem[]>([
    {
      id: 'dict-inst',
      name: 'Institution IDs → names',
      group: 'Institutions',
      appliedTo: 'applied to 2 columns',
      direction: 'FORWARD',
      ignoreCase: true,
      trim: true,
      noMatchPolicy: 'KEEP_ORIGINAL',
      pairs: [
        { code: '01', name: 'Commercial Bank of Ethiopia', short: 'CBE' },
        { code: '02', name: 'Awash Bank', short: 'AIB' },
        { code: '03', name: 'Dashen Bank', short: 'DB' },
        { code: '04', name: 'Bank of Abyssinia', short: 'BoA' },
        { code: '05', name: 'Wegagen Bank', short: 'WB' },
        { code: '06', name: 'Buna Bank', short: 'BUN' },
        { code: '99', name: 'EthSwitch', short: 'ETS' }
      ],
      missingPairs: [
        { code: '07', count: 128 },
        { code: '11', count: 9 }
      ]
    },
    {
      id: 'dict-status',
      name: 'Transaction status codes → names',
      group: 'Statuses',
      appliedTo: 'applied to 1 column',
      direction: 'FORWARD',
      ignoreCase: true,
      trim: true,
      noMatchPolicy: 'KEEP_ORIGINAL',
      pairs: [
        { code: 'STL', name: 'Settled', short: 'STL' },
        { code: 'REV', name: 'Reversed', short: 'REV' },
        { code: 'PND', name: 'Pending Review', short: 'PND' },
        { code: 'DEC', name: 'Declined', short: 'DEC' },
        { code: 'ERR', name: 'System Error', short: 'ERR' }
      ]
    },
    {
      id: 'dict-record-state',
      name: 'Record state → names',
      group: 'Statuses',
      appliedTo: 'applied to 1 column',
      direction: 'FORWARD',
      ignoreCase: true,
      trim: true,
      noMatchPolicy: 'KEEP_ORIGINAL',
      pairs: [
        { code: '1', name: 'Active' },
        { code: '0', name: 'Archived' }
      ]
    },
    {
      id: 'dict-iso',
      name: 'ISO 8583 codes → descriptions',
      group: 'Response codes',
      appliedTo: 'applied to 1 column',
      direction: 'FORWARD',
      ignoreCase: true,
      trim: true,
      noMatchPolicy: 'KEEP_ORIGINAL',
      pairs: [
        { code: '00', name: 'Approved or completed successfully' },
        { code: '51', name: 'Insufficient funds' },
        { code: '54', name: 'Expired card' },
        { code: '55', name: 'Incorrect PIN' },
        { code: '91', name: 'System error / timeout' }
      ]
    },
    {
      id: 'dict-channel',
      name: 'Channel codes → names',
      group: 'Channels & currency',
      appliedTo: 'applied to 1 column',
      direction: 'FORWARD',
      ignoreCase: true,
      trim: true,
      noMatchPolicy: 'KEEP_ORIGINAL',
      pairs: [
        { code: 'ATM', name: 'Automated Teller Machine', short: 'ATM' },
        { code: 'POS', name: 'Point of Sale', short: 'POS' },
        { code: 'MB', name: 'Mobile Banking', short: 'MB' },
        { code: 'IB', name: 'Internet Banking', short: 'IB' },
        { code: 'USSD', name: 'USSD Shortcode', short: 'USSD' },
        { code: 'QR', name: 'Merchant QR Pay', short: 'QR' }
      ]
    },
    {
      id: 'dict-currency',
      name: 'Currency names → ISO-4217',
      group: 'Channels & currency',
      appliedTo: 'applied to 1 column',
      direction: 'FORWARD',
      ignoreCase: true,
      trim: true,
      noMatchPolicy: 'KEEP_ORIGINAL',
      pairs: [
        { code: 'ETB', name: 'Ethiopian Birr', short: 'ETB' },
        { code: 'USD', name: 'US Dollar', short: 'USD' },
        { code: 'EUR', name: 'Euro', short: 'EUR' },
        { code: 'GBP', name: 'British Pound', short: 'GBP' }
      ]
    }
  ]);

  const activeDict = useMemo(() => {
    return dictionaries.find(d => d.id === selectedId) || dictionaries[0];
  }, [dictionaries, selectedId]);

  // Grouped dictionaries for left sidebar
  const groups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const grps: { name: string; items: DictionaryItem[] }[] = [
      { name: 'Institutions', items: [] },
      { name: 'Statuses', items: [] },
      { name: 'Response codes', items: [] },
      { name: 'Channels & currency', items: [] }
    ];

    dictionaries.forEach(d => {
      if (!q || d.name.toLowerCase().includes(q)) {
        const target = grps.find(g => g.name === d.group);
        if (target) target.items.push(d);
      }
    });

    return grps.filter(g => g.items.length > 0);
  }, [dictionaries, searchQuery]);

  // Live translation tester (matching Try it card)
  const translationOutput = useMemo(() => {
    if (!tryInput.trim() || !activeDict) return '';
    const needle = activeDict.trim ? tryInput.trim() : tryInput;
    const match = activeDict.pairs.find(p =>
      activeDict.ignoreCase
        ? p.code.toLowerCase() === needle.toLowerCase()
        : p.code === needle
    );
    if (match) return match.name;
    return activeDict.noMatchPolicy === 'KEEP_ORIGINAL' ? tryInput : '(no match)';
  }, [tryInput, activeDict]);

  const updateActiveDict = (patch: Partial<DictionaryItem>) => {
    setDictionaries(prev =>
      prev.map(d => (d.id === activeDict.id ? { ...d, ...patch } : d))
    );
  };

  const handlePairChange = (index: number, field: 'code' | 'name' | 'short', val: string) => {
    const nextPairs = [...activeDict.pairs];
    nextPairs[index] = { ...nextPairs[index], [field]: val };
    updateActiveDict({ pairs: nextPairs });
  };

  const handleDeletePair = (index: number) => {
    const nextPairs = activeDict.pairs.filter((_, i) => i !== index);
    updateActiveDict({ pairs: nextPairs });
  };

  const handleAddPairFromMissing = (missingCode: string) => {
    const defaultName = missingCode === '07' ? 'Oromia Bank' : missingCode === '11' ? 'Cooperative Bank of Oromia' : 'New Bank';
    const defaultShort = missingCode === '07' ? 'OB' : missingCode === '11' ? 'CBO' : undefined;

    const nextPairs = [...activeDict.pairs, { code: missingCode, name: defaultName, short: defaultShort }];
    const nextMissing = (activeDict.missingPairs || []).filter(m => m.code !== missingCode);
    updateActiveDict({ pairs: nextPairs, missingPairs: nextMissing });
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }, 400);
  };

  const handleCreateDictionary = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const created: DictionaryItem = {
      id: `dict-${Date.now()}`,
      name: newName.trim(),
      group: newGroup,
      appliedTo: '0 columns',
      direction: 'FORWARD',
      ignoreCase: true,
      trim: true,
      noMatchPolicy: 'KEEP_ORIGINAL',
      pairs: []
    };

    setDictionaries(prev => [created, ...prev]);
    setSelectedId(created.id);
    setShowNewModal(false);
    setNewName('');
  };

  return (
    <div className="space-y-4 text-xs text-slate-800">
      {/* 3-Column Grid matching 72_value_dictionaries.png */}
      <div className="grid grid-cols-12 gap-5 items-start">
        {/* COLUMN 1: LEFT SIDEBAR (3 cols) */}
        <div className="col-span-12 lg:col-span-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search dictionaries..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs w-full focus:outline-none shadow-2xs"
            />
          </div>

          <div className="space-y-5">
            {groups.map(grp => (
              <div key={grp.name} className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-400 px-2">{grp.name}</div>
                <div className="space-y-0.5">
                  {grp.items.map(item => {
                    const isSelected = item.id === activeDict.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className={`w-full text-left px-3 py-2 rounded-xl transition cursor-pointer flex items-center justify-between text-xs ${
                          isSelected
                            ? 'bg-orange-50/40 text-slate-900 font-bold border-l-2 border-[#F97316]'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                        }`}
                      >
                        <span className="truncate pr-2">{item.name}</span>
                        <span className={`text-[11px] font-mono px-1.5 py-0.2 rounded ${isSelected ? 'text-slate-900 font-bold' : 'text-slate-400'}`}>
                          {item.pairs.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* COLUMN 2: CENTER WORKBENCH (6 cols) */}
        <div className="col-span-12 lg:col-span-6 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
          {/* Header Row */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">{activeDict.name}</h2>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-medium">
                  {activeDict.group}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {activeDict.pairs.length} pairs · {activeDict.appliedTo}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5 shadow-2xs"
              >
                <Upload size={13} className="text-slate-500" />
                <span>Import CSV</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-1.5 bg-[#0F142A] hover:bg-slate-800 text-white rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5 shadow-xs"
              >
                {saveSuccess ? <Check size={13} className="text-emerald-400" /> : <Save size={13} />}
                <span>{isSaving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save changes'}</span>
              </button>
            </div>
          </div>

          {/* Configuration Controls matching 72_value_dictionaries.png */}
          <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-100 text-xs">
            {/* Direction */}
            <div>
              <div className="text-[11px] font-semibold text-slate-400 block mb-1">Direction</div>
              <div className="inline-flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/60 shadow-2xs">
                <button
                  type="button"
                  onClick={() => updateActiveDict({ direction: 'FORWARD' })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeDict.direction === 'FORWARD' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Code → Name
                </button>
                <button
                  type="button"
                  onClick={() => updateActiveDict({ direction: 'REVERSE' })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeDict.direction === 'REVERSE' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Name → Code
                </button>
                <button
                  type="button"
                  onClick={() => updateActiveDict({ direction: 'BOTH' })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activeDict.direction === 'BOTH' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Both
                </button>
              </div>
            </div>

            {/* Matching Flags */}
            <div>
              <div className="text-[11px] font-semibold text-slate-400 block mb-1">Matching</div>
              <div className="flex items-center space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => updateActiveDict({ ignoreCase: !activeDict.ignoreCase })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer transition ${
                    activeDict.ignoreCase ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {activeDict.ignoreCase && <Check size={11} />}
                  <span>Ignore case</span>
                </button>

                <button
                  type="button"
                  onClick={() => updateActiveDict({ trim: !activeDict.trim })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer transition ${
                    activeDict.trim ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {activeDict.trim && <Check size={11} />}
                  <span>Trim</span>
                </button>
              </div>
            </div>

            {/* If No Match */}
            <div>
              <div className="text-[11px] font-semibold text-slate-400 block mb-1">If no match</div>
              <select
                value={activeDict.noMatchPolicy}
                onChange={(e) => updateActiveDict({ noMatchPolicy: e.target.value as any })}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 focus:outline-none cursor-pointer shadow-2xs"
              >
                <option value="KEEP_ORIGINAL">Keep original</option>
                <option value="BLANK">Leave blank</option>
                <option value="FALLBACK">Use default fallback</option>
              </select>
            </div>
          </div>

          {/* Pairs Table matching 72_value_dictionaries.png */}
          <div className="border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-medium text-[11px] bg-slate-50/50">
                  <th className="py-2.5 px-4 w-28">Code</th>
                  <th className="py-2.5 px-4">Name</th>
                  <th className="py-2.5 px-4 w-24">Short</th>
                  <th className="py-2.5 px-4 text-right w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-xs">
                {activeDict.pairs.map((p, idx) => (
                  <tr key={`${p.code}-${idx}`} className="hover:bg-slate-50/60 transition">
                    <td className="py-2.5 px-4 font-bold text-slate-900">
                      {p.code}
                    </td>
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-800">
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => handlePairChange(idx, 'name', e.target.value)}
                        className="w-full px-2 py-1 bg-transparent hover:bg-slate-50 border border-transparent hover:border-slate-200 focus:border-orange-500 rounded-lg focus:outline-none"
                      />
                    </td>
                    <td className="py-2.5 px-4">
                      {p.short ? (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-mono">
                          {p.short}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeletePair(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                        title="Delete pair"
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

        {/* COLUMN 3: RIGHT SIDEBAR (3 cols) */}
        <div className="col-span-12 lg:col-span-3 space-y-5">
          {/* Try It Card matching 72_value_dictionaries.png */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
            <h3 className="font-bold text-slate-900 text-xs">Try it</h3>
            <input
              type="text"
              value={tryInput}
              onChange={(e) => setTryInput(e.target.value)}
              placeholder="e.g. 02"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none focus:border-orange-500 shadow-2xs"
            />

            {/* Translation Output Banner */}
            <div className="p-3 bg-[#F97316] text-white rounded-xl font-bold text-xs text-center shadow-xs">
              {translationOutput || 'Type a code to preview'}
            </div>
          </div>

          {/* Not In This Dictionary Card matching 72_value_dictionaries.png */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-xs">Not in this dictionary</h3>
              <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 font-bold rounded text-[10px]">
                {activeDict.missingPairs?.length || 0}
              </span>
            </div>

            {(!activeDict.missingPairs || activeDict.missingPairs.length === 0) ? (
              <div className="text-[11px] text-slate-400">All observed codes in data are mapped.</div>
            ) : (
              <div className="space-y-2">
                {activeDict.missingPairs.map(m => (
                  <div key={m.code} className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-slate-900">{m.code}</span>
                      <span className="text-[11px] text-slate-400 font-sans">{m.count} rows</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAddPairFromMissing(m.code)}
                      className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer shadow-2xs"
                    >
                      Add name
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* New Dictionary Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Create value dictionary</h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleCreateDictionary} className="space-y-3">
              <div>
                <label className="font-semibold text-slate-700 text-xs block mb-1">Dictionary Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Card type codes → names"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 text-xs block mb-1">Category Group</label>
                <select
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white focus:outline-none"
                >
                  <option value="Institutions">Institutions</option>
                  <option value="Statuses">Statuses</option>
                  <option value="Response codes">Response codes</option>
                  <option value="Channels & currency">Channels & currency</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-medium text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl font-semibold text-xs cursor-pointer shadow-xs"
                >
                  Create dictionary
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ValueDictionariesView;

