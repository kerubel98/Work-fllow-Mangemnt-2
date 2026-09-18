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
  GlobalMappingConfig 
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
  FileSpreadsheet
} from 'lucide-react';
import { showSystemAlert } from '../common/MessageModal';

interface SystemSettingsProps {
  currentUser: User;
  databases?: DatabaseConnection[];
  systems?: EnvironmentSystem[];
  onAddDatabase: (newDb: Omit<DatabaseConnection, 'id'>) => void;
  onToggleDbStatus: (dbId: string) => void;
  onDeleteDb: (dbId: string) => void;
  onUpdateDb?: (dbId: string, updates: Partial<DatabaseConnection>) => void;
  onNavigateToWorkspace?: () => void;
  initialTab?: 'dictionary' | 'connections' | 'environment' | 'staging';
}

export default function SystemSettings({
  currentUser,
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
  const [activeTab, setActiveTab] = useState<'dictionary' | 'connections' | 'environment' | 'staging'>(initialTab);
  const [selectedFtpDbId, setSelectedFtpDbId] = useState<string | undefined>(undefined);

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

  // 4. Environment Settings State (Per-DB Configuration & Table Mappings)
  const [selectedDbId, setSelectedDbId] = useState<string>(() => databases[0]?.id || '');
  const [selectedTableName, setSelectedTableName] = useState<string>('');
  const [envSearch, setEnvSearch] = useState('');
  const [introspectedColumns, setIntrospectedColumns] = useState<{ name: string; type: string; nullable: boolean; isPrimary?: boolean }[]>([]);
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnsError, setColumnsError] = useState<string | null>(null);
  
  // Table Mapping state for the currently chosen DB & Table
  const [tableColumnMappings, setTableColumnMappings] = useState<Record<string, string>>({});
  const [tableColumnNotes, setTableColumnNotes] = useState<Record<string, string>>({});
  const [mappingSaveSuccess, setMappingSaveSuccess] = useState<string | null>(null);
  const [useCustomInput, setUseCustomInput] = useState<Record<string, boolean>>({});

  // Add Table Mapping Modal
  const [showAddTableModal, setShowAddTableModal] = useState(false);
  const [newTableName, setNewTableName] = useState('');

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

  // Introspect physical columns for chosen DB & Table
  useEffect(() => {
    if (!selectedDbId || !selectedTableName) {
      setIntrospectedColumns([]);
      return;
    }

    let isMounted = true;
    setColumnsLoading(true);
    setColumnsError(null);

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

  const handleDeleteSelectedFields = async () => {
    if (selectedFieldKeys.length === 0) return;
    if (!window.confirm(`Delete ${selectedFieldKeys.length} selected fields from the Global Schema and Database?`)) {
      return;
    }
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
          <span>Environment & Table Mappings</span>
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
                {columnsLoading && <Loader2 size={13} className="animate-spin text-blue-600" />}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoMapColumns}
                  disabled={columnsLoading || introspectedColumns.length === 0}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-800 rounded-lg text-xs font-medium flex items-center gap-1.5 transition"
                  title="Automatically match physical columns with dictionary fields"
                >
                  <Sparkles size={13} className="text-amber-600" />
                  <span>Auto-Map Columns</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveTableMapping}
                  disabled={!selectedTableName}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
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

            {/* Mapping Matrix Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider font-mono">
                    <th className="py-2.5 px-4">Physical Column Name</th>
                    <th className="py-2.5 px-4">Physical Type</th>
                    <th className="py-2.5 px-4">Nullable</th>
                    <th className="py-2.5 px-4 text-center">Direction</th>
                    <th className="py-2.5 px-4">Target Global Mapping Field (from Dictionary)</th>
                    <th className="py-2.5 px-4">Notes / Expression</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {introspectedColumns.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        {columnsLoading ? 'Loading physical table columns...' : 'No physical columns found. Ensure the table exists in this database or add custom columns.'}
                      </td>
                    </tr>
                  ) : (
                    introspectedColumns.map(pCol => {
                      const currentMappedKey = tableColumnMappings[pCol.name] || '';
                      const isCustom = useCustomInput[pCol.name];

                      return (
                        <tr key={pCol.name} className="hover:bg-slate-50/70 transition">
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              {pCol.isPrimary && <Key size={12} className="text-amber-500" title="Primary Key" />}
                              <span>{pCol.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500">
                            {pCol.type}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={`text-[10px] font-mono ${pCol.nullable ? 'text-slate-400' : 'text-slate-800 font-bold'}`}>
                              {pCol.nullable ? 'YES' : 'NO'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-center text-slate-400">
                            <ArrowRight size={14} className="mx-auto text-blue-500" />
                          </td>
                          <td className="py-2.5 px-4">
                            {isCustom ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={currentMappedKey}
                                  onChange={(e) => {
                                    setTableColumnMappings(prev => ({ ...prev, [pCol.name]: e.target.value }));
                                  }}
                                  placeholder="custom_field_key"
                                  className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => setUseCustomInput(prev => ({ ...prev, [pCol.name]: false }))}
                                  className="text-[10px] text-blue-600 hover:underline whitespace-nowrap"
                                >
                                  Use Dropdown
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={currentMappedKey}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '__custom__') {
                                      setUseCustomInput(prev => ({ ...prev, [pCol.name]: true }));
                                    } else {
                                      setTableColumnMappings(prev => ({ ...prev, [pCol.name]: val }));
                                    }
                                  }}
                                  className={`w-full px-2.5 py-1.5 text-xs rounded border transition focus:outline-none font-medium ${
                                    currentMappedKey
                                      ? 'border-blue-400 bg-blue-50/50 text-blue-900 font-semibold'
                                      : 'border-slate-200 text-slate-400'
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
                                  <option value="__custom__">+ Custom Field Key...</option>
                                </select>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            <input
                              type="text"
                              value={tableColumnNotes[pCol.name] || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTableColumnNotes(prev => ({ ...prev, [pCol.name]: val }));
                              }}
                              placeholder="Transformation note or format rule..."
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                            />
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
      {/* MODAL: CLEAR ALL GLOBAL SCHEMA FIELDS                                      */}
      {/* ========================================================================= */}
      {showClearAllModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
              <Trash2 size={22} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">Delete All Global Schema Fields?</h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to delete <span className="font-bold text-rose-600">all {fields.length} canonical fields</span> from the Global Standard Directory and Schema? 
              </p>
              <p className="text-xs text-slate-400">
                This will clear all columns from the global directory in the database. You can always add custom fields or restore factory defaults anytime via &quot;Reset Defaults&quot;.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowClearAllModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearAllFields}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
                id="btn-confirm-clear-all"
              >
                Yes, Delete All ({fields.length})
              </button>
            </div>
          </div>
        </div>
      )}

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
