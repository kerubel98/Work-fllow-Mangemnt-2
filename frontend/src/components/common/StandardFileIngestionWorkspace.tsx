/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useImperativeHandle,
  forwardRef
} from 'react';
import * as XLSX from 'xlsx';
import {
  HashtagPreset,
  User,
  FileIngestionMappingTemplate,
  FileIngestionRecipe,
  FileIngestionCleaningRecipe,
  SplitOperation,
  MergeOperation,
  TransformOperation,
  ValueTranslationDictionary,
  DEFAULT_VALUE_TRANSLATION_DICTIONARIES
} from '../../types';
import { api } from '../../api/client';
import { globalMappingService } from '../../services/globalMappingService';
import {
  Upload,
  FileText,
  Trash2,
  Wand2,
  BookmarkCheck,
  Scissors,
  Eraser,
  Calendar,
  AlignLeft,
  Shield,
  X,
  AlertTriangle,
  Check,
  Undo2,
  RefreshCw,
  Plus,
  SlidersHorizontal,
  FolderOpen,
  Save,
  CheckCircle2,
  HelpCircle,
  MoreHorizontal,
  Split,
  Layers,
  Database,
  Sparkles,
  Table,
  ChevronDown,
  BookOpen,
  Combine
} from 'lucide-react';

export interface IngestionDatasetPayload {
  fileName: string;
  rawHeaders: string[];
  activeHeaders: string[];
  parsedRows: Record<string, any>[];
  transformedRows: Record<string, any>[];
  columnMappings: Record<string, string>;
  recipe: FileIngestionRecipe;
  selectedTemplateId: string | null;
}

export interface StandardFileIngestionWorkspaceRef {
  validateAndPrepareDataset: () => Promise<{
    isValid: boolean;
    blockingErrors: string[];
    warnings: string[];
    datasetPayload?: IngestionDatasetPayload;
  }>;
  hasFileAttached: () => boolean;
  isProcessing: () => boolean;
  resetFile: () => void;
}

export interface StandardFileIngestionWorkspaceProps {
  currentUser?: User;
  selectedHashtag?: HashtagPreset | null;
  onDatasetReady?: (payload: IngestionDatasetPayload) => void;
  onValidationChange?: (isValid: boolean, errors: string[]) => void;
  className?: string;
}

export function applyDataTransformationRule(
  value: any,
  ruleType: string,
  param1?: string,
  param2?: string,
  availableDicts?: ValueTranslationDictionary[]
): any {
  if (value === null || value === undefined) return '';
  const str = String(value);

  switch (ruleType) {
    case 'UPPERCASE':
      return str.toUpperCase();
    case 'LOWERCASE':
      return str.toLowerCase();
    case 'TITLECASE':
      return str.replace(/\b\w/g, c => c.toUpperCase());
    case 'TRIM':
      return str.trim().replace(/\s+/g, ' ');
    case 'DATE_ISO': {
      const val = str.trim();
      if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(val)) {
        const parts = val.split(/[\/\-]/);
        if (parts.length === 3) {
          const yr = parts[2];
          const p0 = parts[0].padStart(2, '0');
          const p1 = parts[1].padStart(2, '0');
          return `${yr}-${p0}-${p1}`;
        }
      }
      return val;
    }
    case 'STRIP_CURRENCY':
      return str.replace(/[^0-9.-]/g, '');
    case 'MASK_MIDDLE':
      if (str.length > 8) {
        const first = str.slice(0, 4);
        const last = str.slice(-4);
        return `${first}${'*'.repeat(Math.max(4, str.length - 8))}${last}`;
      }
      return str;
    case 'PHONE_ET': {
      const cleanPhone = str.replace(/[^0-9+]/g, '');
      if (/^(?:\+251|251|0)?(9\d{8}|7\d{8})$/.test(cleanPhone)) {
        const m = cleanPhone.match(/(9\d{8}|7\d{8})$/);
        return m ? `+251${m[1]}` : str;
      }
      return str;
    }
    case 'VALUE_REPLACE':
      if (param1) {
        return str.split(param1).join(param2 || '');
      }
      return str;
    case 'VALUE_TRANSLATION_DICT': {
      if (param1) {
        const dicts = availableDicts && availableDicts.length > 0
          ? availableDicts
          : DEFAULT_VALUE_TRANSLATION_DICTIONARIES;
        const dict = dicts.find(d => d.id === param1);
        if (dict) {
          const match = dict.mappings.find(
            m => m.sourceValue.trim().toLowerCase() === str.trim().toLowerCase()
          );
          return match ? match.targetValue : str;
        }
      }
      return str;
    }
    case 'REGEX_EXTRACT':
      if (param1) {
        try {
          const re = new RegExp(param1);
          const match = str.match(re);
          return match ? (match[1] !== undefined ? match[1] : match[0]) : '';
        } catch {
          return str;
        }
      }
      return str;
    default:
      return str;
  }
}

/**
 * Extracts raw headers and data rows from raw parsed lines based on preamble slicing config.
 */
export function extractBaseDatasetFromLines(
  lines: string[][],
  targetMode: 'ROW_INDEX' | 'HEADERLESS_MANUAL',
  rowIndex: number,
  manualNames: Record<string, string> = {}
): { headers: string[]; rows: Record<string, any>[] } {
  if (!lines || lines.length === 0) return { headers: [], rows: [] };

  if (targetMode === 'HEADERLESS_MANUAL') {
    const colCount = lines[0]?.length || 0;
    const genHeaders = Array.from({ length: colCount }, (_, i) => {
      const key = `Col_${i + 1}`;
      return manualNames[key] || `Col_${i + 1}`;
    });

    const rows: Record<string, any>[] = lines.map(line => {
      const r: Record<string, any> = {};
      genHeaders.forEach((h, idx) => {
        r[h] = line[idx] !== undefined ? line[idx] : '';
      });
      return r;
    });

    return { headers: genHeaders, rows };
  }

  // ROW_INDEX mode
  const zeroBasedHeaderIndex = Math.max(0, rowIndex - 1);
  if (zeroBasedHeaderIndex >= lines.length) {
    return { headers: [], rows: [] };
  }

  const extractedHeaders = lines[zeroBasedHeaderIndex].map(
    (h, idx) => (h && h.trim()) || `Column_${idx + 1}`
  );

  const dataLines = lines.slice(zeroBasedHeaderIndex + 1);
  const rows: Record<string, any>[] = dataLines
    .filter(line => line.some(cell => cell && String(cell).trim() !== ''))
    .map(line => {
      const r: Record<string, any> = {};
      extractedHeaders.forEach((h, idx) => {
        r[h] = line[idx] !== undefined ? line[idx] : '';
      });
      return r;
    });

  return { headers: extractedHeaders, rows };
}

/**
 * Replays all cleaning rules, column exclusions, splits, merges, and transformations on a dataset.
 */
export function replayOperationsOnDataset(
  baseRows: Record<string, any>[],
  baseHeaders: string[],
  operations: {
    deletedColumns?: string[];
    splitOperations?: SplitOperation[];
    mergeOperations?: MergeOperation[];
    transformOperations?: TransformOperation[];
    cleaningActions?: string[];
    cleaningPolicies?: {
      trimWhitespace?: boolean;
      normalizeDatesToIso?: boolean;
      maskCardPan?: boolean;
      emptyRowsAction?: 'DROP' | 'FILL_NA' | 'ERROR_BLOCK';
      duplicateRowsAction?: 'DROP_EXACT' | 'KEEP_FIRST' | 'FLAG_FOR_REVIEW' | 'ERROR_BLOCK';
      fillBlanksWithNa?: boolean;
    };
  },
  availableDicts?: ValueTranslationDictionary[]
): {
  rows: Record<string, any>[];
  headers: string[];
} {
  if (!baseRows || baseRows.length === 0) {
    return { rows: [], headers: [...baseHeaders] };
  }

  let currentRows: Record<string, any>[] = baseRows.map(r => ({ ...r }));
  let currentHeaders = [...baseHeaders];

  // 1. Column exclusions / deletions
  const delCols = operations.deletedColumns || [];
  if (delCols.length > 0) {
    const delSet = new Set(delCols);
    currentRows = currentRows.map(r => {
      const out = { ...r };
      delSet.forEach(c => { delete out[c]; });
      return out;
    });
    currentHeaders = currentHeaders.filter(h => !delSet.has(h));
  }

  // 2. Replay Splits
  const splitOps = operations.splitOperations || [];
  for (const splitOp of splitOps) {
    if (!splitOp.column || !splitOp.partNames?.length) continue;
    let delim = ' ';
    if (splitOp.delimiterType === 'COMMA') delim = ',';
    else if (splitOp.delimiterType === 'HYPHEN') delim = '-';
    else if (splitOp.delimiterType === 'SLASH') delim = '/';
    else if (splitOp.delimiterType === 'UNDERSCORE') delim = '_';
    else if (splitOp.delimiterType === 'PIPE') delim = '|';
    else if (splitOp.delimiterType === 'SEMICOLON') delim = ';';
    else if (splitOp.delimiterType === 'CUSTOM') delim = splitOp.customDelimiter || ' ';

    const validPartNames = splitOp.partNames.map((n, i) => n.trim() || `${splitOp.column}_part${i + 1}`);

    currentRows = currentRows.map(row => {
      const out = { ...row };
      const rawVal = String(out[splitOp.column] ?? '');
      const parts = (splitOp.delimiterType === 'SPACE' || delim === ' ')
        ? (rawVal.trim().length > 0 ? rawVal.trim().split(/\s+/) : [])
        : rawVal.split(delim);
      validPartNames.forEach((name, idx) => {
        out[name] = parts[idx] !== undefined ? parts[idx].trim() : '';
      });
      if (!splitOp.keepOriginal) {
        delete out[splitOp.column];
      }
      return out;
    });

    const colIdx = currentHeaders.indexOf(splitOp.column);
    if (colIdx >= 0) {
      if (splitOp.keepOriginal) {
        currentHeaders = [
          ...currentHeaders.slice(0, colIdx + 1),
          ...validPartNames,
          ...currentHeaders.slice(colIdx + 1)
        ];
      } else {
        currentHeaders = [
          ...currentHeaders.slice(0, colIdx),
          ...validPartNames,
          ...currentHeaders.slice(colIdx + 1)
        ];
      }
    } else {
      currentHeaders = [...currentHeaders, ...validPartNames];
    }
    currentHeaders = Array.from(new Set(currentHeaders));
  }

  // 3. Replay Merges
  const mergeOps = operations.mergeOperations || [];
  for (const mergeOp of mergeOps) {
    if (!mergeOp.col1 || !mergeOp.col2 || !mergeOp.resultColumnName) continue;
    let sep = ' ';
    if (mergeOp.separatorType === 'HYPHEN') sep = '-';
    else if (mergeOp.separatorType === 'UNDERSCORE') sep = '_';
    else if (mergeOp.separatorType === 'SLASH') sep = '/';
    else if (mergeOp.separatorType === 'COMMA') sep = ', ';
    else if (mergeOp.separatorType === 'NONE') sep = '';
    else if (mergeOp.separatorType === 'CUSTOM') sep = mergeOp.customSeparator || '';

    currentRows = currentRows.map(row => {
      const out = { ...row };
      const v1 = row[mergeOp.col1] !== undefined && row[mergeOp.col1] !== null ? String(row[mergeOp.col1]).trim() : '';
      const v2 = row[mergeOp.col2] !== undefined && row[mergeOp.col2] !== null ? String(row[mergeOp.col2]).trim() : '';
      out[mergeOp.resultColumnName] = (v1 && v2) ? `${v1}${sep}${v2}` : (v1 || v2 || '');
      if (!mergeOp.keepSources) {
        delete out[mergeOp.col1];
        delete out[mergeOp.col2];
      }
      return out;
    });

    if (!currentHeaders.includes(mergeOp.resultColumnName)) {
      currentHeaders.push(mergeOp.resultColumnName);
    }
    if (!mergeOp.keepSources) {
      currentHeaders = currentHeaders.filter(h => h !== mergeOp.col1 && h !== mergeOp.col2);
    }
  }

  // 4. Replay Column Transformations
  const transOps = operations.transformOperations || [];
  for (const transOp of transOps) {
    if (!transOp.column || !transOp.ruleType) continue;
    currentRows = currentRows.map(row => {
      const out = { ...row };
      out[transOp.column] = applyDataTransformationRule(
        out[transOp.column],
        transOp.ruleType,
        transOp.param1,
        transOp.param2,
        availableDicts
      );
      return out;
    });
  }

  // 5. Replay Cleaning Actions & Policies
  const actions = operations.cleaningActions || [];
  const policies = operations.cleaningPolicies || {};

  const shouldTrim = actions.includes('TRIM_WHITESPACE') || policies.trimWhitespace;
  const shouldNormDates = actions.includes('NORMALIZE_DATES') || policies.normalizeDatesToIso;
  const shouldMaskPan = actions.includes('MASK_PAN') || policies.maskCardPan;
  const shouldDropEmpty = actions.includes('REMOVE_EMPTY_ROWS') || policies.emptyRowsAction === 'DROP';
  const shouldDedup = actions.includes('DEDUPLICATE') || policies.duplicateRowsAction === 'DROP_EXACT';
  const shouldFillNa = actions.includes('FILL_BLANKS_NA') || policies.emptyRowsAction === 'FILL_NA' || policies.fillBlanksWithNa;

  if (shouldTrim) {
    currentRows = currentRows.map(row => {
      const out: Record<string, any> = {};
      Object.keys(row).forEach(k => {
        out[k] = typeof row[k] === 'string' ? row[k].trim() : row[k];
      });
      return out;
    });
  }

  if (shouldNormDates) {
    currentRows = currentRows.map(row => {
      const out = { ...row };
      Object.keys(out).forEach(k => {
        const val = String(out[k] || '').trim();
        if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(val)) {
          const parts = val.split(/[\/\-]/);
          if (parts.length === 3) {
            const yr = parts[2];
            const p0 = parts[0].padStart(2, '0');
            const p1 = parts[1].padStart(2, '0');
            out[k] = `${yr}-${p0}-${p1}`;
          }
        }
      });
      return out;
    });
  }

  if (shouldMaskPan) {
    currentRows = currentRows.map(row => {
      const out: Record<string, any> = {};
      Object.keys(row).forEach(k => {
        const val = String(row[k] || '').replace(/[\s-]/g, '');
        if (/^\d{13,19}$/.test(val)) {
          out[k] = `${val.slice(0, 6)}${'*'.repeat(val.length - 10)}${val.slice(-4)}`;
        } else {
          out[k] = row[k];
        }
      });
      return out;
    });
  }

  if (shouldDropEmpty) {
    currentRows = currentRows.filter(r =>
      Object.values(r).some(v => v !== null && v !== undefined && String(v).trim() !== '' && String(v) !== '-')
    );
  }

  if (shouldDedup) {
    const seen = new Set<string>();
    currentRows = currentRows.filter(r => {
      const k = JSON.stringify(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  if (shouldFillNa) {
    currentRows = currentRows.map(row => {
      const out = { ...row };
      Object.keys(out).forEach(k => {
        if (out[k] === null || out[k] === undefined || String(out[k]).trim() === '') {
          out[k] = 'N/A';
        }
      });
      return out;
    });
  }

  return {
    rows: currentRows,
    headers: currentHeaders
  };
}

export const StandardFileIngestionWorkspace = forwardRef<
  StandardFileIngestionWorkspaceRef,
  StandardFileIngestionWorkspaceProps
>(function StandardFileIngestionWorkspace(
  { currentUser, selectedHashtag, onDatasetReady, onValidationChange, className = '' },
  ref
) {
  // File state
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileType, setFileType] = useState<'csv' | 'xlsx' | 'xls' | 'xml'>('csv');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Raw file content buffers
  const [rawFileLines, setRawFileLines] = useState<string[][]>([]);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, any>[]>([]);

  // Preamble & header positioning
  const [headerMode, setHeaderMode] = useState<'ROW_INDEX' | 'HEADERLESS_MANUAL'>('ROW_INDEX');
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(1);
  const [manualHeaders, setManualHeaders] = useState<Record<string, string>>({});

  // Column management & mapping
  const [deletedColumns, setDeletedColumns] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});
  const [requiredColumns, setRequiredColumns] = useState<string[]>([]);

  // Data hygiene policies
  const [emptyRowsAction, setEmptyRowsAction] = useState<'DROP' | 'FILL_NA' | 'ERROR_BLOCK'>('DROP');
  const [duplicateRowsAction, setDuplicateRowsAction] = useState<'DROP_EXACT' | 'KEEP_FIRST' | 'FLAG_FOR_REVIEW' | 'ERROR_BLOCK'>('DROP_EXACT');

  // Active operational recipe state (Domain 7: auto-cleaners, rule holders, data transformers)
  const [appliedSplitOps, setAppliedSplitOps] = useState<SplitOperation[]>([]);
  const [appliedMergeOps, setAppliedMergeOps] = useState<MergeOperation[]>([]);
  const [appliedTransformOps, setAppliedTransformOps] = useState<TransformOperation[]>([]);
  const [appliedCleaningActions, setAppliedCleaningActions] = useState<string[]>([]);
  const [showOperationsDrawer, setShowOperationsDrawer] = useState<boolean>(false);

  // History & undo
  const [undoSnapshot, setUndoSnapshot] = useState<{
    rows: Record<string, any>[];
    deletedCols: string[];
    mappings: Record<string, string>;
    splitOps?: SplitOperation[];
    mergeOps?: MergeOperation[];
    transformOps?: TransformOperation[];
    cleaningActions?: string[];
  } | null>(null);
  const [cleaningStatusMessage, setCleaningStatusMessage] = useState<string | null>(null);

  // Database persistent templates
  const [templates, setTemplates] = useState<FileIngestionMappingTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [appliedTemplate, setAppliedTemplate] = useState<FileIngestionMappingTemplate | null>(null);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState<boolean>(false);
  const [saveTemplateName, setSaveTemplateName] = useState<string>('');
  const [saveTemplateDesc, setSaveTemplateDesc] = useState<string>('');
  const [isSavingTemplate, setIsSavingTemplate] = useState<boolean>(false);

  // Column dropdown actions menu
  const [activeColMenu, setActiveColMenu] = useState<string | null>(null);

  // Column Splitting Modal State
  const [showSplitModal, setShowSplitModal] = useState<boolean>(false);
  const [splitCol, setSplitCol] = useState<string>('');
  const [splitDelimiterType, setSplitDelimiterType] = useState<string>('SPACE');
  const [splitCustomDelim, setSplitCustomDelim] = useState<string>('');
  const [splitPartCount, setSplitPartCount] = useState<number>(2);
  const [splitPartNames, setSplitPartNames] = useState<string[]>(['Part_1', 'Part_2']);
  const [splitKeepOriginal, setSplitKeepOriginal] = useState<boolean>(false);

  // Column Merging Modal State
  const [showMergeModal, setShowMergeModal] = useState<boolean>(false);
  const [mergeCol1, setMergeCol1] = useState<string>('');
  const [mergeCol2, setMergeCol2] = useState<string>('');
  const [mergeSeparatorType, setMergeSeparatorType] = useState<string>('SPACE');
  const [mergeCustomSep, setMergeCustomSep] = useState<string>('');
  const [mergeResultName, setMergeResultName] = useState<string>('');
  const [mergeKeepSources, setMergeKeepSources] = useState<boolean>(true);

  // Column Selection State for Merge Columns
  const [selectedFileCols, setSelectedFileCols] = useState<string[]>([]);

  // Column Transformation Dictionary Modal State (PostgreSQL Persisted - Domain 7 / Rule 23)
  const [showTransformModal, setShowTransformModal] = useState<boolean>(false);
  const [transformCol, setTransformCol] = useState<string>('');
  const [transformRuleType, setTransformRuleType] = useState<string>('UPPERCASE');
  const [transformParam1, setTransformParam1] = useState<string>('');
  const [transformParam2, setTransformParam2] = useState<string>('');
  const [availableValueDicts, setAvailableValueDicts] = useState<ValueTranslationDictionary[]>(DEFAULT_VALUE_TRANSLATION_DICTIONARIES);

  // External DB Sample Data Comparator Modal State
  const [showDbComparatorModal, setShowDbComparatorModal] = useState<boolean>(false);
  const [comparatorTargetCol, setComparatorTargetCol] = useState<string>('');
  const [connectedDbs, setConnectedDbs] = useState<any[]>([]);
  const [comparatorDbId, setComparatorDbId] = useState<string>('');
  const [comparatorTables, setComparatorTables] = useState<string[]>([]);
  const [comparatorTableName, setComparatorTableName] = useState<string>('');
  const [comparatorLoading, setComparatorLoading] = useState<boolean>(false);
  const [comparatorCols, setComparatorCols] = useState<string[]>([]);
  const [comparatorRows, setComparatorRows] = useState<any[]>([]);
  const [comparatorError, setComparatorError] = useState<string | null>(null);

  // Validation feedback
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [showValidationBanner, setShowValidationBanner] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Target standard DB columns from Global Standard Column Dictionary
  const globalStandardFields = useMemo(() => {
    try {
      return globalMappingService.getStandardFields();
    } catch {
      return [];
    }
  }, []);

  // Fetch templates from database
  const fetchTemplates = async () => {
    try {
      const teamId = currentUser?.permanentTeamId || currentUser?.teamId;
      const res = await api.getFileMappingTemplates(teamId);
      if (Array.isArray(res)) {
        setTemplates(res);
      }
    } catch (e) {
      console.warn('[StandardFileIngestionWorkspace] Failed to fetch templates from DB:', e);
    }
  };

  useEffect(() => {
    fetchTemplates();
    api.getValueTranslationDictionaries()
      .then(res => {
        if (Array.isArray(res) && res.length > 0) {
          setAvailableValueDicts(res);
        }
      })
      .catch(err => {
        console.warn('[StandardFileIngestionWorkspace] PostgreSQL value translation dictionaries hydration warning:', err);
      });
  }, [currentUser?.permanentTeamId, currentUser?.teamId]);

  // Synchronize with selected hashtag (e.g. if hashtag has linked template or minimumRequiredColumns)
  useEffect(() => {
    if (selectedHashtag?.mappingTemplateId) {
      handleSelectTemplate(selectedHashtag.mappingTemplateId);
    } else if (selectedHashtag?.minimumRequiredColumns && selectedHashtag.minimumRequiredColumns.length > 0) {
      setRequiredColumns(prev => {
        const combined = new Set([...prev, ...(selectedHashtag.minimumRequiredColumns || [])]);
        return Array.from(combined);
      });
    }
  }, [selectedHashtag?.tag, selectedHashtag?.mappingTemplateId]);

  // Active (non-deleted) headers
  const activeHeaders = useMemo(() => {
    return rawHeaders.filter(h => !deletedColumns.includes(h));
  }, [rawHeaders, deletedColumns]);

  // Record undo point
  const recordUndoPoint = () => {
    setUndoSnapshot({
      rows: JSON.parse(JSON.stringify(parsedRows)),
      deletedCols: [...deletedColumns],
      mappings: { ...columnMappings },
      splitOps: [...appliedSplitOps],
      mergeOps: [...appliedMergeOps],
      transformOps: [...appliedTransformOps],
      cleaningActions: [...appliedCleaningActions]
    });
  };

  const handleUndo = () => {
    if (!undoSnapshot) return;
    setParsedRows(undoSnapshot.rows);
    setDeletedColumns(undoSnapshot.deletedCols);
    setColumnMappings(undoSnapshot.mappings);
    if (undoSnapshot.splitOps) setAppliedSplitOps(undoSnapshot.splitOps);
    if (undoSnapshot.mergeOps) setAppliedMergeOps(undoSnapshot.mergeOps);
    if (undoSnapshot.transformOps) setAppliedTransformOps(undoSnapshot.transformOps);
    if (undoSnapshot.cleaningActions) setAppliedCleaningActions(undoSnapshot.cleaningActions);
    setUndoSnapshot(null);
    setCleaningStatusMessage('Reverted to previous state');
    setTimeout(() => setCleaningStatusMessage(null), 3500);
  };

  // Compile recipe
  const compileRecipe = (): FileIngestionRecipe => ({
    headerMode,
    headerRowIndex,
    manualHeaders,
    deletedColumns,
    columnMappings,
    requiredColumns,
    cleaningPolicies: {
      emptyRowsAction,
      duplicateRowsAction,
      trimWhitespace: true,
      normalizeDatesToIso: true,
      maskCardPan: false,
      fillBlanksWithNa: false
    },
    splitOperations: appliedSplitOps,
    mergeOperations: appliedMergeOps,
    transformOperations: appliedTransformOps,
    cleaningActions: appliedCleaningActions,
    sourceType: fileType
  });

  // Re-parse dataset when preamble header row or mode changes
  const applyHeaderPreambleSlicing = (
    lines: string[][],
    targetMode: 'ROW_INDEX' | 'HEADERLESS_MANUAL',
    rowIndex: number,
    manualNames: Record<string, string> = {}
  ) => {
    if (!lines || lines.length === 0) return;

    if (targetMode === 'HEADERLESS_MANUAL') {
      const colCount = lines[0]?.length || 0;
      const genHeaders = Array.from({ length: colCount }, (_, i) => {
        const key = `Col_${i + 1}`;
        return manualNames[key] || `Col_${i + 1}`;
      });

      const rows: Record<string, any>[] = lines.map(line => {
        const r: Record<string, any> = {};
        genHeaders.forEach((h, idx) => {
          r[h] = line[idx] !== undefined ? line[idx] : '';
        });
        return r;
      });

      setRawHeaders(genHeaders);
      setParsedRows(rows);
      return;
    }

    // ROW_INDEX mode
    const zeroBasedHeaderIndex = Math.max(0, rowIndex - 1);
    if (zeroBasedHeaderIndex >= lines.length) {
      setParseError(`Header row index (${rowIndex}) exceeds file line count (${lines.length}).`);
      return;
    }

    const extractedHeaders = lines[zeroBasedHeaderIndex].map(
      (h, idx) => (h && h.trim()) || `Column_${idx + 1}`
    );

    const dataLines = lines.slice(zeroBasedHeaderIndex + 1);
    const rows: Record<string, any>[] = dataLines
      .filter(line => line.some(cell => cell && String(cell).trim() !== ''))
      .map(line => {
        const r: Record<string, any> = {};
        extractedHeaders.forEach((h, idx) => {
          r[h] = line[idx] !== undefined ? line[idx] : '';
        });
        return r;
      });

    setRawHeaders(extractedHeaders);
    setParsedRows(rows);

    // Auto-map if no mappings exist
    if (Object.keys(columnMappings).length === 0) {
      try {
        const auto = globalMappingService.autoGenerateColumnMapping(extractedHeaders);
        setColumnMappings(auto);
      } catch {
        const m: Record<string, string> = {};
        extractedHeaders.forEach(h => { m[h] = h.toLowerCase(); });
        setColumnMappings(m);
      }
    }

    // Auto-replay active template recipe operations if active
    const recipe = appliedTemplate?.cleaningRecipe || {};
    const effectiveSplits = appliedSplitOps.length > 0 ? appliedSplitOps : (appliedTemplate?.splitOperations || recipe.splitOperations || []);
    const effectiveMerges = appliedMergeOps.length > 0 ? appliedMergeOps : (appliedTemplate?.mergeOperations || recipe.mergeOperations || []);
    const effectiveTransforms = appliedTransformOps.length > 0 ? appliedTransformOps : (appliedTemplate?.transformOperations || recipe.transformOperations || []);
    const effectiveCleanActs = appliedCleaningActions.length > 0 ? appliedCleaningActions : (appliedTemplate?.cleaningActions || recipe.cleaningActions || []);
    const effectiveDelCols = deletedColumns.length > 0 ? deletedColumns : (appliedTemplate?.deletedColumns || []);

    if (effectiveSplits.length > 0 || effectiveMerges.length > 0 || effectiveTransforms.length > 0 || effectiveCleanActs.length > 0 || effectiveDelCols.length > 0) {
      const replayed = replayOperationsOnDataset(
        rows,
        extractedHeaders,
        {
          deletedColumns: effectiveDelCols,
          splitOperations: effectiveSplits,
          mergeOperations: effectiveMerges,
          transformOperations: effectiveTransforms,
          cleaningActions: effectiveCleanActs,
          cleaningPolicies: {
            trimWhitespace: recipe.trimWhitespace,
            normalizeDatesToIso: recipe.normalizeDatesToIso,
            maskCardPan: recipe.maskCardPan,
            emptyRowsAction: recipe.emptyRowsAction,
            duplicateRowsAction: recipe.duplicateRowsAction,
            fillBlanksWithNa: recipe.fillBlanksWithNa
          }
        },
        availableValueDicts
      );
      setRawHeaders(replayed.headers);
      setParsedRows(replayed.rows);
    }
  };

  // Parse CSV
  const parseCsvText = (text: string) => {
    const rawLines = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    if (rawLines.length === 0) throw new Error('CSV file is empty.');

    const delimiter = rawLines[0].includes('\t') ? '\t' : rawLines[0].includes(';') ? ';' : ',';

    const parsedLines: string[][] = rawLines.map(line => {
      const parts: string[] = [];
      let current = '';
      let insideQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"' || c === "'") {
          insideQuotes = !insideQuotes;
        } else if (c === delimiter && !insideQuotes) {
          parts.push(current.trim().replace(/^["']|["']$/g, ''));
          current = '';
        } else {
          current += c;
        }
      }
      parts.push(current.trim().replace(/^["']|["']$/g, ''));
      return parts;
    });

    setRawFileLines(parsedLines);
    applyHeaderPreambleSlicing(parsedLines, headerMode, headerRowIndex, manualHeaders);
  };

  // Parse Excel
  const parseExcelBuffer = (buffer: ArrayBuffer) => {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('Excel workbook contains no sheets.');
    const sheet = workbook.Sheets[sheetName];

    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    if (rawRows.length === 0) throw new Error('Excel sheet is empty.');

    const stringLines: string[][] = rawRows
      .filter(r => Array.isArray(r) && r.some(c => c !== null && c !== undefined && String(c).trim() !== ''))
      .map(r => r.map(c => (c !== null && c !== undefined ? String(c).trim() : '')));

    setRawFileLines(stringLines);
    applyHeaderPreambleSlicing(stringLines, headerMode, headerRowIndex, manualHeaders);
  };

  // Parse XML
  const parseXmlText = (text: string) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    const parseErrorElem = doc.getElementsByTagName('parsererror')[0];
    if (parseErrorElem) throw new Error(`XML Parse Error: ${parseErrorElem.textContent}`);

    let recordNodes = doc.querySelectorAll('transaction, record, item, row, entry, Tx, Ntry');
    if (recordNodes.length === 0) {
      const root = doc.documentElement;
      if (root && root.children.length > 0) {
        recordNodes = Array.from(root.children) as unknown as NodeListOf<Element>;
      }
    }

    if (recordNodes.length === 0) throw new Error('Could not identify repeating record elements in XML document.');

    const headerSet = new Set<string>();
    const records: Record<string, any>[] = [];

    recordNodes.forEach(node => {
      const rec: Record<string, any> = {};
      Array.from(node.attributes).forEach(attr => {
        headerSet.add(attr.name);
        rec[attr.name] = attr.value;
      });
      Array.from(node.children).forEach(child => {
        const tagName = child.tagName;
        headerSet.add(tagName);
        rec[tagName] = child.textContent?.trim() || '';
      });
      records.push(rec);
    });

    const headers = Array.from(headerSet);
    const lines: string[][] = [headers];
    records.forEach(r => {
      lines.push(headers.map(h => (r[h] !== undefined ? String(r[h]) : '')));
    });

    setRawFileLines(lines);
    setRawHeaders(headers);
    setParsedRows(records);

    if (Object.keys(columnMappings).length === 0) {
      try {
        const auto = globalMappingService.autoGenerateColumnMapping(headers);
        setColumnMappings(auto);
      } catch {
        const m: Record<string, string> = {};
        headers.forEach(h => { m[h] = h.toLowerCase(); });
        setColumnMappings(m);
      }
    }
  };

  // Upload handler
  const processUploadedFile = async (uploadedFile: File) => {
    setIsParsing(true);
    setParseError(null);
    setValidationErrors([]);
    setShowValidationBanner(false);
    setFile(uploadedFile);
    setFileName(uploadedFile.name);

    const nameLower = uploadedFile.name.toLowerCase();
    let detectedType: 'csv' | 'xlsx' | 'xls' | 'xml' = 'csv';
    if (nameLower.endsWith('.xlsx')) detectedType = 'xlsx';
    else if (nameLower.endsWith('.xls')) detectedType = 'xls';
    else if (nameLower.endsWith('.xml')) detectedType = 'xml';
    setFileType(detectedType);

    try {
      if (detectedType === 'xlsx' || detectedType === 'xls') {
        const buffer = await uploadedFile.arrayBuffer();
        parseExcelBuffer(buffer);
      } else if (detectedType === 'xml') {
        const text = await uploadedFile.text();
        parseXmlText(text);
      } else {
        const text = await uploadedFile.text();
        parseCsvText(text);
      }
    } catch (err: any) {
      console.error('File parsing failed:', err);
      setParseError(err.message || 'Failed to parse file');
    } finally {
      setIsParsing(false);
    }
  };

  // Reset file
  const handleRemoveFile = () => {
    setFile(null);
    setFileName('');
    setRawHeaders([]);
    setParsedRows([]);
    setRawFileLines([]);
    setDeletedColumns([]);
    setSelectedFileCols([]);
    setColumnMappings({});
    setValidationErrors([]);
    setShowValidationBanner(false);
    setParseError(null);
    setAppliedSplitOps([]);
    setAppliedMergeOps([]);
    setAppliedTransformOps([]);
    setAppliedCleaningActions([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Auto-map headers
  const handleAutoMap = () => {
    if (activeHeaders.length === 0) return;
    try {
      const auto = globalMappingService.autoGenerateColumnMapping(activeHeaders);
      setColumnMappings(prev => ({ ...prev, ...auto }));
      setCleaningStatusMessage(`Auto-mapped ${Object.keys(auto).length} columns against canonical schema`);
      setTimeout(() => setCleaningStatusMessage(null), 3000);
    } catch (err: any) {
      console.warn('Auto-map failed:', err);
    }
  };

  // Apply a template
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) {
      setAppliedTemplate(null);
      setAppliedSplitOps([]);
      setAppliedMergeOps([]);
      setAppliedTransformOps([]);
      setAppliedCleaningActions([]);
      if (rawFileLines.length > 0) {
        applyHeaderPreambleSlicing(rawFileLines, headerMode, headerRowIndex, manualHeaders);
      }
      return;
    }

    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;

    setAppliedTemplate(tpl);

    // Hydrate operations and recipe
    const recipe = tpl.cleaningRecipe || {};
    const splitOps: SplitOperation[] = tpl.splitOperations || recipe.splitOperations || [];
    const mergeOps: MergeOperation[] = tpl.mergeOperations || recipe.mergeOperations || [];
    const transformOps: TransformOperation[] = tpl.transformOperations || recipe.transformOperations || [];
    const cleanActs: string[] = tpl.cleaningActions || recipe.cleaningActions || [];
    const delCols: string[] = tpl.deletedColumns || [];

    setAppliedSplitOps(splitOps);
    setAppliedMergeOps(mergeOps);
    setAppliedTransformOps(transformOps);
    setAppliedCleaningActions(cleanActs);
    setDeletedColumns(delCols);

    if (tpl.columnMappings) {
      setColumnMappings(prev => ({ ...prev, ...tpl.columnMappings }));
    }
    if (tpl.requiredColumns) {
      setRequiredColumns(tpl.requiredColumns);
    }

    const targetMode = tpl.headerMode || 'ROW_INDEX';
    const targetRowIdx = tpl.headerRowIndex || 1;
    const targetManualHeaders = tpl.manualHeaders || {};
    setHeaderMode(targetMode);
    setHeaderRowIndex(targetRowIdx);
    setManualHeaders(targetManualHeaders);

    // Replay entire recipe pipeline over raw lines if file is attached
    if (rawFileLines.length > 0) {
      const base = extractBaseDatasetFromLines(rawFileLines, targetMode, targetRowIdx, targetManualHeaders);
      const replayed = replayOperationsOnDataset(
        base.rows,
        base.headers,
        {
          deletedColumns: delCols,
          splitOperations: splitOps,
          mergeOperations: mergeOps,
          transformOperations: transformOps,
          cleaningActions: cleanActs,
          cleaningPolicies: {
            trimWhitespace: recipe.trimWhitespace,
            normalizeDatesToIso: recipe.normalizeDatesToIso,
            maskCardPan: recipe.maskCardPan,
            emptyRowsAction: recipe.emptyRowsAction,
            duplicateRowsAction: recipe.duplicateRowsAction,
            fillBlanksWithNa: recipe.fillBlanksWithNa
          }
        },
        availableValueDicts
      );

      setRawHeaders(replayed.headers);
      setParsedRows(replayed.rows);
    }

    const opCount = splitOps.length + mergeOps.length + transformOps.length + cleanActs.length;
    setCleaningStatusMessage(
      `Applied template "${tpl.name}": Replayed ${opCount} transformations (${splitOps.length} splits, ${mergeOps.length} merges, ${transformOps.length} transforms, ${cleanActs.length} cleaning rules)`
    );
    setTimeout(() => setCleaningStatusMessage(null), 4000);
  };

  // Save template modal submit
  const handleSaveCurrentMapping = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!saveTemplateName.trim()) return;

    setIsSavingTemplate(true);
    try {
      const teamId = currentUser?.permanentTeamId || currentUser?.teamId;
      const fullCleaningRecipe: FileIngestionCleaningRecipe = {
        emptyRowsAction,
        duplicateRowsAction,
        trimWhitespace: true,
        normalizeDatesToIso: true,
        maskCardPan: false,
        fillBlanksWithNa: false,
        splitOperations: appliedSplitOps,
        mergeOperations: appliedMergeOps,
        transformOperations: appliedTransformOps,
        cleaningActions: appliedCleaningActions
      };

      const payload: Partial<FileIngestionMappingTemplate> = {
        name: saveTemplateName.trim(),
        description: saveTemplateDesc.trim() || undefined,
        sourceType: fileType,
        headerMode,
        headerRowIndex,
        manualHeaders,
        deletedColumns,
        requiredColumns,
        columnMappings,
        cleaningRecipe: fullCleaningRecipe,
        splitOperations: appliedSplitOps,
        mergeOperations: appliedMergeOps,
        transformOperations: appliedTransformOps,
        cleaningActions: appliedCleaningActions,
        createdBy: currentUser?.username || 'operator',
        teamId
      };

      const saved = await api.saveFileMappingTemplate(payload);
      setTemplates(prev => {
        const filtered = prev.filter(t => t.id !== saved.id);
        return [saved, ...filtered];
      });
      setSelectedTemplateId(saved.id);
      setAppliedTemplate(saved);
      setShowSaveTemplateModal(false);
      setSaveTemplateName('');
      setSaveTemplateDesc('');
      setCleaningStatusMessage(
        `Template "${saved.name}" saved to PostgreSQL with ${appliedSplitOps.length} splits, ${appliedMergeOps.length} merges, ${appliedTransformOps.length} transforms, and ${appliedCleaningActions.length} cleaning rules!`
      );
      setTimeout(() => setCleaningStatusMessage(null), 4000);
    } catch (err: any) {
      alert(`Failed to save template: ${err.message || 'Server error'}`);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  // Close column dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = () => {
      if (activeColMenu) {
        setActiveColMenu(null);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [activeColMenu]);

  // Split Column Handlers
  const handleOpenSplitModal = (col: string) => {
    setSplitCol(col);
    const sampleVal = parsedRows.find(r => r[col] && String(r[col]).trim() !== '')?.[col] || '';
    const sampleStr = String(sampleVal);
    let detectedDelim = 'SPACE';
    let parts = 2;
    if (sampleStr.includes(',')) {
      detectedDelim = 'COMMA';
      parts = Math.min(Math.max(sampleStr.split(',').length, 2), 5);
    } else if (sampleStr.includes('-')) {
      detectedDelim = 'HYPHEN';
      parts = Math.min(Math.max(sampleStr.split('-').length, 2), 5);
    } else if (sampleStr.includes('/')) {
      detectedDelim = 'SLASH';
      parts = Math.min(Math.max(sampleStr.split('/').length, 2), 5);
    } else if (sampleStr.includes('_')) {
      detectedDelim = 'UNDERSCORE';
      parts = Math.min(Math.max(sampleStr.split('_').length, 2), 5);
    } else {
      parts = Math.min(Math.max(sampleStr.split(/\s+/).length, 2), 5);
    }

    setSplitDelimiterType(detectedDelim);
    setSplitCustomDelim('');
    setSplitPartCount(parts);
    setSplitPartNames(Array.from({ length: parts }, (_, i) => `${col}_part${i + 1}`));
    setSplitKeepOriginal(false);
    setShowSplitModal(true);
    setActiveColMenu(null);
  };

  const handleApplySplit = () => {
    if (!splitCol || splitPartNames.length === 0) return;
    recordUndoPoint();

    let delim = ' ';
    if (splitDelimiterType === 'COMMA') delim = ',';
    else if (splitDelimiterType === 'HYPHEN') delim = '-';
    else if (splitDelimiterType === 'SLASH') delim = '/';
    else if (splitDelimiterType === 'UNDERSCORE') delim = '_';
    else if (splitDelimiterType === 'PIPE') delim = '|';
    else if (splitDelimiterType === 'SEMICOLON') delim = ';';
    else if (splitDelimiterType === 'CUSTOM') delim = splitCustomDelim || ' ';

    const validPartNames = splitPartNames.map((n, i) => n.trim() || `${splitCol}_${i + 1}`);

    const updatedRows = parsedRows.map(row => {
      const out = { ...row };
      const rawVal = String(out[splitCol] ?? '');
      const parts = (splitDelimiterType === 'SPACE' || delim === ' ')
        ? (rawVal.trim().length > 0 ? rawVal.trim().split(/\s+/) : [])
        : rawVal.split(delim);
      validPartNames.forEach((name, idx) => {
        out[name] = parts[idx] !== undefined ? parts[idx].trim() : '';
      });
      if (!splitKeepOriginal) {
        delete out[splitCol];
      }
      return out;
    });

    const colIdx = rawHeaders.indexOf(splitCol);
    let nextHeaders: string[] = [];
    if (colIdx >= 0) {
      if (splitKeepOriginal) {
        nextHeaders = [
          ...rawHeaders.slice(0, colIdx + 1),
          ...validPartNames,
          ...rawHeaders.slice(colIdx + 1)
        ];
      } else {
        nextHeaders = [
          ...rawHeaders.slice(0, colIdx),
          ...validPartNames,
          ...rawHeaders.slice(colIdx + 1)
        ];
      }
    } else {
      nextHeaders = [...rawHeaders, ...validPartNames];
    }

    nextHeaders = Array.from(new Set(nextHeaders));
    setRawHeaders(nextHeaders);
    setParsedRows(updatedRows);

    const splitOp: SplitOperation = {
      id: `split_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      column: splitCol,
      delimiterType: splitDelimiterType as any,
      customDelimiter: splitCustomDelim,
      partNames: validPartNames,
      keepOriginal: splitKeepOriginal
    };
    setAppliedSplitOps(prev => [...prev, splitOp]);

    if (!splitKeepOriginal) {
      setDeletedColumns(prev => [...prev.filter(c => c !== splitCol), splitCol]);
    }

    setShowSplitModal(false);
    setCleaningStatusMessage(`Split column "${splitCol}" into ${validPartNames.length} columns: ${validPartNames.join(', ')}`);
    setTimeout(() => setCleaningStatusMessage(null), 3500);
  };

  // Column Selection Handlers for Merge
  const handleToggleFileColSelect = (colKey: string) => {
    setSelectedFileCols(prev =>
      prev.includes(colKey) ? prev.filter(c => c !== colKey) : [...prev, colKey]
    );
  };

  const handleToggleSelectAllFileCols = () => {
    if (selectedFileCols.length === activeHeaders.length && activeHeaders.length > 0) {
      setSelectedFileCols([]);
    } else {
      setSelectedFileCols([...activeHeaders]);
    }
  };

  // Merge Column Handlers
  const handleOpenMergeModal = (col?: string) => {
    let c1 = col || '';
    let c2 = '';
    if (col) {
      c1 = col;
      c2 = activeHeaders.find(h => h !== col) || '';
    } else if (selectedFileCols.length >= 2) {
      c1 = selectedFileCols[0];
      c2 = selectedFileCols[1];
    } else if (selectedFileCols.length === 1) {
      c1 = selectedFileCols[0];
      c2 = activeHeaders.find(h => h !== c1) || '';
    } else {
      c1 = activeHeaders[0] || '';
      c2 = activeHeaders[1] || '';
    }
    setMergeCol1(c1);
    setMergeCol2(c2);
    setMergeSeparatorType('SPACE');
    setMergeCustomSep('');
    setMergeResultName(`${c1}_${c2 || 'merged'}`);
    setMergeKeepSources(true);
    setShowMergeModal(true);
    setActiveColMenu(null);
  };

  const handleApplyMerge = () => {
    if (!mergeCol1 || !mergeCol2) return;
    const cleanResultName = mergeResultName.trim() || `${mergeCol1}_${mergeCol2}`;
    recordUndoPoint();

    let sep = ' ';
    if (mergeSeparatorType === 'HYPHEN') sep = '-';
    else if (mergeSeparatorType === 'UNDERSCORE') sep = '_';
    else if (mergeSeparatorType === 'SLASH') sep = '/';
    else if (mergeSeparatorType === 'COMMA') sep = ', ';
    else if (mergeSeparatorType === 'NONE') sep = '';
    else if (mergeSeparatorType === 'CUSTOM') sep = mergeCustomSep;

    const updatedRows = parsedRows.map(row => {
      const out = { ...row };
      const v1 = row[mergeCol1] !== undefined && row[mergeCol1] !== null ? String(row[mergeCol1]).trim() : '';
      const v2 = row[mergeCol2] !== undefined && row[mergeCol2] !== null ? String(row[mergeCol2]).trim() : '';
      out[cleanResultName] = (v1 && v2) ? `${v1}${sep}${v2}` : (v1 || v2 || '');
      if (!mergeKeepSources) {
        delete out[mergeCol1];
        delete out[mergeCol2];
      }
      return out;
    });

    let nextHeaders = [...rawHeaders];
    if (!nextHeaders.includes(cleanResultName)) {
      nextHeaders.push(cleanResultName);
    }
    setRawHeaders(nextHeaders);
    setParsedRows(updatedRows);

    const mergeOp: MergeOperation = {
      id: `merge_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      col1: mergeCol1,
      col2: mergeCol2,
      separatorType: mergeSeparatorType as any,
      customSeparator: mergeCustomSep,
      resultColumnName: cleanResultName,
      keepSources: mergeKeepSources
    };
    setAppliedMergeOps(prev => [...prev, mergeOp]);

    if (!mergeKeepSources) {
      setDeletedColumns(prev => [...prev, mergeCol1, mergeCol2]);
    }

    setShowMergeModal(false);
    setSelectedFileCols([]);
    setCleaningStatusMessage(`Merged "${mergeCol1}" & "${mergeCol2}" into column "${cleanResultName}"`);
    setTimeout(() => setCleaningStatusMessage(null), 3500);
  };

  // Column Transformation Handlers
  const handleOpenTransformModal = (col: string) => {
    setTransformCol(col);
    setTransformRuleType('UPPERCASE');
    setTransformParam1(availableValueDicts[0]?.id || 'dict-bank-codes');
    setTransformParam2('');
    setShowTransformModal(true);
    setActiveColMenu(null);
  };

  const handleApplyTransform = () => {
    if (!transformCol) return;
    recordUndoPoint();

    const updatedRows = parsedRows.map(row => {
      const out = { ...row };
      out[transformCol] = applyDataTransformationRule(
        out[transformCol],
        transformRuleType,
        transformParam1,
        transformParam2,
        availableValueDicts
      );
      return out;
    });

    setParsedRows(updatedRows);

    const transOp: TransformOperation = {
      id: `trans_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      column: transformCol,
      ruleType: transformRuleType,
      param1: transformParam1,
      param2: transformParam2
    };
    setAppliedTransformOps(prev => [...prev, transOp]);

    setShowTransformModal(false);
    setCleaningStatusMessage(`Applied "${transformRuleType}" transformation to column "${transformCol}"`);
    setTimeout(() => setCleaningStatusMessage(null), 3500);
  };

  // External DB Sample Data Comparator Handlers
  const handleOpenDbComparator = (targetCol?: string) => {
    setComparatorTargetCol(targetCol || '');
    setShowDbComparatorModal(true);
    setActiveColMenu(null);
    loadConnectedDbs();
  };

  const loadConnectedDbs = async () => {
    try {
      const dbs = await api.getDatabases();
      let teamDbs: any[] = [];
      const teamId = currentUser?.permanentTeamId || currentUser?.teamId;
      if (teamId) {
        try {
          teamDbs = await api.getTeamDatabases(teamId);
        } catch {}
      }
      const combined = [...(Array.isArray(dbs) ? dbs : []), ...(Array.isArray(teamDbs) ? teamDbs : [])];
      const unique = Array.from(new Map(combined.map(d => [d.id, d])).values());
      setConnectedDbs(unique);
      if (unique.length > 0) {
        const firstDb = unique[0];
        setComparatorDbId(firstDb.id);
        loadComparatorTables(firstDb.id);
      }
    } catch (err: any) {
      console.warn('Failed to load databases for comparator:', err);
    }
  };

  const loadComparatorTables = async (dbId: string) => {
    if (!dbId) return;
    try {
      const res = await api.getDatabaseTables(dbId);
      const tables = res.availableTables || res.allowedTables || res.tables || [];
      setComparatorTables(tables);
      if (tables.length > 0) {
        setComparatorTableName(tables[0]);
        loadComparatorSampleData(dbId, tables[0]);
      } else {
        setComparatorTableName('');
        setComparatorCols([]);
        setComparatorRows([]);
      }
    } catch (err: any) {
      console.warn('Failed to load tables for comparator:', err);
      setComparatorTables([]);
      setComparatorTableName('');
    }
  };

  const loadComparatorSampleData = async (dbId: string, tbl: string) => {
    if (!dbId || !tbl) return;
    setComparatorLoading(true);
    setComparatorError(null);
    try {
      const res = await api.getTablePreview(dbId, tbl, 5);
      setComparatorCols(res.columns || []);
      setComparatorRows(res.rows || []);
    } catch (err: any) {
      setComparatorError(err.message || 'Failed to load sample preview');
      setComparatorCols([]);
      setComparatorRows([]);
    } finally {
      setComparatorLoading(false);
    }
  };

  const handleMatchDbColumnToFile = (dbCol: string, fileCol: string) => {
    if (!dbCol || !fileCol) return;
    const matchedStd = globalStandardFields.find(
      sf => sf.key.toLowerCase() === dbCol.toLowerCase() || sf.label.toLowerCase() === dbCol.toLowerCase()
    );
    const targetKey = matchedStd ? matchedStd.key : dbCol;
    setColumnMappings(prev => ({ ...prev, [fileCol]: targetKey }));
    setCleaningStatusMessage(`Mapped file column "${fileCol}" → external DB column "${dbCol}"`);
    setTimeout(() => setCleaningStatusMessage(null), 3000);
  };

  // Cleaning Tools
  const handleDeduplicate = () => {
    if (parsedRows.length === 0) return;
    recordUndoPoint();
    const initial = parsedRows.length;
    const seen = new Set<string>();
    const unique = parsedRows.filter(r => {
      const k = JSON.stringify(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    setParsedRows(unique);
    setAppliedCleaningActions(prev => prev.includes('DEDUPLICATE') ? prev : [...prev, 'DEDUPLICATE']);
    const removed = initial - unique.length;
    setCleaningStatusMessage(`Deduplication: Removed ${removed} duplicate rows (${unique.length} unique remaining)`);
    setTimeout(() => setCleaningStatusMessage(null), 3500);
  };

  const handleRemoveEmptyRows = () => {
    if (parsedRows.length === 0) return;
    recordUndoPoint();
    const initial = parsedRows.length;
    const cleaned = parsedRows.filter(r =>
      Object.values(r).some(v => v !== null && v !== undefined && String(v).trim() !== '' && String(v) !== '-')
    );
    setParsedRows(cleaned);
    setAppliedCleaningActions(prev => prev.includes('REMOVE_EMPTY_ROWS') ? prev : [...prev, 'REMOVE_EMPTY_ROWS']);
    const removed = initial - cleaned.length;
    setCleaningStatusMessage(`Cleaned: Removed ${removed} empty rows (${cleaned.length} rows remaining)`);
    setTimeout(() => setCleaningStatusMessage(null), 3500);
  };

  const handleNormalizeDates = () => {
    if (parsedRows.length === 0) return;
    recordUndoPoint();
    let converted = 0;
    const updated = parsedRows.map(row => {
      const out = { ...row };
      Object.keys(out).forEach(k => {
        const val = String(out[k] || '').trim();
        // DD/MM/YYYY or MM/DD/YYYY
        if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(val)) {
          const parts = val.split(/[\/\-]/);
          if (parts.length === 3) {
            const yr = parts[2];
            const p0 = parts[0].padStart(2, '0');
            const p1 = parts[1].padStart(2, '0');
            out[k] = `${yr}-${p0}-${p1}`;
            converted++;
          }
        }
      });
      return out;
    });
    setParsedRows(updated);
    setAppliedCleaningActions(prev => prev.includes('NORMALIZE_DATES') ? prev : [...prev, 'NORMALIZE_DATES']);
    setCleaningStatusMessage(`Normalized ${converted} dates to standard ISO (YYYY-MM-DD)`);
    setTimeout(() => setCleaningStatusMessage(null), 3500);
  };

  const handleTrimWhitespace = () => {
    if (parsedRows.length === 0) return;
    recordUndoPoint();
    const updated = parsedRows.map(row => {
      const out: Record<string, any> = {};
      Object.keys(row).forEach(k => {
        out[k] = typeof row[k] === 'string' ? row[k].trim() : row[k];
      });
      return out;
    });
    setParsedRows(updated);
    setAppliedCleaningActions(prev => prev.includes('TRIM_WHITESPACE') ? prev : [...prev, 'TRIM_WHITESPACE']);
    setCleaningStatusMessage(`Trimmed leading and trailing whitespace across all rows`);
    setTimeout(() => setCleaningStatusMessage(null), 3500);
  };

  const handleMaskPan = () => {
    if (parsedRows.length === 0) return;
    recordUndoPoint();
    let count = 0;
    const updated = parsedRows.map(row => {
      const out: Record<string, any> = {};
      Object.keys(row).forEach(k => {
        const val = String(row[k] || '').replace(/[\s-]/g, '');
        if (/^\d{13,19}$/.test(val)) {
          out[k] = `${val.slice(0, 6)}${'*'.repeat(val.length - 10)}${val.slice(-4)}`;
          count++;
        } else {
          out[k] = row[k];
        }
      });
      return out;
    });
    setParsedRows(updated);
    setAppliedCleaningActions(prev => prev.includes('MASK_PAN') ? prev : [...prev, 'MASK_PAN']);
    setCleaningStatusMessage(`Masked ${count} card PAN values with PCI-compliant format`);
    setTimeout(() => setCleaningStatusMessage(null), 3500);
  };

  // Toggle required column
  const handleToggleRequiredCol = (colKey: string) => {
    setRequiredColumns(prev =>
      prev.includes(colKey) ? prev.filter(c => c !== colKey) : [...prev, colKey]
    );
  };

  // Delete/Exclude column
  const handleDeleteColumn = (colKey: string) => {
    recordUndoPoint();
    setDeletedColumns(prev => [...prev, colKey]);
    setCleaningStatusMessage(`Excluded column "${colKey}" from dataset`);
    setTimeout(() => setCleaningStatusMessage(null), 3000);
  };

  const handleRestoreColumn = (colKey: string) => {
    recordUndoPoint();
    setDeletedColumns(prev => prev.filter(c => c !== colKey));
    setCleaningStatusMessage(`Restored column "${colKey}"`);
    setTimeout(() => setCleaningStatusMessage(null), 3000);
  };

  // Imperative validate & prepare
  const validateAndPrepareDataset = async () => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!file && parsedRows.length === 0) {
      errors.push('No file dataset uploaded.');
      setValidationErrors(errors);
      setShowValidationBanner(true);
      return { isValid: false, blockingErrors: errors, warnings };
    }

    if (activeHeaders.length === 0) {
      errors.push('All columns have been excluded. At least one column must remain active.');
      setValidationErrors(errors);
      setShowValidationBanner(true);
      return { isValid: false, blockingErrors: errors, warnings };
    }

    // Check template required columns
    const effectiveMandated = new Set<string>(requiredColumns);
    if (appliedTemplate?.requiredColumns) {
      appliedTemplate.requiredColumns.forEach(c => effectiveMandated.add(c));
    }
    if (selectedHashtag?.minimumRequiredColumns) {
      selectedHashtag.minimumRequiredColumns.forEach(c => effectiveMandated.add(c));
    }

    const missingRequired: string[] = [];
    const mappedTargets = new Set<string>();
    activeHeaders.forEach(h => {
      const mapped = columnMappings[h] || h;
      mappedTargets.add(mapped.toLowerCase());
      mappedTargets.add(h.toLowerCase());
    });

    effectiveMandated.forEach(mandated => {
      const mandatedLower = mandated.toLowerCase().trim();
      if (!mappedTargets.has(mandatedLower)) {
        missingRequired.push(mandated);
      }
    });

    if (missingRequired.length > 0) {
      errors.push(
        `Missing required columns mandated by template '${appliedTemplate?.name || 'Active Mapping'}':\n- ${missingRequired.join(', ')}`
      );
    }

    const isValid = errors.length === 0;
    setValidationErrors(errors);
    setShowValidationBanner(!isValid);
    if (onValidationChange) {
      onValidationChange(isValid, errors);
    }

    if (!isValid) {
      return { isValid: false, blockingErrors: errors, warnings };
    }

    // Construct transformed rows
    const transformedRows = parsedRows.map(row => {
      const out: Record<string, any> = {};
      activeHeaders.forEach(h => {
        const mappedKey = columnMappings[h] || h;
        out[mappedKey] = row[h];
      });
      return out;
    });

    const payload: IngestionDatasetPayload = {
      fileName,
      rawHeaders,
      activeHeaders,
      parsedRows,
      transformedRows,
      columnMappings,
      recipe: compileRecipe(),
      selectedTemplateId: selectedTemplateId || null
    };

    if (onDatasetReady) {
      onDatasetReady(payload);
    }

    return {
      isValid: true,
      blockingErrors: [],
      warnings,
      datasetPayload: payload
    };
  };

  useImperativeHandle(ref, () => ({
    validateAndPrepareDataset,
    hasFileAttached: () => !!file || parsedRows.length > 0,
    isProcessing: () => isParsing,
    resetFile: handleRemoveFile
  }));

  return (
    <div className={`space-y-3 ${className}`}>
      {/* 1. FILE UPLOAD CARD / DROP ZONE (Former Style) */}
      {createFileNameCard(
        fileName,
        parsedRows.length,
        activeHeaders.length,
        fileType,
        fileInputRef,
        processUploadedFile,
        handleRemoveFile
      )}

      {/* Parse Error Notification */}
      {parseError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-rose-600 shrink-0" />
            <span>{parseError}</span>
          </div>
          <button
            type="button"
            onClick={() => setParseError(null)}
            className="text-rose-500 hover:text-rose-800"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Parsing progress indicator */}
      {isParsing && (
        <div className="text-center text-xs text-blue-600 font-semibold animate-pulse py-2">
          Parsing file contents and extracting headers...
        </div>
      )}

      {/* 2. TOOLBAR & DATA TABLE VIEW (Only when file headers exist) */}
      {rawHeaders.length > 0 && (
        <div className="space-y-3 pt-1">
          {/* Status Message / Undo Banner */}
          {cleaningStatusMessage && (
            <div className="p-2 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-xs flex items-center justify-between">
              <span>{cleaningStatusMessage}</span>
              {undoSnapshot && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="text-blue-700 hover:text-blue-900 font-bold underline flex items-center gap-1 text-[11px]"
                >
                  <Undo2 size={12} /> Undo
                </button>
              )}
            </div>
          )}

          {/* Validation Error Banner */}
          {showValidationBanner && validationErrors.length > 0 && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-rose-900">
                <AlertTriangle size={14} className="text-rose-600" />
                <span>Pre-Commit Required Column Mismatch:</span>
              </div>
              <ul className="list-disc pl-5 text-[11px] font-mono space-y-0.5">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Unified Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
            {/* Left Controls: Template Picker & Preamble Setup */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Template Picker */}
              <div className="flex items-center gap-1.5">
                <FolderOpen size={14} className="text-slate-500" />
                <select
                  value={selectedTemplateId}
                  onChange={e => handleSelectTemplate(e.target.value)}
                  className="bg-white border border-slate-200 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 font-medium shadow-2xs focus:outline-none focus:border-blue-500 max-w-[210px] truncate"
                >
                  <option value="">-- Select Saved Template --</option>
                  {templates.map(tpl => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} ({tpl.requiredColumns?.length || 0} req)
                    </option>
                  ))}
                </select>
              </div>

              {/* Preamble Line Offset */}
              <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                <span className="text-[11px] text-slate-500 font-mono">Header Row:</span>
                <input
                  type="number"
                  min={1}
                  max={25}
                  value={headerRowIndex}
                  onChange={e => {
                    const idx = Math.max(1, parseInt(e.target.value, 10) || 1);
                    setHeaderRowIndex(idx);
                    if (rawFileLines.length > 0) {
                      applyHeaderPreambleSlicing(rawFileLines, headerMode, idx, manualHeaders);
                    }
                  }}
                  className="w-12 bg-white border border-slate-200 text-slate-900 font-mono text-xs rounded px-1.5 py-1 text-center"
                  title="Line index where table header starts (skips preamble lines)"
                />
              </div>

              {/* Headerless toggle */}
              <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer pl-2 border-l border-slate-200">
                <input
                  type="checkbox"
                  checked={headerMode === 'HEADERLESS_MANUAL'}
                  onChange={e => {
                    const nextMode = e.target.checked ? 'HEADERLESS_MANUAL' : 'ROW_INDEX';
                    setHeaderMode(nextMode);
                    if (rawFileLines.length > 0) {
                      applyHeaderPreambleSlicing(rawFileLines, nextMode, headerRowIndex, manualHeaders);
                    }
                  }}
                  className="rounded text-blue-600"
                />
                <span>Headerless</span>
              </label>
            </div>

            {/* Right Controls: Auto Map, Save Template & Hygiene Tools */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handleAutoMap}
                className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg border border-blue-200 flex items-center gap-1 transition shadow-2xs cursor-pointer"
                title="Automatically match headers against canonical standard fields"
              >
                <Wand2 size={12} />
                <span>Auto Map</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSaveTemplateModal(true)}
                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-300 flex items-center gap-1 transition shadow-2xs cursor-pointer"
                title="Save current column mapping, required fields, and data cleaning/transformation recipe as a reusable template"
              >
                <BookmarkCheck size={12} />
                <span>Save Template</span>
              </button>

              {/* Recipe Rules & Operations Indicator Button */}
              <button
                type="button"
                onClick={() => setShowOperationsDrawer(prev => !prev)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition cursor-pointer ${
                  (appliedSplitOps.length + appliedMergeOps.length + appliedTransformOps.length + appliedCleaningActions.length) > 0
                    ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-300 ring-2 ring-purple-100'
                    : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                }`}
                title="View active cleaning rules, splits, merges, and transformations recorded for this template"
                id="btn-recipe-rules"
              >
                <Sparkles size={12} className={(appliedSplitOps.length + appliedMergeOps.length + appliedTransformOps.length + appliedCleaningActions.length) > 0 ? 'text-purple-600' : 'text-slate-400'} />
                <span>
                  Recipe Rules ({(appliedSplitOps.length + appliedMergeOps.length + appliedTransformOps.length + appliedCleaningActions.length)})
                </span>
                <ChevronDown size={11} className={`transition-transform duration-200 ${showOperationsDrawer ? 'rotate-180' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => handleOpenDbComparator()}
                className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold rounded-lg border border-indigo-300 flex items-center gap-1 transition shadow-2xs cursor-pointer"
                title="Inspect and compare columns against sample data from a connected database"
              >
                <Database size={12} className="text-indigo-600" />
                <span>Compare DB Sample</span>
              </button>

              <div className="h-4 w-px bg-slate-200 mx-1" />

              {/* Dynamic Merge Columns Button: Active when >= 2 columns selected */}
              <button
                type="button"
                onClick={() => handleOpenMergeModal()}
                disabled={selectedFileCols.length < 2}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition cursor-pointer ${
                  selectedFileCols.length >= 2
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700 shadow-sm ring-2 ring-indigo-200'
                    : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                }`}
                title={
                  selectedFileCols.length >= 2
                    ? `Merge ${selectedFileCols.length} selected columns (${selectedFileCols.join(', ')})`
                    : 'Select 2 or more columns to enable Merge Columns'
                }
                id="btn-merge-file-columns"
              >
                <Combine size={12} className={selectedFileCols.length >= 2 ? 'text-white' : 'text-slate-400'} />
                <span>
                  {selectedFileCols.length >= 2
                    ? `Merge Columns (${selectedFileCols.length})`
                    : 'Merge Columns'}
                </span>
              </button>

              <div className="h-4 w-px bg-slate-200 mx-1" />

              {/* Quick Cleaning Buttons */}
              <button
                type="button"
                onClick={handleDeduplicate}
                className="px-2 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-semibold rounded-lg border border-slate-200 shadow-2xs flex items-center gap-1 transition cursor-pointer"
                title="Remove exact duplicate rows"
              >
                <Scissors size={11} className="text-slate-500" />
                <span>Deduplicate</span>
              </button>

              <button
                type="button"
                onClick={handleRemoveEmptyRows}
                className="px-2 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-semibold rounded-lg border border-slate-200 shadow-2xs flex items-center gap-1 transition cursor-pointer"
                title="Remove empty or blank rows"
              >
                <Eraser size={11} className="text-slate-500" />
                <span>Empty Rows</span>
              </button>

              <button
                type="button"
                onClick={handleNormalizeDates}
                className="px-2 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-semibold rounded-lg border border-slate-200 shadow-2xs flex items-center gap-1 transition cursor-pointer"
                title="Normalize dates to ISO (YYYY-MM-DD)"
              >
                <Calendar size={11} className="text-slate-500" />
                <span>Dates</span>
              </button>

              <button
                type="button"
                onClick={handleTrimWhitespace}
                className="px-2 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-semibold rounded-lg border border-slate-200 shadow-2xs flex items-center gap-1 transition cursor-pointer"
                title="Trim leading and trailing whitespace"
              >
                <AlignLeft size={11} className="text-slate-500" />
                <span>Trim</span>
              </button>

              <button
                type="button"
                onClick={handleMaskPan}
                className="px-2 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-[11px] font-semibold rounded-lg border border-slate-200 shadow-2xs flex items-center gap-1 transition cursor-pointer"
                title="Mask 16-digit card numbers with asterisks"
              >
                <Shield size={11} className="text-slate-500" />
                <span>Mask PAN</span>
              </button>
            </div>
          </div>

          {/* Active Recipe Operations Drawer (Auto-Cleaner & Data Transformer Rules) */}
          {showOperationsDrawer && (
            <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-purple-600" />
                  <span className="font-bold text-purple-900">
                    Template Transformation & Auto-Cleaner Recipe:
                  </span>
                  <span className="text-[11px] text-purple-700">
                    {appliedSplitOps.length + appliedMergeOps.length + appliedTransformOps.length + appliedCleaningActions.length} total operations recorded
                  </span>
                </div>
                {(appliedSplitOps.length + appliedMergeOps.length + appliedTransformOps.length + appliedCleaningActions.length) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      recordUndoPoint();
                      setAppliedSplitOps([]);
                      setAppliedMergeOps([]);
                      setAppliedTransformOps([]);
                      setAppliedCleaningActions([]);
                      setDeletedColumns([]);
                      if (rawFileLines.length > 0) {
                        applyHeaderPreambleSlicing(rawFileLines, headerMode, headerRowIndex, manualHeaders);
                      }
                      setCleaningStatusMessage('Reset all recipe operations to initial raw file state');
                      setTimeout(() => setCleaningStatusMessage(null), 3000);
                    }}
                    className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold underline cursor-pointer"
                  >
                    Clear All Recipe Operations
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-1 text-[11px]">
                {/* 1. Slicing & Exclusions */}
                <div className="p-2 bg-white rounded-lg border border-purple-100 space-y-1">
                  <div className="font-bold text-slate-700 flex items-center justify-between">
                    <span>1. Preamble & Exclusions</span>
                    <span className="text-[10px] text-purple-600 font-mono">Row {headerRowIndex}</span>
                  </div>
                  <div className="text-slate-500 text-[10px]">
                    {deletedColumns.length > 0
                      ? `${deletedColumns.length} excluded (${deletedColumns.slice(0, 3).join(', ')}${deletedColumns.length > 3 ? '...' : ''})`
                      : 'No columns excluded'}
                  </div>
                </div>

                {/* 2. Column Splits */}
                <div className="p-2 bg-white rounded-lg border border-purple-100 space-y-1">
                  <div className="font-bold text-slate-700 flex items-center justify-between">
                    <span>2. Column Splits</span>
                    <span className="text-[10px] text-purple-600 font-mono">{appliedSplitOps.length}</span>
                  </div>
                  <div className="text-slate-500 text-[10px] space-y-0.5">
                    {appliedSplitOps.length > 0 ? (
                      appliedSplitOps.map((op, i) => (
                        <div key={op.id || i} className="truncate font-mono">
                          • {op.column} → [{op.partNames.join(', ')}]
                        </div>
                      ))
                    ) : (
                      <span>No splits applied</span>
                    )}
                  </div>
                </div>

                {/* 3. Column Merges */}
                <div className="p-2 bg-white rounded-lg border border-purple-100 space-y-1">
                  <div className="font-bold text-slate-700 flex items-center justify-between">
                    <span>3. Column Merges</span>
                    <span className="text-[10px] text-purple-600 font-mono">{appliedMergeOps.length}</span>
                  </div>
                  <div className="text-slate-500 text-[10px] space-y-0.5">
                    {appliedMergeOps.length > 0 ? (
                      appliedMergeOps.map((op, i) => (
                        <div key={op.id || i} className="truncate font-mono">
                          • {op.col1} + {op.col2} → {op.resultColumnName}
                        </div>
                      ))
                    ) : (
                      <span>No merges applied</span>
                    )}
                  </div>
                </div>

                {/* 4. Transformations & Cleaning */}
                <div className="p-2 bg-white rounded-lg border border-purple-100 space-y-1">
                  <div className="font-bold text-slate-700 flex items-center justify-between">
                    <span>4. Transformers & Hygiene</span>
                    <span className="text-[10px] text-purple-600 font-mono">
                      {appliedTransformOps.length + appliedCleaningActions.length}
                    </span>
                  </div>
                  <div className="text-slate-500 text-[10px] space-y-0.5">
                    {appliedTransformOps.map((op, i) => (
                      <div key={op.id || i} className="truncate font-mono">
                        • {op.column}: {op.ruleType}
                      </div>
                    ))}
                    {appliedCleaningActions.map((act, i) => (
                      <div key={i} className="text-emerald-700 font-medium">
                        ✓ {act.replace(/_/g, ' ')}
                      </div>
                    ))}
                    {appliedTransformOps.length === 0 && appliedCleaningActions.length === 0 && (
                      <span>No transforms or hygiene rules active</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Excluded Columns Banner */}
          {deletedColumns.length > 0 && (
            <div className="p-2 bg-slate-100 border border-slate-200 rounded-lg flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-slate-600 text-[11px]">Excluded Columns:</span>
              {deletedColumns.map(col => (
                <span
                  key={col}
                  className="px-2 py-0.5 bg-white border border-slate-300 rounded font-mono text-[10px] text-slate-600 flex items-center gap-1"
                >
                  <span className="line-through">{col}</span>
                  <button
                    type="button"
                    onClick={() => handleRestoreColumn(col)}
                    className="text-blue-600 hover:text-blue-800 font-bold ml-1"
                    title="Restore column"
                  >
                    +
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* 3. DATA VIEW TABLE WITH INTEGRATED HEADER MAPPING (Former Style) */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 shadow-2xs">
                  {/* ROW 1: Raw Header Name, Exclude Button & Required Toggle */}
                  <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 text-[11px]">
                    {/* Fixed Row Number Column Header with Master Checkbox */}
                    <th className="py-2.5 px-3 w-12 text-center bg-slate-200/70 border-r border-slate-200 text-[10px] text-slate-500 font-mono">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <span>#</span>
                        {activeHeaders.length > 0 && (
                          <input
                            type="checkbox"
                            checked={selectedFileCols.length === activeHeaders.length && activeHeaders.length > 0}
                            ref={el => {
                              if (el) {
                                el.indeterminate = selectedFileCols.length > 0 && selectedFileCols.length < activeHeaders.length;
                              }
                            }}
                            onChange={handleToggleSelectAllFileCols}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            title={
                              selectedFileCols.length === activeHeaders.length
                                ? 'Deselect all columns'
                                : 'Select all columns'
                            }
                          />
                        )}
                      </div>
                    </th>
                    {activeHeaders.map(colKey => {
                      const isRequired = requiredColumns.includes(colKey);
                      const isColSelected = selectedFileCols.includes(colKey);
                      return (
                        <th
                          key={colKey}
                          className={`py-2 px-2.5 min-w-[220px] border-r border-slate-200 font-sans relative transition-colors ${
                            isColSelected ? 'bg-indigo-50/70 ring-1 ring-inset ring-indigo-300' : 'bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1 relative">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isColSelected}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleToggleFileColSelect(colKey);
                                }}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                                title={`Select column ${colKey} for merge or actions`}
                              />
                              <span
                                className={`font-mono font-bold text-xs truncate max-w-[100px] ${
                                  isColSelected ? 'text-indigo-900' : 'text-slate-800'
                                }`}
                                title={colKey}
                              >
                                {colKey}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {/* Required column toggle */}
                              <label
                                className={`text-[9px] px-1.5 py-0.5 rounded font-bold cursor-pointer border flex items-center gap-0.5 ${
                                  isRequired
                                    ? 'bg-rose-50 text-rose-700 border-rose-300'
                                    : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'
                                }`}
                                title="Toggle whether this column is strictly required by the template"
                              >
                                <input
                                  type="checkbox"
                                  checked={isRequired}
                                  onChange={() => handleToggleRequiredCol(colKey)}
                                  className="hidden"
                                />
                                <span>{isRequired ? 'REQ' : 'OPT'}</span>
                              </label>

                              {/* More actions (...) button */}
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setActiveColMenu(activeColMenu === colKey ? null : colKey);
                                  }}
                                  className={`p-1 rounded transition-colors cursor-pointer ${
                                    activeColMenu === colKey
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'hover:bg-slate-200 text-slate-500'
                                  }`}
                                  title="Column actions: Split, Merge, Transform Dictionary, DB Match"
                                >
                                  <MoreHorizontal size={13} />
                                </button>

                                {/* Dropdown Menu */}
                                {activeColMenu === colKey && (
                                  <div
                                    className="absolute right-0 top-full mt-1 w-60 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 text-xs animate-in fade-in duration-100 text-left"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="px-3 py-1.5 border-b border-slate-100 font-bold text-slate-800 font-mono text-[10px] flex items-center justify-between bg-slate-50 rounded-t-xl">
                                      <span className="truncate max-w-[140px]">{colKey}</span>
                                      <span className="text-slate-400 font-sans font-normal">Column Tools</span>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => handleOpenSplitModal(colKey)}
                                      className="w-full text-left px-3 py-1.5 hover:bg-blue-50 text-slate-700 hover:text-blue-700 flex items-center gap-2 transition-colors cursor-pointer"
                                    >
                                      <Split size={13} className="text-blue-600 shrink-0" />
                                      <div className="flex flex-col">
                                        <span className="font-semibold text-xs">Split Column</span>
                                        <span className="text-[10px] text-slate-400">Split into multiple columns by delimiter</span>
                                      </div>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleOpenMergeModal(colKey)}
                                      className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 flex items-center gap-2 transition-colors cursor-pointer"
                                    >
                                      <Layers size={13} className="text-indigo-600 shrink-0" />
                                      <div className="flex flex-col">
                                        <span className="font-semibold text-xs">Merge with Column</span>
                                        <span className="text-[10px] text-slate-400">Combine with another column</span>
                                      </div>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleOpenTransformModal(colKey)}
                                      className="w-full text-left px-3 py-1.5 hover:bg-amber-50 text-slate-700 hover:text-amber-700 flex items-center gap-2 transition-colors cursor-pointer"
                                    >
                                      <Wand2 size={13} className="text-amber-600 shrink-0" />
                                      <div className="flex flex-col">
                                        <span className="font-semibold text-xs">Transformation Dictionary</span>
                                        <span className="text-[10px] text-slate-400">Case, trim, phone, date format, regex</span>
                                      </div>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleOpenDbComparator(colKey)}
                                      className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 flex items-center gap-2 transition-colors cursor-pointer"
                                    >
                                      <Database size={13} className="text-emerald-600 shrink-0" />
                                      <div className="flex flex-col">
                                        <span className="font-semibold text-xs">Compare External DB</span>
                                        <span className="text-[10px] text-slate-400">Inspect sample data from connected DB</span>
                                      </div>
                                    </button>

                                    <div className="h-px bg-slate-100 my-1" />

                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleDeleteColumn(colKey);
                                        setActiveColMenu(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-600 flex items-center gap-2 transition-colors cursor-pointer"
                                    >
                                      <Trash2 size={13} className="text-rose-500 shrink-0" />
                                      <span className="font-semibold text-xs">Exclude Column</span>
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Exclude / Delete Column */}
                              <button
                                type="button"
                                onClick={() => handleDeleteColumn(colKey)}
                                className="p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                title="Exclude this column from import"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>

                          {/* ROW 2 IN TH: Target Mapping Selector */}
                          <div className="pt-1 border-t border-slate-200/80">
                            <select
                              value={columnMappings[colKey] || ''}
                              onChange={e => {
                                const target = e.target.value;
                                setColumnMappings(prev => ({
                                  ...prev,
                                  [colKey]: target
                                }));
                              }}
                              className={`w-full text-[11px] p-1 rounded font-mono font-semibold border transition-all ${
                                columnMappings[colKey]
                                  ? 'bg-blue-50 border-blue-300 text-blue-800'
                                  : 'bg-white border-slate-200 text-slate-600'
                              }`}
                            >
                              <option value="">-- Target Standard Field --</option>
                              {globalStandardFields.map(sf => (
                                <option key={sf.key} value={sf.key}>
                                  {sf.label} ({sf.key})
                                </option>
                              ))}
                            </select>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                {/* Table Body: Real Data Preview Rows */}
                <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                  {parsedRows.slice(0, 15).map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-1.5 px-3 text-center bg-slate-50/80 border-r border-slate-200 text-slate-400 font-mono text-[10px]">
                        {rowIdx + 1}
                      </td>
                      {activeHeaders.map(colKey => {
                        const cellVal = row[colKey];
                        const isBlank =
                          cellVal === undefined ||
                          cellVal === null ||
                          String(cellVal).trim() === '';
                        return (
                          <td
                            key={colKey}
                            className="py-1.5 px-2.5 border-r border-slate-100 truncate max-w-[220px]"
                            title={String(cellVal ?? '')}
                          >
                            {!isBlank ? (
                              <span>{String(cellVal)}</span>
                            ) : (
                              <span className="text-slate-300 italic">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Table Footer info */}
            <div className="p-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>
                Showing first {Math.min(parsedRows.length, 15)} of {parsedRows.length} rows
              </span>
              <span>
                {activeHeaders.length} active columns • {requiredColumns.length} required fields marked
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 4. SAVE MAPPING TEMPLATE MODAL POPUP (Former Style) */}
      {showSaveTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <BookmarkCheck size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Save Schema Mapping Template</h3>
                  <p className="text-[11px] text-slate-500">
                    Saves column mappings and mandated required fields to PostgreSQL
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSaveTemplateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Template Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={saveTemplateName}
                  onChange={e => setSaveTemplateName(e.target.value)}
                  placeholder="e.g. Visa Settlement Clearing Template"
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  value={saveTemplateDesc}
                  onChange={e => setSaveTemplateDesc(e.target.value)}
                  placeholder="Briefly describe what feed or processor this template is for..."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>

              {/* Mapped Columns Summary */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700 uppercase tracking-wider">
                    Columns to Save ({activeHeaders.length} active)
                  </span>
                  <span className="text-[10px] text-emerald-700 font-bold font-mono">
                    {requiredColumns.length} Mandated Required
                  </span>
                </div>

                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-2.5 bg-slate-50/70 space-y-1.5 text-xs">
                  {activeHeaders.map(col => {
                    const mapped = columnMappings[col];
                    const isReq = requiredColumns.includes(col);
                    return (
                      <div
                        key={col}
                        className="flex items-center justify-between py-1 px-2 bg-white border border-slate-200/80 rounded-lg text-[11px]"
                      >
                        <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                          <span className="font-mono font-bold text-slate-800 truncate">{col}</span>
                          {isReq && (
                            <span className="text-[9px] px-1 rounded bg-rose-50 text-rose-700 font-bold border border-rose-200">
                              REQ
                            </span>
                          )}
                        </div>
                        <span className="text-slate-400 text-[10px]">→</span>
                        {mapped ? (
                          <span className="font-mono text-blue-700 font-semibold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[10px]">
                            {mapped}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[10px]">as is</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Captured Auto-Cleaner & Transformation Recipe Summary */}
              <div className="p-2.5 bg-purple-50/80 border border-purple-200 rounded-xl space-y-1 text-xs">
                <div className="font-bold text-purple-900 flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1">
                    <Sparkles size={13} className="text-purple-600" />
                    <span>Captured Auto-Cleaner & Transformation Recipe</span>
                  </span>
                  <span className="text-[10px] text-purple-700 font-mono">
                    {appliedSplitOps.length + appliedMergeOps.length + appliedTransformOps.length + appliedCleaningActions.length} ops
                  </span>
                </div>
                <div className="text-[10px] text-purple-800/80 grid grid-cols-2 gap-x-2 gap-y-0.5 pt-0.5">
                  <div>• Header Row Index: <span className="font-mono font-bold">{headerRowIndex}</span> ({headerMode})</div>
                  <div>• Excluded Columns: <span className="font-mono font-bold">{deletedColumns.length}</span></div>
                  <div>• Column Splits: <span className="font-mono font-bold">{appliedSplitOps.length}</span></div>
                  <div>• Column Merges: <span className="font-mono font-bold">{appliedMergeOps.length}</span></div>
                  <div>• Value Transformations: <span className="font-mono font-bold">{appliedTransformOps.length}</span></div>
                  <div>• Hygiene Rules: <span className="font-mono font-bold">{appliedCleaningActions.length}</span></div>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSaveTemplateModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSaveCurrentMapping(e);
                  }}
                  disabled={isSavingTemplate || !saveTemplateName.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  {isSavingTemplate ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save size={13} />
                      <span>Save Template</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. SPLIT COLUMN MODAL */}
      {showSplitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-xl w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Split size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Split Column: <span className="font-mono text-blue-700 font-semibold">{splitCol}</span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Split values into multiple columns by delimiter (e.g. space, comma, dash)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSplitModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Delimiter Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Choose Split Delimiter
                </label>
                <div className="grid grid-cols-4 gap-1.5 text-xs">
                  {[
                    { id: 'SPACE', label: 'Space (" ")' },
                    { id: 'COMMA', label: 'Comma (",")' },
                    { id: 'HYPHEN', label: 'Hyphen ("-")' },
                    { id: 'SLASH', label: 'Slash ("/")' },
                    { id: 'UNDERSCORE', label: 'Underscore ("_")' },
                    { id: 'PIPE', label: 'Pipe ("|")' },
                    { id: 'SEMICOLON', label: 'Semicolon (";")' },
                    { id: 'CUSTOM', label: 'Custom' }
                  ].map(d => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSplitDelimiterType(d.id)}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer text-center ${
                        splitDelimiterType === d.id
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                {splitDelimiterType === 'CUSTOM' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={splitCustomDelim}
                      onChange={e => setSplitCustomDelim(e.target.value)}
                      placeholder="Enter custom delimiter string..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Number of Parts and Column Names */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    New Column Names ({splitPartNames.length} parts)
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={splitPartNames.length <= 2}
                      onClick={() => {
                        if (splitPartNames.length > 2) {
                          setSplitPartNames(prev => prev.slice(0, -1));
                        }
                      }}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded text-xs font-bold text-slate-600 cursor-pointer"
                    >
                      - Less
                    </button>
                    <button
                      type="button"
                      disabled={splitPartNames.length >= 6}
                      onClick={() => {
                        if (splitPartNames.length < 6) {
                          setSplitPartNames(prev => [...prev, `${splitCol}_part${prev.length + 1}`]);
                        }
                      }}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded text-xs font-bold text-slate-600 cursor-pointer"
                    >
                      + More
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {splitPartNames.map((name, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-slate-400 font-bold w-4">#{idx + 1}</span>
                      <input
                        type="text"
                        value={name}
                        onChange={e => {
                          const val = e.target.value;
                          setSplitPartNames(prev => {
                            const next = [...prev];
                            next[idx] = val;
                            return next;
                          });
                        }}
                        placeholder={`Part ${idx + 1} Column Name`}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono font-semibold"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Keep Original Column Checkbox */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="split-keep-orig"
                  checked={splitKeepOriginal}
                  onChange={e => setSplitKeepOriginal(e.target.checked)}
                  className="rounded text-blue-600 cursor-pointer"
                />
                <label htmlFor="split-keep-orig" className="text-xs text-slate-700 cursor-pointer">
                  Keep original column <strong>"{splitCol}"</strong> in table
                </label>
              </div>

              {/* Live Preview Table */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase font-mono">
                  Live Preview (First 4 rows):
                </span>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/70 text-[11px] font-mono">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-1 px-2 border-r border-slate-200">Original ({splitCol})</th>
                        {splitPartNames.map((n, i) => (
                          <th key={i} className="py-1 px-2 border-r border-slate-200 text-blue-700">
                            {n || `Part ${i + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedRows.slice(0, 4).map((r, rIdx) => {
                        const raw = String(r[splitCol] ?? '');
                        let delim = ' ';
                        if (splitDelimiterType === 'COMMA') delim = ',';
                        else if (splitDelimiterType === 'HYPHEN') delim = '-';
                        else if (splitDelimiterType === 'SLASH') delim = '/';
                        else if (splitDelimiterType === 'UNDERSCORE') delim = '_';
                        else if (splitDelimiterType === 'PIPE') delim = '|';
                        else if (splitDelimiterType === 'SEMICOLON') delim = ';';
                        else if (splitDelimiterType === 'CUSTOM') delim = splitCustomDelim || ' ';
                        const parts = (splitDelimiterType === 'SPACE' || delim === ' ')
                          ? (raw.trim().length > 0 ? raw.trim().split(/\s+/) : [])
                          : raw.split(delim);
                        return (
                          <tr key={rIdx}>
                            <td className="py-1 px-2 border-r border-slate-200 text-slate-500 truncate max-w-[120px]">
                              {raw || '-'}
                            </td>
                            {splitPartNames.map((_, i) => (
                              <td key={i} className="py-1 px-2 border-r border-slate-200 text-blue-900 font-semibold truncate max-w-[120px]">
                                {parts[i] !== undefined ? parts[i].trim() : '-'}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSplitModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplySplit}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  <Split size={13} />
                  <span>Apply Column Split</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. MERGE COLUMNS MODAL */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-xl w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Layers size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Merge / Combine Columns</h3>
                  <p className="text-[11px] text-slate-500">
                    Concatenate two columns with a separator to create a single composite column
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMergeModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    First Column
                  </label>
                  <select
                    value={mergeCol1}
                    onChange={e => setMergeCol1(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-mono font-semibold"
                  >
                    {activeHeaders.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Second Column to Merge
                  </label>
                  <select
                    value={mergeCol2}
                    onChange={e => setMergeCol2(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-mono font-semibold"
                  >
                    {activeHeaders.filter(h => h !== mergeCol1).map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Separator Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Separator
                </label>
                <div className="grid grid-cols-4 gap-1.5 text-xs">
                  {[
                    { id: 'SPACE', label: 'Space (" ")' },
                    { id: 'HYPHEN', label: 'Hyphen ("-")' },
                    { id: 'UNDERSCORE', label: 'Underscore ("_")' },
                    { id: 'SLASH', label: 'Slash ("/")' },
                    { id: 'COMMA', label: 'Comma (", ")' },
                    { id: 'NONE', label: 'No Separator' },
                    { id: 'CUSTOM', label: 'Custom' }
                  ].map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setMergeSeparatorType(s.id)}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer text-center ${
                        mergeSeparatorType === s.id
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {mergeSeparatorType === 'CUSTOM' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={mergeCustomSep}
                      onChange={e => setMergeCustomSep(e.target.value)}
                      placeholder="Enter custom separator..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Combined Column Name */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Merged Column Name
                </label>
                <input
                  type="text"
                  value={mergeResultName}
                  onChange={e => setMergeResultName(e.target.value)}
                  placeholder="e.g. FULL_NAME or ACCOUNT_COMPOSITE"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono font-semibold"
                />
              </div>

              {/* Keep Source Columns Checkbox */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="merge-keep-sources"
                  checked={mergeKeepSources}
                  onChange={e => setMergeKeepSources(e.target.checked)}
                  className="rounded text-indigo-600 cursor-pointer"
                />
                <label htmlFor="merge-keep-sources" className="text-xs text-slate-700 cursor-pointer">
                  Keep original source columns (<strong>{mergeCol1}</strong> and <strong>{mergeCol2}</strong>) in table
                </label>
              </div>

              {/* Live Preview Table */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase font-mono">
                  Live Preview (First 4 rows):
                </span>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/70 text-[11px] font-mono">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-1 px-2 border-r border-slate-200">{mergeCol1}</th>
                        <th className="py-1 px-2 border-r border-slate-200">{mergeCol2}</th>
                        <th className="py-1 px-2 text-indigo-700 font-bold">{mergeResultName || 'Merged'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedRows.slice(0, 4).map((r, rIdx) => {
                        const v1 = r[mergeCol1] !== undefined ? String(r[mergeCol1]) : '';
                        const v2 = r[mergeCol2] !== undefined ? String(r[mergeCol2]) : '';
                        let sep = ' ';
                        if (mergeSeparatorType === 'HYPHEN') sep = '-';
                        else if (mergeSeparatorType === 'UNDERSCORE') sep = '_';
                        else if (mergeSeparatorType === 'SLASH') sep = '/';
                        else if (mergeSeparatorType === 'COMMA') sep = ', ';
                        else if (mergeSeparatorType === 'NONE') sep = '';
                        else if (mergeSeparatorType === 'CUSTOM') sep = mergeCustomSep;
                        const merged = (v1 && v2) ? `${v1}${sep}${v2}` : (v1 || v2 || '-');
                        return (
                          <tr key={rIdx}>
                            <td className="py-1 px-2 border-r border-slate-200 text-slate-500 truncate max-w-[120px]">
                              {v1 || '-'}
                            </td>
                            <td className="py-1 px-2 border-r border-slate-200 text-slate-500 truncate max-w-[120px]">
                              {v2 || '-'}
                            </td>
                            <td className="py-1 px-2 text-indigo-900 font-semibold truncate max-w-[180px]">
                              {merged}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowMergeModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyMerge}
                  disabled={!mergeCol1 || !mergeCol2}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  <Layers size={13} />
                  <span>Apply Column Merge</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. COLUMN TRANSFORMATION DICTIONARY MODAL */}
      {showTransformModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-xl w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Wand2 size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Data Transformation: <span className="font-mono text-amber-700 font-semibold">{transformCol}</span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Apply data cleansing, case normalization, date formatting, regex or lookup rules
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTransformModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Rule Selection */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Select Transformation Operation
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'UPPERCASE', label: 'UPPERCASE', desc: 'Convert all letters to capital' },
                    { id: 'LOWERCASE', label: 'lowercase', desc: 'Convert all letters to lowercase' },
                    { id: 'TITLECASE', label: 'Title Case', desc: 'Capitalize First Letter of Words' },
                    { id: 'TRIM', label: 'Trim Spaces', desc: 'Remove leading, trailing and extra spaces' },
                    { id: 'DATE_ISO', label: 'Format ISO Date', desc: 'Convert DD/MM/YYYY to YYYY-MM-DD' },
                    { id: 'STRIP_CURRENCY', label: 'Strip Currency Symbols', desc: 'Keep only numeric digits and decimals' },
                    { id: 'MASK_MIDDLE', label: 'Mask Sensitive Data', desc: 'Mask middle characters (1234****5678)' },
                    { id: 'PHONE_ET', label: 'Ethiopian Phone (+251)', desc: 'Normalize 09/07 to +251 standard' },
                    { id: 'VALUE_REPLACE', label: 'Find & Replace', desc: 'Replace substring with new text' },
                    { id: 'REGEX_EXTRACT', label: 'Regex Extraction', desc: 'Extract pattern match or capture group' },
                    { id: 'VALUE_TRANSLATION_DICT', label: 'Value Translation Dictionary', desc: 'Translate e.g. Bank Name to Bank Code via lookup dictionary' }
                  ].map(rule => (
                    <button
                      key={rule.id}
                      type="button"
                      onClick={() => setTransformRuleType(rule.id)}
                      className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                        transformRuleType === rule.id
                          ? 'bg-amber-50 border-amber-400 text-amber-900 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-bold text-xs">{rule.label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{rule.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Extra Parameters */}
              {transformRuleType === 'VALUE_TRANSLATION_DICT' && (
                <div className="space-y-1.5 p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                  <label className="block text-[11px] font-bold text-emerald-900 uppercase font-mono">
                    Select Value Translation Dictionary
                  </label>
                  <select
                    value={transformParam1 || availableValueDicts[0]?.id || ''}
                    onChange={e => setTransformParam1(e.target.value)}
                    className="w-full bg-white border border-emerald-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    {availableValueDicts.map(dict => (
                      <option key={dict.id} value={dict.id}>
                        {dict.name} ({dict.mappings.length} mapping pairs)
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-emerald-700">
                    Translates human-readable descriptions (e.g. Bank Name "Commercial Bank of Ethiopia" or "CBE") to database codes ("01") configured in System Settings.
                  </p>
                </div>
              )}

              {transformRuleType === 'VALUE_REPLACE' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                      Text to Find
                    </label>
                    <input
                      type="text"
                      value={transformParam1}
                      onChange={e => setTransformParam1(e.target.value)}
                      placeholder="e.g. USD or pending"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                      Replace With
                    </label>
                    <input
                      type="text"
                      value={transformParam2}
                      onChange={e => setTransformParam2(e.target.value)}
                      placeholder="e.g. ETB or SETTLED"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                    />
                  </div>
                </div>
              )}

              {transformRuleType === 'REGEX_EXTRACT' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                    Regular Expression (with capture group)
                  </label>
                  <input
                    type="text"
                    value={transformParam1}
                    onChange={e => setTransformParam1(e.target.value)}
                    placeholder="e.g. ^(\d{6}) to extract first 6 digits"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono"
                  />
                </div>
              )}

              {/* Live Preview Table */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase font-mono">
                  Live Preview (First 4 rows):
                </span>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/70 text-[11px] font-mono">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-1 px-2 border-r border-slate-200">Before ({transformCol})</th>
                        <th className="py-1 px-2 text-amber-700 font-bold">After Transformation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedRows.slice(0, 4).map((r, rIdx) => {
                        const before = r[transformCol];
                        const after = applyDataTransformationRule(
                          before,
                          transformRuleType,
                          transformParam1,
                          transformParam2,
                          availableValueDicts
                        );
                        return (
                          <tr key={rIdx}>
                            <td className="py-1 px-2 border-r border-slate-200 text-slate-500 truncate max-w-[200px]">
                              {before !== undefined && before !== null && String(before) !== '' ? String(before) : '-'}
                            </td>
                            <td className="py-1 px-2 text-amber-900 font-semibold truncate max-w-[200px]">
                              {after || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTransformModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyTransform}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5"
                >
                  <Wand2 size={13} />
                  <span>Apply Transformation</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. EXTERNAL DB SAMPLE DATA COMPARATOR MODAL (Admin Settings Style) */}
      {showDbComparatorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Database size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    External Database Sample Data Comparator
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Inspect live records from connected external databases to align columns with your uploaded file
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDbComparatorModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* DB & Table Selector Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-600 uppercase font-mono">Database:</span>
                  <select
                    value={comparatorDbId}
                    onChange={e => {
                      const dbId = e.target.value;
                      setComparatorDbId(dbId);
                      loadComparatorTables(dbId);
                    }}
                    className="bg-white border border-slate-200 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 font-medium shadow-2xs"
                  >
                    {connectedDbs.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-600 uppercase font-mono">Table:</span>
                  <select
                    value={comparatorTableName}
                    onChange={e => {
                      const tbl = e.target.value;
                      setComparatorTableName(tbl);
                      loadComparatorSampleData(comparatorDbId, tbl);
                    }}
                    className="bg-white border border-slate-200 text-slate-800 text-xs rounded-lg px-2.5 py-1.5 font-medium shadow-2xs"
                  >
                    {comparatorTables.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={() => loadComparatorSampleData(comparatorDbId, comparatorTableName)}
                disabled={comparatorLoading || !comparatorTableName}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
              >
                <RefreshCw size={12} className={comparatorLoading ? 'animate-spin' : ''} />
                <span>Refresh Sample Data</span>
              </button>
            </div>

            {/* Error Banner */}
            {comparatorError && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                <span>{comparatorError}</span>
              </div>
            )}

            {/* Comparator Matrix Table */}
            {comparatorLoading ? (
              <div className="py-12 text-center space-y-2">
                <RefreshCw size={24} className="animate-spin text-blue-600 mx-auto" />
                <p className="text-xs text-slate-500 font-medium">
                  Connecting to database and fetching live sample records...
                </p>
              </div>
            ) : comparatorCols.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 font-mono">
                      {comparatorTableName}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600">
                      {comparatorCols.length} columns detected ({comparatorRows.length} sample rows)
                    </span>
                  </div>

                  {comparatorTargetCol && (
                    <span className="text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-mono font-semibold">
                      Target File Column: {comparatorTargetCol}
                    </span>
                  )}
                </div>

                {/* Live Sample Rows Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 z-10">
                        <tr>
                          <th className="py-2 px-3 w-10 text-center text-slate-400 font-mono text-[10px]">#</th>
                          {comparatorCols.map(col => (
                            <th key={col} className="py-2 px-3 border-r border-slate-200 font-mono text-slate-800 text-xs whitespace-nowrap">
                              <div className="flex items-center justify-between gap-2">
                                <span>{col}</span>
                                {comparatorTargetCol && (
                                  <button
                                    type="button"
                                    onClick={() => handleMatchDbColumnToFile(col, comparatorTargetCol)}
                                    className="px-1.5 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-[9px] font-bold cursor-pointer transition"
                                    title={`Map external DB column "${col}" to uploaded file column "${comparatorTargetCol}"`}
                                  >
                                    Match
                                  </button>
                                )}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-700">
                        {comparatorRows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-blue-50/30 transition">
                            <td className="py-1.5 px-3 text-center text-slate-400 bg-slate-50/50 border-r border-slate-200 text-[10px]">
                              {rIdx + 1}
                            </td>
                            {comparatorCols.map(col => {
                              const val = row[col];
                              return (
                                <td key={col} className="py-1.5 px-3 border-r border-slate-100 truncate max-w-[180px]">
                                  {val !== undefined && val !== null ? String(val) : <span className="text-slate-300 italic">null</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Quick Column Alignment Guide */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">
                      Quick Alignment: Match External DB Column to Uploaded File
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        let matchedCount = 0;
                        activeHeaders.forEach(fCol => {
                          const fNorm = fCol.toLowerCase().replace(/[^a-z0-9]/g, '');
                          const dbMatch = comparatorCols.find(dCol => {
                            const dNorm = dCol.toLowerCase().replace(/[^a-z0-9]/g, '');
                            return dNorm === fNorm || dNorm.includes(fNorm) || fNorm.includes(dNorm);
                          });
                          if (dbMatch) {
                            handleMatchDbColumnToFile(dbMatch, fCol);
                            matchedCount++;
                          }
                        });
                        setCleaningStatusMessage(`Auto-aligned ${matchedCount} file columns with external table "${comparatorTableName}"!`);
                        setTimeout(() => setCleaningStatusMessage(null), 3500);
                      }}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
                    >
                      <Sparkles size={12} />
                      <span>Auto-Align All Matching Names</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                    {activeHeaders.map(fileCol => {
                      const currentMapped = columnMappings[fileCol] || '';
                      return (
                        <div key={fileCol} className="p-2 bg-white border border-slate-200 rounded-lg space-y-1">
                          <div className="font-mono font-bold text-slate-800 text-[11px] truncate" title={fileCol}>
                            {fileCol}
                          </div>
                          <select
                            value={currentMapped}
                            onChange={e => {
                              const chosen = e.target.value;
                              if (chosen) handleMatchDbColumnToFile(chosen, fileCol);
                            }}
                            className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-[10px] rounded p-1 font-mono"
                          >
                            <option value="">-- Match External Col --</option>
                            {comparatorCols.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No sample data available for this table. Select another table or click "Refresh Sample Data".
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDbComparatorModal(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// Helper for Active File Card / Drag-and-Drop Zone (Former Style)
function createFileNameCard(
  fileName: string,
  rowCount: number,
  colCount: number,
  fileType: string,
  fileInputRef: React.RefObject<HTMLInputElement | null>,
  processUploadedFile: (file: File) => void,
  handleRemoveFile: () => void
) {
  if (fileName) {
    return (
      <div className="p-3.5 bg-blue-50/50 border border-blue-200/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-150">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shrink-0">
            <FileText size={18} />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-900">{fileName}</span>
              <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono font-semibold">
                {rowCount} Rows · {colCount} Cols · {fileType.toUpperCase()}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              File ready for mapping and data preview below
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
          <label className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-2xs cursor-pointer transition-all flex items-center space-x-1.5">
            <Upload size={13} className="text-slate-500" />
            <span>Change File</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv, .xlsx, .xls, .xml"
              onChange={e => {
                if (e.target.files && e.target.files[0]) {
                  processUploadedFile(e.target.files[0]);
                }
              }}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={handleRemoveFile}
            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 shadow-2xs flex items-center space-x-1.5 transition-all cursor-pointer"
            title="Remove uploaded data file"
          >
            <Trash2 size={13} className="text-rose-600" />
            <span>Remove Data</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-6 bg-slate-50/50 transition-all">
      <label className="flex flex-col items-center cursor-pointer w-full">
        <Upload size={22} className="text-blue-600 mb-1" />
        <span className="text-xs font-semibold text-slate-700">
          Choose CSV, Excel (.xlsx, .xls) or XML file
        </span>
        <span className="text-[9px] text-slate-400 mt-0.5">
          Click to browse local files or drag and drop
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv, .xlsx, .xls, .xml"
          onChange={e => {
            if (e.target.files && e.target.files[0]) {
              processUploadedFile(e.target.files[0]);
            }
          }}
          className="hidden"
        />
      </label>
    </div>
  );
}

export default StandardFileIngestionWorkspace;
