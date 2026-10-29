import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Plus, Upload, ClipboardPaste, Trash2, Check, X, ArrowDown, Sparkles, Loader2, AlertTriangle, MoreHorizontal,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { api } from '../../api/client';
import {
  ValueTranslationDictionary,
  ValueDictionaryDirection,
  ValueDictionaryNoMatchPolicy,
  ValueDictionaryUsage,
  ValueDictionaryUntranslated,
  ValueDictionaryPreview
} from '../../types';
import { ErrorBoundary } from '../ErrorBoundary';
import { DataTablePagination } from '../common/DataTablePagination';

type Pair = ValueTranslationDictionary['mappings'][number];

interface ColumnTarget { dbId: string; tableName: string; columnName: string }

const GROUP_ORDER = ['Institutions', 'Statuses', 'Response codes', 'Channels & currency', 'Other'];

const groupOf = (d: ValueTranslationDictionary): string => {
  if (d.groupName) return d.groupName;
  switch (d.category) {
    case 'BANK_CODES': return 'Institutions';
    case 'STATUS_CODES': return 'Statuses';
    case 'CHANNEL_CODES':
    case 'CURRENCIES': return 'Channels & currency';
    default: return 'Other';
  }
};

const srcLabel = (d: Pick<ValueTranslationDictionary, 'sourceLabel'>) => d.sourceLabel || 'Source';
const tgtLabel = (d: Pick<ValueTranslationDictionary, 'targetLabel'>) => d.targetLabel || 'Target';

const NO_MATCH_OPTIONS: { value: ValueDictionaryNoMatchPolicy; label: string }[] = [
  { value: 'KEEP_ORIGINAL', label: 'Keep original value' },
  { value: 'BLANK', label: 'Leave blank' },
  { value: 'USE_FALLBACK', label: 'Use a default value' },
  { value: 'FLAG', label: 'Keep value and flag it' }
];

const START_POINTS: {
  id: string; title: string; hint: string; name: string;
  category: ValueTranslationDictionary['category']; groupName?: string;
  sourceLabel: string; targetLabel: string; direction: ValueDictionaryDirection;
}[] = [
  { id: 'institutions', title: 'Institutions', hint: 'Code to name', name: 'Institution codes → names', category: 'BANK_CODES', sourceLabel: 'Code', targetLabel: 'Name', direction: 'FORWARD' },
  { id: 'status', title: 'Transaction status', hint: 'Code to name', name: 'Transaction status codes → names', category: 'STATUS_CODES', sourceLabel: 'Code', targetLabel: 'Name', direction: 'FORWARD' },
  { id: 'response', title: 'Response codes', hint: 'Code to description', name: 'Response codes → descriptions', category: 'CUSTOM', groupName: 'Response codes', sourceLabel: 'Code', targetLabel: 'Description', direction: 'FORWARD' },
  { id: 'channels', title: 'Channels', hint: 'Code to name', name: 'Channel codes → names', category: 'CHANNEL_CODES', sourceLabel: 'Code', targetLabel: 'Name', direction: 'FORWARD' },
  { id: 'currencies', title: 'Currencies', hint: 'Name to ISO code', name: 'Currency names → ISO codes', category: 'CURRENCIES', sourceLabel: 'Name', targetLabel: 'ISO code', direction: 'FORWARD' },
  { id: 'blank', title: 'Blank', hint: 'Start from scratch', name: '', category: 'CUSTOM', sourceLabel: 'Source', targetLabel: 'Target', direction: 'FORWARD' }
];

const safeText = (v: unknown): string =>
  v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export function parsePairs(text: string): Pair[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const pairs: Pair[] = [];
  for (const line of lines) {
    const delimiter = line.includes('\t') ? '\t' : line.includes(';') && !line.includes(',') ? ';' : ',';
    const [source, target, shortName, notes] = splitCsvLine(line, delimiter);
    if (!source || !target) continue;
    pairs.push({ sourceValue: source, targetValue: target, shortName: shortName || undefined, notes: notes || undefined });
  }
  return pairs;
}

function mergePairs(existing: Pair[], incoming: Pair[]): Pair[] {
  const map = new Map(existing.map(p => [p.sourceValue.trim().toLowerCase(), p]));
  for (const p of incoming) map.set(p.sourceValue.trim().toLowerCase(), { ...map.get(p.sourceValue.trim().toLowerCase()), ...p });
  return Array.from(map.values());
}

const STATUS_ABBREVIATIONS: Record<string, string> = {
  auth: 'Authorized', stl: 'Settled', pnd: 'Pending', dec: 'Declined', rev: 'Reversed',
  appr: 'Approved', fail: 'Failed', succ: 'Successful', canc: 'Cancelled'
};

/** Suggests names only from evidence: existing dictionaries (either side) and common status abbreviations. */
function buildSuggester(dicts: ValueTranslationDictionary[]) {
  const index = new Map<string, string>();
  for (const d of dicts) {
    for (const m of d.mappings || []) {
      if (m.targetValue && m.sourceValue) {
        const key = m.targetValue.trim().toLowerCase();
        if (!index.has(key)) index.set(key, m.sourceValue);
      }
    }
  }
  return (code: string): string => {
    const k = code.trim().toLowerCase();
    return index.get(k) || STATUS_ABBREVIATIONS[k] || '';
  };
}

const Segmented: React.FC<{
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}> = ({ value, options, onChange }) => (
  <div className="inline-flex p-1 bg-slate-100 rounded-lg">
    {options.map(o => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
          value === o.value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

const ColumnPicker: React.FC<{
  databases: any[];
  value: Partial<ColumnTarget>;
  onChange: (v: Partial<ColumnTarget>) => void;
}> = ({ databases, value, onChange }) => {
  const [tables, setTables] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);

  useEffect(() => {
    setTables([]);
    if (!value.dbId) return;
    let live = true;
    api.getDatabaseTables(value.dbId)
      .then(r => { if (live) setTables((r.allowedTables?.length ? r.allowedTables : r.availableTables) || []); })
      .catch(() => { if (live) setTables([]); });
    return () => { live = false; };
  }, [value.dbId]);

  useEffect(() => {
    setColumns([]);
    if (!value.dbId || !value.tableName) return;
    let live = true;
    api.getTableColumns(value.dbId, value.tableName)
      .then(r => { if (live) setColumns((r.columns || []).map(c => c.name)); })
      .catch(() => { if (live) setColumns([]); });
    return () => { live = false; };
  }, [value.dbId, value.tableName]);

  const cls = 'w-full border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-orange-200';
  return (
    <div className="grid grid-cols-3 gap-2">
      <select className={cls} value={value.dbId || ''} onChange={e => onChange({ dbId: e.target.value })}>
        <option value="">Database…</option>
        {databases.map(d => <option key={d.id} value={d.id}>{safeText(d.name)}</option>)}
      </select>
      <select className={cls} value={value.tableName || ''} disabled={!value.dbId} onChange={e => onChange({ dbId: value.dbId, tableName: e.target.value })}>
        <option value="">Table…</option>
        {tables.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <select className={cls} value={value.columnName || ''} disabled={!value.tableName} onChange={e => onChange({ ...value, columnName: e.target.value })}>
        <option value="">Column…</option>
        {columns.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
};

// ---------------------------------------------------------------------------
// New dictionary dialog (screen 37)
// ---------------------------------------------------------------------------
const NewDictionaryDialog: React.FC<{
  dicts: ValueTranslationDictionary[];
  databases: any[];
  username: string;
  onClose: () => void;
  onCreated: (d: ValueTranslationDictionary) => void;
}> = ({ dicts, databases, username, onClose, onCreated }) => {
  const [start, setStart] = useState(START_POINTS[1]);
  const [name, setName] = useState(START_POINTS[1].name);
  const [direction, setDirection] = useState<ValueDictionaryDirection>('FORWARD');
  const [target, setTarget] = useState<Partial<ColumnTarget>>({});
  const [rows, setRows] = useState<{ code: string; name: string; count: number }[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(7);
  const [loading, setLoading] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const suggest = useMemo(() => buildSuggester(dicts), [dicts]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = useMemo(() => {
    const startIdx = (page - 1) * pageSize;
    return rows.slice(startIdx, startIdx + pageSize);
  }, [rows, page, pageSize]);

  const pick = (s: typeof START_POINTS[number]) => {
    setStart(s);
    setName(s.name);
    setDirection(s.direction);
  };

  useEffect(() => {
    if (!target.dbId || !target.tableName || !target.columnName) { setRows([]); setPage(1); return; }
    let live = true;
    setLoading(true);
    setError('');
    setPage(1);
    api.getDistinctColumnValues(target.dbId, target.tableName, target.columnName)
      .then(r => {
        if (!live) return;
        let any = false;
        const next = r.values.map(v => {
          const s = suggest(v.value);
          if (s) any = true;
          return { code: v.value, name: s, count: v.count };
        });
        setRows(next);
        setSuggested(any);
      })
      .catch(e => { if (live) { setRows([]); setError(safeText(e?.message || e)); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [target.dbId, target.tableName, target.columnName, suggest]);

  const create = async () => {
    if (!name.trim()) { setError('Give the dictionary a name.'); return; }
    setSaving(true);
    setError('');
    try {
      const mappings: Pair[] = rows.filter(r => r.name.trim()).map(r => ({ sourceValue: r.code, targetValue: r.name.trim() }));
      const saved = await api.createValueTranslationDictionary({
        name: name.trim(),
        description: '',
        category: start.category,
        groupName: start.groupName,
        direction,
        sourceLabel: start.sourceLabel,
        targetLabel: start.targetLabel,
        caseSensitive: false,
        trimWhitespace: true,
        noMatchPolicy: 'KEEP_ORIGINAL',
        mappings,
        createdBy: username
      });
      if (target.dbId && target.tableName && target.columnName) {
        await api.createValueDictionaryLink({
          dictionaryId: saved.id, dbId: target.dbId, tableName: target.tableName,
          columnName: target.columnName, showInGrids: true, createdBy: username
        });
      }
      onCreated(saved);
    } catch (e: any) {
      setError(safeText(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const dirOptions = [
    { value: 'FORWARD', label: `${start.sourceLabel} → ${start.targetLabel}` },
    { value: 'REVERSE', label: `${start.targetLabel} → ${start.sourceLabel}` },
    { value: 'BOTH', label: 'Both' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 flex items-start justify-between shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900">New value dictionary</h3>
            <p className="text-xs text-slate-500">Translate codes into names people understand</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 flex-1 min-h-0 border-t border-slate-100">
          <div className="p-6 space-y-4 overflow-y-auto min-h-0">
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-2">Start from</div>
              <div className="grid grid-cols-2 gap-2">
                {START_POINTS.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => pick(s)}
                    className={`text-left rounded-lg border px-3 py-2.5 transition cursor-pointer ${
                      start.id === s.id ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-400' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-sm font-semibold text-slate-900">{s.title}</div>
                    <div className="text-xs text-slate-500">{s.hint}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Name</label>
              <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-1">Direction</div>
              <Segmented value={direction} options={dirOptions} onChange={v => setDirection(v as ValueDictionaryDirection)} />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-1">Apply to column</div>
              <ColumnPicker databases={databases} value={target} onChange={setTarget} />
              <p className="text-[11px] text-slate-400 mt-1">Optional. Picking a column reads its distinct values to pre-fill the list.</p>
            </div>
          </div>
          <div className="p-6 bg-slate-50/60 border-l border-slate-100 flex flex-col min-h-0">
            <div className="flex items-start justify-between shrink-0">
              <div>
                <div className="text-sm font-bold text-slate-900">Found in your data</div>
                <p className="text-xs text-slate-500">
                  {target.columnName ? `Distinct values in ${target.columnName}. Edit the names as needed.` : 'Choose a column to see the codes already in your data.'}
                </p>
              </div>
              {suggested && (
                <span className="text-[11px] px-2 py-1 rounded-md bg-orange-50 text-orange-700 font-semibold flex items-center gap-1">
                  <Sparkles size={11} /> Names suggested
                </span>
              )}
            </div>
            <div className="mt-3 bg-white border border-slate-200 rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col justify-between">
              {loading ? (
                <div className="p-6 text-xs text-slate-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Reading values…</div>
              ) : rows.length === 0 ? (
                <div className="p-6 text-xs text-slate-400">No values yet.</div>
              ) : (
                <>
                  <div className="overflow-x-auto flex-1">
                    <table className="w-full text-sm">
                      <thead className="text-[11px] text-slate-400 text-left bg-slate-50/50">
                        <tr><th className="px-3 py-2 font-medium">{start.sourceLabel}</th><th className="px-3 py-2 font-medium">{start.targetLabel}</th><th /></tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((r, idx) => {
                          const actualIdx = (page - 1) * pageSize + idx;
                          return (
                            <tr key={r.code} className="border-t border-slate-100 hover:bg-slate-50/50">
                              <td className="px-3 py-1.5 font-mono font-bold text-slate-800">{r.code}</td>
                              <td className="px-3 py-1.5">
                                <input
                                  value={r.name}
                                  onChange={e => setRows(prev => prev.map((x, j) => (j === actualIdx ? { ...x, name: e.target.value } : x)))}
                                  className="w-full border border-slate-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200"
                                />
                              </td>
                              <td className="px-3 py-1.5 text-right text-xs text-slate-400 whitespace-nowrap">{r.count.toLocaleString()} rows</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Clean Pagination Footer */}
                  {rows.length > 0 && (
                    <div className="p-2 border-t border-slate-100 bg-white shrink-0">
                      <DataTablePagination
                        currentPage={page}
                        pageSize={pageSize}
                        totalItems={rows.length}
                        pageSizeOptions={[5, 6, 7, 8, 9, 10, 15, 20]}
                        onPageChange={(p) => setPage(p)}
                        onPageSizeChange={(newSize) => {
                          setPageSize(newSize);
                          setPage(1);
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-2 shrink-0">
              New codes that appear later are listed under “Not in this dictionary” so nothing goes untranslated silently.
            </p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between shrink-0">
          <div className="text-xs text-rose-600 min-h-[1rem]">{error}</div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">Cancel</button>
            <button type="button" disabled={saving} onClick={create} className="px-4 py-2 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-lg disabled:opacity-60 cursor-pointer">
              {saving ? 'Creating…' : 'Create dictionary'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Workbench (screen 36)
// ---------------------------------------------------------------------------
export interface ValueDictionaryWorkbenchProps {
  dicts: ValueTranslationDictionary[];
  onDictsChange: (next: ValueTranslationDictionary[]) => void;
  username: string;
  openNewSignal?: number;
}

const WorkbenchInner: React.FC<ValueDictionaryWorkbenchProps> = ({ dicts, onDictsChange, username, openNewSignal }) => {
  const [databases, setDatabases] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>(dicts[0]?.id || '');
  const [draft, setDraft] = useState<ValueTranslationDictionary | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [usage, setUsage] = useState<ValueDictionaryUsage | null>(null);
  const [untranslated, setUntranslated] = useState<ValueDictionaryUntranslated | null>(null);
  const [untranslatedLoading, setUntranslatedLoading] = useState(false);
  const [tryInput, setTryInput] = useState('');
  const [tryResult, setTryResult] = useState<ValueDictionaryPreview | null>(null);
  const [newPair, setNewPair] = useState<Pair>({ sourceValue: '', targetValue: '', shortName: '' });
  const [linkTarget, setLinkTarget] = useState<Partial<ColumnTarget>>({});
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [pairPage, setPairPage] = useState(1);
  const [pairPageSize, setPairPageSize] = useState(7);
  const fileRef = useRef<HTMLInputElement>(null);
  const newSourceRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.getDatabases().then(setDatabases).catch(() => setDatabases([])); }, []);
  useEffect(() => { if (openNewSignal) setShowNew(true); }, [openNewSignal]);

  useEffect(() => {
    if (!selectedId && dicts.length) setSelectedId(dicts[0].id);
  }, [dicts, selectedId]);

  const selected = useMemo(() => dicts.find(d => d.id === selectedId) || null, [dicts, selectedId]);

  useEffect(() => {
    setDraft(selected ? { ...selected, mappings: [...(selected.mappings || [])] } : null);
    setPairPage(1);
    setDirty(false);
    setMessage(null);
    setTryResult(null);
  }, [selected?.id, selected?.updatedAt]);

  const refreshSideData = (id: string) => {
    api.getValueDictionaryUsage(id).then(setUsage).catch(() => setUsage(null));
    setUntranslatedLoading(true);
    api.getValueDictionaryUntranslated(id)
      .then(setUntranslated)
      .catch(() => setUntranslated(null))
      .finally(() => setUntranslatedLoading(false));
  };

  useEffect(() => {
    setUsage(null);
    setUntranslated(null);
    if (selected?.id) refreshSideData(selected.id);
  }, [selected?.id, selected?.updatedAt]);

  useEffect(() => {
    if (!draft || !tryInput.trim()) { setTryResult(null); return; }
    const t = setTimeout(() => {
      api.previewValueDictionary(draft.id, tryInput, {
        direction: draft.direction, caseSensitive: draft.caseSensitive, trimWhitespace: draft.trimWhitespace,
        noMatchPolicy: draft.noMatchPolicy, defaultFallback: draft.defaultFallback, mappings: draft.mappings
      }).then(setTryResult).catch(() => setTryResult(null));
    }, 250);
    return () => clearTimeout(t);
  }, [tryInput, draft]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, ValueTranslationDictionary[]>();
    for (const d of dicts) {
      if (q && !d.name.toLowerCase().includes(q)) continue;
      const g = groupOf(d);
      map.set(g, [...(map.get(g) || []), d]);
    }
    const keys = Array.from(map.keys()).sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
    return keys.map(k => ({ group: k, items: map.get(k)! }));
  }, [dicts, search]);

  const update = (patch: Partial<ValueTranslationDictionary>) => {
    setDraft(d => (d ? { ...d, ...patch } : d));
    setDirty(true);
  };

  const updatePair = (index: number, patch: Partial<Pair>) => {
    if (!draft) return;
    update({ mappings: draft.mappings.map((p, i) => (i === index ? { ...p, ...patch } : p)) });
  };

  const removePair = (index: number) => {
    if (!draft) return;
    update({ mappings: draft.mappings.filter((_, i) => i !== index) });
  };

  const addPair = () => {
    if (!draft || !newPair.sourceValue.trim() || !newPair.targetValue.trim()) return;
    update({ mappings: mergePairs(draft.mappings, [{ ...newPair, sourceValue: newPair.sourceValue.trim(), targetValue: newPair.targetValue.trim() }]) });
    setNewPair({ sourceValue: '', targetValue: '', shortName: '' });
    newSourceRef.current?.focus();
  };

  const addFromUntranslated = (value: string) => {
    if (!draft) return;
    const reverse = draft.direction === 'REVERSE';
    setNewPair(reverse ? { sourceValue: '', targetValue: value, shortName: '' } : { sourceValue: value, targetValue: '', shortName: '' });
    newSourceRef.current?.scrollIntoView({ block: 'nearest' });
    newSourceRef.current?.focus();
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api.updateValueTranslationDictionary(draft.id, draft);
      onDictsChange(dicts.map(d => (d.id === saved.id ? saved : d)));
      setDirty(false);
      setMessage({ kind: 'ok', text: 'Saved to PostgreSQL.' });
    } catch (e: any) {
      setMessage({ kind: 'err', text: safeText(e?.message || e) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft || draft.isSystemDefault) return;
    if (!window.confirm(`Delete dictionary "${draft.name}"? Its column links are removed too.`)) return;
    try {
      await api.deleteValueTranslationDictionary(draft.id);
      const next = dicts.filter(d => d.id !== draft.id);
      onDictsChange(next);
      setSelectedId(next[0]?.id || '');
    } catch (e: any) {
      setMessage({ kind: 'err', text: safeText(e?.message || e) });
    }
    setMenuOpen(false);
  };

  const onFile = async (file?: File) => {
    if (!file || !draft) return;
    const pairs = parsePairs(await file.text());
    if (pairs.length === 0) { setMessage({ kind: 'err', text: 'No valid "source,target" rows found in that file.' }); return; }
    update({ mappings: mergePairs(draft.mappings, pairs) });
    setMessage({ kind: 'ok', text: `Imported ${pairs.length} pairs. Save to keep them.` });
    if (fileRef.current) fileRef.current.value = '';
  };

  const applyPaste = () => {
    if (!draft) return;
    const pairs = parsePairs(pasteText);
    if (pairs.length === 0) { setMessage({ kind: 'err', text: 'No valid pairs found in the pasted text.' }); return; }
    update({ mappings: mergePairs(draft.mappings, pairs) });
    setPasteText('');
    setShowPaste(false);
  };

  const addLink = async () => {
    if (!draft || !linkTarget.dbId || !linkTarget.tableName || !linkTarget.columnName) return;
    try {
      await api.createValueDictionaryLink({
        dictionaryId: draft.id, dbId: linkTarget.dbId, tableName: linkTarget.tableName,
        columnName: linkTarget.columnName, showInGrids: true, createdBy: username
      });
      setShowLinkPicker(false);
      setLinkTarget({});
      refreshSideData(draft.id);
    } catch (e: any) {
      setMessage({ kind: 'err', text: safeText(e?.message || e) });
    }
  };

  const dbName = (id: string) => safeText(databases.find(d => d.id === id)?.name || id);

  const dirOptions = draft
    ? [
        { value: 'FORWARD', label: `${srcLabel(draft)} → ${tgtLabel(draft)}` },
        { value: 'REVERSE', label: `${tgtLabel(draft)} → ${srcLabel(draft)}` },
        { value: 'BOTH', label: 'Both' }
      ]
    : [];

  const inputCls = 'w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-orange-300 focus:bg-white rounded-md px-2 py-1.5 text-sm focus:outline-none';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_320px] gap-5 items-start">
      {/* LEFT: grouped list */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search dictionaries…" className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-200" />
        </div>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto no-scrollbar">
          {grouped.length === 0 && <div className="text-xs text-slate-400 p-3">No dictionaries match.</div>}
          {grouped.map(g => (
            <div key={g.group}>
              <div className="px-2 pb-1 text-[11px] font-semibold text-slate-500">{g.group}</div>
              {g.items.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedId(d.id)}
                  className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-lg text-sm transition cursor-pointer ${
                    d.id === selectedId ? 'bg-slate-100 font-semibold text-slate-900 border-l-2 border-orange-500' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{d.name}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium">{d.mappings?.length || 0}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* CENTER: editor */}
      <div className="bg-white rounded-2xl border border-slate-200 min-w-0">
        {!draft ? (
          <div className="p-10 text-sm text-slate-400 text-center">Select a dictionary or create a new one.</div>
        ) : (
          <>
            <div className="p-5 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <input
                    value={draft.name}
                    onChange={e => update({ name: e.target.value })}
                    className="text-lg font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-orange-300 focus:outline-none min-w-0"
                  />
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 font-semibold whitespace-nowrap">{groupOf(draft)}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {draft.mappings.length} pairs · used by {usage ? `${usage.columnLinks.length} column${usage.columnLinks.length === 1 ? '' : 's'} and ${usage.templates.length} template${usage.templates.length === 1 ? '' : 's'}` : '…'}
                </p>
              </div>
              <div className="flex items-center gap-2 relative">
                <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
                <button type="button" onClick={() => fileRef.current?.click()} className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"><Upload size={13} /> Import CSV</button>
                <button type="button" onClick={() => setShowPaste(true)} className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer"><ClipboardPaste size={13} /> Paste list</button>
                <button type="button" disabled={!dirty || saving} onClick={save} className="px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 rounded-lg disabled:opacity-40 cursor-pointer">
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" onClick={() => setMenuOpen(o => !o)} className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer" aria-label="More"><MoreHorizontal size={15} /></button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-lg shadow-lg z-10 py-1">
                    <button type="button" disabled={!!draft.isSystemDefault} onClick={remove} className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 disabled:text-slate-300 disabled:hover:bg-transparent cursor-pointer">
                      {draft.isSystemDefault ? 'System dictionary (cannot delete)' : 'Delete dictionary'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {message && (
              <div className={`mx-5 mb-3 text-xs px-3 py-2 rounded-lg ${message.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{message.text}</div>
            )}

            <div className="px-5 pb-4 grid grid-cols-1 lg:grid-cols-[auto_auto_minmax(0,1fr)] gap-x-8 gap-y-3 items-end">
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">Direction</div>
                <Segmented value={draft.direction || 'FORWARD'} options={dirOptions} onChange={v => update({ direction: v as ValueDictionaryDirection })} />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">Matching</div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => update({ caseSensitive: !draft.caseSensitive })} className={`px-2.5 py-1.5 text-xs rounded-md font-medium flex items-center gap-1 cursor-pointer ${!draft.caseSensitive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {!draft.caseSensitive && <Check size={11} />} Ignore case
                  </button>
                  <button type="button" onClick={() => update({ trimWhitespace: draft.trimWhitespace === false })} className={`px-2.5 py-1.5 text-xs rounded-md font-medium flex items-center gap-1 cursor-pointer ${draft.trimWhitespace !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {draft.trimWhitespace !== false && <Check size={11} />} Trim spaces
                  </button>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">If no match</div>
                <div className="flex gap-2">
                  <select value={draft.noMatchPolicy || 'KEEP_ORIGINAL'} onChange={e => update({ noMatchPolicy: e.target.value as ValueDictionaryNoMatchPolicy })} className="flex-1 min-w-0 border border-slate-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-200">
                    {NO_MATCH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {draft.noMatchPolicy === 'USE_FALLBACK' && (
                    <input value={draft.defaultFallback || ''} onChange={e => update({ defaultFallback: e.target.value })} placeholder="Default value" className="w-36 border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-200" />
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] text-slate-400 text-left">
                  <tr>
                    <th className="px-5 py-2 font-medium">{srcLabel(draft)} (in data)</th>
                    <th className="px-3 py-2 font-medium">{tgtLabel(draft)} (shown)</th>
                    <th className="px-3 py-2 font-medium">Short name</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {draft.mappings.slice((pairPage - 1) * pairPageSize, pairPage * pairPageSize).map((p, idx) => {
                    const actualIndex = (pairPage - 1) * pairPageSize + idx;
                    return (
                      <tr key={`${p.sourceValue}-${actualIndex}`} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-1"><input value={p.sourceValue} onChange={e => updatePair(actualIndex, { sourceValue: e.target.value })} className={`${inputCls} font-mono font-bold`} /></td>
                        <td className="px-2 py-1"><input value={p.targetValue} onChange={e => updatePair(actualIndex, { targetValue: e.target.value })} className={inputCls} /></td>
                        <td className="px-2 py-1"><input value={p.shortName || ''} onChange={e => updatePair(actualIndex, { shortName: e.target.value })} className={`${inputCls} text-xs`} placeholder="—" /></td>
                        <td className="px-2 py-1"><input value={p.notes || ''} onChange={e => updatePair(actualIndex, { notes: e.target.value })} className={`${inputCls} text-slate-500`} placeholder="—" /></td>
                        <td className="px-2 py-1 text-right"><button type="button" onClick={() => removePair(actualIndex)} className="p-1.5 text-slate-300 hover:text-rose-600 cursor-pointer" aria-label="Remove pair"><Trash2 size={14} /></button></td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-2"><input ref={newSourceRef} value={newPair.sourceValue} onChange={e => setNewPair(n => ({ ...n, sourceValue: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addPair()} placeholder={srcLabel(draft)} className="w-full border border-dashed border-slate-300 rounded-md px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-orange-300" /></td>
                    <td className="px-2 py-2"><input value={newPair.targetValue} onChange={e => setNewPair(n => ({ ...n, targetValue: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addPair()} placeholder={tgtLabel(draft)} className="w-full border border-dashed border-slate-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-orange-300" /></td>
                    <td className="px-2 py-2"><input value={newPair.shortName || ''} onChange={e => setNewPair(n => ({ ...n, shortName: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addPair()} placeholder="Short" className="w-full border border-dashed border-slate-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-orange-300" /></td>
                    <td className="px-2 py-2" colSpan={2}>
                      <button type="button" onClick={addPair} className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 flex items-center gap-1 cursor-pointer"><Plus size={12} /> Add pair</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {draft.mappings.length > 0 && (
              <div className="p-3 border-t border-slate-100 bg-white">
                <DataTablePagination
                  currentPage={pairPage}
                  pageSize={pairPageSize}
                  totalItems={draft.mappings.length}
                  pageSizeOptions={[5, 6, 7, 8, 9, 10, 15, 20, 25, 50]}
                  onPageChange={(p) => setPairPage(p)}
                  onPageSizeChange={(newSize) => {
                    setPairPageSize(newSize);
                    setPairPage(1);
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* RIGHT: context panels */}
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="text-sm font-bold text-slate-900 mb-2">Try it</div>
          <input value={tryInput} onChange={e => setTryInput(e.target.value)} placeholder="Type a value…" disabled={!draft} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-200" />
          <div className="flex items-center gap-1.5 text-xs text-slate-400 my-2"><ArrowDown size={12} /> translates to</div>
          <div className={`rounded-lg px-3 py-2.5 text-sm font-bold ${tryResult ? (tryResult.matched ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-700') : 'bg-slate-50 text-slate-300'}`}>
            {tryResult ? (tryResult.output === '' ? '(blank)' : safeText(tryResult.output)) : '—'}
          </div>
          {tryResult && !tryResult.matched && (
            <p className="text-[11px] text-slate-500 mt-1.5">{tryResult.flagged ? 'No match. Value kept and flagged.' : 'No match. The “If no match” rule was applied.'}</p>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-bold text-slate-900">Applied to</div>
            <button type="button" onClick={() => setShowLinkPicker(s => !s)} disabled={!draft} className="text-xs font-semibold text-orange-600 hover:text-orange-700 cursor-pointer disabled:opacity-40">+ Column</button>
          </div>
          {showLinkPicker && (
            <div className="mb-3 space-y-2">
              <ColumnPicker databases={databases} value={linkTarget} onChange={setLinkTarget} />
              <button type="button" onClick={addLink} disabled={!linkTarget.columnName} className="px-3 py-1.5 text-xs font-bold text-white bg-slate-900 rounded-lg disabled:opacity-40 cursor-pointer">Apply</button>
            </div>
          )}
          {!usage ? (
            <div className="text-xs text-slate-400">Loading…</div>
          ) : usage.columnLinks.length === 0 && usage.templates.length === 0 ? (
            <div className="text-xs text-slate-400">Not applied anywhere yet.</div>
          ) : (
            <div className="space-y-3">
              {usage.columnLinks.map(l => (
                <div key={l.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-mono font-bold text-slate-800 truncate">{l.columnName}</div>
                    <div className="text-[11px] text-slate-400 truncate">{dbName(l.dbId)} · {l.tableName} · {l.showInGrids ? 'show names in grids' : 'hidden in grids'}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={l.showInGrids}
                      onClick={async () => { await api.setValueDictionaryLinkVisibility(l.id, !l.showInGrids).catch(() => {}); if (draft) refreshSideData(draft.id); }}
                      className={`w-9 h-5 rounded-full relative transition cursor-pointer ${l.showInGrids ? 'bg-orange-500' : 'bg-slate-300'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${l.showInGrids ? 'left-[18px]' : 'left-0.5'}`} />
                    </button>
                    <button type="button" aria-label="Remove link" onClick={async () => { await api.deleteValueDictionaryLink(l.id).catch(() => {}); if (draft) refreshSideData(draft.id); }} className="p-1 text-slate-300 hover:text-rose-600 cursor-pointer"><X size={13} /></button>
                  </div>
                </div>
              ))}
              {usage.templates.map(t => (
                <div key={t.id}>
                  <div className="text-xs font-semibold text-slate-800">{t.name}</div>
                  <div className="text-[11px] text-slate-400">Translate on upload · {t.columns.join(', ')}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm font-bold text-slate-900">Not in this dictionary</div>
            {untranslated && untranslated.untranslated.length > 0 && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold">{untranslated.untranslated.length}</span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mb-2">Codes found in your data with no name yet.</p>
          {untranslatedLoading ? (
            <div className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Scanning linked columns…</div>
          ) : !untranslated ? (
            <div className="text-xs text-slate-400">Unavailable.</div>
          ) : untranslated.untranslated.length === 0 ? (
            <div className="text-xs text-slate-400">
              {untranslated.scannedColumns === 0 ? 'Link a column under “Applied to” to scan it.' : 'Every value found is translated.'}
            </div>
          ) : (
            <div className="space-y-2">
              {untranslated.untranslated.slice(0, 20).map(u => (
                <div key={u.value} className="flex items-center justify-between gap-2">
                  <div className="min-w-0 text-xs"><span className="font-mono font-bold text-slate-800">{u.value}</span> <span className="text-slate-400">{u.count.toLocaleString()} rows</span></div>
                  <button type="button" onClick={() => addFromUntranslated(u.value)} className="px-2.5 py-1 text-xs font-semibold border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">Add name</button>
                </div>
              ))}
            </div>
          )}
          {untranslated && untranslated.skipped.length > 0 && (
            <div className="mt-3 text-[11px] text-slate-500 flex items-start gap-1.5">
              <AlertTriangle size={12} className="mt-0.5 text-amber-500 shrink-0" />
              <span>{untranslated.skipped.length} linked column{untranslated.skipped.length === 1 ? '' : 's'} could not be scanned ({untranslated.skipped[0].reason}).</span>
            </div>
          )}
        </div>
      </div>

      {showPaste && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 space-y-3 shadow-2xl">
            <div className="text-base font-bold text-slate-900">Paste list</div>
            <p className="text-xs text-slate-500">One pair per line: <span className="font-mono">code,name[,short name[,note]]</span>. Tabs and semicolons also work. Existing codes are updated.</p>
            <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={8} className="w-full border border-slate-200 rounded-lg p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-200" placeholder={'07,Nib International Bank,NIB\n08,Cooperative Bank of Oromia'} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowPaste(false)} className="px-4 py-2 text-sm font-semibold border border-slate-200 rounded-lg cursor-pointer">Cancel</button>
              <button type="button" onClick={applyPaste} className="px-4 py-2 text-sm font-bold text-white bg-orange-500 rounded-lg cursor-pointer">Add pairs</button>
            </div>
          </div>
        </div>
      )}

      {showNew && (
        <NewDictionaryDialog
          dicts={dicts}
          databases={databases}
          username={username}
          onClose={() => setShowNew(false)}
          onCreated={d => {
            onDictsChange([...dicts, d]);
            setSelectedId(d.id);
            setShowNew(false);
          }}
        />
      )}
    </div>
  );
};

export const ValueDictionaryWorkbench: React.FC<ValueDictionaryWorkbenchProps> = props => (
  <ErrorBoundary fallbackTitle="Value dictionaries failed to render">
    <WorkbenchInner {...props} />
  </ErrorBoundary>
);

export default ValueDictionaryWorkbench;
