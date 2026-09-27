/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  Plus, ArrowLeft, Layers, FileText, Upload, Trash2, CheckCircle2, 
  Sparkles, Eraser, CheckCheck, ListFilter, Undo2, Wand2, BookmarkCheck, 
  Search, Check, X, MoreHorizontal, Edit3, Type, SlidersHorizontal, 
  ShieldCheck, CheckSquare, RefreshCw, Save 
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
              headers = raw[0].map(h => String(h).trim());
              parsedRows = XLSX.utils.sheet_to_json(firstSheet) as Record<string, any>[];
            }
          }
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
      } catch (err) {
        alert('Could not parse uploaded file. Please provide a valid CSV or Excel document.');
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
  const handleCreateTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim()) {
      alert('Please enter a task title.');
      return;
    }

    const assignee = users.find(u => u.id === createAssigneeId);
    const generatedTaskId = `ISS-${Math.floor(1000 + Math.random() * 9000)}`;

    const hasAttachedFile = Boolean(includeInvestigationSpace && createFileName && createFileName.trim().length > 0);

    const newIssuePayload: any = {
      id: generatedTaskId,
      title: createTitle.trim(),
      description: createDesc.trim() || (initialPreFill ? `Task converted from ${initialPreFill.channel || 'email'} by ${initialPreFill.senderName || initialPreFill.senderAddress || 'External Counterparty'}.` : 'Task created in Workspace.'),
      priority: createPriority,
      type: hasAttachedFile ? ('file' as const) : ('single' as const),
      assignedTechUserId: createAssigneeId || currentUser.id,
      assignedTechUserName: assignee ? assignee.username : currentUser.username,
      linkedHashtag: (createHashtag && createHashtag !== 'Untagged') ? createHashtag : undefined,
      uploadedFileName: hasAttachedFile ? createFileName : undefined,
      uploadedFileHeaders: (hasAttachedFile && createRawHeaders.length > 0) ? createRawHeaders : undefined,
      fileMapping: (hasAttachedFile && Object.keys(createFileMapping).length > 0) ? createFileMapping : undefined,
      firstLevelMappedData: (hasAttachedFile && createParsedRows.length > 0) ? createParsedRows : undefined,
      mappingId: hasAttachedFile ? selectedMappingId : undefined,
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

      try {
        const savedWs = localStorage.getItem('workspace_table_records');
        const existingRecords = savedWs ? JSON.parse(savedWs) : [];
        const mergedRecords = [...workspaceRecords, ...existingRecords];
        localStorage.setItem('workspace_table_records', JSON.stringify(mergedRecords));
      } catch (err) {
        console.warn('LocalStorage save error for workspace_table_records:', err);
      }

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

  return (
    <div className="space-y-3">
      {/* Header Banner for Create Task */}
      <div className="bg-[#0F172B] border border-slate-800 rounded-xl p-3 sm:p-3.5 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="p-1 bg-blue-500/20 rounded-md text-blue-400">
              <Plus size={16} />
            </span>
            <h2 className="text-sm font-bold">Create Task & Open Investigation Space</h2>
          </div>
          <p className="text-[11px] text-slate-300 max-w-2xl leading-relaxed">
            Assign task, connect external database, upload files, and map columns for reconciliation directly in your workspace.
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToWorkspace}
          className="px-3.5 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer self-start md:self-center"
        >
          <ArrowLeft size={13} />
          <span>Back to Workspace</span>
        </button>
      </div>

      {/* Email / Communication Intake Banner */}
      {initialPreFill && (
        <div className="bg-gradient-to-r from-blue-900/90 to-indigo-900/90 border border-blue-500/40 rounded-xl p-3.5 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-500/20 rounded-lg text-blue-300 shrink-0">
              <Mail size={18} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-white">
                  Creating Task from {initialPreFill.channel ? initialPreFill.channel.toUpperCase() : 'EMAIL'}
                </span>
                <span className="text-[10px] bg-blue-400/20 text-blue-200 border border-blue-400/30 px-2 py-0.5 rounded-full font-mono">
                  {initialPreFill.sourceMessageId}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                Sender: <strong>{initialPreFill.senderName || initialPreFill.senderAddress || 'External Counterparty'}</strong>
                {initialPreFill.senderAddress && initialPreFill.senderName && ` <${initialPreFill.senderAddress}>`}
                {createFileName && (
                  <span className="ml-2 text-emerald-300 font-semibold">• Auto-loaded spreadsheet attachment "{createFileName}"</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 self-end sm:self-auto shrink-0">
            <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg font-bold">
              Team Public
            </span>
          </div>
        </div>
      )}

      {/* Form Container */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
        <form onSubmit={handleCreateTaskSubmit} className="space-y-5">
          {/* Basic Task Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Row 1: Task Title + Category / Hashtag Inline */}
            <div className="md:col-span-2 space-y-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase">
                Task Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="e.g. Chargeback Reconciliation Batch #801 or Settlement Audit"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-medium"
              />
            </div>

            <div className="md:col-span-1 space-y-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase">
                Category / Hashtag (#)
              </label>
              <select
                value={createHashtag}
                onChange={(e) => setCreateHashtag(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
              >
                <option value="Untagged">🏷️ Untagged</option>
                {hashtags.map(h => (
                  <option key={h.tag} value={h.tag}>{h.tag} - {h.description}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Task Description / Investigation Notes
              </label>
              <textarea
                rows={3}
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="Describe the operational goal, anomaly details, or instructions..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all font-medium"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Assign Task To
              </label>
              <select
                value={createAssigneeId}
                onChange={(e) => setCreateAssigneeId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
              >
                <option value={currentUser.id}>Assign to Myself (@{currentUser.username})</option>
                {users.filter(u => u.id !== currentUser.id && u.isApproved).map(u => (
                  <option key={u.id} value={u.id}>@{u.username} ({u.role})</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Priority
              </label>
              <select
                value={createPriority}
                onChange={(e) => setCreatePriority(e.target.value as IssuePriority)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer font-medium"
              >
                <option value="Low">Low Priority</option>
                <option value="Medium">Medium Priority</option>
                <option value="High">High Priority</option>
                <option value="Critical">Critical Priority</option>
              </select>
            </div>

            {/* Task Visibility Option */}
            <div className="md:col-span-3 bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <span className="block text-[11px] font-bold text-slate-800 uppercase">
                  Task Visibility & Team Collaboration
                </span>
                <span className="text-[10px] text-slate-500">
                  {taskVisibility === 'TEAM_PUBLIC'
                    ? 'Visible to all members of your team workspace. Everyone can collaborate, inspect data, and propose resolutions.'
                    : 'Personal private task. Only you and team supervisors can access this task.'}
                </span>
              </div>
              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setTaskVisibility('TEAM_PUBLIC')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                    taskVisibility === 'TEAM_PUBLIC'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Users size={13} />
                  <span>Team Public</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTaskVisibility('PERSONAL_PRIVATE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                    taskVisibility === 'PERSONAL_PRIVATE'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Lock size={13} />
                  <span>Personal Private</span>
                </button>
              </div>
            </div>
          </div>

          {/* Investigation Space Toggle Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <input
                  type="checkbox"
                  id="toggle-investigation-space-component"
                  checked={includeInvestigationSpace}
                  onChange={(e) => setIncludeInvestigationSpace(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
                <label htmlFor="toggle-investigation-space-component" className="text-xs font-bold text-slate-800 cursor-pointer flex items-center gap-1.5">
                  <Layers size={15} className="text-blue-600" />
                  <span>Attach File & Choose Mapping Template</span>
                </label>
              </div>
              {includeInvestigationSpace && (
                <span className="text-[10px] bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full font-semibold">
                  Investigation Space Active
                </span>
              )}
            </div>

            {includeInvestigationSpace && (
              <div className="space-y-4 pt-1">
                {/* File Attachment & Quick Loader */}
                <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3.5 shadow-xs">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div>
                      <span className="block text-[11px] font-bold text-slate-800">
                        Upload File or Load Sample Batch
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Supports CSV, Excel (.xlsx). Auto-extracts column headers and populates data view.
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleLoadSampleChargebacks}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-semibold rounded-lg border border-blue-200 transition-all cursor-pointer"
                      >
                        📄 Chargebacks CSV
                      </button>
                      <button
                        type="button"
                        onClick={handleLoadSampleSettlements}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded-lg border border-emerald-200 transition-all cursor-pointer"
                      >
                        📊 Settlement CSV
                      </button>
                    </div>
                  </div>

                  {/* File Upload Zone / Active File Card */}
                  {createFileName ? (
                    <div className="p-3.5 bg-blue-50/50 border border-blue-200/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-150">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shrink-0">
                          <FileText size={18} />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-slate-900">{createFileName}</span>
                            <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono font-semibold">
                              {createParsedRows.length} Rows · {createRawHeaders.length} Cols
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">
                            File ready for mapping and data preview below
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
                        <label className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-xs cursor-pointer transition-all flex items-center space-x-1.5">
                          <Upload size={13} className="text-slate-500" />
                          <span>Change File</span>
                          <input
                            id="task-create-file-upload-input"
                            type="file"
                            accept=".csv, .xlsx, .xls"
                            onChange={handleCreateFileChange}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleRemoveCreateUploadedFile}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                          title="Remove uploaded data file"
                        >
                          <Trash2 size={13} className="text-rose-600" />
                          <span>Remove Data</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-4 bg-slate-50/50 transition-all">
                      <label className="flex flex-col items-center cursor-pointer w-full">
                        <Upload size={20} className="text-blue-600 mb-1" />
                        <span className="text-xs font-semibold text-slate-700">
                          Choose CSV or Excel file
                        </span>
                        <span className="text-[9px] text-slate-400 mt-0.5">Click to browse local files or drag and drop</span>
                        <input
                          id="task-create-file-upload-input"
                          type="file"
                          accept=".csv, .xlsx, .xls"
                          onChange={handleCreateFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}

                  {isProcessingFile && (
                    <div className="text-center text-xs text-blue-600 font-semibold animate-pulse">
                      Parsing file contents and extracting headers...
                    </div>
                  )}

                  {/* Data View Table with Integrated Header Mapping & Cleaning Tools */}
                  {createRawHeaders.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      {/* Cleaning Feedback Banner */}
                      {createCleaningActionSuccess && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between animate-in fade-in duration-200">
                          <div className="flex items-center space-x-2">
                            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                            <span className="font-semibold">{createCleaningActionSuccess}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCreateCleaningActionSuccess(null)}
                            className="text-emerald-600 hover:text-emerald-900 font-bold ml-2 text-xs cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      )}

                      {/* Data View Action & Filter Toolbar */}
                      <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 space-y-2.5">
                        <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-2.5">
                          {/* Left: Quick Data Cleaning & Template Actions */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1">
                              <Sparkles size={12} className="text-blue-500" />
                              Tools:
                            </span>

                            <button
                              type="button"
                              onClick={() => handleCreateGlobalDatasetClean('trim_all')}
                              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-[10px] font-bold rounded-lg border border-slate-200 shadow-xs flex items-center space-x-1 transition-all cursor-pointer"
                              title="Trim whitespace across all columns and rows"
                            >
                              <Eraser size={11} className="text-amber-500" />
                              <span>Trim All</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCreateGlobalDatasetClean('deduplicate')}
                              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-[10px] font-bold rounded-lg border border-slate-200 shadow-xs flex items-center space-x-1 transition-all cursor-pointer"
                              title="Remove duplicate rows"
                            >
                              <CheckCheck size={11} className="text-emerald-500" />
                              <span>Deduplicate</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCreateGlobalDatasetClean('remove_empty_rows')}
                              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-[10px] font-bold rounded-lg border border-slate-200 shadow-xs flex items-center space-x-1 transition-all cursor-pointer"
                              title="Remove empty rows from dataset"
                            >
                              <ListFilter size={11} className="text-blue-500" />
                              <span>Filter Empty</span>
                            </button>

                            {createCleaningUndoSnapshot && (
                              <button
                                type="button"
                                onClick={handleCreateUndoCleaning}
                                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold rounded-lg border border-amber-300 shadow-xs flex items-center space-x-1 transition-all cursor-pointer animate-pulse"
                                title="Undo last data cleaning operation"
                              >
                                <Undo2 size={11} className="text-amber-700" />
                                <span>Undo</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setCreateFileMapping(autoGenerateColumnMapping(createRawHeaders))}
                              className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold rounded-lg border border-blue-200 shadow-xs flex items-center space-x-1 transition-all cursor-pointer"
                              title="Auto-detect and map columns against target schema"
                            >
                              <Wand2 size={11} className="text-blue-600" />
                              <span>Auto Map</span>
                            </button>

                            <button
                              type="button"
                              onClick={handleOpenSaveMappingModal}
                              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-lg border border-emerald-300 shadow-xs flex items-center space-x-1.5 transition-all cursor-pointer"
                              title="Save current column mapping configuration as a reusable template"
                            >
                              <BookmarkCheck size={11} className="text-emerald-600" />
                              <span>Save Template</span>
                            </button>

                            {/* Remove button on Data View */}
                            <button
                              type="button"
                              onClick={handleRemoveCreateUploadedFile}
                              className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold rounded-lg border border-rose-200 shadow-xs flex items-center space-x-1 transition-all cursor-pointer ml-auto sm:ml-0"
                              title="Remove uploaded data and clear table preview"
                            >
                              <Trash2 size={11} className="text-rose-600" />
                              <span>Remove Data</span>
                            </button>
                          </div>

                          {/* Right: Choose Mapping Template for File Upload alongside Filter preview data input field */}
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Choose Mapping Template for File Upload Dropdown */}
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
                                    if (selectedTpl) {
                                      if (selectedTpl.columnMappings && Object.keys(selectedTpl.columnMappings).length > 0) {
                                        setCreateFileMapping(selectedTpl.columnMappings);
                                      }
                                      if (selectedTpl.sampleHeaders && selectedTpl.sampleHeaders.length > 0 && createRawHeaders.length === 0) {
                                        setCreateRawHeaders(selectedTpl.sampleHeaders);
                                        setCreateFileName(`template_${selectedTpl.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.${selectedTpl.sourceType || 'csv'}`);
                                      }
                                    }
                                  } else {
                                    if (createRawHeaders.length > 0) {
                                      setCreateFileMapping(autoGenerateColumnMapping(createRawHeaders));
                                    }
                                  }
                                }}
                                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200 cursor-pointer max-w-[210px]"
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

                            {/* Filter preview data input field */}
                            <div className="relative">
                              <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
                              <input
                                type="text"
                                placeholder="Filter preview data..."
                                value={createDataSearch}
                                onChange={(e) => setCreateDataSearch(e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg pl-7 pr-2.5 py-1 text-[10px] text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 w-36 sm:w-44"
                              />
                              {createDataSearch && (
                                <button
                                  type="button"
                                  onClick={() => setCreateDataSearch('')}
                                  className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-[10px] cursor-pointer"
                                >
                                  ✕
                                </button>
                              )}
                            </div>

                            <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-md shrink-0 font-medium">
                              {createParsedRows.length} rows · {createRawHeaders.length} cols
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Data View Table with Integrated Header Mapping */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
                        <div className="overflow-x-auto max-h-96">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead className="sticky top-0 z-10 shadow-xs">
                              {/* ROW 1: Column Headers & Quick Cleaning Dropdowns */}
                              <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 text-[11px]">
                                <th className="py-2.5 px-3 w-12 text-center bg-slate-200/70 border-r border-slate-200 text-[10px] text-slate-500 font-mono">
                                  #
                                </th>
                                {createRawHeaders.map((colKey) => (
                                  <th
                                    key={colKey}
                                    className="py-2.5 px-3 min-w-[190px] border-r border-slate-200 font-sans group relative bg-slate-100"
                                  >
                                    {createEditingColumnKey === colKey ? (
                                      <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                                        <input
                                          type="text"
                                          value={createNewColumnHeaderName}
                                          onChange={(e) => setCreateNewColumnHeaderName(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleCreateRenameColumn(colKey, createNewColumnHeaderName);
                                            if (e.key === 'Escape') {
                                              setCreateEditingColumnKey(null);
                                              setCreateNewColumnHeaderName('');
                                            }
                                          }}
                                          autoFocus
                                          className="w-full bg-white border border-blue-500 rounded px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleCreateRenameColumn(colKey, createNewColumnHeaderName)}
                                          className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 cursor-pointer"
                                          title="Save name"
                                        >
                                          <Check size={11} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setCreateEditingColumnKey(null);
                                            setCreateNewColumnHeaderName('');
                                          }}
                                          className="p-1 bg-slate-300 text-slate-700 rounded hover:bg-slate-400 cursor-pointer"
                                          title="Cancel"
                                        >
                                          <X size={11} />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-between gap-1">
                                        <span className="font-mono font-bold text-slate-800 text-xs truncate max-w-[130px]" title={colKey}>
                                          {colKey}
                                        </span>

                                        <div className="flex items-center space-x-1 shrink-0">
                                          {/* Column Menu Button */}
                                          <div className="relative">
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setCreateActiveColumnMenu(createActiveColumnMenu === colKey ? null : colKey);
                                              }}
                                              className="p-1 hover:bg-slate-200 rounded text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                                              title="Column tools & cleaning menu"
                                            >
                                              <MoreHorizontal size={13} />
                                            </button>

                                            {/* Dropdown Menu for Column */}
                                            {createActiveColumnMenu === colKey && (
                                              <div
                                                className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-left animate-in fade-in zoom-in-95 duration-100"
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                <div className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                                  Column: {colKey}
                                                </div>

                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setCreateEditingColumnKey(colKey);
                                                    setCreateNewColumnHeaderName(colKey);
                                                    setCreateActiveColumnMenu(null);
                                                  }}
                                                  className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center space-x-2 cursor-pointer font-sans"
                                                >
                                                  <Edit3 size={12} className="text-blue-500" />
                                                  <span>Rename Column Header</span>
                                                </button>

                                                <div className="my-1 border-t border-slate-100"></div>
                                                <div className="px-3 py-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                                  Clean Values
                                                </div>

                                                <button
                                                  type="button"
                                                  onClick={() => handleCreateTransformColumn(colKey, 'trim')}
                                                  className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 cursor-pointer font-sans"
                                                >
                                                  <Eraser size={12} className="text-amber-500" />
                                                  <span>Trim Whitespace</span>
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={() => handleCreateTransformColumn(colKey, 'uppercase')}
                                                  className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 cursor-pointer font-sans"
                                                >
                                                  <Type size={12} className="text-indigo-500" />
                                                  <span>UPPERCASE (ALL CAPS)</span>
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={() => handleCreateTransformColumn(colKey, 'lowercase')}
                                                  className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 cursor-pointer font-sans"
                                                >
                                                  <Type size={12} className="text-slate-400" />
                                                  <span>lowercase (all small)</span>
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={() => handleCreateTransformColumn(colKey, 'strip_special')}
                                                  className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 cursor-pointer font-sans"
                                                >
                                                  <Sparkles size={12} className="text-emerald-500" />
                                                  <span>Strip Special Characters</span>
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={() => handleCreateTransformColumn(colKey, 'number_clean')}
                                                  className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 cursor-pointer font-sans"
                                                >
                                                  <SlidersHorizontal size={12} className="text-blue-500" />
                                                  <span>Format Number / 2 Decimals</span>
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={() => handleCreateTransformColumn(colKey, 'mask_card')}
                                                  className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 cursor-pointer font-sans"
                                                >
                                                  <ShieldCheck size={12} className="text-purple-500" />
                                                  <span>Mask Card PAN (4111****)</span>
                                                </button>

                                                <button
                                                  type="button"
                                                  onClick={() => handleCreateTransformColumn(colKey, 'fill_blanks')}
                                                  className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center space-x-2 cursor-pointer font-sans"
                                                >
                                                  <CheckSquare size={12} className="text-slate-500" />
                                                  <span>Fill Blanks with 'N/A'</span>
                                                </button>

                                                <div className="my-1 border-t border-slate-100"></div>

                                                <button
                                                  type="button"
                                                  onClick={() => handleCreateDeleteColumn(colKey)}
                                                  className="w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center space-x-2 cursor-pointer font-sans font-semibold"
                                                >
                                                  <Trash2 size={12} className="text-red-500" />
                                                  <span>Delete Column</span>
                                                </button>
                                              </div>
                                            )}
                                          </div>

                                          {/* Quick Delete Column Button */}
                                          <button
                                            type="button"
                                            onClick={() => handleCreateDeleteColumn(colKey)}
                                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                            title={`Remove column ${colKey}`}
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </th>
                                ))}
                              </tr>

                              {/* ROW 2: Integrated Schema Mapping Dropdown Row */}
                              <tr className="bg-slate-50 border-b-2 border-slate-200 text-slate-600 text-[10px]">
                                <th className="py-2 px-3 text-center bg-slate-100 border-r border-slate-200 font-mono text-[9px] text-blue-700 font-bold uppercase tracking-wider">
                                  Maps To
                                </th>
                                {createRawHeaders.map((colKey) => {
                                  const mappedField = createFileMapping[colKey];
                                  const isMapped = mappedField && mappedField !== 'unmapped';

                                  return (
                                    <th key={`map-${colKey}`} className="py-1.5 px-2.5 border-r border-slate-200 bg-slate-50 font-normal">
                                      <div className="flex items-center space-x-1">
                                        <span className={`w-2 h-2 rounded-full shrink-0 ${isMapped ? 'bg-blue-600' : 'bg-slate-300'}`} />
                                        <select
                                          value={mappedField || 'unmapped'}
                                          onChange={(e) => {
                                            setCreateFileMapping(prev => ({
                                              ...prev,
                                              [colKey]: e.target.value
                                            }));
                                          }}
                                          className={`w-full text-[11px] font-mono rounded px-2 py-1 border transition-all cursor-pointer ${
                                            isMapped
                                              ? 'bg-blue-50/90 border-blue-300 text-blue-900 font-semibold shadow-xs'
                                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                          }`}
                                        >
                                          <option value="unmapped">-- Skip (Unmapped) --</option>
                                          <optgroup label="Global Standard Column Dictionary">
                                            {TARGET_DB_FIELDS.map(f => (
                                              <option key={f.id} value={f.id}>{f.label}</option>
                                            ))}
                                          </optgroup>
                                        </select>
                                      </div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>

                            <tbody className="divide-y divide-slate-100 bg-white">
                              {(() => {
                                const filteredRows = createParsedRows.filter(row => {
                                  if (!createDataSearch.trim()) return true;
                                  const query = createDataSearch.toLowerCase();
                                  return Object.values(row).some(val =>
                                    String(val || '').toLowerCase().includes(query)
                                  );
                                });

                                if (filteredRows.length === 0) {
                                  return (
                                    <tr>
                                      <td
                                        colSpan={createRawHeaders.length + 1}
                                        className="py-8 text-center text-slate-400 font-sans text-xs"
                                      >
                                        {createDataSearch ? `No records matched filter "${createDataSearch}".` : 'No parsed records found.'}
                                      </td>
                                    </tr>
                                  );
                                }

                                return filteredRows.map((row, idx) => (
                                  <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                                    <td className="py-2 px-3 text-center text-[10px] text-slate-400 font-mono bg-slate-50/50 border-r border-slate-100">
                                      {idx + 1}
                                    </td>
                                    {createRawHeaders.map((colKey) => {
                                      const cellVal = row[colKey];
                                      return (
                                        <td
                                          key={colKey}
                                          className="py-2 px-3 text-slate-700 font-mono text-[11px] truncate max-w-[200px] border-r border-slate-100"
                                          title={cellVal !== undefined && cellVal !== null ? String(cellVal) : ''}
                                        >
                                          {cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '' ? (
                                            String(cellVal)
                                          ) : (
                                            <span className="text-slate-300">-</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ));
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex justify-end items-center space-x-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onBackToWorkspace}
              className="px-5 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center space-x-2 cursor-pointer"
            >
              <Plus size={15} />
              <span>Create Task & Launch Workspace</span>
            </button>
          </div>
        </form>
      </div>

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
                  placeholder="e.g. Visa Settlement CSV Mapping"
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
                  placeholder="Briefly describe the format or processor origin of this file..."
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>

              {/* Mapped Columns Summary */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700 uppercase tracking-wider">
                    Mapped Column Headers ({Object.keys(createFileMapping).filter(k => createFileMapping[k] && createFileMapping[k] !== 'unmapped').length} of {createRawHeaders.length})
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Format: CSV/Excel</span>
                </div>

                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-2.5 bg-slate-50/70 space-y-1.5 text-xs">
                  {createRawHeaders.map((col) => {
                    const mapped = createFileMapping[col];
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
  );
};

export default WorkspaceTaskCreator;
