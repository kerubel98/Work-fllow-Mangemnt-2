/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  HashtagPreset, HashtagType, DataSourceMode, 
  DatabaseConnection, User, DictionaryLookupMapping,
  FileIngestionMappingTemplate 
} from '../../types';
import { api } from '../../api/client';
import { globalMappingService } from '../../services/globalMappingService';
import { ErrorBoundary } from '../ErrorBoundary';
import { ShareAssetModal } from '../common/ShareAssetModal';
import { 
  Tag, Plus, Terminal, CheckCircle, FileText, X, Sparkles,
  Database, Play, Upload, Check, AlertTriangle, Layers,
  Activity, ArrowRight, ShieldCheck, RefreshCw, Eye,
  Pencil, Share2, Trash2, Copy, CheckCheck,
  Calendar, Scissors, Eraser, CheckSquare, Square,
  GitBranch, ArrowUpDown, ChevronDown, ChevronRight, CheckCircle2
} from 'lucide-react';

interface HashtagManagerProps {
  hashtags: HashtagPreset[];
  currentUser: User;
  onCreatePreset: (preset: HashtagPreset) => void;
  onUpdatePreset?: (preset: HashtagPreset) => void;
  onDeletePreset?: (tag: string) => void;
  databases?: DatabaseConnection[];
  onClose?: () => void;
  initialCreating?: boolean;
}

export default function HashtagManager({
  hashtags,
  currentUser,
  onCreatePreset,
  onUpdatePreset,
  onDeletePreset,
  databases = [],
  onClose,
  initialCreating
}: HashtagManagerProps) {
  return (
    <ErrorBoundary fallbackTitle="Hashtag Manager Error" fallbackMessage="Could not render Hashtag Solution Preset Library.">
      <HashtagManagerContent
        hashtags={hashtags}
        currentUser={currentUser}
        onCreatePreset={onCreatePreset}
        onUpdatePreset={onUpdatePreset}
        onDeletePreset={onDeletePreset}
        databases={databases}
        onClose={onClose}
        initialCreating={initialCreating}
      />
    </ErrorBoundary>
  );
}

function HashtagManagerContent({
  hashtags,
  currentUser,
  onCreatePreset,
  onUpdatePreset,
  onDeletePreset,
  databases = [],
  onClose,
  initialCreating
}: HashtagManagerProps) {
  const [localHashtags, setLocalHashtags] = useState<HashtagPreset[]>(hashtags);
  useEffect(() => {
    setLocalHashtags(hashtags);
  }, [hashtags]);

  const [selectedTag, setSelectedTag] = useState<HashtagPreset | null>(hashtags[0] || null);
  const [isCreating, setIsCreating] = useState(initialCreating || false);
  const [editingTag, setEditingTag] = useState<HashtagPreset | null>(null);
  const [sharingTag, setSharingTag] = useState<HashtagPreset | null>(null);
  const [deletingTag, setDeletingTag] = useState<HashtagPreset | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showShareAssetModal, setShowShareAssetModal] = useState(false);
  const [activeFilterType, setActiveFilterType] = useState<string>('ALL');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-Flight & Scan Testing State
  const [preFlightLoading, setPreFlightLoading] = useState(false);
  const [preFlightResult, setPreFlightResult] = useState<any | null>(null);
  const [showPreFlightModal, setShowPreFlightModal] = useState(false);
const [scanResult, setScanResult] = useState<any | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [showSampleDataPreview, setShowSampleDataPreview] = useState(false);
  const [showDataTransformModal, setShowDataTransformModal] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleCopyTag = (tagStr: string) => {
    navigator.clipboard?.writeText(tagStr);
    showToast(`Copied ${tagStr} to clipboard!`);
  };

  const handleStartEdit = (tag: HashtagPreset) => {
    setEditingTag(tag);
    setNewTagName(tag.tag);
    setNewType(tag.hashtagType || 'FILE_INGESTION');
    setNewDataSourceMode(tag.dataSourceMode || 'FILE_UPLOAD');
    setNewDesc(tag.description || '');
    setNewCriteria(tag.criteria || '');
    setNewHeaders((tag.expectedFileStructure || []).join(', '));
    setNewSql(tag.solutionTemplate || '');
    setNewTargetDbId(tag.targetDbId || '');
    setNewTargetTableName(tag.targetTableName || '');
    setNewDedicatedAppTable(tag.dedicatedAppTable || '');
    setMinRequiredCols(tag.minimumRequiredColumns || []);
    setSelectedTemplateId(tag.mappingTemplateId || '');
    setSelectedWorkflowId(tag.workflowId || '');
    setSampleRows([]);
    setSampleFileName('');
    setColumnMappings({});

    const lookupKeys = Object.keys(tag.dictionaryLookupMappings || {});
    if (lookupKeys.length > 0 && tag.dictionaryLookupMappings?.[lookupKeys[0]]) {
      const first = tag.dictionaryLookupMappings[lookupKeys[0]];
      setEnableLookup(true);
      setLookupSourceCol(first.sourceCol || lookupKeys[0]);
      setLookupTargetCol(first.targetCol || '');
      setLookupTable(first.lookupTable || 'bank_directory');
    } else {
      setEnableLookup(false);
    }
    setIsCreating(true);
  };

  const handleStartShare = (tag: HashtagPreset) => {
    setSharingTag(tag);
    setShowShareModal(true);
  };

  const handleStartDelete = (tag: HashtagPreset) => {
    setDeletingTag(tag);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingTag) return;
    try {
      await api.deleteHashtag(deletingTag.tag);
      onDeletePreset?.(deletingTag.tag);
      setLocalHashtags(prev => prev.filter(h => h.tag !== deletingTag.tag && (h as any).id !== deletingTag.tag));
      if (selectedTag?.tag === deletingTag.tag) {
        const remaining = localHashtags.filter(h => h.tag !== deletingTag.tag);
        setSelectedTag(remaining[0] || null);
      }
      showToast(`Hashtag preset "${deletingTag.tag}" deleted.`);
    } catch (err: any) {
      console.error('Failed to delete hashtag preset:', err);
      showToast(`Failed to delete hashtag: ${err.message || 'Server error'}`);
    } finally {
      setShowDeleteConfirm(false);
      setDeletingTag(null);
    }
  };

  // Form State: 4-Type Universal Taxonomy
  const [newTagName, setNewTagName] = useState('#');
  const [newType, setNewType] = useState<HashtagType>('FILE_INGESTION');
  const [newDataSourceMode, setNewDataSourceMode] = useState<DataSourceMode>('FILE_UPLOAD');
  const [newDesc, setNewDesc] = useState('');
  const [newCriteria, setNewCriteria] = useState('');
  const [newHeaders, setNewHeaders] = useState('Transaction_ID, Card_Number, Amount_USD');
  const [newSql, setNewSql] = useState("UPDATE transactions SET status = 'REVERSED' WHERE transaction_id = '{{Transaction_ID}}';");
  const [newTargetDbId, setNewTargetDbId] = useState('');
  const [newTargetTableName, setNewTargetTableName] = useState('');
  const [newDedicatedAppTable, setNewDedicatedAppTable] = useState('');
  const [minRequiredCols, setMinRequiredCols] = useState<string[]>(['Transaction_ID', 'Amount_USD']);
  const [lookupSourceCol, setLookupSourceCol] = useState('bank_code');
  const [lookupTargetCol, setLookupTargetCol] = useState('bank_name');
  const [lookupTable, setLookupTable] = useState('bank_directory');
  const [enableLookup, setEnableLookup] = useState(false);

  // Workflow Linkage & Approval Hierarchy States
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');

  // Sample Data, Column Mapping & Data Cleaning States
  const [sampleRows, setSampleRows] = useState<Record<string, any>[]>([]);
  const [sampleFileName, setSampleFileName] = useState<string>('');
  const [sampleFileType, setSampleFileType] = useState<string>('');
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});
  // Saved File Ingestion Mapping Templates (Domain 7)
  const [fileTemplates, setFileTemplates] = useState<FileIngestionMappingTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  useEffect(() => {
    api.getFileMappingTemplates().then(data => {
      if (Array.isArray(data)) setFileTemplates(data);
    }).catch(err => console.warn('Failed to load file mapping templates in HashtagManager:', err));
  }, []);

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const t = fileTemplates.find(tpl => tpl.id === templateId);
    if (t) {
      if (t.requiredColumns && t.requiredColumns.length > 0) {
        setMinRequiredCols(t.requiredColumns);
      }
      if (t.columnMappings && Object.keys(t.columnMappings).length > 0) {
        setColumnMappings(prev => ({ ...prev, ...t.columnMappings }));
      }
      if (t.manualHeaders && Object.keys(t.manualHeaders).length > 0) {
        setNewHeaders(Object.values(t.manualHeaders).join(', '));
      }
      showToast(`Linked template "${t.name}" with ${t.requiredColumns?.length || 0} mandated columns.`);
    }
  };

  // Load Workflows on mount
  useEffect(() => {
    api.getWorkflows().then(data => {
      if (Array.isArray(data)) {
        setWorkflows(data);
      }
    }).catch(err => {
      console.warn('Failed to fetch workflows in HashtagManager:', err);
    });
  }, []);

  // Sort Workflows: APPROVED workflows first
  const sortedWorkflows = useMemo(() => {
    return [...workflows].sort((a, b) => {
      const aApp = a.status === 'APPROVED' ? 1 : 0;
      const bApp = b.status === 'APPROVED' ? 1 : 0;
      if (aApp !== bApp) return bApp - aApp;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [workflows]);

  // Standard Fields for Column Mapping
  const standardFields = useMemo(() => {
    try {
      return globalMappingService.getStandardFields();
    } catch (_) {
      return [
        { key: 'transaction_id', label: 'Transaction ID', dataType: 'string', required: true },
        { key: 'amount', label: 'Amount', dataType: 'number', required: true },
        { key: 'card_pan', label: 'Card PAN', dataType: 'string', required: false },
        { key: 'status', label: 'Transaction Status', dataType: 'string', required: false },
        { key: 'posting_date', label: 'Posting Date', dataType: 'date', required: false },
        { key: 'reference_number', label: 'Reference Number', dataType: 'string', required: false }
      ];
    }
  }, []);

  // Sample file upload parsing for Type A (CSV, Excel, XML)
  const parseSampleFile = async (file: File): Promise<{ headers: string[]; rows: Record<string, any>[]; rowCount: number; format: string }> => {
    const fileName = file.name.toLowerCase();

    // 1. Excel Spreadsheet (.xlsx, .xls)
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('Excel workbook contains no sheets.');
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      if (rawRows.length === 0) throw new Error('Excel sheet is empty.');
      const headers = rawRows[0].map((h: any) => String(h || '').trim()).filter(Boolean);
      const rows = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];
      return { headers, rows, rowCount: rows.length, format: 'Excel' };
    }

    const text = await file.text();
    const trimmed = text.trim();

    // 2. XML Data File (.xml or XML markup)
    if (fileName.endsWith('.xml') || trimmed.startsWith('<?xml') || (trimmed.startsWith('<') && !trimmed.startsWith('<!DOCTYPE html>'))) {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'text/xml');
      const parseErr = xmlDoc.getElementsByTagName('parsererror')[0];
      if (parseErr) {
        throw new Error('XML parsing syntax error: ' + (parseErr.textContent || 'Malformed XML structure'));
      }

      // Identify candidate repeating entities or direct children
      const allElements = Array.from(xmlDoc.getElementsByTagName('*'));
      const tagCounts = new Map<string, Element[]>();
      for (const el of allElements) {
        if (el === xmlDoc.documentElement) continue;
        const list = tagCounts.get(el.tagName) || [];
        list.push(el);
        tagCounts.set(el.tagName, list);
      }

      let candidateRows: Element[] = [];
      let bestTag: string | null = null;
      let maxCount = 0;
      for (const [tag, elements] of tagCounts.entries()) {
        if (elements.length > maxCount && elements.some(e => e.children.length > 0 || e.attributes.length > 0)) {
          maxCount = elements.length;
          bestTag = tag;
        }
      }

      if (bestTag && maxCount > 1) {
        candidateRows = tagCounts.get(bestTag) || [];
      } else if (xmlDoc.documentElement.children.length > 0) {
        candidateRows = Array.from(xmlDoc.documentElement.children);
      } else {
        candidateRows = [xmlDoc.documentElement];
      }

      const headerSet = new Set<string>();
      const rows: Record<string, any>[] = [];

      for (const rowEl of candidateRows) {
        const rowObj: Record<string, any> = {};
        // Collect attributes as columns
        for (let i = 0; i < rowEl.attributes.length; i++) {
          rowObj[rowEl.attributes[i].name] = rowEl.attributes[i].value;
          headerSet.add(rowEl.attributes[i].name);
        }
        // Collect child elements as columns
        for (let i = 0; i < rowEl.children.length; i++) {
          const child = rowEl.children[i];
          if (child.children.length === 0) {
            rowObj[child.tagName] = child.textContent?.trim() || '';
            headerSet.add(child.tagName);
          } else {
            // Flatten single-level nested tags
            for (let j = 0; j < child.children.length; j++) {
              const k = `${child.tagName}_${child.children[j].tagName}`;
              rowObj[k] = child.children[j].textContent?.trim() || '';
              headerSet.add(k);
            }
          }
        }
        if (Object.keys(rowObj).length > 0) {
          rows.push(rowObj);
        }
      }

      let headers = Array.from(headerSet);
      if (headers.length === 0 && candidateRows.length > 0) {
        headers = candidateRows.map(r => r.tagName);
      }

      return { headers, rows, rowCount: rows.length, format: 'XML' };
    }

    // 3. Delimited Text (CSV, TSV, Semicolon)
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) throw new Error('File is empty.');
    const firstLine = lines[0];
    let delimiter = ',';
    if ((firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length) {
      delimiter = ';';
    } else if ((firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length) {
      delimiter = '\t';
    }

    const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    const rows: Record<string, any>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
      const rowObj: Record<string, any> = {};
      headers.forEach((h, idx) => {
        rowObj[h] = vals[idx] !== undefined ? vals[idx] : '';
      });
      rows.push(rowObj);
    }

    return { headers, rows, rowCount: rows.length, format: 'CSV' };
  };

  const handleSampleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { headers, rows, rowCount, format } = await parseSampleFile(file);
      if (headers.length > 0) {
        setSampleRows(rows);
        setSampleFileName(file.name);
        setSampleFileType(format);
        setNewHeaders(headers.join(', '));
        setMinRequiredCols(headers.slice(0, 3));
        
        try {
          const autoMap = globalMappingService.autoGenerateColumnMapping(headers);
          setColumnMappings(autoMap);
        } catch (_) {
          const initialMap: Record<string, string> = {};
          headers.forEach(h => { initialMap[h] = h.toLowerCase(); });
          setColumnMappings(initialMap);
        }

        showToast(`Parsed ${format} file: ${headers.length} headers extracted from ${file.name} (${rowCount} records detected)`);
      } else {
        showToast(`Warning: No column headers detected in ${file.name}`);
      }
    } catch (err: any) {
      console.warn('Could not parse sample file', err);
      showToast(`Error reading file: ${err?.message || 'Unsupported format'}`);
    }
  };

  // Data Cleaning Tool: Deduplicate rows
  const handleCleanDeduplicate = () => {
    if (sampleRows.length === 0) return;
    const initial = sampleRows.length;
    const seen = new Set<string>();
    const unique = sampleRows.filter(r => {
      const k = JSON.stringify(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    setSampleRows(unique);
    const removed = initial - unique.length;
    showToast(`Deduplication: Removed ${removed} duplicate rows (${unique.length} unique remaining)`);
  };

  // Data Cleaning Tool: Remove empty rows
  const handleCleanRemoveEmpty = () => {
    if (sampleRows.length === 0) return;
    const initial = sampleRows.length;
    const cleaned = sampleRows.filter(r =>
      Object.values(r).some(v => v !== null && v !== undefined && String(v).trim() !== '' && String(v) !== '-')
    );
    setSampleRows(cleaned);
    const removed = initial - cleaned.length;
    showToast(`Cleaned: Removed ${removed} empty rows (${cleaned.length} rows remaining)`);
  };

  // Data Cleaning Tool: Date format normalization (e.g. DD/MM/YYYY, MM/DD/YYYY -> YYYY-MM-DD)
  const handleConvertDateFormats = () => {
    if (sampleRows.length === 0) return;
    let convertedCount = 0;
    const updated = sampleRows.map(row => {
      const copy = { ...row };
      Object.keys(copy).forEach(k => {
        const val = String(copy[k] || '').trim();
        const dmyMatch = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (dmyMatch) {
          const p1 = parseInt(dmyMatch[1], 10);
          const p2 = parseInt(dmyMatch[2], 10);
          const year = dmyMatch[3];
          const day = p1 > 12 ? String(p1).padStart(2, '0') : String(p2).padStart(2, '0');
          const month = p1 > 12 ? String(p2).padStart(2, '0') : String(p1).padStart(2, '0');
          copy[k] = `${year}-${month}-${day}`;
          convertedCount++;
        } else if (val && !isNaN(Date.parse(val)) && (val.includes('/') || val.includes('GMT') || val.length > 20)) {
          try {
            copy[k] = new Date(val).toISOString().split('T')[0];
            convertedCount++;
          } catch (_) {}
        }
      });
      return copy;
    });
    setSampleRows(updated);
    showToast(`Date Normalizer: Standardized ${convertedCount} date values to ISO YYYY-MM-DD`);
  };

  // Data Cleaning Tool: Trim whitespace
  const handleTrimWhitespace = () => {
    if (sampleRows.length === 0) return;
    const trimmed = sampleRows.map(row => {
      const copy: Record<string, any> = {};
      Object.entries(row).forEach(([k, v]) => {
        copy[k] = typeof v === 'string' ? v.trim() : v;
      });
      return copy;
    });
    setSampleRows(trimmed);
    showToast(`Data Cleanser: Trimmed whitespace across all ${sampleRows.length} sample records`);
  };

  // Column Mapping Toggle: Required column
  const handleToggleRequiredCol = (colName: string) => {
    setMinRequiredCols(prev => {
      if (prev.includes(colName)) {
        return prev.filter(c => c !== colName);
      } else {
        return [...prev, colName];
      }
    });
  };

  // Column Mapping Update: Canonical field
  const handleUpdateColMapping = (sourceCol: string, targetCol: string) => {
    setColumnMappings(prev => ({
      ...prev,
      [sourceCol]: targetCol
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formattedTag = newTagName.startsWith('#') ? newTagName.toUpperCase() : `#${newTagName.toUpperCase()}`;
    const headersList = newHeaders.split(',').map(h => h.trim()).filter(Boolean);

    const dictionaryMappings: Record<string, DictionaryLookupMapping> = {};
    if (enableLookup && lookupSourceCol && lookupTargetCol) {
      dictionaryMappings[lookupSourceCol] = {
        sourceCol: lookupSourceCol,
        targetCol: lookupTargetCol,
        lookupTable: lookupTable || 'bank_directory',
        fallbackValue: 'UNKNOWN'
      };
    }

    const linkedWf = workflows.find(w => w.id === selectedWorkflowId);

    const preset: HashtagPreset = {
      tag: formattedTag,
      description: newDesc,
      criteria: newCriteria,
      expectedFileStructure: headersList,
      solutionTemplate: newSql,
      author: editingTag ? editingTag.author : currentUser.username,
      createdAt: editingTag ? editingTag.createdAt : new Date().toISOString(),
      workflowId: selectedWorkflowId || null,
      workflowName: linkedWf?.name || editingTag?.workflowName || null,
      // Universal engine fields
      hashtagType: newType,
      dataSourceMode: newType === 'DATABASE_DIRECT_SCANNER' ? 'DATABASE_DIRECT' : (newType === 'FILE_INGESTION' ? 'FILE_UPLOAD' : newDataSourceMode),
      targetDbId: newTargetDbId || null,
      targetTableName: newTargetTableName || null,
      dedicatedAppTable: newDedicatedAppTable || (newType === 'EXTRACTION_STAGING' ? `hashtag_stage_${formattedTag.replace(/^#+/, '').toLowerCase()}` : null),
      minimumRequiredColumns: minRequiredCols,
      mappingTemplateId: selectedTemplateId || null,
      dictionaryLookupMappings: dictionaryMappings,
      executionTrigger: editingTag?.executionTrigger || 'MANUAL',
      scheduleCron: editingTag?.scheduleCron || null,
      conditionalAction: editingTag?.conditionalAction || { onPass: 'EXECUTE_SQL', onFail: 'FLAG_INVESTIGATION' }
    };

    try {
      if (editingTag) {
        await api.updateHashtag(editingTag.tag, preset);
        onUpdatePreset?.(preset);
        setLocalHashtags(prev => prev.map(h => (h.tag === editingTag.tag ? preset : h)));
        setSelectedTag(preset);
        showToast(`Hashtag directive "${preset.tag}" updated!`);
      } else {
        onCreatePreset(preset);
        setLocalHashtags(prev => [...prev, preset]);
        setSelectedTag(preset);
        showToast(`Hashtag directive "${preset.tag}" created!`);
      }
      setIsCreating(false);
      setEditingTag(null);
      setSelectedTemplateId('');
      setNewTagName('#');
      setSelectedWorkflowId('');
      setSampleRows([]);
      setSampleFileName('');
      setColumnMappings({});
      setNewDesc('');
      setNewCriteria('');
    } catch (err: any) {
      console.error('Failed to save hashtag preset:', err);
      showToast(`Error: ${err.message || 'Could not save preset'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const runPreFlightTest = async (tag: HashtagPreset) => {
    setPreFlightLoading(true);
    setPreFlightResult(null);
    setShowPreFlightModal(true);

    try {
      // Mock 3 sample rows if Type A has headers
      const sampleRows = (tag.expectedFileStructure || []).length > 0 ? [
        {
          ...(tag.expectedFileStructure || []).reduce((acc: any, col: string) => {
            acc[col] = col.toLowerCase().includes('id') ? 'TX-9001' : (col.toLowerCase().includes('code') ? '001' : '100.00');
            return acc;
          }, {})
        }
      ] : [];

      const res = await api.testHashtagPreflight(tag.tag, sampleRows);
      setPreFlightResult(res);
    } catch (err: any) {
      setPreFlightResult({
        success: false,
        errors: [err.message || 'Pre-flight check failed'],
        columnValidation: [],
        lookupResolution: []
      });
    } finally {
      setPreFlightLoading(false);
    }
  };

  const runDatabaseScan = async (tag: HashtagPreset, isDryRun: boolean = true) => {
    setScanLoading(true);
    setScanResult(null);

    try {
      const res = await api.executeHashtagScan(tag.tag, {
        executedBy: currentUser.username,
        isDryRun
      });
      setScanResult(res);
    } catch (err: any) {
      setScanResult({
        verdict: 'ERROR',
        errors: [err.message || 'Database scan failed'],
        rowsScanned: 0,
        anomaliesDetected: 0,
        anomalyRows: []
      });
    } finally {
      setScanLoading(false);
    }
  };

  const filteredHashtags = localHashtags.filter(h => {
    if (activeFilterType === 'ALL') return true;
    return (h.hashtagType || 'FILE_INGESTION') === activeFilterType;
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 lg:p-6 mb-6 relative">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg border border-slate-700 flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 mb-6 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-xl shadow-xs">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">Universal Hashtag Automation Library</h2>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono font-bold">
                Directives & Scanners
              </span>
            </div>
            <p className="text-xs text-slate-500">Autonomous operational directives, zero-file DB anomaly scanners, dictionary mappers, and SQL remediation</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
            >
              Close
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Hashtag Preset</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs by Hashtag Type */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 border-b border-slate-100 no-scrollbar">
        {[
          { id: 'ALL', label: 'All Directives' },
          { id: 'FILE_INGESTION', label: 'Type A: File Ingestion' },
          { id: 'DATABASE_DIRECT_SCANNER', label: 'Type B: Zero-File DB Scanner' },
          { id: 'EXTRACTION_STAGING', label: 'Type C: ETL Staging' },
          { id: 'AUDITING_GOVERNANCE', label: 'Type D: Audit & Compliance' }
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveFilterType(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              activeFilterType === tab.id
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Preset Cards */}
        <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
          {filteredHashtags.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
              No hashtags found matching filter.
            </div>
          ) : (
            filteredHashtags.map((h) => {
              const isSelected = selectedTag?.tag === h.tag;
              const type = h.hashtagType || 'FILE_INGESTION';
              return (
                <div
                  key={h.tag}
                  onClick={() => setSelectedTag(h)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition ${
                    isSelected
                      ? 'bg-indigo-50/90 border-indigo-300 shadow-xs'
                      : 'bg-slate-50 hover:bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-indigo-900 font-mono">{h.tag}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                      type === 'DATABASE_DIRECT_SCANNER' ? 'bg-amber-100 text-amber-800' :
                      type === 'EXTRACTION_STAGING' ? 'bg-emerald-100 text-emerald-800' :
                      type === 'AUDITING_GOVERNANCE' ? 'bg-purple-100 text-purple-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {type === 'DATABASE_DIRECT_SCANNER' ? 'DB Scanner' :
                       type === 'EXTRACTION_STAGING' ? 'ETL Staging' :
                       type === 'AUDITING_GOVERNANCE' ? 'Audit' : 'File Ingest'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-2">{h.description}</p>
                  
                  {h.workflowName && (
                    <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-white/80 rounded-lg border border-slate-200/80 text-[11px]">
                      <GitBranch size={11} className="text-indigo-600 shrink-0" />
                      <span className="truncate max-w-[120px] text-slate-700 font-medium">{h.workflowName}</span>
                      {(() => {
                        const wf = workflows.find(w => w.id === h.workflowId || w.name === h.workflowName);
                        const isApproved = wf?.status === 'APPROVED';
                        return (
                          <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                            isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {isApproved ? 'APPROVED' : 'DRAFT'}
                          </span>
                        );
                      })()}
                    </div>
                  )}

                  {/* Card Footer: Metadata + Action Buttons (Edit, Share, Delete) */}
                  <div className="flex items-center justify-between gap-1 mt-2.5 pt-2 border-t border-slate-200/70">
                    <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-400 font-mono min-w-0">
                      <span className="truncate">@{h.author}</span>
                      {h.targetTableName && (
                        <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 flex items-center gap-1 truncate">
                          <Database size={10} /> {h.targetTableName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEdit(h);
                        }}
                        title={`Edit ${h.tag}`}
                        className="px-2 py-1 rounded-lg text-slate-600 hover:text-indigo-700 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 transition text-[11px] font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <Pencil size={11} className="text-indigo-600" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartShare(h);
                        }}
                        title={`Share ${h.tag}`}
                        className="px-2 py-1 rounded-lg text-slate-600 hover:text-blue-700 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition text-[11px] font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <Share2 size={11} className="text-blue-600" />
                        <span>Share</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartDelete(h);
                        }}
                        title={`Delete ${h.tag}`}
                        className="px-2 py-1 rounded-lg text-slate-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-300 transition text-[11px] font-semibold flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <Trash2 size={11} className="text-rose-600" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Detailed Inspector */}
        <div className="lg:col-span-2 bg-slate-50 rounded-2xl p-5 border border-slate-200 flex flex-col justify-between">
          {selectedTag ? (
            <div className="space-y-4">
              {/* Header Info */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-200 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-indigo-900 font-mono">{selectedTag.tag}</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono text-xs font-bold">
                      {selectedTag.hashtagType || 'FILE_INGESTION'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-xs">
                      {selectedTag.dataSourceMode || 'FILE_UPLOAD'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{selectedTag.description}</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(selectedTag)}
                    className="px-2.5 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition shadow-2xs cursor-pointer"
                    title="Edit Directive"
                  >
                    <Pencil size={12} />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartShare(selectedTag)}
                    className="px-2.5 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-slate-200 hover:border-blue-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition shadow-2xs cursor-pointer"
                    title="Share Directive"
                  >
                    <Share2 size={12} />
                    <span>Share</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartDelete(selectedTag)}
                    className="px-2.5 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-slate-200 hover:border-rose-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition shadow-2xs cursor-pointer"
                    title="Delete Directive"
                  >
                    <Trash2 size={12} />
                    <span>Delete</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => runPreFlightTest(selectedTag)}
                    disabled={preFlightLoading}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${preFlightLoading ? 'animate-spin' : ''}`} />
                    <span>Pre-Flight Test</span>
                  </button>

                  {selectedTag.hashtagType === 'DATABASE_DIRECT_SCANNER' && (
                    <>
                      <button
                        type="button"
                        onClick={() => runDatabaseScan(selectedTag, true)}
                        disabled={scanLoading}
                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        title="Run dry-run observational scan without triggering remediations"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{scanLoading ? 'Scanning...' : 'Dry-Run Scan'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => runDatabaseScan(selectedTag, false)}
                        disabled={scanLoading}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                        title="Run live scan and stage Maker-Checker proposal if clean/fixable"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{scanLoading ? 'Running...' : 'Run & Remediate (Live)'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Target DB & Table (if configured) */}
              {(selectedTag.targetTableName || selectedTag.targetDbId) && (
                <div className="p-3 bg-white rounded-xl border border-slate-200 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block font-mono">Target Database</span>
                    <span className="font-semibold text-slate-800">{selectedTag.targetDbId || 'Internal PostgreSQL App DB'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block font-mono">Target / Mirror Table</span>
                    <span className="font-mono font-bold text-indigo-600">{selectedTag.targetTableName}</span>
                  </div>
                </div>
              )}

              {/* Linked Workflow with Approval Badge */}
              {selectedTag.workflowName && (
                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block font-mono">Linked Validation Workflow</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <GitBranch size={13} className="text-indigo-600" />
                      <span className="font-bold text-slate-800">{selectedTag.workflowName}</span>
                      {selectedTag.workflowId && (
                        <span className="text-slate-400 font-mono text-[10px]">({selectedTag.workflowId})</span>
                      )}
                    </div>
                  </div>
                  <div>
                    {(() => {
                      const wf = workflows.find(w => w.id === selectedTag.workflowId || w.name === selectedTag.workflowName);
                      const isApproved = wf?.status === 'APPROVED';
                      return (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
                          isApproved ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {isApproved ? <CheckCircle2 size={12} className="text-emerald-600" /> : <AlertTriangle size={12} className="text-amber-600" />}
                          <span>{isApproved ? 'Approved Workflow' : 'Draft / Unapproved'}</span>
                        </span>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Linked File Ingestion Mapping Template */}
              {selectedTag.mappingTemplateId && (
                <div className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block font-mono">Mandated File Ingestion Template</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <FileText size={13} className="text-indigo-600" />
                      <span className="font-bold text-slate-800">
                        {fileTemplates.find(t => t.id === selectedTag.mappingTemplateId)?.name || selectedTag.mappingTemplateId}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-mono text-slate-400 block">Enforced Columns</span>
                    <span className="text-xs font-mono font-bold text-emerald-700">
                      {selectedTag.minimumRequiredColumns?.join(', ') || 'Template Schema'}
                    </span>
                  </div>
                </div>
              )}

              {/* Criteria / Detection Logic */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Validation / Anomaly Detection Criteria
                </label>
                <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-700 font-mono leading-relaxed">
                  {selectedTag.criteria || 'Standard header and schema validation'}
                </div>
              </div>

              {/* Required Columns & Dictionary Lookups */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Minimum Required Columns
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(selectedTag.minimumRequiredColumns && selectedTag.minimumRequiredColumns.length > 0
                      ? selectedTag.minimumRequiredColumns
                      : selectedTag.expectedFileStructure || []
                    ).map(col => (
                      <span key={col} className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 text-[11px] font-mono border border-indigo-200">
                        {col}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Dictionary Lookups ({Object.keys(selectedTag.dictionaryLookupMappings || {}).length})
                  </label>
                  <div className="space-y-1">
                    {Object.entries(selectedTag.dictionaryLookupMappings || {}).length === 0 ? (
                      <span className="text-xs text-slate-400 italic">None configured</span>
                    ) : (
                      Object.entries(selectedTag.dictionaryLookupMappings || {}).map(([key, map]: [string, any]) => (
                        <div key={key} className="text-[11px] font-mono bg-white p-1.5 rounded border border-slate-200 flex items-center gap-1 text-slate-700">
                          <span className="text-indigo-600 font-bold">{map.sourceCol}</span>
                          <ArrowRight size={10} className="text-slate-400" />
                          <span className="text-emerald-600 font-bold">{map.targetCol}</span>
                          <span className="text-slate-400 text-[10px]">({map.lookupTable})</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Solution SQL Template */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Automated SQL Remediation Template
                </label>
                <div className="p-3 bg-slate-900 rounded-xl text-emerald-400 font-mono text-xs overflow-x-auto shadow-inner">
                  <pre>{selectedTag.solutionTemplate || '-- No solution template defined'}</pre>
                </div>
              </div>

              {/* Live Scan Results (if executed) */}
              {scanResult && (
                <div className={`p-4 rounded-xl border ${
                  scanResult.verdict === 'PASS' ? 'bg-emerald-50 border-emerald-200' :
                  scanResult.verdict === 'DISCREPANCY' ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs">
                      Scan Verdict: <span className="font-mono">{scanResult.verdict}</span>
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      Scanned: {scanResult.rowsScanned} | Anomalies: {scanResult.anomaliesDetected}
                    </span>
                  </div>
                  {scanResult.stagedProposalId && (
                    <div className="mb-2 p-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-mono text-indigo-800 flex items-center justify-between">
                      <span>Maker Proposal Staged: <strong>{scanResult.stagedProposalId}</strong></span>
                      <span className="px-2 py-0.5 rounded bg-indigo-200 text-indigo-900 font-bold text-[10px]">PENDING_CHECKER</span>
                    </div>
                  )}
                  {scanResult.anomalyRows?.length > 0 && (
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs font-mono max-h-32 overflow-y-auto">
                      <pre>{JSON.stringify(scanResult.anomalyRows.slice(0, 3), null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
              Select a hashtag preset from the library on the left
            </div>
          )}
        </div>
      </div>

      {/* Modal: Pre-Flight Test Drawer */}
      {showPreFlightModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <span>Pre-Flight Inspection: {selectedTag?.tag}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPreFlightModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-4">
              {preFlightLoading ? (
                <div className="p-8 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                  <span>Validating schema, column integrity, and dictionary lookup resolution...</span>
                </div>
              ) : preFlightResult ? (
                <>
                  <div className={`p-4 rounded-xl border flex items-center justify-between ${
                    preFlightResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-sm">
                      {preFlightResult.success ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                      <span>{preFlightResult.success ? 'Pre-Flight Passed: Ready for Ingestion' : 'Pre-Flight Verification Failed'}</span>
                    </div>
                    <span className="font-mono text-xs">
                      Rows Matched: {preFlightResult.matchedRows} / {preFlightResult.totalScanned}
                    </span>
                  </div>

                  {preFlightResult.columnValidation?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 font-mono">Column Validation Matrix</h4>
                      <div className="space-y-1.5">
                        {preFlightResult.columnValidation.map((c: any) => (
                          <div key={c.column} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                            <span className="font-mono font-bold text-slate-800">{c.column}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-500 font-mono">Nulls: {c.nullCount}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                c.valid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {c.valid ? 'VALID' : 'MISSING'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {preFlightResult.lookupResolution?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 font-mono">Dictionary Lookup Verification</h4>
                      <div className="space-y-1.5">
                        {preFlightResult.lookupResolution.map((lk: any) => (
                          <div key={lk.mapping} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                            <div className="flex items-center justify-between font-mono font-bold">
                              <span className="text-indigo-600">{lk.mapping}</span>
                              <span className="text-slate-500">Resolved: {lk.resolved} | Failed: {lk.failed}</span>
                            </div>
                            {lk.samples?.length > 0 && (
                              <div className="bg-white p-2 rounded border border-slate-100 text-[11px] font-mono text-slate-600">
                                Sample Translation: {JSON.stringify(lk.samples[0])}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {preFlightResult.errors?.length > 0 && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 space-y-1">
                      {preFlightResult.errors.map((e: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-1.5 font-mono">
                          <AlertTriangle size={12} /> {e}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div className="pt-3 border-t border-slate-200 shrink-0 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPreFlightModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Hashtag Preset (Universal 4-Type Creator) */}
      {isCreating && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-600" />
                <span>{editingTag ? `Edit Hashtag Directive: ${editingTag.tag}` : 'Create Universal Hashtag Directive'}</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsCreating(false);
                  setEditingTag(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex-1 min-h-0 overflow-y-auto py-4 space-y-4 pr-1">
              {/* Type Selector Segmented Control */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase font-mono">
                  Directive Type & Taxonomy
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'FILE_INGESTION', label: 'Type A: File Ingestion' },
                    { id: 'DATABASE_DIRECT_SCANNER', label: 'Type B: DB Scanner' },
                    { id: 'EXTRACTION_STAGING', label: 'Type C: ETL Staging' },
                    { id: 'AUDITING_GOVERNANCE', label: 'Type D: Audit' }
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setNewType(t.id as HashtagType);
                        if (t.id === 'DATABASE_DIRECT_SCANNER') setNewDataSourceMode('DATABASE_DIRECT');
                        else if (t.id === 'FILE_INGESTION') setNewDataSourceMode('FILE_UPLOAD');
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-center transition cursor-pointer ${
                        newType === t.id
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tag Name & Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tag Identifier (e.g. #DUPLICATE_AUTH)
                  </label>
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    required
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-indigo-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Condition or anomaly addressed"
                    required
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Dynamic Panel: Type A File-Ingestion */}
              {newType === 'FILE_INGESTION' && (
                <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-3">
                  {/* File Mapping Template Picker */}
                  <div className="p-3 bg-white rounded-xl border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-slate-700 font-mono mb-1">
                        Use Saved File Mapping Template (Enforces Required Columns)
                      </label>
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => handleSelectTemplate(e.target.value)}
                        className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-800"
                      >
                        <option value="">-- No Template (Ad-hoc Mapping) --</option>
                        {fileTemplates.map(tpl => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.name} ({tpl.sourceType?.toUpperCase()} • {tpl.requiredColumns?.length || 0} required columns)
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedTemplateId && (
                      <div className="shrink-0 flex items-center gap-2">
                        <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[10px] font-bold">
                          Enforcing: {minRequiredCols.join(', ') || 'Template Schema'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5 font-mono">
                      <Upload size={14} /> Multi-Format File Sample & Column Mapping (.csv, .xlsx, .xml)
                    </span>
                    <label className="px-2.5 py-1 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold cursor-pointer hover:bg-indigo-50 transition shadow-2xs">
                      <span>Upload Sample</span>
                      <input type="file" accept=".csv, .xlsx, .xls, .xml, text/xml, application/xml" onChange={handleSampleFileUpload} className="hidden" />
                    </label>
                  </div>

                  {sampleFileName && (
                    <div className="p-2.5 bg-white rounded-lg border border-indigo-200 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded font-mono font-bold text-[10px] bg-indigo-100 text-indigo-800">
                          {sampleFileType}
                        </span>
                        <span className="font-semibold text-slate-800 truncate max-w-xs">{sampleFileName}</span>
                        <span className="text-slate-400 font-mono text-[11px]">({sampleRows.length} rows loaded)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSampleDataPreview(!showSampleDataPreview)}
                        className="text-indigo-600 hover:text-indigo-800 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        {showSampleDataPreview ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <span>{showSampleDataPreview ? 'Hide Preview' : 'Show Preview'}</span>
                      </button>
                    </div>
                  )}

                  {/* Data Cleaning Tools Toolbar */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1">
                        <Sparkles size={12} className="text-indigo-600" /> Data Cleaning & Hygiene Tools
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Sample Pipeline Cleaners</span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={handleCleanDeduplicate}
                        disabled={sampleRows.length === 0}
                        title="Remove duplicate rows based on exact key/value identity"
                        className="px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-lg text-xs font-medium flex items-center gap-1 transition shadow-2xs disabled:opacity-50 cursor-pointer"
                      >
                        <Scissors size={11} className="text-indigo-600" />
                        <span>Deduplicate Rows</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCleanRemoveEmpty}
                        disabled={sampleRows.length === 0}
                        title="Remove empty or whitespace-only records"
                        className="px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-lg text-xs font-medium flex items-center gap-1 transition shadow-2xs disabled:opacity-50 cursor-pointer"
                      >
                        <Eraser size={11} className="text-rose-600" />
                        <span>Remove Empty Rows</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleConvertDateFormats}
                        disabled={sampleRows.length === 0}
                        title="Standardize DD/MM/YYYY, MM/DD/YYYY, and timestamps to ISO YYYY-MM-DD"
                        className="px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-lg text-xs font-medium flex items-center gap-1 transition shadow-2xs disabled:opacity-50 cursor-pointer"
                      >
                        <Calendar size={11} className="text-emerald-600" />
                        <span>Convert Dates (ISO)</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleTrimWhitespace}
                        disabled={sampleRows.length === 0}
                        title="Strip leading and trailing whitespace from string columns"
                        className="px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-lg text-xs font-medium flex items-center gap-1 transition shadow-2xs disabled:opacity-50 cursor-pointer"
                      >
                        <ArrowUpDown size={11} className="text-amber-600" />
                        <span>Trim Whitespace</span>
                      </button>

                      {/* Data Transform (Dictionary) Dummy Button */}
                      <button
                        type="button"
                        onClick={() => setShowDataTransformModal(true)}
                        title="Open Data Transformation Dictionary configuration"
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition shadow-2xs cursor-pointer"
                      >
                        <Terminal size={11} className="text-indigo-600" />
                        <span>Data Transform (Dictionary)</span>
                        <span className="text-[9px] px-1 bg-indigo-200 text-indigo-800 rounded font-mono">Preview</span>
                      </button>
                    </div>
                  </div>

                  {/* Expected Headers Input */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Expected Column Headers (Comma separated)
                    </label>
                    <input
                      type="text"
                      value={newHeaders}
                      onChange={(e) => setNewHeaders(e.target.value)}
                      placeholder="Transaction_ID, Card_Number, Amount_USD, Posting_Date"
                      className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Interactive Column Mapping & Required Fields Selector */}
                  {newHeaders.trim() && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                          Column Mapping & Required Fields Integrity
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {minRequiredCols.length} required fields chosen
                        </span>
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-100">
                        {newHeaders.split(',').map(h => h.trim()).filter(Boolean).map(col => {
                          const isReq = minRequiredCols.includes(col);
                          const mappedTarget = columnMappings[col] || '';
                          return (
                            <div key={col} className="pt-1.5 flex items-center justify-between gap-2 text-xs">
                              <label className="flex items-center gap-2 cursor-pointer truncate max-w-[180px]">
                                <input
                                  type="checkbox"
                                  checked={isReq}
                                  onChange={() => handleToggleRequiredCol(col)}
                                  className="rounded text-indigo-600"
                                />
                                <span className={`font-mono text-xs truncate ${isReq ? 'font-bold text-indigo-900' : 'text-slate-700'}`}>
                                  {col}
                                </span>
                                {isReq && (
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-rose-50 text-rose-700 font-bold border border-rose-200">
                                    REQUIRED
                                  </span>
                                )}
                              </label>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <ArrowRight size={11} className="text-slate-400" />
                                <select
                                  value={mappedTarget}
                                  onChange={(e) => handleUpdateColMapping(col, e.target.value)}
                                  className="text-[11px] p-1 bg-slate-50 border border-slate-200 rounded font-mono max-w-[150px]"
                                >
                                  <option value="">-- Target Standard Field --</option>
                                  {standardFields.map(sf => (
                                    <option key={sf.key} value={sf.key}>
                                      {sf.label} ({sf.key})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Collapsible Sample Data Preview Table */}
                  {sampleRows.length > 0 && showSampleDataPreview && (
                    <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-700 font-mono text-[11px]">
                          Sample Preview (First {Math.min(sampleRows.length, 5)} rows)
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">{sampleRows.length} total rows</span>
                      </div>
                      <div className="overflow-x-auto max-h-36 overflow-y-auto border border-slate-100 rounded-lg">
                        <table className="w-full text-left text-[11px] font-mono">
                          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                            <tr>
                              {Object.keys(sampleRows[0] || {}).slice(0, 6).map(k => (
                                <th key={k} className="p-1.5 font-bold whitespace-nowrap">{k}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {sampleRows.slice(0, 5).map((row, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/80">
                                {Object.keys(sampleRows[0] || {}).slice(0, 6).map(k => (
                                  <td key={k} className="p-1.5 whitespace-nowrap truncate max-w-[140px]">
                                    {String(row[k] ?? '')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Dictionary Lookup Toggle */}
                  <div className="pt-2 border-t border-indigo-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700">Dictionary Lookup Mapping</span>
                      <label className="flex items-center gap-1.5 text-xs text-indigo-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enableLookup}
                          onChange={(e) => setEnableLookup(e.target.checked)}
                          className="rounded text-indigo-600"
                        />
                        <span>Enable Code Translation</span>
                      </label>
                    </div>

                    {enableLookup && (
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-mono">Source Column</label>
                          <input
                            type="text"
                            value={lookupSourceCol}
                            onChange={(e) => setLookupSourceCol(e.target.value)}
                            placeholder="e.g. bank_code"
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 font-mono">Target Column</label>
                          <input
                            type="text"
                            value={lookupTargetCol}
                            onChange={(e) => setLookupTargetCol(e.target.value)}
                            placeholder="e.g. bank_name"
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 font-mono">Lookup Directory</label>
                          <select
                            value={lookupTable}
                            onChange={(e) => setLookupTable(e.target.value)}
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg font-mono"
                          >
                            <option value="bank_directory">bank_directory</option>
                            <option value="iso_response_codes">iso_response_codes</option>
                            <option value="terminal_master">terminal_master</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dynamic Panel: Type B & C Database Connection Target */}
              {(newType === 'DATABASE_DIRECT_SCANNER' || newType === 'EXTRACTION_STAGING') && (
                <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-200 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 font-mono">
                    <Database size={14} /> Target Database Connection & Table Configuration
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Target DB Connection</label>
                      <select
                        value={newTargetDbId}
                        onChange={(e) => setNewTargetDbId(e.target.value)}
                        className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl"
                      >
                        <option value="">Internal PostgreSQL (Mirror Tables)</option>
                        {databases.map(db => (
                          <option key={db.id} value={db.id}>
                            {db.name} ({db.type})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Target / Mirror Table Name</label>
                      <input
                        type="text"
                        value={newTargetTableName}
                        onChange={(e) => setNewTargetTableName(e.target.value)}
                        placeholder="e.g. mirror_ftp_settlement_feed"
                        required
                        className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl font-mono"
                      />
                    </div>
                  </div>

                  {newType === 'EXTRACTION_STAGING' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Dedicated App Staging Table</label>
                      <input
                        type="text"
                        value={newDedicatedAppTable}
                        onChange={(e) => setNewDedicatedAppTable(e.target.value)}
                        placeholder="e.g. hashtag_stage_aib_settlement"
                        className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl font-mono"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Linked Validation Workflow Selection with Approval Hierarchy */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <GitBranch size={13} className="text-indigo-600" />
                    <span>Linked Validation Workflow</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Prioritizes Approved Production Workflows
                  </span>
                </div>

                <select
                  value={selectedWorkflowId}
                  onChange={(e) => setSelectedWorkflowId(e.target.value)}
                  className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- No Linked Validation Workflow --</option>
                  {sortedWorkflows.map(wf => (
                    <option key={wf.id} value={wf.id}>
                      {wf.status === 'APPROVED' ? '✓ [APPROVED]' : '⏳ [DRAFT]'} {wf.name} ({wf.id})
                    </option>
                  ))}
                </select>

                {/* Live Workflow Approval Indicator */}
                {selectedWorkflowId && (() => {
                  const wf = workflows.find(w => w.id === selectedWorkflowId);
                  const isApproved = wf?.status === 'APPROVED';
                  return (
                    <div className={`p-2 rounded-lg text-xs flex items-center justify-between border ${
                      isApproved 
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                      <div className="flex items-center gap-1.5 font-medium">
                        {isApproved ? (
                          <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle size={13} className="text-amber-600 shrink-0" />
                        )}
                        <span>
                          {isApproved 
                            ? 'Approved Production Workflow — Verified for automated task intake & pipeline validation'
                            : 'Unapproved / Draft Workflow — Caution: Rule execution requires manual review / sign-off'}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                        isApproved ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'
                      }`}>
                        {wf?.status || 'UNKNOWN'}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Criteria */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Discrepancy / Anomaly Detection Criteria
                </label>
                <input
                  type="text"
                  value={newCriteria}
                  onChange={(e) => setNewCriteria(e.target.value)}
                  placeholder="e.g. ref_num, card_num (for duplicates) or status = 'PENDING'"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* SQL Solution Template */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remediation SQL Template
                </label>
                <textarea
                  rows={3}
                  value={newSql}
                  onChange={(e) => setNewSql(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-900 text-emerald-400 rounded-xl font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingTag(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : editingTag ? 'Update Hashtag Preset' : 'Save Universal Preset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Share Hashtag Directive */}
      {showShareModal && sharingTag && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 flex flex-col space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5 text-blue-600">
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Share Hashtag Directive</h3>
                  <p className="text-xs text-slate-500 font-mono">{sharingTag.tag}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowShareModal(false);
                  setSharingTag(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Copy Section */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                1-Click Clipboard Actions
              </h4>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold font-mono text-indigo-900">{sharingTag.tag}</div>
                  <div className="text-[11px] text-slate-500">Universal hashtag directive identifier</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyTag(sharingTag.tag)}
                  className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                >
                  <Copy size={13} />
                  <span>Copy Tag</span>
                </button>
              </div>

              {sharingTag.solutionTemplate && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div className="truncate mr-3">
                    <div className="text-xs font-bold text-slate-800">Remediation SQL</div>
                    <div className="text-[11px] font-mono text-slate-500 truncate max-w-xs">{sharingTag.solutionTemplate}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(sharingTag.solutionTemplate || '');
                      showToast('Remediation SQL copied to clipboard!');
                    }}
                    className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs shrink-0 cursor-pointer"
                  >
                    <Copy size={13} />
                    <span>Copy SQL</span>
                  </button>
                </div>
              )}

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-800">Full JSON Specification</div>
                  <div className="text-[11px] text-slate-500">Configuration object with criteria and rules</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(JSON.stringify(sharingTag, null, 2));
                    showToast('Hashtag JSON specification copied to clipboard!');
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs cursor-pointer"
                >
                  <Copy size={13} />
                  <span>Copy JSON</span>
                </button>
              </div>
            </div>

            {/* Peer / Team Share Section */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowShareModal(false);
                  setShowShareAssetModal(true);
                }}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer flex items-center justify-center gap-2"
              >
                <Share2 size={14} />
                <span>Send to Teammate or Team Resource Center</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: ShareAssetModal for Peer / Team Resource Center Adoption */}
      {showShareAssetModal && sharingTag && (
        <ShareAssetModal
          isOpen={showShareAssetModal}
          onClose={() => {
            setShowShareAssetModal(false);
            setSharingTag(null);
          }}
          assetType="HASHTAG"
          assetId={sharingTag.tag}
          assetTitle={sharingTag.tag}
          assetDescription={sharingTag.description}
          previewDetails={{
            category: sharingTag.hashtagType || 'FILE_INGESTION',
            dbTarget: sharingTag.targetTableName || undefined,
            keys: sharingTag.expectedFileStructure || []
          }}
          currentUser={currentUser}
          onShareSuccess={() => {
            showToast(`Hashtag directive ${sharingTag.tag} shared successfully!`);
          }}
        />
      )}

      {/* Modal: Delete Confirmation */}
      {showDeleteConfirm && deletingTag && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 flex flex-col space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Delete Hashtag Directive</h3>
                <p className="text-xs text-slate-500">Permanent removal confirmation</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
              <div className="font-mono font-bold text-indigo-900">{deletingTag.tag}</div>
              <p className="text-slate-600">{deletingTag.description || 'No description provided.'}</p>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete this hashtag directive? This will permanently remove the preset from the database and detach any scheduled scan triggers.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletingTag(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 size={13} />
                <span>Delete Hashtag</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Data Transformation Dictionary Deferred Preview */}
      {showDataTransformModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 flex flex-col space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5 text-indigo-600">
                <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Data Transformation Dictionary</h3>
                  <p className="text-xs text-slate-500 font-mono">Phase 2 Architectural Module</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDataTransformModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1">
                <AlertTriangle size={13} className="text-amber-600" />
                <span>Transformation Dictionary Specification</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800">
                Custom arithmetic scaling, Regex masking, and dynamic rule-based dictionary transformations are managed centrally via the Global Standard Directory and Table Mappings.
              </p>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              For current workflows, you can utilize the <strong>Dictionary Lookup Mapping</strong> toggle in the form above to translate codes (e.g. <code>bank_code &rarr; bank_name</code>) against registered system tables like <code>bank_directory</code> and <code>iso_response_codes</code>.
            </p>

            <div className="flex items-center justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDataTransformModal(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
