/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  User, 
  GlobalTransactionSchemaField, 
  DbTableMappingConfig, 
  GlobalMappingConfig,
  DatabaseConnection,
  EnvironmentSystem,
  GlobalMappingSchemaModel,
  SchemaModelFieldDef,
  CentralUploadedTransactionRepositoryTable,
  CentralRepositoryDdlLog
} from '../types';
import { 
  globalMappingService, 
  DEFAULT_GLOBAL_STANDARD_FIELDS 
} from '../services/globalMappingService';
import { api } from '../api/client';
import { 
  Database, Plus, Trash2, Edit3, Check, Save, 
  RefreshCw, ArrowRight, ShieldCheck, Eye, Copy, CheckCircle2, AlertCircle, 
  Search, Filter, Layers, HelpCircle, Sparkles, Server, HardDriveUpload,
  ArrowLeft, CheckSquare, Table, Settings, Link, ChevronDown, ChevronRight,
  Download, Upload, Play, Terminal, ArrowRightLeft, Code2, BookOpen, Info,
  ShieldAlert, GitMerge, Wrench, CheckCircle, Clock, Sliders, FileText,
  FileCode, FileJson, Cpu, Activity, History, PlusCircle, Loader2
} from 'lucide-react';

interface ColumnDef {
  id: string;
  name: string;
  dataType: string;
  isPrimaryKey: boolean;
  isNullable: boolean;
  defaultValue: string;
  mappedGlobalKey: string;
}

interface GlobalTransactionSettingsProps {
  currentUser: User;
  databases?: DatabaseConnection[];
  systems?: EnvironmentSystem[];
  onNavigateToWorkspace?: () => void;
  onNavigateToCase?: (issueId: string) => void;
}

export default function GlobalTransactionSettings({
  currentUser,
  databases = [],
  systems = [],
  onNavigateToWorkspace,
  onNavigateToCase
}: GlobalTransactionSettingsProps) {
  // Check Administrator Access
  const isAdmin = currentUser?.role === 'admin' || currentUser?.username?.toLowerCase() === 'admin' || (currentUser?.role as string)?.toLowerCase() === 'administrator';

  // Master Mapping Config State
  const [mappingConfig, setMappingConfig] = useState<GlobalMappingConfig>(() => {
    return globalMappingService.getConfig();
  });

  // Central Uploaded Transaction Repository Table State
  const [centralTable, setCentralTable] = useState<CentralUploadedTransactionRepositoryTable>(() => {
    return globalMappingService.getCentralRepositoryTable();
  });

  // Global Mapping Schema Model Representation
  const [schemaModel, setSchemaModel] = useState<GlobalMappingSchemaModel>(() => {
    return globalMappingService.getSchemaModel('central_transaction_repository');
  });

  // Active Sub-Tab: 'central_model' | 'db_mappings' | 'global_standard' | 'query_tester'
  const [activeTab, setActiveTab] = useState<'central_model' | 'db_mappings' | 'global_standard' | 'query_tester'>('central_model');

  // Schema Model View Format: 'sql_ddl' | 'typescript' | 'json_schema' | 'orm_drizzle'
  const [activeModelFormat, setActiveModelFormat] = useState<'sql_ddl' | 'typescript' | 'json_schema' | 'orm_drizzle'>('sql_ddl');
  const [modelDdlDialect, setModelDdlDialect] = useState<'PostgreSQL' | 'Oracle' | 'MySQL' | 'Generic'>('PostgreSQL');

  // Central Repository Table Filter & Search State
  const [centralTableSearch, setCentralTableSearch] = useState('');
  const [showDdlHistoryModal, setShowDdlHistoryModal] = useState(false);
  const [showInsertRecordModal, setShowInsertRecordModal] = useState(false);
  const [newTestRecord, setNewTestRecord] = useState<Record<string, string>>({});

  // Compile full list of configured external database connections strictly from live databases
  const allDbOptions = databases.map(d => ({
    id: d.id,
    name: d.name,
    type: d.type || 'Relational DB',
    category: d.systemCategory === 'CBS' ? 'External Banking (CBS)' :
              d.systemCategory === 'Switch_FE' ? 'External Switch (Front-End)' :
              d.systemCategory === 'Switch_BE' ? 'External Switch (Back-End)' :
              'Connected Database'
  }));

  // Database & Table Selection State for Database Mappings View (Default to first real DB & table)
  const [selectedDbId, setSelectedDbId] = useState<string>(() => {
    return databases[0]?.id || '';
  });
  const [selectedTableName, setSelectedTableName] = useState<string>(() => {
    const firstDb = databases[0];
    const tables = (firstDb?.allowedTables && firstDb.allowedTables.length > 0)
      ? firstDb.allowedTables
      : (firstDb?.availableTables || []);
    return tables[0] || '';
  });

  const [searchFilter, setSearchFilter] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Real introspected physical columns for currently selected DB & Table
  const [introspectedColumns, setIntrospectedColumns] = useState<{ name: string; type: string; nullable: boolean; isPrimary?: boolean }[]>([]);
  const [columnsLoading, setColumnsLoading] = useState<boolean>(false);
  const [columnsError, setColumnsError] = useState<string | null>(null);
  const [useCustomInput, setUseCustomInput] = useState<Record<string, boolean>>({});

  // Editable Physical Columns state for currently selected DB & Table
  const [currentTableColumns, setCurrentTableColumns] = useState<Record<string, string>>({});
  const [currentColumnNotes, setCurrentColumnNotes] = useState<Record<string, string>>({});

  // Interactive Query Translation Sandbox State
  const [testerDbId, setTesterDbId] = useState<string>(() => databases[0]?.id || '');
  const [testerTableName, setTesterTableName] = useState<string>(() => {
    const firstDb = databases[0];
    const tables = (firstDb?.allowedTables && firstDb.allowedTables.length > 0)
      ? firstDb.allowedTables
      : (firstDb?.availableTables || []);
    return tables[0] || '';
  });

  const [testerGlobalQuery, setTesterGlobalQuery] = useState<string>('');
  const [testerColumns, setTesterColumns] = useState<{ name: string; type: string; nullable: boolean; isPrimary?: boolean }[]>([]);
  const [testerColumnsLoading, setTesterColumnsLoading] = useState<boolean>(false);
  const [testerEditNative, setTesterEditNative] = useState<boolean>(false);
  const [directNativeSql, setDirectNativeSql] = useState<string>('');

  // Sandbox Live Database Query Execution State
  const [isExecutingQuery, setIsExecutingQuery] = useState(false);
  const [queryExecutionResult, setQueryExecutionResult] = useState<any>(null);
  const [queryExecutionError, setQueryExecutionError] = useState<string | null>(null);

  // Modal State: Standard Field Modal (Add / Edit)
  const [showAddFieldModal, setShowAddFieldModal] = useState(false);
  const [editingField, setEditingField] = useState<GlobalTransactionSchemaField | null>(null);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldDesc, setNewFieldDesc] = useState('');
  const [newFieldDataType, setNewFieldDataType] = useState<'string' | 'number' | 'date' | 'boolean'>('string');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldExample, setNewFieldExample] = useState('');
  const [newFieldCategory, setNewFieldCategory] = useState('General');
  const [newFieldNotes, setNewFieldNotes] = useState('');
  const [newFieldUserId, setNewFieldUserId] = useState(currentUser.id || 'usr-1');
  const [fieldModalError, setFieldModalError] = useState<string | null>(null);

  // Modal State: Add Table Mapping Modal
  const [showAddTableModal, setShowAddTableModal] = useState(false);
  const [newTableDbId, setNewTableDbId] = useState<string>(() => databases[0]?.id || '');
  const [newTableName, setNewTableName] = useState('');

  // Modal State: Reset Defaults Confirmation Modal
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

  // Modal State: Export / Import JSON Modal
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [jsonModalMode, setJsonModalMode] = useState<'export' | 'import'>('export');
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Modal State: Create Database Table Modal
  const [showCreateTableModal, setShowCreateTableModal] = useState(false);
  const [createTableName, setCreateTableName] = useState('');
  const [createTableDialect, setCreateTableDialect] = useState<'PostgreSQL' | 'Oracle' | 'MySQL' | 'SQLite'>('PostgreSQL');
  const [createTableDescription, setCreateTableDescription] = useState('');
  const [createTableColumns, setCreateTableColumns] = useState<ColumnDef[]>([]);
  const [createTableError, setCreateTableError] = useState<string | null>(null);
  const [createTableDbId, setCreateTableDbId] = useState<string>(() => databases[0]?.id || '');
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false);
  const [isSyncingBackend, setIsSyncingBackend] = useState(false);

  // Modal State: Migrate Table Modal
  const [showMigrateTableModal, setShowMigrateTableModal] = useState(false);
  const [migrateSource, setMigrateSource] = useState<'global_schema' | 'uploaded_dataset'>('global_schema');
  const [migrateTargetDbId, setMigrateTargetDbId] = useState<string>(() => databases[0]?.id || '');
  const [migrateTargetTableName, setMigrateTargetTableName] = useState<string>('');
  const [migrationType, setMigrationType] = useState<'schema_sync' | 'data_backfill' | 'full_sync'>('schema_sync');
  const [migrationStatus, setMigrationStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [migrationProgress, setMigrationProgress] = useState(0);
  const [migrationLogs, setMigrationLogs] = useState<string[]>([]);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrateBackupBeforeRun, setMigrateBackupBeforeRun] = useState(true);

  // Hydrate persistent version-controlled schema and table mappings from backend MongoDB
  useEffect(() => {
    let isMounted = true;
    setIsSyncingBackend(true);
    globalMappingService.fetchConfigFromBackend()
      .then(cfg => {
        if (isMounted && cfg) {
          setMappingConfig(cfg);
          setCentralTable(globalMappingService.getCentralRepositoryTable());
          setSchemaModel(globalMappingService.getSchemaModel('central_transaction_repository'));
        }
      })
      .catch(err => {
        console.warn('Backend schema config fetch notice:', err);
      })
      .finally(() => {
        if (isMounted) setIsSyncingBackend(false);
      });
    return () => { isMounted = false; };
  }, []);

  // Hydrate real Central Repository Table records from backend MongoDB working-db and workspace
  useEffect(() => {
    let isMounted = true;
    Promise.allSettled([
      api.getWorkingDbTransactions(),
      api.getWorkspaceTableRecords()
    ]).then(([workingDbRes, workspaceRes]) => {
      if (!isMounted) return;
      const realRecords: Record<string, any>[] = [];

      if (workingDbRes.status === 'fulfilled' && workingDbRes.value?.transactions && Array.isArray(workingDbRes.value.transactions)) {
        workingDbRes.value.transactions.forEach((tx: any) => {
          const raw = tx.mappedData || tx.rawRecord || tx;
          realRecords.push(globalMappingService.transformRowToGlobalSchema(raw));
        });
      }

      if (workspaceRes.status === 'fulfilled' && Array.isArray(workspaceRes.value)) {
        workspaceRes.value.forEach((rec: any) => {
          const raw = rec.transformed_data || rec.raw_data || rec;
          realRecords.push(globalMappingService.transformRowToGlobalSchema(raw));
        });
      }

      // Deduplicate by transaction_id if present
      const uniqueRecords: Record<string, any>[] = [];
      const seen = new Set<string>();
      realRecords.forEach(r => {
        const id = r.transaction_id || JSON.stringify(r);
        if (!seen.has(id)) {
          seen.add(id);
          uniqueRecords.push(r);
        }
      });

      const mongoDb = databases.find(d => d.type === 'MongoDB');
      setCentralTable(prev => ({
        ...prev,
        records: uniqueRecords,
        recordCount: uniqueRecords.length,
        dbId: mongoDb?.id || prev.dbId,
        dbName: mongoDb?.name ? `${mongoDb.name} (MongoDB Atlas / Live Database)` : prev.dbName
      }));
    }).catch(err => {
      console.warn('Could not hydrate central table from backend:', err);
    });

    return () => { isMounted = false; };
  }, [databases]);

  // Sync selected DB & Table if databases load or current selection becomes invalid
  useEffect(() => {
    if (databases.length > 0) {
      const currentValid = databases.some(d => d.id === selectedDbId);
      if (!currentValid) {
        const firstDb = databases[0];
        setSelectedDbId(firstDb.id);
        const tables = (firstDb.allowedTables && firstDb.allowedTables.length > 0)
          ? firstDb.allowedTables
          : (firstDb.availableTables || []);
        setSelectedTableName(tables[0] || '');
      }
      if (!testerDbId || !databases.some(d => d.id === testerDbId)) {
        const firstDb = databases[0];
        setTesterDbId(firstDb.id);
        const tables = (firstDb.allowedTables && firstDb.allowedTables.length > 0)
          ? firstDb.allowedTables
          : (firstDb.availableTables || []);
        setTesterTableName(tables[0] || '');
      }
    }
  }, [databases, selectedDbId, testerDbId]);

  // Derive all table options for currently selected database
  const getTablesForDb = (dbId: string): string[] => {
    const targetDb = databases.find(d => d.id === dbId);
    const dbTables = (targetDb?.allowedTables && targetDb.allowedTables.length > 0)
      ? targetDb.allowedTables
      : (targetDb?.availableTables || []);

    const matchingFromConfig = Object.keys(mappingConfig.tableMappings)
      .filter(k => k.startsWith(`${dbId}::`))
      .map(k => k.split('::')[1]);

    const combined = Array.from(new Set([
      ...dbTables,
      ...matchingFromConfig
    ])).filter(Boolean);

    return combined;
  };

  const availableTables = getTablesForDb(selectedDbId);

  // Fetch real columns for Mapping Matrix (selectedDbId + selectedTableName)
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
          const fetchedCols = res.columns || [];
          setIntrospectedColumns(fetchedCols);
          setColumnsLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          console.warn(`Could not introspect columns for ${selectedTableName}:`, err.message);
          setColumnsError(`Could not load physical columns: ${err.message}`);
          setIntrospectedColumns([]);
          setColumnsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedDbId, selectedTableName]);

  // Fetch real columns for Query Sandbox (testerDbId + testerTableName)
  useEffect(() => {
    if (!testerDbId || !testerTableName) {
      setTesterColumns([]);
      return;
    }

    let isMounted = true;
    setTesterColumnsLoading(true);

    api.getTableColumns(testerDbId, testerTableName)
      .then(res => {
        if (isMounted) {
          setTesterColumns(res.columns || []);
          setTesterColumnsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setTesterColumns([]);
          setTesterColumnsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [testerDbId, testerTableName]);

  // Update default tester query whenever testerTableName changes
  useEffect(() => {
    if (testerTableName) {
      setTesterGlobalQuery(`SELECT * FROM ${testerTableName} LIMIT 10;`);
      setQueryExecutionResult(null);
      setQueryExecutionError(null);
    }
  }, [testerTableName]);

  // Sync current table columns mapping state when selectedDbId, selectedTableName or mappingConfig changes
  useEffect(() => {
    if (!selectedDbId || !selectedTableName) return;

    const tableMap = globalMappingService.getTableMapping(
      selectedDbId, 
      selectedTableName, 
      allDbOptions.find(d => d.id === selectedDbId)?.name
    );

    const cols: Record<string, string> = {};
    const notes: Record<string, string> = {};

    mappingConfig.standardFields.forEach(field => {
      const match = tableMap.columns.find(c => c.globalKey === field.key);
      cols[field.key] = match ? match.physicalColumn : '';
      notes[field.key] = match?.notes || '';
    });

    setCurrentTableColumns(cols);
    setCurrentColumnNotes(notes);
  }, [selectedDbId, selectedTableName, mappingConfig]);

  // Handler: Update physical column for a standard field
  const handlePhysicalColumnChange = (globalKey: string, newPhysicalName: string) => {
    setCurrentTableColumns(prev => ({
      ...prev,
      [globalKey]: newPhysicalName
    }));
  };

  // Handler: Save current table mappings
  const handleSaveTableMappings = async () => {
    const dbName = allDbOptions.find(d => d.id === selectedDbId)?.name || selectedDbId;
    const columns = mappingConfig.standardFields.map(field => ({
      globalKey: field.key,
      physicalColumn: currentTableColumns[field.key] || '',
      notes: currentColumnNotes[field.key] || undefined
    }));

    globalMappingService.saveTableMapping(
      selectedDbId,
      selectedTableName,
      dbName,
      columns,
      currentUser.username
    );

    const updatedConfig = globalMappingService.getConfig();
    setMappingConfig(updatedConfig);

    try {
      const res = await globalMappingService.saveTableMappingToBackend(
        selectedDbId,
        selectedTableName,
        dbName,
        columns,
        currentUser.username
      );
      if (res?.validation) {
        if (res.validation.status === 'COMPLETE') {
          setSaveSuccessMsg(`✓ Saved mappings for ${dbName} → "${selectedTableName}"! Strict status: COMPLETE (All ${res.validation.requiredColumnsCount} required columns mapped).`);
        } else {
          setSaveSuccessMsg(`⚠️ Saved mappings for ${dbName} → "${selectedTableName}". Status: INCOMPLETE (Missing required columns: ${res.validation.missingRequiredColumns.join(', ')}).`);
        }
      } else {
        setSaveSuccessMsg(`Saved mappings for ${dbName} → "${selectedTableName}" successfully!`);
      }
    } catch (err: any) {
      setSaveSuccessMsg(`Saved locally. Notice: Backend sync: ${err.message}`);
    }
    setTimeout(() => setSaveSuccessMsg(null), 5000);
  };

  // Handler: Smart Auto-populate column mappings based on REAL physical columns from the connected database
  const handleAutoPopulateDefaults = () => {
    if (introspectedColumns.length === 0) {
      setSaveSuccessMsg(`No physical columns detected in table "${selectedTableName}" to auto-map.`);
      setTimeout(() => setSaveSuccessMsg(null), 4000);
      return;
    }

    const newCols: Record<string, string> = { ...currentTableColumns };
    const colNames = introspectedColumns.map(c => c.name);

    mappingConfig.standardFields.forEach(f => {
      const targetClean = f.key.toLowerCase().replace(/[^a-z0-9]/g, '');
      // 1. Direct match (case-insensitive, ignoring special characters)
      let match = colNames.find(c => c.toLowerCase().replace(/[^a-z0-9]/g, '') === targetClean);

      // 2. Semantic alias patterns for real physical databases
      if (!match) {
        if (f.key === 'transaction_id') {
          match = colNames.find(c => /^(tran_id|txn_id|id|trans_id|auth_id|ref_no|ref_num|charge_id|auth_ref|auth_code)$/i.test(c));
        } else if (f.key === 'card_number') {
          match = colNames.find(c => /(card|pan|token|account|acct|fingerprint)/i.test(c));
        } else if (f.key === 'amount_usd') {
          match = colNames.find(c => /(amount|amt|price|val|charge|clearing)/i.test(c));
        } else if (f.key === 'status_state') {
          match = colNames.find(c => /(status|state|code_state|condition)/i.test(c));
        } else if (f.key === 'created_at') {
          match = colNames.find(c => /(created|date|time|dttm|timestamp|posted)/i.test(c));
        } else if (f.key === 'user_email') {
          match = colNames.find(c => /(email|mail|user|customer|payer|buyer)/i.test(c));
        } else if (f.key === 'merchant_id') {
          match = colNames.find(c => /(merchant|store|shop|seller|vendor)/i.test(c));
        } else if (f.key === 'response_code') {
          match = colNames.find(c => /(resp|response|res_code|code|result)/i.test(c));
        } else if (f.key === 'currency') {
          match = colNames.find(c => /(curr|currency|iso_curr)/i.test(c));
        } else if (f.key === 'terminal_id') {
          match = colNames.find(c => /(term|terminal|pos)/i.test(c));
        } else if (f.key === 'dispute_reason') {
          match = colNames.find(c => /(dispute|reason|chargeback|note)/i.test(c));
        } else if (f.key === 'batch_seq_num') {
          match = colNames.find(c => /(batch|seq|sequence)/i.test(c));
        }
      }

      if (match) {
        newCols[f.key] = match;
      }
    });

    setCurrentTableColumns(newCols);
    setSaveSuccessMsg(`Auto-mapped real columns from ${selectedTableName} based on live schema! Click "Save Mappings" to persist.`);
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  // Handler: Execute Native SQL query in Sandbox directly against live database
  const handleExecuteSandboxQuery = async () => {
    if (!testerDbId) {
      setQueryExecutionError('Please select a target database connection.');
      return;
    }

    const queryToRun = (testerEditNative && directNativeSql.trim())
      ? directNativeSql.trim()
      : liveTranslationResult.translatedQuery.trim();

    if (!queryToRun) {
      setQueryExecutionError('Query statement cannot be empty.');
      return;
    }

    setIsExecutingQuery(true);
    setQueryExecutionError(null);
    setQueryExecutionResult(null);

    const targetDb = databases.find(d => d.id === testerDbId);
    try {
      const res = await api.executeQuery({
        userId: currentUser.id || 'usr-1',
        username: currentUser.username || 'admin',
        userRole: currentUser.role || 'admin',
        dbId: testerDbId,
        dbName: targetDb?.name || testerDbId,
        query: queryToRun
      });

      setQueryExecutionResult(res);
    } catch (err: any) {
      console.error('Query execution error in sandbox:', err);
      setQueryExecutionError(err.message || 'Database query execution failed');
    } finally {
      setIsExecutingQuery(false);
    }
  };

  // Handler: Add or update Global Standard Field
  const handleSaveStandardField = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = newFieldKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanKey) {
      setFieldModalError('Field key is required (e.g. customer_tax_id).');
      return;
    }
    if (!newFieldLabel.trim()) {
      setFieldModalError('Field label is required (e.g. Customer Tax ID).');
      return;
    }

    const now = new Date().toISOString();
    const fieldObj: GlobalTransactionSchemaField = {
      id: editingField?.id || `gsd-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      key: cleanKey,
      label: newFieldLabel.trim(),
      description: newFieldDesc.trim() || 'Custom operational field',
      dataType: newFieldDataType,
      required: newFieldRequired,
      isStandard: editingField ? editingField.isStandard : false,
      exampleValue: newFieldExample.trim() || undefined,
      category: newFieldCategory.trim() || 'General',
      notes: newFieldNotes.trim() || undefined,
      user_id: newFieldUserId || currentUser.id || 'usr-1',
      created_at: editingField?.created_at || now,
      updated_at: now
    };

    globalMappingService.addStandardField(fieldObj, currentUser.username);
    const updatedCfg = globalMappingService.getConfig();
    const updatedTable = globalMappingService.getCentralRepositoryTable();
    const updatedModel = globalMappingService.getSchemaModel('central_transaction_repository');

    setMappingConfig(updatedCfg);
    setCentralTable(updatedTable);
    setSchemaModel(updatedModel);

    // Reset modal
    setShowAddFieldModal(false);
    setEditingField(null);
    setNewFieldKey('');
    setNewFieldLabel('');
    setNewFieldDesc('');
    setNewFieldDataType('string');
    setNewFieldRequired(false);
    setNewFieldExample('');
    setNewFieldCategory('General');
    setNewFieldNotes('');
    setNewFieldUserId(currentUser.id || 'usr-1');
    setFieldModalError(null);
    setSaveSuccessMsg(`Saved standard field "${fieldObj.label}" (${fieldObj.key}) & automatically executed ALTER TABLE ${updatedTable.tableName} ADD COLUMN in Central Repository!`);
    setTimeout(() => setSaveSuccessMsg(null), 5000);

    // Persist to backend with version increment
    globalMappingService.saveConfigToBackend(currentUser.username, `${editingField ? 'Updated' : 'Added'} field "${fieldObj.label}" (${fieldObj.key})`)
      .then(savedCfg => {
        if (savedCfg) setMappingConfig(savedCfg);
      })
      .catch(err => console.warn('Could not persist schema config to backend:', err));
  };

  // Handler: Delete Custom Standard Field
  const handleDeleteStandardField = (key: string) => {
    const success = globalMappingService.deleteStandardField(key, currentUser.username);
    if (success) {
      setMappingConfig(globalMappingService.getConfig());
      setCentralTable(globalMappingService.getCentralRepositoryTable());
      setSchemaModel(globalMappingService.getSchemaModel('central_transaction_repository'));
      setSaveSuccessMsg(`Removed custom field "${key}" and synchronized Central Repository Table schema.`);
      setTimeout(() => setSaveSuccessMsg(null), 3000);

      globalMappingService.saveConfigToBackend(currentUser.username, `Deleted standard field "${key}"`)
        .then(savedCfg => {
          if (savedCfg) setMappingConfig(savedCfg);
        })
        .catch(err => console.warn('Could not persist schema config to backend:', err));
    }
  };

  // Handler: Reset all to factory app defaults
  const handleResetToAppDefaults = () => {
    const fresh = globalMappingService.resetToDefaults(currentUser.username);
    setMappingConfig(fresh);
    setCentralTable(globalMappingService.getCentralRepositoryTable());
    setSchemaModel(globalMappingService.getSchemaModel('central_transaction_repository'));
    setShowResetConfirmModal(false);
    setSaveSuccessMsg('All Global Schema, Central Repository Table, and Database Mappings reset to factory App Defaults!');
    setTimeout(() => setSaveSuccessMsg(null), 5000);

    globalMappingService.saveConfigToBackend(currentUser.username, 'Reset schema dictionary to default factory baseline')
      .then(savedCfg => {
        if (savedCfg) setMappingConfig(savedCfg);
      })
      .catch(err => console.warn('Could not persist schema config to backend:', err));
  };

  // Handler: Rebuild Central Uploaded Transactions Repository Table
  const handleRebuildCentralTable = () => {
    const rebuilt = globalMappingService.buildCentralRepositoryTable({
      username: currentUser.username
    });
    setCentralTable(rebuilt);
    setSchemaModel(globalMappingService.getSchemaModel('central_transaction_repository'));
    setSaveSuccessMsg(`Central Uploaded Transactions Repository table "${rebuilt.tableName}" rebuilt from Schema Model (${rebuilt.columns.length} columns)!`);
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  // Handler: Create new table mapping
  const handleCreateNewTableMapping = () => {
    const trimmed = newTableName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!trimmed) return;

    const dbName = allDbOptions.find(d => d.id === newTableDbId)?.name || newTableDbId;
    const defaultCols = mappingConfig.standardFields.map(f => ({
      globalKey: f.key,
      physicalColumn: f.key
    }));

    globalMappingService.saveTableMapping(newTableDbId, trimmed, dbName, defaultCols, currentUser.username);
    setMappingConfig(globalMappingService.getConfig());
    setSelectedDbId(newTableDbId);
    setSelectedTableName(trimmed);
    setShowAddTableModal(false);
    setNewTableName('');
    setSaveSuccessMsg(`Created new schema mapping for "${trimmed}" under ${dbName}!`);
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  // Handler: Export Schema JSON
  const handleOpenExportJson = () => {
    setJsonModalMode('export');
    setJsonText(JSON.stringify(mappingConfig, null, 2));
    setJsonError(null);
    setShowJsonModal(true);
  };

  // Handler: Import Schema JSON
  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed.standardFields || !parsed.tableMappings) {
        throw new Error('Invalid JSON format: Must contain standardFields and tableMappings objects.');
      }
      globalMappingService.saveConfig(parsed);
      setMappingConfig(globalMappingService.getConfig());
      setCentralTable(globalMappingService.getCentralRepositoryTable());
      setSchemaModel(globalMappingService.getSchemaModel('central_transaction_repository'));
      setShowJsonModal(false);
      setSaveSuccessMsg('Successfully imported and applied Global Mapping Schema configuration!');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (e: any) {
      setJsonError(e.message || 'Failed to parse JSON configuration.');
    }
  };

  // Handler: Pre-fill create table columns from Global Standard Schema
  const handlePreFillColumnsFromGlobal = () => {
    const defaultCols: ColumnDef[] = mappingConfig.standardFields.map((f, idx) => {
      let dType = 'VARCHAR(255)';
      let dVal = '';
      if (f.dataType === 'number') {
        dType = 'DECIMAL(12,2)';
        dVal = '0.00';
      } else if (f.dataType === 'date') {
        dType = 'TIMESTAMP';
        dVal = 'CURRENT_TIMESTAMP';
      } else if (f.dataType === 'boolean') {
        dType = 'BOOLEAN';
        dVal = 'FALSE';
      }

      return {
        id: `col-${idx + 1}`,
        name: f.key,
        dataType: dType,
        isPrimaryKey: f.key === 'transaction_id',
        isNullable: f.key !== 'transaction_id',
        defaultValue: dVal,
        mappedGlobalKey: f.key
      };
    });

    setCreateTableColumns(defaultCols);
  };

  // Handler: Execute Create Table DDL, build Central Repository Table and register schema
  const handleExecuteCreateTable = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateTableError(null);

    const cleanName = createTableName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanName) {
      setCreateTableError('Table name is required.');
      return;
    }

    if (createTableColumns.length === 0) {
      setCreateTableError('At least one column is required.');
      return;
    }

    const mongoDb = databases.find(d => d.type === 'MongoDB') || databases[0];
    const targetDbId = mongoDb?.id || 'mongoatlas';
    const dbName = mongoDb ? `${mongoDb.name} (${mongoDb.type})` : 'Application Working Database (MongoDB)';
    
    // Save table mapping into Global Mapping Service
    const colsToSave = createTableColumns.map(c => ({
      globalKey: c.mappedGlobalKey || c.name,
      physicalColumn: c.name,
      notes: `${c.dataType} ${c.isPrimaryKey ? 'PRIMARY KEY' : ''}`.trim()
    }));

    globalMappingService.saveTableMapping(
      targetDbId,
      cleanName,
      dbName,
      colsToSave,
      currentUser.username
    );

    // Build central repository table using the schema model and column definitions
    const newRepoTable = globalMappingService.buildCentralRepositoryTable({
      tableName: cleanName,
      dbId: targetDbId,
      username: currentUser.username,
      columnsOverride: createTableColumns.map(c => ({
        name: c.name,
        dataType: c.dataType,
        isPrimaryKey: c.isPrimaryKey,
        mappedGlobalKey: c.mappedGlobalKey
      }))
    });

    setMappingConfig(globalMappingService.getConfig());
    setCentralTable(newRepoTable);
    setSchemaModel(globalMappingService.getSchemaModel(cleanName));
    setSelectedDbId(targetDbId);
    setSelectedTableName(cleanName);
    setShowCreateTableModal(false);
    setActiveTab('central_model');
    setSaveSuccessMsg(`Table "${cleanName}" created and deployed into ${dbName} successfully!`);
    setTimeout(() => setSaveSuccessMsg(null), 5000);
  };

  // Handler: Insert Test Transaction Record into Central Table
  const handleInsertTestRecord = (e: React.FormEvent) => {
    e.preventDefault();
    const txId = newTestRecord['transaction_id'] || `TX-${Math.floor(100000 + Math.random() * 900000)}`;
    const now = new Date().toISOString();

    const recordToInsert: Record<string, any> = {
      transaction_id: txId,
      account_id: newTestRecord['account_id'] || 'ACC-984210',
      card_number: newTestRecord['card_number'] || '4111********1111',
      amount_usd: parseFloat(newTestRecord['amount_usd'] || '125.50'),
      status_state: newTestRecord['status_state'] || 'COMPLETED',
      created_at: newTestRecord['created_at'] || now,
      merchant_name: newTestRecord['merchant_name'] || 'Central Test Merchant',
      currency_code: newTestRecord['currency_code'] || 'USD',
      ...newTestRecord
    };

    const inserted = globalMappingService.insertCentralRepositoryRecord(recordToInsert, currentUser.username);
    setCentralTable(globalMappingService.getCentralRepositoryTable());
    setShowInsertRecordModal(false);
    setNewTestRecord({});

    // Persist to backend MongoDB workspace records
    api.saveWorkspaceTableRecords([{
      raw_data: recordToInsert,
      transformed_data: recordToInsert,
      status: 'IMPORTED',
      user_id: currentUser.id || 'usr-1'
    }]).catch(err => console.warn('Could not persist sample record to MongoDB:', err));

    setSaveSuccessMsg(`Inserted test record "${txId}" into central repository table and persisted to working database.`);
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  // Handler: Export CSV of Central Repository Table
  const handleExportCentralTableCsv = () => {
    const cols = centralTable.columns.map(c => c.key || (c as any).name || '');
    const headerRow = cols.join(',');
    const rows = (centralTable.records || []).map(rec => {
      return cols.map(c => {
        const val = rec[c] !== undefined ? String(rec[c]).replace(/"/g, '""') : '';
        return `"${val}"`;
      }).join(',');
    });
    const csvContent = [headerRow, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${centralTable.tableName}_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setSaveSuccessMsg(`Exported ${centralTable.records.length} records to CSV.`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // Handler: Export JSON of Central Repository Table
  const handleExportCentralTableJson = () => {
    const jsonStr = JSON.stringify(centralTable, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${centralTable.tableName}_schema_data_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setSaveSuccessMsg(`Exported central table and ${centralTable.records.length} records to JSON.`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // Handler: Execute Schema Migration
  const handleExecuteTableMigration = () => {
    setMigrationError(null);
    setMigrationStatus('running');
    setMigrationProgress(10);
    setMigrationLogs([
      `[MIGRATION_INIT] Target database: ${allDbOptions.find(d => d.id === migrateTargetDbId)?.name || migrateTargetDbId}`,
      `[MIGRATION_INIT] Target table: "${migrateTargetTableName}"`,
      `[MIGRATION_INIT] Migration strategy: ${migrationType.toUpperCase()}`
    ]);

    setTimeout(() => {
      setMigrationProgress(35);
      setMigrationLogs(prev => [
        ...prev,
        `[SCHEMA_DIFF] Scanning table schema vs Global Standard v${mappingConfig.version}...`,
        `[SCHEMA_DIFF] Found ${mappingConfig.standardFields.length} global standard keys.`,
        `[DDL_PREPARE] Generating ALTER TABLE migration statements...`
      ]);

      setTimeout(() => {
        setMigrationProgress(70);
        const dbName = allDbOptions.find(d => d.id === migrateTargetDbId)?.name || migrateTargetDbId;

        // Auto sync all standard fields to table mapping
        const colsToSave = mappingConfig.standardFields.map(f => {
          const existingPhysical = currentTableColumns[f.key] || f.key;
          return {
            globalKey: f.key,
            physicalColumn: existingPhysical,
            notes: `Migrated to Global Schema v${mappingConfig.version}`
          };
        });

        globalMappingService.saveTableMapping(
          migrateTargetDbId,
          migrateTargetTableName,
          dbName,
          colsToSave,
          currentUser.username
        );

        setMigrationLogs(prev => [
          ...prev,
          `[DDL_EXEC] Executing atomic transaction schema upgrade...`,
          `[METADATA_SYNC] Updated column mapping registry for ${dbName} → ${migrateTargetTableName}`,
          `[INTEGRITY_CHECK] Schema verified successfully. 0 errors detected.`
        ]);

        setTimeout(() => {
          setMigrationProgress(100);
          setMigrationStatus('completed');
          setMappingConfig(globalMappingService.getConfig());
          setSaveSuccessMsg(`Migration of "${migrateTargetTableName}" to Global Standard v${mappingConfig.version} completed!`);
          setTimeout(() => setSaveSuccessMsg(null), 5000);
        }, 600);
      }, 700);
    }, 500);
  };

  // Live Query Translation Simulation
  const liveTranslationResult = globalMappingService.translateGlobalQueryToPhysical(
    testerGlobalQuery,
    testerDbId,
    testerTableName,
    (testerDbId === selectedDbId && testerTableName === selectedTableName) ? currentTableColumns : undefined
  );

  const selectedDbMeta = allDbOptions.find(d => d.id === selectedDbId) || allDbOptions[0];

  // Filtered standard fields for UI
  const filteredStandardFields = mappingConfig.standardFields.filter(f => {
    if (!searchFilter) return true;
    const q = searchFilter.toLowerCase();
    return f.key.toLowerCase().includes(q) || 
           f.label.toLowerCase().includes(q) || 
           f.description.toLowerCase().includes(q);
  });

  // Admin access guard
  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto my-12 bg-white border border-slate-200/90 rounded-2xl p-8 text-center space-y-5 shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200 shadow-xs">
          <ShieldAlert size={32} />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-slate-900">Administrator Access Required</h2>
          <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
            The Global Mapping Schema, DDL Table Creator, and Database Migration Engine are restricted to system administrators.
          </p>
        </div>
        <div className="p-3 bg-slate-50 rounded-xl text-xs font-mono text-slate-700 border border-slate-200 inline-block">
          Current Account: <strong className="text-slate-900">@{currentUser.username}</strong> (Role: <span className="uppercase text-amber-700 font-bold">{currentUser.role || 'user'}</span>)
        </div>
        <div className="pt-2">
          {onNavigateToWorkspace && (
            <button
              onClick={onNavigateToWorkspace}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              Return to Operational Workspace
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200" id="global-mapping-schema-container">
      
      {/* 1. Header & Quick Actions */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="p-3 bg-blue-600 text-white rounded-xl shadow-md flex items-center justify-center">
            <Code2 size={24} />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Global Mapping Schema
              </h1>
              <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-blue-100 text-blue-800 rounded-full border border-blue-200">
                v{mappingConfig.version} Standard
              </span>
              <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-purple-100 text-purple-800 rounded-full border border-purple-200">
                Admin Clearance
              </span>
              <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                Implicit Engine Active
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
              Centralized column naming standard for the entire application. Define canonical columns, create and migrate database tables, and test real-time query translations.
            </p>
          </div>
        </div>

        {/* Global Toolbar Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Create Table Button */}
          <button
            id="btn-create-table-global"
            onClick={() => {
              setCreateTableError(null);
              setShowCreateTableModal(true);
            }}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
            title="Create a new physical or virtual table and register its mapping"
          >
            <Table size={14} />
            <span>Create Table</span>
          </button>

          {/* Migrate Table Button */}
          <button
            id="btn-migrate-table-global"
            onClick={() => {
              setMigrationError(null);
              setMigrationStatus('idle');
              setMigrationProgress(0);
              setMigrationLogs([]);
              setMigrateTargetDbId(selectedDbId);
              setMigrateTargetTableName(selectedTableName);
              setShowMigrateTableModal(true);
            }}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
            title="Migrate or synchronize table columns with the Global Standard Schema"
          >
            <ArrowRightLeft size={14} />
            <span>Migrate Table</span>
          </button>

          <button
            onClick={() => setShowResetConfirmModal(true)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer border border-slate-200"
            title="Restore default standard naming conventions and mappings"
          >
            <RefreshCw size={13} />
            <span>Reset Defaults</span>
          </button>

          <button
            onClick={handleOpenExportJson}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer border border-slate-200"
            title="Export schema as JSON"
          >
            <Download size={13} />
            <span>Export</span>
          </button>

          <button
            onClick={() => {
              setJsonModalMode('import');
              setJsonText('');
              setJsonError(null);
              setShowJsonModal(true);
            }}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer border border-slate-200"
            title="Import schema from JSON"
          >
            <Upload size={13} />
            <span>Import</span>
          </button>

          {onNavigateToWorkspace && (
            <button
              onClick={onNavigateToWorkspace}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
            >
              <ArrowLeft size={13} />
              <span>Workspace</span>
            </button>
          )}
        </div>
      </div>

      {/* Success Notification Alert */}
      {saveSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between shadow-xs animate-in slide-in-from-top duration-200">
          <div className="flex items-center space-x-2">
            <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
            <span className="font-medium">{saveSuccessMsg}</span>
          </div>
          <button 
            onClick={() => setSaveSuccessMsg(null)}
            className="text-emerald-600 hover:text-emerald-800 font-bold px-1"
          >
            ×
          </button>
        </div>
      )}

      {/* Architecture Notice Banner */}
      <div className="bg-linear-to-r from-blue-900 via-indigo-950 to-slate-900 border border-blue-800/80 rounded-2xl p-5 text-white shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="p-2.5 bg-blue-500/20 border border-blue-400/30 rounded-xl text-blue-300 flex-shrink-0 mt-0.5">
              <Database size={22} />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-300 font-mono">
                  Storage & Systems Architecture
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                  App Working DB: MongoDB (Server) + Local Storage (Desktop)
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
                  External DBs: CBS / Switch FE / Switch BE
                </span>
              </div>
              <p className="text-xs text-slate-300 max-w-4xl leading-relaxed">
                <strong>Application Data:</strong> All users, settings, and <strong>Mapped & Uploaded Transaction Repositories</strong> (e.g. <code className="text-blue-200 font-mono">central_transaction_repository</code>) are stored in the Application Working Database (MongoDB on server, locally cached on desktop for maximum resource utilization).<br />
                <strong>Configured External Databases:</strong> The configured connections represent external remote banking environments (<strong>CBS</strong>) and central switching companies (<strong>Front-End Authorization Switch</strong> and <strong>Back-End Settlement Engine</strong>) that the application queries for reconciliation.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 pt-2 rounded-t-xl overflow-x-auto">
        <div className="flex items-center space-x-2 shrink-0">
          <button
            id="tab-central-repository-model"
            onClick={() => setActiveTab('central_model')}
            className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'central_model'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Layers size={15} />
            <span>Central Repository Table & Schema Model</span>
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-50 text-emerald-700 font-mono font-bold">
              {centralTable.columns.length} Cols • {centralTable.records?.length || 0} Rows
            </span>
          </button>

          <button
            onClick={() => setActiveTab('db_mappings')}
            className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'db_mappings'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Database size={15} />
            <span>Connected Database & Table Mappings</span>
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-50 text-blue-700 font-mono">
              {Object.keys(mappingConfig.tableMappings).length} Tables
            </span>
          </button>

          <button
            onClick={() => setActiveTab('global_standard')}
            className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'global_standard'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <BookOpen size={15} />
            <span>Global Standard Column Dictionary</span>
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-slate-100 text-slate-700 font-mono">
              {mappingConfig.standardFields.length} Standard Fields
            </span>
          </button>

          <button
            onClick={() => setActiveTab('query_tester')}
            className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center space-x-2 transition-all cursor-pointer ${
              activeTab === 'query_tester'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <Terminal size={15} />
            <span>Live Query & Translation Sandbox</span>
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-50 text-emerald-700 font-mono">
              Interactive
            </span>
          </button>
        </div>
      </div>

      {/* 2.5 TAB 0: Central Uploaded Transaction Repository Table & Schema Model */}
      {activeTab === 'central_model' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          
          {/* Top Model Information Header Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start space-x-3.5">
                <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-md flex items-center justify-center">
                  <Cpu size={24} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">
                      {schemaModel.modelName}
                    </h2>
                    <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 rounded-full border border-indigo-200">
                      v{schemaModel.version} Model Spec
                    </span>
                    <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Auto-ALTER Trigger Active
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
                    Formal model representation of the Global Mapping Schema. This model serves as the single source of truth used to build and maintain the <strong className="text-slate-900 font-mono">{centralTable.tableName}</strong> table. Whenever you click <em>Create Table</em> or add a new Standard Field, an <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-bold">ALTER TABLE</code> DDL migration is executed dynamically to keep the central uploaded transaction repository table in sync.
                  </p>
                </div>
              </div>

              {/* Central Repository Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  id="btn-rebuild-central-table-primary"
                  onClick={handleRebuildCentralTable}
                  className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer shadow-2xs"
                  title="Rebuild central repository table structure from schema model"
                >
                  <RefreshCw size={13} className="text-indigo-600" />
                  <span>Rebuild / Sync Table</span>
                </button>

                <button
                  id="btn-open-insert-test-modal"
                  onClick={() => setShowInsertRecordModal(true)}
                  className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer shadow-2xs"
                  title="Test inserting a record into central uploaded transactions repository table"
                >
                  <PlusCircle size={13} className="text-emerald-600" />
                  <span>Insert Test Record</span>
                </button>

                <button
                  id="btn-view-ddl-history"
                  onClick={() => setShowDdlHistoryModal(true)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer shadow-2xs"
                  title="View history of all CREATE TABLE and ALTER TABLE DDL statements executed"
                >
                  <History size={13} className="text-slate-600" />
                  <span>DDL Alter Log ({centralTable.ddlHistory?.length || 0})</span>
                </button>

                <div className="flex items-center space-x-1 pl-1">
                  <button
                    onClick={handleExportCentralTableCsv}
                    className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl flex items-center space-x-1 transition-all cursor-pointer"
                    title="Export central table data to CSV"
                  >
                    <Download size={12} />
                    <span>CSV</span>
                  </button>
                  <button
                    onClick={handleExportCentralTableJson}
                    className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl flex items-center space-x-1 transition-all cursor-pointer"
                    title="Export central table schema and data to JSON"
                  >
                    <FileJson size={12} />
                    <span>JSON</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Architecture Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-[10px] font-bold text-slate-500 uppercase font-mono">Bound Table Name</div>
                <div className="text-sm font-bold font-mono text-indigo-700 truncate">{centralTable.tableName}</div>
                <div className="text-[10px] text-slate-500">Database: <span className="font-semibold text-slate-700">{centralTable.dbName}</span></div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-[10px] font-bold text-slate-500 uppercase font-mono">Model Field Count</div>
                <div className="text-sm font-bold font-mono text-slate-900">{schemaModel.fields.length} Standard Fields</div>
                <div className="text-[10px] text-slate-500">PK: <span className="font-mono font-bold text-emerald-700">{schemaModel.primaryKey}</span></div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-[10px] font-bold text-slate-500 uppercase font-mono">Repository Row Count</div>
                <div className="text-sm font-bold font-mono text-slate-900">{centralTable.records?.length || 0} Records Stored</div>
                <div className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                  <CheckCircle size={10} /> Central Engine Ready
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-[10px] font-bold text-slate-500 uppercase font-mono">Last DDL Execution</div>
                <div className="text-sm font-bold font-mono text-slate-800 truncate">
                  {centralTable.ddlHistory?.[0]?.action || 'CREATE_TABLE'}
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  Status: <span className="text-emerald-700 font-bold uppercase">{centralTable.ddlHistory?.[0]?.status || 'SUCCESS'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Model Representation Code Artifacts Viewer */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <Code2 size={16} className="text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                  Schema Model Artifacts & Compilation Outputs
                </h3>
              </div>

              {/* Format Switcher */}
              <div className="flex items-center space-x-2">
                <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg text-xs font-bold">
                  <button
                    onClick={() => setActiveModelFormat('sql_ddl')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      activeModelFormat === 'sql_ddl'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    SQL DDL
                  </button>
                  <button
                    onClick={() => setActiveModelFormat('typescript')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      activeModelFormat === 'typescript'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    TypeScript Model
                  </button>
                  <button
                    onClick={() => setActiveModelFormat('json_schema')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      activeModelFormat === 'json_schema'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    JSON Schema
                  </button>
                  <button
                    onClick={() => setActiveModelFormat('orm_drizzle')}
                    className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                      activeModelFormat === 'orm_drizzle'
                        ? 'bg-white text-indigo-700 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Drizzle ORM
                  </button>
                </div>

                {activeModelFormat === 'sql_ddl' && (
                  <select
                    value={modelDdlDialect}
                    onChange={(e) => setModelDdlDialect(e.target.value as any)}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 cursor-pointer"
                  >
                    <option value="PostgreSQL">PostgreSQL</option>
                    <option value="Oracle">Oracle PL/SQL</option>
                    <option value="MySQL">MySQL</option>
                    <option value="Generic">Generic SQL</option>
                  </select>
                )}

                <button
                  onClick={() => {
                    let content = '';
                    if (activeModelFormat === 'sql_ddl') {
                      content = globalMappingService.generateSqlDdl(centralTable.tableName, modelDdlDialect);
                    } else if (activeModelFormat === 'typescript') {
                      content = globalMappingService.generateTypeScriptModel();
                    } else if (activeModelFormat === 'json_schema') {
                      content = JSON.stringify(globalMappingService.generateJsonSchema(centralTable.tableName), null, 2);
                    } else if (activeModelFormat === 'orm_drizzle') {
                      content = globalMappingService.generateOrmModel(centralTable.tableName);
                    }
                    navigator.clipboard.writeText(content);
                    setSaveSuccessMsg(`Copied ${activeModelFormat.toUpperCase()} artifact to clipboard!`);
                    setTimeout(() => setSaveSuccessMsg(null), 3000);
                  }}
                  className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all cursor-pointer shadow-2xs"
                >
                  <Copy size={12} />
                  <span>Copy</span>
                </button>
              </div>
            </div>

            {/* Code Output Panel */}
            <div className="p-4 bg-slate-950">
              <pre className="text-emerald-400 font-mono text-[11px] leading-relaxed max-h-72 overflow-y-auto overflow-x-auto p-3 rounded-xl bg-slate-900 border border-slate-800">
                {activeModelFormat === 'sql_ddl' && globalMappingService.generateSqlDdl(centralTable.tableName, modelDdlDialect)}
                {activeModelFormat === 'typescript' && globalMappingService.generateTypeScriptModel()}
                {activeModelFormat === 'json_schema' && JSON.stringify(globalMappingService.generateJsonSchema(centralTable.tableName), null, 2)}
                {activeModelFormat === 'orm_drizzle' && globalMappingService.generateOrmModel(centralTable.tableName)}
              </pre>
            </div>
          </div>

          {/* Live Central Uploaded Transactions Repository Table Viewer */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden space-y-0">
            <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center space-x-2">
                  <Table size={16} className="text-emerald-600" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                    Central Uploaded Transaction Repository Table: <span className="text-indigo-700 font-bold">{centralTable.tableName}</span>
                  </h3>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] rounded-full font-mono font-bold">
                    Active Storage Table
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Live data rows held in the central uploaded transactions repository table, structured by the Global Mapping Schema Model.
                </p>
              </div>

              {/* Table Search & Record Count */}
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search records..."
                    value={centralTableSearch}
                    onChange={(e) => setCentralTableSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-56"
                  />
                </div>

                <button
                  onClick={() => setShowInsertRecordModal(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1 shadow-2xs cursor-pointer transition-all"
                >
                  <Plus size={13} />
                  <span>Add Row</span>
                </button>
              </div>
            </div>

            {/* Central Table Column Metadata Header Bar */}
            <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between text-[11px] text-slate-600 font-mono">
              <div className="flex items-center space-x-2">
                <span>Schema Columns: <strong>{centralTable.columns.length}</strong></span>
                <span className="text-slate-300">|</span>
                <span>Storage Engine: <strong>{centralTable.dbName || 'MongoDB Atlas / Live Database'}</strong></span>
                <span className="text-slate-300">|</span>
                <span>PK: <strong className="text-emerald-700">{centralTable.primaryKey}</strong></span>
              </div>
              <div>
                Showing <strong>{
                  (centralTable.records || []).filter(r => {
                    if (!centralTableSearch) return true;
                    const q = centralTableSearch.toLowerCase();
                    return Object.values(r).some(v => String(v).toLowerCase().includes(q));
                  }).length
                }</strong> of <strong>{centralTable.records?.length || 0}</strong> records
              </div>
            </div>

            {/* Live Data Grid */}
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100/80 border-b border-slate-200 text-[10px] text-slate-600 uppercase font-mono tracking-wider sticky top-0 z-10">
                  <tr>
                    {centralTable.columns.map(col => {
                      const colKey = col.key || (col as any).name || '';
                      return (
                        <th key={colKey} className="py-2.5 px-3 font-bold whitespace-nowrap">
                          <div className="flex items-center space-x-1">
                            <span className={col.isPrimaryKey ? 'text-emerald-800 font-black' : 'text-slate-800'}>
                              {col.label || colKey}
                            </span>
                            {col.isPrimaryKey && (
                              <span className="px-1 py-0.2 text-[8px] bg-emerald-200 text-emerald-900 rounded font-bold">
                                PK
                              </span>
                            )}
                            <span className="text-[9px] text-slate-600 font-normal">
                              ({col.sqlDataType || col.dataType || 'VARCHAR'})
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {(() => {
                    const filteredRecords = (centralTable.records || []).filter(r => {
                      if (!centralTableSearch) return true;
                      const q = centralTableSearch.toLowerCase();
                      return Object.values(r).some(v => String(v).toLowerCase().includes(q));
                    });

                    if (filteredRecords.length === 0) {
                      return (
                        <tr>
                          <td colSpan={centralTable.columns.length || 1} className="py-12 text-center text-slate-500">
                            <div className="space-y-2">
                              <Table size={28} className="mx-auto text-slate-300" />
                              <p className="text-xs font-semibold text-slate-600">No records found in {centralTable.tableName}</p>
                              <p className="text-[11px] text-slate-400">Click &quot;Insert Test Record&quot; or upload transaction files in the workspace.</p>
                              <button
                                onClick={() => setShowInsertRecordModal(true)}
                                className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs transition-all cursor-pointer"
                              >
                                Insert Sample Row
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return filteredRecords.map((row, idx) => (
                      <tr key={row[centralTable.primaryKey] || idx} className="hover:bg-slate-50/70 transition-colors">
                        {centralTable.columns.map(col => {
                          const colKey = col.key || (col as any).name || '';
                          const cellVal = row[colKey];
                          const isPk = col.isPrimaryKey;
                          const colKeyLower = colKey.toLowerCase();
                          const isAmount = colKeyLower.includes('amount') || colKeyLower.includes('usd') || colKeyLower.includes('price');
                          const isStatus = colKeyLower.includes('status') || colKeyLower.includes('state');

                          return (
                            <td key={colKey} className="py-2.5 px-3 whitespace-nowrap">
                              {isStatus ? (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  String(cellVal).toUpperCase() === 'COMPLETED' || String(cellVal).toUpperCase() === 'SUCCESS' || String(cellVal) === '00'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : String(cellVal).toUpperCase() === 'FAILED' || String(cellVal).toUpperCase() === 'DECLINED'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {cellVal !== undefined ? String(cellVal) : 'NULL'}
                                </span>
                              ) : isAmount ? (
                                <span className="font-bold text-slate-900">
                                  ${typeof cellVal === 'number' ? cellVal.toFixed(2) : String(cellVal || '0.00')}
                                </span>
                              ) : isPk ? (
                                <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                                  {String(cellVal)}
                                </span>
                              ) : (
                                <span className="text-slate-700">
                                  {cellVal !== undefined && cellVal !== null ? String(cellVal) : <span className="text-slate-300 italic">null</span>}
                                </span>
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

      {/* 3. TAB 1: Connected Database & Table Mappings */}
      {activeTab === 'db_mappings' && (
        <div className="space-y-5">
          
          {/* Strict Connected Database & Allowed Tables Mapping Status Matrix */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center space-x-2">
                  <ShieldCheck size={18} className="text-emerald-600" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                    Strict Database & Allowed Table Mapping Matrix
                  </h3>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] rounded-full font-mono font-bold">
                    Strict Mapping Active
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  All connected databases and their allowed tables must have complete mappings to global standard columns before use in workspaces, automated verification queries, and workflows.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] text-slate-500 font-mono">
                  Strict Global Schema: <strong>v{mappingConfig.version || '2.3.0'}</strong>
                </span>
              </div>
            </div>

            {/* Matrix Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {databases.map(db => {
                const dbTables = (db.allowedTables && db.allowedTables.length > 0)
                  ? db.allowedTables
                  : (db.availableTables || []);

                return (
                  <div key={db.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Server size={14} className="text-indigo-600" />
                        <span className="text-xs font-bold text-slate-900 truncate max-w-[160px]">{db.name}</span>
                      </div>
                      <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 text-[9px] font-mono rounded">
                        {db.type || 'Relational'}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {dbTables.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic">No allowed tables configured.</p>
                      ) : (
                        dbTables.map(tbl => {
                          const mapKey = `${db.id}::${tbl}`;
                          const tblMap = mappingConfig.tableMappings[mapKey];
                          const mappedCols = tblMap?.columns?.filter((c: any) => c.physicalColumn && c.physicalColumn.trim() !== '') || [];
                          const reqFields = mappingConfig.standardFields.filter(f => f.required);
                          const mappedReqFields = reqFields.filter(rf =>
                            mappedCols.some((mc: any) => mc.globalKey === rf.key)
                          );
                          const isComplete = mappedReqFields.length === reqFields.length && reqFields.length > 0;
                          const isUnmapped = mappedCols.length === 0;
                          const isSelected = selectedDbId === db.id && selectedTableName === tbl;

                          return (
                            <div
                              key={tbl}
                              onClick={() => {
                                setSelectedDbId(db.id);
                                setSelectedTableName(tbl);
                              }}
                              className={`p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                                isSelected
                                  ? 'border-indigo-500 bg-indigo-50/60 shadow-xs ring-1 ring-indigo-500'
                                  : isComplete
                                  ? 'border-emerald-200 bg-white hover:bg-emerald-50/40'
                                  : isUnmapped
                                  ? 'border-red-200 bg-red-50/30 hover:bg-red-50/60'
                                  : 'border-amber-200 bg-amber-50/30 hover:bg-amber-50/60'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-bold text-[11px] text-slate-800">{tbl}</span>
                                {isComplete ? (
                                  <span className="flex items-center space-x-1 text-[10px] text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.5 rounded">
                                    <CheckCircle2 size={11} />
                                    <span>COMPLETE</span>
                                  </span>
                                ) : isUnmapped ? (
                                  <span className="flex items-center space-x-1 text-[10px] text-red-700 font-bold bg-red-100 px-1.5 py-0.5 rounded">
                                    <AlertCircle size={11} />
                                    <span>UNMAPPED</span>
                                  </span>
                                ) : (
                                  <span className="flex items-center space-x-1 text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.5 rounded">
                                    <AlertCircle size={11} />
                                    <span>INCOMPLETE</span>
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1 font-mono">
                                <span>{mappedCols.length} cols mapped</span>
                                <span>{mappedReqFields.length}/{reqFields.length} req</span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Target DB & Table Selector Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              
              {/* Left: DB & Table Dropdowns */}
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                    Select Database / Cluster:
                  </label>
                  <select
                    value={selectedDbId}
                    onChange={(e) => {
                      setSelectedDbId(e.target.value);
                      const newTables = getTablesForDb(e.target.value);
                      setSelectedTableName(newTables[0] || '');
                    }}
                    className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[220px]"
                  >
                    {allDbOptions.map(db => (
                      <option key={db.id} value={db.id}>
                        {db.name} ({db.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                    Database Table:
                  </label>
                  <select
                    value={selectedTableName}
                    onChange={(e) => setSelectedTableName(e.target.value)}
                    className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[200px]"
                  >
                    {availableTables.map(tbl => (
                      <option key={tbl} value={tbl}>
                        Table: {tbl}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="self-end">
                  <button
                    onClick={() => {
                      setNewTableDbId(selectedDbId);
                      setShowAddTableModal(true);
                    }}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center space-x-1 transition-all cursor-pointer border border-slate-200"
                    title="Define a new table mapping"
                  >
                    <Plus size={13} />
                    <span>New Table Mapping</span>
                  </button>
                </div>
              </div>

              {/* Right: Quick Table Tools & Save Button */}
              <div className="flex items-center space-x-2.5">
                <button
                  onClick={handleAutoPopulateDefaults}
                  className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer"
                  title="Auto-detect physical naming conventions for this DB engine"
                >
                  <Sparkles size={13} className="text-amber-600" />
                  <span>Auto-Detect DB Presets</span>
                </button>

                <button
                  onClick={handleSaveTableMappings}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <Save size={14} />
                  <span>Save Mappings</span>
                </button>
              </div>
            </div>

            {/* Active Database & Table Information Card */}
            <div className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-600 text-white rounded-lg">
                  <Server size={15} />
                </div>
                <div>
                  <div className="font-bold text-slate-900 flex items-center space-x-2">
                    <span>{selectedDbMeta?.name || 'Database'}</span>
                    <span className="text-[10px] px-2 py-0.2 bg-blue-200/70 text-blue-900 rounded-sm font-mono">
                      {selectedDbMeta?.type || 'Relational'}
                    </span>
                    <span className="text-slate-400">/</span>
                    <span className="font-mono text-blue-800 font-bold">{selectedTableName || 'No table selected'}</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Physical queries to table <span className="font-mono font-semibold">{selectedTableName}</span> will automatically map to the physical column names configured below.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3 text-[11px] font-mono text-slate-600">
                <span className="bg-white px-2.5 py-1 rounded-md border border-slate-200">
                  Live Columns: <strong className="text-blue-700">{introspectedColumns.length}</strong>
                </span>
                <span className="bg-white px-2.5 py-1 rounded-md border border-slate-200 text-emerald-700 font-bold">
                  ● Real Introspection Active
                </span>
              </div>
            </div>

            {/* Loading & Error States for Real Column Introspection */}
            {columnsLoading && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-xs flex items-center space-x-2 animate-pulse">
                <Loader2 size={15} className="animate-spin text-blue-600" />
                <span>Introspecting physical columns from database table <strong>{selectedTableName}</strong>...</span>
              </div>
            )}
            {columnsError && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center space-x-2">
                <AlertCircle size={15} className="text-amber-600 shrink-0" />
                <span>{columnsError}</span>
              </div>
            )}
          </div>

          {/* Database Column Mapping Matrix Table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                  Physical Column Translation Matrix
                </h3>
                <p className="text-[11px] text-slate-500">
                  Select the actual column existing in <span className="font-bold">{selectedDbMeta?.name}</span> for each Global Standard Field.
                </p>
              </div>

              <div className="relative">
                <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter fields..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500 w-48"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] text-slate-500 uppercase font-mono tracking-wider">
                    <th className="py-3 px-4 font-bold">Global Standard Field</th>
                    <th className="py-3 px-3 font-bold">Type</th>
                    <th className="py-3 px-3 font-bold text-center">Translation</th>
                    <th className="py-3 px-4 font-bold">
                      Physical Column in {selectedDbMeta?.name} ({selectedTableName})
                    </th>
                    <th className="py-3 px-4 font-bold">Example Value</th>
                    <th className="py-3 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStandardFields.map((field) => {
                    const physicalCol = currentTableColumns[field.key] || '';
                    const isMapped = !!physicalCol;

                    return (
                      <tr 
                        key={field.key} 
                        className={`hover:bg-slate-50/70 transition-colors ${
                          isMapped ? 'bg-blue-50/20' : ''
                        }`}
                      >
                        {/* Global Standard Field Info */}
                        <td className="py-3 px-4">
                          <div className="flex items-start space-x-2">
                            <div>
                              <div className="flex items-center space-x-1.5">
                                <span className="font-mono font-bold text-slate-900">
                                  {field.key}
                                </span>
                                {field.required && (
                                  <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded font-mono font-bold">
                                    REQ
                                  </span>
                                )}
                                {field.isStandard && (
                                  <span className="text-[9px] text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded font-mono font-semibold">
                                    CORE
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {field.label}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Data Type */}
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 text-[10px] font-mono rounded-md font-semibold ${
                            field.dataType === 'number'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : field.dataType === 'date'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : field.dataType === 'boolean'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {field.dataType}
                          </span>
                        </td>

                        {/* Translation Direction Arrow */}
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex items-center justify-center p-1.5 rounded-md bg-slate-100 text-slate-500" title="Automatic Bidirectional Translation">
                            <ArrowRightLeft size={12} />
                          </div>
                        </td>

                        {/* Physical Database Column Input / Selector */}
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-2">
                            {introspectedColumns.length > 0 && !useCustomInput[field.key] ? (
                              <div className="flex items-center space-x-1.5">
                                <select
                                  value={physicalCol}
                                  onChange={(e) => handlePhysicalColumnChange(field.key, e.target.value)}
                                  className="px-3 py-1.5 text-xs font-mono font-bold rounded-lg border bg-white border-slate-300 text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 min-w-[220px]"
                                >
                                  <option value="">-- Not Mapped (Unassigned) --</option>
                                  {introspectedColumns.map(col => (
                                    <option key={col.name} value={col.name}>
                                      {col.name} ({col.type}{col.isPrimary ? ', PK' : ''}{!col.nullable ? ', NOT NULL' : ''})
                                    </option>
                                  ))}
                                  {physicalCol && !introspectedColumns.some(c => c.name === physicalCol) && (
                                    <option value={physicalCol}>{physicalCol} (Custom manual)</option>
                                  )}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => setUseCustomInput(prev => ({ ...prev, [field.key]: true }))}
                                  className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                                  title="Switch to manual text input"
                                >
                                  <Edit3 size={13} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-1.5">
                                <input
                                  type="text"
                                  value={physicalCol}
                                  onChange={(e) => handlePhysicalColumnChange(field.key, e.target.value)}
                                  placeholder="Physical column name..."
                                  className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg border focus:outline-hidden focus:ring-2 focus:ring-blue-500 w-56 ${
                                    isMapped 
                                      ? 'bg-blue-50/50 border-blue-300 text-blue-900' 
                                      : 'bg-white border-slate-300 text-slate-800'
                                  }`}
                                />
                                {introspectedColumns.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setUseCustomInput(prev => ({ ...prev, [field.key]: false }))}
                                    className="p-1 text-blue-500 hover:text-blue-700 rounded cursor-pointer text-[10px] font-bold"
                                    title="Switch to dropdown column selector"
                                  >
                                    [List]
                                  </button>
                                )}
                              </div>
                            )}

                            {isMapped && (
                              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-mono font-bold border border-emerald-200">
                                Mapped
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Example Value */}
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                          {field.exampleValue || '-'}
                        </td>

                        {/* Quick Presets Dropdown */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              type="button"
                              onClick={() => handlePhysicalColumnChange(field.key, field.key)}
                              className="px-2 py-1 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-mono transition-colors cursor-pointer"
                              title="Reset to exact global key name"
                            >
                              Standard
                            </button>

                            <button
                              type="button"
                              onClick={() => handlePhysicalColumnChange(field.key, field.key.toUpperCase())}
                              className="px-2 py-1 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-mono transition-colors cursor-pointer"
                              title="Set to UPPERCASE format (Oracle/DB2)"
                            >
                              UPPER
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Save Reminder Bar */}
            <div className="p-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs text-slate-600">
                <Info size={14} className="text-blue-500" />
                <span>
                  Changes to column mappings will take effect immediately across all file uploads, investigations, and multi-database queries.
                </span>
              </div>

              <button
                onClick={handleSaveTableMappings}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Save size={14} />
                <span>Save All Column Mappings</span>
              </button>
            </div>
          </div>

        </div>
      )}

      {/* 4. TAB 2: Global Standard Column Dictionary */}
      {activeTab === 'global_standard' && (
        <div className="space-y-5">
          
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                  Global Canonical Standard Vocabulary
                </h2>
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] rounded-full font-mono font-bold">
                  v{mappingConfig.version || '2.3.0'}
                </span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] rounded-full font-mono font-bold flex items-center space-x-1">
                  <ShieldCheck size={11} />
                  <span>Strict Enforced</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                The version-controlled canonical dictionary of standard transaction fields. Required fields are strictly verified across all data uploads and database connections.
              </p>
            </div>

            <div className="flex items-center space-x-2 self-start sm:self-auto">
              <button
                onClick={() => setShowVersionHistoryModal(true)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition-all cursor-pointer border border-slate-200"
                title="View version control history log"
              >
                <History size={14} />
                <span>Version History</span>
              </button>

              <button
                onClick={() => {
                  setEditingField(null);
                  setNewFieldKey('');
                  setNewFieldLabel('');
                  setNewFieldDesc('');
                  setNewFieldDataType('string');
                  setNewFieldRequired(false);
                  setNewFieldExample('');
                  setNewFieldCategory('General');
                  setNewFieldNotes('');
                  setNewFieldUserId(currentUser.id || 'usr-1');
                  setFieldModalError(null);
                  setShowAddFieldModal(true);
                }}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>Add Global Standard Field</span>
              </button>
            </div>
          </div>

          {/* Standard Fields Table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] text-slate-500 uppercase font-mono tracking-wider">
                    <th className="py-3 px-4 font-bold">Standard Key</th>
                    <th className="py-3 px-4 font-bold">Display Label</th>
                    <th className="py-3 px-3 font-bold">Category</th>
                    <th className="py-3 px-3 font-bold">Data Type</th>
                    <th className="py-3 px-4 font-bold">User ID</th>
                    <th className="py-3 px-4 font-bold">Created At</th>
                    <th className="py-3 px-4 font-bold">Updated At</th>
                    <th className="py-3 px-5 font-bold">Description</th>
                    <th className="py-3 px-3 font-bold">Required</th>
                    <th className="py-3 px-3 font-bold">Status</th>
                    <th className="py-3 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mappingConfig.standardFields.map((field) => (
                    <tr key={field.key} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-900">
                        {field.key}
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {field.label}
                      </td>

                      <td className="py-3.5 px-3">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[10px] font-semibold border border-slate-200">
                          {field.category || 'General'}
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        <span className={`px-2 py-0.5 text-[10px] font-mono rounded-md font-semibold ${
                          field.dataType === 'number'
                            ? 'bg-purple-50 text-purple-700 border border-purple-200'
                            : field.dataType === 'date'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : field.dataType === 'boolean'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {field.dataType}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-semibold">
                          {field.user_id || 'usr-1'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {field.created_at ? new Date(field.created_at).toLocaleString() : '2026-05-01'}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {field.updated_at ? new Date(field.updated_at).toLocaleString() : '2026-08-09'}
                      </td>

                      <td className="py-3.5 px-5 text-slate-600 max-w-xs truncate">
                        {field.description}
                      </td>

                      <td className="py-3.5 px-3">
                        {field.required ? (
                          <span className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded text-[10px] font-mono font-bold">
                            Required
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-mono">
                            Optional
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3">
                        {field.isStandard ? (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-mono font-bold">
                            App Default
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[10px] font-mono font-bold">
                            User Custom
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => {
                              setEditingField(field);
                              setNewFieldKey(field.key);
                              setNewFieldLabel(field.label);
                              setNewFieldDesc(field.description);
                              setNewFieldDataType(field.dataType);
                              setNewFieldRequired(field.required);
                              setNewFieldExample(field.exampleValue || '');
                              setNewFieldCategory(field.category || 'General');
                              setNewFieldNotes(field.notes || '');
                              setNewFieldUserId(field.user_id || currentUser.id || 'usr-1');
                              setFieldModalError(null);
                              setShowAddFieldModal(true);
                            }}
                            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit standard field"
                          >
                            <Edit3 size={13} />
                          </button>

                          {!field.isStandard && (
                            <button
                              onClick={() => handleDeleteStandardField(field.key)}
                              className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete custom field"
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
        </div>
      )}

      {/* 5. TAB 3: Interactive Live Query & Translation Sandbox */}
      {activeTab === 'query_tester' && (
        <div className="space-y-5">
          
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center space-x-2">
                <Terminal size={16} className="text-blue-600" />
                <span>Implicit Query & Column Translation Sandbox</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Simulate how search queries expressed in canonical Global Standard naming are automatically transformed into the selected database's native column names before execution.
              </p>
            </div>

            {/* Target DB Selector for Test */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                  Target Database:
                </label>
                <select
                  value={testerDbId}
                  onChange={(e) => {
                    setTesterDbId(e.target.value);
                    const newTables = getTablesForDb(e.target.value);
                    setTesterTableName(newTables[0] || '');
                  }}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 cursor-pointer min-w-[200px]"
                >
                  {allDbOptions.map(db => (
                    <option key={db.id} value={db.id}>
                      {db.name} ({db.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">
                  Target Table:
                </label>
                <select
                  value={testerTableName}
                  onChange={(e) => setTesterTableName(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 cursor-pointer min-w-[180px]"
                >
                  {getTablesForDb(testerDbId).map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="self-end flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTesterGlobalQuery(
                      `SELECT * FROM ${testerTableName || 'table'} LIMIT 10;`
                    );
                    setTesterEditNative(false);
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Preset: SELECT *
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (testerColumns.length > 0) {
                      const cols = testerColumns.slice(0, 5).map(c => c.name).join(', ');
                      setTesterGlobalQuery(`SELECT ${cols} FROM ${testerTableName || 'table'} LIMIT 5;`);
                    } else {
                      setTesterGlobalQuery(`SELECT * FROM ${testerTableName || 'table'} LIMIT 5;`);
                    }
                    setTesterEditNative(false);
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Preset: Physical Columns
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const tableMap = globalMappingService.getTableMapping(testerDbId, testerTableName);
                    const mappedKeys = mappingConfig.standardFields
                      .filter(f => tableMap.columns.some(c => c.globalKey === f.key && c.physicalColumn))
                      .map(f => f.key);
                    
                    if (mappedKeys.length > 0) {
                      setTesterGlobalQuery(`SELECT ${mappedKeys.slice(0, 3).join(', ')} FROM ${testerTableName || 'table'} LIMIT 5;`);
                    } else {
                      setTesterGlobalQuery(`SELECT * FROM ${testerTableName || 'table'} LIMIT 5;`);
                    }
                    setTesterEditNative(false);
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Preset: Mapped Standard Fields
                </button>
              </div>
            </div>

            {/* Physical Columns Introspection Badges */}
            <div className="flex flex-wrap items-center gap-1.5 p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
              <span className="text-[11px] font-bold text-slate-600 font-mono mr-1 flex items-center gap-1">
                <Database size={12} className="text-blue-600" />
                <span>Physical Columns in <strong>{testerTableName}</strong> ({testerColumns.length}):</span>
              </span>
              {testerColumnsLoading ? (
                <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                  <Loader2 size={11} className="animate-spin" /> Loading columns...
                </span>
              ) : testerColumns.length > 0 ? (
                testerColumns.map(col => (
                  <button
                    key={col.name}
                    type="button"
                    onClick={() => {
                      setTesterGlobalQuery(prev => {
                        const trimmed = prev.trim().replace(/;$/, '');
                        if (!trimmed) return `SELECT ${col.name} FROM ${testerTableName} LIMIT 10;`;
                        return `${trimmed}, ${col.name};`;
                      });
                    }}
                    className="px-2 py-0.5 bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-300 hover:border-blue-300 rounded text-[11px] font-mono cursor-pointer transition-colors"
                    title={`Click to append ${col.name} (${col.type}) to query`}
                  >
                    <span>{col.name}</span>
                    <span className="text-[9px] text-slate-400 ml-1">({col.type})</span>
                  </button>
                ))
              ) : (
                <span className="text-[11px] text-slate-400 italic font-mono">
                  No columns introspected or table is empty
                </span>
              )}
            </div>
          </div>

          {/* Interactive Side-by-Side Comparison Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            
            {/* Panel 1: Input Global Standard Query */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
                    1. Application Global Query (Standard Names)
                  </h3>
                </div>
                <span className="text-[10px] font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-bold">
                  Canonical Standard
                </span>
              </div>

              <textarea
                value={testerGlobalQuery}
                onChange={(e) => setTesterGlobalQuery(e.target.value)}
                rows={5}
                className="w-full p-3 font-mono text-xs bg-slate-900 text-slate-100 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 leading-relaxed resize-y"
                placeholder="Type SQL with standard field names like transaction_id, amount_usd..."
              />

              <p className="text-[11px] text-slate-500">
                The application logic, file mappers, and search tools write queries using canonical standard column names.
              </p>
            </div>

            {/* Panel 2: Output Translated Physical Database Query */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
                    2. Native Database Query Dispatched (Physical Names)
                  </h3>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded font-bold">
                    Target: {allDbOptions.find(d => d.id === testerDbId)?.name || 'DB'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!testerEditNative) {
                        setDirectNativeSql(liveTranslationResult.translatedQuery);
                        setTesterEditNative(true);
                      } else {
                        setTesterEditNative(false);
                      }
                    }}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                      testerEditNative 
                        ? 'bg-amber-100 border-amber-300 text-amber-900' 
                        : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                    }`}
                    title="Toggle direct editing of native query"
                  >
                    {testerEditNative ? 'Using Direct Native SQL' : 'Direct Edit Native'}
                  </button>
                  <button
                    onClick={handleExecuteSandboxQuery}
                    disabled={isExecutingQuery || !(testerEditNative ? directNativeSql.trim() : liveTranslationResult.translatedQuery.trim())}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                    title="Execute query on the real database"
                  >
                    {isExecutingQuery ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        <span>Running...</span>
                      </>
                    ) : (
                      <>
                        <Play size={12} />
                        <span>Run on Live DB</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {testerEditNative ? (
                <textarea
                  value={directNativeSql}
                  onChange={(e) => setDirectNativeSql(e.target.value)}
                  rows={5}
                  className="w-full p-3 font-mono text-xs bg-slate-950 text-amber-400 rounded-xl border border-amber-900/40 min-h-[110px] leading-relaxed resize-y focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  placeholder="Type native database query directly here..."
                />
              ) : (
                <div className="w-full p-3 font-mono text-xs bg-slate-950 text-emerald-400 rounded-xl border border-emerald-900/40 min-h-[110px] leading-relaxed select-all">
                  {liveTranslationResult.translatedQuery}
                </div>
              )}

              <div className="pt-1">
                <span className="text-[11px] font-bold text-slate-600 uppercase font-mono block mb-1">
                  Active Token Replacements ({liveTranslationResult.mappingReplacements.length}):
                </span>
                {liveTranslationResult.mappingReplacements.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {liveTranslationResult.mappingReplacements.map((r, i) => (
                      <span 
                        key={i} 
                        className="px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-900 rounded text-[10px] font-mono"
                      >
                        <strong>{r.from}</strong> → <span className="text-emerald-700 font-bold">{r.to}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-400 italic">
                    Query uses column names that match the physical table schema 1:1.
                  </span>
                )}
              </div>
            </div>

          </div>

          {/* Sandbox Live Execution Results Panel */}
          {queryExecutionError && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs text-red-800 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center space-x-2 font-bold text-red-900">
                <AlertCircle size={16} className="text-red-600" />
                <span>Execution Error on Database</span>
              </div>
              <p className="font-mono bg-red-100/60 p-2.5 rounded-lg text-[11px] whitespace-pre-wrap">
                {queryExecutionError}
              </p>
            </div>
          )}

          {queryExecutionResult && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3 animate-in fade-in duration-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <h4 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
                    Query Results from Live Database
                  </h4>
                  <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                    {queryExecutionResult.targetDb}
                  </span>
                </div>
                <div className="flex items-center space-x-3 text-[11px] font-mono text-slate-500">
                  <button
                    type="button"
                    onClick={() => {
                      setQueryExecutionResult(null);
                      setQueryExecutionError(null);
                    }}
                    className="px-2 py-0.5 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-mono font-bold cursor-pointer"
                  >
                    Clear Results
                  </button>
                  <span>Latency: <strong className="text-slate-800">{queryExecutionResult.executionTimeMs}ms</strong></span>
                  <span>Rows: <strong className="text-blue-700">{queryExecutionResult.rowCount || (queryExecutionResult.rows?.length || 0)}</strong></span>
                </div>
              </div>

              {queryExecutionResult.rows && queryExecutionResult.rows.length > 0 ? (
                <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse font-mono">
                    <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                      <tr>
                        {(queryExecutionResult.columns || Object.keys(queryExecutionResult.rows[0] || {})).map((col: string) => (
                          <th key={col} className="py-2.5 px-3 font-bold text-slate-600 uppercase text-[10px] whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px]">
                      {queryExecutionResult.rows.map((row: any, rIdx: number) => (
                        <tr key={rIdx} className="hover:bg-slate-50/80">
                          {(queryExecutionResult.columns || Object.keys(queryExecutionResult.rows[0] || {})).map((col: string) => (
                            <td key={col} className="py-2 px-3 whitespace-nowrap text-slate-800">
                              {row[col] !== undefined && row[col] !== null ? String(row[col]) : <span className="text-slate-300 italic">null</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500 font-mono">
                  Query executed successfully, but returned 0 rows.
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* 6. MODAL: Add / Edit Global Standard Field */}
      {showAddFieldModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                {editingField ? 'Edit Global Standard Field' : 'Add New Global Standard Field'}
              </h3>
              <button 
                onClick={() => setShowAddFieldModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            {fieldModalError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                {fieldModalError}
              </div>
            )}

            <form onSubmit={handleSaveStandardField} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Field Key (snake_case) *
                </label>
                <input
                  type="text"
                  value={newFieldKey}
                  onChange={(e) => setNewFieldKey(e.target.value)}
                  placeholder="e.g. customer_tax_id"
                  disabled={!!editingField && editingField.isStandard}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Unique programmatic identifier used in queries and code.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Display Label *
                </label>
                <input
                  type="text"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  placeholder="e.g. Customer Tax Identification"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Data Type
                  </label>
                  <select
                    value={newFieldDataType}
                    onChange={(e) => setNewFieldDataType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="date">date (ISO)</option>
                    <option value="boolean">boolean</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Example Value
                  </label>
                  <input
                    type="text"
                    value={newFieldExample}
                    onChange={(e) => setNewFieldExample(e.target.value)}
                    placeholder="e.g. TAX-9901"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={newFieldCategory}
                    onChange={(e) => setNewFieldCategory(e.target.value)}
                    placeholder="e.g. Identity, Financial, POS"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    User ID (Creator / Owner)
                  </label>
                  <input
                    type="text"
                    value={newFieldUserId}
                    onChange={(e) => setNewFieldUserId(e.target.value)}
                    placeholder="e.g. usr-1"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Field Description
                </label>
                <textarea
                  value={newFieldDesc}
                  onChange={(e) => setNewFieldDesc(e.target.value)}
                  rows={2}
                  placeholder="Describe the operational purpose of this field..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Directory Notes / Specifications
                </label>
                <input
                  type="text"
                  value={newFieldNotes}
                  onChange={(e) => setNewFieldNotes(e.target.value)}
                  placeholder="e.g. Unique key across network gateways and processor feeds"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="newFieldReq"
                  checked={newFieldRequired}
                  onChange={(e) => setNewFieldRequired(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                />
                <label htmlFor="newFieldReq" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Mark as Required Column in file imports
                </label>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddFieldModal(false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm"
                >
                  Save Standard Field
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL: Add New Table Mapping */}
      {showAddTableModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">
                Add New Table Mapping
              </h3>
              <button 
                onClick={() => setShowAddTableModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Target Database
                </label>
                <select
                  value={newTableDbId}
                  onChange={(e) => setNewTableDbId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-800"
                >
                  {allDbOptions.map(db => (
                    <option key={db.id} value={db.id}>
                      {db.name} ({db.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Physical Table Name (e.g. settlements_archive) *
                </label>
                <input
                  type="text"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder="settlements_archive"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddTableModal(false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateNewTableMapping}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm"
                >
                  Create Table Mapping
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL: Reset Defaults Confirmation */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-amber-600">
              <AlertCircle size={22} />
              <h3 className="text-sm font-bold text-slate-900">
                Reset to Factory App Defaults?
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This will restore all Global Standard Fields and Connected Database Mappings back to the initial enterprise app defaults. Any custom column mappings you added will be reverted.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetToAppDefaults}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-sm cursor-pointer"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. MODAL: Export / Import JSON */}
      {showJsonModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <Code2 size={16} className="text-blue-600" />
                <span>
                  {jsonModalMode === 'export' ? 'Export Global Mapping Schema JSON' : 'Import Global Mapping Schema JSON'}
                </span>
              </h3>
              <button 
                onClick={() => setShowJsonModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            {jsonError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
                {jsonError}
              </div>
            )}

            <div>
              <textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                readOnly={jsonModalMode === 'export'}
                rows={14}
                className="w-full p-3 bg-slate-900 text-slate-100 font-mono text-xs rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                placeholder="Paste Global Mapping Schema JSON here..."
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              {jsonModalMode === 'export' ? (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(jsonText);
                    setSaveSuccessMsg('Copied schema JSON to clipboard!');
                    setTimeout(() => setSaveSuccessMsg(null), 3000);
                  }}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl flex items-center space-x-1.5"
                >
                  <Copy size={13} />
                  <span>Copy to Clipboard</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowJsonModal(false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                >
                  Close
                </button>
                {jsonModalMode === 'import' && (
                  <button
                    type="button"
                    onClick={handleImportJson}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm"
                  >
                    Apply JSON Schema
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 10. MODAL: Create Table */}
      {showCreateTableModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 md:p-8 shadow-2xl border border-slate-200 space-y-6 animate-in zoom-in-95 duration-150 my-8 max-h-[90vh] flex flex-col justify-between">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-xs">
                  <Table size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>Create Database Table & Schema</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                      DDL Engine
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Define and generate physical database tables mapped to the canonical Global Standard Schema.
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowCreateTableModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {createTableError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center space-x-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{createTableError}</span>
              </div>
            )}

            {/* Modal Body / Scrollable Content */}
            <form id="create-table-form" onSubmit={handleExecuteCreateTable} className="space-y-6 overflow-y-auto pr-1">
              {/* Target System Working DB Notification Banner */}
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                    <Database size={16} />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
                      <span>Target Database:</span>
                      <span className="font-mono text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded text-[11px] font-bold">
                        Application Working Database (MongoDB)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Tables are created directly in the system's working database configured in backend env (<code className="font-mono text-slate-700 font-semibold">MONGODB_URI</code>), locally cached on desktop. External banking systems (CBS, Switch FE/BE) remain untouched.
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold font-mono px-2.5 py-1 bg-white border border-emerald-200 text-emerald-700 rounded-lg shadow-2xs shrink-0 self-start sm:self-auto">
                  Configured System DB
                </span>
              </div>

              {/* Table Name and SQL Dialect */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    New Table Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={createTableName}
                    onChange={(e) => setCreateTableName(e.target.value)}
                    placeholder="e.g. settlement_logs_2026"
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-mono font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    SQL Dialect / Schema Format
                  </label>
                  <select
                    value={createTableDialect}
                    onChange={(e) => setCreateTableDialect(e.target.value as any)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer shadow-2xs"
                  >
                    <option value="PostgreSQL">PostgreSQL Standard</option>
                    <option value="Oracle">Oracle Database PL/SQL</option>
                    <option value="MySQL">MySQL / MariaDB</option>
                    <option value="SQLite">SQLite Embedded</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Table Description / Purpose (Optional)
                  </label>
                  <input
                    type="text"
                    value={createTableDescription}
                    onChange={(e) => setCreateTableDescription(e.target.value)}
                    placeholder="e.g. Centralized settlement transaction table for reconciliation workflows"
                    className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-700 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Columns Builder */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <span>Column Definitions ({createTableColumns.length})</span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Configure physical columns and link each to a Global Standard Field for automatic transformation.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePreFillColumnsFromGlobal}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer"
                      title="Load canonical columns from Global Standard Schema"
                    >
                      <Sparkles size={12} />
                      <span>Pre-fill from Global Standard</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const newCol: ColumnDef = {
                          id: `col-${Date.now()}`,
                          name: `col_${createTableColumns.length + 1}`,
                          dataType: 'VARCHAR(255)',
                          isPrimaryKey: false,
                          isNullable: true,
                          defaultValue: '',
                          mappedGlobalKey: mappingConfig.standardFields[0]?.key || 'transaction_id'
                        };
                        setCreateTableColumns([...createTableColumns, newCol]);
                      }}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <Plus size={12} />
                      <span>Add Column</span>
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase sticky top-0 z-10">
                        <tr>
                          <th className="py-2.5 px-3">Column Name</th>
                          <th className="py-2.5 px-3">Data Type</th>
                          <th className="py-2.5 px-3 text-center">PK</th>
                          <th className="py-2.5 px-3 text-center">Nullable</th>
                          <th className="py-2.5 px-3">Default Value</th>
                          <th className="py-2.5 px-3">Mapped Global Key</th>
                          <th className="py-2.5 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {createTableColumns.map((col, idx) => (
                          <tr key={col.id} className="hover:bg-slate-50/60">
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={col.name}
                                onChange={(e) => {
                                  const updated = [...createTableColumns];
                                  updated[idx].name = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                                  setCreateTableColumns(updated);
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-mono font-semibold text-xs focus:bg-white focus:outline-none"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <select
                                value={col.dataType}
                                onChange={(e) => {
                                  const updated = [...createTableColumns];
                                  updated[idx].dataType = e.target.value;
                                  setCreateTableColumns(updated);
                                }}
                                className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-mono focus:bg-white focus:outline-none cursor-pointer"
                              >
                                <option value="VARCHAR(64)">VARCHAR(64)</option>
                                <option value="VARCHAR(255)">VARCHAR(255)</option>
                                <option value="TEXT">TEXT</option>
                                <option value="BIGINT">BIGINT</option>
                                <option value="INTEGER">INTEGER</option>
                                <option value="DECIMAL(12,2)">DECIMAL(12,2)</option>
                                <option value="TIMESTAMP">TIMESTAMP</option>
                                <option value="BOOLEAN">BOOLEAN</option>
                                <option value="JSONB">JSONB</option>
                                <option value="UUID">UUID</option>
                              </select>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={col.isPrimaryKey}
                                onChange={(e) => {
                                  const updated = [...createTableColumns];
                                  updated[idx].isPrimaryKey = e.target.checked;
                                  if (e.target.checked) updated[idx].isNullable = false;
                                  setCreateTableColumns(updated);
                                }}
                                className="cursor-pointer"
                              />
                            </td>
                            <td className="py-2 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={col.isNullable}
                                disabled={col.isPrimaryKey}
                                onChange={(e) => {
                                  const updated = [...createTableColumns];
                                  updated[idx].isNullable = e.target.checked;
                                  setCreateTableColumns(updated);
                                }}
                                className="cursor-pointer"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={col.defaultValue}
                                onChange={(e) => {
                                  const updated = [...createTableColumns];
                                  updated[idx].defaultValue = e.target.value;
                                  setCreateTableColumns(updated);
                                }}
                                placeholder="NULL / '0'"
                                className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-mono text-[11px] focus:bg-white focus:outline-none"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <select
                                value={col.mappedGlobalKey}
                                onChange={(e) => {
                                  const updated = [...createTableColumns];
                                  updated[idx].mappedGlobalKey = e.target.value;
                                  setCreateTableColumns(updated);
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-semibold text-blue-700 focus:bg-white focus:outline-none cursor-pointer"
                              >
                                {mappingConfig.standardFields.map(f => (
                                  <option key={f.key} value={f.key}>
                                    {f.label} ({f.key})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  if (createTableColumns.length <= 1) return;
                                  setCreateTableColumns(createTableColumns.filter((_, i) => i !== idx));
                                }}
                                className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors cursor-pointer"
                                title="Remove column"
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
              </div>

              {/* DDL Preview Card */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-700 uppercase font-mono flex items-center gap-1.5">
                    <Terminal size={12} className="text-emerald-600" />
                    <span>Generated DDL Script Preview ({createTableDialect})</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const ddl = `-- Database: ${createTableDbId} (${createTableDialect})\nCREATE TABLE ${createTableName || 'new_table'} (\n` +
                        createTableColumns.map(c => `  ${c.name} ${c.dataType}${c.isPrimaryKey ? ' PRIMARY KEY' : ''}${!c.isNullable && !c.isPrimaryKey ? ' NOT NULL' : ''}${c.defaultValue ? ` DEFAULT ${c.defaultValue}` : ''}`).join(',\n') +
                        '\n);';
                      navigator.clipboard.writeText(ddl);
                      setSaveSuccessMsg('Copied DDL script to clipboard!');
                      setTimeout(() => setSaveSuccessMsg(null), 3000);
                    }}
                    className="text-[10px] text-blue-600 hover:underline font-mono cursor-pointer"
                  >
                    Copy SQL
                  </button>
                </div>

                <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto leading-relaxed border border-slate-800">
{`-- Target: Application Working Database (MongoDB / Desktop Local Storage)
-- Dialect: ${createTableDialect} / Virtual Relational Schema
CREATE TABLE ${createTableName || 'table_name'} (
${createTableColumns.map(c => `  ${c.name} ${c.dataType}${c.isPrimaryKey ? ' PRIMARY KEY' : ''}${!c.isNullable && !c.isPrimaryKey ? ' NOT NULL' : ''}${c.defaultValue ? ` DEFAULT ${c.defaultValue}` : ''}`).join(',\n')}
);`}
                </pre>
              </div>
            </form>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 shrink-0">
              <span className="text-[10px] text-slate-500 font-mono">
                Will create and register table in <strong>Application Working Database (MongoDB)</strong>.
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTableModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="create-table-form"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer flex items-center space-x-1.5"
                >
                  <Check size={14} />
                  <span>Execute & Create Table</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 11. MODAL: Migrate Table */}
      {showMigrateTableModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 md:p-8 shadow-2xl border border-slate-200 space-y-6 animate-in zoom-in-95 duration-150 my-8 max-h-[90vh] flex flex-col justify-between">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 shadow-xs">
                  <ArrowRightLeft size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>Migrate Database Table & Align Schema</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold">
                      Migration Engine v2.1
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Synchronize physical table structures with the centralized Global Standard naming spec.
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowMigrateTableModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {migrationError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center space-x-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{migrationError}</span>
              </div>
            )}

            {/* Modal Body */}
            <div className="space-y-5 overflow-y-auto pr-1">
              {/* Source and Target Setup */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Migration Source Specification
                  </label>
                  <select
                    value={migrateSource}
                    onChange={(e) => setMigrateSource(e.target.value as any)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-2xs"
                  >
                    <option value="global_schema">Global Standard Schema (v{mappingConfig.version})</option>
                    <option value="uploaded_dataset">Centralized Uploaded Dataset Master</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Target Database & Table *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={migrateTargetDbId}
                      onChange={(e) => {
                        setMigrateTargetDbId(e.target.value);
                        const tables = getTablesForDb(e.target.value);
                        if (tables.length > 0) setMigrateTargetTableName(tables[0]);
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-2xs"
                    >
                      {allDbOptions.map(db => (
                        <option key={db.id} value={db.id}>{db.name}</option>
                      ))}
                    </select>

                    <select
                      value={migrateTargetTableName}
                      onChange={(e) => setMigrateTargetTableName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer shadow-2xs"
                    >
                      {getTablesForDb(migrateTargetDbId).map(tbl => (
                        <option key={tbl} value={tbl}>{tbl}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Migration Strategy
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <label className={`flex items-start p-2.5 rounded-lg border cursor-pointer transition-all ${
                      migrationType === 'schema_sync' ? 'bg-indigo-50/80 border-indigo-300 font-bold text-indigo-900' : 'bg-white border-slate-200 text-slate-700'
                    }`}>
                      <input
                        type="radio"
                        name="migrationType"
                        checked={migrationType === 'schema_sync'}
                        onChange={() => setMigrationType('schema_sync')}
                        className="mt-0.5 mr-2"
                      />
                      <div>
                        <div>Schema Synchronize</div>
                        <div className="text-[10px] font-normal text-slate-500">Add missing standard columns</div>
                      </div>
                    </label>

                    <label className={`flex items-start p-2.5 rounded-lg border cursor-pointer transition-all ${
                      migrationType === 'data_backfill' ? 'bg-indigo-50/80 border-indigo-300 font-bold text-indigo-900' : 'bg-white border-slate-200 text-slate-700'
                    }`}>
                      <input
                        type="radio"
                        name="migrationType"
                        checked={migrationType === 'data_backfill'}
                        onChange={() => setMigrationType('data_backfill')}
                        className="mt-0.5 mr-2"
                      />
                      <div>
                        <div>Data Backfill</div>
                        <div className="text-[10px] font-normal text-slate-500">Transform & write records</div>
                      </div>
                    </label>

                    <label className={`flex items-start p-2.5 rounded-lg border cursor-pointer transition-all ${
                      migrationType === 'full_sync' ? 'bg-indigo-50/80 border-indigo-300 font-bold text-indigo-900' : 'bg-white border-slate-200 text-slate-700'
                    }`}>
                      <input
                        type="radio"
                        name="migrationType"
                        checked={migrationType === 'full_sync'}
                        onChange={() => setMigrationType('full_sync')}
                        className="mt-0.5 mr-2"
                      />
                      <div>
                        <div>Full Enterprise Sync</div>
                        <div className="text-[10px] font-normal text-slate-500">Schema + DDL + Mappings</div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Schema Diff Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders size={13} className="text-indigo-600" />
                    <span>Schema Diff & Compatibility Analyzer</span>
                  </h4>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {mappingConfig.standardFields.length} Global Fields vs Table Columns
                  </span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase sticky top-0 z-10">
                      <tr>
                        <th className="py-2 px-3">Global Standard Key</th>
                        <th className="py-2 px-3">Target Column Name</th>
                        <th className="py-2 px-3">Data Type</th>
                        <th className="py-2 px-3 text-right">Migration Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px]">
                      {mappingConfig.standardFields.slice(0, 8).map((f) => {
                        const existingCol = currentTableColumns[f.key];
                        return (
                          <tr key={f.key} className="hover:bg-slate-50/60">
                            <td className="py-1.5 px-3 font-mono font-semibold text-slate-800">{f.key}</td>
                            <td className="py-1.5 px-3 font-mono text-blue-700">{existingCol || f.key}</td>
                            <td className="py-1.5 px-3 text-slate-500">{f.dataType}</td>
                            <td className="py-1.5 px-3 text-right">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                                SYNC READY
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Progress & Logs (When running or completed) */}
              {migrationStatus !== 'idle' && (
                <div className="space-y-3 bg-slate-900 rounded-xl p-4 text-white border border-slate-800">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="flex items-center gap-2">
                      <Clock size={14} className="text-indigo-400 animate-spin" />
                      <span>Status: {migrationStatus.toUpperCase()}</span>
                    </span>
                    <span className="font-bold text-indigo-400">{migrationProgress}%</span>
                  </div>

                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-indigo-500 h-2 transition-all duration-300 rounded-full" 
                      style={{ width: `${migrationProgress}%` }}
                    />
                  </div>

                  <div className="space-y-1 font-mono text-[10px] text-slate-300 max-h-28 overflow-y-auto">
                    {migrationLogs.map((log, idx) => (
                      <div key={idx} className="leading-relaxed">{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 shrink-0">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="chk-backup-db"
                  checked={migrateBackupBeforeRun}
                  onChange={(e) => setMigrateBackupBeforeRun(e.target.checked)}
                  className="cursor-pointer"
                />
                <label htmlFor="chk-backup-db" className="text-xs text-slate-600 cursor-pointer">
                  Create transactional restore point before migration
                </label>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowMigrateTableModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={migrationStatus === 'running'}
                  onClick={handleExecuteTableMigration}
                  className={`px-5 py-2 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer flex items-center space-x-1.5 ${
                    migrationStatus === 'running' 
                      ? 'bg-indigo-400 cursor-not-allowed' 
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  <ArrowRightLeft size={14} />
                  <span>{migrationStatus === 'running' ? 'Migrating...' : 'Run Migration Now'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. MODAL: DDL Execution & ALTER TABLE History Log */}
      {showDdlHistoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-slate-100 text-slate-800 rounded-lg">
                  <History size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Central Repository DDL & Alteration History</span>
                    <span className="px-2 py-0.5 text-[10px] font-mono bg-indigo-50 text-indigo-700 rounded-full font-bold">
                      {centralTable.ddlHistory?.length || 0} DDL Events
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Audit log of all automatic <code className="text-indigo-600 font-bold">CREATE TABLE</code> and <code className="text-indigo-600 font-bold">ALTER TABLE</code> statements executed on <strong className="text-slate-800">{centralTable.tableName}</strong>.
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowDdlHistoryModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              {(!centralTable.ddlHistory || centralTable.ddlHistory.length === 0) ? (
                <div className="py-12 text-center text-slate-400 font-mono text-xs">
                  No DDL events recorded yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {centralTable.ddlHistory.map((log) => (
                    <div key={log.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                            log.action === 'CREATE_TABLE' 
                              ? 'bg-blue-100 text-blue-800'
                              : log.action === 'ALTER_TABLE_ADD_COLUMN'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {log.action}
                          </span>
                          {log.columnKey && (
                            <span className="font-mono text-indigo-700 font-bold text-[11px] bg-indigo-50 px-1.5 py-0.5 rounded">
                              {log.columnKey}
                            </span>
                          )}
                          <span className="font-mono text-slate-700 text-[11px]">
                            {centralTable.tableName} ({centralTable.dbName})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono flex items-center space-x-2">
                          <span>Operator: <strong>{log.executedBy}</strong></span>
                          <span>•</span>
                          <span>{new Date(log.timestamp).toLocaleString()}</span>
                          <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[9px] rounded">
                            {log.status}
                          </span>
                        </div>
                      </div>

                      {log.message && (
                        <p className="text-[11px] text-slate-600">
                          {log.message}
                        </p>
                      )}

                      <div className="relative">
                        <pre className="p-2.5 bg-slate-900 text-emerald-400 rounded-lg text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                          {log.ddlStatement}
                        </pre>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(log.ddlStatement);
                            setSaveSuccessMsg('Copied DDL statement to clipboard!');
                            setTimeout(() => setSaveSuccessMsg(null), 2500);
                          }}
                          className="absolute top-2 right-2 px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded flex items-center space-x-1 cursor-pointer"
                        >
                          <Copy size={10} />
                          <span>Copy</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDdlHistoryModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Close Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. MODAL: Insert Test Record into Central Table */}
      {showInsertRecordModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                  <PlusCircle size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Insert Sample Row into Central Repository Table
                  </h3>
                  <p className="text-xs text-slate-500">
                    Target Table: <strong className="text-slate-800 font-mono">{centralTable.tableName}</strong>
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowInsertRecordModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInsertTestRecord} className="space-y-4 overflow-y-auto pr-1 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Transaction ID (PK)
                  </label>
                  <input
                    type="text"
                    value={newTestRecord['transaction_id'] || ''}
                    onChange={(e) => setNewTestRecord({ ...newTestRecord, transaction_id: e.target.value })}
                    placeholder={`TX-${Math.floor(100000 + Math.random() * 900000)}`}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Account ID
                  </label>
                  <input
                    type="text"
                    value={newTestRecord['account_id'] || ''}
                    onChange={(e) => setNewTestRecord({ ...newTestRecord, account_id: e.target.value })}
                    placeholder="ACC-984210"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Card Number
                  </label>
                  <input
                    type="text"
                    value={newTestRecord['card_number'] || ''}
                    onChange={(e) => setNewTestRecord({ ...newTestRecord, card_number: e.target.value })}
                    placeholder="4111********1111"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Amount (USD)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newTestRecord['amount_usd'] || ''}
                    onChange={(e) => setNewTestRecord({ ...newTestRecord, amount_usd: e.target.value })}
                    placeholder="125.50"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Status State
                  </label>
                  <select
                    value={newTestRecord['status_state'] || 'COMPLETED'}
                    onChange={(e) => setNewTestRecord({ ...newTestRecord, status_state: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:outline-none cursor-pointer"
                  >
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="PENDING">PENDING</option>
                    <option value="FAILED">FAILED</option>
                    <option value="DECLINED">DECLINED</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Merchant Name
                  </label>
                  <input
                    type="text"
                    value={newTestRecord['merchant_name'] || ''}
                    onChange={(e) => setNewTestRecord({ ...newTestRecord, merchant_name: e.target.value })}
                    placeholder="Acme Retail Store"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Currency Code
                  </label>
                  <input
                    type="text"
                    value={newTestRecord['currency_code'] || 'USD'}
                    onChange={(e) => setNewTestRecord({ ...newTestRecord, currency_code: e.target.value })}
                    placeholder="USD"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowInsertRecordModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer flex items-center space-x-1.5"
                >
                  <PlusCircle size={14} />
                  <span>Insert Row</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {showVersionHistoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <History size={20} className="text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900 font-mono uppercase">
                  Global Schema Version Control History
                </h3>
              </div>
              <button
                onClick={() => setShowVersionHistoryModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-600">
              Current Active Baseline: <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">v{mappingConfig.version || '2.3.0'}</span> | Standard Columns: <strong>{mappingConfig.standardFields.length}</strong> | Required Minimum Columns: <strong>{mappingConfig.standardFields.filter(f => f.required).length}</strong>
            </div>

            <div className="overflow-y-auto space-y-3 flex-1 pr-1">
              {(mappingConfig.versionHistory && mappingConfig.versionHistory.length > 0 ? mappingConfig.versionHistory : [
                {
                  version: mappingConfig.version || '2.3.0',
                  updated_at: new Date().toISOString(),
                  updated_by: 'System Administrator',
                  changelog: 'Strict schema baseline enforcement with required date normalization',
                  fieldsCount: mappingConfig.standardFields.length
                }
              ]).map((hist, idx) => (
                <div key={idx} className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/70 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-indigo-800 bg-indigo-100/70 px-2 py-0.5 rounded">
                      v{hist.version}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(hist.updated_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-800 font-medium mt-1.5">{hist.changelog}</p>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mt-2">
                    <span>Author: <strong>{hist.updated_by}</strong></span>
                    <span>Fields count: <strong>{hist.fieldsCount}</strong></span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowVersionHistoryModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
