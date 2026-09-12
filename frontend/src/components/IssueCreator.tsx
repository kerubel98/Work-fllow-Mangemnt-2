/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Issue, IssuePriority, HashtagPreset, Transaction, EnvironmentSystem, User, CriteriaRule } from '../types';
import { 
  FileText, Database, Layers, ArrowUpRight, HelpCircle, Check, AlertCircle, 
  RefreshCw, Download, UserCheck, ShieldCheck, Play, ArrowLeft, Table,
  Search, Eye, EyeOff, Trash2, Filter, ChevronDown, ChevronUp, User as UserIcon,
  CheckSquare, Sparkles, ExternalLink, Info, Grid, FileSpreadsheet, ListFilter, 
  SlidersHorizontal, CheckCircle2, ArrowRight, Eraser, Wand2, Edit3, Type, 
  CheckCheck, Undo2, X, MoreHorizontal, CheckCircle, BookmarkCheck, Save
} from 'lucide-react';
import { api } from '../api/client';
import { globalMappingService } from '../services/globalMappingService';

interface IssueCreatorProps {
  hashtags: HashtagPreset[];
  transactions: Transaction[];
  currentUser: { id: string; username: string; role: string };
  systems: EnvironmentSystem[];
  users: User[];
  onCreateIssue: (newIssue: Omit<Issue, 'id' | 'createdAt' | 'creatorId' | 'creatorName' | 'status'>) => void;
  activeTransactionForLinking?: Transaction | null;
  onClearLinkedTransaction?: () => void;
  onNavigateToWorkspace?: () => void;
}

export default function IssueCreator({
  hashtags,
  transactions,
  currentUser,
  systems,
  users,
  onCreateIssue,
  activeTransactionForLinking,
  onClearLinkedTransaction,
  onNavigateToWorkspace
}: IssueCreatorProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('Medium');
  const [type, setType] = useState<'file' | 'single'>('file');
  const [transactionId, setTransactionId] = useState('');
  const [linkedHashtag, setLinkedHashtag] = useState('Untagged');

  // Mapping Selection State (Default: No template selected, map to Global Standard)
  const [selectedMappingId, setSelectedMappingId] = useState<string>('');
  const [mappingTemplates, setMappingTemplates] = useState<any[]>([
    { id: 'tpl-1', name: 'Standard Payment Gateway CSV', sourceType: 'csv', description: 'Maps custom export column headers into global transaction keys', sampleHeaders: ['Txn_Ref', 'Card_Pan', 'Charge_Amt', 'Cust_Email', 'Auth_Date', 'Status_Code'] },
    { id: 'tpl-2', name: 'Stripe Dispute & Chargeback Export', sourceType: 'csv', description: 'Standard Stripe chargeback export format', sampleHeaders: ['charge_id', 'card_fingerprint', 'charge_amount', 'buyer_email', 'created_date', 'dispute_status'] },
    { id: 'tpl-3', name: 'Visa ISO 8583 Settlement Clearing', sourceType: 'csv', description: 'Visa ISO 8583 settlement clearing file format', sampleHeaders: ['Ref_Number', 'PAN_Masked', 'Txn_Val_USD', 'Cardholder_Mail', 'Iso_Timestamp', 'Iso_Resp'] }
  ]);

  const [standardDirectoryFields, setStandardDirectoryFields] = useState<any[]>(() => globalMappingService.getStandardFields());

  useEffect(() => {
    api.getTransactionSettings()
      .then(res => {
        if (res.templates && res.templates.length > 0) {
          // Merge server templates with defaults ensuring unique IDs
          const merged = [...res.templates];
          setMappingTemplates(merged);
        }
      })
      .catch(e => console.warn('Could not fetch mapping templates from server:', e));

    api.getGlobalSchemaConfig()
      .then(res => {
        if (res?.standardFields && Array.isArray(res.standardFields) && res.standardFields.length > 0) {
          setStandardDirectoryFields(res.standardFields);
          globalMappingService.updateStandardFields(res.standardFields);
        }
      })
      .catch(e => console.warn('Could not fetch global schema config in IssueCreator:', e));
  }, []);

  // Target Environment Configuration & Routing
  const [selectedSystemId, setSelectedSystemId] = useState('');
  const [selectedEnvironment, setSelectedEnvironment] = useState<'testing' | 'production'>('testing');
  const [selectedTable, setSelectedTable] = useState('');
  const [assignedTechUserId, setAssignedTechUserId] = useState('');

  // File Upload states
  const [fileName, setFileName] = useState('');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [fileMapping, setFileMapping] = useState<Record<string, string>>({});
  const [filePreviewData, setFilePreviewData] = useState<Record<string, any>[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Data View Table interactive states (similar to Workspace Table)
  const [dataViewMode, setDataViewMode] = useState<'workspace_table' | 'spreadsheet_grid'>('spreadsheet_grid');
  const [isDataViewTableVisible, setIsDataViewTableVisible] = useState<boolean>(true);
  const [dataViewSearch, setDataViewSearch] = useState<string>('');
  const [inspectingRowIndex, setInspectingRowIndex] = useState<number | null>(null);
  const [dataViewFilterColumn, setDataViewFilterColumn] = useState<string>('all');

  // Data Cleaning & Column Management states (matching Workspace)
  const [cleaningUndoSnapshot, setCleaningUndoSnapshot] = useState<{
    headers: string[];
    rows: Record<string, any>[];
    mapping: Record<string, string>;
  } | null>(null);
  const [cleaningActionSuccess, setCleaningActionSuccess] = useState<string | null>(null);
  const [editingColumnKey, setEditingColumnKey] = useState<string | null>(null);
  const [newColumnHeaderName, setNewColumnHeaderName] = useState<string>('');
  const [activeColumnMenu, setActiveColumnMenu] = useState<string | null>(null);

  // Save Mapping Template Modal States
  const [showSaveMappingModal, setShowSaveMappingModal] = useState<boolean>(false);
  const [saveMappingTemplateName, setSaveMappingTemplateName] = useState<string>('');
  const [saveMappingTemplateDesc, setSaveMappingTemplateDesc] = useState<string>('');
  const [isSavingMapping, setIsSavingMapping] = useState<boolean>(false);

  // Handler: Open Save Mapping Modal
  const handleOpenSaveMappingModal = () => {
    const defaultName = fileName
      ? `${fileName.replace(/\.[^/.]+$/, '')} Template`
      : `Custom Mapping ${new Date().toLocaleDateString()}`;
    setSaveMappingTemplateName(defaultName);
    const mappedCount = Object.keys(fileMapping).filter(k => fileMapping[k] && fileMapping[k] !== 'unmapped').length;
    setSaveMappingTemplateDesc(`Custom mapping configuration with ${mappedCount} mapped column headers.`);
    setShowSaveMappingModal(true);
  };

  // Handler: Save Current Mapping as a Template
  const handleSaveCurrentMapping = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedName = saveMappingTemplateName.trim();
    if (!trimmedName) {
      alert('Please enter a template name.');
      return;
    }

    setIsSavingMapping(true);
    try {
      const templatePayload = {
        id: `tpl-${Date.now()}`,
        name: trimmedName,
        description: saveMappingTemplateDesc.trim() || 'Custom schema mapping template',
        sourceType: 'csv',
        sampleHeaders: rawHeaders,
        columnMappings: fileMapping,
        updatedAt: new Date().toISOString()
      };

      // Attempt to save to API backend
      try {
        await api.saveTransactionTemplate(templatePayload);
      } catch (err) {
        console.warn('Saved template to local state (API fallback):', err);
      }

      // Update mappingTemplates state
      setMappingTemplates(prev => {
        const index = prev.findIndex(t => t.id === templatePayload.id || t.name.toLowerCase() === trimmedName.toLowerCase());
        if (index >= 0) {
          const updated = [...prev];
          updated[index] = templatePayload;
          return updated;
        }
        return [...prev, templatePayload];
      });

      setSelectedMappingId(templatePayload.id);
      setShowSaveMappingModal(false);

      const mappedCount = Object.keys(fileMapping).filter(k => fileMapping[k] && fileMapping[k] !== 'unmapped').length;
      setCleaningActionSuccess(`Mapping template "${trimmedName}" saved successfully! (${mappedCount} columns mapped).`);
      setTimeout(() => setCleaningActionSuccess(null), 5000);
    } catch (err: any) {
      alert('Failed to save mapping: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSavingMapping(false);
    }
  };

  // Helper to capture undo snapshot before performing data cleaning or mutations
  const captureUndoSnapshot = () => {
    setCleaningUndoSnapshot({
      headers: [...rawHeaders],
      rows: filePreviewData.map(r => ({ ...r })),
      mapping: { ...fileMapping }
    });
  };

  // Handler: Undo last data cleaning action
  const handleUndoCleaning = () => {
    if (!cleaningUndoSnapshot) return;
    setRawHeaders(cleaningUndoSnapshot.headers);
    setFilePreviewData(cleaningUndoSnapshot.rows);
    setFileMapping(cleaningUndoSnapshot.mapping);
    setCleaningUndoSnapshot(null);
    setCleaningActionSuccess('Reverted last data cleaning modification.');
    setTimeout(() => setCleaningActionSuccess(null), 3500);
  };

  // Handler: Delete / Remove a Column from the uploaded data view
  const handleDeleteColumn = (colKeyToDelete: string) => {
    if (rawHeaders.length === 0) return;
    captureUndoSnapshot();

    const updatedHeaders = rawHeaders.filter(h => h !== colKeyToDelete);
    const updatedRows = filePreviewData.map(row => {
      const copy = { ...row };
      delete copy[colKeyToDelete];
      return copy;
    });

    const updatedMapping = { ...fileMapping };
    delete updatedMapping[colKeyToDelete];

    setRawHeaders(updatedHeaders);
    setFilePreviewData(updatedRows);
    setFileMapping(updatedMapping);
    setActiveColumnMenu(null);
    setCleaningActionSuccess(`Removed column "${colKeyToDelete}" from dataset.`);
    setTimeout(() => setCleaningActionSuccess(null), 4000);
  };

  // Handler: Rename a Column in the uploaded data view
  const handleRenameColumn = (oldColKey: string, newColKey: string) => {
    const trimmed = newColKey.trim();
    if (!trimmed || trimmed === oldColKey) {
      setEditingColumnKey(null);
      return;
    }
    captureUndoSnapshot();

    const updatedHeaders = rawHeaders.map(h => (h === oldColKey ? trimmed : h));
    const updatedRows = filePreviewData.map(row => {
      const copy: Record<string, any> = {};
      Object.entries(row).forEach(([k, v]) => {
        if (k === oldColKey) {
          copy[trimmed] = v;
        } else {
          copy[k] = v;
        }
      });
      return copy;
    });

    const updatedMapping = { ...fileMapping };
    if (updatedMapping[oldColKey]) {
      updatedMapping[trimmed] = updatedMapping[oldColKey];
      delete updatedMapping[oldColKey];
    } else {
      updatedMapping[trimmed] = '';
    }

    setRawHeaders(updatedHeaders);
    setFilePreviewData(updatedRows);
    setFileMapping(updatedMapping);
    setEditingColumnKey(null);
    setNewColumnHeaderName('');
    setActiveColumnMenu(null);
    setCleaningActionSuccess(`Renamed column "${oldColKey}" to "${trimmed}".`);
    setTimeout(() => setCleaningActionSuccess(null), 4000);
  };

  // Handler: Transform column values (Trim whitespace, Uppercase, Lowercase, Remove Special Chars, Format Decimals, Clean Empty to Null, Mask PAN)
  const handleTransformColumn = (
    colKey: string,
    transformType: 'trim' | 'uppercase' | 'lowercase' | 'strip_special' | 'number_clean' | 'fill_blanks' | 'mask_card'
  ) => {
    if (filePreviewData.length === 0) return;
    captureUndoSnapshot();

    let affectedCount = 0;
    const updatedRows = filePreviewData.map(row => {
      const copy = { ...row };
      const val = copy[colKey];
      if (val !== undefined && val !== null) {
        const str = String(val);
        let transformed: any = str;

        if (transformType === 'trim') {
          transformed = str.trim();
        } else if (transformType === 'uppercase') {
          transformed = str.toUpperCase().trim();
        } else if (transformType === 'lowercase') {
          transformed = str.toLowerCase().trim();
        } else if (transformType === 'strip_special') {
          transformed = str.replace(/[^\w\s.-]/gi, '').trim();
        } else if (transformType === 'number_clean') {
          const cleanedNum = str.replace(/[^0-9.-]/g, '');
          const num = parseFloat(cleanedNum);
          transformed = isNaN(num) ? '0.00' : num.toFixed(2);
        } else if (transformType === 'fill_blanks') {
          if (!str || str.trim() === '' || str.toLowerCase() === 'null' || str === '-') {
            transformed = 'N/A';
          }
        } else if (transformType === 'mask_card') {
          const digitsOnly = str.replace(/\D/g, '');
          if (digitsOnly.length >= 12) {
            transformed = `${digitsOnly.slice(0, 4)}********${digitsOnly.slice(-4)}`;
          }
        }

        if (transformed !== val) affectedCount++;
        copy[colKey] = transformed;
      }
      return copy;
    });

    setFilePreviewData(updatedRows);
    setActiveColumnMenu(null);
    setCleaningActionSuccess(`Cleaned ${affectedCount} values in "${colKey}" using ${transformType.replace('_', ' ')}.`);
    setTimeout(() => setCleaningActionSuccess(null), 4000);
  };

  // Handler: Global Dataset Cleaning (Trim all, strip empty rows, deduplicate)
  const handleGlobalDatasetClean = (action: 'trim_all' | 'remove_empty_rows' | 'deduplicate') => {
    if (filePreviewData.length === 0) return;
    captureUndoSnapshot();

    let cleanedRows = [...filePreviewData];
    let msg = '';

    if (action === 'trim_all') {
      cleanedRows = cleanedRows.map(row => {
        const copy: Record<string, any> = {};
        Object.entries(row).forEach(([k, v]) => {
          copy[k] = typeof v === 'string' ? v.trim() : v;
        });
        return copy;
      });
      msg = `Trimmed whitespace across all ${rawHeaders.length} columns and ${cleanedRows.length} rows.`;
    } else if (action === 'remove_empty_rows') {
      const initialCount = cleanedRows.length;
      cleanedRows = cleanedRows.filter(row => {
        return Object.values(row).some(v => v !== undefined && v !== null && String(v).trim() !== '' && String(v) !== '-');
      });
      const removed = initialCount - cleanedRows.length;
      msg = `Filtered dataset: Removed ${removed} completely empty rows (${cleanedRows.length} remaining).`;
    } else if (action === 'deduplicate') {
      const initialCount = cleanedRows.length;
      const seen = new Set<string>();
      cleanedRows = cleanedRows.filter(row => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const removed = initialCount - cleanedRows.length;
      msg = `Deduplicated records: Removed ${removed} duplicate rows (${cleanedRows.length} unique rows remaining).`;
    }

    setFilePreviewData(cleanedRows);
    setCleaningActionSuccess(msg);
    setTimeout(() => setCleaningActionSuccess(null), 4500);
  };

  const handleDeleteRow = (indexToDelete: number) => {
    setFilePreviewData(prev => prev.filter((_, idx) => idx !== indexToDelete));
  };

  const handleClearAllRows = () => {
    if (window.confirm('Are you sure you want to clear all loaded preview rows?')) {
      setFilePreviewData([]);
      setFileName('');
      setRawHeaders([]);
    }
  };

  // Drag and drop event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const processUploadedFile = (file: File) => {
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        let headers: string[] = [];
        let parsedRows: Record<string, any>[] = [];

        if (isExcel) {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            alert('The uploaded Excel file has no sheets.');
            return;
          }
          const worksheet = workbook.Sheets[firstSheetName];
          const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          if (rawRows.length === 0) {
            alert('The uploaded Excel file is empty.');
            return;
          }

          // Filter out completely empty header entries
          headers = (rawRows[0] || []).map(h => String(h || '').trim()).filter(h => h !== '');
          if (headers.length === 0) {
            alert('No headers detected in the first row of the uploaded Excel file.');
            return;
          }

          // Parse all data rows (up to 10,000) for full dataset ingestion
          const maxExcelRows = Math.min(rawRows.length, 10001);
          for (let i = 1; i < maxExcelRows; i++) {
            const rowValues = rawRows[i] || [];
            const rowObj: Record<string, any> = {};
            headers.forEach((h, idx) => {
              rowObj[h] = rowValues[idx] !== undefined && rowValues[idx] !== null ? String(rowValues[idx]).trim() : '';
            });
            parsedRows.push(rowObj);
          }
        } else {
          const text = event.target?.result as string;
          if (!text) return;

          const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
          if (lines.length === 0) {
            alert('The uploaded file is empty.');
            return;
          }

          // First line is headers
          const firstLine = lines[0];
          // Simple CSV parsing (split by comma, account for optional quotes)
          const parseCsvLine = (line: string): string[] => {
            const result: string[] = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }
            result.push(current.trim());
            return result;
          };

          headers = parseCsvLine(firstLine).map(h => h.replace(/^"|"$/g, '').trim()).filter(h => h !== '');
          if (headers.length === 0) {
            alert('No headers detected in the first line of the uploaded file.');
            return;
          }

          // Parse all data rows (up to 10,000) for full dataset ingestion
          const maxCsvLines = Math.min(lines.length, 10001);
          for (let i = 1; i < maxCsvLines; i++) {
            const rowValues = parseCsvLine(lines[i]).map(v => v.replace(/^"|"$/g, '').trim());
            const rowObj: Record<string, any> = {};
            headers.forEach((h, idx) => {
              rowObj[h] = rowValues[idx] || '';
            });
            parsedRows.push(rowObj);
          }
        }

        setFileName(file.name);
        setRawHeaders(headers);
        setFilePreviewData(parsedRows);

        // Auto-map based on headers keywords and Global Standard Column Dictionary
        setFileMapping(autoGenerateColumnMapping(headers));
      } catch (err: any) {
        console.error(err);
        alert(`Failed to parse file: ${err.message || err}`);
      }
    };

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  // Validation Check Status
  const [validationStatus, setValidationStatus] = useState<'untested' | 'passed' | 'failed'>('untested');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Global Standard Column Dictionary fields for target schema mapping
  const globalStandardFields = standardDirectoryFields.length > 0
    ? standardDirectoryFields
    : globalMappingService.getStandardFields();

  const DB_SCHEMA_FIELDS = globalStandardFields.map(f => ({
    key: f.key,
    label: `${f.label} (${f.dataType})${f.required ? ' *' : ''}`,
    name: f.label,
    dataType: f.dataType,
    category: f.category || 'General',
    required: f.required
  }));

  // Auto-generate column mapping helper using domain-aware banking synonyms & Global Standard Dictionary
  const autoGenerateColumnMapping = (headers: string[]): Record<string, string> => {
    return globalMappingService.autoGenerateColumnMapping(headers, globalStandardFields);
  };

  const handleAutoMapAllColumns = async () => {
    if (rawHeaders.length === 0) return;
    let fields = globalStandardFields;
    if (!fields || fields.length === 0) {
      try {
        const res = await api.getGlobalSchemaConfig();
        if (res?.standardFields && res.standardFields.length > 0) {
          fields = res.standardFields;
          setStandardDirectoryFields(fields);
          globalMappingService.updateStandardFields(fields);
        }
      } catch (err) {
        console.warn('Could not load schema config on auto map:', err);
      }
    }
    const generated = globalMappingService.autoGenerateColumnMapping(rawHeaders, fields);
    setFileMapping(generated);
    const count = Object.values(generated).filter(v => v && v !== 'unmapped' && v.trim() !== '').length;
    setCleaningActionSuccess(`Auto-mapped ${count} of ${rawHeaders.length} columns based on Global Standard Directory.`);
    setTimeout(() => setCleaningActionSuccess(null), 3500);
  };

  // Filter systems based on user's privilege
  const allowedSystems = systems.filter(sys => {
    if (currentUser.role === 'admin') return true;
    const roleMatch = sys.allowedRoles.includes(currentUser.role as any);
    const userMatch = sys.allowedUserIds.includes(currentUser.id);
    return roleMatch || userMatch;
  });

  // Filter users for routing assignment
  const technicalUsers = users.filter(u => u.isApproved);

  // Sync state if user clicked "Link Issue" on a transaction explorer
  useEffect(() => {
    if (activeTransactionForLinking) {
      setType('single');
      setTransactionId(activeTransactionForLinking.id);
    }
  }, [activeTransactionForLinking]);

  // Handle system selection cascade
  useEffect(() => {
    if (allowedSystems.length > 0 && !selectedSystemId) {
      setSelectedSystemId(allowedSystems[0].id);
    }
  }, [allowedSystems, selectedSystemId]);

  // Handle table default on environment/system change
  useEffect(() => {
    const sys = allowedSystems.find(s => s.id === selectedSystemId);
    if (sys) {
      const allowedTables = selectedEnvironment === 'testing' ? sys.testing.allowedTables : sys.production.allowedTables;
      if (allowedTables && allowedTables.length > 0) {
        setSelectedTable(allowedTables[0]);
      } else {
        setSelectedTable('');
      }
    }
  }, [selectedSystemId, selectedEnvironment]);

  // Execute validation automatically on hashtag or file preview update
  useEffect(() => {
    if (type !== 'file' || !linkedHashtag) {
      setValidationStatus('untested');
      setValidationErrors([]);
      return;
    }

    const preset = hashtags.find(h => h.tag === linkedHashtag);
    if (!preset) {
      setValidationStatus('untested');
      setValidationErrors([]);
      return;
    }

    if (rawHeaders.length === 0) {
      setValidationStatus('failed');
      setValidationErrors(['No reconciliation file has been supplied yet. Please upload a template or select a simulation preset.']);
      return;
    }

    // Run actual validation check with criteria
    const errors: string[] = [];

    // 1. Column Header check
    preset.expectedFileStructure.forEach(expectedCol => {
      const columnFound = rawHeaders.some(h => h.toLowerCase().replace(/_|\s/g, '') === expectedCol.toLowerCase().replace(/_|\s/g, ''));
      if (!columnFound) {
        errors.push(`Validation Failure: Missing expected column header "${expectedCol}"`);
      }
    });

    // 2. Data row level criteria checks
    if (filePreviewData.length === 0) {
      errors.push('Reconciliation File contains no data rows.');
    } else if (preset.criteriaRules) {
      filePreviewData.forEach((row, idx) => {
        preset.criteriaRules!.forEach(rule => {
          // Find matching key in row with loose casing/separator rules
          const rowKey = Object.keys(row).find(k => k.toLowerCase().replace(/_|\s/g, '') === rule.column.toLowerCase().replace(/_|\s/g, ''));
          const val = rowKey ? row[rowKey] : undefined;

          if (rule.operator === 'is_required') {
            if (val === undefined || val === null || String(val).trim() === '') {
              errors.push(`Row ${idx + 1}: Required field "${rule.column}" is missing or empty.`);
            }
          } else if (rule.operator === 'must_be_numeric') {
            if (val !== undefined && isNaN(Number(val))) {
              errors.push(`Row ${idx + 1}: Field "${rule.column}" must be a numeric value (got "${val}").`);
            }
          } else if (rule.operator === 'value_greater_than') {
            const num = Number(val);
            if (val !== undefined && (isNaN(num) || num <= Number(rule.value || 0))) {
              errors.push(`Row ${idx + 1}: Field "${rule.column}" must be greater than ${rule.value} (got "${val}").`);
            }
          }
        });
      });
    }

    if (errors.length === 0) {
      setValidationStatus('passed');
      setValidationErrors([]);
    } else {
      setValidationStatus('failed');
      setValidationErrors(errors);
    }

  }, [linkedHashtag, rawHeaders, filePreviewData, type, hashtags]);

  // Browser simulated CSV download of criteria templates
  const handleDownloadTemplate = () => {
    const preset = hashtags.find(h => h.tag === linkedHashtag);
    if (!preset) return;

    const headers = preset.expectedFileStructure;
    const rows = preset.fileTemplateData || [];
    
    const csvRows = [headers.join(',')];
    rows.forEach(row => {
      const values = headers.map(header => {
        const val = row[header] || '';
        return `"${val.replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${preset.tag.replace('#', '').toLowerCase()}_reconciliation_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle mock file selection
  const handleSimulateFileUpload = (preset: string) => {
    let headers: string[] = [];
    let name = '';
    let preview: Record<string, any>[] = [];

    if (preset === 'amazon') {
      name = 'amazon_txn_discrepancy.csv';
      headers = ['Transaction_ID', 'Card_Number', 'Amount_USD', 'Auth_Time'];
      preview = [
        { Transaction_ID: 'TXN-9021', Card_Number: '4111********9982', Amount_USD: '149.99', Auth_Time: '2026-07-11T04:12:00Z' },
        { Transaction_ID: 'TXN-9022', Card_Number: '4111********9982', Amount_USD: '149.99', Auth_Time: '2026-07-11T04:12:30Z' }
      ];
      setLinkedHashtag('#DUPLICATE_AUTH');
    } else if (preset === 'pos_terminal') {
      name = 'stuck_pos_term_80.csv';
      headers = ['Transaction_ID', 'Terminal_ID', 'Stuck_Hours'];
      preview = [
        { Transaction_ID: 'TXN-8840', Terminal_ID: 'TERM-08', Stuck_Hours: '26' }
      ];
      setLinkedHashtag('#STUCK_PENDING');
    } else {
      name = 'custom_financial_dump.csv';
      headers = ['Transaction_ID', 'Card_Number', 'Amount_USD', 'Auth_Time'];
      // Intentionally break CVV/ mising ID criteria for custom simulation to demonstrate live validation failures!
      preview = [
        { Transaction_ID: '', Card_Number: '4509********4421', Amount_USD: '-10.50', Auth_Time: '2026-07-09T23:55:00Z' }
      ];
      setLinkedHashtag('#DUPLICATE_AUTH');
    }

    setFileName(name);
    setRawHeaders(headers);
    setFilePreviewData(preview);

    // Auto-map based on Global Standard Column Dictionary
    setFileMapping(autoGenerateColumnMapping(headers));
  };

  const handleMapChange = (rawHeader: string, schemaField: string) => {
    setFileMapping(prev => ({
      ...prev,
      [rawHeader]: schemaField
    }));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    // Strict Global Mapping Gate Check: All required global schema columns must be mapped
    if (type === 'file' && filePreviewData.length > 0) {
      const requiredCheck = globalMappingService.validateRequiredColumns(fileMapping, globalStandardFields);
      if (!requiredCheck.isValid) {
        alert(`Strict Mapping Gate Error:\nCannot create task because the following required Global Columns are not mapped:\n\n• ${requiredCheck.missingRequiredLabels.join('\n• ')}\n\nPlease map these columns to proceed.`);
        return;
      }
    }

    const chosenTech = technicalUsers.find(u => u.id === assignedTechUserId);
    const generatedTaskId = `ISSUE-${Math.floor(1000 + Math.random() * 9000)}`;

    // 1. If uploading a file case, persist transactions into the Working Database
    if (type === 'file' && filePreviewData.length > 0) {
      const recordsToStore = filePreviewData.map((row, idx) => ({
        rawRecord: row,
        mappedData: {
          transaction_id: row.Transaction_ID || row.charge_id || row.Ref_Number || `TXN-${Date.now()}-${idx + 1}`,
          card_number: row.Card_Number || row.card_fingerprint || row.PAN_Masked || '4111********9982',
          amount_usd: parseFloat(String(row.Amount_USD || row.charge_amount || row.Txn_Val_USD || '0').replace(/[^0-9.]/g, '')) || 0,
          currency: 'USD',
          customer_email: row.Customer_Email || row.buyer_email || row.Cardholder_Mail || 'customer@paymentops.com',
          merchant_id: row.Merchant_ID || row.merchant_account || row.Term_ID || 'MERCH-MAIN',
          auth_time: row.Auth_Time || row.created_date || row.Iso_Timestamp || new Date().toISOString(),
          status: String(row.Status || row.dispute_status || row.Txn_State || 'AUTHORIZED').toUpperCase(),
          response_code: row.Response_Code || row.Iso_Resp || '00',
          category: linkedHashtag || 'BATCH_CASE_FILE'
        }
      }));

      const selectedTplObj = mappingTemplates.find(t => t.id === selectedMappingId);
      const activeTplName = selectedTplObj ? selectedTplObj.name : (selectedMappingId ? `Mapping ${selectedMappingId}` : 'Global Standard Mapping');

      api.uploadTransactionsToWorkingDb({
        filename: fileName || 'uploaded_case_file.csv',
        uploadedBy: currentUser.username,
        records: recordsToStore,
        templateName: activeTplName
      }).catch(err => console.warn('Working DB upload background warning:', err));

      // 2. PERSIST INTO CENTRALIZED WORKSPACE TABLE (file_name, user, tag, task_id, transformed global schema columns)
      const workspaceTableRecords = filePreviewData.map((row, idx) => {
        // Transform the row using the chosen mapping into the canonical Global Standard Schema fields
        const transformedRow = globalMappingService.transformRowToGlobalSchema(row, fileMapping);
        const rowValues = Object.values(transformedRow).map(v => String(v !== undefined && v !== null ? v : ''));

        return {
          id: `wtr-${Date.now()}-${idx + 1}-${Math.random().toString(36).substring(2, 6)}`,
          file_name: fileName || 'uploaded_reconciliation_batch.csv',
          user: currentUser.username || currentUser.id || 'anonymous_user',
          user_id: currentUser.id || currentUser.username,
          tag: linkedHashtag || 'Untagged',
          task_id: generatedTaskId,
          mapping_id: selectedMappingId || 'global-standard',
          mapping_name: activeTplName,
          transformed_data: transformedRow,
          raw_data: row,
          list_of_values_from_one_row: rowValues,
          createdAt: new Date().toISOString()
        };
      });

      // Save to localStorage
      try {
        const savedWs = localStorage.getItem('workspace_table_records');
        const existingRecords = savedWs ? JSON.parse(savedWs) : [];
        const mergedRecords = [...workspaceTableRecords, ...existingRecords];
        localStorage.setItem('workspace_table_records', JSON.stringify(mergedRecords));
      } catch (err) {
        console.warn('LocalStorage save error for workspace_table_records:', err);
      }

      // Save to backend API
      api.saveWorkspaceTableRecords(workspaceTableRecords).catch(err => {
        console.warn('Backend saveWorkspaceTableRecords error:', err);
      });
    }

    // Transform preview rows so firstLevelMappedData only contains mapped values and columns
    const mappedRowsForTask = filePreviewData.length > 0 && Object.keys(fileMapping).length > 0
      ? filePreviewData.map(row => globalMappingService.transformRowToGlobalSchema(row, fileMapping, globalStandardFields))
      : filePreviewData;

    onCreateIssue({
      title: title.trim(),
      description: description.trim(),
      priority,
      type: 'file',
      uploadedFileName: fileName || undefined,
      uploadedFileHeaders: rawHeaders.length > 0 ? rawHeaders : undefined,
      fileMapping: Object.keys(fileMapping).length > 0 ? fileMapping : undefined,
      firstLevelMappedData: mappedRowsForTask.length > 0 ? mappedRowsForTask : undefined,
      linkedHashtag: linkedHashtag || undefined,
      investigationSystemId: selectedSystemId || undefined,
      investigationEnvironment: selectedEnvironment,
      investigationTable: selectedTable || undefined,
      validationStatus,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
      assignedTechUserId: assignedTechUserId || undefined,
      assignedTechUserName: chosenTech ? chosenTech.username : undefined
    });

    // Reset Form
    setTitle('');
    setDescription('');
    setPriority('Medium');
    setTransactionId('');
    setLinkedHashtag('Untagged');
    setFileName('');
    setRawHeaders([]);
    setFileMapping({});
    setFilePreviewData([]);
    setAssignedTechUserId('');
    setValidationStatus('untested');
    setValidationErrors([]);
    if (onClearLinkedTransaction) onClearLinkedTransaction();
  };

  // Handler: Remove uploaded file / data
  const handleRemoveUploadedFile = () => {
    setFileName('');
    setRawHeaders([]);
    setFilePreviewData([]);
    setFileMapping({});
    setCleaningUndoSnapshot(null);
    setCleaningActionSuccess('Uploaded reconciliation dataset removed.');
    setTimeout(() => setCleaningActionSuccess(null), 3000);
    setDataViewSearch('');
    setValidationStatus('untested');
    setValidationErrors([]);
    const fileInput = document.getElementById('real-file-upload-input') as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';
  };

  const activeHashtagPreset = hashtags.find(h => h.tag === linkedHashtag);

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm" id="issue-creator">
      <div className="border-b border-slate-200 pb-3.5 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Create Operations Discrepancy Case</h3>
          <p className="text-xs text-slate-500">Upload batch reconciliation files and map against template schemas for technical investigation.</p>
        </div>
        {onNavigateToWorkspace && (
          <button
            type="button"
            onClick={onNavigateToWorkspace}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors self-start sm:self-center cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Back to Workspace</span>
          </button>
        )}
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-4">
        
        <div className="space-y-4">
          
          {/* Row 1: Case / Task Title + Category / Hashtag Inline */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 font-mono">CASE / TASK TITLE *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief summary e.g. Visa Reversal mismatch"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="space-y-1.5 md:col-span-1">
              <label className="block text-xs font-bold text-slate-700 font-mono">CATEGORY / HASHTAG (#)</label>
              <select
                value={linkedHashtag}
                onChange={(e) => setLinkedHashtag(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 cursor-pointer font-medium"
              >
                <option value="Untagged">🏷️ Untagged</option>
                {hashtags.map(h => (
                  <option key={h.tag} value={h.tag}>{h.tag} ({h.tag.replace('#', '')})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Criticality + Dispatch Assignment */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 font-mono">CRITICALITY</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as IssuePriority)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 cursor-pointer"
              >
                <option value="Low">Low (No SLA impact)</option>
                <option value="Medium">Medium (Discrepancy audit)</option>
                <option value="High">High (Settlement failure)</option>
                <option value="Critical">Critical (Double charges / Outage)</option>
              </select>
            </div>

            {/* Dispatch Assignment */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 font-mono">DISPATCH ASSIGNMENT *</label>
              <select
                value={assignedTechUserId}
                onChange={(e) => setAssignedTechUserId(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 cursor-pointer"
              >
                <option value="">-- Assign to Technical User --</option>
                {technicalUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.username} ({u.role.toUpperCase()})</option>
                ))}
              </select>
            </div>
          </div>

        </div>

        {/* Case Description */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-slate-700 font-mono">FAULT DESCRIPTION & INVESTIGATION NOTES *</label>
          <textarea
            required
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the transaction discrepancy details, terminal code, card digits or merchant response issues."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* Dedicated File Upload Section with Mapping Selector */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div className="flex items-center space-x-2">
              <FileText className="text-blue-600" size={16} />
              <span className="text-xs font-bold text-slate-800 font-mono uppercase tracking-wider">
                File Upload & Mapping Selection
              </span>
            </div>
            <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-mono font-semibold">
              Persists to Workspace Table
            </span>
          </div>

          <div className="space-y-4">
            
            {/* Mapping Template Selection Control - Shows ALL available template options */}
            <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-800 font-mono uppercase flex items-center space-x-1.5">
                  <Layers size={14} className="text-blue-600" />
                  <span>Choose Mapping Template for File Upload *</span>
                </label>
                <span className="text-[10px] font-mono text-slate-500">
                  Available Templates: <strong className="text-blue-600">{mappingTemplates.length}</strong>
                </span>
              </div>
              <select
                value={selectedMappingId}
                onChange={(e) => {
                  const newTplId = e.target.value;
                  setSelectedMappingId(newTplId);
                  if (newTplId) {
                    const selectedTpl = mappingTemplates.find(t => t.id === newTplId);
                    if (selectedTpl && selectedTpl.sampleHeaders && selectedTpl.sampleHeaders.length > 0 && rawHeaders.length === 0) {
                      setRawHeaders(selectedTpl.sampleHeaders);
                      setFileName(`template_${selectedTpl.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.${selectedTpl.sourceType || 'csv'}`);
                    }
                    if (selectedTpl && selectedTpl.columnMappings && Object.keys(selectedTpl.columnMappings).length > 0) {
                      setFileMapping(selectedTpl.columnMappings);
                    }
                  } else {
                    // Reset to Global Standard Mapping
                    if (rawHeaders.length > 0) {
                      setFileMapping(autoGenerateColumnMapping(rawHeaders));
                    }
                  }
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-sans cursor-pointer"
              >
                <option value="">-- No Template (Map to Global Standard) --</option>
                {mappingTemplates.map(tpl => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} — [Format: {(tpl.sourceType || 'csv').toUpperCase()}] {tpl.isDefault ? '(Default Workspace Template)' : ''} (ID: {tpl.id})
                  </option>
                ))}
              </select>

              {/* Selected Template Details Card */}
              {(() => {
                const currentTpl = mappingTemplates.find(t => t.id === selectedMappingId);
                if (!currentTpl) return null;
                return (
                  <div className="p-2.5 bg-blue-50/70 border border-blue-100 rounded-lg text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="font-bold text-blue-900 flex items-center space-x-2">
                        <span>{currentTpl.name}</span>
                        <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono uppercase font-semibold">
                          {currentTpl.sourceType || 'CSV'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-tight">
                        {currentTpl.description || 'Configured column mapping rules template.'}
                      </p>
                    </div>
                    {currentTpl.sampleHeaders && currentTpl.sampleHeaders.length > 0 && (
                      <div className="text-[10px] font-mono text-slate-600 bg-white border border-blue-200/80 px-2.5 py-1 rounded-md shrink-0">
                        Sample Headers: <span className="text-blue-950 font-semibold">{currentTpl.sampleHeaders.slice(0, 4).join(', ')}{currentTpl.sampleHeaders.length > 4 ? '...' : ''}</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              <p className="text-[10px] text-slate-500">
                Uploaded rows will be mapped using this template and stored in the workspace table under columns: <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">file_name</code>, <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">list_of_values_from_one_row</code>, <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">mapping_id</code>, <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">user_id</code>, <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">task_id</code>.
              </p>
            </div>

            {/* Active Preset Information & Template Downloads */}
            {activeHashtagPreset && (
              <div className="p-3 bg-white border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs shadow-sm">
                <div className="space-y-1">
                  <span className="text-blue-700 font-bold font-mono text-[11px] block">
                    Hashtag Criteria Enforced: {activeHashtagPreset.tag}
                  </span>
                  <p className="text-[10px] text-slate-600 leading-relaxed">
                    {activeHashtagPreset.description}
                  </p>
                  <div className="text-[9px] font-mono text-slate-500">
                    Expected Headers: {activeHashtagPreset.expectedFileStructure.join(', ')}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-[10px] transition-colors cursor-pointer self-start md:self-center font-mono font-bold"
                >
                  <Download size={12} />
                  <span>Download CSV Template</span>
                </button>
              </div>
            )}

            {/* REAL DRAG & DROP FILE UPLOAD AREA */}
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('real-file-upload-input')?.click()}
              className={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center space-y-2 cursor-pointer transition-all ${
                isDragging 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'
              }`}
            >
              <input 
                type="file" 
                id="real-file-upload-input" 
                accept=".csv,.txt,.xlsx,.xls" 
                className="hidden" 
                onChange={handleFileChange}
              />
              <FileText size={28} className={isDragging ? 'text-blue-600 animate-bounce' : 'text-slate-400'} />
              <div className="text-center">
                <span className="text-xs font-semibold text-slate-700 block">
                  {fileName ? `Loaded File: ${fileName}` : 'Drag & Drop Reconciliation file here'}
                </span>
                <span className="text-[10px] text-slate-400">
                  or click to browse desktop files (supports .csv, .txt, .xlsx, .xls formats)
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2 my-2">
              <div className="h-px bg-slate-200 flex-grow" />
              <span className="text-[9px] font-mono text-slate-400 uppercase">Or select a simulation template</span>
              <div className="h-px bg-slate-200 flex-grow" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleSimulateFileUpload('amazon')}
                className="p-3 bg-white hover:bg-blue-50/50 rounded-xl border border-slate-200 hover:border-blue-300 text-left transition-colors space-y-1 group text-xs cursor-pointer shadow-sm"
              >
                <span className="font-semibold text-slate-800 group-hover:text-blue-600 block transition-colors">
                  Double-Charge Batch CSV
                </span>
                <span className="text-[9px] text-slate-500 font-mono">amazon_txn_discrepancy.csv</span>
              </button>
              <button
                type="button"
                onClick={() => handleSimulateFileUpload('pos_terminal')}
                className="p-3 bg-white hover:bg-blue-50/50 rounded-xl border border-slate-200 hover:border-blue-300 text-left transition-colors space-y-1 group text-xs cursor-pointer shadow-sm"
              >
                <span className="font-semibold text-slate-800 group-hover:text-blue-600 block transition-colors">
                  Terminal Stuck Batch
                </span>
                <span className="text-[9px] text-slate-500 font-mono">stuck_pos_term_80.csv</span>
              </button>
              <button
                type="button"
                onClick={() => handleSimulateFileUpload('custom')}
                className="p-3 bg-white hover:bg-rose-50/50 rounded-xl border border-rose-200 hover:border-rose-300 text-left transition-colors space-y-1 group text-xs cursor-pointer shadow-sm"
              >
                <span className="font-semibold text-rose-600 group-hover:text-rose-700 block transition-colors">
                  Broken Reconcile Dump
                </span>
                <span className="text-[9px] text-rose-500 font-mono">Simulate Validation Fail</span>
              </button>
            </div>

            {fileName && (
              <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3.5 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center space-x-2">
                    <FileText size={16} className="text-blue-600" />
                    <span className="text-xs font-bold text-slate-800">{fileName}</span>
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono font-semibold">
                      {filePreviewData.length} Rows · {rawHeaders.length} Cols
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleRemoveUploadedFile}
                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 shadow-2xs flex items-center space-x-1 transition-all cursor-pointer"
                      title="Remove uploaded data file"
                    >
                      <Trash2 size={12} className="text-rose-600" />
                      <span>Remove Uploaded Data</span>
                    </button>
                  </div>
                </div>

                {/* LIVE VALIDATION CHECK STATUS */}
                {linkedHashtag && (
                  <div className={`p-3 border rounded-lg text-xs space-y-1.5 ${
                    validationStatus === 'passed'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}>
                    <div className="flex items-center justify-between font-mono font-bold">
                      <div className="flex items-center gap-1.5">
                        {validationStatus === 'passed' ? <Check size={14} className="text-emerald-600" /> : <AlertCircle size={14} className="text-rose-600" />}
                        <span>HASHTAG CRITERIA AUTO-CHECK</span>
                      </div>
                      <span className={`px-1.5 py-0.2 rounded uppercase text-[10px] ${
                        validationStatus === 'passed' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {validationStatus}
                      </span>
                    </div>

                    {validationStatus === 'failed' ? (
                      <div className="space-y-1 text-[11px] leading-normal font-mono list-disc pl-4 text-rose-700 max-h-[100px] overflow-y-auto">
                        {validationErrors.map((err, index) => (
                          <div key={index}>• {err}</div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] leading-relaxed text-emerald-700">
                        ✓ All columns matched. Content verified against validation rule criteria bounds. Safe to commit.
                      </p>
                    )}
                  </div>
                )}

                {/* WORKSPACE-STYLE DATA VIEW & DATA CLEANING TABLE */}
                <div className="space-y-4 pt-2">
                  {/* Top Workspace Banner */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3.5 p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl text-white shadow-md">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <Table className="text-blue-400" size={18} />
                        <h3 className="text-sm font-bold tracking-tight">Workspace Data View Table</h3>
                        <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2.5 py-0.5 rounded-full font-mono font-bold">
                          {filePreviewData.length} Row Entries Loaded
                        </span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-mono font-semibold">
                          Target Mapping: {selectedMappingId}
                        </span>
                        <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-400/30 px-2 py-0.5 rounded-full font-mono font-semibold">
                          {Object.keys(fileMapping).filter(k => fileMapping[k]).length} of {rawHeaders.length} Columns Mapped
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">
                        Header-integrated mapping and data cleaning controls. Clean cells, transform column data, or assign target schema fields directly in the table header.
                      </p>
                    </div>

                    {/* View Mode Toggle Buttons */}
                    <div className="flex items-center space-x-1.5 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80 shrink-0 self-start md:self-auto">
                      <button
                        type="button"
                        onClick={() => setDataViewMode('spreadsheet_grid')}
                        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          dataViewMode === 'spreadsheet_grid'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                        }`}
                      >
                        <FileSpreadsheet size={13} />
                        <span>Spreadsheet Grid</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDataViewMode('workspace_table')}
                        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          dataViewMode === 'workspace_table'
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                        }`}
                      >
                        <Layers size={13} />
                        <span>Workspace Format</span>
                      </button>
                    </div>
                  </div>

                  {/* PRE-FLIGHT VALIDATION & UPFRONT BATCHING BREAKDOWN */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-white shadow-md">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                          Pre-Flight Ingestion, Transformation & Batching Plan
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                          {Math.ceil(filePreviewData.length / 500)} Pre-Created Batches (500 rows/batch)
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          Central Repository Upsert & Duplicate Detection
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 text-xs">
                      <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase">1. Field Existence</span>
                        <span className="text-emerald-400 font-semibold font-mono text-[11px]">
                          {rawHeaders.some(h => /txn|id|ref/i.test(h)) ? '✓ Transaction ID Detected' : '⚠ Synthetic Key Generated'}
                        </span>
                      </div>
                      <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase">2. Standard Transformations</span>
                        <span className="text-cyan-400 font-semibold font-mono text-[11px]">
                          ✓ Dates Standardized to ISO-8601 & Amounts to Numeric
                        </span>
                      </div>
                      <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase">3. Central History</span>
                        <span className="text-purple-400 font-semibold font-mono text-[11px]">
                          Cross-Task Tracking: Re-used IDs flag former task context
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* STRICT GLOBAL MAPPING STATUS & MINIMUM REQUIRED COLUMNS CHECK */}
                  {(() => {
                    const reqValidation = globalMappingService.validateRequiredColumns(fileMapping);
                    const standardFields = globalMappingService.getStandardFields();
                    const requiredFields = standardFields.filter(f => f.required);

                    // Find date format analysis for any column mapped to 'created_at' or another date field
                    const dateMappedHeader = Object.keys(fileMapping).find(h => {
                      const target = fileMapping[h];
                      const f = standardFields.find(sf => sf.key === target);
                      return f && f.dataType === 'date';
                    });

                    const dateAnalysis = dateMappedHeader
                      ? globalMappingService.detectDateFormat(filePreviewData.map(r => r[dateMappedHeader]))
                      : null;

                    // Numeric check for amount
                    const amountMappedHeader = Object.keys(fileMapping).find(h => {
                      const target = fileMapping[h];
                      return target === 'amount_usd' || target === 'amount';
                    });
                    const amountAnalysis = amountMappedHeader
                      ? globalMappingService.analyzeColumnDataType(amountMappedHeader, 'number', filePreviewData.map(r => r[amountMappedHeader]))
                      : null;

                    return (
                      <div className="bg-slate-900 border-2 border-slate-700/80 rounded-xl p-4 text-white shadow-lg space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className={reqValidation.isValid ? "w-5 h-5 text-emerald-400" : "w-5 h-5 text-amber-400"} />
                            <div>
                              <span className="text-xs font-bold font-mono uppercase tracking-wider text-slate-100">
                                Strict Global Column Mapping & Required Fields Gate
                              </span>
                              <p className="text-[11px] text-slate-400">
                                All required global schema columns must be mapped before data ingestion is permitted.
                              </p>
                            </div>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${
                            reqValidation.isValid
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                              : 'bg-rose-950 text-rose-300 border-rose-700 animate-pulse'
                          }`}>
                            {reqValidation.isValid 
                              ? `✓ All ${reqValidation.totalRequiredCount} Required Columns Mapped` 
                              : `⛔ ${reqValidation.missingRequiredKeys.length} Required Columns Missing`}
                          </span>
                        </div>

                        {/* Required Columns Checklist */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs">
                          {requiredFields.map(f => {
                            const mappedHeader = Object.keys(fileMapping).find(h => fileMapping[h] === f.key);
                            const isMapped = Boolean(mappedHeader && mappedHeader !== 'unmapped');
                            return (
                              <div 
                                key={f.key} 
                                className={`p-2.5 rounded-lg border flex flex-col justify-between ${
                                  isMapped 
                                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200' 
                                    : 'bg-rose-950/40 border-rose-800/60 text-rose-200'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <span className="font-mono font-bold text-[11px] truncate" title={f.key}>{f.key}</span>
                                  {isMapped ? (
                                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shrink-0">✓</span>
                                  ) : (
                                    <span className="w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] shrink-0 font-bold">✕</span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400 block truncate">{f.label}</span>
                                <span className="text-[10px] font-mono mt-1 text-slate-300 truncate">
                                  {isMapped ? `Mapped: "${mappedHeader}"` : 'Not mapped'}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Date Format & Data Type Feedback Bar */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                          {dateAnalysis && dateMappedHeader && (
                            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5 font-mono">
                                  <span>📅 Date Format Detected:</span>
                                  <span className="px-1.5 py-0.2 bg-cyan-900/60 text-cyan-200 border border-cyan-700 rounded text-[10px]">
                                    {dateAnalysis.detectedFormat}
                                  </span>
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">Col: "{dateMappedHeader}"</span>
                              </div>
                              <p className="text-[10px] text-slate-400">
                                {dateAnalysis.formatGuide}
                                {dateAnalysis.sampleNormalized && (
                                  <span className="block text-emerald-400 font-mono mt-0.5">
                                    Sample: "{dateAnalysis.sampleOriginal}" ➔ {dateAnalysis.sampleNormalized}
                                  </span>
                                )}
                              </p>
                            </div>
                          )}

                          {amountAnalysis && amountMappedHeader && (
                            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5 font-mono">
                                  <span>💰 Numeric Validation:</span>
                                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                                    amountAnalysis.isValid ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700' : 'bg-rose-900/60 text-rose-300 border-rose-700'
                                  }`}>
                                    {amountAnalysis.isValid ? 'Clean Numeric' : 'Non-numeric Text Detected'}
                                  </span>
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">Col: "{amountMappedHeader}"</span>
                              </div>
                              <p className="text-[10px] text-slate-400">
                                {amountAnalysis.warning || 'All sample values validated as parseable financial numbers (currency symbols will be stripped).'}
                              </p>
                            </div>
                          )}
                        </div>

                        {!reqValidation.isValid && (
                          <div className="p-2.5 bg-rose-950/80 border border-rose-700 rounded-lg flex items-center gap-2 text-rose-200 text-xs">
                            <AlertCircle size={15} className="text-rose-400 shrink-0" />
                            <span>
                              <strong>Strict Mapping Guard:</strong> Task creation is blocked until the following required columns are mapped: <strong className="underline">{reqValidation.missingRequiredLabels.join(', ')}</strong>.
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}


                  {/* Cleaning Action Feedback Alert */}
                  {cleaningActionSuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-emerald-800 text-xs shadow-2xs animate-fadeIn">
                      <div className="flex items-center space-x-2">
                        <CheckCircle size={15} className="text-emerald-600 shrink-0" />
                        <span className="font-medium">{cleaningActionSuccess}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCleaningActionSuccess(null)}
                        className="text-emerald-600 hover:text-emerald-900 p-0.5 rounded transition-colors cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {/* Filter and Data Cleaning Control Bar */}
                  <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs space-y-3">
                    <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
                      {/* Left: DATA CLEANING BUTTONS */}
                      <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5">
                        <button
                          type="button"
                          onClick={handleAutoMapAllColumns}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                          title="Auto-map all columns based on Global Standard Directory"
                        >
                          <Sparkles size={13} className="text-blue-200" />
                          <span>⚡ Auto-Map Columns</span>
                        </button>

                        <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider hidden sm:inline mr-0.5">
                          Clean:
                        </span>

                        {cleaningUndoSnapshot && (
                          <button
                            type="button"
                            onClick={handleUndoCleaning}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                            title="Undo last cleaning operation"
                          >
                            <Undo2 size={13} className="text-amber-700" />
                            <span>Undo</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleGlobalDatasetClean('trim_all')}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Strip leading and trailing whitespace from all cells across all columns"
                        >
                          <Eraser size={13} className="text-blue-600" />
                          <span>Trim All</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleGlobalDatasetClean('deduplicate')}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Remove identical duplicate rows from dataset"
                        >
                          <Wand2 size={13} className="text-purple-600" />
                          <span>Deduplicate</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleGlobalDatasetClean('remove_empty_rows')}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="Remove rows with no valid values"
                        >
                          <Filter size={13} className="text-amber-600" />
                          <span>Filter Empty</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleOpenSaveMappingModal}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                          title="Save current column mapping configuration as a reusable template"
                        >
                          <BookmarkCheck size={13} className="text-emerald-600" />
                          <span>Save Template</span>
                        </button>

                        {/* Remove button on Data View */}
                        <button
                          type="button"
                          onClick={handleRemoveUploadedFile}
                          className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 shadow-2xs flex items-center space-x-1 transition-all cursor-pointer"
                          title="Remove uploaded dataset"
                        >
                          <Trash2 size={12} className="text-rose-600" />
                          <span>Remove Data</span>
                        </button>
                      </div>

                      {/* Right: Choose Mapping Template for File Upload alongside Filter preview data input field */}
                      <div className="flex flex-wrap items-center gap-2 justify-end shrink-0">
                        {/* Choose Mapping Template Dropdown */}
                        <div className="flex items-center space-x-1.5">
                          <label className="text-[10px] font-bold text-slate-700 uppercase whitespace-nowrap flex items-center gap-1 font-mono">
                            <Layers size={12} className="text-blue-600" />
                            <span className="hidden sm:inline">Mapping Template:</span>
                            <span className="sm:hidden">Template:</span>
                          </label>
                          <select
                            value={selectedMappingId}
                            onChange={(e) => {
                              const newTplId = e.target.value;
                              setSelectedMappingId(newTplId);
                              if (newTplId) {
                                const selectedTpl = mappingTemplates.find(t => t.id === newTplId);
                                if (selectedTpl && selectedTpl.columnMappings && Object.keys(selectedTpl.columnMappings).length > 0) {
                                  setFileMapping(selectedTpl.columnMappings);
                                }
                              } else {
                                // Reset to Global Standard Mapping
                                if (rawHeaders.length > 0) {
                                  setFileMapping(autoGenerateColumnMapping(rawHeaders));
                                }
                              }
                            }}
                            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 cursor-pointer max-w-[210px]"
                            title="Choose Mapping Template for File Upload"
                          >
                            <option value="">-- No Template (Map to Global Standard) --</option>
                            {mappingTemplates.map(tpl => (
                              <option key={tpl.id} value={tpl.id}>
                                {tpl.name} ({tpl.id})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Search / Filter preview data input field */}
                        <div className="relative w-44 sm:w-56">
                          <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
                          <input
                            type="text"
                            placeholder="Filter preview data..."
                            value={dataViewSearch}
                            onChange={e => setDataViewSearch(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-200 focus:border-blue-500 font-sans"
                          />
                        </div>

                        {rawHeaders.length > 0 && (
                          <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg text-xs text-slate-700">
                            <Filter size={11} className="text-slate-400" />
                            <select
                              value={dataViewFilterColumn}
                              onChange={e => setDataViewFilterColumn(e.target.value)}
                              className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer max-w-[100px] truncate"
                            >
                              <option value="all">All Cols</option>
                              {rawHeaders.map(h => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => setIsDataViewTableVisible(prev => !prev)}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                            isDataViewTableVisible
                              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                              : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700 shadow-xs'
                          }`}
                          title={isDataViewTableVisible ? "Hide table records" : "Show table records"}
                        >
                          {isDataViewTableVisible ? (
                            <>
                              <EyeOff size={12} className="text-slate-600" />
                              <span className="hidden sm:inline">Hide</span>
                            </>
                          ) : (
                            <>
                              <Eye size={12} className="text-white" />
                              <span className="hidden sm:inline">Show</span>
                            </>
                          )}
                        </button>

                        {filePreviewData.length > 0 && (
                          <button
                            type="button"
                            onClick={handleClearAllRows}
                            className="px-2.5 py-1 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center space-x-1"
                            title="Clear all extracted preview rows"
                          >
                            <Trash2 size={12} />
                            <span className="hidden sm:inline">Clear Rows</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Collapsed State Card when Table is Hidden */}
                  {!isDataViewTableVisible && (
                    <div 
                      onClick={() => setIsDataViewTableVisible(true)}
                      className="p-4 bg-slate-50 hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 rounded-xl flex items-center justify-between cursor-pointer transition-all shadow-2xs group"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-blue-100 text-blue-700 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                          <Table size={16} />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-slate-800">Workspace Data View Table is Collapsed</span>
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                              {filePreviewData.length} records staged
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Click here to expand and preview the uploaded rows in Workspace Table format.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1.5 text-xs font-semibold text-blue-600 group-hover:text-blue-700 bg-white border border-blue-200 px-3 py-1.5 rounded-lg shadow-2xs">
                        <Eye size={13} />
                        <span>Show Table</span>
                        <ChevronDown size={13} />
                      </div>
                    </div>
                  )}

                  {/* Main Data View Table Display */}
                  {isDataViewTableVisible && (
                    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                      <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                        {/* MODE 1: SPREADSHEET GRID WITH COLUMN CLEANING & MAPPING ON HEADER */}
                        {dataViewMode === 'spreadsheet_grid' && (
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="sticky top-0 z-20 bg-slate-50 shadow-xs">
                              {/* HEADER ROW 1: Column Header Titles & Column Transformation Tools */}
                              <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-700 font-mono">
                                <th className="py-2.5 px-3 w-12 text-center text-slate-400 border-r border-slate-200/80">#</th>
                                {rawHeaders.map((header) => {
                                  const isEditing = editingColumnKey === header;
                                  const isMenuOpen = activeColumnMenu === header;

                                  return (
                                    <th key={header} className="py-2 px-3 min-w-[190px] border-r border-slate-200/80 relative">
                                      {isEditing ? (
                                        <div className="flex items-center space-x-1">
                                          <input
                                            type="text"
                                            value={newColumnHeaderName}
                                            onChange={e => setNewColumnHeaderName(e.target.value)}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') handleRenameColumn(header, newColumnHeaderName);
                                              if (e.key === 'Escape') setEditingColumnKey(null);
                                            }}
                                            className="w-full bg-white border border-blue-500 rounded px-1.5 py-0.5 text-xs text-slate-900 font-mono font-bold focus:outline-none"
                                            autoFocus
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleRenameColumn(header, newColumnHeaderName)}
                                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                                            title="Confirm Rename"
                                          >
                                            <Check size={13} />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setEditingColumnKey(null)}
                                            className="p-1 text-slate-400 hover:bg-slate-200 rounded cursor-pointer"
                                            title="Cancel"
                                          >
                                            <X size={13} />
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center justify-between gap-1.5">
                                          <span className="font-bold text-slate-800 truncate" title={header}>
                                            {header}
                                          </span>
                                          <div className="flex items-center space-x-0.5 shrink-0">
                                            {/* Column Cleaning Actions Dropdown Menu */}
                                            <div className="relative">
                                              <button
                                                type="button"
                                                onClick={() => setActiveColumnMenu(isMenuOpen ? null : header)}
                                                className={`p-1 rounded transition-colors cursor-pointer ${
                                                  isMenuOpen
                                                    ? 'bg-blue-600 text-white'
                                                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
                                                }`}
                                                title="Column cleaning & transformation tools"
                                              >
                                                <MoreHorizontal size={13} />
                                              </button>

                                              {isMenuOpen && (
                                                <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1.5 space-y-0.5 text-left font-sans animate-in fade-in-50 zoom-in-95 duration-100">
                                                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider border-b border-slate-100">
                                                    Transform "{header}"
                                                  </div>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      setEditingColumnKey(header);
                                                      setNewColumnHeaderName(header);
                                                      setActiveColumnMenu(null);
                                                    }}
                                                    className="w-full flex items-center space-x-2 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                                  >
                                                    <Edit3 size={12} className="text-blue-600" />
                                                    <span>Rename Column Header</span>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleTransformColumn(header, 'trim')}
                                                    className="w-full flex items-center space-x-2 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                                  >
                                                    <Eraser size={12} className="text-emerald-600" />
                                                    <span>Trim Whitespace</span>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleTransformColumn(header, 'uppercase')}
                                                    className="w-full flex items-center space-x-2 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                                  >
                                                    <Type size={12} className="text-indigo-600" />
                                                    <span>Convert to UPPERCASE</span>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleTransformColumn(header, 'lowercase')}
                                                    className="w-full flex items-center space-x-2 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                                  >
                                                    <Type size={12} className="text-indigo-500" />
                                                    <span>Convert to lowercase</span>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleTransformColumn(header, 'strip_special')}
                                                    className="w-full flex items-center space-x-2 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                                  >
                                                    <Wand2 size={12} className="text-amber-600" />
                                                    <span>Strip Special Characters</span>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleTransformColumn(header, 'number_clean')}
                                                    className="w-full flex items-center space-x-2 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                                  >
                                                    <CheckSquare size={12} className="text-teal-600" />
                                                    <span>Format Currency (2 Decimals)</span>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleTransformColumn(header, 'mask_card')}
                                                    className="w-full flex items-center space-x-2 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                                  >
                                                    <ShieldCheck size={12} className="text-purple-600" />
                                                    <span>Mask Card PAN (1234****5678)</span>
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleTransformColumn(header, 'fill_blanks')}
                                                    className="w-full flex items-center space-x-2 px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                                  >
                                                    <CheckCheck size={12} className="text-sky-600" />
                                                    <span>Replace Blanks with 'N/A'</span>
                                                  </button>
                                                  <div className="border-t border-slate-100 my-1"></div>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleDeleteColumn(header)}
                                                    className="w-full flex items-center space-x-2 px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                                  >
                                                    <Trash2 size={12} />
                                                    <span>Remove / Delete Column</span>
                                                  </button>
                                                </div>
                                              )}
                                            </div>

                                            {/* Direct Trash Delete Button */}
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteColumn(header)}
                                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                              title={`Delete column ${header}`}
                                            >
                                              <Trash2 size={12} />
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </th>
                                  );
                                })}
                                <th className="py-2.5 px-3 w-16 text-center text-slate-400">Actions</th>
                              </tr>

                              {/* HEADER ROW 2: INTEGRATED SCHEMA MAPPING ON DATAVIEW HEADER */}
                              <tr className="bg-blue-50/70 border-b border-slate-200 text-[10px] font-mono">
                                <th className="py-1.5 px-2 text-center text-blue-700 font-bold border-r border-slate-200/80">
                                  <button
                                    type="button"
                                    onClick={handleAutoMapAllColumns}
                                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold shadow-2xs transition-all flex items-center justify-center gap-1 mx-auto cursor-pointer"
                                    title="Auto-map all columns based on Global Standard Directory"
                                  >
                                    <Sparkles size={10} />
                                    <span>Auto-Map</span>
                                  </button>
                                </th>
                                {rawHeaders.map((header) => {
                                  const targetField = fileMapping[header] || '';
                                  const isMapped = Boolean(targetField);

                                  return (
                                    <th key={`map-${header}`} className="py-1.5 px-2.5 border-r border-slate-200/80">
                                      <select
                                        value={targetField}
                                        onChange={(e) => handleMapChange(header, e.target.value)}
                                        className={`w-full text-[11px] font-mono py-1 px-1.5 rounded border focus:outline-none cursor-pointer transition-all ${
                                          isMapped
                                            ? 'bg-white border-blue-500 text-blue-900 font-bold shadow-2xs ring-1 ring-blue-200'
                                            : 'bg-white/90 border-slate-300 text-slate-500 hover:border-slate-400'
                                        }`}
                                      >
                                        <option value="">-- Ignore (Unmapped) --</option>
                                        <optgroup label="Global Standard Column Dictionary">
                                          {globalStandardFields.map(f => (
                                            <option key={f.key} value={f.key}>
                                              {f.key} — {f.label} ({f.dataType}){f.required ? ' *' : ''}
                                            </option>
                                          ))}
                                        </optgroup>
                                      </select>
                                    </th>
                                  );
                                })}
                                <th className="py-1.5 px-2 text-center text-slate-400 font-mono text-[9px] uppercase">
                                  --
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-sans text-slate-800">
                              {filePreviewData.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 text-center font-bold border-r border-slate-100">
                                    {rIdx + 1}
                                  </td>
                                  {rawHeaders.map((header) => (
                                    <td key={header} className="py-2.5 px-3 font-mono text-xs text-slate-700 truncate max-w-[180px] border-r border-slate-100">
                                      {row[header] !== undefined && row[header] !== '' ? String(row[header]) : (
                                        <span className="text-slate-300 italic">null</span>
                                      )}
                                    </td>
                                  ))}
                                  <td className="py-2.5 px-3 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRow(rIdx)}
                                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                      title="Delete row"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}

                        {/* MODE 2: WORKSPACE TABLE FORMAT */}
                        {dataViewMode === 'workspace_table' && (
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="sticky top-0 z-20 bg-slate-50 shadow-xs">
                              <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-600 font-mono uppercase tracking-wider">
                                <th className="py-3 px-4">
                                  <div className="flex items-center space-x-1.5">
                                    <FileText size={13} className="text-blue-600" />
                                    <span>File Name</span>
                                  </div>
                                </th>
                                <th className="py-3 px-4">
                                  <div className="flex items-center space-x-1.5">
                                    <Layers size={13} className="text-indigo-600" />
                                    <span>List of Values from One Row</span>
                                  </div>
                                </th>
                                <th className="py-3 px-4">
                                  <div className="flex items-center space-x-1.5">
                                    <Database size={13} className="text-emerald-600" />
                                    <span>Mapping ID</span>
                                  </div>
                                </th>
                                <th className="py-3 px-4">
                                  <div className="flex items-center space-x-1.5">
                                    <UserIcon size={13} className="text-amber-600" />
                                    <span>User ID</span>
                                  </div>
                                </th>
                                <th className="py-3 px-4">
                                  <div className="flex items-center space-x-1.5">
                                    <CheckSquare size={13} className="text-sky-600" />
                                    <span>Task ID</span>
                                  </div>
                                </th>
                                <th className="py-3 px-4 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-sans text-slate-800">
                              {(() => {
                                const matchingRows = filePreviewData.filter((row) => {
                                  if (!dataViewSearch.trim()) return true;
                                  const q = dataViewSearch.toLowerCase();
                                  if (dataViewFilterColumn !== 'all') {
                                    return String(row[dataViewFilterColumn] || '').toLowerCase().includes(q);
                                  }
                                  return Object.values(row).some(v => String(v || '').toLowerCase().includes(q)) ||
                                    fileName.toLowerCase().includes(q) ||
                                    selectedMappingId.toLowerCase().includes(q);
                                });

                                if (matchingRows.length === 0) {
                                  return (
                                    <tr>
                                      <td colSpan={6} className="py-10 text-center text-slate-400">
                                        <Table size={28} className="mx-auto mb-2 text-slate-300" />
                                        <p className="font-semibold text-slate-600 text-xs">No matching preview rows found</p>
                                        <p className="text-[11px] text-slate-400 mt-0.5">Try adjusting your search filter.</p>
                                      </td>
                                    </tr>
                                  );
                                }

                                return matchingRows.map((row, originalIndex) => {
                                  const rowValues = Object.values(row).map(v => String(v !== undefined && v !== null ? v : ''));
                                  return (
                                    <tr key={originalIndex} className="hover:bg-blue-50/40 transition-colors">
                                      {/* File Name */}
                                      <td className="py-3 px-4 font-mono text-xs text-blue-900 font-semibold max-w-[180px]">
                                        <div className="flex items-center space-x-2">
                                          <FileText size={13} className="text-blue-500 shrink-0" />
                                          <span className="truncate" title={fileName}>{fileName || 'upload.csv'}</span>
                                        </div>
                                      </td>

                                      {/* List of Values from One Row */}
                                      <td className="py-3 px-4">
                                        <div className="flex flex-wrap items-center gap-1.5 max-w-lg">
                                          {rowValues.slice(0, 5).map((val, vIdx) => (
                                            <span 
                                              key={vIdx} 
                                              className="inline-block bg-slate-100 hover:bg-slate-200 border border-slate-200/80 text-slate-800 text-[11px] px-2 py-0.5 rounded font-mono truncate max-w-[140px] transition-colors"
                                              title={val}
                                            >
                                              {val || '<empty>'}
                                            </span>
                                          ))}
                                          {rowValues.length > 5 && (
                                            <button
                                              type="button"
                                              onClick={() => setInspectingRowIndex(originalIndex)}
                                              className="text-[10px] font-mono text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                                              title="Click to view all row values"
                                            >
                                              +{rowValues.length - 5} more
                                            </button>
                                          )}
                                        </div>
                                      </td>

                                      {/* Mapping ID */}
                                      <td className="py-3 px-4">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                          {selectedMappingId || 'tpl-1'}
                                        </span>
                                      </td>

                                      {/* User ID */}
                                      <td className="py-3 px-4 font-mono text-xs text-slate-700 font-semibold">
                                        <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[10px] font-mono">
                                          {currentUser.id || currentUser.username}
                                        </span>
                                      </td>

                                      {/* Task ID (Pending Assignment Preview) */}
                                      <td className="py-3 px-4 font-mono text-xs">
                                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold">
                                          <CheckSquare size={10} className="text-sky-600" />
                                          <span>NEW_TASK (Auto)</span>
                                        </span>
                                      </td>

                                      {/* Actions */}
                                      <td className="py-3 px-4 text-right">
                                        <div className="flex items-center justify-end space-x-1.5">
                                          <button
                                            type="button"
                                            onClick={() => setInspectingRowIndex(originalIndex)}
                                            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                            title="Inspect row fields & schema mapping"
                                          >
                                            <Eye size={13} />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteRow(originalIndex)}
                                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                            title="Remove row from batch"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Row Detail Inspector Modal */}
                  {inspectingRowIndex !== null && filePreviewData[inspectingRowIndex] && (
                    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
                      <div className="bg-white rounded-2xl max-w-xl w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                          <div className="flex items-center space-x-2">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                              <Layers size={16} />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-slate-900">
                                Row #{inspectingRowIndex + 1} Record Inspector
                              </h4>
                              <p className="text-[11px] text-slate-500 font-mono">
                                File: {fileName} • Mapping: {selectedMappingId}
                              </p>
                            </div>
                          </div>
                          <button 
                            type="button"
                            onClick={() => setInspectingRowIndex(null)}
                            className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1 rounded-lg hover:bg-slate-100"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Column by Column Breakdown */}
                        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                          {rawHeaders.map((header) => {
                            const val = filePreviewData[inspectingRowIndex][header];
                            const mappedField = fileMapping[header];
                            return (
                              <div key={header} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                                <div className="space-y-0.5">
                                  <div className="font-mono font-bold text-slate-700 flex items-center space-x-1.5">
                                    <span>{header}</span>
                                    {mappedField && (
                                      <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded font-sans font-semibold">
                                        Mapped: {mappedField}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span className="font-mono text-xs text-blue-950 font-semibold bg-white border border-slate-200 px-2.5 py-1 rounded-lg break-all max-w-xs">
                                  {val !== undefined && val !== '' ? String(val) : '<empty>'}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                          <span className="text-[10px] font-mono text-slate-400">
                            User: {currentUser.id || currentUser.username} • Schema: {selectedMappingId}
                          </span>
                          <button
                            type="button"
                            onClick={() => setInspectingRowIndex(null)}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-xs"
                          >
                            Done Inspecting
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SAVE MAPPING TEMPLATE MODAL */}
                  {showSaveMappingModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
                      <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                              <BookmarkCheck size={18} />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-slate-900">Save Schema Mapping Template</h3>
                              <p className="text-[11px] text-slate-500">Save your current column mappings to reuse across future tasks and datasets</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowSaveMappingModal(false)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                          >
                            <X size={16} />
                          </button>
                        </div>

                        <form onSubmit={handleSaveCurrentMapping} className="space-y-4">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                              Template Name <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={saveMappingTemplateName}
                              onChange={(e) => setSaveMappingTemplateName(e.target.value)}
                              placeholder="e.g. Stripe Chargeback CSV Mapping"
                              required
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-medium"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                              Description
                            </label>
                            <textarea
                              value={saveMappingTemplateDesc}
                              onChange={(e) => setSaveMappingTemplateDesc(e.target.value)}
                              placeholder="Briefly describe the file structure or schema origin..."
                              rows={2}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                            />
                          </div>

                          {/* Mapped Columns Summary */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-slate-700 uppercase tracking-wider">
                                Mapped Column Headers ({Object.keys(fileMapping).filter(k => fileMapping[k] && fileMapping[k] !== 'unmapped').length} of {rawHeaders.length})
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">Format: CSV/Excel</span>
                            </div>

                            <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-2.5 bg-slate-50/70 space-y-1.5 text-xs">
                              {rawHeaders.map((col) => {
                                const mapped = fileMapping[col];
                                const isMapped = mapped && mapped !== 'unmapped';
                                return (
                                  <div key={col} className="flex items-center justify-between py-1 px-2 bg-white border border-slate-200/80 rounded-lg text-[11px]">
                                    <span className="font-mono font-bold text-slate-800 truncate max-w-[160px]">{col}</span>
                                    <span className="text-slate-400 text-[10px]">→</span>
                                    {isMapped ? (
                                      <span className="font-mono text-blue-700 font-semibold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[10px]">
                                        {mapped}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400 italic text-[10px]">unmapped (skipped)</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => setShowSaveMappingModal(false)}
                              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={isSavingMapping || !saveMappingTemplateName.trim()}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5"
                            >
                              {isSavingMapping ? (
                                <>
                                  <RefreshCw size={13} className="animate-spin" />
                                  <span>Saving Template...</span>
                                </>
                              ) : (
                                <>
                                  <Save size={13} />
                                  <span>Save Template</span>
                                </>
                              )}
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Strict Upload Gate Validation Error Banner */}
        {type === 'file' && filePreviewData.length > 0 && (() => {
          const reqCheck = globalMappingService.validateRequiredColumns(fileMapping, globalStandardFields);
          if (!reqCheck.isValid) {
            return (
              <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs flex items-center gap-3 shadow-xs">
                <AlertCircle size={18} className="text-rose-600 shrink-0" />
                <div>
                  <span className="font-bold">Strict Mapping Gate (Upload Blocked):</span> You cannot create or ingest this task because <strong className="underline">{reqCheck.missingRequiredKeys.length} required Global Columns</strong> are not mapped: <strong className="font-mono bg-rose-100 px-1.5 py-0.5 rounded">{reqCheck.missingRequiredLabels.join(', ')}</strong>. Please assign these columns in the mapping table above.
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Submit Action */}
        <button
          type="submit"
          disabled={type === 'file' && filePreviewData.length > 0 && !globalMappingService.validateRequiredColumns(fileMapping, globalStandardFields).isValid}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:border-slate-300 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer shadow-sm"
          id="btn-submit-case"
        >
          <ArrowUpRight size={15} />
          <span>Commit & Route Operational Case</span>
        </button>
      </form>
    </div>
  );
}
