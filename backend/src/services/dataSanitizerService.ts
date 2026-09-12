import { repo } from '../store/repository.js';
import { GlobalStandardDirectoryRecord } from '../types.js';

export interface MappingValidationResult {
  valid: boolean;
  missingFields: string[];
  requiredFields: string[];
  autoMapping?: Record<string, string>;
}

export interface SanitizationResult {
  sanitizedRows: Record<string, any>[];
  totalInputRows: number;
  droppedKeysCount: number;
  droppedNullsCount: number;
  effectiveMapping: Record<string, string>;
}

/**
 * Standardize numeric monetary and decimal values
 * Handles: "$ 1,234.50", "(150.25)", "123.45-", exponential, EUR/GBP symbols
 */
export function cleanAmount(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) || !isFinite(val) ? null : val;
  if (typeof val === 'string') {
    let cleaned = val.trim();
    if (cleaned === '' || cleaned.toLowerCase() === 'null' || cleaned.toLowerCase() === 'undefined') return null;

    // Check accounting parenthesis negative format: (123.45) -> -123.45
    const isParenNegative = /^\s*\(\s*([0-9.,]+)\s*\)\s*$/.test(cleaned);
    // Check trailing minus format: 123.45- -> -123.45
    const isTrailingNegative = /^\s*([0-9.,]+)\s*-\s*$/.test(cleaned);

    // Strip currency symbols and whitespace
    cleaned = cleaned.replace(/[\$\€\£\¥\₹\s]/g, '');

    if (isParenNegative) {
      cleaned = '-' + cleaned.replace(/[\(\)]/g, '');
    } else if (isTrailingNegative) {
      cleaned = '-' + cleaned.replace(/-$/, '');
    }

    // Strip commas (thousands separators)
    cleaned = cleaned.replace(/,/g, '');

    const parsed = parseFloat(cleaned);
    return isNaN(parsed) || !isFinite(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Standardize integers
 */
export function cleanInteger(val: any): number | null {
  const num = cleanAmount(val);
  if (num === null) return null;
  return Math.round(num);
}

/**
 * Standardize ISO dates, timestamps, date-only, and compact formats
 */
export function cleanDate(val: any): string | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString();
  }
  if (typeof val === 'number') {
    // Check if timestamp in seconds or milliseconds
    const ts = val < 10000000000 ? val * 1000 : val;
    const d = new Date(ts);
    return !isNaN(d.getTime()) ? d.toISOString() : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') return null;

    // Compact YYYYMMDD (e.g. 20260910)
    if (/^\d{8}$/.test(trimmed)) {
      const y = trimmed.substring(0, 4);
      const m = trimmed.substring(4, 6);
      const d = trimmed.substring(6, 8);
      const iso = `${y}-${m}-${d}`;
      const dt = new Date(iso);
      return !isNaN(dt.getTime()) ? iso : null;
    }

    // Compact YYYYMMDDHHMMSS (14 digits)
    if (/^\d{14}$/.test(trimmed)) {
      const y = trimmed.substring(0, 4);
      const m = trimmed.substring(4, 6);
      const d = trimmed.substring(6, 8);
      const h = trimmed.substring(8, 10);
      const min = trimmed.substring(10, 12);
      const s = trimmed.substring(12, 14);
      const dt = new Date(`${y}-${m}-${d}T${h}:${min}:${s}Z`);
      return !isNaN(dt.getTime()) ? dt.toISOString() : null;
    }

    // Time-only string (e.g. 14:30:00)
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      return trimmed;
    }

    // Standard date parsing (handles YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY)
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      if (!trimmed.includes(':')) {
        return d.toISOString().split('T')[0];
      }
      return d.toISOString();
    }
  }
  return null;
}

/**
 * Standardize boolean flags
 */
export function cleanBoolean(val: any): boolean | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (['true', '1', 't', 'y', 'yes', 'on'].includes(s)) return true;
    if (['false', '0', 'f', 'n', 'no', 'off'].includes(s)) return false;
  }
  return null;
}

/**
 * Standardize primary account number / card number (strip spaces and hyphens)
 */
export function cleanPan(val: any): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).replace(/[\s\-\.]/g, '').trim();
  return s.length >= 10 ? s : null;
}

export const dataSanitizerService = {
  /**
   * Retrieves list of required standard fields from global_standard_directory
   */
  async getRequiredDirectoryFields(): Promise<string[]> {
    try {
      const allFields: GlobalStandardDirectoryRecord[] = await repo.getGlobalStandardDirectory();
      return allFields.filter(f => f.required).map(f => f.key.toLowerCase());
    } catch (err) {
      console.warn('Could not fetch global standard directory for required fields:', err);
      return ['refnum', 'reqamt', 'terminal_id'];
    }
  },

  /**
   * Intelligently auto-maps raw dataset headers against Global Standard Directory columns
   * using exact matching, slug normalization, and domain-aware financial/settlement synonyms.
   */
  async autoMapHeaders(
    rawHeaders: string[],
    standardFields?: GlobalStandardDirectoryRecord[]
  ): Promise<Record<string, string>> {
    const mapping: Record<string, string> = {};
    if (!Array.isArray(rawHeaders) || rawHeaders.length === 0) return mapping;

    const fields = standardFields || await repo.getGlobalStandardDirectory();
    if (!fields || fields.length === 0) return mapping;

    for (const rawH of rawHeaders) {
      if (!rawH || typeof rawH !== 'string') continue;
      const cleanHeader = rawH.trim();
      const slugH = cleanHeader.toLowerCase().replace(/[-_.\s]/g, '');

      // 1. Exact match by key or label
      const exactMatch = fields.find(f => {
        const slugKey = f.key.toLowerCase().replace(/[-_.\s]/g, '');
        const slugLabel = (f.label || '').toLowerCase().replace(/[-_.\s]/g, '');
        return slugKey === slugH || slugLabel === slugH;
      });
      if (exactMatch) {
        mapping[cleanHeader] = exactMatch.key;
        continue;
      }

      // 2. High-priority Financial & Settlement domain synonym rules (prioritized for standard directory keys)
      // Transaction / UTRNNO / Reference (prioritize refnum)
      if (/^(fe_)?utrnno$/i.test(slugH) || /^(txn|trans|transaction|tx)(id|no|num|ref|reference|key)?$/i.test(slugH) || /^(rrn|retrieval_ref_num|refnum|reference_no|ref_no|ref|refno)$/i.test(slugH) || slugH.includes('ref')) {
        const target = fields.find(f => f.key.toLowerCase() === 'refnum')
          || fields.find(f => f.key.toLowerCase() === 'transaction_id')
          || fields.find(f => /refnum|transaction_id|trans_id|utrnno|retrieval_ref_num/i.test(f.key));
        if (target) { mapping[cleanHeader] = target.key; continue; }
      }

      // Amount / Currency Amount (prioritize reqamt)
      if (/^(reqamt|request_amt|requested_amount|req_amount|tran_amt|trans_amt|transaction_amount|txn_amount|amount|amt|val|value|interchangeamt|conamt)$/i.test(slugH) || slugH.includes('amount') || slugH.includes('reqamt') || slugH.includes('amt')) {
        const target = fields.find(f => f.key.toLowerCase() === 'reqamt')
          || fields.find(f => f.key.toLowerCase() === 'amount')
          || fields.find(f => /reqamt|amount|amt/i.test(f.key))
          || fields.find(f => /interchangeamt|conamt/i.test(f.key));
        if (target) { mapping[cleanHeader] = target.key; continue; }
      }

      // Card / PAN / Account (prioritize hpan)
      if (/^(hpan|pan|card|card_no|card_num|card_number|cardnumber|account|acct|acct_no|acct_num|account_number|primary_account_number)$/i.test(slugH) || slugH.includes('card') || slugH.includes('pan')) {
        const target = fields.find(f => f.key.toLowerCase() === 'hpan')
          || fields.find(f => f.key.toLowerCase() === 'pan')
          || fields.find(f => /hpan|pan|card|acct_num/i.test(f.key));
        if (target) { mapping[cleanHeader] = target.key; continue; }
      }

      // Date / Timestamp / Time (prioritize ttime)
      if (/^(ttime|tran_time|trans_time|txn_time|datetime|timestamp|tr_date|trans_date|txn_date|valuedate|value_date|date|created_at|authtime)$/i.test(slugH) || slugH.includes('date') || slugH.includes('time')) {
        const target = fields.find(f => f.key.toLowerCase() === 'ttime')
          || fields.find(f => f.key.toLowerCase() === 'tr_date')
          || fields.find(f => /ttime|tr_date|value_date|timestamp|created_at/i.test(f.key));
        if (target) { mapping[cleanHeader] = target.key; continue; }
      }

      // Terminal / Merchant / Device (prioritize terminal_id)
      if (/^(terminal_id|term_id|tid|terminal|merchant_id|mid|merchant|pos_id|term)$/i.test(slugH) || slugH.includes('terminal') || slugH.includes('term')) {
        const target = fields.find(f => f.key.toLowerCase() === 'terminal_id')
          || fields.find(f => f.key.toLowerCase() === 'terminal')
          || fields.find(f => /terminal_id|terminal|merchant_id|merchant/i.test(f.key));
        if (target) { mapping[cleanHeader] = target.key; continue; }
      }

      // Processing Code (prioritize prcode)
      if (/^(prcode|proc_code|processing_code|proccode|trans_type|txn_type)$/i.test(slugH) || slugH.includes('prcode') || slugH.includes('proccode') || slugH.includes('proc')) {
        const target = fields.find(f => f.key.toLowerCase() === 'prcode')
          || fields.find(f => /prcode|proc_code|processing_code/i.test(f.key));
        if (target) { mapping[cleanHeader] = target.key; continue; }
      }

      // Response / Auth Code
      if (/^(auth_code|authcode|approval_code|auth_num|auth_id|auth_log)$/i.test(slugH) || slugH.includes('auth')) {
        const target = fields.find(f => /auth_code|auth_id|approval_code|auth_log/i.test(f.key));
        if (target) { mapping[cleanHeader] = target.key; continue; }
      }

      // Status
      if (/^(status|state|stat|status_state|verdict)$/i.test(slugH) || slugH.includes('status')) {
        const target = fields.find(f => /status|state/i.test(f.key));
        if (target) { mapping[cleanHeader] = target.key; continue; }
      }

      // Currency
      if (/^(curr|currency|cur_code|ccy)$/i.test(slugH) || slugH.includes('curr')) {
        const target = fields.find(f => /currency|conamt/i.test(f.key));
        if (target) { mapping[cleanHeader] = target.key; continue; }
      }
    }

    return mapping;
  },

  /**
   * Validates that required global standard fields are mapped.
   * If not explicitly provided, attempts auto-mapping on sample data headers to satisfy requirements.
   */
  async validateMapping(
    fileMapping?: Record<string, string>,
    sampleRow?: Record<string, any>
  ): Promise<MappingValidationResult> {
    const requiredFields = await this.getRequiredDirectoryFields();
    if (requiredFields.length === 0) {
      return { valid: true, missingFields: [], requiredFields: [] };
    }

    const effectiveMapping = { ...(fileMapping || {}) };

    // If sampleRow is present, attempt auto-mapping for any unmapped headers
    if (sampleRow && typeof sampleRow === 'object') {
      const sampleHeaders = Object.keys(sampleRow);
      const autoMapped = await this.autoMapHeaders(sampleHeaders);
      for (const [hdr, target] of Object.entries(autoMapped)) {
        if (!effectiveMapping[hdr]) {
          effectiveMapping[hdr] = target;
        }
      }
    }

    // Identify mapped targets
    const mappedTargets = new Set<string>();
    for (const target of Object.values(effectiveMapping)) {
      if (target && typeof target === 'string') {
        mappedTargets.add(target.toLowerCase().trim());
      }
    }

    // Check direct key matches in sampleRow
    if (sampleRow && typeof sampleRow === 'object') {
      for (const col of Object.keys(sampleRow)) {
        if (col) {
          mappedTargets.add(col.toLowerCase().trim());
        }
      }
    }

    const missingFields = requiredFields.filter(rf => !mappedTargets.has(rf));

    return {
      valid: missingFields.length === 0,
      missingFields,
      requiredFields,
      autoMapping: effectiveMapping
    };
  },

  /**
   * Sanitizes rows:
   * 1. Automatically maps headers if fileMapping is absent or partial.
   * 2. Maps raw column names to canonical schema keys.
   * 3. Strips unmapped raw columns.
   * 4. Strips null, undefined, and empty string ("") values automatically.
   * 5. Strict Data Type Transformation:
   *    - Numbers: strips currency, accounting parens, formats floats.
   *    - Dates: standardizes to ISO-8601, compact dates, timestamps.
   *    - Booleans: converts flags ('Y'/'N', 'true'/'false', 1/0) to strict booleans.
   *    - PANs: removes spaces/hyphens.
   */
  async sanitizeRows(
    rows: Record<string, any>[],
    fileMapping?: Record<string, string>
  ): Promise<SanitizationResult> {
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return {
        sanitizedRows: [],
        totalInputRows: 0,
        droppedKeysCount: 0,
        droppedNullsCount: 0,
        effectiveMapping: {}
      };
    }

    let standardFields: GlobalStandardDirectoryRecord[] = [];
    try {
      standardFields = await repo.getGlobalStandardDirectory();
    } catch {
      standardFields = [];
    }

    // Lookup of standard fields: key -> GlobalStandardDirectoryRecord
    const standardKeyMap = new Map<string, GlobalStandardDirectoryRecord>();
    for (const sf of standardFields) {
      standardKeyMap.set(sf.key.toLowerCase(), sf);
    }

    // Extract all unique headers across sample rows
    const sampleHeadersSet = new Set<string>();
    for (const r of rows.slice(0, 10)) {
      if (r && typeof r === 'object') {
        Object.keys(r).forEach(k => sampleHeadersSet.add(k));
      }
    }
    const sampleHeaders = Array.from(sampleHeadersSet);

    // Auto-map any unmapped headers
    const autoMapped = await this.autoMapHeaders(sampleHeaders, standardFields);
    const effectiveMapping: Record<string, string> = { ...autoMapped, ...(fileMapping || {}) };

    // Mapping lookup: normalized sourceCol -> standardKey
    const normalizedMapping = new Map<string, string>();
    for (const [sourceCol, targetKey] of Object.entries(effectiveMapping)) {
      if (sourceCol && targetKey) {
        normalizedMapping.set(sourceCol.toLowerCase().trim(), targetKey.toLowerCase().trim());
      }
    }

    let droppedKeysCount = 0;
    let droppedNullsCount = 0;
    const sanitizedRows: Record<string, any>[] = [];

    for (const rawRow of rows) {
      if (!rawRow || typeof rawRow !== 'object') continue;

      const cleanRow: Record<string, any> = {};

      for (const [rawKey, rawVal] of Object.entries(rawRow)) {
        const normRawKey = rawKey.toLowerCase().trim();

        // Determine mapped canonical key
        let targetKey: string | null = null;
        if (normalizedMapping.has(normRawKey)) {
          targetKey = normalizedMapping.get(normRawKey)!;
        } else if (standardKeyMap.has(normRawKey)) {
          targetKey = normRawKey;
        } else {
          droppedKeysCount++;
          continue;
        }

        // Check for null / undefined / empty string
        if (rawVal === null || rawVal === undefined) {
          droppedNullsCount++;
          continue;
        }

        if (typeof rawVal === 'string') {
          const trimmed = rawVal.trim();
          if (trimmed === '' || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') {
            droppedNullsCount++;
            continue;
          }
        }

        // Schema-driven Data Type Transformation
        const schemaDef = standardKeyMap.get(targetKey);
        const dataType = (schemaDef?.dataType || 'string').toLowerCase();

        // Check for PAN / Card field normalization
        if (targetKey === 'hpan' || targetKey === 'pan' || targetKey.includes('card')) {
          const pan = cleanPan(rawVal);
          if (pan !== null) {
            cleanRow[targetKey] = pan;
          } else {
            cleanRow[targetKey] = String(rawVal).trim();
          }
          continue;
        }

        if (dataType === 'number') {
          const num = cleanAmount(rawVal);
          if (num !== null) {
            cleanRow[targetKey] = num;
          } else {
            droppedNullsCount++;
          }
        } else if (dataType === 'integer' || dataType === 'int') {
          const intVal = cleanInteger(rawVal);
          if (intVal !== null) {
            cleanRow[targetKey] = intVal;
          } else {
            droppedNullsCount++;
          }
        } else if (dataType === 'date' || dataType === 'timestamp' || dataType === 'datetime') {
          const dt = cleanDate(rawVal);
          if (dt !== null) {
            cleanRow[targetKey] = dt;
          } else {
            cleanRow[targetKey] = String(rawVal).trim();
          }
        } else if (dataType === 'boolean' || dataType === 'bool') {
          const b = cleanBoolean(rawVal);
          if (b !== null) {
            cleanRow[targetKey] = b;
          } else {
            droppedNullsCount++;
          }
        } else {
          // String / text
          cleanRow[targetKey] = typeof rawVal === 'string' ? rawVal.trim() : rawVal;
        }
      }

      sanitizedRows.push(cleanRow);
    }

    return {
      sanitizedRows,
      totalInputRows: rows.length,
      droppedKeysCount,
      droppedNullsCount,
      effectiveMapping
    };
  }
};
