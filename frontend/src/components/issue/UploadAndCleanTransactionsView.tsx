/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, Check, ChevronDown, MoreHorizontal, 
  Sparkles, Trash2, ArrowRight, Save, Layers, Split, Combine, 
  RotateCcw, Sliders, CheckCircle2, AlertCircle, Database, BookOpen,
  Search, ArrowLeft, Undo2, X, Plus, Shield, CheckCheck, Upload, Wand2
} from 'lucide-react';
import { DataTablePagination } from '../common/DataTablePagination';
import { globalMappingService } from '../../services/globalMappingService';
import { api } from '../../api/client';
import { GlobalTransactionSchemaField, FileIngestionMappingTemplate } from '../../types';

export interface ColumnDef {
  id: string;
  name: string;
  type: 'Text' | 'Date' | 'Number';
  mapping: string;
  selected: boolean;
  unmapped?: boolean;
}

export interface RecipeStep {
  num: number;
  title: string;
  desc: string;
  type?: string;
}

export interface UploadAndCleanTransactionsViewProps {
  fileName?: string;
  sheetName?: string;
  totalRows?: number;
  rawHeaders?: string[];
  initialRows?: Record<string, any>[];
  initialMapping?: Record<string, string>;
  requiredColumns?: string[];
  onContinueToReview?: () => void;
  onBackToDetails?: () => void;
  onSaveTemplate?: (templateName: string, mapping: Record<string, string>, recipe: RecipeStep[]) => void;
  onApplyCleanedData?: (
    updatedRows: Record<string, any>[],
    updatedHeaders: string[],
    updatedMapping: Record<string, string>
  ) => void;
}

// Fallback sample rows if none provided
const DEFAULT_SAMPLE_ROWS = [
  {
    currency: 'ETB',
    tr_date: '05.04.2026',
    terminal_id: '074\\\\BISRATEGABRIEL',
    tran_place: 'SAHLI GETANEH',
    refnum_f37: 'REF-8091',
    fe_utrnno: '2633613984',
    amount: '1,500.00',
    status: 'Settled'
  },
  {
    currency: 'ETB',
    tr_date: '22.01.2026',
    terminal_id: '142\\\\BISRATEGABRIEL',
    tran_place: 'SAHLI GETANEH',
    refnum_f37: 'REF-8092',
    fe_utrnno: '2579312260',
    amount: '820.00',
    status: 'Settled'
  },
  {
    currency: 'ETB',
    tr_date: '13.04.2026',
    terminal_id: '243\\\\AMAKELECH LULU TEFERA',
    tran_place: 'ADDIS ABABA MAIN',
    refnum_f37: 'REF-8093',
    fe_utrnno: '2639706114',
    amount: '2,010.50',
    status: 'Pending'
  },
  {
    currency: 'ETB',
    tr_date: '16.01.2026',
    terminal_id: '077\\\\BISRATEGABRIEL',
    tran_place: 'SAHLI GETANEH',
    refnum_f37: 'REF-8094',
    fe_utrnno: '2574255967',
    amount: '640.00',
    status: 'Settled'
  },
  {
    currency: 'ETB',
    tr_date: '18.01.2026',
    terminal_id: '109\\\\BOLE MEDHANIALEM',
    tran_place: 'BOLE FINANCIAL CENTER',
    refnum_f37: 'REF-8095',
    fe_utrnno: '2581102941',
    amount: '95.00',
    status: 'Pending'
  }
];

function inferType(name: string, sampleVal: any): 'Text' | 'Date' | 'Number' {
  const n = name.toLowerCase();
  if (n.includes('date') || n.includes('time') || n.includes('tr_date')) return 'Date';
  if (n.includes('amt') || n.includes('amount') || n.includes('fee') || n.includes('utrnno') || n.includes('num')) {
    return 'Number';
  }
  if (sampleVal !== undefined && sampleVal !== null) {
    const s = String(sampleVal).replace(/,/g, '').trim();
    if (!isNaN(Number(s)) && s !== '') return 'Number';
    if (!isNaN(Date.parse(s)) && s.length > 5) return 'Date';
  }
  return 'Text';
}

export const UploadAndCleanTransactionsView: React.FC<UploadAndCleanTransactionsViewProps> = ({
  fileName = 'clearing_batch_feed.xlsx',
  sheetName = 'member_reconciliation_report',
  totalRows: propTotalRows,
  rawHeaders = [],
  initialRows = [],
  initialMapping = {},
  requiredColumns: propRequiredColumns = ['Terminal_ID', 'Fe_utrnno', 'Currency', 'Transaction_Date'],
  onContinueToReview,
  onBackToDetails,
  onSaveTemplate,
  onApplyCleanedData
}) => {
  // 1. Working Rows State
  const [currentFileName, setCurrentFileName] = useState<string>(fileName);
  const [rows, setRows] = useState<Record<string, any>[]>(() => {
    if (initialRows && initialRows.length > 0) return initialRows;
    return DEFAULT_SAMPLE_ROWS;
  });

  // 2. Working Columns State
  const [columns, setColumns] = useState<ColumnDef[]>(() => {
    const effectiveHeaders = (rawHeaders && rawHeaders.length > 0)
      ? rawHeaders
      : (initialRows && initialRows.length > 0 ? Object.keys(initialRows[0]) : ['currency', 'tr_date', 'terminal_id', 'tran_place', 'refnum_f37', 'fe_utrnno']);

    return effectiveHeaders.map(h => {
      const sampleVal = (initialRows && initialRows[0]) ? initialRows[0][h] : undefined;
      const mapping = initialMapping[h] || h;
      return {
        id: h,
        name: h,
        type: inferType(h, sampleVal),
        mapping: mapping,
        selected: false,
        unmapped: mapping === 'Unmapped' || !mapping
      };
    });
  });

  // Column Mappings State
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>(() => {
    return { ...initialMapping };
  });

  // Re-sync if initialRows or rawHeaders change dynamically
  useEffect(() => {
    if (initialRows && initialRows.length > 0) {
      setRows(initialRows);
    }
  }, [initialRows]);

  useEffect(() => {
    if (rawHeaders && rawHeaders.length > 0) {
      setColumns(rawHeaders.map(h => {
        const sampleVal = (initialRows && initialRows[0]) ? initialRows[0][h] : undefined;
        const mapping = initialMapping[h] || h;
        return {
          id: h,
          name: h,
          type: inferType(h, sampleVal),
          mapping: mapping,
          selected: false,
          unmapped: mapping === 'Unmapped' || !mapping
        };
      }));
    }
  }, [rawHeaders]);

  useEffect(() => {
    if (fileName) {
      setCurrentFileName(fileName);
    }
  }, [fileName]);

  // Global Standard Directory Fields
  const [standardFields, setStandardFields] = useState<GlobalTransactionSchemaField[]>([]);
  useEffect(() => {
    const cached = globalMappingService.getStandardFields();
    if (cached && cached.length > 0) {
      setStandardFields(cached);
    } else {
      api.getGlobalStandardDirectory().then(f => {
        if (Array.isArray(f)) {
          setStandardFields(f);
          globalMappingService.updateStandardFields(f);
        }
      }).catch(err => {
        console.warn('Could not fetch global standard directory:', err);
      });
    }
  }, []);

  // Templates
  const [templates, setTemplates] = useState<FileIngestionMappingTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('Standard Settlement Template');
  useEffect(() => {
    api.getFileMappingTemplates().then(res => {
      if (Array.isArray(res)) setTemplates(res);
    }).catch(err => {
      console.warn('Could not fetch templates:', err);
    });
  }, []);

  // Recipe steps dynamic tracking
  const [recipeSteps, setRecipeSteps] = useState<RecipeStep[]>([
    { num: 1, title: 'Inspect header structure', desc: 'Auto-detected column schema' },
    { num: 2, title: 'Map target fields', desc: 'Aligned with Global Standard Directory' }
  ]);

  // Undo / History Stack
  const [history, setHistory] = useState<Array<{
    rows: Record<string, any>[];
    columns: ColumnDef[];
    columnMappings: Record<string, string>;
    recipeSteps: RecipeStep[];
    fileName: string;
  }>>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const recordSnapshot = () => {
    setHistory(prev => [
      ...prev.slice(-15),
      {
        rows: JSON.parse(JSON.stringify(rows)),
        columns: JSON.parse(JSON.stringify(columns)),
        columnMappings: { ...columnMappings },
        recipeSteps: [...recipeSteps],
        fileName: currentFileName
      }
    ]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setRows(previous.rows);
    setColumns(previous.columns);
    setColumnMappings(previous.columnMappings);
    setRecipeSteps(previous.recipeSteps);
    if (previous.fileName) setCurrentFileName(previous.fileName);
    setFeedbackMessage('Reverted last data cleaning modification.');
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  // Grid Controls
  const [activeMenuColumn, setActiveMenuColumn] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(7);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Split Modal State
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitTargetCol, setSplitTargetCol] = useState('');
  const [splitDelimiter, setSplitDelimiter] = useState('\\\\');
  const [splitCol1Name, setSplitCol1Name] = useState('Terminal_Code');
  const [splitCol2Name, setSplitCol2Name] = useState('Terminal_Location');

  // Save Template Modal State
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [templateSaveName, setTemplateSaveName] = useState(selectedTemplate || 'Custom Feed Template');

  const selectedCount = columns.filter(c => c.selected).length;

  const toggleColumnSelect = (colId: string) => {
    setColumns(cols => cols.map(c => c.id === colId ? { ...c, selected: !c.selected } : c));
  };

  const handleSelectAllColumns = () => {
    const allSelected = columns.every(c => c.selected);
    setColumns(cols => cols.map(c => ({ ...c, selected: !allSelected })));
  };

  // -------------------------------------------------------------
  // Template Selection with Live Auto-Mapping
  // -------------------------------------------------------------
  const handleSelectTemplate = (templateName: string) => {
    setSelectedTemplate(templateName);
    const tpl = templates.find(t => t.name === templateName);
    if (tpl && tpl.columnMappings) {
      recordSnapshot();
      setColumnMappings(prev => ({ ...prev, ...tpl.columnMappings }));
      setColumns(cols => cols.map(c => {
        const mapped = tpl.columnMappings[c.name] || tpl.columnMappings[c.id] || c.mapping;
        return {
          ...c,
          mapping: mapped || 'Unmapped',
          unmapped: !mapped || mapped === 'Unmapped'
        };
      }));
      setRecipeSteps(prev => [
        ...prev,
        {
          num: prev.length + 1,
          title: `Applied template "${templateName}"`,
          desc: `Loaded predefined column mappings`
        }
      ]);
      setFeedbackMessage(`Applied mapping template "${templateName}".`);
      setTimeout(() => setFeedbackMessage(null), 3500);
    }
  };

  // -------------------------------------------------------------
  // 1-Click Auto-Map All Columns
  // -------------------------------------------------------------
  const handleAutoMapAll = () => {
    recordSnapshot();
    const headers = columns.map(c => c.name);
    const autoMap = globalMappingService.autoGenerateColumnMapping(headers);

    let mappedCount = 0;
    const updatedCols = columns.map(c => {
      const targetField = autoMap[c.name] || autoMap[c.id];
      if (targetField && targetField !== 'Unmapped') {
        mappedCount++;
        return {
          ...c,
          mapping: targetField,
          unmapped: false
        };
      }
      return c;
    });

    setColumns(updatedCols);
    setColumnMappings(prev => ({ ...prev, ...autoMap }));
    setRecipeSteps(prev => [
      ...prev,
      {
        num: prev.length + 1,
        title: 'Auto-map standard columns',
        desc: `Matched ${mappedCount} fields to Global Standard Directory`
      }
    ]);
    setFeedbackMessage(`Auto-mapped ${mappedCount} columns to standard fields.`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // -------------------------------------------------------------
  // Import / Switch Spreadsheet File
  // -------------------------------------------------------------
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    recordSnapshot();
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheet];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (json.length > 0) {
          const rawH = (json[0] || []).map(h => String(h || '').trim()).filter(Boolean);
          const parsed = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];
          const autoMap = globalMappingService.autoGenerateColumnMapping(rawH);

          const newCols: ColumnDef[] = rawH.map(h => {
            const sampleVal = parsed[0] ? parsed[0][h] : undefined;
            const mapped = autoMap[h] || 'Unmapped';
            return {
              id: h,
              name: h,
              type: inferType(h, sampleVal),
              mapping: mapped,
              selected: false,
              unmapped: mapped === 'Unmapped'
            };
          });

          setCurrentFileName(file.name);
          setRows(parsed);
          setColumns(newCols);
          setColumnMappings(autoMap);
          setCurrentPage(1);
          setRecipeSteps(prev => [
            ...prev,
            {
              num: prev.length + 1,
              title: `Loaded "${file.name}"`,
              desc: `Parsed ${parsed.length} rows and ${rawH.length} columns from ${sheet}`
            }
          ]);
          setFeedbackMessage(`Successfully loaded "${file.name}" with ${parsed.length} rows.`);
          setTimeout(() => setFeedbackMessage(null), 3500);
        }
      } catch (err) {
        console.error('Failed to parse file:', err);
        alert('Failed to parse file. Please upload a valid CSV or Excel file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // -------------------------------------------------------------
  // Clean Operation 1: Deduplicate Rows
  // -------------------------------------------------------------
  const handleDeduplicate = () => {
    recordSnapshot();
    const seen = new Set<string>();
    const uniqueRows: Record<string, any>[] = [];
    let dupsCount = 0;

    rows.forEach(r => {
      const fp = columns.map(c => String(r[c.id] ?? '')).join('|');
      if (seen.has(fp)) {
        dupsCount++;
      } else {
        seen.add(fp);
        uniqueRows.push(r);
      }
    });

    setRows(uniqueRows);
    setRecipeSteps(prev => [
      ...prev,
      {
        num: prev.length + 1,
        title: 'Deduplicate rows',
        desc: dupsCount > 0 ? `Removed ${dupsCount} exact duplicate records` : 'Checked for duplicates (0 found)'
      }
    ]);
    setFeedbackMessage(dupsCount > 0 ? `Deduplicated dataset: ${dupsCount} duplicate rows removed.` : 'No duplicate rows found.');
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // -------------------------------------------------------------
  // Clean Operation 2: Remove Empty Rows
  // -------------------------------------------------------------
  const handleRemoveEmptyRows = () => {
    recordSnapshot();
    let removedCount = 0;
    const nonEmpty = rows.filter(r => {
      const hasContent = columns.some(c => {
        const val = r[c.id];
        return val !== undefined && val !== null && String(val).trim() !== '';
      });
      if (!hasContent) removedCount++;
      return hasContent;
    });

    setRows(nonEmpty);
    setRecipeSteps(prev => [
      ...prev,
      {
        num: prev.length + 1,
        title: 'Remove empty rows',
        desc: removedCount > 0 ? `Removed ${removedCount} blank rows` : 'Verified dataset has no empty rows'
      }
    ]);
    setFeedbackMessage(removedCount > 0 ? `Removed ${removedCount} empty rows from dataset.` : 'No empty rows found.');
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // -------------------------------------------------------------
  // Clean Operation 3: Trim Whitespace
  // -------------------------------------------------------------
  const handleTrimWhitespace = () => {
    recordSnapshot();
    let cellsTrimmed = 0;
    const updated = rows.map(r => {
      const copy = { ...r };
      columns.forEach(c => {
        if (typeof copy[c.id] === 'string') {
          const trimmed = copy[c.id].trim();
          if (trimmed !== copy[c.id]) cellsTrimmed++;
          copy[c.id] = trimmed;
        }
      });
      return copy;
    });

    setRows(updated);
    setRecipeSteps(prev => [
      ...prev,
      {
        num: prev.length + 1,
        title: 'Trim whitespace',
        desc: `Sanitized leading and trailing whitespace (${cellsTrimmed} cells)`
      }
    ]);
    setFeedbackMessage(`Trimmed whitespace across dataset (${cellsTrimmed} values adjusted).`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // -------------------------------------------------------------
  // Clean Operation 4: Merge Selected Columns
  // -------------------------------------------------------------
  const handleMergeSelectedColumns = () => {
    const selectedCols = columns.filter(c => c.selected);
    if (selectedCols.length < 2) return;

    recordSnapshot();
    const newColId = selectedCols.map(c => c.id).join('_');
    const newColName = selectedCols.map(c => c.name).join(' + ');

    const updatedRows = rows.map(r => {
      const copy = { ...r };
      const mergedVal = selectedCols
        .map(c => String(r[c.id] ?? '').trim())
        .filter(Boolean)
        .join(' ');
      copy[newColId] = mergedVal;
      return copy;
    });

    const newColDef: ColumnDef = {
      id: newColId,
      name: newColName,
      type: 'Text',
      mapping: 'Unmapped',
      selected: false,
      unmapped: true
    };

    setRows(updatedRows);
    setColumns(prev => [...prev, newColDef]);
    setRecipeSteps(prev => [
      ...prev,
      {
        num: prev.length + 1,
        title: `Merge columns`,
        desc: `Merged ${selectedCols.map(c => c.name).join(', ')} into "${newColName}"`
      }
    ]);
    setFeedbackMessage(`Merged ${selectedCols.length} columns into new column "${newColName}".`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // -------------------------------------------------------------
  // Clean Operation 5: Split Column
  // -------------------------------------------------------------
  const executeSplitColumn = () => {
    if (!splitTargetCol) return;
    recordSnapshot();

    const col1 = splitCol1Name.trim() || `${splitTargetCol}_part1`;
    const col2 = splitCol2Name.trim() || `${splitTargetCol}_part2`;

    const updatedRows = rows.map(r => {
      const copy = { ...r };
      const originalVal = String(r[splitTargetCol] ?? '');
      const parts = originalVal.split(splitDelimiter);
      copy[col1] = parts[0]?.trim() || '';
      copy[col2] = parts.slice(1).join(splitDelimiter).trim() || '';
      return copy;
    });

    const targetIdx = columns.findIndex(c => c.id === splitTargetCol);
    const newCols: ColumnDef[] = [
      { id: col1, name: col1, type: 'Text', mapping: 'Unmapped', selected: false, unmapped: true },
      { id: col2, name: col2, type: 'Text', mapping: 'Unmapped', selected: false, unmapped: true }
    ];

    const updatedColumns = [...columns];
    updatedColumns.splice(targetIdx + 1, 0, ...newCols);

    setRows(updatedRows);
    setColumns(updatedColumns);
    setRecipeSteps(prev => [
      ...prev,
      {
        num: prev.length + 1,
        title: `Split column "${splitTargetCol}"`,
        desc: `Separated by "${splitDelimiter}" into "${col1}" and "${col2}"`
      }
    ]);
    setSplitModalOpen(false);
    setFeedbackMessage(`Split "${splitTargetCol}" into "${col1}" and "${col2}".`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // -------------------------------------------------------------
  // Clean Operation 6: Exclude Column
  // -------------------------------------------------------------
  const handleExcludeColumn = (colId: string) => {
    recordSnapshot();
    const updated = columns.filter(c => c.id !== colId);
    setColumns(updated);
    setRecipeSteps(prev => [
      ...prev,
      {
        num: prev.length + 1,
        title: `Exclude column "${colId}"`,
        desc: `Removed from active mapping dataset`
      }
    ]);
    setActiveMenuColumn(null);
    setFeedbackMessage(`Excluded column "${colId}".`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // -------------------------------------------------------------
  // Clean Operation 7: Transform Column
  // -------------------------------------------------------------
  const handleTransformColumn = (colId: string, rule: 'UPPERCASE' | 'LOWERCASE' | 'NUMBER_CLEAN' | 'MASK_PAN') => {
    recordSnapshot();
    let transformed = 0;
    const updated = rows.map(r => {
      const copy = { ...r };
      const val = copy[colId];
      if (val !== undefined && val !== null) {
        let str = String(val);
        if (rule === 'UPPERCASE') {
          copy[colId] = str.toUpperCase();
        } else if (rule === 'LOWERCASE') {
          copy[colId] = str.toLowerCase();
        } else if (rule === 'NUMBER_CLEAN') {
          const num = parseFloat(str.replace(/[^0-9.-]/g, ''));
          copy[colId] = isNaN(num) ? '0.00' : num.toFixed(2);
        } else if (rule === 'MASK_PAN') {
          const digits = str.replace(/\D/g, '');
          if (digits.length >= 12) {
            copy[colId] = `${digits.slice(0, 4)}********${digits.slice(-4)}`;
          }
        }
        transformed++;
      }
      return copy;
    });

    setRows(updated);
    setRecipeSteps(prev => [
      ...prev,
      {
        num: prev.length + 1,
        title: `Transform "${colId}" (${rule})`,
        desc: `Applied ${rule.toLowerCase().replace('_', ' ')} across ${transformed} values`
      }
    ]);
    setActiveMenuColumn(null);
    setFeedbackMessage(`Transformed "${colId}" using ${rule}.`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // -------------------------------------------------------------
  // Save Template Action
  // -------------------------------------------------------------
  const handleSaveTemplateSubmit = () => {
    const mappingPayload: Record<string, string> = {};
    columns.forEach(c => {
      if (c.mapping && c.mapping !== 'Unmapped') {
        mappingPayload[c.id] = c.mapping;
      }
    });

    if (onSaveTemplate) {
      onSaveTemplate(templateSaveName, mappingPayload, recipeSteps);
    }

    setRecipeSteps(prev => [
      ...prev,
      {
        num: prev.length + 1,
        title: `Save template "${templateSaveName}"`,
        desc: `Saved ${Object.keys(mappingPayload).length} mappings to PostgreSQL`
      }
    ]);
    setSaveModalOpen(false);
    setFeedbackMessage(`Template "${templateSaveName}" saved successfully.`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // -------------------------------------------------------------
  // Apply & Exit to Task Creator
  // -------------------------------------------------------------
  const handleApplyAndContinue = () => {
    const finalMapping: Record<string, string> = {};
    columns.forEach(c => {
      finalMapping[c.id] = c.mapping || c.id;
    });

    if (onApplyCleanedData) {
      onApplyCleanedData(rows, columns.map(c => c.name), finalMapping, recipeSteps);
    } else if (onContinueToReview) {
      onContinueToReview();
    } else if (onBackToDetails) {
      onBackToDetails();
    }
  };

  // Filtered and Paginated rows for the Case-Page styled table
  const filteredRows = useMemo(() => {
    if (!tableSearch.trim()) return rows;
    const q = tableSearch.toLowerCase();
    return rows.filter(r =>
      columns.some(c => String(r[c.id] ?? '').toLowerCase().includes(q))
    );
  }, [rows, columns, tableSearch]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Dynamic Required Columns Checklist
  const requiredColumnsList = useMemo(() => {
    return propRequiredColumns.map(reqCol => {
      const match = columns.find(
        c => c.name.toLowerCase() === reqCol.toLowerCase() ||
             c.id.toLowerCase() === reqCol.toLowerCase() ||
             (c.mapping && c.mapping.toLowerCase() === reqCol.toLowerCase())
      );
      return {
        name: reqCol,
        status: match ? 'Ready' : 'Missing',
        mappedTo: match?.mapping
      };
    });
  }, [propRequiredColumns, columns]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F8FAFC] text-slate-800 font-sans overflow-hidden">
      {/* 1. Top Header with Case Stepper & Primary Actions */}
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0 shadow-2xs z-20">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToDetails}
            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-200 transition-colors cursor-pointer"
            title="Back to Task Details"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="text-[11px] text-slate-500 font-medium">Intake / New Task / Clean in Grid View</div>
            <h1 className="text-base font-bold font-heading text-slate-900 tracking-tight flex items-center gap-2">
              <Sparkles size={16} className="text-[#F27421]" />
              <span>Clean in Grid View: {currentFileName}</span>
            </h1>
          </div>
        </div>

        {/* 3-Step Wizard Stepper */}
        <div className="flex items-center space-x-6 text-xs font-sans">
          <button 
            type="button" 
            onClick={onBackToDetails}
            className="flex items-center space-x-2 text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            <span className="w-5 h-5 rounded-full border border-slate-300 flex items-center justify-center font-bold text-[11px]">1</span>
            <span className="font-medium">Details</span>
          </button>

          <div className="flex items-center space-x-2 text-[#F27421] font-bold">
            <span className="w-5 h-5 rounded-full bg-[#F27421] text-white flex items-center justify-center font-bold text-[11px]">2</span>
            <span>Upload &amp; Clean</span>
          </div>

          <button 
            type="button" 
            onClick={handleApplyAndContinue}
            className="flex items-center space-x-2 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <span className="w-5 h-5 rounded-full border border-slate-200 flex items-center justify-center font-bold text-[11px]">3</span>
            <span className="font-medium">Review &amp; Apply</span>
          </button>

          <button
            type="button"
            onClick={handleApplyAndContinue}
            className="px-4 py-2 bg-[#F27421] hover:bg-[#e06516] active:bg-[#c95712] text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer ml-2"
          >
            <span>Continue to Review</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {/* Undo Feedback Banner */}
      {feedbackMessage && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-2 text-xs text-blue-800 font-medium flex items-center justify-between shrink-0 animate-in fade-in duration-100">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-blue-600" />
            <span>{feedbackMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-blue-500 hover:text-blue-800"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* 2. Main Workspace: Left Grid Area + Right Recipe Sidebar */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left Grid Area */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white border-r border-slate-200">
          {/* Action Toolbar with Live Operations */}
          <div className="px-6 py-2.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2.5 shrink-0">
            {/* Left Controls: Upload file, Template Picker, Auto-map, Search, Undo */}
            <div className="flex items-center space-x-2 flex-wrap gap-2">
              {/* Upload / Switch Spreadsheet */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-2xs transition cursor-pointer"
                title="Import or replace spreadsheet file"
              >
                <Upload size={13} className="text-[#F27421]" />
                <span className="hidden sm:inline">Import File</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, .xlsx, .xls, .xml"
                onChange={handleFileUpload}
                className="hidden"
              />

              {/* Template Picker */}
              <div className="relative">
                <select
                  value={selectedTemplate}
                  onChange={e => handleSelectTemplate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-medium text-slate-700 shadow-2xs focus:outline-none focus:border-[#F27421] cursor-pointer"
                  title="Select and apply mapping template"
                >
                  <option value="Standard Settlement Template">Standard Settlement Template</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* 1-Click Auto Map Standard Fields */}
              <button
                type="button"
                onClick={handleAutoMapAll}
                className="px-2.5 py-1.5 bg-orange-50/70 hover:bg-orange-100/70 border border-orange-200 text-[#F27421] rounded-lg text-xs font-bold flex items-center space-x-1 shadow-2xs transition cursor-pointer"
                title="Auto-match column headers to Global Standard Directory"
              >
                <Wand2 size={12} />
                <span>Auto-Map</span>
              </button>

              {/* Find in transactions input (Matching Case Page Design) */}
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={e => {
                    setTableSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Find in grid..."
                  className="pl-7 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 outline-none focus:border-[#F27421] transition-all w-32 sm:w-44"
                />
              </div>

              {/* Undo Button */}
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={handleUndo}
                  className="px-2.5 py-1 text-xs font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer transition-colors"
                  title="Undo last cleaning operation"
                >
                  <Undo2 size={12} />
                  <span>Undo</span>
                </button>
              )}
            </div>

            {/* Right Action Buttons: Deduplicate, Remove Empty, Trim, Merge */}
            <div className="flex items-center space-x-1.5 flex-wrap">
              <button 
                type="button" 
                onClick={handleDeduplicate}
                className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 transition cursor-pointer shadow-2xs flex items-center gap-1"
                title="Remove duplicate rows across active columns"
              >
                <span>Deduplicate</span>
              </button>

              <button 
                type="button" 
                onClick={handleRemoveEmptyRows}
                className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 transition cursor-pointer shadow-2xs flex items-center gap-1"
                title="Remove empty and blank rows"
              >
                <span>Empty rows</span>
              </button>

              <button 
                type="button" 
                onClick={handleTrimWhitespace}
                className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 transition cursor-pointer shadow-2xs flex items-center gap-1"
                title="Trim leading and trailing whitespace"
              >
                <span>Trim</span>
              </button>

              <button 
                type="button" 
                onClick={handleMergeSelectedColumns}
                disabled={selectedCount < 2}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer shadow-2xs ${
                  selectedCount >= 2
                    ? 'bg-[#0F142A] hover:bg-[#1A2242] text-white'
                    : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
                }`}
                title={selectedCount >= 2 ? `Merge ${selectedCount} selected columns` : 'Select 2 or more columns to merge'}
              >
                <Combine size={13} />
                <span>Merge columns</span>
                {selectedCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-[#F27421] text-white text-[10px] font-bold flex items-center justify-center">
                    {selectedCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Interactive Spreadsheet Grid matching Case Page Design */}
          <div className="flex-1 overflow-auto relative">
            <table className="w-full border-collapse text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-slate-100 bg-white sticky top-0 z-10 shadow-2xs">
                  {/* Row number header with master checkbox */}
                  <th className="py-2.5 px-3 w-12 text-center text-slate-400 font-sans border-r border-slate-100">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <span>#</span>
                      <input 
                        type="checkbox" 
                        checked={columns.length > 0 && columns.every(c => c.selected)}
                        onChange={handleSelectAllColumns}
                        className="rounded border-slate-300 text-[#F27421] focus:ring-[#F27421] h-3.5 w-3.5 cursor-pointer"
                        title="Select/Deselect all columns"
                      />
                    </div>
                  </th>

                  {columns.map(col => (
                    <th key={col.id} className="py-2.5 px-3 border-r border-slate-100 min-w-[190px] font-normal align-top bg-white">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center space-x-2 cursor-pointer min-w-0">
                            <input 
                              type="checkbox" 
                              checked={col.selected}
                              onChange={() => toggleColumnSelect(col.id)}
                              className="rounded border-slate-300 text-[#F27421] focus:ring-[#F27421] h-3.5 w-3.5 cursor-pointer shrink-0"
                            />
                            <span className="font-bold text-slate-800 font-mono text-xs truncate max-w-[120px]" title={col.name}>
                              {col.name}
                            </span>
                          </label>

                          <div className="flex items-center gap-1">
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-600">
                              {col.type}
                            </span>

                            {/* Dropdown menu trigger */}
                            <div className="relative">
                              <button 
                                type="button"
                                onClick={() => setActiveMenuColumn(activeMenuColumn === col.id ? null : col.id)}
                                className={`p-1 rounded transition cursor-pointer ${
                                  activeMenuColumn === col.id ? 'bg-slate-200 text-slate-800' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-700'
                                }`}
                                title="Column actions"
                              >
                                <MoreHorizontal size={13} />
                              </button>

                              {/* Dropdown Context Menu for Column */}
                              {activeMenuColumn === col.id && (
                                <div className="absolute mt-1 right-0 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1.5 text-xs text-slate-700 animate-in fade-in duration-100">
                                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                    Operations for {col.name}
                                  </div>

                                  <button 
                                    type="button" 
                                    onClick={() => {
                                      setSplitTargetCol(col.id);
                                      setSplitCol1Name(`${col.id}_part1`);
                                      setSplitCol2Name(`${col.id}_part2`);
                                      setSplitModalOpen(true);
                                      setActiveMenuColumn(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center space-x-2.5 cursor-pointer"
                                  >
                                    <Split size={14} className="text-blue-500" />
                                    <span>Split into columns</span>
                                  </button>

                                  <button 
                                    type="button" 
                                    onClick={() => handleTransformColumn(col.id, 'UPPERCASE')}
                                    className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center space-x-2.5 cursor-pointer"
                                  >
                                    <Sliders size={14} className="text-purple-500" />
                                    <span>To UPPERCASE</span>
                                  </button>

                                  <button 
                                    type="button" 
                                    onClick={() => handleTransformColumn(col.id, 'LOWERCASE')}
                                    className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center space-x-2.5 cursor-pointer"
                                  >
                                    <Sliders size={14} className="text-purple-500" />
                                    <span>To lowercase</span>
                                  </button>

                                  <button 
                                    type="button" 
                                    onClick={() => handleTransformColumn(col.id, 'NUMBER_CLEAN')}
                                    className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center space-x-2.5 cursor-pointer"
                                  >
                                    <Sliders size={14} className="text-emerald-500" />
                                    <span>Format numbers (2 decimals)</span>
                                  </button>

                                  <button 
                                    type="button" 
                                    onClick={() => handleTransformColumn(col.id, 'MASK_PAN')}
                                    className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center space-x-2.5 cursor-pointer"
                                  >
                                    <Shield size={14} className="text-amber-500" />
                                    <span>Mask card numbers</span>
                                  </button>

                                  <div className="my-1 border-t border-slate-100" />

                                  <button 
                                    type="button" 
                                    onClick={() => handleExcludeColumn(col.id)}
                                    className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-600 flex items-center space-x-2.5 cursor-pointer"
                                  >
                                    <Trash2 size={14} className="text-rose-500" />
                                    <span>Exclude column</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Target Standard Field Mapping Selector */}
                        <div className="relative">
                          <select 
                            value={col.mapping}
                            onChange={(e) => {
                              const val = e.target.value;
                              setColumns(cols => cols.map(c => c.id === col.id ? { ...c, mapping: val, unmapped: val === 'Unmapped' } : c));
                              setColumnMappings(prev => ({ ...prev, [col.id]: val }));
                            }}
                            className={`w-full text-[11px] py-1 px-1.5 rounded-lg border appearance-none font-mono transition cursor-pointer ${
                              col.unmapped || col.mapping === 'Unmapped'
                                ? 'bg-amber-50/80 border-amber-300 text-amber-900 focus:ring-amber-500 font-semibold' 
                                : 'bg-blue-50/70 border-blue-200 text-blue-800 font-semibold hover:border-blue-300'
                            }`}
                          >
                            <option value="Unmapped">-- Unmapped --</option>
                            {standardFields.map(sf => (
                              <option key={sf.key} value={sf.key}>{sf.label} ({sf.key})</option>
                            ))}
                          </select>
                          <ChevronDown size={12} className="absolute right-2 top-2 text-slate-400 pointer-events-none" />
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-700">
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="py-12 text-center text-slate-400 font-sans">
                      <FileSpreadsheet size={32} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-700">No records to display</p>
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row, rIdx) => {
                    const displayNum = (currentPage - 1) * pageSize + rIdx + 1;
                    return (
                      <tr key={rIdx} className="hover:bg-slate-50/60 transition-colors h-11 max-h-11 border-b border-slate-100">
                        <td className="py-2.5 px-4 font-sans text-slate-400 w-12 text-center whitespace-nowrap">
                          {displayNum}
                        </td>
                        {columns.map(col => {
                          const val = row[col.id];
                          const isBlank = val === undefined || val === null || String(val).trim() === '';
                          const isAmount = /amount|amt|fee|total/i.test(col.name) && !isNaN(Number(val));
                          const isStatus = /status|verdict/i.test(col.name);

                          return (
                            <td key={col.id} className="py-2.5 px-3 border-r border-slate-50 whitespace-nowrap truncate max-w-[220px]" title={String(val ?? '')}>
                              {isBlank ? (
                                <span className="text-slate-300 italic">—</span>
                              ) : isAmount ? (
                                <span className="font-bold font-heading text-slate-900">
                                  {Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              ) : isStatus ? (
                                <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  String(val).toLowerCase() === 'settled' || String(val).toLowerCase() === 'success'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    String(val).toLowerCase() === 'settled' || String(val).toLowerCase() === 'success'
                                      ? 'bg-emerald-500'
                                      : 'bg-amber-500'
                                  }`} />
                                  <span>{String(val)}</span>
                                </span>
                              ) : (
                                <span>{String(val)}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Active Pagination matching CasesWorkspaceView */}
          <DataTablePagination
            currentPage={currentPage}
            totalItems={filteredRows.length}
            pageSize={pageSize}
            pageSizeOptions={[5, 6, 7, 8, 9, 10, 12, 14, 15, 20, 25, 50]}
            statusBadge={<span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-medium">Ready</span>}
            onPageChange={p => setCurrentPage(p)}
            onPageSizeChange={newSize => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
          />
        </div>

        {/* Right Sidebar: Dynamic Recipe & Required Columns Checklist */}
        <div className="w-80 bg-white flex flex-col justify-between shrink-0 overflow-y-auto p-5 space-y-6 border-l border-slate-200">
          <div className="space-y-6">
            {/* Recipe Header */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-slate-900 text-sm font-heading flex items-center gap-1.5">
                  <Sparkles size={14} className="text-[#F27421]" />
                  <span>Recipe</span>
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-mono font-bold">
                  {recipeSteps.length} steps
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every transformation is recorded and ready to save as an ingestion recipe.
              </p>

              {/* Dynamic Steps List */}
              <div className="mt-4 space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {recipeSteps.map((step) => (
                  <div key={step.num} className="flex items-start space-x-2.5 p-2 rounded-lg bg-slate-50/70 border border-slate-100">
                    <span className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold font-mono shrink-0 mt-0.5">
                      {step.num}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 truncate">{step.title}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-2">{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Required Columns Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-slate-900 text-sm font-heading">Required columns</h3>
                <span className="text-[10px] font-mono font-bold text-slate-500">
                  {requiredColumnsList.filter(rc => rc.status === 'Ready').length} / {requiredColumnsList.length} Ready
                </span>
              </div>
              <div className="space-y-2">
                {requiredColumnsList.map(rc => (
                  <div key={rc.name} className="flex items-center justify-between text-xs font-mono p-2 rounded-lg border bg-slate-50/50 border-slate-100">
                    <span className="text-slate-700 font-medium truncate max-w-[150px]" title={rc.name}>
                      {rc.name}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      rc.status === 'Ready' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {rc.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="space-y-2 pt-4 border-t border-slate-100">
            <button 
              type="button"
              onClick={() => setSaveModalOpen(true)}
              className="w-full py-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 flex items-center justify-center space-x-2 transition cursor-pointer shadow-2xs"
            >
              <Save size={14} className="text-[#F27421]" />
              <span>Save as template</span>
            </button>

            <button 
              type="button"
              onClick={handleApplyAndContinue}
              className="w-full py-2.5 bg-[#F27421] hover:bg-[#e06516] active:bg-[#c95712] text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-md"
            >
              <span>Continue to Review</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Split Column Modal */}
      {splitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-100">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Split size={16} className="text-blue-600" />
                <span>Split Column "{splitTargetCol}"</span>
              </h3>
              <button
                type="button"
                onClick={() => setSplitModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Delimiter</label>
                <input
                  type="text"
                  value={splitDelimiter}
                  onChange={e => setSplitDelimiter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono"
                  placeholder="e.g. \\ or , or -"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Part 1 Column Name</label>
                <input
                  type="text"
                  value={splitCol1Name}
                  onChange={e => setSplitCol1Name(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Part 2 Column Name</label>
                <input
                  type="text"
                  value={splitCol2Name}
                  onChange={e => setSplitCol2Name(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSplitModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeSplitColumn}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-2xs"
              >
                Split Column
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Template Modal */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-100">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Save size={16} className="text-[#F27421]" />
                <span>Save Ingestion Template</span>
              </h3>
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Template Name</label>
                <input
                  type="text"
                  value={templateSaveName}
                  onChange={e => setTemplateSaveName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-medium"
                  placeholder="e.g. Visa Clearing Batch Template"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Saves column mappings and {recipeSteps.length} recorded recipe cleaning steps to PostgreSQL.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTemplateSubmit}
                className="px-4 py-1.5 bg-[#F27421] hover:bg-[#e06516] text-white text-xs font-bold rounded-lg shadow-2xs"
              >
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadAndCleanTransactionsView;
