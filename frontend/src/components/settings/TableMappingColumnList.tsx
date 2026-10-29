import React, { useMemo, useState } from 'react';
import {
  ArrowRight, AlertTriangle, CheckCircle2, Key, Loader2, MoreHorizontal,
  Scissors, Combine, PlusCircle, BookOpen, X, ChevronLeft, ChevronRight
} from 'lucide-react';
import { GlobalTransactionSchemaField } from '../../types';
import { previewCell, sampleValuesHint, isColumnEmptyInSample } from '../../utils/cellPreview';
import { ErrorBoundary } from '../ErrorBoundary';
import { DataTablePagination } from '../common/DataTablePagination';

export interface PhysicalColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimary?: boolean;
}

export interface TableMappingColumnListProps {
  tableName: string;
  columns: PhysicalColumn[];
  sampleRows: Record<string, any>[];
  mappings: Record<string, string>;
  notes: Record<string, string>;
  fields: GlobalTransactionSchemaField[];
  selectedColumns: string[];
  columnsLoading: boolean;
  sampleLoading: boolean;
  onMap: (column: string, globalKey: string) => void;
  onUnmap: (column: string) => void;
  onToggleSelect: (column: string) => void;
  onToggleSelectAll: () => void;
  onSplit: (column: string) => void;
  onMerge: (column: string) => void;
  onAddToGlobal: (column: PhysicalColumn) => void;
  onLinkDictionary: (column: string) => void;
}

const SAMPLE_PANEL_ROWS = 3;
const SAMPLE_PANEL_COLUMNS = 3;

const JsonChip: React.FC<{ value: unknown; id: string; expanded: string | null; onToggle: (id: string) => void }> = ({ value, id, expanded, onToggle }) => {
  const p = previewCell(value);
  if (!p.isJson) {
    return <span className={p.isEmpty ? 'text-slate-300 italic' : ''} title={p.full}>{p.text}</span>;
  }
  const open = expanded === id;
  return (
    <span className="inline-block max-w-full">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-mono cursor-pointer"
        title="Click to expand"
      >
        {p.text}
      </button>
      {open && (
        <pre className="mt-1 p-2 rounded-md bg-slate-900 text-slate-100 text-[10px] leading-snug whitespace-pre-wrap break-all max-h-40 overflow-auto">
          {p.full.length > 1200 ? `${p.full.slice(0, 1200)}\n…` : p.full}
        </pre>
      )}
    </span>
  );
};

const Inner: React.FC<TableMappingColumnListProps> = ({
  tableName, columns, sampleRows, mappings, notes, fields, selectedColumns, columnsLoading, sampleLoading,
  onMap, onUnmap, onToggleSelect, onToggleSelectAll, onSplit, onMerge, onAddToGlobal, onLinkDictionary
}) => {
  const [filter, setFilter] = useState<'ALL' | 'UNMAPPED'>('ALL');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(7);

  const mappedCount = columns.filter(c => !!mappings[c.name]).length;
  const unmapped = columns.filter(c => !mappings[c.name]);
  const emptyColumns = useMemo(
    () => columns.filter(c => isColumnEmptyInSample(sampleRows, c.name)),
    [columns, sampleRows]
  );
  const visible = filter === 'UNMAPPED' ? unmapped : columns;
  const paginatedVisible = useMemo(() => {
    const start = (page - 1) * pageSize;
    return visible.slice(start, start + pageSize);
  }, [visible, page, pageSize]);

  const pct = columns.length === 0 ? 0 : Math.round((mappedCount / columns.length) * 100);
  const toggleExpanded = (id: string) => setExpanded(prev => (prev === id ? null : id));

  const samplePanelColumns = useMemo(() => {
    const interesting = columns.filter(c => !isColumnEmptyInSample(sampleRows, c.name));
    return (interesting.length ? interesting : columns).slice(0, SAMPLE_PANEL_COLUMNS);
  }, [columns, sampleRows]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
      <div className="bg-white rounded-2xl border border-slate-200 min-w-0">
        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              aria-label="Select all columns"
              checked={columns.length > 0 && selectedColumns.length === columns.length}
              ref={el => { if (el) el.indeterminate = selectedColumns.length > 0 && selectedColumns.length < columns.length; }}
              onChange={onToggleSelectAll}
              className="w-3.5 h-3.5 rounded border-slate-300 text-orange-600 cursor-pointer"
            />
            <h3 className="text-base font-bold text-slate-900">Physical columns</h3>
            {(columnsLoading || sampleLoading) && <Loader2 size={14} className="animate-spin text-orange-500" />}
          </div>
          <div className="inline-flex p-1 bg-slate-100 rounded-lg" role="tablist" aria-label="Column filter">
            {([['ALL', 'All', columns.length], ['UNMAPPED', 'Unmapped', unmapped.length]] as const).map(([k, label, n]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={filter === k}
                onClick={() => { setFilter(k); setPage(1); }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${filter === k ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {label} <span className="text-slate-400 font-normal ml-0.5">{n}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100">
          {columns.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">
              {columnsLoading ? 'Loading physical table columns…' : 'No physical columns detected.'}
            </div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">Every column is mapped.</div>
          ) : (
            paginatedVisible.map(col => {
              const mappedKey = mappings[col.name] || '';
              const isMapped = !!mappedKey;
              const note = notes[col.name];
              return (
                <div key={col.name} className="px-5 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50">
                  <div className="grid grid-cols-[auto_minmax(0,220px)_minmax(0,1fr)_auto_minmax(0,320px)_auto_auto] items-center gap-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${col.name}`}
                      checked={selectedColumns.includes(col.name)}
                      onChange={() => onToggleSelect(col.name)}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-orange-600 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {col.isPrimary && <Key size={12} className="text-amber-500 shrink-0" aria-label="Primary key" />}
                        <span className="font-mono font-bold text-sm text-slate-900 truncate" title={col.name}>{col.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{col.type}</div>
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 truncate" title="First sample values">
                      {sampleRows.length === 0 ? '' : sampleValuesHint(sampleRows, col.name)}
                    </div>
                    <ArrowRight size={14} className="text-slate-300" />
                    <select
                      aria-label={`Global field for ${col.name}`}
                      value={mappedKey}
                      onChange={e => onMap(col.name, e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-orange-200 transition ${
                        isMapped
                          ? 'border-slate-200 bg-white text-slate-800'
                          : 'border-amber-300 bg-[#FEF3C7] text-amber-900 font-medium'
                      }`}
                    >
                      <option value="">Choose a global field</option>
                      {fields.map(f => {
                        const hasKey = f.label.toLowerCase().includes(f.key.toLowerCase());
                        const labelText = hasKey ? f.label : `${f.label} (${f.key})`;
                        return (
                          <option key={f.key} value={f.key}>{labelText}</option>
                        );
                      })}
                    </select>
                    {isMapped
                      ? <CheckCircle2 size={17} className="text-emerald-600 shrink-0" aria-label="Mapped" />
                      : <AlertTriangle size={17} className="text-amber-500 shrink-0" aria-label="Unmapped" />}
                    <div className="relative">
                      <button
                        type="button"
                        aria-label={`Actions for ${col.name}`}
                        aria-haspopup="menu"
                        aria-expanded={menuFor === col.name}
                        onClick={() => setMenuFor(menuFor === col.name ? null : col.name)}
                        className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded cursor-pointer"
                      >
                        <MoreHorizontal size={15} />
                      </button>
                      {menuFor === col.name && (
                        <div role="menu" className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 text-left">
                          <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onSplit(col.name); }} className="w-full px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2 cursor-pointer"><Scissors size={13} /> Split column…</button>
                          <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onMerge(col.name); }} className="w-full px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2 cursor-pointer"><Combine size={13} /> Merge with column…</button>
                          <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onAddToGlobal(col); }} className="w-full px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2 cursor-pointer"><PlusCircle size={13} /> Add to global field…</button>
                          <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onLinkDictionary(col.name); }} className="w-full px-3 py-1.5 text-xs hover:bg-slate-50 flex items-center gap-2 cursor-pointer"><BookOpen size={13} /> Value dictionary…</button>
                          <div className="my-1 border-t border-slate-100" />
                          <button type="button" role="menuitem" onClick={() => { setMenuFor(null); onUnmap(col.name); }} className="w-full px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"><X size={13} /> Unmap column</button>
                        </div>
                      )}
                    </div>
                  </div>
                  {note && <div className="ml-8 mt-1 text-[11px] text-amber-700 font-mono truncate" title={note}>{note}</div>}
                </div>
              );
            })
          )}
        </div>

        {visible.length > 0 && (
          <div className="p-3 border-t border-slate-100 bg-white rounded-b-2xl">
            <DataTablePagination
              currentPage={page}
              pageSize={pageSize}
              totalItems={visible.length}
              pageSizeOptions={[5, 6, 7, 8, 9, 10, 15, 20, 25, 50]}
              onPageChange={(p) => setPage(p)}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">Mapping health</h3>
            <span className="text-sm font-bold text-slate-900">{mappedCount} of {columns.length}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-3 space-y-2.5 text-xs text-slate-700">
            {unmapped.length === 0 && emptyColumns.length === 0 && (
              <div className="flex items-start gap-2 text-emerald-700"><CheckCircle2 size={14} className="mt-0.5 shrink-0" /> Every column is mapped.</div>
            )}
            {unmapped.slice(0, 5).map(c => (
              <div key={c.name} className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                <span><span className="font-mono font-bold">{c.name}</span> is not mapped. Map it, or ignore it so rules skip it.</span>
              </div>
            ))}
            {unmapped.length > 5 && <div className="text-slate-400 pl-6">+{unmapped.length - 5} more unmapped</div>}
            {emptyColumns.length > 0 && (
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                <span>
                  {emptyColumns.slice(0, 4).map((c, i, arr) => (
                    <React.Fragment key={c.name}>
                      <span className="font-mono font-bold">{c.name}</span>{i < arr.length - 1 ? (i === arr.length - 2 ? ' and ' : ', ') : ''}
                    </React.Fragment>
                  ))}
                  {emptyColumns.length > 4 ? ` and ${emptyColumns.length - 4} more` : ''}
                  {emptyColumns.length === 1 ? ' is' : ' are'} empty in all {sampleRows.length} sample rows.
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">Live sample</h3>
            <span className="text-xs text-slate-400">{Math.min(SAMPLE_PANEL_ROWS, sampleRows.length)} of {sampleRows.length} rows</span>
          </div>
          {sampleLoading ? (
            <div className="px-5 pb-5 text-xs text-slate-400 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Querying {tableName}…</div>
          ) : sampleRows.length === 0 ? (
            <div className="px-5 pb-5 text-xs text-slate-400">No live rows in {tableName || 'this table'} (empty table or connection on standby).</div>
          ) : (
            <>
              <div className="overflow-x-auto bg-slate-50/60 border-t border-slate-100">
                <table className="w-full text-xs">
                  <thead className="text-[11px] text-slate-500 text-left">
                    <tr>{samplePanelColumns.map(c => <th key={c.name} className="px-3 py-2 font-medium whitespace-nowrap">{c.name}</th>)}</tr>
                  </thead>
                  <tbody className="bg-white font-mono text-[11px]">
                    {sampleRows.slice(0, SAMPLE_PANEL_ROWS).map((row, r) => (
                      <tr key={r} className="border-t border-slate-100 align-top">
                        {samplePanelColumns.map(c => (
                          <td key={c.name} className="px-3 py-2 max-w-[160px]">
                            <JsonChip value={row[c.name]} id={`${r}:${c.name}`} expanded={expanded} onToggle={toggleExpanded} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-5 py-3 text-[11px] text-slate-400">JSON values are shown as a short preview. Click one to expand.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const TableMappingColumnList: React.FC<TableMappingColumnListProps> = props => (
  <ErrorBoundary fallbackTitle="Table mapping failed to render">
    <Inner {...props} />
  </ErrorBoundary>
);

export default TableMappingColumnList;
