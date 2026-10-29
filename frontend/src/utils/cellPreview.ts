export interface CellPreview {
  text: string;
  isJson: boolean;
  isEmpty: boolean;
  /** Full value as a string, safe to render inside <pre>. */
  full: string;
}

const MAX_TEXT = 48;
const MAX_KEYS = 3;

function truncate(s: string, max = MAX_TEXT): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function parseMaybeJson(value: string): unknown | undefined {
  const t = value.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return undefined;
  try { return JSON.parse(t); } catch { return undefined; }
}

function previewStructured(v: unknown): string {
  if (Array.isArray(v)) {
    return v.length === 0 ? '[ ]' : `[ ${v.length} item${v.length === 1 ? '' : 's'} ]`;
  }
  const keys = Object.keys(v as Record<string, unknown>);
  if (keys.length === 0) return '{ }';
  const shown = keys.slice(0, MAX_KEYS).join(', ');
  return `{ ${shown}${keys.length > MAX_KEYS ? ', …' : ''} }`;
}

/** Turns any database value into a short, React-safe preview. Never returns "[object Object]". */
export function previewCell(value: unknown): CellPreview {
  if (value === null || value === undefined) {
    return { text: 'null', isJson: false, isEmpty: true, full: 'null' };
  }
  if (value instanceof Date) {
    const iso = value.toISOString();
    return { text: iso, isJson: false, isEmpty: false, full: iso };
  }
  if (typeof value === 'object') {
    let full = '';
    try { full = JSON.stringify(value, null, 2); } catch { full = String(Object.prototype.toString.call(value)); }
    return { text: previewStructured(value), isJson: true, isEmpty: false, full };
  }
  const s = String(value);
  if (s.trim() === '') return { text: '—', isJson: false, isEmpty: true, full: s };
  const parsed = parseMaybeJson(s);
  if (parsed !== undefined && typeof parsed === 'object' && parsed !== null) {
    return { text: previewStructured(parsed), isJson: true, isEmpty: false, full: JSON.stringify(parsed, null, 2) };
  }
  return { text: truncate(s), isJson: false, isEmpty: false, full: s };
}

/** Joins the first few sample values of a column for the inline "sample values" hint. */
export function sampleValuesHint(rows: Record<string, unknown>[], column: string, count = 3): string {
  return rows.slice(0, count).map(r => previewCell(r[column]).text).join(' · ');
}

export function isColumnEmptyInSample(rows: Record<string, unknown>[], column: string): boolean {
  return rows.length > 0 && rows.every(r => previewCell(r[column]).isEmpty);
}

/** String form of any cell value for text operations (split / merge). Objects become JSON, never "[object Object]". */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return previewCell(value).full;
  return String(value);
}
