/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { 
  User, 
  DatabaseConnection, 
  EnvironmentSystem, 
  GlobalTransactionSchemaField, 
  DbTableMappingConfig, 
  GlobalMappingConfig,
  Team,
  ValueTranslationDictionary,
  DEFAULT_VALUE_TRANSLATION_DICTIONARIES
} from '../../types';
import { globalMappingService, DEFAULT_GLOBAL_STANDARD_FIELDS } from '../../services/globalMappingService';
import { api } from '../../api/client';
import AdminDbConnections from '../admin/AdminDbConnections';

const FtpFileStagingSettings = lazy(() => import('./FtpFileStagingSettings'));
import { 
  Sliders, Database, BookOpen, Settings, Plus, Edit3, Trash2, 
  Check, Save, RefreshCw, ArrowRight, ShieldCheck, AlertCircle, 
  Search, Filter, Layers, Server, Table, CheckSquare, 
  Download, Upload, Play, ArrowRightLeft, Code2, Info, 
  CheckCircle2, Loader2, HardDrive, Key, Wifi, Sparkles, X, ChevronRight,
  FileSpreadsheet, Wand2, Split, MoreHorizontal, Scissors, Combine, PlusCircle
} from 'lucide-react';
import { applyDataTransformationRule } from '../common/StandardFileIngestionWorkspace';
import { showSystemAlert } from '../common/MessageModal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Overlay';
import { ConfirmDialog } from '../common/Feedback';

export { DEFAULT_VALUE_TRANSLATION_DICTIONARIES };

export interface SystemTransformationRule {
  id: string;
  name: string;
  description: string;
  category: 'Splitting' | 'Merging' | 'Sanitization' | 'Date' | 'Masking' | 'Lookup' | 'Regex';
  type: 'SPLIT' | 'MERGE' | 'CASE' | 'TRIM' | 'DATE_FORMAT' | 'STRIP_CURRENCY' | 'MASK' | 'PHONE_ET' | 'VALUE_REPLACE' | 'REGEX_EXTRACT';
  delimiter?: string;
  separator?: string;
  pattern?: string;
  replacement?: string;
  targetFormat?: string;
  isSystem?: boolean;
}

const DEFAULT_TRANSFORMATION_RULES: SystemTransformationRule[] = [
  {
    id: 'rule-phone-et',
    name: 'Ethiopian Mobile Phone Normalizer',
    description: 'Normalizes Ethiopian local numbers (09..., 07..., 251...) to standard +251XXXXXXXXX format.',
    category: 'Sanitization',
    type: 'PHONE_ET',
    isSystem: true
  },
  {
    id: 'rule-name-split',
    name: 'Full Name to First & Last Splitter',
    description: 'Splits compound full name by whitespace into distinct first and last name columns.',
    category: 'Splitting',
    type: 'SPLIT',
    delimiter: ' ',
    isSystem: true
  },
  {
    id: 'rule-branch-account-merge',
    name: 'Branch Code & Account Number Merger',
    description: 'Concatenates branch prefix and bank account number with hyphen separator.',
    category: 'Merging',
    type: 'MERGE',
    separator: '-',
    isSystem: true
  },
  {
    id: 'rule-card-pan-mask',
    name: '16-Digit Card PAN Masker',
    description: 'Preserves first 4 BIN digits and last 4 card digits, masking the middle 8 digits with asterisks.',
    category: 'Masking',
    type: 'MASK',
    isSystem: true
  },
  {
    id: 'rule-iso-date-normalize',
    name: 'ISO Date Normalizer (YYYY-MM-DD)',
    description: 'Converts legacy DD/MM/YYYY and MM/DD/YYYY dates to standard ISO-8601 YYYY-MM-DD format.',
    category: 'Date',
    type: 'DATE_FORMAT',
    isSystem: true
  },
  {
    id: 'rule-iso-decline-uppercase',
    name: 'ISO Decline Code Uppercase Standardizer',
    description: 'Standardizes network decline reasons and response codes to uppercase canonical format.',
    category: 'Sanitization',
    type: 'CASE',
    isSystem: true
  },
  {
    id: 'rule-currency-cleaner',
    name: 'Currency Symbol & Comma Stripper',
    description: 'Removes $, ETB, EUR symbols, commas, and whitespace, yielding a clean decimal number.',
    category: 'Sanitization',
    type: 'STRIP_CURRENCY',
    isSystem: true
  },
  {
    id: 'rule-trim-whitespace',
    name: 'Whitespace Cleaner & Compactor',
    description: 'Trims leading/trailing whitespace and compresses consecutive internal spaces.',
    category: 'Sanitization',
    type: 'TRIM',
    isSystem: true
  }
];

interface SystemSettingsProps {
  currentUser: User;
  teams?: Team[];
  databases?: DatabaseConnection[];
  systems?: EnvironmentSystem[];
  onAddDatabase: (newDb: Omit<DatabaseConnection, 'id'>) => void;
  onToggleDbStatus: (dbId: string) => void;
  onDeleteDb: (dbId: string) => void;
  onUpdateDb?: (dbId: string, updates: Partial<DatabaseConnection>) => void;
  onNavigateToWorkspace?: () => void;
  initialTab?: 'dictionary' | 'connections' | 'environment' | 'staging' | 'transformations';
}

export default function SystemSettings({
  currentUser,
  teams = [],
  databases = [],
  systems = [],
  onAddDatabase,
  onToggleDbStatus,
  onDeleteDb,
  onUpdateDb,
  onNavigateToWorkspace,
  initialTab = 'dictionary'
}: SystemSettingsProps) {
  // 1. Strict Administrator Authorization Check
  const isAdmin = 
    currentUser?.role === 'admin' || 
    (currentUser?.role as any) === 'system_admin' || 
    currentUser?.username?.toLowerCase() === 'admin' || 
    (currentUser?.role as string)?.toLowerCase() === 'administrator';

  // 2. Active Tab State
  const [activeTab, setActiveTab] = useState<'dictionary' | 'connections' | 'environment' | 'staging' | 'transformations'>(initialTab);
  const [selectedFtpDbId, setSelectedFtpDbId] = useState<string | undefined>(undefined);

  // 2.1 Transformation Dictionary State
  const [transformRules, setTransformRules] = useState<SystemTransformationRule[]>(() => {
    try {
      const stored = localStorage.getItem('system_transformation_rules');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_TRANSFORMATION_RULES;
  });
  const [transformSearch, setTransformSearch] = useState('');
  const [transformCategory, setTransformCategory] = useState('ALL');
  const [testInputString, setTestInputString] = useState('0911234567');
  const [testSelectedRuleId, setTestSelectedRuleId] = useState('rule-phone-et');
  const [testOutputResult, setTestOutputResult] = useState('+251911234567');

  // Add/Edit Rule Modal State
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [ruleDesc, setRuleDesc] = useState('');
  const [ruleCat, setRuleCat] = useState<'Splitting' | 'Merging' | 'Sanitization' | 'Date' | 'Masking' | 'Lookup' | 'Regex'>('Sanitization');
  const [ruleType, setRuleType] = useState<any>('CASE');
  const [ruleDelim, setRuleDelim] = useState('');
  const [ruleSep, setRuleSep] = useState('');
  const [rulePattern, setRulePattern] = useState('');
  const [ruleReplacement, setRuleReplacement] = useState('');

  const persistRules = async (newRules: SystemTransformationRule[], savedRule?: SystemTransformationRule, deletedRuleId?: string) => {
    setTransformRules(newRules);
    try {
      localStorage.setItem('system_transformation_rules', JSON.stringify(newRules));
      if (savedRule) {
        await api.saveSystemTransformationRule(savedRule);
      } else if (deletedRuleId) {
        await api.deleteSystemTransformationRule(deletedRuleId);
      }
    } catch (err) {
      console.warn('[SystemSettings] Failed to sync transformation rule with PostgreSQL:', err);
    }
  };

  const runSandboxTest = (inputVal?: string, targetRuleId?: string) => {
    const val = inputVal !== undefined ? inputVal : testInputString;
    const rule = transformRules.find(r => r.id === (targetRuleId || testSelectedRuleId));
    if (!rule) {
      setTestOutputResult(val);
      return;
    }
    const evaluated = applyDataTransformationRule(
      val,
      rule.type === 'CASE' ? 'UPPERCASE' : rule.type === 'DATE_FORMAT' ? 'DATE_ISO' : rule.type,
      rule.pattern || rule.delimiter,
      rule.replacement || rule.separator
    );
    setTestOutputResult(String(evaluated));
  };

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // 3. Global Mapping Dictionary State
  const [fields, setFields] = useState<GlobalTransactionSchemaField[]>(() => {
    return globalMappingService.getStandardFields();
  });
  const [dictSearch, setDictSearch] = useState('');
  const [dictCategory, setDictCategory] = useState('ALL');
  const [dictLoading, setDictLoading] = useState(false);
  const [dictSuccessMsg, setDictSuccessMsg] = useState<string | null>(null);
  const [confirmDeleteSelectedOpen, setConfirmDeleteSelectedOpen] = useState(false);

  // Field Add/Edit Modal State
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [isEditingField, setIsEditingField] = useState(false);
  const [originalKey, setOriginalKey] = useState('');
  const [fieldKey, setFieldKey] = useState('');
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldDataType, setFieldDataType] = useState<'string' | 'number' | 'date' | 'boolean'>('string');
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldCategory, setFieldCategory] = useState('General');
  const [fieldDesc, setFieldDesc] = useState('');
  const [fieldExample, setFieldExample] = useState('');
  const [fieldNotes, setFieldNotes] = useState('');
  const [fieldModalError, setFieldModalError] = useState<string | null>(null);

  // Delete Field Confirm Modal
  const [fieldToDelete, setFieldToDelete] = useState<GlobalTransactionSchemaField | null>(null);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>([]);

  // Database-Driven Discovery & Import States
  const [discoveringFromDb, setDiscoveringFromDb] = useState(false);
  const [showImportTableModal, setShowImportTableModal] = useState(false);
  const [importTableDbId, setImportTableDbId] = useState<string>(() => databases[0]?.id || '');
  const [importTableName, setImportTableName] = useState<string>('');
  const [importingTableLoading, setImportingTableLoading] = useState(false);
  const [importTableError, setImportTableError] = useState<string | null>(null);

  // JSON Import/Export Modal
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonMode, setJsonMode] = useState<'export' | 'import'>('export');
  const [jsonContent, setJsonContent] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [togglingRequiredKey, setTogglingRequiredKey] = useState<string | null>(null);
  const [autoClassifying, setAutoClassifying] = useState(false);
  const [importingJson, setImportingJson] = useState(false);

  // 4. Table Mapping State (Per-DB Configuration & Interactive Data Grid)
  const [selectedDbId, setSelectedDbId] = useState<string>(() => databases[0]?.id || '');
  const [selectedTableName, setSelectedTableName] = useState<string>('');
  const [envSearch, setEnvSearch] = useState('');
  const [introspectedColumns, setIntrospectedColumns] = useState<{ name: string; type: string; nullable: boolean; isPrimary?: boolean }[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnsError, setColumnsError] = useState<string | null>(null);
  
  // Live Database Table Sample Rows
  const [dbSampleRows, setDbSampleRows] = useState<Record<string, any>[]>([]);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [openColMenu, setOpenColMenu] = useState<string | null>(null);

  // Table Mapping state for the currently chosen DB & Table
  const [tableColumnMappings, setTableColumnMappings] = useState<Record<string, string>>({});
  const [tableColumnNotes, setTableColumnNotes] = useState<Record<string, string>>({});
  const [mappingSaveSuccess, setMappingSaveSuccess] = useState<string | null>(null);
  const [useCustomInput, setUseCustomInput] = useState<Record<string, boolean>>({});

  // Add Table Mapping Modal
  const [showAddTableModal, setShowAddTableModal] = useState(false);
  const [newTableName, setNewTableName] = useState('');

  // Column Splitting Modal State
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitCol, setSplitCol] = useState('');
  const [splitDelimType, setSplitDelimType] = useState('SPACE');
  const [splitCustomDelim, setSplitCustomDelim] = useState('');
  const [splitPart1Name, setSplitPart1Name] = useState('');
  const [splitPart2Name, setSplitPart2Name] = useState('');
  const [splitKeepOriginal, setSplitKeepOriginal] = useState(true);

  // Column Merging Modal State
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeCol1, setMergeCol1] = useState('');
  const [mergeCol2, setMergeCol2] = useState('');
  const [mergeSepType, setMergeSepType] = useState('SPACE');
  const [mergeCustomSep, setMergeCustomSep] = useState('');
  const [mergeTargetName, setMergeTargetName] = useState('');
  const [mergeKeepSource, setMergeKeepSource] = useState(true);

  // Table Column Selection State for Merge Columns
  const [selectedTableCols, setSelectedTableCols] = useState<string[]>([]);

  // Add Column to Global Field Modal State
  const [showAddToGlobalModal, setShowAddToGlobalModal] = useState(false);
  const [selectedColForGlobal, setSelectedColForGlobal] = useState<{ name: string; type: string; nullable: boolean } | null>(null);
  const [newGlobalKey, setNewGlobalKey] = useState('');
  const [newGlobalLabel, setNewGlobalLabel] = useState('');
  const [newGlobalDataType, setNewGlobalDataType] = useState<'string' | 'number' | 'boolean' | 'date' | 'json'>('string');
  const [newGlobalDesc, setNewGlobalDesc] = useState('');
  const [newGlobalCategory, setNewGlobalCategory] = useState('General');
  const [newGlobalRequired, setNewGlobalRequired] = useState(false);
  const [addToGlobalError, setAddToGlobalError] = useState<string | null>(null);

  // Link Value Translation Dictionary Modal State
  const [showLinkDictModal, setShowLinkDictModal] = useState(false);
  const [linkDictCol, setLinkDictCol] = useState('');
  const [selectedDictId, setSelectedDictId] = useState('');

  // Value Translation Dictionaries (PostgreSQL Persisted - Domain 7 / Governance Rule 23)
const [valueDicts, setValueDicts] = useState<ValueTranslationDictionary[]>(DEFAULT_VALUE_TRANSLATION_DICTIONARIES);

const persistValueDicts = (dicts: ValueTranslationDictionary[]) => {
    setValueDicts(dicts);
  };

  // Transformation Tab Sub-view
  const [transformSubTab, setTransformSubTab] = useState<'rules' | 'value_dicts'>('rules');

  // Value Translation Dict Edit/Create Modal
  const [showValueDictModal, setShowValueDictModal] = useState(false);
  const [editingDictId, setEditingDictId] = useState<string | null>(null);
  const [dictModalName, setDictModalName] = useState('');
  const [dictModalDesc, setDictModalDesc] = useState('');
  const [dictModalCat, setDictModalCat] = useState<'BANK_CODES' | 'CHANNEL_CODES' | 'STATUS_CODES' | 'CURRENCIES' | 'CUSTOM'>('BANK_CODES');
  const [dictModalPairs, setDictModalPairs] = useState<{ sourceValue: string; targetValue: string; notes?: string }[]>([]);
  const [newPairSource, setNewPairSource] = useState('');
  const [newPairTarget, setNewPairTarget] = useState('');
  const [newPairNotes, setNewPairNotes] = useState('');

  // Value Translation Sandbox Test State
  const [testValueInput, setTestValueInput] = useState('Commercial Bank of Ethiopia');
  const [testValueDictId, setTestValueDictId] = useState('dict-bank-codes');

  // 5. Initial Load from Backend & Service Sync
  useEffect(() => {
    let isMounted = true;
    setDictLoading(true);

    api.getGlobalStandardDirectory()
      .then(res => {
        if (!isMounted) return;
        if (Array.isArray(res)) {
          setFields(res);
        }
      })
      .catch(err => {
        console.warn('[SystemSettings] Direct directory fetch failed:', err);
      })
      .finally(() => {
        if (isMounted) setDictLoading(false);
      });

    // Hydrate Value Translation Dictionaries authoritatively from PostgreSQL
    api.getValueTranslationDictionaries()
      .then(res => {
        if (!isMounted) return;
        if (Array.isArray(res) && res.length > 0) {
          setValueDicts(res);
        }
      })
      .catch(err => {
        console.warn('[SystemSettings] PostgreSQL value translation dictionaries hydration failed:', err);
      });

    // Hydrate System Transformation Rules authoritatively from PostgreSQL (Rule 23)
    api.getSystemTransformationRules()
      .then(res => {
        if (!isMounted) return;
        if (Array.isArray(res) && res.length > 0) {
          setTransformRules(res);
          try {
            localStorage.setItem('system_transformation_rules', JSON.stringify(res));
          } catch {}
        }
      })
      .catch(err => {
        console.warn('[SystemSettings] PostgreSQL transformation rules hydration failed:', err);
      });

    return () => { isMounted = false; };
  }, [currentUser]);

  // Keep selectedDbId valid
  useEffect(() => {
    if (databases.length > 0) {
      const exists = databases.some(d => d.id === selectedDbId);
      if (!exists) {
        setSelectedDbId(databases[0].id);
      }
    }
  }, [databases, selectedDbId]);

  // Selected Database object
  const currentDb = databases.find(d => d.id === selectedDbId) || databases[0];

  // Derive available tables for the selected DB
  const getTablesForDb = (dbId: string): string[] => {
    const targetDb = databases.find(d => d.id === dbId);
    const dbTables = (targetDb?.allowedTables && targetDb.allowedTables.length > 0)
      ? targetDb.allowedTables
      : (targetDb?.availableTables || []);

    const config = globalMappingService.getConfig();
    const matchingFromConfig = Object.keys(config.tableMappings)
      .filter(k => k.startsWith(`${dbId}::`))
      .map(k => k.split('::')[1]);

    return Array.from(new Set([...dbTables, ...matchingFromConfig])).filter(Boolean);
  };

  const currentDbTables = selectedDbId ? getTablesForDb(selectedDbId) : [];

  // Keep selectedTableName synced
  useEffect(() => {
    if (currentDbTables.length > 0 && (!selectedTableName || !currentDbTables.includes(selectedTableName))) {
      setSelectedTableName(currentDbTables[0]);
    } else if (currentDbTables.length === 0) {
      setSelectedTableName('');
    }
  }, [currentDbTables, selectedTableName]);

  // Load Table Mapping when DB or Table changes
  useEffect(() => {
    if (selectedDbId && selectedTableName) {
      const existingMapping = globalMappingService.getTableMapping(selectedDbId, selectedTableName, currentDb?.name);
      const initialColMap: Record<string, string> = {};
      const initialNotesMap: Record<string, string> = {};

      if (existingMapping && existingMapping.columns) {
        existingMapping.columns.forEach(col => {
          initialColMap[col.physicalColumn] = col.globalKey;
          if (col.notes) initialNotesMap[col.physicalColumn] = col.notes;
        });
      }

      setTableColumnMappings(initialColMap);
      setTableColumnNotes(initialNotesMap);
      setMappingSaveSuccess(null);
    }
  }, [selectedDbId, selectedTableName, currentDb]);

  // Introspect physical columns & live sample rows for chosen DB & Table
  useEffect(() => {
    setSelectedTableCols([]);
    if (!selectedDbId || !selectedTableName) {
      setIntrospectedColumns([]);
      setDbSampleRows([]);
      return;
    }

    let isMounted = true;
    setColumnsLoading(true);
    setSampleLoading(true);
    setColumnsError(null);

    // 1. Fetch physical column definitions
    api.getTableColumns(selectedDbId, selectedTableName)
      .then(res => {
        if (isMounted) {
          const cols = res.columns || [];
          setIntrospectedColumns(cols);
          setColumnsLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setColumnsError(`Could not introspect physical columns: ${err.message}`);
          setIntrospectedColumns([]);
          setColumnsLoading(false);
        }
      });

    // 2. Fetch live sample data rows
    api.getTablePreview(selectedDbId, selectedTableName, 10)
      .then(res => {
        if (isMounted) {
          setDbSampleRows(res?.rows || []);
          setSampleLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          console.warn('[SystemSettings] Could not load table sample rows:', err);
          setDbSampleRows([]);
          setSampleLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [selectedDbId, selectedTableName]);

  // -------------------------------------------------------------
  // DICTIONARY ACTIONS: Add / Edit / Delete Field
  // -------------------------------------------------------------
  const handleOpenAddField = () => {
    setIsEditingField(false);
    setOriginalKey('');
    setFieldKey('');
    setFieldLabel('');
    setFieldDataType('string');
    setFieldRequired(false);
    setFieldCategory('General');
    setFieldDesc('');
    setFieldExample('');
    setFieldNotes('');
    setFieldModalError(null);
    setShowFieldModal(true);
  };

  const handleOpenEditField = (f: GlobalTransactionSchemaField) => {
    setIsEditingField(true);
    setOriginalKey(f.key);
    setFieldKey(f.key);
    setFieldLabel(f.label);
    setFieldDataType(f.dataType);
    setFieldRequired(!!f.required);
    setFieldCategory(f.category || 'General');
    setFieldDesc(f.description || '');
    setFieldExample(f.exampleValue ? String(f.exampleValue) : '');
    setFieldNotes(f.notes || '');
    setFieldModalError(null);
    setShowFieldModal(true);
  };

  const handleSaveField = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldModalError(null);

    const cleanKey = fieldKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanKey) {
      setFieldModalError('Field key is required (e.g. transaction_id, customer_email)');
      return;
    }

    if (!fieldLabel.trim()) {
      setFieldModalError('Display label is required');
      return;
    }

    if (!isEditingField && fields.some(f => f.key === cleanKey)) {
      setFieldModalError(`Field with key "${cleanKey}" already exists in the Global Dictionary`);
      return;
    }

    const fieldObj: GlobalTransactionSchemaField = {
      id: isEditingField ? (fields.find(f => f.key === originalKey)?.id || `gsd-${Date.now()}`) : `gsd-${Date.now()}`,
      key: cleanKey,
      label: fieldLabel.trim(),
      description: fieldDesc.trim(),
      dataType: fieldDataType,
      required: fieldRequired,
      isStandard: false,
      exampleValue: fieldExample.trim(),
      category: fieldCategory.trim() || 'General',
      notes: fieldNotes.trim(),
      user_id: currentUser?.username || 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      const existingField = fields.find(f => f.key === originalKey);
      const targetId = existingField?.id || originalKey;
      const payload = {
        ...fieldObj,
        required: fieldRequired,
        is_required: fieldRequired,
        isRequired: fieldRequired
      };
      if (isEditingField) {
        globalMappingService.updateStandardField(originalKey, payload, currentUser?.username || 'admin');
        await api.updateGlobalStandardDirectoryField(targetId, payload);
      } else {
        globalMappingService.addStandardField(payload, currentUser?.username || 'admin');
        await api.createGlobalStandardDirectoryField(payload);
      }

      // Re-fetch directory directly from backend database
      const refreshed = await api.getGlobalStandardDirectory().catch(() => null);
      if (Array.isArray(refreshed) && refreshed.length > 0) {
        setFields(refreshed);
      } else {
        setFields(globalMappingService.getStandardFields());
      }

      setShowFieldModal(false);
      setDictSuccessMsg(isEditingField ? `Field "${cleanKey}" successfully updated in database!` : `Field "${cleanKey}" added to Global Dictionary and saved to database!`);
      setTimeout(() => setDictSuccessMsg(null), 4000);
    } catch (err: any) {
      setFieldModalError(err.message || 'Failed to save field to database');
    }
  };

  const handleConfirmDeleteField = async () => {
    if (!fieldToDelete) return;

    try {
      globalMappingService.deleteStandardField(fieldToDelete.key, currentUser?.username || 'admin');
      await api.deleteGlobalStandardDirectoryField(fieldToDelete.id || fieldToDelete.key).catch(() => {});
      const refreshed = await api.getGlobalStandardDirectory().catch(() => null);
      if (Array.isArray(refreshed)) {
        setFields(refreshed);
      } else {
        setFields(prev => prev.filter(f => f.key !== fieldToDelete.key));
      }
      setSelectedFieldKeys(prev => prev.filter(k => k !== fieldToDelete.key));
      setDictSuccessMsg(`Field "${fieldToDelete.key}" removed from database and Global Dictionary.`);
      setTimeout(() => setDictSuccessMsg(null), 4000);
    } catch (err: any) {
      showSystemAlert({
        title: 'Delete Failed',
        message: `Error deleting field: ${err.message || err}`,
        type: 'error'
      });
    } finally {
      setFieldToDelete(null);
    }
  };

  const handleClearAllFields = async () => {
    try {
      globalMappingService.clearAllStandardFields(currentUser?.username || 'admin');
      await api.clearGlobalStandardDirectory().catch(() => {});
      await api.saveGlobalSchemaConfig({
        version: '2.3.0',
        standardFields: [],
        tableMappings: {},
        updatedBy: currentUser?.username || 'admin',
        description: 'Cleared all global schema fields'
      }).catch(() => {});
      setFields([]);
      setSelectedFieldKeys([]);
      setShowClearAllModal(false);
      setDictSuccessMsg('All fields deleted. Global Dictionary and Schema are now empty.');
      setTimeout(() => setDictSuccessMsg(null), 4000);
    } catch (err: any) {
      showSystemAlert({
        title: 'Clear Dictionary Failed',
        message: `Error clearing dictionary: ${err.message || err}`,
        type: 'error'
      });
    }
  };

  const toggleSelectAll = () => {
    if (selectedFieldKeys.length === filteredFields.length && filteredFields.length > 0) {
      setSelectedFieldKeys([]);
    } else {
      setSelectedFieldKeys(filteredFields.map(f => f.key));
    }
  };

  const toggleSelectField = (key: string) => {
    setSelectedFieldKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const executeDeleteSelectedFields = async () => {
    if (selectedFieldKeys.length === 0) return;
    setConfirmDeleteSelectedOpen(false);
    try {
      for (const key of selectedFieldKeys) {
        globalMappingService.deleteStandardField(key, currentUser?.username || 'admin');
        await api.deleteGlobalStandardDirectoryField(key).catch(() => {});
      }
      const refreshed = await api.getGlobalStandardDirectory().catch(() => null);
      if (Array.isArray(refreshed)) {
        setFields(refreshed);
      } else {
        setFields(prev => prev.filter(f => !selectedFieldKeys.includes(f.key)));
      }
      const deletedCount = selectedFieldKeys.length;
      setSelectedFieldKeys([]);
      setDictSuccessMsg(`Deleted ${deletedCount} selected fields from Global Dictionary.`);
      setTimeout(() => setDictSuccessMsg(null), 4000);
    } catch (err: any) {
      showSystemAlert({
        title: 'Delete Failed',
        message: `Error deleting selected fields: ${err.message || err}`,
        type: 'error'
      });
    }
  };

  const handleDeleteSelectedFields = () => {
    if (selectedFieldKeys.length === 0) return;
    setConfirmDeleteSelectedOpen(true);
  };

  const handleDiscoverFromDatabases = async () => {
    setDiscoveringFromDb(true);
    try {
      const res = await api.discoverGlobalFieldsFromDatabases(currentUser?.username || 'admin');
      const refreshed = await api.getGlobalStandardDirectory().catch(() => res.fields || []);
      if (Array.isArray(refreshed) && refreshed.length > 0) {
        setFields(refreshed);
      } else if (res.fields) {
        setFields(res.fields);
      }
      setDictSuccessMsg(res.message || `Discovered ${res.discoveredCount || 0} database columns into Global Schema.`);
      setTimeout(() => setDictSuccessMsg(null), 5000);
    } catch (err: any) {
      showSystemAlert({
        title: 'Discovery Failed',
        message: `Error discovering fields from databases: ${err.message || err}`,
        type: 'error'
      });
    } finally {
      setDiscoveringFromDb(false);
    }
  };

  const handleOpenImportTableModal = () => {
    const defaultDbId = selectedDbId || databases[0]?.id || '';
    setImportTableDbId(defaultDbId);
    const tbls = getTablesForDb(defaultDbId);
    setImportTableName(tbls[0] || '');
    setImportTableError(null);
    setShowImportTableModal(true);
  };

  const handleExecuteImportTable = async () => {
    if (!importTableDbId || !importTableName) {
      setImportTableError('Please select both a database and table to import.');
      return;
    }
    setImportingTableLoading(true);
    setImportTableError(null);
    try {
      const res = await api.importGlobalFieldsFromTable(importTableDbId, importTableName, currentUser?.username || 'admin');
      const refreshed = await api.getGlobalStandardDirectory().catch(() => null);
      if (Array.isArray(refreshed)) {
        setFields(refreshed);
      }
      setShowImportTableModal(false);
      setDictSuccessMsg(res.message || `Successfully imported columns from '${importTableName}' into Global Schema!`);
      setTimeout(() => setDictSuccessMsg(null), 5000);
    } catch (err: any) {
      setImportTableError(err.message || 'Failed to import table columns');
    } finally {
      setImportingTableLoading(false);
    }
  };

  const handleOpenExportJson = () => {
    setJsonMode('export');
    setJsonContent(JSON.stringify(fields, null, 2));
    setJsonError(null);
    setShowJsonModal(true);
  };

  const handleOpenImportJson = () => {
    setJsonMode('import');
    setJsonContent('');
    setJsonError(null);
    setShowJsonModal(true);
  };

  const handleToggleFieldRequired = async (field: GlobalTransactionSchemaField) => {
    const nextVal = !field.required;
    setTogglingRequiredKey(field.key);
    
    // Optimistic UI update
    setFields(prev => prev.map(f => f.key === field.key ? { ...f, required: nextVal } : f));
    
    try {
      const targetId = field.id || field.key;
      await api.updateGlobalStandardDirectoryField(targetId, {
        ...field,
        required: nextVal,
        is_required: nextVal,
        isRequired: nextVal
      });
      globalMappingService.updateStandardField(field.key, { ...field, required: nextVal }, currentUser?.username || 'admin');
      setDictSuccessMsg(`Field "${field.key}" is now ${nextVal ? 'Required' : 'Optional'}.`);
      setTimeout(() => setDictSuccessMsg(null), 3000);
    } catch (err: any) {
      // Revert on error
      setFields(prev => prev.map(f => f.key === field.key ? { ...f, required: field.required } : f));
      showSystemAlert({
        title: 'Constraint Update Failed',
        message: `Failed to update required constraint: ${err.message || err}`,
        type: 'error'
      });
    } finally {
      setTogglingRequiredKey(null);
    }
  };

  const handleAutoClassifyAll = async () => {
    setAutoClassifying(true);
    try {
      const res = await api.autoClassifyGlobalFields();
      const refreshed = await api.getGlobalStandardDirectory().catch(() => res.fields || []);
      if (Array.isArray(refreshed) && refreshed.length > 0) {
        setFields(refreshed);
      } else if (res.fields) {
        setFields(res.fields);
      }
      setDictSuccessMsg(res.message || `Successfully auto-classified ${res.classifiedCount || 0} fields!`);
      setTimeout(() => setDictSuccessMsg(null), 5000);
    } catch (err: any) {
      showSystemAlert({
        title: 'Classification Failed',
        message: `Failed to auto-classify fields: ${err.message || err}`,
        type: 'error'
      });
    } finally {
      setAutoClassifying(false);
    }
  };

  const handleExecuteJsonAction = async () => {
    if (jsonMode === 'export') {
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `global_dictionary_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setShowJsonModal(false);
    } else {
      try {
        const parsed = JSON.parse(jsonContent);
        let fieldsArray: any[] = [];
        if (Array.isArray(parsed)) {
          fieldsArray = parsed;
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.standardFields)) {
            fieldsArray = parsed.standardFields;
          } else if (Array.isArray(parsed.fields)) {
            fieldsArray = parsed.fields;
          } else if (Array.isArray(parsed.columns)) {
            fieldsArray = parsed.columns;
          } else {
            fieldsArray = Object.entries(parsed).map(([k, v]: [string, any]) => ({
              key: k,
              ...(typeof v === 'object' ? v : { label: k })
            }));
          }
        }

        if (fieldsArray.length === 0) {
          throw new Error('No valid column definitions found in the provided JSON.');
        }

        setImportingJson(true);
        setJsonError(null);

        // Persist directly to PostgreSQL with automatic domain classification
        const res = await api.batchImportGlobalFields(fieldsArray, true, currentUser?.username || 'admin');

        // Sync local mapping service
        fieldsArray.forEach((f: any) => {
          if (f.key && f.label) {
            globalMappingService.addStandardField(f, currentUser?.username || 'admin');
          }
        });

        // Re-fetch directory directly from database
        const refreshed = await api.getGlobalStandardDirectory().catch(() => res.fields || []);
        if (Array.isArray(refreshed) && refreshed.length > 0) {
          setFields(refreshed);
        } else if (res.fields) {
          setFields(res.fields);
        }

        setShowJsonModal(false);
        setDictSuccessMsg(res.message || `Successfully imported and persisted ${res.importedCount || fieldsArray.length} fields to database!`);
        setTimeout(() => setDictSuccessMsg(null), 5000);
      } catch (e: any) {
        setJsonError(`Import failed: ${e.message}`);
      } finally {
        setImportingJson(false);
      }
    }
  };

  // Filtered fields in Dictionary
  const categories = ['ALL', ...Array.from(new Set(fields.map(f => f.category || 'General')))];
  const filteredFields = fields.filter(f => {
    const matchesSearch = 
      f.key.toLowerCase().includes(dictSearch.toLowerCase()) ||
      f.label.toLowerCase().includes(dictSearch.toLowerCase()) ||
      (f.description && f.description.toLowerCase().includes(dictSearch.toLowerCase())) ||
      (f.category && f.category.toLowerCase().includes(dictSearch.toLowerCase()));

    const matchesCat = dictCategory === 'ALL' || (f.category || 'General') === dictCategory;
    return matchesSearch && matchesCat;
  });

  // -------------------------------------------------------------
  // ENVIRONMENT & TABLE MAPPING ACTIONS
  // -------------------------------------------------------------
  const handleAutoMapColumns = () => {
    if (introspectedColumns.length === 0) return;
    const newMappings = { ...tableColumnMappings };
    let count = 0;

    introspectedColumns.forEach(pCol => {
      const pName = pCol.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const match = fields.find(f => {
        const gKey = f.key.toLowerCase().replace(/[^a-z0-9]/g, '');
        return gKey === pName || pName.includes(gKey) || gKey.includes(pName);
      });
      if (match) {
        newMappings[pCol.name] = match.key;
        count++;
      }
    });

    setTableColumnMappings(newMappings);
    setMappingSaveSuccess(`Auto-mapped ${count} columns based on dictionary matches! Click "Save Table Mapping" to persist.`);
    setTimeout(() => setMappingSaveSuccess(null), 5000);
  };

  const handleSaveTableMapping = async () => {
    if (!selectedDbId || !selectedTableName) return;
    const mappingCols: { globalKey: string; physicalColumn: string; notes?: string }[] = [];

    // Prioritize real introspected columns if available
    const physicalColNames = introspectedColumns.length > 0 
      ? introspectedColumns.map(c => c.name) 
      : Object.keys(tableColumnMappings);

    physicalColNames.forEach(pCol => {
      const gKey = tableColumnMappings[pCol];
      if (gKey) {
        mappingCols.push({
          physicalColumn: pCol,
          globalKey: gKey,
          notes: tableColumnNotes[pCol] || ''
        });
      }
    });

    globalMappingService.saveTableMapping(
      selectedDbId,
      selectedTableName,
      currentDb?.name || selectedDbId,
      mappingCols,
      currentUser?.username || 'admin'
    );

    try {
      const res = await globalMappingService.saveTableMappingToBackend(
        selectedDbId,
        selectedTableName,
        currentDb?.name || selectedDbId,
        mappingCols,
        currentUser?.username || 'admin'
      );
      if (res?.validation) {
        if (res.validation.status === 'COMPLETE') {
          setMappingSaveSuccess(`✓ Saved table mapping for "${selectedTableName}" to PostgreSQL database! Status: COMPLETE (All ${res.validation.requiredColumnsCount} required columns mapped).`);
        } else {
          setMappingSaveSuccess(`⚠️ Saved table mapping for "${selectedTableName}" to PostgreSQL. Status: INCOMPLETE (Missing required columns: ${res.validation.missingRequiredColumns.join(', ')}).`);
        }
      } else {
        setMappingSaveSuccess(`✓ Table mapping for "${selectedTableName}" successfully saved to PostgreSQL database!`);
      }
    } catch (err: any) {
      setMappingSaveSuccess(`Saved locally. Warning: Backend database error: ${err.message}`);
    }
    setTimeout(() => setMappingSaveSuccess(null), 5000);
  };

  const handleAddCustomTable = async () => {
    const cleanTable = newTableName.trim();
    if (!cleanTable) return;
    globalMappingService.saveTableMapping(
      selectedDbId,
      cleanTable,
      currentDb?.name || selectedDbId,
      [],
      currentUser?.username || 'admin'
    );
    try {
      await globalMappingService.saveTableMappingToBackend(
        selectedDbId,
        cleanTable,
        currentDb?.name || selectedDbId,
        [],
        currentUser?.username || 'admin'
      );
    } catch (e) {
      // ignore
    }
    setSelectedTableName(cleanTable);
    setShowAddTableModal(false);
    setNewTableName('');
  };

  // -------------------------------------------------------------
  // TABLE MAPPING COLUMN TRANSFORMATIONS & DICTIONARY ACTIONS
  // -------------------------------------------------------------
  const handleOpenSplitModal = (colName: string) => {
    setSplitCol(colName);
    setSplitDelimType('SPACE');
    setSplitCustomDelim('');
    setSplitPart1Name(`${colName}_part1`);
    setSplitPart2Name(`${colName}_part2`);
    setSplitKeepOriginal(true);
    setShowSplitModal(true);
  };

  const handleApplySplit = () => {
    if (!splitCol || !splitPart1Name.trim() || !splitPart2Name.trim()) return;
    const delim = splitDelimType === 'COMMA' ? ','
      : splitDelimType === 'HYPHEN' ? '-'
      : splitDelimType === 'SLASH' ? '/'
      : splitDelimType === 'UNDERSCORE' ? '_'
      : splitDelimType === 'PIPE' ? '|'
      : splitDelimType === 'SEMICOLON' ? ';'
      : splitDelimType === 'CUSTOM' ? (splitCustomDelim || ' ')
      : ' ';

    // Split sample rows
    setDbSampleRows(prev => prev.map(row => {
      const val = row[splitCol] !== undefined && row[splitCol] !== null ? String(row[splitCol]) : '';
      const parts = val.split(delim);
      const next = { ...row };
      next[splitPart1Name] = parts[0] || '';
      next[splitPart2Name] = parts.slice(1).join(delim) || '';
      if (!splitKeepOriginal) {
        delete next[splitCol];
      }
      return next;
    }));

    // Update introspected columns
    setIntrospectedColumns(prev => {
      const nextCols = [...prev];
      const idx = nextCols.findIndex(c => c.name === splitCol);
      const part1Col = { name: splitPart1Name, type: 'VARCHAR (Split)', nullable: true };
      const part2Col = { name: splitPart2Name, type: 'VARCHAR (Split)', nullable: true };
      if (!splitKeepOriginal && idx !== -1) {
        nextCols.splice(idx, 1, part1Col, part2Col);
      } else {
        nextCols.push(part1Col, part2Col);
      }
      return nextCols;
    });

    setShowSplitModal(false);
  };

  const handleToggleTableColSelect = (colName: string) => {
    setSelectedTableCols(prev =>
      prev.includes(colName) ? prev.filter(c => c !== colName) : [...prev, colName]
    );
  };

  const handleToggleSelectAllTableCols = () => {
    if (selectedTableCols.length === introspectedColumns.length && introspectedColumns.length > 0) {
      setSelectedTableCols([]);
    } else {
      setSelectedTableCols(introspectedColumns.map(c => c.name));
    }
  };

  const handleOpenMergeModal = (colName?: string) => {
    let col1 = colName || '';
    let col2 = '';
    if (colName) {
      col1 = colName;
      col2 = introspectedColumns.find(c => c.name !== colName)?.name || '';
    } else if (selectedTableCols.length >= 2) {
      col1 = selectedTableCols[0];
      col2 = selectedTableCols[1];
    } else if (selectedTableCols.length === 1) {
      col1 = selectedTableCols[0];
      col2 = introspectedColumns.find(c => c.name !== col1)?.name || '';
    } else {
      col1 = introspectedColumns[0]?.name || '';
      col2 = introspectedColumns[1]?.name || '';
    }
    setMergeCol1(col1);
    setMergeCol2(col2);
    setMergeSepType('SPACE');
    setMergeCustomSep('');
    setMergeTargetName(`${col1}_${col2 || 'merged'}`);
    setMergeKeepSource(true);
    setShowMergeModal(true);
  };

  const handleApplyMerge = () => {
    if (!mergeCol1 || !mergeCol2 || !mergeTargetName.trim()) return;
    const sep = mergeSepType === 'HYPHEN' ? '-'
      : mergeSepType === 'UNDERSCORE' ? '_'
      : mergeSepType === 'SLASH' ? '/'
      : mergeSepType === 'COMMA' ? ', '
      : mergeSepType === 'NONE' ? ''
      : mergeSepType === 'CUSTOM' ? mergeCustomSep
      : ' ';

    // Merge sample rows
    setDbSampleRows(prev => prev.map(row => {
      const v1 = row[mergeCol1] !== undefined && row[mergeCol1] !== null ? String(row[mergeCol1]) : '';
      const v2 = row[mergeCol2] !== undefined && row[mergeCol2] !== null ? String(row[mergeCol2]) : '';
      const next = { ...row };
      next[mergeTargetName] = `${v1}${sep}${v2}`;
      if (!mergeKeepSource) {
        delete next[mergeCol1];
        delete next[mergeCol2];
      }
      return next;
    }));

    // Update introspected columns
    setIntrospectedColumns(prev => {
      const nextCols = [...prev];
      if (!mergeKeepSource) {
        const filtered = nextCols.filter(c => c.name !== mergeCol1 && c.name !== mergeCol2);
        return [...filtered, { name: mergeTargetName, type: 'VARCHAR (Merged)', nullable: true }];
      }
      return [...nextCols, { name: mergeTargetName, type: 'VARCHAR (Merged)', nullable: true }];
    });

    setShowMergeModal(false);
    setSelectedTableCols([]);
  };

  const handleOpenAddToGlobalModal = (col: { name: string; type: string; nullable: boolean }) => {
    setSelectedColForGlobal(col);
    const key = col.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const label = col.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const t = (col.type || '').toLowerCase();
    let dt: 'string' | 'number' | 'boolean' | 'date' | 'json' = 'string';
    if (t.includes('int') || t.includes('num') || t.includes('float') || t.includes('decimal')) dt = 'number';
    else if (t.includes('date') || t.includes('time')) dt = 'date';
    else if (t.includes('bool')) dt = 'boolean';

    setNewGlobalKey(key);
    setNewGlobalLabel(label);
    setNewGlobalDataType(dt);
    setNewGlobalDesc(`Physical column ${col.name} mapped from database ${currentDb?.name || ''}`);
    setNewGlobalCategory('General');
    setNewGlobalRequired(!col.nullable);
    setAddToGlobalError(null);
    setShowAddToGlobalModal(true);
  };

  const handleApplyAddToGlobal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedColForGlobal) return;
    setAddToGlobalError(null);

    const cleanKey = newGlobalKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanKey) {
      setAddToGlobalError('Key is required');
      return;
    }
    if (fields.some(f => f.key === cleanKey)) {
      setAddToGlobalError(`Field "${cleanKey}" already exists in the Global Dictionary`);
      return;
    }

    const fieldObj: GlobalTransactionSchemaField = {
      id: `gsd-${Date.now()}`,
      key: cleanKey,
      label: newGlobalLabel.trim() || cleanKey,
      description: newGlobalDesc.trim(),
      dataType: newGlobalDataType,
      required: newGlobalRequired,
      isStandard: false,
      category: newGlobalCategory.trim() || 'General',
      user_id: currentUser?.username || 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      await api.createGlobalStandardDirectoryField(fieldObj);
      setFields(prev => [...prev, fieldObj]);
      globalMappingService.addStandardField(fieldObj, currentUser?.username || 'admin');

      // Instantly map this physical column to the new global field
      setTableColumnMappings(prev => ({
        ...prev,
        [selectedColForGlobal.name]: cleanKey
      }));

      setShowAddToGlobalModal(false);
      setMappingSaveSuccess(`✓ Added "${cleanKey}" to Global Dictionary and mapped to column "${selectedColForGlobal.name}"!`);
      setTimeout(() => setMappingSaveSuccess(null), 5000);
    } catch (err: any) {
      setAddToGlobalError(`Failed to save to Global Dictionary: ${err.message}`);
    }
  };

  const handleOpenLinkDictModal = (colName: string) => {
    setLinkDictCol(colName);
    setSelectedDictId(valueDicts[0]?.id || '');
    setShowLinkDictModal(true);
  };

  const handleApplyLinkDict = () => {
    if (!linkDictCol || !selectedDictId) return;
    const dict = valueDicts.find(d => d.id === selectedDictId);
    if (dict) {
      setTableColumnNotes(prev => ({
        ...prev,
        [linkDictCol]: `Value Translation: ${dict.name} (${dict.category})`
      }));
      setMappingSaveSuccess(`✓ Linked column "${linkDictCol}" to Value Translation Dictionary "${dict.name}"!`);
      setTimeout(() => setMappingSaveSuccess(null), 5000);
    }
    setShowLinkDictModal(false);
  };

  // Value Translation Dictionary Handlers
  const handleOpenAddValueDict = () => {
    setEditingDictId(null);
    setDictModalName('');
    setDictModalDesc('');
    setDictModalCat('BANK_CODES');
    setDictModalPairs([
      { sourceValue: '', targetValue: '', notes: '' }
    ]);
    setShowValueDictModal(true);
  };

  const handleOpenEditValueDict = (dict: ValueTranslationDictionary) => {
    setEditingDictId(dict.id);
    setDictModalName(dict.name);
    setDictModalDesc(dict.description || '');
    setDictModalCat(dict.category);
    setDictModalPairs(dict.mappings.map(m => ({ ...m })));
    setShowValueDictModal(true);
  };

  const handleSaveValueDict = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!dictModalName.trim()) return;
    const cleanPairs = dictModalPairs.filter(p => p.sourceValue.trim() && p.targetValue.trim());
    if (editingDictId) {
      const payload: Partial<ValueTranslationDictionary> = {
        name: dictModalName.trim(),
        description: dictModalDesc.trim(),
        category: dictModalCat,
        mappings: cleanPairs
      };
      try {
        const updated = await api.updateValueTranslationDictionary(editingDictId, payload);
        setValueDicts(prev => prev.map(d => d.id === editingDictId ? updated : d));
      } catch (err) {
        console.error('Failed to update value translation dictionary in PostgreSQL:', err);
      }
    } else {
      const newDict: Partial<ValueTranslationDictionary> = {
        name: dictModalName.trim(),
        description: dictModalDesc.trim(),
        category: dictModalCat,
        mappings: cleanPairs
      };
      try {
        const saved = await api.createValueTranslationDictionary(newDict);
        setValueDicts(prev => [...prev, saved]);
      } catch (err) {
        console.error('Failed to create value translation dictionary in PostgreSQL:', err);
      }
    }
    setShowValueDictModal(false);
  };

  const handleDeleteValueDict = async (id: string, name: string) => {
    if (window.confirm(`Delete value translation dictionary "${name}" from PostgreSQL?`)) {
      try {
        await api.deleteValueTranslationDictionary(id);
        setValueDicts(prev => prev.filter(d => d.id !== id));
      } catch (err) {
        console.error('Failed to delete value translation dictionary from PostgreSQL:', err);
      }
    }
  };

  // -------------------------------------------------------------
  // NON-ADMIN RESTRICTION VIEW
  // -------------------------------------------------------------
  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
          <AlertCircle size={32} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-800">Administrator Scope Required</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            The System Settings console provides root-level controls over database connections, global data dictionaries, and environment table mappings. Only system administrators have authorization to access this area.
          </p>
        </div>
        {onNavigateToWorkspace && (
          <button
            onClick={onNavigateToWorkspace}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
          >
            Return to Operations Workspace
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3.5 max-w-7xl mx-auto pb-8">
      {/* Top Banner Header */}
      <div className="bg-white text-slate-800 rounded-2xl p-2.5 sm:p-3 shadow-xs border border-slate-200/90 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar" id="system-settings-header">
        <div className="flex items-center gap-2 shrink-0">
          <div className="p-1.5 bg-blue-50 text-[#155DFC] rounded-lg border border-blue-200/60 shrink-0">
            <Sliders size={18} />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-slate-900 whitespace-nowrap">
              System Administration Settings
            </h1>
            <span className="hidden xl:inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider font-bold bg-blue-50 text-blue-600 border border-blue-200/60 uppercase items-center gap-1 whitespace-nowrap">
              <ShieldCheck size={10} className="text-blue-600" />
              Admin
            </span>
          </div>
        </div>

        {/* Status Counters */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-center flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 tracking-wider font-mono">Databases:</span>
            <span className="text-xs font-black text-slate-800">{databases.length}</span>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-center flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 tracking-wider font-mono">Dict Columns:</span>
            <span className="text-xs font-black text-[#155DFC]">{fields.length}</span>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation Bar */}
      <div className="bg-slate-100/90 rounded-2xl border border-slate-200 shadow-xs p-1 flex items-center gap-1 overflow-x-auto no-scrollbar" id="system-settings-tabs">
        <button
          type="button"
          onClick={() => setActiveTab('dictionary')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'dictionary'
              ? 'bg-[#155DFC] text-white shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
          }`}
          id="tab-sys-dict"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Global Mapping Dictionary</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
            activeTab === 'dictionary' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {fields.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('connections')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'connections'
              ? 'bg-[#155DFC] text-white shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
          }`}
          id="tab-sys-conn"
        >
          <Database className="w-3.5 h-3.5" />
          <span>Connection Settings</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
            activeTab === 'connections' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {databases.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('environment')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'environment'
              ? 'bg-[#155DFC] text-white shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
          }`}
          id="tab-sys-env"
        >
          <Server className="w-3.5 h-3.5" />
          <span>Table Mapping</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('staging')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'staging'
              ? 'bg-[#155DFC] text-white shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
          }`}
          id="tab-sys-staging"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>FTP File Staging & Parsing</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
            activeTab === 'staging' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {databases.filter(d => d.type === 'FTP' || d.type === 'SFTP').length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('transformations')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'transformations'
              ? 'bg-[#155DFC] text-white shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
          }`}
          id="tab-sys-transformations"
        >
          <Wand2 className="w-3.5 h-3.5" />
          <span>Data Transformation Dictionary</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
            activeTab === 'transformations' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {transformRules.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: GLOBAL MAPPING DICTIONARY SETTING                                  */}
      {/* ========================================================================= */}
      {activeTab === 'dictionary' && (
        <div className="space-y-6">
          {dictSuccessMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2 shadow-sm animate-fade-in">
              <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
              <span>{dictSuccessMsg}</span>
            </div>
          )}

          {/* Dictionary Toolbar */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-grow max-w-2xl">
              <div className="relative flex-grow">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search columns by key, label, category..."
                  value={dictSearch}
                  onChange={(e) => setDictSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <Filter size={14} className="text-slate-400 hidden sm:inline" />
                <select
                  value={dictCategory}
                  onChange={(e) => setDictCategory(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>Category: {cat}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions: Add Field, JSON, Reset */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleOpenAddField}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                id="btn-add-global-column"
              >
                <Plus size={14} />
                <span>Add Global Field</span>
              </button>

              {selectedFieldKeys.length > 0 && (
                <button
                  type="button"
                  onClick={handleDeleteSelectedFields}
                  className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition animate-in fade-in"
                  id="btn-delete-selected-fields"
                >
                  <Trash2 size={13} />
                  <span>Delete Selected ({selectedFieldKeys.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowClearAllModal(true)}
                disabled={fields.length === 0}
                className="px-3 py-2 text-rose-600 hover:bg-rose-50 hover:border-rose-300 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40 disabled:pointer-events-none"
                id="btn-clear-all-global-schema"
                title="Delete all fields from the Global Schema & Dictionary"
              >
                <Trash2 size={13} />
                <span>Delete All ({fields.length})</span>
              </button>

              <button
                type="button"
                onClick={handleOpenExportJson}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                title="Export dictionary schema as JSON"
              >
                <Download size={13} />
                <span className="hidden sm:inline">Export</span>
              </button>

              <button
                type="button"
                onClick={handleOpenImportJson}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                title="Import dictionary schema from JSON"
              >
                <Upload size={13} />
                <span className="hidden sm:inline">Import</span>
              </button>

              <button
                type="button"
                onClick={handleDiscoverFromDatabases}
                disabled={discoveringFromDb}
                className="px-3.5 py-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                id="btn-discover-from-databases"
                title="Harvest real physical database columns from all connected databases into Global Schema"
              >
                {discoveringFromDb ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} className="text-blue-600" />}
                <span>{discoveringFromDb ? 'Discovering...' : 'Discover from Databases'}</span>
              </button>

              <button
                type="button"
                onClick={handleAutoClassifyAll}
                disabled={autoClassifying || fields.length === 0}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                id="btn-auto-classify-all"
                title="Automatically categorize and organize all fields into standard business domains"
              >
                {autoClassifying ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} className="text-indigo-600" />}
                <span>{autoClassifying ? 'Classifying...' : 'Auto-Classify All'}</span>
              </button>

              <button
                type="button"
                onClick={handleOpenImportTableModal}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                id="btn-import-table-columns"
                title="Import physical columns from a specific connected database table"
              >
                <Table size={13} className="text-slate-500" />
                <span className="hidden sm:inline">Import from Table</span>
              </button>
            </div>
          </div>

          {/* Dictionary Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono flex items-center gap-2">
                  <Layers size={14} className="text-blue-600" />
                  Canonical Column Catalog ({filteredFields.length} of {fields.length})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Global schema dictionary defining standard nomenclature, data types, and required statuses for cross-database reconciliation.
                </p>
              </div>
              {dictLoading && <Loader2 size={16} className="animate-spin text-blue-600" />}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider font-mono">
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={filteredFields.length > 0 && selectedFieldKeys.length === filteredFields.length}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        title="Select all"
                      />
                    </th>
                    <th className="py-3 px-4">Field Key (Global Identifier)</th>
                    <th className="py-3 px-4">Display Label</th>
                    <th className="py-3 px-4">Data Type</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Constraint</th>
                    <th className="py-3 px-4">Example Value</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredFields.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        {fields.length === 0 ? (
                          <div className="py-12 px-6 text-center max-w-md mx-auto space-y-4">
                            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto shadow-inner">
                              <Database size={24} />
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-slate-800">No Global Schema Fields Configured</h4>
                              <p className="text-xs text-slate-500 mt-1">
                                The Global Schema is based strictly on real connected database values rather than a static dictionary. Discover columns automatically from your live database tables or import specific tables.
                              </p>
                            </div>
                            <div className="flex items-center justify-center gap-2 pt-2">
                              <button
                                type="button"
                                onClick={handleDiscoverFromDatabases}
                                disabled={discoveringFromDb}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
                              >
                                {discoveringFromDb ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                <span>{discoveringFromDb ? 'Discovering...' : 'Discover from Connected Databases'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={handleOpenImportTableModal}
                                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                              >
                                <Table size={13} />
                                <span>Import from Table</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          `No fields found matching "${dictSearch}".`
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredFields.map(f => {
                      const isPk = f.key === 'transaction_id';
                      const isSelected = selectedFieldKeys.includes(f.key);
                      return (
                        <tr key={f.key} className={`hover:bg-slate-50/70 transition ${isSelected ? 'bg-blue-50/40' : ''}`}>
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectField(f.key)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-blue-700">
                            <div className="flex items-center gap-1.5">
                              {isPk && <Key size={12} className="text-amber-500" title="Primary Key" />}
                              <span>{f.key}</span>
                            </div>
                            {f.notes && (
                              <div className="text-[10px] text-slate-400 font-sans font-normal truncate max-w-[220px] mt-0.5" title={f.notes}>
                                {f.notes.replace('Discovered from database ', '').replace('table ', '')}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900">{f.label}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                              f.dataType === 'number' ? 'bg-amber-100 text-amber-800' :
                              f.dataType === 'date' ? 'bg-purple-100 text-purple-800' :
                              f.dataType === 'boolean' ? 'bg-indigo-100 text-indigo-800' :
                              'bg-slate-100 text-slate-800'
                            }`}>
                              {f.dataType}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                              {f.category || 'General'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => handleToggleFieldRequired(f)}
                              disabled={togglingRequiredKey === f.key}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition border ${
                                f.required
                                  ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700'
                              }`}
                              title={`Click to toggle constraint (currently ${f.required ? 'Required' : 'Optional'})`}
                              id={`btn-toggle-required-${f.key}`}
                            >
                              {togglingRequiredKey === f.key ? (
                                <Loader2 size={10} className="animate-spin text-slate-500" />
                              ) : (
                                <span className={`w-1.5 h-1.5 rounded-full ${f.required ? 'bg-rose-500' : 'bg-slate-300'}`} />
                              )}
                              {f.required ? 'Required' : 'Optional'}
                            </button>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-500 max-w-[140px] truncate">
                            {f.exampleValue ? String(f.exampleValue) : '—'}
                          </td>
                          <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={f.description}>
                            {f.description || '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditField(f)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                title={`Edit ${f.key}`}
                              >
                                <Edit3 size={13} />
                              </button>

                              <button
                                type="button"
                                onClick={() => setFieldToDelete(f)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                title={`Delete ${f.key}`}
                                id={`btn-delete-field-${f.key}`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CONNECTION SETTINGS                                                */}
      {/* ========================================================================= */}
      {activeTab === 'connections' && (
        <div className="space-y-4">
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 text-xs text-blue-900 flex items-start gap-3 shadow-sm">
            <Info size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block text-sm">System Database Connections</span>
              <p className="mt-0.5 leading-relaxed text-blue-800">
                Manage physical database clusters (PostgreSQL, Oracle, MySQL, MongoDB Atlas). Test live ping responses, configure database credentials, discover allowed tables, and toggle active status.
              </p>
            </div>
          </div>

          <AdminDbConnections
            databases={databases}
            teams={teams}
            currentUser={currentUser}
            onAddDatabase={onAddDatabase}
            onToggleDbStatus={onToggleDbStatus}
            onDeleteDb={onDeleteDb}
            onUpdateDb={onUpdateDb}
            onOpenFtpStaging={(dbId) => {
              setSelectedFtpDbId(dbId);
              setActiveTab('staging');
            }}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ENVIRONMENT SETTINGS (PER-DB CONFIG & TABLE MAPPINGS)             */}
      {/* ========================================================================= */}
      {activeTab === 'environment' && (
        <div className="space-y-6">
          {mappingSaveSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2 shadow-sm animate-fade-in">
              <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
              <span>{mappingSaveSuccess}</span>
            </div>
          )}

          {/* Database Selector Header Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-wider">Environment Target</span>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Server size={16} className="text-blue-600" />
                  Select Connected Database for Configuration
                </h3>
              </div>

              {/* Database Dropdown */}
              <div className="flex items-center gap-3">
                <select
                  value={selectedDbId}
                  onChange={(e) => setSelectedDbId(e.target.value)}
                  className="px-4 py-2 rounded-xl border-2 border-blue-500 font-bold text-xs text-slate-800 bg-blue-50/30 focus:outline-none"
                  id="select-env-db"
                >
                  {databases.length === 0 ? (
                    <option value="">No databases connected</option>
                  ) : (
                    databases.map(db => (
                      <option key={db.id} value={db.id}>
                        {db.name} ({db.type || 'Relational'}) — {db.systemCategory || 'General'}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* DB Environment Details Card */}
            {currentDb && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-mono uppercase">Dialect / Type</span>
                  <span className="font-bold text-slate-800 font-mono">{currentDb.type || 'PostgreSQL'}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-mono uppercase">Category Role</span>
                  <span className="font-bold text-blue-700">{currentDb.systemCategory || 'Connected Database'}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-mono uppercase">Host / Port</span>
                  <span className="font-mono text-slate-800 truncate block">{currentDb.host}:{currentDb.port}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-mono uppercase">Operational State</span>
                  <span className={`font-bold inline-flex items-center gap-1 ${
                    currentDb.status === 'online' ? 'text-emerald-600' : 'text-slate-500'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${
                      currentDb.status === 'online' ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}></span>
                    {currentDb.status === 'online' ? 'Active / Online' : 'Standby'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Table Configuration & Schema Mapping Section */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 font-mono flex items-center gap-2">
                  <Table size={15} className="text-blue-600" />
                  Table-to-Global Schema Mapping Matrix
                </h4>
                <p className="text-[11px] text-slate-500">
                  Map physical database columns from <span className="font-bold text-slate-700">{currentDb?.name}</span> to canonical fields in the Global Mapping Dictionary.
                </p>
              </div>

              {/* Table Selector & Add Table Button */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedTableName}
                  onChange={(e) => setSelectedTableName(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  id="select-env-table"
                >
                  {currentDbTables.length === 0 ? (
                    <option value="">No tables configured</option>
                  ) : (
                    currentDbTables.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))
                  )}
                </select>

                <button
                  type="button"
                  onClick={() => setShowAddTableModal(true)}
                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-200 transition"
                  title="Add custom table mapping"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Columns Mapping Action Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="font-bold font-mono text-slate-800">{selectedTableName || 'No Table Selected'}</span>
                <span className="text-slate-400">•</span>
                <span>{columnsLoading ? 'Introspecting schema...' : `${introspectedColumns.length} physical columns detected`}</span>
                <span className="text-slate-400">•</span>
                <span>{sampleLoading ? 'Loading sample rows...' : `${dbSampleRows.length} live sample records`}</span>
                {(columnsLoading || sampleLoading) && <Loader2 size={13} className="animate-spin text-blue-600" />}
              </div>

              <div className="flex items-center gap-2">
                {/* Dynamic Merge Columns Button: Active when >= 2 columns selected */}
                <button
                  type="button"
                  onClick={() => handleOpenMergeModal()}
                  disabled={selectedTableCols.length < 2}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ${
                    selectedTableCols.length >= 2
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-700 shadow-sm ring-2 ring-indigo-200'
                      : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                  }`}
                  title={
                    selectedTableCols.length >= 2
                      ? `Merge ${selectedTableCols.length} selected columns (${selectedTableCols.join(', ')})`
                      : 'Select 2 or more columns to enable Merge Columns'
                  }
                  id="btn-merge-table-columns"
                >
                  <Combine size={13} className={selectedTableCols.length >= 2 ? 'text-white' : 'text-slate-400'} />
                  <span>
                    {selectedTableCols.length >= 2
                      ? `Merge Columns (${selectedTableCols.length})`
                      : 'Merge Columns'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleAutoMapColumns}
                  disabled={columnsLoading || introspectedColumns.length === 0}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-800 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                  title="Automatically match physical columns with dictionary fields"
                >
                  <Sparkles size={13} className="text-amber-600" />
                  <span>Auto-Map Columns</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveTableMapping}
                  disabled={!selectedTableName}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                  id="btn-save-env-table-mapping"
                >
                  <Save size={13} />
                  <span>Save Table Mapping</span>
                </button>
              </div>
            </div>

            {columnsError && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                <AlertCircle size={14} className="text-amber-600 flex-shrink-0" />
                <span>{columnsError}</span>
              </div>
            )}

            {/* Interactive Data Table Grid (File Ingestion Style) */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs bg-white">
              <div className="overflow-x-auto max-h-[560px] no-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {/* Fixed Row Number Column Header with Master Checkbox */}
                      <th className="p-3 w-12 text-center font-mono text-[10px] uppercase font-bold text-slate-400 border-r border-slate-200 bg-slate-100/60 sticky left-0 z-20">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <span>#</span>
                          {introspectedColumns.length > 0 && (
                            <input
                              type="checkbox"
                              checked={selectedTableCols.length === introspectedColumns.length && introspectedColumns.length > 0}
                              ref={el => {
                                if (el) {
                                  el.indeterminate = selectedTableCols.length > 0 && selectedTableCols.length < introspectedColumns.length;
                                }
                              }}
                              onChange={handleToggleSelectAllTableCols}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              title={
                                selectedTableCols.length === introspectedColumns.length
                                  ? 'Deselect all columns'
                                  : 'Select all columns'
                              }
                            />
                          )}
                        </div>
                      </th>

                      {introspectedColumns.length === 0 ? (
                        <th className="p-4 text-center text-slate-400 font-normal">
                          {columnsLoading ? 'Loading physical table columns...' : 'No physical columns detected.'}
                        </th>
                      ) : (
                        introspectedColumns.map(pCol => {
                          const currentMappedKey = tableColumnMappings[pCol.name] || '';
                          const isMapped = !!currentMappedKey;
                          const noteText = tableColumnNotes[pCol.name];
                          const isColSelected = selectedTableCols.includes(pCol.name);

                          return (
                            <th
                              key={pCol.name}
                              className={`p-3 border-r border-slate-200 last:border-r-0 min-w-[220px] max-w-[300px] align-top transition-colors ${
                                isColSelected
                                  ? 'bg-indigo-50/70 ring-1 ring-inset ring-indigo-300'
                                  : isMapped
                                  ? 'bg-blue-50/40'
                                  : 'bg-slate-50'
                              }`}
                            >
                              <div className="space-y-2">
                                {/* Header Card Top: Checkbox, Name, Type Badge & More Options (...) */}
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1.5 min-w-0" title={pCol.name}>
                                    <input
                                      type="checkbox"
                                      checked={isColSelected}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        handleToggleTableColSelect(pCol.name);
                                      }}
                                      className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                                      title={`Select column ${pCol.name} for merge or actions`}
                                    />
                                    {pCol.isPrimary && (
                                      <Key size={12} className="text-amber-500 shrink-0" title="Primary Key" />
                                    )}
                                    <span className={`font-mono font-bold text-xs truncate ${isColSelected ? 'text-indigo-900' : 'text-slate-900'}`}>
                                      {pCol.name}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-700 font-semibold uppercase">
                                      {pCol.type}
                                    </span>

                                    {/* More Actions (...) Button */}
                                    <div className="relative">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenColMenu(openColMenu === pCol.name ? null : pCol.name);
                                        }}
                                        className="p-1 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded transition cursor-pointer"
                                        title="Column Transformation & Dictionary Actions"
                                      >
                                        <MoreHorizontal size={14} />
                                      </button>

                                      {/* Dropdown Context Menu */}
                                      {openColMenu === pCol.name && (
                                        <div
                                          className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-left animate-in fade-in zoom-in-95"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <div className="px-3 py-1 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
                                            Column: {pCol.name}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenColMenu(null);
                                              handleOpenSplitModal(pCol.name);
                                            }}
                                            className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition cursor-pointer"
                                          >
                                            <Scissors size={13} className="text-blue-600" />
                                            <span>Split Column...</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenColMenu(null);
                                              handleOpenMergeModal(pCol.name);
                                            }}
                                            className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 transition cursor-pointer"
                                          >
                                            <Combine size={13} className="text-indigo-600" />
                                            <span>Merge with Column...</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenColMenu(null);
                                              handleOpenAddToGlobalModal(pCol);
                                            }}
                                            className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2 transition cursor-pointer"
                                          >
                                            <PlusCircle size={13} className="text-emerald-600" />
                                            <span>Add to Global Field...</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenColMenu(null);
                                              handleOpenLinkDictModal(pCol.name);
                                            }}
                                            className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-amber-50 hover:text-amber-700 flex items-center gap-2 transition cursor-pointer"
                                          >
                                            <BookOpen size={13} className="text-amber-600" />
                                            <span>Value Translation Dict...</span>
                                          </button>
                                          <div className="my-1 border-t border-slate-100" />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setOpenColMenu(null);
                                              setTableColumnMappings(prev => {
                                                const next = { ...prev };
                                                delete next[pCol.name];
                                                return next;
                                              });
                                            }}
                                            className="w-full px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition cursor-pointer"
                                          >
                                            <X size={13} />
                                            <span>Unmap Column</span>
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Global Dictionary Mapping Dropdown */}
                                <div>
                                  <label className="text-[10px] text-slate-400 font-mono block mb-0.5">
                                    Global Schema Field:
                                  </label>
                                  <select
                                    value={currentMappedKey}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setTableColumnMappings(prev => ({
                                        ...prev,
                                        [pCol.name]: val
                                      }));
                                    }}
                                    className={`w-full px-2 py-1 text-[11px] rounded-lg border font-medium transition focus:outline-none ${
                                      isMapped
                                        ? 'border-blue-400 bg-blue-50/70 text-blue-900 font-semibold'
                                        : 'border-slate-200 text-slate-400 bg-white hover:border-slate-300'
                                    }`}
                                  >
                                    <option value="">— Unmapped (Ignore) —</option>
                                    <optgroup label="Global Data Dictionary Fields">
                                      {fields.map(f => (
                                        <option key={f.key} value={f.key}>
                                          {f.label} ({f.key}) [{f.dataType}]
                                        </option>
                                      ))}
                                    </optgroup>
                                  </select>
                                </div>

                                {noteText && (
                                  <div className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-mono truncate" title={noteText}>
                                    {noteText}
                                  </div>
                                )}
                              </div>
                            </th>
                          );
                        })
                      )}
                    </tr>
                  </thead>

                  {/* Table Body: Live Sample Records from Selected DB Table */}
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                    {sampleLoading ? (
                      <tr>
                        <td colSpan={introspectedColumns.length + 1} className="py-12 text-center text-slate-400">
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 size={16} className="animate-spin text-blue-600" />
                            <span>Querying live sample records from {selectedTableName}...</span>
                          </div>
                        </td>
                      </tr>
                    ) : dbSampleRows.length === 0 ? (
                      <tr>
                        <td colSpan={introspectedColumns.length + 1} className="py-12 text-center text-slate-400">
                          <span>No live records detected in {selectedTableName} (table is empty or connection standby).</span>
                        </td>
                      </tr>
                    ) : (
                      dbSampleRows.map((row, rowIdx) => (
                        <tr key={rowIdx} className="hover:bg-blue-50/30 transition-colors">
                          <td className="py-1.5 px-3 text-center bg-slate-50/80 border-r border-slate-200 text-slate-400 font-mono text-[10px] sticky left-0 z-10">
                            {rowIdx + 1}
                          </td>
                          {introspectedColumns.map(pCol => {
                            const val = row[pCol.name];
                            const isNull = val === null || val === undefined;
                            const isBlank = isNull || String(val).trim() === '';
                            return (
                              <td
                                key={pCol.name}
                                className="py-1.5 px-2.5 border-r border-slate-100 truncate max-w-[240px]"
                                title={String(val ?? '')}
                              >
                                {!isBlank ? (
                                  <span>{String(val)}</span>
                                ) : (
                                  <span className="text-slate-300 italic">{isNull ? 'null' : '-'}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Footer info */}
              <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-[11px] text-slate-500 font-mono gap-2">
                <span>
                  Showing {dbSampleRows.length} live sample records from table <strong className="text-slate-700">{selectedTableName}</strong>
                </span>
                <span>
                  {introspectedColumns.length} physical columns • {Object.values(tableColumnMappings).filter(Boolean).length} mapped to Global Dictionary
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SPLIT TABLE COLUMN                                                 */}
      {/* ========================================================================= */}
      {showSplitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-xl w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Scissors size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Split Column: <span className="font-mono text-blue-700">{splitCol}</span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Split this database column into multiple parts by delimiter
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
                  Choose Delimiter
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
                      onClick={() => setSplitDelimType(d.id)}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer text-center ${
                        splitDelimType === d.id
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                {splitDelimType === 'CUSTOM' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={splitCustomDelim}
                      onChange={e => setSplitCustomDelim(e.target.value)}
                      placeholder="Enter custom delimiter..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Part Column Names */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Part 1 Column Name
                  </label>
                  <input
                    type="text"
                    value={splitPart1Name}
                    onChange={e => setSplitPart1Name(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Part 2 Column Name
                  </label>
                  <input
                    type="text"
                    value={splitPart2Name}
                    onChange={e => setSplitPart2Name(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono font-semibold"
                  />
                </div>
              </div>

              {/* Keep Original Column Checkbox */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="split-keep-orig-tb"
                  checked={splitKeepOriginal}
                  onChange={e => setSplitKeepOriginal(e.target.checked)}
                  className="rounded text-blue-600 cursor-pointer"
                />
                <label htmlFor="split-keep-orig-tb" className="text-xs text-slate-700 cursor-pointer">
                  Keep original column (<strong>{splitCol}</strong>) in table
                </label>
              </div>

              {/* Live Preview from dbSampleRows */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase font-mono">
                  Live Preview on DB Samples (First 4 rows):
                </span>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/70 text-[11px] font-mono">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-1 px-2 border-r border-slate-200">Original ({splitCol})</th>
                        <th className="py-1 px-2 border-r border-slate-200 text-blue-700">{splitPart1Name || 'Part 1'}</th>
                        <th className="py-1 px-2 text-blue-700">{splitPart2Name || 'Part 2'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dbSampleRows.slice(0, 4).map((r, rIdx) => {
                        const originalVal = String(r[splitCol] ?? '');
                        const delim = splitDelimType === 'COMMA' ? ','
                          : splitDelimType === 'HYPHEN' ? '-'
                          : splitDelimType === 'SLASH' ? '/'
                          : splitDelimType === 'UNDERSCORE' ? '_'
                          : splitDelimType === 'PIPE' ? '|'
                          : splitDelimType === 'SEMICOLON' ? ';'
                          : splitDelimType === 'CUSTOM' ? (splitCustomDelim || ' ')
                          : ' ';
                        const parts = originalVal.split(delim);
                        return (
                          <tr key={rIdx}>
                            <td className="py-1 px-2 border-r border-slate-200 text-slate-500 truncate max-w-[160px]">
                              {originalVal || '-'}
                            </td>
                            <td className="py-1 px-2 border-r border-slate-200 text-blue-900 font-semibold truncate max-w-[160px]">
                              {parts[0] || '-'}
                            </td>
                            <td className="py-1 px-2 text-blue-900 font-semibold truncate max-w-[160px]">
                              {parts.slice(1).join(delim) || '-'}
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
                  onClick={() => setShowSplitModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplySplit}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center space-x-1.5"
                >
                  <Scissors size={13} />
                  <span>Apply Split</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: MERGE TABLE COLUMNS                                                */}
      {/* ========================================================================= */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-xl w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Combine size={18} />
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
                    {introspectedColumns.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
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
                    {introspectedColumns.filter(c => c.name !== mergeCol1).map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
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
                      onClick={() => setMergeSepType(s.id)}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition cursor-pointer text-center ${
                        mergeSepType === s.id
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {mergeSepType === 'CUSTOM' && (
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

              {/* Merged Column Name */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Merged Column Name
                </label>
                <input
                  type="text"
                  value={mergeTargetName}
                  onChange={e => setMergeTargetName(e.target.value)}
                  placeholder="e.g. FULL_NAME or ACCOUNT_COMPOSITE"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono font-semibold"
                />
              </div>

              {/* Keep Source Columns Checkbox */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="merge-keep-sources-tb"
                  checked={mergeKeepSource}
                  onChange={e => setMergeKeepSource(e.target.checked)}
                  className="rounded text-indigo-600 cursor-pointer"
                />
                <label htmlFor="merge-keep-sources-tb" className="text-xs text-slate-700 cursor-pointer">
                  Keep original source columns (<strong>{mergeCol1}</strong> and <strong>{mergeCol2}</strong>) in table
                </label>
              </div>

              {/* Live Preview from dbSampleRows */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase font-mono">
                  Live Preview on DB Samples (First 4 rows):
                </span>
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/70 text-[11px] font-mono">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-1 px-2 border-r border-slate-200">{mergeCol1}</th>
                        <th className="py-1 px-2 border-r border-slate-200">{mergeCol2}</th>
                        <th className="py-1 px-2 text-indigo-700 font-bold">{mergeTargetName || 'Merged'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dbSampleRows.slice(0, 4).map((r, rIdx) => {
                        const v1 = r[mergeCol1] !== undefined && r[mergeCol1] !== null ? String(r[mergeCol1]) : '';
                        const v2 = r[mergeCol2] !== undefined && r[mergeCol2] !== null ? String(r[mergeCol2]) : '';
                        const sep = mergeSepType === 'HYPHEN' ? '-'
                          : mergeSepType === 'UNDERSCORE' ? '_'
                          : mergeSepType === 'SLASH' ? '/'
                          : mergeSepType === 'COMMA' ? ', '
                          : mergeSepType === 'NONE' ? ''
                          : mergeSepType === 'CUSTOM' ? mergeCustomSep
                          : ' ';
                        return (
                          <tr key={rIdx}>
                            <td className="py-1 px-2 border-r border-slate-200 text-slate-500 truncate max-w-[140px]">
                              {v1 || '-'}
                            </td>
                            <td className="py-1 px-2 border-r border-slate-200 text-slate-500 truncate max-w-[140px]">
                              {v2 || '-'}
                            </td>
                            <td className="py-1 px-2 text-indigo-900 font-semibold truncate max-w-[180px]">
                              {`${v1}${sep}${v2}` || '-'}
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
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyMerge}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center space-x-1.5"
                >
                  <Combine size={13} />
                  <span>Apply Merge</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD COLUMN TO GLOBAL FIELD (1-Click Inline Registration)           */}
      {/* ========================================================================= */}
      {showAddToGlobalModal && selectedColForGlobal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <PlusCircle size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Add Column to Global Dictionary
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Register physical column <span className="font-mono font-bold text-slate-800">{selectedColForGlobal.name}</span> directly into the Global Standard Schema
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddToGlobalModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {addToGlobalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0 text-rose-600" />
                <span>{addToGlobalError}</span>
              </div>
            )}

            <form onSubmit={handleApplyAddToGlobal} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                    Canonical Key *
                  </label>
                  <input
                    type="text"
                    value={newGlobalKey}
                    onChange={e => setNewGlobalKey(e.target.value)}
                    placeholder="e.g. transaction_ref"
                    required
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                    Display Label *
                  </label>
                  <input
                    type="text"
                    value={newGlobalLabel}
                    onChange={e => setNewGlobalLabel(e.target.value)}
                    placeholder="e.g. Transaction Reference"
                    required
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                    Data Type
                  </label>
                  <select
                    value={newGlobalDataType}
                    onChange={e => setNewGlobalDataType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
                  >
                    <option value="string">string (Text/Code)</option>
                    <option value="number">number (Amount/Integer)</option>
                    <option value="date">date (Timestamp/ISO)</option>
                    <option value="boolean">boolean (True/False)</option>
                    <option value="json">json (Object/Array)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={newGlobalCategory}
                    onChange={e => setNewGlobalCategory(e.target.value)}
                    placeholder="e.g. Banking, Settlement, Card"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                  Description
                </label>
                <textarea
                  value={newGlobalDesc}
                  onChange={e => setNewGlobalDesc(e.target.value)}
                  placeholder="Explain the operational role of this field..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chk-add-req-global"
                  checked={newGlobalRequired}
                  onChange={e => setNewGlobalRequired(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <label htmlFor="chk-add-req-global" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Mark as Required Column
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddToGlobalModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  <PlusCircle size={14} />
                  <span>Register & Auto-Map</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: LINK VALUE TRANSLATION DICTIONARY                                  */}
      {/* ========================================================================= */}
      {showLinkDictModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <BookOpen size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Map to Value Translation Dictionary
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Assign a pre-configured lookup table to column <span className="font-mono font-bold text-slate-800">{linkDictCol}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkDictModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1.5">
                  Select Pre-Configured Dictionary
                </label>
                <select
                  value={selectedDictId}
                  onChange={e => setSelectedDictId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-none font-semibold text-slate-800"
                >
                  {valueDicts.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.category}) — {d.mappings.length} mapping pairs
                    </option>
                  ))}
                </select>
              </div>

              {/* Dictionary Details Preview */}
              {(() => {
                const dict = valueDicts.find(d => d.id === selectedDictId);
                if (!dict) return null;
                return (
                  <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-xs space-y-2">
                    <div className="text-[11px] text-slate-600 font-medium">
                      {dict.description}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 font-bold uppercase">
                      Sample Mappings ({Math.min(dict.mappings.length, 3)} of {dict.mappings.length}):
                    </div>
                    <div className="space-y-1">
                      {dict.mappings.slice(0, 3).map((m, idx) => (
                        <div key={idx} className="flex items-center justify-between text-[11px] font-mono bg-white/80 p-1 rounded border border-amber-100">
                          <span className="text-slate-700 truncate">{m.sourceValue}</span>
                          <span className="text-amber-700 font-bold">➔ {m.targetValue}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLinkDictModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyLinkDict}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  <BookOpen size={14} />
                  <span>Assign Dictionary</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: FTP FILE STAGING & PARSING                                         */}
      {/* ========================================================================= */}
      {activeTab === 'staging' && (
        <Suspense fallback={
          <div className="w-full h-80 flex flex-col items-center justify-center gap-3 p-8 bg-white rounded-xl border border-slate-200">
            <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold text-slate-500">Loading FTP & File Staging Studio...</span>
          </div>
        }>
          <FtpFileStagingSettings
            databases={databases}
            preSelectedDbId={selectedFtpDbId}
            onNavigateToConnections={() => setActiveTab('connections')}
            onNavigateToValidationBoxes={onNavigateToWorkspace}
          />
        </Suspense>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: DATA TRANSFORMATION DICTIONARY & EXPRESSION ENGINE                */}
      {/* ========================================================================= */}
      {activeTab === 'transformations' && (
        <div className="space-y-6 animate-fade-in">
          {/* Subtab Navigation */}
          <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl w-fit">
            <button
              type="button"
              onClick={() => setTransformSubTab('value_dicts')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                transformSubTab === 'value_dicts'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen size={13} className="text-emerald-600" />
              <span>Value Translation Dictionaries</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                {valueDicts.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setTransformSubTab('rules')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                transformSubTab === 'rules'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wand2 size={13} className="text-blue-600" />
              <span>String & Format Rules</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-bold">
                {transformRules.length}
              </span>
            </button>
          </div>

          {/* ========================================================================= */}
          {/* SUBTAB 1: VALUE TRANSLATION DICTIONARIES (BANK CODES, CHANNELS, ISO)      */}
          {/* ========================================================================= */}
          {transformSubTab === 'value_dicts' && (
            <div className="space-y-6 animate-fade-in">
              {/* Header Card */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                    <BookOpen size={18} className="text-emerald-600" />
                    <span>Value Translation Dictionaries (Pre-configured Value Mappings)</span>
                  </h2>
                  <p className="text-xs text-slate-500 max-w-2xl">
                    Pre-configured value lookup tables used during Task Creation file upload and Hashtag file templates to translate human-readable descriptions into exact database codes before ingestion (e.g. Bank Name &rarr; Bank Code, Channel &rarr; Channel Code, ISO Decline Codes).
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleOpenAddValueDict}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Add Value Dictionary</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Reset all value translation dictionaries to system defaults?')) {
                        persistValueDicts(DEFAULT_VALUE_TRANSLATION_DICTIONARIES);
                      }
                    }}
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition cursor-pointer"
                    title="Reset to system default dictionaries"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>

              {/* Interactive Value Translation Sandbox */}
              <div className="bg-gradient-to-r from-emerald-50/70 to-teal-50/70 border border-emerald-200/80 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-emerald-200/50">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-2 font-mono">
                      <Play size={14} className="text-emerald-600" />
                      Interactive Value Translation Sandbox
                    </h3>
                    <p className="text-[11px] text-emerald-700">
                      Test translating human-readable text into database target codes before using in task intake or hashtag presets
                    </p>
                  </div>

                  {/* Sample Quick Loaders */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-emerald-800 font-bold uppercase font-mono">Quick Test:</span>
                    {[
                      { label: 'Commercial Bank of Ethiopia', dictId: 'dict-bank-codes' },
                      { label: 'Awash Bank', dictId: 'dict-bank-codes' },
                      { label: 'ATM', dictId: 'dict-channel-codes' },
                      { label: 'SUCCESS', dictId: 'dict-status-iso' },
                      { label: 'ETB', dictId: 'dict-currency-codes' }
                    ].map(ex => (
                      <button
                        key={ex.label}
                        type="button"
                        onClick={() => {
                          setTestValueInput(ex.label);
                          setTestValueDictId(ex.dictId);
                        }}
                        className="px-2 py-0.5 rounded-md bg-white/80 hover:bg-white text-emerald-800 border border-emerald-300 text-[10px] font-mono font-semibold transition cursor-pointer"
                      >
                        {ex.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  {/* Input */}
                  <div className="md:col-span-4 space-y-1">
                    <label className="text-[10px] font-bold uppercase font-mono text-slate-700">
                      Sample Inbound Text
                    </label>
                    <input
                      type="text"
                      value={testValueInput}
                      onChange={e => setTestValueInput(e.target.value)}
                      placeholder="e.g. Commercial Bank of Ethiopia"
                      className="w-full bg-white border border-emerald-300 rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Dict Selector */}
                  <div className="md:col-span-4 space-y-1">
                    <label className="text-[10px] font-bold uppercase font-mono text-slate-700">
                      Select Value Dictionary
                    </label>
                    <select
                      value={testValueDictId}
                      onChange={e => setTestValueDictId(e.target.value)}
                      className="w-full bg-white border border-emerald-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                    >
                      {valueDicts.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.mappings.length} pairs)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Output Result */}
                  <div className="md:col-span-4 space-y-1">
                    <label className="text-[10px] font-bold uppercase font-mono text-emerald-800">
                      Translated Database Target Code
                    </label>
                    <div className="bg-white border-2 border-emerald-400 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-800 truncate shadow-2xs">
                      {(() => {
                        const dict = valueDicts.find(d => d.id === testValueDictId);
                        if (!dict) return <span className="text-slate-400 font-normal italic">No dictionary selected</span>;
                        const match = dict.mappings.find(m => m.sourceValue.trim().toLowerCase() === testValueInput.trim().toLowerCase());
                        if (match) {
                          return (
                            <span className="flex items-center gap-1.5">
                              <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                              <span className="text-blue-700">{match.targetValue}</span>
                              {match.notes && <span className="text-slate-400 font-normal text-[10px]">({match.notes})</span>}
                            </span>
                          );
                        }
                        return <span className="text-amber-700 italic">No match in "{dict.name}"</span>;
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Dictionaries Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {valueDicts.map(dict => (
                  <div
                    key={dict.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <BookOpen size={14} />
                          </span>
                          <h3 className="font-bold text-slate-900 text-sm">{dict.name}</h3>
                        </div>

                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {dict.category}
                        </span>
                      </div>

                      {dict.description && (
                        <p className="text-xs text-slate-500">{dict.description}</p>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-600 font-medium pt-1">
                        <span>Configured Mapping Pairs:</span>
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold font-mono text-[10px]">
                          {dict.mappings.length} pairs
                        </span>
                      </div>

                      {/* Mapping Pairs Table Preview */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 font-mono text-[10px] text-slate-500 uppercase font-bold sticky top-0">
                            <tr>
                              <th className="py-1.5 px-3">Incoming File Value</th>
                              <th className="py-1.5 px-3">Database Target Code</th>
                              <th className="py-1.5 px-3">Notes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                            {dict.mappings.map((m, mIdx) => (
                              <tr key={mIdx} className="hover:bg-slate-50/50">
                                <td className="py-1.5 px-3 font-medium text-slate-800">{m.sourceValue}</td>
                                <td className="py-1.5 px-3 font-bold text-blue-700">{m.targetValue}</td>
                                <td className="py-1.5 px-3 text-slate-400 text-[10px]">{m.notes || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setTestValueDictId(dict.id);
                          if (dict.mappings.length > 0) {
                            setTestValueInput(dict.mappings[0].sourceValue);
                          }
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center gap-1 cursor-pointer transition"
                      >
                        <Play size={11} />
                        <span>Test in Sandbox</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditValueDict(dict)}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 flex items-center gap-1 cursor-pointer transition"
                        >
                          <Edit3 size={11} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteValueDict(dict.id, dict.name)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition"
                          title="Delete dictionary"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SUBTAB 2: STRING & EXPRESSION RULES (PHONE, SPLIT, MERGE, TRIM, MASK)    */}
          {/* ========================================================================= */}
          {transformSubTab === 'rules' && (
            <div className="space-y-6 animate-fade-in">
              {/* Header Card */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                    <Wand2 size={18} className="text-[#155DFC]" />
                    <span>System Data Transformation Dictionary & Expression Engine</span>
                  </h2>
                  <p className="text-xs text-slate-500 max-w-2xl">
                    Define and manage reusable data transformations for incoming files and workflow pipelines: column splitting, concatenating/merging, Ethiopian mobile number standardization, ISO date formatting, regex pattern extractions, and value mappings.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRuleId(null);
                      setRuleName('');
                      setRuleDesc('');
                      setRuleCat('Sanitization');
                      setRuleType('CASE');
                      setRuleDelim(' ');
                      setRuleSep('-');
                      setRulePattern('');
                      setRuleReplacement('');
                      setShowRuleModal(true);
                    }}
                    className="px-4 py-2 bg-[#155DFC] hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Add Transformation Rule</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Reset all transformation rules to system defaults?')) {
                        persistRules(DEFAULT_TRANSFORMATION_RULES);
                      }
                    }}
                    className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl border border-slate-200 transition cursor-pointer"
                    title="Reset to system default rules"
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
              </div>

              {/* Interactive Live Testing Sandbox */}
              <div className="bg-gradient-to-r from-blue-50/70 to-indigo-50/70 border border-blue-200/80 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-blue-200/50">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-2 font-mono">
                      <Play size={14} className="text-blue-600" />
                      Interactive Transformation Sandbox
                    </h3>
                    <p className="text-[11px] text-blue-700">
                      Test rules on live sample data to verify expression results before deploying
                    </p>
                  </div>

                  {/* Sample Quick Loaders */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-blue-800 font-bold uppercase font-mono">Quick Test:</span>
                    {[
                      { label: '0911234567', ruleId: 'rule-phone-et' },
                      { label: 'John Doe', ruleId: 'rule-name-split' },
                      { label: '23/11/2026', ruleId: 'rule-iso-date-normalize' },
                      { label: '4111222233334444', ruleId: 'rule-card-pan-mask' },
                      { label: '$12,450.00', ruleId: 'rule-currency-cleaner' }
                    ].map(ex => (
                      <button
                        key={ex.label}
                        type="button"
                        onClick={() => {
                          setTestInputString(ex.label);
                          setTestSelectedRuleId(ex.ruleId);
                          runSandboxTest(ex.label, ex.ruleId);
                        }}
                        className="px-2 py-0.5 rounded-md bg-white/80 hover:bg-white text-blue-800 border border-blue-300 text-[10px] font-mono font-semibold transition cursor-pointer"
                      >
                        {ex.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  {/* Input */}
                  <div className="md:col-span-4 space-y-1">
                    <label className="text-[10px] font-bold uppercase font-mono text-slate-700">
                      Sample Input String
                    </label>
                    <input
                      type="text"
                      value={testInputString}
                      onChange={e => {
                        setTestInputString(e.target.value);
                        runSandboxTest(e.target.value, testSelectedRuleId);
                      }}
                      placeholder="Enter sample input..."
                      className="w-full bg-white border border-blue-300 rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Rule Selector */}
                  <div className="md:col-span-4 space-y-1">
                    <label className="text-[10px] font-bold uppercase font-mono text-slate-700">
                      Apply Transformation Rule
                    </label>
                    <select
                      value={testSelectedRuleId}
                      onChange={e => {
                        const rId = e.target.value;
                        setTestSelectedRuleId(rId);
                        runSandboxTest(testInputString, rId);
                      }}
                      className="w-full bg-white border border-blue-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      {transformRules.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.category})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Output Result */}
                  <div className="md:col-span-4 space-y-1">
                    <label className="text-[10px] font-bold uppercase font-mono text-emerald-800">
                      Evaluated Result
                    </label>
                    <div className="bg-white border-2 border-emerald-400 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-800 truncate shadow-2xs">
                      {testOutputResult || <span className="text-slate-400 font-normal italic">None</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Rules Search & Category Filters */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200">
                <div className="flex items-center gap-2 flex-1 max-w-md">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={transformSearch}
                      onChange={e => setTransformSearch(e.target.value)}
                      placeholder="Search transformation rules by name or description..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {['ALL', 'Splitting', 'Merging', 'Sanitization', 'Date', 'Masking', 'Lookup'].map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setTransformCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                        transformCategory === cat
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rules Table / Grid */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-[10px] text-slate-500 tracking-wider font-mono">
                    <tr>
                      <th className="py-3 px-4">Rule Name & Details</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Operation Type</th>
                      <th className="py-3 px-4">Expression Parameters</th>
                      <th className="py-3 px-4">Scope</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {transformRules
                      .filter(r => {
                        const matchesSearch =
                          r.name.toLowerCase().includes(transformSearch.toLowerCase()) ||
                          r.description.toLowerCase().includes(transformSearch.toLowerCase());
                        const matchesCat = transformCategory === 'ALL' || r.category === transformCategory;
                        return matchesSearch && matchesCat;
                      })
                      .map(rule => (
                        <tr key={rule.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 text-xs">{rule.name}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5 max-w-md">{rule.description}</div>
                          </td>

                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {rule.category}
                            </span>
                          </td>

                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-blue-50 text-blue-700 border border-blue-200">
                              {rule.type}
                            </span>
                          </td>

                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                            {rule.delimiter && (
                              <span>Delimiter: <strong>"{rule.delimiter}"</strong></span>
                            )}
                            {rule.separator && (
                              <span>Separator: <strong>"{rule.separator}"</strong></span>
                            )}
                            {rule.pattern && (
                              <span>Regex: <code>{rule.pattern}</code></span>
                            )}
                            {rule.targetFormat && (
                              <span>Format: <strong>{rule.targetFormat}</strong></span>
                            )}
                            {!rule.delimiter && !rule.separator && !rule.pattern && !rule.targetFormat && (
                              <span className="text-slate-400 italic">Standard</span>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            {rule.isSystem ? (
                              <span className="text-[10px] bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                                System Builtin
                              </span>
                            ) : (
                              <span className="text-[10px] bg-purple-50 text-purple-800 font-bold px-2 py-0.5 rounded-full border border-purple-200">
                                Custom Rule
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setTestSelectedRuleId(rule.id);
                                  runSandboxTest(testInputString, rule.id);
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                                title="Test this rule in the sandbox"
                              >
                                <Play size={11} />
                                <span>Test</span>
                              </button>

                              {!rule.isSystem && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`Delete rule "${rule.name}"?`)) {
                                      persistRules(transformRules.filter(r => r.id !== rule.id), undefined, rule.id);
                                    }
                                  }}
                                  className="p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                                  title="Delete custom rule"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT DATA TRANSFORMATION RULE                                 */}
      {/* ========================================================================= */}
      {showRuleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Wand2 size={16} className="text-blue-600" />
                <span>Add Data Transformation Rule</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowRuleModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                  Rule Name *
                </label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={e => setRuleName(e.target.value)}
                  placeholder="e.g. Normalize Tax ID or Split Full Name"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                  Description
                </label>
                <textarea
                  value={ruleDesc}
                  onChange={e => setRuleDesc(e.target.value)}
                  placeholder="Describe what this transformation does..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                    Category
                  </label>
                  <select
                    value={ruleCat}
                    onChange={e => setRuleCat(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="Sanitization">Sanitization</option>
                    <option value="Splitting">Splitting</option>
                    <option value="Merging">Merging</option>
                    <option value="Date">Date</option>
                    <option value="Masking">Masking</option>
                    <option value="Lookup">Lookup</option>
                    <option value="Regex">Regex</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                    Operation Type
                  </label>
                  <select
                    value={ruleType}
                    onChange={e => setRuleType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                  >
                    <option value="CASE">CASE (Upper/Lower)</option>
                    <option value="SPLIT">SPLIT (Delimiter)</option>
                    <option value="MERGE">MERGE (Separator)</option>
                    <option value="TRIM">TRIM (Spaces)</option>
                    <option value="DATE_FORMAT">DATE_FORMAT (ISO)</option>
                    <option value="STRIP_CURRENCY">STRIP_CURRENCY</option>
                    <option value="MASK">MASK (Card/ID)</option>
                    <option value="PHONE_ET">PHONE_ET (+251)</option>
                    <option value="VALUE_REPLACE">VALUE_REPLACE</option>
                    <option value="REGEX_EXTRACT">REGEX_EXTRACT</option>
                  </select>
                </div>
              </div>

              {ruleType === 'SPLIT' && (
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                    Split Delimiter (e.g. space, comma, dash)
                  </label>
                  <input
                    type="text"
                    value={ruleDelim}
                    onChange={e => setRuleDelim(e.target.value)}
                    placeholder="e.g. ' ' or ','"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              )}

              {ruleType === 'MERGE' && (
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                    Separator (e.g. '-' or ' ')
                  </label>
                  <input
                    type="text"
                    value={ruleSep}
                    onChange={e => setRuleSep(e.target.value)}
                    placeholder="e.g. '-'"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              )}

              {ruleType === 'REGEX_EXTRACT' && (
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                    Regular Expression Pattern
                  </label>
                  <input
                    type="text"
                    value={rulePattern}
                    onChange={e => setRulePattern(e.target.value)}
                    placeholder="e.g. ^(\d{6})"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              )}

              {ruleType === 'VALUE_REPLACE' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                      Find
                    </label>
                    <input
                      type="text"
                      value={rulePattern}
                      onChange={e => setRulePattern(e.target.value)}
                      placeholder="e.g. USD"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                      Replace With
                    </label>
                    <input
                      type="text"
                      value={ruleReplacement}
                      onChange={e => setRuleReplacement(e.target.value)}
                      placeholder="e.g. ETB"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRuleModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!ruleName.trim()) {
                      alert('Please enter a rule name.');
                      return;
                    }
                    const newRule: SystemTransformationRule = {
                      id: `rule-custom-${Date.now()}`,
                      name: ruleName.trim(),
                      description: ruleDesc.trim() || 'Custom user transformation rule',
                      category: ruleCat,
                      type: ruleType,
                      delimiter: ruleDelim,
                      separator: ruleSep,
                      pattern: rulePattern,
                      replacement: ruleReplacement,
                      isSystem: false
                    };
                    persistRules([...transformRules, newRule], newRule);
                    setShowRuleModal(false);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  Save Rule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT VALUE TRANSLATION DICTIONARY                            */}
      {/* ========================================================================= */}
      {showValueDictModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BookOpen size={16} className="text-emerald-600" />
                <span>{editingDictId ? 'Edit Value Translation Dictionary' : 'Create Value Translation Dictionary'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowValueDictModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                    Dictionary Name *
                  </label>
                  <input
                    type="text"
                    value={dictModalName}
                    onChange={e => setDictModalName(e.target.value)}
                    placeholder="e.g. Bank Name to Bank Code"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                    Category
                  </label>
                  <select
                    value={dictModalCat}
                    onChange={e => setDictModalCat(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="BANK_CODES">Bank Codes</option>
                    <option value="CHANNEL_CODES">Channel Codes</option>
                    <option value="STATUS_CODES">Status / ISO Codes</option>
                    <option value="CURRENCIES">Currencies</option>
                    <option value="CUSTOM">Custom Lookup</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                  Description
                </label>
                <textarea
                  value={dictModalDesc}
                  onChange={e => setDictModalDesc(e.target.value)}
                  placeholder="Describe when and how this value dictionary should be used..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Mapping Pairs Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono">
                    Value Translation Pairs ({dictModalPairs.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => setDictModalPairs(prev => [...prev, { sourceValue: '', targetValue: '', notes: '' }])}
                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
                  >
                    <Plus size={12} />
                    <span>Add Pair</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-mono text-slate-500 font-bold sticky top-0">
                      <tr>
                        <th className="py-2 px-3">Incoming File Value (Source)</th>
                        <th className="py-2 px-3">Database Target Code</th>
                        <th className="py-2 px-3">Notes (Optional)</th>
                        <th className="py-2 px-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dictModalPairs.map((pair, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={pair.sourceValue}
                              onChange={e => {
                                const val = e.target.value;
                                setDictModalPairs(prev => prev.map((p, i) => i === idx ? { ...p, sourceValue: val } : p));
                              }}
                              placeholder="e.g. CBE or Commercial Bank"
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white font-mono"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={pair.targetValue}
                              onChange={e => {
                                const val = e.target.value;
                                setDictModalPairs(prev => prev.map((p, i) => i === idx ? { ...p, targetValue: val } : p));
                              }}
                              placeholder="e.g. 01"
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white font-mono font-bold text-blue-700"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={pair.notes || ''}
                              onChange={e => {
                                const val = e.target.value;
                                setDictModalPairs(prev => prev.map((p, i) => i === idx ? { ...p, notes: val } : p));
                              }}
                              placeholder="Optional note"
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                            />
                          </td>
                          <td className="p-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => setDictModalPairs(prev => prev.filter((_, i) => i !== idx))}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                              title="Delete pair"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowValueDictModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveValueDict}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Save size={14} />
                  <span>Save Value Dictionary</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT GLOBAL DICTIONARY FIELD                                 */}
      {/* ========================================================================= */}
      {showFieldModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BookOpen size={16} className="text-blue-600" />
                {isEditingField ? `Edit Field: ${originalKey}` : 'Add Global Dictionary Field'}
              </h3>
              <button
                onClick={() => setShowFieldModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            {fieldModalError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle size={14} className="text-rose-600 flex-shrink-0" />
                <span>{fieldModalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveField} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                  Field Key (snake_case identifier) *
                </label>
                <input
                  type="text"
                  value={fieldKey}
                  onChange={(e) => setFieldKey(e.target.value)}
                  placeholder="e.g. sender_account_number"
                  disabled={isEditingField && originalKey === 'transaction_id'}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                  Display Label *
                </label>
                <input
                  type="text"
                  value={fieldLabel}
                  onChange={(e) => setFieldLabel(e.target.value)}
                  placeholder="e.g. Sender Account Number"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                    Data Type
                  </label>
                  <select
                    value={fieldDataType}
                    onChange={(e) => setFieldDataType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="string">String (VARCHAR / TEXT)</option>
                    <option value="number">Number (DECIMAL / INT)</option>
                    <option value="date">Date / Timestamp (ISO)</option>
                    <option value="boolean">Boolean (TRUE / FALSE)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={fieldCategory}
                    onChange={(e) => setFieldCategory(e.target.value)}
                    placeholder="e.g. Financial, Identity, Network"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                  Description
                </label>
                <textarea
                  value={fieldDesc}
                  onChange={(e) => setFieldDesc(e.target.value)}
                  placeholder="Explain the operational meaning and standard format of this column..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                    Example Value
                  </label>
                  <input
                    type="text"
                    value={fieldExample}
                    onChange={(e) => setFieldExample(e.target.value)}
                    placeholder="e.g. 1002934812"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                    Notes / Standard Rule
                  </label>
                  <input
                    type="text"
                    value={fieldNotes}
                    onChange={(e) => setFieldNotes(e.target.value)}
                    placeholder="e.g. Must be 10-digit padded"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="chk-field-req"
                  checked={fieldRequired}
                  onChange={(e) => setFieldRequired(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                />
                <label htmlFor="chk-field-req" className="text-xs font-semibold text-slate-700">
                  Required Column (Mandatory for all valid transactions)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowFieldModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition"
                >
                  {isEditingField ? 'Save Changes' : 'Add to Dictionary'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DELETE FIELD CONFIRMATION                                          */}
      {/* ========================================================================= */}
      {fieldToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
              <Trash2 size={22} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">Delete Column from Dictionary?</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to delete the column <span className="font-mono font-bold text-slate-800">{fieldToDelete.key}</span> ({fieldToDelete.label}) from the Global Dictionary? This will also remove any corresponding table mapping references.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setFieldToDelete(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteField}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
              >
                Delete Column
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: IMPORT COLUMNS FROM DATABASE TABLE                                  */}
      {/* ========================================================================= */}
      {showImportTableModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table className="text-blue-600" size={18} />
                <h3 className="text-sm font-bold text-slate-800">Import Columns from Database Table</h3>
              </div>
              <button
                onClick={() => setShowImportTableModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Select a connected physical database and table to harvest all its live physical columns directly into the Global Standard Directory.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Database</label>
                  <select
                    value={importTableDbId}
                    onChange={(e) => {
                      setImportTableDbId(e.target.value);
                      const tbls = getTablesForDb(e.target.value);
                      setImportTableName(tbls[0] || '');
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {databases.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.type} - {d.databaseName || d.host})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Target Table</label>
                  <select
                    value={importTableName}
                    onChange={(e) => setImportTableName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {getTablesForDb(importTableDbId).map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {importTableError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span>{importTableError}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImportTableModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteImportTable}
                disabled={importingTableLoading || !importTableName}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
              >
                {importingTableLoading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                <span>{importingTableLoading ? 'Harvesting Columns...' : 'Import Table Columns'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CLEAR ALL GLOBAL SCHEMA FIELDS using accessible ConfirmDialog       */}
      {/* ========================================================================= */}
      <ConfirmDialog
        open={showClearAllModal}
        title="Delete All Global Schema Fields?"
        message={
          <span>
            Are you sure you want to delete <strong className="text-ds-danger">all {fields.length} canonical fields</strong> from the Global Standard Directory and Schema? This will clear all columns from the global directory in the database. You can restore factory defaults anytime via &quot;Reset Defaults&quot;.
          </span>
        }
        confirmLabel={`Yes, Delete All (${fields.length})`}
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={handleClearAllFields}
        onCancel={() => setShowClearAllModal(false)}
      />

      {/* Accessible ConfirmDialog for bulk deleting selected fields */}
      <ConfirmDialog
        open={confirmDeleteSelectedOpen}
        title="Delete Selected Fields?"
        message={
          <span>
            Are you sure you want to delete <strong className="text-ds-danger">{selectedFieldKeys.length} selected fields</strong> from the Global Schema and Database?
          </span>
        }
        confirmLabel={`Delete ${selectedFieldKeys.length} Fields`}
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={executeDeleteSelectedFields}
        onCancel={() => setConfirmDeleteSelectedOpen(false)}
      />

      {/* ========================================================================= */}
      {/* MODAL: EXPORT / IMPORT JSON                                               */}
      {/* ========================================================================= */}
      {showJsonModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Code2 size={16} className="text-blue-600" />
                {jsonMode === 'export' ? 'Export Dictionary JSON' : 'Import Dictionary JSON'}
              </h3>
              <button
                onClick={() => setShowJsonModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            {jsonError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {jsonError}
              </div>
            )}

            {jsonMode === 'import' && (
              <div className="flex items-center justify-between p-3 bg-blue-50/60 border border-blue-200/60 rounded-xl">
                <div className="flex items-center gap-2 text-xs text-slate-700">
                  <Upload size={14} className="text-blue-600 flex-shrink-0" />
                  <span>Select a JSON dictionary file from your computer:</span>
                </div>
                <label className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow-xs flex items-center gap-1.5">
                  <Upload size={12} />
                  <span>Choose File (.json)</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const res = event.target?.result;
                          if (typeof res === 'string') {
                            setJsonContent(res);
                          }
                        };
                        reader.readAsText(file);
                      }
                    }}
                  />
                </label>
              </div>
            )}

            <textarea
              value={jsonContent}
              onChange={(e) => setJsonContent(e.target.value)}
              readOnly={jsonMode === 'export'}
              rows={12}
              className="w-full p-3 font-mono text-[11px] border border-slate-300 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={jsonMode === 'import' ? 'Paste array of column JSON objects here or choose a file above...' : ''}
            />

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowJsonModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleExecuteJsonAction}
                disabled={importingJson}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
                id="btn-submit-json-action"
              >
                {importingJson && <Loader2 size={13} className="animate-spin" />}
                <span>{jsonMode === 'export' ? 'Download JSON File' : importingJson ? 'Saving to Database...' : 'Import Columns'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD TABLE MAPPING                                                  */}
      {/* ========================================================================= */}
      {showAddTableModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Table size={16} className="text-blue-600" />
                Add Custom Table to Database
              </h3>
              <button
                onClick={() => setShowAddTableModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-700 uppercase font-mono block mb-1">
                Table Name
              </label>
              <input
                type="text"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="e.g. transactions_archive"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddTableModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomTable}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
              >
                Add Table
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
