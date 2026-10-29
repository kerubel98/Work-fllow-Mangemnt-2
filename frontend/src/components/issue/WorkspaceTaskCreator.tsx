/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  Plus, ArrowLeft, Layers, FileText, Upload, Trash2, CheckCircle2, 
  Sparkles, Eraser, CheckCheck, ListFilter, Undo2, Wand2, BookmarkCheck, 
  Search, Check, X, MoreHorizontal, Edit3, Type, SlidersHorizontal, 
  ShieldCheck, CheckSquare, RefreshCw, Save, AlertTriangle, GitBranch 
} from 'lucide-react';
import { 
  IssuePriority, 
  HashtagPreset, 
  User, 
  Team,
  DatabaseConnection, 
  EnvironmentSystem, 
  TaskPreFillFromMessage 
} from '../../types';
import { api } from '../../api/client';
import { globalMappingService } from '../../services/globalMappingService';
import { Mail, Users, Lock } from 'lucide-react';
import { StandardFileIngestionWorkspace, StandardFileIngestionWorkspaceRef } from '../common/StandardFileIngestionWorkspace';
import { IngestionDatasetPayload } from '../../types';
import { UploadAndCleanTransactionsView } from './UploadAndCleanTransactionsView';

export interface WorkspaceTaskCreatorProps {
  currentUser: { id: string; username: string; role?: string; permanentTeamId?: string; shareWorkspaceWithTeam?: boolean; [key: string]: any };
  users: User[];
  hashtags: HashtagPreset[];
  teams?: Team[];
  databases?: DatabaseConnection[];
  systems?: EnvironmentSystem[];
  onCreateIssue?: (newIssue: any) => void;
  onBackToWorkspace: () => void;
  onTaskCreated?: (taskId?: string) => void;
  initialPreFill?: TaskPreFillFromMessage | null;
}

export const WorkspaceTaskCreator: React.FC<WorkspaceTaskCreatorProps> = ({
  currentUser,
  users,
  hashtags,
  teams = [],
  databases = [],
  systems = [],
  onCreateIssue,
  onBackToWorkspace,
  onTaskCreated,
  initialPreFill
}) => {
  // Resolve permanent team of current user
  const userPermTeam = (teams || []).find(
    t => t.teamType === 'permanent' && (t.managerId === currentUser.id || (t.memberIds && t.memberIds.includes(currentUser.id)))
  );
  const effectivePermanentTeamId = (currentUser as any)?.permanentTeamId || userPermTeam?.id;
  const isMemberOfPermanentTeam = Boolean(effectivePermanentTeamId);

  // By default, tasks created from email or in permanent team are TEAM_PUBLIC
  const [taskVisibility, setTaskVisibility] = useState<'TEAM_PUBLIC' | 'PERSONAL_PRIVATE'>(() => {
    if (initialPreFill?.taskVisibility) return initialPreFill.taskVisibility;
    return isMemberOfPermanentTeam ? 'TEAM_PUBLIC' : 'PERSONAL_PRIVATE';
  });

  // Basic Task Information
  const [creatorStep, setCreatorStep] = useState<'details' | 'upload_clean'>('details');
  const [createTitle, setCreateTitle] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createPriority, setCreatePriority] = useState<IssuePriority>('Medium');
  const [createAssigneeId, setCreateAssigneeId] = useState(currentUser.id);
  const [createHashtag, setCreateHashtag] = useState('Untagged');

  // Investigation Space & Mapping States
  const [includeInvestigationSpace, setIncludeInvestigationSpace] = useState(true);
  const [createDbId, setCreateDbId] = useState('');
  const [createDbTable, setCreateDbTable] = useState('transactions_master');
  const [createFileName, setCreateFileName] = useState('');
  const [createRawHeaders, setCreateRawHeaders] = useState<string[]>([]);
  const [createFileMapping, setCreateFileMapping] = useState<Record<string, string>>({});
  const [createParsedRows, setCreateParsedRows] = useState<Record<string, any>[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const ingestionWorkspaceRef = React.useRef<StandardFileIngestionWorkspaceRef>(null);

  // Workflows & Directive Validation Linkage
  const [workflows, setWorkflows] = useState<any[]>([]);
  useEffect(() => {
    api.getWorkflows().then(data => {
      if (Array.isArray(data)) setWorkflows(data);
    }).catch(err => {
      console.warn('Failed to load workflows in WorkspaceTaskCreator:', err);
    });
  }, []);

  const selectedTagPreset = useMemo(() => {
    if (!createHashtag || createHashtag === 'Untagged') return null;
    return hashtags.find(h => h.tag === createHashtag) || null;
  }, [createHashtag, hashtags]);

  const linkedWorkflow = useMemo(() => {
    if (!selectedTagPreset?.workflowId && !selectedTagPreset?.workflowName) return null;
    return workflows.find(w => w.id === selectedTagPreset.workflowId || w.name === selectedTagPreset.workflowName) || null;
  }, [selectedTagPreset, workflows]);

  const missingHashtagColumns = useMemo(() => {
    if (!selectedTagPreset || createRawHeaders.length === 0) return [];
    const reqCols = (selectedTagPreset.minimumRequiredColumns && selectedTagPreset.minimumRequiredColumns.length > 0)
      ? selectedTagPreset.minimumRequiredColumns
      : (selectedTagPreset.expectedFileStructure || []);
    if (reqCols.length === 0) return [];
    return reqCols.filter(req => !createRawHeaders.some(h => h.trim().toLowerCase() === req.trim().toLowerCase()));
  }, [selectedTagPreset, createRawHeaders]);

  // Data View & Cleaning States
  const [createActiveColumnMenu, setCreateActiveColumnMenu] = useState<string | null>(null);
  const [createCleaningActionSuccess, setCreateCleaningActionSuccess] = useState<string | null>(null);
  const [createEditingColumnKey, setCreateEditingColumnKey] = useState<string | null>(null);
  const [createNewColumnHeaderName, setCreateNewColumnHeaderName] = useState<string>('');
  const [createDataSearch, setCreateDataSearch] = useState<string>('');
  const [createCleaningUndoSnapshot, setCreateCleaningUndoSnapshot] = useState<{
    headers: string[];
    rows: Record<string, any>[];
    mapping: Record<string, string>;
  } | null>(null);

  // Mapping Template States & Modal
  const [showSaveMappingModal, setShowSaveMappingModal] = useState<boolean>(false);
  const [saveMappingTemplateName, setSaveMappingTemplateName] = useState<string>('');
  const [saveMappingTemplateDesc, setSaveMappingTemplateDesc] = useState<string>('');
  const [isSavingMapping, setIsSavingMapping] = useState<boolean>(false);
  const [selectedMappingId, setSelectedMappingId] = useState<string>('');
  const [mappingTemplates, setMappingTemplates] = useState<any[]>([
    { id: 'tpl-1', name: 'Standard Payment Gateway CSV', sourceType: 'csv', description: 'Maps custom export column headers into global transaction keys', sampleHeaders: ['Txn_Ref', 'Card_Pan', 'Charge_Amt', 'Cust_Email', 'Auth_Date', 'Status_Code'] },
    { id: 'tpl-2', name: 'Stripe Dispute & Chargeback Export', sourceType: 'csv', description: 'Standard Stripe chargeback export format', sampleHeaders: ['charge_id', 'card_fingerprint', 'charge_amount', 'buyer_email', 'created_date', 'dispute_status'] },
    { id: 'tpl-3', name: 'Visa ISO 8583 Settlement Clearing', sourceType: 'csv', description: 'Visa ISO 8583 settlement clearing file format', sampleHeaders: ['Ref_Number', 'PAN_Masked', 'Txn_Val_USD', 'Cardholder_Mail', 'Iso_Timestamp', 'Iso_Resp'] }
  ]);

  // Target standard DB columns from Global Standard Column Dictionary
  const globalStandardFields = globalMappingService.getStandardFields();
  const TARGET_DB_FIELDS = globalStandardFields.map(f => ({
    id: f.key,
    label: `${f.key} — ${f.label} (${f.dataType})${f.required ? ' *' : ''}`,
    name: f.label,
    dataType: f.dataType,
    category: f.category || 'General',
    required: f.required
  }));

  // Fetch Mapping Templates on mount
  useEffect(() => {
    api.getTransactionSettings()
      .then(res => {
        if (res.templates && res.templates.length > 0) {
          setMappingTemplates(res.templates);
        }
      })
      .catch(e => console.warn('Could not fetch mapping templates:', e));
  }, []);

  // Initialize DB ID
  useEffect(() => {
    if (!createDbId) {
      if (databases && databases.length > 0) {
        setCreateDbId(databases[0].id);
      } else if (systems && systems.length > 0) {
        setCreateDbId(systems[0].id);
      }
    }
  }, [databases, systems, createDbId]);

  // Hydrate from initialPreFill (e.g. from Team Mailbox or Chat)
  useEffect(() => {
    if (!initialPreFill) return;
    if (initialPreFill.title) setCreateTitle(initialPreFill.title);
    if (initialPreFill.description) setCreateDesc(initialPreFill.description);

    if (initialPreFill.attachments && initialPreFill.attachments.length > 0) {
      const tabularAtt = initialPreFill.attachments.find(a => 
        a.contentType === 'spreadsheet' || 
        a.filename?.endsWith('.xlsx') || 
        a.filename?.endsWith('.csv') || 
        (a.parsedData && (a.parsedData.tabularRows || a.parsedData.sampleRows))
      );

      if (tabularAtt) {
        setCreateFileName(tabularAtt.filename);
        let rows: Record<string, any>[] = [];
        let headers: string[] = [];

        if (tabularAtt.parsedData?.sampleRows && tabularAtt.parsedData.sampleRows.length > 0) {
          rows = tabularAtt.parsedData.sampleRows;
          headers = tabularAtt.parsedData.sampleHeaders || Object.keys(rows[0] || {});
        } else if (tabularAtt.parsedData?.tabularRows && tabularAtt.parsedData.tabularRows.length > 0) {
          rows = tabularAtt.parsedData.tabularRows;
          headers = tabularAtt.parsedData.tabularHeaders || Object.keys(rows[0] || {});
        } else if (tabularAtt.rawBase64) {
          try {
            const binary = atob(tabularAtt.rawBase64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }
            const wb = XLSX.read(bytes, { type: 'array' });
            const firstSheet = wb.Sheets[wb.SheetNames[0]];
            if (firstSheet) {
              const raw = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
              if (raw.length > 0) {
                headers = raw[0].map(h => String(h).trim());
                rows = XLSX.utils.sheet_to_json(firstSheet) as Record<string, any>[];
              }
            }
          } catch (e) {
            console.warn('Failed to parse attachment base64 in WorkspaceTaskCreator:', e);
          }
        }

        if (headers.length > 0) {
          setCreateRawHeaders(headers);
          setCreateFileMapping(globalMappingService.autoGenerateColumnMapping(headers));
          setCreateParsedRows(rows);
        }
      }
    }
  }, [initialPreFill]);

  // Helper: Auto-generate column mapping
  const autoGenerateColumnMapping = (headers: string[]) => {
    return globalMappingService.autoGenerateColumnMapping(headers);
  };

  // Helper to capture undo snapshot
  const captureCreateUndoSnapshot = () => {
    setCreateCleaningUndoSnapshot({
      headers: [...createRawHeaders],
      rows: createParsedRows.map(r => ({ ...r })),
      mapping: { ...createFileMapping }
    });
  };

  // Handler: Undo last data cleaning action
  const handleCreateUndoCleaning = () => {
    if (!createCleaningUndoSnapshot) return;
    setCreateRawHeaders(createCleaningUndoSnapshot.headers);
    setCreateParsedRows(createCleaningUndoSnapshot.rows);
    setCreateFileMapping(createCleaningUndoSnapshot.mapping);
    setCreateCleaningUndoSnapshot(null);
    setCreateCleaningActionSuccess('Reverted last data cleaning modification.');
    setTimeout(() => setCreateCleaningActionSuccess(null), 3500);
  };

  // Handler: Delete Column
  const handleCreateDeleteColumn = (colKeyToDelete: string) => {
    if (createRawHeaders.length === 0) return;
    captureCreateUndoSnapshot();

    const updatedHeaders = createRawHeaders.filter(h => h !== colKeyToDelete);
    const updatedRows = createParsedRows.map(row => {
      const copy = { ...row };
      delete copy[colKeyToDelete];
      return copy;
    });

    const updatedMapping = { ...createFileMapping };
    delete updatedMapping[colKeyToDelete];

    setCreateRawHeaders(updatedHeaders);
    setCreateParsedRows(updatedRows);
    setCreateFileMapping(updatedMapping);
    setCreateActiveColumnMenu(null);
    setCreateCleaningActionSuccess(`Removed column "${colKeyToDelete}" from dataset.`);
    setTimeout(() => setCreateCleaningActionSuccess(null), 4000);
  };

  // Handler: Rename Column
  const handleCreateRenameColumn = (oldColKey: string, newColKey: string) => {
    const trimmed = newColKey.trim();
    if (!trimmed || trimmed === oldColKey) {
      setCreateEditingColumnKey(null);
      setCreateNewColumnHeaderName('');
      return;
    }

    if (createRawHeaders.includes(trimmed)) {
      alert(`A column named "${trimmed}" already exists.`);
      return;
    }

    captureCreateUndoSnapshot();

    const updatedHeaders = createRawHeaders.map(h => h === oldColKey ? trimmed : h);
    const updatedRows = createParsedRows.map(row => {
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

    const updatedMapping = { ...createFileMapping };
    if (updatedMapping[oldColKey]) {
      updatedMapping[trimmed] = updatedMapping[oldColKey];
      delete updatedMapping[oldColKey];
    } else {
      updatedMapping[trimmed] = 'unmapped';
    }

    setCreateRawHeaders(updatedHeaders);
    setCreateParsedRows(updatedRows);
    setCreateFileMapping(updatedMapping);
    setCreateEditingColumnKey(null);
    setCreateNewColumnHeaderName('');
    setCreateActiveColumnMenu(null);
    setCreateCleaningActionSuccess(`Renamed column "${oldColKey}" to "${trimmed}".`);
    setTimeout(() => setCreateCleaningActionSuccess(null), 4000);
  };

  // Handler: Transform Column
  const handleCreateTransformColumn = (
    colKey: string,
    transformType: 'trim' | 'uppercase' | 'lowercase' | 'strip_special' | 'number_clean' | 'fill_blanks' | 'mask_card'
  ) => {
    if (createParsedRows.length === 0) return;
    captureCreateUndoSnapshot();

    let affectedCount = 0;
    const updatedRows = createParsedRows.map(row => {
      const copy = { ...row };
      const val = copy[colKey];
      if (val !== undefined && val !== null) {
        let str = String(val);
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

    setCreateParsedRows(updatedRows);
    setCreateActiveColumnMenu(null);
    setCreateCleaningActionSuccess(`Cleaned ${affectedCount} values in "${colKey}" using ${transformType.replace('_', ' ')}.`);
    setTimeout(() => setCreateCleaningActionSuccess(null), 4000);
  };

  // Handler: Global Dataset Clean
  const handleCreateGlobalDatasetClean = (action: 'trim_all' | 'remove_empty_rows' | 'deduplicate') => {
    if (createParsedRows.length === 0) return;
    captureCreateUndoSnapshot();

    let cleanedRows = [...createParsedRows];
    let msg = '';

    if (action === 'trim_all') {
      cleanedRows = cleanedRows.map(row => {
        const copy: Record<string, any> = {};
        Object.entries(row).forEach(([k, v]) => {
          copy[k] = typeof v === 'string' ? v.trim() : v;
        });
        return copy;
      });
      msg = `Trimmed whitespace across all ${createRawHeaders.length} columns and ${cleanedRows.length} rows.`;
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

    setCreateParsedRows(cleanedRows);
    setCreateCleaningActionSuccess(msg);
    setTimeout(() => setCreateCleaningActionSuccess(null), 4500);
  };

  // Handler: Open Save Mapping Modal
  const handleOpenSaveMappingModal = () => {
    const defaultName = createFileName
      ? `${createFileName.replace(/\.[^/.]+$/, '')} Template`
      : `Custom Mapping ${new Date().toLocaleDateString()}`;
    setSaveMappingTemplateName(defaultName);
    const mappedCount = Object.keys(createFileMapping).filter(k => createFileMapping[k] && createFileMapping[k] !== 'unmapped').length;
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
        sampleHeaders: createRawHeaders,
        columnMappings: createFileMapping,
        updatedAt: new Date().toISOString()
      };

      try {
        await api.saveTransactionTemplate(templatePayload);
      } catch (err) {
        console.warn('Saved template to local state (API fallback):', err);
      }

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

      const mappedCount = Object.keys(createFileMapping).filter(k => createFileMapping[k] && createFileMapping[k] !== 'unmapped').length;
      setCreateCleaningActionSuccess(`Mapping template "${trimmedName}" saved successfully! (${mappedCount} columns mapped).`);
      setTimeout(() => setCreateCleaningActionSuccess(null), 5000);
    } catch (err: any) {
      alert('Failed to save mapping: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSavingMapping(false);
    }
  };

  // Quick sample loader: Chargeback Batch CSV
  const handleLoadSampleChargebacks = () => {
    const headers = ['Transaction_ID', 'Card_Number', 'Amount_USD', 'Auth_Time', 'Dispute_Reason', 'Customer_Email'];
    const rows = [
      { Transaction_ID: 'TXN-9081', Card_Number: '4111********9012', Amount_USD: 249.50, Auth_Time: new Date(Date.now() - 7200000).toISOString(), Dispute_Reason: 'UNAUTHORIZED_CHARGE', Customer_Email: 'client1@example.com' },
      { Transaction_ID: 'TXN-9082', Card_Number: '4000********1122', Amount_USD: 89.00, Auth_Time: new Date(Date.now() - 3600000).toISOString(), Dispute_Reason: 'DUPLICATE_PROCESSING', Customer_Email: 'client2@example.com' },
      { Transaction_ID: 'TXN-9083', Card_Number: '5412********8833', Amount_USD: 410.25, Auth_Time: new Date().toISOString(), Dispute_Reason: 'MERCHANDISE_NOT_RECEIVED', Customer_Email: 'client3@example.com' }
    ];
    setCreateFileName('sample_chargebacks_batch_2026.csv');
    setCreateRawHeaders(headers);
    setCreateFileMapping(autoGenerateColumnMapping(headers));
    setCreateParsedRows(rows);
  };

  // Quick sample loader: Settlement Batch CSV
  const handleLoadSampleSettlements = () => {
    const headers = ['Txn_Ref_ID', 'Card_PAN', 'Settlement_Amt', 'Posting_Date', 'Settlement_Status'];
    const rows = [
      { Txn_Ref_ID: 'SET-1001', Card_PAN: '4111********3344', Settlement_Amt: 1250.00, Posting_Date: new Date(Date.now() - 86400000).toISOString(), Settlement_Status: 'PENDING' },
      { Txn_Ref_ID: 'SET-1002', Card_PAN: '5200********9900', Settlement_Amt: 780.50, Posting_Date: new Date(Date.now() - 43200000).toISOString(), Settlement_Status: 'SETTLED' },
      { Txn_Ref_ID: 'SET-1003', Card_PAN: '4000********7711', Settlement_Amt: 340.00, Posting_Date: new Date().toISOString(), Settlement_Status: 'PENDING' }
    ];
    setCreateFileName('settlement_recon_batch_q3.csv');
    setCreateRawHeaders(headers);
    setCreateFileMapping(autoGenerateColumnMapping(headers));
    setCreateParsedRows(rows);
  };

  // File Change Handler
  const handleCreateFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsProcessingFile(true);
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isXml = file.name.endsWith('.xml') || file.type === 'text/xml' || file.type === 'application/xml';
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        let headers: string[] = [];
        let parsedRows: Record<string, any>[] = [];

        if (isExcel) {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          if (firstSheet) {
            const raw = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
            if (raw.length > 0) {
              headers = raw[0].map(h => String(h).trim()).filter(Boolean);
              parsedRows = XLSX.utils.sheet_to_json(firstSheet) as Record<string, any>[];
            }
          }
        } else if (isXml) {
          const text = event.target?.result as string;
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(text, 'text/xml');
          const parseErr = xmlDoc.getElementsByTagName('parsererror')[0];
          if (parseErr) {
            throw new Error('XML parsing syntax error: ' + (parseErr.textContent || 'Malformed XML structure'));
          }

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
          for (const rowEl of candidateRows) {
            const rowObj: Record<string, any> = {};
            for (let i = 0; i < rowEl.attributes.length; i++) {
              rowObj[rowEl.attributes[i].name] = rowEl.attributes[i].value;
              headerSet.add(rowEl.attributes[i].name);
            }
            for (let i = 0; i < rowEl.children.length; i++) {
              const child = rowEl.children[i];
              if (child.children.length === 0) {
                rowObj[child.tagName] = child.textContent?.trim() || '';
                headerSet.add(child.tagName);
              } else {
                for (let j = 0; j < child.children.length; j++) {
                  const key = `${child.tagName}_${child.children[j].tagName}`;
                  rowObj[key] = child.children[j].textContent?.trim() || '';
                  headerSet.add(key);
                }
              }
            }
            if (Object.keys(rowObj).length > 0) {
              parsedRows.push(rowObj);
            }
          }

          headers = Array.from(headerSet);
        } else {
          const text = event.target?.result as string;
          const lines = text.split('\n').filter(l => l.trim().length > 0);
          if (lines.length > 0) {
            headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
            for (let i = 1; i < Math.min(lines.length, 25); i++) {
              const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
              const rowObj: Record<string, any> = {};
              headers.forEach((h, idx) => {
                rowObj[h] = values[idx] || '';
              });
              parsedRows.push(rowObj);
            }
          }
        }

        setCreateFileName(file.name);
        setCreateRawHeaders(headers);
        setCreateFileMapping(autoGenerateColumnMapping(headers));
        setCreateParsedRows(parsedRows);
      } catch (err: any) {
        alert('Could not parse uploaded file: ' + (err?.message || 'Please provide a valid CSV, Excel, or XML document.'));
      } finally {
        setIsProcessingFile(false);
      }
    };

    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  // Handler: Remove uploaded file / data
  const handleRemoveCreateUploadedFile = () => {
    setCreateFileName('');
    setCreateRawHeaders([]);
    setCreateParsedRows([]);
    setCreateFileMapping({});
    setCreateCleaningUndoSnapshot(null);
    setCreateCleaningActionSuccess('Uploaded dataset removed.');
    setTimeout(() => setCreateCleaningActionSuccess(null), 3000);
    setCreateDataSearch('');
    const fileInput = document.getElementById('task-create-file-upload-input') as HTMLInputElement | null;
    if (fileInput) fileInput.value = '';
  };

  // Submit Handler
  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim()) {
      alert('Please enter a task title.');
      return;
    }

    let finalPayload: IngestionDatasetPayload | undefined;

    // Pre-Commit Integrity Gate: Validate file & enforce template/hashtag required columns
    if (includeInvestigationSpace && ingestionWorkspaceRef.current?.hasFileAttached()) {
      const outcome = await ingestionWorkspaceRef.current.validateAndPrepareDataset();
      if (!outcome.isValid) {
        alert(
          `Task Creation Interrupted: Incomplete Dataset or Schema Mismatch!\n\n${outcome.blockingErrors.join('\n\n')}\n\nPlease satisfy all required column conditions before creating this task.`
        );
        return;
      }
      finalPayload = outcome.datasetPayload;
    }

    const effectiveFileName = finalPayload?.fileName || createFileName;
    const effectiveHeaders = finalPayload?.activeHeaders || createRawHeaders;
    const effectiveMapping = finalPayload?.columnMappings || createFileMapping;
    const effectiveRows = finalPayload?.transformedRows || createParsedRows;
    const effectiveTemplateId = finalPayload?.selectedTemplateId || selectedMappingId;

    // Guard: Validate file schema against hashtag required columns
    if (missingHashtagColumns.length > 0) {
      const confirmProceed = window.confirm(
        `File Schema Mismatch Alert!\n\nThe attached file "${effectiveFileName}" is missing ${missingHashtagColumns.length} required columns for hashtag directive ${selectedTagPreset?.tag}:\n- Missing: ${missingHashtagColumns.join(', ')}\n\nDo you wish to proceed and stage this discrepancy for investigation?`
      );
      if (!confirmProceed) {
        return;
      }
    }

    const assignee = users.find(u => u.id === createAssigneeId);
    const generatedTaskId = `ISS-${Math.floor(1000 + Math.random() * 9000)}`;

    const hasAttachedFile = Boolean(includeInvestigationSpace && effectiveFileName && effectiveFileName.trim().length > 0);

    const newIssuePayload: any = {
      id: generatedTaskId,
      title: createTitle.trim(),
      description: createDesc.trim() || (initialPreFill ? `Task converted from ${initialPreFill.channel || 'email'} by ${initialPreFill.senderName || initialPreFill.senderAddress || 'External Counterparty'}.` : 'Task created in Workspace.'),
      priority: createPriority,
      type: hasAttachedFile ? ('file' as const) : ('single' as const),
      assignedTechUserId: createAssigneeId || currentUser.id,
      assignedTechUserName: assignee ? assignee.username : currentUser.username,
      linkedHashtag: (createHashtag && createHashtag !== 'Untagged') ? createHashtag : undefined,
      uploadedFileName: hasAttachedFile ? effectiveFileName : undefined,
      uploadedFileHeaders: (hasAttachedFile && effectiveHeaders.length > 0) ? effectiveHeaders : undefined,
      fileMapping: (hasAttachedFile && Object.keys(effectiveMapping).length > 0) ? effectiveMapping : undefined,
      firstLevelMappedData: (hasAttachedFile && effectiveRows.length > 0) ? effectiveRows : undefined,
      mappingId: hasAttachedFile ? effectiveTemplateId : undefined,
      investigationEnvironment: 'production' as const,
      teamId: initialPreFill?.teamId || effectivePermanentTeamId || (currentUser as any)?.teamId,
      visibility: taskVisibility,
      sourceChannel: initialPreFill?.channel,
      sourceMessageId: initialPreFill?.sourceMessageId,
      sourceThreadId: initialPreFill?.threadId
    };

    if (onCreateIssue) {
      onCreateIssue(newIssuePayload);
    }

    // Automatically link the source message to this issue in the backend if converted from Mailbox/Chat
    if (initialPreFill?.sourceMessageId) {
      api.linkMessageToIssue(initialPreFill.sourceMessageId, generatedTaskId).catch(err => {
        console.warn('Could not link message to issue:', err);
      });
    }

    // Persist into Centralized Workspace Table if file data exists
    if (includeInvestigationSpace && createFileName && createParsedRows.length > 0) {
      const selectedTplObj = mappingTemplates.find(t => t.id === selectedMappingId);
      const activeTplName = selectedTplObj ? selectedTplObj.name : (selectedMappingId ? `Mapping ${selectedMappingId}` : 'Global Standard Mapping');

      const workspaceRecords = createParsedRows.map((row, idx) => {
        const transformedRow = globalMappingService.transformRowToGlobalSchema(row, createFileMapping);
        const rowValues = Object.values(transformedRow).map(v => String(v !== undefined && v !== null ? v : ''));

        return {
          id: `wtr-${Date.now()}-${idx + 1}-${Math.random().toString(36).substring(2, 6)}`,
          file_name: createFileName,
          user: currentUser.username || currentUser.id || 'anonymous_user',
          user_id: currentUser.id || currentUser.username,
          tag: (createHashtag && createHashtag !== 'Untagged') ? createHashtag : 'Untagged',
          task_id: generatedTaskId,
          mapping_id: selectedMappingId || 'global-standard',
          mapping_name: activeTplName,
          transformed_data: transformedRow,
          raw_data: row,
          list_of_values_from_one_row: rowValues,
          createdAt: new Date().toISOString()
        };
      });

      api.saveWorkspaceTableRecords(workspaceRecords).catch(err => {
        console.warn('Backend saveWorkspaceTableRecords error:', err);
      });
    }

    // Reset form fields
    setCreateTitle('');
    setCreateDesc('');
    setCreateHashtag('Untagged');
    setCreateFileName('');
    setCreateRawHeaders([]);
    setCreateFileMapping({});
    setCreateParsedRows([]);

    if (onTaskCreated) {
      onTaskCreated(generatedTaskId);
    } else {
      onBackToWorkspace();
    }
  };

  if (creatorStep === 'upload_clean') {
    return (
      <UploadAndCleanTransactionsView
        fileName={createFileName || 'clearing_batch_feed.xlsx'}
        onBackToDetails={() => setCreatorStep('details')}
        onContinueToReview={() => setCreatorStep('details')}
        onSaveTemplate={() => {
          setCreatorStep('details');
        }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 overflow-y-auto p-6 space-y-6 font-sans bg-[#F8FAFC]">
      {/* 1. Header with Breadcrumbs & Back to Intake */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <button 
              type="button" 
              onClick={onBackToWorkspace}
              className="hover:text-slate-900 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <span>Intake</span>
            </button>
            <span>/</span>
            <span className="text-slate-800 font-semibold">New Task & Investigation Space</span>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200/70 text-[#F27421] flex items-center justify-center font-bold shadow-2xs shrink-0">
              <Plus size={20} />
            </div>
            <div>
              <h1 className="text-xl font-bold font-heading text-slate-900 tracking-tight">Create Task & Open Investigation Space</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Assign task, connect external database, upload files, and map columns for reconciliation directly in your workspace.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onBackToWorkspace}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200/90 rounded-xl shadow-2xs hover:bg-slate-50 transition-all cursor-pointer self-start sm:self-center shrink-0"
        >
          <ArrowLeft size={14} className="text-slate-500" />
          <span>Back to Intake</span>
        </button>
      </div>

      {/* 2. Communication Intake Context Banner (when converted from Mailbox/Chat) */}
      {initialPreFill && (
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50/30 to-white border border-blue-200/80 rounded-2xl p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Mail size={18} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-900">
                  Creating Task from {initialPreFill.channel ? initialPreFill.channel.toUpperCase() : 'EMAIL'}
                </span>
                <span className="text-[10px] bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full font-mono font-bold">
                  {initialPreFill.sourceMessageId}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Sender: <strong className="text-slate-800">{initialPreFill.senderName || initialPreFill.senderAddress || 'External Counterparty'}</strong>
                {initialPreFill.senderAddress && initialPreFill.senderName && ` <${initialPreFill.senderAddress}>`}
                {createFileName && (
                  <span className="ml-2 text-emerald-700 font-semibold">• Auto-loaded spreadsheet attachment "{createFileName}"</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 self-end sm:self-auto shrink-0">
            <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-lg font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Team Public
            </span>
          </div>
        </div>
      )}

      {/* 3. Main Form Container */}
      <form onSubmit={handleCreateTaskSubmit} className="space-y-6">
        {/* Card 1: Task Information & Governance */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-5">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <FileText size={16} className="text-[#F27421]" />
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">1. General Task Information</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Task Title */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Task Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="e.g. Chargeback Reconciliation Batch #801 or Settlement Audit"
                className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F27421]/20 focus:border-[#F27421] focus:bg-white transition-all font-medium"
              />
            </div>

            {/* Category / Hashtag (#) */}
            <div className="md:col-span-1 space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Category / Hashtag (#)
              </label>
              <select
                value={createHashtag}
                onChange={(e) => setCreateHashtag(e.target.value)}
                className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F27421]/20 focus:border-[#F27421] focus:bg-white cursor-pointer font-medium transition-all"
              >
                <option value="Untagged">🏷️ Untagged</option>
                {hashtags.map(h => (
                  <option key={h.tag} value={h.tag}>{h.tag} - {h.description}</option>
                ))}
              </select>
            </div>

            {/* Directive Info & Workflow Approval Banner */}
            {selectedTagPreset && (
              <div className="md:col-span-3 p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs bg-orange-50/30 border-orange-200/80 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-[#F27421] bg-orange-100/70 px-2.5 py-0.5 rounded-md border border-orange-200">{selectedTagPreset.tag}</span>
                  <span className="text-slate-600 truncate max-w-sm">{selectedTagPreset.description}</span>
                </div>

                {selectedTagPreset.workflowName && (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-slate-500 text-[11px]">Workflow:</span>
                    <span className="font-semibold text-slate-800">{selectedTagPreset.workflowName}</span>
                    {(() => {
                      const isApproved = linkedWorkflow?.status === 'APPROVED';
                      return (
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                          isApproved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {isApproved ? <CheckCircle2 size={11} className="text-emerald-600" /> : <AlertTriangle size={11} className="text-amber-600" />}
                          <span>{isApproved ? 'APPROVED WORKFLOW' : 'UNAPPROVED / DRAFT'}</span>
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* File Schema Mismatch Alert Banner */}
            {missingHashtagColumns.length > 0 && (
              <div className="md:col-span-3 p-4 bg-rose-50/80 border border-rose-200 rounded-xl space-y-2.5 text-xs animate-in fade-in duration-150 shadow-2xs">
                <div className="flex items-center justify-between text-rose-900 font-bold">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                    <span>File Schema Mismatch for Hashtag Directive {selectedTagPreset?.tag}</span>
                  </div>
                  <span className="text-[10px] bg-rose-100 text-rose-800 px-2.5 py-0.5 rounded-full font-mono font-bold border border-rose-200">
                    {missingHashtagColumns.length} Missing Column{missingHashtagColumns.length > 1 ? 's' : ''}
                  </span>
                </div>

                <p className="text-rose-700 text-[11px] leading-relaxed">
                  The attached file <strong>"{createFileName}"</strong> does not contain the minimum required columns expected by this hashtag directive.
                </p>

                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-rose-600 font-bold uppercase font-mono">Missing Required:</span>
                  {missingHashtagColumns.map(col => (
                    <span key={col} className="px-2 py-0.5 rounded bg-rose-100 text-rose-900 font-mono text-[11px] font-bold border border-rose-300">
                      ✕ {col}
                    </span>
                  ))}
                </div>

                <div className="pt-2 border-t border-rose-200/60 text-[10px] text-rose-600 font-mono flex items-center justify-between">
                  <span>Detected Headers ({createRawHeaders.length}): {createRawHeaders.slice(0, 6).join(', ')}{createRawHeaders.length > 6 ? '...' : ''}</span>
                  <span>Action: Provide missing columns or map fields below</span>
                </div>
              </div>
            )}

            {/* Task Description */}
            <div className="md:col-span-3 space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Task Description / Investigation Notes
              </label>
              <textarea
                rows={3}
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="Describe the operational goal, anomaly details, or instructions..."
                className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F27421]/20 focus:border-[#F27421] focus:bg-white transition-all font-medium"
              />
            </div>

            {/* Assignee */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Assign Task To
              </label>
              <select
                value={createAssigneeId}
                onChange={(e) => setCreateAssigneeId(e.target.value)}
                className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F27421]/20 focus:border-[#F27421] focus:bg-white cursor-pointer font-medium transition-all"
              >
                <option value={currentUser.id}>Assign to Myself (@{currentUser.username})</option>
                {users.filter(u => u.id !== currentUser.id && u.isApproved).map(u => (
                  <option key={u.id} value={u.id}>@{u.username} ({u.role})</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div className="md:col-span-1 space-y-1.5">
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Priority
              </label>
              <select
                value={createPriority}
                onChange={(e) => setCreatePriority(e.target.value as IssuePriority)}
                className="w-full bg-slate-50/70 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F27421]/20 focus:border-[#F27421] focus:bg-white cursor-pointer font-medium transition-all"
              >
                <option value="Low">Low Priority</option>
                <option value="Medium">Medium Priority</option>
                <option value="High">High Priority</option>
                <option value="Critical">Critical Priority</option>
              </select>
            </div>

            {/* Task Visibility Option */}
            <div className="md:col-span-3 bg-slate-50/80 border border-slate-200/90 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="block text-xs font-bold text-slate-800">
                  Task Visibility & Team Collaboration
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  {taskVisibility === 'TEAM_PUBLIC'
                    ? 'Visible to all members of your team workspace. Everyone can collaborate, inspect data, and propose resolutions.'
                    : 'Personal private task. Only you and team supervisors can access this task.'}
                </span>
              </div>
              <div className="flex items-center bg-slate-200/70 p-1 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => setTaskVisibility('TEAM_PUBLIC')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 ${
                    taskVisibility === 'TEAM_PUBLIC'
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users size={13} className={taskVisibility === 'TEAM_PUBLIC' ? 'text-[#F27421]' : 'text-slate-500'} />
                  <span>Team Public</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTaskVisibility('PERSONAL_PRIVATE')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5 ${
                    taskVisibility === 'PERSONAL_PRIVATE'
                      ? 'bg-white text-slate-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Lock size={13} className={taskVisibility === 'PERSONAL_PRIVATE' ? 'text-indigo-600' : 'text-slate-500'} />
                  <span>Personal Private</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Investigation Space & File Dataset */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="toggle-investigation-space-component"
                checked={includeInvestigationSpace}
                onChange={(e) => setIncludeInvestigationSpace(e.target.checked)}
                className="w-4 h-4 accent-[#F27421] rounded cursor-pointer"
              />
              <label htmlFor="toggle-investigation-space-component" className="text-xs font-bold text-slate-900 cursor-pointer flex items-center gap-2">
                <Layers size={16} className="text-[#F27421]" />
                <span>2. Attach File & Investigation Space</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCreatorStep('upload_clean')}
                className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:text-slate-900 flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer"
                title="Open interactive spreadsheet cleaning grid (Screen 21)"
              >
                <Sparkles size={13} className="text-[#F27421]" />
                <span>Clean in Grid View</span>
              </button>
              {includeInvestigationSpace ? (
                <span className="text-[11px] bg-orange-50 text-[#F27421] border border-orange-200/80 px-3 py-0.5 rounded-full font-bold">
                  Investigation Space Active
                </span>
              ) : (
                <span className="text-[11px] bg-slate-100 text-slate-500 px-3 py-0.5 rounded-full font-medium">
                  Optional (Single Task Mode)
                </span>
              )}
            </div>
          </div>

          {includeInvestigationSpace && (
            <div className="pt-2">
              <StandardFileIngestionWorkspace
                ref={ingestionWorkspaceRef}
                currentUser={currentUser}
                selectedHashtag={selectedTagPreset}
                onDatasetReady={(payload) => {
                  setCreateFileName(payload.fileName);
                  setCreateRawHeaders(payload.activeHeaders);
                  setCreateFileMapping(payload.columnMappings);
                  setCreateParsedRows(payload.transformedRows);
                  if (payload.selectedTemplateId) {
                    setSelectedMappingId(payload.selectedTemplateId);
                  }
                }}
              />
            </div>
          )}
        </div>

        {/* Action Bar Footer */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur-xs border border-slate-200/90 rounded-2xl p-4 shadow-md flex justify-between items-center z-10">
          <button
            type="button"
            onClick={onBackToWorkspace}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
          >
            <ArrowLeft size={14} className="text-slate-500" />
            <span>Back to Intake</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToWorkspace}
              className="px-4 py-2 text-slate-500 hover:text-slate-800 text-xs font-semibold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-[#F27421] hover:bg-[#e06516] active:bg-[#c95712] text-white text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center space-x-2 cursor-pointer"
            >
              <Plus size={15} />
              <span>Create Task & Launch Workspace</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default WorkspaceTaskCreator;

