/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search, Plus, Upload, Trash2, Check, ArrowRight, Sparkles, BookOpen,
  ChevronDown, X, Save, ArrowDown, Wand2, AlertCircle
} from 'lucide-react';
import { api } from '../../api/client';
import { ValueTranslationDictionary } from '../../types';
import { DataTablePagination } from '../common/DataTablePagination';

export const PRE_TRANSFORM_OPTIONS = [
  { value: '', label: 'None (Raw Value)' },
  { value: 'TRIM', label: 'Trim Whitespace' },
  { value: 'UPPERCASE', label: 'Convert to UPPERCASE' },
  { value: 'LOWERCASE', label: 'Convert to lowercase' },
  { value: 'STRIP_CURRENCY', label: 'Clean Number / Strip Currency ($/ETB)' },
  { value: 'PHONE_ET', label: 'Normalize Ethiopian Phone (+251)' },
  { value: 'DATE_ISO', label: 'Standardize Date to ISO (YYYY-MM-DD)' }
];

export const POST_TRANSFORM_OPTIONS = [
  { value: '', label: 'None (Direct Target)' },
  { value: 'UPPERCASE', label: 'Force UPPERCASE' },
  { value: 'TITLECASE', label: 'Format as Title Case' },
  { value: 'MASK_PAN', label: 'Mask Account / PAN (4111****1111)' }
];

export interface DictionaryItem {
  id: string;
  name: string;
  group: 'Institutions' | 'Statuses' | 'Response codes' | 'Channels & currency';
  appliedTo: string;
  direction: 'FORWARD' | 'REVERSE' | 'BOTH';
  ignoreCase: boolean;
  trim: boolean;
  noMatchPolicy: 'KEEP_ORIGINAL' | 'BLANK' | 'USE_FALLBACK' | 'FLAG';
  preTransformRule?: string;
  postTransformRule?: string;
  pairs: { code: string; name: string; short?: string }[];
  missingPairs?: { code: string; count: number }[];
}

export function ValueDictionariesView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>('dict-inst');
  const [tryInput, setTryInput] = useState('02');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // New Value Pair Inputs
  const [newPairCode, setNewPairCode] = useState('');
  const [newPairName, setNewPairName] = useState('');
  const [newPairShort, setNewPairShort] = useState('');
  const newCodeInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pairs Table Pagination & Search (Cases-style)
  const [pairSearchQuery, setPairSearchQuery] = useState('');
  const [pairsPage, setPairsPage] = useState(1);
  const [pairsPageSize, setPairsPageSize] = useState(7);

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

  // Load persisted dictionaries from PostgreSQL
  useEffect(() => {
    let isMounted = true;
    api.getValueTranslationDictionaries().then(res => {
      if (!isMounted || !res || res.length === 0) return;
      const mapped: DictionaryItem[] = res.map(d => ({
        id: d.id,
        name: d.name,
        group: (d.groupName as any) || (d.category === 'BANK_CODES' ? 'Institutions' : d.category === 'STATUS_CODES' ? 'Statuses' : d.category === 'CHANNEL_CODES' || d.category === 'CURRENCIES' ? 'Channels & currency' : 'Response codes'),
        appliedTo: `applied to ${d.attachedColumns?.length || 0} columns`,
        direction: d.direction as any,
        ignoreCase: d.ignoreCase,
        trim: d.trimWhitespace,
        noMatchPolicy: d.noMatchPolicy as any,
        preTransformRule: d.preTransformRule,
        postTransformRule: d.postTransformRule,
        pairs: (d.mappings || []).map((m: any) => ({
          code: String(m.code ?? m.sourceValue ?? m.source ?? ''),
          name: String(m.name ?? m.targetValue ?? m.target ?? ''),
          short: String(m.short ?? m.shortName ?? m.shortCode ?? m.notes ?? '')
        })),
        missingPairs: (d.untranslatedSamples || []).map(u => ({ code: u.rawValue, count: u.occurrences }))
      }));
      setDictionaries(mapped);
      if (!mapped.some(m => m.id === selectedId)) {
        setSelectedId(mapped[0].id);
      }
    }).catch(err => {
      console.warn('PostgreSQL value dictionaries fetch warning, using defaults:', err);
    });
    return () => { isMounted = false; };
  }, []);

  // Live translation tester (with pre-transform and post-transform preview)
  const [tryResult, setTryResult] = useState<{
    input: string;
    preTransformedInput?: string;
    postTransformedOutput?: string;
    output: string;
    matched: boolean;
    ruleApplied?: string;
  } | null>(null);

  useEffect(() => {
    if (!activeDict || !tryInput) {
      setTryResult(null);
      return;
    }
    const timer = setTimeout(() => {
      api.previewValueDictionary(activeDict.id, tryInput, {
        direction: activeDict.direction as any,
        trimWhitespace: activeDict.trim,
        ignoreCase: activeDict.ignoreCase,
        noMatchPolicy: activeDict.noMatchPolicy as any,
        mappings: activeDict.pairs.map(p => ({
          sourceValue: p.code,
          targetValue: p.name,
          shortName: p.short,
          notes: p.short,
          source: p.code,
          target: p.name,
          shortCode: p.short
        })),
        preTransformRule: activeDict.preTransformRule,
        postTransformRule: activeDict.postTransformRule
      } as any).then(res => {
        setTryResult(res as any);
      }).catch(() => {
        // Fallback local computation if API preview unreachable
        let val = tryInput;
        if (activeDict.preTransformRule === 'UPPERCASE') val = val.toUpperCase();
        else if (activeDict.preTransformRule === 'LOWERCASE') val = val.toLowerCase();
        else if (activeDict.preTransformRule === 'STRIP_CURRENCY') val = val.replace(/[^0-9.-]+/g, '');
        else if (activeDict.trim || activeDict.preTransformRule === 'TRIM') val = val.trim();

        const match = activeDict.pairs.find(p => {
          const codeMatch = activeDict.ignoreCase ? p.code.toLowerCase() === val.toLowerCase() : p.code === val;
          const nameMatch = (activeDict.direction === 'BOTH' || activeDict.direction === 'REVERSE')
            ? (activeDict.ignoreCase ? p.name.toLowerCase() === val.toLowerCase() : p.name === val)
            : false;
          return codeMatch || nameMatch;
        });
        let out = match
          ? (match.code.toLowerCase() === val.toLowerCase() ? match.name : match.code)
          : (activeDict.noMatchPolicy === 'KEEP_ORIGINAL' ? val : '');
        if (activeDict.postTransformRule === 'UPPERCASE') out = out.toUpperCase();
        setTryResult({
          input: tryInput,
          preTransformedInput: val !== tryInput ? val : undefined,
          output: out,
          matched: !!match
        });
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [activeDict, tryInput]);

  const translationOutput = useMemo(() => {
    if (tryResult) return tryResult.output;
    if (!tryInput.trim() || !activeDict) return '';
    const needle = activeDict.trim ? tryInput.trim() : tryInput;
    const match = activeDict.pairs.find(p => {
      const codeMatch = activeDict.ignoreCase ? p.code.toLowerCase() === needle.toLowerCase() : p.code === needle;
      const nameMatch = (activeDict.direction === 'BOTH' || activeDict.direction === 'REVERSE')
        ? (activeDict.ignoreCase ? p.name.toLowerCase() === needle.toLowerCase() : p.name === needle)
        : false;
      return codeMatch || nameMatch;
    });
    if (match) {
      return match.code.toLowerCase() === needle.toLowerCase() ? match.name : match.code;
    }
    return activeDict.noMatchPolicy === 'KEEP_ORIGINAL' ? tryInput : '(no match)';
  }, [tryResult, tryInput, activeDict]);

  const updateActiveDict = (patch: Partial<DictionaryItem>) => {
    setDictionaries(prev =>
      prev.map(d => (d.id === activeDict.id ? { ...d, ...patch } : d))
    );
  };

  const handlePairChange = (index: number, field: 'code' | 'name' | 'short', val: string) => {
    const nextPairs = [...activeDict.pairs];
    nextPairs[index] = { ...nextPairs[index], [field]: val };
    updateActiveDict({ pairs: nextPairs });
    setHasUnsavedChanges(true);
  };

  const handleDeletePair = async (index: number) => {
    const nextPairs = activeDict.pairs.filter((_, i) => i !== index);
    updateActiveDict({ pairs: nextPairs });

    // Recalculate pagination bounds so if the last item on page is deleted, it doesn't show empty
    const nextFiltered = pairSearchQuery.trim()
      ? nextPairs.filter(p =>
          (p.code || '').toLowerCase().includes(pairSearchQuery.trim().toLowerCase()) ||
          (p.name || '').toLowerCase().includes(pairSearchQuery.trim().toLowerCase()) ||
          (p.short || '').toLowerCase().includes(pairSearchQuery.trim().toLowerCase())
        )
      : nextPairs;
    const maxPage = Math.max(1, Math.ceil(nextFiltered.length / pairsPageSize));
    if (pairsPage > maxPage) {
      setPairsPage(maxPage);
    }

    try {
      await api.updateValueTranslationDictionary(activeDict.id, {
        mappings: nextPairs.map(p => ({
          sourceValue: p.code,
          targetValue: p.name,
          shortName: p.short,
          notes: p.short,
          source: p.code,
          target: p.name,
          shortCode: p.short,
          code: p.code,
          name: p.name
        }))
      });
      setSaveSuccess(true);
      setHasUnsavedChanges(false);
      setTimeout(() => setSaveSuccess(false), 1500);
    } catch (e: any) {
      console.warn('Instant delete persist warning:', e);
      setSaveError(e.message || 'Failed to persist deletion to database');
      setHasUnsavedChanges(true);
      setTimeout(() => setSaveError(null), 5000);
    }
  };

  const handleAddNewPair = async () => {
    if (!newPairCode.trim() && !newPairName.trim()) return;
    const newPair = {
      code: newPairCode.trim(),
      name: newPairName.trim(),
      short: newPairShort.trim() || undefined
    };
    const nextPairs = [newPair, ...activeDict.pairs];
    updateActiveDict({ pairs: nextPairs });
    setNewPairCode('');
    setNewPairName('');
    setNewPairShort('');
    setPairsPage(1);

    try {
      await api.updateValueTranslationDictionary(activeDict.id, {
        mappings: nextPairs.map(p => ({
          sourceValue: p.code,
          targetValue: p.name,
          shortName: p.short,
          notes: p.short,
          source: p.code,
          target: p.name,
          shortCode: p.short,
          code: p.code,
          name: p.name
        }))
      });
      setSaveSuccess(true);
      setHasUnsavedChanges(false);
      setTimeout(() => setSaveSuccess(false), 1500);
      newCodeInputRef.current?.focus();
    } catch (e: any) {
      console.warn('Instant add persist warning:', e);
      setSaveError(e.message || 'Failed to persist new pair to database');
      setHasUnsavedChanges(true);
      setTimeout(() => setSaveError(null), 5000);
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const incoming: { code: string; name: string; short?: string }[] = [];
      for (const line of lines) {
        const delimiter = line.includes('\t') ? '\t' : line.includes(';') && !line.includes(',') ? ';' : ',';
        const parts = line.split(delimiter).map(s => s.trim().replace(/^["']|["']$/g, ''));
        if (parts[0] && parts[1]) {
          incoming.push({ code: parts[0], name: parts[1], short: parts[2] || undefined });
        }
      }
      if (incoming.length > 0) {
        const existingCodes = new Set(activeDict.pairs.map(p => p.code.toLowerCase()));
        const added = incoming.filter(i => !existingCodes.has(i.code.toLowerCase()));
        const nextPairs = [...added, ...activeDict.pairs];
        updateActiveDict({ pairs: nextPairs });
        setHasUnsavedChanges(true);
        setPairsPage(1);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddPairFromMissing = async (missingCode: string) => {
    const defaultName = missingCode === '07' ? 'Oromia Bank' : missingCode === '11' ? 'Cooperative Bank of Oromia' : 'New Bank';
    const defaultShort = missingCode === '07' ? 'OB' : missingCode === '11' ? 'CBO' : undefined;

    const nextPairs = [{ code: missingCode, name: defaultName, short: defaultShort }, ...activeDict.pairs];
    const nextMissing = (activeDict.missingPairs || []).filter(m => m.code !== missingCode);
    updateActiveDict({ pairs: nextPairs, missingPairs: nextMissing });
    setPairsPage(1);

    try {
      await api.updateValueTranslationDictionary(activeDict.id, {
        mappings: nextPairs.map(p => ({
          sourceValue: p.code,
          targetValue: p.name,
          shortName: p.short,
          notes: p.short,
          source: p.code,
          target: p.name,
          shortCode: p.short,
          code: p.code,
          name: p.name
        }))
      });
      setSaveSuccess(true);
      setHasUnsavedChanges(false);
      setTimeout(() => setSaveSuccess(false), 1500);
    } catch (e: any) {
      console.warn('Instant add from missing persist warning:', e);
      setSaveError(e.message || 'Failed to persist missing pair to database');
      setHasUnsavedChanges(true);
      setTimeout(() => setSaveError(null), 5000);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const payload: Partial<ValueTranslationDictionary> = {
        name: activeDict.name,
        groupName: activeDict.group,
        direction: activeDict.direction as any,
        ignoreCase: activeDict.ignoreCase,
        trimWhitespace: activeDict.trim,
        noMatchPolicy: activeDict.noMatchPolicy as any,
        preTransformRule: activeDict.preTransformRule,
        postTransformRule: activeDict.postTransformRule,
        mappings: activeDict.pairs.map(p => ({
          sourceValue: p.code,
          targetValue: p.name,
          shortName: p.short,
          notes: p.short,
          source: p.code,
          target: p.name,
          shortCode: p.short,
          code: p.code,
          name: p.name
        }))
      };
      await api.updateValueTranslationDictionary(activeDict.id, payload);
      setSaveSuccess(true);
      setHasUnsavedChanges(false);
      setSaveError(null);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e: any) {
      console.warn('Failed to save to PostgreSQL:', e);
      setSaveError(e.message || 'Failed to save dictionary to database');
      setHasUnsavedChanges(true);
      setTimeout(() => setSaveError(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateDictionary = async (e: React.FormEvent) => {
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
      preTransformRule: '',
      postTransformRule: '',
      pairs: []
    };

    try {
      const cat = newGroup === 'Institutions' ? 'BANK_CODES' : newGroup === 'Statuses' ? 'STATUS_CODES' : newGroup === 'Channels & currency' ? 'CHANNEL_CODES' : 'CUSTOM';
      const persisted = await api.createValueTranslationDictionary({
        name: created.name,
        category: cat as any,
        groupName: created.group,
        direction: created.direction,
        ignoreCase: created.ignoreCase,
        trimWhitespace: created.trim,
        noMatchPolicy: created.noMatchPolicy,
        mappings: []
      });
      if (persisted && persisted.id) {
        created.id = persisted.id;
      }
    } catch (err) {
      console.warn('PostgreSQL creation fallback:', err);
    }

    setDictionaries(prev => [created, ...prev]);
    setSelectedId(created.id);
    setShowNewModal(false);
    setNewName('');
  };

  // Reset table pagination on active dictionary or filter change
  useEffect(() => {
    setPairsPage(1);
  }, [selectedId, pairSearchQuery]);

  const filteredPairs = useMemo(() => {
    const q = pairSearchQuery.trim().toLowerCase();
    const pairsWithIdx = (activeDict.pairs || []).map((p, origIdx) => ({ ...p, _origIdx: origIdx }));
    if (!q) return pairsWithIdx;
    return pairsWithIdx.filter(p =>
      (p.code || '').toLowerCase().includes(q) ||
      (p.name || '').toLowerCase().includes(q) ||
      (p.short || '').toLowerCase().includes(q)
    );
  }, [activeDict.pairs, pairSearchQuery]);

  const totalPairsPages = Math.max(1, Math.ceil(filteredPairs.length / pairsPageSize));
  const safePairsPage = Math.min(pairsPage, totalPairsPages);
  const paginatedPairs = useMemo(() => {
    const start = (safePairsPage - 1) * pairsPageSize;
    return filteredPairs.slice(start, start + pairsPageSize);
  }, [filteredPairs, safePairsPage, pairsPageSize]);

  return (
    <div className="space-y-4 text-xs text-slate-800">
      {/* 2-Column Expanded Layout: Left Sidebar (3 cols) + Wide Transformation Workbench (9 cols) */}
      <div className="grid grid-cols-12 gap-5 items-start">
        {/* COLUMN 1: LEFT SIDEBAR (3 cols) — Rules List + Try It + Not In Dictionary */}
        <div className="col-span-12 lg:col-span-3 space-y-5">
          {/* Rules Selector Card */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-4">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search transformation rules..."
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
                              ? 'bg-orange-50/40 text-slate-900 font-bold border-l-2 border-[#F27421]'
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

          {/* Try It Card (Moved to Left) */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-xs">Try it</h3>
            </div>
            <input
              type="text"
              value={tryInput}
              onChange={(e) => setTryInput(e.target.value)}
              placeholder="e.g. 02, $1,500.00, 0911..."
              className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none focus:border-[#F27421] shadow-2xs"
            />

            <div className={`p-3 text-white rounded-xl font-bold text-xs text-center shadow-xs transition-colors ${
              tryResult?.matched || (activeDict.pairs.some(p => p.code === tryInput) && !tryResult)
                ? 'bg-[#F27421]'
                : 'bg-slate-700'
            }`}>
              {translationOutput || (tryInput ? '(no match)' : 'Type a code to preview')}
            </div>
          </div>

          {/* Not In This Rule Card (Moved to Left) */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-xs">Not in this rule</h3>
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

        {/* COLUMN 2: EXPANDED TRANSFORMATION WORKBENCH (9 cols) */}
        <div className="col-span-12 lg:col-span-9 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-5">
          {/* Header Row */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">{activeDict.name}</h2>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-medium">
                  {activeDict.group}
                </span>
                {hasUnsavedChanges && (
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    Unsaved edits
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {activeDict.pairs.length} pairs · {activeDict.appliedTo}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.tsv"
                onChange={handleCsvUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5 shadow-2xs"
              >
                <Upload size={13} className="text-slate-500" />
                <span>Import CSV</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className={`px-4 py-1.5 rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1.5 shadow-xs ${
                  hasUnsavedChanges
                    ? 'bg-[#F27421] hover:bg-[#d86316] text-white shadow-orange-500/20'
                    : 'bg-[#0F142A] hover:bg-slate-800 text-white'
                }`}
              >
                {saveSuccess ? (
                  <>
                    <Check size={13} className="text-emerald-400" />
                    <span>Saved</span>
                  </>
                ) : (
                  <>
                    <Save size={13} />
                    <span>{isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save changes *' : 'Save changes'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Configuration Controls matching 72_value_dictionaries.png */}
          <div className="space-y-3 pt-2.5 border-t border-slate-100 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                  <option value="USE_FALLBACK">Use default fallback</option>
                  <option value="FLAG">Flag as review exception</option>
                </select>
              </div>
            </div>
          </div>

          {/* Cases-Style Paginated Pairs Table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden flex flex-col">
            {/* Table Toolbar */}
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
              <div className="relative min-w-[220px] max-w-xs flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter mapping pairs..."
                  value={pairSearchQuery}
                  onChange={(e) => setPairSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs w-full focus:outline-none focus:border-[#F27421] shadow-2xs"
                />
              </div>

              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    newCodeInputRef.current?.focus();
                  }}
                  className="px-3 py-1.5 bg-[#0F142A] hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer shadow-xs"
                >
                  <Plus size={13} />
                  <span>Add Value</span>
                </button>
                <div className="text-[11px] text-slate-500 font-medium">
                  Showing <span className="font-bold text-slate-800">{filteredPairs.length}</span> pairs
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-medium text-[11px] bg-slate-50/70">
                    <th className="py-3 px-4 font-normal w-12">#</th>
                    <th className="py-3 px-4 font-medium w-48">Code / Source</th>
                    <th className="py-3 px-4 font-medium">Target Name / Value</th>
                    <th className="py-3 px-4 font-medium w-36">Short / Note</th>
                    <th className="py-3 px-4 font-normal text-right w-14">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-xs">
                  {/* Quick Inline Add Row */}
                  <tr className="bg-orange-50/30 border-b border-orange-200/60 transition-colors">
                    <td className="py-2 px-4 text-center font-sans text-orange-500 w-12 font-bold">
                      <Plus size={13} className="inline text-[#F27421]" />
                    </td>
                    <td className="py-2 px-4">
                      <input
                        ref={newCodeInputRef}
                        type="text"
                        placeholder="New code / source..."
                        value={newPairCode}
                        onChange={(e) => setNewPairCode(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddNewPair()}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:border-[#F27421] rounded-lg font-mono font-bold text-xs text-slate-900 focus:outline-none shadow-2xs"
                      />
                    </td>
                    <td className="py-2 px-4">
                      <input
                        type="text"
                        placeholder="Target name / value..."
                        value={newPairName}
                        onChange={(e) => setNewPairName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddNewPair()}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:border-[#F27421] rounded-lg text-xs text-slate-800 focus:outline-none shadow-2xs font-sans"
                      />
                    </td>
                    <td className="py-2 px-4">
                      <input
                        type="text"
                        placeholder="Short code / note..."
                        value={newPairShort}
                        onChange={(e) => setNewPairShort(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddNewPair()}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 focus:border-[#F27421] rounded-lg font-mono text-xs text-slate-600 focus:outline-none shadow-2xs"
                      />
                    </td>
                    <td className="py-2 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={handleAddNewPair}
                        disabled={!newPairCode.trim() && !newPairName.trim()}
                        className="px-3 py-1.5 bg-[#0F142A] hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-1 shadow-2xs ml-auto"
                        title="Add value pair"
                      >
                        <Plus size={12} />
                        <span>Add</span>
                      </button>
                    </td>
                  </tr>

                  {paginatedPairs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400 font-sans">
                        {pairSearchQuery ? 'No mapping pairs match your filter.' : 'No mapping pairs yet. Enter a code and target name above to add.'}
                      </td>
                    </tr>
                  ) : (
                    <>
                      {paginatedPairs.map((p, pIdx) => {
                        const displayNum = (safePairsPage - 1) * pairsPageSize + pIdx + 1;
                        return (
                          <tr key={`${p.code}-${p._origIdx}`} className="hover:bg-slate-50/70 transition-colors h-11 max-h-11 border-b border-slate-100 group">
                            <td className="py-2 px-4 font-sans text-slate-400 w-12 whitespace-nowrap">{displayNum}</td>
                            <td className="py-2 px-4 whitespace-nowrap">
                              <input
                                type="text"
                                value={p.code || ''}
                                onChange={(e) => handlePairChange(p._origIdx, 'code', e.target.value)}
                                className="w-full px-2 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#F27421] rounded-lg focus:outline-none font-mono font-bold text-slate-900 text-xs transition"
                                placeholder="Code / source"
                              />
                            </td>
                            <td className="py-2 px-4">
                              <input
                                type="text"
                                value={p.name || ''}
                                onChange={(e) => handlePairChange(p._origIdx, 'name', e.target.value)}
                                className="w-full px-2 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#F27421] rounded-lg focus:outline-none font-sans font-medium text-slate-800 text-xs transition"
                                placeholder="Target name / value"
                              />
                            </td>
                            <td className="py-2 px-4 whitespace-nowrap">
                              <input
                                type="text"
                                value={p.short || ''}
                                onChange={(e) => handlePairChange(p._origIdx, 'short', e.target.value)}
                                className="w-full px-2 py-1 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#F27421] rounded-lg focus:outline-none font-mono text-[11px] text-slate-600 transition"
                                placeholder="—"
                              />
                            </td>
                            <td className="py-2 px-4 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleDeletePair(p._origIdx)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                title="Delete pair"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {/* Constant Height Empty Slots Filler matching Cases Page */}
                      {Array.from({ length: Math.max(0, (pairsPageSize <= 10 ? pairsPageSize : 7) - paginatedPairs.length) }).map((_, padIdx) => (
                        <tr key={`empty-pad-${padIdx}`} className="h-11 max-h-11 border-b border-slate-50/80 bg-slate-50/10 select-none">
                          <td className="py-2.5 px-4 font-mono text-slate-200 text-xs w-12">-</td>
                          <td className="py-2.5 px-4 font-mono text-slate-200 text-xs">-</td>
                          <td className="py-2.5 px-4 font-mono text-slate-200 text-xs">-</td>
                          <td className="py-2.5 px-4 font-mono text-slate-200 text-xs">-</td>
                          <td className="py-2.5 px-4 text-right text-slate-200 text-xs"></td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* Cases-Style Active Pagination Footer */}
            <DataTablePagination
              currentPage={safePairsPage}
              totalItems={filteredPairs.length}
              pageSize={pairsPageSize}
              pageSizeOptions={[5, 7, 10, 15, 25, 50]}
              statusBadge={
                <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-medium">
                  Ready
                </span>
              }
              onPageChange={(p) => setPairsPage(p)}
              onPageSizeChange={(newSize) => {
                setPairsPageSize(newSize);
                setPairsPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {/* New Dictionary Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Create data transformation rule</h3>
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
                  Create rule
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

