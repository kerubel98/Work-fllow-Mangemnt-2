/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ============================================================================
 * DOMAIN 18: EXECUTABLE MAPPING & RECIPE ENGINE (backend/src/services/recipeExecutionService.ts)
 * ============================================================================
 * Governance Standard: AGENTS.md Rules 1, 4, 11, 14, 18, 19, 20, 22, 23
 * Master Plan: TASK_MAPPING_RECIPE_AUTOMATION_EXECUTION_PLAN.md
 * 
 * Provides pure backend step-by-step sequential execution of file ingestion recipes:
 * Stage 1: Preamble & Header Slicing
 * Stage 2: Column Deletions / Exclusions
 * Stage 3: Split Operations
 * Stage 4: Merge Operations
 * Stage 5: Value Translations & System Rules (PostgreSQL dictionaries & rules)
 * Stage 6: Data Cleaning Policies (trim, ISO dates, amount cleanup, dedup, PAN mask)
 * Stage 7: Canonical Column Mapping & Projection
 * ============================================================================
 */

import {
  FileIngestionMappingTemplate,
  SplitOperation,
  MergeOperation,
  TransformOperation,
  ValueTranslationDictionary,
  SystemTransformationRule,
  RecipeExecutionStepAudit,
  RecipeExecutionResult,
  RecipeExecutionOptions
} from '../types.js';
import { postgresRepo } from '../store/postgresRepo.js';
import { translateWithDictionary } from './valueDictionaryService.js';

function resolveRowKey(row: Record<string, any>, targetCol: string): string | null {
  if (!targetCol) return null;
  if (row[targetCol] !== undefined) return targetCol;
  const lower = targetCol.toLowerCase().trim();
  const direct = Object.keys(row).find(k => k.toLowerCase().trim() === lower);
  if (direct) return direct;
  const slug = lower.replace(/[^a-z0-9]/g, '');
  if (slug) {
    const slugMatch = Object.keys(row).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === slug);
    if (slugMatch) return slugMatch;
  }
  return null;
}

export class RecipeExecutionService {
  /**
   * Main entry point: Executes full recipe pipeline step-by-step on an array of data rows.
   */
  async executeRecipe(
    rows: Record<string, any>[],
    template: FileIngestionMappingTemplate,
    options: RecipeExecutionOptions = {}
  ): Promise<RecipeExecutionResult> {
    const startTime = Date.now();
    const auditTrail: RecipeExecutionStepAudit[] = [];
    let stepCounter = 1;

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return {
        success: true,
        processedRows: [],
        headers: [],
        auditTrail: [],
        totalRowsIn: 0,
        totalRowsOut: 0,
        executionTimeMs: Date.now() - startTime
      };
    }

    const totalRowsIn = rows.length;
    let currentRows: Record<string, any>[] = rows.map((r, i) => {
      const copy = { ...r };
      if (options.preserveRawPayload && !copy._raw) {
        copy._raw = { ...r };
      }
      return copy;
    });

    try {
      // ------------------------------------------------------------------------
      // STAGE 1: Preamble & Header Slicing
      // ------------------------------------------------------------------------
      const stage1Start = Date.now();
      let preambleAffected = 0;
      const effectiveHeaderRow = template.headerRowIndex || 1;
      const effectiveDataStart = template.dataStartRow || (effectiveHeaderRow + 1);

      // If manual headers or renamed headers are provided for positional/source columns
      const headerRenames: Record<string, string> = {
        ...(template.manualHeaders || {}),
        ...(template.cleaningRecipe?.renamedHeaders || {})
      };
      if (Object.keys(headerRenames).length > 0) {
        currentRows = currentRows.map(row => {
          const remapped: Record<string, any> = {};
          for (const [key, val] of Object.entries(row)) {
            const mappedHeader = headerRenames[key];
            if (mappedHeader && mappedHeader.trim()) {
              remapped[mappedHeader.trim()] = val;
            } else {
              remapped[key] = val;
            }
          }
          return remapped;
        });
        preambleAffected = currentRows.length;
      }

      auditTrail.push({
        stepNum: stepCounter++,
        stage: 'PREAMBLE_HEADER_SLICING',
        action: 'APPLY_MANUAL_HEADERS',
        affectedRowsCount: preambleAffected,
        durationMs: Date.now() - stage1Start,
        details: {
          headerRowIndex: effectiveHeaderRow,
          dataStartRow: effectiveDataStart,
          manualHeadersCount: Object.keys(template.manualHeaders || {}).length
        }
      });

      // ------------------------------------------------------------------------
      // STAGE 2: Column Deletions / Exclusions
      // ------------------------------------------------------------------------
      const stage2Start = Date.now();
      const deletedCols = template.deletedColumns || [];
      if (deletedCols.length > 0) {
        currentRows = currentRows.map(row => {
          const out = { ...row };
          for (const del of deletedCols) {
            const matched = resolveRowKey(out, del);
            if (matched && !matched.startsWith('_')) delete out[matched];
          }
          return out;
        });
      }

      auditTrail.push({
        stepNum: stepCounter++,
        stage: 'COLUMN_DELETIONS',
        action: 'EXCLUDE_COLUMNS',
        affectedRowsCount: deletedCols.length > 0 ? currentRows.length : 0,
        durationMs: Date.now() - stage2Start,
        details: { deletedColumns: deletedCols }
      });

      // ------------------------------------------------------------------------
      // STAGE 3: Split Operations
      // ------------------------------------------------------------------------
      const recipe = template.cleaningRecipe || {};
      const splitOps: SplitOperation[] = template.splitOperations || recipe.splitOperations || [];

      for (const splitOp of splitOps) {
        if (!splitOp.column || !splitOp.partNames?.length) continue;
        const opStart = Date.now();
        const colKey = splitOp.column.trim();

        let delim = ' ';
        if (splitOp.delimiterType === 'COMMA') delim = ',';
        else if (splitOp.delimiterType === 'HYPHEN') delim = '-';
        else if (splitOp.delimiterType === 'SLASH') delim = '/';
        else if (splitOp.delimiterType === 'UNDERSCORE') delim = '_';
        else if (splitOp.delimiterType === 'PIPE') delim = '|';
        else if (splitOp.delimiterType === 'SEMICOLON') delim = ';';
        else if (splitOp.delimiterType === 'CUSTOM') delim = splitOp.customDelimiter || ' ';

        const validPartNames = splitOp.partNames.map((n, i) => n.trim() || `${colKey}_part${i + 1}`);
        let splitAffectedCount = 0;

        currentRows = currentRows.map(row => {
          const out = { ...row };
          const actualColKey = resolveRowKey(out, colKey) || colKey;
          const rawVal = out[actualColKey] !== undefined && out[actualColKey] !== null ? String(out[actualColKey]) : '';
          if (rawVal.length > 0) splitAffectedCount++;

          const parts = (splitOp.delimiterType === 'SPACE' || delim === ' ')
            ? (rawVal.trim().length > 0 ? rawVal.trim().split(/\s+/) : [])
            : rawVal.split(delim);

          validPartNames.forEach((name, idx) => {
            out[name] = parts[idx] !== undefined ? parts[idx].trim() : '';
          });

          if (!splitOp.keepOriginal && actualColKey) {
            delete out[actualColKey];
          }
          return out;
        });

        auditTrail.push({
          stepNum: stepCounter++,
          stage: 'SPLIT_OPERATIONS',
          action: `SPLIT_${colKey}`,
          affectedRowsCount: splitAffectedCount,
          durationMs: Date.now() - opStart,
          details: { column: colKey, delimiter: delim, parts: validPartNames, keepOriginal: splitOp.keepOriginal }
        });
      }

      // ------------------------------------------------------------------------
      // STAGE 4: Merge Operations
      // ------------------------------------------------------------------------
      const mergeOps: MergeOperation[] = template.mergeOperations || recipe.mergeOperations || [];

      for (const mergeOp of mergeOps) {
        if (!mergeOp.col1 || !mergeOp.col2 || !mergeOp.resultColumnName) continue;
        const opStart = Date.now();
        const col1 = mergeOp.col1.trim();
        const col2 = mergeOp.col2.trim();
        const resCol = mergeOp.resultColumnName.trim();

        let sep = ' ';
        if (mergeOp.separatorType === 'HYPHEN') sep = '-';
        else if (mergeOp.separatorType === 'UNDERSCORE') sep = '_';
        else if (mergeOp.separatorType === 'SLASH') sep = '/';
        else if (mergeOp.separatorType === 'COMMA') sep = ', ';
        else if (mergeOp.separatorType === 'NONE') sep = '';
        else if (mergeOp.separatorType === 'CUSTOM') sep = mergeOp.customSeparator ?? '';

        let mergeAffectedCount = 0;

        currentRows = currentRows.map(row => {
          const out = { ...row };
          const actualCol1 = resolveRowKey(out, col1) || col1;
          const actualCol2 = resolveRowKey(out, col2) || col2;
          const v1 = out[actualCol1] !== undefined && out[actualCol1] !== null ? String(out[actualCol1]).trim() : '';
          const v2 = out[actualCol2] !== undefined && out[actualCol2] !== null ? String(out[actualCol2]).trim() : '';

          if (v1 || v2) {
            mergeAffectedCount++;
            out[resCol] = (v1 && v2) ? `${v1}${sep}${v2}` : (v1 || v2);
          } else {
            out[resCol] = '';
          }

          if (!mergeOp.keepSources) {
            if (actualCol1) delete out[actualCol1];
            if (actualCol2) delete out[actualCol2];
          }
          return out;
        });

        auditTrail.push({
          stepNum: stepCounter++,
          stage: 'MERGE_OPERATIONS',
          action: `MERGE_${col1}_${col2}`,
          affectedRowsCount: mergeAffectedCount,
          durationMs: Date.now() - opStart,
          details: { col1, col2, resultColumnName: resCol, separator: sep, keepSources: mergeOp.keepSources }
        });
      }

      // ------------------------------------------------------------------------
      // STAGE 5: Value Translations & System Transformation Rules
      // ------------------------------------------------------------------------
      const transformOps: TransformOperation[] = template.transformOperations || recipe.transformOperations || [];
      const columnDictMap = template.valueTranslations || recipe.valueTranslations || {};

      // Load Value Translation Dictionaries from PostgreSQL if needed
      let valueDictionaries: ValueTranslationDictionary[] = [];
      const needsDicts = transformOps.some(t => t.ruleType === 'VALUE_TRANSLATION_DICT' || t.ruleType === 'DICTIONARY_MAP') ||
        Object.keys(columnDictMap).length > 0;

      if (needsDicts) {
        try {
          valueDictionaries = await postgresRepo.getValueTranslationDictionaries();
        } catch (err: any) {
          console.warn('[RecipeExecutionService] Warning fetching value translation dictionaries:', err.message);
        }
      }

      // Load System Transformation Rules from PostgreSQL if needed
      let systemRules: SystemTransformationRule[] = [];
      try {
        systemRules = await postgresRepo.getSystemTransformationRules();
      } catch (err: any) {
        console.warn('[RecipeExecutionService] Warning fetching system transformation rules:', err.message);
      }

      // 5a. Execute explicit transformOperations
      for (const transOp of transformOps) {
        if (!transOp.column || !transOp.ruleType) continue;
        const opStart = Date.now();
        const col = transOp.column.trim();
        let affected = 0;

        currentRows = currentRows.map(row => {
          const out = { ...row };
          const actualCol = resolveRowKey(out, col) || col;
          if (out[actualCol] !== undefined) {
            const originalVal = out[actualCol];
            const transformedVal = this.applySingleTransform(
              originalVal,
              transOp.ruleType,
              transOp.param1,
              transOp.param2,
              valueDictionaries,
              systemRules
            );
            if (originalVal !== transformedVal) affected++;
            out[actualCol] = transformedVal;
          }
          return out;
        });

        auditTrail.push({
          stepNum: stepCounter++,
          stage: 'VALUE_TRANSLATIONS',
          action: `TRANSFORM_${col}`,
          affectedRowsCount: affected,
          durationMs: Date.now() - opStart,
          details: { column: col, ruleType: transOp.ruleType, param1: transOp.param1, param2: transOp.param2 }
        });
      }

      // 5b. Execute mapped Value Translation Dictionaries (column -> dictionaryId)
      for (const [col, dictId] of Object.entries(columnDictMap)) {
        if (!dictId) continue;
        const opStart = Date.now();
        const matchedDict = valueDictionaries.find(d => d.id === dictId || d.name === dictId);
        const mappings = matchedDict?.mappings || (matchedDict as any)?.entries;
        if (!matchedDict || !Array.isArray(mappings)) continue;

        let dictAffected = 0;
        currentRows = currentRows.map(row => {
          const out = { ...row };
          const actualCol = resolveRowKey(out, col) || col;
          if (out[actualCol] !== undefined && out[actualCol] !== null) {
            const originalVal = out[actualCol];
            const transResult = translateWithDictionary(matchedDict, originalVal);
            if (transResult.matched || transResult.output !== originalVal) {
              dictAffected++;
              out[actualCol] = transResult.output;
            }
          }
          return out;
        });

        auditTrail.push({
          stepNum: stepCounter++,
          stage: 'VALUE_TRANSLATIONS',
          action: `DICT_MAP_${col}`,
          affectedRowsCount: dictAffected,
          durationMs: Date.now() - opStart,
          details: {
            column: col,
            dictionaryId: matchedDict.id,
            dictionaryName: matchedDict.name,
            preTransformRule: matchedDict.preTransformRule,
            postTransformRule: matchedDict.postTransformRule
          }
        });
      }

      // ------------------------------------------------------------------------
      // STAGE 6: Data Cleaning Policies
      // ------------------------------------------------------------------------
      const stage6Start = Date.now();
      const cleaningActions: string[] = template.cleaningActions || recipe.cleaningActions || [];
      const shouldTrim = cleaningActions.includes('TRIM_WHITESPACE') || recipe.trimWhitespace;
      const shouldNormDates = cleaningActions.includes('NORMALIZE_DATES') || recipe.normalizeDatesToIso;
      const shouldMaskPan = cleaningActions.includes('MASK_PAN') || recipe.maskCardPan;
      const shouldCleanAmounts = cleaningActions.includes('CLEAN_AMOUNTS') || cleaningActions.includes('STRIP_CURRENCY');
      const shouldDropEmpty = cleaningActions.includes('REMOVE_EMPTY_ROWS') || recipe.emptyRowsAction === 'DROP';
      const shouldDedup = cleaningActions.includes('DEDUPLICATE') || recipe.duplicateRowsAction === 'DROP_EXACT';
      const shouldFillNa = cleaningActions.includes('FILL_BLANKS_NA') || recipe.emptyRowsAction === 'FILL_NA' || recipe.fillBlanksWithNa;

      let cleaningAffected = 0;

      if (shouldTrim) {
        currentRows = currentRows.map(row => {
          const out: Record<string, any> = {};
          for (const [k, v] of Object.entries(row)) {
            out[k] = typeof v === 'string' ? v.trim() : v;
          }
          return out;
        });
        cleaningAffected = currentRows.length;
      }

      if (shouldCleanAmounts) {
        currentRows = currentRows.map(row => {
          const out = { ...row };
          for (const [k, v] of Object.entries(out)) {
            const kLower = k.toLowerCase();
            if (kLower.includes('amount') || kLower.includes('fee') || kLower.includes('balance') || kLower.includes('rate') || kLower.includes('total')) {
              out[k] = this.cleanNumericAmount(v);
            }
          }
          return out;
        });
      }

      if (shouldNormDates) {
        currentRows = currentRows.map(row => {
          const out = { ...row };
          for (const [k, v] of Object.entries(out)) {
            const kLower = k.toLowerCase();
            if (kLower.includes('date') || kLower.includes('time') || kLower.includes('timestamp')) {
              out[k] = this.normalizeDateToIso(v);
            } else if (typeof v === 'string' && /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(v.trim())) {
              out[k] = this.normalizeDateToIso(v);
            }
          }
          return out;
        });
      }

      if (shouldMaskPan) {
        currentRows = currentRows.map(row => {
          const out: Record<string, any> = {};
          for (const [k, v] of Object.entries(row)) {
            const valStr = String(v ?? '').replace(/[\s-]/g, '');
            if (/^\d{13,19}$/.test(valStr)) {
              out[k] = `${valStr.slice(0, 6)}${'*'.repeat(valStr.length - 10)}${valStr.slice(-4)}`;
            } else {
              out[k] = v;
            }
          }
          return out;
        });
      }

      if (shouldDropEmpty) {
        const countBefore = currentRows.length;
        currentRows = currentRows.filter(r =>
          Object.entries(r).some(([k, v]) => !k.startsWith('_') && v !== null && v !== undefined && String(v).trim() !== '' && String(v) !== '-')
        );
        cleaningAffected += (countBefore - currentRows.length);
      }

      if (shouldDedup) {
        const countBefore = currentRows.length;
        const seen = new Set<string>();
        currentRows = currentRows.filter(r => {
          const nonPrivate: Record<string, any> = {};
          for (const [k, v] of Object.entries(r)) {
            if (!k.startsWith('_')) nonPrivate[k] = v;
          }
          const hash = JSON.stringify(nonPrivate);
          if (seen.has(hash)) return false;
          seen.add(hash);
          return true;
        });
        cleaningAffected += (countBefore - currentRows.length);
      }

      if (shouldFillNa) {
        currentRows = currentRows.map(row => {
          const out = { ...row };
          for (const [k, v] of Object.entries(out)) {
            if (!k.startsWith('_') && (v === null || v === undefined || String(v).trim() === '')) {
              out[k] = 'N/A';
            }
          }
          return out;
        });
      }

      auditTrail.push({
        stepNum: stepCounter++,
        stage: 'DATA_CLEANING',
        action: 'EXECUTE_CLEANING_POLICIES',
        affectedRowsCount: cleaningAffected,
        durationMs: Date.now() - stage6Start,
        details: {
          shouldTrim,
          shouldNormDates,
          shouldMaskPan,
          shouldCleanAmounts,
          shouldDropEmpty,
          shouldDedup,
          shouldFillNa
        }
      });

      // ------------------------------------------------------------------------
      // STAGE 7: Canonical Column Mapping & Projection
      // ------------------------------------------------------------------------
      const stage7Start = Date.now();
      const columnMappings = template.columnMappings || {};
      const hasMappings = Object.keys(columnMappings).length > 0;
      const shouldProject = hasMappings && options.projectToCanonical !== false;

      if (shouldProject) {
        // Multi-tier lookup tables for column projection
        const exactMap = new Map<string, string>();
        const lowerMap = new Map<string, string>();
        const slugMap = new Map<string, string>();
        const targetKeys = new Set<string>();

        for (const [src, tgt] of Object.entries(columnMappings)) {
          if (!src || !tgt || tgt === 'Unmapped' || tgt === '') continue;
          const trimmedTarget = tgt.trim();
          exactMap.set(src, trimmedTarget);
          lowerMap.set(src.trim().toLowerCase(), trimmedTarget);
          const sSlug = src.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (sSlug) slugMap.set(sSlug, trimmedTarget);
          targetKeys.add(trimmedTarget.toLowerCase());
          const tSlug = trimmedTarget.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (tSlug) slugMap.set(tSlug, trimmedTarget);
        }

        currentRows = currentRows.map((row) => {
          const canonicalRow: Record<string, any> = {};
          const keys = Object.keys(row);

          for (let kIdx = 0; kIdx < keys.length; kIdx++) {
            const k = keys[kIdx];
            const v = row[k];
            if (k.startsWith('_')) {
              canonicalRow[k] = v;
              continue;
            }

            // Tier 1: Exact match
            let target = exactMap.get(k);

            // Tier 2: Lowercase match
            if (!target) {
              target = lowerMap.get(k.trim().toLowerCase());
            }

            // Tier 3: Slug match
            const kSlug = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!target && kSlug) {
              target = slugMap.get(kSlug);
            }

            // Tier 4: Positional match (col_0, col_1, Column 1, etc.)
            if (!target) {
              const posKeys = [`col_${kIdx}`, `col_${kIdx + 1}`, `column_${kIdx}`, `column_${kIdx + 1}`, `Column ${kIdx + 1}`];
              for (const pk of posKeys) {
                if (exactMap.has(pk)) { target = exactMap.get(pk); break; }
                if (lowerMap.has(pk.toLowerCase())) { target = lowerMap.get(pk.toLowerCase()); break; }
              }
            }

            // Tier 5: Direct target key match
            if (!target && targetKeys.has(k.trim().toLowerCase())) {
              target = k.trim().toLowerCase();
            }

            // Tier 6: Substring match (>= 4 chars)
            if (!target && kSlug.length >= 4) {
              for (const [sSlug, tgt] of slugMap.entries()) {
                if (sSlug.length >= 4 && (kSlug.includes(sSlug) || sSlug.includes(kSlug))) {
                  target = tgt;
                  break;
                }
              }
            }

            if (target) {
              canonicalRow[target] = v;
              if (options.preserveRawPayload && canonicalRow[k] === undefined) {
                canonicalRow[k] = v;
              }
            } else {
              canonicalRow[k] = v;
            }
          }
          return canonicalRow;
        });
      }

      auditTrail.push({
        stepNum: stepCounter++,
        stage: 'CANONICAL_PROJECTION',
        action: hasMappings ? (shouldProject ? 'PROJECT_CANONICAL_FIELDS' : 'VALIDATE_CANONICAL_MAPPINGS') : 'NO_OP',
        affectedRowsCount: hasMappings ? currentRows.length : 0,
        durationMs: Date.now() - stage7Start,
        details: {
          projected: Boolean(shouldProject && hasMappings),
          mappingsCount: Object.keys(columnMappings).length
        }
      });

      // ------------------------------------------------------------------------
      // Compute Final Headers
      // ------------------------------------------------------------------------
      const headerSet = new Set<string>();
      const sample = currentRows.slice(0, 100);
      for (const r of sample) {
        for (const k of Object.keys(r)) {
          if (!k.startsWith('_')) headerSet.add(k);
        }
      }

      return {
        success: true,
        processedRows: currentRows,
        headers: Array.from(headerSet),
        auditTrail,
        totalRowsIn,
        totalRowsOut: currentRows.length,
        executionTimeMs: Date.now() - startTime
      };

    } catch (err: any) {
      console.error('[RecipeExecutionService] Error executing recipe:', err);
      return {
        success: false,
        processedRows: rows,
        headers: rows.length > 0 ? Object.keys(rows[0]) : [],
        auditTrail,
        totalRowsIn,
        totalRowsOut: 0,
        executionTimeMs: Date.now() - startTime,
        error: err.message || 'Unknown recipe execution error'
      };
    }
  }

  /**
   * Loads template by ID from PostgreSQL and executes the full recipe.
   */
  async executeRecipeByTemplateId(
    rows: Record<string, any>[],
    templateId: string,
    options: RecipeExecutionOptions = {}
  ): Promise<RecipeExecutionResult> {
    const template = await postgresRepo.getFileMappingTemplateById(templateId);
    if (!template) {
      throw new Error(`File ingestion mapping template '${templateId}' not found in PostgreSQL.`);
    }
    return this.executeRecipe(rows, template, options);
  }

  /**
   * Preview recipe execution on a small sample of rows (e.g. 5-50 rows).
   */
  async previewRecipe(
    sampleRows: Record<string, any>[],
    template: FileIngestionMappingTemplate,
    options: RecipeExecutionOptions = { projectToCanonical: true, preserveRawPayload: true }
  ): Promise<RecipeExecutionResult> {
    const sample = sampleRows.slice(0, 50);
    return this.executeRecipe(sample, template, options);
  }

  /**
   * Internal helper: Applies a single transformation rule to a cell value.
   */
  private applySingleTransform(
    value: any,
    ruleType: string,
    param1?: string,
    param2?: string,
    valueDictionaries: ValueTranslationDictionary[] = [],
    systemRules: SystemTransformationRule[] = []
  ): any {
    if (value === null || value === undefined) return value;
    const strVal = String(value);

    // Check system rules registered in PostgreSQL
    const matchingSystemRule = systemRules.find(r => (r as any).ruleKey === ruleType || r.name === ruleType || r.type === ruleType);
    if (matchingSystemRule) {
      const sType: string = matchingSystemRule.type || (matchingSystemRule as any).transformationType || '';
      if (sType === 'CASE' || sType === 'UPPERCASE') return strVal.toUpperCase();
      if (sType === 'TRIM') return strVal.trim();
      if (sType === 'STRIP_CURRENCY') return this.cleanNumericAmount(strVal);
      if (sType === 'PHONE_ET') return this.normalizeEthiopianPhone(strVal);
      if (sType === 'MASK') return this.maskCardPan(strVal);
      if (sType === 'DATE_FORMAT') return this.normalizeDateToIso(strVal);
      if (sType === 'VALUE_REPLACE' && (matchingSystemRule.pattern || (matchingSystemRule as any).searchPattern)) {
        const pat = matchingSystemRule.pattern || (matchingSystemRule as any).searchPattern;
        const rep = matchingSystemRule.replacement ?? (matchingSystemRule as any).replacePattern ?? '';
        return strVal.replace(new RegExp(pat, 'g'), rep);
      }
    }

    switch (ruleType) {
      case 'UPPERCASE':
        return strVal.toUpperCase();
      case 'LOWERCASE':
        return strVal.toLowerCase();
      case 'TITLECASE':
        return strVal.replace(/\b\w/g, c => c.toUpperCase());
      case 'TRIM':
        return strVal.trim();
      case 'DATE_ISO':
        return this.normalizeDateToIso(strVal);
      case 'STRIP_CURRENCY':
      case 'NUMERIC_CLEAN':
        return this.cleanNumericAmount(strVal);
      case 'PHONE_ET':
        return this.normalizeEthiopianPhone(strVal);
      case 'MASK_MIDDLE':
      case 'MASK_PAN':
        return this.maskCardPan(strVal);
      case 'VALUE_REPLACE':
        if (param1 !== undefined) {
          return strVal.split(param1).join(param2 ?? '');
        }
        return strVal;
      case 'REGEX_EXTRACT':
        if (param1) {
          try {
            const rx = new RegExp(param1);
            const match = strVal.match(rx);
            return match ? (match[1] || match[0]) : '';
          } catch {
            return strVal;
          }
        }
        return strVal;
      case 'VALUE_TRANSLATION_DICT':
      case 'DICTIONARY_MAP':
        if (param1) {
          const dict = valueDictionaries.find(d => d.id === param1 || d.name === param1);
          const mappings = dict?.mappings || (dict as any)?.entries;
          if (dict && Array.isArray(mappings)) {
            const entry = mappings.find(e => e.sourceValue?.toLowerCase() === strVal.trim().toLowerCase());
            if (entry) return entry.targetValue;
            const defVal = (dict as any).defaultValue || (dict as any).defaultTargetValue;
            if (defVal) return defVal;
          }
        }
        return strVal;
      default:
        return strVal;
    }
  }

  /**
   * Normalizes dates (DD/MM/YYYY, MM/DD/YYYY, YYYY.MM.DD, etc.) into ISO-8601 YYYY-MM-DD.
   */
  private normalizeDateToIso(val: any): string {
    if (!val) return '';
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);

    // Matches DD/MM/YYYY or DD-MM-YYYY
    const matchSlash = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (matchSlash) {
      const p1 = matchSlash[1].padStart(2, '0');
      const p2 = matchSlash[2].padStart(2, '0');
      const year = matchSlash[3];
      // Assume DD/MM/YYYY if p1 <= 31, p2 <= 12
      if (parseInt(p2, 10) <= 12 && parseInt(p1, 10) <= 31) {
        return `${year}-${p2}-${p1}`;
      }
      return `${year}-${p1}-${p2}`;
    }

    // Matches YYYY/MM/DD or YYYY.MM.DD
    const matchYearFirst = str.match(/^(\d{4})[\.\/\-](\d{1,2})[\.\/\-](\d{1,2})/);
    if (matchYearFirst) {
      return `${matchYearFirst[1]}-${matchYearFirst[2].padStart(2, '0')}-${matchYearFirst[3].padStart(2, '0')}`;
    }

    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return str;
  }

  /**
   * Normalizes numeric currency amounts (handles ETB, USD, commas, spaces).
   */
  private cleanNumericAmount(val: any): any {
    if (val === null || val === undefined) return val;
    if (typeof val === 'number') return val;
    let s = String(val).trim();
    // Remove currency codes and signs
    s = s.replace(/^(ETB|USD|EUR|GBP|\$|€|£)\s*/i, '').replace(/\s*(ETB|USD|EUR|GBP)$/i, '');
    // Handle European notation 1.234,56
    if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Standard comma thousands: 1,234.56
      s = s.replace(/,/g, '');
    }
    s = s.trim();
    const num = parseFloat(s);
    return isNaN(num) ? val : num;
  }

  /**
   * Masks payment card Primary Account Number (PAN).
   */
  private maskCardPan(val: any): string {
    const raw = String(val ?? '').replace(/[\s-]/g, '');
    if (/^\d{13,19}$/.test(raw)) {
      return `${raw.slice(0, 6)}${'*'.repeat(raw.length - 10)}${raw.slice(-4)}`;
    }
    return String(val ?? '');
  }

  /**
   * Normalizes Ethiopian phone number to +2519... format.
   */
  private normalizeEthiopianPhone(val: any): string {
    const raw = String(val ?? '').replace(/[\s\-\(\)]/g, '');
    if (/^09\d{8}$/.test(raw)) return `+251${raw.slice(1)}`;
    if (/^9\d{8}$/.test(raw)) return `+251${raw}`;
    if (/^2519\d{8}$/.test(raw)) return `+${raw}`;
    return raw;
  }
}

export const recipeExecutionService = new RecipeExecutionService();
