import { DatabaseConnection, ValueTranslationDictionary } from '../types.js';
import { executeLiveQueryOnDb } from './dbConnectionManager.js';

const SAFE_IDENT = /^[A-Za-z0-9_$]+$/;

export class DistinctValuesError extends Error {}

/**
 * Reads distinct values (with counts) of one column using a single aggregate query.
 * Identifiers are validated and ANSI-quoted; no user values are interpolated.
 */
export async function fetchDistinctColumnValues(
  db: DatabaseConnection,
  tableName: string,
  columnName: string,
  limit = 500
): Promise<Array<{ value: string; count: number }>> {
  const isMirror = tableName.startsWith('mirror_');
  const dialect = db.type === 'MySQL' ? 'MySQL' : db.type === 'PostgreSQL' ? 'PostgreSQL' : null;
  if (!dialect && !isMirror) throw new DistinctValuesError(`Unsupported connection type ${db.type}`);

  const tableParts = tableName.split('.');
  if (!tableParts.every(p => SAFE_IDENT.test(p)) || !SAFE_IDENT.test(columnName)) {
    throw new DistinctValuesError('Unsafe identifier');
  }
  const q = (s: string) => (dialect === 'MySQL' ? `\`${s}\`` : `"${s}"`);
  const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
  const col = q(columnName);
  const live = await executeLiveQueryOnDb(
    db,
    `SELECT ${col} AS v, COUNT(*) AS c FROM ${tableParts.map(q).join('.')} GROUP BY ${col} ORDER BY c DESC LIMIT ${safeLimit}`
  );
  return (live.rows as any[])
    .filter(r => r.v !== null && r.v !== undefined)
    .map(r => ({ value: String(r.v), count: Number(r.c || 0) }));
}

export interface DictionaryTranslationResult {
  matched: boolean;
  output: string;
  /** True when the input had no match and the dictionary policy is FLAG. */
  flagged: boolean;
  /** Which stored side matched the input: 'source' (FORWARD) or 'target' (REVERSE). */
  matchedSide?: 'source' | 'target';
}

function normalise(value: string, dict: Pick<ValueTranslationDictionary, 'caseSensitive' | 'trimWhitespace'>): string {
  let v = String(value ?? '');
  if (dict.trimWhitespace !== false) v = v.trim();
  if (!dict.caseSensitive) v = v.toLowerCase();
  return v;
}

export function translateWithDictionary(
  dict: ValueTranslationDictionary,
  input: unknown
): DictionaryTranslationResult {
  const raw = input === null || input === undefined ? '' : String(input);
  const direction = dict.direction || 'FORWARD';
  const needle = normalise(raw, dict);

  const tryForward = direction === 'FORWARD' || direction === 'BOTH';
  const tryReverse = direction === 'REVERSE' || direction === 'BOTH';

  if (tryForward) {
    const hit = (dict.mappings || []).find(m => normalise(m.sourceValue, dict) === needle);
    if (hit) return { matched: true, output: hit.targetValue, flagged: false, matchedSide: 'source' };
  }
  if (tryReverse) {
    const hit = (dict.mappings || []).find(m => normalise(m.targetValue, dict) === needle);
    if (hit) return { matched: true, output: hit.sourceValue, flagged: false, matchedSide: 'target' };
  }

  switch (dict.noMatchPolicy || 'KEEP_ORIGINAL') {
    case 'BLANK':
      return { matched: false, output: '', flagged: false };
    case 'USE_FALLBACK':
      return { matched: false, output: dict.defaultFallback ?? raw, flagged: false };
    case 'FLAG':
      return { matched: false, output: raw, flagged: true };
    default:
      return { matched: false, output: raw, flagged: false };
  }
}

/**
 * Returns the set of values (with occurrence counts) that the dictionary cannot translate
 * for the lookup side(s) implied by its direction.
 */
export function findUntranslatedValues(
  dict: ValueTranslationDictionary,
  observed: Array<{ value: unknown; count: number }>
): Array<{ value: string; count: number }> {
  const out: Array<{ value: string; count: number }> = [];
  for (const o of observed) {
    if (o.value === null || o.value === undefined || String(o.value).trim() === '') continue;
    const probe: ValueTranslationDictionary = { ...dict, noMatchPolicy: 'KEEP_ORIGINAL' };
    if (!translateWithDictionary(probe, o.value).matched) {
      out.push({ value: String(o.value), count: o.count });
    }
  }
  return out.sort((a, b) => b.count - a.count);
}
