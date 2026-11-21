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
  preTransformedInput?: string;
  postTransformedOutput?: string;
}

export function applyTransformationRule(rule: string, value: string): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  const r = (rule || '').trim().toUpperCase();
  switch (r) {
    case 'UPPERCASE':
      return str.toUpperCase();
    case 'LOWERCASE':
      return str.toLowerCase();
    case 'TITLECASE':
      return str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
    case 'TRIM':
      return str.trim();
    case 'STRIP_CURRENCY':
    case 'CLEAN_AMOUNT': {
      // Remove currency symbols ($, ETB, USD, €, etc.) and commas
      const cleaned = str.replace(/[^0-9.-]/g, '').trim();
      return cleaned || str;
    }
    case 'PHONE_ET': {
      // Standardize Ethiopian phone number to +251...
      const digits = str.replace(/[^0-9]/g, '');
      if (digits.startsWith('251') && digits.length === 12) return `+${digits}`;
      if (digits.startsWith('0') && digits.length === 10) return `+251${digits.slice(1)}`;
      if ((digits.startsWith('9') || digits.startsWith('7')) && digits.length === 9) return `+251${digits}`;
      return str;
    }
    case 'MASK_PAN': {
      // 16-digit card mask: 4111********1111
      const trimmed = str.trim();
      if (trimmed.length >= 12) {
        return `${trimmed.slice(0, 4)}${'*'.repeat(trimmed.length - 8)}${trimmed.slice(-4)}`;
      }
      return str;
    }
    case 'DATE_ISO': {
      try {
        const d = new Date(str);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      } catch {}
      return str;
    }
    default:
      return str;
  }
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

  // 1. Pre-Lookup Transformation
  let preProcessed = raw;
  if (dict.preTransformRule) {
    preProcessed = applyTransformationRule(dict.preTransformRule, preProcessed);
  }
  if (Array.isArray(dict.transformationRules) && dict.transformationRules.length > 0) {
    for (const rule of dict.transformationRules) {
      preProcessed = applyTransformationRule(rule, preProcessed);
    }
  }

  const direction = dict.direction || 'FORWARD';
  const needle = normalise(preProcessed, dict);

  const tryForward = direction === 'FORWARD' || direction === 'BOTH';
  const tryReverse = direction === 'REVERSE' || direction === 'BOTH';

  let rawOutput = '';
  let matched = false;
  let flagged = false;
  let matchedSide: 'source' | 'target' | undefined = undefined;

  if (tryForward) {
    const hit = (dict.mappings || []).find(m => normalise(m.sourceValue, dict) === needle);
    if (hit) {
      matched = true;
      rawOutput = hit.targetValue;
      matchedSide = 'source';
    }
  }
  if (!matched && tryReverse) {
    const hit = (dict.mappings || []).find(m => normalise(m.targetValue, dict) === needle);
    if (hit) {
      matched = true;
      rawOutput = hit.sourceValue;
      matchedSide = 'target';
    }
  }

  if (!matched) {
    switch (dict.noMatchPolicy || 'KEEP_ORIGINAL') {
      case 'BLANK':
        rawOutput = '';
        break;
      case 'USE_FALLBACK':
        rawOutput = dict.defaultFallback ?? raw;
        break;
      case 'FLAG':
        rawOutput = raw;
        flagged = true;
        break;
      default:
        rawOutput = raw;
        break;
    }
  }

  // 2. Post-Lookup Transformation
  let finalOutput = rawOutput;
  if (dict.postTransformRule && rawOutput) {
    finalOutput = applyTransformationRule(dict.postTransformRule, rawOutput);
  }

  return {
    matched,
    output: finalOutput,
    flagged,
    matchedSide,
    preTransformedInput: dict.preTransformRule ? preProcessed : undefined,
    postTransformedOutput: dict.postTransformRule ? finalOutput : undefined
  };
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
