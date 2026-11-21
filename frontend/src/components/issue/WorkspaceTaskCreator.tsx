/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  Plus, ArrowLeft, Layers, FileText, Upload, Trash2, CheckCircle2, 
  Sparkles, Eraser, CheckCheck, ListFilter, Undo2, Wand2, BookmarkCheck, 
  Search, Check, X, MoreHorizontal, MoreVertical, Edit3, Type, SlidersHorizontal, 
  ShieldCheck, CheckSquare, RefreshCw, Save, AlertTriangle, GitBranch,
  FileSpreadsheet, Split, Combine, Sliders, Shield, Mail, Users, Lock, ChevronDown,
  ChevronRight, AlertCircle, Eye, HelpCircle, Terminal, PanelRightClose, PanelRightOpen,
  Paperclip, Download, RotateCcw, Link2, CircleDot, Clock, ChevronLeft, FolderOpen, Play, Hash
} from 'lucide-react';
import { 
  IssuePriority, 
  HashtagPreset, 
  User, 
  Team,
  DatabaseConnection, 
  EnvironmentSystem, 
  TaskPreFillFromMessage,
  GlobalTransactionSchemaField,
  FileIngestionMappingTemplate
} from '../../types';
import { api } from '../../api/client';
import { globalMappingService, DEFAULT_GLOBAL_STANDARD_FIELDS } from '../../services/globalMappingService';
import { DataTablePagination } from '../common/DataTablePagination';
import { generateFallbackAttachmentDataset } from '../common/StandardFileIngestionWorkspace';

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
  type?: 'INSPECT_HEADER' | 'MAP_FIELDS' | 'REQUIRED_COLUMNS' | 'DEDUPLICATE' | 'TRIM' | 'EMPTY_ROWS' | 'MERGE' | 'SPLIT' | 'TRANSFORM' | 'CUSTOM';
  details?: Record<string, any>;
  appliedAt?: string;
}

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

  // Basic Task Information (dynamic, never hardcoded)
  const [createTitle, setCreateTitle] = useState(() => {
    if (initialPreFill?.title) return initialPreFill.title;
    if (initialPreFill?.subject) return initialPreFill.subject;
    return '';
  });
  const [createDesc, setCreateDesc] = useState(() => initialPreFill?.description || '');
  const [createPriority, setCreatePriority] = useState<IssuePriority>('Medium');
  const [createAssigneeId, setCreateAssigneeId] = useState(currentUser.id);
  const [createHashtag, setCreateHashtag] = useState('Untagged');

  // Inline Hashtag management
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');

  // File & Data States
  const [createFileName, setCreateFileName] = useState('');
  const [createRawHeaders, setCreateRawHeaders] = useState<string[]>([]);
  const [createFileMapping, setCreateFileMapping] = useState<Record<string, string>>({});
  const [createParsedRows, setCreateParsedRows] = useState<Record<string, any>[]>([]);
  const [activeAttachment, setActiveAttachment] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Dynamic Columns State for Grid View (populated on file upload / attachment ingestion)
  const [columns, setColumns] = useState<ColumnDef[]>([]);

  // Standard Fields & Templates
  const [standardFields, setStandardFields] = useState<GlobalTransactionSchemaField[]>([]);
  const [templates, setTemplates] = useState<FileIngestionMappingTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('Standard Settlement Template');

  // Custom Recipe steps dynamic tracking: Step 1 = Inspect header, Step 2 = Map target fields, Custom steps, Step Final = Required columns
  const [customRecipeSteps, setCustomRecipeSteps] = useState<RecipeStep[]>([]);

  // Layout View States matching Case page
  const [isSidePanelCollapsed, setIsSidePanelCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'grid' | 'schema' | 'recipes'>('grid');
  const [filterMode, setFilterMode] = useState<'all' | 'duplicates' | 'unique'>('all');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showTableActionsMenu, setShowTableActionsMenu] = useState(false);
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const [columnSearchQuery, setColumnSearchQuery] = useState('');
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>([]);
  const columnFilterRef = useRef<HTMLDivElement | null>(null);

  // Modals
  const [metadataModalOpen, setMetadataModalOpen] = useState(false);
  const [stepDetailModal, setStepDetailModal] = useState<RecipeStep | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [templateSaveName, setTemplateSaveName] = useState('My Custom Settlement Template');

  // Undo / History Stack
  const [history, setHistory] = useState<Array<{
    rows: Record<string, any>[];
    columns: ColumnDef[];
    columnMappings: Record<string, string>;
    customSteps: RecipeStep[];
    fileName: string;
  }>>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Grid Controls
  const [activeMenuColumn, setActiveMenuColumn] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(7);

  // Split Modal State
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitTargetCol, setSplitTargetCol] = useState('');
  const [splitDelimiter, setSplitDelimiter] = useState('\\\\');
  const [splitCol1Name, setSplitCol1Name] = useState('Terminal_Code');
  const [splitCol2Name, setSplitCol2Name] = useState('Terminal_Location');

  // Workflows & Directive Validation Linkage
  const [workflows, setWorkflows] = useState<any[]>([]);
  useEffect(() => {
    api.getWorkflows().then(data => {
      if (Array.isArray(data)) setWorkflows(data);
    }).catch(err => {
      console.warn('Failed to load workflows in WorkspaceTaskCreator:', err);
    });

    const cached = globalMappingService.getStandardFields();
    if (cached && cached.length > 0) {
      setStandardFields(cached);
    } else {
      api.getGlobalStandardDirectory().then(f => {
        if (Array.isArray(f) && f.length > 0) {
          setStandardFields(f);
          globalMappingService.updateStandardFields(f);
        } else {
          setStandardFields(DEFAULT_GLOBAL_STANDARD_FIELDS);
        }
      }).catch(err => {
        console.warn('Could not fetch global standard directory, using default:', err);
        setStandardFields(DEFAULT_GLOBAL_STANDARD_FIELDS);
      });
    }

    api.getFileMappingTemplates().then(res => {
      if (Array.isArray(res)) setTemplates(res);
    }).catch(err => console.warn('Could not fetch templates:', err));
  }, []);

  // Sync visible column IDs when columns change
  useEffect(() => {
    if (columns.length > 0 && visibleColumnIds.length === 0) {
      setVisibleColumnIds(columns.map(c => c.id));
    }
  }, [columns, visibleColumnIds.length]);

  const selectedTagPreset = useMemo(() => {
    if (!createHashtag || createHashtag === 'Untagged') return null;
    return hashtags.find(h => h.tag === createHashtag) || null;
  }, [createHashtag, hashtags]);

  const linkedWorkflow = useMemo(() => {
    if (!selectedTagPreset?.workflowId && !selectedTagPreset?.workflowName) return null;
    return workflows.find(w => w.id === selectedTagPreset.workflowId || w.name === selectedTagPreset.workflowName) || null;
  }, [selectedTagPreset, workflows]);

  // Dynamic Required Columns Checklist (ZERO HARDCODING: derived purely from hashtag preset or standardFields.required)
  const requiredColumnsList = useMemo(() => {
    let reqCols: string[] = [];

    if (selectedTagPreset?.minimumRequiredColumns && selectedTagPreset.minimumRequiredColumns.length > 0) {
      reqCols = selectedTagPreset.minimumRequiredColumns;
    } else if (selectedTagPreset?.expectedFileStructure && selectedTagPreset.expectedFileStructure.length > 0) {
      reqCols = selectedTagPreset.expectedFileStructure;
    } else {
      // Look up required columns from registered standard fields in directory
      const activeFields = standardFields.length > 0 ? standardFields : DEFAULT_GLOBAL_STANDARD_FIELDS;
      const requiredFromStandard = activeFields.filter(f => f.required).map(f => f.key || f.label);
      if (requiredFromStandard.length > 0) {
        reqCols = requiredFromStandard;
      }
    }

    // Deduplicate case-insensitively
    const uniqueCols: string[] = [];
    const seen = new Set<string>();
    reqCols.forEach(col => {
      const trimmed = col.trim();
      const lower = trimmed.toLowerCase();
      if (lower && !seen.has(lower)) {
        seen.add(lower);
        uniqueCols.push(trimmed);
      }
    });

    return uniqueCols.map(reqCol => {
      const match = columns.find(
        c => c.name.toLowerCase() === reqCol.toLowerCase() ||
             c.id.toLowerCase() === reqCol.toLowerCase() ||
             (c.mapping && c.mapping !== 'Unmapped' && c.mapping.toLowerCase() === reqCol.toLowerCase())
      );
      return {
        name: reqCol,
        status: match ? ('Ready' as const) : ('Missing' as const),
        mappedField: match?.mapping && match.mapping !== 'Unmapped' ? match.mapping : undefined
      };
    });
  }, [selectedTagPreset, columns, standardFields]);

  // Duplicate detection & counting
  const duplicateIndices = useMemo(() => {
    const seen = new Set<string>();
    const dupSet = new Set<number>();
    createParsedRows.forEach((r, idx) => {
      const fp = columns.map(c => String(r[c.id] ?? '')).join('|');
      if (seen.has(fp)) {
        dupSet.add(idx);
      } else {
        seen.add(fp);
      }
    });
    return dupSet;
  }, [createParsedRows, columns]);

  const duplicateCount = duplicateIndices.size;

  // Step 1 completion status
  const isStep1Complete = Boolean(createFileName && createParsedRows.length > 0);

  // Step 2 completion status
  const mappedCount = useMemo(() => {
    return columns.filter(c => c.mapping && c.mapping !== 'Unmapped').length;
  }, [columns]);
  const isStep2Complete = Boolean(columns.length > 0 && mappedCount > 0);

  // Final Step completion status (Required columns)
  const readyRequiredCount = useMemo(() => {
    return requiredColumnsList.filter(rc => rc.status === 'Ready').length;
  }, [requiredColumnsList]);
  const isRequiredColumnsStepComplete = requiredColumnsList.length === 0 || readyRequiredCount === requiredColumnsList.length;

  // Recipe steps dynamic representation: Step 1 = Inspect, Step 2 = Map, Step 3+ = Custom cleaning steps, Final Step = Required columns (AT THE END)
  const allRecipeSteps = useMemo<RecipeStep[]>(() => {
    const step1: RecipeStep = {
      num: 1,
      title: 'Inspect header structure',
      desc: createFileName 
        ? `Loaded "${createFileName}" (${createParsedRows.length} rows, ${columns.length} columns)` 
        : `Awaiting spreadsheet upload (${createParsedRows.length} rows, ${columns.length} columns)`,
      type: 'INSPECT_HEADER',
      appliedAt: 'Initial load',
      details: {
        fileName: createFileName,
        rows: createParsedRows.length,
        columns: columns.map(c => ({ name: c.name, type: c.type, mapping: c.mapping }))
      }
    };

    const step2: RecipeStep = {
      num: 2,
      title: 'Map target fields',
      desc: `${mappedCount} of ${columns.length} columns aligned with Global Standard Directory`,
      type: 'MAP_FIELDS',
      appliedAt: 'Standard alignment',
      details: {
        mappedCount,
        totalColumns: columns.length,
        mappings: createFileMapping
      }
    };

    const customSteps = customRecipeSteps.map((s, idx) => ({
      ...s,
      num: 3 + idx
    }));

    // Required columns placed at the END of the stepper as requested
    const finalStepNum = 3 + customRecipeSteps.length;
    const finalStep: RecipeStep = {
      num: finalStepNum,
      title: 'Required columns',
      desc: requiredColumnsList.length > 0
        ? `${readyRequiredCount} of ${requiredColumnsList.length} mandatory columns satisfied`
        : 'No mandatory column constraints configured for this feed',
      type: 'REQUIRED_COLUMNS',
      appliedAt: 'Validation check',
      details: {
        requiredColumns: requiredColumnsList,
        readyCount: readyRequiredCount,
        total: requiredColumnsList.length
      }
    };

    return [step1, step2, ...customSteps, finalStep];
  }, [createFileName, createParsedRows.length, columns, mappedCount, createFileMapping, customRecipeSteps, requiredColumnsList, readyRequiredCount]);

  // Handle switching intake attachment
  const handleSelectAttachment = (att: any) => {
    setActiveAttachment(att);
    const fileName = att.filename || 'attached_feed.xlsx';
    setCreateFileName(fileName);

    if (att.filename) {
      const baseName = att.filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      const formattedTitle = baseName.charAt(0).toUpperCase() + baseName.slice(1);
      setCreateTitle(prev => (!prev || prev === 'New Task' || prev === 'Untitled Task' ? formattedTitle : prev));
    }

    let rows: Record<string, any>[] = [];
    let headers: string[] = [];

    if (att.parsedData?.sampleRows && att.parsedData.sampleRows.length > 0) {
      rows = att.parsedData.sampleRows;
      headers = att.parsedData.sampleHeaders || Object.keys(rows[0] || {});
    } else if (att.parsedData?.tabularRows && att.parsedData.tabularRows.length > 0) {
      rows = att.parsedData.tabularRows;
      headers = att.parsedData.tabularHeaders || Object.keys(rows[0] || {});
    } else if (att.rawBase64) {
      try {
        const binary = atob(att.rawBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const wb = XLSX.read(bytes, { type: 'array' });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        if (firstSheet) {
          const raw = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
          if (raw.length > 0) {
            headers = raw[0].map((h: any) => String(h || '').trim()).filter(Boolean);
            rows = XLSX.utils.sheet_to_json(firstSheet) as Record<string, any>[];
          }
        }
      } catch (e) {
        console.warn('Failed to parse attachment base64 in WorkspaceTaskCreator:', e);
      }
    }

    if (headers.length === 0 && att.filename) {
      const fallback = generateFallbackAttachmentDataset(att.filename);
      headers = fallback.headers;
      rows = fallback.rows;
    }

    if (headers.length > 0) {
      setCreateRawHeaders(headers);
      const activeFields = standardFields.length > 0 ? standardFields : DEFAULT_GLOBAL_STANDARD_FIELDS;
      const autoMap = globalMappingService.autoGenerateColumnMapping(headers, activeFields);
      setCreateFileMapping(autoMap);
      setCreateParsedRows(rows);

      const newCols: ColumnDef[] = headers.map(h => {
        const sampleVal = rows[0] ? rows[0][h] : undefined;
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
      setColumns(newCols);
      setVisibleColumnIds(newCols.map(c => c.id));
      setCurrentPage(1);
    }
  };

  // Hydrate from initialPreFill (e.g. from Team Mailbox or Chat)
  useEffect(() => {
    if (!initialPreFill) return;
    if (initialPreFill.title) {
      setCreateTitle(initialPreFill.title);
    } else if (initialPreFill.subject) {
      setCreateTitle(initialPreFill.subject);
    }
    if (initialPreFill.description) setCreateDesc(initialPreFill.description);

    if (initialPreFill.attachments && initialPreFill.attachments.length > 0) {
      const tabularAtt = initialPreFill.attachments.find(a => 
        a.contentType === 'spreadsheet' || 
        a.filename?.endsWith('.xlsx') || 
        a.filename?.endsWith('.xls') || 
        a.filename?.endsWith('.csv') || 
        a.filename?.endsWith('.xml') || 
        (a.parsedData && (a.parsedData.tabularRows || a.parsedData.sampleRows))
      ) || initialPreFill.attachments[0];

      if (tabularAtt) {
        handleSelectAttachment(tabularAtt);
      }
    }
  }, [initialPreFill]);

  // Record undo snapshot
  const recordSnapshot = () => {
    setHistory(prev => [
      ...prev.slice(-15),
      {
        rows: JSON.parse(JSON.stringify(createParsedRows)),
        columns: JSON.parse(JSON.stringify(columns)),
        columnMappings: { ...createFileMapping },
        customSteps: [...customRecipeSteps],
        fileName: createFileName
      }
    ]);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setCreateParsedRows(previous.rows);
    setColumns(previous.columns);
    setCreateFileMapping(previous.columnMappings);
    setCustomRecipeSteps(previous.customSteps);
    if (previous.fileName) setCreateFileName(previous.fileName);
    setFeedbackMessage('Reverted last data cleaning modification.');
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  // -------------------------------------------------------------
  // File Upload Handler (for Grid view import or replacement)
  // -------------------------------------------------------------
  const handleFileUpload = (file: File) => {
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
          const activeFields = standardFields.length > 0 ? standardFields : DEFAULT_GLOBAL_STANDARD_FIELDS;
          const autoMap = globalMappingService.autoGenerateColumnMapping(rawH, activeFields);

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

          setCreateFileName(file.name);
          const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
          const formattedTitle = baseName.charAt(0).toUpperCase() + baseName.slice(1);
          setCreateTitle(prev => (!prev || prev === 'New Task' || prev === 'Untitled Task' ? formattedTitle : prev));
          setCreateRawHeaders(rawH);
          setCreateParsedRows(parsed);
          setCreateFileMapping(autoMap);
          setColumns(newCols);
          setVisibleColumnIds(newCols.map(c => c.id));
          setCurrentPage(1);

          setCustomRecipeSteps(prev => [
            ...prev,
            {
              num: 3 + prev.length,
              title: `Loaded "${file.name}"`,
              desc: `Parsed ${parsed.length} rows and ${rawH.length} columns from sheet "${sheet}"`,
              type: 'INSPECT_HEADER',
              appliedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
  // Data Cleaning Operations
  // -------------------------------------------------------------
  const handleDeduplicate = () => {
    recordSnapshot();
    const seen = new Set<string>();
    const uniqueRows: Record<string, any>[] = [];
    let dupsCount = 0;

    createParsedRows.forEach(r => {
      const fp = columns.map(c => String(r[c.id] ?? '')).join('|');
      if (seen.has(fp)) {
        dupsCount++;
      } else {
        seen.add(fp);
      }
    });

    setCreateParsedRows(uniqueRows);
    setCustomRecipeSteps(prev => [
      ...prev,
      {
        num: 3 + prev.length,
        title: 'Deduplicate rows',
        desc: dupsCount > 0 ? `Removed ${dupsCount} duplicate records` : 'Checked for duplicates (0 found)',
        type: 'DEDUPLICATE',
        appliedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setFeedbackMessage(dupsCount > 0 ? `Deduplicated dataset: ${dupsCount} duplicate rows removed.` : 'No duplicate rows found.');
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  const handleRemoveEmptyRows = () => {
    recordSnapshot();
    let removedCount = 0;
    const nonEmpty = createParsedRows.filter(r => {
      const hasContent = columns.some(c => {
        const val = r[c.id];
        return val !== undefined && val !== null && String(val).trim() !== '';
      });
      if (!hasContent) removedCount++;
      return hasContent;
    });

    setCreateParsedRows(nonEmpty);
    setCustomRecipeSteps(prev => [
      ...prev,
      {
        num: 3 + prev.length,
        title: 'Remove empty rows',
        desc: removedCount > 0 ? `Removed ${removedCount} blank rows` : 'Verified dataset has no empty rows',
        type: 'EMPTY_ROWS',
        appliedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setFeedbackMessage(removedCount > 0 ? `Removed ${removedCount} empty rows from dataset.` : 'No empty rows found.');
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  const handleTrimWhitespace = () => {
    recordSnapshot();
    let cellsTrimmed = 0;
    const updated = createParsedRows.map(r => {
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

    setCreateParsedRows(updated);
    setCustomRecipeSteps(prev => [
      ...prev,
      {
        num: 3 + prev.length,
        title: 'Trim whitespace',
        desc: `Sanitized leading and trailing whitespace (${cellsTrimmed} cells)`,
        type: 'TRIM',
        appliedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setFeedbackMessage(`Trimmed whitespace across dataset (${cellsTrimmed} values adjusted).`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  const selectedCount = columns.filter(c => c.selected).length;

  const handleMergeSelectedColumns = () => {
    const selectedCols = columns.filter(c => c.selected);
    if (selectedCols.length < 2) return;

    recordSnapshot();
    const newColId = selectedCols.map(c => c.id).join('_');
    const newColName = selectedCols.map(c => c.name).join(' + ');

    const updatedRows = createParsedRows.map(r => {
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

    setCreateParsedRows(updatedRows);
    setColumns(prev => [...prev, newColDef]);
    setVisibleColumnIds(prev => [...prev, newColId]);
    setCreateRawHeaders(prev => [...prev, newColId]);
    setCustomRecipeSteps(prev => [
      ...prev,
      {
        num: 3 + prev.length,
        title: `Merge columns`,
        desc: `Merged ${selectedCols.map(c => c.name).join(', ')} into "${newColName}"`,
        type: 'MERGE',
        appliedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setFeedbackMessage(`Merged ${selectedCols.length} columns into new column "${newColName}".`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  const executeSplitColumn = () => {
    if (!splitTargetCol) return;
    recordSnapshot();

    const col1 = splitCol1Name.trim() || `${splitTargetCol}_part1`;
    const col2 = splitCol2Name.trim() || `${splitTargetCol}_part2`;

    const updatedRows = createParsedRows.map(r => {
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

    setCreateParsedRows(updatedRows);
    setColumns(updatedColumns);
    setVisibleColumnIds(updatedColumns.map(c => c.id));
    setCreateRawHeaders(updatedColumns.map(c => c.id));
    setCustomRecipeSteps(prev => [
      ...prev,
      {
        num: 3 + prev.length,
        title: `Split column "${splitTargetCol}"`,
        desc: `Separated by "${splitDelimiter}" into "${col1}" and "${col2}"`,
        type: 'SPLIT',
        appliedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setSplitModalOpen(false);
    setFeedbackMessage(`Split "${splitTargetCol}" into "${col1}" and "${col2}".`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  const handleExcludeColumn = (colId: string) => {
    recordSnapshot();
    const updatedCols = columns.filter(c => c.id !== colId);
    setColumns(updatedCols);
    setVisibleColumnIds(prev => prev.filter(id => id !== colId));
    setCreateRawHeaders(updatedCols.map(c => c.id));
    setCustomRecipeSteps(prev => [
      ...prev,
      {
        num: 3 + prev.length,
        title: `Exclude column "${colId}"`,
        desc: `Removed from active mapping dataset`,
        type: 'CUSTOM',
        appliedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setActiveMenuColumn(null);
    setFeedbackMessage(`Excluded column "${colId}".`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // Comprehensive Data Transformation Actions for Column Header 3-Dots Menu
  const handleTransformColumn = (
    colId: string, 
    rule: 'UPPERCASE' | 'LOWERCASE' | 'TITLECASE' | 'TRIM' | 'NUMBER_CLEAN' | 'STRIP_CURRENCY' | 'ROUND_INT' | 'DATE_ISO' | 'MASK_PAN'
  ) => {
    recordSnapshot();
    let transformed = 0;
    const updated = createParsedRows.map(r => {
      const copy = { ...r };
      const val = copy[colId];
      if (val !== undefined && val !== null) {
        let str = String(val);
        if (rule === 'UPPERCASE') {
          copy[colId] = str.toUpperCase();
        } else if (rule === 'LOWERCASE') {
          copy[colId] = str.toLowerCase();
        } else if (rule === 'TITLECASE') {
          copy[colId] = str.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
        } else if (rule === 'TRIM') {
          copy[colId] = str.trim();
        } else if (rule === 'NUMBER_CLEAN') {
          const num = parseFloat(str.replace(/[^0-9.-]/g, ''));
          copy[colId] = isNaN(num) ? '0.00' : num.toFixed(2);
        } else if (rule === 'STRIP_CURRENCY') {
          copy[colId] = str.replace(/[^0-9.,-]/g, '').trim();
        } else if (rule === 'ROUND_INT') {
          const num = parseFloat(str.replace(/[^0-9.-]/g, ''));
          copy[colId] = isNaN(num) ? '0' : Math.round(num).toString();
        } else if (rule === 'DATE_ISO') {
          const dmy = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
          if (dmy) {
            const day = dmy[1].padStart(2, '0');
            const month = dmy[2].padStart(2, '0');
            const year = dmy[3];
            copy[colId] = `${year}-${month}-${day}`;
          } else {
            const parsed = Date.parse(str);
            if (!isNaN(parsed)) {
              copy[colId] = new Date(parsed).toISOString().split('T')[0];
            }
          }
        } else if (rule === 'MASK_PAN') {
          const digits = str.replace(/\D/g, '');
          if (digits.length >= 8) {
            copy[colId] = `${digits.slice(0, 4)}••••••••${digits.slice(-4)}`;
          }
        }
        transformed++;
      }
      return copy;
    });

    const ruleTitles: Record<string, string> = {
      UPPERCASE: 'To UPPERCASE',
      LOWERCASE: 'To lowercase',
      TITLECASE: 'To Title Case',
      TRIM: 'Trim whitespace',
      NUMBER_CLEAN: 'Clean Number (2 decimals)',
      STRIP_CURRENCY: 'Strip Currency Symbols',
      ROUND_INT: 'Round to Integer',
      DATE_ISO: 'Standardize Date (YYYY-MM-DD)',
      MASK_PAN: 'Mask Account / PAN'
    };

    setCreateParsedRows(updated);
    setCustomRecipeSteps(prev => [
      ...prev,
      {
        num: 3 + prev.length,
        title: `Transform "${colId}" (${ruleTitles[rule] || rule})`,
        desc: `Applied ${ruleTitles[rule] || rule} across ${transformed} records`,
        type: 'TRANSFORM',
        appliedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setActiveMenuColumn(null);
    setFeedbackMessage(`Applied ${ruleTitles[rule] || rule} on "${colId}".`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  // Robust Auto-Map: Aligns headers against standardFields key and label with fuzzy fallback
  const handleAutoMapAll = () => {
    recordSnapshot();
    const headers = columns.map(c => c.name);
    const activeFields = standardFields.length > 0 ? standardFields : DEFAULT_GLOBAL_STANDARD_FIELDS;
    const autoMap = globalMappingService.autoGenerateColumnMapping(headers, activeFields);

    let mapped = 0;
    const updatedCols = columns.map(c => {
      let targetField = autoMap[c.name] || autoMap[c.id];

      // Robust fallback matching against activeFields keys and labels
      if (!targetField || targetField === 'Unmapped' || targetField === '') {
        const cClean = c.name.toLowerCase().replace(/[-_.\s]/g, '');
        
        const matched = activeFields.find(f => {
          const fKey = (f.key || (f as any).fieldName || '').toLowerCase().replace(/[-_.\s]/g, '');
          const fLabel = (f.label || (f as any).displayName || '').toLowerCase().replace(/[-_.\s]/g, '');
          return fKey === cClean || fLabel === cClean || (fKey && cClean.includes(fKey)) || (fLabel && cClean.includes(fLabel));
        });
        
        if (matched) {
          targetField = matched.key || (matched as any).fieldName;
        } else {
          // Domain heuristics fallback for common settlement feeds
          if (/curr|ccy/i.test(cClean)) targetField = 'currency';
          else if (/date|time|ttime/i.test(cClean)) targetField = 'tr_date';
          else if (/term|tid/i.test(cClean)) targetField = 'terminal_id';
          else if (/place|loc|merchant/i.test(cClean)) targetField = 'tran_place';
          else if (/ref|rrn/i.test(cClean)) targetField = 'refnum_f37';
          else if (/utrnno|fe_utrnno/i.test(cClean)) targetField = 'fe_utrnno';
          else if (/amt|amount|fee/i.test(cClean)) targetField = 'amount';
          else if (/status|state/i.test(cClean)) targetField = 'status';
        }
      }

      if (targetField && targetField !== 'Unmapped' && targetField !== '') {
        mapped++;
        return {
          ...c,
          mapping: targetField,
          unmapped: false
        };
      }
      return c;
    });

    setColumns(updatedCols);
    const newFileMapping: Record<string, string> = { ...createFileMapping };
    updatedCols.forEach(c => {
      if (c.mapping && c.mapping !== 'Unmapped') {
        newFileMapping[c.id] = c.mapping;
      }
    });
    setCreateFileMapping(newFileMapping);

    setCustomRecipeSteps(prev => [
      ...prev,
      {
        num: 3 + prev.length,
        title: 'Auto-map standard columns',
        desc: `Matched ${mapped} of ${columns.length} columns to Global Standard Directory`,
        type: 'MAP_FIELDS',
        appliedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setFeedbackMessage(`Auto-mapped ${mapped} of ${columns.length} columns to standard directory fields.`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  const handleSelectTemplate = (templateName: string) => {
    setSelectedTemplate(templateName);
    const tpl = templates.find(t => t.name === templateName);
    if (tpl && tpl.columnMappings) {
      recordSnapshot();
      setCreateFileMapping(prev => ({ ...prev, ...tpl.columnMappings }));
      setColumns(cols => cols.map(c => {
        const mapped = tpl.columnMappings[c.name] || tpl.columnMappings[c.id] || c.mapping;
        return {
          ...c,
          mapping: mapped || 'Unmapped',
          unmapped: !mapped || mapped === 'Unmapped'
        };
      }));
      setCustomRecipeSteps(prev => [
        ...prev,
        {
          num: 3 + prev.length,
          title: `Applied template "${templateName}"`,
          desc: `Loaded predefined column mappings`,
          type: 'MAP_FIELDS',
          appliedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setFeedbackMessage(`Applied mapping template "${templateName}".`);
      setTimeout(() => setFeedbackMessage(null), 3500);
    }
  };

  // Run Hashtag Directive: applies hashtag's own column mappings, schema, and rules to task data
  const handleRunHashtag = (tagToRun?: string) => {
    const rawTag = tagToRun || createHashtag;
    if (!rawTag || rawTag === 'Untagged' || rawTag === '#Untagged') {
      setFeedbackMessage('Please select a specific hashtag directive to run.');
      setTimeout(() => setFeedbackMessage(null), 3000);
      return;
    }

    const cleanTag = rawTag.replace(/^#/, '');
    const preset = hashtags.find(h => 
      h.tag.replace(/^#/, '').toLowerCase() === cleanTag.toLowerCase()
    );

    if (!preset) {
      setFeedbackMessage(`No configured directive preset found for #${cleanTag}`);
      setTimeout(() => setFeedbackMessage(null), 3000);
      return;
    }

    recordSnapshot();
    setCreateHashtag(cleanTag);

    let mappedCountLocal = 0;
    const newMapping: Record<string, string> = { ...createFileMapping };

    // 1. Resolve explicit template mappings if available
    let templateMappings: Record<string, string> = {};
    if (preset.mappingTemplateId) {
      const tpl = templates.find(t => t.id === preset.mappingTemplateId);
      if (tpl?.columnMappings) {
        templateMappings = tpl.columnMappings;
      }
    }
    if (Object.keys(templateMappings).length === 0) {
      const tpl = templates.find(t => t.name.toLowerCase().includes(cleanTag.toLowerCase()));
      if (tpl?.columnMappings) {
        templateMappings = tpl.columnMappings;
      }
    }

    // 2. Expected columns defined by the directive
    const expectedCols = preset.expectedFileStructure || preset.expectedHeaders || preset.minimumRequiredColumns || [];
    const activeFields = standardFields.length > 0 ? standardFields : DEFAULT_GLOBAL_STANDARD_FIELDS;

    // 3. Map each incoming column to the directive's schema
    const updatedCols = columns.map(c => {
      const rawName = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const colId = c.id.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Check template mappings
      if (templateMappings[c.name] || templateMappings[c.id]) {
        const target = templateMappings[c.name] || templateMappings[c.id];
        mappedCountLocal++;
        newMapping[c.id] = target;
        return { ...c, mapping: target, unmapped: false };
      }

      // Check against directive expected columns
      for (const exp of expectedCols) {
        const normExp = exp.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (rawName === normExp || colId === normExp || rawName.includes(normExp) || normExp.includes(rawName)) {
          const std = activeFields.find(f => {
            const fn = (f.key || (f as any).fieldName || f.label).toLowerCase().replace(/[^a-z0-9]/g, '');
            return fn === normExp || normExp.includes(fn) || fn.includes(normExp);
          });
          const mappedName = std?.key || (std as any)?.fieldName || exp;
          mappedCountLocal++;
          newMapping[c.id] = mappedName;
          return { ...c, mapping: mappedName, unmapped: false };
        }
      }

      // Check against standard directory fields
      for (const field of activeFields) {
        const fieldKey = (field.key || (field as any).fieldName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const fieldLabel = (field.label || (field as any).displayName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (rawName === fieldKey || colId === fieldKey || rawName === fieldLabel ||
            (fieldKey && rawName.includes(fieldKey)) || (fieldKey && fieldKey.includes(rawName))) {
          const val = field.key || (field as any).fieldName || field.label;
          mappedCountLocal++;
          newMapping[c.id] = val;
          return { ...c, mapping: val, unmapped: false };
        }
      }

      return c;
    });

    setColumns(updatedCols);
    setCreateFileMapping(newMapping);

    // Auto-trim string columns as part of directive execution
    setCreateParsedRows(prev => prev.map(row => {
      const cleaned: Record<string, any> = {};
      for (const [k, v] of Object.entries(row)) {
        cleaned[k] = typeof v === 'string' ? v.trim() : v;
      }
      return cleaned;
    }));

    // Add entry to Applied Recipes history
    setCustomRecipeSteps(prev => [
      ...prev,
      {
        num: 3 + prev.length,
        title: `Executed Directive #${cleanTag}`,
        desc: `Mapped ${mappedCountLocal} columns to hashtag schema and applied validation rules`,
        type: 'MAP_FIELDS',
        appliedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);

    setFeedbackMessage(`Directive #${cleanTag} applied: ${mappedCountLocal} of ${columns.length} columns aligned.`);
    setTimeout(() => setFeedbackMessage(null), 3500);
  };

  const handleSaveTemplateSubmit = async () => {
    if (!templateSaveName.trim()) return;
    try {
      const payload: any = {
        name: templateSaveName.trim(),
        description: `Custom template for ${createHashtag !== 'Untagged' ? createHashtag : 'settlement file'}`,
        columnMappings: createFileMapping,
        cleaningRecipe: allRecipeSteps
      };
      await api.createFileMappingTemplate(payload);
      setSaveTemplateModalOpen(false);
      setFeedbackMessage(`Saved template "${templateSaveName.trim()}".`);
      setTimeout(() => setFeedbackMessage(null), 3500);
      api.getFileMappingTemplates().then(res => {
        if (Array.isArray(res)) setTemplates(res);
      }).catch(console.warn);
    } catch (err) {
      console.error('Failed to save template:', err);
      alert('Failed to save template.');
    }
  };

  // -------------------------------------------------------------
  // Final Task Creation Commit (PostgreSQL First)
  // -------------------------------------------------------------
  const handleCreateTaskSubmit = async () => {
    const finalTitle = createTitle.trim() || (createFileName ? `${createFileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')} Task` : '');
    if (!finalTitle) {
      setMetadataModalOpen(true);
      alert('Please enter a task title in the Task Metadata dialog.');
      return;
    }

    const generatedTaskId = `ISS-${Math.floor(1000 + Math.random() * 9000)}`;
    const hasAttachedFile = Boolean(createFileName && createFileName.trim().length > 0 && createParsedRows.length > 0);
    const assignee = users.find(u => u.id === createAssigneeId);

    const newIssuePayload: any = {
      id: generatedTaskId,
      title: finalTitle,
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
      mappingId: selectedTemplate || 'global-standard',
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

    if (initialPreFill?.sourceMessageId) {
      api.linkMessageToIssue(initialPreFill.sourceMessageId, generatedTaskId).catch(err => {
        console.warn('Could not link message to issue:', err);
      });
    }

    if (hasAttachedFile && createParsedRows.length > 0) {
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
          mapping_id: selectedTemplate || 'global-standard',
          mapping_name: selectedTemplate || 'Global Standard Mapping',
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

    if (onTaskCreated) {
      onTaskCreated(generatedTaskId);
    } else {
      onBackToWorkspace();
    }
  };

  // Filtered and Paginated rows matching Case page layout
  const filteredRows = useMemo(() => {
    let rows = createParsedRows;
    if (filterMode === 'duplicates') {
      rows = rows.filter((_, idx) => duplicateIndices.has(idx));
    } else if (filterMode === 'unique') {
      rows = rows.filter((_, idx) => !duplicateIndices.has(idx));
    }

    if (!tableSearch.trim()) return rows;
    const q = tableSearch.toLowerCase();
    return rows.filter(r =>
      columns.some(c => String(r[c.id] ?? '').toLowerCase().includes(q))
    );
  }, [createParsedRows, columns, tableSearch, filterMode, duplicateIndices]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Active visible columns for table
  const activeTableColumns = useMemo(() => {
    if (visibleColumnIds.length === 0) return columns;
    return columns.filter(c => visibleColumnIds.includes(c.id));
  }, [columns, visibleColumnIds]);

  const toggleColumnVisibility = (colId: string) => {
    setVisibleColumnIds(prev =>
      prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId]
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-[#F8FAFC] font-sans p-4 sm:p-5 pb-4 overflow-hidden">
      {/* ========================================================= */}
      {/* 1. HEADER SECTION: Matching Case Page Layout & Typography */}
      {/* ========================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 pb-3 shrink-0">
        <div className="space-y-2">
          {/* Status Badges Row + Back Navigation + File Info */}
          <div className="flex items-center space-x-2 text-xs flex-wrap gap-y-1.5">
            {/* Back Button */}
            <button
              type="button"
              onClick={onBackToWorkspace}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-slate-200/90 rounded-lg shadow-2xs hover:bg-slate-50 transition-all cursor-pointer"
              title="Back to Intake"
            >
              <ArrowLeft size={13} className="text-slate-500" />
              <span>Back</span>
            </button>

            {/* Status Badge */}
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>DRAFT</span>
            </span>

            {/* File Info with Change File / Upload File */}
            <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 bg-white border border-slate-200 rounded-lg text-xs shadow-2xs">
              <FileSpreadsheet size={13} className={createFileName ? "text-[#F27421]" : "text-slate-400"} />
              <span className={`font-mono truncate max-w-[200px] ${createFileName ? 'font-bold text-slate-800' : 'text-slate-400 font-normal italic'}`}>
                {createFileName || 'No file attached'}
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] font-semibold text-[#F27421] hover:underline cursor-pointer ml-1"
                title={createFileName ? "Replace spreadsheet file" : "Upload spreadsheet file"}
              >
                {createFileName ? 'Change File' : 'Upload File'}
              </button>
              {createFileName && (
                <button
                  type="button"
                  onClick={() => {
                    setCreateFileName('');
                    setCreateParsedRows([]);
                    setCreateRawHeaders([]);
                    setColumns([]);
                    setVisibleColumnIds([]);
                    setActiveAttachment(null);
                  }}
                  className="p-0.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer ml-0.5"
                  title="Remove data"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>

            {/* Provenance Badge (if ingested from email / channel) */}
            {initialPreFill && (
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60 text-[11px] font-medium">
                <Mail size={11} className="text-blue-600" />
                <span>Ingested from {initialPreFill.channel ? initialPreFill.channel.toUpperCase() : 'EMAIL'}</span>
              </span>
            )}

            {/* Priority Badge */}
            <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
              createPriority === 'Critical' || createPriority === 'High'
                ? 'bg-rose-50 text-rose-700 border-rose-200/60'
                : 'bg-amber-50 text-amber-700 border-amber-200/60'
            }`}>
              <span>Priority: {createPriority}</span>
            </span>

            {/* Visibility Badge */}
            <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
              taskVisibility === 'TEAM_PUBLIC'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200/60'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${taskVisibility === 'TEAM_PUBLIC' ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
              <span>{taskVisibility === 'TEAM_PUBLIC' ? 'Team Public' : 'Private'}</span>
            </span>
          </div>

          {/* H1 Task Title (Clean, elevated, no redundant technical wrappers) */}
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight">
              {createTitle || (createFileName ? `${createFileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')}` : 'New Task')}
            </h1>
            <button
              type="button"
              onClick={() => setMetadataModalOpen(true)}
              className="p-1 text-slate-400 hover:text-[#F27421] rounded-lg transition cursor-pointer"
              title="Edit task title and metadata"
            >
              <Edit3 size={15} />
            </button>
          </div>

          {/* Subtitle */}
          <p className="text-xs text-slate-500 font-sans">
            {createFileName ? (
              <>
                <span className="font-mono text-slate-700 font-medium">{createFileName}</span> · {createParsedRows.length} {createParsedRows.length === 1 ? 'record' : 'records'} · {columns.length} columns · Ingested by @{currentUser.username || 'Operator'}
              </>
            ) : (
              <>New Ingestion Task · Upload a file to begin data cleaning and validation · @{currentUser.username || 'Operator'}</>
            )}
          </p>

          {/* Hashtags Row */}
          <div className="flex items-center space-x-2 pt-1 flex-wrap gap-y-1">
            {createHashtag && createHashtag !== 'Untagged' ? (
              <span className="px-2 py-0.5 text-[11px] font-mono text-[#F27421] bg-orange-50 border border-orange-200 rounded-md shadow-2xs font-bold">
                #{createHashtag}
              </span>
            ) : (
              <span className="px-2 py-0.5 text-[11px] font-mono text-slate-500 bg-white border border-slate-200 rounded-md shadow-2xs">
                #Untagged
              </span>
            )}

            {showAddTag ? (
              <div className="inline-flex items-center space-x-1 bg-white border border-[#F27421] rounded-md px-1.5 py-0.5">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (newTagInput.trim()) {
                        setCreateHashtag(newTagInput.trim().replace(/^#/, ''));
                        setShowAddTag(false);
                        setNewTagInput('');
                      }
                    }
                    if (e.key === 'Escape') setShowAddTag(false);
                  }}
                  placeholder="#TAG_NAME"
                  className="text-[11px] font-mono text-slate-800 outline-none w-28 uppercase"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newTagInput.trim()) {
                      setCreateHashtag(newTagInput.trim().replace(/^#/, ''));
                      setShowAddTag(false);
                      setNewTagInput('');
                    }
                  }}
                  className="text-emerald-600 hover:text-emerald-700 text-xs font-bold px-1 cursor-pointer"
                >
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddTag(false)}
                  className="text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddTag(true)}
                className="px-2 py-0.5 text-[11px] font-sans text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-dashed border-slate-300 rounded-md transition-colors cursor-pointer"
              >
                + Add tag
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons Top Right matching Case page */}
        <div className="flex items-center space-x-2 shrink-0 relative pt-1">
          {/* Level / Mode badge */}
          <button
            type="button"
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <Terminal size={13} />
            <span>Level 2 (SANDBOX)</span>
          </button>

          {/* Review Summary button */}
          <button
            type="button"
            onClick={() => setReviewModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 shadow-2xs transition-colors cursor-pointer"
            title="Open review summary before launching"
          >
            <CheckSquare size={13} className="text-slate-500" />
            <span>Review Summary</span>
          </button>

          {/* More options menu (...) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-1.5 bg-white hover:bg-slate-50 text-slate-500 rounded-lg border border-slate-200 shadow-2xs transition-colors cursor-pointer"
              title="More options"
            >
              <MoreHorizontal size={14} />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 text-xs font-sans">
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    setSaveTemplateModalOpen(true);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700 cursor-pointer"
                >
                  <Save size={13} className="text-[#F27421]" />
                  <span>Save as Template</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    setMetadataModalOpen(true);
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700 cursor-pointer"
                >
                  <FileText size={13} className="text-slate-500" />
                  <span>Edit Task Metadata</span>
                </button>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      handleUndo();
                    }}
                    className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center space-x-2 text-blue-600 cursor-pointer"
                  >
                    <Undo2 size={13} />
                    <span>Undo Last Operation</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-center space-x-2 text-slate-700 cursor-pointer"
                >
                  <Upload size={13} className="text-[#F27421]" />
                  <span>Upload New File</span>
                </button>
              </div>
            )}
          </div>

          {/* Primary Action Button (EthioPay Orange) */}
          <button
            type="button"
            onClick={handleCreateTaskSubmit}
            className="bg-[#F27421] hover:bg-[#E06310] text-white flex items-center space-x-2 px-4 py-2 text-xs font-bold rounded-lg shadow-xs cursor-pointer transition-colors"
          >
            <Plus size={14} className="stroke-[2.5]" />
            <span>Create Task &amp; Launch</span>
          </button>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv, .xlsx, .xls, .xml"
        onChange={e => {
          if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0]);
          }
        }}
        className="hidden"
      />

      {/* Undo Feedback Toast */}
      {feedbackMessage && (
        <div className="bg-blue-50 border border-blue-200 px-4 py-2 text-xs text-blue-800 font-medium flex items-center justify-between shrink-0 mb-3 rounded-xl animate-in fade-in duration-100 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-blue-600" />
            <span>{feedbackMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-blue-500 hover:text-blue-800 cursor-pointer"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. MAIN WORKSPACE: Left (Cards + Table) & Right (Cards)   */}
      {/* ========================================================= */}
      <div className={`grid grid-cols-1 ${isSidePanelCollapsed ? 'lg:grid-cols-1' : 'lg:grid-cols-4'} gap-4 flex-1 min-h-0`}>
        {/* Left 3 Columns: KPI Cards Strip + Table Workspace */}
        <div className={`${isSidePanelCollapsed ? 'col-span-1' : 'lg:col-span-3'} space-y-3 flex-1 min-h-0 flex flex-col`}>
          {/* 4 Compact KPI Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            {/* Card 1: Records */}
            <div className="px-3.5 py-2.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <span className="text-[11px] text-slate-500 font-sans font-medium block">Records</span>
              <span className="text-lg font-bold font-mono text-slate-900 mt-0.5">{createParsedRows.length}</span>
            </div>

            {/* Card 2: Mapped columns */}
            <div className="px-3.5 py-2.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <span className="text-[11px] text-slate-500 font-sans font-medium block">Mapped columns</span>
              <span className="text-lg font-bold font-mono text-slate-900 mt-0.5 truncate">
                {mappedCount} / {columns.length}
              </span>
            </div>

            {/* Card 3: Required columns */}
            <div className="px-3.5 py-2.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <span className="text-[11px] text-slate-500 font-sans font-medium block">Required columns</span>
              <span className="text-lg font-bold font-mono text-slate-900 mt-0.5 truncate">
                {readyRequiredCount} / {requiredColumnsList.length}
              </span>
            </div>

            {/* Card 4: Duplicates */}
            <div className="px-3.5 py-2.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <span className="text-[11px] text-slate-500 font-sans font-medium block">Duplicates</span>
              <span className="text-lg font-bold font-mono text-slate-900 mt-0.5">{duplicateCount}</span>
            </div>
          </div>

          {/* Table Workspace Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col h-full min-h-0">
            {/* Tabs Row */}
            <div className="border-b border-slate-200 px-5 flex items-center space-x-6 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('grid')}
                className={`py-3.5 text-xs font-semibold font-heading flex items-center space-x-2 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'grid'
                    ? 'border-[#F27421] text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Ingested Data Grid</span>
                <span className={`px-1.5 py-0.2 text-[10px] font-mono font-bold rounded-full ${
                  activeTab === 'grid' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                }`}>
                  {createParsedRows.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('schema')}
                className={`py-3.5 text-xs font-semibold font-heading flex items-center space-x-2 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'schema'
                    ? 'border-[#F27421] text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Source File &amp; Schema</span>
                <span className={`px-1.5 py-0.2 text-[10px] font-mono font-bold rounded-full ${
                  activeTab === 'schema' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                }`}>
                  {columns.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('recipes')}
                className={`py-3.5 text-xs font-semibold font-heading flex items-center space-x-2 border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'recipes'
                    ? 'border-[#F27421] text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Applied Recipes</span>
                <span className={`px-1.5 py-0.2 text-[10px] font-mono font-bold rounded-full ${
                  activeTab === 'recipes' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                }`}>
                  {customRecipeSteps.length}
                </span>
              </button>
            </div>

            {/* TAB 1: Ingested Data Grid View */}
            {activeTab === 'grid' && (
              <>
                {/* Table Toolbar */}
                <div className="p-3 sm:px-4 sm:py-2.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 shrink-0 bg-white">
                  {/* Left Controls: Search, Filter pills, Template, Quick Clean Buttons */}
                  <div className="flex items-center space-x-2 flex-wrap gap-2 flex-1">
                    {/* Search in grid */}
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={tableSearch}
                        onChange={e => {
                          setTableSearch(e.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder="Find in grid..."
                        className="pl-7 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 outline-none focus:border-[#F27421] transition-all w-32 sm:w-40"
                      />
                    </div>

                    {/* Filter Mode Pills (All, Duplicates, Unique) matching Case page */}
                    <div className="flex items-center p-0.5 bg-slate-100 rounded-lg text-xs font-medium text-slate-600">
                      <button
                        type="button"
                        onClick={() => {
                          setFilterMode('all');
                          setCurrentPage(1);
                        }}
                        className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                          filterMode === 'all' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
                        }`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFilterMode('duplicates');
                          setCurrentPage(1);
                        }}
                        className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                          filterMode === 'duplicates' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
                        }`}
                      >
                        Duplicates {duplicateCount}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFilterMode('unique');
                          setCurrentPage(1);
                        }}
                        className={`px-2 py-1 rounded-md transition-all cursor-pointer ${
                          filterMode === 'unique' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'hover:text-slate-900'
                        }`}
                      >
                        Unique {createParsedRows.length - duplicateCount}
                      </button>
                    </div>

                    {/* Template Picker */}
                    <select
                      value={selectedTemplate}
                      onChange={e => handleSelectTemplate(e.target.value)}
                      className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-medium text-slate-700 shadow-2xs focus:outline-none focus:border-[#F27421] cursor-pointer"
                      title="Select and apply mapping template"
                    >
                      <option value="Standard Settlement Template">Standard Settlement Template</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Right Controls: Columns Info, Column Filter, Vertical ... Table Actions */}
                  <div className="flex items-center space-x-2.5 text-xs text-slate-500 shrink-0">
                    <span>
                      Showing <strong className="font-mono text-slate-800">{activeTableColumns.length}</strong> of{' '}
                      <strong className="font-mono text-slate-800">{columns.length}</strong> columns
                    </span>

                    {/* Maximize Table / Side Panel Toggle Button matching Case page */}
                    <button
                      type="button"
                      onClick={() => setIsSidePanelCollapsed(prev => !prev)}
                      className={`hidden md:flex items-center space-x-1 px-2.5 py-1.5 border rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        isSidePanelCollapsed
                          ? 'border-[#F27421] bg-orange-50 text-[#F27421]'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                      title={isSidePanelCollapsed ? "Show side panel" : "Collapse side panel to expand table width"}
                    >
                      {isSidePanelCollapsed ? <PanelRightOpen size={13} className="text-[#F27421]" /> : <PanelRightClose size={13} className="text-slate-500" />}
                      <span>{isSidePanelCollapsed ? "Show details" : "Maximize table"}</span>
                    </button>

                    {/* Column Filter Popover */}
                    <div className="relative" ref={columnFilterRef}>
                      <button
                        type="button"
                        onClick={() => setShowColumnFilter(!showColumnFilter)}
                        className={`flex items-center space-x-1.5 px-2.5 py-1.5 border rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          showColumnFilter
                            ? 'border-[#F27421] bg-orange-50 text-[#F27421]'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                        title="Customize table columns"
                      >
                        <SlidersHorizontal size={12} className={showColumnFilter ? 'text-[#F27421]' : 'text-slate-500'} />
                        <span>Columns</span>
                        <span className="ml-1 px-1.5 py-0.2 text-[10px] font-mono font-bold rounded-full bg-slate-100 text-slate-600">
                          {activeTableColumns.length}
                        </span>
                      </button>

                      {showColumnFilter && (
                        <div className="absolute right-0 top-full mt-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-3 space-y-2.5 text-xs select-none animate-in fade-in zoom-in-95 duration-100">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <div>
                              <span className="font-bold text-slate-800 font-heading">Display Columns</span>
                              <span className="text-[11px] text-slate-400 block">
                                {activeTableColumns.length} of {columns.length} columns active
                              </span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <button
                                type="button"
                                onClick={() => setVisibleColumnIds(columns.map(c => c.id))}
                                className="px-2 py-0.5 text-[11px] text-[#F27421] hover:bg-orange-50 rounded font-medium transition cursor-pointer"
                              >
                                Show All
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowColumnFilter(false)}
                                className="p-1 text-slate-400 hover:text-slate-600 rounded transition cursor-pointer"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>

                          <div className="relative">
                            <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
                            <input
                              type="text"
                              value={columnSearchQuery}
                              onChange={(e) => setColumnSearchQuery(e.target.value)}
                              placeholder="Search columns..."
                              className="w-full pl-7 pr-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 outline-none focus:border-[#F27421]"
                            />
                          </div>

                          <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1 divide-y divide-slate-50">
                            {columns
                              .filter(c => c.name.toLowerCase().includes(columnSearchQuery.toLowerCase()))
                              .map(col => {
                                const isChecked = visibleColumnIds.includes(col.id);
                                return (
                                  <label
                                    key={col.id}
                                    className="flex items-center justify-between p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer transition text-xs"
                                  >
                                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleColumnVisibility(col.id)}
                                        className="rounded border-slate-300 text-[#F27421] focus:ring-[#F27421] h-3.5 w-3.5 cursor-pointer"
                                      />
                                      <span className={`block truncate ${isChecked ? 'font-medium text-slate-800' : 'text-slate-500'}`}>
                                        {col.name}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono ml-2">
                                      {col.type}
                                    </span>
                                  </label>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Vertical ... Actions Button Menu on the Top Right Corner of the Table */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowTableActionsMenu(!showTableActionsMenu)}
                        className={`p-1.5 border rounded-lg transition-colors cursor-pointer ${
                          showTableActionsMenu
                            ? 'border-[#F27421] bg-orange-50 text-[#F27421] shadow-2xs'
                            : 'border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                        title="Data actions & cleaning transforms (Auto-Map, Trim, Deduplicate, Empty rows, Merge)"
                      >
                        <MoreVertical size={14} />
                      </button>

                      {showTableActionsMenu && (
                        <>
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={() => setShowTableActionsMenu(false)} 
                          />
                          <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 text-xs font-sans animate-in fade-in zoom-in-95 duration-100">
                            <div className="px-3 py-1 font-bold text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-100 mb-1">
                              Dataset Actions &amp; Transforms
                            </div>

                            {/* Auto-Map */}
                            <button
                              type="button"
                              onClick={() => {
                                setShowTableActionsMenu(false);
                                handleAutoMapAll();
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-orange-50/70 text-slate-800 flex items-center justify-between cursor-pointer group transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <Wand2 size={13} className="text-[#F27421]" />
                                <span className="font-semibold group-hover:text-[#F27421]">Auto-Map</span>
                              </div>
                              <span className="text-[10px] bg-orange-100 text-[#F27421] px-1.5 py-0.2 rounded font-mono font-bold">1-Click</span>
                            </button>

                            {/* Trim */}
                            <button
                              type="button"
                              onClick={() => {
                                setShowTableActionsMenu(false);
                                handleTrimWhitespace();
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-slate-50 text-slate-700 flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              <Eraser size={13} className="text-slate-500" />
                              <span>Trim</span>
                            </button>

                            {/* Deduplicate */}
                            <button
                              type="button"
                              onClick={() => {
                                setShowTableActionsMenu(false);
                                handleDeduplicate();
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-slate-50 text-slate-700 flex items-center justify-between cursor-pointer transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <CheckCheck size={13} className="text-slate-500" />
                                <span>Deduplicate</span>
                              </div>
                              {duplicateCount > 0 && (
                                <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-mono font-bold">
                                  {duplicateCount} dups
                                </span>
                              )}
                            </button>

                            {/* Empty rows */}
                            <button
                              type="button"
                              onClick={() => {
                                setShowTableActionsMenu(false);
                                handleRemoveEmptyRows();
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-slate-50 text-slate-700 flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              <Trash2 size={13} className="text-slate-500" />
                              <span>Empty rows</span>
                            </button>

                            {/* Merge */}
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedCount >= 2) {
                                  setShowTableActionsMenu(false);
                                  handleMergeSelectedColumns();
                                }
                              }}
                              disabled={selectedCount < 2}
                              className={`w-full px-3 py-2 text-left flex items-center justify-between transition-colors ${
                                selectedCount >= 2
                                  ? 'hover:bg-slate-50 text-slate-800 cursor-pointer'
                                  : 'text-slate-400 opacity-60 cursor-not-allowed'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Combine size={13} className={selectedCount >= 2 ? 'text-blue-600' : 'text-slate-400'} />
                                <span>Merge Selected</span>
                              </div>
                              {selectedCount > 0 && (
                                <span className="w-4 h-4 rounded-full bg-[#F27421] text-white text-[10px] font-bold flex items-center justify-center">
                                  {selectedCount}
                                </span>
                              )}
                            </button>

                            <div className="h-px bg-slate-100 my-1" />

                            {/* Save as Template */}
                            <button
                              type="button"
                              onClick={() => {
                                setShowTableActionsMenu(false);
                                setSaveTemplateModalOpen(true);
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-slate-50 text-slate-700 flex items-center gap-2 cursor-pointer transition-colors"
                            >
                              <Save size={13} className="text-[#F27421]" />
                              <span>Save as Template</span>
                            </button>

                            {history.length > 0 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowTableActionsMenu(false);
                                    handleUndo();
                                  }}
                                  className="w-full px-3 py-2 text-left hover:bg-blue-50 text-blue-700 flex items-center gap-2 cursor-pointer transition-colors font-medium border-t border-slate-100"
                                >
                                  <Undo2 size={13} />
                                  <span>Undo Last Operation</span>
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Interactive Table with Sticky Header and Constant Height Budget */}
                {createParsedRows.length > 0 ? (
                  <div className="flex-1 overflow-auto relative min-h-0">
                    <table className="w-full text-left text-xs font-sans border-collapse">
                      <thead className="sticky top-0 z-20 bg-white text-slate-500 font-sans text-xs border-b border-slate-200/90 shadow-2xs">
                        <tr>
                          {/* Master Checkbox & Row number header */}
                          <th className="py-2.5 px-3 w-12 text-center text-slate-400 font-sans bg-white">
                            <input
                              type="checkbox"
                              checked={columns.length > 0 && columns.every(c => c.selected)}
                              onChange={e => {
                                const val = e.target.checked;
                                setColumns(prev => prev.map(c => ({ ...c, selected: val })));
                              }}
                              className="rounded border-slate-300 text-[#F27421] focus:ring-[#F27421]/20 cursor-pointer"
                              title="Select all columns"
                            />
                          </th>

                          {/* Dynamic Active Columns */}
                          {activeTableColumns.map(col => (
                            <th
                              key={col.id}
                              className={`py-2 px-3 min-w-[180px] max-w-[260px] font-sans transition-colors ${
                                col.selected ? 'bg-orange-50/40' : 'bg-white'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={col.selected}
                                    onChange={e => {
                                      const checked = e.target.checked;
                                      setColumns(prev => prev.map(c => c.id === col.id ? { ...c, selected: checked } : c));
                                    }}
                                    className="rounded border-slate-300 text-[#F27421] focus:ring-[#F27421]/20 cursor-pointer"
                                  />
                                  <span className="font-bold text-slate-800 truncate text-xs" title={col.name}>
                                    {col.name}
                                  </span>
                                </label>

                                <div className="flex items-center space-x-1">
                                  {/* Type Pill */}
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                                    col.type === 'Number' ? 'bg-blue-50 text-blue-700' :
                                    col.type === 'Date' ? 'bg-amber-50 text-amber-700' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    {col.type}
                                  </span>

                                  {/* Column Menu: 3-Dots Button with Comprehensive Data Transformation Actions */}
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={() => setActiveMenuColumn(activeMenuColumn === col.id ? null : col.id)}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                                      title="Data Transformation Actions"
                                    >
                                      <MoreHorizontal size={14} />
                                    </button>

                                    {activeMenuColumn === col.id && (
                                      <>
                                        <div 
                                          className="fixed inset-0 z-40" 
                                          onClick={() => setActiveMenuColumn(null)} 
                                        />
                                        <div className="absolute right-0 top-7 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 text-xs font-sans animate-in fade-in zoom-in-95 duration-100">
                                          <div className="px-3 py-1 font-bold text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-100 mb-1">
                                            Transform: {col.name}
                                          </div>

                                          {/* Text Category */}
                                          <div className="px-3 py-0.5 text-[9px] font-bold text-slate-400 uppercase">Text Transforms</div>
                                          <button
                                            type="button"
                                            onClick={() => handleTransformColumn(col.id, 'UPPERCASE')}
                                            className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer text-slate-700"
                                          >
                                            <Type size={12} className="text-slate-500" />
                                            <span>To UPPERCASE</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleTransformColumn(col.id, 'LOWERCASE')}
                                            className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer text-slate-700"
                                          >
                                            <Type size={12} className="text-slate-500" />
                                            <span>To lowercase</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleTransformColumn(col.id, 'TITLECASE')}
                                            className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer text-slate-700"
                                          >
                                            <Type size={12} className="text-slate-500" />
                                            <span>To Title Case</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleTransformColumn(col.id, 'TRIM')}
                                            className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer text-slate-700"
                                          >
                                            <Eraser size={12} className="text-slate-500" />
                                            <span>Trim Whitespace</span>
                                          </button>

                                          <div className="h-px bg-slate-100 my-1" />

                                          {/* Numbers & Dates Category */}
                                          <div className="px-3 py-0.5 text-[9px] font-bold text-slate-400 uppercase">Numbers &amp; Dates</div>
                                          <button
                                            type="button"
                                            onClick={() => handleTransformColumn(col.id, 'NUMBER_CLEAN')}
                                            className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer text-slate-700"
                                          >
                                            <SlidersHorizontal size={12} className="text-blue-600" />
                                            <span>Clean Number (2 Decimals)</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleTransformColumn(col.id, 'STRIP_CURRENCY')}
                                            className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer text-slate-700"
                                          >
                                            <Sliders size={12} className="text-blue-600" />
                                            <span>Strip Currency Symbols</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleTransformColumn(col.id, 'ROUND_INT')}
                                            className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer text-slate-700"
                                          >
                                            <Sliders size={12} className="text-blue-600" />
                                            <span>Round to Integer</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleTransformColumn(col.id, 'DATE_ISO')}
                                            className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer text-slate-700"
                                          >
                                            <CheckSquare size={12} className="text-amber-600" />
                                            <span>Standardize Date (ISO)</span>
                                          </button>

                                          <div className="h-px bg-slate-100 my-1" />

                                          {/* Security & Structure */}
                                          <div className="px-3 py-0.5 text-[9px] font-bold text-slate-400 uppercase">Security &amp; Structure</div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSplitTargetCol(col.id);
                                              setSplitCol1Name(`${col.id}_part1`);
                                              setSplitCol2Name(`${col.id}_part2`);
                                              setSplitModalOpen(true);
                                              setActiveMenuColumn(null);
                                            }}
                                            className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer text-slate-700"
                                          >
                                            <Split size={12} className="text-indigo-600" />
                                            <span>Split column...</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleTransformColumn(col.id, 'MASK_PAN')}
                                            className="w-full px-3 py-1.5 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer text-slate-700"
                                          >
                                            <Shield size={12} className="text-purple-600" />
                                            <span>Mask Account / PAN</span>
                                          </button>

                                          <div className="h-px bg-slate-100 my-1" />

                                          {/* Column Exclusion */}
                                          <button
                                            type="button"
                                            onClick={() => handleExcludeColumn(col.id)}
                                            className="w-full px-3 py-1.5 text-left hover:bg-rose-50 text-rose-600 flex items-center gap-2 cursor-pointer font-medium"
                                          >
                                            <Trash2 size={12} />
                                            <span>Exclude column</span>
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Standard Field Mapping Selector */}
                              <div className="relative">
                                <select
                                  value={col.mapping || 'Unmapped'}
                                  onChange={e => {
                                    const newMapping = e.target.value;
                                    recordSnapshot();
                                    setColumns(prev => prev.map(c => c.id === col.id ? {
                                      ...c,
                                      mapping: newMapping,
                                      unmapped: newMapping === 'Unmapped'
                                    } : c));
                                    setCreateFileMapping(prev => ({
                                      ...prev,
                                      [col.id]: newMapping
                                    }));
                                  }}
                                  className={`w-full py-1 px-2 text-[11px] font-mono rounded-lg border appearance-none cursor-pointer focus:outline-none transition-colors ${
                                    col.mapping && col.mapping !== 'Unmapped'
                                      ? 'bg-orange-50/40 border-orange-200 text-slate-800 font-semibold'
                                      : 'bg-slate-50 border-slate-200 text-slate-400'
                                  }`}
                                >
                                  <option value="Unmapped">-- Map standard field --</option>
                                  {standardFields.length > 0 ? (
                                    standardFields.map(f => {
                                      const val = f.key || (f as any).fieldName;
                                      const label = f.label || (f as any).displayName || val;
                                      return (
                                        <option key={val} value={val}>
                                          {label} ({f.dataType})
                                        </option>
                                      );
                                    })
                                  ) : (
                                    <>
                                      <option value="terminal_id">Terminal_ID</option>
                                      <option value="fe_utrnno">fe_utrnno</option>
                                      <option value="currency">Currency</option>
                                      <option value="tr_date">tr_date</option>
                                      <option value="amount">Amount</option>
                                      <option value="status">Status</option>
                                      <option value="refnum_f37">Refnum_f37</option>
                                      <option value="tran_place">Tran_place</option>
                                    </>
                                  )}
                                </select>
                                <ChevronDown size={11} className="absolute right-2 top-2 pointer-events-none text-slate-400" />
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {paginatedRows.length === 0 ? (
                          <tr>
                            <td colSpan={activeTableColumns.length + 1} className="py-12 text-center text-slate-400 font-sans">
                              <FileSpreadsheet size={32} className="mx-auto mb-2 text-slate-300" />
                              <p className="text-sm font-semibold text-slate-700">No records found</p>
                              <p className="text-xs text-slate-400 mt-1">
                                {tableSearch ? `No records match your search filter "${tableSearch}".` : 'No transactions present in current view.'}
                              </p>
                            </td>
                          </tr>
                        ) : (
                          <>
                            {paginatedRows.map((row, rIdx) => {
                              const displayNum = (currentPage - 1) * pageSize + rIdx + 1;
                              const isDupRow = duplicateIndices.has((currentPage - 1) * pageSize + rIdx);

                              return (
                                <tr key={rIdx} className={`hover:bg-slate-50/60 transition-colors h-11 max-h-11 border-b border-slate-100 ${
                                  isDupRow ? 'bg-amber-50/20' : ''
                                }`}>
                                  <td className="py-2.5 px-3 font-sans text-slate-400 w-12 text-center whitespace-nowrap">
                                    {displayNum}
                                  </td>
                                  {activeTableColumns.map(col => {
                                    const val = row[col.id];
                                    const isBlank = val === undefined || val === null || String(val).trim() === '';
                                    const isAmount = /amount|amt|fee|total/i.test(col.name) && !isNaN(Number(String(val).replace(/,/g, '')));
                                    const isStatus = /status|verdict/i.test(col.name);

                                    return (
                                      <td key={col.id} className="py-2.5 px-3 whitespace-nowrap truncate max-w-[220px]" title={String(val ?? '')}>
                                        {isBlank ? (
                                          <span className="text-slate-300 italic">—</span>
                                        ) : isAmount ? (
                                          <span className="font-bold font-heading text-slate-900">
                                            {Number(String(val).replace(/,/g, '')).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                            })}

                            {/* Empty filler slots to preserve constant table height budget matching Case page */}
                            {Array.from({ length: Math.max(0, pageSize - paginatedRows.length) }).map((_, padIdx) => (
                              <tr key={`empty-pad-${padIdx}`} className="h-11 max-h-11 border-b border-slate-50/80 bg-slate-50/10 select-none">
                                <td className="py-2.5 px-3 font-mono text-slate-200 text-xs w-12 text-center">-</td>
                                {activeTableColumns.map(col => (
                                  <td key={col.id} className="py-2.5 px-3 font-mono text-slate-200 text-xs whitespace-nowrap">-</td>
                                ))}
                              </tr>
                            ))}
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50/40">
                    <div 
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault();
                        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                          handleFileUpload(e.dataTransfer.files[0]);
                        }
                      }}
                      className="max-w-md w-full bg-white border-2 border-dashed border-slate-300 hover:border-[#F27421] rounded-2xl p-8 text-center transition-all shadow-sm space-y-4 cursor-pointer group"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="w-14 h-14 rounded-2xl bg-orange-50 group-hover:bg-orange-100 text-[#F27421] mx-auto flex items-center justify-center transition-colors">
                        <Upload size={28} className="stroke-[2.2] group-hover:scale-110 transition-transform" />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-900 font-heading">Upload Spreadsheet File</h3>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                          Drag and drop your Excel (.xlsx, .xls), CSV, or XML file here, or click to browse.
                        </p>
                      </div>
                      <div className="flex justify-center pt-2" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-6 py-2.5 bg-[#F27421] hover:bg-[#e06516] active:bg-[#c95712] text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center justify-center space-x-2 cursor-pointer"
                        >
                          <Upload size={14} className="stroke-[2.5]" />
                          <span>Upload File</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Table Pagination Footer matching Case page */}
                {createParsedRows.length > 0 && (
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
                )}
              </>
            )}

            {/* TAB 2: Source File & Schema View */}
            {activeTab === 'schema' && (
              <div className="p-6 space-y-4 flex-1 min-h-0 flex flex-col overflow-y-auto">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 font-heading">Source File Schema &amp; Ingestion Structure</h4>
                    <p className="text-[11px] text-slate-500">Detected column types, raw header identifiers, and target directory mappings</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Upload size={12} className="text-[#F27421]" />
                    <span>Upload Alternate Schema</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {columns.map(col => (
                    <div key={col.id} className="p-3 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-slate-900">{col.name}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          col.type === 'Number' ? 'bg-blue-50 text-blue-700' :
                          col.type === 'Date' ? 'bg-amber-50 text-amber-700' :
                          'bg-slate-200 text-slate-700'
                        }`}>
                          {col.type}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-600">
                        <span>Directory Mapping:</span>
                        <span className={`font-mono font-semibold ${
                          col.mapping && col.mapping !== 'Unmapped' ? 'text-[#F27421]' : 'text-slate-400'
                        }`}>
                          {col.mapping || 'Unmapped'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/50">
                        <span>Sample Value:</span>
                        <span className="font-mono text-slate-700 truncate max-w-[150px]">
                          {createParsedRows[0] ? String(createParsedRows[0][col.id] ?? '—') : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: Applied Recipes View */}
            {activeTab === 'recipes' && (
              <div className="p-6 space-y-4 flex-1 min-h-0 flex flex-col overflow-y-auto">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 font-heading">Applied Data Cleaning Recipe History</h4>
                    <p className="text-[11px] text-slate-500">Chronological transformations, sanitizations, and column mappings</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSaveTemplateModalOpen(true)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Save size={12} className="text-[#F27421]" />
                      <span>Save as Template</span>
                    </button>
                    {history.length > 0 && (
                      <button
                        type="button"
                        onClick={handleUndo}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Undo2 size={12} />
                        <span>Undo Last Step</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-2.5">
                  {allRecipeSteps.map((step) => {
                    const isCompleted = step.type === 'INSPECT_HEADER' ? isStep1Complete
                      : step.type === 'MAP_FIELDS' ? isStep2Complete
                      : step.type === 'REQUIRED_COLUMNS' ? isRequiredColumnsStepComplete
                      : true;

                    return (
                      <div
                        key={step.num}
                        onClick={() => setStepDetailModal(step)}
                        className="p-3.5 bg-white border border-slate-200/80 rounded-xl flex items-start justify-between shadow-2xs hover:border-orange-200 hover:bg-orange-50/20 transition-all cursor-pointer group"
                      >
                        <div className="flex items-start space-x-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0 mt-0.5 transition-colors ${
                            isCompleted ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
                          }`}>
                            {isCompleted ? <Check size={12} strokeWidth={3} /> : step.num}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 group-hover:text-[#F27421] transition-colors">{step.title}</span>
                              <Eye size={11} className="text-slate-400 group-hover:text-[#F27421]" />
                            </div>
                            <span className="text-[11px] text-slate-500 block mt-0.5">{step.desc}</span>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-4">
                          {step.appliedAt || 'Applied'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* Right 1 Column: Cards (Workflow, Details, Template & Launch)*/}
        {/* ========================================================= */}
        {!isSidePanelCollapsed && (
          <div className="space-y-4 flex-1 min-h-0 flex flex-col overflow-y-auto">
            {/* Card 1: Hashtag Directive & Mapping Execution */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs space-y-3.5 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Hash size={14} className="text-[#F27421]" />
                  <h3 className="text-xs font-bold font-heading text-slate-900">Hashtag Directive</h3>
                </div>
                <span className="px-2 py-0.5 bg-orange-50 text-[#F27421] border border-orange-200 rounded-full text-[10px] font-mono font-bold truncate max-w-[150px]">
                  #{createHashtag !== 'Untagged' ? createHashtag : 'Untagged'}
                </span>
              </div>

              {/* Hashtag Selector Dropdown */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Select Directive
                </label>
                <div className="relative">
                  <select
                    value={createHashtag.startsWith('#') ? createHashtag : `#${createHashtag}`}
                    onChange={e => {
                      const cleanTag = e.target.value.replace(/^#/, '');
                      setCreateHashtag(cleanTag);
                    }}
                    className="w-full py-1.5 pl-2.5 pr-7 bg-slate-50 border border-slate-200 hover:border-orange-200 rounded-lg text-xs font-mono font-semibold text-slate-800 appearance-none cursor-pointer focus:outline-none focus:border-[#F27421]"
                  >
                    <option value="#Untagged"># Untagged (Select Directive)</option>
                    {hashtags.map(h => (
                      <option key={h.tag} value={h.tag}>
                        {h.tag} — {h.description.slice(0, 36)}...
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-2.5 pointer-events-none text-slate-400" />
                </div>
              </div>

              {/* Directive Details */}
              <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/60 space-y-2 text-xs">
                {selectedTagPreset ? (
                  <>
                    <p className="text-[11px] text-slate-600 line-clamp-2" title={selectedTagPreset.description}>
                      {selectedTagPreset.description}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1.5 border-t border-slate-200/50">
                      <span>Pipeline: <strong className="text-slate-800">{linkedWorkflow?.name || selectedTagPreset.workflowName || 'Validation DAG'}</strong></span>
                      <span className="font-mono text-emerald-700 font-bold">{readyRequiredCount}/{requiredColumnsList.length} Ready</span>
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">
                    Choose an operational directive to auto-apply schemas, mandatory columns, and validation.
                  </p>
                )}
              </div>

              {/* Run Hashtag Action Button */}
              <button
                type="button"
                onClick={() => handleRunHashtag()}
                className="w-full flex items-center justify-center space-x-2 py-2.5 bg-[#F27421] hover:bg-[#e06516] active:bg-[#c95712] text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer group"
                title="Execute hashtag directive and apply its own column mappings directly to the task data"
              >
                <Play size={13} className="fill-white group-hover:scale-110 transition-transform" />
                <span>Run Hashtag</span>
              </button>
            </div>

            {/* Card 2: Details (matches Case page Details card) */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold font-heading text-slate-900">Details</h3>
                <button
                  type="button"
                  onClick={() => setMetadataModalOpen(true)}
                  className="text-[11px] font-semibold text-[#F27421] hover:underline cursor-pointer"
                >
                  Edit
                </button>
              </div>
              
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-normal">Priority</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize border ${
                    createPriority === 'Critical' || createPriority === 'High'
                      ? 'bg-rose-50 text-rose-700 border-rose-200/60'
                      : 'bg-amber-50 text-amber-700 border-amber-200/60'
                  }`}>
                    {createPriority}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-normal">Assignee</span>
                  <span className="text-slate-700 font-medium">
                    @{users.find(u => u.id === createAssigneeId)?.username || currentUser.username}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-normal">Reporter</span>
                  <span className="text-slate-700 font-medium">
                    @{currentUser.username || 'Operator'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-normal">SLA target</span>
                  <span className="text-emerald-700 font-medium">24h · On track</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-normal">Visibility</span>
                  <span className="text-slate-700 font-medium">
                    {taskVisibility === 'TEAM_PUBLIC' ? 'Team Public' : 'Private'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-normal">Directive</span>
                  <span className="font-mono text-[#F27421] font-bold">
                    #{createHashtag}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-normal">Batch</span>
                  <span className={`font-mono truncate max-w-[130px] ${createFileName ? 'text-slate-700' : 'text-slate-400 italic'}`} title={createFileName || 'No file attached'}>
                    {createFileName || 'No file attached'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 3: Save Configuration as Template */}
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-600 font-sans">
                Save as template
              </span>
              <button
                type="button"
                onClick={() => setSaveTemplateModalOpen(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-medium text-slate-700 transition-colors cursor-pointer shadow-2xs"
              >
                <Save size={12} className="text-[#F27421]" />
                <span>Save</span>
              </button>
            </div>

            {/* Card 4: Primary Action Button */}
            <button
              type="button"
              onClick={handleCreateTaskSubmit}
              className="w-full py-2.5 bg-[#F27421] hover:bg-[#e06516] active:bg-[#c95712] text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-md shrink-0"
            >
              <Plus size={15} />
              <span>Create Task &amp; Launch</span>
            </button>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 3. POP-UP MODAL: TASK METADATA                            */}
      {/* ========================================================= */}
      {metadataModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-100">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-orange-100 text-[#F27421] flex items-center justify-center">
                  <FileText size={15} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-heading">Task Metadata &amp; Directives</h3>
                  <p className="text-[11px] text-slate-500">Configure task details, directive hashtag, and operational routing</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMetadataModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Task Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createTitle}
                  onChange={e => setCreateTitle(e.target.value)}
                  placeholder="e.g. Daily Settlement Clearing Batch"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F27421]/20 focus:border-[#F27421] focus:bg-white font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Category / Directive Hashtag (#)
                </label>
                <select
                  value={createHashtag}
                  onChange={e => setCreateHashtag(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F27421]/20 focus:border-[#F27421] focus:bg-white cursor-pointer font-medium"
                >
                  <option value="Untagged">🏷️ Untagged</option>
                  {hashtags.map(h => (
                    <option key={h.tag} value={h.tag}>{h.tag} - {h.description}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">Priority</label>
                  <select
                    value={createPriority}
                    onChange={e => setCreatePriority(e.target.value as IssuePriority)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 focus:outline-none focus:border-[#F27421] cursor-pointer font-medium"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">Assign To</label>
                  <select
                    value={createAssigneeId}
                    onChange={e => setCreateAssigneeId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs text-slate-800 focus:outline-none focus:border-[#F27421] cursor-pointer font-medium"
                  >
                    <option value={currentUser.id}>Assign to Myself (@{currentUser.username})</option>
                    {users.filter(u => u.id !== currentUser.id && u.isApproved).map(u => (
                      <option key={u.id} value={u.id}>@{u.username}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">Visibility</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setTaskVisibility('TEAM_PUBLIC')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center space-x-1.5 ${
                      taskVisibility === 'TEAM_PUBLIC'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Users size={12} className={taskVisibility === 'TEAM_PUBLIC' ? 'text-[#F27421]' : 'text-slate-500'} />
                    <span>Team Public</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskVisibility('PERSONAL_PRIVATE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center space-x-1.5 ${
                      taskVisibility === 'PERSONAL_PRIVATE'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Lock size={12} className={taskVisibility === 'PERSONAL_PRIVATE' ? 'text-indigo-600' : 'text-slate-500'} />
                    <span>Personal Private</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Notes / Operational Instructions
                </label>
                <textarea
                  rows={3}
                  value={createDesc}
                  onChange={e => setCreateDesc(e.target.value)}
                  placeholder="Describe reconciliation goals, counterparty context, or instructions..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F27421] font-medium"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMetadataModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => setMetadataModalOpen(false)}
                className="px-5 py-2 bg-[#F27421] hover:bg-[#e06516] text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
              >
                Save Metadata
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. POP-UP MODAL: STEP DETAILS                             */}
      {/* ========================================================= */}
      {stepDetailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-100">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <span className="w-6 h-6 rounded-full bg-[#0F142A] text-white flex items-center justify-center text-xs font-bold font-mono">
                  {stepDetailModal.num}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-heading">{stepDetailModal.title}</h3>
                  <p className="text-[11px] text-slate-500">{stepDetailModal.desc}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStepDetailModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs max-h-72 overflow-y-auto pr-1">
              {stepDetailModal.type === 'INSPECT_HEADER' && (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">File Name:</span>
                      <strong className="text-slate-800 font-mono">{createFileName || 'No file attached'}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Rows:</span>
                      <strong className="text-slate-800">{createParsedRows.length} rows</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Columns Detected:</span>
                      <strong className="text-slate-800">{columns.length} columns</strong>
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                      Detected Columns
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {columns.map(c => (
                        <span key={c.id} className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-mono text-[11px]">
                          {c.name} <span className="text-slate-400 text-[9px]">({c.type})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {stepDetailModal.type === 'MAP_FIELDS' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Aligned with Global Standard Directory</span>
                    <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      {mappedCount} / {columns.length} Mapped
                    </span>
                  </div>

                  <div className="space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                    {columns.map(c => (
                      <div key={c.id} className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-white border border-slate-100">
                        <span className="font-mono text-slate-800">{c.name}</span>
                        <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold ${
                          c.mapping && c.mapping !== 'Unmapped'
                            ? 'bg-orange-50 text-[#F27421] border border-orange-200'
                            : 'bg-slate-100 text-slate-400'
                        }`}>
                          → {c.mapping || 'Unmapped'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stepDetailModal.type === 'REQUIRED_COLUMNS' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">
                      {requiredColumnsList.length > 0
                        ? `Mandatory columns required for #${createHashtag}:`
                        : 'No mandatory columns enforced for this feed'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      isRequiredColumnsStepComplete
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {readyRequiredCount} / {requiredColumnsList.length} Ready
                    </span>
                  </div>

                  {requiredColumnsList.length > 0 ? (
                    <div className="space-y-2">
                      {requiredColumnsList.map(rc => (
                        <div key={rc.name} className="flex items-center justify-between p-2.5 rounded-xl border bg-white border-slate-200 text-xs">
                          <div className="space-y-0.5">
                            <span className="font-mono font-bold text-slate-800">{rc.name}</span>
                            {rc.mappedField && (
                              <span className="block text-[10px] text-slate-500 font-mono">Satisfied by: {rc.mappedField}</span>
                            )}
                          </div>
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
                  ) : (
                    <div className="p-3 bg-slate-50 rounded-xl text-center text-slate-500 text-xs">
                      All columns from this file are accepted. No mandatory schema constraints found for category "{createHashtag}".
                    </div>
                  )}
                </div>
              )}

              {stepDetailModal.type !== 'INSPECT_HEADER' && stepDetailModal.type !== 'MAP_FIELDS' && stepDetailModal.type !== 'REQUIRED_COLUMNS' && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="text-slate-700 font-medium">{stepDetailModal.desc}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Operation: {stepDetailModal.type || 'DATA_CLEANING'}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStepDetailModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. POP-UP MODAL: ALL-IN-ONE REVIEW SUMMARY                */}
      {/* ========================================================= */}
      {reviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-100">
          <div className="bg-white border border-slate-200/90 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-orange-100 text-[#F27421] flex items-center justify-center">
                  <CheckSquare size={17} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-heading">Task Review &amp; Launch</h3>
                  <p className="text-xs text-slate-500">Verify required columns, task metadata, and applied recipe</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Required Columns
                  </span>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    isRequiredColumnsStepComplete ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {readyRequiredCount} / {requiredColumnsList.length} Ready
                  </span>
                </div>
                {requiredColumnsList.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {requiredColumnsList.map(rc => (
                      <div key={rc.name} className="flex items-center justify-between p-2 rounded-xl border bg-white border-slate-200 text-xs font-mono">
                        <span className="font-semibold text-slate-800 truncate" title={rc.name}>{rc.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          rc.status === 'Ready' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {rc.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No mandatory column requirements configured for this task.</p>
                )}
              </div>

              <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Task Metadata</span>
                  <button
                    type="button"
                    onClick={() => {
                      setReviewModalOpen(false);
                      setMetadataModalOpen(true);
                    }}
                    className="text-[#F27421] text-[11px] font-bold cursor-pointer hover:underline"
                  >
                    Edit
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Title</span>
                    <strong className="text-slate-900">{createTitle || '(Untitled Task)'}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Category</span>
                    <span className="font-mono font-bold text-[#F27421]">#{createHashtag}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Priority &amp; Assignee</span>
                    <span className="text-slate-800 font-medium">
                      {createPriority} · @{users.find(u => u.id === createAssigneeId)?.username || currentUser.username}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Visibility</span>
                    <span className="text-slate-800 font-medium">
                      {taskVisibility === 'TEAM_PUBLIC' ? 'Team Public' : 'Private'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Applied Recipe ({allRecipeSteps.length} steps)</span>
                  <span className="font-mono font-bold text-[#F27421] text-[11px]">{selectedTemplate}</span>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {allRecipeSteps.map(step => (
                    <div key={step.num} className="flex items-center space-x-2 p-1.5 rounded-lg bg-white border border-slate-100">
                      <span className="w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center text-[9px] font-mono font-bold shrink-0">
                        {step.num}
                      </span>
                      <span className="font-semibold text-slate-800 truncate">{step.title}</span>
                      <span className="text-slate-400 text-[10px] truncate ml-auto">{step.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setReviewModalOpen(false);
                  handleCreateTaskSubmit();
                }}
                className="px-6 py-2.5 bg-[#F27421] hover:bg-[#e06516] active:bg-[#c95712] text-white text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-2 cursor-pointer"
              >
                <Plus size={16} />
                <span>Create Task &amp; Launch Workspace</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Column Modal */}
      {splitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-100">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
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
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeSplitColumn}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-2xs cursor-pointer"
              >
                Split Column
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Template Modal */}
      {saveTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-100">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Save size={16} className="text-[#F27421]" />
                <span>Save Mapping Template</span>
              </h3>
              <button
                type="button"
                onClick={() => setSaveTemplateModalOpen(false)}
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium"
                  placeholder="e.g. Settlement Batch Template 2026"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Saves current column mappings and {allRecipeSteps.length} recipe steps to PostgreSQL for reuse on future ingestion feeds.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSaveTemplateModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTemplateSubmit}
                className="px-4 py-2 bg-[#F27421] hover:bg-[#e06516] text-white text-xs font-bold rounded-xl shadow-2xs cursor-pointer"
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

export default WorkspaceTaskCreator;
